// app/api/grow/_cancel.ts
//
// SERVER ONLY. Builds the dependencies of lib/grow/cancelFees.ts for a route: the service-role repos, the Grow operations (mock or live) and the
// charge settings for the deposit payment page. Returns null when Grow cannot work on this deployment (not configured, or mock mode refused on
// production), so a route can answer plainly instead of failing half way.
import { randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { walletAsCreds } from '@/lib/grow/wallet';
import { createLiveOps } from '@/lib/grow/ops';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { supabaseCancelRepo, onDepositPaid, onDepositCardToken } from '@/lib/grow/cancelFees';
import { readCardTokenNotification } from '@/lib/grow/tokenFlow';
import type { Deps } from '@/lib/grow/cancelFees';
import type { GrowPayment } from '@/lib/grow/service';
import { sendBookingNotifications } from '@/lib/bookingNotify';
import { sanitizePolicy } from '@/lib/cancellationPolicy';
import { encryptToken, decryptToken } from '@/lib/facebook/encryption';
import { admin } from './_shared';
import { isDepositRequest } from '@/lib/grow/paymentRequest';
import { moneyAlert } from '@/lib/moneyAlert.js';
import { ensureVoucherForPayment } from '@/lib/giftVoucherIssue';
import { VOUCHER_SERVICE_PREFIX } from '@/lib/giftVouchers';
import { consumeReservation } from '@/lib/memberships';
import { membershipDeps } from '../memberships/_deps';

export function cancelDeps(): Deps | null {
  const grow = resolveGrow(process.env, APP_URL);
  // Without the card page code (GROW_PAGE_CODE) the deposit page is the wallet (grow.depositWallet), so the wallet credentials stand in.
  const creds = grow.creds || (grow.depositWallet ? walletAsCreds(grow.wallet) : null);
  if (!grow.configured || !creds || !grow.ops) return null;
  const db = admin();
  const growRepo = supabaseGrowRepo(db);
  return {
    repo: supabaseCancelRepo(db, sanitizePolicy),
    grow: growRepo,
    ops: grow.ops,
    // Card tokens are stored sealed (AES-256-GCM with TOKEN_ENCRYPTION_KEY, like the other secrets) and Grow posts the first token to the platform webhook.
    seal: { encrypt: encryptToken, decrypt: decryptToken },
    notifyUrl: `${APP_URL.replace(/\/+$/, '')}/api/grow/webhook`,
    depositWallet: grow.depositWallet === true,
    depositRefundOps: grow.depositWallet && grow.wallet ? createLiveOps(grow.wallet) : undefined,
    chargeDeps: { repo: growRepo, creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  };
}

/**
 * For the routes Grow's payment callbacks reach (notify, webhook, the mock payment page): when a BOOKING DEPOSIT turns paid, the held booking is
 * confirmed (lib/grow/cancelFees.onDepositPaid), and only then does the client get her confirmation message: while the hold was open the booking
 * was not confirmed, so none was sent. Every failure is logged and never undoes the payment.
 */
export function afterPaidHook(): (p: GrowPayment, raw?: Record<string, unknown>) => Promise<void> {
  return async (p, raw) => {
    // A client membership credit held by this (discounted) link: used now, keyed by the payment, so the browser's onPaid, a retried
    // callback and the daily run are one redemption, once (lib/memberships.ts consumeReservation). Never stops what follows.
    const md = membershipDeps();
    if (md) {
      try {
        const st = await md.repo.paymentState(p.tenant_id, p.id);
        await consumeReservation(md, { tenantId: p.tenant_id, paymentId: p.id, receiptId: st?.receipt_id ?? p.receipt_id ?? null });
      } catch (e) {
        if (!/does not exist|schema cache/i.test((e as Error)?.message || '')) {
          console.error('[memberships] using the held credit failed for payment', p.id, (e as Error)?.message);
          await moneyAlert('memberships:consume', 'a paid Grow link held a membership credit that could not be marked used (the daily run tries again)', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
        }
      }
    }
    // A gift voucher bought online (grow_payments.gift_voucher, add_gift_vouchers_2026-11-08.sql): Grow's verified callback has just
    // marked it paid, so the voucher is issued now, once (lib/giftVoucherIssue.ts). Nothing is sent: the buyer shares it herself.
    // Only payments the voucher purchase route opened carry that description, so no other payment pays for an extra read.
    if (String(p.description || '').startsWith(VOUCHER_SERVICE_PREFIX)) try {
      const v = await ensureVoucherForPayment(admin(), p.id);
      if (v) {
        if (v.status !== 'issued' && v.status !== 'already') { console.error('[grow] gift voucher not issued for payment', p.id, v.status); await moneyAlert('grow:voucher', 'a paid gift voucher purchase has no voucher yet (it is retried when the buyer or the owner opens it)', { paymentId: p.id, tenantId: p.tenant_id, status: v.status }, { key: String(p.id) }); }
        return;
      }
    } catch (e) {
      console.error('[grow] gift voucher issue failed for payment', p.id, (e as Error)?.message); await moneyAlert('grow:voucher', 'issuing a paid gift voucher failed (it is retried when the buyer or the owner opens it)', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
      return;
    }
    // A deposit she asked for with a payment link (lib/grow/paymentRequest.ts): no booking to confirm. The money becomes the
    // client's credit, which the cashier deducts at the visit, so the visit is never counted twice.
    if (isDepositRequest(p.description) && p.client_id) {
      const row = { tenant_id: p.tenant_id, client_id: p.client_id, amount: Number(p.amount), source: 'deposit_request' };
      // Names the payment (grow_money_hardening_2026-11-03.sql), so one payment makes at most one credit and a retry is safe.
      // Before that migration runs the column is missing and the credit is written exactly as before.
      let { error } = await admin().from('client_credits').insert({ ...row, grow_payment_id: p.id });
      if (error && (error.code === 'PGRST204' || error.code === '42703')) ({ error } = await admin().from('client_credits').insert(row));
      if (error && error.code === '23505') error = null; // this payment's credit is already there
      if (error) { console.error('[grow] deposit request credit failed for payment', p.id, error.message); await moneyAlert('grow:credit', 'client paid a deposit request but the credit was not recorded: add it by hand', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) }); }
      return;
    }
    if (!/^מקדמה/.test(p.description || '')) return;
    const deps = cancelDeps();
    if (!deps) return;
    // The deposit page also saved the card (the client gave the card-save tick): store the sealed token for this booking's business and client.
    const ct = raw ? readCardTokenNotification(raw) : null;
    if (ct) { try { await onDepositCardToken(deps, ct, p); } catch (e) { console.error('[grow] deposit card token failed:', (e as Error)?.message); await moneyAlert('grow:deposit-token', 'saving the card token after a deposit failed', { paymentId: p.id }, { key: String(p.id) }); } }
    const r = await onDepositPaid(deps, { tenantId: p.tenant_id, appointmentId: p.appointment_id, paymentId: p.id });
    if (r.outcome !== 'confirmed' && r.outcome !== 'restored') return;
    after(async () => {
      try {
        const db = admin();
        const [{ data: appt }, { data: st }] = await Promise.all([
          db.from('appointments').select('id, name, client_phone, service, date, start_minute, hour, duration').eq('id', r.appointmentId).eq('tenant_id', p.tenant_id).maybeSingle(),
          db.from('settings').select('*').eq('tenant_id', p.tenant_id).maybeSingle(),
        ]);
        if (!appt) return;
        await sendBookingNotifications({
          settingsRow: st, tenantId: p.tenant_id, appointmentId: appt.id, name: appt.name, phone: appt.client_phone, service: appt.service, date: appt.date,
          startMinute: appt.start_minute != null ? Number(appt.start_minute) : Number(appt.hour) * 60, duration: appt.duration, isReturningClient: false,
          // A deposit booking was made under her Grow cancellation policy: the link cancels under those terms, not a window.
          underCancelPolicy: true,
        });
      } catch (e) {
        console.error('[grow] confirmation after the deposit failed:', (e as Error)?.message);
      }
    });
  };
}

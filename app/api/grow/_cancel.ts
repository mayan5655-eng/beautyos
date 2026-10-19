// app/api/grow/_cancel.ts
//
// SERVER ONLY. Builds the dependencies of lib/grow/cancelFees.ts for a route: the service-role repos, the Grow operations (mock or live) and the
// charge settings for the deposit payment page. Returns null when Grow cannot work on this deployment (not configured, or mock mode refused on
// production), so a route can answer plainly instead of failing half way.
import { randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { supabaseCancelRepo, onDepositPaid, onDepositCardToken } from '@/lib/grow/cancelFees';
import { readCardTokenNotification } from '@/lib/grow/tokenFlow';
import type { Deps } from '@/lib/grow/cancelFees';
import type { GrowPayment } from '@/lib/grow/service';
import { sendBookingNotifications } from '@/lib/bookingNotify';
import { sanitizePolicy } from '@/lib/cancellationPolicy';
import { encryptToken, decryptToken } from '@/lib/facebook/encryption';
import { admin } from './_shared';

export function cancelDeps(): Deps | null {
  const grow = resolveGrow(process.env, APP_URL);
  if (!grow.configured || !grow.creds || !grow.ops) return null;
  const db = admin();
  const growRepo = supabaseGrowRepo(db);
  return {
    repo: supabaseCancelRepo(db, sanitizePolicy),
    grow: growRepo,
    ops: grow.ops,
    // Card tokens are stored sealed (AES-256-GCM with TOKEN_ENCRYPTION_KEY, like the other secrets) and Grow posts the first token to the platform webhook.
    seal: { encrypt: encryptToken, decrypt: decryptToken },
    notifyUrl: `${APP_URL.replace(/\/+$/, '')}/api/grow/webhook`,
    chargeDeps: { repo: growRepo, creds: grow.creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  };
}

/**
 * For the routes Grow's payment callbacks reach (notify, webhook, the mock payment page): when a BOOKING DEPOSIT turns paid, the held booking is
 * confirmed (lib/grow/cancelFees.onDepositPaid), and only then does the client get her confirmation message: while the hold was open the booking
 * was not confirmed, so none was sent. Every failure is logged and never undoes the payment.
 */
export function afterPaidHook(): (p: GrowPayment, raw?: Record<string, unknown>) => Promise<void> {
  return async (p, raw) => {
    if (!/^מקדמה/.test(p.description || '')) return;
    const deps = cancelDeps();
    if (!deps) return;
    // The deposit page also saved the card (the client gave the card-save tick): store the sealed token for this booking's business and client.
    const ct = raw ? readCardTokenNotification(raw) : null;
    if (ct) { try { await onDepositCardToken(deps, ct, p); } catch (e) { console.error('[grow] deposit card token failed:', (e as Error)?.message); } }
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
        });
      } catch (e) {
        console.error('[grow] confirmation after the deposit failed:', (e as Error)?.message);
      }
    });
  };
}

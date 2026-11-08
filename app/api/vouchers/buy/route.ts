// app/api/vouchers/buy/route.ts
//
// POST { t, option, buyerName, buyerPhone, recipientName, message } -> { url }
//
// PUBLIC (no login): a visitor on her public page buys a gift voucher for a friend and pays through Grow. Everything that decides money
// is read on the server: the option's price from her settings and price list (lib/giftVouchers.ts resolveOption), never the browser.
// The route only OPENS a payment, the same way the booking page does (lib/grow/service.ts createCharge, her Grow account): nothing is
// issued here. The purchase intent (the voucher's future token, the names, the message) is stored ON the payment, and the voucher is
// issued from it by the server only when Grow's verified callback marks the payment paid (app/api/grow/_cancel.ts afterPaidHook).
// The buyer is sent back to /v/<token>, which waits for that callback.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { createCharge } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { walletAsCreds } from '@/lib/grow/wallet';
import { checkIpLimit, checkTenantLimit, checkPhoneLimit } from '@/lib/rateLimit';
import { normalizeIsraeliMobile, phoneErrorHe } from '@/lib/phone';
import { loadVoucherShop } from '@/lib/giftVoucherShop';
import { newVoucherToken, cleanName, cleanMessage, voucherTitle, VOUCHER_SERVICE_PREFIX, type VoucherIntent } from '@/lib/giftVouchers';
import { admin } from '../../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'רכישת שובר אונליין לא זמינה כרגע. אפשר לרכוש שובר ישירות בעסק.';
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const ipLimited = checkIpLimit(request, 'voucher-buy');
  if (ipLimited) return ipLimited;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const t = String(b.t ?? '');
  if (!UUID_RE.test(t)) return fail(UNAVAILABLE, 400);
  const tenantLimited = checkTenantLimit(t, 'voucher-buy');
  if (tenantLimited) return tenantLimited;

  const buyerName = cleanName(b.buyerName);
  const recipientName = cleanName(b.recipientName);
  const message = cleanMessage(b.message);
  if (!buyerName) return fail('כתבי את השם שלך', 400);
  if (!recipientName) return fail('כתבי למי השובר', 400);
  const phone = normalizeIsraeliMobile(String(b.buyerPhone ?? ''));
  if (!phone.ok) return fail(phoneErrorHe(String(b.buyerPhone ?? '')) || 'מספר הטלפון לא תקין', 400);
  const phoneLimited = checkPhoneLimit(phone.e164, 'voucher-buy');
  if (phoneLimited) return phoneLimited;

  const db = admin();
  const shop = await loadVoucherShop(db, t, process.env, APP_URL).catch(() => null);
  if (!shop || !shop.online) return fail(UNAVAILABLE, 409);
  // shop.options were priced just now from her settings and price list: the browser only names one.
  const picked = shop.options.find((o) => o.key === String(b.option ?? ''));
  if (!picked) return fail('האפשרות שבחרת כבר לא זמינה. רענני את הדף ובחרי שוב.', 409);

  const grow = resolveGrow(process.env, APP_URL);
  const creds = grow.creds || walletAsCreds(grow.wallet);
  if (!creds) return fail(UNAVAILABLE, 409);
  const acc = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', t).maybeSingle();
  if (acc.error || !acc.data || acc.data.enabled !== true) return fail(UNAVAILABLE, 409);

  const token = newVoucherToken((n) => new Uint8Array(randomBytes(n)));
  const intent: VoucherIntent = {
    token,
    kind: picked.kind,
    service_name: picked.serviceName,
    amount: picked.amount,
    buyer_name: buyerName,
    recipient_name: recipientName,
    message,
    validity_months: shop.cfg.validityMonths,
  };
  const title = voucherTitle({ kind: picked.kind, service_name: picked.serviceName, initial_amount: picked.amount });
  const result = await createCharge(
    {
      tenantId: t,
      userId: String(acc.data.user_id),
      amount: picked.amount,
      // The prefix is how the paid callback knows to look for a voucher intent (app/api/grow/_cancel.ts).
      description: `${VOUCHER_SERVICE_PREFIX} · ${title}`,
      clientName: buyerName,
      phone: phone.e164,
      clientId: null,
      appointmentId: null,
      wallet: !!grow.wallet,
      returnUrl: `${APP_URL.replace(/\/+$/, '')}/v/${token}?b=1`,
    },
    { repo: supabaseGrowRepo(db), creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  );
  if (!result.ok) {
    console.error('[vouchers] buy refused:', result.code, result.message);
    const status = result.code === 'grow-unreachable' || result.code === 'grow-refused' ? 502 : 400;
    return fail(result.code === 'bad-phone' ? 'מספר הטלפון לא מתאים לתשלום באשראי.' : UNAVAILABLE, status);
  }
  // The intent goes on the payment BEFORE the buyer has the link, so no callback can arrive ahead of it. If it cannot be stored, the
  // payment is closed and nothing is offered: a payment without its intent would take money and issue no voucher.
  const { error } = await db.from('grow_payments').update({ gift_voucher: intent }).eq('id', result.paymentId).eq('tenant_id', t).eq('status', 'created');
  if (error) {
    console.error('[vouchers] storing the purchase intent failed:', error.code, error.message);
    await db.from('grow_payments').update({ status: 'cancelled', error: 'gift voucher intent not stored' }).eq('id', result.paymentId);
    return fail(UNAVAILABLE, 500);
  }
  return NextResponse.json({ success: true, url: result.url }, { headers: { 'Cache-Control': 'no-store' } });
}

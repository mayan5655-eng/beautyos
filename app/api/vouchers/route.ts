// app/api/vouchers/route.ts
//
// The owner's side of gift vouchers. Signed in; the tenant is ALWAYS the session's (get_user_tenant_id), never the body's.
//
//   GET                       her vouchers (newest first, up to 500) and their ledger. Also issues any voucher whose online payment is
//                             paid but has none yet (the safety net, lib/giftVoucherIssue.ts).
//   POST { action: 'lookup', code }                         one voucher by the code she typed or scanned (rate limited).
//   POST { action: 'redeem', voucherId, amount, key }       spend part of a voucher at the till: gift_voucher_redeem, atomic in the database.
//   POST { action: 'reverse', ledgerId }                    give a redemption back (the sale it was for did not happen).
//   POST { action: 'attach', ledgerId, receiptId }          name the receipt a redemption paid, once.
//   POST { action: 'void', voucherId, reason }              void a voucher. Recorded, never deleted.
//   POST { action: 'sell', saleKey, option | amount, paymentMethod, buyerName, buyerPhone?, recipientName, message?, clientId? }
//                                                           a voucher sold at the till, with its receipt (lib/giftVoucherService.ts).
//
// Every write: the platform flag on, the plan active (requireActiveTenant), not a demo business, and the service role only after all
// of that. Before add_gift_vouchers_2026-11-08.sql runs, every action answers needsMigration with a plain sentence.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { normalizeIsraeliMobile } from '@/lib/phone';
import {
  giftVouchersVisible, voucherConfig, voucherOptions, normalizeCode, voucherStatus, isMissingVoucherSchema, cleanName, cleanMessage,
  REFUSAL_HE, NEEDS_MIGRATION_HE, MIN_AMOUNT, MAX_AMOUNT,
} from '@/lib/giftVouchers';
import { sellAtTill, readRpcOutcome } from '@/lib/giftVoucherService';
import { supabaseVoucherRepo, VOUCHER_COLS } from '@/lib/giftVoucherRepo';
import { ensureVoucherForPayment } from '@/lib/giftVoucherIssue';
import { ACTIVE_OR_NULL } from '@/lib/serviceActive.js';
import { admin, DEMO_NOTE } from '../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ['מזומן', 'אשראי', 'ביט', 'פייבוקס', 'העברה'];
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const needsMigration = () => json({ success: false, needsMigration: true, error: NEEDS_MIGRATION_HE });
const oops = (where: string, e: unknown) => {
  console.error(`[vouchers] ${where} failed:`, (e as { message?: string })?.message || e);
  return json({ success: false, error: 'משהו נתקע אצלנו. שום דבר לא השתנה, אפשר לנסות שוב בעוד רגע.' }, 500);
};
const rnd = (n: number) => new Uint8Array(randomBytes(n));

async function who() {
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: json({ success: false, error: 'לא מחוברת' }, 401) } as const;
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: json({ success: false, error: 'לא זוהה עסק' }, 403) } as const;
  // A closed business reads nothing from her business tables (add_closed_read_block_2026-10-25.sql), and everything below is a
  // service-role read that RLS cannot see: so the plan is checked FIRST, for reads as well as writes. Same predicate, same demo
  // exception and same 402 as app/api/weekly-digest (Vercel review on PR #25).
  if (!isDemoTenantId(tenantId)) {
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return { error: guard.response } as const;
  }
  const db = admin();
  // The whole row, like every other reader of the flags (lib/featureFlags.ts tenantFlags reads automations.feature_flags and,
  // when it exists, the optional settings.feature_flags column). Naming that column in the select failed the read on a
  // database without it, and the feature then looked switched off (Vercel review on PR #25).
  const { data: settings, error: settingsErr } = await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (settingsErr) return { error: oops('settings', settingsErr) } as const;
  if (!giftVouchersVisible(settings as never)) return { error: json({ success: false, hidden: true, error: 'שוברי מתנה לא פעילים בחשבון' }, 404) } as const;
  return { session, user, tenantId, db, settings } as const;
}

export async function GET(request: Request) {
  try {
    const w = await who();
    if ('error' in w) return w.error;
    const { db, tenantId } = w;
    // ?probe=1: "is it installed?" for the till button, the settings card and the marketing card. Before the migration runs,
    // nothing is shown to her at all (owner decision), so they ask this first and render nothing on { ready: false }.
    if (new URL(request.url).searchParams.get('probe') === '1') {
      const p = await db.from('gift_vouchers').select('id').eq('tenant_id', tenantId).limit(1);
      if (p.error && !isMissingVoucherSchema(p.error)) return oops('probe', p.error);
      const { data: tn } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
      return json({ success: true, ready: !p.error, slug: (tn as { slug?: string } | null)?.slug || null });
    }
    const v = await db.from('gift_vouchers').select(VOUCHER_COLS).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500);
    if (v.error && isMissingVoucherSchema(v.error)) return needsMigration();
    if (v.error) return oops('list', v.error);
    // The safety net: an online purchase that Grow confirmed but whose voucher was not written (the callback died half way).
    let issued = 0;
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const paid = await db.from('grow_payments').select('id').eq('tenant_id', tenantId).eq('status', 'paid').not('gift_voucher', 'is', null).gte('created_at', since).limit(200);
    if (!paid.error && paid.data?.length) {
      const have = new Set((v.data || []).map((x) => String((x as { grow_payment_id?: unknown }).grow_payment_id || '')));
      for (const p of paid.data) {
        if (have.has(String(p.id))) continue;
        const r = await ensureVoucherForPayment(db, String(p.id)).catch(() => null);
        if (r && r.status === 'issued') issued++;
      }
    }
    const rows = issued ? (await db.from('gift_vouchers').select(VOUCHER_COLS).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500)).data || [] : v.data || [];
    const ids = rows.map((x) => String((x as { id: unknown }).id));
    const led = ids.length ? await db.from('gift_voucher_ledger').select('id, voucher_id, kind, amount, balance_after, receipt_id, reverses_id, note, created_at').eq('tenant_id', tenantId).in('voucher_id', ids).order('created_at', { ascending: true }) : { data: [], error: null };
    return json({ success: true, ready: true, vouchers: rows, ledger: led.error ? [] : led.data || [] });
  } catch (e) {
    return oops('list', e);
  }
}

export async function POST(request: Request) {
  try {
    const w = await who();
    if ('error' in w) return w.error;
    const { db, tenantId, user } = w;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || '');

    if (action === 'lookup') {
      const ipLimited = checkIpLimit(request, 'voucher-lookup');
      if (ipLimited) return ipLimited;
      const tLimited = checkTenantLimit(tenantId, 'voucher-lookup');
      if (tLimited) return tLimited;
      const code = normalizeCode(b.code);
      if (!code) return json({ success: false, error: 'הקוד צריך להיות 8 תווים, למשל K7M4-X9Q2' }, 400);
      const { data, error } = await db.from('gift_vouchers').select(VOUCHER_COLS).eq('tenant_id', tenantId).eq('code', code).maybeSingle();
      if (error && isMissingVoucherSchema(error)) return needsMigration();
      if (error) return oops('lookup', error);
      if (!data) return json({ success: false, error: REFUSAL_HE.not_found }, 404);
      const st = voucherStatus(data as never);
      return json({ success: true, voucher: data, status: st, refusal: st === 'active' ? null : REFUSAL_HE[st] });
    }

    // Everything below writes.
    // (The plan was checked in who(), before any read.) The demo businesses never write.
    if (isDemoTenantId(tenantId)) return json({ success: false, demo: true, error: DEMO_NOTE }, 403);

    if (action === 'redeem') {
      const voucherId = String(b.voucherId || '');
      const amount = Math.round(Number(b.amount) * 100) / 100;
      const key = String(b.key || '');
      if (!UUID_RE.test(voucherId) || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      if (!(amount > 0) || amount > MAX_AMOUNT) return json({ success: false, error: REFUSAL_HE.bad_amount }, 400);
      const { data, error } = await db.rpc('gift_voucher_redeem', { p_tenant: tenantId, p_voucher: voucherId, p_amount: amount, p_key: key, p_by: user.id });
      if (error && isMissingVoucherSchema(error)) return needsMigration();
      if (error) return oops('redeem', error);
      const o = readRpcOutcome(data);
      if (o.result === 'ok' || o.result === 'already') return json({ success: true, ledgerId: o.ledgerId, balance: o.balance, already: o.result === 'already' });
      return json({ success: false, refusal: o.result, balance: o.balance, error: REFUSAL_HE[o.result] || 'לא הצלחנו לממש את השובר' }, 409);
    }

    if (action === 'reverse') {
      const ledgerId = String(b.ledgerId || '');
      if (!UUID_RE.test(ledgerId)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const { data, error } = await db.rpc('gift_voucher_reverse', { p_tenant: tenantId, p_ledger: ledgerId, p_by: user.id, p_note: 'הניצול בוטל בקופה' });
      if (error && isMissingVoucherSchema(error)) return needsMigration();
      if (error) return oops('reverse', error);
      const o = readRpcOutcome(data);
      if (o.result === 'ok') return json({ success: true, balance: o.balance });
      const msg = o.result === 'has_receipt' ? 'הניצול הזה שילם תשלום שנרשם. בטלי קודם את התשלום, ואז אפשר להחזיר את הסכום לשובר.' : REFUSAL_HE[o.result] || 'לא מצאנו את הניצול הזה';
      return json({ success: false, refusal: o.result, error: msg }, 409);
    }

    if (action === 'attach') {
      const ledgerId = String(b.ledgerId || '');
      const receiptId = String(b.receiptId || '');
      if (!UUID_RE.test(ledgerId) || !receiptId) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const rc = await db.from('receipts').select('id').eq('id', receiptId).eq('tenant_id', tenantId).maybeSingle();
      if (rc.error || !rc.data) return json({ success: false, error: 'התשלום לא נמצא' }, 404);
      const { error } = await db.from('gift_voucher_ledger').update({ receipt_id: receiptId }).eq('id', ledgerId).eq('tenant_id', tenantId).eq('kind', 'redeem').is('receipt_id', null);
      if (error && isMissingVoucherSchema(error)) return needsMigration();
      if (error) return oops('attach', error);
      return json({ success: true });
    }

    if (action === 'void') {
      const voucherId = String(b.voucherId || '');
      const reason = String(b.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!UUID_RE.test(voucherId)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      if (!reason) return json({ success: false, error: 'כתבי בקצרה למה מבטלים, זה נשמר ברישום' }, 400);
      const { data, error } = await db.from('gift_vouchers').update({ status: 'void', voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', voucherId).eq('tenant_id', tenantId).eq('status', 'active').select(VOUCHER_COLS);
      if (error && isMissingVoucherSchema(error)) return needsMigration();
      if (error) return oops('void', error);
      const row = data && data[0];
      if (!row) return json({ success: false, error: 'השובר כבר בוטל או לא נמצא' }, 409);
      await db.from('gift_voucher_ledger').insert({ tenant_id: tenantId, voucher_id: voucherId, kind: 'void', amount: 0, balance_after: Number((row as { balance?: unknown }).balance) || 0, idem_key: 'void', note: reason, created_by: user.id });
      return json({ success: true, voucher: row });
    }

    if (action === 'sell') {
      const saleKey = String(b.saleKey || '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(saleKey)) return json({ success: false, error: 'בקשה לא תקינה' }, 400);
      const method = String(b.paymentMethod || '');
      if (!METHODS.includes(method)) return json({ success: false, error: 'בחרי איך שילמו' }, 400);
      const recipientName = cleanName(b.recipientName);
      const buyerName = cleanName(b.buyerName);
      if (!buyerName) return json({ success: false, error: 'כתבי מי קונה את השובר' }, 400);
      let buyerPhone: string | null = null;
      if (String(b.buyerPhone || '').trim()) {
        const ph = normalizeIsraeliMobile(String(b.buyerPhone));
        if (!ph.ok) return json({ success: false, error: 'מספר הטלפון לא תקין, למשל 0501234567' }, 400);
        buyerPhone = ph.e164;
      }
      let clientId: string | null = null;
      if (b.clientId) {
        const c = await db.from('clients').select('id').eq('id', String(b.clientId)).eq('tenant_id', tenantId).maybeSingle();
        if (c.error || !c.data) return json({ success: false, error: 'הלקוחה לא נמצאה' }, 404);
        clientId = String(c.data.id);
      }
      // The price: one of her options, priced now from her settings and price list; or an amount she typed herself at the till.
      const cfg = voucherConfig(w.settings as never);
      let kind: 'amount' | 'service' = 'amount';
      let serviceName: string | null = null;
      let amount: number;
      if (b.option) {
        const sv = await db.from('service_prices').select('id, name, price, active').eq('tenant_id', tenantId).or(ACTIVE_OR_NULL);
        const opt = voucherOptions(cfg, (sv.data || []) as never).find((o) => o.key === String(b.option));
        if (!opt) return json({ success: false, error: 'האפשרות הזאת כבר לא קיימת. בחרי שוב.' }, 409);
        kind = opt.kind; serviceName = opt.serviceName; amount = opt.amount;
      } else {
        amount = Math.round(Number(b.amount) * 100) / 100;
        if (!(amount >= MIN_AMOUNT && amount <= MAX_AMOUNT)) return json({ success: false, error: `סכום שובר בין ₪${MIN_AMOUNT} ל-₪${MAX_AMOUNT}` }, 400);
      }
      const r = await sellAtTill({
        tenantId, userId: user.id, saleKey, kind, serviceName, amount, validityMonths: cfg.validityMonths, paymentMethod: method,
        buyerName, buyerPhone, recipientName, message: cleanMessage(b.message), clientId,
      }, { repo: supabaseVoucherRepo(db), randomBytes: rnd });
      if (r.status === 'missing') return needsMigration();
      // A retry of a sale whose money was never recorded is a failure with a sentence, never a voucher handed over.
      // A new sale key ONLY when the earlier sale is settled as not recorded (its voucher voided). While it is still being written the
      // same key must be kept, or the next try would issue a second voucher and record the income twice (Vercel review 2026-11-08).
      if (r.status === 'failed' && r.message) return json({ success: false, retryWithNewSale: !('inFlight' in r && r.inFlight), error: r.message }, 409);
      if (r.status !== 'sold' && r.status !== 'already') return oops('sell', ('error' in r && r.error) || 'failed');
      return json({ success: true, already: r.status === 'already', voucher: r.voucher, receipt: r.receipt });
    }

    return json({ success: false, error: 'פעולה לא מוכרת' }, 400);
  } catch (e) {
    return oops('post', e);
  }
}

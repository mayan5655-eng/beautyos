// lib/giftVouchers.ts
//
// Gift vouchers (שוברי מתנה). Pure: no React, no database, so every rule below is proven by test-gift-vouchers.ts.
//
// ── Where things live ──────────────────────────────────────────────────────
//   automations.feature_flags.gift_vouchers   the platform switch (set by SQL, protected from the settings save like every
//                                             feature flag). Off: no screen, no public page, no route answers.
//   automations.gift_vouchers                 HER setup, written by the settings save: { enabled, amounts, services,
//                                             validity_months, note }. Off until she turns selling on.
//   gift_vouchers / gift_voucher_ledger       add_gift_vouchers_2026-11-08.sql (hand run). Until it runs the screen says so and
//                                             nothing is offered for sale.
//
// ── Money ──────────────────────────────────────────────────────────────────
// A voucher sale is money taken IN ADVANCE, exactly like a package sale: one receipt at the moment of sale, for the price, which
// her income counts once, then. Redeeming it is NOT new income: at the till the voucher comes off the visit's amount the same way
// Grow client credit does (growCreditUsed), so the visit's receipt carries only what she was paid on the day. The sale receipt's
// item is marked kind: 'voucher', which the loyalty card (lib/loyalty.js NON_VISIT_ITEM_KINDS) already reads as "no visit": a
// voucher sale never earns a stamp, and the monthly report does not count it as a treatment.
//
// ── Security ───────────────────────────────────────────────────────────────
//   * Two secrets per voucher: the CODE she types at the till (8 characters, ~40 bits, only ever looked up inside HER business by a
//     signed-in, rate-limited route) and the TOKEN in the public link /v/<token> (192 bits). Neither is derived from anything.
//   * The balance changes only inside the database (gift_voucher_redeem / gift_voucher_reverse, one conditional UPDATE each, with a
//     unique ledger key), never read-then-write in a browser.
//   * An online voucher exists only once Grow's verified callback has flipped the payment to paid (lib/grow/service.ts), and its
//     row names the payment (unique), so a second callback cannot issue a second voucher.

import { tenantFlags } from './featureFlags.ts';
import { sanitizeDesign, type VoucherDesign } from './giftVoucherDesign.ts';

export const GV_FLAG = 'gift_vouchers';
export const DEFAULT_VALIDITY_MONTHS = 12;
export const MAX_AMOUNT = 5000;
export const MIN_AMOUNT = 20;
export const MAX_NOTE = 200;
export const MAX_MESSAGE = 300;
export const MAX_NAME = 60;
/** The receipt's item kind for a voucher sale. lib/loyalty.js (PR #20) already treats this kind as "not a visit". */
export const VOUCHER_ITEM_KIND = 'voucher';
/** The receipt's service text for a voucher sale; also how a sale is recognised when its items cannot be read. */
export const VOUCHER_SERVICE_PREFIX = 'שובר מתנה';

type SettingsLike = { automations?: unknown; feature_flags?: unknown } | null | undefined;

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
};
const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** A multi-line text the client wrote (the gift message): line breaks kept, at most three, control characters dropped. */
export const cleanMessage = (v: unknown, max = MAX_MESSAGE) =>
  String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3).join('\n').slice(0, max);
export const cleanName = (v: unknown) => cleanText(v, MAX_NAME);

/**
 * Is the feature on for this business? ON BY DEFAULT for every business (owner decision, 2026-11-08): only an explicit stored
 * `false` under automations.feature_flags.gift_vouchers (or the settings.feature_flags column) switches it off. That key is
 * platform-owned: the settings save never takes feature_flags from the browser.
 */
export function giftVouchersVisible(settings: SettingsLike): boolean {
  return tenantFlags(settings)[GV_FLAG] !== false;
}

export type VoucherConfig = {
  /** Online selling on her public page when Grow is connected. On unless she stored an explicit false. */
  enabled: boolean;
  amounts: number[];
  /** Service ids she offers as "a treatment" voucher. The price is always read from her price list at the moment of sale. */
  services: string[];
  validityMonths: number;
  note: string;
  design: VoucherDesign;
};

/**
 * Her setup, read defensively from automations.gift_vouchers. Malformed parts fall back to the defaults, and with nothing stored
 * at all it already works: ₪200 / ₪300 / ₪500, 12 months, online when Grow is connected, the elegant design in her colours.
 * `design` is validated here (lib/giftVoucherDesign.ts sanitizeDesign); pass the tenant and storage host so her own uploaded
 * background is kept, otherwise any image is dropped.
 */
export function voucherConfig(settings: SettingsLike, tenantId?: string | null, storageHost = ''): VoucherConfig {
  const raw = asObj(asObj(settings?.automations).gift_vouchers);
  const amounts = Array.isArray(raw.amounts) ? raw.amounts : [200, 300, 500];
  const clean = [...new Set(amounts.map((a) => Math.round(Number(a))).filter((a) => Number.isFinite(a) && a >= MIN_AMOUNT && a <= MAX_AMOUNT))].sort((a, b) => a - b).slice(0, 6);
  const services = Array.isArray(raw.services) ? [...new Set(raw.services.map((s) => String(s ?? '').trim()).filter((s) => s && s.length <= 64))].slice(0, 12) : [];
  return {
    enabled: raw.enabled !== false,
    amounts: clean,
    services,
    validityMonths: clampInt(raw.validity_months, 1, 60, DEFAULT_VALIDITY_MONTHS),
    note: cleanText(raw.note, MAX_NOTE),
    design: sanitizeDesign(raw.design, tenantId ?? (settings as { tenant_id?: string } | null | undefined)?.tenant_id ?? null, storageHost),
  };
}

/** The shape written back into automations.gift_vouchers. */
export function voucherStored(cfg: VoucherConfig, tenantId?: string | null, storageHost = '') {
  const c = voucherConfig({ automations: { gift_vouchers: { enabled: cfg.enabled, amounts: cfg.amounts, services: cfg.services, validity_months: cfg.validityMonths, note: cfg.note, design: cfg.design } } }, tenantId, storageHost);
  return { enabled: c.enabled, amounts: c.amounts, services: c.services, validity_months: c.validityMonths, note: c.note, design: c.design };
}

/**
 * The settings save (app/api/settings/save): whatever the browser sent under automations.gift_vouchers is replaced by its
 * validated form, so a crafted request can store neither markup, nor a foreign image, nor a malformed colour.
 */
export function sanitizeVoucherAutomations(payload: Record<string, unknown>, tenantId: string, storageHost: string): Record<string, unknown> {
  const a = payload.automations;
  if (!a || typeof a !== 'object' || Array.isArray(a) || !('gift_vouchers' in (a as object))) return payload;
  const autos = a as Record<string, unknown>;
  const cfg = voucherConfig({ automations: { gift_vouchers: autos.gift_vouchers } }, tenantId, storageHost);
  return { ...payload, automations: { ...autos, gift_vouchers: voucherStored(cfg, tenantId, storageHost) } };
}

export type ServiceLike = { id?: unknown; name?: unknown; price?: unknown; active?: unknown };

export type VoucherOption = { key: string; kind: 'amount' | 'service'; amount: number; label: string; serviceName: string | null };

/**
 * The options a buyer can pick, with prices decided HERE from her settings and price list, never from the browser.
 * A treatment option needs a service of hers that is active and has a price; anything else is left out.
 */
export function voucherOptions(cfg: VoucherConfig, services: ServiceLike[] | null | undefined): VoucherOption[] {
  const out: VoucherOption[] = cfg.amounts.map((a) => ({ key: `a:${a}`, kind: 'amount' as const, amount: a, label: `₪${a.toLocaleString('he-IL')}`, serviceName: null }));
  const list = Array.isArray(services) ? services : [];
  for (const id of cfg.services) {
    const s = list.find((x) => String(x?.id ?? '') === id);
    if (!s || s.active === false) continue;
    const price = Math.round(Number(s.price));
    const name = cleanText(s.name, 80);
    if (!name || !Number.isFinite(price) || price < MIN_AMOUNT || price > MAX_AMOUNT) continue;
    out.push({ key: `s:${id}`, kind: 'service', amount: price, label: name, serviceName: name });
  }
  return out;
}

/** The option a buyer picked, resolved on the server. Null when it is not on offer (any more). */
export function resolveOption(cfg: VoucherConfig, services: ServiceLike[] | null | undefined, key: unknown): VoucherOption | null {
  const k = String(key ?? '');
  return voucherOptions(cfg, services).find((o) => o.key === k) || null;
}

/** What the voucher is for, in one line: "₪300" or "טיפול פנים (₪280)". */
export function voucherTitle(v: { kind?: unknown; service_name?: unknown; initial_amount?: unknown }): string {
  const amt = `₪${Math.round(Number(v.initial_amount) || 0).toLocaleString('he-IL')}`;
  return v.kind === 'service' && v.service_name ? `${String(v.service_name)} (${amt})` : amt;
}

// ── Codes and tokens ──────────────────────────────────────────────────────

/** Crockford base32: no I, L, O or U, so a code read aloud or typed from a printed card cannot be mistaken. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LEN = 8;

/** A fresh code from random bytes (crypto, injected). "K7M4X9Q2" stored; shown as "K7M4-X9Q2". */
export function newVoucherCode(randomBytes: (n: number) => Uint8Array): string {
  const b = randomBytes(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[b[i] & 31];
  return s;
}

/** Whatever she typed or scanned, as a stored code: case, spaces, dashes and the look-alike letters forgiven. Null when it cannot be one. */
export function normalizeCode(input: unknown): string | null {
  let s = String(input ?? '').toUpperCase();
  // A scanned voucher link carries the token, not the code: never treat it as one.
  if (/\/v\//.test(s)) return null;
  s = s.replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export const formatCode = (code: unknown) => {
  const s = String(code ?? '');
  return s.length === CODE_LEN ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
};

/** The public link's secret: 24 random bytes as hex (192 bits). */
export function newVoucherToken(randomBytes: (n: number) => Uint8Array): string {
  return [...randomBytes(24)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const isVoucherToken = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);

// ── Status and redemption ─────────────────────────────────────────────────

export type VoucherRow = {
  id?: string;
  tenant_id?: string;
  code?: string;
  token?: string;
  kind?: string;
  service_name?: string | null;
  initial_amount?: number | string;
  balance?: number | string;
  status?: string;
  expires_at?: string | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  recipient_name?: string | null;
  message?: string | null;
  sold_via?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
};

export type VoucherStatus = 'active' | 'used' | 'expired' | 'void';

export function voucherStatus(v: VoucherRow, now: Date = new Date()): VoucherStatus {
  if (v.status === 'void') return 'void';
  if (!(Number(v.balance) > 0)) return 'used';
  const exp = v.expires_at ? Date.parse(String(v.expires_at)) : NaN;
  if (Number.isFinite(exp) && exp <= now.getTime()) return 'expired';
  return 'active';
}

export const STATUS_HE: Record<VoucherStatus, string> = { active: 'פעיל', used: 'נוצל במלואו', expired: 'פג תוקף', void: 'בוטל' };

/** Every refusal the till can hear, in her words. The database answers with the key; the screen shows the sentence. */
export const REFUSAL_HE: Record<string, string> = {
  not_found: 'לא מצאנו שובר עם הקוד הזה. בדקי שהקוד הוקלד נכון.',
  void: 'השובר הזה בוטל ואי אפשר לממש אותו.',
  expired: 'תוקף השובר הזה פג ואי אפשר לממש אותו.',
  used: 'השובר הזה כבר נוצל במלואו.',
  insufficient: 'ביתרת השובר אין מספיק לסכום הזה. רענני ונסי שוב.',
  bad_amount: 'הסכום לניצול לא תקין.',
  already_reversed: 'הניצול הזה כבר הוחזר לשובר.',
};

/**
 * The amount of a voucher that can go on this sale: never more than its balance, never more than what is still to pay.
 * Agorot are kept (a balance of 12.50 is real). Zero means nothing can be used.
 */
export function usableAmount(balance: unknown, due: unknown): number {
  const b = Math.max(0, Number(balance) || 0);
  const d = Math.max(0, Number(due) || 0);
  return Math.round(Math.min(b, d) * 100) / 100;
}

/**
 * At the till: more was taken off the voucher than this sale can credit (the total dropped after the voucher was applied). The
 * payment must not be recorded like that, or the voucher would lose balance the receipt never accounts for.
 */
export function voucherOverUsed(applied: { amount?: unknown } | null | undefined, due: unknown): boolean {
  if (!applied) return false;
  return (Number(applied.amount) || 0) - Math.max(0, Number(due) || 0) > 0.005;
}
export const VOUCHER_OVER_USED_HE = 'הסכום לתשלום ירד מתחת למה שכבר מומש מהשובר. לחצי "ביטול הניצול" והחילי את השובר שוב, ואז רשמי את התשלום.';

/** A pre-check of a voucher for the till; the database repeats it atomically when the redemption is written. */
export function redeemProblem(v: VoucherRow | null, amount: number, now: Date = new Date()): string | null {
  if (!v) return 'not_found';
  const st = voucherStatus(v, now);
  if (st !== 'active') return st;
  if (!(amount > 0) || !Number.isFinite(amount)) return 'bad_amount';
  if (amount - (Number(v.balance) || 0) > 0.005) return 'insufficient';
  return null;
}

/** The expiry: the end of the day, `months` after the sale, in Israel (21:59:59Z is 23:59:59 or 00:59:59 local; safe both ways). */
export function expiryFrom(soldAt: Date, months: number): string {
  // 31 January + 1 month is 3 March in Date arithmetic: clamp to the last day of the target month instead.
  const first = new Date(Date.UTC(soldAt.getUTCFullYear(), soldAt.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(soldAt.getUTCDate(), last));
  return `${first.toISOString().slice(0, 10)}T21:59:59Z`;
}

export const dateHe = (iso: unknown) => {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(t));
};

// ── Receipts ──────────────────────────────────────────────────────────────

/** The one item of a voucher sale receipt. kind: 'voucher' keeps it out of the loyalty card and the treatment counts. */
export function voucherItem(o: { title: string; amount: number; code?: string }) {
  return { id: `voucher-${o.code || 'new'}`, name: `${VOUCHER_SERVICE_PREFIX}: ${o.title}`, price: Math.round(o.amount * 100) / 100, qty: 1, kind: VOUCHER_ITEM_KIND, voucher_code: o.code || null };
}

function itemsOf(r: { items?: unknown }): Record<string, unknown>[] {
  let raw = r?.items;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  return Array.isArray(raw) ? raw.filter((i) => i && typeof i === 'object') as Record<string, unknown>[] : [];
}

/** True for a receipt that only sold vouchers: money in advance, not a visit, not a treatment. */
export function isVoucherSaleReceipt(r: { items?: unknown; service?: unknown; appointment_id?: unknown } | null | undefined): boolean {
  if (!r) return false;
  const items = itemsOf(r);
  if (items.length) return items.every((i) => String(i.kind || '') === VOUCHER_ITEM_KIND || String(i.kind || '') === 'gift_card');
  return !r.appointment_id && String(r.service ?? '').trim().startsWith(VOUCHER_SERVICE_PREFIX);
}

/** The line the till adds to a visit's note when a gift voucher paid part or all of it (app/beautyos.jsx handleSaveReceipt). */
export const voucherRedeemNote = (code: unknown, amount: number) => `${VOUCHER_SERVICE_PREFIX} ${formatCode(code)}: ₪${amount} נוכה`;
const REDEEM_NOTE_RE = /שובר מתנה [0-9A-Z]{4}-[0-9A-Z]{4}: ₪\d+(?:\.\d+)? נוכה/;

/**
 * A visit paid (in part or in full) with a gift voucher. The money was taken when the voucher was sold, so such a visit can
 * have a receipt of ₪0, yet it IS a paid visit: the loyalty card counts it (lib/loyalty.js isStampReceipt), exactly like a
 * visit covered by a package.
 */
export function paidByVoucher(r: { note?: unknown } | null | undefined): boolean {
  return !!r && REDEEM_NOTE_RE.test(String(r.note ?? ''));
}

// ── What a public page may show ───────────────────────────────────────────

export type PublicVoucher = {
  title: string;
  kind: 'amount' | 'service';
  serviceName: string | null;
  initial: number;
  balance: number;
  status: VoucherStatus;
  expiresAt: string | null;
  code: string;
  recipientName: string;
  fromName: string;
  message: string;
  note: string;
};

/**
 * The public voucher page's fields, and nothing else: no phone, no ids, no tenant, no buyer contact, no history. The code is
 * shown because the recipient needs it at the till (it is worthless outside her business's signed-in till).
 * The buyer's FIRST name only, as "from": she chose to give the gift.
 */
export function publicVoucherView(v: VoucherRow, note = '', now: Date = new Date()): PublicVoucher {
  const first = cleanName(v.buyer_name).split(' ')[0] || '';
  return {
    title: voucherTitle(v),
    kind: v.kind === 'service' ? 'service' : 'amount',
    serviceName: v.kind === 'service' && v.service_name ? String(v.service_name) : null,
    initial: Math.round((Number(v.initial_amount) || 0) * 100) / 100,
    balance: Math.round((Number(v.balance) || 0) * 100) / 100,
    status: voucherStatus(v, now),
    expiresAt: v.expires_at || null,
    code: formatCode(v.code),
    recipientName: cleanName(v.recipient_name),
    fromName: first,
    message: cleanMessage(v.message),
    note: cleanText(note, MAX_NOTE),
  };
}

/** The text the BUYER sends herself, from her own WhatsApp (wa.me with no number: she picks the friend). Never sent by us. */
export function voucherShareText(o: { businessName: string; recipientName: string; url: string }): string {
  const hi = o.recipientName ? `${o.recipientName}, ` : '';
  return `${hi}יש לך מתנה 🎁 שובר אצל ${o.businessName || 'העסק'}. כל הפרטים והקוד כאן:\n${o.url}`;
}

/** wa.me with no number: WhatsApp asks whom to send it to. */
export const waShareLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// ── The intent stored on a Grow payment ──────────────────────────────────

export type VoucherIntent = {
  token: string;
  kind: 'amount' | 'service';
  service_name: string | null;
  amount: number;
  buyer_name: string;
  recipient_name: string;
  message: string;
  validity_months: number;
};

/** Re-validates what was stored on grow_payments.gift_voucher (jsonb: could hold anything). Null when it is not a voucher intent. */
export function parseVoucherIntent(raw: unknown): VoucherIntent | null {
  const o = asObj(raw);
  if (!isVoucherToken(o.token)) return null;
  const amount = Number(o.amount);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;
  return {
    token: String(o.token),
    kind: o.kind === 'service' ? 'service' : 'amount',
    service_name: o.kind === 'service' ? cleanText(o.service_name, 80) || null : null,
    amount: Math.round(amount * 100) / 100,
    buyer_name: cleanName(o.buyer_name),
    recipient_name: cleanName(o.recipient_name),
    message: cleanMessage(o.message),
    validity_months: clampInt(o.validity_months, 1, 60, DEFAULT_VALIDITY_MONTHS),
  };
}

/** PostgREST / Postgres "this table or column is not there yet" (the migration has not run). */
export function isMissingVoucherSchema(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'].includes(String(e.code || ''))) return true;
  return /gift_voucher/i.test(String(e.message || '')) && /does not exist|schema cache|could not find/i.test(String(e.message || ''));
}

/** Shown nowhere to businesses (owner decision: before the migration nothing shows); kept for the server logs and the API. */
export const NEEDS_MIGRATION_HE = 'שוברי המתנה עוד לא הופעלו אצלך: חסר עדכון אחד במסד הנתונים (kalmea-sql-gift-vouchers.txt). אחרי שירוץ, המסך הזה יעבוד.';

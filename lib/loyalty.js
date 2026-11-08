// lib/loyalty.js
//
// The loyalty stamp card (כרטיסיית נאמנות). Pure: no React, no database, so every rule below is proven by test-loyalty.ts.
//
// ── Stamps are DERIVED, never stored ───────────────────────────────────────
// There is no "stamps" counter anywhere. A client's card is recomputed from her receipts every time it is read, so:
//   * a stamp cannot be counted twice (two receipts for the same day are one stamp),
//   * nothing is lost if a write fails (the receipt IS the stamp),
//   * a void (receipt_voids, lib/till voidedIds) removes the stamp with no extra step, and so does a refund.
//
// The only things written are what a receipt cannot say:
//   * loyalty_redemptions  a reward she gave (append only). A reward redeemed AT THE TILL is also marked on the receipt itself
//                          (a zero-priced item with loyalty_reward: true), so it works before the migration has run and a void of
//                          that receipt gives the reward back. A table row naming the same receipt is the same redemption, once.
//                          A receipt that a table row names (a reward paid by card through Grow, whose receipt the server writes
//                          with no mark) is the reward visit too: it never earns a stamp, exactly like a marked one.
//                          Each redemption carries the number of stamps it took WHEN it was given (the marker's loyalty_every,
//                          the row's stamps_used), so changing "every" later never rewrites the past. Only a legacy redemption
//                          that carries no number falls back to the current setting.
//   * loyalty_adjustments  a manual +1 / -1 with a reason (append only). Needs the migration; without it the button says so.
//
// ── What counts as a visit ─────────────────────────────────────────────────
// A live (not voided) receipt of HER client that is paid (amount > 0, or covered by a package she already paid for) and tied
// to a visit: linked to an appointment, or carrying at least one of her services. Not a package sale, not a deposit, not a
// refund (a negative amount), not a pure product or gift voucher line (items marked kind: product / voucher), and not the
// visit on which the reward itself was given. One stamp per client per day.
//
// ── Redemption and expiry ──────────────────────────────────────────────────
// Stamps are a queue in time order. A redemption takes the OLDEST `every` stamps (so a visit she had beyond the card is carried
// to the next one, never thrown away). A -1 correction removes the newest stamp. With an expiry, a stamp older than that many
// months drops out, both now and at the moment of any later redemption.

import { parseDb } from './dbTime.js';
import { voidedIds } from './till.ts';
import { paidByVoucher } from './giftVouchers.ts';

export const LOYALTY_MIN = 5;
export const LOYALTY_MAX = 12;
export const LOYALTY_DEFAULT_EVERY = 10;
export const LOYALTY_DEFAULT_REWARD = 'הטיפול הבא במתנה';
/** free: the treatment on the reward visit is free; pct: a percentage off it; gift: a present she hands over (no money changes). */
export const LOYALTY_REWARD_KINDS = ['free', 'pct', 'gift'];
export const LOYALTY_ITEM_PREFIX = '🎁 ';
const PACKAGE_PAYMENT = 'חבילה';
const NON_VISIT_ITEM_KINDS = new Set(['product', 'voucher', 'gift_card']);

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clampInt = (v, lo, hi, d) => { const n = Math.round(num(v, d)); return Math.min(hi, Math.max(lo, n)); };

/** Her settings for the card, from settings.automations.loyalty. Absent or malformed reads as off. */
export function loyaltyConfig(settings) {
  const autos = settings && typeof settings.automations === 'object' && settings.automations ? settings.automations : {};
  const raw = autos.loyalty && typeof autos.loyalty === 'object' ? autos.loyalty : {};
  const kind = LOYALTY_REWARD_KINDS.includes(raw.reward_kind) ? raw.reward_kind : 'free';
  const services = Array.isArray(raw.services) ? raw.services.map((s) => String(s || '').trim()).filter(Boolean) : [];
  const expiry = Math.round(num(raw.expiry_months, 0));
  return {
    enabled: raw.enabled === true,
    every: clampInt(raw.every, LOYALTY_MIN, LOYALTY_MAX, LOYALTY_DEFAULT_EVERY),
    reward: String(raw.reward || '').trim().slice(0, 80) || LOYALTY_DEFAULT_REWARD,
    rewardKind: kind,
    rewardPct: kind === 'pct' ? clampInt(raw.reward_pct, 1, 100, 50) : 0,
    services,
    expiryMonths: expiry > 0 && expiry <= 60 ? expiry : 0,
  };
}

/** The shape stored back into settings.automations.loyalty. */
export function loyaltyStored(cfg) {
  return {
    enabled: cfg.enabled === true,
    every: clampInt(cfg.every, LOYALTY_MIN, LOYALTY_MAX, LOYALTY_DEFAULT_EVERY),
    reward: String(cfg.reward || '').trim().slice(0, 80),
    reward_kind: LOYALTY_REWARD_KINDS.includes(cfg.rewardKind) ? cfg.rewardKind : 'free',
    reward_pct: cfg.rewardKind === 'pct' ? clampInt(cfg.rewardPct, 1, 100, 50) : null,
    services: Array.isArray(cfg.services) ? cfg.services.filter(Boolean) : [],
    expiry_months: num(cfg.expiryMonths, 0) > 0 ? Math.round(num(cfg.expiryMonths)) : null,
  };
}

/** The items of a receipt, whichever way it was stored. */
export function itemsOf(r) {
  let raw = r && r.items;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  return Array.isArray(raw) ? raw.filter((i) => i && typeof i === 'object') : [];
}

const ORDINALS_HE = { 2: 'השני', 3: 'השלישי', 4: 'הרביעי', 5: 'החמישי', 6: 'השישי', 7: 'השביעי', 8: 'השמיני', 9: 'התשיעי', 10: 'העשירי' };
/**
 * The example reward text for "every N visits": the card fills on the Nth paid visit and the reward is given on the NEXT one
 * (loyaltyState: N stamps, then a redemption), so it names visit N+1. A fixed "הטיפול העשירי במתנה" was wrong for every N, 10
 * included (2026-11-08 QA). Above ten Hebrew has no everyday ordinal word, so the number is written: "הטיפול ה-11 במתנה".
 */
export function freeVisitExample(every) {
  const n = clampInt(every, LOYALTY_MIN, LOYALTY_MAX, LOYALTY_DEFAULT_EVERY) + 1;
  return `הטיפול ${ORDINALS_HE[n] || `ה-${n}`} במתנה`;
}

/** True when the reward was given on this receipt (the till marks it with a zero-priced item). */
export function isRewardReceipt(r) {
  return itemsOf(r).some((i) => i.loyalty_reward === true);
}

/**
 * Was a loyalty reward given on this sale, by either record: the till's 🎁 mark on the receipt, or a loyalty_redemptions row
 * naming it (a reward paid by card through Grow). Voiding such a receipt gives the reward back with no write of its own:
 * loyaltyState drops a voided receipt's mark and skips a table row whose receipt is voided, so the stamps it took return to the
 * card. The till uses this only to SAY so when she voids (2026-11-08 QA: the reward looked used up, nothing told her otherwise).
 */
export function rewardGivenOn(r, redemptions) {
  if (!r) return false;
  if (isRewardReceipt(r)) return true;
  const id = String(r.id ?? '');
  return id !== '' && (redemptions || []).some((x) => x && x.receipt_id != null && String(x.receipt_id) === id);
}

/** The service names on a receipt: its items (minus product/voucher/reward lines), else its service text. */
export function serviceNamesOf(r) {
  const items = itemsOf(r);
  if (items.length) {
    return items
      .filter((i) => i.loyalty_reward !== true && !NON_VISIT_ITEM_KINDS.has(String(i.kind || '')))
      .map((i) => String(i.name || '').trim())
      .filter(Boolean);
  }
  return String((r && r.service) || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const dayKey = (iso) => {
  const d = parseDb(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
};
const timeOf = (iso) => { const d = parseDb(iso); return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0; };

/**
 * Does this receipt earn a stamp? (Voids are checked by the caller.)
 * @param {object} r a receipt row
 * @param {{ serviceNames?: string[] | Set<string> | null, filter?: string[] }} o her service names; the card's service filter
 */
export function isStampReceipt(r, o = {}) {
  if (!r || r.client_id == null || r.client_id === '') return false;
  const amount = num(r.amount);
  if (amount < 0) return false;                                            // a refund
  const service = String(r.service || '').trim();
  if (!r.appointment_id && /^(חבילה|מקדמה)/.test(service)) return false;   // a package sale or a deposit: money, not a visit
  if (isRewardReceipt(r)) return false;                                    // the reward visit itself
  // A visit paid with a gift voucher can be a ₪0 receipt: the voucher's money was counted when it was sold (lib/giftVouchers.ts).
  const paid = amount > 0 || r.payment_method === PACKAGE_PAYMENT || paidByVoucher(r);
  if (!paid) return false;
  const names = serviceNamesOf(r);
  const known = o.serviceNames ? (o.serviceNames instanceof Set ? o.serviceNames : new Set(o.serviceNames)) : null;
  // A receipt whose items were all products or vouchers has no visit in it, whatever it is linked to.
  if (itemsOf(r).length && names.length === 0) return false;
  const tied = !!r.appointment_id || names.some((n) => (known ? known.has(n) : n !== 'תשלום'));
  if (!tied) return false;
  const filter = Array.isArray(o.filter) ? o.filter : [];
  if (filter.length && !names.some((n) => filter.includes(n))) return false;
  return true;
}

/** A stored "stamps this redemption took": a whole number in range, else null (a legacy redemption, read with the current setting). */
function storedEvery(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

const addMonths = (ms, months) => {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
};

/**
 * The card of one client.
 * @param {{ config: ReturnType<typeof loyaltyConfig>, clientId: unknown, receipts?: object[], voids?: object[],
 *   redemptions?: object[], adjustments?: object[], serviceNames?: string[] | Set<string> | null, now?: number }} p
 */
export function loyaltyState(p) {
  const cfg = p.config;
  const cid = String(p.clientId ?? '');
  const now = p.now ?? Date.now();
  const gone = voidedIds(p.voids || []);
  const mine = (p.receipts || []).filter((r) => r && String(r.client_id ?? '') === cid && cid !== '' && !gone.has(String(r.id)));

  /** @type {{ t: number, kind: 'stamp' | 'redeem' | 'adjust', delta?: number, reward?: string, receiptId?: string | null, reason?: string, used?: number | null, source?: string }[]} */
  const events = [];
  const tillRedeemed = new Set();
  for (const r of mine) {
    if (!isRewardReceipt(r)) continue;
    tillRedeemed.add(String(r.id));
    const it = itemsOf(r).find((i) => i.loyalty_reward === true);
    events.push({ t: timeOf(r.created_at), kind: 'redeem', receiptId: String(r.id), reward: String(it?.loyalty_text || it?.name || '').replace(LOYALTY_ITEM_PREFIX, ''), used: storedEvery(it?.loyalty_every ?? it?.every), source: 'till' });
  }
  for (const x of p.redemptions || []) {
    if (!x || String(x.client_id ?? '') !== cid) continue;
    const rid = x.receipt_id != null && x.receipt_id !== '' ? String(x.receipt_id) : null;
    if (rid && (tillRedeemed.has(rid) || gone.has(rid))) continue; // the same redemption as the receipt's mark, or its receipt was voided
    events.push({ t: timeOf(x.created_at), kind: 'redeem', receiptId: rid, reward: String(x.reward || ''), used: storedEvery(x.stamps_used), source: 'table' });
  }
  // The reward visit never earns a stamp, however the reward is known: a marked receipt is refused by isStampReceipt, and a receipt
  // that only a loyalty_redemptions row names (a Grow card payment) is skipped here, BEFORE the one-stamp-a-day rule, so a reward
  // visit never takes the day's slot from another paid visit that same day.
  const rewardReceipts = new Set(events.filter((e) => e.kind === 'redeem' && e.receiptId).map((e) => String(e.receiptId)));
  const seenDays = new Set();
  for (const r of [...mine].sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))) {
    if (rewardReceipts.has(String(r.id))) continue;
    if (!isStampReceipt(r, { serviceNames: p.serviceNames, filter: cfg.services })) continue;
    const k = dayKey(r.created_at) || String(r.id);
    if (seenDays.has(k)) continue;
    seenDays.add(k);
    events.push({ t: timeOf(r.created_at), kind: 'stamp', receiptId: String(r.id) });
  }
  for (const a of p.adjustments || []) {
    if (!a || String(a.client_id ?? '') !== cid) continue;
    const d = num(a.delta);
    if (d !== 1 && d !== -1) continue;
    events.push({ t: timeOf(a.created_at), kind: 'adjust', delta: d, reason: String(a.reason || '') });
  }
  // Same moment: stamps before a redemption (the visit that filled the card is on it), corrections last.
  const order = { stamp: 0, redeem: 1, adjust: 2 };
  events.sort((a, b) => a.t - b.t || order[a.kind] - order[b.kind]);

  /** @type {number[]} */
  let stamps = [];
  const expire = (at) => { if (cfg.expiryMonths > 0) stamps = stamps.filter((s) => addMonths(s, cfg.expiryMonths) > at); };
  const history = [];
  for (const e of events) {
    expire(e.t);
    if (e.kind === 'stamp') stamps.push(e.t);
    else if (e.kind === 'adjust') {
      if (e.delta === 1) stamps.push(e.t);
      else stamps.pop();
      history.push({ kind: 'adjust', at: e.t, delta: e.delta, reason: e.reason });
    } else {
      const used = e.used ?? cfg.every; // what it took when it was given; the current setting only for a legacy redemption
      stamps.splice(0, used);
      history.push({ kind: 'redeem', at: e.t, reward: e.reward || cfg.reward, receiptId: e.receiptId ?? null, used });
    }
  }
  expire(now);
  stamps.sort((a, b) => a - b);
  const count = stamps.length;
  const ready = count >= cfg.every;
  const filled = Math.min(count, cfg.every);
  const nextExpiry = cfg.expiryMonths > 0 && count ? addMonths(stamps[0], cfg.expiryMonths) : null;
  return {
    enabled: cfg.enabled,
    every: cfg.every,
    reward: cfg.reward,
    stamps: count,
    filled,
    remaining: ready ? 0 : cfg.every - count,
    ready,
    nextExpiry,
    history: history.reverse(),
  };
}

/** The line under a saved receipt. */
export function afterSaveLine(state) {
  if (!state || !state.enabled) return '';
  if (state.ready) return 'זו המתנה שלה בפעם הבאה!';
  return state.remaining === 1 ? 'נשאר לה ביקור אחד למתנה' : `נשארו לה ${state.remaining} ביקורים למתנה`;
}

/** The line on her own page, in her voice to the client. */
export function clientLine(state) {
  if (state.ready) return 'מילאת את הכרטיסייה! המתנה מחכה לך בביקור הבא';
  return state.remaining === 1 ? 'עוד ביקור אחד למתנה' : `עוד ${state.remaining} ביקורים למתנה`;
}

/** Should the owner be offered a prepared message? One visit away, or the reward is ready. */
export function messageMoment(state) {
  if (!state || !state.enabled) return null;
  if (state.ready) return 'ready';
  if (state.remaining === 1) return 'one_away';
  return null;
}

/** The message she can send from her own WhatsApp. Warm, to the client, feminine second person, no dashes. */
export function loyaltyMessage(state, { clientName = '', businessName = '' } = {}) {
  const first = String(clientName || '').trim().split(/\s+/)[0] || '';
  const hi = first ? `היי ${first}!` : 'היי!';
  const sign = String(businessName || '').trim();
  const moment = messageMoment(state);
  if (moment === 'ready') {
    return `${hi} 🎁 מילאת את כרטיסיית הנאמנות שלך, ובביקור הבא מחכה לך: ${state.reward}. מחכה לראות אותך${sign ? `, ${sign}` : ''} 🌸`;
  }
  if (moment === 'one_away') {
    return `${hi} 🌸 עוד ביקור אחד וכרטיסיית הנאמנות שלך מלאה, ואז מגיעה לך מתנה: ${state.reward}. מחכה לך${sign ? `, ${sign}` : ''}`;
  }
  return '';
}

/**
 * The zero-priced 🎁 item that marks a receipt as the reward visit. ONE shape for the till (rewardAtTill) and for the server, which
 * writes it on the receipt of a reward paid by card through Grow (lib/grow/service.ts), so isRewardReceipt and loyaltyState read
 * both the same way. loyalty_every: the stamps this reward takes, kept on the receipt so a later change of the setting never
 * rewrites this one.
 * @param {{ reward: string, stampsUsed: number, id?: string }} m
 */
export function loyaltyMarker(m) {
  const reward = String(m.reward || '').trim().slice(0, 80) || LOYALTY_DEFAULT_REWARD;
  return { id: m.id || `loyalty-${Date.now()}`, name: LOYALTY_ITEM_PREFIX + reward, price: 0, qty: 1, loyalty_reward: true, loyalty_text: reward, loyalty_every: m.stampsUsed };
}

/**
 * A loyalty reward applied to a Grow card charge, as the till sends it ({ reward, stampsUsed }) or as it is stored on the payment
 * (grow_payments.loyalty_redemption: { client_id, reward, stamps_used }). Read on the server: stamps_used must be a whole number
 * from 1 to 100 (the column's own check), the reward text is trimmed to 80 characters. Anything else is null: no reward.
 * The client is NOT taken from here: the caller supplies the payment's own client, which the charge route checked belongs to her.
 * @param {unknown} raw
 * @returns {{ reward: string, stamps_used: number } | null}
 */
export function parseLoyaltyIntent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const used = o.stamps_used ?? o.stampsUsed;
  if (typeof used !== 'number' && typeof used !== 'string') return null;
  if (typeof used === 'string' && !/^\d+$/.test(used.trim())) return null;
  const n = Number(used);
  if (!Number.isInteger(n) || n < 1 || n > 100) return null;
  const reward = String(o.reward ?? '').trim().slice(0, 80) || LOYALTY_DEFAULT_REWARD;
  return { reward, stamps_used: n };
}

/**
 * What applying the reward at the till does to the visit: the discount to set and the item that marks the receipt.
 * @param {ReturnType<typeof loyaltyConfig>} cfg
 * @param {{ name: string, price: number, qty?: number }[]} items what is in the till now
 */
export function rewardAtTill(cfg, items) {
  const lines = (items || []).filter((i) => i && i.loyalty_reward !== true && !NON_VISIT_ITEM_KINDS.has(String(i.kind || '')));
  const eligible = cfg.services.length ? lines.filter((i) => cfg.services.includes(i.name)) : lines;
  const top = eligible.reduce((m, i) => (num(i.price) > num(m?.price, -1) ? i : m), null);
  const marker = loyaltyMarker({ reward: cfg.reward, stampsUsed: cfg.every });
  if (cfg.rewardKind === 'free') return { mode: 'ils', discount: top ? Math.max(0, num(top.price)) : 0, marker, needsItem: !top };
  if (cfg.rewardKind === 'pct') return { mode: 'pct', discount: cfg.rewardPct, marker, needsItem: lines.length === 0 };
  return { mode: null, discount: 0, marker, needsItem: false };
}

/**
 * @typedef {{ every: number, filled: number, remaining: number, ready: boolean, reward: string, line: string }} PublicLoyaltyCard
 */

/** The card as the client's page shows it. Nothing else about her or the business leaves the server. */
/** @returns {PublicLoyaltyCard | null} */
export function publicCard(state) {
  if (!state || !state.enabled) return null;
  return { every: state.every, filled: state.filled, remaining: state.remaining, ready: state.ready, reward: state.reward, line: clientLine(state) };
}

const MISSING_TABLE = /does not exist|schema cache|could not find the table/i;
/** A loyalty table read or write that failed because the migration has not run. */
export function isMissingLoyaltyTable(e) {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  const m = String(e.message || '');
  return /loyalty_/.test(m) && MISSING_TABLE.test(m) && !/column/i.test(m);
}

/**
 * Can the ledgers be trusted for counting? `ready` is the till's loyaltyDb.ready: true = read, false = the tables are not there yet
 * (the migration has not run, so the ledgers are known to be empty). Anything else, a read still pending (null) or a read that failed
 * ('error'), is unknown: counting from empty ledgers then could offer a reward already given through Grow, so nothing is shown.
 */
export function loyaltyLedgersSettled(ready) {
  return ready === true || ready === false;
}

/**
 * Is a reward applied at the till left over from another client? It belongs to the client it was applied for; once the till's
 * client changes (or is cleared) it must be taken off: the discount reverted, the mark removed.
 * @param {{ clientId?: unknown } | null | undefined} applied
 * @param {unknown} clientId the till's client now
 */
export function rewardIsStale(applied, clientId) {
  if (!applied) return false;
  const now = clientId == null ? '' : String(clientId);
  return now === '' || String(applied.clientId ?? '') !== now;
}

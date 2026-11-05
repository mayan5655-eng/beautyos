// The loyalty stamp card (lib/loyalty.js): what counts as a visit, voids and refunds, redemption, expiry, the service filter,
// corrections, the till reward, the copy (no dashes), the migration's RLS, the client page exposing only the card, and how the
// code behaves before the migration has run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loyaltyConfig, loyaltyStored, loyaltyState, isStampReceipt, isRewardReceipt, afterSaveLine, clientLine, messageMoment, loyaltyMessage,
  rewardAtTill, publicCard, isMissingLoyaltyTable, LOYALTY_DEFAULT_EVERY,
} from './lib/loyalty.js';

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const day = (n: number) => new Date(Date.UTC(2026, 10, 5, 9, 0, 0) - n * 86400000).toISOString();
const SERVICES = ['טיפול פנים', 'לק ג׳ל', 'גבות'];
let seq = 0;
const rc = (daysAgo: number, o: Record<string, unknown> = {}) => ({
  id: `r${++seq}`, client_id: 'c1', appointment_id: `a${seq}`, service: 'טיפול פנים', amount: 300, payment_method: 'מזומן',
  items: JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }]), created_at: day(daysAgo), ...o,
});
const cfg = (o: Record<string, unknown> = {}) => loyaltyConfig({ automations: { loyalty: { enabled: true, every: 5, reward: 'הטיפול השישי במתנה', ...o } } });
const st = (receipts: any[], o: Record<string, any> = {}) =>
  loyaltyState({ config: o.config || cfg(), clientId: 'c1', receipts, voids: o.voids, redemptions: o.redemptions, adjustments: o.adjustments, serviceNames: SERVICES, now: NOW });

// ── config ─────────────────────────────────────────────────────────────────
{
  const off = loyaltyConfig({});
  assert.equal(off.enabled, false, 'off by default');
  assert.equal(off.every, LOYALTY_DEFAULT_EVERY, 'default 10');
  assert.equal(loyaltyConfig({ automations: { loyalty: { enabled: 'true' } } }).enabled, false, 'only a real true turns it on');
  assert.equal(loyaltyConfig({ automations: { loyalty: { every: 3 } } }).every, 5, 'clamped to 5');
  assert.equal(loyaltyConfig({ automations: { loyalty: { every: 40 } } }).every, 12, 'clamped to 12');
  assert.equal(loyaltyConfig({ automations: null }).enabled, false, 'malformed bag reads as off');
  const c = cfg({ reward_kind: 'pct', reward_pct: 50, services: ['גבות', ''], expiry_months: 6 });
  assert.deepEqual([c.rewardKind, c.rewardPct, c.services, c.expiryMonths], ['pct', 50, ['גבות'], 6]);
  const back = loyaltyConfig({ automations: { loyalty: loyaltyStored(c) } });
  assert.deepEqual(back, c, 'stored shape round trips');
}

// ── what counts as a visit ─────────────────────────────────────────────────
{
  const o = { serviceNames: SERVICES };
  assert.equal(isStampReceipt(rc(1), o), true, 'a paid visit');
  assert.equal(isStampReceipt(rc(1, { client_id: null }), o), false, 'no client, no card');
  assert.equal(isStampReceipt(rc(1, { amount: -300 }), o), false, 'a refund');
  assert.equal(isStampReceipt(rc(1, { amount: 0 }), o), false, 'not paid');
  assert.equal(isStampReceipt(rc(1, { amount: 0, payment_method: 'חבילה' }), o), true, 'a visit drawn from a package she paid for');
  assert.equal(isStampReceipt(rc(1, { appointment_id: null, service: 'חבילה: טיפול פנים', items: JSON.stringify([{ name: 'חבילה: טיפול פנים (5 טיפולים)', price: 1200, qty: 1 }]) }), o), false, 'a package sale');
  assert.equal(isStampReceipt(rc(1, { appointment_id: null, service: 'מקדמה לתור', items: null }), o), false, 'a deposit');
  assert.equal(isStampReceipt(rc(1, { items: JSON.stringify([{ name: 'קרם', price: 120, qty: 1, kind: 'product' }]) }), o), false, 'a pure product sale');
  assert.equal(isStampReceipt(rc(1, { items: JSON.stringify([{ name: 'שובר מתנה', price: 300, qty: 1, kind: 'voucher' }]) }), o), false, 'a gift voucher');
  assert.equal(isStampReceipt(rc(1, { appointment_id: null }), o), true, 'walk-in with one of her services');
  assert.equal(isStampReceipt(rc(1, { appointment_id: null, service: 'תשלום', items: '[]' }), o), false, 'an amount with nothing tied to a visit');
  assert.equal(isStampReceipt(rc(1, { items: JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: '🎁 מתנה', price: 0, qty: 1, loyalty_reward: true }]) }), o), false, 'the reward visit itself');
  // the service filter
  assert.equal(isStampReceipt(rc(1), { serviceNames: SERVICES, filter: ['גבות'] }), false, 'filtered out');
  assert.equal(isStampReceipt(rc(1, { items: JSON.stringify([{ name: 'גבות', price: 90, qty: 1 }]) }), { serviceNames: SERVICES, filter: ['גבות'] }), true, 'in the filter');
}

// ── counting, voids, refunds, one per day ──────────────────────────────────
{
  const three = [rc(30), rc(20), rc(10)];
  const s = st(three);
  assert.deepEqual([s.stamps, s.filled, s.remaining, s.ready], [3, 3, 2, false]);
  assert.equal(st([...three, rc(10)]).stamps, 3, 'two receipts on the same day are one stamp');
  assert.equal(st(three, { voids: [{ receipt_id: three[1].id }] }).stamps, 2, 'a void removes the stamp');
  assert.equal(st(three, { voids: [{ receipt_id: three[1].id, credit_status: 'pending' }] }).stamps, 3, 'a void waiting for its credit document still counts, like the money');
  assert.equal(st([...three, rc(5, { amount: -300 })]).stamps, 3, 'a refund adds nothing');
  assert.equal(st([rc(1, { client_id: 'c2' })]).stamps, 0, 'another client');
  const five = [rc(50), rc(40), rc(30), rc(20), rc(10)];
  const full = st(five);
  assert.deepEqual([full.ready, full.remaining, full.filled], [true, 0, 5]);
  assert.equal(afterSaveLine(full), 'זו המתנה שלה בפעם הבאה!');
  assert.equal(afterSaveLine(st(five.slice(1))), 'נשאר לה ביקור אחד למתנה');
  assert.equal(afterSaveLine(s), 'נשארו לה 2 ביקורים למתנה');
  assert.equal(afterSaveLine({ ...s, enabled: false }), '', 'nothing when it is off');
}

// ── redemption resets; voiding the reward visit gives it back ──────────────
{
  const five = [rc(50), rc(40), rc(30), rc(20), rc(10)];
  const marked = rc(5, { amount: 0, items: JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: '🎁 הטיפול השישי במתנה', price: 0, qty: 1, loyalty_reward: true, loyalty_text: 'הטיפול השישי במתנה' }]) });
  assert.equal(isRewardReceipt(marked), true);
  const after = st([...five, marked]);
  assert.deepEqual([after.stamps, after.ready, after.remaining], [0, false, 5], 'redeeming resets the card');
  assert.equal(after.history[0].kind, 'redeem');
  assert.equal(after.history[0].reward, 'הטיפול השישי במתנה');
  // the same redemption also in the table (the till writes both): counted once
  const both = st([...five, marked], { redemptions: [{ client_id: 'c1', receipt_id: marked.id, created_at: marked.created_at, reward: 'x' }] });
  assert.equal(both.history.filter((h: any) => h.kind === 'redeem').length, 1, 'one redemption, not two');
  // voiding the reward receipt gives the reward back
  assert.equal(st([...five, marked], { voids: [{ receipt_id: marked.id }] }).ready, true, 'void of the reward visit: the reward is ready again');
  // a Grow payment: only the table row knows; voiding its receipt also gives it back
  const grow = rc(5, { amount: 150 });
  const red = [{ client_id: 'c1', receipt_id: grow.id, created_at: grow.created_at, reward: '50%' }];
  assert.equal(st([...five, grow], { redemptions: red }).stamps, 1, 'the paid visit after the card counts once the card was redeemed');
  assert.equal(st([...five, grow], { redemptions: red, voids: [{ receipt_id: grow.id }] }).ready, true);
  // a reward given by hand (no receipt)
  assert.equal(st(five, { redemptions: [{ client_id: 'c1', receipt_id: null, created_at: day(1) }] }).stamps, 0);
  // visits beyond a full card carry to the next one
  const seven = [rc(70), rc(60), rc(50), rc(40), rc(30), rc(20)];
  assert.equal(st(seven, { redemptions: [{ client_id: 'c1', receipt_id: null, created_at: day(1) }] }).stamps, 1, 'the sixth visit carries over');
  // a void after redemption never makes the card negative
  assert.equal(st(five, { redemptions: [{ client_id: 'c1', receipt_id: null, created_at: day(1) }], voids: [{ receipt_id: five[0].id }] }).stamps, 0);
}

// ── corrections ────────────────────────────────────────────────────────────
{
  const two = [rc(20), rc(10)];
  assert.equal(st(two, { adjustments: [{ client_id: 'c1', delta: 1, reason: 'כרטיסייה מנייר', created_at: day(1) }] }).stamps, 3);
  assert.equal(st(two, { adjustments: [{ client_id: 'c1', delta: -1, reason: 'טעות', created_at: day(1) }] }).stamps, 1);
  assert.equal(st([], { adjustments: [{ client_id: 'c1', delta: -1, reason: 'טעות', created_at: day(1) }] }).stamps, 0, 'never below zero');
  assert.equal(st(two, { adjustments: [{ client_id: 'c1', delta: 5, reason: 'x', created_at: day(1) }] }).stamps, 2, 'only +1 or -1');
  const h = st(two, { adjustments: [{ client_id: 'c1', delta: 1, reason: 'כרטיסייה מנייר', created_at: day(1) }] }).history;
  assert.equal(h[0].reason, 'כרטיסייה מנייר', 'the reason is in the history');
}

// ── expiry ─────────────────────────────────────────────────────────────────
{
  const c = cfg({ expiry_months: 6 });
  const s = st([rc(400), rc(300), rc(100), rc(20)], { config: c });
  assert.equal(s.stamps, 2, 'stamps older than six months are gone');
  assert.ok(s.nextExpiry && s.nextExpiry > NOW, 'the next one to expire is in the future');
  assert.equal(st([rc(400), rc(300), rc(100), rc(20)]).stamps, 4, 'no expiry: all count');
}

// ── the till ───────────────────────────────────────────────────────────────
{
  const items = [{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: 'גבות', price: 90, qty: 1 }];
  const free = rewardAtTill(cfg(), items);
  assert.deepEqual([free.mode, free.discount, free.needsItem], ['ils', 300, false], 'free: the dearest treatment');
  assert.equal(free.marker.price, 0);
  assert.equal(free.marker.loyalty_reward, true);
  assert.equal(rewardAtTill(cfg({ services: ['גבות'] }), items).discount, 90, 'free: only a treatment the card is for');
  assert.equal(rewardAtTill(cfg(), []).needsItem, true, 'nothing in the till yet');
  const pct = rewardAtTill(cfg({ reward_kind: 'pct', reward_pct: 50 }), items);
  assert.deepEqual([pct.mode, pct.discount], ['pct', 50]);
  const gift = rewardAtTill(cfg({ reward_kind: 'gift' }), items);
  assert.deepEqual([gift.mode, gift.discount], [null, 0], 'a present: no money changes');
}

// ── messages: manual only, warm, no dashes ─────────────────────────────────
{
  const ready = st([rc(50), rc(40), rc(30), rc(20), rc(10)]);
  const one = st([rc(40), rc(30), rc(20), rc(10)]);
  assert.equal(messageMoment(ready), 'ready');
  assert.equal(messageMoment(one), 'one_away');
  assert.equal(messageMoment(st([rc(10)])), null, 'nothing to say in the middle of the card');
  const m1 = loyaltyMessage(ready, { clientName: 'רונית כהן', businessName: 'סטודיו נועה' });
  const m2 = loyaltyMessage(one, { clientName: 'רונית כהן', businessName: 'סטודיו נועה' });
  assert.ok(m1.startsWith('היי רונית!') && m1.includes('הטיפול השישי במתנה'));
  assert.ok(m2.includes('עוד ביקור אחד'));
  assert.equal(clientLine(one), 'עוד ביקור אחד למתנה');
  assert.equal(clientLine(st([rc(10)])), 'עוד 4 ביקורים למתנה');
  const copy = [m1, m2, afterSaveLine(one), afterSaveLine(ready), clientLine(ready), clientLine(one), afterSaveLine(st([rc(1)]))];
  for (const t of copy) assert.ok(!/[–—]/.test(t) && !/ - /.test(t), `no dash in: ${t}`);
}

// ── the client page shows the card and nothing else ────────────────────────
{
  const card = publicCard(st([rc(20), rc(10)]));
  assert.deepEqual(Object.keys(card!).sort(), ['every', 'filled', 'line', 'ready', 'remaining', 'reward']);
  assert.equal(publicCard({ ...st([rc(10)]), enabled: false }), null, 'off: no card');
}

// ── before the migration ───────────────────────────────────────────────────
{
  assert.equal(isMissingLoyaltyTable({ code: '42P01', message: 'relation "public.loyalty_adjustments" does not exist' }), true);
  assert.equal(isMissingLoyaltyTable({ code: 'PGRST205', message: "Could not find the table 'public.loyalty_redemptions' in the schema cache" }), true);
  assert.equal(isMissingLoyaltyTable({ message: "Could not find the table 'public.loyalty_redemptions' in the schema cache" }), true);
  assert.equal(isMissingLoyaltyTable({ code: '42501', message: 'permission denied' }), false, 'a refusal is not "missing"');
  assert.equal(isMissingLoyaltyTable(null), false);
  // with no tables at all, a till redemption (the receipt's own mark) still resets the card
  const five = [rc(50), rc(40), rc(30), rc(20), rc(10)];
  const marked = rc(5, { amount: 0, items: JSON.stringify([{ name: 'טיפול פנים', price: 300, qty: 1 }, { name: '🎁 x', price: 0, qty: 1, loyalty_reward: true }]) });
  assert.equal(loyaltyState({ config: cfg(), clientId: 'c1', receipts: [...five, marked], now: NOW }).stamps, 0, 'works with no redemption rows');
}

// ── the migration: tenant scoped RLS, append only, trial gate, nothing for anon ─────────────────────────────────────────
{
  const sql = readFileSync('supabase/migrations/add_loyalty_2026-11-05.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const t of ['loyalty_redemptions', 'loyalty_adjustments']) {
    assert.ok(code.includes(`create table if not exists public.${t}`), `${t} is created`);
    assert.ok(code.includes(`alter table public.${t} enable row level security`), `${t} has RLS`);
    assert.ok(code.includes(`revoke all on public.${t} from anon, authenticated`), `${t}: nothing for anon`);
    assert.ok(code.includes(`grant select, insert on public.${t} to authenticated`), `${t}: select and insert only`);
  }
  assert.ok(code.includes('tenant_id = public.get_user_tenant_id()'), 'scoped to her own business');
  assert.ok(/for select to authenticated using \(tenant_id = public\.get_user_tenant_id\(\)\)/.test(code));
  assert.ok(/for insert to authenticated with check \(tenant_id = public\.get_user_tenant_id\(\)\)/.test(code));
  assert.ok(!/for (update|delete|all) to authenticated using \(tenant_id/.test(code), 'append only: no update, delete or all policy');
  assert.ok(code.includes('as restrictive for insert to authenticated with check (public.is_tenant_active())'), 'the trial gate');
  assert.ok(!/\bto anon\b/.test(code), 'no policy for anon');
  assert.ok(/check \(delta in \(-1, 1\)\)/.test(code), 'a correction is one stamp');
  assert.ok(code.includes('loyalty_client_same_tenant'), 'the client must be of the same business');
}

// ── wiring: the client page loader only exposes the card, and the copy has no dashes ───────────────────────────────────
{
  const loader = readFileSync('lib/clientPageData.ts', 'utf8');
  assert.ok(/\bloyalty\?: PublicLoyaltyCard/.test(loader), 'the page carries a loyalty field');
  assert.ok(/publicCard\(/.test(loader), 'built through publicCard, which strips everything else');
  const view = readFileSync('app/c/[token]/ClientPageView.tsx', 'utf8');
  const lib = readFileSync('lib/loyalty.js', 'utf8');
  const he = (s: string) => (s.match(/(['"`])(?:(?!\1).)*[֐-׿](?:(?!\1).)*\1/g) || []);
  for (const t of [...he(view), ...he(lib)]) assert.ok(!/[–—]/.test(t), `no em or en dash in copy: ${t}`);
  const app = readFileSync('app/beautyos.jsx', 'utf8');
  const block = app.split('\n').filter((l) => /loyalty|Loyalty|נאמנות/.test(l));
  for (const l of block) for (const t of he(l)) assert.ok(!/[–—]/.test(t), `no dash in loyalty copy: ${t}`);
  const help = readFileSync('lib/helpSections.ts', 'utf8');
  assert.ok(help.includes('כרטיסיית נאמנות'), 'the help mentions the card');
}

console.log('loyalty: ok');

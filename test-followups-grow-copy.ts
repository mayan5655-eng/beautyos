// Follow-ups (2026-11-09): the Grow cost said up front, the cancel page that refuses before offering a button that cannot
// work, a booking made inside the cancel window promising no link, and the help text naming the current Settings tabs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GROW_PRICING, growCostLineHe, growCostDetailsHe } from './lib/growPricing.ts';
import { GROW_PLANS } from './lib/grow/plans.ts';
import { clientLinkRefusal, cancelLinesHe, resolveBookingRules } from './lib/bookingPolicy.ts';
import { HELP_SECTIONS } from './lib/helpSections.ts';

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok - ${name}`); };
const noEmDash = (s: string, where: string) => assert.ok(!s.includes('—'), `${where}: no em dash`);

// 12:00 in Israel on 2026-11-09 (UTC+2 in November).
const NOW = new Date('2026-11-09T10:00:00Z');

// ── 1. Grow cost ────────────────────────────────────────────────────────────
ok('Grow cost: the three plans from lib/grow/plans.ts, in one short line, and what every plan includes', () => {
  assert.deepEqual({ ...GROW_PRICING }, { includedTransactions: 100, includedDocuments: 100, overage: 0.5 });
  assert.equal(growCostLineHe(), 'הסליקה דרך Grow, שלושה מסלולים לבחירה: ₪69 לחודש + 0.75% (חודשי), ₪59 לחודש + 0.75% (שנתי) או ₪29 לחודש + 1% (שנתי מראש). לפני מע״מ.');
  const d = growCostDetailsHe().join('\n');
  for (const s of ['₪69 לחודש + 0.75% מכל עסקה', '₪59 לחודש + 0.75% מכל עסקה', '₪29 לחודש + 1% מכל עסקה', 'בביט ובארנקים', '100 עסקאות ו-100 מסמכים', '₪0.50 לכל אחד', 'מה-1 בחודש הבא', 'לפני מע״מ']) assert.ok(d.includes(s), `details say ${s}`);
  noEmDash(growCostLineHe() + d, 'grow cost');
  // a change in one place changes the copy
  assert.match(growCostLineHe([{ ...GROW_PLANS[0], monthly: 49 }]), /₪49 לחודש/);
});

ok('Grow cost: shown in the Grow card, the gift voucher card (before Grow is connected) and the help, with no hard-coded price', () => {
  const note = read('./app/GrowCostNote.jsx');
  assert.match(note, /growCostLineHe\(\)/);
  assert.match(note, /מה זה כולל\?/);
  assert.match(note, /<details>/);
  const card = read('./app/GrowCard.jsx');
  assert.match(card, /import GrowCostNote from '\.\/GrowCostNote';/);
  assert.ok(card.indexOf('<GrowCostNote') > card.indexOf('data-testid="grow-card"'), 'inside the card');
  const gv = read('./app/GiftVoucherMarketingCard.jsx');
  assert.match(gv, /\{online === false && <GrowCostNote/);
  for (const [f, s] of [['GrowCard', card], ['GiftVoucherMarketingCard', gv], ['GrowCostNote', note]]) assert.ok(!/₪\s?59|0\.75%/.test(s), `${f}: the price comes from lib/growPricing.ts`);
  const settings = HELP_SECTIONS.find((x) => x.key === 'settings')!;
  assert.ok(settings.body.some((l) => l.includes(growCostLineHe())), 'help says the cost');
});

// ── 2. the cancel page knows up front ───────────────────────────────────────
ok('clientLinkRefusal: inside the window refuses (with how to reach her), outside and under a Grow policy do not', () => {
  const base = { action: 'cancel', status: 'confirmed', date: '2026-11-09', cancelWindowHours: 24, businessName: 'סטודיו נועה' };
  const inside = clientLinkRefusal({ ...base, startMinute: 22 * 60 }, NOW);
  assert.equal(inside?.code, 'window');
  assert.equal(inside?.tooLate, true);
  assert.equal(inside?.error, 'אפשר לבטל דרך הקישור עד 24 שעות לפני התור. כדי לבטל עכשיו, אפשר ליצור קשר ישירות עם סטודיו נועה.');
  assert.equal(clientLinkRefusal({ ...base, date: '2026-11-11', startMinute: 10 * 60 }, NOW), null);
  assert.equal(clientLinkRefusal({ ...base, startMinute: 22 * 60, underPolicy: true }, NOW), null, 'a late cancel under a fee policy is allowed');
  assert.equal(clientLinkRefusal({ ...base, startMinute: 22 * 60, cancelWindowHours: 0 }, NOW), null, 'no window');
  assert.equal(clientLinkRefusal({ ...base, action: 'confirm', startMinute: 22 * 60 }, NOW), null, 'confirming is never blocked by the window');
  assert.equal(clientLinkRefusal({ ...base, startMinute: 9 * 60 }, NOW)?.code, 'past');
  assert.equal(clientLinkRefusal({ ...base, status: 'no_show', date: '2026-11-20', startMinute: 600 }, NOW)?.code, 'changed');
  assert.equal(clientLinkRefusal({ ...base, status: 'cancelled', startMinute: 22 * 60 }, NOW), null, 'already cancelled is "already done", not a refusal');
  assert.equal(clientLinkRefusal({ ...base, startMinute: null }, NOW), null, 'unparseable slot: the link behaves as before');
});

ok('the route: one rule for the peek and the real request, refusal before any update, contact only past the signature', () => {
  const route = read('./app/api/confirm/route.ts');
  assert.ok(route.indexOf('if (!verifyConfirm(') < route.indexOf('clientLinkRefusal({'), 'after the signature check');
  assert.ok(route.indexOf('clientLinkRefusal({') < route.indexOf('if (body.peek === true)'), 'computed before the peek');
  const peek = route.slice(route.indexOf('if (body.peek === true)'), route.indexOf('// Idempotent'));
  assert.match(peek, /\.\.\.\(action === 'cancel' && refusal \? \{ refusal: \{ error: refusal\.error/);
  assert.ok(!/\.update\(/.test(peek), 'the peek changes nothing');
  assert.ok(route.indexOf('if (refusal) {') < route.indexOf("from('appointments').update(patch)"), 'the real request still refuses (the authority)');
  assert.ok(!/minutesUntilIsrael|isInsideCancelWindow\(/.test(route), 'no second copy of the rule in the route');
});

ok('the page: a peek refusal shows the calm refusal at once, never after she already answered', () => {
  const page = read('./app/confirm/page.jsx');
  assert.match(page, /d\.refusal && typeof d\.refusal\.error === 'string' && !answered\.current/);
  const block = page.slice(page.indexOf('else if (d.refusal'), page.indexOf('.catch(() => {});'));
  assert.match(block, /setStatus\('error'\)/);
  assert.match(block, /setRefused\(true\)/);
  assert.match(block, /setContact\(/);
  assert.match(block, /d\.bookUrl\.startsWith\('\/'\)/, 'only a path on this site');
  assert.match(page, /const sendNow = \(\) => \{ answered\.current = true;/);
  assert.match(block, /setTooLate\(d\.refusal\.tooLate === true\)/);
  assert.match(page, /contact\.bookUrl && !tooLate && <a/, 'inside the window: no "book another time" next to a booking that still stands');
  assert.match(page, /className=\{tooLate \? 'pub-pill' : 'pub-pill pub-pill-quiet'\}/, 'writing to her is the main way out');
  assert.match(page, /title: action === 'cancel' \? 'אי אפשר לבטל מהקישור'/, 'the calm title, not "אופס!"');
  assert.match(page, /\(status === 'ready' \|\| \(status === 'error' && refused && action === 'cancel'\)\) && peekAppt/, 'still says which appointment');
});

// ── 3. a booking made inside the window ─────────────────────────────────────
ok('cancelLinesHe: booked 10 hours ahead with a 24-hour window, no link and no link promise', () => {
  const rules = resolveBookingRules({ booking_rules: { cancel_window_hours: 24 } });
  const late = cancelLinesHe(rules, { businessName: 'סטודיו נועה', slot: { date: '2026-11-09', startMinute: 22 * 60 }, now: NOW });
  assert.equal(late.showLink, false);
  assert.equal(late.after, null);
  assert.equal(late.before, 'מתרגשות לראות אותך! אם משהו משתנה, ביטול רק ישירות מול סטודיו נועה.');
  assert.ok(!/בקישור|בלחיצה/.test(late.before));
  const early = cancelLinesHe(rules, { businessName: 'סטודיו נועה', slot: { date: '2026-11-12', startMinute: 600 }, now: NOW });
  assert.equal(early.showLink, true);
  assert.match(early.before, /עד 24 שעות לפני התור:$/);
  const policy = cancelLinesHe(rules, { underPolicy: true, slot: { date: '2026-11-09', startMinute: 22 * 60 }, now: NOW });
  assert.equal(policy.showLink, true, 'under a Grow policy the link always cancels');
  assert.equal(cancelLinesHe(resolveBookingRules({}), { slot: { date: '2026-11-09', startMinute: 22 * 60 }, now: NOW }).showLink, true, 'no window');
  for (const c of [late, early, policy]) noEmDash(c.before, 'cancel line');
});

ok('bookingNotify passes the slot and leaves the link out when it could not cancel', () => {
  const b = read('./lib/bookingNotify.js');
  assert.match(b, /slot: \{ date: p\.date, startMinute: p\.startMinute \}/);
  assert.match(b, /cancelCopy\.showLink \? cancelUrl : null,/);
});

// ── 4. help names the current Settings tabs ─────────────────────────────────
ok('help: the Settings section uses the tab names Settings shows today', () => {
  const app = read('./app/beautyos.jsx');
  const m = app.match(/\{\[(\{k:"business",l:"[^\]]+)\]\.map\(t=>\(/);
  assert.ok(m, 'found the Settings groups');
  const labels = [...m![1].matchAll(/l:"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(labels, ['העסק שלי', 'הדף שלי', 'יומן ושירותים', 'תשלומים', 'הודעות', 'לקוחות ופניות', 'חיבורים', 'מתקדם']);
  const body = HELP_SECTIONS.find((x) => x.key === 'settings')!.body.join('\n');
  for (const l of labels) assert.ok(body.includes(`**${l}**`), `help names ${l}`);
  const all = HELP_SECTIONS.map((x) => x.body.join('\n')).join('\n');
  for (const old of ['**כללי**', '**מיתוג**', '**אוטומציות**', '**העמוד שלי**', 'הגדרות → כללי']) assert.ok(!all.includes(old), `no old tab name ${old}`);
  noEmDash(body, 'settings help');
});

console.log(`test-followups-grow-copy: ${n} passed`);

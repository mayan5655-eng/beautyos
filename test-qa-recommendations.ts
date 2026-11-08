// Recommendations from the first-customer QA pass (2026-11-08), implemented on fix/qa-recommendations. One check per finding:
// pure functions where the rule lives in lib/, source checks where it is wiring, so a later edit cannot quietly undo one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore: plain .js module
import { parseImportGrid, buildImportRows } from './lib/importMapping.js';
// @ts-ignore: plain .js module
import { loyaltyConfig, loyaltyState, rewardGivenOn, freeVisitExample, LOYALTY_MIN, LOYALTY_MAX } from './lib/loyalty.js';
import { bookedAppointmentColor, hexOrNull, DEFAULT_SERVICE_COLOR } from './lib/serviceColors.ts';
import { cancelLinesHe, hoursHe, resolveBookingRules } from './lib/bookingPolicy.ts';
import { splitVoucherCodes, voucherRedeemNote } from './lib/giftVouchers.ts';

const rd = (p: string) => readFileSync(p, 'utf8');
const app = rd('app/beautyos.jsx');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const noEmDash = (s: string, what: string) => assert.ok(!s.includes('—'), `em dash in ${what}: ${s}`);

// ── 1. client import: a "name" that is one of her treatments ───────────────
ok('client import: a row whose name is one of her treatments is skipped and counted, like the appointments import', () => {
  const grid = parseImportGrid('שם\tטלפון\nרונית כהן\t0501234567\nעיצוב גבות\t0527654321\n  טיפול פנים  \t0541112222');
  const known = new Set(['עיצוב גבות', 'טיפול פנים']);
  const r = buildImportRows(grid, ['name', 'phone'], true, known);
  assert.deepEqual(r.rows.map((x: any) => x.name), ['רונית כהן']);
  assert.equal(r.nameIsService, 2);
  assert.deepEqual(r.nameIsServiceSamples, ['עיצוב גבות', 'טיפול פנים']);
  // without the set (vcard, older callers) nothing changes
  const plain = buildImportRows(grid, ['name', 'phone'], true);
  assert.equal(plain.rows.length, 3);
  assert.equal(plain.nameIsService, 0);
});

ok('client import: the app passes her treatment names to both the preview and the write', () => {
  assert.match(app, /: \(\(g,c,h\)=>buildImportRows\(g,c,h,knownServiceNames\)\);/);
  assert.match(app, /const \{ rows, noName, nameIsService \} = buildImportRows\(grid, importCols, importHasHeader, knownServiceNames\);/);
  assert.match(app, /setImportResult\(\{ added: inserted\.length, dupes, noName, nameIsService, failed,/);
});

// ── 2. /<slug>/gift before the vouchers migration ──────────────────────────
ok('gift page: a real business without the voucher tables says vouchers are not available yet, not "no business here"', () => {
  const g = rd('app/[slug]/gift/page.tsx');
  const at = g.indexOf("if (!shop.visible && shop.reason === 'no-migration') return <VouchersNotYet");
  assert.ok(at > 0, 'the no-migration branch renders its own page');
  assert.ok(at < g.indexOf('if (!shop.visible) notFound();'), 'and it comes before the 404');
  assert.match(g, /שוברי מתנה עדיין לא זמינים כאן/);
  assert.match(g, /<PublicPage primary=\{b\.primary\}/, 'her page, her colour');
  noEmDash(g.slice(g.indexOf('function VouchersNotYet')), 'the gift not-yet page');
});

// ── 3. publicly booked appointments store a real colour ────────────────────
ok('booking colour: the service colour, else a hex the page sent, else her primary, never "var(--pc)"', () => {
  assert.equal(bookedAppointmentColor('#A7C4F4', '#111111', '#222222'), '#A7C4F4');
  assert.equal(bookedAppointmentColor(null, 'var(--pc)', '#C9A24B'), '#C9A24B');
  assert.equal(bookedAppointmentColor('', '#E9A9A1', '#C9A24B'), '#E9A9A1');
  assert.equal(bookedAppointmentColor(undefined, 'var(--pc)', null), DEFAULT_SERVICE_COLOR);
  assert.equal(hexOrNull('var(--pc)'), null);
  assert.equal(hexOrNull(' #abc '), '#abc');
});

ok('booking colour: the page sends her hex and the route stores through bookedAppointmentColor with her primary_color', () => {
  const page = rd('app/BookingPage.jsx');
  assert.match(page, /color: selectedService\.color \|\| accent,/);
  assert.doesNotMatch(page, /color: selectedService\.color \|\| pc,/);
  const route = rd('app/api/book-appointment/route.js');
  assert.match(route, /const svcColor = bookedAppointmentColor\(svcRow\.color, color, settingsRows && settingsRows\[0\] \? settingsRows\[0\]\.primary_color : null\);/);
  assert.match(route, /therapist_name, primary_color, branding, automations"\)/);
});

// ── 4. the confirmation's cancel promise matches her window ────────────────
ok('confirmation copy: one tap only without a window; with a window it says until when, and who to contact after', () => {
  const none = cancelLinesHe(resolveBookingRules({}));
  assert.match(none.before, /אפשר לבטל בלחיצה אחת/);
  assert.equal(none.after, null);
  const w = cancelLinesHe(resolveBookingRules({ booking_rules: { cancel_window_hours: 24 } }), { businessName: 'סטודיו נועה' });
  assert.doesNotMatch(w.before, /בלחיצה אחת/);
  assert.match(w.before, /עד 24 שעות לפני התור:$/);
  assert.equal(w.after, 'פחות מ-24 שעות לפני התור, ביטול רק ישירות מול סטודיו נועה.');
  const policy = cancelLinesHe(resolveBookingRules({ booking_rules: { cancel_window_hours: 24 } }), { underPolicy: true });
  assert.doesNotMatch(policy.before, /בלחיצה אחת|עד 24/);
  assert.match(policy.before, /לפי תנאי הביטול שאישרת/);
  assert.equal(hoursHe(1), 'שעה'); assert.equal(hoursHe(2), 'שעתיים'); assert.equal(hoursHe(48), '48 שעות');
  for (const c of [none, w, policy]) { noEmDash(c.before, 'cancel line'); if (c.after) noEmDash(c.after, 'cancel line'); }
});

ok('confirmation copy: bookingNotify uses cancelLinesHe, and the Grow paths say the booking is under her policy', () => {
  const b = rd('lib/bookingNotify.js');
  assert.match(b, /cancelLinesHe\(resolveBookingRules\(brandJson\), \{ underPolicy: p\.underCancelPolicy === true, businessName \}\)/);
  assert.match(b, /cancelCopy\.before,\n\s+cancelUrl,\n\s+cancelCopy\.after,/);
  assert.doesNotMatch(b, /"מתרגשות לראות אותך! אם משהו משתנה, אפשר לבטל בלחיצה אחת/);
  assert.match(rd('app/api/book-appointment/route.js'), /underCancelPolicy: !!policy,/);
  assert.match(rd('app/api/grow/_cancel.ts'), /underCancelPolicy: true,/);
});

// ── 5. voiding a sale that redeemed a loyalty reward ───────────────────────
ok('loyalty: voiding the reward sale gives the reward back (till mark or Grow table row), and the till says so', () => {
  const cfg = loyaltyConfig({ automations: { loyalty: { enabled: true, every: 5 } } });
  const day = (d: number) => new Date(Date.UTC(2026, 9, d, 9)).toISOString();
  const rc = (id: string, d: number, extra: Record<string, unknown> = {}) => ({ id, client_id: 'c1', service: 'טיפול פנים', amount: 200, payment_method: 'מזומן', created_at: day(d), ...extra });
  const five = [1, 2, 3, 4, 5].map((d) => rc(`v${d}`, d));
  const marked = rc('rw', 6, { amount: 0, items: JSON.stringify([{ name: 'טיפול פנים', price: 200, qty: 1 }, { name: '🎁 הטיפול השישי במתנה', price: 0, qty: 1, loyalty_reward: true, loyalty_text: 'הטיפול השישי במתנה', loyalty_every: 5 }]) });
  const st = (receipts: any[], o: any = {}) => loyaltyState({ config: cfg, clientId: 'c1', receipts, voids: o.voids, redemptions: o.redemptions, serviceNames: ['טיפול פנים'], now: Date.parse(day(20)) });
  assert.equal(st([...five, marked]).ready, false, 'used');
  assert.equal(st([...five, marked], { voids: [{ receipt_id: 'rw' }] }).ready, true, 'voided: ready again');
  const grow = rc('g1', 6, { amount: 100 });
  const red = [{ client_id: 'c1', receipt_id: 'g1', created_at: grow.created_at, stamps_used: 5 }];
  assert.equal(st([...five, grow], { redemptions: red, voids: [{ receipt_id: 'g1' }] }).ready, true);
  // what the till uses to say it
  assert.equal(rewardGivenOn(marked, []), true);
  assert.equal(rewardGivenOn(grow, red), true);
  assert.equal(rewardGivenOn(five[0], red), false);
  const v = app.indexOf('const handleVoidReceipt = async (receipt) => {');
  const body = app.slice(v, v + 6000);
  assert.match(body, /const rewardBack = loyaltyCfg\.enabled && rewardGivenOn\(receipt, loyaltyDb\.redemptions\) \? "\. המתנה חזרה לכרטיסיית הנאמנות של הלקוחה" : "";/);
  assert.match(body, /\+ \(voucherBack > 0 \? `\. ₪\$\{voucherBack\} חזרו לשובר המתנה` : ""\) \+ rewardBack\);/);
});

// ── 6. the loyalty example follows "every N" ───────────────────────────────
ok('loyalty example: names visit N+1 for every N, in words up to ten and as a number above', () => {
  assert.equal(freeVisitExample(5), 'הטיפול השישי במתנה');
  assert.equal(freeVisitExample(9), 'הטיפול העשירי במתנה');
  assert.equal(freeVisitExample(10), 'הטיפול ה-11 במתנה');
  assert.equal(freeVisitExample(12), 'הטיפול ה-13 במתנה');
  for (let k = LOYALTY_MIN; k <= LOYALTY_MAX; k++) noEmDash(freeVisitExample(k), 'loyalty example');
  const s = rd('app/LoyaltySettings.jsx');
  assert.match(s, /const examples = \[freeVisitExample\(cfg\.every\), \.\.\.OTHER_EXAMPLES\];/);
  assert.match(s, /placeholder=\{`למשל: \$\{examples\[0\]\}`\}/);
  assert.doesNotMatch(s, /'הטיפול העשירי במתנה', '50%/, 'the fixed example list is gone');
});

// ── 7. the empty weekly digest ─────────────────────────────────────────────
ok('weekly digest, nothing to sum up: true for a new business and for one with two quiet weeks', () => {
  const d = rd('app/dashboard/digest/DigestScreen.tsx');
  assert.doesNotMatch(d, /כשיהיו תורים ותשלומים ביומן/);
  assert.match(d, /בשבועיים האחרונים לא נרשמו ביקורים או תשלומים, אז אין מספרים להשוות\. הסיכום מתעדכן כאן כל יום ראשון\./);
});

// ── 8. the voucher code on the payment confirmation ────────────────────────
ok('payment confirmation: a voucher code in the note is its own LTR, no-wrap piece', () => {
  const note = ['הגיעה באיחור', voucherRedeemNote('K7M4X9Q2', 120)].join(' · ');
  const segs = splitVoucherCodes(note);
  assert.deepEqual(segs.filter((s) => s.code).map((s) => s.text), ['K7M4-X9Q2']);
  assert.equal(segs.map((s) => s.text).join(''), note, 'nothing lost or reordered');
  assert.deepEqual(splitVoucherCodes('בלי קוד'), [{ text: 'בלי קוד', code: false }]);
  assert.deepEqual(splitVoucherCodes(''), []);
  assert.match(app, /splitVoucherCodes\(showReceipt\.note\)\.map\(\(seg,i\)=>seg\.code\?<bdi key=\{i\} dir="ltr" style=\{\{whiteSpace:"nowrap"\}\}>/);
  assert.match(app, /seg\.code \? `<bdi dir="ltr" style="white-space:nowrap">\$\{esc\(seg\.text\)\}<\/bdi>` : esc\(seg\.text\)/);
  // the printed copy shows the same method as the screen
  assert.match(app, /\["אמצעי תשלום", esc\(receiptMethodLabel\(receipt\)\)\],/);
});

{
  // The services import has no "name is a service" skip; its result must not reference the clients-only variable.
  const appSrc = readFileSync('app/beautyos.jsx', 'utf8');
  const svcIdx = appSrc.indexOf('supabase.from("service_prices").insert(chunk)');
  assert.ok(svcIdx > 0);
  assert.match(appSrc.slice(svcIdx, svcIdx + 600), /setImportResult\(\{ added: inserted\.length, dupes, noName, nameIsService: 0, failed,/);
  console.log('ok - services import result does not reference the clients-only nameIsService');
}

console.log(`\n${n} checks passed`);

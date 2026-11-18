// Round 3 of the audit (2026-11-18): what a salon's CLIENT meets. Pinned so it cannot quietly come back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewerName } from './lib/personName.js';
import { isNailsOnly } from './lib/googleKit.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const raw = (f: string) => (fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string).replace(/\r\n/g, '\n');

ok('a deposit paid for a booking that is gone is refunded, not confirmed', () => {
  const f = raw('lib/grow/cancelFees.ts');
  assert.ok(f.includes('const confirmed = await d.repo.confirmAppointment(i.tenantId, i.appointmentId);'));
  assert.ok(/if \(!confirmed\) \{[\s\S]{0,900}doRefund\(d, i\.tenantId, item, dep\)/.test(f));
});

ok('waitlist: a freed-again slot releases old claims, and holidays are quiet', () => {
  const w = raw('lib/waitlistOffers.js');
  assert.ok(w.indexOf('.eq("status", "claimed")') > w.indexOf('if (!free) return done("slot_taken");'));
  assert.ok(w.includes('offerQuietReason(now, { isYomTov })'));
});

ok('the claim page never says "yours" for a booking that failed', () => {
  assert.ok(raw('app/api/claim/route.ts').includes('update({ status: "sent" }).eq("token", token).eq("status", "claimed")'));
});

ok('the reminder leaves out links her window would refuse', () => {
  const r = raw('lib/reminders/dailyReminders.js');
  assert.ok(r.includes('const lateForLinks = windowHours > 0 && isInsideCancelWindow('));
  assert.ok(r.includes('lateForLinks ? null : moveLine(moveLink, brandJson)'));
});

ok('after a move: a manage link for the new date', () => {
  assert.ok(raw('app/api/confirm/reschedule/route.ts').includes('manageUrl: confirmLinks(APP_URL, String(id), { date }).cancelUrl'));
  assert.ok(raw('app/confirm/RescheduleFlow.jsx').includes('data-testid="reschedule-manage"'));
});

ok('reviews: first name and an initial, as the review page promises', () => {
  assert.equal(reviewerName('מאיה פרץ'), 'מאיה פ.');
  assert.equal(reviewerName('דנה לוי בן-עמי'), 'דנה ב.');
  assert.equal(reviewerName('נועה'), 'נועה');
  assert.equal(reviewerName('maya.cohen'), '');
  assert.ok(raw('app/api/reviews/route.js').includes('client_name: reviewerName(appt.name || "")'));
  assert.ok(raw('app/BookingPage.jsx').includes('name: reviewerName(r.client_name)'));
  assert.ok(raw('app/PublicLandingPage.tsx').includes('{reviewerName(r.client_name)}'));
});

ok('booking page: posts older than 30 days are not shown; follow label; selected time announced', () => {
  const b = raw('app/BookingPage.jsx');
  assert.ok(b.includes('const POST_MAX_AGE_MS = 30 * 86_400_000;'));
  assert.ok(b.includes('tr("עקבי אחריי")') && !b.includes('"עקבו אחרינו"'));
  assert.ok(b.includes('aria-pressed={isSel} onClick={() => { setSelectedStart(h);'));
});

ok('gift page: her business name and her share preview', () => {
  const g = raw('app/[slug]/gift/page.tsx');
  assert.ok(g.includes("const name = String(brand?.businessName || t?.name || '').trim();"));
  assert.ok(g.includes('openGraph: {') && g.includes('/og/${encodeURIComponent(slug)}'));
});

ok('Google: a "nails" field with facials on the menu is not a nail salon', () => {
  assert.equal(isNailsOnly(['nails'], ['טיפול פנים', 'הסרת שיער']), false);
  assert.equal(isNailsOnly(['nails'], ['לק ג׳ל']), true);
  assert.equal(isNailsOnly(['nails'], []), true);
});

console.log(`round 3 client: ${n} ok`);

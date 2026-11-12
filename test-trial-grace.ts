// test-trial-grace.ts
//
// Marketing-gaps pass (2026-11-12):
//   1. her clients' grace period after the trial ends (lib/planState publicGraceDays, lib/tenantActive tenantPublicClosed):
//      the dashboard closes on the day, her public booking page keeps taking bookings a few more days;
//   2. a payment path that does not need Grow billing (lib/planPay.ts, NEXT_PUBLIC_PLAN_PAY_URL) on the closed screen and the
//      last-week banner, hidden when not set;
//   3. the owner's trials screen lists who is inside that grace period;
//   4. "להזיז את התור" in every reminder copy and in the booking confirmation (lib/messages moveLine);
//   5. utm_content in the stored signup label; the cron's links use the one APP_URL resolver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  planState, publicGraceDays, publicGraceEndsAt, inPublicGrace, publicBookingClosedFor, PUBLIC_GRACE_DAYS_DEFAULT, PUBLIC_GRACE_DAYS_MAX,
} from './lib/planState.ts';
import { tenantPublicClosed, tenantIsBlocked } from './lib/tenantActive.ts';
import { blockedClientsNoteHe, BLOCKED_CLIENTS_NOTE_HE, trialUrgentBodyHe, TRIAL_URGENT_BODY_HE, planPayCtaHe, PLAN_PAY_HINT_HE } from './lib/planCopy.ts';
import { planPayUrl } from './lib/planPay.ts';
import { trialsInGrace } from './lib/ownerControl.ts';
import { moveLine, lines } from './lib/messages.js';
import { maxMovesFrom } from './lib/reschedule.ts';
import { signupSourceLabel } from './lib/attribution.js';
import { reminderQueueText } from './lib/waCloud/autoContent.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
const DAY = 86_400_000;
const NOW = new Date('2026-11-12T10:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString();

await ok('grace days: default 7, 0 turns it off, capped at 14, garbage is the default', () => {
  assert.equal(publicGraceDays(undefined), PUBLIC_GRACE_DAYS_DEFAULT);
  assert.equal(publicGraceDays(''), 7);
  assert.equal(publicGraceDays('0'), 0);
  assert.equal(publicGraceDays('3'), 3);
  assert.equal(publicGraceDays('99'), PUBLIC_GRACE_DAYS_MAX);
  assert.equal(publicGraceDays('-4'), 0);
  assert.equal(publicGraceDays('soon'), 7);
});

await ok('grace: only a trial that ran out, counted from its end date', () => {
  const ended2 = planState({ plan_status: 'trial', trial_ends_at: ago(2) }, NOW);
  assert.equal(ended2.isBlocked, true, 'the dashboard is closed');
  assert.equal(inPublicGrace(ended2, NOW, 7), true, 'two days after: her page still open');
  assert.equal(publicGraceEndsAt(ended2, 7)?.toISOString(), ahead(5));
  const ended8 = planState({ plan_status: 'trial', trial_ends_at: ago(8) }, NOW);
  assert.equal(inPublicGrace(ended8, NOW, 7), false, 'eight days after: closed');
  assert.equal(inPublicGrace(planState({ plan_status: 'paused', trial_ends_at: ago(1) }, NOW), NOW, 7), false, 'paused gets no grace');
  assert.equal(inPublicGrace(planState({ plan_status: 'expired', trial_ends_at: null }, NOW), NOW, 7), false, 'no end date, no grace');
  assert.equal(inPublicGrace(ended2, NOW, 0), false, 'grace off');
  assert.equal(publicGraceEndsAt(planState({ plan_status: 'trial', trial_ends_at: ahead(3) }, NOW), 7), null, 'still on trial: nothing to say');
});

await ok('public page: open on trial, active and in grace; closed after grace and when paused', () => {
  assert.equal(publicBookingClosedFor({ plan_status: 'trial', trial_ends_at: ahead(3) }, NOW, 7), false);
  assert.equal(publicBookingClosedFor({ plan_status: 'active' }, NOW, 7), false);
  assert.equal(publicBookingClosedFor({ plan_status: 'trial', trial_ends_at: ago(1) }, NOW, 7), false);
  assert.equal(publicBookingClosedFor({ plan_status: 'expired', trial_ends_at: ago(1) }, NOW, 7), false, 'a sweep that already wrote expired keeps the grace');
  assert.equal(publicBookingClosedFor({ plan_status: 'trial', trial_ends_at: ago(9) }, NOW, 7), true);
  assert.equal(publicBookingClosedFor({ plan_status: 'paused' }, NOW, 7), true);
  assert.equal(publicBookingClosedFor(null, NOW, 7), false, 'fails open');
});

await ok('tenantPublicClosed reads the row, keeps the grace, fails open', async () => {
  const reader = (r: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => r }) }) }) });
  const justEnded = { data: { plan_status: 'trial', trial_ends_at: new Date(Date.now() - DAY).toISOString() }, error: null };
  assert.equal(await tenantIsBlocked(reader(justEnded), 't'), true, 'her dashboard is closed');
  assert.equal(await tenantPublicClosed(reader(justEnded), 't'), false, 'her clients can still book');
  const longAgo = { data: { plan_status: 'trial', trial_ends_at: new Date(Date.now() - 30 * DAY).toISOString() }, error: null };
  assert.equal(await tenantPublicClosed(reader(longAgo), 't'), true);
  assert.equal(await tenantPublicClosed(reader({ data: null, error: { message: 'boom' } }), 't'), false);
});

await ok('every public booking path uses the grace-aware check; the waitlist (needs her) stays closed', () => {
  assert.match(read('lib/publicBookingGate.ts'), /tenantPublicClosed\(admin, tenantId\)/);
  assert.match(read('app/api/book-appointment/route.js'), /if \(await tenantPublicClosed\(supabase, activeTenantId\)\)/);
  assert.match(read('app/api/confirm/reschedule/route.ts'), /tenantPublicClosed\(db, tenantId\)/);
  assert.match(read('app/api/waitlist/join/route.js'), /tenantIsBlocked\(admin, tenantId\)/);
});

await ok('her closed screen: says until when clients can book; the plain note after the grace', () => {
  const end = new Date(NOW.getTime() + 5 * DAY);
  const note = blockedClientsNoteHe(end, NOW);
  assert.match(note, /עדיין פתוח ללקוחות עד \d\d\.\d\d\.\d{4}/);
  assert.match(note, /מחכים לך/);
  assert.ok(!/[–—]/.test(note), 'no dashes');
  assert.equal(blockedClientsNoteHe(null, NOW), BLOCKED_CLIENTS_NOTE_HE);
  assert.equal(blockedClientsNoteHe(new Date(NOW.getTime() - 1), NOW), BLOCKED_CLIENTS_NOTE_HE);
});

await ok('last-week banner names the grace, keeps the old body and date lead', () => {
  const end = new Date(NOW.getTime() + 3 * DAY);
  const withGrace = trialUrgentBodyHe(end, 7);
  assert.match(withGrace, /^תקופת ההתנסות מסתיימת בתאריך \d\d\.\d\d\.\d{4}\. דף ההזמנות שלך יישאר פתוח ללקוחות עוד 7 ימים אחרי זה\./);
  assert.ok(withGrace.endsWith(TRIAL_URGENT_BODY_HE));
  assert.ok(!/פתוח ללקוחות/.test(trialUrgentBodyHe(end, 0)), 'grace off: not promised');
  assert.ok(!/פתוח ללקוחות/.test(trialUrgentBodyHe(end)), 'callers that do not pass it are unchanged');
});

await ok('payment link: https only, nothing when unset', () => {
  assert.equal(planPayUrl(undefined), null);
  assert.equal(planPayUrl(''), null);
  assert.equal(planPayUrl('http://pay.example.com/x'), null, 'not https');
  assert.equal(planPayUrl('javascript:alert(1)'), null);
  assert.equal(planPayUrl('not a url'), null);
  assert.equal(planPayUrl(' https://www.bitpay.co.il/app/me/ABC '), 'https://www.bitpay.co.il/app/me/ABC');
  assert.equal(planPayCtaHe(349), 'לתשלום המנוי, 349 ₪ לחודש');
  assert.match(PLAN_PAY_HINT_HE, /וואטסאפ/);
});

await ok('closed screen and banner show the pay button only when the link is set, and only for an ended trial', () => {
  const s = read('app/PlanBlockedScreen.jsx');
  assert.match(s, /const payUrl = showPrice \? planPayUrl\(\) : null;/);
  assert.match(s, /\{payUrl \? \(\s*<a\s+href=\{payUrl\}/);
  assert.match(s, /blockedClientsNoteHe\(plan \? publicGraceEndsAt\(plan\) : null\)/);
  const b = read('app/TrialBanner.jsx');
  assert.match(b, /\{!blocked && planPayUrl\(\) && \(/);
  assert.match(b, /trialUrgentBodyHe\(plan\.trialEndsAt, publicGraceDays\(\)\)/);
});

await ok('owner trials screen: who is in the grace period, soonest first', () => {
  const rows = [
    { id: 'a', name: 'אורית', plan_status: 'trial', trial_ends_at: ago(1), created_at: ago(31) },
    { id: 'b', name: 'בתיה', plan_status: 'trial', trial_ends_at: ago(6), created_at: ago(36) },
    { id: 'c', name: 'גלית', plan_status: 'trial', trial_ends_at: ago(10), created_at: ago(40) },
    { id: 'd', name: 'דנה', plan_status: 'trial', trial_ends_at: ahead(2), created_at: ago(28) },
    { id: 'e', name: 'הדר', plan_status: 'paused', trial_ends_at: ago(1), created_at: ago(31) },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = trialsInGrace(rows as any, NOW, 7);
  assert.deepEqual(g.map((x) => x.id), ['b', 'a']);
  assert.equal(g[0].daysLeft, 1);
  assert.equal(g[1].daysLeft, 6);
  assert.match(read('app/dashboard/owner/trials/page.tsx'), /trialsInGrace\(r\.rows, now\)/);
});

await ok('moveLine: a line with the link, none without one or when she turned moving off (same reading as maxMovesFrom)', () => {
  const url = 'https://kalmea.app/confirm?id=x&action=reschedule&t=y';
  assert.equal(moveLine(url, {}), `צריך להזיז? אפשר לבחור מועד אחר כאן: ${url}`);
  assert.equal(moveLine(null, {}), null);
  for (const v of [0, '0', 0.4, -1, 1, 2, '3', 'x', null, undefined, '']) {
    const branding = { booking_rules: { max_reschedules: v } };
    assert.equal(moveLine(url, branding) === null, maxMovesFrom(branding) === 0, `max_reschedules=${String(v)}`);
  }
});

await ok('every reminder copy and the booking confirmation carry the move link', () => {
  for (const f of ['lib/reminders/dailyReminders.js', 'app/api/send-reminder-manual/route.js']) {
    const s = read(f);
    assert.match(s, /rescheduleUrl: moveLink/, f);
    assert.match(s, /moveLine\(moveLink, brandJson\),\n\s*`אם צריך לבטל, אפשר כאן: \$\{cancelLink\}`/, f);
  }
  const app = read('app/beautyos.jsx');
  assert.equal((app.match(/msgMoveLine\(links\.rescheduleUrl, /g) || []).length, 2, 'both in-app reminder copies');
  assert.match(app, /rescheduleUrl: data\.rescheduleUrl \|\| null/);
  assert.match(read('lib/bookingNotify.js'), /cancelCopy\.showLink \? moveLine\(rescheduleUrl, brandJson\) : null/);
  const text = reminderQueueText({ id: 'a', name: 'רונית', service: 'מניקור', date: '2026-11-20', start_minute: 600, duration: 60 } as never, { business_name: 'דנה', branding: {} } as never,
    { confirmUrl: 'https://k/c', cancelUrl: 'https://k/x', rescheduleUrl: 'https://k/m' });
  assert.ok(text.indexOf('https://k/m') > text.indexOf('https://k/c') && text.indexOf('https://k/m') < text.indexOf('https://k/x'), 'between confirm and cancel');
  assert.equal(lines('a', moveLine(null), 'b'), 'a\nb', 'no blank line when there is no link');
});

await ok('signup label carries utm_content; the cron uses the one APP_URL resolver', () => {
  assert.equal(signupSourceLabel({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'launch', utm_content: 'reel-3' }), 'instagram / bio / launch / reel-3');
  assert.equal(signupSourceLabel({ utm_source: 'sms', utm_content: 'wave-1' }), 'sms / wave-1');
  const cron = read('app/api/send-reminders/route.js');
  assert.match(cron, /baseUrl: APP_URL,/);
  assert.ok(!/beautyos-theta/.test(cron));
});

console.log(`\n${n} checks passed`);

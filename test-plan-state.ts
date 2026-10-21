// The end of the free trial month: what she is told, when, and what she can still do. (There was no test for lib/planState.ts or
// lib/planCopy.ts at all.) Day 31 is not a cliff: she is told the end DATE from the start, warned in the last seven days, and on expiry
// the system CLOSES (owner decision 2026-10-21, no read-only mode) - her data is kept and comes back when she renews.
import assert from 'node:assert/strict';
import { planState, TRIAL_LENGTH_DAYS, TRIAL_URGENT_DAYS } from './lib/planState.ts';
import { trialGentleHe, trialUrgentTitleHe, trialUrgentBodyHe, blockedNoticeHe, trialEndDateHe, WRITE_BLOCKED_TOAST_HE, API_BLOCKED_MESSAGE_HE, TRIAL_URGENT_BODY_HE, PRICE_LINE_HE, BLOCKED_CLIENTS_NOTE_HE, READ_ONLY_BADGE_HE, DISABLED_REASON_HE, BOOKING_CLOSED_TITLE_HE, BOOKING_CLOSED_BODY_HE } from './lib/planCopy.ts';

const DAY = 864e5;
const start = new Date('2026-10-01T09:00:00Z');
const row = (daysFromStart: number) => ({ plan_status: 'trial', trial_started_at: start.toISOString(), trial_ends_at: new Date(start.getTime() + daysFromStart * DAY).toISOString() });
const at = (d: number) => new Date(start.getTime() + d * DAY); // "now", d days after she signed up

assert.equal(TRIAL_LENGTH_DAYS, 30); assert.equal(TRIAL_URGENT_DAYS, 7);

// ── the tone across the month: quiet, then a real warning for the last seven days, then read-only ──
const tone = (d: number) => planState(row(30), at(d)).tone;
assert.equal(tone(0), 'gentle'); assert.equal(tone(10), 'gentle'); assert.equal(tone(22), 'gentle', '8 days left is still the quiet line');
assert.equal(tone(23), 'urgent', '7 days left: the warning begins');
assert.equal(tone(29), 'urgent', '1 day left');
assert.equal(tone(29.5), 'urgent', 'the last half day');
assert.equal(tone(30.01), 'blocked', 'day 31');
assert.equal(planState(row(30), at(23)).daysRemaining, 7); assert.equal(planState(row(30), at(29)).daysRemaining, 1);

// ── on expiry: blocked, the system closes, and nothing is said to be deleted ──
const expired = planState(row(30), at(31));
assert.equal(expired.status, 'expired'); assert.equal(expired.isBlocked, true); assert.equal(expired.rawStatus, 'trial', 'an elapsed trial needs no cron sweep');
const notice = blockedNoticeHe(expired.status, expired.trialEndsAt);
assert.ok(/הסתיימה/.test(notice.title) && /המערכת סגורה עד לחידוש המנוי/.test(notice.body), 'it says what state she is in: closed until renewal');
assert.ok(/שמורים במלואם/.test(notice.body) && /היומן, הלקוחות/.test(notice.body) && /יחזרו/.test(notice.body), 'her data is kept and comes back');
// No surface may still promise read access: the owner closed the system completely.
for (const t of [notice.body, blockedNoticeHe('paused').body, WRITE_BLOCKED_TOAST_HE, API_BLOCKED_MESSAGE_HE, READ_ONLY_BADGE_HE, DISABLED_REASON_HE, TRIAL_URGENT_BODY_HE, BLOCKED_CLIENTS_NOTE_HE]) {
  assert.ok(!/(צפייה בלבד|קריאה בלבד|לצפות|ממשיכה לראות|להמשיך לראות)/.test(t), `no read-only promise: ${t}`);
}
assert.match(BLOCKED_CLIENTS_NOTE_HE, /תזכורות/, 'booked clients keep their reminders'); assert.match(BLOCKED_CLIENTS_NOTE_HE, /לא מקבל תורים חדשים/, 'the booking page takes no new bookings');
// The price: intro 349 "for a limited time", no date (owner 2026-10-21), against 499, in the urgent warning (it used to quote 499 only).
assert.ok(PRICE_LINE_HE.startsWith('מחיר היכרות 349 ₪ לזמן מוגבל'), PRICE_LINE_HE);
assert.ok(!/\d\d\.\d\d\.\d{4}/.test(PRICE_LINE_HE), 'no date on the intro price');
assert.ok(TRIAL_URGENT_BODY_HE.includes(PRICE_LINE_HE) && /499 ₪/.test(PRICE_LINE_HE), 'the urgent body quotes 349 and 499');
assert.ok(/נסגרת/.test(TRIAL_URGENT_BODY_HE), 'the warning says the system closes at the end');
// Her client's view of a closed booking page says nothing about billing.
for (const t of [BOOKING_CLOSED_TITLE_HE, BOOKING_CLOSED_BODY_HE]) assert.ok(!/(מנוי|תשלום|קלמיה|Kalmea|התנסות)/.test(t), 'no billing word on her public page');
for (const t of [notice.title, notice.body, WRITE_BLOCKED_TOAST_HE, API_BLOCKED_MESSAGE_HE, TRIAL_URGENT_BODY_HE, BLOCKED_CLIENTS_NOTE_HE, blockedNoticeHe('paused').body]) {
  assert.ok(!/(נמחק|ימחק|יימחק|נמחקו|תימחק|הושמד|אבד|אובד)/.test(t), 'never claims or hints that anything is deleted');
  assert.ok(!/[—–]/.test(t), 'house rule: no em or en dashes');
}

// ── the end DATE is visible, in her calendar ──
assert.equal(trialEndDateHe(new Date('2026-10-30T20:21:54Z')), '30.10.2026');
assert.equal(trialEndDateHe(new Date('2026-10-30T22:30:00Z')), '31.10.2026', "Israel's date, not UTC's: 22:30Z is already the next day in Israel");
assert.equal(trialEndDateHe(null), ''); assert.equal(trialEndDateHe(new Date('nonsense')), '');
const mid = planState(row(30), at(10));
assert.match(trialGentleHe(mid.daysRemaining!, mid.trialEndsAt), /נשארו עוד 20 ימים, עד 31\.10\.2026|נשארו עוד 20 ימים, עד 30\.10\.2026/, 'the quiet line carries the date');
assert.equal(trialGentleHe(5), 'תקופת ההתנסות שלך פעילה, נשארו עוד 5 ימים', 'without a date the line is as before');
const urgent = planState(row(30), at(24));
assert.match(trialUrgentBodyHe(urgent.trialEndsAt), /^תקופת ההתנסות מסתיימת בתאריך \d\d\.\d\d\.\d{4}\./, 'the warning leads with the date');
assert.ok(trialUrgentBodyHe(urgent.trialEndsAt).endsWith(TRIAL_URGENT_BODY_HE), 'and keeps the reassurance');
assert.equal(trialUrgentBodyHe(null), TRIAL_URGENT_BODY_HE);
assert.match(blockedNoticeHe('expired', new Date('2026-10-30T20:00:00Z')).body, /^ההתנסות הסתיימה בתאריך 30\.10\.2026\./, 'the expired notice says when it ended');
assert.equal(blockedNoticeHe('paused').title, 'החשבון בהשהיה');
assert.ok(!/בתאריך/.test(blockedNoticeHe('paused', new Date()).body), 'a paused account is an arrangement: no trial date');

// ── one day, and two, and the Hebrew dual ──
assert.equal(trialUrgentTitleHe(1), 'תקופת ההתנסות מסתיימת בקרוב'); assert.equal(trialUrgentTitleHe(2), 'תקופת ההתנסות מסתיימת בעוד יומיים'); assert.equal(trialUrgentTitleHe(7), 'תקופת ההתנסות מסתיימת בעוד 7 ימים');

// ── things that must NOT nag or block ──
assert.equal(planState({ plan_status: 'active', trial_ends_at: '2020-01-01T00:00:00Z' }, at(0)).tone, 'none', 'a paying tenant is never nagged, whatever the old trial date says');
assert.equal(planState(null, at(0)).tone, 'none', 'an unreadable row fails open');
assert.equal(planState({ plan_status: 'trial', trial_ends_at: null }, at(0)).tone, 'none', 'a trial with no end date shows nothing rather than a made-up one');
assert.equal(planState({ plan_status: 'paused' }, at(0)).isBlocked, true);

console.log('plan state: ok');

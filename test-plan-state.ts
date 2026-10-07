// The end of the free trial month: what she is told, when, and what she can still do. (There was no test for lib/planState.ts or
// lib/planCopy.ts at all.) Day 31 is not a cliff: she is told the end DATE from the start, warned in the last seven days, and on expiry
// the account becomes READ-ONLY - her data stays and stays readable.
import assert from 'node:assert/strict';
import { planState, TRIAL_LENGTH_DAYS, TRIAL_URGENT_DAYS } from './lib/planState.ts';
import { trialGentleHe, trialUrgentTitleHe, trialUrgentBodyHe, blockedNoticeHe, trialEndDateHe, WRITE_BLOCKED_TOAST_HE, API_BLOCKED_MESSAGE_HE, TRIAL_URGENT_BODY_HE } from './lib/planCopy.ts';

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

// ── on expiry: blocked, read-only, and nothing is said to be deleted ──
const expired = planState(row(30), at(31));
assert.equal(expired.status, 'expired'); assert.equal(expired.isBlocked, true); assert.equal(expired.rawStatus, 'trial', 'an elapsed trial needs no cron sweep');
const notice = blockedNoticeHe(expired.status, expired.trialEndsAt);
assert.ok(/הסתיימה/.test(notice.title) && /צפייה בלבד/.test(notice.body), 'it says what state she is in');
assert.ok(/שמורים במלואם/.test(notice.body) && /היומן והלקוחות/.test(notice.body), 'her data is kept, and she can still read her calendar and clients');
for (const t of [notice.title, notice.body, WRITE_BLOCKED_TOAST_HE, API_BLOCKED_MESSAGE_HE]) {
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

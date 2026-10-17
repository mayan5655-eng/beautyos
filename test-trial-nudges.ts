// In-app trial nudges (day 1, 10 and 23): which one shows when, to whom, and what it says.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trialDayNumber, pickTrialNudge, nudgeCopy, nudgeStorageKey, NUDGE_DAYS } from './lib/trialNudges.ts';

const start = '2026-10-01T08:00:00Z'; // 11:00 in Israel, 1 October
const at = (iso: string) => new Date(iso);

// day numbering follows the Israel calendar
assert.equal(trialDayNumber(start, at('2026-10-01T09:00:00Z')), 1);
assert.equal(trialDayNumber(start, at('2026-10-02T09:00:00Z')), 2);
assert.equal(trialDayNumber('2026-10-01T20:30:00Z', at('2026-10-01T21:30:00Z')), 2, '23:30 then 00:30 Israel time (UTC+3) are two different days, one hour apart');
assert.equal(trialDayNumber(null), null);
assert.equal(trialDayNumber('not a date'), null);

// the three nudges, two days each
const day = (n: number) => at(`2026-10-${String(n).padStart(2, '0')}T09:00:00Z`);
const key = (n: number, status = 'trial') => pickTrialNudge({ status, trialStartedAt: start, now: day(n) })?.key ?? null;
assert.equal(key(1), 'day1');
assert.equal(key(2), 'day1');
assert.equal(key(3), null);
assert.equal(key(9), null);
assert.equal(key(10), 'day10');
assert.equal(key(11), 'day10');
assert.equal(key(12), null);
assert.equal(key(22), null);
assert.equal(key(23), 'day23');
assert.equal(key(24), 'day23');
assert.equal(key(25), null);
assert.deepEqual(NUDGE_DAYS.map((n) => n.day), [1, 10, 23]);

// never to a paying, blocked or undated tenant
for (const s of ['active', 'expired', 'paused', null, undefined, '']) assert.equal(pickTrialNudge({ status: s as string, trialStartedAt: start, now: day(1) }), null, String(s));
assert.equal(pickTrialNudge({ status: 'trial', trialStartedAt: null, now: day(1) }), null, 'no start date, no nudge');

// copy: warm, feminine, no em dash, the price only where it belongs, counts handled
const c1 = nudgeCopy('day1', { appointments: 0, clients: 0 });
const c10 = nudgeCopy('day10', { appointments: 1, clients: 12 });
const c10zero = nudgeCopy('day10', { appointments: 0, clients: 0 });
const c23 = nudgeCopy('day23', { appointments: 14, clients: 1 });
for (const c of [c1, c10, c10zero, c23]) {
  assert.ok(!/[—–]/.test(c.title + c.body), 'no em or en dash');
  assert.ok(c.title.length > 0 && c.body.length > 0 && c.actionLabel.length > 0);
  assert.ok(!/undefined|NaN|null/.test(c.title + c.body), 'no leaked placeholders');
}
assert.equal(c1.action, 'copy_link');
assert.equal(c10.action, 'open_cashier');
assert.equal(c23.action, 'contact');
assert.ok(c10.body.includes('תור אחד ביומן') && c10.body.includes('12 לקוחות'));
assert.ok(c10zero.body.includes('עוד אין תורים ביומן') && c10zero.body.includes('עוד אין לקוחות'));
assert.ok(c23.body.includes('14 תורים') && c23.body.includes('לקוחה אחת') && c23.body.includes('499'));
assert.ok(!c1.body.includes('499') && !c10.body.includes('499'), 'the price appears only on day 23');
assert.equal(nudgeStorageKey('t1', 'day10'), 'kalmea_nudge_t1_day10');
assert.notEqual(nudgeStorageKey('t1', 'day1'), nudgeStorageKey('t2', 'day1'));

// it is wired in, and it is in-app only
const dash = fs.readFileSync('app/beautyos.jsx', 'utf8');
assert.ok(dash.includes('<TrialNudge'), 'the dashboard renders the nudge card');
const comp = fs.readFileSync('app/TrialNudge.jsx', 'utf8');
assert.ok(!/sendWhatsApp|fetch\(|api\/send|mailto:/.test(comp), 'the nudge sends nothing: no WhatsApp, no email, no request');

console.log('trial nudges: ok');

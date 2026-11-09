// test-reschedule.ts
//
// "להזיז את התור": the client moves her own appointment from her link (lib/reschedule.ts, app/api/confirm/reschedule,
// app/confirm/page.jsx + RescheduleFlow.jsx). Pure rules with node alone, and the route's guards read from its source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rescheduleDays, moveSlotProblem, maxMovesFrom, cleanMoveCount, movesUsedHe, ownerMoveMessage, addDays,
  MAX_MOVES_DEFAULT, MOVE_HELD_HE, RESCHEDULE_COPY,
} from './lib/reschedule.ts';
import { clientLinkRefusal, resolveBookingRules } from './lib/bookingPolicy.ts';
import { signConfirm, verifyConfirm, confirmLinks } from './lib/confirmToken.ts';

let passed = 0, failed = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error('FAIL', name, '\n ', e instanceof Error ? e.message : e); }
};
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// Tuesday 2026-11-10, 10:00 in Israel (08:00Z).
const NOW = new Date('2026-11-10T08:00:00Z');
const HOURS = { business_hours: { 0: { open: 9, close: 18 }, 1: { open: 9, close: 18 }, 2: { open: 9, close: 18 }, 3: { open: 9, close: 18 }, 4: { open: 9, close: 18 }, 5: { open: 9, close: 13 }, 6: null } };
const RULES = { minLeadMinutes: 120, maxDaysAhead: 21 };
const base = { hours: HOURS, rules: RULES, duration: 60, buffer: 0, lunch: null, busyByDate: {}, now: NOW };

ok('slots: today starts after her notice, Saturday is closed, Friday ends early, 14 open days', () => {
  const days = rescheduleDays(base);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, '2026-11-10');
  assert.equal(days[0].slots[0], 12 * 60, 'two hours of notice from 10:00');
  assert.equal(days[0].slots.at(-1), 17 * 60, 'a 60 minute treatment ends by 18:00');
  assert.ok(!days.some((d) => d.date === '2026-11-14'), 'Saturday is closed');
  const fri = days.find((d) => d.date === '2026-11-13')!;
  assert.equal(fri.slots.at(-1), 12 * 60, 'Friday closes at 13:00');
});

ok('slots: busy time (buffers already in), her break and the treatment buffer are respected', () => {
  const days = rescheduleDays({ ...base, buffer: 15, lunch: { startMinute: 13 * 60, minutes: 30 }, busyByDate: { '2026-11-11': [[10 * 60, 11 * 60 + 10]] } });
  const wed = days.find((d) => d.date === '2026-11-11')!.slots;
  assert.ok(!wed.includes(9 * 60 + 30), '09:30+60+15 runs into 10:00');
  assert.ok(!wed.includes(10 * 60 + 30) && !wed.includes(11 * 60), 'inside the busy range');
  assert.ok(wed.includes(11 * 60 + 30), 'after it');
  assert.ok(!wed.includes(12 * 60), '12:00+60+15 runs into her break');
  assert.ok(!wed.includes(13 * 60), 'the break itself');
  assert.ok(wed.includes(13 * 60 + 30));
});

ok('slots: the appointment does not block itself, and its own time is not offered', () => {
  const days = rescheduleDays({ ...base, skip: { date: '2026-11-11', start: 10 * 60 } });
  const wed = days.find((d) => d.date === '2026-11-11')!.slots;
  assert.ok(!wed.includes(10 * 60), 'moving to where it is changes nothing');
  assert.ok(wed.includes(10 * 60 + 30), 'half an hour later inside its own old time is free');
});

ok('slots: her "how far ahead" caps the list', () => {
  const days = rescheduleDays({ ...base, rules: { minLeadMinutes: 120, maxDaysAhead: 3 } });
  assert.ok(days.every((d) => d.date <= addDays('2026-11-10', 3)));
});

ok('moveSlotProblem: the same refusals the booking route makes', () => {
  const p = (date: string, start: number, extra = {}) => moveSlotProblem({ ...base, ...extra, date, start });
  assert.equal(p('2026-11-11', 10 * 60), null);
  assert.equal(p('2026-11-10', 11 * 60), 'too_soon');
  assert.equal(p('2026-11-10', 8 * 60), 'too_soon', 'already past');
  assert.equal(p('2026-12-20', 10 * 60), 'too_far');
  assert.equal(p('2026-11-14', 10 * 60), 'closed');
  assert.equal(p('2026-11-11', 17 * 60 + 30), 'hours');
  assert.equal(p('2026-11-11', 8 * 60), 'hours');
  assert.equal(p('2026-11-11', 10 * 60, { busyByDate: { '2026-11-11': [[10 * 60 + 30, 11 * 60]] } }), 'taken');
  assert.equal(p('2026-02-30', 10 * 60), 'bad');
  assert.equal(p('2026-11-11', 10 * 60 + 3), 'bad');
  assert.equal(p('2026-11-11', Number.NaN), 'bad');
});

ok('move limit: default 2, her own number 0..5, counts are clean', () => {
  assert.equal(MAX_MOVES_DEFAULT, 2);
  assert.equal(maxMovesFrom(null), 2);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 0 } }), 0);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 9 } }), 5);
  assert.equal(maxMovesFrom({ booking_rules: { max_reschedules: 'x' } }), 2);
  assert.equal(cleanMoveCount(null), 0);
  assert.equal(cleanMoveCount(-3), 0);
  assert.equal(cleanMoveCount(2), 2);
  assert.match(movesUsedHe(2, 'סטודיו רונה'), /כבר הזזת פעמיים/);
  assert.match(movesUsedHe(2, 'סטודיו רונה'), /ליצור קשר ישירות עם סטודיו רונה/);
});

ok('policy window: moving inside it is refused with the cancel wording plus "contact the business"', () => {
  const rules = resolveBookingRules({ booking_rules: { cancel_window_hours: 24 } });
  const input = { action: 'reschedule', status: 'confirmed', date: '2026-11-10', startMinute: 20 * 60, cancelWindowHours: rules.cancelWindowHours, businessName: 'רונה' };
  const r = clientLinkRefusal(input, NOW);
  assert.equal(r?.code, 'window');
  assert.equal(r?.tooLate, true);
  assert.match(r!.error, /עד 24 שעות לפני התור, כמו בביטול/);
  assert.match(r!.error, /ליצור קשר ישירות עם רונה/);
  assert.equal(clientLinkRefusal({ ...input, underPolicy: true }, NOW)?.code, 'window', 'a fee policy does not lift it for a move');
  assert.equal(clientLinkRefusal({ ...input, date: '2026-11-13' }, NOW), null, 'outside the window it moves');
  assert.equal(clientLinkRefusal({ ...input, cancelWindowHours: 0 }, NOW), null, 'no window');
  assert.equal(clientLinkRefusal({ ...input, status: 'completed' }, NOW)?.code, 'changed');
  // The cancel rule is unchanged.
  assert.match(clientLinkRefusal({ ...input, action: 'cancel' }, NOW)!.error, /^אפשר לבטל דרך הקישור/);
});

ok('tokens: a reschedule link is its own action; a confirm token cannot move, a reschedule token cannot cancel', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const links = confirmLinks('https://x', id, { date: '2026-11-11', nowMs: NOW.getTime() });
  const t = new URL(links.rescheduleUrl).searchParams.get('t') || '';
  assert.equal(new URL(links.rescheduleUrl).searchParams.get('action'), 'reschedule');
  assert.equal(verifyConfirm(id, 'reschedule', t, NOW.getTime()), true);
  assert.equal(verifyConfirm(id, 'cancel', t, NOW.getTime()), false);
  assert.equal(verifyConfirm(id, 'confirm', t, NOW.getTime()), false);
  assert.equal(verifyConfirm(id, 'reschedule', signConfirm(id, 'confirm', NOW.getTime() + 86_400_000), NOW.getTime()), false);
});

ok('routes: /api/confirm never treats a reschedule token as a cancel; the move route accepts only reschedule or cancel tokens', () => {
  const confirm = read('./app/api/confirm/route.ts');
  assert.ok(confirm.indexOf("if (action !== 'confirm' && action !== 'cancel') return reject();") > -1);
  assert.ok(confirm.indexOf("if (action !== 'confirm' && action !== 'cancel') return reject();") < confirm.indexOf('verifyConfirm(appointmentId'));
  const r = read('./app/api/confirm/reschedule/route.ts');
  assert.ok(r.includes("if (via !== 'reschedule' && via !== 'cancel') return reject();"));
  assert.ok(r.indexOf('verifyConfirm(id, via, token)') < r.indexOf(".from('appointments')"), 'signature before the database');
  assert.ok(r.includes("checkIpLimit(request, 'reschedule')") && r.includes("checkTenantLimit(tenantId, 'reschedule')"), 'rate-limited');
  assert.ok(!/export async function GET\(\)[^}]*update/.test(r), 'no GET side effect');
});

ok('route: atomic single-row move, guarded like the booking route, deposit carried by keeping the row', () => {
  const r = read('./app/api/confirm/reschedule/route.ts');
  const move = r.slice(r.indexOf('// ── The move'));
  assert.ok(move.includes(".update(p).eq('id', id).eq('tenant_id', tenantId).eq('date', oldDate).in('confirmation_status', LIVE)"), 'one update, tenant-scoped, on the old date');
  assert.ok(move.includes("u.eq('start_minute', appt.start_minute)"), 'and the old start');
  assert.ok(move.includes("code === '23505' || code === '23P01'"), 'the database refuses a taken time');
  assert.ok(!move.includes('.insert('), 'no second row: the id (and its deposit, card and consent) stays');
  assert.ok(!move.includes('.delete('), 'nothing is deleted');
  assert.ok(move.includes("kind: 'reschedule'") && move.includes('notifyOwner('), 'the owner is told');
  assert.ok(move.includes('runWaitlistOffer({ tenantId, appt: freed, db })'), 'the freed slot goes to the waiting list (when on)');
  assert.ok(move.includes('askGapFillAfterClientCancel(db, { tenantId, appt: freed })'));
  assert.ok(r.includes('if (used >= maxMoves) return refuse(movesUsedHe('), 'the move limit');
  assert.ok(r.includes("hold.status === 'awaiting_deposit') return refuse(MOVE_HELD_HE)"), 'an unpaid hold is not moved');
  const peek = r.slice(r.indexOf('if (body.peek === true)'), r.indexOf('// ── The move'));
  for (const leak of ['client_id', 'tenant_id', 'appt.name', 'price', 'client_phone']) assert.ok(!peek.includes(leak), `peek does not return ${leak}`);
});

ok('page: the move button shows only when the server said the move works', () => {
  const page = read('./app/confirm/page.jsx');
  assert.ok(page.includes("{status === 'ready' && movePeek && ("), 'offer-move only with a successful peek');
  assert.ok(page.includes("Array.isArray(d.days) && d.days.length > 0"), 'and only with free times');
  const flow = read('./app/confirm/RescheduleFlow.jsx');
  assert.ok(flow.includes('data-testid="reschedule-calendar"'), 'add to calendar after the move');
  assert.ok(flow.includes("fetch('/api/confirm/reschedule'"));
});

ok('copy: Hebrew, feminine, no em dashes, no "automatic" promise', () => {
  const texts = [
    ...Object.values(RESCHEDULE_COPY), MOVE_HELD_HE, movesUsedHe(2), movesUsedHe(0),
    ownerMoveMessage({ name: 'רונית', service: 'מניקור', fromWhen: 'ביום שלישי', toWhen: 'ביום רביעי' }),
    read('./app/confirm/RescheduleFlow.jsx'), read('./app/api/confirm/reschedule/route.ts'),
  ];
  for (const t of texts) {
    assert.ok(!t.includes('—'), `no em dash: ${t.slice(0, 60)}`);
    assert.ok(!/אוטומטית/.test(t), 'nothing promises an automatic send');
  }
  assert.match(ownerMoveMessage({ name: 'רונית', service: 'מניקור', fromWhen: 'ביום שלישי', toWhen: 'ביום רביעי' }), /רונית הזיזה את התור למניקור מביום שלישי לביום רביעי\. השעה הקודמת התפנתה ביומן\./);
});

console.log(`test-reschedule: passed ${passed} failed ${failed}`);
if (failed) process.exit(1);

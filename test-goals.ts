// Monthly goals, pace, and the weekly report text.
import assert from 'node:assert/strict';
import { resolveGoals, goalsForSave, goalProgress, pace, monthElapsed, MAX_REVENUE_GOAL } from './lib/goals.ts';
import { buildWeeklyReport } from './lib/weeklyReport.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('no goals set: both null, never a bar stuck at 0', () => {
  for (const v of [null, undefined, {}, { goals: null }, { goals: { revenue: 0, bookings: -3 } }, { goals: { revenue: 'x' } }, 'str']) {
    assert.deepEqual(resolveGoals(v), { revenue: null, bookings: null });
  }
  assert.equal(goalProgress(500, null), null);
  assert.equal(goalProgress(500, 0), null);
});

ok('goals are whole positive numbers within bounds', () => {
  assert.deepEqual(resolveGoals({ goals: { revenue: '12000.7', bookings: 40 } }), { revenue: 12000, bookings: 40 });
  assert.equal(resolveGoals({ goals: { revenue: MAX_REVENUE_GOAL + 1 } }).revenue, null);
  assert.deepEqual(goalsForSave({ revenue: '', bookings: '25' }), { bookings: 25 });
  assert.deepEqual(goalsForSave({}), {});
});

ok('progress: percent capped at 100, remaining never negative', () => {
  assert.deepEqual(goalProgress(3000, 12000), { actual: 3000, target: 12000, pct: 25, remaining: 9000, reached: false });
  const over = goalProgress(15000, 12000)!;
  assert.equal(over.pct, 100);
  assert.equal(over.remaining, 0);
  assert.equal(over.reached, true);
  assert.equal(goalProgress(-5, 100)!.actual, 0);
});

ok('pace: nothing is "behind" in the first days; then compares with the calendar', () => {
  const early = new Date(2026, 9, 3);
  assert.equal(pace(goalProgress(0, 1000), early), 'early');
  const mid = new Date(2026, 9, 16); // 16 of 31 days = 52% of the month
  assert.equal(Math.round(monthElapsed(mid) * 100), 52);
  assert.equal(pace(goalProgress(100, 1000), mid), 'behind');
  assert.equal(pace(goalProgress(500, 1000), mid), 'on-track');
  assert.equal(pace(goalProgress(800, 1000), mid), 'ahead');
  assert.equal(pace(goalProgress(1200, 1000), early), 'ahead', 'reached is ahead whenever');
});

ok('weekly report: an empty week is not worth a message', () => {
  assert.equal(buildWeeklyReport({ weekRevenue: 0, prevWeekRevenue: 0, bookings: 0, cancellations: 0, newLeads: 0, newClients: 0 }), null);
});

ok('weekly report: the facts, the comparison, the goal', () => {
  const t = buildWeeklyReport({
    weekRevenue: 4200, prevWeekRevenue: 3000, bookings: 14, cancellations: 2, newLeads: 5, newClients: 1, topSource: 'פייסבוק',
    monthRevenue: goalProgress(9000, 12000), monthBookings: goalProgress(30, 40),
  })!;
  assert.match(t, /הכנסות: ₪4,200/);
  assert.match(t, /עלייה של 40%/);
  assert.match(t, /14, 2 בוטלו/);
  assert.match(t, /פניות חדשות: 5, רובן מפייסבוק/);
  assert.match(t, /הצטרפו לקוחה אחת חדשות|הצטרפו לקוחה אחת/);
  assert.match(t, /יעד ההכנסות לחודש: 75%/);
  assert.match(t, /חסרים ₪3,000/);
  assert.match(t, /יעד התורים לחודש: 30 מתוך 40/);
  assert.ok(!/NaN|undefined|null/.test(t));
});

ok('weekly report: a reached goal says so', () => {
  const t = buildWeeklyReport({ weekRevenue: 100, prevWeekRevenue: 0, bookings: 1, cancellations: 0, newLeads: 0, newClients: 0, monthRevenue: goalProgress(13000, 12000) })!;
  assert.match(t, /יעד ההכנסות של החודש הושג/);
});

console.log(`${n} passed`);

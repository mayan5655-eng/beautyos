// lib/goals.ts
//
// Her monthly goals (revenue and number of bookings) and how far along she is.
//
// Stored in settings.automations.goals = { revenue: number, bookings: number } - the same free-form bag the other
// small settings use, so there is no migration. A goal is optional: absent, 0 or garbage means "no goal", and the
// home screen then shows an invitation to set one instead of a bar stuck at 0%.
//
// "On pace" compares progress with how much of the month has passed. It is a nudge, not a verdict: the first days
// of a month always look behind, so nothing is called "behind" before the 5th.

export type Goals = { revenue: number | null; bookings: number | null };
export type Progress = { actual: number; target: number; pct: number; remaining: number; reached: boolean };
export type Pace = 'ahead' | 'on-track' | 'behind' | 'early';

export const MAX_REVENUE_GOAL = 10_000_000;
export const MAX_BOOKINGS_GOAL = 5_000;

const clean = (v: unknown, max: number): number | null => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

export function resolveGoals(automations: unknown): Goals {
  const a = automations && typeof automations === 'object' && !Array.isArray(automations) ? (automations as Record<string, unknown>) : {};
  const g = a.goals && typeof a.goals === 'object' && !Array.isArray(a.goals) ? (a.goals as Record<string, unknown>) : {};
  return { revenue: clean(g.revenue, MAX_REVENUE_GOAL), bookings: clean(g.bookings, MAX_BOOKINGS_GOAL) };
}

/** What to store back: only positive whole numbers survive; both empty means the key is removed by the caller. */
export function goalsForSave(input: { revenue?: unknown; bookings?: unknown }): { revenue?: number; bookings?: number } {
  const out: { revenue?: number; bookings?: number } = {};
  const r = clean(input.revenue, MAX_REVENUE_GOAL);
  const b = clean(input.bookings, MAX_BOOKINGS_GOAL);
  if (r !== null) out.revenue = r;
  if (b !== null) out.bookings = b;
  return out;
}

export function goalProgress(actual: number, target: number | null): Progress | null {
  if (target === null || !(target > 0)) return null;
  const a = Number.isFinite(actual) && actual > 0 ? actual : 0;
  return { actual: a, target, pct: Math.min(100, Math.round((a / target) * 100)), remaining: Math.max(0, target - a), reached: a >= target };
}

/** How much of the month is behind us, 0..1, by calendar day (inclusive of today). */
export function monthElapsed(now: Date): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.min(1, now.getDate() / days);
}

export function pace(progress: Progress | null, now: Date): Pace {
  if (!progress) return 'early';
  if (progress.reached) return 'ahead';
  if (now.getDate() < 5) return 'early';
  const expected = monthElapsed(now) * 100;
  if (progress.pct >= expected + 10) return 'ahead';
  if (progress.pct >= expected - 10) return 'on-track';
  return 'behind';
}

export const PACE_LABEL: Record<Pace, string> = {
  ahead: 'מקדימה את הקצב',
  'on-track': 'בקצב',
  behind: 'קצת מאחור',
  early: 'תחילת החודש',
};

// lib/busyIntervals.ts
//
// What /api/availability tells a stranger: per day, the MERGED busy intervals, each buffer already included.
//
// ── Why merged (Vercel security review, 2026-11-08) ────────────────────────
// The route used to send every busy appointment as { start, duration, buffer }, with buffer worked out from that
// appointment's service, next to a public map of service name -> buffer. Joined, the two told an anonymous visitor
// which treatment somebody had booked ("the 14:00 has a 20-minute buffer, and only laser has 20"). A merged interval
// says only "14:00 to 15:20 is not available": no length per appointment, no buffer, no service.
//
// ── Why the page loses nothing ─────────────────────────────────────────────
// The page asks one question of these ranges: does a candidate [m, m + duration + ownBuffer) overlap any of them?
// For half-open intervals, a range overlaps a union iff it overlaps one of its members, and merging touching ranges
// ([a, b) and [b, c) into [a, c)) changes no answer either. So every free start is exactly what it was
// (test-availability-merged.ts checks this over a grid). A zero-length range is kept as the point it is: the page
// (lib/apptTime overlaps) and /api/book-appointment (clashesWithBuffer) both refuse a candidate that strictly contains
// it, and merging absorbs it into any range it touches without changing that. Only an inverted range (a negative
// duration, never written by the app) is dropped.
//
// Pure: no database, no clock.

import { startMinute, endMinute, type HasStart } from './apptTime.ts';

export type BusyRange = { date: string; start: number; end: number };

type Timed = HasStart & { date?: unknown };

/** Union per day of [start, end) ranges: overlapping and touching ones merged, inverted ones dropped, sorted. */
export function mergeBusyRanges(ranges: BusyRange[]): BusyRange[] {
  const byDate = new Map<string, Array<[number, number]>>();
  for (const r of ranges) {
    const s = Number(r.start), e = Number(r.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    const d = String(r.date);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push([s, e]);
  }
  const out: BusyRange[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date)!.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let [cs, ce] = list[0];
    for (let i = 1; i < list.length; i++) {
      const [s, e] = list[i];
      if (s <= ce) { if (e > ce) ce = e; continue; }
      out.push({ date, start: cs, end: ce });
      [cs, ce] = [s, e];
    }
    out.push({ date, start: cs, end: ce });
  }
  return out;
}

/**
 * The public busy list. Each appointment is busy until its end plus its buffer (bufferOf, lib/serviceBuffer.ts
 * bufferLookup); `plain` rows (her lunch break) carry no buffer. Only { date, start, end } leaves.
 */
export function publicBusyRanges<A extends Timed>(
  appointments: A[] | null | undefined,
  bufferOf: (a: A) => number,
  plain: Timed[] = [],
): BusyRange[] {
  const ranges: BusyRange[] = [];
  for (const a of appointments || []) {
    const s = startMinute(a), e = endMinute(a);
    if (s === null || e === null) continue;
    ranges.push({ date: String(a.date), start: s, end: e + (Number(bufferOf(a)) || 0) });
  }
  for (const p of plain) {
    const s = startMinute(p), e = endMinute(p);
    if (s === null || e === null) continue;
    ranges.push({ date: String(p.date), start: s, end: e });
  }
  return mergeBusyRanges(ranges);
}

// test-availability-merged.ts
//
// Vercel security review (2026-11-08, low, info disclosure): /api/availability sent each busy appointment's duration
// and its buffer (worked out from its service) next to a public service -> buffer map, and joined they told an
// anonymous visitor which treatment somebody had booked. It now sends merged busy intervals only, buffers included
// (lib/busyIntervals.ts), and the page takes the buffer of the service it is booking from the public services list.
// This checks the shape, that the free starts are exactly what they were, and that no service name leaves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBusyRanges, publicBusyRanges } from './lib/busyIntervals.ts';
import { bufferLookup, cleanBufferMinutes } from './lib/serviceBuffer.ts';
import { startMinute, endMinute, overlaps, slotsBetween } from './lib/apptTime.ts';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };

// ── Merging ────────────────────────────────────────────────────────────────
eq(mergeBusyRanges([]), [], 'nothing booked: nothing busy');
eq(mergeBusyRanges([{ date: 'd', start: 600, end: 660 }, { date: 'd', start: 660, end: 700 }]), [{ date: 'd', start: 600, end: 700 }], 'touching ranges merge');
eq(mergeBusyRanges([{ date: 'd', start: 600, end: 690 }, { date: 'd', start: 630, end: 660 }]), [{ date: 'd', start: 600, end: 690 }], 'a range inside another disappears into it');
eq(mergeBusyRanges([{ date: 'd', start: 700, end: 720 }, { date: 'd', start: 600, end: 660 }]), [{ date: 'd', start: 600, end: 660 }, { date: 'd', start: 700, end: 720 }], 'a gap stays a gap, sorted');
eq(mergeBusyRanges([{ date: 'b', start: 600, end: 660 }, { date: 'a', start: 600, end: 660 }]), [{ date: 'a', start: 600, end: 660 }, { date: 'b', start: 600, end: 660 }], 'days never merge into each other');
eq(mergeBusyRanges([{ date: 'd', start: 600, end: 600 }]), [{ date: 'd', start: 600, end: 600 }], 'a zero-length range stays the point it is');
eq(mergeBusyRanges([{ date: 'd', start: 660, end: 660 }, { date: 'd', start: 600, end: 660 }]), [{ date: 'd', start: 600, end: 660 }], 'and is absorbed by a range it touches');
eq(mergeBusyRanges([{ date: 'd', start: 600, end: 590 }]), [], 'an inverted range is dropped');

// ── The shape: date, start, end and nothing else ───────────────────────────
const svcs = [
  { name: 'לייזר', buffer_minutes: 20, active: true },
  { name: 'ריסים', buffer_minutes: 10, active: true },
  { name: 'טיפול ישן', buffer_minutes: 45, active: false },
];
const bufferOf = bufferLookup(svcs, 5);
const rows = [
  { date: '2030-01-01', start_minute: 600, hour: 10, duration: 60, service: 'לייזר', kind: null },
  { date: '2030-01-01', start_minute: 720, hour: 12, duration: 30, service: 'טיפול ישן', kind: null },
  { date: '2030-01-01', start_minute: 900, hour: 15, duration: 60, service: 'פגישה', kind: 'personal' },
  { date: '2030-01-02', start_minute: null, hour: 9, duration: 45, service: 'ריסים', kind: null, buffer_minutes: 30 },
];
const lunch = [{ date: '2030-01-01', start_minute: 780, hour: 13, duration: 30 }];
const busy = publicBusyRanges(rows, bufferOf, lunch);
for (const r of busy) eq(Object.keys(r).sort(), ['date', 'end', 'start'], 'only date, start, end leave');
const json = JSON.stringify(busy);
for (const banned of ['duration', 'buffer', 'byService', 'service', 'kind', 'hour', 'start_minute']) ok(!json.includes(banned), `no "${banned}" in the response`);
for (const s of svcs) ok(!json.includes(s.name), `no service name leaves, archived or not: ${s.name}`);
eq(busy, [
  { date: '2030-01-01', start: 600, end: 680 }, // 10:00+60, laser buffer 20
  { date: '2030-01-01', start: 720, end: 810 }, // 12:00+30 plus the archived service's 45 (to 13:15), merged with lunch 13:00-13:30
  { date: '2030-01-01', start: 900, end: 960 }, // a personal block: no buffer
  { date: '2030-01-02', start: 540, end: 615 }, // hour fallback 09:00+45, stored buffer 30 (a floor over today's 10)
], 'the busy list, buffers included');

// ── Same free starts as before, over a grid ────────────────────────────────
// The old page: each appointment row busy until end + its `buffer`, lunch rows as they are, a candidate clashing with
// any of them. The new page: the merged intervals. They must agree on every start, for every treatment and buffer.
type Old = { date: string; start_minute: number | null; hour: number | null; duration: number; buffer?: number };
const oldFree = (day: Old[], dateStr: string, dur: number, own: number, open: number, close: number) => {
  const b = day.filter((a) => a.date === dateStr).map((a) => { const s = startMinute(a), e = endMinute(a); return [s, e === null ? null : e + (cleanBufferMinutes(a.buffer) ?? 0)] as const; })
    .filter(([s, e]) => s !== null && e !== null) as Array<readonly [number, number]>;
  return slotsBetween(open, close, 15, dur).filter((m: number) => !b.some(([bs, be]) => overlaps(m, m + dur + own, bs, be)));
};
const newFree = (merged: { date: string; start: number; end: number }[], dateStr: string, dur: number, own: number, open: number, close: number) => {
  const b = merged.filter((a) => a.date === dateStr).map((a) => [Number(a.start), Number(a.end)] as const);
  return slotsBetween(open, close, 15, dur).filter((m: number) => !b.some(([bs, be]) => overlaps(m, m + dur + own, bs, be)));
};
let seed = 7;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
let days = 0;
for (let t = 0; t < 400; t++) {
  const appts: Array<{ date: string; start_minute: number | null; hour: number | null; duration: number; service: string; kind: string | null }> = [];
  const count = rnd(7);
  for (let i = 0; i < count; i++) {
    const start = 480 + rnd(40) * 15;
    const useHour = rnd(5) === 0;
    appts.push({
      date: '2030-01-01',
      start_minute: useHour ? null : start,
      hour: Math.floor(start / 60),
      duration: [0, 15, 30, 45, 60, 90][rnd(6)],
      service: ['לייזר', 'ריסים', 'טיפול ישן', 'אחר'][rnd(4)],
      kind: rnd(6) === 0 ? 'personal' : null,
    });
  }
  const lunchRows = rnd(2) ? [{ date: '2030-01-01', start_minute: 750, hour: 12, duration: 30 }] : [];
  const def = [0, 5, 15][rnd(3)];
  const of = bufferLookup(svcs, def);
  const oldShape: Old[] = [...appts.map((a) => ({ date: a.date, start_minute: a.start_minute, hour: a.hour, duration: a.duration, buffer: of(a) })), ...lunchRows];
  const merged = publicBusyRanges(appts, of, lunchRows);
  for (const dur of [15, 30, 60, 90]) for (const own of [0, 10, 20]) {
    eq(newFree(merged, '2030-01-01', dur, own, 8, 19), oldFree(oldShape, '2030-01-01', dur, own, 8, 19), `free starts unchanged (case ${t}, ${dur}+${own})`);
  }
  days++;
}
ok(days === 400, 'merged intervals give the same free starts over 400 random days x 12 treatments');

// ── The route and the page ─────────────────────────────────────────────────
const route = readFileSync('app/api/availability/route.ts', 'utf8');
const code = route.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
ok(code.includes('return Response.json({ success: true, busy, defaultBuffer: bufferDefault });'), 'the route answers busy + the business default only');
ok(!/byService|buffer:\s|duration:\s/.test(code), 'no byService map, no per-row buffer or duration in the route');
ok(!/select\(['"`]\*['"`]\)/.test(code), 'no select(*)');
const page = readFileSync('app/BookingPage.jsx', 'utf8');
ok(!page.includes('byService') && !page.includes('a.buffer'), 'the page no longer reads a per-appointment buffer or the service map');
ok(page.includes('serviceBufferMinutes(selectedService, defaultBuffer ?? businessBufferDefault(settings?.branding))'), 'its own buffer comes from the service row it is booking (already public)');

console.log(`availability merged: passed ${passed} failed 0`);

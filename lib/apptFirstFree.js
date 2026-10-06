// lib/apptFirstFree.js
//
// Which start time the "new appointment" sheet should open on.
//
// The sheet used to open on whatever the call site passed - usually the hour she opens (09:00). On a busy day that
// slot is taken, so the first thing a cosmetician saw was a red "השעה תפוסה" and a disabled save button on a sheet she had
// just opened (found 2026-10-06 while recording the tour, where it sat under a caption about how easy booking is).
//
// Rule, in order: keep the requested time if it is free; otherwise the first free time AT OR AFTER it that is inside her
// hours; otherwise the first free time inside her hours anywhere in the day; otherwise the first free time at all (the
// two-hour margin either side of her day); otherwise leave it alone - a fully booked day still shows the honest red state.
//
// Pure: the sheet passes in what it already computed (options, busy intervals, duration, an "outside hours" test).

/**
 * @param {{ options: number[], requested: number, duration: number, busy: Array<[number, number]>, outside: (m: number) => boolean }} a
 * @returns {number} the start minute to open on (always one of `options`, or `requested` when there are no options)
 */
export function firstFreeStart({ options, requested, duration, busy, outside }) {
  if (!options.length) return requested;
  const taken = (m) => busy.some(([bs, be]) => m < be && bs < m + duration); // the same test as slotIsTaken in the sheet
  const start = options.includes(requested) ? requested : (options.find((m) => !outside(m)) ?? options[0]);
  if (!taken(start)) return start;
  const free = (m) => !taken(m);
  return (
    options.find((m) => m >= start && free(m) && !outside(m)) ??
    options.find((m) => free(m) && !outside(m)) ??
    options.find(free) ??
    start
  );
}

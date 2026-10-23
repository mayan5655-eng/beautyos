// lib/shabbat.js
//
// Nothing goes out to clients on Shabbat (owner's decision, 2026-10-23). The daily client crons run at 14:00 UTC (16:00 Israel in
// winter, 17:00 in summer); on Saturday that run is held, and the same job runs again once Shabbat is out, at 20:00 Israel time.
//
// Vercel crons are fixed in UTC and Israel moves between UTC+2 and UTC+3, so each held job has one extra Saturday entry in
// vercel.json at both 17:00 and 18:00 UTC ("0 17,18 * * 6"). Exactly one of those two lands in Israel's 20:00 hour, whatever the
// season, and only that one runs: the other is skipped, so nobody is reminded twice.
//
// Friday is unchanged: the 14:00 UTC run goes out before Shabbat comes in.
//
// Pure, no imports: the routes and the plain-node test share it.

export const SATURDAY_NIGHT_HOUR = 20;

/** Israel's weekday (0 = Sunday) and hour (0-23) for a moment. */
export function israelClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    hour: Number(get('hour')) % 24,
  };
}

/** Saturday before 20:00 Israel time: still Shabbat for our purposes, nothing goes to clients. */
export function isShabbatHold(now = new Date()) {
  const { weekday, hour } = israelClock(now);
  return weekday === 6 && hour < SATURDAY_NIGHT_HOUR;
}

/**
 * Should a scheduled client-facing run go ahead right now?
 *   - Saturday before 20:00: no (held for Saturday night).
 *   - Saturday at 20:xx: yes - this is the Saturday-night run.
 *   - Saturday after 21:00: no for the scheduled run (the 20:00 one already went), yes for a manual retry (`retry`), which has
 *     its own guard against sending twice.
 *   - Any other day: yes.
 * @returns {{ run: boolean, reason: 'ok' | 'shabbat' | 'saturday-night-done' }}
 */
export function clientCronSlot(now = new Date(), { retry = false } = {}) {
  const { weekday, hour } = israelClock(now);
  if (weekday !== 6) return { run: true, reason: 'ok' };
  if (hour < SATURDAY_NIGHT_HOUR) return { run: false, reason: 'shabbat' };
  if (hour === SATURDAY_NIGHT_HOUR || retry) return { run: true, reason: 'ok' };
  return { run: false, reason: 'saturday-night-done' };
}

/** Hebrew line for the cron's JSON answer when a run is skipped. */
export function slotMessageHe(reason) {
  if (reason === 'shabbat') return 'שבת - לא שולחים ללקוחות. יישלח במוצאי שבת ב-20:00.';
  if (reason === 'saturday-night-done') return 'ההרצה של מוצאי שבת כבר יצאה ב-20:00.';
  return '';
}

// lib/shabbat.js
//
// Nothing goes out to clients on Shabbat (owner's decision, 2026-10-23). The daily client crons run at 14:00 UTC (16:00 Israel in
// winter, 17:00 in summer); on Saturday that run is held, and the same job runs again once Shabbat is out, at 20:00 Israel time.
//
// Vercel crons are fixed in UTC and Israel moves between UTC+2 and UTC+3, so each held job has one extra Saturday entry in
// vercel.json at both 17:00 and 18:00 UTC ("0 17,18 * * 6"). Exactly one of those two lands in Israel's 20:00 hour, whatever the
// season, and only that one runs: the other is skipped, so nobody is reminded twice.
//
// The reminder runs (send-reminders, send-smart-reminders) use reminderCronSlot below, which also knows yom tov and the early
// winter Shabbat: see there. clientCronSlot is unchanged for the other client crons (greetings, which check yom tov themselves).
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
  if (reason === 'yomtov') return 'חג - לא שולחים ללקוחות. יישלח במוצאי החג ב-20:00.';
  if (reason === 'other-slot') return 'לא בשעה הזו היום: ההרצה של היום יוצאת בשעה אחרת.';
  return '';
}

// ── the reminder runs: Shabbat, yom tov, and their eves ───────────────────────────────────────────────────────────────────
//
// With automatic sending on, the 14:00 UTC run (16:00 Israel in winter) can land after candle lighting on a winter Friday, and
// it never knew yom tov at all (2026-11-02 audit). So the reminder crons have three daily entries and this decides which one
// runs, by Israel's day and hour:
//   early   10:00 UTC (12:00/13:00 Israel)  runs on an EVE: Friday, or the day before a yom tov
//   regular 14:00 UTC (16:00/17:00 Israel)  runs on an ordinary day
//   night   17:00 and 18:00 UTC             the one landing in Israel's 20:00 hour runs on the LAST rest day of a run of rest
//                                           days (Shabbat, yom tov, or both back to back), once it is out
// Every other entry skips. A manual retry (`retry`) runs at any hour except during a rest day before 20:00.

export const EVE_LATEST_HOUR = 15;   // an eve's run must be before this hour (Israel): Shabbat/yom tov never comes in earlier

/** 'YYYY-MM-DD' in Israel, `offsetDays` from `now`. */
export function israelDayKey(now = new Date(), offsetDays = 0) {
  const d = new Date(now.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * @param {Date} [now]
 * @param {{ retry?: boolean, isYomTov?: (day: string) => boolean }} [o]
 * @returns {{ run: boolean, reason: 'ok' | 'shabbat' | 'yomtov' | 'saturday-night-done' | 'other-slot' }}
 */
export function reminderCronSlot(now = new Date(), { retry = false, isYomTov = () => false } = {}) {
  const { weekday, hour } = israelClock(now);
  const yomTovToday = isYomTov(israelDayKey(now)), yomTovTomorrow = isYomTov(israelDayKey(now, 1));
  const restToday = weekday === 6 || yomTovToday;
  const restTomorrow = weekday === 5 || yomTovTomorrow;
  const held = { run: false, reason: weekday === 6 ? 'shabbat' : 'yomtov' };
  if (restToday) {
    if (hour < SATURDAY_NIGHT_HOUR) return held;
    if (restTomorrow) return held;                       // still a rest day tomorrow: held for the night the rest days end
    if (hour === SATURDAY_NIGHT_HOUR || retry) return { run: true, reason: 'ok' };
    return { run: false, reason: 'saturday-night-done' };
  }
  if (retry) return { run: true, reason: 'ok' };
  if (restTomorrow) return hour < EVE_LATEST_HOUR ? { run: true, reason: 'ok' } : { run: false, reason: 'other-slot' };
  return hour >= EVE_LATEST_HOUR && hour < SATURDAY_NIGHT_HOUR - 1 ? { run: true, reason: 'ok' } : { run: false, reason: 'other-slot' };
}

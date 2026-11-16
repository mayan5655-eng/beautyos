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

// The hour the evening's "regular" window is measured against (an ordinary day's runs go before 19:00). Shabbat's END is no
// longer this fixed hour: see restEndsAt below.
export const SATURDAY_NIGHT_HOUR = 20;

// ── when Shabbat / yom tov is out (2026-11-16 audit) ───────────────────────────────────────────────────────────────────────
// It used to be "Saturday 20:00" all year. In summer Shabbat ends near 20:45, so the 20:00 run went out while it was still
// Shabbat. Now: sunset in Tel Aviv (NOAA's sunrise/sunset formula, good to a minute or two) plus 45 minutes, later than the
// printed havdalah times of Israel's big cities. Of the two Saturday-night cron entries (17:00 and 18:00 UTC) the run is the
// FIRST one at or after that moment: 19:00 Israel in winter, 20:00 in spring and autumn, 21:00 in high summer.
const TEL_AVIV = { lat: 32.08, lon: 34.78 };
export const TZEIT_MINUTES = 45;
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

/** Sunset in Tel Aviv on an Israel calendar day ('YYYY-MM-DD'), as a Date. */
export function sunsetOn(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  const lngHour = TEL_AVIV.lon / 15;
  const t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = mod(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = mod(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(TEL_AVIV.lat))) / (cosDec * Math.cos(rad(TEL_AVIV.lat)));
  const H = deg(Math.acos(cosH)) / 15;
  const UT = mod(H + RA - 0.06571 * t - 6.622 - lngHour, 24);
  return new Date(Date.UTC(y, m - 1, d) + UT * 3_600_000);
}

/** When today's rest day (Shabbat or yom tov) is out: sunset + 45 minutes, for the Israel day `now` falls on. */
export function restEndsAt(now = new Date()) {
  return new Date(sunsetOn(israelDayKey(now)).getTime() + TZEIT_MINUTES * 60_000);
}

/** Is today's rest day already out at `now`? (Only meaningful on a rest day.) */
export function isRestOver(now = new Date()) {
  return now.getTime() >= restEndsAt(now).getTime();
}

/** Is `now` the night run (17:00 or 18:00 UTC entry) that goes out once the rest day is over: the first of them after it ends? */
export function isNightRun(now = new Date()) {
  const end = restEndsAt(now);
  const slot = end.getUTCHours() < 17 || (end.getUTCHours() === 17 && end.getUTCMinutes() === 0) ? 17 : 18;
  return now.getUTCHours() === slot && isRestOver(now);
}

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

/** Saturday before Shabbat is out (restEndsAt): nothing goes to clients. */
export function isShabbatHold(now = new Date()) {
  const { weekday } = israelClock(now);
  return weekday === 6 && !isRestOver(now);
}

/**
 * Should a scheduled client-facing run go ahead right now?
 *   - Saturday before Shabbat is out: no (held for Saturday night).
 *   - The first night entry after it is out (isNightRun): yes - this is the Saturday-night run.
 *   - Later: no for the scheduled run (the night run already went), yes for a manual retry (`retry`), which has its own guard
 *     against sending twice.
 *   - Any other day: yes.
 * @returns {{ run: boolean, reason: 'ok' | 'shabbat' | 'saturday-night-done' }}
 */
export function clientCronSlot(now = new Date(), { retry = false } = {}) {
  const { weekday } = israelClock(now);
  if (weekday !== 6) return { run: true, reason: 'ok' };
  if (!isRestOver(now)) return { run: false, reason: 'shabbat' };
  if (isNightRun(now) || retry) return { run: true, reason: 'ok' };
  return { run: false, reason: 'saturday-night-done' };
}

/** Hebrew line for the cron's JSON answer when a run is skipped. */
export function slotMessageHe(reason) {
  if (reason === 'shabbat') return 'שבת - לא שולחים ללקוחות. יישלח במוצאי שבת, אחרי צאת השבת.';
  if (reason === 'saturday-night-done') return 'ההרצה של מוצאי שבת כבר יצאה.';
  if (reason === 'yomtov') return 'חג - לא שולחים ללקוחות. יישלח במוצאי החג, אחרי צאת החג.';
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
    if (!isRestOver(now)) return held;
    if (restTomorrow) return held;                       // still a rest day tomorrow: held for the night the rest days end
    if (isNightRun(now) || retry) return { run: true, reason: 'ok' };
    return { run: false, reason: 'saturday-night-done' };
  }
  if (retry) return { run: true, reason: 'ok' };
  if (restTomorrow) return hour < EVE_LATEST_HOUR ? { run: true, reason: 'ok' } : { run: false, reason: 'other-slot' };
  return hour >= EVE_LATEST_HOUR && hour < SATURDAY_NIGHT_HOUR - 1 ? { run: true, reason: 'ok' } : { run: false, reason: 'other-slot' };
}

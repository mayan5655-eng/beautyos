// lib/greetings/greetings.js
//
// Personal greetings: a short warm message from HER to a client on three occasions, each a switch she turns on herself.
//   birthday     the client's birthday
//   anniversary  one year (or two, three...) since her first visit: "שנה אצלי"
//   holiday      a short greeting a couple of days before a holiday she picked
//
// What already existed and is extended, not duplicated:
//   * lib/reminders/smartReminders.js section 4 sends a birthday message to everyone, ON by default. When she turns the birthday
//     greeting on HERE, that automatic one steps aside (greetingsOwnBirthday) and this one - her words, her gift - replaces it.
//   * lib/marketingConsent.js: consent on file and no opt-out since. Every greeting needs it, and carries the removal line.
//   * lib/shabbat.js + the night rule: nothing on Shabbat, a holiday, or at night (sendWindow).
//   * auto_reminders_log: one row per client per occasion per year (the same table the other reminders use), so a greeting
//     never goes twice. The legacy 'birthday' row for the same year counts too.
//   * lib/whatsapp.js: greetings are outreach, so they are ALWAYS queued in "הודעות מוכנות לשליחה" and she sends each one
//     herself. Nothing here ever says "sent" for a queued message.
//
// Everything is OFF until she switches it on. The plan is computed for a week at a time so she can see exactly who would get what,
// and untick a name before anything is queued (config.skip).
//
// Pure: no I/O, no clock beyond what is passed in. Holiday dates and yom-tov days come from the caller (lib/greetings/calendar.ts).

import { canMarket, MARKETING_FOOTER } from '../marketingConsent.js';
import { displayName } from '../personName.js';
import { explicitBirthdayOffer } from '../birthdayOffer.js';
import { israelClock, clientCronSlot } from '../shabbat.js';

export const OCCASIONS = ['birthday', 'anniversary', 'holiday'];
/** The auto_reminders_log / whatsapp_messages type for each occasion's queued message. */
export const GREETING_TYPES = { birthday: 'greeting_birthday', anniversary: 'greeting_anniversary', holiday: 'greeting_holiday' };
export const LEGACY_BIRTHDAY_TYPE = 'birthday';

export const HOLIDAY_CHOICES = [
  { key: 'rosh_hashana', name: 'ראש השנה', wish: 'שנה טובה ומתוקה' },
  { key: 'sukkot', name: 'סוכות', wish: 'חג סוכות שמח' },
  { key: 'hanukkah', name: 'חנוכה', wish: 'חנוכה שמח' },
  { key: 'purim', name: 'פורים', wish: 'פורים שמח' },
  { key: 'pesach', name: 'פסח', wish: 'חג פסח שמח וכשר' },
  { key: 'shavuot', name: 'שבועות', wish: 'חג שבועות שמח' },
];
export const DEFAULT_HOLIDAYS = ['rosh_hashana', 'hanukkah', 'pesach'];

export const DEFAULT_DAILY_CAP = 15;
export const MAX_DAILY_CAP = 40;
/** A greeting that could not go on its day (Shabbat, cap) still goes within this many days. Holidays: until the eve. */
export const CATCHUP_DAYS = 3;
/** The holiday greeting goes this many days before the holiday. */
export const HOLIDAY_LEAD_DAYS = 2;
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 21;
export const MAX_TEXT = 400;
export const MAX_GIFT = 80;
export const MAX_SKIP = 500;

export const DEFAULT_TEXTS = {
  birthday: 'שלום {name}! 🎂\nיום הולדת שמח מ{clinic}. שתהיה לך שנה מלאה בדברים טובים, ושיהיה לך יום מתוק.',
  anniversary: 'שלום {name}! 🌸\nהיום מלאה שנה מהפעם הראשונה שהגעת ל{clinic}. תודה על האמון, כיף לי ללוות אותך.',
  holiday: 'שלום {name}! 🌿\n{wish} מ{clinic}. מאחלת לך ולכל המשפחה חג של שקט, אור ובריאות.',
};

const GIFT_LABEL = { birthday: 'מתנה קטנה ממני', anniversary: 'מתנה קטנה ממני לרגל השנה', holiday: 'מתנה קטנה ממני לחג' };

const cleanText = (v, max) => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const cleanGift = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_GIFT);

/** What is stored in settings.automations.greetings, made safe. Missing or junk = everything OFF. */
export function normalizeGreetings(raw) {
  const g = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const occ = (k) => {
    const o = g[k] && typeof g[k] === 'object' ? g[k] : {};
    return { enabled: o.enabled === true, text: cleanText(o.text, MAX_TEXT), gift: cleanGift(o.gift) };
  };
  const holiday = /** @type {any} */ (occ('holiday'));
  const known = new Set(HOLIDAY_CHOICES.map((h) => h.key));
  const picked = Array.isArray(g.holiday?.holidays) ? g.holiday.holidays.filter((k) => known.has(k)) : null;
  holiday.holidays = [...new Set(picked ?? DEFAULT_HOLIDAYS)];
  const cap = Math.round(Number(g.daily_cap));
  const skip = Array.isArray(g.skip) ? [...new Set(g.skip.filter((s) => typeof s === 'string' && s.length < 120))].slice(-MAX_SKIP) : [];
  return {
    birthday: occ('birthday'),
    anniversary: occ('anniversary'),
    holiday,
    daily_cap: Number.isFinite(cap) && cap >= 1 ? Math.min(cap, MAX_DAILY_CAP) : DEFAULT_DAILY_CAP,
    skip,
  };
}

export const anyGreetingOn = (cfg) => OCCASIONS.some((k) => cfg?.[k]?.enabled === true);

/** True when she switched the birthday greeting on here: the older automatic birthday message must not also go. */
export function greetingsOwnBirthday(automations) {
  const g = automations && typeof automations === 'object' ? automations.greetings : null;
  return !!(g && typeof g === 'object' && g.birthday && g.birthday.enabled === true);
}

// ── dates (all 'YYYY-MM-DD', Israel calendar days, computed in UTC so there is no zone to get wrong) ──
const toUtc = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => { const t = toUtc(s); return t === null ? null : fmt(t + n * 86_400_000); };
export const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
export const weekdayOf = (s) => new Date(toUtc(s)).getUTCDay();
const isLeap = (y) => new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;

/** Israel's calendar day for a moment. */
export function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The month/day of a stored date in `year`; Feb 29 falls on Feb 28 in a year without one. */
export function anniversaryIn(dateStr, year) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (mo === 2 && d === 29 && !isLeap(year)) d = 28;
  const out = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return toUtc(out) === null ? null : out;
}

/**
 * May a greeting be queued at this moment? Not on Shabbat (until the 20:00 Saturday-night run), not on a holiday, not at night.
 * @returns {{ ok: boolean, reason: 'ok'|'shabbat'|'saturday-night-done'|'holiday'|'night' }}
 */
/** @param {Date} [now]
 * @param {any} [opts] */
export function sendWindow(now = new Date(), { isYomTov = () => false } = {}) {
  const slot = clientCronSlot(now);
  if (!slot.run) return { ok: false, reason: slot.reason };
  if (isYomTov(israelToday(now))) return { ok: false, reason: 'holiday' };
  const { hour } = israelClock(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) return { ok: false, reason: 'night' };
  return { ok: true, reason: 'ok' };
}

/** The first day on or after `day` that is neither Shabbat nor a holiday. */
export function nextOpenDay(day, isYomTov = () => false) {
  let d = day;
  for (let i = 0; i < 10 && d; i++) {
    if (weekdayOf(d) !== 6 && !isYomTov(d)) return d;
    d = addDays(d, 1);
  }
  return day;
}

// ── message ──
export const logKey = (clientId, type, ref) => `${clientId}|${type}|${ref}`;
export const skipKey = (clientId, occasion, ref) => `${clientId}|${occasion}|${ref}`;

const clinicOf = (businessName) => { const b = String(businessName || '').trim(); return b && b !== 'העסק שלי' && b !== 'העסק' ? b : ''; };

/** Her text (or the default) with {name}/{clinic}/{wish}/{holiday} filled in; her gift line after it; the removal line last. */
/** @param {any} o */
export function buildGreeting({ occasion, cfg, name, businessName, holidayKey, birthdayFallbackGift = '' }) {
  const o = cfg?.[occasion] || {};
  let text = o.text || DEFAULT_TEXTS[occasion] || '';
  const clinic = clinicOf(businessName);
  const first = displayName(String(name || '').trim().split(/\s+/)[0]);
  const holiday = HOLIDAY_CHOICES.find((h) => h.key === holidayKey);
  // A missing name or clinic drops its clause, with the Hebrew prefix letter, instead of leaving a "מ" hanging.
  if (!clinic) text = text.replace(/ ?[מלב]\{clinic\}/g, '').replace(/ ?\{clinic\}/g, '');
  if (!first) text = text.replace(/ ?\{name\}/g, '');
  text = text
    .replace(/\{name\}/g, first)
    .replace(/\{clinic\}/g, clinic)
    .replace(/\{wish\}/g, holiday?.wish || 'חג שמח')
    .replace(/\{holiday\}/g, holiday?.name || 'החג')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
  const gift = o.gift || (occasion === 'birthday' ? birthdayFallbackGift : '');
  const body = gift ? `${text}\n\n${GIFT_LABEL[occasion]}: ${gift}` : text;
  return `${body}\n\n${MARKETING_FOOTER}`;
}

const usablePhone = (p) => String(p ?? '').replace(/\D/g, '').length >= 9;

/**
 * Who would get which greeting between `from` and `to` (inclusive, Israel days).
 *
 * @param {any} o  clients (one tenant), firstVisit {clientId: day}, config, sent (Set of logKey), holidays [{key,name,date}], from/to/today (Israel days), businessName, birthdayGift, isYomTov(day)
 * @returns {{ items: Array, held: Array }}  items: ready; held: eligible people who are not included, with the reason
 */
export function planGreetings({
  clients = [], firstVisit = {}, config, sent = new Set(), holidays = [], from, to, today, businessName = '',
  birthdayGift = '', isYomTov = () => false,
} = {}) {
  const cfg = normalizeGreetings(config);
  const skipSet = new Set(cfg.skip);
  const items = [];
  const held = [];
  const year = +String(today).slice(0, 4);

  const consider = (client, occasion, ref, occasionDay, holidayKey, expiresOn) => {
    let sendOn = nextOpenDay(occasionDay, isYomTov);
    if (expiresOn && diffDays(sendOn, expiresOn) > 0) sendOn = occasionDay; // never push a holiday greeting past the holiday
    const lastDay = expiresOn || addDays(sendOn, CATCHUP_DAYS);
    if (diffDays(today, lastDay) > 0) return; // too late: a birthday greeting a week after is odd, and a holiday one after the holiday is wrong
    const effective = diffDays(sendOn, today) < 0 ? today : sendOn;
    if (diffDays(effective, from) < 0 || diffDays(effective, to) > 0) return;
    const base = { clientId: client.id, name: client.name || '', phone: client.phone || '', occasion, ref, holidayKey: holidayKey || null, sendOn: effective, occasionDay };
    if (client.status === 'archived') return;
    if (!canMarket(client)) { held.push({ ...base, reason: 'no_consent' }); return; }
    if (!usablePhone(client.phone)) { held.push({ ...base, reason: 'no_phone' }); return; }
    if (sent.has(logKey(client.id, GREETING_TYPES[occasion], ref)) || (occasion === 'birthday' && sent.has(logKey(client.id, LEGACY_BIRTHDAY_TYPE, String(ref))))) {
      held.push({ ...base, reason: 'already_sent' }); return;
    }
    const message = buildGreeting({ occasion, cfg, name: client.name, businessName, holidayKey, birthdayFallbackGift: birthdayGift });
    const item = { ...base, message, skipped: skipSet.has(skipKey(client.id, occasion, ref)) };
    items.push(item);
  };

  for (const client of clients) {
    if (!client || !client.id) continue;
    if (cfg.birthday.enabled && client.birthday) {
      // The birthday of this year; in early January the one from late December can still be inside its catch-up days.
      for (const y of [year - 1, year]) {
        const day = anniversaryIn(client.birthday, y);
        if (day) consider(client, 'birthday', String(y), day);
      }
    }
    const fv = firstVisit[client.id];
    if (cfg.anniversary.enabled && fv) {
      const fy = +String(fv).slice(0, 4);
      for (const y of [year - 1, year]) {
        if (y <= fy) continue; // the first visit itself is not an anniversary
        const day = anniversaryIn(fv, y);
        if (day) consider(client, 'anniversary', String(y), day);
      }
    }
    if (cfg.holiday.enabled) {
      for (const h of holidays) {
        if (!cfg.holiday.holidays.includes(h.key)) continue;
        const eve = addDays(h.date, -1);
        const base = addDays(h.date, -HOLIDAY_LEAD_DAYS);
        consider(client, 'holiday', `${h.key}-${h.date.slice(0, 4)}`, base, h.key, eve);
      }
    }
  }

  // One greeting per client per day: birthday first (it is only today), then the anniversary, then the holiday.
  const rank = { birthday: 0, anniversary: 1, holiday: 2 };
  items.sort((a, b) => a.sendOn.localeCompare(b.sendOn) || rank[a.occasion] - rank[b.occasion] || String(a.name).localeCompare(String(b.name), 'he'));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = `${it.clientId}|${it.sendOn}`;
    if (seen.has(k)) { held.push({ ...it, reason: 'one_a_day' }); continue; }
    seen.add(k);
    out.push(it);
  }
  return { items: out, held };
}

/** The greetings to queue now: today's due ones that she did not untick, up to what is left of today's cap. */
export function selectDue({ items, today, alreadyToday = 0, cap = DEFAULT_DAILY_CAP }) {
  const room = Math.max(0, cap - alreadyToday);
  const due = items.filter((i) => !i.skipped && diffDays(i.sendOn, today) <= 0);
  return { selected: due.slice(0, room), deferred: due.slice(room) };
}

// lib/design/suggestions.ts
//
// "מה מפרסמים השבוע": the posts the app can propose before she asks,
// from what it already knows. Pure - no fetching, no dates read from the
// clock - so the studio can render them instantly and a test can pin them.
//
//   occasion   a holiday or season whose window is open (lib/design/holidays)
//   quiet day  the emptiest working day in the coming week -> "התפנה תור"
//   treatment  a service she offers and has never posted about
//   review     a saved review she has not turned into a post lately
//   tip        the week's tip, rotating through the knowledge templates
//
// Each suggestion names a template key and the values to prefill; the
// studio draws it with her branding and opens it as a design on tap.

import { upcomingHolidays, holidayPrompt, type Upcoming } from './holidays.ts';
import { DEFAULT_BUSINESS_FIELDS, isFieldKey, type FieldKey } from '../businessFields.ts';

export type Suggestion = {
  key: string;
  /** Hebrew, one line: why this, now. */
  reason: string;
  templateKey: string;
  values: Record<string, string>;
  /** The occasion behind it, when there is one (for the days-left badge). */
  upcoming?: Upcoming;
};

export type SuggestionInput = {
  today?: Date;
  /** Appointments in the coming days: only the date matters. */
  appointments?: { date?: string | null; status?: string | null }[] | null;
  /** field, when present, is service_prices.field — which seed menu this
   *  service came from. Absent (a legacy or hand-typed row) is treated as
   *  cosmetics, same as everywhere else field is read defensively. */
  services?: { name?: string | null; field?: string | null }[] | null;
  /** Her saved designs: what she already posted about. */
  designs?: { template_key?: string | null; values?: Record<string, unknown> | null; created_at?: string | null }[] | null;
  reviews?: unknown[] | null;
  /** Days she works, 0 = Sunday; all but Saturday by default. */
  workingDays?: number[] | null;
  /** Which holiday templates exist, by occasion key -> template key. */
  holidayTemplates?: Record<string, string> | null;
  /** Her business_fields (lib/businessFields.ts). Omitted or empty defaults
   *  to cosmetics, matching businessFieldsOf's own fallback — every caller
   *  from before this existed keeps producing exactly the suggestions it
   *  always did. */
  fields?: FieldKey[] | null;
};

const DAY = 86_400_000;
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** One rotation per field — the week's tip cycles through it, that field's
 *  own template keys only. nails has one entry today; a rotation of one
 *  repeats weekly rather than crashing, which is the honest state of the
 *  content, not a bug — see lib/design/templates/cream/nails.ts. */
const TIP_ROTATION_BY_FIELD: Record<FieldKey, string[]> = {
  cosmetics: ['tip-feed', 'routine-feed', 'info-feed', 'myths-feed', 'faq-feed', 'skin-health-feed'],
  nails: ['nail-tip-gel-last-feed', 'nail-tip-dont-feed', 'nail-faq-feed', 'nail-myths-feed'],
};

/** Where "you've never posted about X" points, per field. */
const UNPOSTED_FALLBACK_BY_FIELD: Record<FieldKey, { templateKey: string; kicker: string }> = {
  cosmetics: { templateKey: 'facial-feed', kicker: 'טיפול' },
  nails: { templateKey: 'nail-design-showcase-feed', kicker: 'עיצוב' },
};

/** Nails-only: which season's palette template a design-idea nudge points
 *  at, and the prompt that goes with it. Cosmetics has no equivalent — a
 *  facial has no seasonal colour palette to shoot ahead of a season the way
 *  a nail set does. Distinct from the ordinary occasion suggestion below:
 *  that one invites her to POST an already-drawn seasonal card; this one
 *  invites her to go SHOOT a fresh set for the look, matching the brief's
 *  own example ("חורף: גוונים עמוקים, תרצי סט לצלם?"). Both can legitimately
 *  appear the same week. */
const SEASON_DESIGN_IDEA: Partial<Record<string, { templateKey: string; prompt: string }>> = {
  summer: { templateKey: 'nail-summer-palette-feed', prompt: 'גוונים בהירים ונועזים — תרצי סט לצלם?' },
  winter: { templateKey: 'nail-winter-palette-feed', prompt: 'גוונים עמוקים — תרצי סט לצלם?' },
  spring: { templateKey: 'nail-spring-palette-feed', prompt: 'פסטלים עדינים — תרצי סט לצלם?' },
  autumn: { templateKey: 'nail-autumn-palette-feed', prompt: 'טרקוטה וחום חם — תרצי סט לצלם?' },
};

/** A seasonal design-idea nudge, when nails is active and a season window is
 *  open — a production prompt, not a posting one. Exported separately (and
 *  folded into suggestPosts below) so a caller that only wants design ideas,
 *  not the full weekly list, can ask for just this. */
export function designIdeaSuggestion(input: SuggestionInput): Suggestion | null {
  const fields = input.fields && input.fields.length ? input.fields : DEFAULT_BUSINESS_FIELDS;
  if (!fields.includes('nails')) return null;
  const today = input.today || new Date();
  const season = upcomingHolidays(today).find((u) => SEASON_DESIGN_IDEA[u.holiday.key]);
  if (!season) return null;
  const idea = SEASON_DESIGN_IDEA[season.holiday.key]!;
  return { key: `design-idea:${season.holiday.key}`, reason: `${season.holiday.name}: ${idea.prompt}`, templateKey: idea.templateKey, values: {}, upcoming: season };
}

const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The emptiest working day in the next seven, when the week is not uniformly full. */
export function quietDay(input: SuggestionInput): { date: string; weekday: string; count: number } | null {
  const today = input.today || new Date();
  const working = input.workingDays && input.workingDays.length ? input.workingDays : [0, 1, 2, 3, 4, 5];
  const counts = new Map<string, number>();
  for (const a of input.appointments || []) {
    if (!a?.date || a.status === 'cancelled') continue;
    counts.set(String(a.date).slice(0, 10), (counts.get(String(a.date).slice(0, 10)) || 0) + 1);
  }
  const days: { date: string; weekday: string; count: number }[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today.getTime() + i * DAY);
    const dow = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d) === 'Sun' ? 0 : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d)));
    if (!working.includes(dow)) continue;
    const date = isoDay(d);
    days.push({ date, weekday: WEEKDAYS[dow], count: counts.get(date) || 0 });
  }
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.count));
  const min = days.reduce((a, b) => (b.count < a.count ? b : a));
  // A uniformly busy week has no quiet day worth a post; an empty calendar has nothing to fill.
  if (max === 0 || min.count >= max) return null;
  return min;
}

/** The first service she has never written a post about. */
export function unpostedService(input: SuggestionInput): string | null {
  const posted = (input.designs || []).flatMap((d) => Object.values(d.values || {}).map(clean)).filter(Boolean).map((s) => s.toLowerCase());
  for (const s of input.services || []) {
    const name = clean(s?.name);
    if (!name) continue;
    if (!posted.some((p) => p.includes(name.toLowerCase()))) return name;
  }
  return null;
}

/** Up to `max` suggestions, occasions first. */
export function suggestPosts(input: SuggestionInput, max = 5): Suggestion[] {
  const today = input.today || new Date();
  const out: Suggestion[] = [];
  const templates = input.holidayTemplates || {};
  for (const u of upcomingHolidays(today)) {
    const templateKey = templates[u.holiday.key];
    if (!templateKey) continue;
    out.push({ key: `occasion:${u.holiday.key}`, reason: holidayPrompt(u), templateKey, values: {}, upcoming: u });
  }
  const idea = designIdeaSuggestion(input);
  if (idea) out.push(idea);
  const quiet = quietDay(input);
  if (quiet) {
    const [, m, d] = quiet.date.split('-');
    out.push({ key: `quiet:${quiet.date}`, reason: `יום ${quiet.weekday} נראה שקט ביומן. פוסט "התפנה תור"?`, templateKey: 'slot-opened-feed', values: { subline: `יום ${quiet.weekday}, ${Number(d)}.${Number(m)}` } });
  }
  const service = unpostedService(input);
  if (service) {
    // Which field the returned NAME belongs to, looked up rather than
    // carried by unpostedService itself — its return type (string | null)
    // is unchanged, since callers and tests already depend on that.
    const match = (input.services || []).find((s) => clean(s?.name) === service);
    const field = isFieldKey(match?.field) ? match!.field! : 'cosmetics';
    const fallback = UNPOSTED_FALLBACK_BY_FIELD[field] || UNPOSTED_FALLBACK_BY_FIELD.cosmetics;
    out.push({ key: `service:${service}`, reason: `עוד לא פרסמת על ${service}.`, templateKey: fallback.templateKey, values: { headline: service, kicker: fallback.kicker } });
  }
  const reviews = input.reviews || [];
  const recentReview = (input.designs || []).some((d) => d.template_key?.startsWith('review-') && d.created_at && today.getTime() - new Date(d.created_at).getTime() < 30 * DAY);
  if (reviews.length && !recentReview) out.push({ key: 'review', reason: 'יש לך ביקורת שמורה שעוד לא הפכה לפוסט.', templateKey: 'review-feed', values: {} });
  const week = Math.floor(today.getTime() / (7 * DAY));
  const fields = input.fields && input.fields.length ? input.fields : DEFAULT_BUSINESS_FIELDS;
  // The first field keeps the plain 'tip' key exactly as before — every
  // existing caller passes no `fields` at all and gets identical output,
  // byte for byte. A second active field (a dual-field tenant) adds its own
  // tip under a field-qualified key rather than crowding the first one out.
  fields.forEach((f, i) => {
    const rotation = TIP_ROTATION_BY_FIELD[f] || TIP_ROTATION_BY_FIELD.cosmetics;
    out.push({
      key: i === 0 ? 'tip' : `tip:${f}`,
      reason: 'הטיפ של השבוע, מוכן לפרסום.',
      templateKey: rotation[week % rotation.length],
      values: {},
    });
  });
  return out.slice(0, max);
}

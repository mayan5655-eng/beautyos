// lib/content/pack.ts
//
// Her weekly content plan (docs/specs/content-publishing.md, stage 1): which posts, on which days, with one caption per
// platform. The selection is the existing suggestPosts() (no AI): occasions, a quiet day, an unposted treatment, a saved
// review, the week's tip. ONE Claude call per plan writes the topic line and the Instagram + Facebook captions for every
// item at once (consistent tone, one cost), held to the claims guard like every post the app writes for her.
//
// Pure helpers here (slots, picking, prompt, parsing) so the test pins them; the Claude call is planCaptions().

import Anthropic from '@anthropic-ai/sdk';
import { trackedCreate } from '../ai/usage.ts';
import { MODELS, EFFORT } from '../ai/models.ts';
import { CLAIMS_RULE_HE, withClaimsGuard, fixHebrewSlips } from '../ai/claimsGuard.ts';
import { buildBusinessContext, personaLabel, parseClaudeJSON, type BusinessProfile } from '../ai/marketingAI.ts';
import type { Suggestion } from '../design/suggestions.ts';

export const PACK_CALL_SITE = 'content/pack';
// Captions she publishes as written: the writer model, like the post generator (lib/ai/postGenerator.ts).
export const PACK_MODEL = MODELS.writer;

export const PLATFORMS = ['instagram', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_HE: Record<Platform, string> = { instagram: 'אינסטגרם', facebook: 'פייסבוק' };

/** What each platform's counter enforces (Instagram's documented caption limit; Facebook is generous, kept short anyway). */
export const CAPTION_LIMITS: Record<Platform, { chars: number; hashtags: number }> = {
  instagram: { chars: 2200, hashtags: 30 },
  facebook: { chars: 5000, hashtags: 5 },
};

export type Preferences = { posting_days: number[]; post_hour: number; items_per_week: number; platforms: string[]; reminders: boolean };
export const DEFAULT_PREFERENCES: Preferences = { posting_days: [0, 2, 4], post_hour: 19, items_per_week: 3, platforms: ['instagram', 'facebook'], reminders: true };

export function cleanPreferences(raw: Partial<Preferences> | null | undefined): Preferences {
  const days = Array.isArray(raw?.posting_days) ? [...new Set(raw!.posting_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const hour = Number(raw?.post_hour);
  const count = Number(raw?.items_per_week);
  const platforms = Array.isArray(raw?.platforms) ? raw!.platforms.filter((p) => (PLATFORMS as readonly string[]).includes(p)) : [];
  return {
    posting_days: days.length ? days : DEFAULT_PREFERENCES.posting_days,
    post_hour: Number.isInteger(hour) && hour >= 6 && hour <= 23 ? hour : DEFAULT_PREFERENCES.post_hour,
    items_per_week: Number.isInteger(count) && count >= 1 && count <= 7 ? count : DEFAULT_PREFERENCES.items_per_week,
    platforms: platforms.length ? platforms : DEFAULT_PREFERENCES.platforms,
    reminders: raw?.reminders === false ? false : true,
  };
}

// ── Israel-time slots ─────────────────────────────────────────────────────────

const DAY = 86_400_000;
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' });
const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' });
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The Israel calendar day of an instant, YYYY-MM-DD. */
export const israelDay = (d: Date) => ymd.format(d);
/** 0 = Sunday, in Israel. */
export const israelDow = (d: Date) => DOW.indexOf(dowFmt.format(d));

/** The UTC instant of HH:00 on an Israel calendar day (DST-safe: tries the two possible offsets). */
export function israelHourToUtc(day: string, hour: number): Date {
  for (const off of [3, 2]) {
    const c = new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) - off * 3600_000);
    if (ymd.format(c) === day && Number(hourFmt.format(c)) === hour) return c;
  }
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) - 2 * 3600_000);
}

/** The Sunday (Israel) that starts the week containing `d`, YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const dow = israelDow(d);
  return israelDay(new Date(d.getTime() - dow * DAY));
}

/**
 * The posting times for the next plan: the posting days in the 7 days starting tomorrow (Israel), at her hour, at most
 * `items_per_week` of them. Tomorrow, not today: a plan made at 22:00 must not schedule a post for 19:00 today.
 */
export function upcomingSlots(prefs: Preferences, now: Date): Date[] {
  const out: Date[] = [];
  for (let i = 1; i <= 7 && out.length < prefs.items_per_week; i++) {
    const d = new Date(now.getTime() + i * DAY);
    if (!prefs.posting_days.includes(israelDow(d))) continue;
    out.push(israelHourToUtc(israelDay(d), prefs.post_hour));
  }
  return out;
}

/** The suggestions this plan uses: in suggestPosts' own order (occasions first), one per slot. */
export function pickSuggestions(all: Suggestion[], count: number): Suggestion[] {
  return all.slice(0, Math.max(0, count));
}

// ── the AI call ─────────────────────────────────────────────────────────────

export type PackCaption = { topic: string; instagram: { caption: string; hashtags: string[] }; facebook: { caption: string } };

export function buildPackPrompt(profile: BusinessProfile, items: Array<{ key: string; reason: string; day: string }>): string {
  const list = items.map((it, i) => `${i + 1}. key "${it.key}" (${it.day}): ${it.reason}`).join('\n');
  return `את כותבת תוכן לרשתות עבור ${personaLabel(profile.fields)} בישראל. זו התוכנית שלה לשבוע הקרוב: לכל פוסט כתבי שורת נושא קצרה, טקסט לאינסטגרם וטקסט לפייסבוק.

== העסק ==
${buildBusinessContext(profile)}

== הפוסטים של השבוע ==
${list}

== כללים ==
- עברית טבעית, בגוף ראשון שלה (היא הכותבת), פונה ללקוחה בגוף שני נקבה. בלי סימני קריאה מיותרים, אימוג'י אחד לכל היותר.
- "topic": עד 8 מילים, מה הפוסט (היא תראה את זה בלוח התוכן).
- אינסטגרם: שורה ראשונה שעוצרת גלילה (פרט מוחשי, לא הכרזה), פסקאות קצרות, משפט קריאה לפעולה אחד בסוף ("שלחי הודעה" / "הקישור בביו"). 3 עד 5 האשטגים רלוונטיים בעברית ובאנגלית, בשדה hashtags ולא בתוך הטקסט. עד 120 מילים.
- פייסבוק: חם וקצת יותר מפורט מאינסטגרם, אותו רעיון במילים אחרות (לא העתק), בלי האשטגים או עם אחד לכל היותר, עד 120 מילים.
- אל תמציאי טיפולים, מחירים, מבצעים או הבטחות. מחיר או מבצע רק אם הם מופיעים בפרטי העסק.
- כל פוסט שונה מהאחרים בפתיחה ובמבנה.

${CLAIMS_RULE_HE}

החזירי JSON בלבד, בלי הסברים:
{ "items": [ { "key": "...", "topic": "...", "instagram": { "caption": "...", "hashtags": ["#..."] }, "facebook": { "caption": "..." } } ] }`;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');

/** Claude's answer, by key: unknown keys dropped, hashtags well formed, every key must come back with both captions. */
export function parsePack(text: string, keys: string[]): Record<string, PackCaption> {
  const raw = parseClaudeJSON<{ items?: unknown }>(text);
  const out: Record<string, PackCaption> = {};
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const key = clean(r.key, 200);
    if (!keys.includes(key) || out[key]) continue;
    const ig = (r.instagram && typeof r.instagram === 'object' ? r.instagram : {}) as Record<string, unknown>;
    const fb = (r.facebook && typeof r.facebook === 'object' ? r.facebook : {}) as Record<string, unknown>;
    const hashtags = (Array.isArray(ig.hashtags) ? ig.hashtags : [])
      .map((h) => clean(h, 60).replace(/\s+/g, ''))
      .map((h) => (h && !h.startsWith('#') ? `#${h}` : h))
      .filter((h) => /^#[^\s#]{1,50}$/.test(h))
      .slice(0, CAPTION_LIMITS.instagram.hashtags);
    const igCaption = clean(ig.caption, CAPTION_LIMITS.instagram.chars);
    const fbCaption = clean(fb.caption, CAPTION_LIMITS.facebook.chars);
    if (!igCaption || !fbCaption) continue;
    out[key] = { topic: clean(r.topic, 120), instagram: { caption: igCaption, hashtags }, facebook: { caption: fbCaption } };
  }
  const missing = keys.filter((k) => !out[k]);
  if (missing.length) throw new Error(`content/pack: no captions for ${missing.length} item(s)`);
  return out;
}

const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/** One Claude call for the whole plan, metered as PACK_CALL_SITE (that is what the monthly cap counts). */
export async function planCaptions(profile: BusinessProfile, items: Array<{ key: string; reason: string; day: string }>, tenantId: string | null): Promise<Record<string, PackCaption>> {
  const keys = items.map((i) => i.key);
  const result = await withClaimsGuard(async (correction) => {
    const message = await trackedCreate(anthropic(), {
      model: PACK_MODEL,
      // Room for Opus to think AND write every caption of the week: thinking counts against this.
      max_tokens: 12000,
      output_config: { effort: EFFORT.captions },
      messages: [{ role: 'user', content: buildPackPrompt(profile, items) + (correction ? `\n\n${correction}` : '') }],
    }, { tenantId, callSite: correction ? PACK_CALL_SITE + '/retry' : PACK_CALL_SITE });
    const block = message.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('content/pack: no text from Claude');
    return parsePack(block.text, keys);
  },
  (r) => Object.values(r).flatMap((c) => [c.topic, c.instagram.caption, ...c.instagram.hashtags, c.facebook.caption]),
  buildBusinessContext(profile));
  for (const c of Object.values(result)) {
    c.topic = fixHebrewSlips(c.topic);
    c.instagram.caption = fixHebrewSlips(c.instagram.caption);
    c.facebook.caption = fixHebrewSlips(c.facebook.caption);
  }
  return result;
}

/** "יום שלישי 22.10, 19:00" for a planned time. */
export function slotLabelHe(d: Date): string {
  const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const [, m, day] = israelDay(d).split('-');
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return `יום ${names[israelDow(d)]} ${Number(day)}.${Number(m)}, ${hm}`;
}

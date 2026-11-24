// lib/ai/voiceExamples.ts
//
// "פוסטים שאני אוהבת": up to three pieces of writing she picks as the voice
// the AI should write in. Stored in settings.branding.voice_examples (jsonb,
// so no migration), read by loadBusinessProfile, rendered into prompts by
// buildVoiceBlock below.
//
// Why examples and not another adjective: a "סגנון הפנייה" of "חם ואישי"
// tells a model almost nothing; two real captions tell it sentence length,
// emoji habits, how she opens, how she signs off. Every generator that writes
// public copy for her was working from adjectives.
//
// Deliberately NOT part of buildBusinessContext. That string is also the
// claims guard's source of truth (lib/ai/claimsGuard.ts): whatever is in it
// counts as something she said about her treatments. An example she "loves"
// may be another salon's post, or an old one with a price or an offer that is
// no longer true, so it may teach the voice and nothing else. The block says
// so to the model, and keeping it out of the guard's source enforces it.

export const VOICE_EXAMPLES_MAX = 3;
export const VOICE_EXAMPLE_MAX_CHARS = 1200;
/** Shorter than this is a slogan, not a voice sample. */
export const VOICE_EXAMPLE_MIN_CHARS = 20;

/** Normalise whatever is stored (array, or an odd legacy string) to at most three usable samples. */
export function cleanVoiceExamples(v: unknown): string[] | undefined {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const s = x.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, VOICE_EXAMPLE_MAX_CHARS).trim();
    if (s.length < VOICE_EXAMPLE_MIN_CHARS || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= VOICE_EXAMPLES_MAX) break;
  }
  return out.length > 0 ? out : undefined;
}

/** The prompt section, or '' when she has not added any. */
export function buildVoiceBlock(examples: string[] | null | undefined): string {
  const list = cleanVoiceExamples(examples);
  if (!list) return '';
  const body = list.map((e, i) => `--- דוגמה ${i + 1} ---\n${e}`).join('\n\n');
  return `== הקול שלה: טקסטים שהיא בחרה כדוגמה לאיך היא רוצה להישמע ==
${body}

איך להשתמש בדוגמאות:
- חקי את הקול בלבד: אורך המשפטים, איך היא פותחת ואיך היא מסיימת, כמה היא פונה ישירות, אם ואיך היא משתמשת באימוג'י, רמת הרשמיות.
- אל תעתיקי משפט, סלוגן או מבנה שלם מהדוגמאות. כתבי טקסט חדש באותו קול.
- אל תיקחי מהדוגמאות שום עובדה: לא טיפול, לא מחיר, לא מבצע, לא תוצאה ולא טענה על תחושה או התאמה. ייתכן שהן ישנות או של עסק אחר. עובדות מגיעות רק מפרטי העסק, וכל כללי הדיוק חלים במלואם.
- כשכלל ניסוח מפורש בהוראות סותר את הדוגמאות, הכלל המפורש קובע.`;
}

/**
 * "זה נשמע כמוני" from the post editor: her newest text goes first, an identical one is not stored twice, and the
 * oldest falls off past three. Returns null for a text too short to teach a voice, so the route can say so.
 */
export function addVoiceExample(existing: unknown, text: unknown): string[] | null {
  const fresh = cleanVoiceExamples(typeof text === 'string' ? [text] : []);
  if (!fresh) return null;
  const rest = (cleanVoiceExamples(Array.isArray(existing) ? existing : []) || []).filter((e) => e !== fresh[0]);
  return [fresh[0], ...rest].slice(0, VOICE_EXAMPLES_MAX);
}

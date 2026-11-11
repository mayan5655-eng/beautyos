// lib/i18n/core.ts
//
// Languages for Kalmea: Hebrew (the default, and the only language until 2026-11-11), Arabic and English.
//
// ── Where the choice lives ────────────────────────────────────────────────
// settings.branding.language ('he' | 'ar' | 'en'). Not a new column, on purpose: `branding` is the jsonb bag every
// public page already receives (get_public_branding returns it to anon, /api/forms, /api/confirm and the rest read
// it with the service role), so the business's language reaches her booking page, cancel page, client page and
// health declaration with no migration and no change to any public SQL function. A missing or unknown value is
// Hebrew, so nothing changes for a tenant that never opens the setting.
//
// ── Dictionaries ──────────────────────────────────────────────────────────
// Every entry carries all three languages side by side ({ he, ar, en }), so a missing translation is a type error and
// test-i18n.ts can check every dictionary in one pass. Hebrew and Arabic address the reader in the feminine, like the
// rest of the product. `{name}` placeholders are filled by t().

export const LANGS = ['he', 'ar', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'he';

/** Each language in its own script, the way a picker shows it. */
export const LANG_LABELS: Record<Lang, string> = { he: 'עברית', ar: 'العربية', en: 'English' };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** Anything into a language: unknown, empty or malformed is Hebrew. Accepts "EN", "ar-IL", " en ". */
export const normalizeLang = (v: unknown): Lang => {
  if (typeof v !== 'string') return DEFAULT_LANG;
  const base = v.trim().toLowerCase().split(/[-_]/)[0];
  return isLang(base) ? base : DEFAULT_LANG;
};

export const dirOf = (lang: Lang): 'rtl' | 'ltr' => (lang === 'en' ? 'ltr' : 'rtl');

/** The business's language from a settings row (or a public settings row): settings.branding.language. */
export const langOfSettings = (settings: unknown): Lang => {
  const b = settings && typeof settings === 'object' ? (settings as { branding?: unknown }).branding : null;
  return normalizeLang(b && typeof b === 'object' ? (b as { language?: unknown }).language : undefined);
};

/**
 * The locale for Intl dates and numbers. Arabic keeps Western digits (latn): that is what Arabic speakers in Israel
 * read on prices, phone numbers and times, and it keeps a ₪ amount the same digits in every language.
 */
export const localeOf = (lang: Lang): string => (lang === 'ar' ? 'ar-u-nu-latn' : lang === 'en' ? 'en-GB' : 'he-IL');

/** The Web Speech API's language for voice commands: what the microphone listens for. */
export const speechLangOf = (lang: Lang): string => (lang === 'ar' ? 'ar-IL' : lang === 'en' ? 'en-US' : 'he-IL');

/** Open Graph locale. */
export const ogLocaleOf = (lang: Lang): string => (lang === 'ar' ? 'ar_AR' : lang === 'en' ? 'en_US' : 'he_IL');

export type Entry = Record<Lang, string>;
export type Dict = Record<string, Entry>;
export type Vars = Record<string, string | number | null | undefined>;

const fill = (s: string, vars?: Vars): string =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m)) : s;

/** One entry in one language. A key the dictionary lacks returns the key itself, so a slip shows, never crashes. */
export function translate(dict: Dict, lang: Lang, key: string, vars?: Vars): string {
  const e = dict[key];
  if (!e) return key;
  return fill(e[lang] ?? e.he, vars);
}

export type T = (key: string, vars?: Vars) => string;

/** t() bound to a dictionary and a language. */
export const makeT = (dict: Dict, lang: Lang): T => (key, vars) => translate(dict, lang, key, vars);

/** A one-off inline entry: pick({ he, ar, en }, lang). For a string used once, next to the code that shows it. */
export const pick = (e: Entry, lang: Lang, vars?: Vars): string => fill(e[lang] ?? e.he, vars);

// lib/i18n/ownerLang.ts
//
// The owner's app in her language (settings.branding.language). Client only.
//
// The Arabic and English tables are separate chunks, loaded only when that language is chosen: a Hebrew business (all
// of them until now) downloads nothing more than before. The choice is also kept in localStorage, so the next visit
// starts in her language before her settings arrive instead of flashing Hebrew first.
import { DEFAULT_LANG, dirOf, normalizeLang, type Lang } from './core.ts';
import { setActiveLang, getActiveLang, type Table } from './tr.ts';

const KEY = 'kalmea_owner_lang';
const cache: Partial<Record<Lang, Table>> = {};

async function tableFor(lang: Lang): Promise<Table | null> {
  if (lang === 'he') return null;
  if (cache[lang]) return cache[lang]!;
  const mod = lang === 'ar' ? await import('./strings/owner.ar.json') : await import('./strings/owner.en.json');
  const t = ((mod as { default?: Table }).default || mod) as Table;
  cache[lang] = t;
  return t;
}

/** The language this browser last ran her app in (or Hebrew). */
export function cachedOwnerLang(): Lang {
  try { return normalizeLang(window.localStorage.getItem(KEY)); } catch { return DEFAULT_LANG; }
}

/**
 * Switch the owner's app to `lang`: load its table, make tr() use it, move <html lang dir>, remember it.
 * Resolves to the language now active. A table that fails to load leaves the app in the language it was in.
 */
export async function applyOwnerLang(lang: Lang): Promise<Lang> {
  try {
    const table = await tableFor(lang);
    setActiveLang(lang, table);
  } catch {
    return getActiveLang();
  }
  try {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dirOf(lang));
  } catch { /* no document */ }
  try { window.localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  return lang;
}

/**
 * Development only: localStorage "kalmea_lang_override" = ar | en shows the app in that language without saving it
 * (to check a screen on the shared demo business). Always null in a production build.
 */
export function devLangOverride(): Lang | null {
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const v = window.localStorage.getItem('kalmea_lang_override');
    return v ? normalizeLang(v) : null;
  } catch { return null; }
}

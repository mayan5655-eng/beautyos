// lib/i18n/tr.ts
//
// Translating by the Hebrew text itself (gettext style): tr("קביעת תור") is "Book an appointment" in English.
//
// ── Why the Hebrew is the key ─────────────────────────────────────────────
// The product was written in Hebrew, in ~1800 files, with no keys. Naming a key for every one of thousands of strings
// would be a rewrite; looking the Hebrew up is not. It also fails safe: a string with no translation shows the
// Hebrew it always showed, a Hebrew business never loads a table at all, and a lookup of something that is not UI
// text (her client's name, her own service names) finds nothing and comes back unchanged.
//
// Placeholders: a template literal becomes tr("נשארו {0} שאלות", [n]). The tables (lib/i18n/strings/*) keep {0}, {1}.
//
// Two ways in:
//   * tr() / trv(): the owner's app, which is client-only. One module-level language, set by setActiveLang() when
//     her settings load; the app re-renders on a change, so every screen reads the new one.
//   * useTr(): pages a client opens (booking, cancel, form...). Those also render on the server, where one module
//     variable would leak one request's language into another, so the language comes from <LangProvider> instead.

import { DEFAULT_LANG, dirOf, type Lang } from './core.ts';

export type Table = Record<string, string>;
export type Args = ReadonlyArray<unknown> | Record<string, unknown>;

const fill = (s: string, args?: Args): string => {
  if (!args) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => {
    const v = Array.isArray(args) ? args[Number(k)] : (args as Record<string, unknown>)[k];
    return v === undefined || v === null ? '' : String(v);
  });
};

/** Look `he` up in `table`. Missing, empty or no table: the Hebrew. Placeholders are filled either way. */
export function trWith(table: Table | null | undefined, he: string, args?: Args): string {
  const hit = table && Object.prototype.hasOwnProperty.call(table, he) ? table[he] : '';
  return fill(hit || he, args);
}

// ── The owner's app: one active language ──────────────────────────────────

let activeLang: Lang = DEFAULT_LANG;
let activeTable: Table | null = null;

export const getActiveLang = (): Lang => activeLang;

/** Called by the app once a language's table is loaded (or with 'he' and null). */
export function setActiveLang(lang: Lang, table: Table | null) {
  activeLang = lang;
  activeTable = lang === 'he' ? null : table;
}

/** A Hebrew UI string in the owner's language. */
export function tr(he: string, args?: Args): string {
  return activeTable ? trWith(activeTable, he, args) : fill(he, args);
}

/**
 * A value that MAY be one of the product's Hebrew strings (a label from a constant list, a stored "כן"): translated
 * when it is one, anything else passed through untouched (numbers, elements, her own words).
 */
export function trv<T>(value: T): T | string {
  if (!activeTable || typeof value !== 'string') return value;
  const hit = Object.prototype.hasOwnProperty.call(activeTable, value) ? activeTable[value] : '';
  return hit || value;
}

/** The owner's app direction now: 'ltr' for English, 'rtl' for Hebrew and Arabic. */
export const uiDir = (): 'rtl' | 'ltr' => dirOf(activeLang);

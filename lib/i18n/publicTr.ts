// lib/i18n/publicTr.ts
//
// The tables for the pages a client opens, and tr() for a given language outside React (server components,
// helpers). No "use client": a server component calls trFor(lang) directly. Hooks are in lib/i18n/useTr.ts.
import type { Lang } from './core.ts';
import { trWith, type Args, type Table } from './tr.ts';
import PUBLIC_AR from './strings/public.ar.json' with { type: 'json' };
import PUBLIC_EN from './strings/public.en.json' with { type: 'json' };

export const PUBLIC_TABLES: Record<Lang, Table | null> = { he: null, ar: PUBLIC_AR as Table, en: PUBLIC_EN as Table };

export type Tr = (he: string, args?: Args) => string;

export const trFor = (lang: Lang | null | undefined): Tr => {
  const table = PUBLIC_TABLES[lang || 'he'] || null;
  return (he, args) => trWith(table, he, args);
};

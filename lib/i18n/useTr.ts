"use client";
// lib/i18n/useTr.ts
//
// tr() for the pages a client opens (booking, cancel, review, payment, voucher, waiting list): the language comes
// from the nearest <LangProvider> (her business's language), or from `override` in a page that learns the language
// from its own fetch. The tables are imported statically (lib/i18n/publicTr.ts), so the server renders the right
// words and the browser hydrates the same ones. See lib/i18n/tr.ts for why the Hebrew is the key.
import { useMemo } from 'react';
import type { Lang } from './core.ts';
import { useLang } from './react.tsx';
import { trFor, type Tr } from './publicTr.ts';

export type { Tr };

export function useTr(override?: Lang | null): Tr {
  const ctx = useLang();
  const lang = override || ctx;
  return useMemo(() => trFor(lang), [lang]);
}

"use client";
// lib/i18n/react.tsx
//
// The client half of lib/i18n/core.ts: a context for the language, a hook that keeps <html lang dir> in step with it,
// and the small picker the public pages and the health declaration show.
//
// <html> itself is rendered once by app/layout.tsx as Hebrew/RTL (static, so every page can still be prerendered).
// A page in another language wraps its content in an element with its own dir and lang (correct in the server HTML,
// before any script runs), and useDocumentLang() then moves <html> too, so the scrollbar side, native form controls
// and anything portalled to <body> follow.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANG, LANGS, LANG_LABELS, dirOf, makeT, type Dict, type Lang, type T } from './core.ts';

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = (): Lang => useContext(LangContext);

/** t() for a dictionary in the current language. */
export function useT(dict: Dict, langOverride?: Lang): T {
  const ctx = useContext(LangContext);
  const lang = langOverride || ctx;
  return useMemo(() => makeT(dict, lang), [dict, lang]);
}

/** Moves <html lang dir> to `lang` while mounted. Hebrew is the document's own state, so it needs no restore. */
export function useDocumentLang(lang: Lang | null | undefined) {
  useEffect(() => {
    if (!lang || typeof document === 'undefined') return;
    const el = document.documentElement;
    el.setAttribute('lang', lang);
    el.setAttribute('dir', dirOf(lang));
  }, [lang]);
}

/**
 * Three buttons, each language in its own script. Used on the health declaration (the client chooses, whatever the
 * business's language) and on the public pages. role=radiogroup so a screen reader hears one choice of three.
 */
export function LangPicker({
  value, onChange, label, testId = 'lang-picker', compact = false,
}: { value: Lang; onChange: (l: Lang) => void; label: string; testId?: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId}
      style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.7)', border: '1px solid var(--pc-soft, #E5E0EA)' }}>
      {LANGS.map((l) => {
        const on = l === value;
        return (
          <button key={l} type="button" role="radio" aria-checked={on} lang={l} dir={dirOf(l)} data-testid={`${testId}-${l}`}
            onClick={() => { if (!on) onChange(l); }}
            style={{
              minHeight: compact ? 32 : 36, minWidth: 44, padding: compact ? '4px 10px' : '6px 12px', borderRadius: 999, border: 'none',
              background: on ? 'var(--ink, #1F3A30)' : 'transparent', color: on ? '#fff' : 'var(--ink, #1F3A30)',
              fontSize: 14, fontWeight: on ? 700 : 600, fontFamily: 'inherit', cursor: on ? 'default' : 'pointer', lineHeight: 1.2,
            }}>
            {LANG_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}

/** useDocumentLang as an element, for a server component to drop next to a page. Renders nothing. */
export function DocumentLang({ lang }: { lang: Lang }) {
  useDocumentLang(lang);
  return null;
}

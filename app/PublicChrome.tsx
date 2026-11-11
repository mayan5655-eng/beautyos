// app/PublicChrome.tsx
//
// The frame every public page shares (see the "Public pages: one brand language" block in globals.css for the rule).
//
// (The <main> landmark comes from app/layout.tsx - only it may render one - so the frame uses a div.)
//   <PublicPage primary={her colour} owner="her">   a business's page: her accent tokens, a small Kalmea mark at the bottom
//   <PublicPage owner="kalmea">                     Kalmea's own page (404, error): no business, no "powered by"
//   <BusinessHeader logoUrl name />                 HER logo (or her name) first, large - the most prominent thing on the page
//   <LineIcon src />                                a brand line icon for an empty / error state
//
// Added 2026-10-06. Before this each page carried its own copy of a wrapper (confirm, review, claim, skin-scan,
// community, both 404s and the error screen had six different ones): different fonts, a different corner radius on every
// card, her logo at 48-52px, and no Kalmea mark at all on the pages that were not the booking page.
//
// Server- and client-safe: no hooks, no browser APIs.

import type { CSSProperties, ReactNode } from 'react';
import { accentStyle } from '@/lib/theme';
import { FLOWER_WATERMARK, LOGO_TEXT, LOGO_TEXT_W, LOGO_TEXT_H } from '@/lib/brand';
import BrandImage from '@/app/BrandImage';
import { trFor } from "@/lib/i18n/publicTr";
import { dirOf, normalizeLang, type Lang } from "@/lib/i18n/core";

/** The page's one quiet flower, in the corner behind everything (a page that keeps its own frame uses this directly). */
export function Watermark({ style }: { style?: CSSProperties }) {
  return <BrandImage className="pub-wm" src={FLOWER_WATERMARK} width={220} height={220} aria-hidden alt="" style={style} />;
}

export function PublicPage({
  children, primary = null, owner = 'her', maxWidth = 420, style, lang: langIn = 'he',
}: {
  /** The business's language (lib/i18n): sets dir and lang on the page, and the "powered by" line. */
  lang?: Lang | null;
  children: ReactNode;
  /** Her primary colour (settings.primary_color). Ignored for owner="kalmea". */
  primary?: string | null;
  owner?: 'her' | 'kalmea';
  maxWidth?: number;
  style?: CSSProperties;
}) {
  const lang = normalizeLang(langIn);
  return (
    <div dir={dirOf(lang)} lang={lang} className="pub-page" style={{ ...(owner === 'her' ? accentStyle(primary) : {}), ...style }}>
      <Watermark />
      <div className="pub-main" style={{ maxWidth }}>{children}</div>
      {owner === 'her' && <PoweredBy lang={lang} />}
    </div>
  );
}

/** Kalmea, small, at the bottom of a business's page. Never competes with her. */
export function PoweredBy({ lang = 'he' }: { lang?: Lang | null } = {}) {
  const tr = trFor(lang);
  return (
    <div className="pub-powered">
      <span>{tr("מופעל על ידי")}</span>
      <BrandImage src={LOGO_TEXT} alt="Kalmea" width={66} height={Math.round(66 * LOGO_TEXT_H / LOGO_TEXT_W)} />
    </div>
  );
}

/** Her logo, large and uncropped, then her name; with neither, nothing (no empty gap). */
export function BusinessHeader({ logoUrl, name, lang = 'he' }: { logoUrl?: string | null; name?: string | null; lang?: Lang | null }) {
  const tr = trFor(lang);
  if (!logoUrl && !name) return null;
  return (
    <div className="pub-biz">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name || tr("לוגו")} width={220} height={96} />
      ) : null}
      {name ? <p className="pub-biz-name">{name}</p> : null}
      <span className="pub-biz-rule" aria-hidden />
    </div>
  );
}

/** A brand line icon for an empty or error state (lib/brand ICON_*). */
export function LineIcon({ src }: { src: string }) {
  return <BrandImage className="pub-icon" src={src} width={60} height={60} aria-hidden alt="" />;
}

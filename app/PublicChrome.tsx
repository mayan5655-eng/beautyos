// app/PublicChrome.tsx
//
// The frame every public page shares (see the "Public pages: one brand language" block in globals.css for the rule).
//
// (The <main> landmark comes from app/layout.tsx - only it may render one - so the frame uses a div.)
//   <PublicPage primary={her colour} owner="her">   a business's page: her accent tokens, a small Kalmea mark at the bottom
//   <PublicPage owner="kalmea">                     Kalmea's own page (404, error, a link that names no business): Kalmea's
//                                                   wordmark alone under the card, so the page is somebody's (2026-11-27)
//   <StatusMark kind colour />                       the one stroked mark a status page shows: tick, cross, info, ask
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
      {owner === 'her' ? <PoweredBy lang={lang} /> : <KalmeaMark />}
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

/** Kalmea's wordmark alone, under a page that belongs to no business (an invalid link, a 404). */
export function KalmeaMark() {
  return (
    <div className="pub-mark">
      <BrandImage src={LOGO_TEXT} alt="Kalmea" width={66} height={Math.round(66 * LOGO_TEXT_H / LOGO_TEXT_W)} />
    </div>
  );
}

/** The one stroked mark of a status page (signed, confirmed, could not load). Monochrome on purpose: no colour emoji. */
export function StatusMark({ kind, colour = 'var(--pc-deep)' }: { kind: 'tick' | 'cross' | 'info' | 'ask'; colour?: string }) {
  const common = { width: 58, height: 58, fill: 'none', stroke: colour, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, style: { display: 'block', margin: '0 auto 14px' } };
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9.2" />
      {kind === 'tick' && <path d="M7.8 12.4l2.9 2.9 5.5-5.9" />}
      {kind === 'cross' && <path d="M9 9l6 6M15 9l-6 6" />}
      {kind === 'info' && <><path d="M12 11v5.4" /><circle cx="12" cy="7.9" r="0.9" fill={colour} stroke="none" /></>}
      {kind === 'ask' && <><path d="M9.4 9.4a2.7 2.7 0 1 1 3.4 3.2c-.6.2-.9.8-.9 1.5v.4" /><circle cx="12" cy="17.4" r="0.9" fill={colour} stroke="none" /></>}
    </svg>
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

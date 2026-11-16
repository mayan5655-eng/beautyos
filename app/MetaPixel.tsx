'use client';

// app/MetaPixel.tsx
//
// Kalmea's own Meta Pixel, for the landing page and the signup page ONLY (lib/metaPixel.ts says why and where).
// Renders nothing at all while NEXT_PUBLIC_META_PIXEL_ID is empty.
//
// Consent first (2026-11-16): the pixel sets Meta's _fbp cookie, so it loads only after the visitor taps "אישור" on the
// small bar below. Until then no fbq, no script, no cookie. "לא תודה" is remembered too, so the bar does not come back.

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { metaPixelId, trackPageView, META_PIXEL_SCRIPT_SRC, readAdConsent, saveAdConsent, type AdConsent } from '@/lib/metaPixel';
import { NO_TRACK_KEY } from './PublicAnalytics';

// The owner's own browser, marked once with ?no-track=1 (app/PublicAnalytics.tsx), is not counted here either.
// The query is handled here too, so ?no-track=1 works on whichever page she opens first (the landing or /signup).
const ownBrowser = () => {
  try {
    const q = window.location.search;
    if (/[?&]no-track=1(&|$)/.test(q)) localStorage.setItem(NO_TRACK_KEY, '1');
    if (/[?&]track=1(&|$)/.test(q)) localStorage.removeItem(NO_TRACK_KEY);
    return localStorage.getItem(NO_TRACK_KEY) === '1';
  } catch { return false; }
};

export default function MetaPixel() {
  const id = metaPixelId();
  const [load, setLoad] = useState(false);
  // undefined = not read yet (server render / first paint), so the bar never flashes for someone who already chose.
  const [consent, setConsent] = useState<AdConsent | undefined>(undefined);
  const [own, setOwn] = useState(false);

  useEffect(() => {
    if (!id) return;
    setOwn(ownBrowser());
    setConsent(readAdConsent());
  }, [id]);

  // One PageView per page she lands on, including a client-side move from the landing to /signup.
  useEffect(() => {
    if (!id || ownBrowser()) return;
    if (consent !== 'yes') return;
    trackPageView(id);
    setLoad(true);
  }, [id, consent]);

  if (!id) return null;
  const choose = (v: 'yes' | 'no') => { saveAdConsent(v); setConsent(v); };
  const showBar = consent === null && !own;
  if (!showBar && !load) return null;
  if (!showBar) return <Script id="kl-meta-pixel" src={META_PIXEL_SCRIPT_SRC} strategy="afterInteractive" />;

  return (
    <div
      role="region"
      aria-label="הסכמה למדידת מודעות"
      dir="rtl"
      style={{
        position: 'fixed', insetInline: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 60,
        maxWidth: 520, marginInline: 'auto', background: 'var(--k-cream)', color: 'var(--k-green)',
        border: '1px solid var(--k-sage)', borderRadius: 16, boxShadow: '0 8px 28px rgba(20,38,31,0.14)',
        padding: '12px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        fontSize: 'var(--t-sm, 14px)', lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, flex: '1 1 220px' }}>
        נשמח למדוד אילו מודעות מביאות אלינו נרשמות (Meta Pixel, עוגייה אחת). לא נשלחים שם, טלפון או אימייל.{' '}
        <Link href="/privacy" style={{ color: 'var(--k-green)', textDecoration: 'underline' }}>פרטים</Link>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => choose('no')}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--k-green)', background: 'transparent', color: 'var(--k-green)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
          לא תודה
        </button>
        <button type="button" onClick={() => choose('yes')}
          style={{ minHeight: 40, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--k-green)', color: 'var(--k-cream)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
          אישור
        </button>
      </div>
    </div>
  );
}

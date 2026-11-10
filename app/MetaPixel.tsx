'use client';

// app/MetaPixel.tsx
//
// Kalmea's own Meta Pixel, for the landing page and the signup page ONLY (lib/metaPixel.ts says why and where).
// Renders nothing at all while NEXT_PUBLIC_META_PIXEL_ID is empty.

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { metaPixelId, trackPageView, META_PIXEL_SCRIPT_SRC } from '@/lib/metaPixel';
import { NO_TRACK_KEY } from './PublicAnalytics';

// The owner's own browser, marked once with ?no-track=1 (app/PublicAnalytics.tsx), is not counted here either.
const ownBrowser = () => { try { return localStorage.getItem(NO_TRACK_KEY) === '1'; } catch { return false; } };

export default function MetaPixel() {
  const id = metaPixelId();
  const [load, setLoad] = useState(false);
  // One PageView per page she lands on, including a client-side move from the landing to /signup.
  useEffect(() => {
    if (!id || ownBrowser()) return;
    trackPageView(id);
    setLoad(true);
  }, [id]);
  if (!id || !load) return null;
  return <Script id="kl-meta-pixel" src={META_PIXEL_SCRIPT_SRC} strategy="afterInteractive" />;
}

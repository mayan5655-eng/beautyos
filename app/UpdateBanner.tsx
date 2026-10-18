'use client';
// app/UpdateBanner.tsx
//
// "יש גרסה חדשה של קלמיה" with an "עדכון" button, when the live deployment is newer than the code running here.
// An installed app on a phone resumes from memory when she comes back to it, so a fix can be live for hours while her
// phone runs the old code (2026-10-18: photo uploads stayed blocked on her phone an hour after the fix went live).
// Checks when the app comes back to the foreground and every 15 minutes while visible; never reloads by itself, so
// nothing she is typing is lost. Silent on any error and locally.
import { useEffect, useState } from 'react';
import { BUILD_ID } from '@/lib/buildId';

const EVERY_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

export default function UpdateBanner() {
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let last = 0;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = await r.json();
        if (typeof build === 'string' && build && build !== 'dev' && build !== BUILD_ID) setNewer(true);
      } catch { /* offline or blocked: say nothing */ }
    };
    const onVisible = () => { void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const t = setInterval(onVisible, EVERY_MS);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); clearInterval(t); };
  }, []);

  if (!newer) return null;
  return (
    <div role="status" dir="rtl" data-testid="update-banner"
      style={{ position: 'fixed', top: 'calc(8px + env(safe-area-inset-top, 0px))', insetInline: 12, zIndex: 1000, maxWidth: 480, margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 10px', borderRadius: 14,
        background: 'var(--k-green, #1F3A30)', color: '#FBF8F1', boxShadow: '0 10px 30px -12px rgba(0,0,0,.45)', fontSize: 14 }}>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>יש גרסה חדשה של קלמיה</span>
      <button type="button" onClick={() => window.location.reload()}
        style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, border: 'none', background: '#FBF8F1', color: '#1F3A30', fontWeight: 700, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>
        עדכון
      </button>
      <button type="button" onClick={() => setNewer(false)} aria-label="סגירה"
        style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, border: 'none', background: 'transparent', color: '#FBF8F1', fontSize: 18, cursor: 'pointer' }}>×</button>
    </div>
  );
}

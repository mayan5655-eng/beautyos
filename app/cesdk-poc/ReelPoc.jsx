'use client';

// app/cesdk-poc/ReelPoc.jsx
//
// Proof of concept, not a feature: a card on the reels tab (behind
// NEXT_PUBLIC_CESDK_POC=1) that builds the one template in buildReel.js from
// her real branding and exports an mp4 in HER browser. No server, no upload,
// nothing persisted. The engine is loaded from IMG.LY's CDN at click time, so
// there is no npm dependency to remove when this folder goes.
//
// Video export needs WebCodecs: Chrome and Edge on a desk or Android. Safari
// and iOS are not the target of a POC.

import { useMemo, useState } from 'react';
import { buildReel, SECONDS_PER_PHOTO } from './buildReel';
import { CESDK_CDN, CESDK_LICENSE } from './flag';

const DEFAULT_CAPTIONS = ['שלב 1: ניקוי עמוק · 15 דק׳', 'שלב 2: פילינג עדין · ₪120', 'התוצאה: עור זוהר · קבעי תור'];

// The engine module, loaded once from the CDN. The two comments keep both
// bundlers from trying to resolve a URL at build time.
let enginePromise = null;
const loadEngine = () => {
  if (!enginePromise) {
    enginePromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${CESDK_CDN}/index.js`).then((m) => m.default);
  }
  return enginePromise;
};

export default function ReelPoc({ settings }) {
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const gallery = useMemo(() => (Array.isArray(branding.gallery) ? branding.gallery.filter(Boolean) : []), [branding.gallery]);
  const [picked, setPicked] = useState(() => gallery.slice(0, 3));
  const [captions, setCaptions] = useState(DEFAULT_CAPTIONS);
  const [state, setState] = useState('idle'); // idle | loading | rendering | done | error
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');

  const togglePhoto = (url) => {
    setPicked((p) => (p.includes(url) ? p.filter((u) => u !== url) : p.length < 3 ? [...p, url] : p));
  };

  const render = async () => {
    setError(''); setVideoUrl(''); setProgress(0); setState('loading');
    let engine = null;
    try {
      const CreativeEngine = await loadEngine();
      engine = await CreativeEngine.init({ license: CESDK_LICENSE || undefined, baseURL: `${CESDK_CDN}/assets` });
      setState('rendering');
      const { page } = buildReel(engine, {
        photos: picked,
        captions,
        logoUrl: branding.logo_url || '',
        businessName: settings?.business_name || '',
        accent: settings?.primary_color || '#5B3E67',
        fontUri: `${window.location.origin}/design-fonts/Assistant.ttf`,
      });
      const blob = await engine.block.exportVideo(page, {
        mimeType: 'video/mp4',
        onProgress: (rendered, encoded, total) => setProgress(total ? Math.round((encoded / total) * 100) : 0),
      });
      setVideoUrl(URL.createObjectURL(blob));
      setState('done');
    } catch (e) {
      setError(String(e?.message || e));
      setState('error');
    } finally {
      try { engine?.dispose(); } catch { /* already gone */ }
    }
  };

  const busy = state === 'loading' || state === 'rendering';
  const input = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '9px 11px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)' };

  return (
    <div className="glass-card" style={{ padding: '22px 24px', marginTop: 18, border: '1px dashed var(--pc)' }}>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 700, marginBottom: 4 }}>POC · CE.SDK · לא לשימוש בייצור</p>
      <p style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>רילס 9:16 מהגלריה שלך</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>
        הלוגו, צבע המותג ושם העסק מההגדרות. בחרי עד שלוש תמונות מהגלריה וכתבי כתובית לכל אחת. הסרטון נבנה ומיוצא כאן, בדפדפן, בלי שרת.
        {!CESDK_LICENSE && ' בלי מפתח ניסיון הסרטון יוצא עם סימן מים של IMG.LY.'}
      </p>

      {gallery.length === 0 ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>אין תמונות בגלריה. העלי תמונות בהגדרות → גלריית תמונות, ואז חזרי לכאן.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {gallery.map((url) => {
            const idx = picked.indexOf(url);
            return (
              <button key={url} onClick={() => togglePhoto(url)} aria-pressed={idx >= 0} style={{ position: 'relative', width: 72, height: 96, padding: 0, border: idx >= 0 ? '3px solid var(--pc)' : '1px solid var(--line)', borderRadius: 'var(--r-xs)', overflow: 'hidden', background: 'none', cursor: 'pointer' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- her gallery URLs, unoptimised on purpose in a POC */}
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {idx >= 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'var(--pc)', color: 'var(--pc-contrast)', fontSize: 'var(--t-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {picked.map((url, i) => (
          <label key={url} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 600 }}>כתובית לתמונה {i + 1} · שניות {i * SECONDS_PER_PHOTO}–{(i + 1) * SECONDS_PER_PHOTO}</span>
            <input value={captions[i] || ''} onChange={(e) => setCaptions((c) => { const n = [...c]; n[i] = e.target.value; return n; })} style={input} dir="rtl" />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={render} disabled={busy || picked.length === 0} className="primary-btn" style={{ padding: '11px 22px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: busy || picked.length === 0 ? 0.6 : 1 }}>
          {state === 'loading' ? 'טוענת את המנוע…' : state === 'rendering' ? `מייצאת… ${progress}%` : 'צרי סרטון (POC)'}
        </button>
        {videoUrl && <a href={videoUrl} download="bloomos-reel-poc.mp4" style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--pc-deep)' }}>הורדת ה-MP4</a>}
      </div>
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10, lineHeight: 1.5 }}>{error}</p>}
      {videoUrl && (
        <video src={videoUrl} controls playsInline style={{ display: 'block', width: 240, aspectRatio: '9 / 16', marginTop: 14, borderRadius: 'var(--r-sm)', background: '#000' }} />
      )}
    </div>
  );
}

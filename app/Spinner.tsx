'use client';

import { FLOWER_64 } from '@/lib/brand';

// app/Spinner.tsx
//
// The one loading state: a gently pulsing flower, optionally with a short
// label beside it. Replaces the word "loading" written eleven different
// ways ("טוען...", "טוענת…", "מכינה רשימה…", "יוצרת פוסטים... ✦") so that
// waiting looks the same on every screen and never reads as text that
// failed to update. (It replaced a plain spinning ring in the same spot -
// she sees this many times a day, which is exactly why it was worth being
// the flower rather than generic chrome.)
//
// Two sizes: `inline` (14px, for inside a button that is working) and the
// default (20px, for a block that is loading). The block form is centred
// with breathing room; the inline form sits on the text baseline.
// flower-64 throughout, never the 1.3MB source, for a mark this small.

export default function Spinner({ label, inline = false, size }: { label?: string; inline?: boolean; size?: number }) {
  const px = size ?? (inline ? 14 : 20);
  const ring = (
    <span role="status" aria-live="polite" aria-label={label || 'טוענת'} style={{ display: 'inline-flex', width: px, height: px }}>
      <img aria-hidden alt="" src={FLOWER_64} className="spinner-flower" style={{ width: px, height: px, objectFit: 'contain' }} />
    </span>
  );
  if (inline) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {ring}
        {label && <span>{label}</span>}
      </span>
    );
  }
  return (
    <div className="spinner-block">
      {ring}
      {label && <p className="spinner-label">{label}</p>}
    </div>
  );
}

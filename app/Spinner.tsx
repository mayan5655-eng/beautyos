'use client';

// app/Spinner.tsx
//
// The one loading state. A ring in the accent colour, optionally with a
// short label beside it. Replaces the word "loading" written eleven
// different ways ("טוען...", "טוענת…", "מכינה רשימה…", "יוצרת פוסטים... ✦")
// so that waiting looks the same on every screen and never reads as text
// that failed to update.
//
// Two sizes: `inline` (14px, for inside a button that is working) and the
// default (20px, for a block that is loading). The block form is centred
// with breathing room; the inline form sits on the text baseline.

export default function Spinner({ label, inline = false, size }: { label?: string; inline?: boolean; size?: number }) {
  const px = size ?? (inline ? 14 : 20);
  const ring = (
    <span
      className="spinner"
      role="status"
      aria-live="polite"
      aria-label={label || 'טוענת'}
      style={{ width: px, height: px, borderWidth: Math.max(2, Math.round(px / 8)) }}
    />
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

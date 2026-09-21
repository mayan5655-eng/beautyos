'use client';

// app/Sheet.tsx
//
// The one modal. Every dialog, drawer-card and confirm in the product renders
// through this, so there is exactly one backdrop, one radius, one shadow, one
// max height and one way to close.
//
// ── Why one ────────────────────────────────────────────────────────────────
// The designer's lens counted four treatments in the app: two backdrops (one
// blurred, one not), radii of 20, 22 and 24, shadows present or absent, and
// maximum heights of 88, 90, 92 and unset. None of it was chosen; each modal
// was written on a different day. A user reads the seams as "several people
// built this and nobody looked".
//
// ── Phone first ────────────────────────────────────────────────────────────
// On a phone the card is a bottom sheet: full width, rounded on top, pinned
// to the bottom edge where the thumb is, with the safe-area inset respected.
// On a desk it is a centred card. Same component, one media query, in
// globals.css under `.sheet`.
//
// Escape closes, tapping the backdrop closes, the card stops propagation, and
// `role="dialog"` with aria-modal so a screen reader knows where it is.
//
// `busy` blocks backdrop-close and Escape while a request is in flight - the
// bulk-send modal used this rule already; now every modal gets it for free.

import { useEffect, type ReactNode } from 'react';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Desktop card width. Phones ignore it and go full width. */
  width?: number;
  /** Stack order. The app's layers: 1000 modals, 1100 receipt, 1300 bulk, 4000 confirm, 5100 lapsed. */
  zIndex?: number;
  /** While true, backdrop tap and Escape do nothing. */
  busy?: boolean;
  /** Extra class on the card, for a screen that needs a hook. */
  className?: string;
  /** No padding on the card - the child paints edge to edge (the receipt). */
  flush?: boolean;
  /** Test/automation hook. */
  ariaLabel?: string;
};

export default function Sheet({
  open, onClose, title, subtitle, children, width = 380, zIndex = 1000, busy = false, className = '', flush = false, ariaLabel,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      style={{ zIndex }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className={`sheet ${flush ? 'sheet-flush' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
        dir="rtl"
        style={{ ['--sheet-width' as string]: `${width}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="sheet-head">
            {title && <h3 className="serif sheet-title">{title}</h3>}
            {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

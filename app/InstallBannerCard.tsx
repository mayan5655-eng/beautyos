"use client";

import type { ReactNode } from "react";

/**
 * The shared chrome for the two install banners — the fixed bottom card, its
 * enter transition, the round icon well, the title/body column and the × .
 *
 * It exists because there are two of these (iOS Safari has no install event and
 * must be talked through the share sheet; every Chromium browser fires
 * `beforeinstallprompt` and gets a real button), and the card around them is
 * the same card. Same reason lib/brand.ts exists: two copies of one surface is
 * two chances to drift.
 *
 * Purely presentational — every platform decision lives in the two callers.
 */
export default function InstallBannerCard({
  ariaLabel,
  enter,
  icon,
  title,
  children,
  action,
  onDismiss,
}: {
  ariaLabel: string;
  /** false on the first paint, true on the next frame → slide/fade in. */
  enter: boolean;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  /** Optional call to action, under the body copy. */
  action?: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        transform: `translateX(-50%) translateY(${enter ? "0" : "12px"})`,
        opacity: enter ? 1 : 0,
        transition: "transform 200ms ease, opacity 200ms ease",
        zIndex: 60,
        width: "min(420px, calc(100vw - 24px))",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 16px",
        background: "var(--surface, var(--surface))",
        color: "var(--ink, var(--ink))",
        border: "1px solid var(--line, var(--line))",
        borderRadius: "var(--r-md, 16px)",
        boxShadow: "var(--shadow-lg, 0 18px 44px rgba(43,34,51,0.14))",
        fontFamily: "var(--sans, system-ui, sans-serif)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          width: "38px",
          height: "38px",
          borderRadius: "999px",
          background: "var(--lavender-100, var(--pc-tint))",
          color: "var(--plum-600, var(--pc))",
        }}
      >
        {icon}
      </span>

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            lineHeight: 1.35,
            color: "var(--plum-700, var(--pc-deep))",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: "2px",
            fontSize: "13px",
            lineHeight: 1.45,
            color: "var(--ink-2, var(--ink-2))",
          }}
        >
          {children}
        </div>
        {action ? <div style={{ marginTop: "10px" }}>{action}</div> : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירה"
        style={{
          flex: "0 0 auto",
          appearance: "none",
          border: "none",
          background: "transparent",
          color: "var(--ink-3, var(--ink-3))",
          cursor: "pointer",
          fontSize: "20px",
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: "8px",
        }}
      >
        ×
      </button>
    </div>
  );
}

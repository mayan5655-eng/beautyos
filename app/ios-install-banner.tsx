"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "bloomos-ios-install-dismissed";

/**
 * A small dismissible hint shown to iPhone/iPad users on Safari, telling them
 * how to install BloomOS to the home screen (iOS has no automatic install
 * prompt). It only appears when:
 *   - the device is iOS,
 *   - the browser is Safari (Add to Home Screen lives in its share sheet),
 *   - the app is NOT already running installed (standalone), and
 *   - the user hasn't dismissed it before (remembered in localStorage).
 * Server-renders nothing, so there is no hydration mismatch.
 */
export default function IOSInstallBanner() {
  const [render, setRender] = useState(false);
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    // Chrome/Firefox/Edge on iOS carry their own tokens; their share sheets
    // don't expose "Add to Home Screen", so only prompt real Safari.
    const isSafari = !/crios|fxios|edgios|opios/i.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes standalone here rather than via display-mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";

    if (isIOS && isSafari && !isStandalone && !dismissed) {
      setRender(true);
      // Next frame → trigger the slide/fade-in transition.
      requestAnimationFrame(() => setEnter(true));
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — just hide for this session */
    }
    setEnter(false);
    window.setTimeout(() => setRender(false), 220);
  }

  if (!render) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="התקנת האפליקציה למסך הבית"
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
        background: "var(--surface, #fff)",
        color: "var(--ink, #2A2233)",
        border: "1px solid var(--line, #ECE6F2)",
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
          background: "var(--lavender-100, #F1E2F2)",
          color: "var(--plum-600, #5B3E67)",
        }}
      >
        {/* iOS share glyph */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.5 7.5 12 4l3.5 3.5" />
          <path d="M12 4v11" />
          <path d="M7 10.5H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
        </svg>
      </span>

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            lineHeight: 1.35,
            color: "var(--plum-700, #4A3155)",
          }}
        >
          התקיני את BloomOS למסך הבית
        </div>
        <div
          style={{
            marginTop: "2px",
            fontSize: "13px",
            lineHeight: 1.45,
            color: "var(--ink-2, #6B6275)",
          }}
        >
          הקישי על כפתור השיתוף ובחרי «הוספה למסך הבית».
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="סגירה"
        style={{
          flex: "0 0 auto",
          appearance: "none",
          border: "none",
          background: "transparent",
          color: "var(--ink-3, #9A93A4)",
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

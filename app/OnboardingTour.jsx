"use client";
// app/OnboardingTour.jsx
//
// The six-step walkthrough a brand-new cosmetician gets on her first visit
// to the dashboard: היום, יומן, לקוחות, תשלום, תוכן, then her booking link -
// ending on creating her first appointment, not a congratulation screen.
//
// Deliberately NOT a video (see the kalmea skill's video section - no
// reliable Hebrew-RTL render path exists here). This is a real DOM overlay
// that finds the real nav button or settings control for each step and
// highlights it where it actually lives, rather than a recorded or
// illustrated stand-in for the UI.
//
// This component only draws the card + highlight and advances its own
// step index. It owns none of the app's state: the caller (beautyos.jsx)
// decides when a step needs a side effect first (step 6 needs Settings
// open), persists progress, and supplies `onFinish` for the one real action
// the tour ends on.

import { useEffect, useRef, useState } from "react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

// The target can take a beat to exist (step 6's button is inside Settings,
// which is still animating open) or to settle (a tab switch re-renders the
// screen under it). Polled rather than assumed-present-next-tick.
function useTargetRect(selector, enabled) {
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);
  const triesRef = useRef(0);

  useEffect(() => {
    if (!enabled || !selector) { setRect(null); return; }
    triesRef.current = 0;
    setRect(null);

    const measure = () => {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return true;
      }
      return false;
    };

    const tick = () => {
      if (measure()) return;
      triesRef.current += 1;
      // ~2s of retrying at 60fps-ish, generous enough for a sheet's own
      // open animation plus a tab's data to render.
      if (triesRef.current < 120) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    tick();

    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [selector, enabled]);

  return rect;
}

export default function OnboardingTour({
  steps,
  stepIndex,
  onNext,
  onSkip,
  onFinish,
  pc = "var(--pc)",
  pcDeep = "var(--pc-deep)",
  pcGrad = "var(--pc-grad)",
}) {
  const active = stepIndex != null && stepIndex >= 0 && stepIndex < steps.length;
  const step = active ? steps[stepIndex] : null;
  const reducedMotion = usePrefersReducedMotion();
  const rect = useTargetRect(step?.selector, active);
  const isLast = stepIndex === steps.length - 1;

  if (!active) return null;

  const PAD = 8;
  const highlightStyle = rect
    ? {
        position: "fixed",
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: 14,
        border: `2px solid ${pc}`,
        boxShadow: `0 0 0 4px ${pc}33`,
        pointerEvents: "none",
        zIndex: 6001,
      }
    : null;

  // Below the target when there's room, above it otherwise; horizontally
  // clamped to a 16px gutter on a 430px-first screen either way.
  const CARD_W = 300;
  const GUTTER = 16;
  let cardStyle = null;
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow > 190 || rect.top < 190;
    const rawLeft = rect.left + rect.width / 2 - CARD_W / 2;
    const left = Math.min(Math.max(rawLeft, GUTTER), window.innerWidth - CARD_W - GUTTER);
    cardStyle = {
      position: "fixed",
      left,
      width: CARD_W,
      zIndex: 6002,
      ...(placeBelow
        ? { top: rect.top + rect.height + PAD + 10 }
        : { top: Math.max(rect.top - PAD - 10 - 180, GUTTER), }),
    };
  }

  return (
    <>
      <style>{`
        @keyframes tourCardIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes tourPulse {
          0%   { box-shadow: 0 0 0 4px ${pc}33, 0 0 0 4px ${pc}33; }
          50%  { box-shadow: 0 0 0 4px ${pc}33, 0 0 0 16px ${pc}00; }
          100% { box-shadow: 0 0 0 4px ${pc}33, 0 0 0 4px ${pc}00; }
        }
        .tour-card { animation: tourCardIn 200ms ease-out; }
        .tour-highlight { animation: tourPulse 900ms ease-out 1; }
        @media (prefers-reduced-motion: reduce) {
          .tour-card, .tour-highlight { animation: none !important; }
        }
      `}</style>

      {/* A faint scrim, just enough to pull focus to the highlighted element
          without hiding the real screen behind it - she should still
          recognise exactly where she is. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 6000, background: "rgba(20,20,20,0.08)", pointerEvents: "none" }} />

      {highlightStyle && <div aria-hidden className="tour-highlight" style={highlightStyle} />}

      {cardStyle && (
        <div
          role="dialog"
          aria-label={step.title}
          className="tour-card"
          style={{
            ...cardStyle,
            background: "var(--surface)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-xl)",
            border: "1px solid var(--line)",
            padding: "16px 16px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <img aria-hidden alt="" src={step.icon} style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }} />
            <p className="serif" style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>{step.title}</p>
          </div>
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 14 }}>{step.text}</p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button
              type="button"
              onClick={onSkip}
              style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: "var(--t-sm)", cursor: "pointer", fontFamily: "inherit", padding: "6px 2px" }}
            >
              דלגי
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)" }}>{stepIndex + 1}/{steps.length}</span>
              <button
                type="button"
                onClick={isLast ? onFinish : onNext}
                style={{
                  background: pcGrad, color: "var(--pc-contrast)", border: "none",
                  borderRadius: "var(--r-xl)", padding: "9px 18px", fontSize: "var(--t-sm)",
                  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {isLast ? step.cta : "הבא ←"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

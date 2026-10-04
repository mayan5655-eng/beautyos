"use client";
// app/landing/CostTable.jsx
//
// The one real "moment" of the page, per the brief: rows reveal one by one,
// then the total counts up from 0 over ~900ms. Everything else on the page
// is a restrained rise+fade; this is the single place that gets more than
// that, on purpose - it's the thing the page is actually arguing.
//
// prefers-reduced-motion: no stagger, no count-up. The rows and the final
// total render immediately, in their finished state.

import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

function formatILS(n) {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

export default function CostTable({ rows, totalLow, totalHigh, closingLine }) {
  const ref = useRef(null);
  const [animate, setAnimate] = useState(false); // false until in view; also the reduced-motion "skip straight to final" flag
  const [reducedMotion, setReducedMotion] = useState(false);
  const [countLow, setCountLow] = useState(0);
  const [countHigh, setCountHigh] = useState(0);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      mq = null;
    }
    if (mq?.matches) {
      setReducedMotion(true);
      setCountLow(totalLow);
      setCountHigh(totalHigh);
      return;
    }

    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setAnimate(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!animate || reducedMotion) return;
    // Rows stagger in at 80ms apart; give them room to finish (their own
    // 500ms rise+fade) before the total starts counting, so the count-up
    // reads as the payoff after the list, not a race against it.
    const rowsDelay = rows.length * 80 + 450;
    const DURATION = 900;
    let raf;
    const start = performance.now() + rowsDelay;
    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(1, elapsed / DURATION);
      // ease-out cubic - fast start, settles gently, no overshoot.
      const eased = 1 - Math.pow(1 - t, 3);
      setCountLow(totalLow * eased);
      setCountHigh(totalHigh * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, reducedMotion, rows.length, totalLow, totalHigh]);

  return (
    <div ref={ref}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
        {rows.map((row, i) => (
          <Reveal
            key={row.label}
            delay={i * 80}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <span style={{ fontSize: "var(--t-md)", color: "var(--ink)" }}>{row.label}</span>
            <span style={{ fontSize: "var(--t-md)", fontWeight: 600, color: "var(--ink-2)", direction: "ltr", unicodeBidi: "plaintext" }}>
              {formatILS(row.low)}–{formatILS(row.high)}
            </span>
          </Reveal>
        ))}
      </div>

      <Reveal delay={rows.length * 80 + 60} style={{ textAlign: "center", marginTop: 22 }}>
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.02em", marginBottom: 6 }}>
          סך הכל, לפני קלמיה
        </p>
        <p
          className="serif"
          style={{ fontSize: "var(--t-hero)", fontWeight: 700, color: "var(--brand-accent)", direction: "ltr", unicodeBidi: "plaintext", marginBottom: 14 }}
        >
          {formatILS(countLow)}–{formatILS(countHigh)}
        </p>
        <p style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--ink)" }}>{closingLine}</p>
      </Reveal>
    </div>
  );
}

"use client";
// app/landing/PhoneMockMotion.jsx
//
// Brings the phone mock to life once, when it first scrolls into view: the two appointments slide in one after the
// other, the revenue figure counts up, then the "one question" card fades in. About 4 seconds, no loop.
//
// The finished picture is what the server renders. Nothing here removes it until JavaScript is running, the visitor
// has not asked for reduced motion, and the mock is on its way into view - so without JS, with reduced motion, or if
// anything below throws, the page shows the final state and nothing is blank.
//
// No layout can move: the items only animate opacity and transform, and the count-up changes the text of a block that
// already has its line box.
//
//   data-pm = (absent)  server / no JS / reduced motion: final state
//             armed     items hidden, waiting for the mock to be seen
//             play      the CSS animations run (delays are set per item with --pm-d)
//             done      back to plain final state

import { useEffect, useRef } from "react";

const COUNT_START_MS = 1600;
const COUNT_MS = 1300;
const SAFETY_MS = 6000;
const SETTLE_MS = 600; // wait until the page has loaded and gone quiet: the entrance must never compete with first paint

export default function PhoneMockMotion({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* treat as motion allowed */ }
    if (reduced || typeof IntersectionObserver === "undefined") return;
    let settle = 0;
    let teardown = null;

    // Armed only after the page has loaded and settled, so the entrance can never compete with first paint or LCP.
    // If the mock is already on screen by then (a phone, usually) it plays right away; otherwise when it scrolls in.
    const begin = () => { teardown = arm(); };

    const arm = () => {

    const countEl = root.querySelector("[data-pm-count]");
    const target = Number(countEl?.getAttribute("data-pm-count")) || 0;
    const fmt = (n) => "₪" + Math.round(n).toLocaleString("he-IL");
    let io = null, raf = 0, safety = 0;

    const finish = () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
      root.setAttribute("data-pm", "done");
      if (countEl && target) countEl.textContent = fmt(target);
    };

    root.setAttribute("data-pm", "armed");
    if (countEl && target) countEl.textContent = fmt(0);

    io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      root.setAttribute("data-pm", "play");
      if (countEl && target) {
        const start = performance.now() + COUNT_START_MS;
        const tick = (now) => {
          const t = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
          const eased = 1 - Math.pow(1 - t, 3);
          countEl.textContent = fmt(target * eased);
          if (t < 1) raf = requestAnimationFrame(tick); else finish();
        };
        raf = requestAnimationFrame(tick);
      }
      // however it ends, the figure and the cards are in their final state
      safety = window.setTimeout(finish, SAFETY_MS);
    }, { threshold: 0.4 });
    io.observe(root);

    return () => { io && io.disconnect(); finish(); };
    };

    if (document.readyState === "complete") settle = window.setTimeout(begin, SETTLE_MS);
    else window.addEventListener("load", () => { settle = window.setTimeout(begin, SETTLE_MS); }, { once: true });

    return () => { clearTimeout(settle); if (teardown) teardown(); };
  }, []);

  return <div ref={ref} className="pm">{children}</div>;
}

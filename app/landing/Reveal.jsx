"use client";
// app/landing/Reveal.jsx
//
// The landing page's one scroll-reveal primitive: rises 16px and fades in,
// once, the first time it enters the viewport - never again on scroll-back
// (IntersectionObserver with triggerOnce, not a scroll listener that would
// re-fire). Children stagger via the `delay` prop (ms), set per-child by
// the caller - this component doesn't know about siblings, so staggering
// is just "each child gets position-index * 80ms".
//
// prefers-reduced-motion: rendered fully visible immediately, no observer,
// no class ever toggled - not a shortened animation, no animation at all.

import { useEffect, useRef, useState } from "react";

export default function Reveal({ as: Tag = "div", delay = 0, className = "", style, children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      mq = null;
    }
    if (mq?.matches) {
      setReducedMotion(true);
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${className} ${reducedMotion ? "" : "kl-reveal"} ${shown ? "kl-reveal-in" : ""}`.trim()}
      style={{ ...style, transitionDelay: reducedMotion ? undefined : `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

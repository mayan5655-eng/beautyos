"use client";
// app/landing/DemoVideo.jsx
//
// A short demo clip in a phone frame. It adds nothing to the first load:
//   - the server renders only an empty box with the clip's exact aspect ratio (no layout shift);
//   - when the box is within ~400px of the viewport the poster is attached (one small image);
//   - the video file itself is fetched only when she presses play (preload="none").
// playsInline, controls visible, never autoplays. Silent unless `sound` is set (a clip with its own music). Demo tenant footage only.

import { useEffect, useRef, useState } from "react";

export default function DemoVideo({ mp4, webm, poster, label, width = 260, sound = false }) {
  const boxRef = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      style={{
        width,
        margin: "0 auto",
        borderRadius: 36,
        border: "10px solid var(--ink)",
        background: "var(--ink)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      <div ref={boxRef} style={{ aspectRatio: "9 / 16", background: "var(--brand-cream, #F0EADE)", borderRadius: 26, overflow: "hidden" }}>
        {near && (
          <video
            controls
            muted={!sound}
            playsInline
            preload="none"
            poster={poster}
            aria-label={label}
            style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
          >
            {webm && <source src={webm} type="video/webm" />}
            <source src={mp4} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}

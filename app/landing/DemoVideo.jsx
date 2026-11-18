"use client";
// app/landing/DemoVideo.jsx
//
// A short demo clip in a phone frame. It adds nothing to the first load:
//   - the server renders only an empty box with the clip's exact aspect ratio (no layout shift);
//   - when the box is within ~400px of the viewport the poster is attached (one small image);
//   - until she presses play only the poster shows (a plain <img> with a play button); the video file is fetched on that press.
// playsInline, controls visible, never autoplays. Silent unless `sound` is set (a clip with its own music). Demo tenant footage only.

import { useEffect, useRef, useState } from "react";

export default function DemoVideo({ mp4, webm, poster, label, width = 260, sound = false }) {
  const boxRef = useRef(null);
  const [near, setNear] = useState(false);
  const [started, setStarted] = useState(false);

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
      {/* The poster is also the box background once near: some browsers leave a preload="none" video blank until play. */}
      <div ref={boxRef} style={{ aspectRatio: "9 / 16", background: near && poster ? `var(--brand-cream, #F0EADE) url(${poster}) center / cover no-repeat` : "var(--brand-cream, #F0EADE)", borderRadius: 26, overflow: "hidden" }}>
        {near && !started && (
          <button
            type="button"
            onClick={() => setStarted(true)}
            aria-label={`לנגן: ${label}`}
            style={{ position: "relative", width: "100%", height: "100%", padding: 0, border: "none", cursor: "pointer", background: "none", display: "block" }}
          >
            {/* A plain image, not the video's poster: some browsers leave a preload="none" video blank until play. */}
            <img src={poster} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 64, height: 64, borderRadius: "50%", background: "rgba(31, 59, 45, .82)", boxShadow: "0 6px 18px rgba(0,0,0,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 0, height: 0, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderLeft: "20px solid #fbf8f1", marginLeft: 5 }} />
            </span>
          </button>
        )}
        {near && started && (
          <video
            controls
            autoPlay
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

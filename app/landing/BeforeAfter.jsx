"use client";
// app/landing/BeforeAfter.jsx
//
// Before and after Kalmea, one row per pain: a red banner gets crossed out, then a green one pops up under it. The server HTML is the finished
// picture (same rule as PhoneMock): the animation is only armed from JS, plays once per row as it scrolls in, and never under reduced motion.
//
// Sound: browsers refuse audio until the visitor touches the page, and a landing page must not make noise on its own. So it stays silent until
// she presses the sound button or taps a row. The two sounds are synthesized here, no audio file to download.

import { useEffect, useRef, useState } from "react";
import BrandImage from "@/app/BrandImage";

function tone(ctx, { from, to, at, length, volume, type = "sine" }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length);
}

// A short low drop as the line crosses the old way out, then two rising notes when the green banner lands.
function playBeforeAfter(ctx) {
  tone(ctx, { from: 210, to: 90, at: 0, length: 0.22, volume: 0.14, type: "triangle" });
  tone(ctx, { from: 660, to: 660, at: STRIKE_MS / 1000, length: 0.14, volume: 0.12 });
  tone(ctx, { from: 990, to: 990, at: STRIKE_MS / 1000 + 0.11, length: 0.26, volume: 0.12 });
}

const STRIKE_MS = 620; // how long after the row starts the green banner pops; matches the .ba-after delay in globals.css

function Row({ pair, soundRef, ensureAudio }) {
  const ref = useRef(null);
  const [stage, setStage] = useState("done");

  const play = (withSound) => {
    setStage("armed");
    requestAnimationFrame(() => requestAnimationFrame(() => setStage("play")));
    const ctx = withSound ? ensureAudio() : soundRef.current;
    if (ctx) playBeforeAfter(ctx);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setStage("armed");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      play(false);
    }, { threshold: 0.7 });
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button ref={ref} type="button" className="ba-row" data-ba={stage} onClick={() => play(true)}>
      <span className="ba-before">
        <span className="ba-tag">לפני</span>
        <span className="ba-text">{pair.before}<span className="ba-strike" aria-hidden /></span>
      </span>
      <span className="ba-after">
        <span className="ba-icon"><BrandImage width={26} height={26} alt="" src={pair.icon} style={{ width: 26, height: 26, objectFit: "contain" }} /></span>
        <span>
          <span className="ba-tag">עם קלמיה</span>
          <span className="ba-text">{pair.after}</span>
        </span>
      </span>
    </button>
  );
}

export default function BeforeAfter({ rows }) {
  const audioRef = useRef(null);
  const [soundOn, setSoundOn] = useState(false);

  // Called only from a press, which is what lets the browser start audio at all.
  const ensureAudio = () => {
    if (!audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioRef.current = new AudioContext();
    }
    audioRef.current.resume?.();
    setSoundOn(true);
    return audioRef.current;
  };

  const toggle = () => {
    if (soundOn) { audioRef.current?.suspend?.(); audioRef.current = null; setSoundOn(false); return; }
    const ctx = ensureAudio();
    if (ctx) playBeforeAfter(ctx);
  };

  return (
    <>
      <p style={{ textAlign: "center", marginBottom: 14 }}>
        <button type="button" onClick={toggle} aria-pressed={soundOn} className="ba-sound">{soundOn ? "לכבות צליל" : "להפעיל צליל"}</button>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((pair) => <Row key={pair.before} pair={pair} soundRef={audioRef} ensureAudio={ensureAudio} />)}
      </div>
    </>
  );
}

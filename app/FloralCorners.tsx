"use client";
import React from "react";

/**
 * FloralCorners — delicate, airy blush-pink + gold floral accents scattered
 * around the corners and edges of a screen. Purely decorative:
 *   • low opacity, watercolor-soft (feels like a quiet watermark)
 *   • pointer-events: none — never blocks clicks
 *   • sits behind content (zIndex -1); host must be a positioned stacking
 *     context (position:relative/…, zIndex:0)
 *   • pieces live in all four corners + mid-edges, so it reads the same in
 *     LTR and RTL, and scales down gracefully on mobile via clamp().
 *
 * The centre of the screen is left intentionally empty so the florals never
 * compete with content — many flowers, but spaced out and airy.
 */

const BLUSH = "#D98BA0"; // primary — soft blush-pink
const BLUSH_SOFT = "#EBBCC7";
const GOLD = "#C9A24B"; // accent — warm gold
const GOLD_SOFT = "#E2C888";

type Kind = "blush" | "gold" | "sprig";

type Piece = {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  size: number; // base px; scaled responsively with clamp()
  rotate: number;
  kind: Kind;
  opacity: number;
};

// Generously spaced — corners get a light cluster, edges get a single stem,
// the middle stays clear.
const PIECES: Piece[] = [
  // top-left
  { top: "-1%", left: "1.5%", size: 94, rotate: -18, kind: "blush", opacity: 0.14 },
  { top: "8%", left: "-2%", size: 50, rotate: 24, kind: "gold", opacity: 0.13 },
  { top: "3%", left: "10%", size: 40, rotate: 6, kind: "sprig", opacity: 0.12 },
  // top-right
  { top: "-2%", right: "2%", size: 82, rotate: 20, kind: "blush", opacity: 0.13 },
  { top: "9%", right: "-1.5%", size: 46, rotate: -16, kind: "gold", opacity: 0.12 },
  // mid edges (kept far apart, well clear of the centre)
  { top: "45%", left: "-3%", size: 56, rotate: 12, kind: "sprig", opacity: 0.1 },
  { top: "53%", right: "-3%", size: 58, rotate: -22, kind: "blush", opacity: 0.1 },
  // bottom-left
  { bottom: "-2%", left: "3%", size: 74, rotate: 16, kind: "blush", opacity: 0.13 },
  { bottom: "8%", left: "-2%", size: 44, rotate: -20, kind: "gold", opacity: 0.12 },
  // bottom-right
  { bottom: "-1%", right: "1.5%", size: 98, rotate: -14, kind: "blush", opacity: 0.14 },
  { bottom: "9%", right: "11%", size: 40, rotate: 18, kind: "gold", opacity: 0.12 },
  { bottom: "3%", right: "-2%", size: 52, rotate: 28, kind: "sprig", opacity: 0.11 },
];

/** A soft 5-petal blossom. */
function Blossom({ fill, center }: { fill: string; center: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-13" rx="7.6" ry="13" fill={fill} transform={`rotate(${a})`} />
      ))}
      <circle cx="0" cy="0" r="5" fill={center} />
    </g>
  );
}

/** A slender stem with two leaves and a small bud. */
function Sprig({ stem, leaf, bud }: { stem: string; leaf: string; bud: string }) {
  return (
    <g>
      <path d="M0 20 C -3 7, 3 -7, 0 -19" stroke={stem} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M0 5 C 9 3, 13 -4, 11 -13 C 3 -10, -1 -3, 0 5 Z" fill={leaf} />
      <path d="M0 10 C -9 8, -13 1, -11 -8 C -3 -5, 1 1, 0 10 Z" fill={leaf} />
      <circle cx="0" cy="-19" r="3.6" fill={bud} />
    </g>
  );
}

export default function FloralCorners({
  idPrefix = "fc",
  fixed = false,
}: {
  idPrefix?: string;
  fixed?: boolean;
}) {
  const blushGrad = `url(#${idPrefix}-blush)`;
  const goldGrad = `url(#${idPrefix}-gold)`;
  const blur = `url(#${idPrefix}-soft)`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Shared gradients + soft (watercolour) blur, defined once. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <radialGradient id={`${idPrefix}-blush`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={BLUSH_SOFT} />
            <stop offset="65%" stopColor={BLUSH} />
            <stop offset="100%" stopColor={BLUSH} stopOpacity="0.12" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-gold`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={GOLD_SOFT} />
            <stop offset="65%" stopColor={GOLD} />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0.12" />
          </radialGradient>
          <filter id={`${idPrefix}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>
      </svg>

      {PIECES.map((p, i) => {
        const w = `clamp(${Math.round(p.size * 0.5)}px, ${(p.size / 9).toFixed(1)}vw, ${p.size}px)`;
        return (
          <svg
            key={i}
            viewBox="-30 -30 60 60"
            style={{
              position: "absolute",
              top: p.top,
              bottom: p.bottom,
              left: p.left,
              right: p.right,
              width: w,
              height: w,
              opacity: p.opacity,
              transform: `rotate(${p.rotate}deg)`,
              filter: blur,
            }}
          >
            {p.kind === "blush" && <Blossom fill={blushGrad} center={GOLD} />}
            {p.kind === "gold" && <Blossom fill={goldGrad} center={BLUSH} />}
            {p.kind === "sprig" && <Sprig stem={GOLD_SOFT} leaf={BLUSH_SOFT} bud={GOLD} />}
          </svg>
        );
      })}
    </div>
  );
}

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

const BLUSH = "#D98BA0"; // primary — soft blush-pink (default when no brand color)
const BLUSH_SOFT = "#EBBCC7";
const GOLD = "#C9A24B"; // accent — warm gold (default when no brand color)
const GOLD_SOFT = "#E2C888";

// Lighten a hex toward white by amt (0..1). Used to derive the soft petal tint
// when a custom brand color is supplied.
function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

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
  // ---- TOP-LEFT cluster ----
  { top: "-1%", left: "1.5%", size: 100, rotate: -18, kind: "blush", opacity: 0.30 },
  { top: "7%", left: "-2%", size: 54, rotate: 24, kind: "gold", opacity: 0.26 },
  { top: "3%", left: "10%", size: 44, rotate: 6, kind: "sprig", opacity: 0.24 },
  { top: "14%", left: "5%", size: 40, rotate: -10, kind: "gold", opacity: 0.20 },
  // ---- TOP edge (small + high, well clear of the reading area) ----
  { top: "-2%", left: "30%", size: 46, rotate: 14, kind: "sprig", opacity: 0.18 },
  { top: "-2%", right: "30%", size: 48, rotate: -12, kind: "gold", opacity: 0.18 },
  // ---- TOP-RIGHT cluster ----
  { top: "-2%", right: "2%", size: 92, rotate: 20, kind: "blush", opacity: 0.30 },
  { top: "8%", right: "-1.5%", size: 50, rotate: -16, kind: "gold", opacity: 0.26 },
  { top: "3%", right: "10%", size: 44, rotate: -6, kind: "sprig", opacity: 0.23 },
  { top: "15%", right: "4%", size: 40, rotate: 12, kind: "blush", opacity: 0.20 },
  // ---- LEFT edge ----
  { top: "30%", left: "-3%", size: 56, rotate: 12, kind: "sprig", opacity: 0.22 },
  { top: "44%", left: "-2%", size: 60, rotate: -8, kind: "blush", opacity: 0.22 },
  { top: "60%", left: "-3%", size: 50, rotate: 18, kind: "gold", opacity: 0.21 },
  { top: "74%", left: "-2%", size: 46, rotate: -14, kind: "sprig", opacity: 0.20 },
  // ---- RIGHT edge ----
  { top: "28%", right: "-3%", size: 54, rotate: -12, kind: "gold", opacity: 0.22 },
  { top: "45%", right: "-2%", size: 60, rotate: 20, kind: "blush", opacity: 0.22 },
  { top: "61%", right: "-3%", size: 50, rotate: -18, kind: "sprig", opacity: 0.21 },
  { top: "76%", right: "-2%", size: 46, rotate: 14, kind: "gold", opacity: 0.20 },
  // ---- BOTTOM-LEFT cluster ----
  { bottom: "-2%", left: "3%", size: 86, rotate: 16, kind: "blush", opacity: 0.30 },
  { bottom: "8%", left: "-2%", size: 48, rotate: -20, kind: "gold", opacity: 0.25 },
  { bottom: "3%", left: "13%", size: 44, rotate: 10, kind: "sprig", opacity: 0.23 },
  // ---- BOTTOM edge ----
  { bottom: "-2%", left: "32%", size: 46, rotate: -12, kind: "sprig", opacity: 0.18 },
  { bottom: "-2%", right: "32%", size: 48, rotate: 14, kind: "blush", opacity: 0.18 },
  // ---- BOTTOM-RIGHT cluster ----
  { bottom: "-1%", right: "1.5%", size: 102, rotate: -14, kind: "blush", opacity: 0.31 },
  { bottom: "9%", right: "11%", size: 44, rotate: 18, kind: "gold", opacity: 0.24 },
  { bottom: "3%", right: "-2%", size: 54, rotate: 28, kind: "sprig", opacity: 0.23 },
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
  zIndex = -1,
  blush,
  gold,
  opacity = 1,
  skipTop = false,
}: {
  idPrefix?: string;
  fixed?: boolean;
  /**
   * Drop the pieces that sit in the top band of the screen. Used by the app
   * shell so no background blossom lands behind the header, where it would
   * compete with the flowers in the BloomOS logo itself.
   */
  skipTop?: boolean;
  /**
   * Stacking position of the decorative layer.
   *   -1  → behind everything (good when the host has a large exposed
   *         background, e.g. the login card screen).
   *    1  → above the shell chrome but below modals/toasts (needed on the
   *         dashboard, whose translucent full-viewport panels would otherwise
   *         wash the florals out to nothing). Stays pointer-events:none, so it
   *         never blocks clicks and never obscures active UI.
   */
  zIndex?: number;
  /** Brand blush/petal color. Defaults to the BloomOS blush when omitted. */
  blush?: string;
  /** Brand gold/accent color. Defaults to the BloomOS gold when omitted. */
  gold?: string;
  /** Extra overall fade for the whole decorative layer (0..1). */
  opacity?: number;
}) {
  // Tint to the brand color when provided; otherwise keep the exact BloomOS
  // blush + gold so existing callers (login/signup) stay pixel-identical.
  const blushBase = blush || BLUSH;
  const goldBase = gold || GOLD;
  const blushSoft = blush ? lighten(blush, 0.4) : BLUSH_SOFT;
  const goldSoft = gold ? lighten(gold, 0.4) : GOLD_SOFT;
  const blushGrad = `url(#${idPrefix}-blush)`;
  const goldGrad = `url(#${idPrefix}-gold)`;
  const blur = `url(#${idPrefix}-soft)`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        zIndex,
        opacity,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Shared gradients + soft (watercolour) blur, defined once. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <radialGradient id={`${idPrefix}-blush`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={blushSoft} />
            <stop offset="65%" stopColor={blushBase} />
            <stop offset="100%" stopColor={blushBase} stopOpacity="0.12" />
          </radialGradient>
          <radialGradient id={`${idPrefix}-gold`} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={goldSoft} />
            <stop offset="65%" stopColor={goldBase} />
            <stop offset="100%" stopColor={goldBase} stopOpacity="0.12" />
          </radialGradient>
          <filter id={`${idPrefix}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>
      </svg>

      {PIECES.filter((p) => {
        if (!skipTop) return true;
        // Anything anchored within the top ~18% of the screen would sit behind
        // the header. Pieces anchored from the bottom are always kept.
        if (p.top === undefined) return true;
        return parseFloat(p.top) > 18;
      }).map((p, i) => {
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
            {p.kind === "blush" && <Blossom fill={blushGrad} center={goldBase} />}
            {p.kind === "gold" && <Blossom fill={goldGrad} center={blushBase} />}
            {p.kind === "sprig" && <Sprig stem={goldSoft} leaf={blushSoft} bud={goldBase} />}
          </svg>
        );
      })}
    </div>
  );
}

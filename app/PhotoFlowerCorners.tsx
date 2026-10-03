// app/PhotoFlowerCorners.tsx
//
// The ad-style corner flowers: two photographic cosmos blossoms, full detail
// (the same flower-full.png used elsewhere, never the flat -solid marks),
// one top-left and one bottom-right, each overlapping its own screen edge at
// ~60% opacity. This replaces FloralCorners' scattered illustrated blossoms
// for "moment" screens ONLY (see BrandBackdrop's 'full' density) - it is
// deliberately NOT the quiet, faint watermark every working screen keeps
// (ChromeFlowerBg, EmptyState's non-moment corner accent). Two flowers,
// never more, per screen - this component is the whole budget.
"use client";

import { FLOWER_FULL } from "@/lib/brand";

export default function PhotoFlowerCorners({
  fixed = false,
  zIndex = -1,
  opacity = 0.6,
}: {
  /** fixed = stays put while the page scrolls. */
  fixed?: boolean;
  zIndex?: number;
  /** Ad reference is ~60%; exposed for the rare screen that needs it quieter. */
  opacity?: number;
}) {
  const shared: React.CSSProperties = {
    position: "absolute",
    width: "clamp(140px, 34vw, 260px)",
    height: "clamp(140px, 34vw, 260px)",
    objectFit: "contain",
    opacity,
    pointerEvents: "none",
  };

  return (
    <div
      aria-hidden="true"
      style={{
        position: fixed ? "fixed" : "absolute",
        inset: 0,
        zIndex,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <img
        alt=""
        src={FLOWER_FULL}
        style={{
          ...shared,
          top: "-9%",
          insetInlineStart: "-9%",
          transform: "rotate(-8deg)",
        }}
      />
      <img
        alt=""
        src={FLOWER_FULL}
        style={{
          ...shared,
          bottom: "-9%",
          insetInlineEnd: "-9%",
          transform: "rotate(172deg)",
        }}
      />
    </div>
  );
}

// app/ChromeFlowerBg.tsx
//
// The one background flower, for Kalmea chrome screens only (the dashboard,
// the platform admin panel, onboarding) - never a tenant's own branded
// surface, where it would compete with HER accent and HER content instead
// of sitting quietly behind it.
//
// Fixed to the viewport, not the scrolling content, so it reads as a
// constant - paper the screen sits on - rather than something that
// scrolls past. One component, mounted once per screen's root, rather than
// the same style object pasted at every call site.

import { FLOWER_256 } from "@/lib/brand";

export default function ChromeFlowerBg() {
  return (
    <img
      aria-hidden
      alt=""
      src={FLOWER_256}
      style={{
        position: "fixed",
        zIndex: 0,
        bottom: -30,
        insetInlineStart: -30,
        width: 235,
        height: 235,
        objectFit: "contain",
        opacity: 0.16,
        pointerEvents: "none",
      }}
    />
  );
}

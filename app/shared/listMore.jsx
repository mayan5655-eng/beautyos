"use client";
// app/shared/listMore.jsx — the 'show more' row under a long list.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { tr } from "@/lib/i18n/tr";

/* @module-body */
// ── "showing N of M" + הצג עוד ──────────────────────────────────────────────
//
// Shared by the leads and clients lists. Renders NOTHING when everything is
// already on screen, so a short list looks exactly as it did before.
//
// The count line is always shown once the list is windowed, not just the
// button: a list that silently stops at 50 with no explanation reads as "that
// is all there is", which is precisely the wrong impression when she has 250.
function ListMore({ shown, total, onMore, pc, noun }) {
  if (total <= shown) return null;
  const remaining = total - shown;
  const next = Math.min(50, remaining);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 0 4px" }}>
      <p style={{ fontSize:"var(--t-sm)", color: "var(--ink-3)" }}>
        {tr("מציג")} {shown} {tr("מתוך")} {total} {noun}
      </p>
      <button
        type="button"
        onClick={onMore}
        style={{
          border: `1px solid ${pc}`, background: "var(--surface)", color: pc,
          borderRadius:"var(--r-xl)", padding: "9px 22px", fontSize:"var(--t-sm)", fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {tr("הצגת עוד")} {next}
      </button>
    </div>
  );
}
/* @module-end */
export {
  ListMore,
};

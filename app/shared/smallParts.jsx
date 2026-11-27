"use client";
// app/shared/smallParts.jsx — three small parts used all over the app: a private image from storage, a switch, a switch with its label.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { PRIVATE_BUCKET, toStoragePath } from "../../lib/clientImages";
import { trv } from "@/lib/i18n/tr";

/* @module-body */
// Renders a private client image from storage. `value` may be a bare storage
// path (new format) or a legacy public URL (old); either way we resolve a
// short-lived signed URL on demand, so the underlying bucket can stay private.
// While loading — or if the object can't be signed (e.g. a legacy object not
// yet migrated into the tenant folder) — it renders `fallback` (default null),
// so a broken image never flashes. The DB always stores the path, never the
// signed URL, so uploads/deletes keep operating on stable references.
function SignedImage({ value, alt = "", style, fallback = null }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    const path = toStoragePath(value);
    if (!path) return;
    supabase.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (active && !error && data?.signedUrl) setUrl(data.signedUrl);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [value]);
  if (!url) return fallback;
  return <img alt={alt} src={url} loading="lazy" decoding="async" style={style} />;
}

// A single pill on/off switch. Extracted so every settings toggle shares one
// piece of markup instead of repeating the same inline styles. `pc` is the
// tenant's primary color (the "on" background).
// It is a switch, and says so: role + state + a name (found 2026-10-07: nine unnamed buttons on the Automations tab, so a screen reader
// announced "button, button, button" for nine different automations).
function Toggle({ on, onChange, pc, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label || undefined} onClick={onChange} style={{ width: 46, height: 26, borderRadius:"var(--r-sm)", border: "none", cursor: "pointer", background: on ? pc : "#D8CEd3", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", transition: "left .2s" }} />
    </button>
  );
}

// One "label + switch (+ optional hint)" row for the Automations settings tab.
function AutoToggleRow({ label, desc, on, onChange, pc }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize:"var(--t-sm)", color: "var(--ink)" }}>{trv(label)}</span>
        <Toggle on={on} onChange={onChange} pc={pc} label={trv(label)} />
      </div>
      {desc &&<p style={{ fontSize:"var(--t-sm)", color: "var(--ink-3)", marginTop: 6, lineHeight: 1.5 }}>{trv(desc)}</p>}
    </div>
  );
}
/* @module-end */
export {
  AutoToggleRow, SignedImage, Toggle,
};

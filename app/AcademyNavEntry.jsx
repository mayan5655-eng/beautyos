"use client";
// app/AcademyNavEntry.jsx
//
// The "אקדמיה" entry in the side menu and in the "עוד" sheet. Renders NOTHING unless NEXT_PUBLIC_ACADEMY is on AND the server says
// she can open at least one course (/api/academy/summary; a platform admin always, to manage it). While that answer is unknown, or
// on any failure, nothing renders, so no entry ever leads to an empty screen.
import { useEffect, useState } from "react";
import { academyEnabled } from "@/lib/academy";
import { tr } from "@/lib/i18n/tr";

let cached = null; // one question per page load, shared by both entries

function useAcademyShown() {
  const on = academyEnabled();
  const [show, setShow] = useState(on && cached === true);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const q = cached !== null ? Promise.resolve(cached)
      : fetch("/api/academy/summary", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (cached = !!(j && j.show))).catch(() => false);
    q.then((v) => { if (alive) setShow(!!v); });
    return () => { alive = false; };
  }, [on]);
  return on && show;
}

const cap = (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }}>
    <path d="M2.5 9.2 12 4.8l9.5 4.4L12 13.6z" /><path d="M6.5 11.2v4.3c1.6 1.5 3.5 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.3" /><path d="M21.5 9.2v5" />
  </svg>
);

/** @param {{ variant: "nav" | "more", onOpen: () => void }} props */
export default function AcademyNavEntry({ variant, onOpen }) {
  const show = useAcademyShown();
  if (!show) return null;
  if (variant === "nav") {
    return (
      <button className="nav-item" data-testid="academy-nav" onClick={onOpen}>
        <span className="nav-ico">{cap}</span>
        <span style={{ flex: 1 }}>{tr("אקדמיה")}</span>
      </button>
    );
  }
  return (
    <button data-testid="academy-more" onClick={onOpen}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "14px 6px", borderRadius: "var(--r-md)", cursor: "pointer", fontFamily: "inherit",
        border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-2)" }}>
      {cap}
      <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{tr("אקדמיה")}</span>
    </button>
  );
}

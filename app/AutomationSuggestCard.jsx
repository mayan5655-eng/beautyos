"use client";
// Today screen: "want me to do this for you?" for the two opt-in automations (lib/automationSuggest.js). Each shows the EXACT message
// a client would get, one tap "להפעיל" stores her switch as true (the same key as Settings > הודעות), "לא עכשיו" hides the
// suggestion for good. Nothing is sent from here.
import { useState } from "react";
import { automationSuggestions } from "@/lib/automationSuggest.js";

export default function AutomationSuggestCard({ settings, services, onEnable, onDismiss, style }) {
  const [busy, setBusy] = useState(null);
  const [openPreview, setOpenPreview] = useState(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const items = automationSuggestions(settings, { services, origin });
  if (!items.length) return null;
  const btn = { minHeight: 44, padding: "0 16px", borderRadius: "var(--r-sm)", fontSize: "var(--t-sm)", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" };
  return (
    <div className="glass-card" data-testid="automation-suggest" style={{ padding: 16, marginBottom: 16, ...style }}>
      {items.map((it, i) => (
        <div key={it.key} data-testid={`automation-suggest-${it.key}`} style={{ borderTop: i ? "1px solid var(--line)" : "none", paddingTop: i ? 14 : 0, marginTop: i ? 14 : 0 }}>
          <p style={{ margin: "0 0 4px", fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)" }}>{it.question}</p>
          <p style={{ margin: "0 0 8px", fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>{it.body}</p>
          <button type="button" onClick={() => setOpenPreview(openPreview === it.key ? null : it.key)} aria-expanded={openPreview === it.key}
            style={{ background: "none", border: "none", padding: 0, minHeight: 44, color: "var(--ink)", fontWeight: 700, fontSize: "var(--t-sm)", fontFamily: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {openPreview === it.key ? "הסתרת ההודעה" : "איך ההודעה תיראה ללקוחה?"}
          </button>
          {openPreview === it.key && (
            <div data-testid={`automation-preview-${it.key}`} style={{ whiteSpace: "pre-wrap", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "4px 0 10px", fontSize: "var(--t-sm)", color: "var(--ink)", lineHeight: 1.6 }}>
              {/* Line by line: a link line is left-to-right on its own, or its trailing … jumps to the wrong end. */}
              {it.preview.split("\n").map((line, j) => (/^https?:\/\//.test(line)
                ? <div key={j} dir="ltr" style={{ textAlign: "right", overflowWrap: "anywhere" }}>{line}</div>
                : <div key={j} style={{ minHeight: "1em" }}>{line}</div>))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" data-testid={`automation-enable-${it.key}`} disabled={busy === it.key}
              onClick={async () => { setBusy(it.key); try { await onEnable(it.switchKey); } finally { setBusy(null); } }}
              style={{ ...btn, background: "var(--brand-deep)", color: "var(--brand-contrast)", border: "none", opacity: busy === it.key ? 0.6 : 1 }}>להפעיל</button>
            <button type="button" data-testid={`automation-dismiss-${it.key}`} onClick={() => onDismiss(it.key)}
              style={{ ...btn, background: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--line-2)" }}>לא עכשיו</button>
          </div>
        </div>
      ))}
    </div>
  );
}

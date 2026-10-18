"use client";
// app/TrialNudge.jsx
// One small card on day 1, day 10 and day 23 of the trial (lib/trialNudges). In the app only: no WhatsApp, no email, no request.
// She can close it; closing is remembered on this phone (localStorage, per business and per nudge). It never shows to a paying,
// blocked or undated tenant. It also steps aside when it would only repeat something already on screen: while the first-run tour is open,
// and on days 24 and 25 when the trial banner is already urgent and says the same thing about the deadline.
// It closes only when its button really did something: a blocked clipboard or a blocked pop-up leaves the card where it is.

import { useEffect, useState } from "react";
import { pickTrialNudge, nudgeCopy, nudgeStorageKey } from "@/lib/trialNudges";
import { supportWhatsAppUrl } from "@/lib/support";

export default function TrialNudge({ plan, tenantId, counts, suppress, onCopyLink, onOpenCashier, onContact, pc, pcDeep, pcTint, pcGrad }) {
  const nudge = plan ? pickTrialNudge({ status: plan.status, trialStartedAt: plan.trialStartedAt }) : null;
  const storageKey = nudge ? nudgeStorageKey(tenantId, nudge.key) : null;
  // Hidden until we know: reading localStorage on the server would differ from the browser and flash the card.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    if (!storageKey) return;
    try { setDismissed(window.localStorage.getItem(storageKey) === "1"); } catch { setDismissed(false); }
  }, [storageKey]);

  if (!nudge || dismissed || suppress) return null;
  if (nudge.key === "day23" && plan.tone === "urgent") return null;
  const copy = nudgeCopy(nudge.key, counts || { appointments: 0, clients: 0 });

  const close = () => {
    setDismissed(true);
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* private window: it just comes back next time */ }
  };
  const act = async () => {
    let worked = true;
    if (copy.action === "copy_link") worked = (await onCopyLink?.()) !== false;
    else if (copy.action === "open_cashier") onOpenCashier?.();
    else {
      const wa = supportWhatsAppUrl();
      if (wa) window.open(wa, "_blank", "noopener,noreferrer");
      else onContact?.();
    }
    if (worked) close();
  };

  return (
    <div
      role="status"
      data-testid="trial-nudge"
      style={{
        maxWidth: 1180, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        background: pcTint, border: `1px solid ${pc}55`, borderRadius: "var(--r-lg)", padding: "13px 16px", position: "relative",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <p className="serif" style={{ fontSize: "var(--t-md)", fontWeight: 600, color: pcDeep, marginBottom: 3 }}>{copy.title}</p>
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>{copy.body}</p>
      </div>
      <button
        type="button"
        onClick={act}
        className="primary-btn"
        style={{ background: pcGrad, color: "var(--pc-contrast)", fontSize: "var(--t-sm)", fontWeight: 600, padding: "10px 16px", minHeight: 44, borderRadius: "var(--r-sm)", whiteSpace: "nowrap" }}
      >
        {copy.actionLabel}
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="סגירה"
        style={{ background: "none", border: "none", color: "var(--ink-2)", fontSize: "var(--t-md)", cursor: "pointer", minWidth: 44, minHeight: 44 }}
      >
        ✕
      </button>
    </div>
  );
}

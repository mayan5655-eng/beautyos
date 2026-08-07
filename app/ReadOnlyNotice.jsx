"use client";
// app/ReadOnlyNotice.jsx
// The read-only explanation for the standalone dashboard pages (leads,
// new campaign, campaign detail). beautyos.jsx already shows <TrialBanner/>,
// which covers the same ground inside the main app.
//
// Renders NOTHING unless the account is definitively blocked, so an active or
// trialling tenant never sees it.
//
// All Hebrew comes from lib/planCopy, so this and TrialBanner cannot drift.
// These pages do not have her primary_color to hand, so this uses the neutral
// surface tokens rather than inventing a brand colour.

import { blockedNoticeHe, CTA_WHATSAPP_HE, CTA_RENEW_HINT_HE } from "@/lib/planCopy";
import { supportWhatsAppUrl } from "@/lib/support";

export default function ReadOnlyNotice({ plan }) {
  if (!plan || !plan.isBlocked) return null;

  const { title, body } = blockedNoticeHe(plan.status);

  return (
    <div
      role="status"
      dir="rtl"
      style={{
        maxWidth: 900,
        margin: "0 0 20px",
        background: "var(--brand-cream, #FEFAF7)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: "16px 18px",
        fontFamily: "'Assistant', system-ui, sans-serif",
      }}
    >
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</p>
      <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.65 }}>{body}</p>
      <p style={{ margin: "3px 0 12px", fontSize: 12, color: "var(--ink-3)" }}>{CTA_RENEW_HINT_HE}</p>
      <a
        href={supportWhatsAppUrl()}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          background: "linear-gradient(135deg, var(--pc-2, #6B5279) 0%, var(--pc) 100%)",
          color: "var(--surface)",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 18px",
          borderRadius: 12,
          textDecoration: "none",
        }}
      >
        {CTA_WHATSAPP_HE}
      </a>
    </div>
  );
}

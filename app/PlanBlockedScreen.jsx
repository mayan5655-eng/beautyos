"use client";
// app/PlanBlockedScreen.jsx
// What an expired or paused business sees INSTEAD of the dashboard.
//
// Owner decision 2026-10-21: when the 30-day trial ends without payment the
// system closes completely. No read-only mode, no calendar, no client list:
// only this screen, with the way back. Nothing is deleted. The moment the plan
// is active again the dashboard loads exactly as it was.
//
// beautyos.jsx renders this in place of the whole shell (see the early return
// after `loadError`), and loadAll stops before any calendar or client row is
// put into state, so there is nothing behind this screen to reveal.
//
// It is Kalmea talking to her about her account, so it uses Kalmea's own
// chrome (--brand-*), not her primary_color. Wording comes from lib/planCopy.
//
// `cta` (optional) is the upgrade button from the upgrade-buttons work: the
// same slot contract as TrialBanner's. BillingCard renders only when billing is
// switched on for the deployment, and stays usable here because no billing
// route uses the plan guard: a closed business must be able to pay.
//
// `recheck` (optional) reads her plan again and reopens the dashboard when it is
// active, on the "שילמתי, לבדוק שוב" button. Coming back to the tab and the
// 30-second timer are handled by the effect inside (no reload needed by hand).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "./supabase";
import { planState, publicGraceEndsAt } from "@/lib/planState";
import { planPayUrl } from "@/lib/planPay";
import { PLAN_PRICES } from "@/lib/pricing";
import BrandImage from "@/app/BrandImage";
import { ICON_FLOWER } from "@/lib/brand";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import { tr, trv, uiDir } from "@/lib/i18n/tr";
import {
  blockedNoticeHe,
  blockedClientsNoteHe,
  planPayCtaHe,
  PLAN_PAY_HINT_HE,
  PRICE_LINE_HE,
  CTA_WHATSAPP_HE,
  CTA_RENEW_HINT_HE,
} from "@/lib/planCopy";

const BillingCard = dynamic(() => import("./BillingCard"), { ssr: false });

export default function PlanBlockedScreen({ plan, businessName = "", isDemo = false, toast, onSignOut, cta = null, recheck = null }) {
  const { title, body } = blockedNoticeHe(plan?.status, plan?.trialEndsAt);
  // The automatic re-check on return / every 30 seconds is the effect below; the button runs `recheck` on demand.
  const [checking, setChecking] = useState(false);
  const checkNow = async () => {
    if (!recheck || checking) return;
    setChecking(true);
    try {
      const reopened = await recheck();
      if (!reopened) toast?.("עדיין לא רואים את התשלום. אם שילמת עכשיו, זה יכול לקחת דקה. המסך יתעדכן לבד.");
    } finally { setChecking(false); }
  };
  const wa = supportWhatsAppUrl();
  // A paused account is an arrangement, not a sale: no price pitch there.
  const showPrice = plan?.status === "expired";
  // Her own payment page for the plan (NEXT_PUBLIC_PLAN_PAY_URL, lib/planPay.ts), only for an ended trial and only when set.
  const payUrl = showPrice ? planPayUrl() : null;
  const price = Number(plan?.planPrice) > 0 ? Number(plan.planPrice) : PLAN_PRICES.launch;
  // Her public page stays open a few more days after the trial (lib/planState publicGraceDays): say until when.
  const clientsNote = blockedClientsNoteHe(plan ? publicGraceEndsAt(plan) : null);

  // She paid (BillingCard, or we activated her by hand after a WhatsApp chat): open the system by itself, no refresh needed.
  // Checked when she comes back to the tab (the card page opens in another one) and every 30 seconds while it is open.
  // Only a row that is READ and is no longer blocked reopens: a failed read keeps this screen, it never loops a reload.
  useEffect(() => {
    if (isDemo) return undefined;
    let alive = true;
    let busy = false;
    const check = async () => {
      if (busy || !alive || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      busy = true;
      try {
        const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
        if (!tenantId) return;
        const { data, error } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
        if (alive && !error && data && !planState(data).isBlocked) window.location.reload();
      } catch {
        // keep the screen; the next check tries again
      } finally {
        busy = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 30000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, [isDemo]);

  return (
    <div
      dir={uiDir()}
      data-testid="plan-blocked-screen"
      style={{
        minHeight: "100dvh",
        background: "var(--brand-cream, #FBF8F1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px",
        fontFamily: "var(--sans, 'Assistant', system-ui, sans-serif)",
        color: "var(--ink)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
        <section
          role="status"
          style={{
            background: "var(--brand-surface, #FFFFFF)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: "30px 24px",
            textAlign: "center",
          }}
        >
          <BrandImage width={64} height={64} aria-hidden alt="" src={ICON_FLOWER} style={{ width: 64, height: 64, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
          {businessName && (
            <p style={{ margin: "0 0 4px", fontSize: "var(--t-sm)", color: "var(--ink-3)" }}>{businessName}</p>
          )}
          <h1 className="serif" style={{ margin: "0 0 10px", fontSize: "var(--t-2xl)", fontWeight: 600, color: "var(--brand-accent)" }}>{trv(title)}</h1>
          <p style={{ margin: "0 0 10px", fontSize: "var(--t-md)", lineHeight: 1.7, color: "var(--ink-2)" }}>{trv(body)}</p>
          {showPrice && (
            <p data-testid="plan-blocked-price" style={{ margin: "0 0 10px", fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)" }}>{PRICE_LINE_HE}</p>
          )}
          <p style={{ margin: "0 0 20px", fontSize: "var(--t-sm)", lineHeight: 1.65, color: "var(--ink-3)" }}>{clientsNote}</p>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            {trv(cta)}
            {payUrl ? (
              <a
                href={payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="primary-btn"
                data-testid="plan-blocked-pay"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, background: "var(--brand-accent)", color: "var(--brand-contrast, #FFFFFF)", fontSize: "var(--t-md)", fontWeight: 600, borderRadius: "var(--r-sm)", textDecoration: "none" }}
              >
                {planPayCtaHe(price)}
              </a>
            ) : null}
            {payUrl ? <p style={{ margin: 0, fontSize: "var(--t-sm)", lineHeight: 1.6, color: "var(--ink-3)" }}>{PLAN_PAY_HINT_HE}</p> : null}
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="primary-btn"
                data-testid="plan-blocked-whatsapp"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 48,
                  // Second to the pay button when there is one, the main way out when there is not.
                  background: payUrl ? "transparent" : "var(--brand-accent)",
                  border: payUrl ? "1px solid var(--brand-accent)" : "none",
                  color: payUrl ? "var(--brand-accent)" : "var(--brand-contrast, #FFFFFF)",
                  fontSize: "var(--t-md)",
                  fontWeight: 600,
                  borderRadius: "var(--r-sm)",
                  textDecoration: "none",
                }}
              >
                {CTA_WHATSAPP_HE}
              </a>
            ) : null}
            <p style={{ margin: 0, fontSize: "var(--t-sm)", color: "var(--ink-3)" }}>
              {CTA_RENEW_HINT_HE}{wa ? "" : ` ${KALMEA_SUPPORT_WHATSAPP_DISPLAY}`}
            </p>
          </div>
        </section>

        {/* Pay-to-continue when billing is on. Renders nothing at all when it is off. */}
        <BillingCard pc="var(--brand-accent)" pcTint="var(--brand-tint)" toast={toast} isDemo={isDemo} />

        {recheck && (
          <button
            type="button"
            data-testid="plan-blocked-recheck"
            onClick={checkNow}
            disabled={checking}
            style={{ alignSelf: "center", background: "none", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", color: "var(--ink-2)", fontSize: "var(--t-sm)", fontWeight: 600, padding: "10px 16px", cursor: checking ? "wait" : "pointer", minHeight: 44, fontFamily: "inherit" }}
          >
            {checking ? tr("בודקת…") : tr("שילמתי, לבדוק שוב")}
          </button>
        )}

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            style={{ alignSelf: "center", background: "none", border: "none", color: "var(--ink-3)", fontSize: "var(--t-sm)", textDecoration: "underline", cursor: "pointer", minHeight: 44, fontFamily: "inherit" }}
          >
            {tr("יציאה מהחשבון")}
          </button>
        )}
      </div>
    </div>
  );
}

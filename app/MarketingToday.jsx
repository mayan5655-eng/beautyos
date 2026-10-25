"use client";
// app/MarketingToday.jsx
//
// "שיווק היום" on the home screen: up to three short rows, each shown only when real data backs it.
//   1. Win-back: how many clients have not been back for her win-back period -> opens the existing list
//      (LapsedClientsModal), which applies the consent rule and explains who was left out and why.
//   2. Review requests: clients who were here this week, one tap each to WhatsApp, with the signed link to her own
//      review form (/api/reviews/links), else her Google link, else the plain ask plus a hint to add a link.
//   3. Today's post: the first suggestion we can caption honestly (lib/marketingToday.ts), copy in one tap, or open
//      it in the content tab.
// Nothing is sent from here: every message leaves from her own WhatsApp via a wa.me link she taps. Renders nothing
// when no row has anything to say.
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { waLink } from "@/lib/phone";
import { suggestPosts } from "@/lib/design/suggestions";
import { holidayTemplates } from "@/lib/design/holidayTemplates";
import { businessFieldsOf } from "@/lib/businessFields";
import { reviewTargets, reviewMessage, todaysPost } from "@/lib/marketingToday";

const row = { display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: "1px solid var(--line)" };
const label = { flex: 1, minWidth: 0, fontSize: 14, color: "var(--ink)", lineHeight: 1.5 };
const sub = { display: "block", fontSize: 12.5, color: "var(--brand-muted)" };

export default function MarketingToday({ settings, appointments, clients, services, today, historyReady, coldCount, winbackDays, pageUrl, pc, pcTint, onOpenWinback, onOpenContent, toast }) {
  const branding = settings?.branding && typeof settings.branding === "object" ? settings.branding : {};
  const businessName = String(settings?.business_name || "").trim();
  const googleUrl = /^https:\/\//i.test(String(settings?.review_url || "").trim()) ? String(settings.review_url).trim() : "";

  const targets = useMemo(
    () => (historyReady ? reviewTargets(appointments || [], clients || [], today) : []),
    [historyReady, appointments, clients, today]
  );
  const post = useMemo(() => {
    try {
      const fields = businessFieldsOf(settings);
      // designs are not loaded on the home screen: the suggestion may repeat a post she made, which the content tab
      // (where designs are loaded) would have skipped. Harmless for one caption she reads before copying.
      const list = suggestPosts({ appointments: appointments || [], services: services || [], designs: [], reviews: [], holidayTemplates: holidayTemplates(fields), fields });
      return todaysPost(list, pageUrl);
    } catch {
      return null;
    }
  }, [settings, appointments, services, pageUrl]);

  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [links, setLinks] = useState(null); // null = not asked yet; {} = none available
  const [linksError, setLinksError] = useState(false);
  const [linksBusy, setLinksBusy] = useState(false);
  const [sent, setSent] = useState({});
  const [showAll, setShowAll] = useState(false);
  const REVIEWS_FIRST = 6;

  const openReviews = async () => {
    setReviewsOpen((o) => !o);
    if (links !== null || linksBusy || !targets.length) return;
    setLinksBusy(true);
    try {
      const r = await fetch("/api/reviews/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentIds: targets.map((t) => t.appointmentId) }),
      });
      const j = await r.json().catch(() => ({}));
      // A failed request is not "no links": it would tell her to add a Google link and send the messages without the private feedback link.
      if (r.ok && j?.success) { setLinksError(false); setLinks(j.links && typeof j.links === "object" ? j.links : {}); } else setLinksError(true);
    } catch {
      setLinksError(true);
    } finally {
      setLinksBusy(false);
    }
  };

  const copyCaption = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.caption);
      toast?.("הטקסט הועתק. אפשר להדביק בפוסט או בסטורי");
    } catch {
      toast?.("לא הצלחנו להעתיק. אפשר לפתוח לעריכה ולהעתיק משם", "error");
    }
  };

  const showWinback = historyReady && coldCount > 0;
  const showReviews = targets.length > 0;
  const showPost = !!post;
  if (!showWinback && !showReviews && !showPost) return null;

  const btn = { flexShrink: 0, padding: "7px 14px", minHeight: 44, display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${pc}`, background: "var(--surface)", color: "var(--pc-text)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none" };
  const hasAnyLink = (links && Object.keys(links).length > 0) || !!googleUrl;

  return (
    <section className="glass-card card-boxed" aria-label="שיווק היום" data-testid="marketing-today" style={{ padding: "14px 17px 6px", marginBottom: 12, maxWidth: 1180, marginInline: "auto" }}>
      <p style={{ fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>שיווק היום</p>

      {showWinback && (
        <div style={row}>
          <span aria-hidden="true" style={{ color: pc, fontSize: 16 }}>✦</span>
          <span style={label}>
            {coldCount === 1 ? "לקוחה אחת לא הגיעה" : `${coldCount} לקוחות לא הגיעו`} מעל {winbackDays} יום
            <span style={sub}>הודעה אישית קטנה מחזירה הרבה מהן</span>
          </span>
          <button type="button" onClick={onOpenWinback} style={btn}>לרשימה</button>
        </div>
      )}

      {showReviews && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ ...row, borderTop: "none" }}>
            <span aria-hidden="true" style={{ color: pc, fontSize: 16 }}>★</span>
            <span style={label}>
              {targets.length === 1 ? "לקוחה אחת הייתה אצלך השבוע" : `${targets.length} לקוחות היו אצלך השבוע`}
              <span style={sub}>ביקורת טובה מביאה לקוחות חדשות</span>
            </span>
            <button type="button" onClick={openReviews} aria-expanded={reviewsOpen} style={btn}>{reviewsOpen ? "סגירה" : "לבקש ביקורת"}</button>
          </div>
          {reviewsOpen && (
            <div style={{ paddingBottom: 10 }}>
              {linksBusy && <p style={{ ...sub, padding: "4px 0" }}>מכינה קישורים…</p>}
              {!linksBusy && links === null && linksError && (
                <p style={{ ...sub, padding: "4px 0" }}>
                  לא הצלחנו להכין את הקישורים.{" "}
                  <button type="button" onClick={() => { setReviewsOpen(false); openReviews(); }} style={{ border: "none", background: "none", color: pc, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>לנסות שוב</button>
                </p>
              )}
              {!linksBusy && links !== null && !hasAnyLink && (
                <p style={{ fontSize: 12.5, color: "var(--ink-2)", background: pcTint, borderRadius: 10, padding: "8px 10px", margin: "2px 0 8px", lineHeight: 1.5 }}>
                  ההודעה תצא בלי קישור. כדאי להוסיף את לינק הביקורת שלך בגוגל בהגדרות, כדי שיהיה להן איפה לכתוב.
                </p>
              )}
              {!linksBusy && links !== null && (showAll ? targets : targets.slice(0, REVIEWS_FIRST)).map((t) => {
                const href = waLink(t.phone, reviewMessage({ name: t.name, businessName, link: links[t.appointmentId] || null, googleUrl }));
                return (
                  <div key={t.clientId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--ink)", overflowWrap: "anywhere" }}>{t.name || "לקוחה"}</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" onClick={() => setSent((s) => ({ ...s, [t.clientId]: true }))}
                        style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6, background: sent[t.clientId] ? pcTint : "var(--surface)" }}>
                        <Icon name="whatsapp" size={14} /> {sent[t.clientId] ? "נפתח ✓" : "שליחה"}
                      </a>
                    ) : (
                      <span style={sub}>אין מספר תקין</span>
                    )}
                  </div>
                );
              })}
              {!linksBusy && links !== null && !showAll && targets.length > REVIEWS_FIRST && (
                <button type="button" onClick={() => setShowAll(true)} style={{ ...btn, marginTop: 4, border: "1px solid var(--line-2)", color: "var(--ink-2)" }}>
                  עוד {targets.length - REVIEWS_FIRST}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showPost && (
        <div style={{ ...row, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ color: pc, fontSize: 16, lineHeight: 1.5 }}>✎</span>
          <span style={label}>
            מה מפרסמים היום
            <span style={sub}>{post.suggestion.reason}</span>
            <span style={{ display: "block", marginTop: 6, padding: "8px 10px", borderRadius: 10, background: pcTint, fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{post.caption}</span>
            <span style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={copyCaption} style={btn}>העתקת הטקסט</button>
              <button type="button" onClick={onOpenContent} style={{ ...btn, border: "1px solid var(--line-2)", color: "var(--ink-2)" }}>לעיצוב התמונה</button>
            </span>
          </span>
        </div>
      )}
    </section>
  );
}

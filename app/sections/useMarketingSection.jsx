"use client";
// app/sections/useMarketingSection.jsx — part of the owner's app: 196 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useEffect, useRef } from "react";
import { APP_URL } from "@/lib/appUrl";
import { supabase } from "../supabase";
import { firstLinkMessage } from "@/lib/firstBooking";
import { loadUpgrades } from "../UpgradesStore";
import { withSource } from "@/lib/bookingSource";
import { tr } from "@/lib/i18n/tr";

export function useMarketingSection(ctx) {
  const {
    activeServices, activeTab, fbDatePreset, fbPageBusy, loadScanLink, mySlug, openSetupTab, persistTourPatch,
    reelData, reelDuration, reelLoading, reelTopic, reelVibe, scanLink, scanLinkError, setFbCampaigns,
    setFbError, setFbEventFails, setFbLoading, setFbPage, setFbPageBusy, setFbPages, setFbTotals, setLinkShared,
    setReelData, setReelError, setReelLoading, setReelTopic, settings, settingsGroup, showSettings, toast,
  } = ctx;
  /* @section-body */const loadFbConnection = async () => {
    try {
      const { data, error: fbErr } = await supabase
        .from("facebook_pages")
        .select("page_id, page_name, is_active, instagram_business_id");
      // A failed read is not "no page connected": say so instead of offering to connect a page she already connected.
      if (fbErr && !/does not exist|schema cache/i.test(fbErr.message || "")) { toast(tr("לא הצלחנו לבדוק את החיבור לפייסבוק. נסי לרענן את הדף."), "error"); return; }
      const all = Array.isArray(data) ? data : [];
      setFbPages(all);
      const firstOn = all.find((p) => p.is_active);
      setFbPage(firstOn ? { page_name: firstOn.page_name } : null);
    } catch { /* non-fatal — leave as not-connected */ }
    // Failed webhook events in the last 7 days. head:true fetches no rows, only
    // the count; RLS scopes it to the tenant. If the table is missing (migration
    // not applied yet) this errors and the badge simply stays off.
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("facebook_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("processed", false)
        .gte("created_at", since);
      setFbEventFails(error ? 0 : (count || 0));
    } catch { /* non-fatal — badge stays off */ }
  };

  // Turn lead delivery from one Page on or off (/api/facebook/pages). Nothing is deleted; the Page row stays.
  const toggleFbPage = async (pageId, active) => {
    if (fbPageBusy) return;
    setFbPageBusy(pageId);
    try {
      const res = await fetch("/api/facebook/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, active }) });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d || !d.success) { toast((d && d.error) || tr("לא הצלחנו לעדכן את הדף"), "error"); return; }
      await loadFbConnection();
      toast(active ? tr("קבלת פניות מהדף הופעלה") : tr("קבלת פניות מהדף הופסקה"));
    } catch { toast(tr("לא הצלחנו לעדכן את הדף. בדקי את החיבור."), "error"); }
    finally { setFbPageBusy(""); }
  };
  // The Facebook connection (page + failed-event count) is only shown on the content and leads tabs.
  useEffect(() => {
    if (activeTab === "campaigns" || activeTab === "leads") loadFbConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  // ...and in Settings > connections, which lists every Page.
  useEffect(() => {
    if (showSettings && settingsGroup === "connections") loadFbConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, settingsGroup]);

  // Fetch live Facebook ad campaigns for the current tenant
  const fbLoadSeq = useRef(0);
  const loadFbCampaigns = async (preset) => {
    // Only the newest request may write: switching the range quickly used to let a slow earlier answer land
    // last and show the wrong period.
    const seq = ++fbLoadSeq.current;
    setFbLoading(true); setFbError(null);
    try {
      const dp = preset || fbDatePreset;
      const res = await fetch(`/api/marketing/campaigns?datePreset=${dp}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== fbLoadSeq.current) return;
      if (data.ok) {
        setFbCampaigns(data.campaigns || []);
        setFbTotals(data.totals || null);
      } else {
        setFbCampaigns([]);
        setFbError(data.error || tr("לא הצלחנו לטעון את הקמפיינים"));
      }
    } catch (err) {
      if (seq !== fbLoadSeq.current) return;
      setFbError(tr("אין חיבור. לא הצלחנו לטעון את הקמפיינים, נסי שוב"));
      setFbCampaigns([]);
    } finally {
      if (seq === fbLoadSeq.current) setFbLoading(false);
    }
  };

  // === AI MARKETING: full flow (strategy -> posts with images, + groups) ===
  // The generated script is kept for the tab session: it is a paid AI call, and navigating away or a refresh
  // used to lose it.
  useEffect(() => {
    try {
      if (reelData) return;
      const raw = sessionStorage.getItem("kalmea:last-reel");
      const o = raw ? JSON.parse(raw) : null;
      if (o && o.reel && typeof o.reel === "object") { setReelData(o.reel); if (typeof o.topic === "string") setReelTopic(o.topic); }
    } catch { /* storage unavailable: nothing to restore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const generateReel = async () => {
    if (!reelTopic.trim()) { toast(tr("כתבי נושא לרילס"), "error"); return; }
    if (reelLoading) return;
    setReelLoading(true); setReelError(null); setReelData(null);
    try {
      const res = await fetch("/api/marketing/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: reelTopic.trim(), duration: reelDuration, vibe: reelVibe }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.reel) {
        setReelData(data.reel);
        try { sessionStorage.setItem("kalmea:last-reel", JSON.stringify({ reel: data.reel, topic: reelTopic.trim() })); } catch { /* optional */ }
        if (data.capNotice) toast(data.capNotice);
      } else {
        setReelError(data.error || tr("לא הצלחנו ליצור את הרילס, אפשר לנסות שוב"));
      }
    } catch (err) {
      setReelError(tr("אין חיבור. הרילס לא נוצר, אפשר לנסות שוב"));
    } finally {
      setReelLoading(false);
      loadUpgrades(true); // the meter and the chip show the reel she just used
    }
  };

  // channel: where she is about to paste it (lib/bookingSource.ts), so a booking from it is counted under that channel.
  // okMsg: the toast after a copy, when the caller knows better where it is going (the booking buttons card names the platform).
  const copyPublicLink = async (kind, channel = "link", okMsg = "") => {
    const t = settings.tenant_id;
    if (!t) { toast(tr("חסר מזהה עסק, אפשר לרענן את הדף"), "error"); return false; }
    // The origin the app is served on, so the copied link points at THIS
    // install (bloomos.com today) rather than a hardcoded vendor address.
    const base = (typeof window !== "undefined" && window.location.origin) || APP_URL;

    if (kind === "scan") {
      // Always the signed link, on this origin - the one the QR is drawn from.
      const url = scanLink || (await loadScanLink());
      if (!url) { toast(scanLinkError || tr("לא הצלחנו להפיק את הקישור"), "error"); return; }
      try {
        await navigator.clipboard.writeText(url);
        toast(tr("קישור הסורק הועתק"));
      } catch {
        toast(url, "info");
      }
      return;
    }

    // A booking link with no treatment on it can book nothing ("רשימת הטיפולים עדיין בהכנה"): first a treatment, then the link. The
    // day-1 nudge, the setup checklist and the tour all copy it, and copying ticked the checklist step (2026-11-02 audit).
    if (kind === "book" && activeServices.length === 0) {
      toast(tr("קודם מוסיפים לפחות טיפול אחד, ואז הקישור מוכן לשליחה"), "info");
      openSetupTab("services", "newService");
      return false;
    }

    // Her readable URL when she has claimed one; the original otherwise. Both
    // resolve to the same page - /book?t= has to keep working forever, because
    // it is in every link she has already sent.
    const url = kind === "community" ? `${base}/community?t=${t}`
      : withSource(mySlug ? `${base}/${encodeURIComponent(mySlug)}` : `${base}/book?t=${t}`, channel);
    try {
      await navigator.clipboard.writeText(url);
      toast(okMsg ? okMsg : kind === "scan" ? tr("קישור הסורק הועתק") : kind === "community" ? tr("קישור הקהילה הועתק") : tr("הקישור לקביעת תור הועתק. עכשיו הדביקי אותו בוואטסאפ ללקוחה"));
      if (kind === "book") {
        setLinkShared(true); try { localStorage.setItem(`kl_link_shared_${t}`, "1"); } catch { /* private mode: the tick lasts this visit */ }
        // Also on her account, once: the tick was per device, so copying on the phone left the step open on the computer.
        if (!settings?.automations?.link_shared_at) persistTourPatch({ link_shared_at: new Date().toISOString() });
      }
      // Her first link is the long one (an id, not her name). Say once, kindly, that a short readable address exists.
      if (kind === "book" && !mySlug) setTimeout(() => toast(tr("הקישור עוד ארוך. בהגדרות ← הדף שלי אפשר לבחור כתובת קצרה עם שם העסק."), "info"), 900);
      return true;
    } catch {
      // No clipboard here (the in-app browsers of Instagram and Facebook): hand the link to the phone's share sheet while the tap is still
      // live, and only then fall back to showing it. A bare address in a toast that vanishes in three seconds cannot be copied.
      // Shared through the share sheet counts like a copy, on this phone AND on her account (it used to tick only until the next reload).
      try { if (typeof navigator.share === "function") { await navigator.share({ url }); if (kind === "book") rememberLinkShared(); return true; } }
      catch (e) { if (e && e.name === "AbortError") return false; }
      toast(tr("אי אפשר להעתיק כאן. הקישור: {0}", [url]), "info");
      return false;   // not copied: the day-1 nudge stays so she can try again
    }
  };
  // The tick for "she sent her booking link", on this phone and once on her account. Same three marks the copy path writes above.
  const rememberLinkShared = () => {
    const t = settings.tenant_id;
    setLinkShared(true); try { localStorage.setItem(`kl_link_shared_${t}`, "1"); } catch { /* private mode: the tick lasts this visit */ }
    if (!settings?.automations?.link_shared_at) persistTourPatch({ link_shared_at: new Date().toISOString() });
  };
  // "שליחה בוואטסאפ" on the 3-step card: opens HER WhatsApp with the message and link ready, and she picks the client and presses send.
  // Nothing is sent by us. The same no-treatment guard as copyPublicLink: a link with no treatment on it can book nothing.
  const shareBookingWhatsApp = () => {
    const t = settings.tenant_id;
    if (!t) { toast(tr("חסר מזהה עסק, אפשר לרענן את הדף"), "error"); return; }
    if (activeServices.length === 0) {
      toast(tr("קודם מוסיפים לפחות טיפול אחד, ואז הקישור מוכן לשליחה"), "info");
      openSetupTab("services", "newService");
      return;
    }
    const base = (typeof window !== "undefined" && window.location.origin) || APP_URL;
    const url = withSource(mySlug ? `${base}/${encodeURIComponent(mySlug)}` : `${base}/book?t=${t}`, "whatsapp");
    const w = window.open(`https://wa.me/?text=${encodeURIComponent(firstLinkMessage(url, settings?.business_name))}`, "_blank", "noopener,noreferrer");
    // noopener makes window.open return null even when it worked, so a null is not proof of a block: the tick is kept either way,
    // because the button only ever opens her own WhatsApp and she decides whether to send.
    void w;
    rememberLinkShared();
  };/* @section-end */
  return { copyPublicLink, generateReel, loadFbCampaigns, loadFbConnection, shareBookingWhatsApp, toggleFbPage };
}

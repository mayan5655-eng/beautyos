"use client";
// app/sections/useScreenLinkSection.jsx — part of the owner's app: 69 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useEffect, useLayoutEffect, useRef } from "react";
import { PAYMENT_NOTICE_HE } from "@/lib/legalReceipts/policy";
import { waStatusLabel, WA_TYPE_LABELS as WA_TYPE_LABELS_BASE } from "@/lib/waStatusLabel";
import { isTabVisible } from "@/lib/featureFlags";
import { viewAllowsTab } from "@/lib/viewMode";
import { screenFromSearch, searchForScreen, sameScreen, viewOf } from "@/lib/screenLink";

export function useScreenLinkSection(ctx) {
  const {
    activeTab, aiPostsView, closeSettings, loading, loadWaMessages, marketingView, openSettings, panelDirty,
    setActiveTab, setAiPostsView, setMarketingView, setSettingsGroup, settings, settingsGroup, setWaView,
    showSettings, waLogLoading, waMessages, waView,
  } = ctx;
  /* @section-body */useEffect(()=>{
    if(activeTab!=="dashboard"||waMessages!==null||waLogLoading) return;
    loadWaMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeTab]);
  // Hebrew labels for the message_type column. slot_offer and lead_bulk are
  // written by the gap-fill and lead-template send paths.
  // Hebrew labels for message_type, and the status column: lib/waStatusLabel.js.
  const WA_TYPE_LABELS = { ...WA_TYPE_LABELS_BASE, receipt:PAYMENT_NOTICE_HE };


  // What "status" has always meant versus what actually happened: "sent"
  // (lib/whatsapp.js) only ever meant GreenAPI's API accepted the call - its
  // server returns 200 even when the WhatsApp session behind it is logged
  // out, so this is NOT proof of arrival. delivery_status is the honest
  // answer, written only when GreenAPI's own outgoingMessageStatus webhook
  // confirms it (app/api/whatsapp-webhook/route.js) - null means exactly
  // "handed off, nothing has confirmed it arrived yet", not "delivered".
  // See supabase/migrations/pending/whatsapp-delivery-status.sql.
  const waDeliveryLabel = waStatusLabel;



  // ── A link of its own for every screen (lib/screenLink.ts). The address follows the screen, Back and forward follow the
  // address. It is read only once the data has loaded: until then settings has no flags, so a tab a tenant opted into
  // looks hidden, and the screens' loaders need the tenant. Layout effects, so a refresh never paints היום first. The
  // write hook stays above the read hook: in the commit that reads the address it must still be switched off.
  const screenLinkReady = useRef(false);
  useLayoutEffect(() => {
    if (!screenLinkReady.current) return;
    const at = { tab: activeTab, section: showSettings ? settingsGroup : null, view: viewOf(activeTab, { waView, marketingView, aiPostsView }) };
    const { pathname, search, hash } = window.location;
    if (!sameScreen(screenFromSearch(search), at)) window.history.pushState(null, "", pathname + searchForScreen(search, at) + hash);
  }, [activeTab, showSettings, settingsGroup, waView, marketingView, aiPostsView]);
  const openScreenRef = useRef(null);
  openScreenRef.current = () => {
    const { pathname, search, hash } = window.location;
    const wanted = screenFromSearch(search);
    if (wanted.tab && (!isTabVisible(settings, wanted.tab) || !viewAllowsTab(settings, wanted.tab))) wanted.tab = "dashboard";
    if (showSettings && !wanted.section && panelDirty) {
      // Back while she has unsaved changes: the panel stays until she answers, and the address with it.
      window.history.pushState(null, "", pathname + searchForScreen(search, { tab: null, section: settingsGroup, view: null }) + hash);
      closeSettings();
      return;
    }
    const clean = searchForScreen(search, wanted);
    if (clean !== search) window.history.replaceState(null, "", pathname + clean + hash);
    if (wanted.section) { setSettingsGroup(wanted.section); if (!showSettings) openSettings(); return; }
    if (showSettings) closeSettings();
    setActiveTab(wanted.tab);
    if (wanted.tab === "whatsapp") {
      setWaView(wanted.view || "send");
      if (wanted.view === "log" && waMessages === null) loadWaMessages();
    }
    if (wanted.tab === "campaigns") {
      setMarketingView(wanted.view === "campaigns" ? "campaigns" : "posts");
      setAiPostsView(wanted.view === "reels" ? "reels" : "studio");
    }
  };
  useLayoutEffect(() => {
    if (loading || screenLinkReady.current) return;
    screenLinkReady.current = true;
    openScreenRef.current();
  }, [loading]);
  useEffect(() => {
    const onPop = () => { if (screenLinkReady.current) openScreenRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);/* @section-end */
  return { WA_TYPE_LABELS, waDeliveryLabel };
}

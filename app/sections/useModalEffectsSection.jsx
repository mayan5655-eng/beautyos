"use client";
// app/sections/useModalEffectsSection.jsx — part of the owner's app: 126 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: loadAdvisor, loadClientPhotos, loadClientScans, loadCommunityPosts, loadFbConnection, loadPendingQuestion, loadProtocols are declared further down the component than this hook's call. A handler here may call
// them (handlers run after the whole component body has), but reading them while rendering would be an error. So they arrive as getters and are
// wrapped below: read only when called.
import { useEffect, useRef } from "react";
import { isTabVisible } from "@/lib/featureFlags";
import { viewAllowsTab, viewAllowsSettingsGroup } from "@/lib/viewMode";
import { tr } from "@/lib/i18n/tr";

export function useModalEffectsSection(ctx) {
  const {
    activeTab, advisorMessages, advisorSending, closeSettings, confirmDialog, selectedClient, setActiveTab,
    setAdvisorWaitSec, setClientPhotos, setClientScans, setConfirmDialog, setEditingClient, setEditingLead,
    setEditSettings, setPhotoTreatmentPrefill, setSelectedClient, setSelectedLead, setSettingsGroup,
    setShowCashier, setShowClientModal, setShowImportModal, setShowLeadModal, setShowMobileSidebar, setShowModal,
    setShowNewService, setShowPackageModal, setShowPostModal, setShowProtocolModal, setShowReceipt,
    setShowSettings, setShowWaitlistModal, settings, settingsGroup, showCashier, showClientModal,
    showImportModal, showLeadModal, showModal, showPackageModal, showPostModal, showProtocolModal, showReceipt,
    showSettings, showWaitlistModal, toast, late,
  } = ctx;
  const loadAdvisor = (...args) => late.loadAdvisor(...args);
  const loadClientPhotos = (...args) => late.loadClientPhotos(...args);
  const loadClientScans = (...args) => late.loadClientScans(...args);
  const loadCommunityPosts = (...args) => late.loadCommunityPosts(...args);
  const loadFbConnection = (...args) => late.loadFbConnection(...args);
  const loadPendingQuestion = (...args) => late.loadPendingQuestion(...args);
  const loadProtocols = (...args) => late.loadProtocols(...args);
  /* @section-body */useEffect(() => {
    // loadFbConnection is NOT called here any more: its two queries ran for every tenant at boot, including the
    // many who never open the content or leads tabs. It runs when one of those opens (effect below), and after
    // the OAuth return further down.
    loadPendingQuestion();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("fb_success") === "true") {
        toast(tr("הדף חובר בהצלחה ✦"));
        loadFbConnection();
      } else if (params.get("fb_error")) {
        // Show the real reason when the callback sent one (fb_reason carries
        // the actual error text). A generic "failed, try again" cost three
        // debugging round-trips on an error the server knew all along.
        const code = params.get("fb_error");
        const reason = params.get("fb_reason");
        const labels = {
          invalid_state: "פג תוקף החיבור, נסי שוב",
          not_authenticated: "יש להתחבר קודם למערכת",
          no_tenant: "לא זוהה עסק לחשבון הזה",
          no_pages: "לא נמצאו דפי פייסבוק בחשבון",
          save_failed: "לא הצלחנו לשמור את הדף, אפשר לנסות שוב",
          subscribe_failed: "הדף נשמר, אבל ההתראות על פניות חדשות לא הופעלו. נסי להתחבר שוב ולאשר את כל ההרשאות",
          missing_parameters: "פייסבוק החזיר תשובה חסרה, נסי שוב",
        };
        const base = labels[code] || "החיבור לא הושלם, אפשר לנסות שוב";
        toast(reason ? `${base}: ${reason}` : `${base} (${code})`, "error");
      }
      if (params.has("fb_success") || params.has("fb_error") || params.has("pages") || params.has("fb_reason")) {
        params.delete("fb_success"); params.delete("fb_error"); params.delete("pages"); params.delete("fb_reason");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
      }
    } catch { /* non-fatal */ }
    /* eslint-disable-next-line */
  }, []);

  // Esc closes any open modal / drawer (does not touch session/tenant logic).
  //
  // The listener is registered once, so it cannot read current state directly.
  // This ref carries the two things it needs — whether Settings is open, and
  // the current close function, which knows whether the draft is dirty.
  const escRef = useRef({});
  useEffect(() => {
    escRef.current = { showSettings, closeSettings, confirmOpen: !!confirmDialog };
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // A confirm sits on top of whatever opened it — including the unsaved
      // changes prompt itself. Dismiss that first, or Escape would answer one
      // prompt by raising another.
      if (escRef.current.confirmOpen) { setConfirmDialog(null); return; }
      // Settings owns its own close: it may have unsaved work and must ask.
      // Returning here also stops the blanket reset below from nulling
      // editSettings behind the prompt's back.
      if (escRef.current.showSettings) { escRef.current.closeSettings(); return; }
      setShowModal(false); setShowClientModal(false); setShowImportModal(false);
      setShowLeadModal(false); setShowCashier(false); setShowReceipt(null);
      setShowPackageModal(false); setShowWaitlistModal(false); setShowProtocolModal(false);
      setShowPostModal(false); setShowSettings(false); setShowNewService(false);
      setSelectedClient(null); setSelectedLead(null);
      setEditingClient(null); setEditingLead(null); setEditSettings(null);
      setConfirmDialog(null); setShowMobileSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When a modal opens, focus its first input field (every modal is a <Sheet>).
  const anyModalOpen = showModal||showClientModal||showImportModal||showLeadModal||
    showCashier||!!showReceipt||showPackageModal||showWaitlistModal||showProtocolModal||
    showPostModal||showSettings||!!confirmDialog;
  useEffect(() => {
    if (!anyModalOpen) return;
    const id = setTimeout(() => {
      const el = document.querySelector('.sheet input:not([type="hidden"]):not([type="file"]), .sheet textarea, .sheet select');
      if (el) { try { el.focus(); } catch {} }
    }, 60);
    return () => clearTimeout(id);
  }, [anyModalOpen]);

  // Load skin-scan history whenever a client card is opened
  useEffect(() => {
   setPhotoTreatmentPrefill(""); // a prefilled treatment name belongs to the client it was set for
   if (selectedClient?.id) { loadClientScans(selectedClient.id); loadClientPhotos(selectedClient.id); }
    else { setClientScans([]); setClientPhotos([]); }
    /* eslint-disable-next-line */
  }, [selectedClient?.id]);

  // Never sit on a tab this tenant cannot see. Filtering the nav lists is the
  // only way into the three stub tabs today, so this is a backstop rather than
  // a live path - but it is the one that matters if a flag is switched OFF
  // while she is standing on that tab, and it means a future deep link or
  // restored-tab feature cannot reopen a hidden screen by accident.
  useEffect(() => {
    if (!isTabVisible(settings, activeTab) || !viewAllowsTab(settings, activeTab)) setActiveTab("dashboard");
  }, [settings, activeTab]);
  // The same backstop for Settings: in "קופה, ניקובים ודוחות בלבד" (lib/viewMode.ts) the page and messages groups are not offered,
  // so a restored address or an old shortcut lands on העסק שלי instead.
  useEffect(() => {
    if (!viewAllowsSettingsGroup(settings, settingsGroup)) setSettingsGroup("business");
  }, [settings, settingsGroup]);

  useEffect(() => {
    if (activeTab === "community") loadCommunityPosts();
    if (activeTab === "protocols") loadProtocols();
    if (activeTab === "advisor" && advisorMessages === null) loadAdvisor();
    /* eslint-disable-next-line */
  }, [activeTab]);

  // The advisor thinks for several seconds before its first word. Clock the wait,
  // so the bubble can change and show how long it has been (lib/advisorWait.js)
  // instead of sitting on one static line that looks like a hang.
  useEffect(() => {
    if (!advisorSending) { setAdvisorWaitSec(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setAdvisorWaitSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [advisorSending]);

  // Keep the advisor chat scrolled to the latest message.
  useEffect(() => {
    const el = document.getElementById("advisor-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [advisorMessages, advisorSending]);/* @section-end */
  return {  };
}

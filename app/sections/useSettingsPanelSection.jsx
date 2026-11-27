"use client";
// app/sections/useSettingsPanelSection.jsx — part of the owner's app: 131 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { usePendingSaveCount, clearPendingSaves } from "../pendingSaves";
import { OPEN_ADDONS_EVENT } from "@/lib/addonOffer";
import { setUpgradesIdentity, clearUpgrades } from "../UpgradesStore";
import { tr } from "@/lib/i18n/tr";

export function useSettingsPanelSection(ctx) {
  const {
    askConfirm, editServices, editSettings, services, setEditServices, setEditSettings, setSettings,
    setSettingsGroup, setSettingsTab, setShowNewService, setShowSettings, setShowSetup, setShowTemplatePicker,
    setTemplatePicks, settings, SETTINGS_TAB_GROUP, toast,
  } = ctx;
  /* @section-body */const openSettings = (tab, extra) => {
    if (!editSettings) setEditSettings({ ...settings });
    if (!editServices) {
      setEditServices(services.map(sv => ({ ...sv })));
    } else {
      // The services import writes straight to service_prices while the panel
      // is hidden. Fold anything new into the draft so it is visible and not
      // silently absent from the list she is editing — without touching rows
      // she has already changed.
      setEditServices(prev => {
        const held = new Set((prev || []).map(sv => sv.id).filter(Boolean));
        const missing = services.filter(sv => sv.id && !held.has(sv.id)).map(sv => ({ ...sv }));
        return missing.length ? [...(prev || []), ...missing] : prev;
      });
    }
    if (tab) { setSettingsTab(tab); if (SETTINGS_TAB_GROUP[tab]) setSettingsGroup(SETTINGS_TAB_GROUP[tab]); }
    if (extra === "newService") setShowNewService(true);
    setShowSettings(true);
    setShowSetup(false);
  };
  const openSetupTab = (tab, extra) => openSettings(tab, extra);
  // The add-on buttons (toast, reels, the post generator) all send one event; it opens Settings > העסק שלי at the add-ons.
  const openAddonsRef = useRef(null);
  // `target` (the upgrades store): "billing-card" to save a card, "business-referral" for the invite link; default the add-ons.
  openAddonsRef.current = (target = "billing-addons") => {
    setSettingsGroup("business");
    openSettings();
    setTimeout(() => { try { document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "smooth" }); } catch { /* not rendered yet */ } }, 700);
  };
  // The upgrades store's cache is keyed by who is signed in (app/UpgradesStore.jsx): set it now, and on every sign-in, sign-out or switch.
  useEffect(() => {
    let alive = true;
    // No session yet (INITIAL_SESSION during a reload) is "not known", never a sign-out: her saved purchase ids must survive it.
    supabase.auth.getSession().then(({ data }) => { if (alive) setUpgradesIdentity(data?.session?.user?.id || null); }).catch(() => {});
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") clearUpgrades();
      else setUpgradesIdentity(session?.user?.id || null);
    });
    return () => { alive = false; authSub?.subscription?.unsubscribe?.(); };
  }, []);
  useEffect(() => {
    const on = (e) => openAddonsRef.current?.(e?.detail?.target);
    window.addEventListener(OPEN_ADDONS_EVENT, on);
    return () => window.removeEventListener(OPEN_ADDONS_EVENT, on);
  }, []);

  // Has anything in the panel changed? Compared by value against the saved
  // state, not tracked by a flag, so typing a character and typing it back out
  // again correctly counts as clean. Both drafts start as copies, so key order
  // matches and a string compare is enough.
  const settingsDirty = useMemo(() => {
    if (!editSettings) return false;
    if (JSON.stringify(editSettings) !== JSON.stringify(settings)) return true;
    if (editServices && JSON.stringify(editServices) !== JSON.stringify(services)) return true;
    return false;
  }, [editSettings, settings, editServices, services]);
  // Cards that save to their own table (the cancellation policy) count too, so the bar never says "אין שינויים" over an unsaved change.
  const pendingCardSaves = usePendingSaveCount();
  const panelDirty = settingsDirty || pendingCardSaves > 0;

  // Closing throws the draft away, so it asks first when there is one. `force`
  // is for the save path, which has already written everything.
  const closeSettings = useCallback((force) => {
    const done = () => {
      setShowSettings(false);
      setEditSettings(null);
      setEditServices(null);
      setShowNewService(false);
      setShowTemplatePicker(false);
      setTemplatePicks([]);
      clearPendingSaves();
    };
    if (force || !panelDirty) { done(); return; }
    askConfirm({
      title: tr("לצאת בלי לשמור?"),
      message: tr("יש שינויים שעדיין לא נשמרו. אם תצאי עכשיו הם יאבדו."),
      confirmText: tr("צאי בלי לשמור"),
      cancelText: tr("חזרה לעריכה"),
      danger: true,
      onConfirm: done,
    });
  }, [panelDirty, askConfirm]);

  // ── Onboarding walkthrough — trigger + persistence. The handlers that
  // actually advance/skip/finish the tour live further down, right after
  // openNewAppt is declared (the finish step opens it). This just decides
  // WHEN to start: once, the first time settings has loaded for a tenant
  // that hasn't seen it, resuming at whatever step she last reached rather
  // than always restarting at 0.
  const [tourStep, setTourStep] = useState(null);
  const tourTriggeredRef = useRef(false);
  // The trigger effect itself sits after the "3 צעדים לתור הראשון" block below: it waits for that card (lib/tourFlow.js tourMayStart).

  // Fire-and-forget: merges into the existing automations bag (the save
  // route replaces the WHOLE column, not a per-key patch - sending just
  // {onboarding_tour_seen:true} without the rest of her automations would
  // silently wipe her quiet hours, reminder toggles, everything else in
  // there) and updates local state optimistically so skip/finish read back
  // correctly without waiting on a refetch.
  const persistTourPatch = useCallback((patch) => {
    const base = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    const nextAutomations = { ...base, ...patch };
    setSettings(prev => ({ ...prev, automations: { ...((prev.automations && typeof prev.automations === "object") ? prev.automations : {}), ...patch } }));
    fetch("/api/settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { automations: nextAutomations } }),
      // keepalive: ending the tour is often followed at once by leaving the page, and a plain fetch is cancelled by that navigation:
      // the "seen" flag was then never saved and the tour came back (found 2026-10-07, intermittent on a fresh account).
      keepalive: true,
    }).catch(() => {});
  }, [settings.automations]);

  // One automations key saved on its own, AND said when it did not save (unlike the tour's fire-and-forget above): the
  // booking buttons card's "סימנתי שעשיתי" (app/BookingButtonsCard.jsx). Written into editSettings too, so saving the Settings
  // panel afterwards carries the same value instead of an older copy.
  const saveAutomationsKey = useCallback(async (key, value) => {
    const base = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    try {
      const r = await fetch("/api/settings/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { automations: { ...base, [key]: value } } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || String(r.status));
    } catch {
      toast(tr("הסימון לא נשמר. אפשר לנסות שוב בעוד רגע"), "error");
      return false;
    }
    const put = (prev) => prev ? ({ ...prev, automations: { ...((prev.automations && typeof prev.automations === "object") ? prev.automations : {}), [key]: value } }) : prev;
    setSettings(put);
    setEditSettings(put);
    return true;
  }, [settings.automations, toast]);/* @section-end */
  return { closeSettings, openAddonsRef, openSettings, openSetupTab, panelDirty, pendingCardSaves, persistTourPatch,
    saveAutomationsKey, settingsDirty, setTourStep, tourStep, tourTriggeredRef };
}

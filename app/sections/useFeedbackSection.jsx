"use client";
// app/sections/useFeedbackSection.jsx — part of the owner's app: 160 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { WRITE_BLOCKED_TOAST_HE } from "@/lib/planCopy";
import { addonPackForMessage } from "@/lib/addonOffer";
import { openUpgrades } from "@/lib/upgradesStore";
import { addonButtonHe } from "@/lib/pricing";
import { packAvailable, clearUpgrades } from "../UpgradesStore";
import { STUCK_HE } from "@/lib/errorCopy";
import { toastDurationMs } from "@/lib/toastDuration";
import { tr } from "@/lib/i18n/tr";

export function useFeedbackSection(ctx) {
  const {
    authEmail, busy, router, setBusy, setCalView, setConfirmDialog, setLeadFilter, setShowLapsed, setShowWaQueue,
    setToasts,
  } = ctx;
  /* @section-body */const toast = useCallback((msg, type = "success", action = null) => {
    const id = Date.now() + Math.random();
    // A "you used this month's ___" refusal for a feature that has an add-on pack (lib/pricing.ts, only with packs on) carries the
    // pack's button, which opens the add-ons in her billing settings. Recognised by its own wording (lib/addonOffer.ts).
    if (!action && type === "error") {
      const pack = addonPackForMessage(msg);
      if (pack && packAvailable(pack.key)) action = { label: addonButtonHe(pack), onClick: () => openUpgrades(pack.key) };
    }
    setToasts(prev => [...prev, { id, msg, type, action }]);
    // Error toasts stay until tapped: they carry real reasons now (an OAuth
    // error, a failed save), and a reason that vanishes in 3.5s while she is
    // still reaching for her phone camera is a reason she never had.
    if (type !== "error") {
      // Long enough to read: about 70ms a character, never under 3.5s, and 8s when there is a button to reach for (undo).
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), toastDurationMs(msg, !!action));
    }
  }, []);

  // Onboarding sends her here with ?svc=failed when the treatments she ticked could not be saved, so she is told
  // instead of finding an empty list and assuming she never did that step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("svc") !== "failed") return;
    toast(tr("הטיפולים שבחרת לא נשמרו. לא נורא, אפשר לבחור אותם שוב בהגדרות ← שירותים."), "error");
    p.delete("svc");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [toast]);

  // One-tap links from the weekly digest (lib/weeklyDigest.ts DIGEST_GO, /dashboard/digest): ?go=queue|leads|winback|week|birthdays
  // opens the screen the action is about. Anything else is ignored. A screen is handed to the screen link (?tab=, lib/screenLink.ts),
  // which opens it once loading ends; a sheet opens by its own state. "go" is stripped so a refresh does not reopen the sheet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const go = p.get("go");
    if (!go) return;
    const tabFor = { leads: "leads", week: "calendar", birthdays: "insights" };
    if (go === "queue") setShowWaQueue(true);
    else if (go === "winback") setShowLapsed(true);
    if (tabFor[go]) p.set("tab", tabFor[go]);
    if (go === "leads") setLeadFilter("new");
    if (go === "week") setCalView("week");
    p.delete("go");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // Keyboard activation for clickable elements that aren't native buttons:
  // Enter/Space triggers the element's own onClick (via .click()).
  const onKbdActivate = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
  };

  const askConfirm = useCallback((opts) => {
    setConfirmDialog({
      title: opts.title || tr("אישור"),
      message: opts.message || tr("האם את בטוחה?"),
      confirmText: opts.confirmText || tr("אישור"),
      cancelText: opts.cancelText || tr("ביטול"),
      danger: opts.danger || false,
      onConfirm: opts.onConfirm,
    });
  }, []);

  const setBusyKey = useCallback((key, val) => {
    setBusy(prev => {
      if (val) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const isBusy = useCallback((key) => !!busy[key], [busy]);
  // Synchronous in-flight guard for one-tap actions: `busy` is React state, so two taps inside the same frame both see it
  // false. A ref is already set when the second tap arrives (2026-10-20 audit: a double tap drew two package sessions).
  const inFlightRef = useRef(new Set());
  const runOnce = async (key, fn) => {
    if (inFlightRef.current.has(key)) return undefined;
    inFlightRef.current.add(key);
    try { return await fn(); } finally { inFlightRef.current.delete(key); }
  };

  // Is this a lost connection rather than a database refusal? The two look
  // nothing alike to her and must never be reported the same way.
  const isConnectionError = useCallback((err) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    const m = String(err?.message || "");
    // The browsers' own wording, which differs per engine:
    //   Chrome "Failed to fetch" | Safari "Load failed"
    //   Firefox "NetworkError when attempting to fetch resource"
    return /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet_disconnected/i.test(m);
  }, []);

  const handleDbError = useCallback((err, context = "") => {
    console.error(`[BeautyOS DB error] ${context}:`, err);
    // A LOST CONNECTION IS NOT A DATABASE ERROR.
    //
    // Offline, supabase-js hands back the browser's own English string, and the
    // fallback at the bottom of this function printed it raw:
    //     "שגיאה: Failed to fetch"
    // In an otherwise all-Hebrew app that reads as a broken system rather than a
    // dropped signal, tells her nothing about what to do, and gives her no
    // reason to believe her half-typed client is still safe on the screen
    // behind the toast. It is - every save handler returns before clearing its
    // form - so the message should say so.
    if (isConnectionError(err)) {
      toast(tr("אין חיבור לאינטרנט. שום דבר לא אבד, והפרטים שהזנת עדיין כאן. נסי לשמור שוב כשהחיבור יחזור."), "error");
      return;
    }
    // A row-level-security denial on a write is exactly what the read-only gate
    // looks like from the browser. Translate it into the shared Hebrew
    // explanation rather than surfacing a raw Postgres string. This is the
    // safety net for any write path that guardWrite() does not cover, so no
    // blocked write can ever show her an unexplained error. Detection is by
    // error code/message only, so it stays correct regardless of plan state.
    const code = err?.code || "";
    const message = String(err?.message || "");
    if (code === "42501" || /row-level security|violates row-level/i.test(message)) {
      toast(WRITE_BLOCKED_TOAST_HE, "error");
      return;
    }
    // The double-booking guarantees, in her language rather than Postgres's.
    //   23505 uniq_appt_slot_active   - same start minute.
    //   23P01 appointments_no_overlap - overlapping range, e.g. a 14:30+30
    //         dropped inside an existing 14:00+60.
    // Both mean the same thing to her, and both are only reachable when the
    // in-app overlap check lost a race with another writer (her phone and her
    // laptop, or a client self-booking at the same moment) - so the raw
    // constraint name would be the first she ever heard of it.
    if (code === "23505" || code === "23P01") {
      toast(tr("השעה הזו כבר תפוסה, אפשר לבחור שעה אחרת?"), "error");
      return;
    }
    console.error("[BeautyOS] db error:", code, message);
    toast(STUCK_HE, "error");
  }, [toast, isConnectionError]);

  const handleLogout = useCallback(() => {
    askConfirm({
      title: tr("התנתקות"),
      // The address is isolated (U+2068..U+2069): in the RTL sentence its dot and the "?" jumped to the wrong side (2026-11-08 QA).
      message: authEmail ? tr("את מחוברת כ-⁨{0}⁩. להתנתק?", [authEmail]) : tr("האם להתנתק מהמערכת?"),
      confirmText: tr("התנתקי"),
      onConfirm: async () => {
        try {
          setBusyKey("logout", true);
          clearUpgrades(); // the upgrades cache (usage, card last four) never outlives her session in this tab
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        } catch (err) {
          handleDbError(err, "logout");
          setBusyKey("logout", false);
        }
      },
    });
  }, [askConfirm, handleDbError, router, setBusyKey, authEmail]);/* @section-end */
  return { askConfirm, handleDbError, handleLogout, isBusy, isConnectionError, onKbdActivate, runOnce, setBusyKey,
    toast };
}

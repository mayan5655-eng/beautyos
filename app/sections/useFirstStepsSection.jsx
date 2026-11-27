"use client";
// app/sections/useFirstStepsSection.jsx — part of the owner's app: 108 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useEffect, useCallback, useMemo } from "react";
import { matchesQuery } from "@/lib/search/matchQuery";
import { applyAccentTokens } from "@/lib/theme";
import { firstBookingCardEnabled, firstBookingSteps, firstBookingRecord, firstBookingView, showSetupOnToday, showAttentionOnToday, firstBookingStorageKey, FIRST_BOOKING_KEY } from "@/lib/firstBooking";
import { bufferLookup, businessBufferDefault } from "@/lib/serviceBuffer";
import { tourResumeStep, tourMayStart, tourStepsFor } from "@/lib/tourFlow";
import { TOUR_STEPS } from "../shared/businessConstants";
import { trv } from "@/lib/i18n/tr";

export function useFirstStepsSection(ctx) {
  const {
    appointments, apptClientQuery, clients, fbCelebrate, firstLocal, historyReady, linkShared, pc,
    persistTourPatch, services, setFbCelebrate, setFirstLocal, settings, setTourStep, setupDone, setupTotal,
    showImportHub, showImportModal, tourTriggeredRef,
  } = ctx;
  /* @section-body */applyAccentTokens(pc);
  const origin = typeof window!=="undefined"?window.location.origin:"";

  const activeServices = useMemo(() => services.filter(s=>s.active!==false), [services]);
  // Her buffer after each treatment (lib/serviceBuffer.ts): per service (service_prices.buffer_minutes, once
  // add_service_buffer_2026-11-05.sql runs), else the business default in branding.booking_rules. 0 until she sets one.
  // Every in-app "is this time free" test reads it, so the calendar and the public page agree about what is taken.
  const apptBufferOf = useMemo(() => bufferLookup(services, businessBufferDefault(settings?.branding)), [services, settings]);
  const newApptBufferFor = useCallback((serviceName) => apptBufferOf({ service: serviceName }), [apptBufferOf]);

  // ── "3 צעדים לתור הראשון" (lib/firstBooking.js, app/FirstBookingCard.jsx) ──
  // Pending until her settings, the full appointment history and this phone's record are all in: before that the
  // answer could be wrong in either direction (a card for a busy business, or no card for a new one).
  const fbEnabled = firstBookingCardEnabled(settings?.automations);
  useEffect(() => {
    const t = settings?.tenant_id;
    if (!t) return;
    let rec = {};
    try { rec = JSON.parse(localStorage.getItem(firstBookingStorageKey(t)) || "{}") || {}; } catch { rec = {}; }
    setFirstLocal(rec && typeof rec === "object" ? rec : {});
  }, [settings?.tenant_id]);
  const fbSteps = firstBookingSteps({ services, clients, appointments, linkShared, linkSharedAt: settings?.automations?.link_shared_at });
  const fbRecord = firstBookingRecord(settings?.automations, firstLocal);
  const fbComputed = !fbEnabled ? "off"
    : (!settings?.tenant_id || firstLocal === null || !historyReady) ? "pending"
    : firstBookingView({ enabled: true, steps: fbSteps, record: fbRecord, appointments });
  const fbView = fbCelebrate ? "celebrate" : fbComputed;
  const fbWriteLocal = (patch) => {
    const t = settings?.tenant_id; if (!t) return;
    const next = { ...(firstLocal || {}), ...patch };
    setFirstLocal(next);
    try { localStorage.setItem(firstBookingStorageKey(t), JSON.stringify(next)); } catch { /* storage blocked: her account copy still counts */ }
  };
  useEffect(() => {
    // The first time the card is on screen, this phone remembers it, so finishing later earns the completion line.
    if (fbComputed === "active" && !fbRecord.shown_at) fbWriteLocal({ shown_at: new Date().toISOString() });
    // All three just became done: show the line for this visit, and record done_at so it never comes back.
    if (fbComputed === "celebrate" && !fbCelebrate) {
      const at = new Date().toISOString();
      setFbCelebrate(true);
      fbWriteLocal({ done_at: at });
      persistTourPatch({ [FIRST_BOOKING_KEY]: { shown_at: fbRecord.shown_at || at, done_at: at } });
    }
  }, [fbComputed]); // eslint-disable-line react-hooks/exhaustive-deps
  // The 8-step "הגדרת המערכת" card is never on Today next to the 3-step one (and not while the answer is pending).
  const setupOnToday = fbView !== "pending" && showSetupOnToday(fbView, setupDone, setupTotal);
  const fbShowing = fbView === "active" || fbView === "celebrate" || fbView === "pending";
  // "דורש תשומת לב" steps aside while the 3-step card is on Today (it only said "הכל מטופל" on an empty account).
  const attentionOnToday = showAttentionOnToday(fbView);

  // The tour she gets: the short one (היום, תשלומים, יומן) once she has used the 3-step card, the full six otherwise (lib/tourFlow.js).
  const tourSteps = useMemo(() => tourStepsFor(TOUR_STEPS, fbRecord), [fbRecord.shown_at, fbRecord.done_at]); // eslint-disable-line react-hooks/exhaustive-deps
  // When the tour starts: once, the first time settings has loaded for a tenant that hasn't seen it, resuming at whatever step she
  // last reached rather than always restarting at 0.
  useEffect(() => {
    if (tourTriggeredRef.current) return;
    if (!settings?.tenant_id) return; // settings row not loaded yet
    // Not on top of the import screen onboarding opened: the tour points at buttons hidden behind it. It starts once she closes the
    // import (2026-11-02 audit).
    if (showImportModal || showImportHub) return;
    // Not over the "3 צעדים לתור הראשון" card either, nor while it is still being decided: on day 1 the tour opened on top of it
    // (2026-11 activation follow-up). It starts once the card is finished or switched off.
    if (!tourMayStart(fbView)) return;
    tourTriggeredRef.current = true;
    const autos = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    if (autos.onboarding_tour_seen === true) return;
    const resumeAt = tourResumeStep(autos.onboarding_tour_step, tourSteps); // never a step whose card cannot be drawn (the Settings one)
    if (resumeAt == null) return;
    setTourStep(resumeAt);
  }, [settings?.tenant_id, settings?.automations, showImportModal, showImportHub, fbView, tourSteps]);

  // Her menu, ordered by how often she actually books each treatment.
  //
  // The order moves as her practice moves, which is the point: the six chips at
  // the top should be the six she reaches for this season, not the six that
  // happened to be typed in first. Ties fall back to name so the order is
  // stable rather than arbitrary.
  const servicesByUse = useMemo(() => {
    const count = new Map();
    for (const a of appointments) {
      if (!a.service || a.confirmation_status === "cancelled") continue;
      count.set(a.service, (count.get(a.service) || 0) + 1);
    }
    return [...activeServices].sort((x, y) => {
      const d = (count.get(y.name) || 0) - (count.get(x.name) || 0);
      return d !== 0 ? d : String(x.name).localeCompare(String(y.name), "he");
    });
  }, [activeServices, appointments]);

  // Who the search offers. Capped at six: past that it is a list to read rather
  // than a shortlist to pick from, and she should type another letter instead.
  const apptClientMatches = useMemo(() => {
    const q = apptClientQuery.trim();
    if (!q) return [];
    return clients
      .filter(c => matchesQuery(q, { text: [c.name], phones: [c.phone] }))
      .slice(0, 6);
  }, [apptClientQuery, clients]);

  // A picker with nothing in it is not an empty picker to her - it looks like a
  // picker that has not loaded. Five modals showed a select holding only its
  // placeholder, and two of them then demanded a choice from it at save. This
  // is the one line they all say instead, naming the screen that fixes it.
  const setupHint = (text) => (
 <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",fontWeight:600,background:"rgba(242,184,75,0.12)",borderRadius:"var(--r-sm)",padding:"8px 10px"}}>{trv(text)}</p>
  );
  const NO_SERVICES_HINT = "עוד לא הוספת טיפולים. אפשר להוסיף אותם בהגדרות ← שירותים.";
  const NO_CLIENTS_HINT = "עוד אין לקוחות במערכת. אפשר להוסיף לקוחה במסך הלקוחות.";/* @section-end */
  return { activeServices, apptBufferOf, apptClientMatches, attentionOnToday, fbShowing, fbSteps, fbView,
    newApptBufferFor, NO_CLIENTS_HINT, NO_SERVICES_HINT, origin, servicesByUse, setupHint, setupOnToday,
    tourSteps };
}

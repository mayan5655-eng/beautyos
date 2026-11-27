"use client";
// app/sections/useCashierOpenSection.jsx — part of the owner's app: 60 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useCallback, useRef } from "react";
import { newApptStart } from "@/lib/businessHours";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";
import { formatDate } from "../shared/datesAndLinks";

export function useCashierOpenSection(ctx) {
  const {
    activeServices, clients, closeSettings, favoritePaymentMethod, loadLoyaltyRows, loyaltyCfg, loyaltyDb,
    openSettings, persistTourPatch, setApptNote, setCashierAllServices, setCashierAppt, setCashierClient,
    setCashierDiscount, setCashierDiscountMode, setCashierExtrasOpen, setCashierItems, setCashierNote,
    setCashierSearch, setCashierTip, setDrawFromPackage, setEditingAppointmentId, setGrowAdj, setLoyaltyApplied,
    setMembershipAdj, setNewAppt, setPaymentMethod, setShowCashier, setShowMobileSidebar, setShowModal,
    setSplitLines, setSplitOn, settings, setTourStep, showSettings, tourStep, tourSteps,
  } = ctx;
  /* @section-body */const dupPayOk = useRef(false);
  const handleOpenCashier = (appt) => {
    dupPayOk.current = false;
    setCashierAppt(appt||null);
    if(appt){
      const client=clients.find(c=>String(c.id)===String(appt.client_id));
      setCashierClient(client||null);setCashierSearch(client?.name||"");
      const svc=activeServices.find(s=>s.name===appt.service);
      setCashierItems([{id:Date.now(),name:appt.service,price:svc?.price||appt.price||0,qty:1,color:svc?.color||DEFAULT_SERVICE_COLOR}]);
    }else{setCashierClient(null);setCashierSearch("");setCashierItems([]);}
    setPaymentMethod(favoritePaymentMethod);setCashierAllServices(false);setCashierExtrasOpen(false);setCashierDiscount(0);setCashierDiscountMode("ils");setCashierTip(0);setSplitOn(false);setSplitLines([{method:"ביט",amount:0},{method:"מזומן",amount:0}]);setCashierNote("");setDrawFromPackage(false);setMembershipAdj(null);setGrowAdj({deposit:0,creditAvail:0,creditOn:false});setLoyaltyApplied(null);setShowCashier(true);
    // A loyalty ledger read that failed shows no card at the till (see loyaltyFor): opening the till tries it again.
    if (loyaltyCfg.enabled && loyaltyDb.ready === "error") loadLoyaltyRows();
  };

  // Opens the new-appointment modal pre-filled with her first active service.
  // Component-scoped on purpose: it used to be declared inside a closure that
  // only exists while the DASHBOARD tab renders, so the Calendar tab's own
  // empty-state button - which referenced the same bare name - threw
  // ReferenceError the instant appointments.length was 0, i.e. on every
  // single new signup's first visit to her calendar. Invisible on any tenant
  // that already has a booking, which is exactly why it reached production.
  // Today it opens on the next half hour from now inside her hours, not at the day's opening that has long passed (lib/businessHours).
  const openNewAppt = () => {
    const svc = activeServices[0];
    const when = newApptStart(settings, new Date(), svc?.duration || 60);
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(when.date),hour:Math.floor(when.minute/60),startMinute:when.minute,price:svc?.price||0});
    setApptNote("");
    setShowModal(true);
    setShowMobileSidebar(false);
  };

  // ── Onboarding walkthrough — advance / skip / finish. State and the
  // trigger effect live earlier, right after closeSettings.
  const handleTourNext = useCallback(() => {
    const next = tourStep + 1;
    const nextStep = tourSteps[next];
    if (!nextStep) return; // the last step's button is onFinish, not onNext
    if (nextStep.requiresSettings) openSettings(nextStep.settingsTab || "general");
    setTourStep(next);
    persistTourPatch({ onboarding_tour_step: next });
  }, [tourStep, tourSteps, openSettings, persistTourPatch]);

  const handleTourSkip = useCallback(() => {
    if (showSettings) closeSettings(true);
    setTourStep(null);
    persistTourPatch({ onboarding_tour_seen: true });
  }, [showSettings, closeSettings, persistTourPatch]);

  const handleTourFinish = useCallback(() => {
    const wasInSettings = showSettings;
    if (wasInSettings) closeSettings(true);
    setTourStep(null);
    persistTourPatch({ onboarding_tour_seen: true });
    // The one action it ends on, not a congratulation screen. A short delay
    // when Settings was open lets that sheet's own close finish first, so
    // the two never visually overlap mid-transition.
    setTimeout(() => openNewAppt(), wasInSettings ? 220 : 0);
  }, [showSettings, closeSettings, persistTourPatch, openNewAppt]);/* @section-end */
  return { dupPayOk, handleOpenCashier, handleTourFinish, handleTourNext, handleTourSkip, openNewAppt };
}

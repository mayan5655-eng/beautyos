"use client";
// app/sections/useApptEffectsSection.jsx — part of the owner's app: 72 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: loadAll is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect, useRef } from "react";
import { firstFreeStart } from "@/lib/apptFirstFree";
import { preloadXlsx } from "@/lib/xlsxLoader";
import { tr } from "@/lib/i18n/tr";

export function useApptEffectsSection(ctx) {
  const {
    activeTab, appointments, apptBusy, apptDayHours, apptOutsideHours, apptRequestedStart, apptSlotOptions,
    editingAppointmentId, newAppt, setLeadKeyConfigured, setNewAppt, setScanQuota, setSkinQueue,
    setSkinQueueError, setSkinQueueLoading, showModal, late,
  } = ctx;
  const loadAll = (...args) => late.loadAll(...args);
  /* @section-body */const apptTimeTouched = useRef(false); // true once she has picked a time in the sheet herself
  // The appointment as it was when she opened it for editing: its time is kept exactly, unless she changes the day or the length.
  const editOrigRef = useRef(null);
  useEffect(()=>{ if(showModal) apptTimeTouched.current=false; },[showModal]);
  useEffect(()=>{
    if(!showModal||!apptDayHours) return;
    // Opening an existing appointment to add a note must never move it (2026-10-20 audit: a 10:15 from voice or an import snapped to
    // 09:00 and was saved there without the client being told). It moves only if she changes its day or its length.
    const orig=editOrigRef.current;
    if(editingAppointmentId && orig && newAppt.date===orig.date && Number(newAppt.duration)===orig.duration) return;
    if(apptSlotOptions.length && !apptSlotOptions.includes(apptRequestedStart)) {
      // The first slot is now an hour or two BEFORE she opens, and snapping
      // onto it would hand her an out-of-hours default she never asked for.
      // The margin is somewhere she can go, not somewhere she gets put.
      const target = apptSlotOptions.find(m=>!apptOutsideHours(m)) ?? apptSlotOptions[0];
      setNewAppt(prev=>({...prev,startMinute:target,hour:Math.floor(target/60)}));
    }
    // A NEW appointment opens on a time that is free, not on the hour she opens (usually taken on a busy day: the first
    // thing she saw was a red "השעה תפוסה"). Only until she picks a time herself; an edit keeps the time it has.
    if(!editingAppointmentId && !apptTimeTouched.current && apptSlotOptions.length){
      const want = firstFreeStart({options:apptSlotOptions,requested:apptRequestedStart,duration:Number(newAppt.duration)||0,busy:apptBusy,outside:apptOutsideHours});
      if(apptSlotOptions.includes(want) && want!==apptRequestedStart) setNewAppt(prev=>({...prev,startMinute:want,hour:Math.floor(want/60)}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showModal,newAppt.date,newAppt.duration,apptDayHours?.open,apptDayHours?.close,appointments,editingAppointmentId]);

  // Mount only. loadAll is a plain function, recreated on every render, so
  // listing it here would re-run the whole eleven-table load on every render.
  // The previous directive was a BLOCK comment on this same line, so
  // "next-line" pointed at the blank line below and suppressed nothing - the
  // warning had been firing ever since.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ loadAll(); },[]);
  useEffect(()=>{ if(activeTab==="tax") preloadXlsx(); },[activeTab]);

  // Separate from loadAll on purpose: this is one small status read, and a
  // failure here must not be able to blank the dashboard.
  useEffect(()=>{
    fetch("/api/settings/lead-key").then(r=>r.json()).then(d=>{ if(d?.success) setLeadKeyConfigured(!!d.configured); }).catch(()=>{});
  },[]);


  // Fetch existing Skin Follow-up suggestions into the unified queue when the
  // dashboard is shown. The route is tenant-scoped + auth-gated and returns an
  // empty queue when the automation is Off or the clinic is paused, so those
  // states naturally produce no actionable items. Nothing here sends anything.
  useEffect(()=>{
    if(activeTab!=="dashboard") return;
    let cancelled=false;
    setSkinQueueLoading(true); setSkinQueueError(null);
    fetch("/api/automations/skin-followup")
      .then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
      .then(d=>{ if(!cancelled) setSkinQueue(Array.isArray(d?.queue)?d.queue:[]); })
      .catch(()=>{ if(!cancelled){ setSkinQueue([]); setSkinQueueError(tr("לא הצלחנו לטעון הצעות מעקב עור כרגע")); } })
      .finally(()=>{ if(!cancelled) setSkinQueueLoading(false); });
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeTab]);


  // Scanner ceiling, loaded when she opens Settings — where the link lives.
  // Silent on failure: a number she cannot see is better than a wrong one, and
  // the card renders nothing rather than a confident zero.
  useEffect(()=>{
    if(activeTab!=="settings") return;
    let cancelled=false;
    fetch("/api/skin-scan/link")
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(!cancelled && d && d.success) setScanQuota(d); })
      .catch(()=>{});
    return ()=>{cancelled=true;};
  },[activeTab]);/* @section-end */
  return { apptTimeTouched, editOrigRef };
}

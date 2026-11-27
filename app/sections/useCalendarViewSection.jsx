"use client";
// app/sections/useCalendarViewSection.jsx — part of the owner's app: 176 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: openPersonalEditor is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect, useMemo } from "react";
import { dayHoursFrom } from "@/lib/businessHours";
import { startMinute, endMinute, fmtApptTime, startFields } from "@/lib/apptTime";
import { isPersonal, isAllDay } from "@/lib/calendarKind";
import { NO_SHOW } from "@/lib/reliability";
import { tightGapAppointmentIds } from "@/lib/scheduleGaps";
import { isTabVisible } from "@/lib/featureFlags";
import { staffOfAppt } from "@/lib/team";

export function useCalendarViewSection(ctx) {
  const {
    activeServices, appointments, calView, deferred, editOrigRef, formatDate, setActiveTab, setApptNote,
    setEditingAppointmentId, setNewAppt, setShowModal, setShowWaitlistModal, settings, staffShown, team, teamCal,
    waitlist, weekDates, weekScrollRef, weekStart, WK_ROW_H, late,
  } = ctx;
  const openPersonalEditor = (...args) => late.openPersonalEditor(...args);
  /* @section-body */const weekAxis = useMemo(() => {
    let lo = (settings?.working_hours_start ?? 8) * 60;
    let hi = (settings?.working_hours_end ?? 19) * 60;
    const inWeek = new Set(weekDates.map(formatDate));
    for (const a of appointments) {
      if (!inWeek.has(a.date)) continue;
      const s = startMinute(a);
      if (s === null) continue;
      const e = endMinute(a) ?? s + 60;
      if (s < lo) lo = s;
      if (e > hi) hi = e;
    }
    lo = Math.floor(lo / 30) * 30;
    hi = Math.ceil(hi / 30) * 30;
    if (hi <= lo) hi = lo + 30;
    return { lo, hi, rows: (hi - lo) / 30 };
  }, [weekDates, appointments, settings]);

  /**
   * One day's appointments, each with a lane so overlaps sit side by side.
   *
   * Classic interval packing: an appointment takes the first lane whose
   * previous occupant has already ended. Non-overlapping appointments all reuse
   * lane 0 and get the full column; only genuine overlaps split it.
   */
  const dayLanes = (date) => {
    const ds = formatDate(date);
    // The team calendar's filter (staffShown): only that person's appointments. Without the team every appointment is shown.
    const list = appointments
      .filter(a => a.date === ds && startMinute(a) !== null && staffShown(a))
      .sort((a, b) => startMinute(a) - startMinute(b));
    const laid = [];
    for (const appt of list) {
      const s = startMinute(appt);
      const e = Math.max(endMinute(appt) ?? s + 30, s + 30); // never zero-height
      let lane = 0;
      while (laid.some(x => x.lane === lane && x.e > s)) lane += 1;
      laid.push({ appt, s, e, lane });
    }
    const lanes = laid.reduce((m, x) => Math.max(m, x.lane + 1), 1);
    // Tight-turnover warning: which of today's appointments start with less
    // than TIGHT_GAP_MINUTES after the previous real occupant ends. Cancelled
    // and no-show rows free their slot the same way the clash check does -
    // nothing to reset a station for. Computed here, once, so both calendars
    // (the week grid and the mobile agenda) read the same answer.
    const gapRows = (rows) => rows
      .filter(a => a.confirmation_status !== "cancelled" && a.confirmation_status !== NO_SHOW)
      .map(a => { const s = startMinute(a); return { id: a.id, start: s, end: Math.max(endMinute(a) ?? s + 30, s + 30), kind: a.kind }; });
    // In the team calendar a turnover is per person: one staff member's 10:00 right after another's 9:00 is not tight.
    let tightGapIds;
    if (teamCal) {
      tightGapIds = new Set();
      const groups = new Map();
      for (const a of list) { const k = staffOfAppt(a, team.staff)?.id || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
      for (const g of groups.values()) for (const id of tightGapAppointmentIds(gapRows(g))) tightGapIds.add(id);
    } else {
      tightGapIds = tightGapAppointmentIds(gapRows(list));
    }
    return { laid, lanes, tightGapIds };
  };

  // Booking from a click on empty space, to the nearest half hour. The old grid
  // could only book on the hour because its cells WERE hours; blocks give the
  // Y offset, so 10:30 is now reachable.
  const handleSlotAtMinute = (date, minutes) => {
    const svc = activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),...startFields(minutes),price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  // Open the week grid at the first appointment of that week, not at the top
  // of the axis. The axis now stretches to cover anything out of hours, so a
  // single 06:00 appointment would otherwise mean scrolling past two empty
  // hours every time she opens the week. Falls back to the top when the week
  // is empty. Sets a DOM property rather than state, which is what an effect
  // is for.
  useEffect(()=>{
    if(calView!=="week") return;
    const el=weekScrollRef.current;
    if(!el) return;
    const inWeek=new Set(weekDates.map(formatDate));
    let first=null;
    for(const a of appointments){
      if(!inWeek.has(a.date)) continue;
      const s=startMinute(a);
      if(s===null) continue;
      if(first===null||s<first) first=s;
    }
    el.scrollTop = first===null ? 0 : Math.max(0,((first-weekAxis.lo)/30)*WK_ROW_H - WK_ROW_H);
  },[calView,weekStart,weekDates,appointments,weekAxis.lo]);

  // getAppts (every appointment in an hour, for side-by-side rendering in a
  // cell) is gone with the hour-cell grid it existed for. Positioned blocks
  // make overlap a matter of geometry rather than something a cell has to
  // special-case, so dayLanes above replaces it outright.
  // getAppt (ONE appointment per hour, by .find) is gone with them. It outlived
  // its grid by one screen: the mobile agenda went on calling it, and went on
  // hiding the second appointment of every hour and everything booked outside
  // the legacy hour range. Both calendars read dayLanes now.

  const getApptColor = (appt) => {
    // Her own time is neutral, and never a client-status colour. A personal
    // event has no confirmation to be pending or confirmed about, so painting
    // it amber would put it in the queue's visual language and make a dentist
    // look like an unconfirmed client. One return covers both calendars: the
    // week grid and the mobile agenda fill their cards from here.
    if(isPersonal(appt)) return "var(--ink-2)";
    if(appt.confirmation_status==="confirmed") return "var(--success)";
    if(appt.confirmation_status==="cancelled") return "var(--danger)";
    return appt.color||"var(--warning)";
  };

  // How a calendar row reads, in the four places that draw one: the sidebar
  // list, the dashboard card, the week grid and the mobile agenda. Central so
  // they cannot drift apart on what her own time looks like - which is exactly
  // how the two calendars came to disagree about which appointments exist.
  //
  // An all-day event has no start time worth showing: 00:00 is arithmetic, not
  // information.
  const entryTime = (a) => isAllDay(a) ? "כל היום" : fmtApptTime(a);
  // The second line. An appointment says what treatment; a personal event has
  // no service, so it says whatever she wrote, or names itself.
  // "רשימת המתנה (N)" in the calendar (UX pass 2026-11-08): the list lives on the packages screen; when that screen is
  // switched off, the chip opens "add to the waitlist" instead, so it never leads nowhere.
  // Gated like every waitlist reader: no number until the list has loaded (a 0 would be a lie).
  const waitingCount = deferred.waitlist==="ok" ? waitlist.filter(w=>w.status==="waiting").length : null;
  const waitlistChipLabel = waitingCount===null ? "רשימת המתנה" : `רשימת המתנה (${waitingCount})`;
  const openWaitlist = () => {
    if (!isTabVisible(settings, "packages")) { setShowWaitlistModal(true); return; }
    setActiveTab("packages");
    setTimeout(() => { try { document.getElementById("waitlist-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* old browser: the screen still opened */ } }, 250);
  };
  const entrySubtitle = (a) => isPersonal(a) ? (String(a.note||"").trim() || "אירוע אישי") : a.service;

  // ============================================================
  // HANDLERS
  // ============================================================

  // The "+" on a mobile week day header: a fresh appointment on that DATE.
  //
  // Deliberately without any "is this slot already taken" guard: she picks the
  // time in the modal, which runs its own clash check before it saves.
  // Seeding it with the day's opening hour rather than a fixed 9:00 means a
  // clinic that opens at 10 does not get a booking an hour before it unlocks.
  const handleNewApptOnDate = (date) => {
    const dh = dayHoursFrom(settings, date.getDay());
    const hour = dh ? dh.open : (settings?.working_hours_start || 9);
    const svc = activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),hour,startMinute:Number(hour)*60,price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  // Open the appointment modal in EDIT mode, pre-filled with an existing
  // appointment's values so its date/time/service/etc. can be rescheduled.
  // Reuses the exact same modal + per-day-hours + double-booking logic as create;
  // editingAppointmentId flips handleSave to UPDATE and excludes this row from
  // the conflict checks.
  const handleApptClick = (appt) => {
    if (isPersonal(appt)) { openPersonalEditor(appt); return; }
    setEditingAppointmentId(appt.id);
    editOrigRef.current={date:appt.date,duration:Number(appt.duration)||60,start:startMinute(appt)};
    setNewAppt({clientId:appt.client_id||"",name:appt.name||"",service:appt.service||"",duration:Number(appt.duration)||60,date:appt.date,hour:Number(appt.hour),startMinute:startMinute(appt),price:appt.price||0});
    setApptNote(appt.note||"");
    setShowModal(true);
  };

  // ── Personal events ───────────────────────────────────────────────────────
  //
  // Her own time, on the same calendar and in the same table, so that it blocks
  // a client booking through machinery that already exists rather than through
  // new code that has to remember to run.

  // A range longer than this is a mistake, not a holiday, and each day is a row.
  const PERSONAL_MAX_DAYS = 62;/* @section-end */
  return { dayLanes, entrySubtitle, entryTime, getApptColor, handleApptClick, handleNewApptOnDate, handleSlotAtMinute,
    openWaitlist, PERSONAL_MAX_DAYS, waitlistChipLabel, weekAxis };
}

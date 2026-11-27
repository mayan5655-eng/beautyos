"use client";
// app/sections/useApptSlotsSection.jsx — part of the owner's app: 85 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { dayHoursFrom } from "@/lib/businessHours";
import { startMinute, endMinute, slotsBetween } from "@/lib/apptTime";
import { TIGHT_GAP_MINUTES } from "@/lib/scheduleGaps";
import { sameStaff, formDayHours } from "@/lib/team";

export function useApptSlotsSection(ctx) {
  const {
    appointments, apptBufferOf, apptStaff, editingAppointmentId, newAppt, newApptBufferFor, settings, team,
    teamCal,
  } = ctx;
  /* @section-body */const apptDay = (()=>{ const p=String(newAppt.date||"").split("-"); return p.length===3?new Date(Number(p[0]),Number(p[1])-1,Number(p[2])).getDay():new Date().getDay(); })();
  // That day's open/close from the per-day business_hours (null = closed that day). In the team calendar: the picked person's own
  // hours for that weekday when she set them (lib/team.ts formDayHours, the same rule /api/book-appointment applies), so a staff
  // member who works on a day the business is closed can be booked, and one who is off that day cannot.
  const apptDayHours = teamCal ? formDayHours(team, apptStaff, settings, apptDay) : dayHoursFrom(settings, apptDay);
  // Bookable START hours for the day. Half-hour granularity, and slotsBetween
  // refuses any start whose treatment would run past the end of the range.
  const APPT_SLOT_STEP = 30;
  // Her hours are the DEFAULT, not the limit. A client who asks for one late
  // appointment should not cost her an edit to the whole week's schedule, so
  // the picker reaches a margin either side and marks anything out there.
  // Same principle as the week axis, which stretches to show an out-of-hours
  // appointment rather than hiding it.
  //
  // A margin, not the whole day: 03:00 is not an override she ever means, and
  // a list that long stops being a list of her day. Two hours covers the early
  // client and the late one and nothing else.
  const APPT_MARGIN_HOURS = 2;
  const apptOfferedHours = apptDayHours ? {
    open:  Math.max(0,  apptDayHours.open  - APPT_MARGIN_HOURS),
    close: Math.min(24, apptDayHours.close + APPT_MARGIN_HOURS),
  } : null;
  const apptSlotOptions = apptOfferedHours ? slotsBetween(apptOfferedHours.open, apptOfferedHours.close, APPT_SLOT_STEP, Number(newAppt.duration)||0) : [];
  // Outside her actual hours - by starting before she opens, or by RUNNING PAST
  // when she closes. The second half matters: a 60-minute treatment at 18:30
  // against a 19:00 close is out of hours even though 18:30 is not.
  const apptOutsideHours = (m) => !apptDayHours
    || m < apptDayHours.open*60
    || (m + (Number(newAppt.duration)||0)) > apptDayHours.close*60;
  // Keep the shown hour inside the day's range even before the clamp effect runs,
  // so the label + select stay consistent when the date changes.
  // startMinute once the picker has set one; hour*60 for the eight call sites
  // that still construct newAppt with a whole hour, where hour N means N:00.
  const apptRequestedStart = newAppt.startMinute != null ? Number(newAppt.startMinute) : Number(newAppt.hour) * 60;
  // An existing appointment keeps its own time even when it is not on the picker's grid (10:15 from voice or an import, or a time
  // outside the margin). Found 2026-10-21: the effect below no longer snapped it, but this fallback still did, so Save wrote the
  // day's first slot (06:00) and reset the confirmation. When she changes the day or the length the effect moves it as before.
  const apptKeepOwnTime = !!editingAppointmentId && Number.isFinite(apptRequestedStart) && !apptSlotOptions.includes(apptRequestedStart);
  const apptEffectiveStart = apptSlotOptions.includes(apptRequestedStart) || apptKeepOwnTime ? apptRequestedStart : (apptSlotOptions.length ? apptSlotOptions[0] : apptRequestedStart);
  const fmtHM = (mins)=>`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(((mins%60)+60)%60).padStart(2,"0")}`;
  const apptStartMin = apptEffectiveStart;
  const apptEndMin = apptStartMin + Number(newAppt.duration||0);
  // --- STAGE C: block double-booking ---
  // Busy [start,end) minute-intervals already taken on the picked date. Cancelled
  // appointments free their slot (grid + gap-fill treat them as available), so
  // they are excluded here.
  // In EDIT mode, exclude the appointment being edited so it never flags itself
  // as a conflict (an appointment can't clash with its own current slot).
  // Each range ends after that treatment's buffer (lib/serviceBuffer.ts; 0 when she set none), and the one being
  // booked brings its own: a time inside a buffer is taken, the same rule the public page and /api/book-appointment use.
  // An edit that keeps its own date, time, length and service is never refused over a buffer: it was booked before she
  // set one (or by her on purpose), and opening it to fix a note must not turn it red. Moving it applies the buffers,
  // and only then is appointments.buffer_minutes rewritten (lib/apptBuffer.ts), so the database agrees with this check.
  const apptEditOrig = editingAppointmentId ? appointments.find(a=>a.id===editingAppointmentId) : null;
  const apptBuffersApply = !(apptEditOrig && apptEditOrig.date===newAppt.date && startMinute(apptEditOrig)===apptEffectiveStart && Number(apptEditOrig.duration||0)===Number(newAppt.duration||0) && String(apptEditOrig.service||"")===String(newAppt.service||""));
  // Per person in the team calendar: another staff member's client at the same time is not a clash.
  const apptBusy = appointments
    .filter(a=>a.date===newAppt.date && a.confirmation_status!=="cancelled" && a.id!==editingAppointmentId && (!teamCal || sameStaff(a, apptStaff, team.staff)))
    .map(a=>{const s=startMinute(a),e=endMinute(a);return [s, e===null?null:e+(apptBuffersApply?apptBufferOf(a):0)];}).filter(([s,e])=>s!==null&&e!==null);
  const newApptBuffer = apptBuffersApply ? newApptBufferFor(newAppt.service) : 0;
  // Is a candidate start hour taken, given the currently selected duration?
  // Recomputes every render, so changing the duration re-evaluates the picker.
  const slotIsTaken = (m)=>{ const s=m, e=s+Number(newAppt.duration||0)+newApptBuffer; return apptBusy.some(([bs,be])=>s<be&&bs<e); };
  // Is the START hour currently shown in the picker itself taken? Drives the
  // persistent inline warning + the disabled Save button (derived, so it stays
  // visible until the therapist picks a free time — no toast to disappear).
  const apptSelectedTaken = !!apptDayHours && apptSlotOptions.length>0 && slotIsTaken(apptEffectiveStart);
  // Is the hour SHOWN in the picker outside her hours? Derived the same way and
  // for the same reason: it has to stay on screen for as long as the choice
  // does. An option label she read once while scrolling is not enough to stop
  // her booking 20:00 believing she is open then.
  const apptSelectedOutside = !!apptDayHours && apptSlotOptions.length>0 && apptOutsideHours(apptEffectiveStart);
  // Is the picked time within TIGHT_GAP_MINUTES of the appointment right
  // before or after it? Reuses apptBusy (already excludes cancelled rows and
  // the appointment being edited), so this is the exact same neighbourhood
  // the clash check already looked at - just a softer question than "taken".
  // "before"/"after" rather than a bool because the sentence needs to say
  // which side is tight.
  const apptGapWarning = (!apptSelectedTaken && apptBusy.length) ? (() => {
    for (const [bs, be] of apptBusy) {
      if (apptEffectiveStart - be >= 0 && apptEffectiveStart - be < TIGHT_GAP_MINUTES) return "before";
      if (bs - apptEndMin >= 0 && bs - apptEndMin < TIGHT_GAP_MINUTES) return "after";
    }
    return null;
  })() : null;/* @section-end */
  return { apptBuffersApply, apptBusy, apptDayHours, apptEffectiveStart, apptEndMin, apptGapWarning, apptKeepOwnTime,
    apptOutsideHours, apptRequestedStart, apptSelectedOutside, apptSelectedTaken, apptSlotOptions, apptStartMin,
    fmtHM, newApptBuffer, slotIsTaken };
}

"use client";
// app/sections/usePersonalEventsSection.jsx — part of the owner's app: 183 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { dayHoursFrom } from "@/lib/businessHours";
import { startMinute, endMinute, startFields } from "@/lib/apptTime";
import { isAllDay, PERSONAL, ALL_DAY_DURATION } from "@/lib/calendarKind";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { tr } from "@/lib/i18n/tr";

export function usePersonalEventsSection(ctx) {
  const {
    appointments, askConfirm, calDay, formatDate, guardWrite, handleDbError, isBusy, PERSONAL_MAX_DAYS,
    personalDraft, setAppointments, setBusyKey, setPersonalDraft, setShowPersonalModal, settings, toast,
  } = ctx;
  /* @section-body */const newSeriesId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    const h = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 36; i++) {
      if (i===8||i===13||i===18||i===23) out += "-";
      else if (i===14) out += "4";
      else if (i===19) out += h[(Math.random()*4|0)+8];
      else out += h[Math.random()*16|0];
    }
    return out;
  };

  // Local dates, inclusive. Parsed with an explicit T00:00:00 so they are LOCAL
  // midnights: new Date("2026-09-02") is UTC and lands on the previous day for
  // anyone behind it, which would silently shift a whole holiday by a day.
  const datesInRange = (fromStr, toStr) => {
    const from = new Date(String(fromStr) + "T00:00:00");
    const to   = new Date(String(toStr || fromStr) + "T00:00:00");
    if (Number.isNaN(+from)) return [];
    if (Number.isNaN(+to) || to < from) return [formatDate(from)];
    const out = [];
    for (const d = new Date(from); d <= to && out.length < PERSONAL_MAX_DAYS; d.setDate(d.getDate()+1)) out.push(formatDate(d));
    return out;
  };

  // Would this event sit on top of something already in the calendar? Same rule
  // as everywhere else - cancelled rows free their slot - and it excludes the
  // series OWN rows, so editing an event cannot collide with itself.
  // Returns the first offending date, or undefined.
  const personalClashDate = (dates, startMin, dur, ownIds) => dates.find(dd =>
    appointments.some(a => {
      if (ownIds.has(String(a.id))) return false;
      if (a.date !== dd || a.confirmation_status === "cancelled") return false;
      const bs = startMinute(a), be = endMinute(a);
      if (bs === null || be === null) return false;
      return startMin < be && bs < startMin + dur;
    })
  );

  const closePersonalEditor = () => { setShowPersonalModal(false); setPersonalDraft(null); };

  // Editing loads the whole SERIES, not the row she tapped: a week of holiday
  // is seven rows in the table and one thing in her head.
  const openPersonalEditor = (appt, seedDate) => {
    if (appt) {
      const rows = appt.series_id
        ? appointments.filter(a => a.series_id && a.series_id === appt.series_id)
        : [appt];
      const dates = rows.map(a => a.date).sort();
      setPersonalDraft({
        title: appt.name || "",
        from: dates[0] || appt.date,
        to: dates[dates.length-1] || appt.date,
        allDay: isAllDay(appt),
        startMinute: startMinute(appt) ?? 9*60,
        duration: Number(appt.duration) || 60,
        note: appt.note || "",
        seriesId: appt.series_id || null,
        ids: rows.map(a => a.id),
      });
    } else {
      const d = seedDate || formatDate(calDay);
      const dh = dayHoursFrom(settings, new Date(d + "T00:00:00").getDay());
      setPersonalDraft({
        title: "", from: d, to: d, allDay: false,
        startMinute: (dh ? dh.open : (settings?.working_hours_start || 9)) * 60,
        duration: 60, note: "", seriesId: null, ids: [],
      });
    }
    setShowPersonalModal(true);
  };

  const handleSavePersonal = async () => {
    if (guardWrite()) return;
    const d = personalDraft;
    if (!d) return;
    if (!String(d.title||"").trim()) { toast(tr("איך נקרא האירוע? אפשר להוסיף כותרת"),"error"); return; }
    const dates = datesInRange(d.from, d.to);
    if (dates.length === 0) { toast(tr("חסר תאריך, אפשר לבחור אחד"),"error"); return; }
    // A range is always all-day. A two-day course is not 09:00-10:00 on each of
    // two days; it is two days. Offering a time range across days would invite
    // a shape the one-row-per-day model cannot represent.
    const allDay = !!d.allDay || dates.length > 1;
    const start  = allDay ? 0 : Number(d.startMinute) || 0;
    const dur    = allDay ? ALL_DAY_DURATION : Math.max(15, Number(d.duration) || 60);
    const ownIds = new Set((d.ids||[]).map(String));

    // Checked before anything is written, because the replace path below has to
    // delete the old rows before inserting the new ones - the constraint would
    // otherwise see the event overlapping itself - and a delete followed by a
    // rejected insert would lose the event outright.
    const clash = personalClashDate(dates, start, dur, ownIds);
    if (clash) { toast(clash + ": כבר יש משהו ביומן בשעה הזו", "error"); return; }

    if (isBusy("savePersonal")) return;
    setBusyKey("savePersonal", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      const seriesId = d.seriesId || (dates.length > 1 ? newSeriesId() : null);
      // No client, no service, no price and no colour: getApptColor paints a
      // personal event from its kind. confirmation_status keeps its default on
      // purpose - that is what puts the row INSIDE appointments_no_overlap,
      // which is what makes it block a booking at all.
      const row = (date) => ({
        date, ...startFields(start), duration: dur,
        name: String(d.title).trim(), service: "", price: 0, client_id: null,
        note: String(d.note||""), kind: PERSONAL, series_id: seriesId, ...tenantField,
        // A personal block keeps no buffer of its own (lib/serviceBuffer.ts); a booking's buffer still cannot run into it.
        ...apptBufferField(0),
      });

      const existing = (d.ids||[]).length ? appointments.filter(a => ownIds.has(String(a.id))) : [];
      const oldDates = existing.map(a => a.date).sort();
      const sameSpan = existing.length > 0
        && oldDates.length === dates.length
        && oldDates.every((x,i) => x === dates[i]);

      if (sameSpan) {
        // The common edit - a rename, a new time, a note - moves no dates, so it
        // updates in place and never deletes anything.
        const byDate = new Map(existing.map(a => [a.date, a]));
        for (const dd of dates) {
          const prevRow = byDate.get(dd);
          if (!prevRow) continue;
          const { data, error } = await writeWithApptBuffer(row(dd), (r) => supabase.from("appointments").update(r).eq("id", prevRow.id).select());
          if (error) { handleDbError(error, "update personal event"); return; }
          if (data && data[0]) setAppointments(prev => prev.map(a => a.id===prevRow.id ? data[0] : a));
        }
      } else {
        if (existing.length) {
          const { error: delErr } = await supabase.from("appointments").delete().in("id", existing.map(a=>a.id));
          if (delErr) { handleDbError(delErr, "replace personal event"); return; }
          setAppointments(prev => prev.filter(a => !ownIds.has(String(a.id))));
        }
        const { data, error } = await writeWithApptBuffer(dates.map(row), (r) => supabase.from("appointments").insert(r).select());
        if (error) {
          // The old rows are already gone: put them back, or the block disappears and the time opens on her booking page
          // (2026-10-20 audit: an insert refused by a booking made meanwhile left nothing blocked).
          if (existing.length) {
            const { data: back, error: backErr } = await supabase.from("appointments").insert(existing).select();
            if (!backErr && back) setAppointments(prev => [...prev, ...back]);
            else if (backErr) console.error("[personal event] restore failed:", backErr.message);
          }
          handleDbError(error, "create personal event"); return;
        }
        if (data) setAppointments(prev => [...prev, ...data]);
      }
      closePersonalEditor();
      toast(dates.length > 1 ? "האירוע נשמר (" + dates.length + " ימים)" : tr("האירוע נשמר"));
    } finally {
      setBusyKey("savePersonal", false);
    }
  };

  // Deleted outright, not soft-cancelled. "Cancelled" is a client-facing state
  // that exists so a receipt or a form pointing at the row stays valid, and so
  // undo can restore it. Nothing points at a personal event, and a cancelled one
  // would sit in the calendar meaning nothing.
  const handleDeletePersonal = (appt) => {
    if (guardWrite()) return;
    const rows = appt.series_id
      ? appointments.filter(a => a.series_id && a.series_id === appt.series_id)
      : [appt];
    const ids = rows.map(a => a.id);
    askConfirm({
      title: tr("מחיקת אירוע"),
      message: ids.length > 1
        ? 'למחוק את "' + appt.name + '"? האירוע נמשך ' + ids.length + ' ימים וכולם יימחקו.'
        : 'למחוק את "' + appt.name + '"?',
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("appointments").delete().in("id", ids);
        if (error) { handleDbError(error, "delete personal event"); return; }
        setAppointments(prev => prev.filter(a => !ids.includes(a.id)));
        closePersonalEditor();
        toast(tr("האירוע נמחק"));
      },
    });
  };/* @section-end */
  return { closePersonalEditor, datesInRange, handleDeletePersonal, handleSavePersonal, openPersonalEditor };
}

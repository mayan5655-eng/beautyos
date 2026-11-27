"use client";
// app/sections/useRebookSection.jsx — part of the owner's app: 248 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { dayHoursFrom, nextOpenDay } from "@/lib/businessHours";
import { startMinute, endMinute, fmtTime, startFields } from "@/lib/apptTime";
import { cleanBufferMinutes } from "@/lib/serviceBuffer";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { couldNotHe } from "@/lib/errorCopy";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";
import { tr } from "@/lib/i18n/tr";

export function useRebookSection(ctx) {
  const {
    activeServices, appointments, apptBufferOf, clients, formatDate, formatDateHe, guardWrite, handleDbError,
    isBusy, newApptBufferFor, rebookPick, rebookWeeks, setAppointments, setApptNote, setBusyKey,
    setEditingAppointmentId, setNewAppt, setRebookDone, setRebookNext, setRebookPick, setRebookPickOpen,
    setSelectedClient, setShowModal, setShowReceipt, settings, setWhatsappPending, showReceipt, toast, today,
  } = ctx;
  /* @section-body */const isFreeAt = useCallback((dateStr, minute, durationMin, ownBuffer = 0) => {
    const dur = (Number(durationMin) || 60) + (cleanBufferMinutes(ownBuffer) ?? 0);
    return !appointments.some((a) => {
      if (a.date !== dateStr || a.confirmation_status === "cancelled") return false;
      const bs = startMinute(a), rawEnd = endMinute(a);
      if (bs === null || rawEnd === null) return false;
      const be = rawEnd + apptBufferOf(a);
      return minute < be && bs < minute + dur;
    });
  }, [appointments, apptBufferOf]);

  // Every bookable start on one day, on a half-hour grid inside her hours for
  // that weekday. Empty when the day is closed.
  // `ownBuffer`: the buffer of the treatment being booked (lib/serviceBuffer.ts). It may run past closing.
  const freeSlotsOn = useCallback((dateStr, durationMin, ownBuffer = 0) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return [];
    const dh = dayHoursFrom(settings, d.getDay());
    if (!dh) return [];
    const dur = Number(durationMin) || 60;
    const out = [];
    for (let m = dh.open * 60; m + dur <= dh.close * 60; m += 30) {
      if (isFreeAt(dateStr, m, dur, ownBuffer)) out.push(m);
    }
    return out;
  }, [settings, isFreeAt]);

  // Find a real, free slot at or after the ideal one.
  //
  // Ideal = same weekday and same time, `weeks` out. Reality gets in the way in
  // three ways and all three are handled by walking forward rather than by
  // refusing: the day may be closed, the exact hour may be taken, and the whole
  // day may be full. Proposing a slot that cannot be booked would be worse than
  // proposing nothing, because she would tap it in front of the client.
  const proposeRebookSlot = useCallback((fromDateStr, fromMinute, durationMin, weeks, ownBuffer = 0) => {
    const base = new Date(fromDateStr || today);
    if (Number.isNaN(base.getTime())) return null;
    base.setDate(base.getDate() + weeks * 7);

    const wanted = Number.isFinite(fromMinute) ? fromMinute : 10 * 60;
    const dur = Number(durationMin) || 60;

    // Up to 14 days past the ideal date. Beyond that the proposal has drifted
    // far enough from what she asked for that silently offering it is a lie.
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const d = new Date(base);
      d.setDate(d.getDate() + dayOffset);
      const dateStr = formatDate(d);
      if (dateStr <= today) continue;

      const slots = freeSlotsOn(dateStr, dur, ownBuffer);
      if (slots.length === 0) continue;

      if (dayOffset === 0) {
        // Her actual time first, even when it is off the half-hour grid - an
        // anchor at 14:15 should propose 14:15, not round her to 14:30. The
        // grid is only the fallback, and the only thing the picker offers.
        const dh = dayHoursFrom(settings, d.getDay());
        const insideHours = wanted >= dh.open * 60 && wanted + dur <= dh.close * 60;
        if (insideHours && isFreeAt(dateStr, wanted, dur, ownBuffer)) {
          return { date: dateStr, minute: wanted, sameTime: true };
        }
        const after = slots.find((m) => m >= wanted);
        if (after != null) return { date: dateStr, minute: after, sameTime: false };
        continue;
      }

      return { date: dateStr, minute: slots[0], sameTime: false };
    }
    return null;
  }, [settings, today, freeSlotsOn, isFreeAt]);

  // Everything the strip needs, derived from the receipt on screen.
  const rebookPlan = useMemo(() => {
    if (!showReceipt || !showReceipt.client_id) return null;
    const client = clients.find((c) => String(c.id) === String(showReceipt.client_id));
    if (!client) return null;

    // The service to repeat. A receipt's `service` is a comma-joined list of
    // everything on it, so match the first line that is still on her menu; fall
    // back to the client's last appointment, then to nothing rather than
    // guessing at the top of the list.
    const names = String(showReceipt.service || "").split(",").map((s) => s.trim()).filter(Boolean);
    let svc = null;
    for (const n of names) {
      const found = activeServices.find((s) => s.name === n);
      if (found) { svc = found; break; }
    }

    // Anchor on the appointment this receipt was taken for, so "same time" means
    // the time she actually just worked, not the time of some older visit.
    const src = showReceipt.appointment_id
      ? appointments.find((a) => String(a.id) === String(showReceipt.appointment_id))
      : null;
    const past = appointments
      .filter((a) => String(a.client_id) === String(client.id) && a.confirmation_status !== "cancelled")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const anchor = src || past[0] || null;

    if (!svc && anchor) svc = activeServices.find((s) => s.name === anchor.service) || null;
    if (!svc) return null;

    const slot = proposeRebookSlot(
      anchor?.date || today,
      anchor ? startMinute(anchor) : null,
      svc.duration,
      rebookWeeks,
      newApptBufferFor(svc.name)
    );
    if (!slot) return null;
    return { client, svc, slot };
  }, [showReceipt, clients, appointments, activeServices, rebookWeeks, today, proposeRebookSlot, newApptBufferFor]);

  // The day's free starts, for the picker. Same freeSlotsOn the proposal used,
  // so she can only ever choose something that was already bookable.
  const rebookSlots = useMemo(
    () => (rebookPlan ? freeSlotsOn(rebookPlan.slot.date, rebookPlan.svc.duration, newApptBufferFor(rebookPlan.svc.name)) : []),
    [rebookPlan, freeSlotsOn, newApptBufferFor]
  );

  // What will actually be booked: her pick when it is still free on this date,
  // otherwise the proposal. Checking validity here rather than clearing the
  // pick on every change means a taken slot degrades to the proposal instead of
  // failing at insert time.
  const rebookMinute = (() => {
    if (!rebookPlan) return null;
    if (rebookPick && String(rebookPick.receiptId) === String(showReceipt?.id)
        && rebookSlots.includes(rebookPick.minute)) return rebookPick.minute;
    return rebookPlan.slot.minute;
  })();

  // The one insert behind every "book the next visit" tap: the checkout strip below and the "קבעי לה שוב" sheet
  // (RebookNextSheet). Same row handleSave writes for a plain new appointment, minus everything the form asks for.
  // Returns the created row, or null after telling her why not.
  const insertRebookAppointment = async ({ client, svc, date, minute }) => {
    if (guardWrite()) return null;
    // Re-check on the way in, through the same isFreeAt the proposal and the picker use. The plan was computed from state
    // that may be a few minutes old, and the exclusion constraint would reject it anyway - this just turns that into a
    // sentence she can act on.
    if (!isFreeAt(date, minute, svc.duration, newApptBufferFor(svc.name))) {
      toast(tr("השעה נתפסה בינתיים, בחרי שעה אחרת"), "error");
      return null;
    }
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    const tenantField = tid ? { tenant_id: tid } : {};

    const appt = {
      date,
      ...startFields(minute),
      name: client.name,
      service: svc.name,
      duration: Number(svc.duration) || 60,
      color: svc.color || DEFAULT_SERVICE_COLOR,
      client_id: client.id,
      note: "",
      price: Number(svc.price) || 0,
      confirmation_status: "pending",
      confirmation_sent: false,
      ...tenantField,
      // The buffer isFreeAt just checked with, so the database enforces the same rule (lib/apptBuffer.ts).
      ...apptBufferField(newApptBufferFor(svc.name)),
    };
    const { data, error } = await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
    if (error) { handleDbError(error, "rebook appointment"); return null; }
    if (!data || !data[0]) { toast(couldNotHe("לקבוע את התור"), "error"); return null; }
    setAppointments((prev) => [...prev, data[0]]);
    toast(tr("נקבע תור ל-{0} בשעה {1}", [formatDateHe(new Date(date)), fmtTime(minute)]));
    return data[0];
  };

  // "קבעי לה שוב" -> "שינוי": the full new-appointment form, prefilled with the proposal.
  const openRebookForm = ({ client, svc, date, minute }) => {
    const sv = svc || activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({
      clientId: client.id, name: client.name, service: sv?.name || "", duration: sv?.duration || 60,
      date: date || formatDate(nextOpenDay(settings)),
      hour: minute != null ? Math.floor(minute / 60) : settings.working_hours_start,
      ...(minute != null ? { startMinute: minute } : {}),
      price: sv?.price || 0,
    });
    setApptNote("");
    setRebookNext(null);
    setSelectedClient(null);
    setShowModal(true);
  };
  // She tapped "open in WhatsApp" on the message for the booking she just made: the same flag sendConfirmationNow sets.
  const markRebookMessageOpened = async (appt) => {
    toast(tr("וואטסאפ נפתח עם ההודעה מוכנה. נשאר ללחוץ על שליחה."));
    const { data, error } = await supabase.from("appointments").update({ confirmation_sent: true }).eq("id", appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return; }
    if (data?.[0]) setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data[0] : a)));
  };
  const refreshWaQueue = () => {
    fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.success) setWhatsappPending(j.messages || []); }).catch(() => {});
  };

  // Book it. Same insert as handleSave, minus everything the form asks for.
  const confirmRebook = async () => {
    if (guardWrite()) return;
    if (!rebookPlan || isBusy("rebook")) return;
    setBusyKey("rebook", true);
    try {
      const { client, svc, slot } = rebookPlan;
      const minute = rebookMinute;

      // Re-check on the way in, through the same isFreeAt the proposal and the
      // picker use. The plan was computed from state that may be a few minutes
      // old, and the exclusion constraint would reject it anyway — this just
      // turns that into a sentence she can act on.
      if (!isFreeAt(slot.date, minute, svc.duration, newApptBufferFor(svc.name))) {
        toast(tr("השעה נתפסה בינתיים, בחרי שעה אחרת"), "error");
        return;
      }

      const row = await insertRebookAppointment({ client, svc, date: slot.date, minute });
      if (!row) return;
      setRebookDone({ receiptId: showReceipt.id, appt: row });
      setRebookPick(null);
      setRebookPickOpen(false);
    } finally {
      setBusyKey("rebook", false);
    }
  };

  // Hand off to the full form, prefilled with the proposal, for the cases the
  // chips cannot express — a different treatment, a specific date she has been
  // told about, a time outside the pattern.
  const editRebook = () => {
    if (!rebookPlan) return;
    const { client, svc, slot } = rebookPlan;
    const minute = rebookMinute;
    setEditingAppointmentId(null);
    setNewAppt({
      clientId: client.id,
      name: client.name,
      service: svc.name,
      duration: svc.duration || 60,
      date: slot.date,
      hour: Math.floor(minute / 60),
      startMinute: minute,
      price: svc.price || 0,
    });
    setApptNote("");
    setShowReceipt(null);
    setShowModal(true);
  };/* @section-end */
  return { confirmRebook, editRebook, insertRebookAppointment, markRebookMessageOpened, openRebookForm, rebookMinute,
    rebookPlan, rebookSlots, refreshWaQueue };
}

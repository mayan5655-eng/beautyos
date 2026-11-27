"use client";
// app/sections/useAppointmentActionsSection.jsx — part of the owner's app: 271 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: refreshWaQueue is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useCallback } from "react";
import { supabase } from "../supabase";
import { startMinute, fmtApptTime } from "@/lib/apptTime";
import { waitlistOffersOn, waitlistOfferToast } from "@/lib/waitlistFlag.js";
import { isMissingColumnError } from "@/lib/pgError";
import { NO_SHOW } from "@/lib/reliability";
import { durationOutcome, durationOutcomeHe } from "@/lib/durationDrift";
import { UNDO_SETTLE_MS } from "@/lib/toastDuration";
import { feesChanged } from "../useFees";
import { tr } from "@/lib/i18n/tr";

export function useAppointmentActionsSection(ctx) {
  const {
    askConfirm, clients, fetchConfirmLinks, fmtDateHe, guardWrite, handleDbError, loadPendingQuestion, runOnce,
    setAppointments, setReceipts, settings, setWhatsappPending, toast, tomorrowAppts, triggerGapFill,
    waConfirmLink, late,
  } = ctx;
  const refreshWaQueue = (...args) => late.refreshWaQueue(...args);
  /* @section-body */const notifyFeeDetect = (appointmentId, event) => {
    fetch("/api/grow/fees/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: String(appointmentId), event }) }).then(() => feesChanged()).catch(() => {});
  };
  // A fee was charged from a question: bring the new receipt into the lists (client card, cashier history, reports).
  const feeCharged = async (receiptId) => {
    if (!receiptId) return;
    try {
      const { data } = await supabase.from("receipts").select("*").eq("id", receiptId);
      if (data && data[0]) setReceipts(prev => prev.some(x => String(x.id) === String(data[0].id)) ? prev : [...prev, data[0]]);
    } catch { /* the receipt shows after the next reload */ }
  };

  const softCancelAppointment = useCallback(async (appt, by = "business") => {
    const withAudit = {
      confirmation_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: by,
    };
    let res = await supabase.from("appointments").update(withAudit).eq("id", appt.id).select();
    if (isMissingColumnError(res.error)) {
      res = await supabase
        .from("appointments")
        .update({ confirmation_status: "cancelled" })
        .eq("id", appt.id)
        .select();
    }
    if (!res.error) notifyFeeDetect(appt.id, "cancel");
    return res;
  }, []);

  // No-show: the appointment stood and she was not there. Set by hand, on or
  // after the day, never by the system - nothing but the person who was
  // waiting can know. Counted on the client card (lib/reliability.ts). The
  // row keeps its slot, its price and its history; only the status moves,
  // and the toast offers the way back.
  const markNoShow = (appt) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("לא הגיעה"),
      message: tr("לסמן ש{0} לא הגיעה לתור ב-{1} {2}? הסימון נספר בכרטיס הלקוחה.", [appt.name, fmtDateHe(appt.date), fmtApptTime(appt)]),
      confirmText: tr("סמני: לא הגיעה"),
      danger: true,
      onConfirm: async () => {
        const previousStatus = appt.confirmation_status || "pending";
        const { data, error } = await supabase.from("appointments").update({ confirmation_status: NO_SHOW }).eq("id", appt.id).select();
        if (error) {
          // 23514: the status check constraint still lists three values -
          // add_till_and_calendar_small_things.sql hasn't run on this DB yet.
          // She never needs to know that; "תקועה?" already sends the screen
          // name along with her message, which is enough for us to know too.
          if (error.code === "23514") { console.error("[markNoShow] migration missing: add_till_and_calendar_small_things.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
          handleDbError(error, "mark no-show"); return;
        }
        if (data && data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? data[0] : a));
        notifyFeeDetect(appt.id, "no_show");
        toast(tr("סומן: לא הגיעה"), "success", { label: tr("החזרה"), onClick: async () => {
          const r = await supabase.from("appointments").update({ confirmation_status: previousStatus }).eq("id", appt.id).select();
          if (r.error) { handleDbError(r.error, "restore appointment"); return; }
          if (r.data && r.data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? r.data[0] : a));
          notifyFeeDetect(appt.id, "restore");
          toast(tr("הסימון בוטל"));
        }});
      },
    });
  };

  // Real start/finish: see supabase/migrations/pending/
  // appointment-actual-duration.sql. Two separate writes rather than one
  // "log the duration afterward" field, because a treatment that is open
  // right now (started, not yet finished) is itself worth knowing, and
  // "finished" is the moment the one sentence that matters - booked vs.
  // actual - is still true, not something to reconstruct from a report.
  const handleStartTreatment = async (appt) => {
    if (guardWrite()) return;
    const { data, error } = await supabase.from("appointments").update({ actual_start_at: new Date().toISOString() }).eq("id", appt.id).select();
    if (error) {
      if (isMissingColumnError(error)) { console.error("[handleStartTreatment] migration missing: appointment-actual-duration.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
      handleDbError(error, "start treatment"); return;
    }
    if (data && data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? data[0] : a));
  };

  const handleFinishTreatment = async (appt) => {
    if (guardWrite()) return;
    const { data, error } = await supabase.from("appointments").update({ actual_end_at: new Date().toISOString() }).eq("id", appt.id).select();
    if (error) {
      if (isMissingColumnError(error)) { console.error("[handleFinishTreatment] migration missing: appointment-actual-duration.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
      handleDbError(error, "finish treatment"); return;
    }
    const updated = data && data[0];
    if (updated) setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
    const outcome = updated ? durationOutcome(updated.actual_start_at, updated.actual_end_at, Number(updated.duration) || 0) : null;
    toast(outcome ? durationOutcomeHe(outcome) : tr("התור סומן כהושלם"));
  };

  const handleDelete = (appt) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("ביטול תור"),
      message: tr("לבטל את התור של {0} ({1}, {2} {3})? התור יסומן כמבוטל וישאר ביומן.", [appt.name, appt.service, fmtDateHe(appt.date), fmtApptTime(appt)]),
      confirmText: tr("ביטול התור"),
      danger: true,
      onConfirm: async () => {
        const previousStatus = appt.confirmation_status || "pending";
        const { data, error } = await softCancelAppointment(appt);
        if (error) { handleDbError(error, "cancel appointment"); return; }
        const updated = (data && data[0]) || { ...appt, confirmation_status: "cancelled" };
        setAppointments(prev=>prev.map(a=>a.id===appt.id?updated:a));
        // Undo restores the previous status in place. No re-insert, so the row
        // keeps its id and every receipt or form pointing at it stays valid -
        // the old undo created a NEW row with a fresh id and silently orphaned
        // anything that referenced the original.
        let restored = false;
        const restore = async () => {
          restored = true;
          let r = await supabase.from("appointments")
            .update({ confirmation_status: previousStatus, cancelled_at: null, cancelled_by: null })
            .eq("id", appt.id).select();
          if (r.error && (r.error.code === "42703" || r.error.code === "PGRST204" ||
              /column .* does not exist|could not find the '.*' column/i.test(String(r.error.message || "")))) {
            r = await supabase.from("appointments")
              .update({ confirmation_status: previousStatus })
              .eq("id", appt.id).select();
          }
          if (r.error) { handleDbError(r.error, "restore appointment"); return; }
          if (r.data && r.data[0]) setAppointments(prev=>prev.map(a=>a.id===appt.id?r.data[0]:a));
          toast(tr("התור שוחזר"));
        };
        toast(tr("התור בוטל"), "success", { label: tr("החזרה"), onClick: restore });
        // She cancelled, so the client does not know yet (2026-10-23 pass, E1). After the same undo window, the
        // message telling her is prepared server-side: out from the central number when it is on, otherwise in
        // "הודעות מוכנות לשליחה". Only for a real client of hers with a phone; never for a personal block.
        const cancelClient = clients.find(c => String(c.id) === String(appt.client_id));
        if (appt.kind !== "personal" && (cancelClient?.phone || appt.client_phone)) {
          setTimeout(async () => {
            if (restored) return;
            try {
              const r = await fetch("/api/cancel-notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j.success) { if (r.status !== 403) toast(tr("לא הצלחנו להכין ללקוחה הודעה על הביטול. כדאי לכתוב לה בעצמך."), "error"); return; }
              if (j.queued) {
                const q = await fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then(x => x.json()).catch(() => null);
                if (q?.success) setWhatsappPending(q.messages || []);
                toast(tr("הודעה ל{0} על הביטול מחכה ב\"הודעות מוכנות לשליחה\"", [appt.name || "לקוחה"]), "info");
              } else {
                toast(tr("הודעה על הביטול יצאה ל{0} מהמספר המרכזי", [appt.name || "לקוחה"]));
              }
            } catch { toast(tr("לא הצלחנו להכין ללקוחה הודעה על הביטול. כדאי לכתוב לה בעצמך."), "error"); }
          }, UNDO_SETTLE_MS + 100);
        }
        // Smart waitlist: with her switch on (Settings > הודעות), the people waiting for this treatment whom the slot fits get one offer.
        // The server re-checks that the appointment is still cancelled, so the undo above always wins.
        // Only when she turned it on, and the platform flag allows it (lib/waitlistFlag.js). What happened is shown in one line
        // (waitlistOfferToast): who it was offered to, or that it waits for the morning; nothing when nobody fits.
        if (waitlistOffersOn(settings) && appt.kind !== "personal") {
          setTimeout(async () => {
            if (restored) return;
            try {
              const r = await fetch("/api/waitlist/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) });
              const j = await r.json().catch(() => ({}));
              const line = r.ok && j?.success ? waitlistOfferToast(j) : null;
              if (line) toast(line.text, line.kind);
            } catch { /* the owner alert still tells her; the slot is free either way */ }
          }, UNDO_SETTLE_MS);
        }
        // Fire gap-fill only AFTER the undo window closes, and only if it wasn't
        // undone — so a quick "ביטול" never lets a real WhatsApp offer go out for
        // an appointment the cosmetician restored. Gated by the settings toggle.
        if (settings.gap_fill_enabled === true) {
          setTimeout(() => { if (!restored) triggerGapFill(appt); }, UNDO_SETTLE_MS);
        } else {
          // Auto mode is off: ask instead of acting. The question is written
          // after the same undo window, so a restored appointment never asks.
          // Only future slots are worth offering.
          setTimeout(async () => {
            if (restored) return;
            if (settings?.automations?.quiet === true) return; // on a break: don't ask
            try {
              const startMs = new Date(`${appt.date}T00:00:00`).getTime() + (startMinute(appt) || 0) * 60000;
              if (isNaN(startMs) || startMs - Date.now() < 2 * 60 * 60 * 1000) return;
              // Server-side write: the browser holds no INSERT on
              // owner_questions - /api/questions stamps the tenant from the
              // session and validates the payload shape.
              const res = await fetch("/api/questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "gap_fill", payload: {
                  date: appt.date, startMinute: startMinute(appt), service: appt.service,
                  duration: appt.duration, cancelledClientId: appt.client_id,
                }}),
              });
              const qData = await res.json().catch(() => ({}));
              if (!qData.success) { console.error("[one-question] gap_fill insert FAILED:", qData.error || res.status); return; }
              loadPendingQuestion();
            } catch (e) { console.error("[one-question] gap_fill insert THREW:", e?.message || String(e)); }
          }, UNDO_SETTLE_MS);
        }
      },
    });
  };

  const handleSendConfirmation = (appt) => runOnce(`sendConfirm:${appt.id}`, () => sendConfirmationNow(appt));
  // Returns true only when a WhatsApp window actually opened. A blocked popup is not a sent reminder, so it is not marked sent
  // (2026-10-20 audit: the bulk loop marked every client after the first as handled while nothing had opened for them).
  const sendConfirmationNow = async (appt) => {
    if (guardWrite()) return false;
    const client=clients.find(c=>String(c.id)===String(appt.client_id));
    if(!client?.phone){toast(tr("אין מספר טלפון ללקוחה"),"error");return false;}
    // The window is opened synchronously, inside the click, and only then
    // pointed at the link. Awaiting the signed links first and opening
    // afterwards would put window.open outside the user gesture, which Safari
    // and Chrome block as a popup.
    const w = window.open("", "_blank");
    const links = await fetchConfirmLinks(appt.id);
    if (!links) { if (w) w.close(); toast(tr("לא הצלחנו להכין את קישורי האישור"), "error"); return false; }
    const brandJson = settings.branding && typeof settings.branding === "object" ? settings.branding : {};
    const link = waConfirmLink(client.phone, appt.name, appt.service, appt.date, fmtApptTime(appt), links, {
      businessName: settings.business_name,
      address: brandJson.public_address || brandJson.address,
      arrivalNote: brandJson.arrival_note,
      branding: brandJson,
    });
    const opened = w ? (w.location.href = link, true) : !!window.open(link, "_blank");
    if (!opened) { toast(tr("הדפדפן חסם את פתיחת וואטסאפ, אפשר לנסות שוב"), "info"); return false; }
    // Tell the server this appointment's reminder went: the daily run will not queue it again, and a copy already waiting in the
    // queue is dismissed (lib/reminders/handled.js; a client used to get two, 2026-11-02 audit). Best effort, never blocks her.
    fetch("/api/reminders/handled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) })
      .then(() => refreshWaQueue()).catch(() => {});
    const {data, error}=await supabase.from("appointments").update({confirmation_sent:true}).eq("id",appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return true; }
    if(data)setAppointments(prev=>prev.map(a=>a.id===appt.id?data[0]:a));
    return true;
  };

  const handleSendAllConfirmations = async () => {
    if (guardWrite()) return;
    // A cancelled or no-show booking gets no reminder (the cron and the "היום שלי" card already skip them; 2026-11-02 audit).
    const pending=tomorrowAppts.filter(a=>!a.confirmation_sent&&a.confirmation_status!=="cancelled"&&a.confirmation_status!==NO_SHOW);
    if(pending.length===0){toast(tr("כבר הכנת תזכורות לכל התורים של מחר"), "info");return;}
    askConfirm({
      title: tr("שליחת תזכורות"),
      message: `${pending.length===1?"לשלוח תזכורת ללקוחה אחת?":`לשלוח תזכורת ל-${pending.length} לקוחות?`}`,
      confirmText: tr("שליחה"),
      onConfirm: async () => {
        // The browser lets a page open a window only from a tap, so after the first one the rest may be blocked. Those stay
        // unmarked and she is told how many are left, instead of a toast that says all of them were opened.
        let opened = 0;
        for(const appt of pending){
          const ok = await handleSendConfirmation(appt);
          if (!ok) break;
          opened++;
          await new Promise(r=>setTimeout(r,500));
        }
        const left = pending.length - opened;
        if (left > 0) toast(opened ? tr("פתחנו וואטסאפ ל-{0} מתוך {1}. הדפדפן חסם את השאר, אפשר ללחוץ על כל תור בנפרד.", [opened, pending.length]) : tr("הדפדפן חסם את פתיחת וואטסאפ. אפשר ללחוץ על כל תור בנפרד."), "info");
        else toast(pending.length===1?tr("פתחנו וואטסאפ עם תזכורת מוכנה ללקוחה אחת. נשאר ללחוץ שליחה."):tr("פתחנו וואטסאפ עם תזכורת מוכנה ל-{0} לקוחות. נשאר ללחוץ שליחה בכל שיחה.", [pending.length]));
      },
    });
  };

  // Messages center, "תזכורות לתורי מחר": one reminder per tap, through the same path as a single reminder (confirm/cancel links,
  // marked sent, and /api/reminders/handled so the daily run does not queue it again). A loop of window.open calls is blocked by
  // phones after the first window, so the group button opens the next one only (2026-11-03 UX review).
  const sendNextReminder = async (targets) => {
    const next = (targets || []).find((t) => t.appt);
    if (!next) return;
    const ok = await handleSendConfirmation(next.appt);
    if (!ok) return;
    const left = targets.length - 1;
    toast(left > 0 ? tr("נפתח וואטסאפ עם תזכורת ל{0}. {1}, אפשר ללחוץ שוב.", [next.name || "לקוחה", left === 1 ? "נשארה עוד אחת" : `נשארו עוד ${left}`]) : tr("נפתח וואטסאפ עם תזכורת ל{0}. נשאר ללחוץ שליחה.", [next.name || "לקוחה"]));
  };/* @section-end */
  return { feeCharged, handleDelete, handleFinishTreatment, handleSendAllConfirmations, handleSendConfirmation,
    handleStartTreatment, markNoShow, sendNextReminder, softCancelAppointment };
}

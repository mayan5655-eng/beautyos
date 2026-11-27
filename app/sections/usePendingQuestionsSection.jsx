"use client";
// app/sections/usePendingQuestionsSection.jsx — part of the owner's app: 228 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: refreshWaQueue is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { startMinute } from "@/lib/apptTime";
import { STUCK_HE } from "@/lib/errorCopy";
import { quietStatus } from "@/lib/quiet";
import { tr } from "@/lib/i18n/tr";

export function usePendingQuestionsSection(ctx) {
  const {
    activeTab, appointments, isBusy, setBusyKey, setComposeDone, setComposeSend, setPendingQuestion,
    setQuestionStats, settings, toast, late,
  } = ctx;
  const refreshWaQueue = (...args) => late.refreshWaQueue(...args);
  /* @section-body */const loadPendingQuestion = async () => {
    try {
      const { data, error } = await supabase
        .from("owner_questions")
        .select("id, kind, payload, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      // A denied read comes back as {data:null, error} without throwing - the
      // exact shape the old catch-all made invisible. Log it loudly; the card
      // not rendering must never again be indistinguishable from "no rows".
      if (error) {
        console.error("[one-question] read FAILED:", error.code || "", error.message);
        return;
      }
      const rows = data || [];
      let show = null;
      for (const q of rows) {
        if (q.kind === "gap_fill") {
          const p = q.payload || {};
          const startMs = new Date(`${p.date}T00:00:00`).getTime() + (Number(p.startMinute) || 0) * 60000;
          if (isNaN(startMs) || startMs - Date.now() < 2 * 60 * 60 * 1000) {
            supabase.from("owner_questions").update({ status: "expired", answered_at: new Date().toISOString() }).eq("id", q.id)
              .then(({ error: expErr }) => { if (expErr) console.error("[one-question] expire FAILED:", expErr.message); });
            continue;
          }
          // STILL FREE? Between the cancellation and now, anyone can have
          // booked this slot - and a card offering a slot that no longer
          // exists invites a yes that sends real people a dead link. Checked
          // against the calendar on every load; a taken slot marks the
          // question 'stale' (not yes/no - she never answered it), which is
          // measurable data: how often the market beats the question.
          const qStart = Number(p.startMinute) || 0;
          const qDur = Number(p.duration) > 0 ? Number(p.duration) : 60;
          const { data: dayAppts, error: dayErr } = await supabase
            .from("appointments")
            .select("start_minute, hour, duration, confirmation_status")
            .eq("date", p.date);
          if (dayErr) {
            console.error("[one-question] slot-free check FAILED:", dayErr.message);
            // Cannot verify - do not show a question we cannot stand behind.
            continue;
          }
          const taken = (dayAppts || []).some((a) => {
            if (a.confirmation_status === "cancelled") return false;
            const st = a.start_minute != null ? Number(a.start_minute) : (a.hour != null ? Number(a.hour) * 60 : null);
            if (st === null || !Number.isFinite(st)) return false;
            const dur = Number(a.duration) > 0 ? Number(a.duration) : 60;
            return st < qStart + qDur && qStart < st + dur;
          });
          if (taken) {
            console.log("[one-question] gap_fill went STALE before answer - slot rebooked:", p.date, qStart);
            supabase.from("owner_questions").update({ status: "stale", answered_at: new Date().toISOString() }).eq("id", q.id)
              .then(({ error: stErr }) => { if (stErr) console.error("[one-question] stale mark FAILED:", stErr.message); });
            continue;
          }
        }
        show = q; break;
      }
      setPendingQuestion(show);
      const { data: answered, error: statsErr } = await supabase
        .from("owner_questions")
        .select("status")
        .in("status", ["yes", "no"]);
      if (statsErr) console.error("[one-question] stats read FAILED:", statsErr.message);
      if (answered) {
        setQuestionStats({
          yes: answered.filter((r) => r.status === "yes").length,
          no: answered.filter((r) => r.status === "no").length,
        });
      }
    } catch (e) {
      console.error("[one-question] load THREW:", e?.message || String(e));
    }
  };

  // The mount-only load missed two real paths on mobile: a PWA resumed from
  // the background (no remount, stale state), and navigating to the dashboard
  // tab after the mount already ran. Reload on both.
  // Skipped on the FIRST run: the mount effect above already starts this load, and running both sent the same
  // two reads (pending questions, then the yes/no counts) twice at boot - two requests and two CORS preflights
  // on the critical path for nothing. Every later change of tab loads as before.
  const questionLoadedOnMountRef = useRef(true);
  useEffect(() => {
    if (questionLoadedOnMountRef.current) { questionLoadedOnMountRef.current = false; return; }
    if (activeTab === "dashboard") loadPendingQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  useEffect(() => {
    // The ready-to-send queue too: reminders are queued in the afternoon, often while the app is already open (2026-11-02 audit).
    const onVisible = () => { if (document.visibilityState === "visible") { loadPendingQuestion(); refreshWaQueue(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answerQuestion = async (q, saidYes) => {
    if (isBusy("ownerQuestion")) return;
    setBusyKey("ownerQuestion", true);
    try {
      let result = null;
      // A yes PREPARES rather than sends: the server picks the candidates and
      // writes the claim links, and a compose window opens for her to send
      // from her own WhatsApp (wa.me) - works with no GreenAPI, no ban risk,
      // and the message arrives from a number the client knows. There is no
      // automatic path: marketing leaves from her phone only.
      if (saidYes && (q.kind === "gap_fill" || q.kind === "comeback")) {
        const p = q.payload || {};
        if (q.kind === "comeback" && !p.quiet_start) {
          toast(tr("לא נמצאו לקוחות מתאימות"));
          result = { sent: 0 };
        } else {
          const url = q.kind === "gap_fill" ? "/api/slots/offer" : "/api/clients/comeback";
          const reqBody = q.kind === "gap_fill"
            ? { date: p.date, startMinute: p.startMinute, service: p.service,
                duration: p.duration, cancelledClientId: p.cancelledClientId,
                ...(p.staffId ? { staffId: p.staffId } : {}),
                explicitConfirm: true, mode: "prepare" }
            : { quietStart: p.quiet_start, mode: "prepare" };
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });
          const data = await res.json().catch(() => ({}));
          if (!data.success) { toast(data.error || tr("לא הצלחנו להכין, אפשר לנסות שוב"), "error"); return; }
          if (data.slotTaken) {
            // The slot was booked between the card rendering and her yes. Not
            // a yes and not a no - she never really answered; 'stale'.
            console.log("[one-question] gap_fill went STALE at yes - slot rebooked");
            toast(tr("התור הזה כבר נתפס בינתיים, אין צורך להציע אותו 🎉"));
            const { error: stErr } = await supabase.from("owner_questions")
              .update({ status: "stale", answered_at: new Date().toISOString() })
              .eq("id", q.id);
            if (stErr) console.error("[one-question] stale mark FAILED:", stErr.message);
            setPendingQuestion(null);
            return;
          }
          if (!data.candidates || data.candidates.length === 0) {
            toast(tr("לא נמצאו לקוחות מתאימות"));
            result = { sent: 0 };
          } else {
            setComposeDone({});
            setComposeSend({
              kind: q.kind,
              title: q.kind === "gap_fill" ? tr("הצעת התור שהתפנה") : tr("הודעת \"חזרנו\""),
              messageTemplate: data.messageTemplate || "",
              candidates: data.candidates,
              payload: p,
            });
            result = { prepared: data.candidates.length };
          }
        }
      }
      const { error: ansErr } = await supabase.from("owner_questions")
        .update({ status: saidYes ? "yes" : "no", result, answered_at: new Date().toISOString() })
        .eq("id", q.id);
      if (ansErr) {
        // The send (on yes) already happened; the MEASUREMENT failed. Say so -
        // a yes-rate quietly missing its rows is worse than a visible error.
        console.error("[one-question] answer update FAILED:", ansErr.code || "", ansErr.message);
        toast(tr("התשובה לא נשמרה: {0}", [ansErr.message]), "error");
        return;
      }
      setPendingQuestion(null);
      setQuestionStats((prev) => prev ? { ...prev, [saidYes ? "yes" : "no"]: prev[saidYes ? "yes" : "no"] + 1 } : prev);
    } catch (e) {
      toast(STUCK_HE, "error");
    } finally {
      setBusyKey("ownerQuestion", false);
    }
  };

  // Business quiet mode: manual (automations.quiet) or automatic (a calendar
  // with history that has gone dark). While quiet, the one-question card stays
  // silent - automatic quiet deliberately shows NO banner. See lib/quiet.js.
  const businessQuiet = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return quietStatus({
      pastDates: (appointments || []).map((a) => a.date).filter((d) => d && d <= todayStr),
      manualQuiet: settings?.automations?.quiet === true,
      manualQuietEndedAt: settings?.automations?.quiet_ended_at || null,
    });
  }, [appointments, settings?.automations?.quiet, settings?.automations?.quiet_ended_at]);

  // The comeback question: due COMEBACK_WAIT_DAYS after a break ends (day one
  // back looks like pressure). One question per break - deduped on the break's
  // end date, across every status, so "לא הפעם" is never re-asked.
  useEffect(() => {
    if (!settings?.tenant_id || !businessQuiet.comebackDue || !businessQuiet.quietEnd) return;
    (async () => {
      try {
        // Server-side write; the route also dedups one comeback per break.
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "comeback", payload: {
            quiet_start: businessQuiet.quietStart, quiet_end: businessQuiet.quietEnd,
          }}),
        });
        const cbData = await res.json().catch(() => ({}));
        if (!cbData.success) { console.error("[one-question] comeback insert FAILED:", cbData.error || res.status); return; }
        if (!cbData.duplicate) loadPendingQuestion();
      } catch (e) { console.error("[one-question] comeback THREW:", e?.message || String(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessQuiet.comebackDue, businessQuiet.quietEnd, settings?.tenant_id]);

  // Gap-fill trigger: ask the server to offer this freed slot to matching clients
  // over WhatsApp. All candidate selection + sending happens server-side (see
  // app/api/slots/offer); the server also re-checks the toggle, so this is a
  // safe fire-and-forget. Real messages go out, hence the undo-window guard below.
  const triggerGapFill = async (appt) => {
    try {
      const res = await fetch("/api/slots/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: appt.date, startMinute: startMinute(appt), service: appt.service,
          duration: appt.duration, cancelledClientId: appt.client_id,
          // The team calendar: her slot stays hers (the route checks it is one of this business's active staff).
          ...(appt.staff_id ? { staffId: String(appt.staff_id) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.sent > 0) toast(tr("הצעה למילוי התור מוכנה ל-{0} לקוחות, אפשר לשלוח מהתור הממתין בלוח הבקרה ✦", [data.sent]));
    } catch { /* non-fatal: the cancellation already succeeded */ }
  };/* @section-end */
  return { answerQuestion, businessQuiet, loadPendingQuestion, triggerGapFill };
}

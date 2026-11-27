"use client";
// app/sections/useVoiceSection.jsx — part of the owner's app: 530 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { parseDb } from "@/lib/dbTime";
import { supabase } from "../supabase";
import { startMinute, endMinute, fmtApptTime, startFields, toMinutes } from "@/lib/apptTime";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { paymentsOf, isSplit, voidOf, receiptsOnDay, localDayKey } from "@/lib/till";
import { docLabelHe } from "@/lib/legalReceipts/policy";
import { greet as msgGreet, lines as msgLines, mapsLink as msgMapsLink, hebrewDate as msgHebrewDate, moveLine as msgMoveLine } from "@/lib/messages.js";
import { receiptMethodLabel, splitVoucherCodes } from "@/lib/giftVouchers";
import { speechLangOf } from "@/lib/i18n/core";
import { tr, getActiveLang } from "@/lib/i18n/tr";

export function useVoiceSection(ctx) {
  const {
    activeServices, afterPaymentRecorded, appointments, apptBufferOf, clients, dayWordFor, fetchConfirmLinks,
    fmtDateHe, guardWrite, handleDbError, herAccent, isBusy, liveRcpts, newApptBufferFor, receiptVoids,
    recognitionRef, setAppointments, setBusyKey, setClients, setConsentAskFor, setReceipts, setShowReceipt,
    setShowVoice, settings, setVoiceBooking, setVoiceCall, setVoiceCancel, setVoiceErr, setVoiceInfo,
    setVoiceIntent, setVoiceReceipt, setVoiceStatus, setVoiceTranscript, setWhatsappPending,
    softCancelAppointment, thisMonth, thisYear, toast, today, voiceBooking, voiceCancel, voiceReceipt, waMsg,
  } = ctx;
  /* @section-body */const stopRecognition = () => {
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch {}
    recognitionRef.current = null;
  };
  const closeVoice = () => { stopRecognition(); setShowVoice(false); };

  const processVoice = async (transcript) => {
    setVoiceStatus("processing");
    try {
      const res = await fetch("/api/voice-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, today, lang: getActiveLang() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.intent) {
        const intent = data.intent;
        setVoiceIntent(intent);
        if (data.capNotice) toast(data.capNotice);
        if (intent.action === "book_appointment") prepareBooking(intent);
        else if (intent.action === "show_day") showDayInfo(intent);
        else if (intent.action === "revenue_summary") revenueInfo(intent);
        else if (intent.action === "cancel_appointment") prepareCancel(intent);
        else if (intent.action === "call_client") prepareCall(intent);
        else if (intent.action === "create_receipt") prepareReceipt(intent);
        else setVoiceStatus("result");
      } else { setVoiceErr(data.error || tr("לא הצלחתי להבין את הבקשה")); setVoiceStatus("error"); }
    } catch (err) {
      setVoiceErr(tr("משהו השתבש בעיבוד הבקשה, נסי שוב")); setVoiceStatus("error");
    }
  };

  // show_day: read-only list of the requested day's appointments (from state).
  const showDayInfo = (intent) => {
    const d = intent.date || today;
    const list = appointments.filter(a => a.date === d)
      .sort((a,b) => (startMinute(a)??0) - (startMinute(b)??0));
    setVoiceInfo({ kind: "day", date: d, items: list.map(a => ({ name: a.name, hour: a.hour, startMinute: startMinute(a), service: a.service })) });
    setVoiceStatus("info");
  };

  // revenue_summary: sum receipts for today / this month (read-only).
  const revenueInfo = (intent) => {
    const period = intent.period === "today" ? "today" : "month";
    const rs = period === "today"
      ? receiptsOnDay(liveRcpts, today)
      : liveRcpts.filter(r => { const c = r.created_at && parseDb(r.created_at); return c && c.getMonth() === thisMonth && c.getFullYear() === thisYear; });
    const total = rs.reduce((s,r) => s + (Number(r.amount)||0), 0);
    setVoiceInfo({ kind: "revenue", period, total, count: rs.length });
    setVoiceStatus("info");
  };

  // create_receipt: build an editable receipt draft (matching an existing client
  // if any). Nothing is created here — only on explicit confirm.
  const prepareReceipt = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const payMap = { cash: "מזומן", card: "אשראי", bit: "ביט" };
    setVoiceReceipt({
      clientName: matched ? matched.name : nameSpoken,
      amount: (intent.amount != null && intent.amount !== "") ? String(intent.amount) : "",
      payment: payMap[intent.payment_method] || "מזומן",
    });
    setVoiceStatus("receipt");
  };

  // Create the receipt (and the client, if new) — ONLY on explicit confirm.
  // Mirrors handleSaveReceipt's DB fields; tenant_id is filled by the DB default.
  const handleVoiceReceipt = async () => {
    if (guardWrite()) return;
    const b = voiceReceipt;
    if (!b) return;
    if (!b.clientName.trim()) { toast(tr("חסר שם לקוחה"), "error"); return; }
    const amt = Number(b.amount);
    if (!amt || amt <= 0) { toast(tr("חסר סכום, אפשר להקליד אותו"), "error"); return; }
    if (isBusy("voiceReceipt")) return;
    setBusyKey("voiceReceipt", true);
    try {
      // Resolve the client: reuse an exact match, otherwise create a new one.
      let clientId = null;
      let clientName = b.clientName.trim();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === clientName.toLowerCase());
      if (existing) { clientId = existing.id; clientName = existing.name; }
      else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:clientName,phone:"",skinType:"",notes:"",status:"active"}]).select();
        if (ce) { handleDbError(ce, "create client (voice receipt)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const receipt = {
        client_id: clientId,
        client_name: clientName,
        appointment_id: null,
        service: "תשלום",
        amount: amt,
        payment_method: b.payment,
        note: "",
        items: JSON.stringify([]),
        discount: 0,
      };
      const {data,error} = await supabase.from("receipts").insert([receipt]).select();
      if (error) { handleDbError(error, "create receipt (voice)"); return; }
      closeVoice();
      toast(tr("התשלום נרשם ✦"));
      // Open the receipt modal so the voice receipt gets the same actions
      // (print / manual "send to client") as a regular receipt.
      if (data) {
        setReceipts(prev=>[...prev, data[0]]);
        setShowReceipt(data[0]);setConsentAskFor(data[0].id);
        // Auto-send to the client on WhatsApp when enabled (same helper as the
        // manual button). Fire-and-forget — never blocks or breaks creation.
        const cl = clients.find(c=>String(c.id)===String(data[0].client_id));
        afterPaymentRecorded(data[0], { autoSend: !!((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cl?.phone) });
      }
    } finally {
      setBusyKey("voiceReceipt", false);
    }
  };

  // Send a receipt summary to the client's WhatsApp via GreenAPI (server route
  // /api/send-receipt, which reuses lib/whatsapp.js — the same mechanism as
  // booking confirmations). Only sends when the client has a phone number.
  // A message the server queued and she is opening right now. When WhatsApp really opened, the queued row is
  // marked sent, so the same message does not also wait in "הודעות מוכנות לשליחה" (2026-10-23 pass, C3).
  // When the browser blocked it, it stays there and she is told so. (No "noopener": with it window.open
  // always returns null and an opened tab could not be told from a blocked one; opener is cut by hand.)
  const openQueuedWa = (link, messageId) => {
    const w = window.open(link, "_blank");
    if (w) {
      try { w.opener = null; } catch {}
      if (messageId) {
        fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: messageId }) }).catch(() => {});
        setWhatsappPending(prev => prev.filter(x => x.id !== messageId));
      }
      return true;
    }
    toast(tr("הדפדפן חסם את פתיחת וואטסאפ. ההודעה מחכה ב\"הודעות מוכנות לשליחה\""), "info");
    fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then(r => r.json()).then(j => { if (j?.success) setWhatsappPending(j.messages || []); }).catch(() => {});
    return false;
  };

  // `silent` suppresses toasts for the auto-send path. Returns true on success.
  const sendReceiptToClient = async (receipt, { silent = false } = {}) => {
    if (guardWrite()) return false;
    if (!receipt) return false;
    // Resolve the phone from the tenant's own client row; fall back to any
    // phone already on the receipt object.
    const cl = clients.find(c => String(c.id) === String(receipt.client_id));
    const phone = (cl?.phone || receipt.client_phone || "").trim();
    if (!phone) { if (!silent) toast(tr("ללקוחה אין מספר טלפון"), "error"); return false; }
    try {
      const res = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: settings.tenant_id,
          receipt_id: receipt.id,
          client_name: receipt.client_name,
          client_phone: phone,
          amount: receipt.amount,
          payment_method: receipt.payment_method,
          tip: Number(receipt.tip) || 0,
          payments_text: isSplit(receipt) ? paymentsOf(receipt).map(p=>`${p.method} ₪${p.amount}`).join(", ") : "",
          date: localDayKey(receipt.created_at),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.queued && data.waLink) {
        // Manual mode (or the central number fell back): still a success,
        // just not automatic. The silent auto-send path leaves it in her
        // WhatsApp queue rather than popping a tab she didn't ask for right
        // now; a direct button tap opens it immediately.
        if (!silent) { toast(tr("מוכן לשליחה, נפתח וואטסאפ")); openQueuedWa(data.waLink, data.messageId); }
        return true;
      }
      if (!res.ok || !data.success) {
        if (!silent) toast(tr("לא הצלחנו להכין שליחה אוטומטית, אפשר לשלוח בקישור הישיר למטה"), "error");
        return false;
      }
      if (!silent) toast(tr("ההודעה הועברה לשליחה בוואטסאפ ✦"));
      return true;
    } catch {
      if (!silent) toast(tr("לא הצלחנו להכין שליחה אוטומטית"), "error");
      return false;
    }
  };

  // Print a receipt by rendering it into a fresh standalone window. This replaces
  // the in-modal @media-print trick, which the redesign broke: the modal overlay
  // (backdrop-filter) and the .pop-in card (transform: scale(1)) each become the
  // containing block for the position:fixed receipt, so it printed blank. A
  // standalone document has no such ancestors, so the full receipt always prints.
  const printReceipt = (receipt) => {
    if (!receipt) return;
    // A legal document is the provider's PDF, in her account, under her number. We never
    // print our own layout as if it were one.
    if (receipt.legal_status === "issued" && receipt.legal_doc_url) { window.open(receipt.legal_doc_url, "_blank", "noopener"); return; }
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const rows = [
      ["לקוחה", esc(receipt.client_name || "לקוחה")],
      ["תאריך", esc(fmtDateHe(localDayKey(receipt.created_at)))],
      ["שירות", esc(receipt.service || "")],
      ["אמצעי תשלום", esc(receiptMethodLabel(receipt))],
    ];
    if (isSplit(receipt)) for (const ln of paymentsOf(receipt)) rows.push(["· " + esc(ln.method), "₪" + esc(ln.amount)]);
    if (Number(receipt.discount) > 0) rows.push(["הנחה" + (receipt.discount_pct ? ` (${esc(receipt.discount_pct)}%)` : ""), "−₪" + esc(receipt.discount)]);
    if (Number(receipt.tip) > 0) rows.push(["טיפ", "₪" + esc(receipt.tip)]);
    // Voucher codes as LTR isolates that never wrap, as on the screen (lib/giftVouchers.ts splitVoucherCodes).
    if (receipt.note) rows.push(["הערה", splitVoucherCodes(receipt.note).map((seg) => seg.code ? `<bdi dir="ltr" style="white-space:nowrap">${esc(seg.text)}</bdi>` : esc(seg.text)).join("")]);
    const vd = voidOf(receipt, receiptVoids);
    if (vd) rows.push(["מבוטלת", esc(vd.reason || "") + " · " + esc(localDayKey(vd.created_at))]);
    const rowsHtml = rows.map(([k, v]) => `<div class="row"><span class="k">${k}:</span><span class="v">${v}</span></div>`).join("");
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(docLabelHe(receipt))}</title>
<style>
  @page{size:A4;margin:18mm}
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{width:100%}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#2A2233;direction:rtl;font-size:16px}
  .wrap{max-width:700px;margin:0 auto;padding:24px 8px}
  .head{text-align:center;border-bottom:2px dashed #E3DBEC;padding-bottom:22px;margin-bottom:22px}
  .biz{font-size:34px;font-weight:700;letter-spacing:-0.01em}
  .sub{font-size:15px;color:#9A93A4;margin-top:4px}
  .body{font-size:19px;line-height:2.1}
  .row{display:flex;justify-content:space-between;gap:16px}
  .k{color:#9A93A4}
  .v{font-weight:600}
  .total{border-top:2px dashed #E3DBEC;margin-top:22px;padding-top:22px;display:flex;justify-content:space-between;align-items:center}
  .total .lbl{font-size:22px;font-weight:600;color:#5B5563}
  .total .amt{font-size:44px;font-weight:700;color:${esc(herAccent)}}
  .foot{text-align:center;font-size:14px;color:#9A93A4;margin-top:24px}
</style></head>
<body onload="window.print()">
  <div class="wrap">
    <div class="head">
      <div class="biz">${esc(settings.business_name || "העסק")}</div>
      <div class="sub">${esc(docLabelHe(receipt))}</div>
      ${settings.business_phone ? `<div class="sub">${esc(settings.business_phone)}</div>` : ""}
    </div>
    <div class="body">${rowsHtml}</div>
    <div class="total"><span class="lbl">סה״כ:</span><span class="amt">₪${esc(receipt.amount)}</span></div>
    <div class="foot">תודה ונתראה בקרוב ✦</div>
    <div class="foot">אישור תשלום בלבד. אינו קבלה או חשבונית מס.</div>
  </div>
  <script>window.onafterprint=function(){window.close()}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) { toast(tr("החלון נחסם, אפשרי חלונות קופצים ונסי שוב"), "error"); return; }
    w.document.write(html);
    w.document.close();
  };

  // Manual appointment reminder text — identical to the automatic cron reminder
  // and the /api/send-reminder-manual server message, incl. confirm/cancel links.
  // Used for the zero-dependency wa.me fallback.
  // Async now: the confirm/cancel links have to be signed server-side. Both
  // callers already await a fetch before opening WhatsApp, so this adds no new
  // popup-blocker exposure. Returns null when the links cannot be minted, so a
  // reminder is never sent carrying links that would be rejected.
  const reminderText = async (appt) => {
    const businessName = settings.business_name || "העסק";
    const brandJson = settings.branding && typeof settings.branding === "object" ? settings.branding : {};
    const address = (brandJson.public_address || brandJson.address || "").trim();
    const arrivalNote = (brandJson.arrival_note || "").trim();
    const links = await fetchConfirmLinks(appt.id);
    if (!links) return null;
    const confirmLink = links.confirmUrl;
    const cancelLink = links.cancelUrl;
    return msgLines(
      msgGreet(appt.name),
      `תזכורת לתור שלך ב${businessName}${dayWordFor(appt.date)}.`,
      "",
      appt.service,
      `${msgHebrewDate(appt.date)}, ${fmtApptTime(appt)}`,
      address ? "" : null,
      address ? `📍 ${address}` : null,
      address ? msgMapsLink(address) : null,
      arrivalNote ? "" : null,
      arrivalNote || null,
      "",
      `לאישור: ${confirmLink}`,
      msgMoveLine(links.rescheduleUrl, brandJson),
      `אם צריך לבטל, אפשר כאן: ${cancelLink}`
    );
  };

  // Send a one-off reminder for a specific appointment through the server
  // route (the platform number, same as the nightly cron). If the send fails,
  // fall back to opening WhatsApp with the message pre-filled (wa.me) so the
  // reminder still goes out from her own phone.
  const sendReminderToClient = async (appt) => {
    if (guardWrite()) return;
    if (!appt || isBusy("sendReminder")) return;
    const cl = clients.find(c => String(c.id) === String(appt.client_id));
    const phone = (cl?.phone || appt.client_phone || "").trim();
    if (!phone) { toast(tr("ללקוחה אין מספר טלפון"), "error"); return; }
    setBusyKey("sendReminder", true);
    try {
      const res = await fetch("/api/send-reminder-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: settings.tenant_id, appointmentId: appt.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && !data.queued) { toast(tr("התזכורת הועברה לשליחה ✦")); return; }
      if (res.ok && data.queued && data.waLink) {
        // Manual mode (or the central number fell back): this is still
        // success, just not automatic - the honest copy says so, and opens
        // the one tap that replaces it, with the exact message already
        // composed server-side.
        toast(tr("מוכן לשליחה, נפתח וואטסאפ"));
        openQueuedWa(data.waLink, data.messageId);
        return;
      }
      // A real failure (e.g. an unusable phone) - fall back to building the
      // link client-side so the send still has a path.
      toast(tr("לא הצלחנו להכין שליחה אוטומטית, נפתחת שליחה ידנית"), "error");
      const text = await reminderText(appt);
      const link = text && waMsg(phone, text);
      if (link) window.open(link, "_blank", "noopener");
    } catch {
      toast(tr("לא הצלחנו להכין שליחה אוטומטית, נפתחת שליחה ידנית"), "error");
      const text = await reminderText(appt);
      const link = text && waMsg(phone, text);
      if (link) window.open(link, "_blank", "noopener");
    } finally {
      setBusyKey("sendReminder", false);
    }
  };

  // Plain-text receipt summary for the zero-dependency wa.me fallback — opens
  // WhatsApp with the message pre-filled, so the receipt can be shared even when
  // GreenAPI isn't connected. Mirrors the server message in /api/send-receipt.
  const receiptShareText = (receipt) => {
    const businessName = settings.business_name || "העסק";
    return `שלום ${receipt.client_name || "לקוחה"}! ✦\n` +
      `${docLabelHe(receipt)} מ${businessName}\n\n` +
      `💰 סכום: ₪${receipt.amount}\n` +
      `💳 אמצעי תשלום: ${receiptMethodLabel(receipt, "מזומן")}\n` +
      `📅 תאריך: ${fmtDateHe(localDayKey(receipt.created_at))}\n\n` +
      (receipt.legal_status === "issued" && receipt.legal_doc_url ? `🧾 המסמך: ${receipt.legal_doc_url}\n\n` : `(אישור תשלום, לא מסמך מס)\n\n`) +
      `תודה ונתראה בקרוב! 😊`;
  };

  // call_client: find the client by name; the call itself just opens tel:.
  const prepareCall = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr(tr("לא זוהה שם לקוחה לחיוג. נסי שוב.")); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = clients.filter(c => (c.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = clients.filter(c => (c.name||"").toLowerCase().includes(low));
    if (matches.length === 0) { setVoiceErr(tr("לא מצאתי לקוחה בשם {0}", [nameSpoken])); setVoiceStatus("error"); return; }
    setVoiceCall({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("call");
  };

  // cancel_appointment: find matching appointments (by name, then date) — nothing
  // is deleted here; deletion happens only on explicit confirm.
  const prepareCancel = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr(tr("לא זוהה שם לקוחה לביטול. נסי שוב.")); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = appointments.filter(a => (a.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = appointments.filter(a => (a.name||"").toLowerCase().includes(low));
    if (intent.date) matches = matches.filter(a => a.date === intent.date);
    if (matches.length === 0) { setVoiceErr(tr("לא מצאתי תור תואם ל{0}", [nameSpoken])); setVoiceStatus("error"); return; }
    matches = [...matches].sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || ((startMinute(a)??0)-(startMinute(b)??0)));
    setVoiceCancel({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("cancel");
  };

  // Delete the selected appointment — ONLY on explicit confirm (same as handleDelete).
  const handleVoiceCancel = async () => {
    if (guardWrite()) return;
    const appt = voiceCancel?.selected;
    if (!appt) return;
    if (isBusy("voiceCancel")) return;
    setBusyKey("voiceCancel", true);
    try {
      // Soft cancel, same as handleDelete - this used to DELETE the row, so a
      // voice cancellation destroyed the appointment outright.
      const { data, error } = await softCancelAppointment(appt);
      if (error) { handleDbError(error, "cancel appointment (voice)"); return; }
      const updated = (data && data[0]) || { ...appt, confirmation_status: "cancelled" };
      setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
      closeVoice();
      toast(tr("התור בוטל"));
    } finally {
      setBusyKey("voiceCancel", false);
    }
  };

  // Build an editable booking draft from the intent (matching against the
  // tenant's own clients/services already in state). Nothing is created here.
  const prepareBooking = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const svcSpoken = (intent.service || "").trim();
    let svc = null;
    if (svcSpoken) {
      const low = svcSpoken.toLowerCase();
      svc = activeServices.find(s => (s.name||"").toLowerCase() === low)
         || activeServices.find(s => (s.name||"").toLowerCase().includes(low) || low.includes((s.name||"").toLowerCase()));
    }
    setVoiceBooking({
      clientName: matched ? matched.name : nameSpoken,
      service: svc ? svc.name : "",
      date: intent.date || today,
      time: intent.time || "",
    });
    setVoiceStatus("confirm");
  };

  // Create the appointment (and the client, if new) — ONLY on explicit confirm.
  // Mirrors the regular booking flow (same table, tenant_id filled by DB default).
  const handleVoiceBook = async () => {
    if (guardWrite()) return;
    const b = voiceBooking;
    if (!b) return;
    if (!b.clientName.trim()) { toast(tr("חסר שם לקוחה"), "error"); return; }
    if (!b.service) { toast(tr("איזה שירות? אפשר לבחור"), "error"); return; }
    if (!b.date || !b.time) { toast(tr("חסרים תאריך ושעה, אפשר לבחור"), "error"); return; }
    const svc = activeServices.find(s => s.name === b.service);
    // Real minutes. This used to take Number(time.split(":")[0]) and store that
    // as a whole hour, so "קבעי לרונית ב-שתיים וחצי" silently booked 14:00 -
    // the one write path the minutes migration missed. toMinutes rejects
    // anything unparseable rather than falling through to 0, so a malformed
    // time still never books silently at 00:00.
    const startMin = toMinutes(b.time);
    if (startMin === null) { toast(tr("שעה לא תקינה"), "error"); return; }
    const duration = svc?.duration || 60;
    // Guard against double-booking, mirroring handleSave: reject if the new
    // [start,end) overlaps any non-cancelled appointment on that date.
    {
      // Buffers included (lib/serviceBuffer.ts), same test as handleSave.
      const newStart = startMin, newEnd = newStart + duration + newApptBufferFor(svc?.name);
      const clash = appointments.some(a=>{
        if(a.date!==b.date || a.confirmation_status==="cancelled") return false;
        const bs=startMinute(a), rawEnd=endMinute(a); if(bs===null||rawEnd===null) return false;
        return newStart<rawEnd+apptBufferOf(a) && bs<newEnd;
      });
      if(clash){ toast(tr("השעה הזו כבר תפוסה"),"error"); return; }
    }
    if (isBusy("voiceBook")) return;
    setBusyKey("voiceBook", true);
    try {
      // Stamp the resolved tenant on both inserts so they satisfy the RLS
      // WITH CHECK even if the table column default isn't applied (mirrors the
      // regular booking flow). Omit the field if the tenant can't be resolved,
      // so we never regress below the DB default behavior.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      // Resolve client: reuse an exact-name match, otherwise create a new one.
      let clientId = null;
      const low = b.clientName.trim().toLowerCase();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === low);
      if (existing) {
        clientId = existing.id;
      } else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:b.clientName.trim(),phone:"",skinType:"",notes:"",status:"active",...tenantField}]).select();
        if (ce) { handleDbError(ce, "create client (voice)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const appt = {
        date: b.date,
        // Both columns, exactly as every other write path does it.
        ...startFields(startMin),
        name: b.clientName.trim(),
        service: b.service,
        duration: duration,
        color: svc?.color || "var(--warning)",
        client_id: clientId,
        note: "",
        price: svc?.price || 0,
        confirmation_status: "pending",
        confirmation_sent: false,
        ...tenantField,
        // The buffer the clash check above used (lib/apptBuffer.ts).
        ...apptBufferField(newApptBufferFor(svc?.name)),
      };
      const {data,error} = await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
      if (error) { handleDbError(error, "create appointment (voice)"); return; }
      if (data) setAppointments(prev=>[...prev, data[0]]);
      closeVoice();
      toast(tr("התור נקבע ✦"));
    } finally {
      setBusyKey("voiceBook", false);
    }
  };

  const startVoice = () => {
    const SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceIntent(null); setVoiceTranscript(""); setVoiceErr("");
    setShowVoice(true);
    if (!SR) { setVoiceStatus("unsupported"); return; }
    setVoiceStatus("listening");
    const rec = new SR();
    rec.lang = speechLangOf(getActiveLang()); // her language (lib/i18n): he-IL, ar-IL or en-US
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
      setVoiceTranscript(t);
      if (t) processVoice(t);
    };
    rec.onerror = (e) => {
      // "service-not-allowed" is what an iPhone answers when Dictation is switched off in the phone's own settings, not a browser permission.
      setVoiceErr(e.error === "service-not-allowed"
        ? tr("ההכתבה כבויה בטלפון. אפשר להפעיל אותה בהגדרות הטלפון ← כללי ← מקלדת ← הפעלת הכתבה, או להקליד את הבקשה.")
        : e.error === "not-allowed"
          ? tr("אין הרשאת מיקרופון. אפשרי גישה בדפדפן ונסי שוב.")
          : tr("שגיאה בהאזנה. נסי שוב."));
      setVoiceStatus("error");
    };
    // If listening ended with no result, surface a gentle retry state.
    rec.onend = () => { setVoiceStatus(s => s === "listening" ? "error" : s); };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setVoiceStatus("error"); setVoiceErr(tr("המיקרופון לא נפתח, אפשר לבדוק שהדפדפן קיבל אישור")); }
  };/* @section-end */
  return { closeVoice, handleVoiceBook, handleVoiceCancel, handleVoiceReceipt, printReceipt, receiptShareText,
    sendReceiptToClient, sendReminderToClient, startVoice };
}

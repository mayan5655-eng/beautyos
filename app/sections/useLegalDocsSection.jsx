"use client";
// app/sections/useLegalDocsSection.jsx — part of the owner's app: 241 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: sendReceiptToClient is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import Spinner from "../Spinner";
import { rewardGivenOn } from "@/lib/loyalty";
import { voidedIds } from "@/lib/till";
import { docLabelHe, needsLegalDoc } from "@/lib/legalReceipts/policy";
import { VOID_REFUND_HE } from "@/lib/grow/voidRefund";
import { REFUND_STATE_HE, REFUND_STUCK_HE, stateFromVoidRefundAnswer } from "@/lib/grow/refundFollowups";
import { paidByVoucher } from "@/lib/giftVouchers";
import { tr, trv } from "@/lib/i18n/tr";

export function useLegalDocsSection(ctx) {
  const {
    askConfirm, growRefundStates, guardWrite, handleDbError, isBusy, legalAccount, loyaltyCfg, loyaltyDb,
    productsApi, receipts, receiptVoids, runOnce, setBusyKey, setGrowRefundStates, setReceipts, setReceiptVoids,
    setShowReceipt, settings, setVoidOpen, setVoidReason, toast, voidGrowRefund, voidReason, late,
  } = ctx;
  const sendReceiptToClient = (...args) => late.sendReceiptToClient(...args);
  /* @section-body */const isVoidComplete = (r) => !!r && voidedIds(receiptVoids).has(String(r.id));

  // Ask her provider to issue the legal document for a payment. The payment is ALREADY
  // recorded: this never blocks or undoes it, and any failure leaves a visible state.
  // Returns the server's answer, or null when there is nothing to do.
  const applyReceiptPatch = (id, patch) => {
    setReceipts(prev => prev.map(r => String(r.id) === String(id) ? { ...r, ...patch } : r));
    setShowReceipt(prev => prev && String(prev.id) === String(id) ? { ...prev, ...patch } : prev);
  };
  const issueLegalDocument = async (rec, { confirmUnknown = false } = {}) => {
    if (!legalAccount?.connected || !rec?.id || !needsLegalDoc(rec)) return null;
    applyReceiptPatch(rec.id, { legal_status: "pending" });
    try {
      const res = await fetch("/api/legal-receipts/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: rec.id, confirmUnknown }) });
      const d = await res.json().catch(() => null);
      if (!d) throw new Error("no answer");
      if (d.receipt) applyReceiptPatch(rec.id, d.receipt);
      else applyReceiptPatch(rec.id, { legal_status: d.status && d.status !== "none" ? d.status : (rec.legal_status || "none") });
      if (d.status === "issued" && !d.already) toast(docLabelHe({ legal_status: "issued", legal_doc_type: d.receipt?.legal_doc_type }) + (d.number ? " מספר " + d.number : "") + " הונפקה ✦");
      else if (d.error) toast(d.error + " התשלום נשמר.", "error");
      else if (d.skipped === "migration_missing") { console.error("[legal receipt] migration missing: add_legal_receipts.sql"); toast(tr("הנפקת מסמכי מס עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); }
      return d;
    } catch {
      // The browser did not hear back, but the server may have called the provider. Say so; the record shows the truth on reload.
      toast(tr("לא קיבלנו תשובה. התשלום נשמר; מצב המסמך יתעדכן בעוד רגע."), "error");
      return null;
    }
  };
  const retryLegal = (rec) => {
    if (isBusy("legalIssue")) return;
    const go = async (confirmUnknown) => {
      setBusyKey("legalIssue", true);
      try { await issueLegalDocument(rec, { confirmUnknown }); } finally { setBusyKey("legalIssue", false); }
    };
    if (rec.legal_status === "unknown") {
      askConfirm({
        title: tr("לבדוק לפני שמנסים שוב"),
        message: tr("לא בטוחות אם המסמך הונפק. פתחי את חשבון מורנינג ובדקי שאין שם מסמך לתשלום הזה. אם אין, אפשר לנסות שוב. אם יש, אל תנסי שוב, כדי שלא יונפקו שני מסמכים."),
        confirmText: tr("בדקתי, אין מסמך"),
        onConfirm: () => go(true),
      });
      return;
    }
    go(false);
  };
  // The credit document for a void of a payment that has a provider document.
  const requestCredit = async (vd, { confirmUnknown = false } = {}) => {
    try {
      const res = await fetch("/api/legal-receipts/credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voidId: vd.id, confirmUnknown }) });
      const d = await res.json().catch(() => null);
      if (!d) throw new Error("no answer");
      if (d.void) setReceiptVoids(prev => prev.map(v => String(v.id) === String(vd.id) ? { ...v, ...d.void } : v));
      return d;
    } catch { return null; }
  };
  const retryCredit = (vd) => {
    if (isBusy("legalCredit")) return;
    const go = async (confirmUnknown) => {
      setBusyKey("legalCredit", true);
      try {
        const d = await requestCredit(vd, { confirmUnknown });
        if (d && d.status === "issued") toast(tr("מסמך הזיכוי הונפק ✦"));
        else toast((d && d.error) || tr("לא הצלחנו להנפיק את מסמך הזיכוי. התשלום ממשיך להיספר."), "error");
      } finally { setBusyKey("legalCredit", false); }
    };
    if (vd.credit_status === "unknown") {
      askConfirm({
        title: tr("לבדוק לפני שמנסים שוב"),
        message: tr("לא בטוחות אם מסמך הזיכוי הונפק. בדקי בחשבון מורנינג שאין שם מסמך זיכוי לתשלום הזה. אם אין, אפשר לנסות שוב."),
        confirmText: tr("בדקתי, אין מסמך"),
        onConfirm: () => go(true),
      });
      return;
    }
    go(false);
  };
  // What follows a recorded payment. With a connected account the legal document comes FIRST
  // (in the background) so the message to the client can carry its link; without one, exactly as before.
  const afterPaymentRecorded = (rec, { autoSend }) => {
    (async () => {
      let cur = rec;
      const d = await issueLegalDocument(rec);
      if (d && d.receipt) cur = { ...rec, ...d.receipt };
      if (autoSend) {
        const ok = await sendReceiptToClient(cur, { silent: true }).catch(() => false);
        if (!ok) toast(tr("התשלום נרשם, אבל השליחה האוטומטית נכשלה. אפשר לשלוח ידנית מהאישור"), "error");
      }
    })();
  };

  // The voided Grow sales she can see (newest first, at most 100): their refund state is asked for whenever this set changes.
  const growVoidedKey = useMemo(() => {
    const v = voidedIds(receiptVoids);
    return receipts.filter(r => r.legal_provider === "grow" && v.has(String(r.id)))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 100).map(r => String(r.id)).join(",");
  }, [receipts, receiptVoids]);
  // When a refund POST last answered for each receipt: a history GET that started before it never overwrites that newer answer.
  const growRefundAnsweredAt = useRef({});
  const loadGrowRefundStates = useCallback(async (key) => {
    if (!key) { setGrowRefundStates({}); return; }
    const startedAt = Date.now();
    try {
      const res = await fetch(`/api/grow/void-refund?ids=${encodeURIComponent(key)}`);
      const j = await res.json().catch(() => null);
      if (j && j.states && !j.hidden) {
        const fresh = Object.fromEntries(Object.entries(j.states).filter(([id]) => !((growRefundAnsweredAt.current[id] || 0) >= startedAt)));
        setGrowRefundStates(prev => ({ ...prev, ...fresh }));
      }
    } catch { /* the history shows no refund line rather than a wrong one */ }
  }, []);
  useEffect(() => { loadGrowRefundStates(growVoidedKey); }, [growVoidedKey, loadGrowRefundStates]);
  // The answer of POST /api/grow/void-refund, applied to the till: the receipt's note line and the refund state shown in the history.
  const applyGrowRefundAnswer = (receiptId, answer) => {
    growRefundAnsweredAt.current[String(receiptId)] = Date.now();
    if (answer && answer.note) {
      const note = answer.note;
      setReceipts(prev => prev.map(r => String(r.id) === String(receiptId) ? { ...r, note } : r));
      setShowReceipt(prev => prev && String(prev.id) === String(receiptId) ? { ...prev, note } : prev);
    }
    setGrowRefundStates(prev => ({ ...prev, [String(receiptId)]: stateFromVoidRefundAnswer(answer) }));
  };
  // The refund line of a voided Grow sale (the till history row and the receipt). Nothing for any other receipt.
  const growRefundLine = (r, where) => {
    const st = r && r.legal_provider === "grow" ? growRefundStates[String(r.id)] : null;
    if (!st || !REFUND_STATE_HE[st.state]) return null;
    const color = st.state === "refunded" ? "var(--success)" : st.state === "failed" ? "var(--danger)" : st.state === "in_progress" ? "var(--warning)" : "var(--ink-3)";
    return (
 <div data-testid="grow-refund-state" data-state={st.state} style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:where==="row"?3:8}}>
 <span style={{fontSize:"var(--t-xs)",fontWeight:700,color,lineHeight:1.5}}>{trv(REFUND_STATE_HE[st.state])}{st.state==="in_progress"&&st.stuck?`. ${REFUND_STUCK_HE}`:""}</span>
        {st.state==="failed"&&st.canRetry&&<button data-testid="grow-refund-retry" onClick={e=>{e.stopPropagation();retryGrowRefund(r);}} disabled={isBusy("growRefundRetry")} className="primary-btn" style={{padding:"6px 12px",minHeight:36,fontSize:"var(--t-xs)",background:"var(--surface)",color:"var(--danger)",border:"1px solid var(--danger)"}}>{isBusy("growRefundRetry")?<Spinner inline label={tr("מנסה")}/>:tr("לנסות שוב להחזיר ב-Grow")}</button>}
 </div>
    );
  };
  // "לנסות שוב" on a failed refund: the same route and the same once-per-payment claim, so a retry can never refund twice.
  const retryGrowRefund = async (receipt) => {
    if (!receipt || guardWrite()) return;
    await runOnce("growRefundRetry", async () => {
      setBusyKey("growRefundRetry", true);
      let answer = null;
      try {
        const res = await fetch("/api/grow/void-refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: receipt.id }) });
        answer = await res.json().catch(() => null);
      } catch { answer = null; }
      finally { setBusyKey("growRefundRetry", false); }
      // As on the void itself: "hidden" is a known no-send; a lost answer may hide a done refund, so "check Grow first".
      if (answer && answer.hidden) answer = { ...answer, refunded: false, status: "failed", message: VOID_REFUND_HE.failed("") };
      else if (!answer || !answer.message) answer = { refunded: false, status: "unknown", message: VOID_REFUND_HE.unknown };
      applyGrowRefundAnswer(receipt.id, answer);
      if (answer.refunded || answer.status === "already_refunded") toast(answer.message);
      else toast(answer.message, "error");
    });
  };

  // Void: a row in receipt_voids naming the receipt and why. The receipt row
  // is not touched. The reason is required by the schema as well as the form.
  const growVoidOk = useRef(false);
  const handleVoidReceipt = async (receipt) => {
    if (guardWrite()) return;
    if (!receipt || !voidReason.trim()) { toast(tr("כתבי בקצרה למה מבטלים, זה נשמר ברישום"), "error"); return; }
    // A card payment taken through Grow is not undone by a void alone: the charge and Grow's own document stay.
    // With the refund unticked, say so first, so the books and the bank do not quietly disagree.
    // With the refund ticked (the default) the void sheet already says the money goes back, so there is nothing to confirm.
    const paidByGrow = receipt.legal_provider === "grow";
    const refundAtGrow = paidByGrow && voidGrowRefund;
    if (paidByGrow && !refundAtGrow && !growVoidOk.current) {
      askConfirm({
        title: tr("התשלום נגבה דרך Grow"),
        message: tr("ביטול כאן לא מחזיר את הכסף ללקוחה ולא מבטל את המסמך של Grow. את הזיכוי עושים בחשבון Grow. לבטל רק ברישום שלך?"),
        confirmText: tr("לבטל ברישום שלי"),
        onConfirm: () => { growVoidOk.current = true; Promise.resolve(handleVoidReceipt(receipt)).finally(() => { growVoidOk.current = false; }); },
      });
      return;
    }
    if (isBusy("voidReceipt")) return;
    setBusyKey("voidReceipt", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      // A payment that HAS a provider document is only truly cancelled by a credit document.
      // The request is recorded now, so it survives a dropped connection; the server turns it into the document.
      const legal = receipt.legal_status === "issued" && !!receipt.legal_doc_id;
      const { data, error } = await supabase.from("receipt_voids").insert([{
        receipt_id: receipt.id,
        reason: voidReason.trim(),
        ...(legal ? { credit_status: "pending_request" } : {}),
        ...(tid ? { tenant_id: tid } : {}),
      }]).select();
      if (error) {
        // 42P01: the table is not there yet. Say so rather than "error".
        if (error.code === "42P01" || /receipt_voids/.test(String(error.message||""))) {
          console.error("[voidReceipt] migration missing: add_till_and_calendar_small_things.sql", error);
          toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error");
          return;
        }
        if (error.code === "23505") { toast(tr("התשלום כבר מבוטל"), "error"); return; }
        handleDbError(error, "void receipt"); return;
      }
      if (data && data[0]) setReceiptVoids(prev => [...prev, data[0]]);
      // Products on the voided receipt go back to stock, once (the database refuses a second time).
      if (data && data[0]) productsApi.afterVoid(receipt);
      // A gift voucher that paid this sale gets its amount back (app/api/vouchers reverse_receipt). It stayed spent before.
      let voucherBack = 0;
      if (data && data[0] && paidByVoucher(receipt)) {
        try {
          const vr = await fetch("/api/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse_receipt", receiptId: receipt.id }) }).then((r) => r.json()).catch(() => null);
          if (vr && vr.returned > 0) voucherBack = vr.returned;
          else if (!vr || vr.success === false) toast(tr("התשלום בוטל, אבל הסכום עוד לא חזר לשובר. אפשר לנסות שוב ממסך שוברי המתנה, או לכתוב לנו."), "error");
        } catch { /* the void itself stands; the message above covers a refusal */ }
      }
      // The void is saved and stands whatever Grow answers. Only now is the refund asked for (app/api/grow/void-refund).
      let growRefund = null;
      if (refundAtGrow && data && data[0]) {
        try {
          const res = await fetch("/api/grow/void-refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: receipt.id }) });
          growRefund = await res.json().catch(() => null);
        } catch { growRefund = null; }
        // "hidden" (Grow off): a known no-send, the route wrote "not done" and alerted. A lost answer may hide a done refund: "check Grow first".
        if (growRefund && growRefund.hidden) growRefund = { ...growRefund, refunded: false, status: "failed", message: VOID_REFUND_HE.failed("") };
        else if (!growRefund || !growRefund.message) growRefund = { refunded: false, status: "unknown", message: VOID_REFUND_HE.unknown };
        applyGrowRefundAnswer(receipt.id, growRefund);
      }
      setVoidOpen(false); setVoidReason("");
      // A loyalty reward given on this sale comes back to her client's card by itself (lib/loyalty.js loyaltyState drops a
      // voided receipt's redemption). Said out loud, so she does not think the gift is gone or re-add the stamps by hand.
      const rewardBack = loyaltyCfg.enabled && rewardGivenOn(receipt, loyaltyDb.redemptions) ? ". המתנה חזרה לכרטיסיית הנאמנות של הלקוחה" : "";
      if (growRefund) {
        // A Grow payment's document is Grow's own (no legal_doc_id), so this is normally false; kept so a credit request is never skipped.
        if (legal && data && data[0]) await requestCredit(data[0]);
        // Refused or unanswered: an error toast, which stays until she taps it, sending her to Grow's dashboard.
        const extra = (voucherBack > 0 ? ` ₪${voucherBack} חזרו לשובר המתנה.` : "") + (rewardBack ? ` ${rewardBack.replace(/^\.\s*/, "")}.` : "");
        if (growRefund.refunded || growRefund.status === "already_refunded") toast(growRefund.message + extra);
        else toast(growRefund.message, "error");
      } else if (legal && data && data[0]) {
        const d = await requestCredit(data[0]);
        if (d && d.status === "issued") toast("מסמך זיכוי מספר " + (d.number || "") + " הונפק, והתשלום ירד מהסיכומים" + rewardBack + " ✦");
        else toast(((d && d.error) || "מסמך הזיכוי עוד לא הונפק") + " התשלום ממשיך להיספר עד שהוא יונפק.", "error");
      } else {
        toast("התשלום בוטל, המקור נשמר, והסכום ירד מהסיכומים" + (voucherBack > 0 ? `. ₪${voucherBack} חזרו לשובר המתנה` : "") + rewardBack);
      }
    } finally { setBusyKey("voidReceipt", false); }
  };/* @section-end */
  return { afterPaymentRecorded, growRefundLine, handleVoidReceipt, isVoidComplete, retryCredit, retryLegal };
}

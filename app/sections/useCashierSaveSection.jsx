"use client";
// app/sections/useCashierSaveSection.jsx — part of the owner's app: 212 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: writePackageEntry is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect } from "react";
import { supabase } from "../supabase";
import { isMissingColumnError } from "@/lib/pgError";
import { rewardAtTill, isMissingLoyaltyTable, rewardIsStale } from "@/lib/loyalty";
import { validateSplit, SPLIT_METHOD } from "@/lib/till";
import { needsLegalDoc } from "@/lib/legalReceipts/policy";
import { couldNotHe } from "@/lib/errorCopy";
import { MEMBERSHIP_PAYMENT } from "@/lib/membershipFlag";
import { voucherRedeemNote, voucherOverUsed, VOUCHER_OVER_USED_HE } from "@/lib/giftVouchers";
import { tr } from "@/lib/i18n/tr";

export function useCashierSaveSection(ctx) {
  const {
    afterPaymentRecorded, appointments, askConfirm, cashierAppt, cashierClient, cashierDiscount,
    cashierDiscountIls, cashierDiscountMode, cashierItems, cashierLoyalty, cashierNote, cashierPackage,
    cashierTip, cashierTotal, drawFromPackage, dupPayOk, growCreditUsed, growDepositUsed, guardWrite,
    handleDbError, isBusy, legalAccount, liveRcpts, loadLoyaltyRows, loyaltyApplied, loyaltyCfg, loyaltyDb,
    loyaltyRewardLive, membershipAdj, PACKAGE_PAYMENT, paymentMethod, productsApi, receipts, setBusyKey,
    setCashierAppt, setCashierClient, setCashierDiscount, setCashierDiscountMode, setCashierItems,
    setCashierNote, setCashierSearch, setCashierTip, setConsentAskFor, setGrowAdj, setLoyaltyAfterFor,
    setLoyaltyApplied, setLoyaltyDb, setMembershipAdj, setRebookDone, setRebookPick, setRebookPickOpen,
    setRebookWeeks, setReceipts, setShowCashier, setShowReceipt, setSplitOn, settings, setVoucherAdj, splitOn,
    splitResolved, taxStatusUnconfirmed, toast, today, voucherAdj, voucherDue, voucherUsed, late,
  } = ctx;
  const writePackageEntry = (...args) => late.writePackageEntry(...args);
  /* @section-body */const addLoyaltyRow = (key, row) => {
    if (loyaltyDb.ready === true) setLoyaltyDb((prev) => (prev.ready === true ? { ...prev, [key]: [...prev[key], row] } : prev));
    else loadLoyaltyRows();
  };
  const recordLoyaltyRedemption = async (clientId, receiptId, { quiet = false, stampsUsed = null } = {}) => {
    if (!clientId) return false;
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    // stamps_used: what this reward took when it was given, so a later change of "every" never rewrites it (lib/loyalty.js).
    const used = Number(stampsUsed) || loyaltyCfg.every;
    const { data, error } = await supabase.from("loyalty_redemptions").insert([{
      client_id: clientId, receipt_id: receiptId || null, reward: loyaltyCfg.reward, every: used, stamps_used: used, ...(tid ? { tenant_id: tid } : {}),
    }]).select();
    if (error) {
      // This receipt's reward is already recorded: a Grow payment's row is written by the server before the till sees the receipt
      // (lib/grow/service.ts), so this browser write is a harmless duplicate. The ledger is read again to show the server's row.
      if (error.code === "23505") { if (loyaltyDb.ready === true) loadLoyaltyRows(); return true; }
      if (isMissingLoyaltyTable(error)) {
        console.error("[loyalty] migration missing: add_loyalty_2026-11-05.sql", error);
        if (!quiet) toast(tr("התשלום נרשם, אבל המתנה לא סומנה בכרטיסייה: חסר עדכון קטן במערכת. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל."), "error");
        return false;
      }
      console.error("[loyalty] redemption write failed", error);
      if (!quiet) toast(tr("התשלום נרשם, אבל המתנה לא סומנה בכרטיסייה. בדקי בכרטיס הלקוחה לפני שנותנים אותה שוב."), "error");
      return false;
    }
    if (data && data[0]) addLoyaltyRow("redemptions", data[0]);
    return true;
  };
  const writeLoyaltyAdjustment = async (clientId, delta, reason) => {
    if (guardWrite()) return false;
    if (isBusy("loyaltyAdjust")) return false;
    setBusyKey("loyaltyAdjust", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const { data, error } = await supabase.from("loyalty_adjustments").insert([{ client_id: clientId, delta, reason, ...(tid ? { tenant_id: tid } : {}) }]).select();
      if (error) {
        if (isMissingLoyaltyTable(error)) {
          console.error("[loyalty] migration missing: add_loyalty_2026-11-05.sql", error);
          setLoyaltyDb((prev) => ({ ...prev, ready: false }));
          toast(tr("התיקון הידני עדיין לא זמין אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותו."), "error");
          return false;
        }
        handleDbError(error, "loyalty adjustment"); return false;
      }
      if (data && data[0]) addLoyaltyRow("adjustments", data[0]);
      toast(delta > 0 ? tr("נוסף ביקור לכרטיסייה ✦") : tr("הורד ביקור מהכרטיסייה"));
      return true;
    } finally { setBusyKey("loyaltyAdjust", false); }
  };
  // One tap at the till: the reward goes onto this visit (a discount, or nothing for a present), and the receipt carries the mark.
  // Taking the reward off: the discount it set is reverted, the mark is dropped (it rides on loyaltyApplied), the state is reset.
  const clearLoyaltyReward = () => {
    if (loyaltyApplied?.mode) { setCashierDiscountMode("ils"); setCashierDiscount(0); }
    setLoyaltyApplied(null);
  };
  const applyLoyaltyReward = () => {
    if (loyaltyApplied) { clearLoyaltyReward(); return; }
    if (!cashierClient?.id || !cashierLoyalty?.ready) return;
    const r = rewardAtTill(loyaltyCfg, cashierItems);
    if (r.needsItem) { toast(loyaltyCfg.services.length ? tr("הוסיפי קודם את הטיפול שהמתנה עליו") : tr("הוסיפי קודם טיפול לקופה"), "error"); return; }
    if (r.mode) { setCashierDiscountMode(r.mode); setCashierDiscount(r.discount); }
    setLoyaltyApplied({ ...r, clientId: String(cashierClient.id) });
  };
  // The till's client changed (picked another, or the search was cleared) after a reward was applied: that reward was the first
  // client's, so it comes off here, discount and mark both. The new client's own offer is recomputed by cashierLoyalty.
  useEffect(() => {
    if (rewardIsStale(loyaltyApplied, cashierClient?.id)) clearLoyaltyReward();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierClient?.id, loyaltyApplied]);

  const applyCashierAdjustments = async (receiptId, snap) => {
    const growMark = (url, body, what) => fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(async r=>{const j=await r.json().catch(()=>null); if(!r.ok||!j?.success) throw new Error(j?.error||"");})
      .catch(()=>toast(tr("אישור התשלום נשמר, אבל לא הצלחנו לסמן ש{0} נוצל. בדקי לפני שמנכים אותו שוב בתור הבא.", [what]),"error"));
    // A gift voucher used on this sale: its redemption names this receipt (once; the route refuses a second link).
    if (voucherAdj?.ledgerId && !voucherAdj.receiptId) {
      setVoucherAdj((v) => (v && v.ledgerId === voucherAdj.ledgerId ? { ...v, receiptId } : v));
      growMark("/api/vouchers", { action: "attach", ledgerId: voucherAdj.ledgerId, receiptId }, "השובר");
    }
    // Grow: the deposit was deducted once (and any part above this visit becomes client credit); credit that was ticked is marked used.
    if (snap.depositUsed > 0 && snap.appt?.id) growMark("/api/grow/deposit",{appointmentId:String(snap.appt.id),receiptId,used:snap.depositUsed},"המקדמה");
    if (snap.creditUsed > 0 && snap.client?.id) growMark("/api/grow/credit",{clientId:String(snap.client.id),amount:snap.creditUsed,receiptId},"הקרדיט");
    // The package draw, AFTER the receipt: a receipt with no deduction is one session she can draw by hand from the packages tab, and the
    // toast tells her to, by name. The appointment goes onto the entry, so the unique index refuses a second draw for the same visit.
    // The loyalty reward: the till's own receipt carries the 🎁 mark already (quiet: a missing table loses nothing there). A Grow
    // receipt is now marked AND recorded by the server when the link is paid (the reward travels with the charge, lib/grow/service.ts),
    // so this write meets the unique index on receipt_id and is the same redemption, once. It stays for a charge made before the
    // migration (no column to carry the reward): then it is the only record, and a failure is said out loud.
    if (snap.loyalty && snap.client?.id) recordLoyaltyRedemption(String(snap.client.id), receiptId, { quiet: !!snap.loyaltyMarked, stampsUsed: snap.loyaltyEvery });
    // A membership credit: used once for THIS receipt by the server (lib/memberships.ts redeemCredit; a retry of the same receipt uses nothing more).
    if (snap.membership && snap.client?.id) {
      fetch("/api/memberships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"redeem",membershipId:snap.membership.membershipId,clientId:String(snap.client.id),receiptId,service:snap.membership.service})})
        .then(async r=>{const j=await r.json().catch(()=>null); if(!r.ok||!j?.success) throw new Error(j?.error||""); toast(`נוכה טיפול מהמנוי ✦ ${j.label||""}`);})
        .catch((e)=>toast(`התשלום נרשם, אבל הטיפול לא נוכה מהמנוי${e?.message?`: ${e.message}`:""}. בדקי בכרטיס הלקוחה.`,"error"));
    }
    if (snap.pkg) {
      const fresh = await writePackageEntry(snap.pkg, -1, { appointmentId: snap.appt?.id || null, reason: "ניכוי בקופה" });
      if (!fresh) toast(tr("התשלום נרשם, אך הטיפול לא נוכה מהחבילה של {0}. נסי לפתוח את הקופה שוב ולנכות, או פני לתמיכה.", [snap.pkg.client_name]), "error");
    }
  };

  const handleSaveReceipt = async () => {
    if (guardWrite()) return;
    if(!cashierItems.length){toast(tr("הוסיפי לפחות פריט אחד כדי להמשיך"),"error");return;}
    // The voucher balance taken must equal what this receipt credits (Vercel review on PR #25): a till whose total dropped below the
    // amount already taken off the voucher is not saved until she gives the redemption back and applies it again.
    if (voucherOverUsed(voucherAdj, voucherDue)) { toast(VOUCHER_OVER_USED_HE, "error"); return; }
    // Paying the same visit twice (from the calendar after the home list, or after a Grow payment) doubled her income.
    if(cashierAppt && !dupPayOk.current && liveRcpts.some(r=>r.appointment_id && String(r.appointment_id)===String(cashierAppt.id))){
      askConfirm({
        title: tr("כבר יש תשלום לטיפול הזה"),
        message: tr("נרשם תשלום על הטיפול הזה. לרשום עוד אחד? זה יוסיף להכנסות."),
        confirmText: tr("לרשום עוד אחד"),
        onConfirm: () => { dupPayOk.current = true; handleSaveReceipt(); },
      });
      return;
    }
    if(isBusy("saveReceipt")) return;
    setBusyKey("saveReceipt", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      // A drawn session leaves a receipt for whatever is still owed, which is
      // usually nothing. A zero receipt is not clutter: it keeps the invariant
      // that every completed visit produces one, so history and per-visit
      // reporting stay whole - and since the money was collected at purchase,
      // revenue is untouched either way.
      const drewFromPackage = drawFromPackage && !!cashierPackage;
      const coveredByPackage = drewFromPackage && cashierTotal === 0;
      const coveredByMembership = !!membershipAdj && !coveredByPackage && cashierTotal === 0;
      // A split has to add up before anything is written. validateSplit is the
      // same arithmetic the tests prove; a rounding slip becomes a sentence
      // naming both numbers, not a receipt whose lines disagree with its total.
      const useSplit = splitOn && !coveredByPackage && !coveredByMembership && cashierTotal > 0;
      if (useSplit) {
        const v = validateSplit(splitResolved, cashierTotal);
        if (!v.ok) { toast(v.error, "error"); return; }
      }
      const tip = Math.max(0, Number(cashierTip) || 0);
      // Paid from "תשלום חדש" rather than from her appointment: link the client's visit TODAY when there is
      // exactly one, not cancelled and not paid yet, so that visit shows as paid (2026-10-23 pass, F2).
      // Anything ambiguous stays unlinked, as before.
      const linkedApptId = cashierAppt?.id || (() => {
        if (!cashierClient?.id) return null;
        // A products-only sale is not that visit's payment: never auto-link it, or her treatment would show as paid with only a
        // cream bought (Vercel review 2026-11-08). Only a sale that has at least one treatment line is matched to today's visit.
        if (!cashierItems.some(i => i && i.kind !== "product")) return null;
        const c = appointments.filter(a => String(a.client_id) === String(cashierClient.id) && a.date === today
          && a.confirmation_status !== "cancelled" && a.kind !== "personal"
          && !receipts.some(r => String(r.appointment_id) === String(a.id)));
        return c.length === 1 ? c[0].id : null;
      })();
      const receipt={
        client_id:cashierClient?.id||null,
        client_name:cashierClient?.name||"לקוחה",
        appointment_id:linkedApptId||null,
        service:serviceNames,
        amount:cashierTotal,
        // Only when nothing is left to pay. A covered treatment plus a cream is
        // still a card payment, and calling that "package" would put real money
        // in the wrong column of her breakdown. A split is the literal SPLIT
        // string, with the lines in `payments`.
        payment_method:coveredByPackage ? PACKAGE_PAYMENT : coveredByMembership ? MEMBERSHIP_PAYMENT : useSplit ? SPLIT_METHOD : paymentMethod,
        note:[cashierNote, loyaltyRewardLive?`🎁 מתנת כרטיסיית נאמנות: ${loyaltyCfg.reward}`:"", growDepositUsed>0?`מקדמה ₪${growDepositUsed} שולמה מראש ונוכתה`:"", growCreditUsed>0?`קרדיט ₪${growCreditUsed} נוכה`:"", membershipAdj?`${membershipAdj.service} מהמנוי "${membershipAdj.planName||""}"`:""].filter(Boolean).join(" · "),
        items:JSON.stringify(loyaltyRewardLive?[...cashierItems,loyaltyApplied.marker]:cashierItems),
        discount:cashierDiscountIls,
        // The three new columns. Tip is never part of amount; discount_pct is
        // the percentage she typed, if she typed one; payments are the split.
        tip,
        discount_pct: cashierDiscountMode==="pct" ? Math.min(100, Math.max(0, Number(cashierDiscount)||0)) : null,
        payments: useSplit ? splitResolved : null,
      };
      // A gift voucher used on this sale (its amount is already off the voucher, app/VoucherRedeemTill.jsx): named on the receipt.
      if (voucherUsed > 0 && voucherAdj) receipt.note = [receipt.note, voucherRedeemNote(voucherAdj.code, voucherUsed)].filter(Boolean).join(" · ");
      let {data,error}=await supabase.from("receipts").insert([receipt]).select();
      if (error && isMissingColumnError(error)) {
        // The migration has not run. Write the receipt without the three new
        // columns so her money is recorded, and say plainly what was lost:
        // a split becomes its first method, a tip and a percentage are dropped.
        const legacy = { ...receipt };
        delete legacy.tip; delete legacy.discount_pct; delete legacy.payments;
        if (useSplit) legacy.payment_method = splitResolved[0].method;
        ({data,error}=await supabase.from("receipts").insert([legacy]).select());
        if (!error && (useSplit || tip > 0 || cashierDiscountMode==="pct")) {
          console.error("[receipt] migration missing: tip/split/discount columns not present");
          toast(tr("אישור התשלום נשמר, אבל פיצול, טיפ ואחוז הנחה עדיין לא נתמכים אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל את זה."), "error");
        }
      }
      if(error){handleDbError(error, "save receipt"); return;}
      if(!data||!data[0]){toast(couldNotHe("לרשום את התשלום"),"error");return;}
      setReceipts(prev=>[...prev,data[0]]);
      // Products on this receipt: the server moves their stock, once per line (app/useProducts.js). Never blocks the sale.
      productsApi.afterReceipt(data[0], toast);
      const loyaltyUsed = loyaltyRewardLive;
      await applyCashierAdjustments(String(data[0].id), { depositUsed: growDepositUsed, creditUsed: growCreditUsed, appt: cashierAppt, client: cashierClient, pkg: drewFromPackage ? cashierPackage : null, membership: membershipAdj, loyalty: loyaltyUsed, loyaltyMarked: loyaltyUsed, loyaltyEvery: loyaltyUsed ? loyaltyApplied.marker?.loyalty_every : null });
      setMembershipAdj(null);
      setLoyaltyApplied(null);
      // Auto-send the receipt to the client on WhatsApp when enabled in settings.
      // Fire-and-forget: never blocks or breaks receipt creation; only warns on
      // failure. Uses the same sendReceiptToClient the manual button uses.
      afterPaymentRecorded(data[0], { autoSend: !!((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cashierClient?.phone) });
      setShowCashier(false);setRebookDone(null);setRebookWeeks(4);setRebookPick(null);setRebookPickOpen(false);setShowReceipt(data[0]);setConsentAskFor(data[0].id);setLoyaltyAfterFor(String(data[0].id));
      setCashierItems([]);setCashierClient(null);setCashierSearch("");setCashierDiscount(0);setCashierDiscountMode("ils");setCashierTip(0);setSplitOn(false);setCashierNote("");setCashierAppt(null);setGrowAdj({deposit:0,creditAvail:0,creditOn:false});
      // No business type means the legal document is SKIPPED (lib/legalReceipts/service.js, tax_status_missing): say so now, never
      // "מפיקה מסמך…" for a document that will not come (2026-10-21 audit).
      const legalBlocked=legalAccount?.connected&&needsLegalDoc(data[0])&&(!settings.business_tax_status||taxStatusUnconfirmed(settings));
      toast(tr("התשלום נרשם, ₪{0}{1}{2}", [cashierTotal, tip>0?` + טיפ ₪${tip}`:"", legalBlocked?" · לא יופק מסמך חוקי עד שתבחרי או תאשרי את סוג העסק בהגדרות (העסק שלי)":legalAccount?.connected&&needsLegalDoc(data[0])?" · מפיקה מסמך…":""]), legalBlocked?"error":undefined);
    } finally {
      setBusyKey("saveReceipt", false);
    }
  };/* @section-end */
  return { applyCashierAdjustments, applyLoyaltyReward, handleSaveReceipt, writeLoyaltyAdjustment };
}

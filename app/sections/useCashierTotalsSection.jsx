"use client";
// app/sections/useCashierTotalsSection.jsx — part of the owner's app: 89 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { loyaltyConfig, loyaltyState, isMissingLoyaltyTable, loyaltyLedgersSettled, rewardIsStale } from "@/lib/loyalty";
import { discountAmount } from "@/lib/till";
import { tr } from "@/lib/i18n/tr";

export function useCashierTotalsSection(ctx) {
  const {
    cashierClient, cashierDiscount, cashierDiscountMode, cashierItems, drawFromPackage, growAdj, historyReady,
    membershipAdj, packages, receipts, receiptVoids, services, setMembershipAdj, settings, setVoucherAdj,
    showCashier, splitLines, toast, voucherAdj,
  } = ctx;
  /* @section-body */const cashierPackage = useMemo(() => {
    if (!cashierClient) return null;
    return packages.find(pk =>
      pk.active &&
      String(pk.client_id) === String(cashierClient.id) &&
      Number(pk.used_sessions) < Number(pk.total_sessions) &&
      cashierItems.some(i => i.name === pk.service)
    ) || null;
  }, [cashierClient, packages, cashierItems]);

  // One session, one unit. A client taking two of the same treatment in a visit
  // draws ONE session and pays for the other - anything else spends a balance
  // she cannot see being spent.
  const packageSessionCredit = (drawFromPackage && cashierPackage)
    ? Number(cashierItems.find(i => i.name === cashierPackage.service)?.price || 0)
    : 0;
  // Subtotal, then the discount in shekels whichever way she typed it, then
  // the package credit. The tip sits outside all of it: it is what she was
  // handed, not what the treatment cost.
  const cashierSubtotal = cashierItems.reduce((s,item)=>s+(item.price*item.qty),0);
  const cashierDiscountIls = discountAmount(cashierSubtotal, cashierDiscountMode, Number(cashierDiscount||0));
  // A client membership credit covers one treatment's price, like a package session (never both on one visit: app/MembershipTill.jsx
  // is blocked while a package is drawn). Both are paid up front, so together they are the "package credit" the totals take off.
  const membershipCredit = membershipAdj ? Math.min(Number(membershipAdj.price) || 0, Math.max(0, cashierSubtotal - cashierDiscountIls - packageSessionCredit)) : 0;
  const packageCredit = packageSessionCredit + membershipCredit;
  // Deposit and credit come off AFTER the discount and the package: the deposit first (it was paid for this visit), then credit if she ticked it.
  const growBase = Math.max(0, cashierSubtotal - cashierDiscountIls - packageCredit);
  const growDepositUsed = Math.min(Number(growAdj.deposit) || 0, growBase);
  const growCreditUsed = growAdj.creditOn ? Math.min(Number(growAdj.creditAvail) || 0, Math.max(0, growBase - growDepositUsed)) : 0;
  // A gift voucher comes off last, like credit: it was paid for (and counted as income) the day it was sold.
  const voucherDue = Math.max(0, Math.round((growBase - growDepositUsed - growCreditUsed) * 100) / 100);
  const voucherUsed = voucherAdj ? Math.min(Number(voucherAdj.amount) || 0, voucherDue) : 0;
  const cashierTotal = Math.max(0, Math.round((cashierSubtotal - cashierDiscountIls - packageCredit - growDepositUsed - growCreditUsed - voucherUsed) * 100) / 100);
  // A membership credit belongs to one sale and one client: a closed till, or no client chosen, drops it (app/MembershipTill.jsx).
  useEffect(() => { if (!showCashier || !cashierClient?.id) setMembershipAdj(null); }, [showCashier, cashierClient?.id]);
  // The voucher belongs to one sale: a till that opens starts without it. A till closed after the voucher was used but before the
  // payment was recorded says so (the amount is already off the voucher; the vouchers list can give it back).
  const voucherOpenRef = useRef(false);
  useEffect(() => {
    if (showCashier) { if (!voucherOpenRef.current) { voucherOpenRef.current = true; setVoucherAdj(null); } return; }
    if (!voucherOpenRef.current) return;
    voucherOpenRef.current = false;
    if (voucherAdj && !voucherAdj.receiptId) toast(tr("השובר מומש אבל התשלום לא נרשם. אפשר להחזיר את הסכום לשובר מרשימת שוברי המתנה בקופה."), "error");
    setVoucherAdj(null);
  }, [showCashier, voucherAdj, toast]);
  // Two lines: the first is what she types, the second is whatever is left.
  const splitResolved = useMemo(() => {
    const first = { method: splitLines[0]?.method || "ביט", amount: Number(splitLines[0]?.amount) || 0 };
    const rest = Math.max(0, Math.round((cashierTotal - first.amount) * 100) / 100);
    return [first, { method: splitLines[1]?.method || "מזומן", amount: rest }];
  }, [splitLines, cashierTotal]);

  // ── Loyalty stamp card (lib/loyalty.js) ─────────────────────────────────────
  // Stamps are derived from receipts; the two loyalty tables (add_loyalty_2026-11-05.sql, handed over by hand) only hold rewards
  // given and manual corrections. loyaltyDb.ready: null = not read yet, false = the tables are not there (the card still counts, and a
  // reward at the till is marked on the receipt itself), true = read, "error" = the read failed. Nothing is computed until the full
  // history has arrived (historyReady) AND the ledgers have settled (loyaltyLedgersSettled: true or false only): counting from the
  // recent window alone would tell her a client is further from her gift than she is, and counting from ledgers still loading or
  // failed to load could offer a reward she already gave through Grow. Unknown shows nothing, never a wrong number.
  const loyaltyCfg = useMemo(() => loyaltyConfig(settings), [settings]);
  const [loyaltyDb, setLoyaltyDb] = useState({ ready: null, redemptions: [], adjustments: [] });
  const [loyaltyApplied, setLoyaltyApplied] = useState(null);
  // The receipt just saved at the till, so the after-save line shows on that one only (not on an old receipt opened from a list).
  const [loyaltyAfterFor, setLoyaltyAfterFor] = useState(null);
  const loyaltyServiceNames = useMemo(() => services.map((sv) => String(sv.name || "").trim()).filter(Boolean), [services]);
  const loadLoyaltyRows = useCallback(async () => {
    try {
      const [rq, aq] = await Promise.all([
        supabase.from("loyalty_redemptions").select("*").order("created_at", { ascending: true }).limit(5000),
        supabase.from("loyalty_adjustments").select("*").order("created_at", { ascending: true }).limit(5000),
      ]);
      if (isMissingLoyaltyTable(rq.error) || isMissingLoyaltyTable(aq.error)) {
        console.warn("[loyalty] migration missing: add_loyalty_2026-11-05.sql (counting still works from receipts)");
        setLoyaltyDb({ ready: false, redemptions: [], adjustments: [] });
        return;
      }
      if (rq.error || aq.error) { console.warn("[loyalty] read failed", rq.error || aq.error); setLoyaltyDb({ ready: "error", redemptions: [], adjustments: [] }); return; }
      setLoyaltyDb({ ready: true, redemptions: rq.data || [], adjustments: aq.data || [] });
    } catch (e) { console.warn("[loyalty] read failed", e); setLoyaltyDb({ ready: "error", redemptions: [], adjustments: [] }); }
  }, []);
  useEffect(() => { if (loyaltyCfg.enabled && settings?.tenant_id) loadLoyaltyRows(); }, [loyaltyCfg.enabled, settings?.tenant_id, loadLoyaltyRows]);
  const loyaltyFor = useCallback((clientId) => {
    if (!loyaltyCfg.enabled || !clientId || !historyReady || !loyaltyLedgersSettled(loyaltyDb.ready)) return null;
    return loyaltyState({ config: loyaltyCfg, clientId, receipts, voids: receiptVoids, redemptions: loyaltyDb.redemptions, adjustments: loyaltyDb.adjustments, serviceNames: loyaltyServiceNames });
  }, [loyaltyCfg, historyReady, receipts, receiptVoids, loyaltyDb, loyaltyServiceNames]);
  const cashierLoyalty = useMemo(() => loyaltyFor(cashierClient?.id), [loyaltyFor, cashierClient]);
  // The reward goes on the receipt only while it is still ready AND still for the till's own client (applied for one client, then the
  // client was changed: rewardIsStale, and the effect beside applyLoyaltyReward takes it off).
  const loyaltyRewardLive = !!(loyaltyApplied && cashierLoyalty?.ready && !rewardIsStale(loyaltyApplied, cashierClient?.id));/* @section-end */
  return { cashierDiscountIls, cashierLoyalty, cashierPackage, cashierTotal, growCreditUsed, growDepositUsed,
    loadLoyaltyRows, loyaltyAfterFor, loyaltyApplied, loyaltyCfg, loyaltyDb, loyaltyFor, loyaltyRewardLive,
    setLoyaltyAfterFor, setLoyaltyApplied, setLoyaltyDb, splitResolved, voucherDue, voucherUsed };
}

"use client";
// app/sections/usePackagesSection.jsx — part of the owner's app: 335 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { isDemoTenantId } from "@/lib/demoTenants";
import { installDemoOutboundGuard } from "@/lib/demoOutbound";
import { SAVE_FAILED_HE } from "@/lib/errorCopy";
import { deliverFile, deliveryToast, dataUrlToBlob } from "@/lib/deliverFile";
import { tr } from "@/lib/i18n/tr";

export function usePackagesSection(ctx) {
  const {
    activeTab, afterPaymentRecorded, askConfirm, emptyProtocol, formatDate, guardWrite, handleDbError, isBusy,
    newOffering, newPackage, newProtocol, newWaitlist, offerings, runOnce, scanLink, scanQr, setBusyKey,
    setClientReviews, setClientReviewsError, setNewOffering, setNewProtocol, setOfferings, setOfferingsError,
    setPackages, setProtocols, setReceipts, setScanLink, setScanLinkError, setScanQr, setScanQuota,
    setShowOfferingForm, setShowPackageModal, setShowProtocolModal, setShowWaitlistModal, settings, setWaitlist,
    showSettings, toast,
  } = ctx;
  /* @section-body */const loadOfferings = useCallback(async () => {
    const { data, error } = await supabase
      .from("package_offerings").select("*").order("sort_order", { ascending: true });
    if (error) {
      // Empty and broken are different answers, and this codebase has paid for
      // conflating them before. The list says which one it is.
      console.error("[offerings] load failed:", error.message);
      setOfferingsError(true);
      setOfferings([]);
      return;
    }
    setOfferingsError(false);
    setOfferings(data || []);
  }, []);

  const loadClientReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("[reviews] load failed:", error.message);
      setClientReviewsError(true);
      setClientReviews([]);
      return;
    }
    setClientReviewsError(false);
    setClientReviews(data || []);
  }, []);

  // Lazily, and only where each is shown.
  //
  // THESE MUST SIT BELOW THE useCallbacks THEY NAME. They were 3,000 lines
  // above them, and a dependency array is evaluated DURING RENDER, in source
  // order - so [activeTab, loadOfferings] read a const that had not been
  // initialised yet and threw "Cannot access 'loadOfferings' before
  // initialization" on every single render of this component, server and
  // client. The dashboard did not degrade; it did not render at all.
  //
  // It shipped in the catalogue-UI commit and again with the reviews
  // moderation row, and survived ten commits of "build passed" - because the
  // build died two steps earlier on a missing environment variable and never
  // reached the render. The first check that got far enough found it
  // immediately, which is the argument for the check.
  useEffect(()=>{ if(activeTab==="packages") loadOfferings(); },[activeTab, loadOfferings]);
  useEffect(()=>{ if(showSettings) loadClientReviews(); },[showSettings, loadClientReviews]);

  // The scanner link she should share: signed by the server, on the origin
  // she is using. Returns the url (or null) so the copy button can await it.
  // The QR is drawn from the SAME string - one link, three surfaces.
  const loadScanLink = useCallback(async () => {
    try {
      const res = await fetch("/api/skin-scan/link");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success || !(data.path || data.url)) {
        setScanLinkError((data && data.error) || tr("לא הצלחנו להפיק את הקישור"));
        return null;
      }
      setScanQuota(data);
      const origin = (typeof window !== "undefined" && window.location.origin) || "";
      const url = data.path && origin ? `${origin}${data.path}` : data.url;
      setScanLink(url);
      setScanLinkError("");
      try {
        const QRCode = (await import("qrcode")).default;
        setScanQr(await QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#2B2233", light: "#FFFFFF" } }));
      } catch { setScanQr(null); }
      return url;
    } catch {
      setScanLinkError(tr("לא הצלחנו להפיק את הקישור. בדקי את החיבור ונסי שוב."));
      return null;
    }
  }, []);
  useEffect(()=>{ if(showSettings && !scanLink) loadScanLink(); },[showSettings, scanLink, loadScanLink]);

  // Whether the CENTRAL WhatsApp number is on right now (the admin panel's
  // own toggle, platform-wide) - fetched once per settings-panel open, so
  // the owner-alert WhatsApp toggle below can say plainly, next to itself,
  // when turning it on wouldn't send anything yet. null = not loaded yet.
  const [waCentralConnected, setWaCentralConnected] = useState(null);
  useEffect(()=>{
    if(!showSettings) return;
    let cancelled=false;
    fetch("/api/whatsapp-central-status").then(r=>r.json()).then(d=>{ if(!cancelled) setWaCentralConnected(!!d.connected); }).catch(()=>{ if(!cancelled) setWaCentralConnected(false); });
    return ()=>{ cancelled=true; };
  },[showSettings]);

  // The demo's clients have real-looking numbers: no WhatsApp, call or SMS may open from it (lib/demoOutbound.js).
  const isDemoTenant = isDemoTenantId(settings?.tenant_id);
  useEffect(()=>{
    if(!isDemoTenant) return;
    return installDemoOutboundGuard(()=>toast(tr("זו תצוגת דמו, אז וואטסאפ לא נפתח. בחשבון שלך ההודעה תיפתח מוכנה לשליחה."),"info"));
  },[isDemoTenant, toast]);

  const downloadScanQr = () => {
    if (!scanQr) return;
    // Decoded in the same tap (a fetch first would use it up), so the phone's share sheet is still allowed.
    const blob = dataUrlToBlob(scanQr);
    if (!blob) { toast(tr("לא הצלחנו להכין את הקוד להורדה. אפשר לצלם אותו מהמסך"), "error"); return; }
    deliverFile(blob, `${(settings.business_name || "kalmea").replace(/[^\p{L}\p{N}]+/gu, "-")}-skin-scan-qr.png`).then(o => { const t = deliveryToast(o, { downloaded: "הקוד ירד" }); if (t) toast(t.text, t.kind); });
  };

  // HIDE, AND NOTHING ELSE. There is no edit here and there cannot be one: the
  // database refuses any change to the words, so a text field would be a box
  // that throws 42501 when she pressed save. The absence of that field is the
  // feature - a review she could rewrite is a testimonial, and the page says
  // these are from clients.
  const toggleReviewHidden = async (rv) => {
    if (guardWrite()) return;
    const next = rv.status === "hidden" ? "published" : "hidden";
    const { data, error } = await supabase
      .from("reviews").update({ status: next }).eq("id", rv.id).select();
    if (error) { handleDbError(error, "update review status"); return; }
    if (data && data[0]) {
      setClientReviews(prev => prev.map(x => x.id === rv.id ? data[0] : x));
      toast(next === "hidden" ? tr("הביקורת הוסתרה") : tr("הביקורת הוחזרה"));
    }
  };

  const handleSaveOffering = async () => {
    if (guardWrite()) return;
    if (!newOffering.service) { toast(tr("איזה טיפול? אפשר לבחור"),"error"); return; }
    if (!(Number(newOffering.sessions) > 0)) { toast(tr("מספר טיפולים חייב להיות גדול מאפס"),"error"); return; }
    if (isBusy("saveOffering")) return;
    setBusyKey("saveOffering", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const row = {
        service: newOffering.service,
        sessions: Number(newOffering.sessions),
        price: Number(newOffering.price) || 0,
        sort_order: offerings.length,
        ...(tid ? { tenant_id: tid } : {}),
      };
      const { data, error } = await supabase.from("package_offerings").insert([row]).select();
      if (error) { handleDbError(error, "save package offering"); return; }
      if (data && data[0]) {
        setOfferings(prev => [...prev, data[0]]);
        setNewOffering({ service:"", sessions:5, price:0 });
        setShowOfferingForm(false);
        toast(tr("החבילה נוספה לקטלוג"));
      }
    } finally { setBusyKey("saveOffering", false); }
  };

  // Retired, not deleted. Packages already sold point at this row, and a
  // catalogue entry that disappears takes the answer to "what did she buy?"
  // with it.
  const toggleOffering = async (o) => {
    if (guardWrite()) return;
    const { data, error } = await supabase
      .from("package_offerings").update({ active: !o.active }).eq("id", o.id).select();
    if (error) { handleDbError(error, "update package offering"); return; }
    if (data && data[0]) setOfferings(prev => prev.map(x => x.id === o.id ? data[0] : x));
  };

  const freePackageOk = useRef(false);
  const handleSavePackage = async () => {
    if (guardWrite()) return;
    if(!newPackage.client_id||!newPackage.service){toast(tr("חסרים לקוחה ושירות, אפשר לבחור"),"error");return;}
    // A free package is real (a comped series), but a forgotten price used to save as ₪0 without a word and
    // record no payment (2026-10-24 sweep). Ask once; the confirmed path comes back with free=true.
    if(!(Number(newPackage.price)>0)&&!freePackageOk.current){
      askConfirm({title:tr("חבילה בלי מחיר"),message:tr("לא הוזן מחיר לחבילה. לשמור אותה כמתנה, בלי לרשום תשלום?"),confirmText:tr("כן, בלי תשלום"),cancelText:tr("להוסיף מחיר"),onConfirm:()=>{freePackageOk.current=true;handleSavePackage();}});
      return;
    }
    freePackageOk.current=false;
    if(isBusy("savePackage")) return;
    setBusyKey("savePackage", true);
    try {
      // Stamp the tenant the way handleSave does, and for the same reason: so
      // the row satisfies the RLS WITH CHECK even where the column default is
      // not applied. This insert sent newPackage raw, with no tenant_id on it
      // at all - leaning on a database default that nothing in this repo
      // guarantees.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      const price = Number(newPackage.price) || 0;
      // payment_method belongs on the receipt, not on the package row - it is
      // how she was paid, not part of what she sold.
      // valid_months is a choice on the form, not a column: it becomes packages.expires_at (end of that day, Israel),
      // which the smart reminders read to tell her client two weeks before unused sessions run out.
      const { payment_method, valid_months, ...packageRow } = newPackage;
      const months = Number(valid_months) || 0;
      if (months > 0) {
        const d = new Date(); d.setMonth(d.getMonth() + months);
        packageRow.expires_at = `${formatDate(d)}T21:59:59Z`;
      }
      // active: true, written explicitly. The packages list and the cashier's
      // "charge from package" card both filter on it, the sync trigger only
      // sets it once the first ledger entry lands, and the table's own default
      // is defined nowhere in this repo. A package that sold as inactive would
      // vanish from both screens until its first draw - which could never
      // happen, because the draw is on the screen it vanished from.
      const {data,error}=await supabase.from("packages").insert([{ ...packageRow, active: true, ...tenantField }]).select();
      if(error){handleDbError(error, "save package"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      const pkg = data[0];
      setPackages(prev=>[...prev,pkg]);

      // A free package is a real thing - a comped series, a goodwill gesture -
      // and it should not leave a zero receipt cluttering her day.
      if (price > 0) {
        const receipt = {
          client_id: pkg.client_id || null,
          client_name: pkg.client_name || "לקוחה",
          appointment_id: null,                    // paid up front, against no visit
          service: "חבילה: " + pkg.service,
          amount: price,
          payment_method,
          note: "חבילת " + pkg.total_sessions + " טיפולים",
          // The same item shape the cashier writes, so this receipt renders,
          // prints and sends through exactly the same path as every other one.
          items: JSON.stringify([{ id: Date.now(), name: "חבילה: " + pkg.service + " (" + pkg.total_sessions + " טיפולים)", price, qty: 1 }]),
          discount: 0,
          ...tenantField,
        };
        const { data: rec, error: recErr } = await supabase.from("receipts").insert([receipt]).select();
        if (recErr || !rec || !rec[0]) {
          // Loud, and actionable. The package IS saved; what is missing is the
          // money, and she is the only one who can put it in.
          console.error("[packages] receipt insert failed", recErr);
          toast("החבילה נשמרה, אך התשלום לא נרשם. כדי שלא יישכח, רשמי תשלום של ₪" + price + " בקופה.", "error");
          setShowPackageModal(false);
          return;
        }
        setReceipts(prev=>[...prev, rec[0]]);
        afterPaymentRecorded(rec[0], { autoSend: false });
      }

      setShowPackageModal(false);
      toast(price > 0 ? "החבילה נמכרה, ₪" + price : tr("החבילה נוספה"));
    } finally {
      setBusyKey("savePackage", false);
    }
  };

  // Drawing a session is an ENTRY IN A LEDGER, not an increment.
  //
  // This used to read used_sessions, add one, and write it back. A number with
  // no history behind it: tap twice and there was no record that it happened,
  // no way to know which visit either tap was for, and no way back except
  // editing the number - which is not a correction, it is a second
  // unverifiable claim. Six months later, when a client says she has two left,
  // nothing in the system could settle it.
  //
  // packages.used_sessions is now derived. A trigger recomputes it from the
  // entries and another refuses any direct write, so this could not go back to
  // incrementing even if something tried - which is the point. A guarantee
  // that depends on every future caller remembering is not a guarantee.
  //
  // The package row is re-read rather than patched from a response, because
  // the number we want was written by a trigger and is not in the insert's
  // result.
  const writePackageEntry = async (pkg, delta, { appointmentId = null, reason = "" } = {}) => {
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || pkg.tenant_id || null;
    const { error } = await supabase.from("package_entries").insert([{
      package_id: pkg.id,
      appointment_id: appointmentId,
      delta,
      reason,
      ...(tid ? { tenant_id: tid } : {}),
    }]);
    if (error) {
      // 23505 is package_entries_one_draw_per_appt: this visit has already
      // drawn from this package. Two taps on the same appointment is the
      // mistake this feature is most likely to make, and the database
      // refusing it beats a reversal she has to notice she needs.
      if (error.code === "23505") { toast(tr("כבר נוכה טיפול מהחבילה עבור התור הזה"), "error"); return null; }
      handleDbError(error, delta < 0 ? "draw package session" : "reverse package session");
      return null;
    }
    const { data: fresh } = await supabase.from("packages").select("*").eq("id", pkg.id).maybeSingle();
    if (fresh) setPackages(prev => prev.map(x => x.id === pkg.id ? fresh : x));
    return fresh || null;
  };

  const handleUsePackageSession = (pkg, opts) => runOnce(`pkg:${pkg.id}`, () => usePackageSessionNow(pkg, opts));
  const usePackageSessionNow = async (pkg, opts) => {
    if (guardWrite()) return;
    if (Number(pkg.used_sessions) >= Number(pkg.total_sessions)) { toast(tr("החבילה כבר נוצלה במלואה"), "error"); return; }
    const fresh = await writePackageEntry(pkg, -1, opts);
    if (!fresh) return;
    const used = Number(fresh.used_sessions);
    toast(used < Number(fresh.total_sessions) ? tr("טיפול {0}/{1}", [used, fresh.total_sessions]) : tr("החבילה הסתיימה"));
  };

  // The reversal. Not a delete: the mistaken draw stays in the ledger and the
  // correction sits beside it, so the history explains itself instead of
  // quietly no longer containing the error.
  const handleUndoPackageSession = (pkg) => runOnce(`pkg:${pkg.id}`, () => undoPackageSessionNow(pkg));
  const undoPackageSessionNow = async (pkg) => {
    if (guardWrite()) return;
    if (Number(pkg.used_sessions) <= 0) { toast(tr("אין טיפול לבטל"), "error"); return; }
    const fresh = await writePackageEntry(pkg, 1, { reason: "ביטול ניכוי" });
    if (!fresh) return;
    toast(tr("הניכוי בוטל, {0}/{1}", [fresh.used_sessions, fresh.total_sessions]));
  };

  const handleSaveWaitlist = async () => {
    if (guardWrite()) return;
    if(!newWaitlist.client_name||!newWaitlist.service){toast(!newWaitlist.client_name?tr("בחרי לקוחה לרשימת ההמתנה"):tr("בחרי טיפול לרשימת ההמתנה"),"error");return;}
    if(isBusy("saveWaitlist")) return;
    setBusyKey("saveWaitlist", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const wlTid = rpcTenant || settings?.tenant_id || null;
      // status written explicitly: the list filters on "waiting", and no
      // migration in the repo gives the column a default, so an entry saved
      // without it could vanish from the list on the next reload.
      const {data,error}=await supabase.from("waitlist").insert([{ ...newWaitlist, status: "waiting", ...(wlTid ? { tenant_id: wlTid } : {}) }]).select();
      if(error){handleDbError(error, "save waitlist"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setWaitlist(prev=>[...prev,data[0]]);setShowWaitlistModal(false);toast(tr("נוספה לרשימת המתנה"));
    } finally {
      setBusyKey("saveWaitlist", false);
    }
  };

  const handleSaveProtocol = async () => {
    if (guardWrite()) return;
    if(!newProtocol.brand||!newProtocol.name){toast(tr("חסרים מותג ושם, אפשר להשלים"),"error");return;}
    if(isBusy("saveProtocol")) return;
    setBusyKey("saveProtocol", true);
    try {
      const {data,error}=await supabase.from("treatment_protocols").insert([newProtocol]).select();
      if(error){handleDbError(error, "save protocol"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setProtocols(prev=>[data[0],...prev]);setShowProtocolModal(false);setNewProtocol(emptyProtocol);toast(tr("הפרוטוקול נשמר"));
    } finally {
      setBusyKey("saveProtocol", false);
    }
  };/* @section-end */
  return { downloadScanQr, handleSaveOffering, handleSavePackage, handleSaveProtocol, handleSaveWaitlist,
    handleUndoPackageSession, handleUsePackageSession, loadScanLink, toggleOffering, toggleReviewHidden,
    waCentralConnected, writePackageEntry };
}

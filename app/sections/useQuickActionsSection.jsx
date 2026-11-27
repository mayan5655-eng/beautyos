"use client";
// app/sections/useQuickActionsSection.jsx — part of the owner's app: 61 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { localDayKey } from "@/lib/till";
import { deliverFile, deliveryToast } from "@/lib/deliverFile";
import { waMsg } from "../shared/datesAndLinks";
import { tr } from "@/lib/i18n/tr";

export function useQuickActionsSection(ctx) {
  const {
    askConfirm, clients, deferred, historyReady, receipts, receiptVoids, setEditingClient, setEditingLead,
    setNewClient, setNewLead, setShowClientModal, setShowLeadModal, setWaSentToday, toast, today,
  } = ctx;
  /* @section-body */const handleExportCSV = () => {
    // Until the older payments are in, the file would silently stop at about six months back: say so instead of handing her an accountant's file that is short.
    if(!historyReady){toast(deferred.history==="error"?tr("לא הצלחנו לטעון את כל ההיסטוריה, אז הקובץ היה חלקי. אפשר לנסות שוב מהסרגל שלמעלה."):tr("ההיסטוריה עוד בדרך. אפשר לנסות שוב בעוד רגע."),"info");return;}
    // Voided payments stay in the file but are marked, so the export agrees with the totals on screen instead of counting them as income.
    const voidedIds=new Set(receiptVoids.map(v=>String(v.receipt_id)));
    const rows=[["שם","טלפון","שירות","תאריך","סכום","אמצעי תשלום","טיפ","הנחה","מבוטל"]];
    receipts.forEach(r=>{const client=clients.find(c=>String(c.id)===String(r.client_id));rows.push([r.client_name,client?.phone||"",r.service,localDayKey(r.created_at)||"",r.amount,r.payment_method,Number(r.tip)||0,Number(r.discount)||0,voidedIds.has(String(r.id))?"כן":""]);});
    // Quote every cell (escaping embedded quotes) so values containing commas
    // — e.g. a multi-item receipt service "פנים, עיסוי" — don't shift columns.
    // A client name comes from a public form: a cell starting with = + - @ would run as a formula in Excel. Numbers are left alone.
    const esc=v=>{let t=String(v??"");if(typeof v!=="number"&&/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`;};
    const csv=rows.map(r=>r.map(esc).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    // On a phone this is the share sheet (the home-screen app and Instagram/Facebook drop a blob download without a word; Safari hides it in Files).
    deliverFile(blob,`kalmea_payments_${today}.csv`).then(o=>{const t=deliveryToast(o);if(t)toast(t.text,t.kind);});
  };

  // === WHATSAPP CENTER HANDLERS ===
  // Returns true only when a WhatsApp window really opened: a blocked popup is not a message she sent.
  const waSendOne = (clientId, phone, message) => {
    if(!phone){toast(tr("אין מספר טלפון ללקוחה"),"error");return false;}
    const link=waMsg(phone,message);
    const opened=!!(link&&window.open(link,"_blank"));
    if(opened&&clientId)setWaSentToday(prev=>({...prev,[clientId]:true}));
    return opened;
  };

  const waSendGroup = (items) => {
    const targets=items.filter(it=>it.phone);
    if(targets.length===0){toast(tr("אין נמענים עם טלפון"),"error");return;}
    askConfirm({
      title:tr("שליחה קבוצתית"),
      message:tr("ננסה לפתוח {0} חלונות וואטסאפ, אחד לכל לקוחה. בטלפון הדפדפן פותח בדרך כלל רק את הראשון, ואז אפשר ללחוץ \"שלחי\" ליד כל אחת. לאשר?", [targets.length]),
      confirmText:tr("שלחי"),
      onConfirm:async()=>{
        // A phone lets a page open a window only from a tap, so after the first one the rest are usually blocked. Count what
        // really opened and say how many are left, instead of a toast that claims all of them opened (2026-11-03 UX review).
        let opened=0;
        for(const t of targets){
          if(!waSendOne(t.clientId,t.phone,t.message))break;
          opened++;
          await new Promise(r=>setTimeout(r,700));
        }
        const left=targets.length-opened;
        if(left>0)toast(opened?tr("נפתח וואטסאפ ל-{0} מתוך {1}. הדפדפן חסם את השאר, אפשר ללחוץ \"שלחי\" ליד כל אחת.", [opened, targets.length]):tr("הדפדפן חסם את פתיחת וואטסאפ. אפשר ללחוץ \"שלחי\" ליד כל אחת."),"info");
        else toast(opened===1?tr("נפתח וואטסאפ עם הודעה מוכנה. נשאר ללחוץ שליחה."):tr("נפתח וואטסאפ ל-{0} לקוחות. נשאר ללחוץ שליחה בכל שיחה.", [opened]));
      },
    });
  };

  const openEditClient = (client) => {
    setEditingClient(client);
    setNewClient({name:client.name||"",phone:client.phone||"",birthday:client.birthday||"",skinType:client.skinType||"",allergies:client.allergies||"",medical:client.medical||"",notes:client.notes||"",status:client.status||"active"});
    setShowClientModal(true);
  };

  const openEditLead = (lead) => {
    setEditingLead(lead);
    setNewLead({name:lead.name||"",phone:lead.phone||"",source:lead.source||"פייסבוק",service_interest:lead.service_interest||"",status:lead.status||"new",notes:lead.notes||"",reminder_date:lead.reminder_date||""});
    setShowLeadModal(true);
  };/* @section-end */
  return { handleExportCSV, openEditClient, openEditLead, waSendGroup, waSendOne };
}

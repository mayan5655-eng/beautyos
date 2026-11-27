"use client";
// app/sections/useClientSaveSection.jsx — part of the owner's app: 76 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: openNewAppt is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useEffect, useRef } from "react";
import { normalizeIsraeliMobile } from "@/lib/phone";
import { supabase } from "../supabase";
import { SAVE_FAILED_HE } from "@/lib/errorCopy";
import { tr } from "@/lib/i18n/tr";

export function useClientSaveSection(ctx) {
  const {
    askConfirm, clients, editingClient, emptyClient, guardWrite, handleDbError, isBusy, newClient,
    setAppointments, setBusyKey, setClientMoreOpen, setClients, setEditingClient, setForms, setLeads, setNewAppt,
    setNewClient, setPackages, setReceipts, setSelectedClient, setShowClientModal, setWaitlist, showClientModal,
    toast, late,
  } = ctx;
  const openNewAppt = (...args) => late.openNewAppt(...args);
  /* @section-body */const handleClientErased = (clientId) => {
    const same = (a) => String(a) === String(clientId);
    setClients(prev=>prev.filter(c=>!same(c.id)));
    setSelectedClient(null);
    setAppointments(prev=>prev.map(a=>same(a.client_id)?{...a,client_id:null,name:"לקוחה שנמחקה",client_phone:null,note:null}:a));
    setReceipts(prev=>prev.map(r=>same(r.client_id)?{...r,client_id:null,client_name:"לקוחה שנמחקה"}:r));
    setForms(prev=>prev.filter(f=>!same(f.client_id)));
    setWaitlist(prev=>prev.filter(w=>!same(w.client_id)));
    setPackages(prev=>prev.map(k=>same(k.client_id)?{...k,client_id:null,client_name:"לקוחה שנמחקה"}:k));
    setLeads(prev=>prev.filter(l=>!same(l.client_id)));
  };
  const saveClientDupOk = useRef(false);
  // Every new-client form opens short again (name and phone), whichever button opened it.
  useEffect(() => { if (!showClientModal) setClientMoreOpen(false); }, [showClientModal]);
  const handleSaveClient = async () => {
    if (guardWrite()) return;
    if(!newClient.name.trim()){toast(tr("חסר שם, אפשר להוסיף אותו"),"error");return;}
    // A phone she typed that WhatsApp cannot use used to be saved as typed, and her reminders to that client quietly never arrived.
    const typedPhone = String(newClient.phone||"").trim();
    const phoneInfo = typedPhone ? normalizeIsraeliMobile(typedPhone) : null;
    if(phoneInfo && !phoneInfo.ok){toast(tr("המספר לא נראה כמו נייד ישראלי. אפשר לבדוק אותו, או להשאיר ריק."),"error");return;}
    if(phoneInfo && !editingClient && !saveClientDupOk.current){
      const dup = clients.find(c=>normalizeIsraeliMobile(c.phone).e164===phoneInfo.e164);
      if(dup){
        askConfirm({title:tr("המספר הזה כבר קיים"),message:tr("יש כבר לקוחה עם המספר הזה: {0}. להוסיף בכל זאת כרטיס נוסף?", [dup.name]),confirmText:tr("להוסיף בכל זאת"),onConfirm:()=>{saveClientDupOk.current=true;Promise.resolve(handleSaveClient()).finally(()=>{saveClientDupOk.current=false;});}});
        return;
      }
    }
    if(isBusy("saveClient")) return;
    setBusyKey("saveClient", true);
    try {
      const toSave = {...newClient, name:newClient.name.trim()};
      if(editingClient){
        const {data,error}=await supabase.from("clients").update(toSave).eq("id",editingClient.id).select();
        if(error){handleDbError(error, "update client"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setClients(prev=>prev.map(c=>c.id===editingClient.id?data[0]:c));setSelectedClient(data[0]);
        toast(tr("הלקוחה עודכנה"));
      }else{
        const {data,error}=await supabase.from("clients").insert([toSave]).select();
        if(error){handleDbError(error, "create client"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setClients(prev=>[...prev,data[0]]);
        // The next step, one tap away (UX pass 2026-11-08): book her first visit with the client already filled in.
        const nc=data[0];
        toast(tr("נוספה ✓ · לקבוע לה תור?"), "success", { label:tr("קביעת תור"), onClick:()=>{ openNewAppt(); setNewAppt(prev=>({...prev,clientId:nc.id,name:nc.name})); } });
      }
      setShowClientModal(false);setEditingClient(null);setNewClient(emptyClient);
    } finally {
      setBusyKey("saveClient", false);
    }
  };

  // Marketing consent / opt-out for one client (lib/marketingConsent.js). The columns come from supabase/migrations/add_marketing_consent.sql;
  // until it has run the update fails and she is told so, plainly - never a success toast for a write that did not happen.
  const saveClientMarketing = async (client, fields, doneMsg) => {
    if (guardWrite()) return;
    if (isBusy("clientMarketing")) return;
    setBusyKey("clientMarketing", true);
    try {
      const {data,error}=await supabase.from("clients").update(fields).eq("id",client.id).select();
      if(error){
        console.error("[marketing consent] update failed:", error);
        const missing=/marketing_|column|schema cache/i.test(String(error.message||""));
        toast(missing?tr("שמירת הסכמה והסרה מדיוור עוד לא פעילה במערכת (עדכון מסד נתונים שעוד לא הורץ)."):SAVE_FAILED_HE,"error");
        return;
      }
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));
      // Only refresh the open card; from the cashier prompt no client card is open and none should pop up.
      setSelectedClient(prev=>prev&&String(prev.id)===String(client.id)?data[0]:prev);
      toast(doneMsg);
    } finally {
      setBusyKey("clientMarketing", false);
    }
  };/* @section-end */
  return { handleClientErased, handleSaveClient, saveClientMarketing };
}

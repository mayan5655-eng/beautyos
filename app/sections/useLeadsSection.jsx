"use client";
// app/sections/useLeadsSection.jsx — part of the owner's app: 234 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { nextOpenDay } from "@/lib/businessHours";
import { resolveLeadTemplate } from "@/lib/leads/templates";
import { SAVE_FAILED_HE, couldNotHe } from "@/lib/errorCopy";
import { sourceLabelHe } from "@/lib/leadSources";
import { tr } from "@/lib/i18n/tr";

export function useLeadsSection(ctx) {
  const {
    activeServices, askConfirm, bulkConfirmConsent, bulkLeadIds, bulkMessage, bulkResult, bulkStatus,
    editingLead, emptyLead, formatDate, guardWrite, handleDbError, isBusy, LEAD_STATUSES, newLead, setApptNote,
    setBulkConfirmConsent, setBulkError, setBulkLeadIds, setBulkMessage, setBulkResult, setBulkStatus,
    setBulkStep, setBusyKey, setClients, setEditingAppointmentId, setEditingLead, setLeads, setNewAppt,
    setNewLead, setSelectedLead, setShowLeadModal, setShowModal, settings, toast,
  } = ctx;
  /* @section-body */const handleSaveLead = async () => {
    if (guardWrite()) return;
    if(!newLead.name.trim()){toast(tr("חסר שם, אפשר להוסיף אותו"),"error");return;}
    if(isBusy("saveLead")) return;
    setBusyKey("saveLead", true);
    try {
      if(editingLead){
        const {data,error}=await supabase.from("leads").update(newLead).eq("id",editingLead.id).select();
        if(error){handleDbError(error, "update lead"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setLeads(prev=>prev.map(l=>l.id===editingLead.id?data[0]:l));setSelectedLead(data[0]);
        toast(tr("הפנייה עודכנה"));
      }else{
        const {data,error}=await supabase.from("leads").insert([{...newLead,source:newLead.source||null}]).select();
        if(error){handleDbError(error, "create lead"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setLeads(prev=>[...prev,data[0]]);
        toast(tr("הפנייה נוספה"));
      }
      setShowLeadModal(false);setEditingLead(null);setNewLead(emptyLead);
    } finally {
      setBusyKey("saveLead", false);
    }
  };

  // Status chips in the lead drawer save on tap - there is no save button, and
  // there should not be one: a status is a one-tap field and a confirm step
  // would make it three.
  //
  // What was missing is the evidence that it saved. This and handleSetReminder
  // were the ONLY two of the 26 async write handlers in this file with no
  // toast, and the sole feedback was a 9.5px chip changing colour AFTER the
  // round-trip returned. So on a slow phone you tapped, nothing moved, and the
  // reasonable conclusion was that it had not worked.
  //
  // Four changes, in the order they matter:
  //   1. Optimistic - the chip moves on the tap, not on the response.
  //   2. Revert on failure, so an optimistic update can never leave the screen
  //      claiming something the database did not accept.
  //   3. A toast naming the new status, matching every other write in the app.
  //   4. A busy guard. Rapid taps used to fire concurrent updates where the
  //      last RESPONSE won rather than the last TAP, so she could land on a
  //      status she did not choose.
  const handleUpdateLeadStatus = async (lead,status) => {
    if (guardWrite()) return;
    if (status === lead.status) return;              // re-tapping the active chip
    if (isBusy("leadStatus")) return;
    const prevStatus = lead.status;
    const label = (LEAD_STATUSES[status] || {}).label || status;
    // Functional updates throughout: the drawer can be closed, or switched to
    // another lead, while the write is still in flight.
    const applyStatus = (s) => {
      setLeads(prev => prev.map(l => l.id === lead.id ? {...l, status:s} : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? {...prev, status:s} : prev);
    };
    applyStatus(status);
    setBusyKey("leadStatus", true);
    try {
      const {data,error}=await supabase.from("leads").update({status}).eq("id",lead.id).select();
      if(error){ applyStatus(prevStatus); handleDbError(error, "update lead status"); return; }
      // Zero rows back is not success. It means RLS refused the write, which
      // used to leave the old code showing nothing at all.
      if(!data||!data[0]){ applyStatus(prevStatus); toast(tr("לא הצלחנו לעדכן את הסטטוס, והוא חזר למה שהיה. נסי שוב בעוד רגע."),"error"); return; }
      const row = data[0];
      setLeads(prev => prev.map(l => l.id === lead.id ? row : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? row : prev);
      toast(tr("הסטטוס עודכן: {0}", [label]));
    } finally {
      setBusyKey("leadStatus", false);
    }
  };

  // --- Bulk WhatsApp send per status group ---
  // openBulk resets the flow to a clean "compose" step for the chosen status.
  // Prefills the composer from the saved per-status template
  // (settings.automations.lead_templates). Always editable before sending, and
  // blank when no template is saved for that status.
  // Passing `lead` targets that single lead instead of the whole status group.
  // `target` is one of three things, and the difference decides who receives it:
  //   a lead object  - just her (from the lead drawer)
  //   an array       - exactly these leads (the filtered group on the leads
  //                    screen, which is narrowed by the search box)
  //   null/undefined - everyone in the status
  //
  // The array form is what stops the group send from ignoring the search. It
  // used to take only a status, so searching "רונית" and sending to "חדש"
  // messaged all nine leads in that status rather than the one on screen. The
  // API applies leadIds AFTER its own tenant and status filters, so this can
  // only ever narrow the recipients, never widen them.
  const openBulk = (status, target) => {
    const tpl = resolveLeadTemplate(settings, status);
    const isList = Array.isArray(target);
    const singleLead = !isList && target ? target : null;
    setBulkStatus(status);
    setBulkLeadIds(
      isList ? target.map(l => (typeof l === "string" ? l : l.id)).filter(Boolean)
             : singleLead ? [singleLead.id]
             : null
    );
    // The template goes into the textarea AS SAVED, placeholders and all. It
    // used to be rendered here, once, with `singleLead` - null for a group -
    // so every recipient of a group send got "לקוחה יקרה" while a send from
    // the drawer got her real name. The route now renders per recipient
    // (app/api/leads/send-bulk/route.js), and the modal shows her a preview
    // for the first recipient so she still sees a real message, not braces.
    setBulkMessage(tpl || "");
    setBulkResult(null); setBulkError(""); setBulkStep("compose"); setBulkConfirmConsent(false);
  };
  const closeBulk = () => {
    setBulkStatus(null); setBulkStep("compose"); setBulkMessage("");
    setBulkResult(null); setBulkError(""); setBulkLeadIds(null); setBulkConfirmConsent(false);
  };
  // Called when she taps a prepared chat link: only then does the lead read as contacted.
  const markLeadContacted = async (leadId) => {
    if(!leadId) return;
    if(bulkResult?.results?.some(r=>r.leadId===leadId&&r.marked)) return;
    setBulkResult(prev=>prev?{...prev,results:prev.results.map(r=>r.leadId===leadId?{...r,marked:true}:r)}:prev);
    try{
      const res=await fetch("/api/leads/mark-contacted",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({leadIds:[leadId]})});
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.success){ toast(data?.error||tr("לא הצלחנו לסמן שיצרת קשר"),"error"); return; }
      const nowIso=data.at||new Date().toISOString();
      const stamp=(l)=>({...l,last_contacted_at:nowIso,first_contacted_at:l.first_contacted_at||nowIso,contact_attempts:(Number(l.contact_attempts)||0)+1});
      setLeads(prev=>prev.map(l=>l.id===leadId?stamp(l):l));
      setSelectedLead(prev=>(prev&&prev.id===leadId)?stamp(prev):prev);
    }catch{ /* the chat is open either way */ }
  };
  // Reuses the SAME API route as the standalone leads screen
  // (app/api/leads/send-bulk/route.js). The route resolves the tenant from the
  // authenticated session and sends a REAL WhatsApp to every lead with a phone
  // in the given status — hence the explicit confirm step before we call it.
  const confirmBulkSend = async () => {
    if(!bulkStatus||!bulkMessage.trim()) return;
    setBulkStep("sending"); setBulkError("");
    try{
      const res=await fetch("/api/leads/send-bulk",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          status:bulkStatus,
          message:bulkMessage.trim(),
          // Only present for a single-lead send; omitted for a group send.
          ...(bulkLeadIds?{leadIds:bulkLeadIds}:{}),
          ...(bulkConfirmConsent?{confirmedConsent:true}:{}),
        }),
      });
      const data=await res.json().catch(() => ({}));
      if(!res.ok||!data.success){
        setBulkError(data.error||tr("ההודעה לא נשלחה, אפשר לנסות שוב")); setBulkStep("confirm"); return;
      }
      setBulkResult({queued:data.queued??0,failed:data.failed??0,skipped_no_phone:data.skipped_no_phone??0,skipped_no_consent:data.skipped_no_consent??0,results:data.results||[]});
      // The contact trail is stamped when she TAPS a chat link (markLeadContacted), not here:
      // nothing has been sent yet, only prepared.
      setBulkStep("result");
    }catch(err){
      setBulkError(tr("אין חיבור. ההודעה לא נשלחה, אפשר לנסות שוב")); setBulkStep("confirm");
    }
  };

  const handleConvertLead = (lead) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("המרת פנייה ללקוחה"),
      message: tr("להמיר את {0} ללקוחה רשומה?", [lead.name]),
      confirmText: tr("המרה"),
      onConfirm: async () => {
        // The tenant is derived HERE, in this function.
        //
        // tenantField is not a component-level variable - handleSave,
        // importServices and importAppointments each declare their own local
        // copy. Spreading `...tenantField` here without declaring it threw
        // ReferenceError inside this async callback, where nothing awaited it:
        // the dialog opened, the confirm did nothing, no client appeared and no
        // error surfaced. tsc passes that happily, because it does not resolve
        // identifiers in a .jsx file.
        //
        // Same fallback chain as the other three, and the same omit-rather-
        // than-send-null behaviour so a missing tenant never regresses below
        // the database default.
        const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
        const tid = rpcTenant || settings?.tenant_id || null;
        const tenantField = tid ? { tenant_id: tid } : {};
        console.log(`[convert-lead] TENANT FILTER: tenant_id = ${tid ?? "(omitted — DB default)"} | lead ${lead.id}`);
        const {data:cd,error:ce}=await supabase.from("clients").insert([{name:lead.name,phone:lead.phone||"",skinType:"",notes:`הגיעה מפנייה. מקור: ${sourceLabelHe(lead.source)}`,status:"active",...tenantField}]).select();
        if(ce){handleDbError(ce, "convert lead -> create client"); return;}
        if(!cd||!cd[0]){toast(couldNotHe("להמיר את זה"),"error");return;}
        const {data:ld, error:le}=await supabase.from("leads").update({status:"closed",converted_at:new Date().toISOString(),client_id:cd[0].id}).eq("id",lead.id).select();
        if(le){handleDbError(le, "convert lead -> update lead"); return;}
        setClients(prev=>[...prev,cd[0]]);
        if(ld&&ld[0])setLeads(prev=>prev.map(l=>l.id===lead.id?ld[0]:l));
        setSelectedLead(null);
        // Next step: offer to book her first appointment, pre-filled with the
        // service the lead already told us (service_interest) — no re-entry, and
        // the conversion no longer dead-ends at a toast.
        const nc=cd[0], svcName=lead.service_interest||"";
        toast(tr("{0} הומרה ללקוחה", [lead.name]), "success", { label:tr("קבעי תור"), onClick:()=>{
          const svc=activeServices.find(s=>s.name===svcName);
          setEditingAppointmentId(null);
          setNewAppt({clientId:nc.id,name:nc.name,service:svc?.name||svcName||"",duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});
          setApptNote("");setShowModal(true);
        }});
      },
    });
  };

  // The follow-up date, same treatment as the status chips above and for the
  // same reason - it is the other silent write in the lead drawer. A date
  // picker is worse off than a chip, in fact: the field shows the new date the
  // moment it is picked whether or not anything was saved, so there was no
  // signal at all to distinguish a successful write from a failed one.
  const handleSetReminder = async (lead,date) => {
    if (guardWrite()) return;
    if (isBusy("leadReminder")) return;
    const prevDate = lead.reminder_date || "";
    if (date === prevDate) return;
    const applyDate = (d) => {
      setLeads(prev => prev.map(l => l.id === lead.id ? {...l, reminder_date:d} : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? {...prev, reminder_date:d} : prev);
    };
    applyDate(date);
    setBusyKey("leadReminder", true);
    try {
      const {data,error}=await supabase.from("leads").update({reminder_date:date}).eq("id",lead.id).select();
      if(error){ applyDate(prevDate); handleDbError(error, "set reminder"); return; }
      if(!data||!data[0]){ applyDate(prevDate); toast(couldNotHe("לשמור את התזכורת"),"error"); return; }
      const row = data[0];
      setLeads(prev => prev.map(l => l.id === lead.id ? row : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? row : prev);
      // Clearing the field is a real action and gets its own confirmation.
      toast(date ? tr("תזכורת מעקב נקבעה ל-{0}", [date]) : tr("תזכורת המעקב בוטלה"));
    } finally {
      setBusyKey("leadReminder", false);
    }
  };/* @section-end */
  return { closeBulk, confirmBulkSend, handleConvertLead, handleSaveLead, handleSetReminder, handleUpdateLeadStatus,
    markLeadContacted, openBulk };
}

"use client";
// app/sections/useAppointmentFormSection.jsx — part of the owner's app: 143 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { startMinute, endMinute, startFields } from "@/lib/apptTime";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { recurrenceDates, shortDates } from "@/lib/reliability";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";
import { tr } from "@/lib/i18n/tr";
import { sameStaff } from "@/lib/team";

export function useAppointmentFormSection(ctx) {
  const {
    activeServices, appointments, apptBufferOf, apptBuffersApply, apptDeposit, apptEffectiveStart, apptNote,
    apptRepeat, apptStaff, apptStaffWrite, askConfirm, clients, editingAppointmentId, editOrigRef, guardWrite,
    handleDbError, isBusy, newAppt, newApptBuffer, setAppointments, setApptAllServices, setApptClientQuery,
    setApptMoreOpen, setApptNote, setApptRepeat, setBusyKey, setClients, setDepositLink, setEditingAppointmentId,
    setNewAppt, setShowModal, settings, team, teamCal, toast,
  } = ctx;
  /* @section-body */const handleClientSelect = (clientId) => {
    const c=clients.find(c=>String(c.id)===String(clientId));
    setNewAppt(prev=>({...prev,clientId,name:c?c.name:""}));
  };

  const handleServiceSelect = (svcName) => {
    const svc=activeServices.find(s=>s.name===svcName);
    setNewAppt(prev=>({...prev,service:svcName,duration:svc?.duration||60,price:svc?.price||0}));
  };

  const closeApptModal = () => {
    setShowModal(false);
    setEditingAppointmentId(null);
    setApptClientQuery("");
    setApptMoreOpen(false);
    setApptAllServices(false);
    setApptRepeat({on:false, everyWeeks:3, count:6});
  };

  const handleSave = async () => {
    if (guardWrite()) return;
    if(!newAppt.name.trim()){toast(tr("איך קוראים ללקוחה? חסר שם"),"error");return;}
    // STAGE C: refuse to double-book. The new appointment occupies
    // [start, start+duration) minutes; reject if it overlaps any non-cancelled
    // appointment already on that date. (Runs before the busy flag is set.)
    {
      const newStart = apptEffectiveStart;
      // Buffers included (lib/serviceBuffer.ts): same test as slotIsTaken above.
      const newEnd = newStart + Number(newAppt.duration||0) + newApptBuffer;
      const clash = appointments.some(a=>{
        if(a.id===editingAppointmentId) return false; // don't clash with self when editing
        if(a.date!==newAppt.date || a.confirmation_status==="cancelled") return false;
        if(teamCal && !sameStaff(a, apptStaff, team.staff)) return false; // another person's client: not a clash
        const bs = startMinute(a), rawEnd = endMinute(a); if(bs===null||rawEnd===null) return false;
        const be = rawEnd + (apptBuffersApply ? apptBufferOf(a) : 0);
        return newStart < be && bs < newEnd;
      });
      if(clash){ toast(tr("השעה הזו כבר תפוסה"),"error"); return; }
    }
    if(isBusy("saveAppt")) return;
    setBusyKey("saveAppt", true);
    try {
      // Resolve the tenant and stamp it on the inserts so the row satisfies the
      // appointments/clients RLS WITH CHECK (tenant_id = get_user_tenant_id())
      // even if the table's column default isn't applied. Mirrors
      // handleSaveSettings. If the tenant can't be resolved (rare rpc hiccup) we
      // omit the field rather than send null, so we never regress below the DB
      // default behavior.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      let clientId=newAppt.clientId;
      if(!clientId){
        const {data:nc,error:ce}=await supabase.from("clients").insert([{name:newAppt.name,phone:"",skinType:"",notes:"",status:"active",...tenantField}]).select();
        if(ce){handleDbError(ce, "create client"); return;}
        if(nc?.[0]){clientId=nc[0].id;setClients(prev=>[...prev,nc[0]]);}
      }
      const svcColor=activeServices.find(s=>s.name===newAppt.service)?.color||DEFAULT_SERVICE_COLOR;
      if(editingAppointmentId){
        // EDIT/reschedule: update only the editable fields on the existing row. A NEW day or time is a time the client has not
        // agreed to: the "confirmed" mark and the sent reminder belong to the old one, so both are reset and the next reminder asks
        // again (2026-10-20 audit). A note, price or name change keeps them.
        const orig=editOrigRef.current;
        const moved=!!orig && (orig.date!==newAppt.date || orig.start!==apptEffectiveStart);
        // A move (date, time, length or service: apptBuffersApply) stores the buffer it was just checked with. An edit that
        // does not move it leaves buffer_minutes alone, so it is never refused over a buffer.
        const patch={...apptStaffWrite(),date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,...(moved?{confirmation_status:"pending",confirmation_sent:false}:{}),...(apptBuffersApply?apptBufferField(newApptBuffer):{})};
        const {data,error}=await writeWithApptBuffer(patch, (r) => supabase.from("appointments").update(r).eq("id",editingAppointmentId).select());
        if(error){handleDbError(error, "update appointment"); return;}
        // Zero rows back means nothing was saved (deleted on another device, or not hers): say so instead of "updated", and never put
        // an undefined row into the calendar.
        if(!data?.length){toast(tr("התור לא נמצא, אולי נמחק במכשיר אחר. כדאי לרענן את היומן."),"error");return;}
        setAppointments(prev=>prev.map(a=>a.id===editingAppointmentId?data[0]:a));
        setApptNote("");closeApptModal();
        toast(tr("התור עודכן בהצלחה"));
      } else if (apptRepeat.on && Number(apptRepeat.count) > 1) {
        // RECURRING. One row per date, inserted one at a time so each can be
        // judged on its own: a date that clashes with something already in
        // the calendar - or that the database's overlap constraint refuses -
        // is skipped and NAMED in the summary, never silently dropped. The
        // rows share a series_id (the same column personal events use) so
        // the series can be found again.
        const dates = recurrenceDates(newAppt.date, apptRepeat.everyWeeks, apptRepeat.count);
        const seriesId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : null;
        const base={...apptStaffWrite(),...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false,...(seriesId?{series_id:seriesId}:{}),...tenantField,...apptBufferField(newApptBuffer)};
        // Buffers included, the same rule as a single booking: the database refuses the rest anyway (appointments_no_overlap).
        const start = apptEffectiveStart, end = start + Number(newAppt.duration||0) + newApptBuffer;
        const clashed = [], saved = [];
        let seriesStopped = false;
        for (const date of dates) {
          const localClash = appointments.some(a=>{
            if(a.date!==date || a.confirmation_status==="cancelled") return false;
            if(teamCal && !sameStaff(a, apptStaff, team.staff)) return false;
            const bs=startMinute(a), rawEnd=endMinute(a); if(bs===null||rawEnd===null) return false;
            return start < rawEnd + apptBufferOf(a) && bs < end;
          });
          if (localClash) { clashed.push(date); continue; }
          const {data,error}=await writeWithApptBuffer([{...base,date}], (r) => supabase.from("appointments").insert(r).select());
          if (error) {
            // 23P01 is appointments_no_overlap, 23505 the active-slot index:
            // something landed there since the calendar loaded. Same answer.
            if (error.code==="23P01" || error.code==="23505") { clashed.push(date); continue; }
            handleDbError(error, "create appointment"); seriesStopped = true; break;
          }
          if (data && data[0]) saved.push(data[0]);
        }
        if (saved.length) setAppointments(prev=>[...prev,...saved]);
        setApptNote("");closeApptModal();
        if (clashed.length) {
          askConfirm({
            title: tr("נקבעו {0} מתוך {1} תורים", [saved.length, dates.length]),
            message: tr("התאריכים האלה התנגשו עם משהו שכבר ביומן ולא נקבעו: {0}. אפשר לקבוע אותם ידנית בשעה אחרת.", [shortDates(clashed)]),
            confirmText: tr("הבנתי"),
            cancelText: tr("סגירה"),
          });
        } else if (seriesStopped) {
          // A database error ended the series part-way: never end on a success toast that overstates what was saved.
          toast(tr("נקבעו {0} מתוך {1} תורים. השאר לא נשמרו, אפשר לנסות שוב.", [saved.length, dates.length]), "error");
        } else {
          toast(tr("נקבעו {0} תורים, כל {1}", [saved.length, apptRepeat.everyWeeks===1?"שבוע":`${apptRepeat.everyWeeks} שבועות`]));
        }
      } else {
        const appt={...apptStaffWrite(),date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false,...tenantField,...apptBufferField(newApptBuffer)};
        const {data,error}=await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
        if(error){handleDbError(error, "create appointment"); return;}
        if(data)setAppointments(prev=>[...prev,data[0]]);
        const wantDeposit = apptDeposit && data && data[0];
        setApptNote("");closeApptModal();
        toast(tr("התור נשמר בהצלחה"));
        // "Request deposit": hold the booking for 30 minutes and hand her the Grow payment link to send (app/api/grow/deposit/request).
        if (wantDeposit) {
          try {
            const r = await fetch("/api/grow/deposit/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: String(data[0].id) }) });
            const j = await r.json().catch(() => null);
            if (r.ok && j && j.success) { setDepositLink({ url: j.url, amount: j.amount, minutes: j.minutes, clientName: j.clientName, phone: j.phone }); setAppointments(prev => prev.map(a => String(a.id) === String(data[0].id) ? { ...a, confirmation_status: "pending" } : a)); window.dispatchEvent(new Event("kalmea:holds-changed")); }
            else toast((j && j.error) || tr("התור נשמר, אבל לא הצלחנו לבקש מקדמה"), "error");
          } catch { toast(tr("התור נשמר, אבל לא הצלחנו לבקש מקדמה"), "error"); }
        }
      }
    } finally {
      setBusyKey("saveAppt", false);
    }
  };/* @section-end */
  return { closeApptModal, handleClientSelect, handleSave, handleServiceSelect };
}

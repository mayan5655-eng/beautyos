"use client";
// app/screens/ApptModal.jsx — {showModal && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ApptModal> in app/beautyos.jsx (the check fails until both sides agree).
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import { fmtTime } from "@/lib/apptTime";
import { isPersonal } from "@/lib/calendarKind";
import { NO_SHOW, canMarkNoShow, recurrenceDates, shortDates } from "@/lib/reliability";
import { TIGHT_GAP_MINUTES } from "@/lib/scheduleGaps";
import FeeQuestions from "../FeeQuestions";
import HoldBadge from "../HoldBadge";
import ApptDepositToggle from "../ApptDepositToggle";
import { tr, uiDir } from "@/lib/i18n/tr";
import { activeStaff as teamActiveStaff } from "@/lib/team";

export default function ApptModal({ ctx }) {
  const {
    activeServices, appointments, apptAllServices, apptClientMatches, apptClientQuery, apptDayHours, apptDeposit,
    apptEffectiveStart, apptEndMin, apptGapWarning, apptKeepOwnTime, apptMoreOpen, apptNote, apptOutsideHours,
    ApptProtocolCard, apptRepeat, apptSelectedOutside, apptSelectedTaken, apptSlotOptions, apptStaff,
    apptStartMin, apptTimeTouched, clients, closeApptModal, editingAppointmentId, feeCharged, fmtHM, fmtPhone,
    handleClientSelect, handleDelete, handleFinishTreatment, handleOpenCashier, handleSave, handleServiceSelect,
    handleStartTreatment, isBusy, markNoShow, newAppt, NO_SERVICES_HINT, pc, pcDeep, pcGrad, pcTint,
    receiptForAppt, sendReminderToClient, services, servicesByUse, setApptAllServices, setApptClientQuery,
    setApptDeposit, setApptMoreOpen, setApptNote, setApptRepeat, setApptStaff, setClientTab, setNewAppt,
    setSelectedClient, setShowReceipt, settings, setupHint, slotIsTaken, team, teamCal, teamOwnerId, toast,
    today,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={closeApptModal} width={360} zIndex={1000} className="pop-in" title={editingAppointmentId?tr("עריכת תור"):tr("קביעת תור חדש")}>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 {!editingAppointmentId&&!apptRepeat.on&&<ApptDepositToggle serviceName={newAppt.service} serviceRequires={(services.find(sv=>sv.name===newAppt.service)||{}).requires_deposit===true} value={apptDeposit} onChange={setApptDeposit}/>}
 {/* Editing an existing visit: the agenda card's own actions, at the top of the sheet (2026-11-03 UX review). Same handlers. */}
 {editingAppointmentId&&(()=>{
   const cur=appointments.find(a=>a.id===editingAppointmentId);
   if(!cur||isPersonal(cur)) return null;
   const cl=cur.client_id?clients.find(c=>String(c.id)===String(cur.client_id)):null;
   const curLive=cur.confirmation_status!=="cancelled"&&cur.confirmation_status!==NO_SHOW;
   const paidRcpt=receiptForAppt(cur);
   const b={display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:44,padding:"0 12px",borderRadius:"var(--r-full)",border:"1px solid var(--line-2)",background:"var(--surface)",color:"var(--ink)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"};
   return (
 <div data-testid="appt-edit-actions" style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
   {/* A running timer takes the main slot ("⏹ סיימתי"); otherwise payment does. "▶ התחלתי" sits quietly at the bottom. */}
   {curLive&&cur.actual_start_at&&!cur.actual_end_at&&<button type="button" onClick={()=>handleFinishTreatment(cur)} style={{...b,background:"var(--pc-tint, var(--surface-2))",borderColor:"var(--pc, var(--line-2))"}}>{tr("⏹ סיימתי")}</button>}
   {paidRcpt
     ?<button type="button" onClick={()=>{closeApptModal();setShowReceipt(paidRcpt);}} style={{...b,color:"var(--success)",borderColor:"var(--success)"}}>{tr("✓ שולם")}</button>
     :curLive&&<button type="button" onClick={()=>{closeApptModal();handleOpenCashier(cur);}} style={(cur.actual_start_at&&!cur.actual_end_at)?b:{...b,background:"var(--pc-tint, var(--surface-2))",borderColor:"var(--pc, var(--line-2))"}}>{tr("₪ לתשלום")}</button>}
   {curLive&&(cl?.phone||cur.client_phone)&&<button type="button" onClick={()=>{closeApptModal();sendReminderToClient(cur);}} disabled={isBusy("sendReminder")} style={b}>{tr("תזכורת")}</button>}
   {cl&&<button type="button" onClick={()=>{closeApptModal();setSelectedClient(cl);setClientTab("info");}} style={b}>{tr("כרטיס לקוחה")}</button>}
   {cur.confirmation_status!=="cancelled"&&<button type="button" onClick={()=>{closeApptModal();handleDelete(cur);}} style={{...b,color:"var(--danger)"}}>{tr("ביטול התור")}</button>}
 </div>
   );
 })()}
 {editingAppointmentId&&<HoldBadge appointmentId={editingAppointmentId}/>}
 {editingAppointmentId&&<FeeQuestions appointmentId={editingAppointmentId} pc={pc} pcTint={pcTint} toast={toast} onCharged={feeCharged}/>}

              {/* WHO. One control for one decision.
                  This was a native <select> of every client PLUS a separate
                  "or type a new name" input. Two controls, no indication of
                  which one she was meant to use, and the select was an
                  unsearchable scroll wheel once she had more than a screenful
                  of clients. The search covers both cases: existing names
                  filter as she types, and whatever she typed is offered as a
                  new client on the last row.

                  A new client is still created at save, not here - an
                  abandoned booking must not leave an orphan client row
                  behind. */}
              {newAppt.name ? (
 <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:"var(--r-sm)",background:pcTint,border:`1px solid ${pc}`}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{newAppt.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{newAppt.clientId?tr("לקוחה קיימת"):editingAppointmentId?tr("ללא כרטיס לקוחה"):tr("לקוחה חדשה, תיווצר בשמירה")}</p>
 </div>
 <button onClick={()=>{setNewAppt({...newAppt,clientId:"",name:""});setApptClientQuery("");}} className="icon-btn sm" style={{}} title={tr("בחירת לקוחה אחרת")} aria-label={tr("בחירת לקוחה אחרת")}>✕</button>
 </div>
              ) : null}
              {/* Her own notes on THIS client, surfaced the moment the
                  appointment opens - not one tap further behind "כרטיס
                  לקוחה". Allergy, preferred shape, "quiet today" - things she
                  used to hold in memory for every client, now in front of
                  her without asking for it. */}
              {newAppt.clientId&&(()=>{
                const c=clients.find(cl=>String(cl.id)===String(newAppt.clientId));
                if(!c?.notes?.trim()) return null;
                return (
 <div style={{padding:"9px 12px",borderRadius:"var(--r-sm)",background:"var(--surface-2)",border:"1px solid var(--line-2)"}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:700,color:"var(--ink-3)",marginBottom:3}}>{tr("הערות על הלקוחה")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{c.notes}</p>
 </div>
                );
              })()}
              {!newAppt.name && (
 <div>
 <input value={apptClientQuery} onChange={e=>setApptClientQuery(e.target.value)} placeholder={tr("שם הלקוחה או טלפון")} aria-label={tr("חיפוש לקוחה")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"10px 12px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
                {apptClientQuery.trim()&&(
 <div style={{marginTop:5,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",overflow:"hidden"}}>
                  {apptClientMatches.map(c=>(
 <button key={c.id} onClick={()=>{handleClientSelect(String(c.id));setApptClientQuery("");}} style={{display:"block",width:"100%",textAlign:"right",background:"var(--surface)",border:"none",borderBottom:"1px solid var(--line)",padding:"10px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",cursor:"pointer",color:"var(--ink)"}}>
 <span style={{fontWeight:600}}>{c.name}</span>
                    {c.phone&&<span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginRight:8,direction:"ltr",display:"inline-block"}}>{fmtPhone(c.phone)}</span>}
 </button>
                  ))}
 <button onClick={()=>{setNewAppt({...newAppt,clientId:"",name:apptClientQuery.trim()});setApptClientQuery("");}} style={{display:"block",width:"100%",textAlign:"right",background:pcTint,border:"none",padding:"10px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",cursor:"pointer",color:pcDeep,fontWeight:700}}>
                  {tr("לקוחה חדשה:")} {apptClientQuery.trim()}
 </button>
 </div>
                )}
 </div>
              )}

              {/* WHO, in the team calendar only: the clash check and the free times below are this person's. */}
              {teamCal&&(()=>{
                const opts=teamActiveStaff(team.staff);
                const cur=team.staff.find(s=>s.id===apptStaff);
                const list=cur&&!cur.active?[...opts,cur]:opts;
                return(
 <div data-testid="appt-staff" style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>{tr("מטפלת")}</p>
 <select aria-label={tr("מטפלת")} value={apptStaff||teamOwnerId||""} onChange={e=>setApptStaff(e.target.value)} style={{width:"100%",minHeight:44,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}>
   {list.map(s=><option key={s.id} value={s.id}>{s.name}{s.is_owner?` ${tr("(את)")}`:""}{!s.active?` · ${tr("לא פעילה")}`:""}</option>)}
 </select>
 </div>);
              })()}
              {/* WHEN. Already correct when she came from a calendar slot, so
                  it stays a single row she confirms rather than fills. */}
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>{tr("תאריך")}</p><input type="date" value={newAppt.date} onChange={e=>setNewAppt({...newAppt,date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>{tr("שעה")}</p>{apptDayHours?(<select value={apptEffectiveStart} onChange={e=>{apptTimeTouched.current=true;setNewAppt({...newAppt,startMinute:Number(e.target.value),hour:Math.floor(Number(e.target.value)/60)});}} style={{width:"100%",border:apptSelectedTaken?"1.5px solid var(--danger)":apptSelectedOutside?"1.5px solid var(--warning)":"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",background:apptSelectedTaken?"rgba(224,91,111,0.08)":apptSelectedOutside?"rgba(242,184,75,0.14)":"var(--surface-2)",color:apptSelectedTaken?"var(--danger)":apptSelectedOutside?"var(--ink)":"inherit",fontWeight:(apptSelectedTaken||apptSelectedOutside)?700:400,direction:"ltr",textAlign:"center"}}>{apptKeepOwnTime&&<option key={`own-${apptEffectiveStart}`} value={apptEffectiveStart}>{fmtTime(apptEffectiveStart)} {tr("(השעה הנוכחית)")}</option>}{apptSlotOptions.map(m=>{const taken=slotIsTaken(m);const outside=apptOutsideHours(m);return <option key={m} value={m} disabled={taken} style={taken?{color:"#E05B6F",fontWeight:700}:outside?{color:"#B07A1E",fontWeight:700}:{color:"var(--ink)",fontWeight:400}}>{fmtTime(m)}{outside?tr(" ✦ מחוץ לשעות"):""}{taken?tr(" ⛔ תפוס"):""}</option>;})}</select>):(<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600,padding:"9px 0",textAlign:"center"}}>{tr("סגור ביום זה")}</p>)}</div>
 </div>
 {!editingAppointmentId && newAppt.date && newAppt.date<today && <p role="status" data-testid="appt-past-date" style={{fontSize:"var(--t-sm)",color:"#8A5A00",marginTop:6,fontWeight:600}}>{tr("התאריך כבר עבר")}</p>}

              {/* WHAT. Chips, most-used first, instead of a <select> that made
                  her tap, scroll and tap again for the treatment she performs
                  forty times a month. The order follows her real booking
                  history, so it tracks what she is actually doing this season.
                  The long tail is one tap away, never removed. */}
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{tr("טיפול")}</p>
                {activeServices.length===0?(
                  setupHint(NO_SERVICES_HINT)
                ):(<>
 <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {(apptAllServices?servicesByUse:servicesByUse.slice(0,6)).map(sv=>{
                    const sel=newAppt.service===sv.name;
                    return (
 <button key={sv.name} onClick={()=>handleServiceSelect(sv.name)} style={{padding:"8px 12px",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:sel?700:600,cursor:"pointer",fontFamily:"inherit",border:sel?"1px solid transparent":"1px solid var(--line-2)",background:sel?pcGrad:"var(--surface)",color:sel?"var(--pc-contrast)":"var(--ink-2)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sv.name}</button>
                    );
                  })}
                  {servicesByUse.length>6&&(
 <button onClick={()=>setApptAllServices(v=>!v)} style={{padding:"8px 12px",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:`1px dashed ${pc}`,background:"transparent",color:pcDeep}}>{apptAllServices?tr("פחות"):tr("עוד {0}", [servicesByUse.length-6])}</button>
                  )}
 </div>
                </>)}
 </div>

 <div style={{display:"flex",gap:4}}>{(()=>{const base=[30,45,60,90,120];const svcDur=Number((services.find(sv=>sv.name===newAppt.service)||{}).duration)||0;return svcDur>0&&!base.includes(svcDur)?[...base,svcDur].sort((x,y)=>x-y):base;})().map(d=><button key={d} onClick={()=>setNewAppt({...newAppt,duration:d})} style={{flex:1,minWidth:0,minHeight:44,padding:"8px 0",border:"1px solid",borderColor:newAppt.duration===d?"transparent":"var(--line-2)",borderRadius:"var(--r-sm)",background:newAppt.duration===d?pcGrad:"var(--surface)",color:newAppt.duration===d?"var(--pc-contrast)":"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}′</button>)}</div>
              {apptDayHours&&<p style={{fontSize:"var(--t-xs)",color:apptSelectedTaken?"var(--danger)":apptSelectedOutside?"#8A5D06":pcDeep,fontWeight:600,textAlign:"center",background:apptSelectedTaken?"rgba(224,91,111,0.08)":apptSelectedOutside?"rgba(242,184,75,0.14)":"var(--pc-tint)",borderRadius:"var(--r-sm)",padding:"6px 0",margin:"1px 0"}}>{fmtHM(apptStartMin)}–{fmtHM(apptEndMin)} · {Number(newAppt.duration)||0} {tr("דק׳")}</p>}
              {/* Spelled out, not just coloured. The band above changes shade
                  when the hour is outside, but a shade is not a sentence, and
                  she is about to commit to being at work when she thought she
                  was closed. It names her actual hours so the comparison does
                  not have to be made from memory. */}
              {apptSelectedOutside&&!apptSelectedTaken&&apptDayHours&&(
 <p style={{fontSize:"var(--t-sm)",color:"#8A5D06",fontWeight:700,background:"rgba(242,184,75,0.14)",border:"1px solid var(--warning)",borderRadius:"var(--r-sm)",padding:"7px 10px",textAlign:"center",margin:"1px 0"}}>
                  {tr("✦ מחוץ לשעות הפעילות שלך (")}{fmtHM(apptDayHours.open*60)}–{fmtHM(apptDayHours.close*60)})
 </p>
              )}
              {apptSelectedTaken&&<p style={{fontSize:"var(--t-sm)",color:"var(--surface)",fontWeight:700,textAlign:"center",background:"var(--danger)",borderRadius:"var(--r-sm)",padding:"7px 0",margin:"1px 0",boxShadow:"var(--shadow-sm)"}}>{tr("השעה תפוסה, בחרי שעה אחרת")}</p>}
              {/* Allowed by the database (back-to-back is not a clash), still
                  worth saying: a turnover under TIGHT_GAP_MINUTES is a real
                  cost she pays later, not now while she's picking the time. */}
              {apptGapWarning&&(
 <p style={{fontSize:"var(--t-sm)",color:"#8A5D06",fontWeight:700,background:"rgba(242,184,75,0.14)",border:"1px solid var(--warning)",borderRadius:"var(--r-sm)",padding:"7px 10px",textAlign:"center",margin:"1px 0"}}>
                  {tr("⏱ פחות מ-")}{TIGHT_GAP_MINUTES} {tr("דקות")} {apptGapWarning==="before"?tr("מהתור הקודם"):tr("עד התור הבא")}{tr(", אין זמן להתאוורר בין הטיפולים")}
 </p>
              )}

              {/* Price and note. Behind a disclosure because the price comes
                  from the treatment and is almost never overridden, and the
                  note is for the exception. Neither is removed - both are one
                  tap away, and the summary line says when there is something
                  in them, so nothing can be hidden and forgotten. */}
 {/* The treatment's protocol (app/ApptProtocolCard): an existing appointment only, closed by default, nothing when the service has none. */}
 {editingAppointmentId&&<ApptProtocolCard settings={settings} services={services} serviceName={newAppt.service} clientId={newAppt.clientId||null} clientName={newAppt.name} clientPhone={clients.find(x=>String(x.id)===String(newAppt.clientId))?.phone||null} appointmentId={editingAppointmentId} date={newAppt.date} toast={toast}/>}
 <button onClick={()=>setApptMoreOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",padding:"4px 2px",cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep}}>{tr("פרטים נוספים")}</span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{apptMoreOpen?tr("סגירה"):`₪${Number(newAppt.price)||0}${apptNote.trim()?" · הערה":""}`}</span>
 </button>
              {apptMoreOpen&&(<>
 <input type="number" value={newAppt.price||""} onChange={e=>setNewAppt({...newAppt,price:e.target.value})} placeholder={tr("₪ מחיר")} aria-label={tr("מחיר")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)",textAlign:"right"}}/>
 <textarea value={apptNote} onChange={e=>setApptNote(e.target.value)} placeholder={tr("הערה")} aria-label={tr("הערה")} rows={2} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)",resize:"none"}}/>
              </>)}

              {/* RECURRING. New appointments only: the regular client, "every
                  three weeks, six times". Every date is checked against the
                  calendar and the overlap constraint; the ones that clash are
                  named back to her, never silently skipped. */}
              {!editingAppointmentId&&(
 <div style={{borderTop:"1px solid var(--line)",paddingTop:8}}>
 <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:700,cursor:"pointer",minHeight:36}}>
 <input type="checkbox" checked={apptRepeat.on} onChange={e=>setApptRepeat({...apptRepeat,on:e.target.checked})} style={{width:18,height:18,accentColor:pc}}/>
                    {tr("תור חוזר")}
 </label>
                  {apptRepeat.on&&(
 <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("כל")}</span>
 <select value={apptRepeat.everyWeeks} onChange={e=>setApptRepeat({...apptRepeat,everyWeeks:Number(e.target.value)})} aria-label={tr("כל כמה שבועות")} style={{minHeight:44,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}>
                        {[1,2,3,4,5,6,8].map(w=><option key={w} value={w}>{w===1?tr("שבוע"):tr("{0} שבועות", [w])}</option>)}
 </select>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>·</span>
 <select value={apptRepeat.count} onChange={e=>setApptRepeat({...apptRepeat,count:Number(e.target.value)})} aria-label={tr("כמה פעמים")} style={{minHeight:44,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}>
                        {[2,3,4,6,8,10,12].map(n=><option key={n} value={n}>{n} {tr("פעמים")}</option>)}
 </select>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",flexBasis:"100%"}}>{newAppt.date?tr("מ-{0} עד {1}, באותה שעה. תאריך שתפוס לא ייקבע ותקבלי רשימה.", [shortDates([newAppt.date]), shortDates(recurrenceDates(newAppt.date,apptRepeat.everyWeeks,apptRepeat.count).slice(-1))]):""}</span>
 </div>
                  )}
 </div>
              )}
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={closeApptModal} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{editingAppointmentId?tr("סגירה"):tr("ביטול")}</button>
 <button onClick={handleSave} disabled={isBusy("saveAppt")||!apptDayHours||apptSelectedTaken} className="primary-btn" style={{flex:2,padding:"11px 0",background:apptSelectedTaken?"var(--danger)":pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)",opacity:(apptDayHours&&!apptSelectedTaken)?1:0.6,cursor:(apptDayHours&&!apptSelectedTaken)?undefined:"not-allowed"}}>{isBusy("saveAppt")?<Spinner inline label={tr("שומרת")}/>:!apptDayHours?tr("סגור ביום זה"):apptSelectedTaken?tr("⛔ השעה תפוסה"):editingAppointmentId?tr("עדכון ✓"):(apptRepeat.on&&apptRepeat.count>1)?tr("קביעת {0} תורים ✓", [apptRepeat.count]):tr("שמירה ✓")}</button>
 </div>
              {/* Edit mode, past or today: the same real start/finish the
                  agenda card offers, for the appointment she has open here. */}
              {editingAppointmentId&&(()=>{
                const cur=appointments.find(a=>a.id===editingAppointmentId);
                if(!cur||isPersonal(cur)||cur.confirmation_status==="cancelled"||cur.confirmation_status===NO_SHOW||cur.date>today||cur.actual_end_at||cur.actual_start_at) return null;
                return (
 <button onClick={()=>handleStartTreatment(cur)} style={{width:"100%",marginTop:8,background:"none",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",color:"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:40}}>{tr("▶ התחלתי")}</button>
                );
              })()}
              {/* Edit mode, past or today: mark the client as not having come.
                  The same action the agenda card offers, for the appointment
                  she has open in front of her. */}
              {editingAppointmentId&&(()=>{const cur=appointments.find(a=>a.id===editingAppointmentId);return cur&&canMarkNoShow(cur,today)?(
 <button onClick={()=>{closeApptModal();markNoShow(cur);}} style={{width:"100%",marginTop:8,background:"none",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",color:"var(--danger)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:40}}>{tr("הלקוחה לא הגיעה")}</button>
              ):null;})()}
 </Sheet>/* @screen-end */
  );
}

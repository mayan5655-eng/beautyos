"use client";
// app/screens/SidebarPart.jsx — {!tillOnly && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <SidebarPart> in app/beautyos.jsx (the check fails until both sides agree).
import { startMinute, fmtApptTime } from "@/lib/apptTime";
import { isPersonal } from "@/lib/calendarKind";
import { NO_SHOW } from "@/lib/reliability";
import HoldBadge from "../HoldBadge";
import IntakeBadge from "../IntakeBadge";
import { apptStatus, APPT_STATUS_TONE_COLOR } from "@/lib/apptStatus";
import { tr, trv } from "@/lib/i18n/tr";

export default function SidebarPart({ ctx }) {
  const {
    clients, coldClients, entrySubtitle, getApptColor, getDaysSince, handleOpenCashier,
    handleSendAllConfirmations, handleSendConfirmation, leadsWithReminders, openNewAppt, pc, pcGrad, pcTint,
    setActiveTab, setClientTab, setSelectedClient, setSelectedLead, setShowLapsed, setShowMobileSidebar,
    todayAppts, todayEntries, tomorrowAppts, tomorrowCancelled, tomorrowConfirmed, tomorrowEntries,
    tomorrowPending,
  } = ctx;
  return (
    /* @screen-body */<aside className="sidebar-aside desktop-only" style={{order:2,width:195,background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.6)",borderRight:"1px solid var(--line)",padding:"14px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{tr("היום (")}{todayAppts.length})</p>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",background:"none",border:"none",fontSize:"var(--t-md)",cursor:"pointer",color:"var(--ink-3)"}}>✕</button>
 </div>
            {todayEntries.length===0?<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("אין תורים")}</p>
              :todayEntries.slice().sort((a,b)=>(startMinute(a)??0)-(startMinute(b)??0)).map(a=>(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--lavender-50),var(--surface))",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:"var(--r-sm)",padding:"7px 9px",marginBottom:5}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
                  {/* fmtApptTime, not hand-built from `hour`. This indexed
                      workingHours by (hour - working_hours_start) and fell back
                      to `hour + ":00"` — so a 14:30 appointment read "14:00" in
                      the Today panel, and any appointment outside her configured
                      opening hours fell through to that same wrong string. The
                      one display site the minutes migration missed; found while
                      auditing type sizes here. */}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{fmtApptTime(a)} · {a.service}</p>
                  <HoldBadge appointmentId={a.id}/>
                  <IntakeBadge appointmentId={a.id}/>
                  {!isPersonal(a)&&(()=>{const s0=apptStatus(a);return s0.key==="pending"?null:<span style={{fontSize:"var(--t-sm)",color:s0.key==="cancelled"?"var(--danger)":APPT_STATUS_TONE_COLOR[s0.tone],fontWeight:700}}>{trv(s0.label)}</span>;})()}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-md)",padding:"3px 9px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",marginTop:3,display:"block"}}>{tr("גבי")}</button>
 </div>
              ))}
 </div>

          {tomorrowEntries.length>0&&(
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{tr("מחר (")}{tomorrowAppts.length})</p>
 <button onClick={handleSendAllConfirmations} style={{background:"rgba(212,175,55,0.12)",color:pc,border:"none",borderRadius:"var(--r-md)",padding:"3px 8px",fontSize:"var(--t-xs)",cursor:"pointer",fontFamily:"inherit"}}>{tr("שליחה מרוכזת")}</button>
 </div>
 <div style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"6px 9px",marginBottom:6,fontSize:"var(--t-sm)"}}>
 <span style={{color:"var(--success)"}}>{tomorrowConfirmed} </span>
 <span style={{color:"var(--danger)"}}>{tomorrowCancelled} </span>
 <span style={{color:"var(--ink-2)"}}>⏳ {tomorrowPending}</span>
 </div>
              {tomorrowEntries.map(a=>{
                const client=clients.find(c=>String(c.id)===String(a.client_id));
                const confColor=a.confirmation_status==="confirmed"?"var(--success)":(a.confirmation_status==="cancelled"||a.confirmation_status===NO_SHOW)?"var(--danger)":"var(--ink-2)";
                return(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--surface-2),#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:"var(--r-sm)",padding:"6px 8px",marginBottom:5}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{entrySubtitle(a)}</p>
                    {!isPersonal(a)&&client?.phone&&!a.confirmation_sent&&a.confirmation_status!=="cancelled"&&a.confirmation_status!==NO_SHOW&&(
 <button onClick={()=>handleSendConfirmation(a)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:"3px 8px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",marginTop:3}}>{tr("שלחי תזכורת")}</button>
                    )}
                    {a.confirmation_sent&&<span style={{fontSize:"var(--t-sm)",color:confColor,fontWeight:700}}>{a.confirmation_status==="confirmed"?tr("אישרה"):a.confirmation_status==="cancelled"?tr("ביטלה"):a.confirmation_status===NO_SHOW?tr("לא הגיעה"):tr("נפתחה")}</span>}
 </div>
                );
              })}
 </div>
          )}

          {leadsWithReminders.length>0&&(
 <div>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:pc,marginBottom:5}}>{tr("תזכורות פניות")}</p>
              {leadsWithReminders.map(l=>(
 <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");setShowMobileSidebar(false);}} style={{background:"#FFF3E0",borderRadius:"var(--r-sm)",padding:"5px 9px",marginBottom:3,cursor:"pointer"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{l.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{l.reminder_date}</p>
 </div>
              ))}
 </div>
          )}

          {coldClients.slice(0,3).length>0&&(
 <div>
 <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:6,marginBottom:4}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)"}}>{tr("להתחדשות")}</p>
                {coldClients.length>3&&<button onClick={()=>{setShowLapsed(true);setShowMobileSidebar(false);}} style={{background:"none",border:"none",padding:0,fontSize:"var(--t-sm)",fontWeight:700,color:pc,cursor:"pointer",fontFamily:"inherit"}}>{tr("כל ה-")}{coldClients.length}</button>}
 </div>
              {[...coldClients].sort((a,b)=>getDaysSince(b.id)-getDaysSince(a.id)).slice(0,3).map(c=>(
 <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");setShowMobileSidebar(false);}} style={{fontSize:"var(--t-sm)",color:pc,marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}{tr("י)")}</div>
              ))}
 </div>
          )}

 <button onClick={openNewAppt}
            style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-xl)",padding:"11px 10px",minHeight:44,fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",boxShadow:"var(--shadow-accent)"}}>
            {tr("✦ קביעת תור")}
 </button>
 </aside>/* @screen-end */
  );
}

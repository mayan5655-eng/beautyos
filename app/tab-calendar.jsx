"use client";
// app/tab-calendar.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { dayHoursFrom } from "@/lib/businessHours";
import { ICON_CALENDAR } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import { fmtTime } from "@/lib/apptTime";
import { isPersonal, isAllDay } from "@/lib/calendarKind";
import { NO_SHOW, canMarkNoShow } from "@/lib/reliability";
import { durationOutcome } from "@/lib/durationDrift";

export default function CalendarTab(props) {
  const {
    DAYS_HE,
    WK_ROW_H,
    activeServices,
    appointments,
    calDay,
    calView,
    clients,
    copyPublicLink,
    dayLanes,
    entrySubtitle,
    formatDate,
    formatDateHe,
    getApptColor,
    handleApptClick,
    handleDelete,
    handleDeletePersonal,
    handleFinishTreatment,
    handleNewApptOnDate,
    handleOpenCashier,
    handleSlotAtMinute,
    handleStartTreatment,
    isBusy,
    markNoShow,
    openNewAppt,
    openPersonalEditor,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    sendReminderToClient,
    setApptNote,
    setCalDay,
    setCalView,
    setClientTab,
    setEditingAppointmentId,
    setNewAppt,
    setSelectedClient,
    setShowModal,
    setWeekStart,
    settings,
    today,
    weekAxis,
    weekDates,
    weekScrollRef,
    weekStart,
    weekSundayOf,
  } = props;
  return (
<>
            {appointments.length===0&&(
              <EmptyState icon="calendar" accent={pc} accentTint={pcTint}
                title="הלוח עדיין ריק"
                body="אפשר לקבוע תור בלחיצה על שעה פנויה בלוח, או מהכפתור כאן. תורים שנקבעים מעמוד ההזמנות הציבורי שלך מופיעים כאן לבד."
                actions={[
                  {label:"קביעת תור",onClick:openNewAppt},
                  {label:"העתקת קישור ההזמנות",onClick:()=>copyPublicLink("book")},
                ]}/>
            )}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div className={calView==="week"?undefined:"desktop-only"} style={{display:"flex",alignItems:"center",gap:10}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_CALENDAR} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>לוח שבועי</p>
 <h2 style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[6])}</h2>
 </div>
 </div>
 <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
 {/* Mobile-only day/week toggle. Hidden on desktop, so desktop always shows the week grid. */}
 <div className="mobile-only" style={{gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>setCalView("day")} style={{background:calView==="day"?pcGrad:"none",color:calView==="day"?"var(--pc-contrast)":"var(--ink-2)",border:"none",borderRadius:"var(--r-sm)",padding:"9px 16px",cursor:"pointer",fontSize:"var(--t-md)",fontWeight:600,fontFamily:"inherit"}}>יום</button>
 <button onClick={()=>setCalView("week")} style={{background:calView==="week"?pcGrad:"none",color:calView==="week"?"var(--pc-contrast)":"var(--ink-2)",border:"none",borderRadius:"var(--r-sm)",padding:"9px 16px",cursor:"pointer",fontSize:"var(--t-md)",fontWeight:600,fontFamily:"inherit"}}>שבוע</button>
 </div>
 <div className="desktop-only" style={{display:"flex",gap:10,fontSize:"var(--t-sm)",color:"var(--ink-2)",alignItems:"center"}}>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--success)"}}/>אישרה</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--danger)"}}/>ביטלה</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--danger)",opacity:0.5}}/>לא הגיעה</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--ink-3)"}}/>ממתין</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--ink-2)"}}/>אישי</span>
 </div>
 <div className={calView==="week"?undefined:"desktop-only"} style={{display:"flex",alignItems:"center",gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>{const d=weekSundayOf(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:"var(--r-sm)",padding:"7px 12px",cursor:"pointer",fontSize:"var(--t-md)",color:pc,fontFamily:"inherit"}}>←</button>
 <button onClick={()=>setWeekStart(new Date())} style={{background:"var(--pc-tint)",border:"none",borderRadius:"var(--r-sm)",padding:"7px 14px",cursor:"pointer",fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,fontFamily:"inherit"}}>היום</button>
 <button onClick={()=>{const d=weekSundayOf(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:"var(--r-sm)",padding:"7px 12px",cursor:"pointer",fontSize:"var(--t-md)",color:pc,fontFamily:"inherit"}}>→</button>
 </div>
 <button onClick={()=>openPersonalEditor(null,formatDate(calDay))} className={calView==="day"?"primary-btn desktop-only":"primary-btn"} style={{background:"var(--surface)",border:"1px solid var(--line-2)",color:"var(--ink-2)",padding:"10px 16px",fontSize:"var(--t-sm)"}}><Icon name="lock" size={14}/> אירוע אישי</button>
 <button className={calView==="day"?"primary-btn desktop-only":"primary-btn"} onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>✦ תור חדש</button>
 </div>
 </div>
 <div className={calView==="week"?"glass-card card-flush":"glass-card card-flush desktop-only"} style={{overflow:"hidden",maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
                {/* ONE implementation for phone and desktop.
                    It used to be two - an hour-cell grid for desktop and a chip
                    strip for phones - which is how the same bug gets fixed
                    twice and then diverges. The axis column is 34px and the
                    seven days share what is left, so 440px is enough without
                    horizontal scroll: names truncate rather than forcing the
                    column wider.
                    In RTL the first grid column renders on the RIGHT, which is
                    where the hour axis belongs. */}
 <div ref={weekScrollRef} style={{maxHeight:"72vh",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch"}}>

                  {/* Day headers. Sticky, so they stay readable while the hours
                      scroll under them. */}
 <div style={{display:"grid",gridTemplateColumns:"34px repeat(7,1fr)",position:"sticky",top:0,zIndex:3,borderBottom:"1px solid var(--line)",background:"linear-gradient(100deg,var(--lavender-100),var(--surface))"}}>
 <div/>
                    {weekDates.map((d,i)=>{
                      const isToday=formatDate(d)===today;
                      const dayAppts=appointments.filter(a=>a.date===formatDate(d));
                      const hasCancel=dayAppts.some(a=>a.confirmation_status==="cancelled");
                      const isClosed=!dayHoursFrom(settings,d.getDay());
                      return(
 <div key={i} onClick={()=>{setCalDay(d);setCalView("day");}} title={`יום ${DAYS_HE[d.getDay()]}`}
                          style={{padding:"7px 2px",textAlign:"center",cursor:"pointer",borderRight:i<6?"1px solid var(--line)":"none",background:isToday?"var(--pc-tint)":undefined,boxShadow:isToday?`inset 0 -2px 0 ${pc}`:undefined}}>
 <p style={{fontSize:"var(--t-sm)",color:isToday?pcDeep:"var(--ink-3)",fontWeight:isToday?700:600}}>{DAYS_HE[d.getDay()]}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-lg)",fontWeight:700,color:isToday?pc:"var(--ink)",lineHeight:1.25}}>{d.getDate()}</p>
                          {isClosed&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:700}}>סגור</p>}
                          {hasCancel&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600}}>ביטול</p>}
                          {/* Booking without hunting for empty space, and the
                              only booking affordance on a phone. */}
 <button aria-label={`תור חדש ליום ${DAYS_HE[d.getDay()]}`} title="תור חדש"
                            onClick={e=>{e.stopPropagation();handleNewApptOnDate(d);}}
                            className="tap44" style={{marginTop:2,width:20,height:20,borderRadius:"50%",border:"none",background:"var(--pc-tint)",color:pcDeep,fontSize:"var(--t-sm)",lineHeight:1,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>+</button>
 </div>
                      );
                    })}
 </div>

                  {/* Axis + seven day columns. Same template as the header, so
                      the columns line up. */}
 <div style={{display:"grid",gridTemplateColumns:"34px repeat(7,1fr)"}}>

                    {/* Hour axis. A label on each full hour only; the half-hour
                        rows are still there, just unlabelled. */}
 <div style={{position:"relative",height:weekAxis.rows*WK_ROW_H,borderLeft:"1px solid var(--line)"}}>
                      {Array.from({length:weekAxis.rows}).map((_,r)=>{
                        const m=weekAxis.lo+r*30;
                        if(m%60!==0) return null;
                        return(
 <div key={r} style={{position:"absolute",top:r*WK_ROW_H-1,insetInlineStart:0,insetInlineEnd:2,textAlign:"center",fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600}}>{fmtTime(m)}</div>
                        );
                      })}
 </div>

                    {weekDates.map((date,di)=>{
                      const {laid,lanes,tightGapIds}=dayLanes(date);
                      const dh=dayHoursFrom(settings,date.getDay());
                      return(
 <div key={di}
                          onClick={e=>{
                            // Empty space books at the half hour under the tap.
                            const rect=e.currentTarget.getBoundingClientRect();
                            const row=Math.floor((e.clientY-rect.top)/WK_ROW_H);
                            handleSlotAtMinute(date,weekAxis.lo+Math.max(0,row)*30);
                          }}
                          style={{position:"relative",height:weekAxis.rows*WK_ROW_H,borderRight:di<6?"1px solid var(--line)":"none",cursor:"pointer"}}>

                          {/* Half-hour rules, and shading for the hours this
                              day is not open. The shading is informational: the
                              slot is still bookable, because she does take the
                              occasional appointment outside her posted hours. */}
                          {Array.from({length:weekAxis.rows}).map((_,r)=>{
                            const m=weekAxis.lo+r*30;
                            const open=!!dh&&m>=dh.open*60&&m<dh.close*60;
                            return(
 <div key={r} style={{position:"absolute",top:r*WK_ROW_H,insetInlineStart:0,insetInlineEnd:0,height:WK_ROW_H,boxSizing:"border-box",borderBottom:m%60===30?"1px dashed var(--surface-2)":"1px solid var(--line)",background:open?undefined:"repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(122,90,136,0.05) 5px,rgba(122,90,136,0.05) 10px)"}}/>
                            );
                          })}

                          {laid.map(({appt,s,e,lane})=>{
                            const top=(s-weekAxis.lo)/30*WK_ROW_H;
                            const h=Math.max(WK_ROW_H-2,(e-s)/30*WK_ROW_H-2);
                            // Below ~46px there is only room for the name; the
                            // rest would clip mid-word, which reads worse than
                            // being absent.
                            const compact=h<46;
                            const cancelled=appt.confirmation_status==="cancelled";
                            const tightGap=tightGapIds.has(appt.id);
                            return(
 <div key={appt.id} className="appt-card" title={`${appt.name}${entrySubtitle(appt)?" · "+entrySubtitle(appt):""} · ${isAllDay(appt)?"כל היום":`${fmtTime(s)}–${fmtTime(e)}`}${tightGap?" · אין רווח מהתור הקודם":""}`}
                                onClick={ev=>{ev.stopPropagation();handleApptClick(appt);}}
                                style={{position:"absolute",top,height:h,insetInlineStart:`${(lane/lanes)*100}%`,width:`calc(${100/lanes}% - 2px)`,background:getApptColor(appt),borderRadius:"var(--r-xs)",padding:"2px 4px",boxSizing:"border-box",overflow:"hidden",cursor:"pointer",opacity:cancelled?0.55:1,boxShadow:"var(--shadow-sm)",border:appt.confirmation_status==="confirmed"?"1.5px solid var(--success)":cancelled?"1.5px solid var(--danger)":"1.5px solid rgba(255,255,255,0.35)"}}>
                                {tightGap&&<span aria-hidden style={{position:"absolute",top:2,insetInlineEnd:2,fontSize:10,lineHeight:1,filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.5))"}}>⏱</span>}
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--surface)",textShadow:"0 1px 2px rgba(0,0,0,0.35)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{appt.name}</p>
                                {!compact&&(<>
 <p style={{fontSize:"var(--t-xs)",color:"rgba(255,255,255,0.92)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entrySubtitle(appt)}</p>
 <p style={{fontSize:"var(--t-xs)",color:"rgba(255,255,255,0.85)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isAllDay(appt)?"כל היום":`עד ${fmtTime(e)}`}</p>
                                </>)}
 </div>
                            );
                          })}
 </div>
                      );
                    })}
 </div>
 </div>
 </div>
              {/* MOBILE single-day agenda — mobile-only + rendered only in day view.
                  Desktop never shows this (calView stays "day" but .mobile-only hides it),
                  so the desktop calendar is unchanged. Reuses all existing handlers. */}
              {calView==="day"&&(()=>{
                const dh=dayHoursFrom(settings,calDay.getDay());
                const isTodaySel=formatDate(calDay)===today;
                const agBtn={background:"rgba(255,255,255,0.9)",border:"none",borderRadius:"var(--r-sm)",width:44,height:44,fontSize:"var(--t-lg)",cursor:"pointer",lineHeight:1,color:"var(--ink)",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0};
                return(
 <div className="mobile-only" style={{flexDirection:"column",maxWidth:560,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12}}>
 <button aria-label="יום קודם" onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()-1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",width:44,height:44,fontSize:"var(--t-xl)",color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>←</button>
 <div style={{textAlign:"center",flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>יום {DAYS_HE[calDay.getDay()]}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-xl)",fontWeight:700,color:isTodaySel?pc:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(calDay)}{isTodaySel?" · היום":""}</p>
 </div>
 <button aria-label="יום הבא" onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()+1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",width:44,height:44,fontSize:"var(--t-xl)",color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>→</button>
 </div>
 <div style={{display:"flex",gap:8,marginBottom:14}}>
 <button onClick={()=>setCalDay(new Date())} style={{flex:1,background:"var(--pc-tint)",border:"none",borderRadius:"var(--r-md)",padding:"11px 0",fontSize:"var(--t-md)",fontWeight:600,color:pcDeep,cursor:"pointer",fontFamily:"inherit"}}>היום</button>
 <button onClick={()=>openPersonalEditor(null,formatDate(calDay))} style={{flex:1,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"11px 0",fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}><Icon name="lock" size={14}/> אירוע אישי</button>
 <button className="primary-btn" onClick={()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(calDay),hour:dh?dh.open:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{flex:2,background:pcGrad,color:"var(--pc-contrast)",padding:"11px 0",fontSize:"var(--t-md)",boxShadow:"var(--shadow-accent)"}}>✦ תור חדש</button>
 </div>
                  {(() => {
                    // Rows are driven by the day's REAL appointments, not by a fixed
                    // grid of hour cells. The old loop walked workingHours - the LEGACY
                    // global range - and asked getAppt for ONE appointment per clock
                    // hour, so it silently dropped the second of any pair (10:00 and
                    // 10:30 are routine at 30-minute granularity) and everything outside
                    // that range, which per-day business_hours can exceed in either
                    // direction. The week grid was rebuilt off dayLanes for exactly this
                    // reason; this was the last consumer of the hour-cell assumption.
                    //
                    // Same contract as the week axis: if it exists, it is on screen.
                    const { laid, tightGapIds } = dayLanes(calDay);
                    // Free hours to offer: the day's own open range, minus any hour an
                    // appointment COVERS - not merely starts in. A 90-minute treatment at
                    // 10:00 used to leave a bookable "+ פנוי" at 11:00 that only failed at
                    // save. Cancelled appointments free their hour here, because that is
                    // what the modal's own clash check does; the cancelled card still
                    // renders alongside, so the record never disappears.
                    const covers = (s,e) => laid.some(x => x.appt.confirmation_status!=="cancelled" && s < x.e && x.s < e);
                    const rows = laid.map(x => ({ key:"a"+x.appt.id, min:x.s, appt:x.appt }));
                    if (dh) for (let h = Math.ceil(dh.open); h < dh.close; h++) {
                      const m = h * 60;
                      if (!covers(m, m + 60)) rows.push({ key:"f"+m, min:m, appt:null });
                    }
                    rows.sort((a,b) => a.min - b.min || (a.appt?0:1) - (b.appt?0:1));
                    return (
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {/* A closed day still has to show whatever is already booked on it,
                          or an appointment vanishes from her phone the moment she edits
                          her hours. The notice shrinks when it has rows underneath. */}
                      {!dh&&<div style={{textAlign:"center",padding:rows.length?"16px 0":"48px 0",color:"var(--danger)",fontWeight:700,fontSize:"var(--t-lg)",background:"var(--surface)",borderRadius:"var(--r-md)",border:"1px solid var(--line)"}}>סגור ביום זה</div>}
                      {rows.map(row=>{
                        const appt=row.appt;
                        const apptColor=appt?getApptColor(appt):null;
                        const hasPhone=appt&&(clients.find(c=>String(c.id)===String(appt.client_id))?.phone||appt.client_phone);
                        return(
 <div key={row.key} style={{display:"flex",alignItems:"stretch",gap:10}}>
 <div style={{width:48,flexShrink:0,textAlign:"center",paddingTop:appt?12:15,fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink-3)"}}>{appt&&isAllDay(appt)?"—":fmtTime(row.min)}</div>
                            {appt?(
 <div onClick={()=>handleApptClick(appt)} style={{flex:1,minWidth:0,background:apptColor,borderRadius:"var(--r-md)",padding:"12px 14px",cursor:"pointer",boxShadow:"var(--shadow-sm)",border:appt.confirmation_status==="confirmed"?"2px solid var(--success)":appt.confirmation_status==="cancelled"?"2px solid var(--danger)":"2px solid rgba(255,255,255,0.35)"}}>
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--surface)",textShadow:"0 1px 2px rgba(0,0,0,0.35)",lineHeight:1.2}}>{isPersonal(appt)?"🔒 ":""}{appt.name}{isPersonal(appt)?"":appt.confirmation_status==="confirmed"?" ✓":appt.confirmation_status==="cancelled"?" ✕":appt.confirmation_status===NO_SHOW?" · לא הגיעה":""}</p>
 <p style={{fontSize:"var(--t-sm)",color:"rgba(255,255,255,0.92)",marginTop:2}}>{entrySubtitle(appt)} · {isAllDay(appt)?"כל היום":`${appt.duration}ד׳`}</p>
                                {/* Real vs. booked, once both ends of the treatment were logged -
                                    the same comparison the "finish" toast said, left visible on
                                    the card instead of gone the moment the toast fades. */}
                                {appt.actual_start_at&&appt.actual_end_at&&(()=>{
                                  const o=durationOutcome(appt.actual_start_at,appt.actual_end_at,Number(appt.duration)||0);
                                  if(!o) return null;
                                  const sign=o.driftMinutes>4?` (+${o.driftMinutes})`:o.driftMinutes<-4?` (${o.driftMinutes})`:"";
                                  return <p style={{fontSize:"var(--t-xs)",color:"rgba(255,255,255,0.85)",marginTop:2}}>בפועל: {o.actualMinutes} דק׳{sign}</p>;
                                })()}
                                {/* No time to reset the station: this appointment starts less than
                                    TIGHT_GAP_MINUTES after the previous one ends. */}
                                {!isPersonal(appt)&&tightGapIds.has(appt.id)&&(
 <p style={{fontSize:"var(--t-xs)",fontWeight:700,color:"#5A3A10",background:"rgba(255,255,255,0.55)",borderRadius:"var(--r-xs)",padding:"2px 6px",display:"inline-block",marginTop:4}}>⏱ אין רווח מהתור הקודם</p>
                                )}
 <div style={{display:"flex",gap:8,marginTop:10}}>
                                  {!isPersonal(appt)&&appt.client_id&&<button aria-label="כרטיס לקוחה" onClick={e=>{e.stopPropagation();setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");}} style={agBtn}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M12 20.3s-7.4-4.6-7.4-9.6a4.3 4.3 0 0 1 7.4-3 4.3 4.3 0 0 1 7.4 3c0 5-7.4 9.6-7.4 9.6z"/></svg></button>}
                                  {!isPersonal(appt)&&hasPhone&&<button aria-label="שליחת תזכורת" onClick={e=>{e.stopPropagation();sendReminderToClient(appt);}} disabled={isBusy("sendReminder")} style={agBtn}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><path d="M3.4 6.6l8.6 6 8.6-6"/></svg></button>}
                                  {!isPersonal(appt)&&<button aria-label="תשלום" onClick={e=>{e.stopPropagation();handleOpenCashier(appt);}} style={agBtn}>₪</button>}
                                  {/* Real start/finish: only a real, non-cancelled visit, only on or
                                      before today - logging a future appointment's actual time makes
                                      no sense. One slot, two states: not started yet offers "started",
                                      started-but-not-finished offers "finished". */}
                                  {!isPersonal(appt)&&appt.confirmation_status!=="cancelled"&&appt.confirmation_status!==NO_SHOW&&appt.date<=today&&!appt.actual_end_at&&(
 <button aria-label={appt.actual_start_at?"סיימתי":"התחלתי"} title={appt.actual_start_at?"סיימתי":"התחלתי"} onClick={e=>{e.stopPropagation();appt.actual_start_at?handleFinishTreatment(appt):handleStartTreatment(appt);}} style={{...agBtn,fontSize:"var(--t-xs)",fontWeight:700,width:"auto",padding:"0 10px"}}>{appt.actual_start_at?"⏹ סיימתי":"▶ התחלתי"}</button>
                                  )}
                                  {/* No-show: only a client visit, only on or after its day. */}
                                  {!isPersonal(appt)&&canMarkNoShow(appt,today)&&<button aria-label="לא הגיעה" title="לא הגיעה" onClick={e=>{e.stopPropagation();markNoShow(appt);}} style={{...agBtn,fontSize:"var(--t-xs)",fontWeight:700,width:"auto",padding:"0 10px"}}>לא הגיעה</button>}
 <button aria-label={isPersonal(appt)?"מחיקת האירוע":"מחיקה"} onClick={e=>{e.stopPropagation();if(isPersonal(appt)){handleDeletePersonal(appt);}else{handleDelete(appt);}}} style={{...agBtn,marginRight:"auto",background:"rgba(0,0,0,0.24)",color:"var(--surface)"}}>✕</button>
 </div>
 </div>
                            ):(
 <button onClick={()=>handleSlotAtMinute(calDay,row.min)} style={{flex:1,background:"var(--surface)",border:"1px dashed var(--line-2)",borderRadius:"var(--r-md)",padding:14,fontSize:"var(--t-md)",color:"var(--ink-3)",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>+ פנוי</button>
                            )}
 </div>
                        );
                      })}
 </div>
                    );
                  })()}
 </div>
                );
              })()}
 </>
  );
}

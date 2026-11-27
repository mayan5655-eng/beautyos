"use client";
// app/screens/CalendarScreen.jsx — the "calendar" tab of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <CalendarScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { dayHoursFrom, nextOpenDay } from "@/lib/businessHours";
import { ICON_CALENDAR } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import EmptyState from "../EmptyState";
import Icon from "../Icon";
import { fmtTime } from "@/lib/apptTime";
import { isPersonal, isAllDay } from "@/lib/calendarKind";
import { NO_SHOW, canMarkNoShow } from "@/lib/reliability";
import { durationOutcome } from "@/lib/durationDrift";
import HoldBadge from "../HoldBadge";
import IntakeBadge from "../IntakeBadge";
import { apptStatus, APPT_STATUS_TONE_COLOR } from "@/lib/apptStatus";
import { tr, trv } from "@/lib/i18n/tr";
import { activeStaff as teamActiveStaff } from "@/lib/team";

export default function CalendarScreen({ ctx }) {
  const {
    activeServices, appointments, apptMenuId, calDay, calStaffFilter, calView, clients, copyPublicLink, dayLanes,
    DAYS_HE, deferred, entrySubtitle, formatDate, formatDateHe, getApptColor, handleApptClick, handleDelete,
    handleDeletePersonal, handleFinishTreatment, handleNewApptOnDate, handleOpenCashier, handleSlotAtMinute,
    handleStartTreatment, historyCutoffRef, historyReady, isBusy, markNoShow, openNewAppt, openPersonalEditor,
    openWaitlist, pc, pcDeep, pcGrad, pcTint, receiptForAppt, sendReminderToClient, setApptMenuId, setApptNote,
    setCalDay, setCalView, setClientTab, setEditingAppointmentId, setNewAppt, setRebookNext, setSelectedClient,
    setShowModal, setShowReceipt, setStaffFilter, settings, setWeekStart, STAFF_FILTER_ALL, staffColorOf,
    staffNameOf, team, teamCal, today, waitlistChipLabel, weekAxis, weekDates, weekScrollRef, weekStart,
    weekSundayOf, WK_ROW_H,
  } = ctx;
  return (
    /* @screen-body */<>
            {!historyReady&&historyCutoffRef.current&&formatDate(calView==="day"?calDay:weekSundayOf(weekStart))<historyCutoffRef.current.date&&(
              <p role="status" style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",textAlign:"center",marginBottom:10}}>{deferred.history==="error"?tr("לא הצלחנו לטעון את התורים הישנים. השבוע הזה עלול להיראות חלקי."):tr("התורים הישנים בדרך, והמסך הזה יתמלא בעוד רגע.")}</p>
            )}
            {historyReady&&appointments.length===0&&(
              <EmptyState icon="calendar" accent={pc} accentTint={pcTint}
                title={tr("הלוח עדיין ריק")}
                body={tr("אפשר לקבוע תור בלחיצה על שעה פנויה בלוח, או מהכפתור כאן. תורים שנקבעים מעמוד ההזמנות הציבורי שלך מופיעים כאן לבד.")}
                actions={[
                  {label:tr("קביעת תור"),onClick:openNewAppt},
                  {label:tr("העתקת קישור ההזמנות"),onClick:()=>copyPublicLink("book")},
                ]}/>
            )}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div className={calView==="week"?undefined:"desktop-only"} style={{display:"flex",alignItems:"center",gap:10}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_CALENDAR} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>{tr("לוח שבועי")}</p>
 <h2 style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[6])}</h2>
 </div>
 </div>
 <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
 {/* Mobile-only day/week toggle. Hidden on desktop, so desktop always shows the week grid. */}
 <div className="mobile-only" style={{gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>setCalView("day")} style={{background:calView==="day"?pcGrad:"none",color:calView==="day"?"var(--pc-contrast)":"var(--ink-2)",border:"none",borderRadius:"var(--r-sm)",padding:"9px 16px",cursor:"pointer",fontSize:"var(--t-md)",fontWeight:600,fontFamily:"inherit"}}>{tr("יום")}</button>
 <button onClick={()=>setCalView("week")} style={{background:calView==="week"?pcGrad:"none",color:calView==="week"?"var(--pc-contrast)":"var(--ink-2)",border:"none",borderRadius:"var(--r-sm)",padding:"9px 16px",cursor:"pointer",fontSize:"var(--t-md)",fontWeight:600,fontFamily:"inherit"}}>{tr("שבוע")}</button>
 </div>
 <div className="desktop-only" style={{display:"flex",gap:10,fontSize:"var(--t-sm)",color:"var(--ink-2)",alignItems:"center"}}>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--success)"}}/>{tr("אישרה")}</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--danger)"}}/>{tr("ביטלה")}</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--danger)",opacity:0.5}}/>{tr("לא הגיעה")}</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--ink-3)"}}/>{tr("ממתין")}</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--ink-2)"}}/>{tr("אישי")}</span>
 </div>
 <div className={calView==="week"?undefined:"desktop-only"} style={{display:"flex",alignItems:"center",gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button aria-label={tr("שבוע קודם")} onClick={()=>{const d=weekSundayOf(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:"var(--r-sm)",padding:"7px 12px",cursor:"pointer",fontSize:"var(--t-md)",color:pc,fontFamily:"inherit"}}>→</button>
 <button onClick={()=>setWeekStart(new Date())} style={{background:"var(--pc-tint)",border:"none",borderRadius:"var(--r-sm)",padding:"7px 14px",cursor:"pointer",fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,fontFamily:"inherit"}}>{tr("היום")}</button>
 <button aria-label={tr("שבוע הבא")} onClick={()=>{const d=weekSundayOf(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:"var(--r-sm)",padding:"7px 12px",cursor:"pointer",fontSize:"var(--t-md)",color:pc,fontFamily:"inherit"}}>←</button>
 </div>
 <button onClick={()=>openPersonalEditor(null,formatDate(calDay))} className={calView==="day"?"primary-btn desktop-only":"primary-btn"} style={{background:"var(--surface)",border:"1px solid var(--line-2)",color:"var(--ink-2)",padding:"10px 16px",fontSize:"var(--t-sm)"}}><Icon name="lock" size={14}/> {tr("אירוע אישי")}</button>
 <button data-testid="cal-waitlist-chip" onClick={openWaitlist} className={calView==="day"?"primary-btn desktop-only":"primary-btn"} style={{background:"var(--surface)",border:"1px solid var(--line-2)",color:"var(--ink-2)",padding:"10px 16px",fontSize:"var(--t-sm)"}}>{waitlistChipLabel}</button>
 <button className={calView==="day"?"primary-btn desktop-only":"primary-btn"} onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("✦ תור חדש")}</button>
 </div>
 </div>
 {teamCal&&(
 <div data-testid="staff-filter" role="radiogroup" aria-label={tr("מטפלת")} style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
   {[{id:STAFF_FILTER_ALL,name:tr("כולן"),color:null},...teamActiveStaff(team.staff)].map(x=>{const on=calStaffFilter===x.id;return(
 <button key={x.id} type="button" role="radio" aria-checked={on} onClick={()=>setStaffFilter(x.id)} style={{display:"inline-flex",alignItems:"center",gap:6,minHeight:40,padding:"6px 14px",borderRadius:"var(--r-full)",border:`1px solid ${on?pc:"var(--line-2)"}`,background:on?pcTint:"var(--surface)",color:"var(--ink)",fontWeight:on?700:500,fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit"}}>
   {x.color&&<span aria-hidden style={{width:10,height:10,borderRadius:"50%",background:x.color,flexShrink:0}}/>}{x.name}
 </button>);})}
 </div>
 )}
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
 <div key={i} onClick={()=>{setCalDay(d);setCalView("day");}} title={tr("יום {0}", [DAYS_HE[d.getDay()]])}
                          style={{padding:"7px 2px",textAlign:"center",cursor:"pointer",borderRight:i<6?"1px solid var(--line)":"none",background:isToday?"var(--pc-tint)":undefined,boxShadow:isToday?`inset 0 -2px 0 ${pc}`:undefined}}>
 <p style={{fontSize:"var(--t-sm)",color:isToday?pcDeep:"var(--ink-3)",fontWeight:isToday?700:600}}>{trv(DAYS_HE[d.getDay()])}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-lg)",fontWeight:700,color:isToday?pc:"var(--ink)",lineHeight:1.25}}>{d.getDate()}</p>
                          {isClosed&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:700}}>{tr("סגור")}</p>}
                          {hasCancel&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600}}>{tr("ביטול")}</p>}
                          {/* Booking without hunting for empty space, and the
                              only booking affordance on a phone. */}
 <button aria-label={tr("תור חדש ליום {0}", [DAYS_HE[d.getDay()]])} title={tr("תור חדש")}
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
 <div key={appt.id} className="appt-card" title={`${appt.name}${entrySubtitle(appt)?" · "+entrySubtitle(appt):""}${staffNameOf(appt)?" · "+staffNameOf(appt):""} · ${isAllDay(appt)?"כל היום":`${fmtTime(s)}–${fmtTime(e)}`}${tightGap?" · אין רווח מהתור הקודם":""}`}
                                onClick={ev=>{ev.stopPropagation();handleApptClick(appt);}}
                                style={{position:"absolute",top,height:h,insetInlineStart:`${(lane/lanes)*100}%`,width:`calc(${100/lanes}% - 2px)`,background:getApptColor(appt),borderRadius:"var(--r-xs)",padding:"2px 4px",boxSizing:"border-box",overflow:"hidden",cursor:"pointer",opacity:cancelled?0.55:1,boxShadow:"var(--shadow-sm)",border:appt.confirmation_status==="confirmed"?"1.5px solid var(--success)":cancelled?"1.5px solid var(--danger)":"1.5px solid rgba(255,255,255,0.35)",...(staffColorOf(appt)?{borderInlineStart:`5px solid ${staffColorOf(appt)}`}:{})}}>
                                {tightGap&&<span aria-hidden style={{position:"absolute",top:2,insetInlineEnd:2,fontSize:10,lineHeight:1,filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.5))"}}>⏱</span>}
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--surface)",textShadow:"0 1px 2px rgba(0,0,0,0.35)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{appt.name}</p>
                                {!compact&&(<>
 <p style={{fontSize:"var(--t-xs)",color:"rgba(255,255,255,0.92)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entrySubtitle(appt)}</p>
 <p style={{fontSize:"var(--t-xs)",color:"rgba(255,255,255,0.85)",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isAllDay(appt)?tr("כל היום"):tr("עד {0}", [fmtTime(e)])}</p>
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
 <button aria-label={tr("יום קודם")} onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()-1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",width:44,height:44,fontSize:"var(--t-xl)",color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>→</button>
 <div style={{textAlign:"center",flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>{tr("יום")} {trv(DAYS_HE[calDay.getDay()])}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-xl)",fontWeight:700,color:isTodaySel?pc:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(calDay)}{isTodaySel?tr(" · היום"):""}</p>
 </div>
 <button aria-label={tr("יום הבא")} onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()+1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",width:44,height:44,fontSize:"var(--t-xl)",color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>←</button>
 </div>
 <div style={{display:"flex",gap:8,marginBottom:14}}>
 <button onClick={()=>setCalDay(new Date())} style={{flex:1,background:"var(--pc-tint)",border:"none",borderRadius:"var(--r-md)",padding:"11px 0",fontSize:"var(--t-md)",fontWeight:600,color:pcDeep,cursor:"pointer",fontFamily:"inherit"}}>{tr("היום")}</button>
 <button onClick={()=>openPersonalEditor(null,formatDate(calDay))} style={{flex:1,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"11px 0",fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}><Icon name="lock" size={14}/> {tr("אירוע אישי")}</button>
 <button className="primary-btn" onClick={()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(calDay),hour:dh?dh.open:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{flex:2,background:pcGrad,color:"var(--pc-contrast)",padding:"11px 0",fontSize:"var(--t-md)",boxShadow:"var(--shadow-accent)"}}>{tr("✦ תור חדש")}</button>
 </div>
 <div style={{display:"flex",justifyContent:"flex-start",marginTop:-6,marginBottom:12}}>
 <button data-testid="cal-waitlist-chip-day" onClick={openWaitlist} style={{minHeight:44,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-full)",padding:"0 14px",fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>{waitlistChipLabel}</button>
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
                      {!dh&&<div style={{textAlign:"center",padding:rows.length?"16px 0":"48px 0",color:"var(--danger)",fontWeight:700,fontSize:"var(--t-lg)",background:"var(--surface)",borderRadius:"var(--r-md)",border:"1px solid var(--line)"}}>{tr("סגור ביום זה")}</div>}
                      {rows.map(row=>{
                        const appt=row.appt;
                        const apptColor=appt?getApptColor(appt):null;
                        const hasPhone=appt&&(clients.find(c=>String(c.id)===String(appt.client_id))?.phone||appt.client_phone);
                        return(
 <div key={row.key} style={{display:"flex",alignItems:"stretch",gap:10}}>
 <div style={{width:48,flexShrink:0,textAlign:"center",paddingTop:appt?12:15,fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink-3)"}}>{appt&&isAllDay(appt)?"—":fmtTime(row.min)}</div>
                            {appt?(
 <div onClick={()=>handleApptClick(appt)} style={{flex:1,minWidth:0,background:appt.confirmation_status==="cancelled"?"var(--surface-2)":"var(--surface)",borderRadius:"var(--r-md)",padding:"12px 14px",cursor:"pointer",boxShadow:"var(--shadow-xs)",border:"1px solid var(--line)",borderInlineStart:`5px solid ${apptColor}`,opacity:appt.confirmation_status==="cancelled"?0.78:1}}>
                                {/* 2026-10-20 design pass: a calm card (her surface, a status stripe on the start side, dark text)
                                    instead of a saturated block, and ONE main action with the rest behind "עוד" so nothing is
                                    clipped at phone width. Every action is the same handler as before. */}
 <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",lineHeight:1.25,minWidth:0,overflowWrap:"anywhere",textDecoration:appt.confirmation_status==="cancelled"?"line-through":"none"}}>{isPersonal(appt)?"🔒 ":""}{appt.name}</p>
 {(()=>{const s0=apptStatus(appt,{personal:isPersonal(appt)});const st={l:s0.label,c:APPT_STATUS_TONE_COLOR[s0.tone]};return <span style={{flexShrink:0,fontSize:"var(--t-xs)",fontWeight:700,color:st.c,border:`1px solid ${st.c}`,borderRadius:"var(--r-full)",padding:"2px 8px",whiteSpace:"nowrap"}}>{trv(st.l)}</span>;})()}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:2}}>{entrySubtitle(appt)} · {isAllDay(appt)?tr("כל היום"):tr("{0}ד׳", [appt.duration])}</p>
 {teamCal&&staffNameOf(appt)&&<p data-testid="agenda-staff" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink-2)",marginTop:4}}><span aria-hidden style={{width:9,height:9,borderRadius:"50%",background:staffColorOf(appt)||"var(--line-2)"}}/>{staffNameOf(appt)}</p>}
 {!isPersonal(appt)&&<HoldBadge appointmentId={appt.id}/>}
 {!isPersonal(appt)&&<IntakeBadge appointmentId={appt.id}/>}
                                {appt.actual_start_at&&appt.actual_end_at&&(()=>{
                                  const o=durationOutcome(appt.actual_start_at,appt.actual_end_at,Number(appt.duration)||0);
                                  if(!o) return null;
                                  const sign=o.driftMinutes>4?` (+${o.driftMinutes})`:o.driftMinutes<-4?` (${o.driftMinutes})`:"";
                                  return <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:2}}>{tr("בפועל:")} {o.actualMinutes} {tr("דק׳")}{sign}</p>;
                                })()}
                                {!isPersonal(appt)&&tightGapIds.has(appt.id)&&(
 <p style={{fontSize:"var(--t-xs)",fontWeight:700,color:"#5A3A10",background:"#FBF0DC",borderRadius:"var(--r-xs)",padding:"2px 6px",display:"inline-block",marginTop:4}}>{tr("⏱ אין רווח מהתור הקודם")}</p>
                                )}
                                {(()=>{
                                  const live=!isPersonal(appt)&&appt.confirmation_status!=="cancelled"&&appt.confirmation_status!==NO_SHOW;
                                  const canTime=live&&appt.date<=today&&!appt.actual_end_at;
                                  // Already paid: say so, and the main action opens that payment instead of a second cashier.
                                  const paidRcpt=!isPersonal(appt)?receiptForAppt(appt):null;
                                  const open=apptMenuId===appt.id;
                                  const ghost={...agBtn,background:"var(--surface)",border:"1px solid var(--line-2)",color:"var(--ink)",fontSize:"var(--t-sm)",fontWeight:600,width:"auto",padding:"0 12px",gap:6};
                                  const main={...ghost,background:"var(--pc-tint, var(--surface-2))",borderColor:"var(--pc, var(--line-2))",fontWeight:700};
                                  const stop=fn=>e=>{e.stopPropagation();setApptMenuId(null);fn();};
                                  // UX pass 2026-11-08: payment is the main action on a live unpaid card. The timer
                                  // only takes the main slot while it is running ("⏹ סיימתי"); "▶ התחלתי" lives in "עוד".
                                  const running=canTime&&!!appt.actual_start_at;
                                  return (<>
 <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
                                    {paidRcpt&&<span data-testid="agenda-paid" className="pill" style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--success)",background:"rgba(70,179,123,0.12)",padding:"4px 11px",whiteSpace:"nowrap"}}>{tr("✓ שולם")}</span>}
                                    {running&&!paidRcpt?(
 <button onClick={stop(()=>handleFinishTreatment(appt))} style={main}>{tr("⏹ סיימתי")}</button>
                                    ):paidRcpt?(
 <button data-testid="agenda-open-receipt" onClick={stop(()=>setShowReceipt(paidRcpt))} style={main}>{tr("🧾 אישור התשלום")}</button>
                                    ):live?(
 <button onClick={stop(()=>handleOpenCashier(appt))} style={main}>{tr("₪ לתשלום")}</button>
                                    ):null}
 {!isPersonal(appt)&&live&&appt.client_id&&appt.date<=today&&clients.some(c=>String(c.id)===String(appt.client_id))&&<button data-testid="rebook-appt" onClick={stop(()=>setRebookNext({client:clients.find(c=>String(c.id)===String(appt.client_id)),appt}))} style={ghost}>{tr("↻ קבעי לה שוב")}</button>}
 <button aria-expanded={open} aria-label={tr("עוד פעולות")} onClick={e=>{e.stopPropagation();setApptMenuId(open?null:appt.id);}} style={ghost}>{open?tr("סגירה"):tr("עוד ⋯")}</button>
 </div>
                                  {open&&(
 <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                                    {!isPersonal(appt)&&appt.client_id&&<button onClick={stop(()=>{setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");})} style={ghost}>{tr("כרטיס לקוחה")}</button>}
                                    {!isPersonal(appt)&&hasPhone&&<button onClick={stop(()=>sendReminderToClient(appt))} disabled={isBusy("sendReminder")} style={ghost}>{tr("תזכורת")}</button>}
                                    {running&&!paidRcpt&&<button onClick={stop(()=>handleOpenCashier(appt))} style={ghost}>{tr("₪ תשלום")}</button>}
                                    {canTime&&!running&&<button onClick={stop(()=>handleStartTreatment(appt))} style={ghost}>{tr("▶ התחלתי")}</button>}
                                    {running&&paidRcpt&&<button onClick={stop(()=>handleFinishTreatment(appt))} style={ghost}>{tr("⏹ סיימתי")}</button>}
                                    {!isPersonal(appt)&&canMarkNoShow(appt,today)&&<button onClick={stop(()=>markNoShow(appt))} style={ghost}>{tr("לא הגיעה")}</button>}
 <button onClick={stop(()=>{if(isPersonal(appt)){handleDeletePersonal(appt);}else{handleDelete(appt);}})} style={{...ghost,color:"var(--danger)"}}>{isPersonal(appt)?tr("מחיקת האירוע"):tr("ביטול התור")}</button>
 </div>
                                  )}
                                  </>);
                                })()}
 </div>
                            ):(
 <button onClick={()=>handleSlotAtMinute(calDay,row.min)} style={{flex:1,background:"var(--surface)",border:"1px dashed var(--line-2)",borderRadius:"var(--r-md)",padding:14,fontSize:"var(--t-md)",color:"var(--ink-3)",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>{tr("+ פנוי")}</button>
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
 </>/* @screen-end */
  );
}

"use client";
// app/tab-personal.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import { fmtTime } from "@/lib/apptTime";
import { applyPersonalPreset, PERSONAL_PRESETS } from "@/lib/reliability";

export default function PersonalModal(props) {
  const {
    appointments,
    closePersonalEditor,
    datesInRange,
    handleDeletePersonal,
    handleSavePersonal,
    isBusy,
    pc,
    pcDeep,
    pcGrad,
    personalDraft,
    setPersonalDraft,
  } = props;
  return (
<Sheet open onClose={closePersonalEditor} width={340} zIndex={1000} title={personalDraft.ids.length?"עריכת אירוע אישי":"אירוע אישי חדש"}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:14}}>הזמן הזה ייחסם ליומן — לקוחה לא תוכל להזמין אותו</p>
 <div style={{display:"flex",flexDirection:"column",gap:10}}>

 {/* Presets: the three things she blocks time for most, one tap each.
     Lunch is an hour at one, a day off is the day, a vacation is a week she
     then trims. The title stays editable underneath. */}
 {!personalDraft.ids.length&&(
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {PERSONAL_PRESETS.map(p=>{
                      const sel=personalDraft.title===p.title;
                      return (
 <button key={p.key} onClick={()=>setPersonalDraft(d=>applyPersonalPreset(d,p))} style={{flex:"1 0 30%",minHeight:44,padding:"8px 10px",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:sel?"1px solid transparent":"1px solid var(--line-2)",background:sel?pcGrad:"var(--surface-2)",color:sel?"var(--pc-contrast)":"var(--ink-2)"}}>{p.icon} {p.title}</button>
                      );
                    })}
 </div>
 )}
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>מה?</p>
 <input value={personalDraft.title} onChange={e=>setPersonalDraft({...personalDraft,title:e.target.value})} placeholder="פגישה עם רואה חשבון" aria-label="כותרת האירוע" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 </div>

 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>מתאריך</p>
 <input type="date" value={personalDraft.from} onChange={e=>{const v=e.target.value;setPersonalDraft(d=>({...d,from:v,to:(d.to&&d.to>=v)?d.to:v}));}} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 </div>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>עד תאריך</p>
 <input type="date" value={personalDraft.to} min={personalDraft.from} onChange={e=>setPersonalDraft({...personalDraft,to:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 </div>
 </div>

                  {/* A range is days, not hours, so the toggle disappears once
                      there is more than one - there is no honest way to store
                      "09:00-10:00 on each of three days" as one event. */}
                  {datesInRange(personalDraft.from,personalDraft.to).length>1?(
 <p style={{fontSize:"var(--t-sm)",color:pcDeep,fontWeight:600,background:"var(--pc-tint)",borderRadius:"var(--r-sm)",padding:"8px 10px"}}>{datesInRange(personalDraft.from,personalDraft.to).length} ימים — כל הימים ייחסמו במלואם</p>
                  ):(<>
 <label style={{display:"flex",alignItems:"center",gap:8,fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,cursor:"pointer"}}>
 <input type="checkbox" checked={!!personalDraft.allDay} onChange={e=>setPersonalDraft({...personalDraft,allDay:e.target.checked})} style={{width:16,height:16,accentColor:pc}}/>
                      כל היום
 </label>
                    {!personalDraft.allDay&&(
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>משעה</p>
 <select value={personalDraft.startMinute} onChange={e=>setPersonalDraft({...personalDraft,startMinute:Number(e.target.value)})} style={{...{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"},direction:"ltr",textAlign:"center"}}>
                            {/* The whole day, not her business hours: blocking
                                out 07:00 before she opens is exactly the sort
                                of thing this is for. */}
                            {Array.from({length:48},(_,i)=>i*30).map(m=><option key={m} value={m}>{fmtTime(m)}</option>)}
 </select>
 </div>
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>למשך</p>
 <select value={personalDraft.duration} onChange={e=>setPersonalDraft({...personalDraft,duration:Number(e.target.value)})} style={{...{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"},direction:"ltr",textAlign:"center"}}>
                            {[30,60,90,120,180,240].map(m=><option key={m} value={m}>{m<60?`${m} דק׳`:`${m/60} שע׳`}</option>)}
 </select>
 </div>
 </div>
                    )}
                  </>)}

 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>הערה (לא חובה)</p>
 <textarea value={personalDraft.note} onChange={e=>setPersonalDraft({...personalDraft,note:e.target.value})} rows={2} placeholder="כתובת, טלפון, מה להביא…" style={{...{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"},resize:"vertical"}}/>
 </div>

 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={closePersonalEditor} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSavePersonal} disabled={isBusy("savePersonal")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("savePersonal")?<Spinner inline label="שומרת"/>:"שמירה ✓"}</button>
 </div>
                {personalDraft.ids.length>0&&(
 <button onClick={()=>handleDeletePersonal(appointments.find(a=>a.id===personalDraft.ids[0])||{id:personalDraft.ids[0],name:personalDraft.title,series_id:personalDraft.seriesId})} style={{width:"100%",marginTop:8,background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",padding:"8px 0"}}>מחיקת האירוע</button>
                )}
 </Sheet>
  );
}

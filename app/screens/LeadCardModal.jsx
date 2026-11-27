"use client";
// app/screens/LeadCardModal.jsx — {selectedLead && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <LeadCardModal> in app/beautyos.jsx (the check fails until both sides agree).
import { contactSummaryHe } from "@/lib/leads/contact";
import Icon from "../Icon";
import { localDayKey } from "@/lib/till";
import { tr, trv } from "@/lib/i18n/tr";
import { sourceLabelHe } from "@/lib/leadSources";

export default function LeadCardModal({ ctx }) {
  const {
    fmtDateHe, handleConvertLead, handleSetReminder, handleUpdateLeadStatus, isBusy, LEAD_STATUSES,
    leadStatusMeta, openBulk, openEditLead, pc, pc2, selectedLead, setSelectedLead, SOURCE_ICONS, waLink,
  } = ctx;
  return (
    /* @screen-body */<div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",justifyContent:"flex-start",zIndex:1200}} data-overlay="lead" onClick={()=>setSelectedLead(null)}>
 <div onClick={e=>e.stopPropagation()} className="lead-drawer" style={{background:"var(--surface)",width:400,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"var(--shadow-xl)",borderLeft:"1px solid var(--line)"}}>
            {(()=>{
              const l=selectedLead;
              const st=leadStatusMeta(l.status);
              return(<>
 <div className="drawer-head" style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"var(--surface)",position:"relative"}}>
 <button onClick={()=>setSelectedLead(null)} aria-label={tr("סגירה")} className="drawer-close" style={{position:"absolute",left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:44,height:44,color:"var(--surface)",fontSize:"var(--t-lg)",cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:13}}>
 <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-2xl)",flexShrink:0}}>{SOURCE_ICONS[l.source]||<span style={{fontWeight:700}}>{String(l.name||"").trim().charAt(0)||"✦"}</span>}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600}}>{l.name}</h3>
 <p style={{fontSize:"var(--t-xs)",opacity:0.9}}>{l.phone||tr("אין טלפון")}</p>
 <span style={{fontSize:"var(--t-xs)",background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:"var(--r-lg)",marginTop:4,display:"inline-block"}}>{SOURCE_ICONS[l.source]} {l.source?trv(sourceLabelHe(l.source)):""}</span>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {l.phone&&<a href={waLink(l.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"var(--surface)",color:pc,borderRadius:"var(--r-lg)",padding:"8px 0",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",textDecoration:"none"}}>{tr("וואטסאפ")}</a>}
 <button onClick={()=>openEditLead(l)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:"var(--r-lg)",padding:"8px 0",fontSize:"var(--t-xs)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}><Icon name="edit" size={13}/> {tr("עריכה")}</button>
 </div>
 {/* One-click send to THIS lead, prefilled from the template saved for her
     current status. Opens the same confirm flow as a group send. */}
 {l.phone&&(
 <button onClick={()=>openBulk(l.status,l)} style={{width:"100%",marginTop:6,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:"var(--r-lg)",padding:"8px 0",fontSize:"var(--t-xs)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{tr("הודעה מוכנה")}</button>
 )}
 </div>
 <div style={{padding:"16px 22px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:6,fontWeight:600}}>{tr("סטטוס")}</p>
 <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:16}}>
                    {/* aria-pressed, not just colour: the active chip was signalled
                        only by a border and a background at 9.5px, which is the
                        weakest confirmation in the app and says nothing to a screen
                        reader. Type goes up to 11.5px and the tap target to 32px —
                        these are read and hit one-handed. */}
                    {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>handleUpdateLeadStatus(l,key)} disabled={isBusy("leadStatus")} aria-pressed={l.status===key} style={{padding:"7px 13px",minHeight:32,border:"1px solid",borderColor:l.status===key?s.color:"var(--line-2)",borderRadius:"var(--r-lg)",background:l.status===key?s.bg:"var(--surface)",color:l.status===key?s.color:"var(--ink-2)",fontSize:"var(--t-sm)",cursor:isBusy("leadStatus")?"default":"pointer",fontFamily:"inherit",fontWeight:l.status===key?700:500,opacity:isBusy("leadStatus")&&l.status!==key?0.55:1,transition:"background .15s,border-color .15s,opacity .15s"}}>{trv(s.label)}</button>
                    ))}
 </div>
                  {l.service_interest&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:"var(--t-sm)"}}><span style={{color:"var(--ink-3)"}}>{tr("תחום עניין")}</span><span style={{fontWeight:600,color:"var(--ink)"}}>{l.service_interest}</span></div>}
                  {l.created_at&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:"var(--t-sm)"}}><span style={{color:"var(--ink-3)"}}>{tr("נוצר")}</span><span style={{color:"var(--ink)"}}>{fmtDateHe(localDayKey(l.created_at))}</span></div>}
                  {/* Contact trail. Reads "טרם יצרת קשר" until the first
                      successful WhatsApp send from the app. */}
 <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:"var(--t-sm)"}}><span style={{color:"var(--ink-3)"}}>{tr("יצירת קשר")}</span><span style={{color:l.last_contacted_at?"var(--ink)":"var(--ink-3)",fontWeight:l.last_contacted_at?600:400}}>{contactSummaryHe(l)}</span></div>
 <div style={{marginTop:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:4,fontWeight:600}}>{tr("תזכורת מעקב")}</p>
 <input type="date" value={l.reminder_date||""} onChange={e=>handleSetReminder(l,e.target.value)} disabled={isBusy("leadReminder")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)",opacity:isBusy("leadReminder")?0.6:1}}/>
 </div>
                  {l.notes&&<div style={{marginTop:12,padding:"10px 12px",background:"var(--pc-tint)",borderRadius:"var(--r-sm)"}}><p style={{color:"var(--ink-3)",fontWeight:700,fontSize:"var(--t-sm)",marginBottom:2}}>{tr("הערות")}</p><p style={{fontSize:"var(--t-xs)",color:"var(--ink)"}}>{l.notes}</p></div>}
                  {l.status!=="closed"&&l.status!=="lost"&&l.status!=="irrelevant"&&(
 <button onClick={()=>handleConvertLead(l)} className="primary-btn" style={{width:"100%",marginTop:16,background:"var(--success)",color:"var(--surface)",borderRadius:"var(--r-xl)",padding:"12px 0",fontSize:"var(--t-sm)",fontWeight:700,boxShadow:"var(--shadow-md)"}}>{tr("✓ המירי ללקוחה רשומה")}</button>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>/* @screen-end */
  );
}

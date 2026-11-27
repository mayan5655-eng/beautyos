"use client";
// app/screens/LeadsScreen.jsx — {activeTab==="leads"&&deferred.leads==="ok" && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <LeadsScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { contactAgoHe } from "@/lib/leads/contact";
import { ICON_ENVELOPE } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Icon from "../Icon";
import { sourceLabelHe } from "@/lib/leadSources";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function LeadsScreen({ ctx }) {
  const {
    emptyLead, fbEventFails, filteredLeads, fmtPhone, handleConvertLead, LEAD_STATUSES, leadFilter, leadGroup,
    leads, leadSearch, leadsShown, leadStatusMeta, ListMore, onKbdActivate, openBulk, pc, pcDeep, pcGrad,
    peopleSegments, setEditingLead, setLeadFilter, setLeadSearch, setNewLead, setSelectedLead, setShowLeadImport,
    setShowLeadModal, showMoreLeads, SOURCE_ICONS, tomorrow, waLink,
  } = ctx;
  return (
    /* @screen-body */<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 {peopleSegments()}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>{tr("צינור מכירות")}</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("פניות")} <span style={{color:"var(--ink-3)",fontWeight:400}}>({leads.length})</span></h2>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 {/* The Facebook webhook inspector: every lead event Meta sent us, failures
     included. The badge counts failed events from the last 7 days, so a lead
     that arrived and DIDN'T become a row in this list announces itself here
     instead of vanishing into server logs. */}
 <button className="primary-btn" onClick={()=>{window.location.href="/dashboard/leads/webhook-events";}} style={{background:"var(--surface)",color:fbEventFails>0?"#B3261E":pcDeep,border:`1px solid ${fbEventFails>0?"#B3261E":"var(--line-2)"}`,padding:"10px 16px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-xs)",position:"relative"}}>
   <Icon name="bolt" size={14}/> {tr("אירועי פייסבוק")}{fbEventFails>0&&<span style={{background:"#B3261E",color:"#fff",borderRadius:"var(--r-sm)",padding:"1px 7px",fontSize:"var(--t-xs)",fontWeight:700,marginRight:6}}>{fbEventFails} {tr("נכשלו")}</span>}
 </button>
 <button className="primary-btn" onClick={()=>setShowLeadImport(true)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",padding:"10px 16px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-xs)"}}><Icon name="upload" size={14}/> {tr("ייבוא פניות")}</button>
 <button className="primary-btn" onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("✦ פנייה חדשה")}</button>
 </div>
 </div>
 <div style={{display:"flex",gap:7,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
 <button onClick={()=>setLeadFilter("all")} aria-pressed={leadFilter==="all"} style={{background:leadFilter==="all"?pcGrad:"var(--surface)",borderRadius:"var(--r-xl)",padding:"8px 15px",border:`1px solid ${leadFilter==="all"?"transparent":"var(--line-2)"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit",fontSize:"var(--t-sm)",fontWeight:600,color:leadFilter==="all"?"var(--pc-contrast)":"var(--ink-2)",boxShadow:leadFilter==="all"?"var(--shadow-accent)":"var(--shadow-xs)",transition:"transform 0.12s"}}>{tr("הכל (")}{leads.length})</button>
              {/* 12.5px, matching the send pills this strip absorbed: it is now
                  the single status control on the screen rather than one of two,
                  so it carries the weight both used to share. aria-pressed
                  because "which status am I looking at" was signalled by colour
                  alone. */}
              {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>setLeadFilter(leadFilter===key?"all":key)} aria-pressed={leadFilter===key} style={{background:leadFilter===key?s.bg:"var(--surface)",borderRadius:"var(--r-xl)",padding:"8px 15px",border:`1px solid ${leadFilter===key?s.color:"var(--line-2)"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit",fontSize:"var(--t-sm)",fontWeight:leadFilter===key?700:500,color:leadFilter===key?s.color:"var(--ink-2)",boxShadow:"var(--shadow-xs)",transition:"transform 0.12s"}}>{trv(s.label)} ({leads.filter(l=>l.status===key).length})</button>
              ))}
 </div>
 <div style={{position:"relative",marginBottom:12}}>
 <span style={{position:"absolute",top:"50%",right:14,transform:"translateY(-50%)",fontSize:"var(--t-sm)",color:"var(--ink-3)",pointerEvents:"none"}}>⌕</span>
 <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder={tr("חיפוש פנייה...")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 36px 10px 14px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",boxShadow:"var(--shadow-xs)"}}/>
 </div>
            {/* ── The group action bar ──────────────────────────────────────
                This replaces a second strip of status pills that used to sit
                here, listing every status again directly below the filter
                strip above. Two rows of the same Hebrew status names, one
                filtering and one sending real WhatsApp messages, and the same
                label carried a DIFFERENT number in each (the filter counted
                every lead in a status, the sender counted only those with a
                phone) - so the two readings of "חדש (12)" / "חדש (9)" were
                impossible to tell apart, and the destructive one was a single
                tap away from the harmless one.

                Now there is one strip. It filters. Once a status is chosen,
                the group she is LOOKING AT becomes the group she can message,
                and she cannot reach the send without the list being on screen
                first. Nothing appears while the filter is "הכל": with no
                status there is no group, and the send API is scoped to one
                status anyway. */}
            {leadGroup&&(
 <div className="glass-card" style={{padding:"13px 15px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
 <span aria-hidden style={{width:30,height:30,borderRadius:"var(--r-xs)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",background:"rgba(37,211,102,0.12)",color:"var(--success)",flexShrink:0}}>✆</span>
 <div style={{flex:"1 1 220px",minWidth:0}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",lineHeight:1.5}}>
   {leadGroup.matched.length} {tr("פניות בסטטוס \"")}{trv(leadGroup.label)}&quot;
   {/* The shout. When the search cuts 47 down to 1, the number she is
       about to message is not the number on the filter chip, and that
       has to be impossible to miss rather than merely present. */}
   {leadGroup.narrowed&&(
 <span style={{marginInlineStart:8,fontSize:"var(--t-sm)",fontWeight:700,color:"var(--warning)",background:"rgba(242,184,75,0.18)",borderRadius:"var(--r-lg)",padding:"3px 10px",whiteSpace:"nowrap"}}>
     {tr("מסונן מתוך")} {leadGroup.statusTotal} {tr("· לפי החיפוש")}
 </span>
   )}
 </p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginTop:2}}>
   {leadGroup.withPhone.length>0
     ? tr("ל-{0} מהן יש טלפון ויקבלו את ההודעה", [leadGroup.withPhone.length])
     : tr("לאף אחת מהן אין טלפון, אז אי אפשר לשלוח הודעה")}
   {leadGroup.windowed&&leadGroup.withPhone.length>0&&
     tr(" · הרשימה מציגה {0} בכל פעם, אבל ההודעה תגיע לכל {1}", [leadsShown, leadGroup.withPhone.length])}
 </p>
 </div>
 <button
   onClick={()=>openBulk(leadGroup.status,leadGroup.matched)}
   disabled={leadGroup.withPhone.length===0}
   className="primary-btn"
   style={{flexShrink:0,padding:"11px 18px",fontSize:"var(--t-sm)",fontWeight:700,background:leadGroup.withPhone.length===0?"var(--surface-2)":pcGrad,color:leadGroup.withPhone.length===0?"var(--ink-3)":"var(--pc-contrast)",border:leadGroup.withPhone.length===0?"1px solid var(--line)":"none",cursor:leadGroup.withPhone.length===0?"not-allowed":"pointer",boxShadow:leadGroup.withPhone.length===0?"none":"var(--shadow-accent)"}}>
   {tr("✆ שליחת וואטסאפ ל-")}{leadGroup.withPhone.length} {tr("פניות")}
 </button>
 </div>
            )}
            {filteredLeads.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:"var(--r-xl)",marginTop:6}}>
 {leadSearch||leadFilter!=="all"?(
 <div style={{width:64,height:64,borderRadius:"var(--r-lg)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-3xl)",background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>⌕</div>
 ):(
 <BrandImage width={60} height={60} aria-hidden alt="" src={ICON_ENVELOPE} style={{width:60,height:60,margin:"0 auto 14px",display:"block"}}/>
 )}
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:5}}>{leadSearch||leadFilter!=="all"?tr("לא נמצאו פניות"):tr("עוד אין פניות")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",maxWidth:320,margin:"0 auto 18px",lineHeight:1.6}}>{leadSearch||leadFilter!=="all"?tr("נסי לשנות את החיפוש או הסינון."):tr("פניות מהאתר ומפייסבוק יופיעו כאן. אפשר גם להוסיף פנייה ידנית.")}</p>
 {!(leadSearch||leadFilter!=="all")&&<button className="empty-cta primary-btn" onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"11px 22px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("✦ פנייה חדשה")}</button>}
 </div>
              ):filteredLeads.slice(0,leadsShown).map(lead=>{
                const st=leadStatusMeta(lead.status);
                const hasReminder=lead.reminder_date&&lead.reminder_date<=tomorrow;
                return(
 <div key={lead.id} className="lead-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={tr("פתיחת פרטי הפנייה {0}", [lead.name])} onClick={()=>setSelectedLead(lead)} style={{background:"var(--surface)",borderRadius:"var(--r-lg)",padding:"12px 15px",border:`1px solid ${hasReminder?"var(--warning)":"var(--line)"}`,display:"flex",alignItems:"center",gap:11,marginBottom:8,boxShadow:"var(--shadow-sm)"}}>
 <div style={{width:38,height:38,borderRadius:"var(--r-sm)",background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",flexShrink:0}}>{SOURCE_ICONS[lead.source]||"✦"}</div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
 <p style={{fontWeight:700,fontSize:"var(--t-sm)",color:"var(--ink)",letterSpacing:"-0.01em"}}>{lead.name}</p>
 <span className="pill" style={{fontSize:"var(--t-sm)",background:st.bg,color:st.color,padding:"3px 8px"}}>{trv(st.label)}</span>
                        {hasReminder&&<span className="pill" style={{fontSize:"var(--t-sm)",background:"rgba(242,184,75,0.16)",color:"var(--warning)",padding:"3px 8px"}}>{tr("◴ תזכורת")}</span>}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lead.phone&&`${fmtPhone(lead.phone)} · `}{SOURCE_ICONS[lead.source]} {lead.source?trv(sourceLabelHe(lead.source)):""}{lead.service_interest&&` · ${lead.service_interest}`}{lead.last_contacted_at&&` · ✓ ${contactAgoHe(lead.last_contacted_at)}`}</p>
 </div>
                    {lead.phone&&<a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"5px 9px",fontSize:"var(--t-sm)"}}>✆</a>}
                    {lead.status!=="closed"&&lead.status!=="lost"&&lead.status!=="irrelevant"&&<button onClick={e=>{e.stopPropagation();handleConvertLead(lead);}} style={{background:"var(--success)",color:"var(--surface)",border:"none",borderRadius:"var(--r-lg)",padding:"5px 11px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0}}>{tr("המר ✓")}</button>}
 </div>
                );
              })}
 </div>
 <ListMore shown={leadsShown} total={filteredLeads.length} onMore={showMoreLeads} pc={pc} noun={tr("פניות")}/>
 </>/* @screen-end */
  );
}

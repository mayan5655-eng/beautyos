"use client";
// app/screens/ClientCardModal.jsx — {selectedClient && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ClientCardModal> in app/beautyos.jsx (the check fails until both sides agree).
import { parseDb } from "@/lib/dbTime";
import { APP_URL } from "@/lib/appUrl";
import { nextOpenDay } from "@/lib/businessHours";
import { UpgradeChip } from "../UpgradesStore";
import { isDemoTenantId } from "@/lib/demoTenants";
import Spinner from "../Spinner";
import DeferredGate from "../DeferredGate";
import Icon from "../Icon";
import { fmtApptTime } from "@/lib/apptTime";
import LoyaltyClientCard from "../LoyaltyClientCard";
import { localDayKey } from "@/lib/till";
import { clientReliability, reliabilityLine } from "@/lib/reliability";
import { marketingStatus, consentFields, optOutFields } from "@/lib/marketingConsent";
import { sourceLabelHe } from "@/lib/leadSources";
import FeeQuestions from "../FeeQuestions";
import { skinScanVisible } from "@/lib/featureFlags";
import { businessFieldsOf } from "@/lib/businessFields";
import { tr, trv, uiDir } from "@/lib/i18n/tr";
import { protocolFormAllowed } from "@/lib/protocolBook/book";

export default function ClientCardModal({ ctx }) {
  const {
    activeServices, askConfirm, clientPhotos, ClientPrivacyPanel, ClientProtocolCourses, ClientReferral, clients,
    clientScans, clientTab, deferred, feeCharged, fmtDateHe, FORM_TYPES_ALL, formatDate, getClientAppts,
    getClientForms, getClientLead, getClientPackages, getClientReceipts, getClientTotal, getDaysSince,
    guardWrite, handleClientErased, handleDeleteImage, handleOpenCashier, handleSendForm, handleUploadImage,
    handleUsePackageSession, historyReady, isBusy, loadDeferred, loadHistory, loyaltyDb, loyaltyFor,
    MembershipClientCard, mySlug, onKbdActivate, openEditClient, PAYMENT_METHODS, pc, pc2, pcDeep, pcGrad,
    pcTint, photoTreatmentPrefill, photoUploading, saveClientMarketing, scanClientSkin, scanLoading,
    scansLoading, selectedClient, sendReminderToClient, setApptNote, setCashierClient, setCashierSearch,
    setClientPageFor, setClientTab, setEditingAppointmentId, setFormAnswersFor, setNewAppt, setPhotoPost,
    setPhotoTreatmentPrefill, setRebookNext, setSelectedClient, setShowModal, setShowReceipt, settings,
    setViewScan, SignedImage, STATUS_COLORS, STATUS_LABELS, toast, today, uploadClientPhoto, uploading, waLink,
    writeLoyaltyAdjustment,
  } = ctx;
  return (
    /* @screen-body */<div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",justifyContent:"flex-start",zIndex:1200}} data-overlay="client" onClick={()=>setSelectedClient(null)}>
 <div onClick={e=>e.stopPropagation()} className="client-drawer" style={{background:"var(--surface)",width:440,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"var(--shadow-xl)",borderLeft:"1px solid var(--line)"}}>
            {(()=>{
              const c=selectedClient;
              const appts=getClientAppts(c.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
              const cReceipts=getClientReceipts(c.id).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
              const cForms=getClientForms(c.id);
              const cPackages=getClientPackages(c.id);
              const total=getClientTotal(c.id);
              const days=getDaysSince(c.id);
              const statusColor=STATUS_COLORS[c.status]||"var(--warning)";
              return(<>
 <div className="drawer-head" style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"var(--surface)",position:"relative"}}>
 <button onClick={()=>setSelectedClient(null)} aria-label={tr("סגירה")} className="drawer-close" style={{position:"absolute",left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:44,height:44,color:"var(--surface)",fontSize:"var(--t-lg)",cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:14}}>
 <div style={{width:60,height:60,borderRadius:"50%",background:c.images?.[0]?"transparent":"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-2xl)",fontWeight:700,overflow:"hidden",flexShrink:0}}>{c.images?.[0]?<SignedImage value={c.images[0]} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}} fallback={c.name[0]}/>:c.name[0]}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600}}>{c.name}</h3>
 <p style={{fontSize:"var(--t-xs)",opacity:0.9}}>{c.phone||tr("אין טלפון")}</p>
 <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
 <span style={{fontSize:"var(--t-xs)",background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:"var(--r-lg)",fontWeight:600}}>{STATUS_LABELS[c.status]||tr("פעילה")}</span>
                        {c.skinType&&<span style={{fontSize:"var(--t-xs)",background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:"var(--r-lg)"}}>{c.skinType}</span>}
                        {total>0&&<span style={{fontSize:"var(--t-xs)",background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:"var(--r-lg)",fontWeight:700}}>₪{total.toLocaleString()}</span>}
 </div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {c.phone&&<a href={waLink(c.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"var(--surface)",color:pc,borderRadius:"var(--r-lg)",padding:"8px 0",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",textDecoration:"none"}}>{tr("וואטסאפ")}</a>}
 <button onClick={()=>openEditClient(c)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:"var(--r-lg)",padding:"8px 0",fontSize:"var(--t-xs)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}><Icon name="edit" size={13}/> {tr("עריכה")}</button>
 </div>
 {/* Where she came from, who she brought, and her "bring a friend" link (lib/bookingSource.ts). */}
 <ClientReferral client={c} clients={clients} businessName={settings?.business_name} pc={pc} pcTint={pcTint} toast={toast}
   publicUrl={settings?.tenant_id?`${(typeof window!=="undefined"&&window.location.origin)||APP_URL}${mySlug?`/${encodeURIComponent(mySlug)}`:`/book?t=${settings.tenant_id}`}`:""}/>
 {/* Book an appointment for THIS client — opens the existing new-appointment
     modal pre-filled with her (all the per-day-hours / no-double-booking /
     end-time logic is reused as-is). Closes the drawer so the modal is visible. */}
 <div style={{display:"flex",gap:6,marginTop:8}}>
 <button onClick={()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:c.id,name:c.name,service:svc?.name||"",duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setSelectedClient(null);setShowModal(true);}} style={{display:"block",flex:2,minWidth:0,background:"rgba(255,255,255,0.95)",color:pc,border:"none",borderRadius:"var(--r-lg)",padding:"9px 0",minHeight:44,fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-md)"}}>{tr("✦ קביעת תור")}</button>
 {/* A payment for her without going through an appointment: the till opens with her already chosen (and links her one unpaid visit today, if there is exactly one). */}
 <button data-testid="client-drawer-pay" onClick={()=>{handleOpenCashier(null);setCashierClient(c);setCashierSearch(c.name||"");setSelectedClient(null);}} style={{display:"block",flex:1,minWidth:0,background:"rgba(255,255,255,0.95)",color:pc,border:"none",borderRadius:"var(--r-lg)",padding:"9px 0",minHeight:44,fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-md)"}}>{tr("₪ תשלום")}</button>
 </div>
 {/* One tap to the NEXT visit: her rhythm, the nearest free slot at her usual time (components/RebookNextSheet). */}
 <button data-testid="rebook-client" onClick={()=>{setRebookNext({client:c,appt:null});}} style={{display:"block",width:"100%",minHeight:40,marginTop:8,background:"transparent",color:"var(--surface)",border:"1.5px solid rgba(255,255,255,0.85)",borderRadius:"var(--r-lg)",padding:"9px 0",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit"}}>{tr("↻ קבעי לה שוב")}</button>
 {/* The three things she does less often share ONE row. Each was a full-width button of its own, and with the referral
     box above them the card opened on a wall of nine buttons: nothing about the client herself was on the first screen
     (2026-11-27 review). Same buttons, same handlers, a third of the height. */}
 <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
 {/* Her private results page: photos she agreed to, what was done, aftercare, next-visit button (app/ClientPageSheet). */}
 <button type="button" onClick={()=>setClientPageFor(c)} data-testid="client-page-open" style={{flex:"1 1 104px",minWidth:0,minHeight:44,lineHeight:1.25,background:"rgba(255,255,255,0.95)",color:pc,border:"none",borderRadius:"var(--r-lg)",padding:"9px 6px",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit"}}>{tr("✦ שליחת הדף שלה")}</button>
 {/* Facial skin analysis: inherently cosmetics work. Hidden by default for a
     nails-only tenant (skinScanVisible derives that from business_fields
     when she hasn't explicitly toggled it in Settings); existing scan
     history below is untouched either way — this only hides the action to
     take a NEW scan, never past data. */}
 <button type="button" onClick={()=>{if(guardWrite())return;setSelectedClient(null);setPhotoPost({clientName:c.name||""});}} data-testid="photo-to-post-client" style={{flex:"1 1 104px",minWidth:0,minHeight:44,lineHeight:1.25,background:"rgba(255,255,255,0.95)",color:pc,border:"none",borderRadius:"var(--r-lg)",padding:"9px 6px",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit"}}>{tr("✦ צילום אחרי טיפול")}</button>
 {skinScanVisible(settings)&&(
 <label style={{flex:"1 1 104px",minWidth:0,minHeight:44,lineHeight:1.25,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.95)",color:pc,borderRadius:"var(--r-lg)",padding:"9px 6px",fontSize:"var(--t-xs)",fontWeight:700,textAlign:"center",cursor:scanLoading?"not-allowed":"pointer",opacity:scanLoading?0.6:1,pointerEvents:scanLoading?"none":"auto"}}>
 {scanLoading?<Spinner inline label={tr("סורקת")}/>:tr("✦ סריקת עור AI")}
 <input type="file" accept="image/*" disabled={scanLoading} onChange={e=>{const f=e.target.files?.[0]; if(f) scanClientSkin(c,f); e.target.value="";}} style={{display:"none"}}/>
 </label>
 )}
 </div>
 </div>

                {(()=>{
                  const insights=[];
                  if(days>90)insights.push({icon:"",text:tr("לא ביקרה {0} ימים, שווה הודעת התחדשות", [days]),color:"#5580C4"});
                  if(c.allergies)insights.push({icon:"",text:tr("אלרגיות: {0}", [c.allergies]),color:"var(--warning)"});
                  if(c.medical)insights.push({icon:"",text:tr("רפואי: {0}", [c.medical]),color:"#5580C4"});
                  if(total>2000)insights.push({icon:"",text:tr("לקוחה מובילה, ₪{0} סה״כ", [total.toLocaleString()]),color:pc});
                  if(cPackages.length>0)insights.push({icon:"",text:tr("{0} חבילות פעילות", [cPackages.length]),color:"var(--pc-deep)"});
                  if(insights.length===0)return null;
                  return(
 <div style={{padding:"14px 22px 0"}}>
                      {insights.map((ins,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:pcTint,borderRadius:"var(--r-sm)",marginBottom:6,borderRight:`3px solid ${ins.color}`}}>
 <span style={{fontSize:"var(--t-md)"}}>{ins.icon}</span>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:500}}>{trv(ins.text)}</p>
 </div>
                      ))}
 </div>
                  );
                })()}

 <div style={{display:"flex",gap:3,padding:"14px 22px 0",borderBottom:"1px solid var(--line)",overflowX:"auto"}}>
                  {[{k:"info",l:tr("פרטים")},{k:"history",l:tr("היסטוריה ({0})", [appts.length])},{k:"scans",l:tr("סריקות עור ({0})", [clientScans.length]),hidden:!skinScanVisible(settings)&&clientScans.length===0},{k:"receipts",l:tr("תשלומים ({0})", [cReceipts.length])},{k:"packages",l:tr("חבילות ({0})", [cPackages.length])},{k:"forms",l:tr("טפסים{0}", [deferred.forms==="ok"?` (${cForms.length})`:""])},{k:"beforeafter",l:tr("לפני/אחרי ({0})", [clientPhotos.length])},{k:"images",l:tr("תמונות ({0})", [c.images?.length||0])}].filter(t=>!t.hidden).map(t=>(
 <button key={t.k} onClick={()=>setClientTab(t.k)} style={{background:"none",border:"none",padding:"9px 9px",minHeight:44,fontSize:"var(--t-sm)",fontWeight:clientTab===t.k?700:500,color:clientTab===t.k?pcDeep:"var(--ink-3)",borderBottom:clientTab===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"color 0.2s"}}>{trv(t.l)}</button>
                  ))}
 </div>

 <div style={{padding:"16px 22px"}}>
                  {clientTab==="info"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:"var(--t-sm)"}}>
 {/* Her loyalty stamp card (app/LoyaltyClientCard): progress, rewards given, and a +1 / -1 correction with a reason. */}
 <LoyaltyClientCard state={loyaltyFor(c.id)} client={c} businessName={settings?.business_name} pc={pc} pcTint={pcTint} dbReady={loyaltyDb.ready} busy={isBusy("loyaltyAdjust")} onAdjust={(d,reason)=>writeLoyaltyAdjustment(c.id,d,reason)}/>
 <FeeQuestions clientId={selectedClient?.id} pc={pc} pcTint={pcTint} toast={toast} onCharged={feeCharged}/>
 {/* Her membership, or "צירוף למנוי" (app/MembershipClientCard): renders nothing unless memberships are on and ready for this business. */}
 {!isDemoTenantId(settings?.tenant_id)&&(<MembershipClientCard client={c} pc={pc} pcTint={pcTint} pcGrad={pcGrad} toast={toast}/>)}
 {/* Her protocol courses for this client (app/ClientProtocolCourses): nothing unless the book is on and a course exists. */}
 <ClientProtocolCourses clientId={c.id} toast={toast} photos={clientPhotos} onAddPhotos={(title)=>{setPhotoTreatmentPrefill(title);setClientTab("beforeafter");}}/>
                      {/* Where she came from. Always shown, including when the
                          answer is "we do not know" - a blank row would read as
                          "no source", and לא ידוע is the honest version for a
                          client who predates the lead pipeline or was added by
                          hand. Never inferred from anything. */}
                      {(()=>{ const lead=getClientLead(c.id); return (
 <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}>
 <span style={{color:"var(--ink-3)"}}>{tr("הגיעה מ")}</span>
 <span style={{fontWeight:600,color:lead?"var(--ink)":"var(--ink-3)"}}>
                            {lead ? sourceLabelHe(lead.source) : tr("לא ידוע")}
                          </span>
 </div>
                      ); })()}
                      {/* Reliability: no-shows and late cancellations, from her
                          appointments. Shown only when there is something to
                          say - a row reading "0 · 0" would shame a client who
                          has simply always turned up. */}
                      {(()=>{ const line=reliabilityLine(clientReliability(appts)); return line?(
 <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}>
 <span style={{color:"var(--ink-3)"}}>{tr("אמינות")}</span>
 <span style={{fontWeight:600,color:"var(--danger)"}}>{line}</span>
 </div>
                      ):null; })()}
                                           {(()=>{ const ms=marketingStatus(c); const when=(iso)=>{try{return new Date(iso).toLocaleDateString("he-IL");}catch{return "";}}; return(
 <div data-testid="marketing-consent" style={{padding:"10px 12px",background:"var(--surface-2)",borderRadius:"var(--r-sm)",border:"1px solid var(--line)"}}>
 <p style={{color:"var(--ink-2)",fontWeight:700,fontSize:"var(--t-sm)",marginBottom:3}}>{tr("עדכונים ומבצעים")}</p>
 <p data-testid="marketing-status" style={{fontSize:"var(--t-sm)",color:ms==="consent"?"var(--success)":"var(--ink-2)",lineHeight:1.6}}>
                            {ms==="consent"&&tr("הסכימה לקבל עדכונים ומבצעים{0}{1}", [c.marketing_consent_at?` ב-${when(c.marketing_consent_at)}`:"", c.marketing_consent_source==="booking_page"?" (בעמוד ההזמנה)":c.marketing_consent_source==="manual"?" (סימנת ידנית)":""])}
                            {ms==="opted_out"&&tr("ביקשה הסרה מדיוור ב-{0}. לא נשלחות לה הודעות שיווק.", [when(c.marketing_opted_out_at)])}
                            {ms==="none"&&tr("לא אישרה קבלת עדכונים ומבצעים, ולכן לא נכללת ברשימות שיווק. תזכורות ואישורי תשלום ממשיכים כרגיל.")}
 </p>
 <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                            {ms!=="consent"&&<button onClick={()=>saveClientMarketing(c,consentFields("manual"),"ההסכמה לדיוור נשמרה")} disabled={isBusy("clientMarketing")} style={{flex:"1 1 130px",padding:"8px 10px",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",background:"var(--surface)",color:pcDeep,fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>{tr("סימון הסכמה לדיוור")}</button>}
                            {ms!=="opted_out"&&<button onClick={()=>askConfirm({title:tr("הסרה מדיוור"),message:tr("לרשום שהלקוחה ביקשה הסרה מדיוור? (למשל כתבה לך \"הסר\" בוואטסאפ.) לא יישלחו לה עוד הודעות שיווק."),confirmText:tr("כן, להסיר"),onConfirm:()=>saveClientMarketing(c,optOutFields(),"נרשם: הסירה את עצמה מדיוור")})} disabled={isBusy("clientMarketing")} style={{flex:"1 1 130px",padding:"8px 10px",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",background:"var(--surface)",color:"var(--danger)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",minHeight:44}}>{tr("הסירה את עצמה מדיוור")}</button>}
 </div>
                            {/* Overnight report item ה (2026-10-21): a "הסר" sent to HER OWN WhatsApp never reaches Kalmea (only the central number's
                                webhook records it), so the opt-out the law requires (section 30A) exists only if she records it here. */}
                            {ms!=="opted_out"&&<p data-testid="marketing-optout-hint" style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.6,marginTop:6}}>{tr("כתבה לך \"הסר\" בוואטסאפ האישי? המערכת לא רואה את ההודעות שם, אז חשוב לסמן כאן. מהרגע הזה לא יישלחו לה הודעות שיווק, ותזכורות לתורים ממשיכות כרגיל.")}</p>}
 </div>
                      ); })()}
 {c.birthday&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}><span style={{color:"var(--ink-2)"}}>{tr("יום הולדת")}</span><span style={{fontWeight:600}}>{c.birthday}</span></div>}
                      {c.skinType&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}><span style={{color:"var(--ink-2)"}}>{tr("סוג עור")}</span><span style={{fontWeight:600}}>{c.skinType}</span></div>}
                      {c.allergies&&<div style={{padding:"8px 10px",background:"var(--surface-2)",borderRadius:"var(--r-sm)",border:"1px solid rgba(242,184,75,0.16)"}}><p style={{color:"var(--warning)",fontWeight:700,fontSize:"var(--t-sm)",marginBottom:2}}>{tr("אלרגיות")}</p><p>{c.allergies}</p></div>}
                      {c.medical&&<div style={{padding:"8px 10px",background:"var(--surface-2)",borderRadius:"var(--r-sm)",border:"1px solid #A7C4F4"}}><p style={{color:"#5580C4",fontWeight:700,fontSize:"var(--t-sm)",marginBottom:2}}>{tr("רפואי")}</p><p>{c.medical}</p></div>}
                      {c.notes&&<div style={{padding:"8px 10px",background:pcTint,borderRadius:"var(--r-sm)"}}><p style={{color:"var(--ink-2)",fontWeight:700,fontSize:"var(--t-sm)",marginBottom:2}}>{tr("הערות")}</p><p>{c.notes}</p></div>}
                      <ClientPrivacyPanel client={c} toast={toast} historyReady={historyReady} upcomingCount={appts.filter(a=>a.date>=today&&a.confirmation_status!=="cancelled").length} onErased={handleClientErased}/>
 </div>
                  )}
                  {(clientTab==="history"||clientTab==="receipts")&&!historyReady&&<DeferredGate status={deferred.history} what={tr("את ההיסטוריה")} onRetry={loadHistory}/>}
                  {clientTab==="history"&&historyReady&&(
                    appts.length===0?<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{tr("אין היסטוריית תורים")}</p>
                    :appts.map(a=>{
                      // A cancelled visit reads as cancelled, and only a live future one offers a reminder (2026-10-23 pass, D2).
                      const cancelled=a.confirmation_status==="cancelled";
                      return(
 <div key={a.id} data-testid={cancelled?"history-cancelled":undefined} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--surface-2)",opacity:cancelled?0.6:1}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:cancelled?"var(--ink-3)":(a.color||"var(--warning)"),flexShrink:0}}/>
 <div style={{flex:1,minWidth:0}}><p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)",textDecoration:cancelled?"line-through":"none"}}>{a.service}</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{fmtDateHe(a.date)} · {fmtApptTime(a)}{a.price?` · ₪${a.price}`:""}</p></div>
                        {cancelled&&<span className="pill" style={{fontSize:"var(--t-xs)",background:"var(--surface-2)",color:"var(--danger)",padding:"2px 8px",flexShrink:0}}>{a.cancelled_by==="client"?tr("ביטלה"):tr("בוטל")}</span>}
                        {a.confirmation_status==="confirmed"&&<span style={{fontSize:"var(--t-xs)",color:"var(--success)"}}>✓</span>}
                        {c.phone&&!cancelled&&a.date>=today&&<button onClick={()=>sendReminderToClient(a)} disabled={isBusy("sendReminder")} title={tr("שלחי תזכורת")} style={{flexShrink:0,background:pcTint,color:pcDeep,border:`1px solid ${pc}`,borderRadius:"var(--r-md)",padding:"5px 10px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round",verticalAlign:"-2px"}}><rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><path d="M3.4 6.6l8.6 6 8.6-6"/></svg> {tr("שלחי תזכורת")}</button>}
 </div>
                    );})
                  )}
                  {clientTab==="scans"&&<UpgradeChip pack="skinscan" style={{marginTop:0,marginBottom:8}}/>}
                  {clientTab==="scans"&&(
                    scansLoading?<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}><Spinner inline label={tr("טוענת סריקות")}/></p>
                    :clientScans.length===0?<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{tr("אין סריקות עדיין. לחצי על \"סריקת עור AI\" למעלה.")}</p>
                    :clientScans.map(s=>(
 <div key={s.id} onClick={()=>setViewScan(s)} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderBottom:"1px solid var(--surface-2)",cursor:"pointer"}}>
 {s.image_url?<SignedImage value={s.image_url} alt="" style={{width:46,height:46,borderRadius:"var(--r-sm)",objectFit:"cover",flexShrink:0}} fallback={<div style={{width:46,height:46,borderRadius:"var(--r-sm)",background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"var(--t-xl)"}}>✦</div>}/>:<div style={{width:46,height:46,borderRadius:"var(--r-sm)",background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"var(--t-xl)"}}>✦</div>}
 <div style={{flex:1}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{s.skin_type||tr("סריקת עור")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{parseDb(s.created_at).toLocaleDateString("he-IL")}{s.report?.clinical_treatment?` · ${s.report.clinical_treatment}`:""}</p>
 </div>
 <div style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:`3px solid ${s.score>=75?"var(--success)":s.score>=50?"var(--warning)":pc}`,flexShrink:0}}><span style={{fontSize:"var(--t-sm)",fontWeight:800,color:s.score>=75?"var(--success)":s.score>=50?"var(--warning)":pc}}>{s.score}</span></div>
 </div>
                    ))
                  )}
                  {clientTab==="receipts"&&historyReady&&(
                    cReceipts.length===0?<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{tr("אין תשלומים")}</p>
                    :cReceipts.map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={tr("פתיחת אישור תשלום, {0}", [r.client_name||"לקוחה"])} className="client-row" style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",background:pcTint,borderRadius:"var(--r-sm)",marginBottom:5,cursor:"pointer"}}>
 <span style={{fontSize:"var(--t-md)"}}>{PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}</span>
 <div style={{flex:1,minWidth:0}}><p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{r.service}</p><p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>{fmtDateHe(localDayKey(r.created_at))} · {r.payment_method}</p></div>
 {r.legal_provider==="grow"&&r.legal_status==="issued"&&r.legal_doc_url&&<a href={r.legal_doc_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} data-testid="grow-receipt-link" style={{fontSize:"var(--t-xs)",fontWeight:700,color:"var(--pc-text, var(--ink))",textDecoration:"underline",whiteSpace:"nowrap"}}>{tr("מסמך Grow")}</a>}
 <span className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:pc}}>₪{r.amount}</span>
 </div>
                    ))
                  )}
                  {clientTab==="packages"&&(
                    cPackages.length===0?<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{tr("אין חבילות פעילות")}</p>
                    :cPackages.map(pkg=>(
 <div key={pkg.id} style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"11px 12px",marginBottom:7}}>
 <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:"var(--t-xs)",fontWeight:700,color:"var(--ink)"}}>{pkg.service}</p><button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-md)",padding:"3px 9px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit"}}>{tr("✓ השתמשי")}</button></div>
 <div style={{display:"flex",gap:2}}>{Array.from({length:Number(pkg.total_sessions)},(_,i)=><div key={i} style={{flex:1,height:6,borderRadius:"var(--r-xs)",background:i<Number(pkg.used_sessions)?pc:"var(--pc-tint)"}}/>)}</div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginTop:3}}>{pkg.used_sessions}/{pkg.total_sessions}</p>
 </div>
                    ))
                  )}
                  {clientTab==="forms"&&deferred.forms!=="ok"&&<DeferredGate status={deferred.forms} what={tr("את הטפסים")} onRetry={loadDeferred}/>}
                  {clientTab==="forms"&&deferred.forms==="ok"&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:6}}>{tr("שלחי טופס לחתימה דיגיטלית")}</p>
 <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                        {FORM_TYPES_ALL.filter(ft=>ft.protocol?protocolFormAllowed(ft.key,settings):(!ft.only||ft.only.some(f=>businessFieldsOf(settings).includes(f)))).map(ft=>(
 <button key={ft.key} onClick={()=>handleSendForm(c,ft.key)} style={{background:pcTint,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 11px",fontSize:"var(--t-sm)",color:"var(--ink)",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>{trv(ft.label)}</button>
                        ))}
 </div>
                      {cForms.length>0&&<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("טפסים קיימים")}</p>
                        {cForms.map(f=>(
 <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:f.status==="signed"?"var(--surface-2)":"var(--surface-2)",borderRadius:"var(--r-sm)",marginBottom:4}}>
 <span style={{fontSize:"var(--t-sm)"}}>{f.status==="signed"?"✓":"⏳"}</span>
 <p style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",color:"var(--ink)"}}>{FORM_TYPES_ALL.find(ft=>ft.key===f.form_type)?.label||f.form_type}</p>
 <span style={{fontSize:"var(--t-xs)",color:f.status==="signed"?"var(--success)":"var(--warning)"}}>{f.status==="signed"?tr("נחתם"):tr("ממתין")}</span>
 {f.status==="signed"&&<button type="button" data-testid="form-view-answers" onClick={()=>setFormAnswersFor(f)} style={{minHeight:44,padding:"0 12px",background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:700,color:"var(--ink)",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{tr("צפייה בתשובות")}</button>}
 </div>
                        ))}
 </>}
 </div>
                  )}
                {clientTab==="beforeafter"&&(
 <div>
 {(()=>{
 let beforeFile=null, afterFile=null, taVal=photoTreatmentPrefill||"", noteVal="";
 return(
 <div style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"12px",marginBottom:14}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:8}}>{tr("הוספת תמונות לפני/אחרי")}</p>
 <div style={{display:"flex",gap:8,marginBottom:8}}>
 <label style={{flex:1,padding:"22px 0",background:"var(--surface)",border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",textAlign:"center",fontSize:"var(--t-sm)",color:pc,cursor:"pointer"}} id="ba-before-lbl">
 {tr("לפני")}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{beforeFile=e.target.files?.[0]||null;const l=document.getElementById("ba-before-lbl");if(l&&beforeFile)l.style.borderStyle="solid";}}/>
 </label>
 <label style={{flex:1,padding:"22px 0",background:"var(--surface)",border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",textAlign:"center",fontSize:"var(--t-sm)",color:pc,cursor:"pointer"}} id="ba-after-lbl">
 {tr("אחרי")}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{afterFile=e.target.files?.[0]||null;const l=document.getElementById("ba-after-lbl");if(l&&afterFile)l.style.borderStyle="solid";}}/>
 </label>
 </div>
 <input key={"ba-t-"+photoTreatmentPrefill} defaultValue={photoTreatmentPrefill} placeholder={tr("שם הטיפול (לא חובה)")} onChange={e=>{taVal=e.target.value;}} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",marginBottom:6,boxSizing:"border-box"}}/>
 <input placeholder={tr("הערה (לא חובה)")} onChange={e=>{noteVal=e.target.value;}} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",marginBottom:8,boxSizing:"border-box"}}/>
 <button disabled={photoUploading} onClick={()=>uploadClientPhoto(beforeFile,afterFile,taVal,noteVal,c.id)} className="primary-btn" style={{width:"100%",padding:"10px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{photoUploading?<Spinner inline label={tr("מעלה")}/>:tr("שמירת התמונות")}</button>
 </div>
 );
 })()}
 {clientPhotos.length===0?<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",marginTop:8}}>{tr("אין תמונות לפני/אחרי עדיין")}</p>
 :clientPhotos.map(ph=>(
 <div key={ph.id} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px",marginBottom:8}}>
 {(ph.treatment||ph.note)&&<p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",marginBottom:6}}>{ph.treatment}{ph.treatment&&ph.note?" · ":""}<span style={{fontWeight:400,color:"var(--ink-2)"}}>{trv(ph.note)}</span></p>}
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginBottom:3}}>{tr("לפני")}</p>
 {ph.before_url?<SignedImage value={ph.before_url} alt={tr("תמונת לפני הטיפול")} style={{width:"100%",borderRadius:"var(--r-xs)",display:"block"}} fallback={<div style={{padding:"24px 0",background:pcTint,borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>—</div>}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>—</div>}
 </div>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginBottom:3}}>{tr("אחרי")}</p>
 {ph.after_url?<SignedImage value={ph.after_url} alt={tr("תמונת אחרי הטיפול")} style={{width:"100%",borderRadius:"var(--r-xs)",display:"block"}} fallback={<div style={{padding:"24px 0",background:pcTint,borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>—</div>}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>—</div>}
 </div>
 </div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:5,textAlign:"left"}}>{parseDb(ph.created_at).toLocaleDateString("he-IL")}</p>
 </div>
 ))}
 </div>
                  )}
                  {clientTab==="images"&&(
 <div>
 <label style={{display:"block",background:pcTint,border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",padding:"14px 0",textAlign:"center",fontSize:"var(--t-xs)",color:pc,cursor:"pointer",marginBottom:10}}> {uploading?<Spinner inline label={tr("מעלה")}/>:tr("העלי תמונה")}
 <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,c)} style={{display:"none"}} disabled={uploading}/>
 </label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                        {(c.images||[]).map((img,i)=>(
 <div key={i} style={{position:"relative",paddingBottom:"100%",borderRadius:"var(--r-sm)",overflow:"hidden",background:pcTint}}>
 <SignedImage value={img} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>handleDeleteImage(c,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.45)",border:"none",borderRadius:"50%",width:20,height:20,color:"var(--surface)",fontSize:"var(--t-sm)",cursor:"pointer"}}>✕</button>
 </div>
                        ))}
 </div>
                      {(!c.images||c.images.length===0)&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",marginTop:8}}>{tr("אין תמונות עדיין")}</p>}
 </div>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>/* @screen-end */
  );
}

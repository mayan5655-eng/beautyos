"use client";
// app/screens/ScanReportModal.jsx — {scanReport||viewScan && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ScanReportModal> in app/beautyos.jsx (the check fails until both sides agree).
import { nextOpenDay } from "@/lib/businessHours";
import Sheet from "../Sheet";
import Icon from "../Icon";
import { tr } from "@/lib/i18n/tr";

export default function ScanReportModal({ ctx }) {
  const {
    activeServices, formatDate, pc, pcGrad, pcTint, scanReport, selectedClient, setApptNote,
    setEditingAppointmentId, setNewAppt, setScanReport, setSelectedClient, setShowModal, settings, setViewScan,
    SignedImage, viewScan,
  } = ctx;
  return (
    /* @screen-body */(()=>{ const SR = scanReport || viewScan.report; const closeModal=()=>{setScanReport(null);setViewScan(null);}; return (
 <Sheet open onClose={closeModal} width={420} zIndex={1300} ariaLabel={tr("דוח סריקת עור")}>
 {viewScan?.image_url&&<SignedImage value={viewScan.image_url} alt={tr("תמונת סריקת עור")} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:"var(--r-md)",marginBottom:14}}/>}
 <div style={{textAlign:"center",marginBottom:14}}>
 <div style={{width:90,height:90,borderRadius:"50%",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",border:`6px solid ${SR.score>=75?"var(--success)":SR.score>=50?"var(--warning)":pc}`}}>
 <span style={{fontSize:"var(--t-hero)",fontWeight:800,color:SR.score>=75?"var(--success)":SR.score>=50?"var(--warning)":pc}}>{SR.score}</span>
 </div>
 <p className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:"var(--ink)",marginTop:10}}>{SR.skin_type}</p>
 </div>
 {SR.summary&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.6,textAlign:"center",marginBottom:14}}>{SR.summary}</p>}
 {SR.concerns?.length>0&&(
 <div style={{marginBottom:12}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:6}}>{tr("ממצאים")}</p>
 {SR.concerns.map((c,i)=>(<p key={i} style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>• {c}</p>))}
 </div>
 )}
 {SR.clinical_treatment&&(
 <div style={{background:pcTint,borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:2}}>{tr("טיפול מומלץ")}</p>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:pc}}>{SR.clinical_treatment}</p>
 {SR.matched_service&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginTop:2}}>{tr("אצלך:")} {SR.matched_service}</p>}
 </div>
 )}
 {SR.clinic_plan&&(
 <div style={{background:"var(--surface)",borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:12,border:"1.5px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:pc,marginBottom:6}}>{tr("✦ תכנית טיפול בקליניקה")}</p>
 {SR.clinic_plan.treatment_type&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink)",fontWeight:600,marginBottom:3}}>{SR.clinic_plan.treatment_type}</p>}
 {SR.clinic_plan.sessions&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginBottom:6}}>{SR.clinic_plan.sessions}</p>}
 {SR.clinic_plan.steps?.length>0&&SR.clinic_plan.steps.map((s,i)=>(<p key={i} style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.5,marginBottom:2}}>• {s}</p>))}
 {SR.clinic_plan.expected_results&&<p style={{fontSize:"var(--t-sm)",color:"var(--success)",marginTop:6}}>{tr("תוצאה צפויה:")} {SR.clinic_plan.expected_results}</p>}
 </div>
 )}
 {SR.home_plan&&(
 <div style={{background:pcTint,borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:pc,marginBottom:6}}>{tr("✦ תכנית טיפוח לבית")}</p>
 {SR.home_plan.summary&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.5,marginBottom:6}}>{SR.home_plan.summary}</p>}
 {SR.home_plan.products?.length>0&&SR.home_plan.products.map((p,i)=>(<p key={i} style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.5,marginBottom:2}}>• {p}</p>))}
 {SR.home_plan.tips?.length>0&&SR.home_plan.tips.map((t,i)=>(<p key={i} style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5,marginTop:i===0?6:2}}>{tr("טיפ:")} {t}</p>))}
 </div>
 )}
 {SR.therapist_notes&&(
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:12,border:"1px solid var(--pc-tint)"}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:700,color:"var(--pc-deep)",marginBottom:6}}>{tr("הערות למטפלת")}</p>
 {SR.therapist_notes.skin_assessment&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.5,marginBottom:6}}>{SR.therapist_notes.skin_assessment}</p>}
 {SR.therapist_notes.protocol&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.5}}><b>{tr("פרוטוקול:")}</b> {SR.therapist_notes.protocol}</p>}
 {SR.therapist_notes.cautions&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",lineHeight:1.5,marginTop:6}}><Icon name="warning" size={13}/> {SR.therapist_notes.cautions}</p>}
 </div>
 )}
 <div style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"10px 13px",margin:"2px 0 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
 <span style={{fontSize:"var(--t-md)",flexShrink:0,lineHeight:1.5}}>ℹ️</span>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,textAlign:"right"}}>{tr("זוהי הערכת AI ראשונית בלבד ואינה מהווה אבחון רפואי. לתכנית טיפול מלאה ומדויקת מומלץ להתייעץ עם הקוסמטיקאית.")}</p>
 </div>
 {/* Next step: book the matched treatment (reuses the drawer's booking opener,
     pre-filled with her + the AI-matched service). Turns the scan's best moment
     from a dead end into a booking. Primary action when a service was matched. */}
 {selectedClient&&SR.matched_service&&(()=>{const svc=activeServices.find(s=>s.name===SR.matched_service);return(
 <button onClick={()=>{const c=selectedClient;setEditingAppointmentId(null);setNewAppt({clientId:c.id,name:c.name,service:svc?.name||SR.matched_service,duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");closeModal();setSelectedClient(null);setShowModal(true);}} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",marginBottom:8}}>{tr("✦ קבעי טיפול")} {SR.matched_service}</button>
 );})()}
 <button onClick={closeModal} className="primary-btn" style={{width:"100%",padding:"12px 0",background:(selectedClient&&SR.matched_service)?"var(--surface)":pcGrad,color:(selectedClient&&SR.matched_service)?"var(--ink-2)":"var(--pc-contrast)",border:(selectedClient&&SR.matched_service)?"1px solid var(--line-2)":"none",fontSize:"var(--t-md)"}}>{tr("סגירה")}</button>
 {!viewScan&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",marginTop:8}}>{tr("הסריקה נשמרה לכרטיס הלקוחה")}</p>}
 </Sheet>
      ); })()/* @screen-end */
  );
}

"use client";
// app/screens/BulkStatusModal.jsx — {bulkStatus && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <BulkStatusModal> in app/beautyos.jsx (the check fails until both sides agree).
import { renderLeadTemplate, hasLeadPlaceholders, pickPreviewLead } from "@/lib/leads/templates";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function BulkStatusModal({ ctx }) {
  const {
    bulkConfirmConsent, bulkError, bulkLeadIds, bulkMessage, bulkResult, bulkStatus, bulkStep, closeBulk,
    confirmBulkSend, leads, leadStatusMeta, markLeadContacted, pcDeep, pcGrad, pcTint, setBulkConfirmConsent,
    setBulkError, setBulkMessage, setBulkStep, settings,
  } = ctx;
  return (
    /* @screen-body */(()=>{
        const s=leadStatusMeta(bulkStatus);
        // Single-lead send narrows the recipient list, so the confirm step
        // always shows the real count for what is about to be sent.
        const inGroup=bulkLeadIds
          ? leads.filter(l=>bulkLeadIds.includes(l.id))
          : leads.filter(l=>l.status===bulkStatus);
        const withPhone=inGroup.filter(l=>l.phone).length;
        const noPhone=inGroup.length-withPhone;
        // Preview for the first reachable recipient. Rendered client-side with
        // the same helper the route uses per recipient, so what she reads here
        // is what that one lead gets; the others get their own names.
        const previewLead=pickPreviewLead(inGroup);
        const personalised=hasLeadPlaceholders(bulkMessage);
        const previewText=personalised?renderLeadTemplate(bulkMessage,previewLead,settings):bulkMessage;
        const previewNote=personalised
          ?(withPhone>1
              ?`כך תראה ההודעה אצל ${previewLead?.name||"הנמענת הראשונה"}, כל נמענת מקבלת אותה עם השם שלה`
              :`כך תראה ההודעה אצל ${previewLead?.name||"הנמענת"}`)
          :"";
        return(
 <Sheet open onClose={closeBulk} busy={bulkStep==="sending"} width={400} zIndex={1300} title={<>{tr("שליחת וואטסאפ,")} {trv(s.label)}</>}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:16}}>{inGroup.length} {tr("פניות בסטטוס ·")} {withPhone} {tr("עם טלפון")}{noPhone>0?tr(" · {0} ללא טלפון (ידולגו)", [noPhone]):""}</p>

            {bulkStep==="compose"&&(<>
 <textarea value={bulkMessage} onChange={e=>setBulkMessage(e.target.value)} rows={5} placeholder={bulkLeadIds?tr("כתבי כאן את ההודעה שתישלח לפניות שנבחרו"):tr("כתבי כאן את ההודעה שתישלח לכל הפניות בסטטוס זה...")} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"11px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"vertical",boxSizing:"border-box",marginBottom:personalised?8:16}}/>
              {personalised&&(
 <div style={{marginBottom:16}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:4}}>{previewNote}</p>
 <div style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 12px",fontSize:"var(--t-sm)",whiteSpace:"pre-wrap",maxHeight:120,overflowY:"auto",color:"var(--ink)"}}>{previewText}</div>
 </div>
              )}
              {inGroup.some(l=>l.source==="csv_import")&&(
 <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5,marginBottom:14,cursor:"pointer"}}>
 <input type="checkbox" checked={bulkConfirmConsent} onChange={e=>setBulkConfirmConsent(e.target.checked)} style={{marginTop:3}}/>
 <span>{tr("חלק מהפניות יובאו מקובץ. אני מאשרת שהן ביקשו או הסכימו לקבל ממני הודעות. בלי האישור הן לא ייכללו בשליחה.")}</span>
 </label>
              )}
 <div style={{display:"flex",gap:6}}>
 <button onClick={closeBulk} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={()=>setBulkStep("confirm")} disabled={!bulkMessage.trim()||withPhone===0} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("המשיכי")}</button>
 </div>
            </>)}

            {bulkStep==="confirm"&&(<>
 <div style={{background:"rgba(242,184,75,0.16)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"11px 13px",marginBottom:12,fontSize:"var(--t-sm)",color:"var(--warning)",lineHeight:1.6}}>{tr("⚠ פעולה זו תשלח הודעת")} <b>{tr("וואטסאפ אמיתית")}</b> {tr("ל-")}<b>{withPhone}</b> {tr("נמענים.")}{noPhone>0?tr(" ({0} ללא טלפון ידולגו)", [noPhone]):""}</div>
              {personalised&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:4}}>{previewNote}</p>}
 <div style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"11px 13px",marginBottom:12,fontSize:"var(--t-sm)",whiteSpace:"pre-wrap",maxHeight:140,overflowY:"auto"}}>{previewText}</div>
              {bulkError&&<p style={{color:"var(--danger)",fontSize:"var(--t-xs)",marginBottom:10}}>{bulkError}</p>}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>{setBulkStep("compose");setBulkError("");}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("חזרה לעריכה")}</button>
 <button onClick={confirmBulkSend} className="primary-btn" style={{flex:2,padding:"11px 0",background:"var(--success)",color:"var(--surface)",fontSize:"var(--t-sm)"}}>{tr("שלחי ל")}{withPhone===1?tr("נמענת אחת"):tr("-{0} נמענות", [withPhone])} ✓</button>
 </div>
            </>)}

            {bulkStep==="sending"&&(
 <div style={{textAlign:"center",padding:"28px 10px",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><Spinner inline label={tr("שולחת הודעות, כדאי להשאיר את החלון פתוח")}/></div>
            )}

            {bulkStep==="result"&&bulkResult&&(<>
 <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:88,background:"var(--pc-tint)",borderRadius:"var(--r-sm)",padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:700,color:pcDeep}}>{bulkResult.queued}</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("מוכנות לשליחה")}</p></div>
 <div style={{flex:1,minWidth:88,background:"rgba(224,91,111,0.10)",borderRadius:"var(--r-sm)",padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:700,color:"var(--danger)"}}>{bulkResult.failed}</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("נכשלו")}</p></div>
 <div style={{flex:1,minWidth:88,background:"var(--surface-2)",borderRadius:"var(--r-sm)",padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:700,color:"var(--ink-2)"}}>{bulkResult.skipped_no_phone}</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("דילוג (אין טלפון)")}</p></div>
 </div>
              {bulkResult.skipped_no_consent>0&&(
 <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",lineHeight:1.6,marginBottom:12}}>{bulkResult.skipped_no_consent} {tr("פניות מרשימה מיובאת לא נכללו, כי אין אישור שהסכימו לקבל הודעות. אם הן ביקשו ממך ליצור קשר, אשרי זאת בשלב כתיבת ההודעה ושלחי שוב.")}</p>
              )}
              {/* Each message is a tap from her own phone, not a send she just
                  watched happen - this is the list of taps, not a log. */}
              {bulkResult.results?.some(r=>r.waLink) && (
 <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:260,overflowY:"auto"}}>
                  {bulkResult.results.filter(r=>r.waLink).map((r,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 11px",background:"var(--surface-2)",borderRadius:"var(--r-sm)"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name||tr("(ללא שם)")}</span>
 <a href={r.waLink} target="_blank" rel="noreferrer" onClick={()=>markLeadContacted(r.leadId)} style={{flexShrink:0,background:"#25D366",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:"6px 14px",fontSize:"var(--t-xs)",fontWeight:700,textDecoration:"none"}}>{r.marked?tr("נפתח ✓"):tr("שליחה")}</a>
 </div>
                  ))}
 </div>
              )}
 <button onClick={closeBulk} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("סיימתי")}</button>
            </>)}
 </Sheet>
        );
      })()/* @screen-end */
  );
}

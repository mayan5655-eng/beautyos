"use client";
// app/tab-advisor.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { DISABLED_REASON_HE, READ_ONLY_BADGE_HE } from "@/lib/planCopy";
import { ICON_SPARKLE } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Spinner from "./Spinner";
import { advisorWaitLine } from "@/lib/advisorWait";

export default function AdvisorTab(props) {
  const {
    advisorAction,
    advisorInput,
    advisorMessages,
    advisorSending,
    advisorWaitSec,
    pcDeep,
    pcGrad,
    readOnly,
    sendAdvisor,
    setAdvisorInput,
    settings,
  } = props;
  return (
<div style={{maxWidth:840,marginLeft:"auto",marginRight:"auto",display:"flex",flexDirection:"column",height:"100%"}}>
 <div style={{textAlign:"center",marginBottom:6}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.04em",marginBottom:4}}>בינה מלאכותית</p>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_SPARKLE} style={{width:48,height:48,objectFit:"contain",marginBottom:2}}/>
 <h2 className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>יועץ עסקי AI</h2>
 </div>
 <p style={{textAlign:"center",fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:16}}>יועצת אישית שמכירה את הנתונים של {settings.business_name||"העסק שלך"} — שאלי כל שאלה עסקית</p>

 <div id="advisor-scroll" className="glass-card" style={{flex:1,overflowY:"auto",padding:"18px 18px",display:"flex",flexDirection:"column",gap:12,minHeight:300}}>
              {advisorMessages===null?(
 <p style={{textAlign:"center",color:"var(--ink-3)",fontSize:"var(--t-sm)",margin:"auto"}}><Spinner inline label="טוען"/></p>
              ):advisorMessages.length===0?(
 <div className="pop-in" style={{margin:"auto",textAlign:"center",padding:"20px",maxWidth:460}}>
 <BrandImage width={60} height={60} aria-hidden alt="" src={ICON_SPARKLE} style={{width:60,height:60,margin:"0 auto 14px",display:"block"}}/>
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:6}}>איך אפשר לעזור לעסק שלך היום?</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:16}}>היועצת רואה את הנתונים האמיתיים שלך — לקוחות, הכנסות, שירותים ולידים — ונותנת פתרונות ותוכניות עבודה. נסי אחת מהשאלות:</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
                    {["איך אחזיר לקוחות רדומות?","איך אעלה את ההכנסות החודש?","מה כדאי לתמחר מחדש?","רעיון לקמפיין לחודש חלש"].map(q=>(
 <button key={q} className="empty-cta" onClick={()=>setAdvisorInput(q)} style={{background:"var(--pc-tint)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"9px 15px",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
                    ))}
 </div>
 </div>
              ):advisorMessages.map(m=>(
 <div key={m.id} style={{alignSelf:m.role==="user"?"flex-start":"flex-end",maxWidth:"82%",background:m.role==="user"?pcGrad:"var(--surface-2)",color:m.role==="user"?"var(--pc-contrast)":"var(--ink)",border:m.role==="user"?"none":"1px solid var(--line)",borderRadius:m.role==="user"?"16px 16px 16px 4px":"16px 16px 4px 16px",padding:"12px 15px",fontSize:"var(--t-sm)",lineHeight:1.65,whiteSpace:"pre-wrap",boxShadow:m.role==="user"?"var(--shadow-accent)":"var(--shadow-xs)"}}>
                    {m.content}
                    {m.role!=="user"&&(()=>{const a=advisorAction(m.content);return a?(
 <button onClick={a.run} className="primary-btn" style={{display:"inline-block",marginTop:10,background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)",fontWeight:600,padding:"8px 15px",borderRadius:"var(--r-sm)"}}>← {a.label}</button>
                    ):null;})()}
 </div>
              ))}
              {advisorSending&&!(advisorMessages&&advisorMessages.length&&advisorMessages[advisorMessages.length-1].streaming)&&(
 <div style={{alignSelf:"flex-end",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"16px 16px 4px 16px",padding:"11px 16px",fontSize:"var(--t-sm)",color:"var(--ink-2)"}} role="status" aria-live="polite">{advisorWaitLine(advisorWaitSec)}</div>
              )}
 </div>

 <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:12}}>
 {/* The advisor is a paid AI write action, so read-only mode disables the
     input itself and states why, rather than letting her type a question
     that the server would refuse with a 402. */}
 <textarea value={advisorInput} onChange={e=>setAdvisorInput(e.target.value)} disabled={readOnly} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAdvisor();}}} placeholder={readOnly?READ_ONLY_BADGE_HE:"כתבי שאלה עסקית… (Enter לשליחה)"} rows={1} style={{flex:1,border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"12px 14px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:readOnly?"var(--surface-2)":"var(--surface)",resize:"none",maxHeight:120,boxShadow:"var(--shadow-xs)",opacity:readOnly?0.6:1,cursor:readOnly?"not-allowed":"auto"}}/>
 <button onClick={sendAdvisor} disabled={readOnly||advisorSending||!advisorInput.trim()} title={readOnly?DISABLED_REASON_HE:undefined} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"12px 22px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)",opacity:readOnly?0.5:1,cursor:readOnly?"not-allowed":"pointer"}}>{advisorSending?<Spinner inline label=""/>:"שליחה"}</button>
 </div>
 </div>
  );
}

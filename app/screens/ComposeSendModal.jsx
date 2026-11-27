"use client";
// app/screens/ComposeSendModal.jsx — {composeSend && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ComposeSendModal> in app/beautyos.jsx (the check fails until both sides agree).
import Sheet from "../Sheet";
import { withAdLabel, MARKETING_FOOTER } from "@/lib/marketingConsent";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function ComposeSendModal({ ctx }) {
  const {
    composeDone, composeSend, fmtPhone, pcGrad, setComposeDone, setComposeSend,
  } = ctx;
  return (
    /* @screen-body */(()=>{
        // \D, not D: an earlier tooling pass ate the backslash, so this stripped
        // the letter D and left dashes and spaces in the number, and every
        // wa.me link built from a phone stored as "050-123 4567" was dead.
        const waDigits=(raw)=>{let d=String(raw||"").replace(/\D/g,"");if(d.startsWith("972"))return d;if(d.startsWith("0"))return "972"+d.slice(1);if(d.length===9)return "972"+d;return d;};
        const waHref=(c)=>`https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(withAdLabel(`שלום${c.name?` ${c.name}`:""}! ✦
${composeSend.messageTemplate}
${c.claimUrl}

${MARKETING_FOOTER}`))}`;
        const doneCount=composeSend.candidates.filter(c=>composeDone[c.phone]).length;
        return (
 <Sheet open onClose={()=>setComposeSend(null)} width={440} zIndex={4000} title={trv(composeSend.title)}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:12}}>{tr("ההודעה נשלחת מהוואטסאפ שלך. לחיצה על לקוחה פותחת את השיחה עם ההודעה מוכנה, ואת רק שולחת.")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{tr("ההודעה (אפשר לערוך)")}</p>
 <textarea value={composeSend.messageTemplate} onChange={e=>setComposeSend({...composeSend,messageTemplate:e.target.value})} rows={3} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"10px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)",resize:"none",marginBottom:4}}/>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginBottom:12}}>{tr("הקישור האישי של כל לקוחה מתווסף אוטומטית בסוף.")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:6}}>{composeSend.candidates.length} {tr("לקוחות")}{doneCount>0?tr(" · נשלחו {0}", [doneCount]):""}</p>
 {composeSend.candidates.map((c,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:i===0?"none":"1px solid var(--line)"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||tr("(ללא שם)")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",direction:"ltr",textAlign:"right"}}>{fmtPhone(c.phone)}</p>
 </div>
 <a href={waHref(c)} target="_blank" rel="noreferrer" onClick={()=>setComposeDone(prev=>({...prev,[c.phone]:true}))} className="primary-btn" style={{background:composeDone[c.phone]?"var(--surface-2)":"#25D366",color:composeDone[c.phone]?"var(--ink-3)":"#fff",padding:"8px 14px",fontSize:"var(--t-sm)",textDecoration:"none",whiteSpace:"nowrap",borderRadius:"var(--r-sm)"}}>{composeDone[c.phone]?tr("✓ נפתח"):tr("שליחה בוואטסאפ")}</a>
 </div>
 ))}
 <div style={{display:"flex",gap:8,marginTop:14}}>
 {/* No automatic-send button, by decision: marketing goes out from HER
     WhatsApp only. A personal number connected to an API got restricted;
     wa.me carries no such risk, so it is the only marketing path. */}
 <div style={{flex:1}}/>
 <button onClick={()=>setComposeSend(null)} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"9px 18px",fontSize:"var(--t-sm)"}}>{tr("סיימתי")}</button>
 </div>
 </Sheet>
        );
      })()/* @screen-end */
  );
}

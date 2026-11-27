"use client";
// app/screens/WaQueueModal.jsx — {showWaQueue && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <WaQueueModal> in app/beautyos.jsx (the check fails until both sides agree).
import { parseDb } from "@/lib/dbTime";
import { contactAgoHe } from "@/lib/leads/contact";
import Sheet from "../Sheet";
import { tr } from "@/lib/i18n/tr";

export default function WaQueueModal({ ctx }) {
  const {
    pcGrad, setShowWaQueue, setWaQueueDone, setWhatsappPending, toast, waMsg, waQueueDone, whatsappPending,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>setShowWaQueue(false)} width={440} zIndex={4000} title={tr("הודעות מוכנות לשליחה")}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:14}}>{tr("ההודעות כאן עוד לא נשלחו. לחיצה על \"שליחה\" פותחת את הוואטסאפ שלך עם הטקסט מוכן, ונשאר רק ללחוץ שליחה.")}</p>
          {whatsappPending.length===0?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",padding:"20px 0"}}>{tr("אין הודעות שמחכות לשליחה.")}</p>
          ):(whatsappPending.map((m,i)=>{
            const link=waMsg(m.recipient_phone,m.message_body);
            const done=!!waQueueDone[m.id];
            // The visible age marker: how long this has been waiting for her
            // tap. Minutes/hours for anything recent, falling back to the
            // same day-granularity contactAgoHe uses elsewhere once it's
            // been more than a day - a message that's been sitting that
            // long needs the same quiet urgency a lapsed-client line gets.
            const ageHe=(()=>{
              const ts=parseDb(m.created_at).getTime();
              if(!Number.isFinite(ts))return"";
              const mins=Math.floor((Date.now()-ts)/60000);
              if(mins<1)return"ממש עכשיו";
              if(mins<60)return`לפני ${mins} דק׳`;
              const hrs=Math.floor(mins/60);
              if(hrs<24)return`לפני ${hrs} שע׳`;
              return contactAgoHe(m.created_at);
            })();
            return(
 <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:i===0?"none":"1px solid var(--line)"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.recipient_name||tr("(ללא שם)")}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.message_body}</p>
 {ageHe&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",marginTop:2}}>{tr("ממתינה ·")} {ageHe}</p>}
 </div>
                {link?(
 <a href={link} target="_blank" rel="noreferrer" onClick={()=>{setWaQueueDone(prev=>({...prev,[m.id]:true}));fetch("/api/messages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:m.id})}).then(r=>{if(!r.ok)throw new Error(String(r.status));}).catch(()=>{setWaQueueDone(prev=>({...prev,[m.id]:false}));toast(tr("לא הצלחנו לשמור שההודעה נפתחה"),"error");});}} className="primary-btn" style={{background:done?"var(--surface-2)":"#25D366",color:done?"var(--ink-3)":"#fff",padding:"8px 14px",fontSize:"var(--t-sm)",textDecoration:"none",whiteSpace:"nowrap",borderRadius:"var(--r-sm)"}}>{done?tr("✓ נפתח"):tr("שליחה")}</a>
                ):(
 <span style={{fontSize:"var(--t-xs)",color:"var(--danger)",whiteSpace:"nowrap"}}>{tr("מספר לא תקין")}</span>
                )}
                {/* Off the list without sending: an old reminder for a visit that already happened.
                    It stays in the message log as "הוסרה מהרשימה". */}
                {!done&&<button aria-label={tr("הסרת ההודעה ל{0} מהרשימה", [m.recipient_name||"לקוחה"])} title={tr("הסרה מהרשימה בלי לשלוח")} onClick={()=>{fetch("/api/messages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:m.id,action:"dismiss"})}).then(r=>{if(!r.ok)throw new Error(String(r.status));setWhatsappPending(prev=>prev.filter(x=>x.id!==m.id));}).catch(()=>toast(tr("לא הצלחנו להסיר את ההודעה מהרשימה"),"error"));}} style={{background:"none",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"7px 10px",fontSize:"var(--t-sm)",color:"var(--ink-3)",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{tr("הסרה")}</button>}
 </div>
            );
          }))}
 <div style={{display:"flex",gap:8,marginTop:14}}>
 <div style={{flex:1}}/>
 <button onClick={()=>{setShowWaQueue(false);setWhatsappPending(prev=>prev.filter(m=>!waQueueDone[m.id]));}} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"9px 18px",fontSize:"var(--t-sm)"}}>{tr("סיימתי")}</button>
 </div>
 </Sheet>/* @screen-end */
  );
}

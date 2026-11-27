"use client";
// app/screens/VoiceModal.jsx — {showVoice && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <VoiceModal> in app/beautyos.jsx (the check fails until both sides agree).
import { ICON_MICROPHONE } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import Icon from "../Icon";
import { fmtTime, fmtApptTime } from "@/lib/apptTime";
import { tr, uiDir } from "@/lib/i18n/tr";

export default function VoiceModal({ ctx }) {
  const {
    activeServices, clients, closeVoice, fmtPhone, handleVoiceBook, handleVoiceCancel, handleVoiceReceipt,
    isBusy, NO_SERVICES_HINT, pc, pcGrad, pcTint, setupHint, setVoiceBooking, setVoiceCall, setVoiceCancel,
    setVoiceReceipt, startVoice, voiceBooking, voiceCall, voiceCancel, VoiceCommandList, voiceErr, voiceInfo,
    voiceIntent, voiceReceipt, voiceStatus, voiceTranscript,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={closeVoice} width={430} zIndex={4200} className="pop-in" ariaLabel={tr("שליטה קולית")}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <BrandImage width={44} height={44} aria-hidden alt="" src={ICON_MICROPHONE} style={{width:44,height:44,objectFit:"contain",flexShrink:0}}/>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("העוזרת הקולית ✦")}</h3>
 </div>
 <button onClick={closeVoice} aria-label={tr("סגירה")} style={{background:"none",border:"none",fontSize:"var(--t-lg)",cursor:"pointer",color:"var(--ink-3)"}}>✕</button>
 </div>

            {voiceStatus==="listening"&&(
 <div style={{textAlign:"center",padding:"16px 0"}}>
 <div className="voice-pulse" style={{width:66,height:66,borderRadius:"50%",background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:pc}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_MICROPHONE} style={{width:48,height:48,objectFit:"contain"}}/>
 </div>
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)"}}><Spinner inline label={tr("מקשיבה")}/></p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:5,lineHeight:1.5}}>{tr("אמרי בקול אחת מהפקודות הבאות:")}</p>
 <VoiceCommandList/>
 </div>
            )}

            {voiceStatus==="processing"&&(
 <div style={{textAlign:"center",padding:"18px 0"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:6}}>{tr("שמעתי: \"")}{voiceTranscript}"</p>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:pc}}>{tr("מבינה את הבקשה…")}</p>
 </div>
            )}

            {voiceStatus==="result"&&voiceIntent&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10}}>{tr("שמעתי: \"")}{voiceIntent.raw||voiceTranscript}"</p>
                {voiceIntent.action==="book_appointment"?(
 <div style={{background:pcTint,border:`1px solid ${pc}`,borderRadius:"var(--r-md)",padding:"14px 16px"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:pc,marginBottom:8}}>{tr("הבנתי, קביעת תור:")}</p>
                    {[["לקוחה",voiceIntent.client_name],["תאריך",voiceIntent.date],["שעה",voiceIntent.time],["שירות",voiceIntent.service]].map(([l,v])=>(
 <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(212,175,55,0.16)"}}>
 <span style={{fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>{l}</span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{v||tr("לא צוין")}</span>
 </div>
                    ))}
 </div>
                ):(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,textAlign:"center",padding:"8px 0"}}>{tr("לא זיהיתי פעולה נתמכת. כרגע נתמכת קביעת תור, נסי לומר \"קבעי תור ל...\".")}</p>
                )}
                {voiceIntent.clarification&&<p style={{fontSize:"var(--t-xs)",color:"var(--warning)",marginTop:10}}><Icon name="info" size={14}/> {voiceIntent.clarification}</p>}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:12,textAlign:"center"}}>{tr("התור עוד לא נקבע. כדי לקבוע אותו, פתחי \"תור חדש\" ביומן.")}</p>
 <div style={{display:"flex",gap:8,marginTop:14}}>
 <button onClick={startVoice} className="primary-btn" style={{flex:1,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}><Icon name="mic" size={14}/> {tr("נסי שוב")}</button>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"10px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("סגירה")}</button>
 </div>
 </div>
            )}

            {voiceStatus==="confirm"&&voiceBooking&&(()=>{
              const nameLow=(voiceBooking.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceBooking.clientName.trim()&&!existsClient;
              const ready=voiceBooking.clientName.trim()&&voiceBooking.service&&voiceBooking.date&&voiceBooking.time;
              return (
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>{tr("שמעתי: \"")}{voiceIntent?.raw||voiceTranscript}{tr("\". בדקי ואשרי:")}</p>

                {/* client */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("לקוחה")}</p>
 <input value={voiceBooking.clientName} onChange={e=>setVoiceBooking({...voiceBooking,clientName:e.target.value})} placeholder={tr("שם הלקוחה")} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 11px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint}}/>
                  {voiceBooking.clientName.trim()&&(isNew
                    ? <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",marginTop:4}}>{tr("✦ לקוחה חדשה בשם \"")}{voiceBooking.clientName.trim()}{tr("\" תיווצר עם האישור")}</p>
                    : <p style={{fontSize:"var(--t-sm)",color:"var(--success)",marginTop:4}}>{tr("✓ לקוחה קיימת")}</p>)}
 </div>

                {/* service picker */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:4}}>{tr("שירות")} {voiceBooking.service?"":tr("בחרי:")}</p>
                {activeServices.length===0&&setupHint(NO_SERVICES_HINT)}
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {activeServices.map(s=>{
                      const sel=voiceBooking.service===s.name;
                      return <button key={s.id||s.name} onClick={()=>setVoiceBooking({...voiceBooking,service:s.name})} style={{padding:"6px 11px",borderRadius:"var(--r-md)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid var(--line)",background:sel?pcTint:"var(--surface)",color:sel?pc:"var(--ink-2)"}}>{s.name}</button>;
                    })}
 </div>
 </div>

                {/* date + time */}
 <div style={{display:"flex",gap:8,marginBottom:6}}>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("תאריך")}</p><input type="date" value={voiceBooking.date} onChange={e=>setVoiceBooking({...voiceBooking,date:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("שעה")}</p><input type="time" value={voiceBooking.time} onChange={e=>setVoiceBooking({...voiceBooking,time:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 </div>
                {/* The "this will be saved on the round hour" notice that used
                    to live here is gone, along with the rounding it was warning
                    about. Half-hour starts are stored exactly since the minutes
                    migration, so the notice was telling her the opposite of the
                    truth. */}

 <div style={{display:"flex",gap:8,marginTop:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("ביטול")}</button>
 <button onClick={handleVoiceBook} disabled={!ready||isBusy("voiceBook")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("voiceBook")?<Spinner inline label={tr("קובעת")}/>:tr("✦ אישור וקביעת תור")}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="info"&&voiceInfo&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>{tr("שמעתי: \"")}{voiceIntent?.raw||voiceTranscript}"</p>
                {voiceInfo.kind==="day"&&(
 <div>
 <h4 className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:"var(--ink)",marginBottom:10}}>{tr("תורים ל-")}{(voiceInfo.date||"").split("-").reverse().join("/")}</h4>
                    {voiceInfo.items.length===0?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",padding:"16px 0"}}>{tr("אין תורים ביום הזה")}</p>
                    ):voiceInfo.items.map((it,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",background:pcTint,borderRadius:"var(--r-sm)",marginBottom:6}}>
 <span className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:pc,width:52,flexShrink:0}}>{fmtTime(it.startMinute ?? it.hour * 60)}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{it.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{it.service}</p>
 </div>
 </div>
                    ))}
 </div>
                )}
                {voiceInfo.kind==="revenue"&&(
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:"var(--r-md)",padding:"22px 18px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:8}}>{voiceInfo.period==="today"?tr("הכנסות היום"):tr("הכנסות החודש")}</p>
 <p className="serif" style={{fontSize:"var(--t-hero)",fontWeight:600,color:"var(--ink)",lineHeight:1}}>₪{Math.round(voiceInfo.total).toLocaleString()}</p>
 <p style={{fontSize:"var(--t-xs)",color:pc,marginTop:8,fontWeight:500}}>{voiceInfo.count} {tr("עסקאות")}</p>
 </div>
                )}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:14,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("סגירה")}</button>
 </div>
            )}

            {voiceStatus==="cancel"&&voiceCancel&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>{tr("שמעתי: \"")}{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCancel.selected?(
 <div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",marginBottom:10}}>{tr("נמצאו כמה תורים, בחרי איזה לבטל:")}</p>
                    {voiceCancel.matches.map(a=>(
 <button key={a.id} onClick={()=>setVoiceCancel({...voiceCancel,selected:a})} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"right",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:pc,width:78,flexShrink:0}}>{(a.date||"").split("-").reverse().slice(0,2).join("/")} · {fmtApptTime(a)}</span>
 <span style={{flex:1,minWidth:0}}><span style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{a.name}</span> <span style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {a.service}</span></span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("ביטול")}</button>
 </div>
                ):(
 <div>
 <div style={{background:"#FEECEC",border:"1px solid #F3C6C6",borderRadius:"var(--r-md)",padding:"16px 16px",textAlign:"center",marginBottom:14}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600,marginBottom:8}}>{tr("לבטל את התור?")}</p>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{voiceCancel.selected.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:3}}>{voiceCancel.selected.service} · {(voiceCancel.selected.date||"").split("-").reverse().join("/")} {tr("בשעה")} {fmtApptTime(voiceCancel.selected)}</p>
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("לא, השאירי")}</button>
 <button onClick={handleVoiceCancel} disabled={isBusy("voiceCancel")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"var(--danger)",color:"var(--surface)",fontSize:"var(--t-sm)"}}>{isBusy("voiceCancel")?<Spinner inline label={tr("מבטלת")}/>:tr("כן, בטלי את התור")}</button>
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="call"&&voiceCall&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>{tr("שמעתי: \"")}{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCall.selected?(
 <div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",marginBottom:10}}>{tr("נמצאו כמה לקוחות, בחרי למי לחייג:")}</p>
                    {voiceCall.matches.map(c=>(
 <button key={c.id} onClick={()=>setVoiceCall({...voiceCall,selected:c})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",textAlign:"right",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{c.name}</span>
 <span style={{fontSize:"var(--t-xs)",color:c.phone?"var(--ink-2)":"var(--ink-3)",direction:"ltr"}}>{c.phone||tr("אין מספר")}</span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("סגירה")}</button>
 </div>
                ):(
 <div>
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:"var(--r-md)",padding:"20px 16px",marginBottom:14}}>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)"}}>{voiceCall.selected.name}</p>
                      {voiceCall.selected.phone
                        ? <p style={{fontSize:"var(--t-lg)",color:pc,marginTop:6,direction:"ltr",fontWeight:600}}>{fmtPhone(voiceCall.selected.phone)}</p>
                        : <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",marginTop:8}}>{tr("אין מספר טלפון שמור ל")}{voiceCall.selected.name}</p>}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("סגירה")}</button>
                      {voiceCall.selected.phone&&(
 <button onClick={()=>{ window.location.href = `tel:${(voiceCall.selected.phone||"").replace(/[^\d+]/g,"")}`; }} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}><Icon name="phone" size={14}/> {tr("חיוג")}</button>
                      )}
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="receipt"&&voiceReceipt&&(()=>{
              const nameLow=(voiceReceipt.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceReceipt.clientName.trim()&&!existsClient;
              const ready=voiceReceipt.clientName.trim()&&Number(voiceReceipt.amount)>0;
              return (
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>{tr("שמעתי: \"")}{voiceIntent?.raw||voiceTranscript}{tr("\". בדקי ואשרי רישום תשלום:")}</p>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("לקוחה")}</p>
 <input value={voiceReceipt.clientName} onChange={e=>setVoiceReceipt({...voiceReceipt,clientName:e.target.value})} placeholder={tr("שם הלקוחה")} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 11px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint}}/>
                  {voiceReceipt.clientName.trim()&&(isNew
                    ? <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",marginTop:4}}>{tr("✦ לקוחה חדשה בשם \"")}{voiceReceipt.clientName.trim()}{tr("\" תיווצר עם האישור")}</p>
                    : <p style={{fontSize:"var(--t-sm)",color:"var(--success)",marginTop:4}}>{tr("✓ לקוחה קיימת")}</p>)}
 </div>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("סכום (₪)")}</p>
 <input type="number" value={voiceReceipt.amount} onChange={e=>setVoiceReceipt({...voiceReceipt,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 11px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/>
 </div>

 <div style={{marginBottom:12}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:4}}>{tr("אמצעי תשלום")}</p>
 <div style={{display:"flex",gap:6}}>
                    {["מזומן","אשראי","ביט"].map(pm=>{
                      const sel=voiceReceipt.payment===pm;
                      return <button key={pm} onClick={()=>setVoiceReceipt({...voiceReceipt,payment:pm})} style={{flex:1,padding:"8px 0",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid var(--line)",background:sel?pcTint:"var(--surface)",color:sel?pc:"var(--ink-2)"}}>{pm}</button>;
                    })}
 </div>
 </div>

 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("ביטול")}</button>
 <button onClick={handleVoiceReceipt} disabled={!ready||isBusy("voiceReceipt")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("voiceReceipt")?<Spinner inline label={tr("רושמת")}/>:tr("✦ אישור ורישום תשלום")}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="error"&&(
 <div style={{padding:"14px 0"}}>
 <div style={{textAlign:"center"}}>
 <p style={{fontSize:"var(--t-md)",color:"var(--danger)",marginBottom:12,lineHeight:1.5}}>{voiceErr||tr("לא נקלט דיבור. נסי שוב.")}</p>
 <button onClick={startVoice} className="primary-btn" style={{padding:"10px 22px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}><Icon name="mic" size={14}/> {tr("נסי שוב")}</button>
 </div>
 <VoiceCommandList/>
 </div>
            )}

            {voiceStatus==="unsupported"&&(
 <div style={{padding:"10px 0"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.7,textAlign:"center"}}>{typeof navigator!=="undefined"&&/iPhone|iPad|iPod/.test(navigator.userAgent)
 ?<>{tr("השליטה הקולית לא עובדת באפליקציה שהוספת למסך הבית ולא בדפדפן של אינסטגרם או פייסבוק. ב-")}<b>Safari</b> {tr("באייפון היא עובדת, כשההכתבה דלוקה בהגדרות הטלפון. הפקודות שאפשר להגיד:")}</>
 :<>{tr("השליטה הקולית זמינה בדפדפני")} <b>Chrome</b> {tr("או")} <b>Edge</b> {tr("(מחשב או אנדרואיד). נסי לפתוח את המערכת באחד מהם.")}</>}</p>
 <VoiceCommandList/>
 </div>
            )}
 </Sheet>/* @screen-end */
  );
}

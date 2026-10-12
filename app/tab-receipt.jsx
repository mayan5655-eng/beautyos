"use client";
// app/tab-receipt.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { BANNER_WIDE, BANNER_WIDE_W, BANNER_WIDE_H } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import { fmtTime, fmtApptTime } from "@/lib/apptTime";
import { paymentsOf, isSplit, voidOf, localDayKey } from "@/lib/till";
import { docLabelHe, legalStateHe, creditStateHe } from "@/lib/legalReceipts/policy";
import { marketingStatus, consentFields } from "@/lib/marketingConsent";

export default function ReceiptModal(props) {
  const {
    DAYS_HE,
    REBOOK_INTERVALS,
    clients,
    confirmRebook,
    consentAskFor,
    editRebook,
    formatDateHe,
    handleVoidReceipt,
    isBusy,
    isVoidComplete,
    legalAccount,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    printReceipt,
    rebookDone,
    rebookMinute,
    rebookPickOpen,
    rebookPlan,
    rebookSlots,
    rebookWeeks,
    receiptShareText,
    receiptVoids,
    retryCredit,
    retryLegal,
    saveClientMarketing,
    sendReceiptToClient,
    setBusyKey,
    setConsentAskFor,
    setRebookPick,
    setRebookPickOpen,
    setRebookWeeks,
    setShowReceipt,
    setVoidOpen,
    setVoidReason,
    settings,
    showReceipt,
    voidOpen,
    voidReason,
    waMsg,
  } = props;
  return (
<Sheet open onClose={()=>setShowReceipt(null)} width={360} zIndex={1100} flush className="pop-in" ariaLabel={docLabelHe(showReceipt)}>
 <div className="receipt-print" style={{padding:24}}>
 <div style={{textAlign:"center",borderBottom:"2px dashed var(--line-2)",paddingBottom:14,marginBottom:14}}>
 <BrandImage src={BANNER_WIDE} alt="" width={BANNER_WIDE_W} height={BANNER_WIDE_H} sizes="240px" style={{width:"100%",maxWidth:240,height:"auto",margin:"0 auto 10px",display:"block"}}/>
 <p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{settings.business_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>{docLabelHe(showReceipt)}{showReceipt.legal_status==="issued"&&showReceipt.legal_doc_number?" מספר "+showReceipt.legal_doc_number:""}</p>
                {settings.business_phone&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{settings.business_phone}</p>}
 </div>
 <div style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.9}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>לקוחה:</span><span style={{fontWeight:600}}>{showReceipt.client_name}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>תאריך:</span><span>{localDayKey(showReceipt.created_at)}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>שירות:</span><span style={{fontWeight:600}}>{showReceipt.service}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>אמצעי תשלום:</span><span>{showReceipt.payment_method}</span></div>
                {isSplit(showReceipt)&&paymentsOf(showReceipt).map((ln,i)=>(
 <div key={i} style={{display:"flex",justifyContent:"space-between",paddingRight:12}}><span style={{color:"var(--ink-3)"}}>· {ln.method}</span><span>₪{ln.amount}</span></div>
                ))}
                {showReceipt.discount>0&&<div style={{display:"flex",justifyContent:"space-between",color:pc}}><span>הנחה{showReceipt.discount_pct?` (${showReceipt.discount_pct}%)`:""}:</span><span>−₪{showReceipt.discount}</span></div>}
                {Number(showReceipt.tip)>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>טיפ:</span><span>₪{showReceipt.tip}</span></div>}
                {showReceipt.note&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>הערה:</span><span>{showReceipt.note}</span></div>}
 </div>
 {(()=>{
   const st=legalStateHe(showReceipt);
   if(!st) return legalAccount?.connected?null:<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"12px 0 0"}}>אישור תשלום בלבד. אינו קבלה או חשבונית מס.</p>;
   const issued=showReceipt.legal_status==="issued";
   return(
 <div style={{margin:"12px 0 0",padding:"10px 12px",borderRadius:"var(--r-sm)",background:issued?"rgba(70,179,123,0.08)":"var(--surface-2)",border:"1px solid "+(issued?"var(--success)":"var(--line-2)")}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:issued?"var(--success)":"var(--ink)",margin:0}}>{issued?"✓ ":""}{st}</p>
                    {showReceipt.legal_error&&!issued&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",lineHeight:1.5,margin:"4px 0 0"}}>{showReceipt.legal_error}</p>}
                    {issued&&showReceipt.legal_doc_url&&<a href={showReceipt.legal_doc_url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:6,fontSize:"var(--t-xs)",color:pcDeep,fontWeight:600}}>צפייה במסמך (PDF)</a>}
                    {["failed","unknown","pending"].includes(showReceipt.legal_status)&&<button onClick={()=>retryLegal(showReceipt)} disabled={isBusy("legalIssue")} className="primary-btn" style={{marginTop:8,padding:"8px 14px",fontSize:"var(--t-xs)"}}>{isBusy("legalIssue")?<Spinner inline label="מנסה"/>:showReceipt.legal_status==="unknown"?"בדקתי, המסמך לא הונפק. ניסיון חוזר":"ניסיון חוזר להנפקה"}</button>}
 </div>
   );
 })()}
 <div style={{borderTop:"2px dashed var(--line-2)",marginTop:14,paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)"}}>סה״כ:</span>
 <span className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:isVoidComplete(showReceipt)?"var(--ink-3)":pc,textDecoration:isVoidComplete(showReceipt)?"line-through":"none"}}>₪{showReceipt.amount}</span>
 </div>
              {(()=>{const vd=voidOf(showReceipt,receiptVoids);return vd?(
 <div style={{marginTop:12,padding:"10px 12px",borderRadius:"var(--r-sm)",background:"rgba(224,91,111,0.08)",border:"1px solid var(--danger)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--danger)"}}>{isVoidComplete(showReceipt)?"התשלום בוטל":"ביטול התשלום בתהליך"}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:2,lineHeight:1.5}}>{vd.reason}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:2}}>{localDayKey(vd.created_at)} · {vd.credit_status==="issued"?creditStateHe(vd):(vd.credit_status&&vd.credit_status!=="none")?(creditStateHe(vd)||"ממתין למסמך זיכוי")+". התשלום ממשיך להיספר עד שהמסמך יונפק.":"המקור נשמר כפי שהיה ואינו נספר בסיכומים"}</p>
 {vd.credit_error&&vd.credit_status!=="issued"&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",marginTop:4,lineHeight:1.5}}>{vd.credit_error}</p>}
 {["failed","unknown","pending_request"].includes(vd.credit_status)&&<button onClick={()=>retryCredit(vd)} disabled={isBusy("legalCredit")} className="primary-btn" style={{marginTop:8,padding:"8px 14px",fontSize:"var(--t-xs)",background:"var(--surface)",color:"var(--danger)",border:"1px solid var(--danger)"}}>{isBusy("legalCredit")?<Spinner inline label="מנסה"/>:"ניסיון חוזר להנפקת זיכוי"}</button>}
 {vd.credit_status==="issued"&&vd.credit_doc_url&&<a href={vd.credit_doc_url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:6,fontSize:"var(--t-xs)",color:pcDeep,fontWeight:600}}>צפייה במסמך הזיכוי</a>}
 </div>
              ):null;})()}
 <p style={{textAlign:"center",fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:14}}>תודה ונתראה בקרוב ✦</p>
 </div>
              {/* MARKETING CONSENT, asked by HER, never by a message (a WhatsApp asking for consent may itself be advertising).
                  Only for a client with no answer yet: someone who opted out is never asked again; someone who agreed is not asked twice.
                  "לא עכשיו" writes nothing. Outside .receipt-print, so it never lands on a printed receipt. */}
              {(()=>{
                const cl=showReceipt.client_id?clients.find(c=>String(c.id)===String(showReceipt.client_id)):null;
                if(!cl||marketingStatus(cl)!=="none"||String(consentAskFor)!==String(showReceipt.id)) return null;
                return(
 <div data-testid="consent-prompt" style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--line-2)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",lineHeight:1.5,marginBottom:9}}>שאלת אם היא מאשרת לקבל עדכונים ומבצעים?</p>
 <div style={{display:"flex",gap:8}}>
 <button onClick={()=>saveClientMarketing(cl,consentFields("manual"),"ההסכמה לדיוור נשמרה")} disabled={isBusy("clientMarketing")} className="primary-btn" style={{flex:1,minHeight:44,padding:"10px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>כן, אישרה</button>
 <button onClick={()=>setConsentAskFor(null)} style={{flex:1,minHeight:44,padding:"10px 0",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>לא עכשיו</button>
 </div>
 </div>
                );
              })()}
              {/* NEXT APPOINTMENT — the whole point of putting this here.
                  Above the receipt buttons, because she reaches this screen
                  with the client still in front of her, and this is the last
                  second before that stops being true. */}
              {(()=>{
                const booked = rebookDone && String(rebookDone.receiptId)===String(showReceipt.id) ? rebookDone.appt : null;
                if (booked) return (
 <div style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:"rgba(70,179,123,0.10)",border:"1px solid var(--success)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--success)",marginBottom:2}}>התור הבא נקבע</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>יום {DAYS_HE[new Date(booked.date).getDay()]}, {formatDateHe(new Date(booked.date))} בשעה {fmtApptTime(booked)}</p>
 </div>
                );
                if (!rebookPlan) return null;
                const {slot,svc} = rebookPlan;
                const d = new Date(slot.date);
                return (
 <div style={{margin:"0 24px 14px",padding:"13px 14px",borderRadius:"var(--r-md)",background:pcTint,border:`1px solid ${pc}`}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:9}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>התור הבא</p>
 <div style={{display:"flex",gap:4}}>
                  {REBOOK_INTERVALS.map(w=>(
 <button key={w} onClick={()=>{setRebookWeeks(w);}} style={{minWidth:32,padding:"4px 7px",borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:rebookWeeks===w?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:rebookWeeks===w?"var(--surface)":"transparent",color:rebookWeeks===w?pcDeep:"var(--ink-3)"}} aria-label={`מרווח של ${w} שבועות`}>{w}</button>
                  ))}
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",alignSelf:"center",marginRight:2}}>שב׳</span>
 </div>
 </div>
 <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>יום {DAYS_HE[d.getDay()]}, {formatDateHe(d)} בשעה</p>
                {/* The time is the one thing the chips above cannot express, and
                    the client is the one asking to move it. Tapping opens the
                    day's free starts rather than a raw hour picker, so she
                    cannot choose a slot that is already taken - the list comes
                    from the same freeSlotsOn the proposal itself walked. */}
 <button onClick={()=>setRebookPickOpen(v=>!v)} disabled={rebookSlots.length===0} style={{background:"var(--surface)",border:`1px solid ${pc}`,borderRadius:"var(--r-xs)",padding:"3px 9px",fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,cursor:rebookSlots.length?"pointer":"default",fontFamily:"inherit",direction:"ltr"}} aria-expanded={rebookPickOpen} aria-label="שינוי שעה">{fmtTime(rebookMinute)}</button>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>{svc.name}{(!slot.sameTime&&rebookMinute===slot.minute)&&" · השעה המקורית תפוסה, זה המועד הפנוי הקרוב"}</p>
                {rebookPickOpen&&(
 <div style={{marginTop:8,padding:"8px 8px 4px",borderRadius:"var(--r-sm)",background:"var(--surface)",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:6}}>שעות פנויות ביום הזה</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:132,overflowY:"auto"}}>
                  {rebookSlots.map(m=>{
                    const sel=m===rebookMinute;
                    return (
 <button key={m} onClick={()=>{setRebookPick({receiptId:showReceipt.id,minute:m});setRebookPickOpen(false);}} style={{padding:"7px 10px",borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",fontWeight:sel?700:600,cursor:"pointer",fontFamily:"inherit",direction:"ltr",border:sel?"1px solid transparent":"1px solid var(--line-2)",background:sel?pcGrad:"var(--surface-2)",color:sel?"var(--pc-contrast)":"var(--ink-2)"}}>{fmtTime(m)}</button>
                    );
                  })}
 </div>
 </div>
                )}
 <div style={{display:"flex",gap:6,marginTop:10}}>
 <button onClick={confirmRebook} disabled={isBusy("rebook")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700}}>{isBusy("rebook")?<Spinner inline label="קובעת"/>:"קביעת התור"}</button>
 <button onClick={editRebook} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>שינוי</button>
 </div>
 </div>
                );
              })()}
 <div style={{display:"flex",gap:6,padding:"0 24px 24px"}}>
 <button onClick={()=>printReceipt(showReceipt)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>הדפסה</button>
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));return cl?.phone?(
 <button onClick={async()=>{if(isBusy("sendReceipt"))return;setBusyKey("sendReceipt",true);try{await sendReceiptToClient(showReceipt);}finally{setBusyKey("sendReceipt",false);}}} disabled={isBusy("sendReceipt")} className="primary-btn" style={{flex:1,padding:"11px 0",background:"#25D366",color:"#fff",fontSize:"var(--t-xs)",border:"none"}}>{isBusy("sendReceipt")?<Spinner inline label="שולח"/>:"שליחה ללקוחה"}</button>
              ):null;})()}
 <button onClick={()=>setShowReceipt(null)} className="primary-btn" style={{flex:1,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)"}}>סגירה</button>
 </div>
              {/* VOID. A cancelling record, never an edit and never a delete:
                  the reason is required, the original stays exactly as it was,
                  and every total stops counting it. */}
              {!voidOf(showReceipt,receiptVoids)&&(
 <div style={{margin:"0 24px 18px"}}>
                  {!voidOpen?(
 <button onClick={()=>{setVoidOpen(true);setVoidReason("");}} style={{background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",minHeight:36}}>ביטול התשלום</button>
                  ):(
 <div style={{padding:"12px",borderRadius:"var(--r-sm)",background:"rgba(224,91,111,0.06)",border:"1px solid var(--danger)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:4}}>למה התשלום מבוטל?</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>{showReceipt.legal_status==="issued"?"בחשבון מורנינג שלך יונפק מסמך זיכוי שמבטל את המסמך המקורי. עד שהוא יונפק, התשלום ימשיך להיספר בהכנסות. הביטול עצמו נרשם ואי אפשר למחוק אותו.":"האישור המקורי יישאר כפי שהוא, מסומן כמבוטל, ולא ייספר בהכנסות. הביטול עצמו נרשם ואי אפשר למחוק אותו."}</p>
 <textarea value={voidReason} onChange={e=>setVoidReason(e.target.value)} rows={2} placeholder="למשל: סכום שגוי, נרשם ללקוחה הלא נכונה" aria-label="סיבת הביטול" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",resize:"none",marginBottom:8}}/>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setVoidOpen(false)} className="primary-btn" style={{flex:1,padding:"10px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>חזרה</button>
 <button onClick={()=>handleVoidReceipt(showReceipt)} disabled={!voidReason.trim()||isBusy("voidReceipt")} className="primary-btn" style={{flex:2,padding:"10px 0",background:voidReason.trim()?"var(--danger)":"var(--line-2)",color:"var(--surface)",fontSize:"var(--t-sm)"}}>{isBusy("voidReceipt")?<Spinner inline label="מבטלת"/>:"בטלי את התשלום"}</button>
 </div>
 </div>
                  )}
 </div>
              )}
              {/* Zero-dependency fallback: opens WhatsApp with the receipt pre-filled,
                  works even if GreenAPI isn't connected. */}
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));const phone=(cl?.phone||showReceipt.client_phone||"").trim();return phone?(
 <a href={waMsg(phone,receiptShareText(showReceipt))} target="_blank" rel="noreferrer" className="primary-btn" style={{display:"block",margin:"0 24px 22px",padding:"11px 0",background:"var(--surface)",color:"#128C7E",border:"1.5px solid #25D366",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:700,textAlign:"center",textDecoration:"none"}}>✆ שלחי בוואטסאפ (קישור ישיר)</a>
              ):null;})()}
 </Sheet>
  );
}

"use client";
// app/screens/ReceiptModal.jsx — {showReceipt && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ReceiptModal> in app/beautyos.jsx (the check fails until both sides agree).
import { waLink as waMsgLink } from "@/lib/phone";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import { fmtTime, fmtApptTime } from "@/lib/apptTime";
import { afterSaveLine, messageMoment, loyaltyMessage, isRewardReceipt } from "@/lib/loyalty";
import { paymentsOf, isSplit, voidOf, localDayKey } from "@/lib/till";
import { docLabelHe, legalStateHe, creditStateHe } from "@/lib/legalReceipts/policy";
import { marketingStatus, consentFields } from "@/lib/marketingConsent";
import { receiptMethodLabel, splitVoucherCodes } from "@/lib/giftVouchers";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function ReceiptModal({ ctx }) {
  const {
    activeServices, appointments, clients, confirmRebook, consentAskFor, DAYS_HE, editRebook, fmtDateHe,
    formatDateHe, growRefundLine, handleVoidReceipt, isBusy, isVoidComplete, legalAccount, loyaltyAfterFor,
    loyaltyFor, pc, pcDeep, pcGrad, pcTint, printReceipt, REBOOK_INTERVALS, rebookDone, rebookMinute,
    rebookPickOpen, rebookPlan, rebookSlots, rebookWeeks, receiptShareText, receiptVoids, retryCredit,
    retryLegal, saveClientMarketing, sendReceiptToClient, setBusyKey, setConsentAskFor, setRebookNext,
    setRebookPick, setRebookPickOpen, setRebookWeeks, setShowReceipt, settings, setVoidGrowRefund, setVoidOpen,
    setVoidReason, showReceipt, today, voidGrowRefund, voidOpen, voidReason, waMsg,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>setShowReceipt(null)} width={360} zIndex={1100} flush className="pop-in" ariaLabel={docLabelHe(showReceipt)}>
 <div className="receipt-print" style={{padding:24}}>
 <div style={{textAlign:"center",borderBottom:"2px dashed var(--line-2)",paddingBottom:14,marginBottom:14}}>
 {/* Her payment confirmation carries HER logo, or none: it used to print the Kalmea banner on every client's paper (2026-11-08 QA, brand rule). */}
 {settings?.branding?.logo_url&&<img data-testid="receipt-logo" src={settings.branding.logo_url} alt={settings.business_name||""} style={{maxWidth:160,maxHeight:72,objectFit:"contain",margin:"0 auto 10px",display:"block"}}/>}
 <p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{settings.business_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>{docLabelHe(showReceipt)}{showReceipt.legal_status==="issued"&&showReceipt.legal_doc_number?" מספר "+showReceipt.legal_doc_number:""}</p>
                {settings.business_phone&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{settings.business_phone}</p>}
 </div>
 <div style={{fontSize:"var(--t-xs)",color:"var(--ink)",lineHeight:1.9}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>{tr("לקוחה:")}</span><span style={{fontWeight:600}}>{showReceipt.client_name}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>{tr("תאריך:")}</span><span>{fmtDateHe(localDayKey(showReceipt.created_at))}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>{tr("שירות:")}</span><span style={{fontWeight:600}}>{showReceipt.service}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>{tr("אמצעי תשלום:")}</span><span>{receiptMethodLabel(showReceipt)}</span></div>
                {isSplit(showReceipt)&&paymentsOf(showReceipt).map((ln,i)=>(
 <div key={i} style={{display:"flex",justifyContent:"space-between",paddingRight:12}}><span style={{color:"var(--ink-3)"}}>· {ln.method}</span><span>₪{ln.amount}</span></div>
                ))}
                {showReceipt.discount>0&&<div style={{display:"flex",justifyContent:"space-between",color:pc}}><span>{tr("הנחה")}{showReceipt.discount_pct?` (${showReceipt.discount_pct}%)`:""}:</span><span>−₪{showReceipt.discount}</span></div>}
                {Number(showReceipt.tip)>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>{tr("טיפ:")}</span><span>₪{trv(showReceipt.tip)}</span></div>}
                {/* A voucher code (K7M4-X9Q2) inside the Hebrew note is an LTR isolate that never wraps: left to bidi it broke at the hyphen, halves in the wrong order. */}
                {showReceipt.note&&<div style={{display:"flex",justifyContent:"space-between",gap:10}}><span style={{color:"var(--ink-3)",flexShrink:0}}>{tr("הערה:")}</span><span data-testid="receipt-note">{splitVoucherCodes(showReceipt.note).map((seg,i)=>seg.code?<bdi key={i} dir="ltr" style={{whiteSpace:"nowrap"}}>{trv(seg.text)}</bdi>:<span key={i}>{trv(seg.text)}</span>)}</span></div>}
 </div>
 {(()=>{
   const st=legalStateHe(showReceipt);
   if(!st) return legalAccount?.connected?null:<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",lineHeight:1.5,margin:"12px 0 0"}}>{tr("אישור תשלום בלבד. אינו קבלה או חשבונית מס.")}</p>;
   const issued=showReceipt.legal_status==="issued";
   return(
 <div style={{margin:"12px 0 0",padding:"10px 12px",borderRadius:"var(--r-sm)",background:issued?"rgba(70,179,123,0.08)":"var(--surface-2)",border:"1px solid "+(issued?"var(--success)":"var(--line-2)")}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:issued?"var(--success)":"var(--ink)",margin:0}}>{issued?"✓ ":""}{st}</p>
                    {showReceipt.legal_error&&!issued&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",lineHeight:1.5,margin:"4px 0 0"}}>{showReceipt.legal_error}</p>}
                    {issued&&showReceipt.legal_doc_url&&<a href={showReceipt.legal_doc_url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:6,fontSize:"var(--t-xs)",color:pcDeep,fontWeight:600}}>{tr("צפייה במסמך (PDF)")}</a>}
                    {["failed","unknown","pending"].includes(showReceipt.legal_status)&&<button onClick={()=>retryLegal(showReceipt)} disabled={isBusy("legalIssue")} className="primary-btn" style={{marginTop:8,padding:"8px 14px",fontSize:"var(--t-xs)"}}>{isBusy("legalIssue")?<Spinner inline label={tr("מנסה")}/>:showReceipt.legal_status==="unknown"?tr("בדקתי, המסמך לא הונפק. ניסיון חוזר"):tr("ניסיון חוזר להנפקה")}</button>}
 </div>
   );
 })()}
 <div style={{borderTop:"2px dashed var(--line-2)",marginTop:14,paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)"}}>{tr("סה״כ:")}</span>
 <span className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:isVoidComplete(showReceipt)?"var(--ink-3)":pc,textDecoration:isVoidComplete(showReceipt)?"line-through":"none"}}>₪{showReceipt.amount}</span>
 </div>
              {(()=>{const vd=voidOf(showReceipt,receiptVoids);return vd?(
 <div style={{marginTop:12,padding:"10px 12px",borderRadius:"var(--r-sm)",background:"rgba(224,91,111,0.08)",border:"1px solid var(--danger)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--danger)"}}>{isVoidComplete(showReceipt)?tr("התשלום בוטל"):tr("ביטול התשלום בתהליך")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:2,lineHeight:1.5}}>{vd.reason}</p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:2}}>{localDayKey(vd.created_at)} · {vd.credit_status==="issued"?creditStateHe(vd):(vd.credit_status&&vd.credit_status!=="none")?(creditStateHe(vd)||"ממתין למסמך זיכוי")+". התשלום ממשיך להיספר עד שהמסמך יונפק.":tr("המקור נשמר כפי שהיה ואינו נספר בסיכומים")}</p>
 {growRefundLine(showReceipt,"receipt")}
 {vd.credit_error&&vd.credit_status!=="issued"&&<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",marginTop:4,lineHeight:1.5}}>{vd.credit_error}</p>}
 {["failed","unknown","pending_request"].includes(vd.credit_status)&&<button onClick={()=>retryCredit(vd)} disabled={isBusy("legalCredit")} className="primary-btn" style={{marginTop:8,padding:"8px 14px",fontSize:"var(--t-xs)",background:"var(--surface)",color:"var(--danger)",border:"1px solid var(--danger)"}}>{isBusy("legalCredit")?<Spinner inline label={tr("מנסה")}/>:tr("ניסיון חוזר להנפקת זיכוי")}</button>}
 {vd.credit_status==="issued"&&vd.credit_doc_url&&<a href={vd.credit_doc_url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:6,fontSize:"var(--t-xs)",color:pcDeep,fontWeight:600}}>{tr("צפייה במסמך הזיכוי")}</a>}
 </div>
              ):null;})()}
 <p style={{textAlign:"center",fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:14}}>{tr("תודה ונתראה בקרוב ✦")}</p>
 </div>
              {/* LOYALTY after the save: where she stands now, and when she is one visit away or the gift is ready, a message the
                  owner sends from her own WhatsApp (wa.me). Nothing is sent from here. Outside .receipt-print. */}
              {(()=>{
                if(String(loyaltyAfterFor)!==String(showReceipt.id)||!showReceipt.client_id) return null;
                const ls=loyaltyFor(showReceipt.client_id);
                if(!ls) return null;
                const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));
                const moment=messageMoment(ls);
                const wa=moment&&cl?.phone?waMsgLink(cl.phone,loyaltyMessage(ls,{clientName:cl.name,businessName:settings.business_name})):null;
                return(
 <div data-testid="loyalty-after-save" style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:ls.ready?"var(--k-petal)":pcTint,border:`1px solid ${ls.ready?"var(--k-pink)":"var(--line-2)"}`}}>
 <div style={{display:"flex",gap:3,marginBottom:8}} aria-hidden>{Array.from({length:ls.every},(_,i)=><span key={i} style={{flex:1,height:8,borderRadius:4,background:i<ls.filled?pc:"var(--surface)",border:`1px solid ${pc}`}}/>)}</div>
 {isRewardReceipt(showReceipt)&&<p style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep,margin:"0 0 2px"}}>{tr("✦ המתנה ניתנה, והכרטיסייה מתחילה מחדש")}</p>}
 <p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",margin:0}}>🎁 {afterSaveLine(ls)}</p>
 {ls.ready&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",margin:"2px 0 0"}}>{tr("המתנה:")} {ls.reward}</p>}
 {wa&&<a href={wa} target="_blank" rel="noreferrer" data-testid="loyalty-after-wa" className="wa-btn" style={{display:"inline-flex",marginTop:8,padding:"7px 12px",fontSize:"var(--t-sm)"}}>{moment==="ready"?tr("לספר לה שהמתנה מחכה"):tr("לספר לה שנשאר ביקור אחד")}</a>}
 </div>
                );
              })()}
              {/* MARKETING CONSENT, asked by HER, never by a message (a WhatsApp asking for consent may itself be advertising).
                  Only for a client with no answer yet: someone who opted out is never asked again; someone who agreed is not asked twice.
                  "לא עכשיו" writes nothing. Outside .receipt-print, so it never lands on a printed receipt. */}
              {(()=>{
                const cl=showReceipt.client_id?clients.find(c=>String(c.id)===String(showReceipt.client_id)):null;
                if(!cl||marketingStatus(cl)!=="none"||String(consentAskFor)!==String(showReceipt.id)) return null;
                return(
 <div data-testid="consent-prompt" style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--line-2)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",lineHeight:1.5,marginBottom:9}}>{tr("שאלת אם היא מאשרת לקבל עדכונים ומבצעים?")}</p>
 <div style={{display:"flex",gap:8}}>
 <button onClick={()=>saveClientMarketing(cl,consentFields("manual"),"ההסכמה לדיוור נשמרה")} disabled={isBusy("clientMarketing")} className="primary-btn" style={{flex:1,minHeight:44,padding:"10px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("כן, אישרה")}</button>
 <button onClick={()=>setConsentAskFor(null)} style={{flex:1,minHeight:44,padding:"10px 0",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{tr("לא עכשיו")}</button>
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
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--success)",marginBottom:2}}>{tr("התור הבא נקבע")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("יום")} {trv(DAYS_HE[new Date(booked.date).getDay()])}, {formatDateHe(new Date(booked.date))} {tr("בשעה")} {fmtApptTime(booked)}</p>
 </div>
                );
                // "קבעי לה שוב" (RebookNextSheet, the same sheet as the calendar and client card): her own rhythm, the
                // message offered afterwards. Prefilled with what she just paid for and anchored on this visit. Booking
                // there marks this receipt's "התור הבא נקבע" line through the same rebookDone the strip uses.
                const rbClient = showReceipt.client_id ? clients.find(c=>String(c.id)===String(showReceipt.client_id)) : null;
                const rbLinked = showReceipt.appointment_id ? appointments.find(a=>String(a.id)===String(showReceipt.appointment_id))||null : null;
                const rbService = String(showReceipt.service||"").split(",").map(x=>x.trim()).find(n=>activeServices.some(sv=>sv.name===n))||"";
                // A walk-in sale has no appointment: anchor on the visit she just paid for (the receipt's own day), not on
                // her previous calendar visit, so the next one is not proposed too soon. No time of day, so no anchor minute.
                const rbDay = (()=>{ const t=new Date(showReceipt.created_at||Date.now()); return isNaN(t)?today:`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; })();
                const rbAnchor = rbLinked || (showReceipt.client_id ? {client_id:showReceipt.client_id,date:rbDay,service:rbService} : null);
                const openRebookSheet = rbClient ? ()=>setRebookNext({client:rbClient,appt:rbAnchor,receiptId:showReceipt.id,service:rbService}) : null;
                const sheetButton = openRebookSheet && (
 <button data-testid="rebook-receipt" onClick={openRebookSheet} style={{display:"block",width:"100%",minHeight:44,marginTop:8,background:"transparent",border:"none",color:pcDeep,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>{tr("↻ קבעי לה שוב לפי הקצב שלה")}</button>
                );
                // She already has a next visit on the calendar: say so instead of offering a one-tap second booking, which
                // put a duplicate on the calendar (2026-11-08 QA). The sheet stays one tap away for a real extra visit.
                const rbFuture = rbClient ? appointments.filter(a=>String(a.client_id)===String(rbClient.id)&&a.confirmation_status!=="cancelled"&&a.kind!=="personal"&&String(a.date||"")>today).sort((a,b)=>String(a.date).localeCompare(String(b.date))) : [];
                if (rbFuture.length>0) return (
 <div data-testid="rebook-receipt-already" style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:pcTint,border:`1px solid ${pc}`}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",margin:0}}>{tr("התור הבא")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",margin:"2px 0 0"}}>{tr("כבר יש לה תור ביום")} {DAYS_HE[new Date(rbFuture[0].date).getDay()]}, {formatDateHe(new Date(rbFuture[0].date))} {tr("בשעה")} {fmtApptTime(rbFuture[0])}.</p>
 {sheetButton}
 </div>
                );
                if (!rebookPlan) return openRebookSheet ? (
 <div style={{margin:"0 24px 14px",padding:"12px 14px",borderRadius:"var(--r-md)",background:pcTint,border:`1px solid ${pc}`}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",margin:0}}>{tr("התור הבא")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",margin:"2px 0 0"}}>{tr("היא עוד כאן. זה הרגע הכי טוב לקבוע לה את הפעם הבאה.")}</p>
 {sheetButton}
 </div>
                ) : null;
                const {slot,svc} = rebookPlan;
                const d = new Date(slot.date);
                return (
 <div style={{margin:"0 24px 14px",padding:"13px 14px",borderRadius:"var(--r-md)",background:pcTint,border:`1px solid ${pc}`}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:9}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>{tr("התור הבא")}</p>
 <div style={{display:"flex",gap:4}}>
                  {REBOOK_INTERVALS.map(w=>(
 <button key={w} onClick={()=>{setRebookWeeks(w);}} style={{minWidth:32,padding:"4px 7px",borderRadius:"var(--r-xs)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:rebookWeeks===w?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:rebookWeeks===w?"var(--surface)":"transparent",color:rebookWeeks===w?pcDeep:"var(--ink-3)"}} aria-label={tr("מרווח של {0} שבועות", [w])}>{w}</button>
                  ))}
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",alignSelf:"center",marginRight:2}}>{tr("שב׳")}</span>
 </div>
 </div>
 <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{tr("יום")} {trv(DAYS_HE[d.getDay()])}, {formatDateHe(d)} {tr("בשעה")}</p>
                {/* The time is the one thing the chips above cannot express, and
                    the client is the one asking to move it. Tapping opens the
                    day's free starts rather than a raw hour picker, so she
                    cannot choose a slot that is already taken - the list comes
                    from the same freeSlotsOn the proposal itself walked. */}
 <button onClick={()=>setRebookPickOpen(v=>!v)} disabled={rebookSlots.length===0} style={{background:"var(--surface)",border:`1px solid ${pc}`,borderRadius:"var(--r-xs)",padding:"3px 9px",fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,cursor:rebookSlots.length?"pointer":"default",fontFamily:"inherit",direction:"ltr"}} aria-expanded={rebookPickOpen} aria-label={tr("שינוי שעה")}>{fmtTime(rebookMinute)}</button>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>{svc.name}{(!slot.sameTime&&rebookMinute===slot.minute)&&tr(" · השעה המקורית תפוסה, זה המועד הפנוי הקרוב")}</p>
                {rebookPickOpen&&(
 <div style={{marginTop:8,padding:"8px 8px 4px",borderRadius:"var(--r-sm)",background:"var(--surface)",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:6}}>{tr("שעות פנויות ביום הזה")}</p>
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
 <button onClick={confirmRebook} disabled={isBusy("rebook")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700}}>{isBusy("rebook")?<Spinner inline label={tr("קובעת")}/>:tr("קביעת התור")}</button>
 <button onClick={editRebook} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",color:"var(--ink-2)",fontSize:"var(--t-sm)"}}>{tr("שינוי")}</button>
 </div>
 {sheetButton}
 </div>
                );
              })()}
 <div style={{display:"flex",gap:6,padding:"0 24px 24px"}}>
 <button onClick={()=>printReceipt(showReceipt)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>{tr("הדפסה")}</button>
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));return cl?.phone?(
 <button onClick={async()=>{if(isBusy("sendReceipt"))return;setBusyKey("sendReceipt",true);try{await sendReceiptToClient(showReceipt);}finally{setBusyKey("sendReceipt",false);}}} disabled={isBusy("sendReceipt")} className="primary-btn" style={{flex:1,padding:"11px 0",background:"#25D366",color:"#fff",fontSize:"var(--t-xs)",border:"none"}}>{isBusy("sendReceipt")?<Spinner inline label={tr("שולחת")}/>:tr("שליחה ללקוחה")}</button>
              ):null;})()}
 <button onClick={()=>setShowReceipt(null)} className="primary-btn" style={{flex:1,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)"}}>{tr("סגירה")}</button>
 </div>
              {/* VOID. A cancelling record, never an edit and never a delete:
                  the reason is required, the original stays exactly as it was,
                  and every total stops counting it. */}
              {!voidOf(showReceipt,receiptVoids)&&(
 <div style={{margin:"0 24px 18px"}}>
                  {!voidOpen?(
 <button onClick={()=>{setVoidOpen(true);setVoidReason("");setVoidGrowRefund(true);}} style={{background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"6px 0",minHeight:36}}>{tr("ביטול התשלום")}</button>
                  ):(
 <div style={{padding:"12px",borderRadius:"var(--r-sm)",background:"rgba(224,91,111,0.06)",border:"1px solid var(--danger)"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",marginBottom:4}}>{tr("למה התשלום מבוטל?")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>{showReceipt.legal_status==="issued"?tr("בחשבון מורנינג שלך יונפק מסמך זיכוי שמבטל את המסמך המקורי. עד שהוא יונפק, התשלום ימשיך להיספר בהכנסות. הביטול עצמו נרשם ואי אפשר למחוק אותו."):tr("האישור המקורי יישאר כפי שהוא, מסומן כמבוטל, ולא ייספר בהכנסות. הביטול עצמו נרשם ואי אפשר למחוק אותו.")}</p>
 <textarea value={voidReason} onChange={e=>setVoidReason(e.target.value)} rows={2} placeholder={tr("למשל: סכום שגוי, נרשם ללקוחה הלא נכונה")} aria-label={tr("סיבת הביטול")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",resize:"none",marginBottom:8}}/>
                  {showReceipt.legal_provider==="grow"&&(
 <label data-testid="void-grow-refund" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 10px",marginBottom:8,borderRadius:"var(--r-sm)",background:"var(--surface)",border:"1px solid var(--line-2)",cursor:"pointer",minHeight:44}}>
 <input type="checkbox" checked={voidGrowRefund} onChange={e=>setVoidGrowRefund(e.target.checked)} style={{marginTop:3,width:18,height:18,accentColor:"var(--danger)",flexShrink:0}}/>
 <span style={{fontSize:"var(--t-sm)",lineHeight:1.5,color:"var(--ink-2)"}}>
 <b style={{color:"var(--ink)"}}>{tr("גם להחזיר את הכסף ללקוחה ב-Grow")}</b><br/>
                        {voidGrowRefund?tr("₪{0} יחזרו ללקוחה במלואם, באותו אמצעי תשלום. אם Grow לא תאשר, הביטול יישאר ונגיד לך להחזיר מלוח הבקרה של Grow.", [Number(showReceipt.amount||0)]):tr("בלי הסימון, הביטול הוא רק ברישום שלך, והכסף נשאר אצל Grow.")}
 </span>
 </label>
                  )}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setVoidOpen(false)} className="primary-btn" style={{flex:1,padding:"10px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("חזרה")}</button>
 <button onClick={()=>handleVoidReceipt(showReceipt)} disabled={!voidReason.trim()||isBusy("voidReceipt")} className="primary-btn" style={{flex:2,padding:"10px 0",background:voidReason.trim()?"var(--danger)":"var(--line-2)",color:"var(--surface)",fontSize:"var(--t-sm)"}}>{isBusy("voidReceipt")?<Spinner inline label={tr("מבטלת")}/>:tr("בטלי את התשלום")}</button>
 </div>
 </div>
                  )}
 </div>
              )}
              {/* Zero-dependency fallback: opens WhatsApp with the receipt pre-filled,
                  works even if GreenAPI isn't connected. */}
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));const phone=(cl?.phone||showReceipt.client_phone||"").trim();return phone?(
 <a href={waMsg(phone,receiptShareText(showReceipt))} target="_blank" rel="noreferrer" className="primary-btn" style={{display:"block",margin:"0 24px 22px",padding:"11px 0",background:"var(--surface)",color:"#128C7E",border:"1.5px solid #25D366",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:700,textAlign:"center",textDecoration:"none"}}>{tr("✆ שלחי בוואטסאפ (קישור ישיר)")}</a>
              ):null;})()}
 </Sheet>/* @screen-end */
  );
}

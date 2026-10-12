"use client";
// app/tab-cashier-modal.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { supabase } from "./supabase";
import { isDemoTenantId } from "@/lib/demoTenants";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import GrowChargePanel from "./GrowChargePanel";

export default function CashierModal(props) {
  const {
    NO_SERVICES_HINT,
    SELECTABLE_PAYMENT_METHODS,
    activeServices,
    cashierAppt,
    cashierClient,
    cashierDiscount,
    cashierDiscountIls,
    cashierDiscountMode,
    cashierItems,
    cashierNote,
    cashierPackage,
    cashierSearch,
    cashierTip,
    cashierTotal,
    clients,
    drawFromPackage,
    handleSaveReceipt,
    isBusy,
    paymentMethod,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    setCashierClient,
    setCashierDiscount,
    setCashierDiscountMode,
    setCashierItems,
    setCashierNote,
    setCashierSearch,
    setCashierTip,
    setDrawFromPackage,
    setPaymentMethod,
    setReceipts,
    setShowCashier,
    setSplitLines,
    setSplitOn,
    settings,
    setupHint,
    splitLines,
    splitOn,
    splitResolved,
    toast,
    waPayment,
  } = props;
  return (
<Sheet open onClose={()=>setShowCashier(false)} width={420} zIndex={1000} title="קופה — תשלום חדש">
 <div style={{position:"relative",marginBottom:10}}>
 <input value={cashierSearch} onChange={e=>{setCashierSearch(e.target.value);if(!e.target.value)setCashierClient(null);}} placeholder="חיפוש לקוחה..." style={{width:"100%",border:`1px solid ${cashierClient?"var(--success)":"var(--line)"}`,borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:cashierClient?"var(--surface-2)":pcTint}}/>
              {cashierSearch.length>1&&!cashierClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",borderRadius:"var(--r-sm)",boxShadow:"var(--shadow-md)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:160,overflowY:"auto"}}>
                  {clients.filter(c=>c.name?.includes(cashierSearch)||c.phone?.includes(cashierSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setCashierClient(c);setCashierSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid var(--surface-2)",cursor:"pointer"}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{c.name}</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{c.phone||"אין טלפון"}</p>
 </div>
                  ))}
 </div>
              )}
 </div>
 <div style={{marginBottom:10}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>פריטים</p>
 <select onChange={e=>{const svc=activeServices.find(s=>s.name===e.target.value);if(svc){setCashierItems(prev=>[...prev,{id:Date.now(),name:svc.name,price:svc.price,qty:1,color:svc.color}]);}e.target.value="";}} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"5px 9px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:pc}}><option value="">+ הוסיפי שירות</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price}</option>)}</select>
 </div>
              {cashierItems.length===0?(activeServices.length===0?setupHint(NO_SERVICES_HINT):<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",padding:"8px 0"}}>לא נבחרו פריטים</p>)
                :cashierItems.map(item=>(
 <div key={item.id} style={{padding:"8px 9px",background:pcTint,borderRadius:"var(--r-sm)",marginBottom:4}}>
 <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:item.color||"var(--warning)",flexShrink:0}}/>
 <p style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</p>
 <button onClick={()=>setCashierItems(prev=>prev.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-md)",cursor:"pointer",flexShrink:0,padding:"0 2px"}} title="הסרת הפריט" aria-label="הסרת הפריט">✕</button>
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:Math.max(1,i.qty-1)}:i))} className="icon-btn sm" style={{}} aria-label="פחות">−</button>
 <span style={{fontSize:"var(--t-sm)",minWidth:18,textAlign:"center",flexShrink:0}}>{item.qty}</span>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))} className="icon-btn sm" style={{}} aria-label="עוד">+</button>
 <div style={{flex:1,minWidth:0}}/>
 <input type="number" value={item.price} onChange={e=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,price:Number(e.target.value)}:i))} aria-label="מחיר" style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 </div>
 </div>
                ))}
 </div>
 {/* Discount: shekels or a percentage. The shekel figure is what is stored
     either way; the percentage is remembered beside it. */}
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",flex:1}}>הנחה{cashierDiscountMode==="pct"&&cashierDiscountIls>0?<span style={{color:"var(--ink-3)"}}> · ₪{cashierDiscountIls}</span>:null}</p>
 <div style={{display:"flex",borderRadius:"var(--r-sm)",overflow:"hidden",border:"1px solid var(--line)"}}>
                {[["ils","₪"],["pct","%"]].map(([m,l])=>(
 <button key={m} onClick={()=>{setCashierDiscountMode(m);setCashierDiscount(0);}} aria-label={m==="pct"?"הנחה באחוזים":"הנחה בשקלים"} style={{minWidth:40,height:40,border:"none",background:cashierDiscountMode===m?pc:"var(--surface)",color:cashierDiscountMode===m?"var(--surface)":"var(--ink-2)",fontSize:"var(--t-md)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
                ))}
 </div>
 <input type="number" inputMode="decimal" min={0} max={cashierDiscountMode==="pct"?100:undefined} value={cashierDiscount||""} onChange={e=>setCashierDiscount(e.target.value)} placeholder="0" aria-label="סכום ההנחה" style={{width:80,height:40,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
 {/* Tip: its own column, never part of the amount. */}
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",flex:1}}>טיפ (₪)<span style={{color:"var(--ink-3)"}}> · לא נכלל בהכנסות</span></p>
 <input type="number" inputMode="decimal" min={0} value={cashierTip||""} onChange={e=>setCashierTip(e.target.value)} placeholder="0" aria-label="טיפ" style={{width:80,height:40,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
            {cashierPackage&&(
 <div style={{background:drawFromPackage?"var(--pc-tint)":"var(--surface-2)",border:`1px solid ${drawFromPackage?pc:"var(--line-2)"}`,borderRadius:"var(--r-sm)",padding:"11px 12px",marginBottom:10}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
 <div style={{minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>יש חבילה: {cashierPackage.service}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>נותרו {Number(cashierPackage.total_sessions)-Number(cashierPackage.used_sessions)} מתוך {cashierPackage.total_sessions}</p>
 </div>
 <button onClick={()=>setDrawFromPackage(v=>!v)} style={{background:drawFromPackage?pcGrad:"var(--surface)",color:drawFromPackage?"var(--pc-contrast)":pcDeep,border:drawFromPackage?"none":"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"7px 14px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{drawFromPackage?"✓ מנוכה":"לחייב מהחבילה"}</button>
 </div>
                {drawFromPackage&&<p style={{fontSize:"var(--t-xs)",color:pcDeep,marginTop:6,lineHeight:1.5}}>טיפול אחד ינוכה מהחבילה עם רישום התשלום.</p>}
 </div>
            )}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>אמצעי תשלום</p>
 {cashierTotal>0&&<button onClick={()=>setSplitOn(v=>!v)} style={{background:splitOn?pc:"var(--surface)",color:splitOn?"var(--surface)":pcDeep,border:`1px solid ${splitOn?pc:"var(--line-2)"}`,borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>{splitOn?"✓ פיצול תשלום":"פיצול תשלום"}</button>}
 </div>
 {!splitOn&&(
 <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              {SELECTABLE_PAYMENT_METHODS.map(pm=>(
 <button key={pm.key} onClick={()=>setPaymentMethod(pm.key)} style={{flex:"1 0 28%",minHeight:44,padding:"9px 4px",border:"1px solid",borderColor:paymentMethod===pm.key?pm.color:"var(--line)",borderRadius:"var(--r-sm)",background:paymentMethod===pm.key?pm.color:pcTint,color:paymentMethod===pm.key?"var(--surface)":"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{pm.icon} {pm.key}</button>
              ))}
 </div>
 )}
 {/* Split: two lines. She types the first amount; the second is what is
     left, so the two can only ever add up to the total. */}
 {splitOn&&(
 <div style={{background:"var(--surface-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                {splitResolved.map((ln,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
 <select value={ln.method} onChange={e=>setSplitLines(prev=>{const n=[...prev];n[i]={...(n[i]||{}),method:e.target.value};return n;})} aria-label={`אמצעי תשלום ${i+1}`} style={{flex:1,minHeight:44,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",background:"var(--surface)"}}>
                      {SELECTABLE_PAYMENT_METHODS.map(pm=><option key={pm.key} value={pm.key}>{pm.key}</option>)}
 </select>
 {i===0
   ? <input type="number" inputMode="decimal" min={0} max={cashierTotal} value={splitLines[0]?.amount||""} onChange={e=>setSplitLines(prev=>{const n=[...prev];n[0]={...(n[0]||{}),amount:e.target.value};return n;})} placeholder="0" aria-label="סכום החלק הראשון" style={{width:96,minHeight:44,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
   : <span style={{width:96,minHeight:44,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,background:pcTint,borderRadius:"var(--r-sm)"}}>₪{ln.amount}</span>}
 </div>
                ))}
 {splitResolved[0].method===splitResolved[1].method&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>אותו אמצעי תשלום פעמיים — בחרי שניים שונים.</p>}
 {(!(Number(splitLines[0]?.amount)>0)||Number(splitLines[0]?.amount)>=cashierTotal)&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>כתבי כמה שולם ב{splitResolved[0].method}; השאר יירשם ב{splitResolved[1].method}.</p>}
 </div>
 )}
            {["ביט","פייבוקס","העברה"].includes(paymentMethod)&&cashierClient?.phone&&(
 <div style={{background:"var(--pc-tint)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--pc-deep)",fontWeight:600,marginBottom:6}}>שלחי בקשת תשלום ב-{paymentMethod}</p>
 <a href={waPayment(cashierClient.phone,cashierClient.name,cashierTotal,cashierItems.map(i=>i.name).join(", "),paymentMethod,settings.business_phone)} target="_blank" rel="noreferrer"
                  className="wa-btn" style={{display:"inline-flex",padding:"7px 12px",fontSize:"var(--t-sm)"}}>שלחי בקשת תשלום</a>
 </div>
            )}
 {!isDemoTenantId(settings?.tenant_id)&&cashierTotal>0&&(<GrowChargePanel amount={cashierTotal} description={cashierItems.map(i=>i.name).join(", ")} client={cashierClient} appointmentId={cashierAppt?.id||null} pc={pc} pcTint={pcTint} toast={toast} onPaid={async(receiptId)=>{try{const {data}=await supabase.from("receipts").select("*").eq("id",receiptId);if(data&&data[0])setReceipts(prev=>prev.some(x=>String(x.id)===String(data[0].id))?prev:[...prev,data[0]]);}catch{}}}/>)}
 <textarea value={cashierNote} onChange={e=>setCashierNote(e.target.value)} placeholder="הערה לתשלום" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:10}}/>
 <div style={{padding:"12px 14px",background:pcTint,borderRadius:"var(--r-md)",marginBottom:14}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>סה״כ לתשלום</span>
 <span className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:pc}}>₪{cashierTotal.toLocaleString()}</span>
 </div>
 {Number(cashierTip)>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}><span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>+ טיפ</span><span style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink-2)"}}>₪{Number(cashierTip).toLocaleString()}</span></div>}
 </div>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowCashier(false)} className="primary-btn" style={{flex:1,padding:"12px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSaveReceipt} disabled={isBusy("saveReceipt")} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)"}}>{isBusy("saveReceipt")?<Spinner inline label="שומר"/>:"רשמי תשלום ✓"}</button>
 </div>
 </Sheet>
  );
}

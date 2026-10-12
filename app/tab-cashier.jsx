"use client";
// app/tab-cashier.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { lighten } from "@/lib/theme";
import { ICON_WALLET } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Icon from "./Icon";
import { voidedIds, bucketByMethod, localDayKey } from "@/lib/till";
import { legalStateHe } from "@/lib/legalReceipts/policy";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";

export default function CashierTab(props) {
  const {
    PAYMENT_METHODS,
    clients,
    filteredReceipts,
    handleExportCSV,
    handleOpenCashier,
    liveRcpts,
    monthTotals,
    onKbdActivate,
    pc,
    pcDeep,
    pcGrad,
    receiptFilter,
    receiptVoids,
    setActiveTab,
    setReceiptFilter,
    setShowReceipt,
    settings,
    todayAppts,
    todayTotals,
    waPayment,
  } = props;
  return (
<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>קופה ותשלומים</p>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_WALLET} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",margin:0}}>תשלומים</h2>
 </div>
 <button onClick={()=>setActiveTab("tax")} style={{marginTop:6,background:"none",border:"none",padding:0,color:"var(--pc-deep)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>סיכום הכנסות ודוחות ←</button>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button className="primary-btn" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>✦ תשלום חדש</button>
 <button onClick={handleExportCSV} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"9px 16px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}><Icon name="download" size={14}/> ייצוא Excel</button>
 </div>
 </div>
 {/* INCOME. Today and this month, side by side on a desk, stacked on a
     phone. Each is ONE computation (lib/till totalsOf over one set of
     receipts), and the method rows under a total are that same computation's
     lines - so they add up to it by construction. Every known method is
     listed, zeros included, plus "אחר" for anything stamped with a method
     nobody listed. Tips sit outside every method and outside the total.
     This replaces a month headline with all-time method cards under it,
     which showed cash at 2,700 under a 1,400 month. */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:16}}>
              {[["היום",todayTotals],["החודש",monthTotals]].map(([label,t])=>{
                const rows=bucketByMethod(t, PAYMENT_METHODS.map(m=>m.key));
                return (
 <div key={label} className="glass-card card-boxed" style={{padding:"16px 18px"}}>
 <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>{label} · {t.count===0?"אין תשלומים":t.count===1?"תשלום אחד":`${t.count} תשלומים`}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-hero)",fontWeight:600,color:pc,lineHeight:1.1,marginTop:4}}>₪{t.total.toLocaleString()}</p>
 </div>
                    {t.tips>0&&<div style={{textAlign:"left"}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>+ טיפים</p><p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink-2)"}}>₪{t.tips.toLocaleString()}</p><p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>סה״כ בקופה ₪{t.collected.toLocaleString()}</p></div>}
 </div>
 <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px",marginTop:12,paddingTop:10,borderTop:"1px solid var(--line)"}}>
                    {rows.map(r=>{const pm=PAYMENT_METHODS.find(p=>p.key===r.method);const zero=r.total===0;return(
 <div key={r.method} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,minHeight:28,opacity:zero?0.45:1}}>
 <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:"var(--t-sm)",color:"var(--ink-2)"}}><span style={{width:8,height:8,borderRadius:"50%",background:pm?.color||"var(--ink-3)",flexShrink:0}}/>{r.method}</span>
 <span style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-md)",fontWeight:700,color:zero?"var(--ink-3)":"var(--ink)"}}>₪{r.total.toLocaleString()}</span>
 </div>
                    );})}
 </div>
 </div>
                );
              })}
 </div>

            {todayAppts.length>0&&(
 <div className="glass-card card-boxed" style={{padding:"18px 20px",marginBottom:16}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
 <span style={{width:34,height:34,borderRadius:"var(--r-sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",background:"var(--pc-tint)",color:pc}}>⚡</span>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>תורים היום — תשלום מהיר</h3>
 </div>
                {todayAppts.map(a=>{
                  const client=clients.find(c=>String(c.id)===String(a.client_id));
                  const paid=liveRcpts.some(r=>String(r.appointment_id)===String(a.id));
                  return(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",background:paid?"rgba(70,179,123,0.08)":"var(--surface-2)",borderRadius:"var(--r-md)",marginBottom:7,border:`1px solid ${paid?"rgba(70,179,123,0.35)":"var(--line)"}`,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:120}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{a.service} · ₪{a.price}</p>
 </div>
                      {paid?<span className="pill" style={{fontSize:"var(--t-sm)",color:"var(--success)",background:"rgba(70,179,123,0.12)",padding:"4px 11px"}}>✓ שולם</span>
                        :<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                          {client?.phone&&PAYMENT_METHODS.slice(1).map(pm=>(
 <a key={pm.key} href={waPayment(client.phone,a.name,a.price,a.service,pm.key,settings.business_phone)} target="_blank" rel="noreferrer" title={pm.key}
                              style={{background:pm.color,color:"var(--surface)",border:"none",borderRadius:"var(--r-md)",padding:"5px 9px",fontSize:"var(--t-sm)",cursor:"pointer",textDecoration:"none",fontWeight:600}}>{pm.icon}</a>
                          ))}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-md)",padding:"5px 12px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>₪ קופה</button>
 </div>
                      }
 </div>
                  );
                })}
 </div>
            )}

 <div className="glass-card card-boxed" style={{padding:"18px 20px"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:10}}>
 <span style={{width:34,height:34,borderRadius:"var(--r-sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",background:"var(--pc-tint)",color:pc}}>🧾</span>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>אישורי תשלום</h3>
 </div>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {["all",...PAYMENT_METHODS.map(p=>p.key)].map(m=>(
 <button key={m} onClick={()=>setReceiptFilter(m)} style={{background:receiptFilter===m?pcGrad:"var(--surface)",color:receiptFilter===m?"var(--pc-contrast)":"var(--ink-2)",border:`1px solid ${receiptFilter===m?"transparent":"var(--line-2)"}`,borderRadius:"var(--r-lg)",padding:"5px 12px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:receiptFilter===m?"var(--shadow-accent)":"var(--shadow-xs)"}}>
                      {m==="all"?"הכל":m}
 </button>
                  ))}
 </div>
 </div>
              {filteredReceipts.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"46px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:"var(--r-lg)",marginTop:6}}>
 <div style={{width:60,height:60,borderRadius:"var(--r-lg)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-3xl)",background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>🧾</div>
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:5}}>{receiptFilter!=="all"?"אין תשלומים בסינון הזה":"עוד אין תשלומים"}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",maxWidth:320,margin:"0 auto 18px",lineHeight:1.6}}>{receiptFilter!=="all"?"נסי לשנות את אופן התשלום בסינון.":"כל תשלום שתגבי יופיע כאן. אפשר לפתוח תשלום חדש עכשיו."}</p>
 {receiptFilter==="all"&&<button className="empty-cta primary-btn" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"11px 22px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>✦ תשלום חדש</button>}
 </div>
              ):filteredReceipts.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,20).map(r=>{
                const pm=PAYMENT_METHODS.find(p=>p.key===r.payment_method);
                const pmColor=pm?.color||DEFAULT_SERVICE_COLOR;
                const voided=voidedIds(receiptVoids).has(String(r.id));
                return(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת אישור תשלום — ${r.client_name||"לקוחה"}${voided?" (מבוטלת)":""}`} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 13px",background:"var(--surface-2)",border:`1px solid ${voided?"rgba(224,91,111,0.45)":"var(--line)"}`,borderRadius:"var(--r-md)",marginBottom:6,cursor:"pointer",opacity:voided?0.7:1}} className="client-row">
 <div style={{width:36,height:36,borderRadius:"var(--r-sm)",background:`linear-gradient(135deg,${lighten(pmColor,0.35)},${pmColor})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",color:"var(--surface)",flexShrink:0,boxShadow:"var(--shadow-xs)"}}>
                      {pm?.icon||"₪"}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{r.client_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.service} · {r.payment_method} · {localDayKey(r.created_at)}{Number(r.tip)>0?` · טיפ ₪${r.tip}`:""}</p>
 </div>
 {voided&&<span className="pill" style={{fontSize:"var(--t-xs)",color:"var(--danger)",background:"rgba(224,91,111,0.10)",padding:"3px 8px",fontWeight:700}}>מבוטל</span>}
 {!voided&&legalStateHe(r)&&<span className="pill" style={{fontSize:"var(--t-xs)",color:r.legal_status==="issued"?"var(--success)":"var(--warning)",background:"var(--surface-2)",padding:"3px 8px",fontWeight:700,whiteSpace:"nowrap"}}>{legalStateHe(r)}</span>}
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontSize:"var(--t-lg)",fontWeight:600,color:voided?"var(--ink-3)":pc,textDecoration:voided?"line-through":"none"}}>₪{r.amount}</p>
 </div>
                );
              })}
 </div>
 </div>
 </>
  );
}

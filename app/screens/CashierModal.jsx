"use client";
// app/screens/CashierModal.jsx — {showCashier && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <CashierModal> in app/beautyos.jsx (the check fails until both sides agree).
import { supabase } from "../supabase";
import { isDemoTenantId } from "@/lib/demoTenants";
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import { afterSaveLine } from "@/lib/loyalty";
import { ProductTillPicker, ProductTillWarnings } from "../ProductsTill";
import { giftVouchersVisible, giftVouchersSelling } from "@/lib/giftVouchers";
import { tr, uiDir } from "@/lib/i18n/tr";

export default function CashierModal({ ctx }) {
  const {
    activeServices, applyCashierAdjustments, applyLoyaltyReward, cashierAllServices, cashierAppt, cashierClient,
    cashierDiscount, cashierDiscountIls, cashierDiscountMode, cashierExtrasOpen, cashierItems, cashierLoyalty,
    cashierNote, cashierPackage, cashierSearch, cashierTip, cashierTotal, clients, drawFromPackage,
    GrowCashierCredit, GrowChargePanel, growCreditUsed, growDepositUsed, handleSaveReceipt, isBusy, legalAccount,
    loyaltyApplied, loyaltyCfg, loyaltyRewardLive, membershipAdj, MembershipTill, NO_SERVICES_HINT, openSetupTab,
    openVoucherSale, paymentMethod, pc, pcDeep, pcGrad, pcTint, productsApi, SELECTABLE_PAYMENT_METHODS,
    servicesByUse, setCashierAllServices, setCashierClient, setCashierDiscount, setCashierDiscountMode,
    setCashierExtrasOpen, setCashierItems, setCashierNote, setCashierSearch, setCashierTip, setDrawFromPackage,
    setGrowAdj, setMembershipAdj, setPaymentMethod, setReceipts, setShowCashier, setSplitLines, setSplitOn,
    settings, setupHint, setVoucherAdj, splitLines, splitOn, splitResolved, TAX_STATUS_HE, taxStatusUnconfirmed,
    toast, voucherAdj, voucherDue, VoucherRedeemTill, vouchersAvail, waPayment,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>setShowCashier(false)} width={420} zIndex={1000} title={tr("תשלום חדש")}>
 {/* No business type = no legal document from Morning (lib/legalReceipts/service.js, tax_status_missing). Said here, before she
     charges, with a way to fix it. Never blocks the payment itself (owner's decision, 2026-10-23). */}
 {(!settings.business_tax_status||taxStatusUnconfirmed(settings))&&(
 <div role="note" data-testid="cashier-tax-warning" style={{background:"var(--k-petal)",border:"1px solid var(--k-pink)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:10,fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.55}}>
 {!settings.business_tax_status?(<>
 <p style={{fontWeight:700,margin:0}}>{tr("רגע לפני שגובים: עוד לא בחרת סוג עסק")}</p>
 <p style={{margin:"3px 0 4px",color:"var(--ink-2)"}}>{legalAccount?.connected?tr("בלי לבחור פטור, מורשה או חברה, מורנינג לא תפיק קבלה חוקית על התשלום הזה."):tr("בלי לבחור פטור, מורשה או חברה לא נוכל להפיק קבלה חוקית כשתחברי את מורנינג, וסיכום ההכנסות לא יחושב.")} {tr("התשלום עצמו יירשם כרגיל.")}</p>
 </>):(<>
 <p style={{fontWeight:700,margin:0}}>{tr("רגע לפני שגובים: בדקי את סוג העסק")}</p>
 <p style={{margin:"3px 0 4px",color:"var(--ink-2)"}}>{tr("כרגע רשום \"")}{TAX_STATUS_HE[settings.business_tax_status]||settings.business_tax_status}{tr("\" כברירת מחדל, ועוד לא אישרת שזה נכון.")} {legalAccount?.connected?tr("אם זה לא הסוג שלך, הקבלה ממורנינג תצא מהסוג הלא נכון."):tr("זה קובע איזו קבלה תצא כשתחברי את מורנינג.")} {tr("התשלום עצמו יירשם כרגיל.")}</p>
 </>)}
 <button type="button" onClick={()=>{setShowCashier(false);openSetupTab("general");}} style={{background:"none",border:"none",padding:"8px 0",minHeight:40,color:"var(--k-green)",fontWeight:700,fontSize:"var(--t-sm)",textDecoration:"underline",cursor:"pointer",fontFamily:"inherit"}}>{settings.business_tax_status?tr("לאישור סוג העסק בהגדרות ←"):tr("לבחירת סוג העסק בהגדרות ←")}</button>
 </div>
 )}
 {/* Selling a gift voucher from here: opens the SAME sale form as the vouchers tab (app/GiftVouchersPanel.jsx, /api/vouchers 'sell'),
     never a second sale path. Only on a fresh payment (no appointment, nothing added yet), so a half-built sale is never lost. */}
 {giftVouchersSelling(settings)&&vouchersAvail&&!cashierAppt&&cashierItems.length===0&&(
 <button type="button" data-testid="cashier-sell-voucher" onClick={openVoucherSale} style={{display:"flex",alignItems:"center",gap:10,width:"100%",minHeight:48,marginBottom:10,padding:"10px 12px",background:pcTint,border:`1px dashed ${pc}`,borderRadius:"var(--r-sm)",cursor:"pointer",fontFamily:"inherit",textAlign:"right",color:"var(--ink)"}}>
 <span aria-hidden="true" style={{fontSize:"var(--t-lg)",flexShrink:0}}>🎁</span>
 <span style={{flex:1,minWidth:0}}><span style={{display:"block",fontSize:"var(--t-sm)",fontWeight:700}}>{tr("מכירת שובר מתנה")}</span><span style={{display:"block",fontSize:"var(--t-xs)",color:"var(--ink-2)"}}>{tr("לקוחה קונה שובר במקום טיפול? מכאן")}</span></span>
 <span aria-hidden="true" style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--pc-deep)",flexShrink:0}}>←</span>
 </button>
 )}
 <div style={{position:"relative",marginBottom:10}}>
 <input value={cashierSearch} onChange={e=>{setCashierSearch(e.target.value);if(!e.target.value)setCashierClient(null);}} placeholder={tr("חיפוש לקוחה...")} style={{width:"100%",border:`1px solid ${cashierClient?"var(--success)":"var(--line)"}`,borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:cashierClient?"var(--surface-2)":pcTint}}/>
              {cashierSearch.length>1&&!cashierClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",borderRadius:"var(--r-sm)",boxShadow:"var(--shadow-md)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:160,overflowY:"auto"}}>
                  {clients.filter(c=>c.name?.includes(cashierSearch)||c.phone?.includes(cashierSearch)).slice(0,6).map(c=>(
 <button type="button" key={c.id} onClick={()=>{setCashierClient(c);setCashierSearch(c.name);}} className="client-row" style={{display:"block",width:"100%",minHeight:44,textAlign:"right",background:"none",border:"none",padding:"9px 12px",borderBottom:"1px solid var(--surface-2)",cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{display:"block",fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{c.name}</span><span style={{display:"block",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{c.phone||tr("אין טלפון")}</span>
 </button>
                  ))}
 </div>
              )}
 </div>
 <div style={{marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600,marginBottom:6}}>{tr("טיפול")}</p>
 {/* One-tap chips, most-used first: the same chips as the booking sheet (UX pass 2026-11-08). A tap adds the treatment. */}
 {activeServices.length>0&&(
 <div data-testid="cashier-service-chips" style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                  {(cashierAllServices?servicesByUse:servicesByUse.slice(0,6)).map(sv=>(
 <button type="button" key={sv.name} onClick={()=>setCashierItems(prev=>[...prev,{id:Date.now(),name:sv.name,price:sv.price,qty:1,color:sv.color}])} style={{padding:"8px 12px",minHeight:44,borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"1px solid var(--line-2)",background:"var(--surface)",color:"var(--ink-2)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>+ {sv.name} · ₪{sv.price}</button>
                  ))}
                  {servicesByUse.length>6&&(
 <button type="button" onClick={()=>setCashierAllServices(v=>!v)} style={{padding:"8px 12px",minHeight:44,borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:`1px dashed ${pc}`,background:"transparent",color:pcDeep}}>{cashierAllServices?tr("פחות"):tr("עוד {0}", [servicesByUse.length-6])}</button>
                  )}
 </div>
 )}
 {/* Products (PR #29): their own picker, next to the treatment chips. */}
 <ProductTillPicker api={productsApi} pc={pc} pcTint={pcTint} onAdd={(item)=>setCashierItems(prev=>[...prev,item])}/>
              {cashierItems.length===0?(activeServices.length===0?setupHint(NO_SERVICES_HINT):null)
                :cashierItems.map(item=>(
 <div key={item.id} style={{padding:"8px 9px",background:pcTint,borderRadius:"var(--r-sm)",marginBottom:4}}>
 <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:item.color||"var(--warning)",flexShrink:0}}/>
 <p style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</p>
 <button onClick={()=>setCashierItems(prev=>prev.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-md)",cursor:"pointer",flexShrink:0,padding:"0 2px"}} title={tr("הסרת הפריט")} aria-label={tr("הסרת הפריט")}>✕</button>
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:Math.max(1,i.qty-1)}:i))} className="icon-btn sm" style={{}} aria-label={tr("פחות")}>−</button>
 <span style={{fontSize:"var(--t-sm)",minWidth:18,textAlign:"center",flexShrink:0}}>{item.qty}</span>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))} className="icon-btn sm" style={{}} aria-label={tr("עוד")}>+</button>
 <div style={{flex:1,minWidth:0}}/>
 <input type="number" value={item.price} onChange={e=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,price:Number(e.target.value)}:i))} aria-label={tr("מחיר")} style={{width:54,flexShrink:0,border:"1px solid var(--line)",borderRadius:"var(--r-xs)",padding:"4px 6px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 </div>
 </div>
                ))}
 </div>
 {/* Products in this sale with less on record than she is selling: a warning, never a block (lib/products.ts). */}
 <ProductTillWarnings api={productsApi} items={cashierItems}/>
 {/* Loyalty (lib/loyalty.js): a reward that is ready is one tap; otherwise one quiet line of progress. */}
 {cashierClient&&cashierLoyalty&&(cashierLoyalty.ready?(
 <div data-testid="loyalty-till" style={{background:loyaltyApplied?"var(--pc-tint)":"var(--k-petal)",border:`1px solid ${loyaltyApplied?pc:"var(--k-pink)"}`,borderRadius:"var(--r-sm)",padding:"11px 12px",marginBottom:10}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",margin:0,minWidth:0}}>{tr("🎁 מגיעה לה מתנה:")} {loyaltyCfg.reward}</p>
 <button type="button" data-testid="loyalty-apply" onClick={applyLoyaltyReward} style={{background:loyaltyApplied?pcGrad:"var(--surface)",color:loyaltyApplied?"var(--pc-contrast)":pcDeep,border:loyaltyApplied?"none":"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"7px 14px",minHeight:40,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{loyaltyApplied?tr("✓ הוחלה"):tr("להחיל")}</button>
 </div>
 {loyaltyApplied&&<p style={{fontSize:"var(--t-xs)",color:pcDeep,margin:"6px 0 0",lineHeight:1.5}}>{loyaltyApplied.mode==="ils"?tr("₪{0} יורדים מהחשבון. ", [loyaltyApplied.discount]):loyaltyApplied.mode==="pct"?tr("{0}% הנחה על הביקור. ", [loyaltyApplied.discount]):tr("המתנה נרשמת עם התשלום. ")}{tr("הכרטיסייה מתחילה מחדש כשתרשמי את התשלום.")}</p>}
 </div>
 ):(
 <p data-testid="loyalty-till-progress" style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",margin:"0 0 10px"}}>{tr("🎁 כרטיסיית נאמנות:")} {cashierLoyalty.filled} {tr("מתוך")} {cashierLoyalty.every}. {afterSaveLine(cashierLoyalty)}</p>
 ))}
 {/* Discount, tip and note: the exception, so behind one line that says what is set (UX pass 2026-11-08). */}
 <button type="button" data-testid="cashier-extras" aria-expanded={cashierExtrasOpen} onClick={()=>setCashierExtrasOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",minHeight:44,background:"none",border:"none",borderTop:"1px solid var(--line)",padding:"4px 2px",marginBottom:8,cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep}}>{tr("הנחה, טיפ והערה")}</span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{cashierExtrasOpen?tr("סגירה"):[Number(cashierDiscount)>0?(cashierDiscountMode==="pct"?`הנחה ${cashierDiscount}%`:`הנחה ₪${cashierDiscount}`):"",Number(cashierTip)>0?`טיפ ₪${cashierTip}`:"",cashierNote.trim()?"הערה":""].filter(Boolean).join(" · ")||tr("לא חובה")}</span>
 </button>
 {cashierExtrasOpen&&(<>
 {/* Discount: shekels or a percentage. The shekel figure is what is stored
     either way; the percentage is remembered beside it. */}
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",flex:1}}>{tr("הנחה")}{cashierDiscountMode==="pct"&&cashierDiscountIls>0?<span style={{color:"var(--ink-3)"}}> · ₪{cashierDiscountIls}</span>:null}</p>
 <div style={{display:"flex",borderRadius:"var(--r-sm)",overflow:"hidden",border:"1px solid var(--line)"}}>
                {[["ils","₪"],["pct","%"]].map(([m,l])=>(
 <button key={m} onClick={()=>{setCashierDiscountMode(m);setCashierDiscount(0);}} aria-label={m==="pct"?tr("הנחה באחוזים"):tr("הנחה בשקלים")} style={{minWidth:40,height:40,border:"none",background:cashierDiscountMode===m?pc:"var(--surface)",color:cashierDiscountMode===m?"var(--surface)":"var(--ink-2)",fontSize:"var(--t-md)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
                ))}
 </div>
 <input type="number" inputMode="decimal" min={0} max={cashierDiscountMode==="pct"?100:undefined} value={cashierDiscount||""} onChange={e=>setCashierDiscount(e.target.value)} placeholder="0" aria-label={tr("סכום ההנחה")} style={{width:80,height:40,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
 {/* Tip: its own column, never part of the amount. */}
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",flex:1}}>{tr("טיפ (₪)")}<span style={{color:"var(--ink-3)"}}> {tr("· לא נכלל בהכנסות")}</span></p>
 <input type="number" inputMode="decimal" min={0} value={cashierTip||""} onChange={e=>setCashierTip(e.target.value)} placeholder="0" aria-label={tr("טיפ")} style={{width:80,height:40,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
 <textarea value={cashierNote} onChange={e=>setCashierNote(e.target.value)} placeholder={tr("הערה לתשלום")} aria-label={tr("הערה לתשלום")} rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"none",marginBottom:10}}/>
 </>)}
            {cashierPackage&&(
 <div style={{background:drawFromPackage?"var(--pc-tint)":"var(--surface-2)",border:`1px solid ${drawFromPackage?pc:"var(--line-2)"}`,borderRadius:"var(--r-sm)",padding:"11px 12px",marginBottom:10}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
 <div style={{minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>{tr("יש חבילה:")} {cashierPackage.service}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("נותרו")} {Number(cashierPackage.total_sessions)-Number(cashierPackage.used_sessions)} {tr("מתוך")} {cashierPackage.total_sessions}</p>
 </div>
 <button onClick={()=>setDrawFromPackage(v=>!v)} style={{background:drawFromPackage?pcGrad:"var(--surface)",color:drawFromPackage?"var(--pc-contrast)":pcDeep,border:drawFromPackage?"none":"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"7px 14px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{drawFromPackage?tr("✓ מנוכה"):tr("לחייב מהחבילה")}</button>
 </div>
                {drawFromPackage&&<p style={{fontSize:"var(--t-xs)",color:pcDeep,marginTop:6,lineHeight:1.5}}>{tr("טיפול אחד ינוכה מהחבילה עם רישום התשלום.")}</p>}
 </div>
            )}
 {/* A client membership: "יש לה מנוי: נשארו 1 מתוך 2", one tap to cover a treatment with a credit (app/MembershipTill.jsx). */}
 {!isDemoTenantId(settings?.tenant_id)&&cashierClient?.id&&(<MembershipTill clientId={String(cashierClient.id)} items={cashierItems} blocked={drawFromPackage&&!!cashierPackage} onChange={setMembershipAdj} pc={pc} pcGrad={pcGrad} pcDeep={pcDeep}/>)}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("אמצעי תשלום")}</p>
 {cashierTotal>0&&<button onClick={()=>setSplitOn(v=>!v)} style={{background:splitOn?pc:"var(--surface)",color:splitOn?"var(--surface)":pcDeep,border:`1px solid ${splitOn?pc:"var(--line-2)"}`,borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:32}}>{splitOn?tr("✓ פיצול תשלום"):tr("פיצול תשלום")}</button>}
 </div>
 {!splitOn&&(
 <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              {SELECTABLE_PAYMENT_METHODS.map(pm=>(
 <button key={pm.key} onClick={()=>setPaymentMethod(pm.key)} style={{flex:"1 0 28%",minHeight:44,padding:"9px 4px",border:"1px solid",borderColor:paymentMethod===pm.key?pm.color:"var(--line)",borderRadius:"var(--r-sm)",background:paymentMethod===pm.key?pm.color:pcTint,color:paymentMethod===pm.key?"var(--surface)":"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{pm.icon} {pm.key}</button>
              ))}
 </div>
 )}
 {giftVouchersVisible(settings)&&(<VoucherRedeemTill due={voucherDue} applied={voucherAdj} onApplied={setVoucherAdj} onCleared={()=>setVoucherAdj(null)} toast={toast} pc={pc} pcTint={pcTint} isDemo={isDemoTenantId(settings?.tenant_id)}/>)}
 {/* Split: two lines. She types the first amount; the second is what is
     left, so the two can only ever add up to the total. */}
 {splitOn&&(
 <div style={{background:"var(--surface-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                {splitResolved.map((ln,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
 <select value={ln.method} onChange={e=>setSplitLines(prev=>{const n=[...prev];n[i]={...(n[i]||{}),method:e.target.value};return n;})} aria-label={tr("אמצעי תשלום {0}", [i+1])} style={{flex:1,minHeight:44,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",background:"var(--surface)"}}>
                      {SELECTABLE_PAYMENT_METHODS.map(pm=><option key={pm.key} value={pm.key}>{pm.key}</option>)}
 </select>
 {i===0
   ? <input type="number" inputMode="decimal" min={0} max={cashierTotal} value={splitLines[0]?.amount||""} onChange={e=>setSplitLines(prev=>{const n=[...prev];n[0]={...(n[0]||{}),amount:e.target.value};return n;})} placeholder="0" aria-label={tr("סכום החלק הראשון")} style={{width:96,minHeight:44,border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"0 10px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
   : <span style={{width:96,minHeight:44,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,background:pcTint,borderRadius:"var(--r-sm)"}}>₪{ln.amount}</span>}
 </div>
                ))}
 {splitResolved[0].method===splitResolved[1].method&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>{tr("אותו אמצעי תשלום פעמיים, בחרי שניים שונים.")}</p>}
 {(!(Number(splitLines[0]?.amount)>0)||Number(splitLines[0]?.amount)>=cashierTotal)&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("כתבי כמה שולם ב")}{splitResolved[0].method}{tr("; השאר יירשם ב")}{splitResolved[1].method}.</p>}
 </div>
 )}
            {["ביט","פייבוקס","העברה"].includes(paymentMethod)&&cashierClient?.phone&&(
 <div style={{background:"var(--pc-tint)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:10}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--pc-deep)",fontWeight:600,marginBottom:6}}>{tr("שלחי בקשת תשלום ב-")}{paymentMethod}</p>
 <a href={waPayment(cashierClient.phone,cashierClient.name,cashierTotal,cashierItems.map(i=>i.name).join(", "),paymentMethod,settings.business_phone)} target="_blank" rel="noreferrer"
                  className="wa-btn" style={{display:"inline-flex",padding:"7px 12px",fontSize:"var(--t-sm)"}}>{tr("שלחי בקשת תשלום")}</a>
 </div>
            )}
 {!isDemoTenantId(settings?.tenant_id)&&(cashierAppt?.id||cashierClient?.id)&&(<GrowCashierCredit appointmentId={cashierAppt?.id||null} clientId={cashierClient?.id||null} pcTint={pcTint} onChange={setGrowAdj}/>)}
 {!isDemoTenantId(settings?.tenant_id)&&cashierTotal>0&&(<GrowChargePanel amount={cashierTotal} description={cashierItems.map(i=>i.name).join(", ")} client={cashierClient} appointmentId={cashierAppt?.id||null} loyalty={loyaltyRewardLive?{reward:loyaltyCfg.reward,stampsUsed:loyaltyApplied.marker?.loyalty_every??loyaltyCfg.every}:null} membership={membershipAdj?{membershipId:membershipAdj.membershipId,service:membershipAdj.service}:null} pc={pc} pcTint={pcTint} toast={toast} onPaid={async(receiptId)=>{await applyCashierAdjustments(String(receiptId),{depositUsed:growDepositUsed,creditUsed:growCreditUsed,appt:cashierAppt,client:cashierClient,pkg:drawFromPackage&&cashierPackage?cashierPackage:null,membership:membershipAdj,loyalty:loyaltyRewardLive,loyaltyMarked:false,loyaltyEvery:loyaltyRewardLive?loyaltyApplied.marker?.loyalty_every:null});try{const {data}=await supabase.from("receipts").select("*").eq("id",receiptId);if(data&&data[0])setReceipts(prev=>prev.some(x=>String(x.id)===String(data[0].id))?prev:[...prev,data[0]]);}catch{}}}/>)}
 <div style={{padding:"12px 14px",background:pcTint,borderRadius:"var(--r-md)",marginBottom:14}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("סה״כ לתשלום")}</span>
 <span className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:pc}}>₪{cashierTotal.toLocaleString()}</span>
 </div>
 {Number(cashierTip)>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}><span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("+ טיפ")}</span><span style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink-2)"}}>₪{Number(cashierTip).toLocaleString()}</span></div>}
 </div>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowCashier(false)} className="primary-btn" style={{flex:1,padding:"12px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={handleSaveReceipt} disabled={isBusy("saveReceipt")} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)"}}>{isBusy("saveReceipt")?<Spinner inline label={tr("שומרת")}/>:tr("רשמי תשלום ✓")}</button>
 </div>
 </Sheet>/* @screen-end */
  );
}

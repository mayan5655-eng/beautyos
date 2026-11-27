"use client";
// app/screens/PackageModal.jsx — {showPackageModal && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <PackageModal> in app/beautyos.jsx (the check fails until both sides agree).
import Sheet from "../Sheet";
import { tr, uiDir } from "@/lib/i18n/tr";

export default function PackageModal({ ctx }) {
  const {
    activeServices, clients, handleSavePackage, newPackage, NO_CLIENTS_HINT, NO_SERVICES_HINT, offerings,
    PAYMENT_METHODS, pcGrad, pcTint, setNewPackage, setShowPackageModal, setupHint,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>setShowPackageModal(false)} width={340} zIndex={1000} title={tr("חבילת טיפולים חדשה")}>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {clients.length===0&&setupHint(NO_CLIENTS_HINT)}
                  {activeServices.length===0&&setupHint(NO_SERVICES_HINT)}
                  {offerings.filter(o=>o.active).length>0&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("מהקטלוג")}</p>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {offerings.filter(o=>o.active).map(o=>{
                          const sel = newPackage.offering_id===o.id;
                          return (
 <button key={o.id} onClick={()=>setNewPackage({...newPackage,offering_id:o.id,service:o.service,total_sessions:Number(o.sessions),price:Number(o.price)})} style={{padding:"7px 11px",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"1px solid",borderColor:sel?"transparent":"var(--line-2)",background:sel?pcGrad:"var(--surface)",color:sel?"var(--pc-contrast)":"var(--ink-2)"}}>
                              {o.service} · {o.sessions} · ₪{o.price}
 </button>
                          );
                        })}
 </div>
 </div>
                  )}
 <select value={newPackage.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewPackage({...newPackage,client_id:e.target.value,client_name:c?.name||""});}} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("בחרי לקוחה")}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newPackage.service} onChange={e=>setNewPackage({...newPackage,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("בחרי שירות")}</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מספר טיפולים")}</p><input type="number" value={newPackage.total_sessions} onChange={e=>setNewPackage({...newPackage,total_sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("תוקף")}</p><select aria-label={tr("תוקף החבילה")} value={newPackage.valid_months||0} onChange={e=>setNewPackage({...newPackage,valid_months:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 8px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}>{[[0,"ללא"],[3,"3 חודשים"],[6,"חצי שנה"],[12,"שנה"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מחיר חבילה ₪")}</p><input type="number" value={newPackage.price} onChange={e=>setNewPackage({...newPackage,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 </div>
                  {/* She is taking money here, so the receipt has to say how.
                      A receipt with no payment method drops out of
                      paymentBreakdown without a trace - the same silence this
                      whole change is about. */}
                  {Number(newPackage.price)>0&&(
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("אמצעי תשלום")}</p>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {PAYMENT_METHODS.map(m=>(
 <button key={m.key} onClick={()=>setNewPackage({...newPackage,payment_method:m.key})} style={{flex:1,minWidth:70,padding:"8px 0",borderRadius:"var(--r-sm)",border:"1px solid",borderColor:newPackage.payment_method===m.key?"transparent":"var(--line-2)",background:newPackage.payment_method===m.key?pcGrad:"var(--surface)",color:newPackage.payment_method===m.key?"var(--pc-contrast)":"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{m.key}</button>
                      ))}
 </div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:6,lineHeight:1.5}}>{tr("יירשם תשלום על סכום החבילה, והיא תיכנס להכנסות.")}</p>
 </div>
                  )}
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowPackageModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={handleSavePackage} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("שמירה ✓")}</button>
 </div>
 </Sheet>/* @screen-end */
  );
}

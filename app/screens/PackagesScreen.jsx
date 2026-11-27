"use client";
// app/screens/PackagesScreen.jsx — the "packages" tab of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <PackagesScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { ICON_CALENDAR } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import EmptyState from "../EmptyState";
import Spinner from "../Spinner";
import DeferredGate from "../DeferredGate";
import { waitlistOffersVisible } from "@/lib/waitlistFlag.js";
import { tr, uiDir } from "@/lib/i18n/tr";

export default function PackagesScreen({ ctx }) {
  const {
    activeServices, deferred, handleSaveOffering, handleUndoPackageSession, handleUsePackageSession, isBusy,
    loadDeferred, newOffering, NO_SERVICES_HINT, offerings, offeringsError, openSettings, packages, pc, pcDeep,
    pcGrad, pcTint, setNewOffering, setShowOfferingForm, setShowPackageModal, setShowWaitlistModal, settings,
    setupHint, showOfferingForm, toggleOffering, waitlist, WaitlistActivity, waLink,
  } = ctx;
  return (
    /* @screen-body */<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>{tr("חבילות טיפולים")}</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("חבילות")}</h2>
 </div>
 <div style={{display:"flex",gap:6}}>
 <button className="primary-btn" onClick={()=>setShowPackageModal(true)} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 16px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("+ מכירת חבילה ללקוחה")}</button>
 <button onClick={()=>setShowWaitlistModal(true)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 16px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>{tr("רשימת המתנה")}</button>
 </div>
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8,flexWrap:"wrap"}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("חבילות למכירה")}</h3>
 <button onClick={()=>setShowOfferingForm(v=>!v)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"6px 14px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{showOfferingForm?tr("סגירה"):tr("+ הגדרת חבילה למכירה")}</button>
 </div>
              {/* The thing that exists before anyone buys it. Without this she
                  could only ASSIGN a package - type a service, a count and a
                  price by hand, every single time, with nothing to show a
                  client and nothing to keep two sales of the same package
                  consistent with each other. */}
              {offeringsError?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>{tr("לא הצלחנו לטעון את החבילות למכירה.")}</p>
              ):(<>
                {showOfferingForm&&(
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-sm)",padding:12,marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                    {activeServices.length===0&&setupHint(NO_SERVICES_HINT)}
 <select value={newOffering.service} onChange={e=>setNewOffering({...newOffering,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)"}}><option value="">{tr("בחרי טיפול")}</option>{activeServices.map(sv=><option key={sv.name}>{sv.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מספר טיפולים")}</p><input type="number" min={1} value={newOffering.sessions} onChange={e=>setNewOffering({...newOffering,sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מחיר ₪")}</p><input type="number" min={0} value={newOffering.price} onChange={e=>setNewOffering({...newOffering,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/></div>
 </div>
                    {Number(newOffering.sessions)>0&&Number(newOffering.price)>0&&(
 <p style={{fontSize:"var(--t-sm)",color:pcDeep,fontWeight:600}}>₪{Math.round(Number(newOffering.price)/Number(newOffering.sessions))} {tr("לטיפול")}</p>
                    )}
 <button onClick={handleSaveOffering} disabled={isBusy("saveOffering")} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"9px 0",fontSize:"var(--t-sm)"}}>{isBusy("saveOffering")?<Spinner inline label={tr("שומרת")}/>:tr("הוספה לקטלוג")}</button>
 </div>
                )}
                {offerings.length===0&&!showOfferingForm?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6}}>{tr("עוד לא הגדרת חבילות למכירה. חבילה היא כמה טיפולים במחיר אחד, מגדירים אותה פעם אחת ומוכרים אותה שוב ושוב.")}</p>
                ):offerings.map(o=>(
 <div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 0",borderBottom:"1px solid var(--surface-2)",opacity:o.active?1:0.5}}>
 <div style={{minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{o.service} · {o.sessions} {tr("טיפולים")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>₪{o.price}{Number(o.sessions)>0?tr(" · ₪{0} לטיפול", [Math.round(Number(o.price)/Number(o.sessions))]):""}</p>
 </div>
 <button onClick={()=>toggleOffering(o)} style={{background:"none",border:"none",color:o.active?"var(--ink-3)":pcDeep,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{o.active?tr("הסתרה"):tr("החזרה")}</button>
 </div>
                ))}
              </>)}
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>{tr("חבילות פעילות (")}{packages.filter(p=>p.active).length})</h3>
              {packages.filter(p=>p.active).length===0?<EmptyState compact icon="package" accent={pc} accentTint={pcTint}
                 title={tr("אין חבילות פעילות")}
                 body={tr("חבילה היא כמה טיפולים שנמכרים מראש. היא מקבעת לקוחה לסדרה שלמה במקום תור אחד, והתשלום נכנס בהתחלה.")}
                 actions={[{label:tr("מכירת חבילה"),onClick:()=>setShowPackageModal(true)}]}/>
                :packages.filter(p=>p.active).map(pkg=>(
 <div key={pkg.id} style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",marginBottom:8,border:"1px solid var(--line)"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9,flexWrap:"wrap",gap:5}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>{pkg.client_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{pkg.service} · ₪{pkg.price}</p>
 </div>
                        {Number(pkg.used_sessions)>0&&(
 <button onClick={()=>handleUndoPackageSession(pkg)} title={tr("ביטול הניכוי האחרון")} style={{background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginLeft:6}}>
                            {tr("↩ ביטול")}
 </button>
                        )}
 <button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        {tr("✓ השתמשי")}
 </button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:5}}>
                      {Array.from({length:Number(pkg.total_sessions)},(_,i)=>(
 <div key={i} style={{flex:1,height:8,borderRadius:"var(--r-xs)",background:i<Number(pkg.used_sessions)?pcGrad:"var(--line)"}}/>
                      ))}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{pkg.used_sessions}/{pkg.total_sessions} {tr("טיפולים · נותרו")} {Number(pkg.total_sessions)-Number(pkg.used_sessions)}</p>
 </div>
                ))}
 </div>

 <div id="waitlist-card" className="glass-card" style={{padding:18,scrollMarginTop:16}}>
 {deferred.waitlist!=="ok"?<DeferredGate status={deferred.waitlist} what={tr("את רשימת ההמתנה")} onRetry={loadDeferred}/>:(<>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <BrandImage width={44} height={44} aria-hidden alt="" src={ICON_CALENDAR} style={{width:44,height:44,objectFit:"contain",flexShrink:0}}/>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",margin:0}}>{tr("רשימת המתנה (")}{waitlist.filter(w=>w.status==="waiting").length})</h3>
 </div>
              {waitlist.filter(w=>w.status==="waiting").length===0?<EmptyState icon="calendar" accent={pc} accentTint={pcTint}
                 title={tr("רשימת ההמתנה ריקה")}
                 body={tr("כשלקוחה רוצה תור ואין לך מקום, הוסיפי אותה לכאן. כשמתפנה תור, היא הראשונה שתדע.")}
                 actions={[{label:tr("הוספה לרשימה"),onClick:()=>setShowWaitlistModal(true)}]}/>
                :waitlist.filter(w=>w.status==="waiting").map(w=>(
 <div key={w.id} style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"11px 14px",marginBottom:6,border:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{w.client_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{w.service}{w.preferred_date&&` · ${w.preferred_date}`}</p>
 </div>
                    {w.phone&&<a href={waLink(w.phone)} target="_blank" rel="noreferrer" className="wa-btn" style={{padding:"5px 10px",fontSize:"var(--t-sm)"}}>✆</a>}
 </div>
                ))}
 {/* What the smart waitlist does, and did: "הצענו את התור ל..." (lib/waitlistActivity.js). Hidden when the platform flag is off. */}
 {waitlistOffersVisible(settings)&&<WaitlistActivity onOpenSettings={()=>openSettings("automations")}/>}
 </>)}
 </div>
 </div>
 </>/* @screen-end */
  );
}

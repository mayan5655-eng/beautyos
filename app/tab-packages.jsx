"use client";
// app/tab-packages.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { ICON_CALENDAR } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import DeferredGate from "./DeferredGate";

export default function PackagesTab(props) {
  const {
    NO_SERVICES_HINT,
    activeServices,
    deferred,
    handleSaveOffering,
    handleUndoPackageSession,
    handleUsePackageSession,
    isBusy,
    loadDeferred,
    newOffering,
    offerings,
    offeringsError,
    packages,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    setNewOffering,
    setShowOfferingForm,
    setShowPackageModal,
    setShowWaitlistModal,
    setupHint,
    showOfferingForm,
    toggleOffering,
    waLink,
    waitlist,
  } = props;
  return (
<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>מנויים וחבילות</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>מנויי טיפולים</h2>
 </div>
 <div style={{display:"flex",gap:6}}>
 <button className="primary-btn" onClick={()=>setShowPackageModal(true)} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 16px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>+ מכירת חבילה ללקוחה</button>
 <button onClick={()=>setShowWaitlistModal(true)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 16px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>רשימת המתנה</button>
 </div>
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8,flexWrap:"wrap"}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>חבילות למכירה</h3>
 <button onClick={()=>setShowOfferingForm(v=>!v)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"6px 14px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{showOfferingForm?"סגירה":"+ הגדרת חבילה למכירה"}</button>
 </div>
              {/* The thing that exists before anyone buys it. Without this she
                  could only ASSIGN a package - type a service, a count and a
                  price by hand, every single time, with nothing to show a
                  client and nothing to keep two sales of the same package
                  consistent with each other. */}
              {offeringsError?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>לא הצלחנו לטעון את החבילות למכירה.</p>
              ):(<>
                {showOfferingForm&&(
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-sm)",padding:12,marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                    {activeServices.length===0&&setupHint(NO_SERVICES_HINT)}
 <select value={newOffering.service} onChange={e=>setNewOffering({...newOffering,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)"}}><option value="">— בחרי טיפול —</option>{activeServices.map(sv=><option key={sv.name}>{sv.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>מספר טיפולים</p><input type="number" min={1} value={newOffering.sessions} onChange={e=>setNewOffering({...newOffering,sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>מחיר ₪</p><input type="number" min={0} value={newOffering.price} onChange={e=>setNewOffering({...newOffering,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/></div>
 </div>
                    {Number(newOffering.sessions)>0&&Number(newOffering.price)>0&&(
 <p style={{fontSize:"var(--t-sm)",color:pcDeep,fontWeight:600}}>₪{Math.round(Number(newOffering.price)/Number(newOffering.sessions))} לטיפול</p>
                    )}
 <button onClick={handleSaveOffering} disabled={isBusy("saveOffering")} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"9px 0",fontSize:"var(--t-sm)"}}>{isBusy("saveOffering")?<Spinner inline label="שומרת"/>:"הוספה לקטלוג"}</button>
 </div>
                )}
                {offerings.length===0&&!showOfferingForm?(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.6}}>עוד לא הגדרת חבילות למכירה. חבילה היא כמה טיפולים במחיר אחד — מגדירים אותה פעם אחת ומוכרים אותה שוב ושוב.</p>
                ):offerings.map(o=>(
 <div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 0",borderBottom:"1px solid var(--surface-2)",opacity:o.active?1:0.5}}>
 <div style={{minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{o.service} · {o.sessions} טיפולים</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>₪{o.price}{Number(o.sessions)>0?` · ₪${Math.round(Number(o.price)/Number(o.sessions))} לטיפול`:""}</p>
 </div>
 <button onClick={()=>toggleOffering(o)} style={{background:"none",border:"none",color:o.active?"var(--ink-3)":pcDeep,fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{o.active?"הסתרה":"החזרה"}</button>
 </div>
                ))}
              </>)}
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>חבילות פעילות ({packages.filter(p=>p.active).length})</h3>
              {packages.filter(p=>p.active).length===0?<EmptyState compact icon="package" accent={pc} accentTint={pcTint}
                 title="אין חבילות פעילות"
                 body="חבילה היא כמה טיפולים שנמכרים מראש. היא מקבעת לקוחה לסדרה שלמה במקום תור אחד, והתשלום נכנס בהתחלה."
                 actions={[{label:"מכירת חבילה",onClick:()=>setShowPackageModal(true)}]}/>
                :packages.filter(p=>p.active).map(pkg=>(
 <div key={pkg.id} style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",marginBottom:8,border:"1px solid var(--line)"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9,flexWrap:"wrap",gap:5}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>{pkg.client_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{pkg.service} · ₪{pkg.price}</p>
 </div>
                        {Number(pkg.used_sessions)>0&&(
 <button onClick={()=>handleUndoPackageSession(pkg)} title="ביטול הניכוי האחרון" style={{background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginLeft:6}}>
                            ↩ ביטול
 </button>
                        )}
 <button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-lg)",padding:"6px 12px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        ✓ השתמשי
 </button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:5}}>
                      {Array.from({length:Number(pkg.total_sessions)},(_,i)=>(
 <div key={i} style={{flex:1,height:8,borderRadius:"var(--r-xs)",background:i<Number(pkg.used_sessions)?pcGrad:"var(--line)"}}/>
                      ))}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{pkg.used_sessions}/{pkg.total_sessions} טיפולים · נותרו {Number(pkg.total_sessions)-Number(pkg.used_sessions)}</p>
 </div>
                ))}
 </div>

 <div className="glass-card" style={{padding:18}}>
 {deferred.waitlist!=="ok"?<DeferredGate status={deferred.waitlist} what="את רשימת ההמתנה" onRetry={loadDeferred}/>:(<>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <BrandImage width={44} height={44} aria-hidden alt="" src={ICON_CALENDAR} style={{width:44,height:44,objectFit:"contain",flexShrink:0}}/>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",margin:0}}>רשימת המתנה ({waitlist.filter(w=>w.status==="waiting").length})</h3>
 </div>
              {waitlist.filter(w=>w.status==="waiting").length===0?<EmptyState icon="calendar" accent={pc} accentTint={pcTint}
                 title="רשימת ההמתנה ריקה"
                 body="כשלקוחה רוצה תור ואין לך מקום — הוסיפי אותה לכאן. כשמתפנה תור, היא הראשונה שתדע."
                 actions={[{label:"הוספה לרשימה",onClick:()=>setShowWaitlistModal(true)}]}/>
                :waitlist.filter(w=>w.status==="waiting").map(w=>(
 <div key={w.id} style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"11px 14px",marginBottom:6,border:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{w.client_name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{w.service}{w.preferred_date&&` · ${w.preferred_date}`}</p>
 </div>
                    {w.phone&&<a href={waLink(w.phone)} target="_blank" rel="noreferrer" className="wa-btn" style={{padding:"5px 10px",fontSize:"var(--t-sm)"}}>✆</a>}
 </div>
                ))}
 </>)}
 </div>
 </div>
 </>
  );
}

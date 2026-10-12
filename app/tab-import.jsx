"use client";
// app/tab-import.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import Icon from "./Icon";

export default function ImportModal(props) {
  const {
    clients,
    goToImportMapping,
    importAppointments,
    importBuilder,
    importCols,
    importContacts,
    importFields,
    importGuesser,
    importHasHeader,
    importResult,
    importServices,
    importSpec,
    importStage,
    importTarget,
    importText,
    importing,
    parseImportGrid,
    pc,
    pcDeep,
    pcGrad,
    pickFromContacts,
    resetImport,
    setImportCols,
    setImportHasHeader,
    setImportStage,
    setImportText,
    setShowImportModal,
  } = props;
  return (
<Sheet open onClose={()=>setShowImportModal(false)} width={420} zIndex={1060} className="pop-in" title={importSpec.title}>

 {/* ---------- STAGE 1: PASTE ---------- */}
 {importStage==="paste"&&(<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:14,lineHeight:1.6}}>{importSpec.blurb}</p>

 {importTarget==="clients"&&(<><button onClick={pickFromContacts} style={{width:"100%",padding:"11px 0",background:"var(--pc-tint)",color:pcDeep,border:"1px dashed var(--pc)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}><Icon name="contacts" size={14}/> בחירה מאנשי הקשר בטלפון</button>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:14,textAlign:"center"}}>(עובד בעיקר בטלפונים אנדרואיד. באייפון/מחשב — השתמשי בהדבקה למטה)</p></>)}

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{importSpec.rowLabel}</p>
 <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={7} placeholder={importSpec.placeholder} style={{width:"100%",padding:"11px 13px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:"var(--surface-2)",fontSize:"var(--t-sm)",fontFamily:"inherit",marginBottom:8,boxSizing:"border-box",resize:"vertical",direction:"rtl",outline:"none"}}/>

 {importText.trim()&&(()=>{ const g=parseImportGrid(importText); return (
 <p style={{fontSize:"var(--t-sm)",color:"var(--success)",fontWeight:600,marginBottom:12}}>זוהו {g.rows.length} שורות ו-{g.width} עמודות</p>
 );})()}

 <div style={{display:"flex",gap:8}}>
 <button onClick={goToImportMapping} disabled={!importText.trim()} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",opacity:importText.trim()?1:0.5,boxShadow:"var(--shadow-accent)"}}>המשיכי להתאמת עמודות ←</button>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </>)}

 {/* ---------- STAGE 2: MAP COLUMNS ---------- */}
 {importStage==="map"&&(()=>{
   const grid = parseImportGrid(importText);
   const preview = (importHasHeader?grid.rows.slice(1):grid.rows).slice(0,5);
   const built = importBuilder(grid, importCols, importHasHeader);
   // Every target needs a name column; appointments also need a date, since a
   // booking with no date cannot be placed on the calendar at all.
   const missing = importSpec.requires.filter(f => !importCols.includes(f));
   const hasName = missing.length === 0;
   const missingLabels = missing.map(f => importFields.find(x=>x.id===f)?.label || f).join(" ו-");
   // How many people in this paste we have never seen, so she knows before
   // pressing the button that clients will be created too.
   const newClientCount = importTarget!=="appts" ? 0 : (()=>{
     const have = new Set(clients.map(c=>String(c.phone||"").replace(/\D/g,"")).filter(Boolean));
     const s = new Set();
     built.rows.forEach(r=>{ const k=String(r.phone||"").replace(/\D/g,""); if(k&&!have.has(k)) s.add(k); });
     return s.size;
   })();
   return (<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>בחרי מה כל עמודה מייצגת. ניחשנו עבורך — אפשר לשנות.{importTarget==="appts"&&<> תאריכים נקראים כ<strong>יום/חודש/שנה</strong>.</>}</p>

 <label style={{display:"flex",alignItems:"center",gap:7,fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,cursor:"pointer"}}>
 <input type="checkbox" checked={importHasHeader} onChange={e=>{const h=e.target.checked;setImportHasHeader(h);setImportCols(importGuesser(grid.rows,h));}}/>
   השורה הראשונה היא כותרות (לא לקוחה)
 </label>

 <div style={{overflowX:"auto",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",marginBottom:12}}>
 <table style={{borderCollapse:"collapse",width:"100%",minWidth:Math.max(320,grid.width*130)}}>
 <thead>
 <tr>
   {Array.from({length:grid.width}).map((_,i)=>(
 <th key={i} style={{padding:"8px 6px",background:"var(--pc-tint)",borderBottom:"1px solid var(--line)"}}>
 <select value={importCols[i]||"ignore"} onChange={e=>{const n=importCols.slice();n[i]=e.target.value;setImportCols(n);}}
         style={{width:"100%",fontSize:"var(--t-xs)",fontFamily:"inherit",padding:"5px 4px",borderRadius:"var(--r-xs)",border:`1px solid ${importCols[i]&&importCols[i]!=="ignore"?pc:"var(--line-2)"}`,background:"var(--surface)",color:"var(--ink)",outline:"none"}}>
     {importFields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
 </select>
 {importHasHeader&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{grid.rows[0][i]||"—"}</p>}
 </th>
   ))}
 </tr>
 </thead>
 <tbody>
   {preview.map((r,ri)=>(
 <tr key={ri} style={{background:ri%2?"var(--surface-2)":"var(--surface)"}}>
     {r.map((cell,ci)=>(
 <td key={ci} style={{padding:"7px 8px",fontSize:"var(--t-xs)",color:importCols[ci]&&importCols[ci]!=="ignore"?"var(--ink)":"var(--ink-3)",borderTop:"1px solid var(--line)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{cell||"—"}</td>
     ))}
 </tr>
   ))}
 </tbody>
 </table>
 </div>

 {!hasName
   ?<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600,marginBottom:12}}>יש לבחור עמודה בתור «{missingLabels}» כדי להמשיך.</p>
   :<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>
      <strong style={{color:pcDeep}}>{built.rows.length} {importSpec.unit} ייווצרו</strong>
      {newClientCount>0&&<> · {newClientCount} לקוחות חדשות ייווצרו גם</>}
      {built.past>0&&<> · {built.past} דולגו — תאריך שכבר עבר</>}
      {built.noDate>0&&<> · {built.noDate} דולגו — תאריך לא ברור</>}
      {built.noName>0&&<> · {built.noName} ידולגו (ללא שם)</>}
      {built.nameIsService>0&&<> · {built.nameIsService} ידולגו (שם הלקוחה הוא שם טיפול)</>}
      {preview.length<(importHasHeader?grid.rows.length-1:grid.rows.length)&&<> · מוצגות 5 שורות ראשונות</>}
    </p>}

 {/* The rounding warning that stood here is gone: the schema stores minutes
     now, so 14:30 imports as 14:30 and there is nothing left to warn about. */}
 {/* Loud, not a footnote: this almost always means the name column is
     pointing at the wrong column, so the whole import is about to be wrong. */}
 {hasName&&built.nameIsService>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:12}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:700,marginBottom:3}}>⚠ {built.nameIsService} שורות ידולגו — שם הלקוחה הוא שם של טיפול</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6}}>נראה שעמודת «שם הלקוחה» מצביעה על עמודת הטיפולים. בדקי את ההתאמה למעלה — אחרת ייווצרו לקוחות עם שם של טיפול.</p>
 {built.nameIsServiceSamples.length>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4}}>{built.nameIsServiceSamples.join("   ·   ")}</p>}
 </div>
 )}
 {hasName&&built.noTime>0&&(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>· {built.noTime} תורים ללא שעה קריאה — ייקבעו ל-9:00 ואפשר להזיז אותם ביומן.</p>
 )}

 <div style={{display:"flex",gap:8}}>
 <button onClick={importTarget==="appts"?importAppointments:importTarget==="services"?importServices:importContacts} disabled={importing||!hasName||built.rows.length===0} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",opacity:(importing||!hasName||built.rows.length===0)?0.5:1,boxShadow:"var(--shadow-accent)"}}>{importing?<Spinner inline label="מייבא"/>:`ייבוא ${built.rows.length} ${importSpec.unit}`}</button>
 <button onClick={()=>setImportStage("paste")} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>→ חזרה</button>
 </div>
 </>);
 })()}

 {/* ---------- STAGE 3: RESULT ---------- */}
 {importStage==="done"&&importResult&&(<>
 <div style={{textAlign:"center",padding:"10px 0 16px"}}>
 <p className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:pcDeep,marginBottom:4}}>{importResult.added}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{importSpec.unit} נוספו</p>
 </div>
 <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
   {importResult.newClients>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.newClients} לקוחות חדשות נוצרו מהתורים</p>}
   {importResult.past>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.past} דולגו — תאריך שכבר עבר (היסטוריה לא מיובאת)</p>}
   {importResult.noTime>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noTime} נקבעו ל-9:00 (שעה לא קריאה)</p>}
   {importResult.noDate>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noDate} דולגו — תאריך לא ברור</p>}
   {importResult.dupes>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.dupes} דולגו — כבר קיימות אצלך (זוהו לפי טלפון)</p>}
   {/* Not the same as a duplicate, and not in grey: these are real future
       bookings that were NOT imported because the slot was already busy. She
       has to place them by hand, so the line has to be impossible to skim past. */}
   {importResult.overlapping>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>· {importResult.overlapping} דולגו — השעה כבר תפוסה ביומן. יש לקבוע אותן ידנית</p>}
   {importResult.noName>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noName} דולגו — ללא שם</p>}
   {importResult.nameIsService>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.nameIsService} דולגו — שם הלקוחה היה שם של טיפול</p>}
   {importResult.failed>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:"var(--r-sm)",padding:"10px 12px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:700,marginBottom:3}}>{importResult.failed} לא נוספו</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5}}>שאר הלקוחות נוספו בהצלחה. אפשר להדביק שוב רק את מי שחסרה — לקוחות שכבר קיימות לא ייווצרו פעמיים.</p>
 {importResult.error&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:5,direction:"ltr",textAlign:"left"}}>{importResult.error}</p>}
 </div>
   )}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",boxShadow:"var(--shadow-accent)"}}>סיום</button>
 <button onClick={resetImport} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>ייבוא נוסף</button>
 </div>
 </>)}
 </Sheet>
  );
}

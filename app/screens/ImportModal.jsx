"use client";
// app/screens/ImportModal.jsx — {showImportModal && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <ImportModal> in app/beautyos.jsx (the check fails until both sides agree).
import Sheet from "../Sheet";
import Spinner from "../Spinner";
import Icon from "../Icon";
import { parseImportGrid, countExistingServices, importPhoneKey } from "@/lib/importMapping";
import { VCARD_ACCEPT } from "@/lib/vcard";
import { tr, trv, uiDir } from "@/lib/i18n/tr";

export default function ImportModal({ ctx }) {
  const {
    clients, goToImportMapping, importAppointments, importBuilder, importCols, importContacts, importFields,
    importGuesser, importHasHeader, importing, importResult, importServices, importSpec, importStage,
    importTarget, importText, importVcardFile, pc, pcDeep, pcGrad, pickFromContacts, resetImport, services,
    setImportCols, setImportHasHeader, setImportStage, setImportText, setShowImportModal,
  } = ctx;
  return (
    /* @screen-body */<Sheet open onClose={()=>setShowImportModal(false)} width={420} zIndex={1060} className="pop-in" title={trv(importSpec.title)}>

 {/* ---------- STAGE 1: PASTE ---------- */}
 {importStage==="paste"&&(<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:14,lineHeight:1.6}}>{trv(importSpec.blurb)}</p>

 {importTarget==="clients"&&(<>{/* The contact picker exists only on Chrome for Android: on an iPhone the button could never work, so it is not shown there (2026-10-24 phone review). */}{typeof navigator!=="undefined"&&navigator.contacts&&typeof navigator.contacts.select==="function"&&<button onClick={pickFromContacts} style={{width:"100%",padding:"11px 0",background:"var(--pc-tint)",color:pcDeep,border:"1px dashed var(--pc)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}><Icon name="contacts" size={14}/> {tr("בחירה מאנשי הקשר בטלפון")}</button>}
 
 {/* A contacts file (.vcf), for every phone: the iPhone way in, since it has no contact picker (lib/vcard.js). */}
 <label data-testid="import-vcf" style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",minHeight:44,padding:"11px 0",background:"var(--surface)",color:pcDeep,border:"1px dashed var(--pc)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6,boxSizing:"border-box"}}>
 <Icon name="upload" size={14}/> {tr("בחירת קובץ אנשי קשר (vcf)")}
 <input type="file" accept={VCARD_ACCEPT} onChange={importVcardFile} style={{position:"absolute",width:1,height:1,opacity:0,overflow:"hidden"}}/>
 </label>
 <details data-testid="import-vcf-howto" style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:10,lineHeight:1.6}}>
 <summary style={{cursor:"pointer",fontWeight:600,color:"var(--ink)",padding:"6px 0",textDecoration:"underline",textUnderlineOffset:3}}>{tr("איך שולחים אנשי קשר מהאייפון?")}</summary>
 <ol style={{margin:"6px 0 0",paddingInlineStart:22,listStyle:"decimal"}}>
 <li>{tr("פתחי את אנשי הקשר בטלפון.")}</li>
 <li>{tr("לקוחה אחת: פתחי את הכרטיס שלה ולחצי על שיתוף איש קשר.")}</li>
 <li>{tr("כמה לקוחות יחד: בגרסאות חדשות של האייפון אפשר לסמן כמה אנשי קשר ברשימה, ללחוץ לחיצה ארוכה ולבחור שיתוף. אם זה לא מופיע אצלך, אפשר לשתף אחת אחת.")}</li>
 <li>{tr("במסך השיתוף בחרי שמירה בקבצים.")}</li>
 <li>{tr("חזרי לכאן, לחצי על בחירת קובץ אנשי קשר ובחרי את הקובץ ששמרת.")}</li>
 </ol>
 </details>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:14,textAlign:"center"}}>{tr("(או הדביקי רשימה למטה, שורה לכל לקוחה)")}</p></>)}

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{importSpec.rowLabel}</p>
 <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={7} placeholder={trv(importSpec.placeholder)} style={{width:"100%",padding:"11px 13px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2)",background:"var(--surface-2)",fontSize:"var(--t-sm)",fontFamily:"inherit",marginBottom:8,boxSizing:"border-box",resize:"vertical",direction:uiDir(),outline:"none"}}/>

 {importText.trim()&&(()=>{ const g=parseImportGrid(importText); return (
 <p style={{fontSize:"var(--t-sm)",color:"var(--success)",fontWeight:600,marginBottom:12}}>{tr("זוהו")} {g.rows.length} {tr("שורות ו-")}{g.width} {tr("עמודות")}</p>
 );})()}

 <div style={{display:"flex",gap:8}}>
 <button onClick={goToImportMapping} disabled={!importText.trim()} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",opacity:importText.trim()?1:0.5,boxShadow:"var(--shadow-accent)"}}>{tr("המשיכי להתאמת עמודות ←")}</button>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ביטול")}</button>
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
     const have = new Set(clients.map(c=>importPhoneKey(c.phone)).filter(Boolean));
     const s = new Set();
     built.rows.forEach(r=>{ const k=importPhoneKey(r.phone); if(k&&!have.has(k)) s.add(k); });
     return s.size;
   })();
   // Clients already on file are skipped by the import (matched by phone), so the preview counts them
   // too: it promised "3 will be created" when 1 of them would be skipped (2026-10-24 sweep).
   // A services import skips names already on her list the same way (countExistingServices), so its preview counts them as well.
   const existingClientCount = importTarget==="services" ? countExistingServices(built.rows, services) : importTarget!=="clients" ? 0 : (()=>{
     const have = new Set(clients.map(c=>importPhoneKey(c.phone)).filter(Boolean));
     const s = new Set(); let n = 0;
     built.rows.forEach(r=>{ const k=importPhoneKey(r.phone); if(!k) return; if(have.has(k)||s.has(k)) n++; else s.add(k); });
     return n;
   })();
   return (<>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>{tr("בחרי מה כל עמודה מייצגת. ניחשנו עבורך, ואפשר לשנות.")}{importTarget==="appts"&&<> {tr("תאריכים נקראים כ")}<strong>{tr("יום/חודש/שנה")}</strong>.</>}</p>

 <label style={{display:"flex",alignItems:"center",gap:7,fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,cursor:"pointer"}}>
 <input type="checkbox" checked={importHasHeader} onChange={e=>{const h=e.target.checked;setImportHasHeader(h);setImportCols(importGuesser(grid.rows,h));}}/>
   {importSpec.headerNote}
 </label>

 <div style={{overflowX:"auto",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",marginBottom:12}}>
 <table style={{borderCollapse:"collapse",width:"100%",minWidth:Math.max(320,grid.width*130)}}>
 <thead>
 <tr>
   {Array.from({length:grid.width}).map((_,i)=>(
 <th key={i} style={{padding:"8px 6px",background:"var(--pc-tint)",borderBottom:"1px solid var(--line)"}}>
 <select value={importCols[i]||"ignore"} onChange={e=>{const n=importCols.slice();n[i]=e.target.value;setImportCols(n);}}
         style={{width:"100%",fontSize:"var(--t-xs)",fontFamily:"inherit",padding:"5px 4px",borderRadius:"var(--r-xs)",border:`1px solid ${importCols[i]&&importCols[i]!=="ignore"?pc:"var(--line-2)"}`,background:"var(--surface)",color:"var(--ink)",outline:"none"}}>
     {importFields.map(f=><option key={f.id} value={f.id}>{trv(f.label)}</option>)}
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
 <td key={ci} dir="auto" style={{padding:"7px 8px",fontSize:"var(--t-xs)",color:importCols[ci]&&importCols[ci]!=="ignore"?"var(--ink)":"var(--ink-3)",borderTop:"1px solid var(--line)",unicodeBidi:"plaintext",textAlign:"right",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{cell||"—"}</td>
     ))}
 </tr>
   ))}
 </tbody>
 </table>
 </div>

 {!hasName
   ?<p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:600,marginBottom:12}}>{tr("יש לבחור עמודה בתור «")}{missingLabels}{tr("» כדי להמשיך.")}</p>
   :<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>
      <strong style={{color:pcDeep}}>{built.rows.length-existingClientCount} {trv(importSpec.unit)} {tr("ייווצרו")}</strong>
      {existingClientCount>0&&<> · {existingClientCount} {importSpec.existingNote}</>}
      {newClientCount>0&&<> · {newClientCount} {tr("לקוחות חדשות ייווצרו גם")}</>}
      {built.past>0&&<> · {built.past} {tr("דולגו, תאריך שכבר עבר")}</>}
      {built.noDate>0&&<> · {built.noDate} {tr("דולגו, תאריך לא ברור")}</>}
      {built.noName>0&&<> · {built.noName} {tr("ידולגו (ללא שם)")}</>}
      {built.nameIsService>0&&<> · {built.nameIsService} {tr("ידולגו (שם הלקוחה הוא שם טיפול)")}</>}
      {preview.length<(importHasHeader?grid.rows.length-1:grid.rows.length)&&<> {tr("· מוצגות 5 שורות ראשונות")}</>}
    </p>}

 {/* The rounding warning that stood here is gone: the schema stores minutes
     now, so 14:30 imports as 14:30 and there is nothing left to warn about. */}
 {/* Loud, not a footnote: this almost always means the name column is
     pointing at the wrong column, so the whole import is about to be wrong. */}
 {hasName&&built.nameIsService>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:"var(--r-sm)",padding:"10px 12px",marginBottom:12}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--danger)",fontWeight:700,marginBottom:3}}>⚠ {built.nameIsService} {tr("שורות ידולגו, שם הלקוחה הוא שם של טיפול")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6}}>{tr("נראה שעמודת «שם הלקוחה» מצביעה על עמודת הטיפולים. בדקי את ההתאמה למעלה, אחרת ייווצרו לקוחות עם שם של טיפול.")}</p>
 {built.nameIsServiceSamples.length>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:4}}>{built.nameIsServiceSamples.join("   ·   ")}</p>}
 </div>
 )}
 {hasName&&built.noTime>0&&(
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>· {built.noTime} {tr("תורים ללא שעה קריאה, ייקבעו ל-9:00 ואפשר להזיז אותם ביומן.")}</p>
 )}

 <div style={{display:"flex",gap:8}}>
 <button onClick={importTarget==="appts"?importAppointments:importTarget==="services"?importServices:importContacts} disabled={importing||!hasName||built.rows.length-existingClientCount<=0} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",opacity:(importing||!hasName||built.rows.length-existingClientCount<=0)?0.5:1,boxShadow:"var(--shadow-accent)"}}>{importing?<Spinner inline label={tr("מייבאת")}/>:tr("ייבוא {0} {1}", [built.rows.length-existingClientCount, importSpec.unit])}</button>
 <button onClick={()=>setImportStage("paste")} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>{tr("→ חזרה")}</button>
 </div>
 </>);
 })()}

 {/* ---------- STAGE 3: RESULT ---------- */}
 {importStage==="done"&&importResult&&(<>
 <div style={{textAlign:"center",padding:"10px 0 16px"}}>
 <p className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:700,color:pcDeep,marginBottom:4}}>{importResult.added}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{trv(importSpec.unit)} {tr("נוספו")}</p>
 </div>
 <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
   {importResult.newClients>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.newClients} {tr("לקוחות חדשות נוצרו מהתורים")}</p>}
   {importResult.past>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.past} {tr("דולגו, תאריך שכבר עבר (היסטוריה לא מיובאת)")}</p>}
   {importResult.noTime>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noTime} {tr("נקבעו ל-9:00 (שעה לא קריאה)")}</p>}
   {importResult.noDate>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noDate} {tr("דולגו, תאריך לא ברור")}</p>}
   {importResult.dupes>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.dupes} {importSpec.dupesNote}</p>}
   {/* Not the same as a duplicate, and not in grey: these are real future
       bookings that were NOT imported because the slot was already busy. She
       has to place them by hand, so the line has to be impossible to skim past. */}
   {importResult.overlapping>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:600}}>· {importResult.overlapping} {tr("דולגו, השעה כבר תפוסה ביומן. יש לקבוע אותן ידנית")}</p>}
   {importResult.noName>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.noName} {tr("דולגו, ללא שם")}</p>}
   {importResult.nameIsService>0&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>· {importResult.nameIsService} {tr("דולגו, שם הלקוחה היה שם של טיפול")}</p>}
   {importResult.failed>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:"var(--r-sm)",padding:"10px 12px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--danger)",fontWeight:700,marginBottom:3}}>{importResult.failed} {tr("לא נוספו")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5}}>{importSpec.failedNote}</p>
 {importResult.error&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:5,direction:"ltr",textAlign:"left"}}>{trv(importResult.error)}</p>}
 </div>
   )}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",boxShadow:"var(--shadow-accent)"}}>{tr("סיום")}</button>
 <button onClick={resetImport} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ייבוא נוסף")}</button>
 </div>
 </>)}
 </Sheet>/* @screen-end */
  );
}

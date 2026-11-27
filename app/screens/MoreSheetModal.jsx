"use client";
// app/screens/MoreSheetModal.jsx — {showMoreSheet && ...} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <MoreSheetModal> in app/beautyos.jsx (the check fails until both sides agree).
import { tr, trv } from "@/lib/i18n/tr";

export default function MoreSheetModal({ ctx }) {
  const {
    ACADEMY_ON, AcademyNavEntry, activeTab, MORE_NAV, NAV_ITEMS, navIcon, ownerEntry, ProtocolBookNavEntry,
    router, setActiveTab, setShowMobileSidebar, setShowMoreSheet, tillOnly,
  } = ctx;
  return (
    /* @screen-body */<div className="mobile-only" data-overlay="more" onClick={()=>setShowMoreSheet(false)}
      style={{position:"fixed",inset:0,zIndex:1401,background:"rgba(48,24,72,0.34)",
              backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
              /* Same reasoning as the bar: no inline display, so .mobile-only
                 alone decides whether this can appear. */
              alignItems:"flex-end",justifyContent:"center"}}>
 <div onClick={e=>e.stopPropagation()} role="dialog" aria-label={tr("עוד מסכים")}
      style={{width:"100%",maxWidth:560,background:"var(--surface)",
              borderTopLeftRadius:26,borderTopRightRadius:26,
              border:"1px solid var(--line)",borderBottom:"none",
              boxShadow:"var(--shadow-xl)",
              padding:"14px 16px calc(78px + env(safe-area-inset-bottom, 0px))",
              animation:"sheetUp 0.22s cubic-bezier(.2,.7,.3,1)"}}>
 <div aria-hidden style={{width:42,height:4,borderRadius:"var(--r-full)",background:"var(--line-2)",margin:"2px auto 14px"}}/>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(96px,1fr))",gap:8}}>
              {MORE_NAV.map(id=>{
                const label=(NAV_ITEMS.find(n=>n.id===id)||{}).label||id;
                const on=activeTab===id;
                return (
 <button key={id} onClick={()=>{setActiveTab(id);setShowMoreSheet(false);}}
        style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,
                padding:"14px 6px",borderRadius:"var(--r-md)",cursor:"pointer",fontFamily:"inherit",
                border:`1px solid ${on?"var(--pc)":"var(--line)"}`,
                background:on?"var(--pc-tint)":"var(--surface-2)",
                color:on?"var(--pc)":"var(--ink-2)",transition:"background 0.18s,border-color 0.18s"}}>
                  {navIcon(id)}
 <span style={{fontSize:"var(--t-sm)",fontWeight:on?700:600}}>{trv(label)}</span>
 </button>
                );
              })}
              <button data-testid="more-search" onClick={()=>{setShowMoreSheet(false);setShowMobileSidebar(true);}}
        style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,
                padding:"14px 6px",borderRadius:"var(--r-md)",cursor:"pointer",fontFamily:"inherit",
                border:"1px solid var(--line)",background:"var(--surface-2)",color:"var(--ink-2)"}}>
 <span aria-hidden style={{fontSize:20,lineHeight:1}}>⌕</span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:600}}>{tr("חיפוש")}</span>
 </button>
              {ACADEMY_ON&&!tillOnly&&<AcademyNavEntry variant="more" onOpen={()=>{setShowMoreSheet(false);router.push("/dashboard/academy");}}/>}
              {!tillOnly&&<ProtocolBookNavEntry variant="more" onOpen={()=>{setShowMoreSheet(false);router.push("/dashboard/protocol-book");}}/>}
              {ownerEntry}
 </div>
 </div>
 </div>/* @screen-end */
  );
}

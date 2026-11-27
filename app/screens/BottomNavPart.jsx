"use client";
// app/screens/BottomNavPart.jsx — the <BottomNav> piece of the frame of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <BottomNavPart> in app/beautyos.jsx (the check fails until both sides agree).
import { tr, trv } from "@/lib/i18n/tr";

export default function BottomNavPart({ ctx }) {
  const {
    activeTab, BOTTOM_NAV, navIcon, newLeadsCount, pcGrad, PEOPLE_TABS, setActiveTab, setShowMoreSheet,
    showMoreSheet,
  } = ctx;
  return (
    /* @screen-body */<nav className="mobile-only app-bottombar" aria-label={tr("ניווט תחתון")} style={{position:"fixed",insetInline:0,bottom:0,zIndex:900,
        /* Fully opaque: at 94% the cards scrolling underneath showed through behind the labels. */
        background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), #FCFAFE",
        borderTop:"1px solid var(--line)",boxShadow:"var(--shadow-md)",
        /* NO inline display here. An inline style outranks a class selector,
           so display:flex would beat .mobile-only{display:none} and the bar
           would render on desktop alongside the sidebar. Visibility is left
           entirely to .mobile-only, which supplies flex below the breakpoint
           and none above it. */
        alignItems:"stretch",
        paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
        {BOTTOM_NAV.map(item=>{
          const on = activeTab===item.id || (item.id==="clients" && PEOPLE_TABS.includes(activeTab));
          return (
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMoreSheet(false);}}
        aria-current={on?"page":undefined} aria-label={trv(item.label)}
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:on?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",position:"relative",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:"var(--r-sm)",background:on?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
              {navIcon(item.id)}
              {item.id==="clients"&&newLeadsCount>0&&(
 <span style={{position:"absolute",top:4,insetInlineEnd:"50%",transform:"translateX(50%) translateX(14px)",
               background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,lineHeight:1,
               padding:"2px 6px",borderRadius:"var(--r-lg)",boxShadow:"var(--shadow-accent)"}}>{newLeadsCount}</span>
              )}
 </span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:on?700:500,letterSpacing:"-0.01em"}}>{trv(item.label)}</span>
 </button>
          );
        })}
        {/* עוד — opens the sheet with everything that does not fit above. */}
 <button onClick={()=>setShowMoreSheet(v=>!v)} aria-expanded={showMoreSheet} aria-label={tr("עוד")}
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:showMoreSheet?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:"var(--r-sm)",background:showMoreSheet?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
 <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>
 </svg>
 </span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:showMoreSheet?700:500,letterSpacing:"-0.01em"}}>{tr("עוד")}</span>
 </button>
 </nav>/* @screen-end */
  );
}

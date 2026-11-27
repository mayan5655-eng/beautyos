"use client";
// app/screens/AppHeaderPart.jsx — the <AppHeader> piece of the frame of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <AppHeaderPart> in app/beautyos.jsx (the check fails until both sides agree).
import { displayName } from "@/lib/personName";
import { LOGO_COMPACT } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Icon from "../Icon";
import { viewAllowsTab } from "@/lib/viewMode";
import { tr, uiDir } from "@/lib/i18n/tr";

export default function AppHeaderPart({ ctx }) {
  const {
    authEmail, globalResults, globalSearch, handleExportCSV, handleLogout, isBusy, newLeadsCount, openSettings,
    pc, pcGrad, renderSearchGroups, setActiveTab, setGlobalSearch, setShowMobileSidebar, setShowSetup, settings,
    tillOnly, tomorrowCancelled, upcomingBirthdays,
  } = ctx;
  return (
    /* @screen-body */<header className="app-header" style={{background:"var(--pc-chrome)",borderBottom:"1px solid var(--line)",padding:"0 22px",display:"flex",alignItems:"center",justifyContent:"space-between",height:88,flexShrink:0,gap:8,flexWrap:"nowrap",overflow:"visible"}}>
 <div className="hdr-brand" style={{display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
 {/* UX pass 2026-11-08: the phone header keeps the logo, the gear and one badge. The menu button is hidden there (kept,
     not deleted); the same drawer, with search, opens from "עוד" › "חיפוש". Logout moved to Settings › מתקדם. */}
 <button className="icon-btn" onClick={()=>setShowMobileSidebar(true)} style={{display:"none"}} aria-label={tr("תפריט ניווט")}><Icon name="menu" size={20}/></button>
                {/* Compact Kalmea lockup: florals + wordmark, no tagline.
                    Brand tier, so it never takes the tenant accent. Intrinsic
                    520x177 with the height capped, so the ratio holds. */}
                {/* Matches the /login treatment exactly: width-driven sizing so
                    the artwork sets its own ratio, the same drop-shadow that
                    makes it float there, and its own breathing room rather than
                    sitting flush against the menu button. No wrapper box, no
                    background, no overflow - the petals reach the edge of the
                    artwork and must never be cropped.
                    Desktop only: the full lockup doesn't fit below 680px next
                    to the menu button, search box and badges. A SMALLER
                    lockup replaces it there (flower + "kalmea" in its own
                    lettering, cropped from this same artwork - see LOGO_TEXT)
                    rather than the flower alone: a screen should always say
                    what she's using, not just show a mark. */}
 <BrandImage className="hdr-logo desktop-only" src={LOGO_COMPACT} alt="Kalmea" width={196} height={57}
      style={{width:196,height:"auto",display:"block",overflow:"visible",flexShrink:0,
              marginInlineEnd:14,filter:"drop-shadow(0 10px 22px rgba(48,24,72,0.16))"}}/>
 <div className="mobile-only" style={{alignItems:"center",flexShrink:0,marginInlineEnd:10,filter:"drop-shadow(0 4px 10px rgba(48,24,72,0.16))"}}>
 {/* Was the flower crop (FLOWER_64) and the text crop (LOGO_TEXT) side by
     side as two separate images - visually disconnected, since the stem
     that flows into the "k" in the real lockup doesn't survive being cut
     into two pieces with a gap between them. One connected image now,
     same as the desktop lockup just above, scaled for the header's height
     instead of its width. */}
 <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={116} height={34} style={{width:"auto",height:34,display:"block"}}/>
 </div>
          {/* UX pass 2026-11-18: was a bare number nobody could read ("4" what?). Now a real button that says what it is. */}
          {newLeadsCount>0&&viewAllowsTab(settings,"leads")&&<button type="button" data-testid="header-leads-badge" onClick={()=>setActiveTab("leads")} aria-label={newLeadsCount===1?tr("פנייה חדשה אחת"):tr("{0} פניות חדשות",[newLeadsCount])} style={{background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,padding:"3px 10px",border:"none",borderRadius:"var(--r-lg)",cursor:"pointer",boxShadow:"var(--shadow-accent)",fontFamily:"inherit",whiteSpace:"nowrap"}}>{newLeadsCount===1?tr("פנייה חדשה"):tr("{0} פניות",[newLeadsCount])}</button>}
          {tomorrowCancelled>0&&!tillOnly&&<span className="desktop-only" style={{background:"var(--danger)",color:"var(--surface)",fontSize:"var(--t-sm)",fontWeight:700,padding:"3px 8px",borderRadius:"var(--r-lg)"}}>{tomorrowCancelled}</span>}
 </div>
 <div className="header-search" style={{position:"relative",flex:1,maxWidth:280,minWidth:80}}>
 <span style={{position:"absolute",top:"50%",right:13,transform:"translateY(-50%)",fontSize:"var(--t-sm)",color:"var(--ink-3)",pointerEvents:"none",zIndex:1}}>⌕</span>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder={tr("חיפוש...")}
            style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"8px 34px 8px 14px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",color:"var(--ink)",boxShadow:"var(--shadow-xs)"}}/>
          {globalResults.length>0&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",boxShadow:"var(--shadow-lg)",zIndex:999,overflow:"hidden",marginTop:6,maxHeight:400,overflowY:"auto"}}>
              {renderSearchGroups()}
 </div>
          )}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {upcomingBirthdays[0]&&<span className="desktop-only" style={{fontSize:"var(--t-sm)",color:pc}}>{upcomingBirthdays[0].name}</span>}
 <span className="desktop-only" style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("שלום")}{displayName(settings.therapist_name)?`, ${displayName(settings.therapist_name)}`:""} </span>
          {/* ☑ and ↓ leave the header below 680px: four 40px buttons plus the
              logo, hamburger and search cannot fit on any phone (see the
              breakpoint block). Both keep a mobile home in the nav drawer, so
              nothing becomes unreachable - only ⚙ and ⏻ stay in the bar. */}
 <button onClick={()=>setShowSetup(true)} className="icon-btn desktop-only" title={tr("הגדרת המערכת")} aria-label={tr("הגדרת המערכת")}><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4"/><path d="M8 12.3l2.8 2.8L16.4 9"/></svg></button>
                {/* An inline SVG, not the ⚙ character. U+2699 has an EMOJI
                    presentation by default on iOS, so it rendered as a full
                    colour glyph sitting among flat, tinted chrome. The variation
                    selector (⚙︎) would only ask the font nicely; an SVG settles
                    it. Same stroke idiom as the Beauty Voice mic below -
                    currentColor, 1.7 stroke - so it inherits .icon-btn's tint. */}
 <button onClick={()=>openSettings()} className="icon-btn" title={tr("הגדרות")} aria-label={tr("הגדרות")}>
 <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}>
 <circle cx="12" cy="12" r="3.1"/>
 <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
 </svg>
 </button>
 <button onClick={handleExportCSV} className="icon-btn desktop-only" title={tr("ייצוא תשלומים ל-CSV")} aria-label={tr("ייצוא תשלומים לקובץ CSV")}>↓</button>
                {/* Same reason as the gear above: U+23FB renders as a colour
                    emoji on iOS. Fixing one and leaving its neighbour is worse
                    than leaving both. */}
 <button onClick={handleLogout} disabled={isBusy("logout")} className="icon-btn desktop-only" title={authEmail ? tr("התנתקות (מחוברת כ-{0})", [authEmail]) : tr("התנתקות")} aria-label={tr("התנתקות מהמערכת")}>
 <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}>
 <path d="M12 3.2v8.4"/>
 <path d="M17.4 6.1a7.5 7.5 0 1 1-10.8 0"/>
 </svg>
 </button>
 </div>
 </header>/* @screen-end */
  );
}

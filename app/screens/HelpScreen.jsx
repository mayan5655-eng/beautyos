"use client";
// app/screens/HelpScreen.jsx — the "help" tab of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <HelpScreen> in app/beautyos.jsx (the check fails until both sides agree).
import Icon from "../Icon";
import { businessFieldsOf } from "@/lib/businessFields";
import { HELP_TITLE, HELP_INTRO, helpSectionsFor, TUTORIAL_TITLES, tutorialHref } from "@/lib/helpSections";
import { helpGatesFor } from "@/lib/helpVisibility";
import { tr, trv } from "@/lib/i18n/tr";

export default function HelpScreen({ ctx }) {
  const {
    deployFlags, expandedHelpKey, helpInline, pc, pcDeep, pcTint, setExpandedHelpKey, settings,
  } = ctx;
  return (
    /* @screen-body */(()=>{
            // Read-only, no writes, no gating. Same one-open-at-a-time list as
            // the setup checklist: a collapsed line per section, the body
            // revealed on request. The first section is open on arrival so the
            // page never reads empty.
            const helpSections = helpSectionsFor(businessFieldsOf(settings), helpGatesFor(settings, deployFlags));
            const openKey = expandedHelpKey ?? (helpSections[0]||{}).key;
            return (
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{marginBottom:16}}>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>{HELP_TITLE}</h2>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6}}>{HELP_INTRO}</p>
 </div>
 {/* The tutorial videos (app/tutorials), by topic. Until 2026-11-04 the only door to them inside the app was the feedback sheet. */}
 <a href="/tutorials" target="_blank" rel="noopener noreferrer" data-testid="help-tutorials-link"
    style={{display:"flex",alignItems:"center",gap:12,minHeight:56,padding:"12px 14px",marginBottom:14,background:pcTint,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",textDecoration:"none",color:"var(--ink)",boxShadow:"var(--shadow-sm)"}}>
 <span aria-hidden style={{fontSize:"var(--t-xl)",flexShrink:0}}>🎬</span>
 <span style={{flex:1,minWidth:0}}>
 <span style={{display:"block",fontSize:"var(--t-md)",fontWeight:700}}>{tr("סרטוני הדרכה")}</span>
 <span style={{display:"block",fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5}}>{tr("סרטונים קצרים לפי נושאים: יומן, לקוחות, תשלומים, AI והגדרות")}</span>
 </span>
 <span aria-hidden style={{fontSize:"var(--t-md)",color:pc,flexShrink:0}}>←</span>
 </a>
 <div style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                {helpSections.map((sec,i)=>{
                  const open = openKey===sec.key;
                  return (
 <div key={sec.key} style={{borderTop:i===0?"none":"1px solid var(--line)",background:open?pcTint:"transparent",transition:"background 0.18s"}}>
 <button
                      onClick={()=>setExpandedHelpKey(open?"":sec.key)}
                      aria-expanded={open}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"none",border:"none",fontFamily:"inherit",textAlign:"right",cursor:"pointer"}}>
 <span style={{flex:1,minWidth:0,fontSize:"var(--t-md)",fontWeight:open?700:600,color:"var(--ink)",display:"inline-flex",alignItems:"center",gap:7}}>{sec.icon&&<Icon name={sec.icon} size={15}/>}{trv(sec.title)}</span>
 <span aria-hidden style={{fontSize:"var(--t-md)",color:open?pc:"var(--ink-3)",flexShrink:0,display:"inline-block",transition:"transform 0.2s",transform:open?"rotate(-90deg)":"none"}}>←</span>
 </button>
                      {open&&(
 <div style={{padding:"0 14px 14px 14px"}}>
                          {sec.body.map((line,j)=>{
                            if(line.startsWith("### ")) return <p key={j} style={{fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,margin:"12px 0 5px"}}>{helpInline(line.slice(4))}</p>;
                            if(line.startsWith("- ")) return <p key={j} style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.75,margin:"0 0 3px",paddingRight:14,textIndent:-14}}>• {helpInline(line.slice(2))}</p>;
                            return <p key={j} style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.75,margin:"0 0 9px"}}>{helpInline(line)}</p>;
                          })}
                          {(sec.videos||[]).filter(v=>TUTORIAL_TITLES[v]).length>0&&(
 <div data-testid={`help-videos-${sec.key}`} style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
                              {(sec.videos||[]).filter(v=>TUTORIAL_TITLES[v]).map(v=>(
 <a key={v} href={tutorialHref(v)} target="_blank" rel="noopener noreferrer"
    style={{display:"inline-flex",alignItems:"center",gap:6,minHeight:44,padding:"0 14px",borderRadius:"var(--r-full)",background:"var(--surface)",border:"1px solid var(--line-2)",color:"var(--ink)",fontSize:"var(--t-sm)",fontWeight:600,textDecoration:"none"}}>
 <span aria-hidden style={{color:pc}}>▶</span> {tr("סרטון:")} {trv(TUTORIAL_TITLES[v])}
 </a>
                              ))}
 </div>
                          )}
 </div>
                      )}
 </div>
                  );
                })}
 </div>
 </div>
            );
          })()/* @screen-end */
  );
}

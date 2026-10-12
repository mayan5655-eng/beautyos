"use client";
// app/tab-help.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import Icon from "./Icon";

export default function HelpTab(props) {
  const {
    HELP_INTRO,
    HELP_SECTIONS,
    HELP_TITLE,
    expandedHelpKey,
    helpInline,
    pc,
    pcDeep,
    pcTint,
    setExpandedHelpKey,
  } = props;
  return (
(()=>{
            // Read-only, no writes, no gating. Same one-open-at-a-time list as
            // the setup checklist: a collapsed line per section, the body
            // revealed on request. The first section is open on arrival so the
            // page never reads empty.
            const openKey = expandedHelpKey ?? (HELP_SECTIONS[0]||{}).key;
            return (
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{marginBottom:16}}>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>{HELP_TITLE}</h2>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6}}>{HELP_INTRO}</p>
 </div>
 <div style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
                {HELP_SECTIONS.map((sec,i)=>{
                  const open = openKey===sec.key;
                  return (
 <div key={sec.key} style={{borderTop:i===0?"none":"1px solid var(--line)",background:open?pcTint:"transparent",transition:"background 0.18s"}}>
 <button
                      onClick={()=>setExpandedHelpKey(open?"":sec.key)}
                      aria-expanded={open}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"none",border:"none",fontFamily:"inherit",textAlign:"right",cursor:"pointer"}}>
 <span style={{flex:1,minWidth:0,fontSize:"var(--t-md)",fontWeight:open?700:600,color:"var(--ink)",display:"inline-flex",alignItems:"center",gap:7}}>{sec.icon&&<Icon name={sec.icon} size={15}/>}{sec.title}</span>
 <span aria-hidden style={{fontSize:"var(--t-md)",color:open?pc:"var(--ink-3)",flexShrink:0,display:"inline-block",transition:"transform 0.2s",transform:open?"rotate(-90deg)":"none"}}>←</span>
 </button>
                      {open&&(
 <div style={{padding:"0 14px 14px 14px"}}>
                          {sec.body.map((line,j)=>{
                            if(line.startsWith("### ")) return <p key={j} style={{fontSize:"var(--t-md)",fontWeight:700,color:pcDeep,margin:"12px 0 5px"}}>{helpInline(line.slice(4))}</p>;
                            if(line.startsWith("- ")) return <p key={j} style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.75,margin:"0 0 3px",paddingRight:14,textIndent:-14}}>• {helpInline(line.slice(2))}</p>;
                            return <p key={j} style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.75,margin:"0 0 9px"}}>{helpInline(line)}</p>;
                          })}
 </div>
                      )}
 </div>
                  );
                })}
 </div>
 </div>
            );
          })()
  );
}

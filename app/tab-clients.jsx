"use client";
// app/tab-clients.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { lighten } from "@/lib/theme";
import { ICON_PERSON } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Icon from "./Icon";

export default function ClientsTab(props) {
  const {
    ListMore,
    SKIN_TYPES,
    STATUS_COLORS,
    STATUS_LABELS,
    SignedImage,
    clientsShown,
    emptyClient,
    filterSkin,
    filterStatus,
    filteredClients,
    getClientAppts,
    getClientTotal,
    getDaysSince,
    onKbdActivate,
    openImportHub,
    pc,
    pcDeep,
    pcGrad,
    peopleSegments,
    searchQuery,
    setClientTab,
    setEditingClient,
    setFilterSkin,
    setFilterStatus,
    setNewClient,
    setSearchQuery,
    setSelectedClient,
    setShowClientModal,
    setShowLapsed,
    showMoreClients,
    waLink,
  } = props;
  return (
<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 {peopleSegments()}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>ניהול קשרי לקוחות</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>לקוחות <span style={{color:"var(--ink-3)",fontWeight:400}}>({filteredClients.length})</span></h2>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button onClick={()=>setShowLapsed(true)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"9px 16px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>מזמן לא הגיעו</button>
 <button onClick={openImportHub} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"9px 16px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}><Icon name="upload" size={14}/> ייבוא לקוחות</button>
 <button className="primary-btn" onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>✦ מטופלת חדשה</button>
 </div>
 </div>
 <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
 <div style={{position:"relative",flex:1,minWidth:160}}>
 <span style={{position:"absolute",top:"50%",right:14,transform:"translateY(-50%)",fontSize:"var(--t-sm)",color:"var(--ink-3)",pointerEvents:"none"}}>⌕</span>
 <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="חיפוש לפי שם או טלפון..." style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 36px 10px 14px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",boxShadow:"var(--shadow-xs)"}}/>
 </div>
 <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 14px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink-2)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
 <option value="all">כל הסטטוסים</option><option value="VIP">VIP</option><option value="hot">חמות</option><option value="active">✓ פעילות</option><option value="cold">להתחדשות</option>
 </select>
 <select value={filterSkin} onChange={e=>setFilterSkin(e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 14px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink-2)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
 <option value="all">כל עור</option>{SKIN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
 </select>
 </div>
            {filteredClients.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:"var(--r-xl)",marginTop:6}}>
 {/* "No clients yet" gets the person icon; "no results for this filter" is
     a different situation (she has clients, this search just matched none)
     and keeps the plain magnifying glass rather than borrowing an icon that
     would claim the wrong thing. */}
 {(searchQuery||filterStatus!=="all")?(
 <div style={{width:64,height:64,borderRadius:"var(--r-lg)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-3xl)",background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>⌕</div>
 ):(
 <BrandImage width={60} height={60} aria-hidden alt="" src={ICON_PERSON} style={{width:60,height:60,margin:"0 auto 14px",display:"block"}}/>
 )}
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:5}}>{(searchQuery||filterStatus!=="all")?"לא נמצאו לקוחות":"עוד אין לקוחות"}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",maxWidth:340,margin:"0 auto 18px",lineHeight:1.6}}>{(searchQuery||filterStatus!=="all")?"נסי לשנות את החיפוש או הסינון.":"הוסיפי את הלקוחה הראשונה, או ייבאי רשימה שלמה בבת אחת."}</p>
 {!(searchQuery||filterStatus!=="all")&&(
 <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
 <button className="empty-cta primary-btn" onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"11px 22px",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>✦ מטופלת חדשה</button>
 <button className="empty-cta" onClick={openImportHub} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"11px 22px",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}><Icon name="upload" size={14}/> ייבוא לקוחות</button>
 </div>
 )}
 </div>
 )
              :filteredClients.slice(0,clientsShown).map(client=>{
                const appts=getClientAppts(client.id);
                // Most recent visit by actual date (then hour) - not by row id,
                // so a later-created past appointment can't masquerade as "last".
                const last=[...appts].sort((a,b)=>{const d=String(b.date||"").localeCompare(String(a.date||""));return d!==0?d:(Number(b.hour)||0)-(Number(a.hour)||0);})[0];
                const statusColor=STATUS_COLORS[client.status]||"var(--warning)";
                const days=getDaysSince(client.id);
                const total=getClientTotal(client.id);
                return(
 <div key={client.id} className="client-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת כרטיס הלקוחה ${client.name}`} onClick={()=>{setSelectedClient(client);setClientTab("info");}} style={{background:"var(--surface)",borderRadius:"var(--r-lg)",padding:"13px 16px",border:"1px solid var(--line)",display:"flex",alignItems:"center",gap:13,marginBottom:8,boxShadow:"var(--shadow-sm)"}}>
 <div style={{width:46,height:46,borderRadius:"var(--r-md)",padding:2,background:`linear-gradient(135deg,${lighten(statusColor,0.4)},${statusColor})`,flexShrink:0,boxShadow:"var(--shadow-xs)"}}>
 <div style={{width:"100%",height:"100%",borderRadius:"var(--r-sm)",background:client.images?.[0]?"transparent":statusColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",fontWeight:700,color:"var(--surface)",overflow:"hidden"}}>
                      {client.images?.[0]?<SignedImage value={client.images[0]} alt={client.name} style={{width:"100%",height:"100%",objectFit:"cover"}} fallback={client.name[0]}/>:client.name[0]}
 </div>
 </div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
 <p style={{fontWeight:700,fontSize:"var(--t-md)",color:"var(--ink)",letterSpacing:"-0.01em"}}>{client.name}</p>
                        {client.status&&<span className="pill" style={{fontSize:"var(--t-sm)",background:statusColor,color:"var(--surface)",padding:"3px 8px"}}>{STATUS_LABELS[client.status]}</span>}
                        {days>90&&<span className="pill" style={{fontSize:"var(--t-sm)",background:"rgba(242,184,75,0.16)",color:"var(--warning)",padding:"3px 8px"}}>רדומה · {days}י</span>}
                        {total>0&&<span className="pill" style={{fontSize:"var(--t-sm)",background:"var(--pc-tint)",color:pcDeep,padding:"3px 8px"}}>₪{total.toLocaleString()}</span>}
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.phone&&`${client.phone} · `}{appts.length} תורים{last&&` · ${last.service}`}</p>
 </div>
                    {client.phone&&<a href={waLink(client.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"6px 11px",fontSize:"var(--t-sm)"}}>✆ הודעה</a>}
 <span style={{fontSize:"var(--t-md)",color:pc}}>←</span>
 </div>
                );
              })}
 </div>
 <ListMore shown={clientsShown} total={filteredClients.length} onMore={showMoreClients} pc={pc} noun="לקוחות"/>
 </>
  );
}

"use client";
// app/tab-insights.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { lighten } from "@/lib/theme";
import { canMarket, marketingStatus } from "@/lib/marketingConsent";

export default function InsightsTab(props) {
  const {
    activeClients,
    coldClients,
    lastMonthRevenue,
    monthlyData,
    now,
    onKbdActivate,
    pc,
    pc2,
    pcDeep,
    pcGrad,
    setShowLapsed,
    settings,
    thisMonthLeads,
    thisMonthRevenue,
    todayAppts,
    upcomingBirthdays,
    waBirthday,
    weekAppts,
  } = props;
  return (
<>
            {(()=>{
              const revTrend=lastMonthRevenue>0?Math.round(((thisMonthRevenue-lastMonthRevenue)/lastMonthRevenue)*100):null;
              const stats=[
                {label:"הכנסות החודש",value:`₪${thisMonthRevenue.toLocaleString()}`,icon:"₪",accent:pc,trend:revTrend,
                  sub:revTrend!==null?(revTrend>=0?`עלייה של ${revTrend}% מהחודש שעבר`:`ירידה של ${Math.abs(revTrend)}% מהחודש שעבר`):"החודש הראשון שלך"},
                {label:"תורים השבוע",value:weekAppts.length,icon:"◴",accent:pc,trend:null,sub:`${todayAppts.length} מהם היום`},
                {label:"לקוחות פעילות",value:activeClients.length,icon:"♥",accent:"var(--success)",trend:null,sub:thisMonthLeads.length>0?`${thisMonthLeads.length} פניות חדשות החודש`:"אין פניות חדשות"},
                {label:"להתחדשות",value:coldClients.length,icon:"✦",accent:"var(--warning)",trend:null,onClick:coldClients.length>0?()=>setShowLapsed(true):null,sub:coldClients.length>0?"שווה לשלוח הודעה":"כל הלקוחות פעילות "},
              ];
              const maxRev=Math.max(...monthlyData.map(m=>m.revenue),1);
              return(
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>סקירה עסקית</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:18}}>תובנות</h2>

                {/* STAT WIDGETS — full size */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16,marginBottom:24}}>
                  {stats.map((s,i)=>{
                    const up=s.trend!=null&&s.trend>=0;
                    return(
 <div key={i} className="stat-card fm-in"
   onClick={s.onClick||undefined}
   role={s.onClick?"button":undefined}
   tabIndex={s.onClick?0:undefined}
   onKeyDown={s.onClick?onKbdActivate:undefined}
   aria-label={s.onClick?`${s.label} — ${s.value}, פתיחת הרשימה`:undefined}
   style={{animationDelay:`${0.05*i}s`,background:"var(--surface)",borderRadius:"var(--r-lg)",padding:"22px 22px",border:"1px solid var(--line)",textAlign:"right",position:"relative",overflow:"hidden",cursor:s.onClick?"pointer":"default"}}>
 <div aria-hidden style={{position:"absolute",top:0,right:0,width:110,height:110,background:`radial-gradient(circle at 100% 0%, ${lighten(s.accent,0.82)}, transparent 70%)`,pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
 <span style={{width:42,height:42,borderRadius:"var(--r-sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-xl)",fontWeight:700,color:s.accent,background:lighten(s.accent,0.86),border:`1px solid ${lighten(s.accent,0.7)}`}}>{s.icon}</span>
                        {s.trend!=null&&(
 <span className="pill" style={{background:up?"rgba(70,179,123,0.12)":"rgba(224,91,111,0.12)",color:up?"var(--success)":"var(--danger)",padding:"4px 9px"}}>{up?"▲":"▼"} {Math.abs(s.trend)}%</span>
                        )}
 </div>
 <p style={{position:"relative",fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:6}}>{s.label}</p>
 <p className="serif" style={{position:"relative",fontSize:"var(--t-hero)",fontWeight:600,color:"var(--ink)",lineHeight:1,letterSpacing:"-0.01em"}}>{s.value}</p>
                      {s.sub&&<p style={{position:"relative",fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:10,fontWeight:500}}>{s.sub}</p>}
 </div>
                    );
                  })}
 </div>

                {/* REVENUE CHART */}
 <div className="fm-in"
   style={{animationDelay:"0.1s",background:"var(--surface)",borderRadius:"var(--r-xl)",padding:"26px 30px 22px",border:"1px solid var(--line)",boxShadow:"var(--shadow-md)",marginBottom:24,position:"relative",overflow:"hidden"}}>
 <div aria-hidden style={{position:"absolute",top:-70,left:-40,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle, var(--pc-soft), transparent 70%)",pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14,marginBottom:22,flexWrap:"wrap"}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:5}}>סקירת הכנסות</p>
 <h3 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>6 החודשים האחרונים</h3>
 </div>
 <div style={{textAlign:"left"}}>
 <p className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:600,color:pc,lineHeight:1}}>₪{monthlyData.reduce((s,m)=>s+m.revenue,0).toLocaleString()}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:3}}>סה״כ בתקופה</p>
 </div>
 </div>
 <div style={{position:"relative",display:"flex",alignItems:"flex-end",gap:12,height:168,paddingBottom:4,borderBottom:"1px solid var(--line)"}}>
                    {monthlyData.map((m,i)=>{
                      const h=Math.round((m.revenue/maxRev)*130);
                      const isCurrent=i===monthlyData.length-1;
                      return(
 <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",gap:7,height:"100%"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:isCurrent?pc:"var(--ink-3)"}}>{m.revenue>0?`₪${(m.revenue/1000).toFixed(m.revenue>=10000?0:1)}k`:""}</span>
 <div className="fm-grow"
   title={`${m.month}: ₪${m.revenue.toLocaleString()}`}
   style={{height:Math.max(h,4),animationDelay:`${0.15+0.06*i}s`,width:"100%",maxWidth:44,borderRadius:"12px 12px 5px 5px",background:isCurrent?`linear-gradient(180deg,${pc2} 0%,${pcDeep} 100%)`:`linear-gradient(180deg,${lighten(pc,0.62)} 0%,${lighten(pc,0.4)} 100%)`,boxShadow:isCurrent?"var(--shadow-accent)":"none",cursor:"default"}}/>
 </div>
                      );
                    })}
 </div>
 <div style={{display:"flex",gap:12,marginTop:8}}>
                    {monthlyData.map((m,i)=>{const isCurrent=i===monthlyData.length-1;return(
 <span key={i} style={{flex:1,textAlign:"center",fontSize:"var(--t-sm)",color:isCurrent?"var(--ink)":"var(--ink-3)",fontWeight:isCurrent?700:500}}>{m.month}</span>
                    );})}
 </div>
                {monthlyData.every(m=>!(m.revenue>0))&&(
 <p style={{textAlign:"center",fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:14,lineHeight:1.6}}>עוד אין הכנסות להצגה. אחרי התשלום הראשון שתרשמי בקופה, הגרף יתמלא.</p>
                )}
 </div>

                {/* UPCOMING BIRTHDAYS — full list */}
 <div className="glass-card" style={{padding:"24px 26px",marginBottom:24}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
 <span style={{width:34,height:34,borderRadius:"var(--r-sm)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",background:"rgba(224,91,111,0.12)",color:"var(--danger)"}}>🎀</span>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>ימי הולדת קרובים</h3>
                    {upcomingBirthdays.length>0&&<span className="pill" style={{marginRight:"auto",background:"var(--pc-tint)",color:pcDeep,padding:"3px 11px",fontSize:"var(--t-xs)"}}>{upcomingBirthdays.length}</span>}
 </div>
                    {upcomingBirthdays.length===0?(
 <div style={{textAlign:"center",padding:"22px 14px"}}>
 <div style={{width:52,height:52,borderRadius:"var(--r-md)",margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-2xl)",background:"rgba(224,91,111,0.10)"}}>🎂</div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink-2)"}}>אין ימי הולדת קרובים</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:3}}>ב-30 הימים הקרובים</p>
 </div>
                      ):upcomingBirthdays.slice(0,20).map((c)=>{
                        const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);
                        return(
 <div key={c.id} className="appt-card" style={{display:"flex",alignItems:"center",gap:13,padding:"9px 10px",borderRadius:"var(--r-md)",marginBottom:6,background:"var(--surface-2)",border:"1px solid var(--line)"}}>
 <div className="serif" style={{width:44,height:44,borderRadius:"var(--r-sm)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-xl)",fontWeight:700,color:"var(--pc-contrast)",background:pcGrad,boxShadow:"var(--shadow-accent)"}}>{b.getDate()}</div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:1}}>{bd.getDate()}/{bd.getMonth()+1}</p>
 </div>
                          {c.phone&&(canMarket(c)?<a href={waBirthday(c.phone,c.name,settings.business_name)} target="_blank" rel="noreferrer" className="pill" style={{padding:"6px 14px",background:"var(--pc-tint)",color:pc,textDecoration:"none"}}>ברכה</a>:<span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{marketingStatus(c)==="opted_out"?"ביקשה הסרה":"אין הסכמה לדיוור"}</span>)}
 </div>
                        );
                      })}
 </div>
 </div>
              );
            })()}
 </>
  );
}

"use client";
// app/tab-whatsapp.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { parseDb } from "@/lib/dbTime";
import { isActiveClient, isColdClient } from "@/lib/clientActivity";
import { lighten } from "@/lib/theme";
import { ICON_ENVELOPE } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Spinner from "./Spinner";
import { fmtApptTime } from "@/lib/apptTime";
import { canMarket, withMarketingFooter, MARKETING_FOOTER } from "@/lib/marketingConsent";

export default function WhatsappTab(props) {
  const {
    WA_TYPE_LABELS,
    appointments,
    clients,
    coldClients,
    formatDate,
    getDaysSince,
    getLastApptDate,
    loadWaMessages,
    now,
    pc,
    pcGrad,
    peopleSegments,
    setWaBroadcastAudience,
    setWaBroadcastMsg,
    setWaFreeClient,
    setWaFreeMsg,
    setWaFreeSearch,
    setWaView,
    settings,
    toast,
    today,
    tomorrowAppts,
    upcomingBirthdays,
    waBroadcastAudience,
    waBroadcastMsg,
    waDeliveryLabel,
    waFreeClient,
    waFreeMsg,
    waFreeSearch,
    waLogError,
    waLogLoading,
    waMessages,
    waSendGroup,
    waSendOne,
    waSentToday,
    waView,
  } = props;
  return (
(()=>{
            // Safe business name for outgoing messages: never leak an empty name
            // or the legacy "העסק שלי" placeholder to real clients. When absent,
            // the message phrasing simply drops the business-name clause.
            const bizName=(settings.business_name||"").trim();
            const bizSafe=bizName&&bizName!=="העסק שלי"?bizName:"";
            const reminderTargets=tomorrowAppts.map(a=>{
              const cl=clients.find(c=>String(c.id)===String(a.client_id));
              return {clientId:a.client_id,name:a.name,phone:cl?.phone,
                message:`שלום ${a.name}! ✦\nתזכורת לתור מחר:\n${a.service}\nבשעה ${fmtApptTime(a)}\n\nמחכים לך! `};
            });
            const birthdayTargets=upcomingBirthdays.filter(canMarket).map(c=>{
              const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());
              if(bd<now)bd.setFullYear(now.getFullYear()+1);
              const days=Math.floor((bd-now)/(1000*60*60*24));
              return {clientId:c.id,name:c.name,phone:c.phone,days,
                message:`שלום ${c.name}! \nיום הולדת שמח! \n${bizSafe?`מ${bizSafe} `:""}אנחנו שולחים לך ברכות חמות!\nלרגל היום המיוחד - 15% הנחה על הטיפול הבא שלך \nנחכה לך! ✦`.concat("\n\n",MARKETING_FOOTER)};
            });
            const coldTargets=coldClients.filter(canMarket).map(c=>({clientId:c.id,name:c.name,phone:c.phone,days:getDaysSince(c.id),
              message:`שלום ${c.name}! \nמתגעגעים אליך${bizSafe?` ב${bizSafe}`:""}!\nמזמן לא ראינו אותך — נשמח לפנק אותך בטיפול \nרוצה לקבוע תור? פשוט תכתבי לנו `.concat("\n\n",MARKETING_FOOTER)}));
            const weekAgo=formatDate(new Date(now.getTime()-7*86400000));
            const reviewClientIds=[...new Set(appointments.filter(a=>a.date&&a.date>=weekAgo&&a.date<=today).map(a=>String(a.client_id)))];
            const reviewTargets=reviewClientIds.map(cid=>{
              const c=clients.find(cl=>String(cl.id)===cid);
              if(!c)return null;
              return {clientId:c.id,name:c.name,phone:c.phone,
                message:`שלום ${c.name}! \nתודה שביקרת אצלנו${bizSafe?` ב${bizSafe}`:""}!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `};
            }).filter(Boolean);

            const audienceClients=clients.filter(c=>{
              if(!c.phone||!canMarket(c))return false;
              if(waBroadcastAudience==="all")return true;
              if(waBroadcastAudience==="vip")return c.status==="VIP";
              if(waBroadcastAudience==="active")return isActiveClient(getLastApptDate(c.id),now);
              if(waBroadcastAudience==="cold")return isColdClient(getLastApptDate(c.id),now);
              return true;
            });

            const groups=[
              // Categorical: the four groups must stay distinguishable from one
              // another, so these are literal values rather than tokens.
              {key:"reminders",icon:"◴",title:"תזכורות לתורי מחר",color:"#E0913A",targets:reminderTargets,empty:"אין תורים מחר"},
              {key:"birthdays",icon:"🎀",title:"ברכות יום הולדת",color:pc,targets:birthdayTargets,empty:"אין ימי הולדת ב-30 הימים הקרובים"},
              {key:"cold",icon:"✦",title:"מטופלות להתחדשות (60+ יום)",color:"#5580C4",targets:coldTargets,empty:"כל המטופלות פעילות! "},
              {key:"review",icon:"⭐",title:"בקשת ביקורת (השבוע האחרון)",color:"#9C27B0",targets:reviewTargets,empty:"אין ביקורים בשבוע האחרון"},
            ];

            return(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 {peopleSegments()}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>וואטסאפ</p>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_ENVELOPE} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",margin:0}}>מרכז הודעות</h2>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:18}}>שליחת הודעות מוכנות ללקוחות — בלחיצה אחת</p>

 {/* Sub-tabs: the send tools, or the log of everything already sent. */}
 <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
 <div style={{display:"inline-flex",gap:3,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:3}}>
 <button onClick={()=>setWaView("send")} className="primary-btn" style={{padding:"8px 20px",fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:waView==="send"?pcGrad:"transparent",color:waView==="send"?"var(--pc-contrast)":"var(--ink-2)"}}>שליחת הודעות</button>
 <button onClick={()=>{setWaView("log");if(waMessages===null)loadWaMessages();}} className="primary-btn" style={{padding:"8px 20px",fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:waView==="log"?pcGrad:"transparent",color:waView==="log"?"var(--pc-contrast)":"var(--ink-2)"}}>יומן הודעות</button>
 </div>
 </div>

 {waView==="send"&&(<>

 <p data-testid="marketing-consent-note" style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:12,textAlign:"center"}}>בברכות יום הולדת, בהודעות התחדשות ובהודעה לקבוצה נכללות רק לקוחות שאישרו קבלת עדכונים ומבצעים. כרגע: {clients.filter(canMarket).length} מתוך {clients.length}. אפשר לסמן הסכמה בכרטיס הלקוחה.</p>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,marginBottom:16}}>
                {groups.map(g=>{
                  const withPhone=g.targets.filter(t=>t.phone);
                  return(
 <div key={g.key} className="glass-card card-flush">
 <div style={{background:lighten(g.color,0.86),padding:"13px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,borderBottom:"1px solid var(--line)"}}>
 <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
 <span style={{width:34,height:34,borderRadius:"var(--r-sm)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-lg)",color:g.color,background:"rgba(255,255,255,0.7)"}}>{g.icon}</span>
 <div style={{minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.title}</p>
 <p style={{fontSize:"var(--t-sm)",color:g.color,fontWeight:700}}>{withPhone.length} נמענים</p>
 </div>
 </div>
                        {withPhone.length>0&&(
 <button onClick={()=>waSendGroup(g.targets)} className="wa-btn" style={{padding:"7px 12px",fontSize:"var(--t-sm)",flexShrink:0}}>✆ שליחה מרוכזת</button>
                        )}
 </div>
 <div style={{padding:"8px 12px",maxHeight:200,overflowY:"auto"}}>
                        {g.targets.length===0?<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",padding:"8px 2px"}}>{g.empty}</p>
                          :g.targets.map((t,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 4px",borderBottom:i<g.targets.length-1?"1px solid var(--line)":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {waSentToday[t.clientId]&&<span style={{color:"var(--success)"}}>✓ </span>}{t.name}
 </p>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{t.phone||"אין טלפון"}{t.days!==undefined?` · ${t.days} ימים`:""}</p>
 </div>
                              {t.phone?(
 <button onClick={()=>waSendOne(t.clientId,t.phone,t.message)} className="wa-btn" style={{padding:"4px 10px",fontSize:"var(--t-sm)"}}>שלחי</button>
                              ):<span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>—</span>}
 </div>
                          ))}
 </div>
 </div>
                  );
                })}
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>שליחת הודעה לקבוצה</h3>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:7}}>בחרי קהל יעד</p>
 <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                  {[{k:"all",l:"כל המטופלות"},{k:"vip",l:"VIP"},{k:"active",l:"✓ פעילות"},{k:"cold",l:"להתחדשות"}].map(a=>(
 <button key={a.k} onClick={()=>setWaBroadcastAudience(a.k)} style={{padding:"7px 14px",border:`1px solid ${waBroadcastAudience===a.k?"transparent":"var(--line-2)"}`,borderRadius:"var(--r-lg)",background:waBroadcastAudience===a.k?pcGrad:"var(--surface)",color:waBroadcastAudience===a.k?"var(--pc-contrast)":"var(--ink-2)",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:600,boxShadow:waBroadcastAudience===a.k?"var(--shadow-accent)":"var(--shadow-xs)"}}>{a.l}</button>
                  ))}
 </div>
 <textarea value={waBroadcastMsg} onChange={e=>setWaBroadcastMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה... למשל: שלום! החודש מבצע מיוחד — 20% הנחה על טיפולי פנים "
                  style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"11px 13px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:10}}/>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{audienceClients.length} לקוחות עם טלפון והסכמה לדיוור בקבוצה זו</p>
 <button onClick={()=>{
                    if(!waBroadcastMsg.trim()){toast("עוד לא כתבת הודעה","error");return;}
                    waSendGroup(audienceClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,message:withMarketingFooter(`שלום ${c.name}! ${waBroadcastMsg}`)})));
                  }} className="wa-btn" style={{padding:"9px 18px",fontSize:"var(--t-xs)"}}>✆ שלחי לקבוצה</button>
 </div>
 </div>

 <div className="glass-card" style={{padding:18}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>הודעה אישית למטופלת</h3>
 <div style={{position:"relative",marginBottom:10}}>
 <input value={waFreeSearch} onChange={e=>{setWaFreeSearch(e.target.value);if(!e.target.value)setWaFreeClient(null);}}
                    placeholder="חיפוש לקוחה לפי שם או טלפון..."
                    style={{width:"100%",border:`1px solid ${waFreeClient?"var(--success)":"var(--line-2)"}`,borderRadius:"var(--r-md)",padding:"11px 13px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:waFreeClient?"rgba(70,179,123,0.07)":"var(--surface-2)"}}/>
                  {waFreeClient&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:"var(--t-md)",color:"var(--success)"}}>✓</span>}
                  {waFreeSearch.length>1&&!waFreeClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",boxShadow:"var(--shadow-lg)",zIndex:99,overflow:"hidden",marginTop:4,maxHeight:180,overflowY:"auto"}}>
                      {clients.filter(c=>c.name?.includes(waFreeSearch)||c.phone?.includes(waFreeSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setWaFreeClient(c);setWaFreeSearch(c.name);}} className="client-row" style={{padding:"10px 13px",borderBottom:"1px solid var(--line)",cursor:"pointer"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{c.phone||"אין טלפון"}</p>
 </div>
                      ))}
 </div>
                  )}
 </div>
 <textarea value={waFreeMsg} onChange={e=>setWaFreeMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה..."
                  style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"11px 13px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:10}}/>
 <button onClick={()=>{
                  if(!waFreeClient){toast("למי לשלוח? אפשר לבחור לקוחה","error");return;}
                  if(!waFreeClient.phone){toast("אין טלפון ללקוחה זו","error");return;}
                  if(!waFreeMsg.trim()){toast("עוד לא כתבת הודעה","error");return;}
                  waSendOne(waFreeClient.id,waFreeClient.phone,waFreeMsg);
                  setWaFreeMsg("");
                }} className="wa-btn" style={{padding:"11px 16px",fontSize:"var(--t-sm)",width:"100%",justifyContent:"center"}}>✆ שלחי הודעה</button>
 </div>
 </>)}

 {/* Log of everything already sent, newest first. Read-only. */}
 {waView==="log"&&(<>
 <div className="glass-card" style={{padding:"16px 18px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink)"}}>יומן הודעות</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>100 ההודעות האחרונות שנשלחו מהמערכת בשמך.</p>
 </div>
 <button onClick={loadWaMessages} disabled={waLogLoading} className="primary-btn" style={{padding:"8px 18px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)"}}>{waLogLoading?<Spinner inline label="טוען"/>:"רענני"}</button>
 </div>

 {waLogError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:14}}>
 <p style={{fontSize:"var(--t-sm)",color:pc,fontWeight:600}}>{waLogError}</p>
 </div>
 )}

 {waLogLoading&&waMessages===null&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",textAlign:"center",padding:"26px 0"}}><Spinner inline label="טוען"/></p>}

 {!waLogLoading&&waMessages&&waMessages.length===0&&(
 <div className="glass-card" style={{padding:"36px 20px",textAlign:"center"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>עדיין לא נשלחו הודעות.</p>
 </div>
 )}

 {waMessages&&waMessages.length>0&&(
 <div className="glass-card card-flush" style={{overflow:"hidden"}}>
 {/* Horizontal scroll on narrow phones so the six columns never crush. */}
 <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
 <table style={{width:"100%",minWidth:640,borderCollapse:"collapse"}}>
 <thead>
 <tr style={{background:"var(--pc-tint)",textAlign:"right"}}>
                        {["שם","טלפון","סוג","סטטוס","תוכן","תאריך"].map(h=>(
 <th key={h} style={{padding:"11px 13px",fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>{h}</th>
                        ))}
 </tr>
 </thead>
 <tbody>
                      {waMessages.map((m,i)=>(
 <tr key={m.id||i} style={{borderTop:"1px solid var(--line)",background:i%2===0?"var(--surface)":"var(--surface-2)"}}>
 <td style={{padding:"10px 13px",fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{m.recipient_name||"—"}</td>
 <td style={{padding:"10px 13px",fontSize:"var(--t-xs)",color:"var(--ink-2)",whiteSpace:"nowrap"}}>{m.recipient_phone}</td>
 <td style={{padding:"10px 13px",fontSize:"var(--t-sm)"}}><span className="pill" style={{background:"var(--pc-tint)",color:pc,padding:"3px 9px",fontWeight:600}}>{WA_TYPE_LABELS[m.message_type]||m.message_type}</span></td>
 <td style={{padding:"10px 13px",fontSize:"var(--t-sm)",fontWeight:700,whiteSpace:"nowrap",color:waDeliveryLabel(m).color}}>{waDeliveryLabel(m).text}</td>
 <td style={{padding:"10px 13px",fontSize:"var(--t-xs)",color:"var(--ink-2)",maxWidth:300}}>{m.message_body}</td>
 <td style={{padding:"10px 13px",fontSize:"var(--t-sm)",color:"var(--ink-3)",whiteSpace:"nowrap"}}>{m.created_at?parseDb(m.created_at).toLocaleString("he-IL"):""}</td>
 </tr>
                      ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </>)}
 </div>
 </>);
          })()
  );
}

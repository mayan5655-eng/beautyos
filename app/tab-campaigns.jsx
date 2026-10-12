"use client";
// app/tab-campaigns.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { accentStyle } from "@/lib/theme";
import { ICON_FRAME } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import { isDemoTenantId } from "@/lib/demoTenants";
import { CESDK_POC } from "./cesdk-poc/flag";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import Icon from "./Icon";

export default function CampaignsTab(props) {
  const {
    CesdkReelPoc,
    DesignStudio,
    SourceReport,
    aiPostsView,
    allSourcesReport,
    appointments,
    clientSourceStats,
    clients,
    conversionRate,
    convertedLeads,
    emptyClient,
    fbCampaigns,
    fbDatePreset,
    fbError,
    fbLoading,
    fbPage,
    fbTotals,
    generateReel,
    herAccent,
    leadSourceList,
    leads,
    liveRcpts,
    loadFbCampaigns,
    marketingView,
    openImportHub,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    readOnly,
    reelData,
    reelDuration,
    reelError,
    reelLoading,
    reelTopic,
    reelVibe,
    services,
    setAiPostsView,
    setEditingClient,
    setFbDatePreset,
    setMarketingView,
    setNewClient,
    setReelDuration,
    setReelTopic,
    setReelVibe,
    setShowClientModal,
    settings,
    toast,
  } = props;
  return (
<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>פוסטים, רילסים וקמפיינים</p>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
 <BrandImage width={48} height={48} aria-hidden alt="" src={ICON_FRAME} style={{width:48,height:48,objectFit:"contain",flexShrink:0}}/>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",margin:0}}>תוכן</h2>
 </div>

 <div style={{display:"inline-flex",gap:3,marginBottom:18,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:4,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>setMarketingView("posts")} className="primary-btn" style={{padding:"8px 18px",fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:marketingView==="posts"?pcGrad:"transparent",color:marketingView==="posts"?"var(--pc-contrast)":"var(--ink-2)"}}>פוסטים ותבניות</button>
 <button onClick={()=>setMarketingView("campaigns")} className="primary-btn" style={{padding:"8px 18px",fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:marketingView==="campaigns"?pcGrad:"transparent",color:marketingView==="campaigns"?"var(--pc-contrast)":"var(--ink-2)"}}>קמפיינים בפייסבוק</button>
 </div>

 {marketingView==="campaigns"&&(<>
 <div className="glass-card" style={{padding:18,marginBottom:16}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>קמפיינים בפייסבוק ואינסטגרם</h3>
 <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
 {fbPage?(
 <span title={fbPage.page_name} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:"var(--t-sm)",fontWeight:600,color:"var(--success)",background:"rgba(70,179,123,0.12)",borderRadius:"var(--r-lg)",padding:"6px 12px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>מחובר ✓ · {fbPage.page_name}</span>
 ):(
 <button onClick={()=>{window.location.href="/api/facebook/oauth/start";}} className="primary-btn" style={{padding:"7px 14px",background:"#1877F2",color:"#fff",fontSize:"var(--t-xs)"}}>התחברי לפייסבוק</button>
 )}
 {fbPage&&<button onClick={()=>{window.location.href="/api/facebook/oauth/start";}} className="primary-btn" style={{padding:"6px 12px",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",fontSize:"var(--t-xs)"}}>התחברי מחדש</button>}
 <select value={fbDatePreset} onChange={e=>{setFbDatePreset(e.target.value);loadFbCampaigns(e.target.value);}} style={{border:"1px solid var(--line)",borderRadius:"var(--r-lg)",padding:"6px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:"var(--ink-2)"}}>
 <option value="today">היום</option>
 <option value="last_7d">7 ימים</option>
 <option value="last_30d">30 ימים</option>
 <option value="last_90d">90 ימים</option>
 </select>
 <button onClick={()=>loadFbCampaigns()} disabled={fbLoading} className="primary-btn" style={{padding:"7px 14px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)"}}>{fbLoading?<Spinner inline label="טוען"/>:fbCampaigns===null?"טעני קמפיינים":"רענני"}</button>
 </div>
 </div>

 {fbCampaigns===null&&!fbLoading&&!fbError&&(
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",padding:"10px 0"}}>לחצי "טעני קמפיינים" כדי לראות את ביצועי המודעות שלך בפייסבוק ואינסטגרם — הוצאה, לידים, ומחיר לליד.</p>
 )}

 {fbError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:"var(--r-sm)",padding:"11px 14px"}}>
 <p style={{fontSize:"var(--t-xs)",color:pc,fontWeight:600,marginBottom:3}}>לא הצלחנו לטעון כרגע</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{fbError}</p>
 </div>
 )}

 {fbTotals&&fbCampaigns&&fbCampaigns.length>0&&(
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:14}}>
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>סה״כ הוצאה</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:pc}}>₪{Math.round(fbTotals.spend).toLocaleString()}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>לידים</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)"}}>{fbTotals.leads}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>מחיר לליד</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:pc}}>{fbTotals.cpl?`₪${fbTotals.cpl}`:"—"}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>חשיפות</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)"}}>{fbTotals.impressions.toLocaleString()}</p>
 </div>
 </div>
 )}

 {fbCampaigns&&fbCampaigns.length>0&&fbCampaigns.map(c=>(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",marginBottom:7,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:140}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <span className="pill" style={{fontSize:"var(--t-xs)",padding:"2px 8px",background:c.status==="ACTIVE"?"rgba(70,179,123,0.14)":"var(--line)",color:c.status==="ACTIVE"?"var(--success)":"var(--ink-3)"}}>{c.status==="ACTIVE"?"פעיל":"מושהה"}</span>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:2}}>{c.impressions.toLocaleString()} חשיפות · {c.clicks} קליקים</p>
 </div>
 <div style={{textAlign:"center",minWidth:60}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>הוצאה</p>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:pc}}>₪{Math.round(c.spend).toLocaleString()}</p>
 </div>
 <div style={{textAlign:"center",minWidth:45}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>לידים</p>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{c.leads}</p>
 </div>
 <div style={{textAlign:"center",minWidth:55}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>לליד</p>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:pc}}>{c.cpl?`₪${c.cpl}`:"—"}</p>
 </div>
 </div>
 ))}

 {fbCampaigns&&fbCampaigns.length===0&&!fbError&&(
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",padding:"8px 0"}}>לא נמצאו קמפיינים בטווח הזמן הזה.</p>
 )}
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:16}}>
              {[
                {label:"סה״כ לידים",value:leads.length,icon:"✉"},
                {label:"הומרו",value:convertedLeads.length,icon:"✓"},
                {label:"המרה",value:`${conversionRate}%`,icon:"↗"},
                {label:"הכנסות מלידים",value:`₪${Math.round(allSourcesReport.totals.revenue).toLocaleString()}`,icon:"₪"},
              ].map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"var(--surface)",borderRadius:"var(--r-lg)",padding:"16px 16px",border:`1px solid var(--line)`}}>
 <span style={{display:"inline-flex",width:30,height:30,borderRadius:"var(--r-xs)",alignItems:"center",justifyContent:"center",fontSize:"var(--t-md)",color:pc,background:"var(--pc-tint)",marginBottom:8}}>{s.icon}</span>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>{s.label}</p>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:pc}}>{s.value}</p>
 </div>
              ))}
 </div>
 {/* CLIENTS by source — distinct from "ביצועים לפי מקור" below, which
                counts LEADS. This one counts the clients she actually has and
                what they have spent, which is the question "where do my
                customers come from" rather than "which source sends traffic".
                Every client appears exactly once, including under לא ידוע. */}
 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>לקוחות לפי מקור</h3>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginBottom:14,lineHeight:1.6}}>
                לקוחות רשומות, לפי מאיפה הגיעו. &quot;לא ידוע&quot; הן לקוחות שנוספו לפני שהמעקב היה קיים או שנוספו ידנית — לא ניחוש.
 </p>
              {clients.length===0?<EmptyState compact icon="people" accent={pc} accentTint={pcTint}
                 title="אין עדיין ממי ללמוד"
                 body="הפילוח הזה מתמלא מעצמו ככל שנרשמות לקוחות. אחרי חמש-שש כבר רואים מאיפה מגיעות הכי הרבה."
                 actions={[{label:"הוספת לקוחה",onClick:()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}},{label:"ייבוא מאנשי קשר",onClick:openImportHub}]}/>
                :clientSourceStats.map((s)=>{
                  const pct=clients.length>0?Math.round((s.clients/clients.length)*100):0;
                  const unknown=s.key==="__unknown__";
                  return(
 <div key={s.key} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 12px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",marginBottom:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:unknown?"var(--ink-3)":"var(--ink)"}}>{s.label}</p>
 <div style={{display:"flex",gap:8,marginTop:2,flexWrap:"wrap"}}>
 <span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{s.clients} לקוחות</span>
 <span style={{fontSize:"var(--t-xs)",color:pc,fontWeight:700}}>{pct}%</span>
 </div>
 <div style={{background:"var(--line)",borderRadius:"var(--r-xs)",height:5,marginTop:5,overflow:"hidden"}}>
 <div style={{background:unknown?"var(--line-2)":pcGrad,borderRadius:"var(--r-xs)",height:5,width:`${pct}%`}}/>
 </div>
 </div>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:unknown?"var(--ink-3)":pc}}>₪{s.revenue.toLocaleString()}</p>
 </div>
                  );
                })}
 </div>

  <SourceReport leads={leads} receipts={liveRcpts} sourceList={leadSourceList} pc={pc} pcGrad={pcGrad} pcTint={pcTint} toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}/>
 </>)}

 {marketingView==="posts"&&(<>
 <div style={{textAlign:"center",marginBottom:18}}>
 <BrandImage width={52} height={52} aria-hidden alt="" src={ICON_FRAME} style={{width:52,height:52,objectFit:"contain",marginBottom:4}}/>
 <h2 className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:6}}>פוסטים ותבניות</h2>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>תבניות מוכנות בצבעים שלך, העיצובים שלך ופוסטים לשבוע — בלי AI</p>
 </div>

 {aiPostsView==="reels"&&(
 <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
 <button onClick={()=>setAiPostsView("studio")} className="primary-btn" style={{padding:"8px 20px",fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:"transparent",color:"var(--ink-2)",border:"1px solid var(--line)"}}>← חזרה לפוסטים ותבניות</button>
 </div>
 )}

              {/* Her templates, posts and reels are HER content, even though the
                  studio is reached from inside the Kalmea-chrome dashboard -
                  Stage 2 of the rebrand fixed `pc`/`pcGrad` above to Kalmea
                  green, so without this local override DesignStudio would
                  inherit that instead of her real accent. It has no scoping
                  of its own (just raw var(--pc) reads), relying entirely on
                  whatever this div sets. */}
              {aiPostsView==="studio"&&(
 <div style={accentStyle(herAccent)}>
 <DesignStudio settings={settings} readOnly={readOnly} toast={toast} appointments={appointments} services={services} onOpenScript={()=>setAiPostsView("reels")}/>
 </div>
              )}

 {aiPostsView==="reels"&&(<>
 <div className="glass-card" style={{padding:"22px 24px",marginBottom:18}}>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:8}}>על מה הרילס?</p>
 <textarea value={reelTopic} onChange={e=>setReelTopic(e.target.value)} rows={3}
 placeholder="לדוגמה: טיפול פנים לכלות / 3 טיפים לעור זוהר / למה כדאי לעשות פילינג באביב"
 style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-md)",padding:"12px 14px",fontSize:"var(--t-md)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:12}}/>
 {/* Length + vibe. Chips rather than selects: two taps on a phone, and the
     values are exactly the whitelists /api/marketing/reel accepts. */}
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:6}}>אורך</p>
 <div style={{display:"flex",gap:6,marginBottom:12}}>
 {[["15","15 שניות"],["30","30 שניות"],["60","60 שניות"]].map(([v,label])=>(
 <button key={v} type="button" onClick={()=>setReelDuration(v)} style={{flex:1,padding:"8px 0",borderRadius:"var(--r-full)",fontSize:"var(--t-sm)",fontWeight:600,fontFamily:"inherit",cursor:"pointer",border:reelDuration===v?"none":"1px solid var(--line-2)",background:reelDuration===v?pcGrad:"var(--surface-2)",color:reelDuration===v?"var(--pc-contrast)":"var(--ink-2)"}}>{label}</button>
 ))}
 </div>
 <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",fontWeight:600,marginBottom:6}}>ווייב <span style={{fontWeight:400}}>(לא חובה)</span></p>
 <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
 {["רגוע ומפנק","אנרגטי וקצבי","חם ואישי","מקצועי ומסביר","כיפי וצעיר"].map(v=>(
 <button key={v} type="button" onClick={()=>setReelVibe(reelVibe===v?"":v)} style={{padding:"7px 13px",borderRadius:"var(--r-full)",fontSize:"var(--t-sm)",fontWeight:600,fontFamily:"inherit",cursor:"pointer",border:reelVibe===v?"none":"1px solid var(--line-2)",background:reelVibe===v?pcGrad:"var(--surface-2)",color:reelVibe===v?"var(--pc-contrast)":"var(--ink-2)"}}>{v}</button>
 ))}
 </div>
 <button onClick={generateReel} disabled={reelLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)"}}>
 {reelLoading?<Spinner inline label="יוצרת רילס"/>:<><Icon name="film" size={14}/> צרי לי רילס</>}
 </button>
 </div>

 {reelError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:"var(--r-md)",padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:"var(--t-sm)",color:pc,fontWeight:600}}>{reelError}</p>
 </div>
 )}

 {reelLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:"var(--t-md)",color:pc,fontWeight:500}}>ה-AI כותב לך תסריט, הוראות צילום והכל... רגע אחד 🎬</p>
 </div>
 )}

 {reelData&&!reelLoading&&(<div className="fade-in">
 <div style={{background:pcGrad,borderRadius:"var(--r-lg)",padding:"20px 22px",marginBottom:14,color:"var(--pc-contrast)",textAlign:"center"}}>
 <p style={{fontSize:"var(--t-sm)",opacity:0.85,fontWeight:600,marginBottom:4}}>כותרת לכריכה</p>
 <p className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:700,marginBottom:8}}>{reelData.cover_title}</p>
 <p style={{fontSize:"var(--t-sm)",opacity:0.95}}>{reelData.hook}</p>
 </div>

 <button onClick={()=>{
   const lines=[];
   if(reelData.cover_title)lines.push("כותרת: "+reelData.cover_title);
   if(reelData.hook)lines.push("פתיחה: "+reelData.hook);
   lines.push("");
   (reelData.scenes||[]).forEach((sc,i)=>{
     lines.push("סצנה "+(sc.scene_number||i+1)+(sc.seconds?" ("+sc.seconds+" שניות)":""));
     if(sc.spoken)lines.push("🗣️ "+sc.spoken);
     if(sc.on_screen_text)lines.push("📱 "+sc.on_screen_text);
     if(sc.filming)lines.push("🎥 "+sc.filming);
     lines.push("");
   });
   if(reelData.call_to_action)lines.push("📣 "+reelData.call_to_action);
   if(reelData.caption)lines.push("","תיאור: "+reelData.caption);
   if(reelData.hashtags&&reelData.hashtags.length>0)lines.push(reelData.hashtags.join(" "));
   if(reelData.music_vibe)lines.push("","🎵 "+reelData.music_vibe);
   navigator.clipboard.writeText(lines.join("\n")).then(()=>toast("הרילס המלא הועתק")).catch(()=>toast("ההעתקה לא הצליחה, אפשר לסמן ולהעתיק ידנית","error"));
 }} className="primary-btn" style={{width:"100%",padding:"11px 0",background:"var(--surface)",color:pc,border:`1.5px solid ${pc}`,fontSize:"var(--t-sm)",marginBottom:14}}><Icon name="copy" size={14}/> העתיקי את כל הרילס</button>

 {reelData.scenes&&reelData.scenes.length>0&&reelData.scenes.map((sc,i)=>(
 <div key={i} style={{background:"var(--surface)",borderRadius:"var(--r-md)",border:"1px solid var(--line)",padding:"16px 18px",marginBottom:10,position:"relative",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
 <div style={{position:"absolute",top:0,right:0,width:4,bottom:0,background:pcGrad}}/>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
 <span className="serif" style={{fontSize:"var(--t-xl)",fontWeight:700,color:pc}}>{sc.scene_number||i+1}</span>
 <span className="pill" style={{fontSize:"var(--t-sm)",background:"var(--pc-tint)",color:pcDeep,padding:"3px 10px"}}>סצנה{sc.seconds?` · ${sc.seconds} שניות`:""}</span>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:2}}><Icon name="mic" size={13}/> מה אומרים</p>
 <p style={{fontSize:"var(--t-md)",color:"var(--ink)",lineHeight:1.6,marginBottom:8}}>{sc.spoken}</p>
 {sc.on_screen_text&&(<><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:2}}><Icon name="phone" size={13}/> טקסט על המסך</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.5,marginBottom:8}}>{sc.on_screen_text}</p></>)}
 {sc.filming&&(<><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:2}}><Icon name="camera" size={13}/> איך לצלם</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5}}>{sc.filming}</p></>)}
 </div>
 ))}

 {reelData.call_to_action&&(<div style={{background:"var(--pc-tint)",borderRadius:"var(--r-md)",padding:"14px 18px",marginBottom:10}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:3}}><Icon name="megaphone" size={13}/> קריאה לפעולה (בסוף הרילס)</p><p style={{fontSize:"var(--t-md)",color:pcDeep,fontWeight:600}}>{reelData.call_to_action}</p></div>)}

 {reelData.caption&&(<div style={{background:"var(--surface)",borderRadius:"var(--r-md)",border:"1px solid var(--line)",padding:"14px 18px",marginBottom:10,boxShadow:"var(--shadow-sm)"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}><Icon name="pen" size={13}/> תיאור לפוסט</p><button onClick={()=>{navigator.clipboard.writeText(`${reelData.caption}\n\n${(reelData.hashtags||[]).join(" ")}`).then(()=>toast("התיאור הועתק")).catch(()=>toast("ההעתקה לא הצליחה, אפשר לסמן ולהעתיק ידנית","error"));}} className="primary-btn" style={{padding:"4px 12px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>העתיקי</button></div><p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{reelData.caption}</p>{reelData.hashtags&&reelData.hashtags.length>0&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-3)",marginTop:8}}>{reelData.hashtags.join(" ")}</p>}</div>)}

 {reelData.music_vibe&&(<div style={{background:"var(--surface)",borderRadius:"var(--r-md)",border:"1px solid var(--line)",padding:"12px 18px",marginBottom:10,boxShadow:"var(--shadow-sm)"}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:2}}><Icon name="music" size={13}/> סגנון מוזיקה מומלץ</p><p style={{fontSize:"var(--t-sm)",color:"var(--ink)"}}>{reelData.music_vibe}</p></div>)}

 {/* The studio, inline, directly under the script that feeds it.
     It once lived at /dashboard/reel-studio, which nothing in the app ever
     linked to - so the half that turns a script into a file was unreachable
     unless you typed the URL. Rendering it here fixed that and the handoff at
     the same time: reelData is right there in state, so the script never has
     to survive a route change or be persisted to be passed along. The old
     page was deleted in the truth pass; this is the studio's only home. */}
 </div>)}
 {/* cesdk-poc: on the reels view whether or not a script has been generated - the POC does not need one */}
 {CESDK_POC && <CesdkReelPoc settings={settings}/>}
 </>)}
 </>)}
 </div>
 </>
  );
}

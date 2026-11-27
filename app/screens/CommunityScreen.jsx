"use client";
// app/screens/CommunityScreen.jsx — the "community" tab of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one `ctx` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <CommunityScreen> in app/beautyos.jsx (the check fails until both sides agree).
import { parseDb } from "@/lib/dbTime";
import { tr, trv } from "@/lib/i18n/tr";

export default function CommunityScreen({ ctx }) {
  const {
    communityLoading, communityPosts, copyPublicLink, deleteCommunityPost, pc, pcDeep, pcGrad, setNewPost,
    setShowPostModal,
  } = ctx;
  return (
    /* @screen-body */<>
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>{tr("מרחב לקוחות")}</p>
 <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{tr("מרחב הלקוחות")}</h2>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:2}}>{tr("פרסמי עדכונים, מבצעים וטיפים, הלקוחות שלך רואות הכל במקום אחד.")}</p>
 </div>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>copyPublicLink("community")} style={{padding:"9px 15px",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>{tr("העתקת קישור לקהילה")}</button>
 <button onClick={()=>{setNewPost({title:"",body:"",post_type:"update",cta_label:"",image_url:""});setShowPostModal(true);}} className="primary-btn" style={{padding:"10px 16px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("+ פוסט חדש")}</button>
 </div>
 </div>

 {communityLoading?(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {[0,1].map(i=><div key={i} style={{background:"var(--surface)",borderRadius:"var(--r-lg)",overflow:"hidden",border:"1px solid var(--line)",boxShadow:"var(--shadow-sm)"}}><div className="skel" style={{width:"100%",height:150,borderRadius:0}}/><div style={{padding:"14px 16px"}}><div className="skel" style={{width:90,height:14,marginBottom:9}}/><div className="skel" style={{width:"60%",height:16,marginBottom:7}}/><div className="skel" style={{width:"100%",height:12,marginBottom:5}}/><div className="skel" style={{width:"80%",height:12}}/></div></div>)}
 </div>
 )
 :communityPosts.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:"var(--r-xl)",marginTop:14}}>
 <div style={{width:60,height:60,borderRadius:"var(--r-lg)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface)",color:pc,boxShadow:"var(--shadow-md)"}}><svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M20.5 15.2a2.3 2.3 0 0 1-2.3 2.3H7.9L3.5 21V5.6a2.3 2.3 0 0 1 2.3-2.3h12.4a2.3 2.3 0 0 1 2.3 2.3z"/><path d="M8.2 8.6h7.6M8.2 12.2h5"/></svg></div>
 <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:5}}>{tr("עוד אין פוסטים")}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",maxWidth:360,margin:"0 auto",lineHeight:1.6}}>{tr("פרסמי את הפוסט הראשון (מבצע, טיפ או עדכון), והלקוחות שלך יראו אותו במרחב הלקוחות.")}</p>
 <button className="empty-cta" onClick={()=>{setNewPost({title:"",body:"",post_type:"update",cta_label:"",image_url:""});setShowPostModal(true);}} style={{marginTop:16,background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-xl)",padding:"11px 22px",fontSize:"var(--t-sm)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{tr("כתיבת הפוסט הראשון")}</button>
 </div>
 ):(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {communityPosts.map(p=>(
 <div key={p.id} className="glass-card card-flush">
 {p.image_url&&<img alt="" loading="lazy" decoding="async" src={p.image_url} style={{width:"100%",maxHeight:280,objectFit:"cover",objectPosition:"center",display:"block"}}/>}
 <div style={{padding:"14px 16px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
 <span className="pill" style={{fontSize:"var(--t-sm)",color:"var(--surface)",background:p.post_type==="offer"?pc:p.post_type==="tip"?"var(--success)":"var(--ink-3)",padding:"3px 10px"}}>{p.post_type==="offer"?tr("מבצע"):p.post_type==="tip"?tr("טיפ"):tr("עדכון")}</span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{parseDb(p.created_at).toLocaleDateString("he-IL")}</span>
 </div>
 {p.title&&<p style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",marginBottom:4}}>{trv(p.title)}</p>}
 {p.body&&<p style={{fontSize:"var(--t-sm)",color:"var(--ink)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{trv(p.body)}</p>}
 {p.cta_label&&<div style={{marginTop:10}}><span style={{display:"inline-block",padding:"7px 16px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-xs)",fontWeight:600,borderRadius:"var(--r-lg)"}}>{p.cta_label}</span></div>}
 <div style={{display:"flex",justifyContent:"flex-start",marginTop:10}}>
 <button onClick={()=>deleteCommunityPost(p)} style={{background:"none",border:"none",color:"var(--ink-3)",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit"}}>{tr("מחיקה")}</button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </>/* @screen-end */
  );
}

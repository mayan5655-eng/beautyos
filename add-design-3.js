const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) Add the "design as image" button next to the existing copy-text button
const btnAnchor = `<button onClick={()=>copyPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#fff",color:pc,border:"1px solid #EFE7EB",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת טקסט</button>`;
const btnNew = btnAnchor + `
                            <button onClick={()=>setDesignPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:pcGrad,color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🎨 עצבי כתמונה</button>`;
if (s.includes(btnAnchor) && !s.includes("עצבי כתמונה")) { s = s.replace(btnAnchor, btnNew); log.push("1 button: OK"); }
else log.push("1 button: SKIP/NOT FOUND");

// 2) Add the design modal (with the styled template) before the protocol modal
const modalAnchor = `      {showProtocolModal&&(`;
const designModal = `      {designPost&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14,overflowY:"auto"}} onClick={()=>setDesignPost(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:420,width:"100%"}}>
            <div id="post-design" style={{width:380,height:380,marginLeft:"auto",marginRight:"auto",background:pcGrad,borderRadius:0,padding:34,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:18,right:22,fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:600,letterSpacing:"1px"}}>{settings.business_name||"BeautyOS"}</div>
              {designPost.title&&<div className="serif" style={{fontSize:26,fontWeight:700,color:"#fff",lineHeight:1.25,marginBottom:14,textShadow:"0 1px 6px rgba(0,0,0,0.18)"}}>{designPost.title}</div>}
              <div style={{fontSize:14,color:"#fff",lineHeight:1.6,whiteSpace:"pre-wrap",textShadow:"0 1px 4px rgba(0,0,0,0.15)",maxHeight:170,overflow:"hidden"}}>{designPost.body}</div>
              {designPost.callToAction&&<div style={{marginTop:16,display:"inline-block",alignSelf:"flex-start",background:"#fff",color:"#3A2A30",fontSize:12.5,fontWeight:700,padding:"8px 18px",borderRadius:30}}>{designPost.callToAction}</div>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:14,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <button onClick={()=>setDesignPost(null)} style={{flex:1,padding:"12px 0",background:"#fff",color:"#6B6B6B",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>סגירה</button>
              <button onClick={downloadPostImage} disabled={designing} style={{flex:2,padding:"12px 0",background:"#2A2A2A",color:"#fff",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:designing?0.6:1}}>{designing?"מייצר...":"⬇ הורדת תמונה"}</button>
            </div>
          </div>
        </div>
      )}

      {showProtocolModal&&(`;
if (s.includes(modalAnchor) && !s.includes('id="post-design"')) { s = s.replace(modalAnchor, designModal); log.push("2 modal: OK"); }
else log.push("2 modal: SKIP/NOT FOUND");

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));

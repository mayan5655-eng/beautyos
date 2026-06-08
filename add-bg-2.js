const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 1) Make the template use the uploaded image as background (with dark overlay) when present
const tpl1 = `            <div id="post-design" style={{width:380,height:380,marginLeft:"auto",marginRight:"auto",background:pcGrad,borderRadius:0,padding:34,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}}>`;
const tpl2 = `            <div id="post-design" style={{width:380,height:380,marginLeft:"auto",marginRight:"auto",background:designBg?"#000":pcGrad,borderRadius:0,padding:34,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              {designBg&&<img alt="" src={designBg} crossOrigin="anonymous" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
              {designBg&&<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.55))"}}/>}`;
if (s.includes(tpl1) && !s.includes("designBg?")) { s = s.replace(tpl1, tpl2); log.push("1 template bg: OK"); }
else log.push("1 template bg: SKIP/NOT FOUND");

// 2) Add upload + reset buttons above the close/download row
const rowAnchor = `            <div style={{display:"flex",gap:8,marginTop:14,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <button onClick={()=>setDesignPost(null)}`;
const rowNew = `            <div style={{display:"flex",gap:8,marginTop:10,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <label style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.92)",color:"#3A2A30",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                📷 העלאת תמונת רקע
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f){const r=new FileReader();r.onload=()=>setDesignBg(r.result);r.readAsDataURL(f);}}}/>
              </label>
              {designBg&&<button onClick={()=>setDesignBg(null)} style={{flex:"0 0 auto",padding:"10px 14px",background:"rgba(255,255,255,0.92)",color:"#D96A6A",border:"none",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הסרה</button>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <button onClick={()=>{setDesignPost(null);setDesignBg(null);}}`;
if (s.includes(rowAnchor) && !s.includes("העלאת תמונת רקע")) { s = s.replace(rowAnchor, rowNew); log.push("2 upload button: OK"); }
else log.push("2 upload button: SKIP/NOT FOUND");

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));

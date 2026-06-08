const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");

const anchor = `      {showWaitlistModal&&(`;
const modal = `      {showProtocolModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowProtocolModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,padding:20,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"#2A2A2A",marginBottom:14}}>פרוטוקול חדש</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input value={newProtocol.brand} onChange={e=>setNewProtocol({...newProtocol,brand:e.target.value})} placeholder="מותג *" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.name} onChange={e=>setNewProtocol({...newProtocol,name:e.target.value})} placeholder="שם הפרוטוקול *" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.concern} onChange={e=>setNewProtocol({...newProtocol,concern:e.target.value})} placeholder="בעיה שהפרוטוקול פותר (אקנה, אנטי-אייג׳ינג...)" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <input value={newProtocol.frequency} onChange={e=>setNewProtocol({...newProtocol,frequency:e.target.value})} placeholder="תדירות (למשל: אחת לשבועיים)" style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>מספר מפגשים</p><input type="number" value={newProtocol.sessions_count} onChange={e=>setNewProtocol({...newProtocol,sessions_count:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>זמן (דקות)</p><input type="number" value={newProtocol.duration_minutes} onChange={e=>setNewProtocol({...newProtocol,duration_minutes:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"#8A8088",marginBottom:3}}>מחיר ₪</p><input type="number" value={newProtocol.price} onChange={e=>setNewProtocol({...newProtocol,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
              </div>
              <textarea value={newProtocol.notes} onChange={e=>setNewProtocol({...newProtocol,notes:e.target.value})} placeholder="הערות / התוויות נגד" rows={2} style={{width:"100%",border:"1px solid #EFE7EB",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setShowProtocolModal(false)} style={{flex:1,padding:"11px 0",background:"#fff",color:"#6B6B6B",border:"1px solid #EFE7EB",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
                <button onClick={handleSaveProtocol} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"#fff",fontSize:12}}>שמירה ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWaitlistModal&&(`;
if (s.includes(anchor) && !s.includes("showProtocolModal&&")) { s = s.replace(anchor, modal); console.log("4 modal: OK"); }
else console.log("4 modal: SKIP/NOT FOUND");
fs.writeFileSync(p, s, "utf8");

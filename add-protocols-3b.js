const fs = require("fs");
const p = "app/beautyos.jsx";
let s = fs.readFileSync(p, "utf8");
const log = [];

// 3) The PROTOCOLS screen — inserted right before the PACKAGES tab
const anchor = `          {/* PACKAGES */}`;
const screen = `          {/* PROTOCOLS */}
          {activeTab==="protocols"&&(<>
            <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
                <div>
                  <h2 className="serif" style={{fontSize:22,fontWeight:600,color:"#2A2A2A"}}>פרוטוקולי טיפול</h2>
                  <p style={{fontSize:11.5,color:"#8A8088",marginTop:2}}>ספריית הטיפולים שלך לפי מותג ובעיה.</p>
                </div>
                <button onClick={()=>{setNewProtocol(emptyProtocol);setShowProtocolModal(true);}} className="primary-btn" style={{padding:"9px 16px",background:pcGrad,color:"#fff",fontSize:12}}>+ פרוטוקול חדש</button>
              </div>
              {protocolsLoading?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{[0,1,2].map(i=><div key={i} className="skel" style={{width:"100%",height:74,borderRadius:14}}/>)}</div>
              ):protocols.length===0?(
                <div style={{textAlign:"center",padding:"48px 20px",background:"rgba(255,255,255,0.6)",borderRadius:18}}>
                  <div style={{fontSize:34,marginBottom:10}}>📋</div>
                  <p style={{fontSize:14,fontWeight:600,color:"#2A2A2A",marginBottom:5}}>עוד אין פרוטוקולים</p>
                  <p style={{fontSize:11.5,color:"#8A8088"}}>צרי פרוטוקול ראשון כדי לבנות את ספריית הטיפולים שלך.</p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {protocols.map(pr=>(
                    <div key={pr.id} style={{background:"#fff",borderRadius:14,padding:"13px 15px",border:"1px solid #EFE7EB"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                        <div>
                          <span style={{fontSize:9.5,fontWeight:700,color:pc,background:pcTint,padding:"3px 9px",borderRadius:20}}>{pr.brand}</span>
                          <h3 style={{fontSize:14,fontWeight:700,color:"#2A2A2A",marginTop:6}}>{pr.name}</h3>
                          {pr.concern&&<p style={{fontSize:11,color:"#8A8088",marginTop:2}}>{pr.concern}</p>}
                        </div>
                        <div style={{textAlign:"left",fontSize:10,color:"#8A8088"}}>
                          {pr.sessions_count?<div>{pr.sessions_count} מפגשים</div>:null}
                          {pr.price?<div style={{fontWeight:700,color:"#2A2A2A"}}>₪{pr.price}</div>:null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}

`;
if (s.includes(anchor) && !s.includes("פרוטוקולי טיפול")) { s = s.replace(anchor, screen + anchor); log.push("3 screen: OK"); }
else log.push("3 screen: SKIP/NOT FOUND");

fs.writeFileSync(p, s, "utf8");
log.forEach(l => console.log(l));

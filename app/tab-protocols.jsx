"use client";
// app/tab-protocols.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";


export default function ProtocolsTab(props) {
  const {
    emptyProtocol,
    pcDeep,
    pcGrad,
    protocols,
    protocolsLoading,
    setNewProtocol,
    setShowProtocolModal,
  } = props;
  return (
<>
            <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
                <div>
                  <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>ספריית טיפולים</p>
                  <h2 className="serif" style={{fontSize:"var(--t-2xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>פרוטוקולי טיפול</h2>
                  <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:2}}>ספריית הטיפולים שלך לפי מותג ובעיה.</p>
                </div>
                <button onClick={()=>{setNewProtocol(emptyProtocol);setShowProtocolModal(true);}} className="primary-btn" style={{padding:"10px 16px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>+ פרוטוקול חדש</button>
              </div>
              {protocolsLoading?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{[0,1,2].map(i=><div key={i} className="skel" style={{width:"100%",height:74,borderRadius:"var(--r-md)"}}/>)}</div>
              ):protocols.length===0?(
                <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:"var(--r-xl)"}}>
                  <div style={{width:60,height:60,borderRadius:"var(--r-lg)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-3xl)",background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>📋</div>
                  <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink)",marginBottom:5}}>עוד אין פרוטוקולים</p>
                  <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>צרי פרוטוקול ראשון כדי לבנות את ספריית הטיפולים שלך.</p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {protocols.map(pr=>(
                    <div key={pr.id} className="glass-card" style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                        <div>
                          <span className="pill" style={{fontSize:"var(--t-sm)",color:pcDeep,background:"var(--pc-tint)",padding:"3px 10px"}}>{pr.brand}</span>
                          <h3 style={{fontSize:"var(--t-md)",fontWeight:700,color:"var(--ink)",marginTop:6}}>{pr.name}</h3>
                          {pr.concern&&<p style={{fontSize:"var(--t-xs)",color:"var(--ink-2)",marginTop:2}}>{pr.concern}</p>}
                        </div>
                        <div style={{textAlign:"left",fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>
                          {pr.sessions_count?<div>{pr.sessions_count} מפגשים</div>:null}
                          {pr.price?<div style={{fontWeight:700,color:"var(--ink)",fontSize:"var(--t-md)"}}>₪{pr.price}</div>:null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
  );
}

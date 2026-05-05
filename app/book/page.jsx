"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export default function BookPage() {
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState({business_name:"BeautyOS",therapist_name:"רונית",primary_color:"#D4945A",working_hours_start:8,working_hours_end:19});
  const [appointments, setAppointments] = useState([]);
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const now = new Date();
  const pc = settings.primary_color || "#D4945A";

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [sv, st, ap] = await Promise.all([
      supabase.from("service_prices").select("*"),
      supabase.from("settings").select("*"),
      supabase.from("appointments").select("date,hour"),
    ]);
    if (sv.data && sv.data.length > 0) setServices(sv.data.filter(s => s.active !== false));
    if (st.data && st.data.length > 0) setSettings(st.data[0]);
    if (ap.data) setAppointments(ap.data);
    setLoading(false);
  };

  // 14 ימים קדימה
  const availableDates = Array.from({length:14}, (_,i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i + 1);
    return d;
  }).filter(d => d.getDay() !== 6); // ללא שבת

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,"0");
    const d = String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  };

  const getAvailableHours = (date) => {
    const hours = [];
    for (let h = settings.working_hours_start; h < settings.working_hours_end; h++) {
      const taken = appointments.some(a => a.date === formatDate(date) && Number(a.hour) === h);
      if (!taken) hours.push(h);
    }
    return hours;
  };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) { alert("נא למלא שם וטלפון"); return; }
    setSubmitting(true);

    // מצאי או צרי לקוחה
    let clientId = null;
    const { data: existing } = await supabase.from("clients").select("id").eq("phone", phone).single();
    if (existing) {
      clientId = existing.id;
    } else {
      const { data: newClient } = await supabase.from("clients").insert([{
        name, phone, status: "active", notes: notes || ""
      }]).select();
      if (newClient?.[0]) clientId = newClient[0].id;
    }

    const appt = {
      date: formatDate(selectedDate),
      hour: selectedHour,
      name,
      service: selectedService.name,
      duration: selectedService.duration,
      color: selectedService.color || "#F4A7B9",
      price: selectedService.price,
      client_id: clientId,
      client_phone: phone,
      note: notes,
      self_booked: true,
    };

    const { error } = await supabase.from("appointments").insert([appt]);
    if (error) { alert("שגיאה: " + error.message); setSubmitting(false); return; }
    setDone(true);
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Heebo",fontSize:18}}>
      💎 טוען...
    </div>
  );

  if (done) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Heebo",background:"#FAF7F5",padding:24,textAlign:"center"}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:22,fontWeight:800,color:"#2C1A1A",marginBottom:8}}>התור נקבע בהצלחה!</h2>
      <p style={{fontSize:15,color:"#888",marginBottom:4}}>{name}, התור שלך נקבע ל:</p>
      <div style={{background:"#fff",borderRadius:14,padding:"16px 24px",border:"1px solid #EEE8E2",marginTop:8}}>
        <p style={{fontSize:16,fontWeight:700,color:"#2C1A1A"}}>{selectedService?.name}</p>
        <p style={{fontSize:14,color:"#888"}}>
          {selectedDate&&`${DAYS_HE[selectedDate.getDay()]}, ${selectedDate.getDate()} ב${MONTHS_HE[selectedDate.getMonth()]}`}
          {" · "}{selectedHour}:00
        </p>
        <p style={{fontSize:14,color:pc,fontWeight:700,marginTop:4}}>₪{selectedService?.price}</p>
      </div>
      <p style={{fontSize:13,color:"#BBB",marginTop:20}}>נשמח לראות אותך! 💎</p>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:"'Heebo','Assistant',sans-serif",background:"#FAF7F5",minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:"#2C1A1A",padding:"20px 24px",textAlign:"center"}}>
        <p style={{color:"#C4A882",fontSize:12,marginBottom:4}}>קביעת תור אונליין</p>
        <h1 style={{color:"#FAF7F5",fontSize:22,fontWeight:800,margin:0}}>💎 {settings.business_name}</h1>
        <p style={{color:"#C4A882",fontSize:13,marginTop:4}}>{settings.therapist_name}</p>
      </div>

      {/* Progress */}
      <div style={{background:"#fff",padding:"14px 24px",display:"flex",gap:8,justifyContent:"center",borderBottom:"1px solid #EEE8E2"}}>
        {[{n:1,label:"שירות"},{n:2,label:"תאריך"},{n:3,label:"פרטים"}].map(s=>(
          <div key={s.n} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:step>=s.n?pc:"#EEE8E2",color:step>=s.n?"#fff":"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{s.n}</div>
            <span style={{fontSize:12,color:step>=s.n?"#2C1A1A":"#888",fontWeight:step===s.n?700:400}}>{s.label}</span>
            {s.n<3&&<span style={{color:"#EEE8E2",fontSize:16}}>←</span>}
          </div>
        ))}
      </div>

      <div style={{maxWidth:480,margin:"0 auto",padding:"20px 16px"}}>

        {/* שלב 1 — בחירת שירות */}
        {step===1&&(<>
          <h2 style={{fontSize:17,fontWeight:800,color:"#2C1A1A",marginBottom:16,textAlign:"center"}}>איזה שירות תרצי?</h2>
          {services.length===0?<p style={{textAlign:"center",color:"#BBB"}}>אין שירותים זמינים</p>
            :services.map((svc,i)=>(
              <div key={i} onClick={()=>{setSelectedService(svc);setStep(2);}}
                style={{background:"#fff",borderRadius:14,padding:"16px 18px",marginBottom:10,border:`2px solid ${selectedService?.name===svc.name?pc:"#EEE8E2"}`,cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s"}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:svc.color+"66",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💅</div>
                <div style={{flex:1}}>
                  <p style={{fontWeight:700,fontSize:15,color:"#2C1A1A"}}>{svc.name}</p>
                  <p style={{fontSize:12,color:"#888"}}>{svc.duration} דקות</p>
                </div>
                <p style={{fontSize:17,fontWeight:800,color:pc}}>₪{svc.price}</p>
              </div>
            ))}
        </>)}

        {/* שלב 2 — בחירת תאריך ושעה */}
        {step===2&&(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button onClick={()=>setStep(1)} style={{background:"none",border:"1px solid #EEE8E2",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",color:"#888"}}>← חזרה</button>
            <h2 style={{fontSize:16,fontWeight:800,color:"#2C1A1A"}}>בחרי תאריך ושעה</h2>
          </div>

          {/* תאריכים */}
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginBottom:16}}>
            {availableDates.map((d,i)=>{
              const hours = getAvailableHours(d);
              const isSelected = selectedDate&&formatDate(d)===formatDate(selectedDate);
              return(
                <div key={i} onClick={()=>{if(hours.length>0){setSelectedDate(d);setSelectedHour(null);}}}
                  style={{flexShrink:0,background:isSelected?pc:hours.length===0?"#FAF7F5":"#fff",borderRadius:12,padding:"10px 14px",border:`2px solid ${isSelected?pc:hours.length===0?"#EEE8E2":"#EEE8E2"}`,cursor:hours.length===0?"not-allowed":"pointer",textAlign:"center",opacity:hours.length===0?0.4:1,minWidth:70}}>
                  <p style={{fontSize:10,color:isSelected?"#fff":"#888",marginBottom:2}}>{DAYS_HE[d.getDay()]}</p>
                  <p style={{fontSize:18,fontWeight:800,color:isSelected?"#fff":"#2C1A1A"}}>{d.getDate()}</p>
                  <p style={{fontSize:9,color:isSelected?"#fff88":"#888"}}>{MONTHS_HE[d.getMonth()].slice(0,3)}</p>
                  {hours.length>0&&<p style={{fontSize:9,color:isSelected?"#fff":"#4CAF50",marginTop:2}}>{hours.length} פנויות</p>}
                </div>
              );
            })}
          </div>

          {/* שעות */}
          {selectedDate&&(<>
            <h3 style={{fontSize:13,fontWeight:700,color:"#2C1A1A",marginBottom:10}}>
              שעות פנויות — {DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()} ב{MONTHS_HE[selectedDate.getMonth()]}
            </h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
              {getAvailableHours(selectedDate).map(h=>(
                <button key={h} onClick={()=>setSelectedHour(h)}
                  style={{padding:"10px 0",border:"2px solid",borderColor:selectedHour===h?pc:"#EEE8E2",borderRadius:10,background:selectedHour===h?pc:"#fff",color:selectedHour===h?"#fff":"#2C1A1A",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  {String(h).padStart(2,"0")}:00
                </button>
              ))}
              {getAvailableHours(selectedDate).length===0&&<p style={{gridColumn:"1/-1",color:"#BBB",textAlign:"center",fontSize:13}}>אין שעות פנויות ביום זה</p>}
            </div>
            {selectedHour!==null&&(
              <button onClick={()=>setStep(3)} style={{width:"100%",background:pc,color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                המשיכי →
              </button>
            )}
          </>)}
        </>)}

        {/* שלב 3 — פרטים אישיים */}
        {step===3&&(<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button onClick={()=>setStep(2)} style={{background:"none",border:"1px solid #EEE8E2",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",color:"#888"}}>← חזרה</button>
            <h2 style={{fontSize:16,fontWeight:800,color:"#2C1A1A"}}>הפרטים שלך</h2>
          </div>

          {/* סיכום */}
          <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:16,border:`1.5px solid ${pc}44`,background:pc+"11"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#2C1A1A"}}>{selectedService?.name}</p>
            <p style={{fontSize:12,color:"#888"}}>
              {selectedDate&&`${DAYS_HE[selectedDate.getDay()]} ${selectedDate.getDate()} ב${MONTHS_HE[selectedDate.getMonth()]}`}
              {" · "}{selectedHour}:00 · {selectedService?.duration} דקות
            </p>
            <p style={{fontSize:14,fontWeight:700,color:pc,marginTop:4}}>₪{selectedService?.price}</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="שם מלא *"
              style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:10,padding:"12px 14px",fontSize:14,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}/>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="טלפון *" type="tel"
              style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:10,padding:"12px 14px",fontSize:14,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff"}}/>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="הערות (אופציונלי)" rows={3}
              style={{width:"100%",border:"1.5px solid #EEE8E2",borderRadius:10,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#fff",resize:"none"}}/>
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            style={{width:"100%",background:pc,color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:16,opacity:submitting?0.7:1}}>
            {submitting?"שולחת...":"קבעי תור ✓"}
          </button>

          <p style={{fontSize:11,color:"#BBB",textAlign:"center",marginTop:12}}>
            בלחיצה על קבעי תור את מאשרת את פרטי ההזמנה
          </p>
        </>)}
      </div>
    </div>
  );
}

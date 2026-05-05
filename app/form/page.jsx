"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const FORMS = {
  "general": {
    title: "הצהרת בריאות כללית",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך מחלות עור (פסוריאזיס, אקזמה, רוזציאה)?",
      "האם יש לך אלרגיות ידועות לקוסמטיקה?",
      "האם את סובלת מסוכרת?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם עברת ניתוחים באזור הפנים בשנה האחרונה?",
      "האם יש לך בעיות לב או לחץ דם גבוה?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך ממסים מתכתיים או שתלים בגוף?",
    ]
  },
  "plasma": {
    title: "הצהרת בריאות — טיפול פלזמה",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך קוצב לב או שתל מתכתי?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך בעיות קרישת דם?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך פצעים פתוחים או דלקות עור פעילות באזור הטיפול?",
      "האם יש לך הרפס חוזר באזור הטיפול?",
      "האם את סובלת מסוכרת?",
      "האם עברת טיפול פלזמה בחודש האחרון?",
      "האם יש לך רגישות יתר לחום?",
    ]
  },
  "device": {
    title: "הצהרת בריאות — טיפול במכשור מתקדם",
    questions: [
      "האם את בהריון או מניקה?",
      "האם יש לך קוצב לב או דפיברילטור?",
      "האם יש לך שתלים מתכתיים באזור הטיפול?",
      "האם את סובלת מאפילפסיה?",
      "האם יש לך בעיות לב או לחץ דם?",
      "האם את סובלת מסרטן פעיל?",
      "האם יש לך בעיות קרישת דם?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך פצעים פתוחים באזור הטיפול?",
      "האם עברת ניתוח בשנה האחרונה באזור הטיפול?",
    ]
  },
  "laser": {
    title: "הצהרת בריאות — הסרת שיער בלייזר",
    questions: [
      "האם את בהריון או מניקה?",
      "האם את נוטלת תרופות פוטוסנסיטיביות (מינוציקלין, טטרציקלין)?",
      "האם את נוטלת רואקוטן? (אם כן, האם עצרת לפני 6 חודשים?)",
      "האם יש לך קעקועים באזור הטיפול?",
      "האם היית חשופה לשמש עזה בשבועיים האחרונים?",
      "האם יש לך הרפס חוזר באזור הטיפול?",
      "האם עברת טיפול לייזר בחודש האחרון?",
      "האם יש לך מחלות עור פעילות באזור הטיפול?",
      "האם את סובלת מסוכרת?",
      "האם יש לך נטייה להיצטלקות (קלואידים)?",
    ]
  },
  "peel": {
    title: "הצהרת בריאות — טיפול פילינג",
    questions: [
      "האם את בהריון או מניקה?",
      "האם את נוטלת רואקוטן?",
      "האם יש לך פצעים פתוחים או דלקות עור פעילות?",
      "האם היית חשופה לשמש עזה בשבוע האחרון?",
      "האם יש לך אלרגיה לחומצות (AHA/BHA/TCA)?",
      "האם עברת פילינג בחודש האחרון?",
      "האם יש לך הרפס חוזר בפנים?",
      "האם את נוטלת תרופות מדללות דם?",
      "האם יש לך נטייה להיצטלקות?",
    ]
  }
};

export default function FormPage() {
  const [formId, setFormId] = useState(null);
  const [formData, setFormData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [signed, setSigned] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef(null);
  const lastPos = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    setFormId(id);
    if (id) loadForm(id);
  }, []);

  const loadForm = async (id) => {
    const { data } = await supabase.from("forms").select("*").eq("id", id).single();
    if (data) setFormData(data);
    setLoading(false);
  };

  const formTemplate = formData ? FORMS[formData.form_type] : null;

  const startDraw = (e) => {
    setDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    lastPos.current = {x, y};
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#2C1A1A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = {x, y};
    setSigned(true);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  };

  const handleSubmit = async () => {
    if (!signed) { alert("נא לחתום לפני השליחה"); return; }
    const unanswered = formTemplate.questions.filter((_,i) => !answers[i]);
    if (unanswered.length > 0) { alert("נא לענות על כל השאלות"); return; }
    const canvas = canvasRef.current;
    const signature = canvas.toDataURL();
    const { error } = await supabase.from("forms").update({
      form_data: answers,
      signature,
      signed_at: new Date().toISOString(),
      status: "signed"
    }).eq("id", formId);
    if (error) { alert("שגיאה: " + error.message); return; }
    setSubmitted(true);
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:18,fontFamily:"Heebo"}}>
      💎 טוען טופס...
    </div>
  );

  if (!formData || !formTemplate) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:18,fontFamily:"Heebo"}}>
      הטופס לא נמצא
    </div>
  );

  if (submitted) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Heebo",background:"#FAF7F5",padding:24}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:22,fontWeight:800,color:"#2C1A1A",marginBottom:8}}>הטופס נחתם בהצלחה!</h2>
      <p style={{fontSize:14,color:"#888"}}>תודה {formData.client_name}, הטופס נשמר בכרטיס שלך</p>
    </div>
  );

  if (formData.status === "signed") return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Heebo",background:"#FAF7F5",padding:24}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:22,fontWeight:800,color:"#2C1A1A"}}>הטופס כבר נחתם</h2>
    </div>
  );

  const answeredCount = formTemplate.questions.filter((_,i) => answers[i]).length;
  const progress = Math.round((answeredCount / formTemplate.questions.length) * 100);

  return (
    <div dir="rtl" style={{fontFamily:"'Heebo','Assistant',sans-serif",background:"#FAF7F5",minHeight:"100vh",padding:"24px 16px"}}>
      <div style={{maxWidth:500,margin:"0 auto"}}>

        <div style={{background:"#2C1A1A",borderRadius:16,padding:"20px 24px",marginBottom:20,textAlign:"center"}}>
          <div style={{fontSize:22,marginBottom:4}}>💎</div>
          <h1 style={{color:"#FAF7F5",fontSize:18,fontWeight:800,margin:0}}>{formTemplate.title}</h1>
          <p style={{color:"#C4A882",fontSize:13,marginTop:4}}>שלום {formData.client_name} 👋</p>
        </div>

        <div style={{background:"#fff",borderRadius:12,padding:"10px 16px",marginBottom:16,border:"1px solid #EEE8E2"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#888",marginBottom:6}}>
            <span>התקדמות</span>
            <span>{answeredCount}/{formTemplate.questions.length} שאלות</span>
          </div>
          <div style={{background:"#EEE8E2",borderRadius:10,height:8}}>
            <div style={{background:"#D4945A",borderRadius:10,height:8,width:`${progress}%`,transition:"width 0.3s"}}/>
          </div>
        </div>

        <div style={{background:"#FFF5F0",border:"1px solid #FFDAC1",borderRadius:12,padding:"12px 16px",marginBottom:20,fontSize:13,color:"#2C1A1A"}}>
          ⚠️ נא לענות בכנות על כל השאלות. המידע חסוי ומיועד לצורכי הטיפול בלבד.
        </div>

        <div style={{background:"#fff",borderRadius:16,padding:24,marginBottom:20,border:"1px solid #EEE8E2"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"#2C1A1A",marginBottom:16}}>שאלות רפואיות</h3>
          {formTemplate.questions.map((q, i) => (
            <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<formTemplate.questions.length-1?"1px solid #F0EAE6":"none"}}>
              <p style={{fontSize:14,color:"#2C1A1A",marginBottom:8,lineHeight:1.5}}>{i+1}. {q}</p>
              <div style={{display:"flex",gap:8}}>
                {["כן","לא"].map(ans => (
                  <button key={ans} onClick={()=>setAnswers({...answers,[i]:ans})}
                    style={{flex:1,padding:"10px",border:"1.5px solid",borderColor:answers[i]===ans?"#2C1A1A":"#EEE8E2",borderRadius:10,background:answers[i]===ans?(ans==="כן"?"#F4A7B9":"#B5EAD7"):"#FAF7F5",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                    {ans==="כן"?"✓ כן":"✗ לא"}
                  </button>
                ))}
              </div>
              {answers[i]==="כן" && (
                <textarea onChange={e=>setAnswers({...answers,[`${i}_note`]:e.target.value})}
                  placeholder="פרטים נוספים..." rows={2}
                  style={{width:"100%",marginTop:8,border:"1.5px solid #F4A7B9",borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"#FFF5F7",resize:"none"}}/>
              )}
            </div>
          ))}
        </div>

        <div style={{background:"#fff",borderRadius:16,padding:24,marginBottom:20,border:"1px solid #EEE8E2"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"#2C1A1A",marginBottom:4}}>✍️ חתימה דיגיטלית</h3>
          <p style={{fontSize:12,color:"#888",marginBottom:12}}>חתמי באצבע או בעכבר בתוך המסגרת</p>
          <canvas ref={canvasRef} width={460} height={130}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={()=>setDrawing(false)}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={()=>setDrawing(false)}
            style={{width:"100%",height:130,border:"1.5px solid #EEE8E2",borderRadius:10,background:"#FAF7F5",cursor:"crosshair",touchAction:"none",display:"block"}}/>
          <button onClick={clearSignature}
            style={{marginTop:8,background:"none",border:"none",fontSize:12,color:"#888",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
            מחקי חתימה
          </button>
        </div>

        <div style={{background:"#FAF7F5",borderRadius:12,padding:"12px 16px",marginBottom:20,fontSize:11,color:"#888",textAlign:"center",lineHeight:1.6}}>
          בחתימתי אני מאשרת שקראתי את השאלות, עניתי עליהן בכנות,<br/>
          והמידע שמסרתי נכון ומדויק. אני מסכימה לקבלת הטיפול.
        </div>

        <button onClick={handleSubmit}
          style={{width:"100%",background:"#D4945A",color:"#fff",border:"none",borderRadius:12,padding:"16px",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:40,boxShadow:"0 4px 12px rgba(212,148,90,0.3)"}}>
          שליחה וחתימה ✓
        </button>
      </div>
    </div>
  );
}

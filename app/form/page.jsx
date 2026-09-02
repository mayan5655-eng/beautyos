"use client";
import { useState, useEffect, useRef } from "react";

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
  const [submitting, setSubmitting] = useState(false);
  // null | "notfound" | "failed". The distinction is the whole point: this page
  // used to collapse every failure into "the form does not exist".
  const [loadError, setLoadError] = useState(null);
  const [drawing, setDrawing] = useState(false);
  // The only native alert() left in the product lived here. On a phone it is a
  // system dialog over a page she is halfway through, it cannot be styled, it
  // is not RTL, and dismissing it leaves her with no record of what was wrong.
  // This banner sits above the submit button where the problem is.
  const [submitError, setSubmitError] = useState("");
  const canvasRef = useRef(null);
  const lastPos = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    setFormId(id);
    if (id) {
      loadForm(id);
    } else {
      // A link with no ?id= used to leave loading = true forever, so the page
      // spun on "loading form..." with nothing ever arriving.
      setLoadError("notfound");
      setLoading(false);
    }
  }, []);

  // Reads through the server, NOT straight from the table.
  //
  // This was supabase.from("forms").select("*") on the ANON key. RLS denies anon
  // on forms, so it returned ZERO ROWS to every real client - as data, not as an
  // error - and the page then told her the form did not exist. /api/forms does
  // the read on the service role and returns only client_name, form_type and
  // status: never form_data or signature, which are her health answers.
  const loadForm = async (id) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/forms?id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success && data.form) {
        setFormData(data.form);
      } else if (data && data.notFound) {
        setLoadError("notfound");   // genuinely missing
      } else {
        setLoadError("failed");     // could not find out - NOT the same thing
      }
    } catch {
      setLoadError("failed");
    } finally {
      setLoading(false);
    }
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
    ctx.strokeStyle = "var(--ink, #2A2233)";
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
    setSubmitError("");
    if (!signed) { setSubmitError("נא לחתום לפני השליחה"); return; }
    const unanswered = formTemplate.questions.filter((_,i) => !answers[i]);
    if (unanswered.length > 0) {
      setSubmitError(unanswered.length === 1
        ? "נשארה שאלה אחת בלי תשובה"
        : `נשארו ${unanswered.length} שאלות בלי תשובה`);
      return;
    }
    if (submitting) return;
    const canvas = canvasRef.current;
    const signature = canvas.toDataURL();
    setSubmitting(true);
    // Signs through the server. The direct .update() this replaces was blocked
    // by RLS for anon, so signing never actually worked. The route also refuses
    // to overwrite an already-signed form: that row is a legal record of what
    // she declared before treatment, and the link is a bearer URL that lives on
    // in a WhatsApp history.
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: formId, answers, signature }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success) {
        if (data.state === "already-signed") {
          // Route to the existing "already signed" screen rather than claiming
          // this submission is what signed it.
          setFormData((prev) => (prev ? { ...prev, status: "signed" } : prev));
        } else {
          setSubmitted(true);
        }
        return;
      }
      setSubmitError((data && data.error) || "לא הצלחנו לשמור את הטופס. נסי שוב.");
    } catch {
      setSubmitError("לא הצלחנו לשמור את הטופס. בדקי את החיבור ונסי שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",fontSize:18,fontFamily:"Heebo"}}>
      💎 טוען טופס...
    </div>
  );

  // THREE distinct outcomes, previously all one "form not found" screen.
  // Conflating "could not load" with "does not exist" is what made this page's
  // failure invisible for months.
  if (loadError === "failed") return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FEFAF7)",padding:24,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:14}}>⚠️</div>
      <h2 style={{fontSize:20,fontWeight:800,color:"var(--ink, #2A2233)",marginBottom:8}}>לא הצלחנו לטעון את הטופס</h2>
      <p style={{fontSize:14,color:"var(--brand-muted, #98879B)",marginBottom:20,maxWidth:320,lineHeight:1.7}}>
        הטופס קיים, פשוט לא הצלחנו להביא אותו כרגע. אפשר לנסות שוב.
      </p>
      <button
        type="button"
        onClick={() => formId && loadForm(formId)}
        style={{padding:"12px 28px",borderRadius:999,border:"none",background:"var(--ink, #2A2233)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
      >
        נסי שוב
      </button>
    </div>
  );

  if (loadError === "notfound" || !formData) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",fontSize:18,fontFamily:"Heebo"}}>
      הטופס לא נמצא
    </div>
  );

  // The form exists but its form_type matches no template. A real data problem,
  // and NOT the same as a missing form - saying "not found" here sends her
  // chasing a link that is perfectly fine.
  if (!formTemplate) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FEFAF7)",padding:24,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:14}}>⚠️</div>
      <h2 style={{fontSize:20,fontWeight:800,color:"var(--ink, #2A2233)",marginBottom:8}}>לא הצלחנו להציג את הטופס</h2>
      <p style={{fontSize:14,color:"var(--brand-muted, #98879B)",maxWidth:320,lineHeight:1.7}}>
        סוג הטופס אינו מוכר למערכת. אנא פני לעסק ששלח לך את הקישור.
      </p>
    </div>
  );

  if (submitted) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FEFAF7)",padding:24}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:22,fontWeight:800,color:"var(--ink, #2A2233)",marginBottom:8}}>הטופס נחתם בהצלחה!</h2>
      <p style={{fontSize:14,color:"var(--brand-muted, #98879B)"}}>תודה {formData.client_name}, הטופס נשמר בכרטיס שלך</p>
    </div>
  );

  if (formData.status === "signed") return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FEFAF7)",padding:24}}>
      <div style={{fontSize:60,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:22,fontWeight:800,color:"var(--ink, #2A2233)"}}>הטופס כבר נחתם</h2>
    </div>
  );

  const answeredCount = formTemplate.questions.filter((_,i) => answers[i]).length;
  const progress = Math.round((answeredCount / formTemplate.questions.length) * 100);

  return (
    <div dir="rtl" style={{fontFamily:"'Heebo','Assistant',sans-serif",background:"var(--brand-cream, #FEFAF7)",minHeight:"100dvh",padding:"24px 16px"}}>
      <div style={{maxWidth:500,margin:"0 auto"}}>

        <div style={{background:"var(--ink, #2A2233)",borderRadius:16,padding:"20px 24px",marginBottom:20,textAlign:"center"}}>
          <div style={{fontSize:22,marginBottom:4}}>💎</div>
          <h1 style={{color:"var(--brand-cream, #FEFAF7)",fontSize:18,fontWeight:800,margin:0}}>{formTemplate.title}</h1>
          <p style={{color:"var(--pc-deep, #3E2749)",fontSize:13,marginTop:4}}>שלום {formData.client_name} 👋</p>
        </div>

        <div style={{background:"var(--brand-surface, #FAF6FC)",borderRadius:12,padding:"10px 16px",marginBottom:16,border:"1px solid rgba(74,46,90,0.14)"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--brand-muted, #98879B)",marginBottom:6}}>
            <span>התקדמות</span>
            <span>{answeredCount}/{formTemplate.questions.length} שאלות</span>
          </div>
          <div style={{background:"rgba(74,46,90,0.14)",borderRadius:10,height:8}}>
            <div style={{background:"var(--pc, #4A2E5A)",borderRadius:10,height:8,width:`${progress}%`,transition:"width 0.3s"}}/>
          </div>
        </div>

        <div style={{background:"var(--brand-cream, #FEFAF7)",border:"1px solid var(--warning, #F2B84B)",borderRadius:12,padding:"12px 16px",marginBottom:20,fontSize:13,color:"var(--ink, #2A2233)"}}>
          ⚠️ נא לענות בכנות על כל השאלות. המידע חסוי ומיועד לצורכי הטיפול בלבד.
        </div>

        <div style={{background:"var(--brand-surface, #FAF6FC)",borderRadius:16,padding:24,marginBottom:20,border:"1px solid rgba(74,46,90,0.14)"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"var(--ink, #2A2233)",marginBottom:16}}>שאלות רפואיות</h3>
          {formTemplate.questions.map((q, i) => (
            <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<formTemplate.questions.length-1?"1px solid var(--brand-cream, #FEFAF7)":"none"}}>
              <p style={{fontSize:14,color:"var(--ink, #2A2233)",marginBottom:8,lineHeight:1.5}}>{i+1}. {q}</p>
              <div style={{display:"flex",gap:8}}>
                {["כן","לא"].map(ans => (
                  <button key={ans} onClick={()=>setAnswers({...answers,[i]:ans})}
                    style={{flex:1,padding:"10px",border:"1.5px solid",borderColor:answers[i]===ans?"var(--ink, #2A2233)":"rgba(74,46,90,0.14)",borderRadius:10,background:answers[i]===ans?(ans==="כן"?"var(--pc-tint, #EDE7F0)":"var(--success, #46B37B)"):"var(--brand-cream, #FEFAF7)",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                    {ans==="כן"?"✓ כן":"✗ לא"}
                  </button>
                ))}
              </div>
              {answers[i]==="כן" && (
                <textarea onChange={e=>setAnswers({...answers,[`${i}_note`]:e.target.value})}
                  placeholder="פרטים נוספים..." rows={2}
                  style={{width:"100%",marginTop:8,border:"1.5px solid var(--pc-tint, #EDE7F0)",borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--pc-tint, #EDE7F0)",resize:"none"}}/>
              )}
            </div>
          ))}
        </div>

        <div style={{background:"var(--brand-surface, #FAF6FC)",borderRadius:16,padding:24,marginBottom:20,border:"1px solid rgba(74,46,90,0.14)"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"var(--ink, #2A2233)",marginBottom:4}}>✍️ חתימה דיגיטלית</h3>
          <p style={{fontSize:12,color:"var(--brand-muted, #98879B)",marginBottom:12}}>חתמי באצבע או בעכבר בתוך המסגרת</p>
          <canvas ref={canvasRef} width={460} height={130}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={()=>setDrawing(false)}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={()=>setDrawing(false)}
            style={{width:"100%",height:130,border:"1.5px solid rgba(74,46,90,0.14)",borderRadius:10,background:"var(--brand-cream, #FEFAF7)",cursor:"crosshair",touchAction:"none",display:"block"}}/>
          <button onClick={clearSignature}
            style={{marginTop:8,background:"none",border:"none",fontSize:12,color:"var(--brand-muted, #98879B)",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
            מחקי חתימה
          </button>
        </div>

        <div style={{background:"var(--brand-cream, #FEFAF7)",borderRadius:12,padding:"12px 16px",marginBottom:20,fontSize:11,color:"var(--brand-muted, #98879B)",textAlign:"center",lineHeight:1.6}}>
          בחתימתי אני מאשרת שקראתי את השאלות, עניתי עליהן בכנות,<br/>
          והמידע שמסרתי נכון ומדויק. אני מסכימה לקבלת הטיפול.
        </div>

        {submitError && (
          <div role="alert" style={{background:"#FDEEF2",border:"1px solid var(--danger, #C2557A)",borderRadius:12,padding:"12px 14px",marginBottom:12,fontSize:14,color:"var(--danger, #C2557A)",fontWeight:600,lineHeight:1.6,textAlign:"center"}}>
            {submitError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{width:"100%",background:submitting?"var(--brand-muted, #98879B)":"var(--pc, #4A2E5A)",color:"var(--brand-surface, #FAF6FC)",border:"none",borderRadius:12,padding:"16px",fontSize:16,fontWeight:700,cursor:submitting?"default":"pointer",fontFamily:"inherit",marginBottom:40,boxShadow:"0 4px 12px rgba(212,148,90,0.3)"}}>
          {submitting ? "שולחת…" : "שליחה וחתימה ✓"}
        </button>
      </div>
    </div>
  );
}

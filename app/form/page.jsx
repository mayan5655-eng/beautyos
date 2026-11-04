"use client";
import { useState, useEffect, useRef } from "react";
import Icon from "../Icon";
import Spinner from "../Spinner";
import { accentStyle } from "@/lib/theme";
// The templates live in lib/formTemplates.ts (2026-11-04), shared with the owner's answers view in the client card.
// Every template that was defined here is there word for word under the same key, so a link already sent opens the
// same form, and answers are still keyed by the question's index.
import { templateFor, isSection, normalizeQuestion, isAnswered, missingRequired, progressOf, showsNote, toggleMulti, splitMulti, answersToStore, YES, NO } from "@/lib/formTemplates";

// One look for every answer button: the yes/no pair, the choice chips and the multi chips. 44px tall at least, the
// phone's touch target.
const chipStyle = (selected, { grow = false, yes = false } = {}) => ({
  flex: grow ? 1 : "0 1 auto", minHeight: 44, padding: "10px 14px", border: "1.5px solid",
  borderColor: selected ? "var(--ink, #1F3A30)" : "var(--pc-soft)", borderRadius: "var(--r-sm)",
  background: selected ? (yes ? "var(--pc-tint, #FDF6F6)" : grow ? "var(--success, #46B37B)" : "var(--pc-tint, #FDF6F6)") : "var(--brand-cream, #FBF8F1)",
  color: "var(--ink, #1F3A30)", fontSize: "var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", lineHeight: 1.3,
});
const noteStyle = { width: "100%", marginTop: 8, border: "1.5px solid var(--pc-tint-2)", borderRadius: "var(--r-xs)", padding: "8px 12px", fontSize: "var(--t-md)", fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--pc-tint, #FDF6F6)", resize: "none", boxSizing: "border-box" };
const textStyle = { ...noteStyle, marginTop: 0, minHeight: 44, background: "var(--brand-cream, #FBF8F1)", border: "1.5px solid var(--pc-soft)", fontSize: 16 };

export default function FormPage() {
  const [formId, setFormId] = useState(null);
  const [formData, setFormData] = useState(null);
  // Public branding from /api/forms — logo (never cropped) or name; optional.
  const [brandInfo, setBrandInfo] = useState({ businessName: "", logoUrl: "", primaryColor: "" });
  const [answers, setAnswers] = useState({});
  const [signed, setSigned] = useState(false);
  // Optional and UNCHECKED by default: promotions need an explicit yes (section 30A). Never blocks signing.
  const [marketingOk, setMarketingOk] = useState(false);
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
  // Set by a submit with questions still open: from then on each unanswered required question is outlined.
  const [showMissing, setShowMissing] = useState(false);
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
        setBrandInfo({ businessName: data.businessName || "", logoUrl: data.logoUrl || "", primaryColor: data.primaryColor || "" });
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

  const formTemplate = formData ? templateFor(formData.form_type) : null;

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
    ctx.strokeStyle = "var(--ink, #1F3A30)";
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
    // Only required questions count; a heading or an optional question never blocks signing. The ones still missing
    // are marked where they are, so on a long form she does not have to hunt for them.
    const unanswered = missingRequired(formTemplate, answers);
    if (unanswered.length > 0) {
      setShowMissing(true);
      setSubmitError(unanswered.length === 1
        ? "נשארה שאלה אחת בלי תשובה, היא מסומנת למעלה"
        : `נשארו ${unanswered.length} שאלות בלי תשובה, הן מסומנות למעלה`);
      return;
    }
    if (!signed) { setSubmitError("חסרה חתימה, אפשר לחתום ואז לשלוח"); return; }
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
        body: JSON.stringify({ id: formId, answers: answersToStore(formTemplate, answers), signature, marketingConsent: marketingOk === true }),
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
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",fontSize:"var(--t-xl)",fontFamily:"Heebo"}}>
      <Spinner inline label="טוענת טופס" />
    </div>
  );

  // THREE distinct outcomes, previously all one "form not found" screen.
  // Conflating "could not load" with "does not exist" is what made this page's
  // failure invisible for months.
  if (loadError === "failed") return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FBF8F1)",padding:24,textAlign:"center"}}>
      <div style={{marginBottom:14,color:"var(--danger)"}}><Icon name="warning" size={44}/></div>
      <h2 style={{fontSize:"var(--t-xl)",fontWeight:800,color:"var(--ink, #1F3A30)",marginBottom:8}}>לא הצלחנו לטעון את הטופס</h2>
      <p style={{fontSize:"var(--t-md)",color:"var(--brand-muted, #7D8D87)",marginBottom:20,maxWidth:320,lineHeight:1.7}}>
        הטופס קיים, פשוט לא הצלחנו להביא אותו כרגע. אפשר לנסות שוב.
      </p>
      <button
        type="button"
        onClick={() => formId && loadForm(formId)}
        style={{padding:"12px 28px",borderRadius:"var(--r-full)",border:"none",background:"var(--ink, #1F3A30)",color:"#fff",fontSize:"var(--t-lg)",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
      >
        נסי שוב
      </button>
    </div>
  );

  if (loadError === "notfound" || !formData) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",fontSize:"var(--t-xl)",fontFamily:"Heebo"}}>
      הטופס לא נמצא
    </div>
  );

  // The form exists but its form_type matches no template. A real data problem,
  // and NOT the same as a missing form - saying "not found" here sends her
  // chasing a link that is perfectly fine.
  if (!formTemplate) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FBF8F1)",padding:24,textAlign:"center"}}>
      <div style={{marginBottom:14,color:"var(--danger)"}}><Icon name="warning" size={44}/></div>
      <h2 style={{fontSize:"var(--t-xl)",fontWeight:800,color:"var(--ink, #1F3A30)",marginBottom:8}}>לא הצלחנו להציג את הטופס</h2>
      <p style={{fontSize:"var(--t-md)",color:"var(--brand-muted, #7D8D87)",maxWidth:320,lineHeight:1.7}}>
        סוג הטופס אינו מוכר למערכת. כדאי לפנות לעסק ששלח לך את הקישור.
      </p>
    </div>
  );

  if (submitted) return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FBF8F1)",padding:24}}>
      <div style={{marginBottom:16,color:"var(--success)"}}><Icon name="check" size={44}/></div>
      <h2 style={{fontSize:"var(--t-2xl)",fontWeight:800,color:"var(--ink, #1F3A30)",marginBottom:8}}>הטופס נחתם בהצלחה!</h2>
      <p style={{fontSize:"var(--t-md)",color:"var(--brand-muted, #7D8D87)"}}>תודה {formData.client_name}, הטופס נשמר בכרטיס שלך</p>
    </div>
  );

  if (formData.status === "signed") return (
    <div dir="rtl" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:"Heebo",background:"var(--brand-cream, #FBF8F1)",padding:24}}>
      <div style={{marginBottom:16,color:"var(--success)"}}><Icon name="check" size={44}/></div>
      <h2 style={{fontSize:"var(--t-2xl)",fontWeight:800,color:"var(--ink, #1F3A30)"}}>הטופס כבר נחתם</h2>
    </div>
  );

  // Counts only required real questions: a heading is not a question, and an optional one never holds the bar back.
  const { done: answeredCount, total: requiredCount, pct: progress } = progressOf(formTemplate, answers);
  const hasSections = formTemplate.questions.some(isSection);
  const setAnswer = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));
  let questionNo = 0;

  return (
    <div dir="rtl" style={{...accentStyle(brandInfo.primaryColor || null),fontFamily:"'Heebo','Assistant',sans-serif",background:"var(--brand-cream, #FBF8F1)",minHeight:"100dvh",padding:"24px 16px"}}>
      <div style={{maxWidth:500,margin:"0 auto"}}>

        {/* Brand row: her logo at natural aspect (contain, capped, never
            cropped), else the business name. No logo and no name → nothing. */}
        {(brandInfo.logoUrl || brandInfo.businessName) && (
          <div style={{textAlign:"center",marginBottom:16}}>
            {brandInfo.logoUrl
              ? <img src={brandInfo.logoUrl} alt={brandInfo.businessName || "לוגו"} style={{maxHeight:56,maxWidth:180,width:"auto",height:"auto",objectFit:"contain",display:"block",margin:"0 auto"}}/>
              : <p style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink, #1F3A30)",margin:0}}>{brandInfo.businessName}</p>}
          </div>
        )}

        <div style={{background:"var(--ink, #1F3A30)",borderRadius:"var(--r-md)",padding:"20px 24px",marginBottom:20,textAlign:"center"}}>
          <div style={{marginBottom:4,color:"var(--pc-tint)"}}><Icon name="gem" size={24}/></div>
          <h1 style={{color:"var(--brand-cream, #FBF8F1)",fontSize:"var(--t-xl)",fontWeight:800,margin:0}}>{formTemplate.title}</h1>
          <p style={{color:"var(--pc-tint)",fontSize:"var(--t-md)",marginTop:4}}>שלום {formData.client_name} 👋</p>
        </div>

        <div style={{background:"var(--brand-surface, #FDFBF9)",borderRadius:"var(--r-sm)",padding:"10px 16px",marginBottom:16,border:"1px solid var(--pc-soft)"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"var(--t-sm)",color:"var(--brand-muted, #7D8D87)",marginBottom:6}}>
            <span>התקדמות</span>
            <span>{answeredCount}/{requiredCount} שאלות</span>
          </div>
          <div style={{background:"var(--pc-soft)",borderRadius:"var(--r-sm)",height:8}}>
            <div style={{background:"var(--pc, #E9A9A1)",borderRadius:"var(--r-sm)",height:8,width:`${progress}%`,transition:"width 0.3s"}}/>
          </div>
        </div>

        <div style={{background:"var(--brand-cream, #FBF8F1)",border:"1px solid var(--warning, #F2B84B)",borderRadius:"var(--r-sm)",padding:"12px 16px",marginBottom:20,fontSize:"var(--t-md)",color:"var(--ink, #1F3A30)"}}>
          ⚠️ כדאי לענות בכנות על כל השאלות. המידע חסוי ומיועד לצורכי הטיפול בלבד.
        </div>

        {formTemplate.intro && (
          <p data-testid="form-intro" style={{fontSize:"var(--t-md)",color:"var(--ink, #1F3A30)",lineHeight:1.7,margin:"-6px 0 20px",padding:"0 4px"}}>{formTemplate.intro}</p>
        )}

        <div style={{background:"var(--brand-surface, #FDFBF9)",borderRadius:"var(--r-md)",padding:24,marginBottom:20,border:"1px solid var(--pc-soft)"}}>
          {/* A template with its own headings shows them; the older ones keep their single heading. */}
          {!hasSections && <h3 style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink, #1F3A30)",marginBottom:16}}>שאלות רפואיות</h3>}
          {formTemplate.questions.map((item, i) => {
            const last = i === formTemplate.questions.length - 1;
            if (isSection(item)) return (
              <h3 key={i} data-testid="form-section" style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink, #1F3A30)",margin:i===0?"0 0 14px":"22px 0 14px",paddingBottom:6,borderBottom:"2px solid var(--pc-soft)"}}>{item.section}</h3>
            );
            const q = normalizeQuestion(item);
            questionNo += 1;
            const value = typeof answers[i] === "string" ? answers[i] : "";
            const missing = showMissing && !q.optional && !isAnswered(item, answers, i);
            const nextIsSection = !last && isSection(formTemplate.questions[i + 1]);
            return (
            <div key={i} data-testid="form-question" data-missing={missing ? "true" : undefined}
              style={{marginBottom:16,paddingBottom:16,borderBottom:last||nextIsSection?"none":"1px solid var(--brand-cream, #FBF8F1)",...(missing?{borderInlineStart:"3px solid var(--danger, #C2557A)",paddingInlineStart:10}:{})}}>
              <p style={{fontSize:"var(--t-md)",color:"var(--ink, #1F3A30)",marginBottom:8,lineHeight:1.5}}>
                {questionNo}. {q.q}
                {q.optional && <span style={{fontSize:"var(--t-sm)",color:"var(--brand-muted, #7D8D87)"}}> (לא חובה)</span>}
              </p>
              {q.type === "yesno" && (
                <div style={{display:"flex",gap:8}}>
                  {[YES, NO].map(ans => (
                    <button key={ans} type="button" aria-pressed={value===ans} onClick={()=>setAnswer(i, ans)} style={chipStyle(value===ans, { grow: true, yes: ans===YES })}>
                      {ans===YES?"✓ כן":"✗ לא"}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "choice" && (
                <div role="radiogroup" aria-label={q.q} style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {(q.options || []).map(opt => (
                    <button key={opt} type="button" role="radio" aria-checked={value===opt} onClick={()=>setAnswer(i, opt)} style={chipStyle(value===opt)}>
                      {value===opt ? `✓ ${opt}` : opt}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "multi" && (() => {
                const picked = splitMulti(value);
                return (
                  <>
                    <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted, #7D8D87)",margin:"-4px 0 8px"}}>אפשר לבחור כמה</p>
                    <div role="group" aria-label={q.q} style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {(q.options || []).map(opt => {
                        const on = picked.includes(opt);
                        return (
                          <button key={opt} type="button" aria-pressed={on} onClick={()=>setAnswer(i, toggleMulti(q, value, opt))} style={chipStyle(on)}>
                            {on ? `✓ ${opt}` : opt}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {q.type === "text" && (
                <input type="text" value={value} maxLength={500} aria-label={q.q} placeholder={q.placeholder || ""} onChange={e=>setAnswer(i, e.target.value)} style={textStyle}/>
              )}
              {q.type === "longtext" && (
                <textarea value={value} maxLength={2000} rows={3} aria-label={q.q} placeholder={q.placeholder || ""} onChange={e=>setAnswer(i, e.target.value)} style={{...textStyle, resize:"vertical"}}/>
              )}
              {showsNote(item, answers, i) && (
                <textarea value={typeof answers[`${i}_note`] === "string" ? answers[`${i}_note`] : ""} onChange={e=>setAnswer(`${i}_note`, e.target.value)}
                  maxLength={1000} aria-label={q.type === "multi" ? "אחר, פירוט" : "פרטים נוספים"}
                  placeholder={q.type === "multi" ? "מה עוד?" : "פרטים נוספים..."} rows={2}
                  style={noteStyle}/>
              )}
              {missing && <p style={{fontSize:"var(--t-sm)",color:"var(--danger, #C2557A)",fontWeight:600,margin:"6px 0 0"}}>חסרה כאן תשובה</p>}
            </div>
            );
          })}
        </div>

        <div style={{background:"var(--brand-surface, #FDFBF9)",borderRadius:"var(--r-md)",padding:24,marginBottom:20,border:"1px solid var(--pc-soft)"}}>
          <h3 style={{fontSize:"var(--t-lg)",fontWeight:700,color:"var(--ink, #1F3A30)",marginBottom:4}}><Icon name="pen" size={16}/> חתימה דיגיטלית</h3>
          <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted, #7D8D87)",marginBottom:12}}>חתמי באצבע או בעכבר בתוך המסגרת</p>
          <canvas ref={canvasRef} width={460} height={130}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={()=>setDrawing(false)}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={()=>setDrawing(false)}
            style={{width:"100%",height:130,border:"1.5px solid var(--pc-soft)",borderRadius:"var(--r-sm)",background:"var(--brand-cream, #FBF8F1)",cursor:"crosshair",touchAction:"none",display:"block"}}/>
          <button onClick={clearSignature}
            style={{marginTop:8,background:"none",border:"none",fontSize:"var(--t-sm)",color:"var(--brand-muted, #7D8D87)",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
            מחקי חתימה
          </button>
        </div>

        <div style={{background:"var(--brand-cream, #FBF8F1)",borderRadius:"var(--r-sm)",padding:"12px 16px",marginBottom:20,fontSize:"var(--t-xs)",color:"var(--brand-muted, #7D8D87)",textAlign:"center",lineHeight:1.6}}>
          בחתימתי אני מאשרת שקראתי את השאלות, עניתי עליהן בכנות,<br/>
          והמידע שמסרתי נכון ומדויק. אני מסכימה לקבלת הטיפול.<br/>
          המידע הרפואי נשמר אצל העסק רק כדי לתת לי טיפול בטוח, ולא משמש לשיווק. אפשר לקרוא עוד במדיניות הפרטיות:{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{color:"inherit",textDecoration:"underline"}}>kalmea.app/privacy</a>
        </div>

        <label data-testid="marketing-consent-checkbox" style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:"var(--r-sm)",border:"1px solid var(--line-2, #E5E0EA)",background:"var(--brand-cream, #FBF8F1)",marginBottom:14,cursor:"pointer"}}>
          <input type="checkbox" checked={marketingOk} onChange={(e)=>setMarketingOk(e.target.checked)} aria-label="אשמח לקבל עדכונים ומבצעים" style={{width:20,height:20,marginTop:2,flexShrink:0,accentColor:"var(--pc)"}}/>
          <span style={{fontSize:"var(--t-md)",color:"var(--ink, #1F3A30)",lineHeight:1.6}}>אשמח לקבל עדכונים ומבצעים</span>
        </label>

        {submitError && (
          <div role="alert" style={{background:"#FDEEF2",border:"1px solid var(--danger, #C2557A)",borderRadius:"var(--r-sm)",padding:"12px 14px",marginBottom:12,fontSize:"var(--t-md)",color:"var(--danger, #C2557A)",fontWeight:600,lineHeight:1.6,textAlign:"center"}}>
            {submitError}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{width:"100%",background:submitting?"var(--brand-muted, #7D8D87)":"var(--pc)",color:"var(--pc-contrast, #FFFFFF)",border:"none",borderRadius:"var(--r-sm)",padding:"16px",fontSize:"var(--t-lg)",fontWeight:700,cursor:submitting?"default":"pointer",fontFamily:"inherit",marginBottom:40,boxShadow:"var(--shadow-md)"}}>
          {submitting ?<Spinner inline label="שולחת"/>: "שליחה וחתימה ✓"}
        </button>
      </div>
    </div>
  );
}

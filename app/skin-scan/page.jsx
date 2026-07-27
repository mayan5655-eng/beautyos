"use client";
import { useState, useRef, useEffect } from "react";

// ============================================================
// AI SKIN SCANNER PAGE  —  /skin-scan  (v5 — premium consultation)
// Same engine as before: reads ?t=<tenantId>, calls /api/skin-scan and
// /api/skin-scan/send, and books via /book. Only the EXPERIENCE was upgraded
// (premium welcome + guidance + conversion-first results). No new scanner,
// no new AI, no new booking/lead system.
// ============================================================

// Calm, premium plum/rose palette (BloomOS-aligned) — replaces the hot pink.
const ACCENT = "#8E5A7C"; // muted plum-rose (primary)
const DEEP = "#5B3E67"; // plum (brand ink)
const INK = "#3A2E38";
const INK2 = "#8A7E86";
const LINE = "#EFE3EC";

// Reassuring, non-technical steps cycled during analysis so the wait feels like
// a consultation rather than a loading bar.
const SCAN_STEPS = [
  "בודקת את גווני העור וההארה…",
  "מעריכה לחות, מרקם ואיזון…",
  "מזהה אזורים שדורשים תשומת לב…",
  "מתאימה עבורך טיפול מקצועי…",
];

export default function SkinScanPage() {
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPro, setShowPro] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);

  // WhatsApp send state
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  // Multi-tenant: which cosmetician this scanner belongs to (from ?t= in URL)
  const [tenantId, setTenantId] = useState("");

  const fileRef = useRef(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("t");
      if (t) setTenantId(t);
    } catch {}
  }, []);

  // Cycle the reassuring steps while analyzing.
  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const id = setInterval(() => setLoadStep((s) => (s + 1) % SCAN_STEPS.length), 1900);
    return () => clearInterval(id);
  }, [loading]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    setReport(null);
    setShowPro(false);
    setShowRoutine(false);
    setSent(false);
    setSendError("");
    // Downscale + compress in the browser before sending (unchanged pipeline).
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setMediaType("image/jpeg");
        setPreview(dataUrl);
        setImageData(dataUrl.split(",")[1]);
      };
      img.onerror = () => {
        setMediaType(file.type || "image/jpeg");
        setPreview(reader.result);
        setImageData(String(reader.result).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imageData || loading) return;
    setLoading(true);
    setErrorMsg("");
    setReport(null);
    try {
      const res = await fetch("/api/skin-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData, mediaType, tenantId }),
      });
      const data = await res.json();
      if (data.success) { setReport(data.report); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} }
      else setErrorMsg(data.error || "אירעה שגיאה. נסי שוב.");
    } catch (err) {
      setErrorMsg("שגיאת חיבור. נסי שוב.");
    } finally {
      setLoading(false);
    }
  };

  const sendReport = async () => {
    setSendError("");
    if (!clientPhone.trim()) { setSendError("נא להזין מספר טלפון"); return; }
    if (sending || sent) return; // guard against duplicate sends / duplicate leads
    setSending(true);
    try {
      const res = await fetch("/api/skin-scan/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, clientName: clientName.trim(), clientPhone: clientPhone.trim(), tenantId }),
      });
      const data = await res.json();
      if (data.success) setSent(true);
      else setSendError(data.error || "השליחה נכשלה. נסי שוב.");
    } catch (err) {
      setSendError("שגיאת חיבור. נסי שוב.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setImageData(null);
    setReport(null);
    setErrorMsg("");
    setShowPro(false);
    setShowRoutine(false);
    setClientName("");
    setClientPhone("");
    setSent(false);
    setSendError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // Booking that PRESERVES context: recommended treatment + known name/phone are
  // passed through to /book so the visitor never re-enters what we already know.
  const bookHref = () => {
    const p = new URLSearchParams();
    if (tenantId) p.set("t", tenantId);
    if (report?.matched_service) p.set("service", report.matched_service);
    if (clientName.trim()) p.set("name", clientName.trim());
    if (clientPhone.trim()) p.set("phone", clientPhone.trim());
    const qs = p.toString();
    return "/book" + (qs ? `?${qs}` : "");
  };

  const scoreColor = (s) => (s >= 75 ? "#3E9E6B" : s >= 50 ? "#C98A3A" : ACCENT);
  const card = { background: "#fff", borderRadius: 18, padding: "18px 20px", boxShadow: "0 6px 22px rgba(91,62,103,0.06)", border: `1px solid ${LINE}`, marginBottom: 14 };
  const pro = report?.therapist_notes || {};

  return (
    <div dir="rtl" style={{ fontFamily: "'Assistant','Heebo',sans-serif", background: "linear-gradient(180deg,#FBF4F8 0%,#F7EFF4 55%,#FBFAFC 100%)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 54px", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700&family=Frank+Ruhl+Libre:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Frank Ruhl Libre', 'Assistant', serif; }
        .ss-card { animation: ssIn 0.55s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes ssIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ss-btn { transition: transform 0.15s, box-shadow 0.2s, filter 0.2s; cursor: pointer; border: none; font-family: inherit; }
        .ss-btn:hover:not(:disabled) { filter: saturate(1.04); transform: translateY(-1px); }
        .ss-btn:active:not(:disabled) { transform: scale(0.98); }
        .ss-btn:disabled { opacity: 0.55; cursor: default; }
        .ss-ring { width: 52px; height: 52px; border-radius: 50%; border: 3px solid #EFDFE9; border-top-color: ${ACCENT}; animation: ssSpin 0.9s linear infinite; }
        @keyframes ssSpin { to { transform: rotate(360deg); } }
        .ss-fade { animation: ssFade 0.5s ease both; }
        @keyframes ssFade { from { opacity: 0; } to { opacity: 1; } }
        .chip { display:inline-flex; align-items:center; gap:5px; background:#fff; border:1px solid ${LINE}; border-radius:999px; padding:6px 12px; font-size:11.5px; font-weight:600; color:${DEEP}; }
      `}</style>

      {/* HEADER — calm, premium, one message */}
      <div style={{ width: "100%", maxWidth: 500, padding: "40px 22px 8px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: "3px", color: ACCENT, fontWeight: 700, marginBottom: 10 }}>ניתוח עור אישי</p>
        <h1 className="serif" style={{ fontSize: 30, fontWeight: 700, color: DEEP, lineHeight: 1.25, marginBottom: 8 }}>הכירי את העור שלך —<br />וקבלי המלצה מקצועית</h1>
        <p style={{ fontSize: 13.5, color: INK2, fontWeight: 500, lineHeight: 1.6 }}>העלי תמונה אחת, וקבלי ניתוח אישי והמלצת טיפול תוך כדקה.</p>
      </div>

      <div style={{ width: "100%", maxWidth: 500, padding: "14px 20px 0" }}>

        {/* ===== WELCOME + UPLOAD / PREVIEW ===== */}
        {!report && (
          <div className="ss-card" style={{ ...card, padding: "22px 20px 24px", borderRadius: 22, textAlign: "center" }}>
            {/* Trust row — sets expectations before asking for a photo */}
            {!preview && !loading && (
              <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
                <span className="chip">✦ ניתוח אישי</span>
                <span className="chip">✦ המלצה מקצועית</span>
                <span className="chip">✦ כ‑60 שניות</span>
              </div>
            )}

            {preview ? (
              <img src={preview} alt="preview" style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: 16, marginBottom: 16 }} />
            ) : (
              <div onClick={() => fileRef.current?.click()} style={{ border: `1.5px dashed #E4C4D6`, borderRadius: 18, padding: "40px 20px", cursor: "pointer", marginBottom: 16, background: "linear-gradient(180deg,#FDF7FB,#FBF3F8)" }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>🌸</div>
                <p style={{ fontSize: 15.5, fontWeight: 700, color: DEEP }}>צלמי או העלי תמונה</p>
                <p style={{ fontSize: 12, color: INK2, marginTop: 4 }}>סלפי חזיתי — ונתחיל</p>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFile} style={{ display: "none" }} />

            {/* Capture guidance — premium, clear, reduces bad scans */}
            {!preview && !loading && (
              <div style={{ background: "#FBF6FA", border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px", marginBottom: 16, textAlign: "right" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: DEEP, marginBottom: 7 }}>לתוצאה הכי מדויקת</p>
                {[["☀️", "אור טבעי ורך, פנים אל מול האור"], ["🙂", "פנים במרכז התמונה, מבט למצלמה"], ["💧", "ללא איפור, שיער אסוף"]].map(([ic, tx], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: i < 2 ? 6 : 0 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{ic}</span>
                    <p style={{ fontSize: 12.5, color: "#6A5E66", lineHeight: 1.5 }}>{tx}</p>
                  </div>
                ))}
              </div>
            )}

            {preview && !loading && (
              <button onClick={() => fileRef.current?.click()} className="ss-btn" style={{ background: "none", color: ACCENT, fontSize: 13, fontWeight: 600, marginBottom: 12, display: "block", width: "100%" }}>
                החלפת תמונה
              </button>
            )}

            {errorMsg && (
              <div style={{ background: "#FDF0F0", border: "1px solid #F3D4D4", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
                <p style={{ color: "#C0392B", fontSize: 13, fontWeight: 600 }}>{errorMsg}</p>
                <p style={{ color: "#9A6A6A", fontSize: 11.5, marginTop: 3 }}>אפשר לנסות שוב עם תמונה ברורה יותר.</p>
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 0" }}>
                <div className="ss-ring" />
                <p key={loadStep} className="ss-fade" style={{ fontSize: 14, color: DEEP, fontWeight: 600, minHeight: 20 }}>{SCAN_STEPS[loadStep]}</p>
                <p style={{ fontSize: 11.5, color: INK2 }}>רגע אחד — מכינות עבורך ניתוח אישי ✦</p>
              </div>
            ) : (
              preview && (
                <button onClick={analyze} className="ss-btn" style={{ width: "100%", padding: "16px 0", borderRadius: 15, background: `linear-gradient(135deg,${ACCENT},${DEEP})`, color: "#fff", fontSize: 16.5, fontWeight: 700, boxShadow: `0 10px 26px rgba(91,62,103,0.28)` }}>
                  קבלי את הניתוח שלך ✦
                </button>
              )
            )}
          </div>
        )}

        {/* ===== REPORT — conversion-first order ===== */}
        {report && (
          <div className="ss-card">

            {/* 1) SCORE + skin type + warm summary */}
            <div style={{ ...card, padding: "26px 20px", borderRadius: 22, textAlign: "center" }}>
              <p style={{ fontSize: 12, color: ACCENT, fontWeight: 700, letterSpacing: "1px", marginBottom: 12 }}>מדד בריאות העור שלך</p>
              <div style={{ width: 116, height: 116, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: `6px solid ${scoreColor(report.score)}`, background: "#fff" }}>
                <span className="serif" style={{ fontSize: 40, fontWeight: 700, color: scoreColor(report.score) }}>{report.score}</span>
              </div>
              <p className="serif" style={{ fontSize: 18, fontWeight: 600, color: INK, marginTop: 14 }}>{report.skin_type}</p>
              {report.summary && <p style={{ fontSize: 13.5, color: "#5A4E54", lineHeight: 1.65, marginTop: 8 }}>{report.summary}</p>}
            </div>

            {/* 2) RECOMMENDED TREATMENT + PRIMARY BOOK CTA — the money moment, up top */}
            {report.clinical_treatment && (
              <div className="ss-card" style={{ background: `linear-gradient(140deg,${DEEP} 0%,${ACCENT} 100%)`, borderRadius: 20, padding: "22px 20px", boxShadow: `0 12px 30px rgba(91,62,103,0.30)`, marginBottom: 14, textAlign: "center" }}>
                <p style={{ fontSize: 11.5, color: "#fff", opacity: 0.85, letterSpacing: "1px", marginBottom: 6 }}>הטיפול המקצועי שהכי מתאים לך</p>
                <p className="serif" style={{ fontSize: 21, fontWeight: 700, color: "#fff", marginBottom: report.matched_service ? 3 : 16 }}>{report.clinical_treatment}</p>
                {report.matched_service && <p style={{ fontSize: 13, color: "#fff", opacity: 0.92, marginBottom: 16 }}>אצלנו בקליניקה: {report.matched_service}</p>}
                <a href={bookHref()} style={{ display: "block", textDecoration: "none", background: "#fff", color: DEEP, padding: "15px 0", borderRadius: 14, fontSize: 16, fontWeight: 800, boxShadow: "0 8px 20px rgba(0,0,0,0.14)" }}>
                  קביעת תור לטיפול ✦
                </a>
                <p style={{ fontSize: 11, color: "#fff", opacity: 0.8, marginTop: 10 }}>נשמור לך את הפרטים והטיפול — בלי למלא מחדש</p>
              </div>
            )}

            {/* 3) WHAT WE NOTICED (concerns) */}
            {report.concerns?.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: 14.5, fontWeight: 700, color: INK, marginBottom: 12 }}>מה שזיהינו בעור שלך</p>
                {report.concerns.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0, marginTop: 7 }} />
                    <p style={{ fontSize: 13.5, color: "#5A4E54", lineHeight: 1.55 }}>{c}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 4) SKINCARE ROUTINE — valuable but secondary → collapsed by default */}
            {(report.routine_morning?.length > 0 || report.routine_evening?.length > 0) && (
              <div style={{ ...card, padding: "4px 0", background: "transparent", border: "none", boxShadow: "none" }}>
                <button onClick={() => setShowRoutine(!showRoutine)} className="ss-btn" style={{ width: "100%", padding: "13px 18px", borderRadius: 16, background: "#fff", color: DEEP, fontSize: 13.5, fontWeight: 700, border: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>שגרת הטיפוח האישית שלך לבית</span>
                  <span style={{ color: ACCENT }}>{showRoutine ? "▲" : "▼"}</span>
                </button>
                {showRoutine && (
                  <div className="ss-fade" style={{ marginTop: 12 }}>
                    {report.routine_morning?.length > 0 && (
                      <div style={card}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>בוקר</p>
                        {report.routine_morning.map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 7 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                            <p style={{ fontSize: 13, color: "#5A4E54", lineHeight: 1.5 }}>{t}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {report.routine_evening?.length > 0 && (
                      <div style={card}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>ערב</p>
                        {report.routine_evening.map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 7 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                            <p style={{ fontSize: 13, color: "#5A4E54", lineHeight: 1.5 }}>{t}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5) SECONDARY — get the full report on WhatsApp (also captures the lead) */}
            <div style={{ ...card, background: "#F3FBF5", border: "1px solid #CDECD7" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 34, marginBottom: 6 }}>✓</div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#2E9E5B" }}>הדוח נשלח לוואטסאפ שלך</p>
                  <p style={{ fontSize: 12.5, color: "#5A7A65", marginTop: 4 }}>שמרנו לך גם את הפרטים לקביעת התור 💚</p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#2E7D4F", marginBottom: 3 }}>רוצה את הדוח המלא בוואטסאפ?</p>
                  <p style={{ fontSize: 12, color: "#5A7A65", marginBottom: 12 }}>נשלח לך את הניתוח ישירות לנייד — וגם נכיר.</p>
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="שם (לא חובה)"
                    style={{ width: "100%", border: "1.5px solid #CDECD7", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 9 }} />
                  <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} type="tel" inputMode="tel" placeholder="טלפון נייד"
                    style={{ width: "100%", border: "1.5px solid #CDECD7", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
                  {sendError && <p style={{ color: "#C0392B", fontSize: 12.5, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{sendError}</p>}
                  <button onClick={sendReport} disabled={sending} className="ss-btn"
                    style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: "#25D366", color: "#fff", fontSize: 14.5, fontWeight: 700, boxShadow: "0 6px 16px rgba(37,211,102,0.32)" }}>
                    {sending ? "שולחת…" : "שליחת הדוח לוואטסאפ שלי"}
                  </button>
                </>
              )}
            </div>

            {/* DISCLAIMER — calm, small */}
            <p style={{ fontSize: 11, color: "#B4A6AE", textAlign: "center", lineHeight: 1.55, marginBottom: 12, padding: "0 12px" }}>
              הערכת AI ראשונית בלבד, אינה מהווה אבחון רפואי. לתכנית טיפול מלאה ומדויקת נשמח לפגוש אותך בקליניקה.
            </p>

            {/* THERAPIST SECTION — kept, de-emphasized at the very bottom */}
            {report.therapist_notes && (
              <>
                <button onClick={() => setShowPro(!showPro)} className="ss-btn" style={{ width: "100%", padding: "11px 0", borderRadius: 12, background: "transparent", color: INK2, fontSize: 12, fontWeight: 600, border: `1px solid ${LINE}`, marginBottom: 12 }}>
                  {showPro ? "הסתרת החלק המקצועי" : "חלק מקצועי למטפלת"}
                </button>
                {showPro && (
                  <div className="ss-fade" style={{ background: "#F8F3FC", borderRadius: 16, padding: "18px", border: "1px solid #E9DAF2", marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#6B4A8C", marginBottom: 12 }}>הערות קליניות למטפלת</p>
                    {pro.skin_assessment && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 3 }}>הערכת עור</p>
                        <p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.skin_assessment}</p>
                      </div>
                    )}
                    {pro.active_ingredients?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 5 }}>מרכיבים פעילים מומלצים</p>
                        {pro.active_ingredients.map((a, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: "#9B7AB8", flexShrink: 0 }}>•</span>
                            <p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.5 }}>{a}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {pro.protocol && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 3 }}>פרוטוקול טיפול</p>
                        <p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.protocol}</p>
                      </div>
                    )}
                    {pro.cautions && (
                      <div style={{ background: "#FFF4F4", borderRadius: 10, padding: "10px 12px", border: "1px solid #F5D0D0" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#C0392B", marginBottom: 3 }}>אזהרות / תשומת לב</p>
                        <p style={{ fontSize: 12.5, color: "#7A4A4A", lineHeight: 1.5 }}>{pro.cautions}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <button onClick={reset} className="ss-btn" style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: "transparent", color: INK2, fontSize: 13, fontWeight: 600 }}>
              סריקה חדשה
            </button>
          </div>
        )}

      </div>

      <div style={{ marginTop: "auto", paddingTop: 30, fontSize: 11, color: "#C6B4BF" }}>
        מופעל ע"י BloomOS
      </div>
    </div>
  );
}

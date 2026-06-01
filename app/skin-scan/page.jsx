"use client";
import { useState, useRef, useEffect } from "react";

// ============================================================
// AI SKIN SCANNER PAGE  —  /skin-scan  (v4 — multi-tenant)
// Reads ?t=<tenantId> from the URL so each cosmetician gets her own
// leads + WhatsApp alerts. Dual report + "send to WhatsApp".
// ============================================================

const PINK = "#E91E63";

export default function SkinScanPage() {
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPro, setShowPro] = useState(false);

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

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    setReport(null);
    setShowPro(false);
    setSent(false);
    setSendError("");
    setMediaType(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setPreview(result);
      setImageData(result.split(",")[1]);
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
        body: JSON.stringify({ image: imageData, mediaType }),
      });
      const data = await res.json();
      if (data.success) setReport(data.report);
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
    if (sending) return;
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
    setClientName("");
    setClientPhone("");
    setSent(false);
    setSendError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const scoreColor = (s) => (s >= 75 ? "#2E9E5B" : s >= 50 ? "#E8920C" : PINK);
  const card = { background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 4px 16px rgba(233,30,99,0.08)", marginBottom: 14 };
  const pro = report?.therapist_notes || {};

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo','Assistant',sans-serif", background: "linear-gradient(165deg, #FFF0F6 0%, #FFE3EF 100%)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 50px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .ss-card { animation: ssIn 0.5s ease-out; }
        @keyframes ssIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ss-btn { transition: transform 0.15s; cursor: pointer; border: none; font-family: inherit; }
        .ss-btn:active:not(:disabled) { transform: scale(0.97); }
        .ss-btn:disabled { opacity: 0.5; cursor: default; }
        .ss-spin { width: 46px; height: 46px; border: 4px solid #FCE0EC; border-top-color: ${PINK}; border-radius: 50%; animation: ssSpin 0.8s linear infinite; }
        @keyframes ssSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* HEADER */}
      <div style={{ width: "100%", maxWidth: 480, padding: "34px 20px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 6 }}>✨</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: PINK, marginBottom: 4 }}>סורק העור החכם</h1>
        <p style={{ fontSize: 13, color: "#B77", fontWeight: 500 }}>העלי סלפי וקבלי ניתוח עור מקצועי אישי</p>
      </div>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

        {/* ===== UPLOAD / PREVIEW ===== */}
        {!report && (
          <div className="ss-card" style={{ ...card, padding: "22px 20px", borderRadius: 20, textAlign: "center" }}>
            {preview ? (
              <img src={preview} alt="preview" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 16, marginBottom: 16 }} />
            ) : (
              <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed #F5B7CE`, borderRadius: 16, padding: "44px 20px", cursor: "pointer", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: PINK }}>לחצי לצילום או בחירת תמונה</p>
                <p style={{ fontSize: 12, color: "#B77", marginTop: 4 }}>סלפי באור טוב, בלי איפור כבד</p>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFile} style={{ display: "none" }} />

            {preview && !loading && (
              <button onClick={() => fileRef.current?.click()} className="ss-btn" style={{ background: "none", color: PINK, fontSize: 13, fontWeight: 600, marginBottom: 12, display: "block", width: "100%" }}>
                בחרי תמונה אחרת
              </button>
            )}

            {errorMsg && <p style={{ color: "#D32F2F", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{errorMsg}</p>}

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "10px 0" }}>
                <div className="ss-spin" />
                <p style={{ fontSize: 14, color: PINK, fontWeight: 600 }}>מנתחת את העור שלך... ✨</p>
              </div>
            ) : (
              preview && (
                <button onClick={analyze} className="ss-btn" style={{ width: "100%", padding: "15px 0", borderRadius: 14, background: PINK, color: "#fff", fontSize: 16, fontWeight: 800, boxShadow: `0 8px 22px ${PINK}55` }}>
                  ✨ נתחי את העור שלי
                </button>
              )
            )}
          </div>
        )}

        {/* ===== REPORT ===== */}
        {report && (
          <div className="ss-card">

            {/* SCORE */}
            <div style={{ ...card, padding: "24px 20px", borderRadius: 20, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#B77", fontWeight: 600, marginBottom: 10 }}>ציון העור שלך</p>
              <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: `7px solid ${scoreColor(report.score)}`, background: "#fff" }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: scoreColor(report.score) }}>{report.score}</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#3A2A30", marginTop: 12 }}>{report.skin_type}</p>
            </div>

            {report.summary && (
              <div style={{ ...card, textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#3A2A30", lineHeight: 1.6, fontWeight: 500 }}>💗 {report.summary}</p>
              </div>
            )}

            {report.concerns?.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#3A2A30", marginBottom: 10 }}>🔍 מה שזיהינו</p>
                {report.concerns.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: PINK, flexShrink: 0, marginTop: 7 }} />
                    <p style={{ fontSize: 13.5, color: "#5A4A50", lineHeight: 1.5 }}>{c}</p>
                  </div>
                ))}
              </div>
            )}

            {report.routine_morning?.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#3A2A30", marginBottom: 10 }}>☀️ שגרת בוקר</p>
                {report.routine_morning.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: PINK, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <p style={{ fontSize: 13.5, color: "#5A4A50", lineHeight: 1.5 }}>{t}</p>
                  </div>
                ))}
              </div>
            )}

            {report.routine_evening?.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#3A2A30", marginBottom: 10 }}>🌙 שגרת ערב</p>
                {report.routine_evening.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: PINK, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <p style={{ fontSize: 13.5, color: "#5A4A50", lineHeight: 1.5 }}>{t}</p>
                  </div>
                ))}
              </div>
            )}

            {report.clinical_treatment && (
              <div style={{ background: `linear-gradient(135deg, ${PINK} 0%, #FF6FA3 100%)`, borderRadius: 16, padding: "18px 20px", boxShadow: `0 8px 22px ${PINK}44`, marginBottom: 14, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "#fff", opacity: 0.9, marginBottom: 4 }}>הטיפול המקצועי המומלץ עבורך</p>
                <p style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: report.matched_service ? 2 : 12 }}>{report.clinical_treatment}</p>
                {report.matched_service && (
                  <p style={{ fontSize: 12.5, color: "#fff", opacity: 0.95, marginBottom: 12 }}>אצלנו: {report.matched_service}</p>
                )}
                <a href={tenantId ? `/book?t=${tenantId}` : "/book"} style={{ display: "inline-block", textDecoration: "none", background: "#fff", color: PINK, padding: "11px 26px", borderRadius: 12, fontSize: 14, fontWeight: 800 }}>
                  ✨ לקביעת תור
                </a>
              </div>
            )}

            {/* ===== SEND TO WHATSAPP ===== */}
            <div style={{ ...card, background: "#F0FBF3", border: "2px solid #C8EBD4" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>✅</div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#2E9E5B" }}>הדוח נשלח לוואטסאפ שלך!</p>
                  <p style={{ fontSize: 12.5, color: "#5A7A65", marginTop: 4 }}>בדקי את הוואטסאפ שלך 💚</p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#2E7D4F", marginBottom: 4 }}>📲 קבלי את הדוח לוואטסאפ</p>
                  <p style={{ fontSize: 12, color: "#5A7A65", marginBottom: 12 }}>נשלח לך את הדוח המלא ישירות לנייד</p>
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="שם (לא חובה)"
                    style={{ width: "100%", border: "2px solid #C8EBD4", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 9 }} />
                  <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
                    style={{ width: "100%", border: "2px solid #C8EBD4", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
                  {sendError && <p style={{ color: "#D32F2F", fontSize: 12.5, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{sendError}</p>}
                  <button onClick={sendReport} disabled={sending} className="ss-btn"
                    style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: "#25D366", color: "#fff", fontSize: 15, fontWeight: 800, boxShadow: "0 6px 18px rgba(37,211,102,0.4)" }}>
                    {sending ? "שולחת..." : "📲 שלחי לי את הדוח בוואטסאפ"}
                  </button>
                </>
              )}
            </div>

            {/* ===== THERAPIST SECTION (toggle) ===== */}
            {report.therapist_notes && (
              <>
                <button onClick={() => setShowPro(!showPro)} className="ss-btn" style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: "#fff", color: "#6B4A8C", fontSize: 14, fontWeight: 800, border: "2px solid #E5D4F0", marginBottom: 14 }}>
                  {showPro ? "🔒 הסתר חלק מקצועי" : "👩‍⚕️ חלק מקצועי למטפלת"}
                </button>

                {showPro && (
                  <div className="ss-card" style={{ background: "#F8F3FC", borderRadius: 16, padding: "18px 18px", border: "2px solid #E5D4F0", marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 900, color: "#6B4A8C", marginBottom: 12 }}>📋 הערות קליניות למטפלת</p>

                    {pro.skin_assessment && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: "#6B4A8C", marginBottom: 3 }}>הערכת עור</p>
                        <p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.skin_assessment}</p>
                      </div>
                    )}

                    {pro.active_ingredients?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: "#6B4A8C", marginBottom: 5 }}>מרכיבים פעילים מומלצים</p>
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
                        <p style={{ fontSize: 12, fontWeight: 800, color: "#6B4A8C", marginBottom: 3 }}>פרוטוקול טיפול</p>
                        <p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.protocol}</p>
                      </div>
                    )}

                    {pro.cautions && (
                      <div style={{ background: "#FFF4F4", borderRadius: 10, padding: "10px 12px", border: "1px solid #F5D0D0" }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: "#C0392B", marginBottom: 3 }}>⚠️ אזהרות / תשומת לב</p>
                        <p style={{ fontSize: 12.5, color: "#7A4A4A", lineHeight: 1.5 }}>{pro.cautions}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* DISCLAIMER */}
            <p style={{ fontSize: 11, color: "#B0A0A6", textAlign: "center", lineHeight: 1.5, marginBottom: 14, padding: "0 10px" }}>
              ⚠️ הניתוח הוא הערכה קוסמטית כללית בלבד, ואינו תחליף לייעוץ או אבחון מקצועי.
            </p>

            <button onClick={reset} className="ss-btn" style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: "#fff", color: PINK, fontSize: 15, fontWeight: 800, border: `2px solid ${PINK}` }}>
              🔄 סריקה חדשה
            </button>
          </div>
        )}

      </div>

      <div style={{ marginTop: "auto", paddingTop: 30, fontSize: 11, color: "#C9A9B6" }}>
        מופעל ע"י BeautyOS 💎
      </div>
    </div>
  );
}

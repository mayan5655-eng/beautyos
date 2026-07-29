"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase";
import { fetchPublicBranding } from "@/lib/branding";
import FloralCorners from "../FloralCorners";

// ============================================================
// AI SKIN SCANNER PAGE  —  /skin-scan  (v6 — premium consultation results)
// Same engine as before (reads ?t=<tenantId>, calls /api/skin-scan and
// /api/skin-scan/send, books via /book). Only the EXPERIENCE was upgraded.
// The results now read as an expert consultation:
//   summary -> positives -> concerns -> priority -> treatment -> benefit -> next.
// Every value shown comes from the EXISTING AI report — nothing is invented.
// No new scanner, no new AI, no new booking/lead system.
// ============================================================

const ACCENT_DEFAULT = "#8E5A7C"; // muted plum-rose (fallback primary)
const DEEP_DEFAULT = "#5B3E67"; // plum (fallback brand ink)
const INK = "#3A2E38";
const INK2 = "#8A7E86";
const LINE = "#EFE3EC";

const SCAN_STEPS = [
  "בודקת את גווני העור וההארה…",
  "מעריכה לחות, מרקם ואיזון…",
  "מזהה אזורים שדורשים תשומת לב…",
  "מתאימה עבורך טיפול מקצועי…",
];

export default function SkinScanPage() {
  const [preview, setPreview] = useState(null);         // FRONT photo (primary — analyzed)
  const [imageData, setImageData] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [leftPreview, setLeftPreview] = useState(null);   // optional left-profile photo
  const [rightPreview, setRightPreview] = useState(null); // optional right-profile photo
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPro, setShowPro] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const [tenantId, setTenantId] = useState("");
  const [brand, setBrand] = useState(null); // resolved clinic branding (safe fallbacks)

  const fileRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("t");
      if (t) setTenantId(t);
    } catch {}
  }, []);

  // Load the clinic's branding (public-safe fields only). Strictly tenant-scoped;
  // missing/invalid tenant or error -> neutral BloomOS defaults (never another clinic).
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    fetchPublicBranding(supabase, tenantId).then((b) => { if (alive) setBrand(b); });
    return () => { alive = false; };
  }, [tenantId]);

  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const id = setInterval(() => setLoadStep((s) => (s + 1) % SCAN_STEPS.length), 1900);
    return () => clearInterval(id);
  }, [loading]);

  // Downscale + compress a picked file in the browser, then hand back the JPEG
  // data URL. Shared by all three angle slots (front + left/right profiles).
  const processImage = (file, cb) => {
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
        cb({ dataUrl, mediaType: "image/jpeg" });
      };
      img.onerror = () => cb({ dataUrl: String(reader.result), mediaType: file.type || "image/jpeg" });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  // FRONT photo is the primary image the AI analyzes — behaviour identical to
  // before (sets preview + imageData + mediaType); engine call is unchanged.
  const handleFront = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(""); setReport(null); setShowPro(false); setShowRoutine(false); setSent(false); setSendError("");
    processImage(file, ({ dataUrl, mediaType }) => { setMediaType(mediaType); setPreview(dataUrl); setImageData(dataUrl.split(",")[1]); });
  };

  // LEFT / RIGHT profile photos — captured for a more professional multi-angle
  // scan (preview only; the existing single-image engine analyzes the front).
  const handleSide = (e, which) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImage(file, ({ dataUrl }) => { (which === "left" ? setLeftPreview : setRightPreview)(dataUrl); });
  };

  const analyze = async () => {
    if (!imageData || loading) return;
    setLoading(true); setErrorMsg(""); setReport(null);
    try {
      const res = await fetch("/api/skin-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: imageData, mediaType, tenantId }) });
      const data = await res.json();
      if (data.success) { setReport(data.report); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} }
      else setErrorMsg(data.error || "אירעה שגיאה. נסי שוב.");
    } catch (err) { setErrorMsg("שגיאת חיבור. נסי שוב."); } finally { setLoading(false); }
  };

  const sendReport = async () => {
    setSendError("");
    if (!clientPhone.trim()) { setSendError("נא להזין מספר טלפון"); return; }
    if (sending || sent) return; // duplicate-send / duplicate-lead guard
    setSending(true);
    try {
      const res = await fetch("/api/skin-scan/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, clientName: clientName.trim(), clientPhone: clientPhone.trim(), tenantId }) });
      const data = await res.json();
      if (data.success) setSent(true); else setSendError(data.error || "השליחה נכשלה. נסי שוב.");
    } catch (err) { setSendError("שגיאת חיבור. נסי שוב."); } finally { setSending(false); }
  };

  const reset = () => {
    setPreview(null); setImageData(null); setReport(null); setErrorMsg(""); setShowPro(false); setShowRoutine(false);
    setLeftPreview(null); setRightPreview(null);
    setClientName(""); setClientPhone(""); setSent(false); setSendError("");
    if (fileRef.current) fileRef.current.value = "";
    if (leftRef.current) leftRef.current.value = "";
    if (rightRef.current) rightRef.current.value = "";
  };

  // Booking that PRESERVES context (treatment + name + phone) — no re-entry.
  const bookHref = () => {
    const p = new URLSearchParams();
    if (tenantId) p.set("t", tenantId);
    if (report?.matched_service) p.set("service", report.matched_service);
    if (clientName.trim()) p.set("name", clientName.trim());
    if (clientPhone.trim()) p.set("phone", clientPhone.trim());
    const qs = p.toString();
    return "/book" + (qs ? `?${qs}` : "");
  };

  // Clinic colors (safe-resolved) drive every accent + CTA; fall back to defaults.
  const ACCENT = brand?.primary || ACCENT_DEFAULT;
  const DEEP = brand?.deep || DEEP_DEFAULT;
  const ctaText = (brand?.ctaLabel || "קביעת תור לטיפול");

  const scoreColor = (s) => (s >= 75 ? "#3E9E6B" : s >= 50 ? "#C98A3A" : ACCENT);
  // Honest, encouraging framing derived from the REAL score band (not a fabricated
  // per-feature finding). Builds confidence before discussing concerns.
  const positiveNote = (s) =>
    s >= 75 ? "העור שלך במצב טוב — נקודת פתיחה מצוינת. נשמור על מה שיפה ונחדד את הפרטים."
    : s >= 55 ? "יש לך בסיס יפה לעבודה. עם ליווי מותאם אפשר לראות שיפור נעים וברור."
    : "יחד נבנה תוכנית מותאמת שתעשה שינוי אמיתי — צעד אחר צעד, בקצב שלך.";

  const card = { background: "#fff", borderRadius: 18, padding: "18px 20px", boxShadow: "0 6px 22px rgba(91,62,103,0.06)", border: `1px solid ${LINE}`, marginBottom: 14 };
  const sectionLabel = { fontSize: 11.5, letterSpacing: "1.5px", color: ACCENT, fontWeight: 700, marginBottom: 8 };
  const pro = report?.therapist_notes || {};
  const plan = report?.clinic_plan || {};
  const concerns = report?.concerns || [];
  const priority = concerns[0]; // the AI lists concerns most-important first

  const bookCard = (label) => (
    <a href={bookHref()} style={{ display: "block", textDecoration: "none", background: "#fff", color: DEEP, padding: "15px 0", borderRadius: 14, fontSize: 16, fontWeight: 800, textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}>{label}</a>
  );

  return (
    <div dir="rtl" style={{ fontFamily: "'Assistant','Heebo',sans-serif", background: "linear-gradient(180deg,#FBF4F8 0%,#F7EFF4 55%,#FBFAFC 100%)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 54px", color: INK, position: "relative", zIndex: 0, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700&family=Frank+Ruhl+Libre:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Frank Ruhl Libre','Assistant',serif; }
        .ss-card { animation: ssIn 0.55s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes ssIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ss-btn { transition: transform 0.15s, filter 0.2s; cursor: pointer; border: none; font-family: inherit; }
        .ss-btn:hover:not(:disabled) { filter: saturate(1.04); transform: translateY(-1px); }
        .ss-btn:active:not(:disabled) { transform: scale(0.98); }
        .ss-btn:disabled { opacity: 0.55; cursor: default; }
        .ss-ring { width: 52px; height: 52px; border-radius: 50%; border: 3px solid #EFDFE9; border-top-color: ${ACCENT}; animation: ssSpin 0.9s linear infinite; }
        @keyframes ssSpin { to { transform: rotate(360deg); } }
        .ss-fade { animation: ssFade 0.5s ease both; }
        @keyframes ssFade { from { opacity: 0; } to { opacity: 1; } }
        .chip { display:inline-flex; align-items:center; gap:5px; background:#fff; border:1px solid ${LINE}; border-radius:999px; padding:6px 12px; font-size:11.5px; font-weight:600; color:${DEEP}; }
      `}</style>

      {/* Subtle brand-tinted floral watermark, behind all content (matches /book) */}
      <FloralCorners idPrefix="scan" blush={ACCENT} gold={DEEP} opacity={0.9} />

      {/* HEADER */}
      <div style={{ width: "100%", maxWidth: 500, padding: "40px 22px 8px", textAlign: "center" }}>
        {brand?.logoUrl ? (
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#fff", boxShadow: "0 12px 30px -14px rgba(70,50,60,0.4)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: `1px solid ${ACCENT}33`, outline: "4px solid #fff" }}>
            <img src={brand.logoUrl} alt={brand.businessName || "קליניקה"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : brand?.businessName ? (
          <p className="serif" style={{ fontSize: 19, fontWeight: 700, color: DEEP, marginBottom: 6 }}>{brand.businessName}</p>
        ) : null}
        <p style={{ fontSize: 11, letterSpacing: "3px", color: ACCENT, fontWeight: 700, marginBottom: 10 }}>ניתוח עור אישי</p>
        <h1 className="serif" style={{ fontSize: 30, fontWeight: 700, color: DEEP, lineHeight: 1.25, marginBottom: 8 }}>{brand?.welcomeHeadline || <>הכירי את העור שלך —<br />וקבלי המלצה מקצועית</>}</h1>
        <p style={{ fontSize: 13.5, color: INK2, fontWeight: 500, lineHeight: 1.6 }}>{brand?.welcomeMessage || "העלי תמונה אחת, וקבלי ניתוח אישי והמלצת טיפול תוך כדקה."}</p>
      </div>

      <div style={{ width: "100%", maxWidth: 500, padding: "14px 20px 0" }}>

        {/* ===== WELCOME + UPLOAD / PREVIEW ===== */}
        {!report && (
          <div className="ss-card" style={{ ...card, padding: "22px 20px 24px", borderRadius: 22, textAlign: "center" }}>
            {!preview && !loading && (
              <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
                <span className="chip">✦ ניתוח אישי</span>
                <span className="chip">✦ המלצה מקצועית</span>
                <span className="chip">✦ כ‑60 שניות</span>
              </div>
            )}

            {/* 3-ANGLE CAPTURE — front (required, analyzed) + optional left/right profiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {[
                { key: "front", label: "חזית", req: true, thumb: preview, onPick: () => fileRef.current?.click() },
                { key: "left", label: "פרופיל שמאל", req: false, thumb: leftPreview, onPick: () => leftRef.current?.click() },
                { key: "right", label: "פרופיל ימין", req: false, thumb: rightPreview, onPick: () => rightRef.current?.click() },
              ].map((a) => (
                <div key={a.key} onClick={a.onPick} style={{ cursor: "pointer", borderRadius: 16, overflow: "hidden", position: "relative", aspectRatio: "3 / 4", border: a.thumb ? `1px solid ${LINE}` : `1.5px dashed #E4C4D6`, background: a.thumb ? "#fff" : "linear-gradient(180deg,#FDF7FB,#FBF3F8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                  {a.thumb ? (
                    <>
                      <img src={a.thumb} alt={a.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(58,46,56,0.55)", color: "#fff", fontSize: 10.5, fontWeight: 600, padding: "3px 0" }}>{a.label} · החלפה</span>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>📷</div>
                      <p style={{ fontSize: 11.5, fontWeight: 700, color: DEEP, lineHeight: 1.3 }}>{a.label}</p>
                      <p style={{ fontSize: 9.5, color: INK2, marginTop: 2 }}>{a.req ? "חובה" : "אופציונלי"}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#6A5E66", lineHeight: 1.55, marginBottom: 14, textAlign: "center" }}>
              לניתוח מקצועי מדויק — צלמי שלוש זוויות: <b style={{ color: DEEP }}>חזית</b>, פרופיל שמאל ופרופיל ימין. החזית חובה, הפרופילים מומלצים.
            </p>

            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFront} style={{ display: "none" }} />
            <input ref={leftRef} type="file" accept="image/*" capture="user" onChange={(e) => handleSide(e, "left")} style={{ display: "none" }} />
            <input ref={rightRef} type="file" accept="image/*" capture="user" onChange={(e) => handleSide(e, "right")} style={{ display: "none" }} />

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
                <button onClick={analyze} className="ss-btn" style={{ width: "100%", padding: "16px 0", borderRadius: 15, background: `linear-gradient(135deg,${ACCENT},${DEEP})`, color: "#fff", fontSize: 16.5, fontWeight: 700, boxShadow: `0 10px 26px rgba(91,62,103,0.28)` }}>קבלי את הניתוח שלך ✦</button>
              )
            )}
          </div>
        )}

        {/* ===== RESULTS — read as a consultation ===== */}
        {report && (
          <div className="ss-card">

            {/* MEDICAL DISCLAIMER — clear + visible at the very top of the results */}
            <div style={{ ...card, background: "#FBF6FA", border: "1px solid #EAD9E6", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
              <p style={{ fontSize: 12, color: "#6A5E66", lineHeight: 1.6, fontWeight: 500 }}>הסריקה נועדה להתרשמות ראשונית בלבד ואינה מחליפה ייעוץ או אבחון מקצועי. אין להסתמך על ההמלצות כאבחנה סופית.</p>
            </div>

            {/* 1) OVERALL SUMMARY — score + type + warm one-liner */}
            <div style={{ ...card, padding: "26px 20px", borderRadius: 22, textAlign: "center" }}>
              <p style={{ ...sectionLabel, marginBottom: 12 }}>מדד בריאות העור שלך</p>
              <div style={{ width: 116, height: 116, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", border: `6px solid ${scoreColor(report.score)}`, background: "#fff" }}>
                <span className="serif" style={{ fontSize: 40, fontWeight: 700, color: scoreColor(report.score) }}>{report.score}</span>
              </div>
              <p className="serif" style={{ fontSize: 18, fontWeight: 600, color: INK, marginTop: 14 }}>{report.skin_type}</p>
              {report.summary && <p style={{ fontSize: 14, color: "#5A4E54", lineHeight: 1.7, marginTop: 8 }}>{report.summary}</p>}
            </div>

            {/* 2) POSITIVE OBSERVATIONS — build confidence first (from the real score band) */}
            <div style={{ ...card, background: "linear-gradient(180deg,#F3FBF6,#FBFEFC)", border: "1px solid #D4EEDD" }}>
              <p style={{ ...sectionLabel, color: "#3E9E6B" }}>החדשות הטובות</p>
              <p style={{ fontSize: 14, color: "#2F5A44", lineHeight: 1.65, fontWeight: 500 }}>{positiveNote(report.score)}</p>
            </div>

            {/* 3) MAIN CONCERNS — clear, calm cards */}
            {concerns.length > 0 && (
              <div style={card}>
                <p style={sectionLabel}>מה שכדאי לשים לב אליו</p>
                {concerns.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 0", borderTop: i > 0 ? `1px solid ${LINE}` : "none" }}>
                    <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, background: "#FBF0F6", color: ACCENT, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
                    <div>
                      <p style={{ fontSize: 14, color: INK, lineHeight: 1.55, fontWeight: 500 }}>{c}</p>
                      <p style={{ fontSize: 11.5, color: "#9A8E96", marginTop: 2 }}>ניתן לשיפור עם ליווי וטיפול מותאם</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4) PRIORITY — what to focus on first (the top concern) */}
            {priority && (
              <div style={{ ...card, background: "#FBF6FA", borderColor: "#EAD9E6" }}>
                <p style={sectionLabel}>במה נתמקד קודם</p>
                <p style={{ fontSize: 14.5, color: DEEP, fontWeight: 700, lineHeight: 1.5 }}>{priority}</p>
                <p style={{ fontSize: 12.5, color: "#6A5E66", lineHeight: 1.6, marginTop: 5 }}>מכאן הכי כדאי להתחיל — הטיפול שנמליץ עליו מטפל בדיוק בזה.</p>
              </div>
            )}

            {/* 5) RECOMMENDED TREATMENT — one primary recommendation + Book (money moment) */}
            <div className="ss-card" style={{ background: `linear-gradient(140deg,${DEEP} 0%,${ACCENT} 100%)`, borderRadius: 20, padding: "22px 20px", boxShadow: `0 12px 30px rgba(91,62,103,0.30)`, marginBottom: 14, textAlign: "center" }}>
              <p style={{ fontSize: 11.5, color: "#fff", opacity: 0.85, letterSpacing: "1px", marginBottom: 6 }}>הטיפול המקצועי שהכי מתאים לך</p>
              <p className="serif" style={{ fontSize: 21, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{report.clinical_treatment || (report.matched_service || "התאמת טיפול אישית בקליניקה")}</p>
              {report.matched_service && <p style={{ fontSize: 13, color: "#fff", opacity: 0.92, marginBottom: 4 }}>אצלנו בקליניקה: {report.matched_service}</p>}
              {(plan.sessions || plan.treatment_type) && <p style={{ fontSize: 12, color: "#fff", opacity: 0.85, marginBottom: 4 }}>{[plan.treatment_type, plan.sessions].filter(Boolean).join(" · ")}</p>}
              <p style={{ fontSize: 12.5, color: "#fff", opacity: 0.9, lineHeight: 1.6, margin: "8px 0 16px" }}>נבחר במיוחד עבורך — כדי לטפל במה שזוהה בעור ולחדד את התוצאה.</p>
              {bookCard(ctaText + " ✦")}
              <p style={{ fontSize: 11, color: "#fff", opacity: 0.8, marginTop: 10 }}>נשמור לך את הפרטים והטיפול — בלי למלא מחדש</p>
            </div>

            {/* 6) EXPECTED BENEFIT — from clinic_plan.expected_results (real data) */}
            {plan.expected_results && (
              <div style={{ ...card, borderColor: "#DCEBE1", background: "linear-gradient(180deg,#F6FBF8,#FBFEFC)" }}>
                <p style={{ ...sectionLabel, color: "#3E9E6B" }}>מה אפשר לצפות</p>
                <p style={{ fontSize: 14, color: "#2F5A44", lineHeight: 1.7 }}>{plan.expected_results}</p>
              </div>
            )}

            {/* Skincare routine — valuable but secondary, collapsed */}
            {(report.routine_morning?.length > 0 || report.routine_evening?.length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowRoutine(!showRoutine)} className="ss-btn" style={{ width: "100%", padding: "13px 18px", borderRadius: 16, background: "#fff", color: DEEP, fontSize: 13.5, fontWeight: 700, border: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>שגרת הטיפוח האישית שלך לבית</span><span style={{ color: ACCENT }}>{showRoutine ? "▲" : "▼"}</span>
                </button>
                {showRoutine && (
                  <div className="ss-fade" style={{ marginTop: 12 }}>
                    {report.routine_morning?.length > 0 && (
                      <div style={card}><p style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>בוקר</p>
                        {report.routine_morning.map((t, i) => (<div key={i} style={{ display: "flex", gap: 9, marginBottom: 7 }}><span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{i + 1}</span><p style={{ fontSize: 13, color: "#5A4E54", lineHeight: 1.5 }}>{t}</p></div>))}
                      </div>
                    )}
                    {report.routine_evening?.length > 0 && (
                      <div style={card}><p style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>ערב</p>
                        {report.routine_evening.map((t, i) => (<div key={i} style={{ display: "flex", gap: 9, marginBottom: 7 }}><span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, flexShrink: 0, marginTop: 1 }}>{i + 1}</span><p style={{ fontSize: 13, color: "#5A4E54", lineHeight: 1.5 }}>{t}</p></div>))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 7) NEXT STEP — Book (primary, always reachable) + WhatsApp (secondary) */}
            <div style={{ ...card, background: "linear-gradient(140deg,#FBF4F8,#F6EEF4)", borderColor: "#EAD9E6", textAlign: "center" }}>
              <p style={sectionLabel}>הצעד הבא</p>
              <p style={{ fontSize: 14.5, color: DEEP, fontWeight: 700, marginBottom: 4 }}>מוכנה להתחיל?</p>
              <p style={{ fontSize: 12.5, color: "#6A5E66", lineHeight: 1.6, marginBottom: 14 }}>נשריין לך תור לטיפול המומלץ — הפרטים שלך כבר נשמרים.</p>
              <a href={bookHref()} style={{ display: "block", textDecoration: "none", background: `linear-gradient(135deg,${ACCENT},${DEEP})`, color: "#fff", padding: "15px 0", borderRadius: 14, fontSize: 16, fontWeight: 800, boxShadow: `0 10px 24px rgba(91,62,103,0.28)` }}>{ctaText} ✦</a>
            </div>

            {/* SECONDARY — full report on WhatsApp (also captures the lead) */}
            <div style={{ ...card, background: "#F3FBF5", border: "1px solid #CDECD7" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 34, marginBottom: 6 }}>✓</div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#2E9E5B" }}>הדוח נשלח לוואטסאפ שלך</p>
                  <p style={{ fontSize: 12.5, color: "#5A7A65", marginTop: 4 }}>שמרנו לך גם את הפרטים לקביעת התור 💚</p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#2E7D4F", marginBottom: 3 }}>מעדיפה בוואטסאפ? נדבר.</p>
                  <p style={{ fontSize: 12, color: "#5A7A65", marginBottom: 12 }}>נשלח לך את הניתוח המלא לנייד — ונשמח לענות על כל שאלה.</p>
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="שם (לא חובה)" style={{ width: "100%", border: "1.5px solid #CDECD7", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 9 }} />
                  <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} type="tel" inputMode="tel" placeholder="טלפון נייד" style={{ width: "100%", border: "1.5px solid #CDECD7", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
                  {sendError && <p style={{ color: "#C0392B", fontSize: 12.5, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{sendError}</p>}
                  <button onClick={sendReport} disabled={sending} className="ss-btn" style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: "#25D366", color: "#fff", fontSize: 14.5, fontWeight: 700, boxShadow: "0 6px 16px rgba(37,211,102,0.32)" }}>{sending ? "שולחת…" : "שליחה לוואטסאפ שלי"}</button>
                </>
              )}
            </div>

            {/* TRUST — reassuring, honest */}
            <div style={{ ...card, background: "#FBFAFC", borderColor: LINE }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: DEEP, marginBottom: 6 }}>איך זה עובד</p>
              {["הניתוח מבוסס על התמונה והמידע שהעלית.", "התוצאות מיועדות כהכוונה קוסמטית מקצועית — לא כאבחון רפואי.", "פגישת ייעוץ בקליניקה תאפשר התאמה אישית מלאה עבורך."].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < 2 ? 5 : 0 }}>
                  <span style={{ color: ACCENT, fontSize: 12, flexShrink: 0, marginTop: 1 }}>✦</span>
                  <p style={{ fontSize: 12, color: "#6A5E66", lineHeight: 1.55 }}>{t}</p>
                </div>
              ))}
            </div>

            {/* THERAPIST SECTION — de-emphasized */}
            {report.therapist_notes && (
              <>
                <button onClick={() => setShowPro(!showPro)} className="ss-btn" style={{ width: "100%", padding: "11px 0", borderRadius: 12, background: "transparent", color: INK2, fontSize: 12, fontWeight: 600, border: `1px solid ${LINE}`, marginBottom: 12 }}>{showPro ? "הסתרת החלק המקצועי" : "חלק מקצועי למטפלת"}</button>
                {showPro && (
                  <div className="ss-fade" style={{ background: "#F8F3FC", borderRadius: 16, padding: "18px", border: "1px solid #E9DAF2", marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#6B4A8C", marginBottom: 12 }}>הערות קליניות למטפלת</p>
                    {pro.skin_assessment && (<div style={{ marginBottom: 12 }}><p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 3 }}>הערכת עור</p><p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.skin_assessment}</p></div>)}
                    {pro.active_ingredients?.length > 0 && (<div style={{ marginBottom: 12 }}><p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 5 }}>מרכיבים פעילים מומלצים</p>{pro.active_ingredients.map((a, i) => (<div key={i} style={{ display: "flex", gap: 7, marginBottom: 4 }}><span style={{ fontSize: 12, color: "#9B7AB8", flexShrink: 0 }}>•</span><p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.5 }}>{a}</p></div>))}</div>)}
                    {pro.protocol && (<div style={{ marginBottom: 12 }}><p style={{ fontSize: 12, fontWeight: 700, color: "#6B4A8C", marginBottom: 3 }}>פרוטוקול טיפול</p><p style={{ fontSize: 13, color: "#4A3A52", lineHeight: 1.55 }}>{pro.protocol}</p></div>)}
                    {pro.cautions && (<div style={{ background: "#FFF4F4", borderRadius: 10, padding: "10px 12px", border: "1px solid #F5D0D0" }}><p style={{ fontSize: 12, fontWeight: 700, color: "#C0392B", marginBottom: 3 }}>אזהרות / תשומת לב</p><p style={{ fontSize: 12.5, color: "#7A4A4A", lineHeight: 1.5 }}>{pro.cautions}</p></div>)}
                  </div>
                )}
              </>
            )}

            <button onClick={reset} className="ss-btn" style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: "transparent", color: INK2, fontSize: 13, fontWeight: 600 }}>סריקה חדשה</button>
          </div>
        )}

      </div>

      <div style={{ marginTop: "auto", paddingTop: 30, fontSize: 11, color: "#C6B4BF" }}>מופעל ע"י BloomOS</div>
    </div>
  );
}

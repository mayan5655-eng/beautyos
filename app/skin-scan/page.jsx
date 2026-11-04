"use client";
import { useState, useRef, useEffect } from "react";
import Icon from "../Icon";
import Spinner from "../Spinner";
import { supabase } from "../supabase";
import { fetchPublicBranding } from "@/lib/branding";
import { accentStyle } from "@/lib/theme";
import { viewOfReport, ingredientsOf, refusalOf, isTenantId, INVALID_LINK_HE } from "@/lib/skinScanView";
import { Watermark, PoweredBy } from "../PublicChrome";

// ============================================================
// AI SKIN SCANNER PAGE  /skin-scan  (v7, clinical results view, 2026-11-04)
// Same engine as before: reads ?t=<tenantId>&s=<signature>, calls /api/skin-scan, /api/skin-scan/send and
// /api/skin-scan/lead, books via /book. Only the EXPERIENCE changed:
//   capture  - a camera-style framing guide (face oval, alignment ticks), lighting/position tips, a front then
//              optional left/right progress with thumbnails, a privacy line right under the consent boxes.
//   wait     - a scan line and soft zone highlights over HER OWN front photo, with a step list driven by loadStep.
//   results  - summary card, a zone map on her photo (zones the concerns name), concern cards with a severity meter
//              (only when the model returned concern_levels), the matched treatment with booking, AM/PM timeline.
// Every value shown comes from the report (lib/skinScanView.ts). Nothing is invented: no extra scores, no faces.
// prefers-reduced-motion turns every animation off.
// ============================================================

// The clinic's accent family, as CSS variables. accentStyle() sets --pc, --pc-deep, --pc-text, --pc-contrast ...
// on the page root from her primary_color. Text in her colour always reads --pc-text (4.5:1 on white and cream);
// --pc is a fill only, and text on it is --pc-contrast (lib/theme contrastOn).
const ACCENT_TEXT = "var(--pc-text, #A75C52)";
const INK = "var(--ink, #1F3A30)";
const INK2 = "var(--ink-2, #44594F)";

// Normalize a phone into an international wa.me target (Israel-aware).
function normalizeWa(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return d;
}

// The wait. loadStep walks these in order and holds on the last one until the answer arrives (the call takes
// tens of seconds). `zones` are the highlights drawn over her photo while that step is current.
const SCAN_STEPS = [
  { t: "מזהה את אזורי הפנים", zones: ["forehead", "eyes", "nose", "cheeks", "chin"] },
  { t: "בודקת לחות ומרקם", zones: ["cheeks"] },
  { t: "מעריכה גוון והארה במצח ובאף", zones: ["forehead", "nose"] },
  { t: "בודקת את אזור העיניים", zones: ["eyes"] },
  { t: "מתאימה טיפול מהשירותים של העסק", zones: [] },
  { t: "מסכמת עבורך את הדוח", zones: [] },
];
const STEP_MS = 3200;

// Viewfinder geometry, in a 300x400 (3:4) box. The face oval is what the guide asks her to fill, and every zone
// position on this page is a percentage of THAT oval, so the marks are an estimate of where the zone is, said so
// on screen, never a face detection.
const OV = { cx: 150, cy: 192, rx: 102, ry: 160 };
const ovX = (p) => OV.cx + ((p - 50) / 50) * OV.rx;
const ovY = (p) => OV.cy + ((p - 50) / 50) * OV.ry;
const SCAN_SHAPES = {
  forehead: [{ x: 50, y: 22, rx: 21, ry: 8 }],
  eyes: [{ x: 35, y: 47, rx: 10, ry: 3.6 }, { x: 65, y: 47, rx: 10, ry: 3.6 }],
  nose: [{ x: 50, y: 55, rx: 7, ry: 11 }],
  cheeks: [{ x: 27, y: 63, rx: 12, ry: 9 }, { x: 73, y: 63, rx: 12, ry: 9 }],
  chin: [{ x: 50, y: 86, rx: 11, ry: 5 }],
};
const OVAL_D = `M${OV.cx - OV.rx} ${OV.cy}a${OV.rx} ${OV.ry} 0 1 0 ${OV.rx * 2} 0a${OV.rx} ${OV.ry} 0 1 0 ${-OV.rx * 2} 0Z`;

// The camera frame: guide (before / after the front photo), scan (the wait), map (the results).
function Viewfinder({ src, mode, activeZones = [], marks = [], label, onPick }) {
  const onPhoto = !!src;
  const line = onPhoto ? "rgba(255,255,255,0.92)" : "var(--pc-deep, #C48E87)";
  const bracket = onPhoto ? "rgba(255,255,255,0.95)" : INK;
  const eyeY = ovY(43);
  const body = (
    <>
      {src ? <img src={src} alt={mode === "map" ? "תמונת החזית שלך עם האזורים מהדוח" : "תמונת החזית שלך"} className="ss-vf-img" /> : null}
      <svg viewBox="0 0 300 400" className="ss-vf-svg" aria-hidden="true">
        {onPhoto && <path d={`M0 0H300V400H0Z ${OVAL_D}`} fillRule="evenodd" fill={mode === "map" ? "rgba(20,24,22,0.22)" : "rgba(20,24,22,0.34)"} />}
        <ellipse cx={OV.cx} cy={OV.cy} rx={OV.rx} ry={OV.ry} fill="none" stroke={line} strokeWidth={mode === "guide" && !onPhoto ? 2 : 1.5} strokeDasharray={mode === "guide" ? "7 7" : "none"} opacity={mode === "map" ? 0.7 : 1} />
        {/* alignment ticks: eye line at the sides, centre line top and bottom */}
        {mode !== "map" && (
          <g stroke={line} strokeWidth="2" strokeLinecap="round">
            <path d={`M${OV.cx - OV.rx - 16} ${eyeY}H${OV.cx - OV.rx - 4}M${OV.cx + OV.rx + 4} ${eyeY}H${OV.cx + OV.rx + 16}`} />
            <path d={`M150 ${OV.cy - OV.ry - 14}V${OV.cy - OV.ry - 4}M150 ${OV.cy + OV.ry + 4}V${OV.cy + OV.ry + 14}`} />
          </g>
        )}
        <g fill="none" stroke={bracket} strokeWidth="3" strokeLinecap="round" opacity={mode === "map" ? 0.6 : 1}>
          <path d="M16 54V28a12 12 0 0 1 12-12h26" />
          <path d="M284 54V28a12 12 0 0 0-12-12h-26" />
          <path d="M16 346v26a12 12 0 0 0 12 12h26" />
          <path d="M284 346v26a12 12 0 0 1-12 12h-26" />
        </g>
        {mode === "scan" && Object.entries(SCAN_SHAPES).map(([k, shapes]) => shapes.map((s, j) => (
          <ellipse key={k + j} className={"ss-zone" + (activeZones.includes(k) ? " on" : "")} cx={ovX(s.x)} cy={ovY(s.y)} rx={(s.rx / 50) * OV.rx} ry={(s.ry / 50) * OV.ry} />
        )))}
        {mode === "map" && marks.map((m) => m.points.map(([x, y], j) => (
          <g key={m.key + j}>
            <circle cx={ovX(x)} cy={ovY(y)} r="15" fill="rgba(255,255,255,0.35)" />
            <circle cx={ovX(x)} cy={ovY(y)} r="11" style={{ fill: "var(--pc, #E9A9A1)" }} stroke="#FFFFFF" strokeWidth="2" />
            <text x={ovX(x)} y={ovY(y)} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" style={{ fill: "var(--pc-contrast, #14261F)" }}>{m.n}</text>
          </g>
        )))}
      </svg>
      {mode === "scan" && <div className="ss-scanwrap" aria-hidden="true"><div className="ss-scanline" /></div>}
      {mode === "guide" && !onPhoto && (
        <div className="ss-vf-empty">
          <Icon name="camera" size={26} />
          <span>{label}</span>
        </div>
      )}
    </>
  );
  if (onPick) return <button type="button" className="ss-vf ss-vf-btn" data-mode={mode} onClick={onPick} aria-label={label}>{body}</button>;
  return <div className="ss-vf" data-mode={mode}>{body}</div>;
}

export default function SkinScanPage() {
  const [preview, setPreview] = useState(null);         // FRONT photo (primary, analyzed)
  const [imageData, setImageData] = useState(null);
  // Before the camera opens: she is 18 or over, and she agrees that a photo
  // of her face goes to an automated analysis. Both gate the photo pickers
  // and the analyse button; neither is stored - a refusal simply means no
  // photo is taken. Interim wording until the lawyer's answer.
  const [isAdult, setIsAdult] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [gateError, setGateError] = useState("");
  const gateOk = isAdult && photoConsent;
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [leftPreview, setLeftPreview] = useState(null);   // optional left-profile photo
  const [rightPreview, setRightPreview] = useState(null); // optional right-profile photo
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [report, setReport] = useState(null);
  const [reportToken, setReportToken] = useState(""); // the scan route signs the report it returns; /send only accepts a signed one
  const [errorMsg, setErrorMsg] = useState("");
  // A refusal the client cannot fix by retaking the photo (route flags: quotaExceeded, scannerUnavailable,
  // business_paused). The message shown is always the route's own.
  const [refusal, setRefusal] = useState(null);
  const [linkError, setLinkError] = useState(false);
  const [showPro, setShowPro] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);
  const [routineTab, setRoutineTab] = useState("am");

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentQueued, setSentQueued] = useState(false); // /send said queued: waiting in her WhatsApp queue, not sent yet
  const [sendError, setSendError] = useState("");

  const [tenantId, setTenantId] = useState("");
  const [scanSig, setScanSig] = useState("");
  const [brand, setBrand] = useState(null); // resolved clinic branding (safe fallbacks)

  const fileRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("t");
      if (t) setTenantId(t);
      // No business at all in the link: nothing on this page can work, say so before she takes a photo.
      // (A link without `s` is still allowed through: her own signed-in session is admitted by the route.)
      if (!isTenantId(t)) setLinkError(true);
      const sig = params.get("s");
      if (sig) setScanSig(sig);
    } catch {}
  }, []);

  // Load the clinic's branding (public-safe fields only). Strictly tenant-scoped;
  // missing/invalid tenant or error -> neutral Kalmea defaults (never another clinic).
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    fetchPublicBranding(supabase, tenantId).then((b) => { if (alive) setBrand(b); });
    return () => { alive = false; };
  }, [tenantId]);

  // The wait advances step by step and holds on the last step (no loop back to the start).
  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const id = setInterval(() => setLoadStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), STEP_MS);
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

  // FRONT photo is the primary image the AI analyzes (sets preview + imageData + mediaType); engine call unchanged.
  const handleFront = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(""); setReport(null); setShowPro(false); setShowRoutine(false); setSent(false); setSentQueued(false); setSendError("");
    processImage(file, ({ dataUrl, mediaType }) => { setMediaType(mediaType); setPreview(dataUrl); setImageData(dataUrl.split(",")[1]); });
  };

  // LEFT / RIGHT profile photos: optional, preview only (the single-image engine analyzes the front).
  const handleSide = (e, which) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImage(file, ({ dataUrl }) => { (which === "left" ? setLeftPreview : setRightPreview)(dataUrl); });
  };

  const analyze = async () => {
    if (!imageData || loading) return;
    setLoading(true); setErrorMsg(""); setReport(null); setRefusal(null);
    // The scan view replaces the capture card, which is much taller: bring her back up to her photo.
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    try {
      const res = await fetch("/api/skin-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: imageData, mediaType, tenantId, s: scanSig }) });
      const data = await res.json();
      if (data.success) { setReport(data.report); setReportToken(data.reportToken || ""); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} }
      else {
        const kind = refusalOf(data);
        if (kind === "link") setLinkError(true);
        else if (kind) setRefusal(kind);
        setErrorMsg(data.error || "אירעה שגיאה. נסי שוב.");
      }
    } catch (err) { setErrorMsg("שגיאת חיבור. נסי שוב."); } finally { setLoading(false); }
  };

  const sendReport = async () => {
    setSendError("");
    if (!clientPhone.trim()) { setSendError("נא להזין מספר טלפון"); return; }
    if (sending || sent) return; // duplicate-send / duplicate-lead guard
    setSending(true);
    try {
      const res = await fetch("/api/skin-scan/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, reportToken, clientName: clientName.trim(), clientPhone: clientPhone.trim(), tenantId }) });
      const data = await res.json();
      if (data.success) { setSent(true); setSentQueued(!!data.queued); } else setSendError(data.error || "השליחה נכשלה. נסי שוב.");
    } catch (err) { setSendError("שגיאת חיבור. נסי שוב."); } finally { setSending(false); }
  };

  const reset = () => {
    setPreview(null); setImageData(null); setReport(null); setReportToken(""); setErrorMsg(""); setShowPro(false); setShowRoutine(false);
    setLeftPreview(null); setRightPreview(null); setRefusal(null); setRoutineTab("am");
    setClientName(""); setClientPhone(""); setSent(false); setSentQueued(false); setSendError("");
    if (fileRef.current) fileRef.current.value = "";
    if (leftRef.current) leftRef.current.value = "";
    if (rightRef.current) rightRef.current.value = "";
  };

  // Booking that PRESERVES context (treatment + name + phone), no re-entry.
  // Null without a tenant: /book cannot resolve a business from nothing, so
  // a bare "/book" link would land the client on an error page. The callers
  // render no button in that case.
  const bookHref = () => {
    if (!tenantId) return null;
    const p = new URLSearchParams();
    p.set("t", tenantId);
    if (report?.matched_service) p.set("service", report.matched_service);
    if (clientName.trim()) p.set("name", clientName.trim());
    if (clientPhone.trim()) p.set("phone", clientPhone.trim());
    const qs = p.toString();
    return "/book" + (qs ? `?${qs}` : "");
  };

  // Her colour (safe-resolved in resolveBranding); null until branding loads,
  // which accentStyle renders as the default family.
  const accent = brand?.primary || null;
  const ctaText = (brand?.ctaLabel || "קביעת תור לטיפול");
  const wa = normalizeWa(brand?.whatsappNumber);

  // Booking-intent capture: when she proceeds to Book WITH a phone already on
  // file (entered in the WhatsApp card), upsert her as a "סורק העור" lead so
  // booking-intent visitors are captured too. keepalive lets the request finish
  // as the page navigates to /book. No phone -> skip (the /book flow captures
  // her on completion instead). Deduped server-side by tenant_id+phone.
  const captureBookingLead = () => {
    const phone = clientPhone.trim();
    if (!tenantId || !phone) return;
    try {
      fetch("/api/skin-scan/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, s: scanSig, name: clientName.trim(), phone, report }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };

  // Honest, encouraging framing derived from the REAL score band (not a fabricated
  // per-feature finding). Builds confidence before discussing concerns.
  const positiveNote = (s) =>
    s >= 75 ? "העור שלך במצב טוב, נקודת פתיחה מצוינת. נשמור על מה שיפה ונחדד את הפרטים."
    : s >= 55 ? "יש לך בסיס יפה לעבודה. עם ליווי מותאם אפשר לראות שיפור נעים וברור."
    : "יחד נבנה תוכנית מותאמת שתעשה שינוי אמיתי, צעד אחר צעד, בקצב שלך.";

  const view = viewOfReport(report);
  const pro = report?.therapist_notes || {};
  const plan = report?.clinic_plan || {};
  const hasPlan = !!(plan.sessions || plan.treatment_type);
  const actives = [...view.morning, ...view.evening].flatMap(ingredientsOf).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const hasRoutine = view.morning.length > 0 || view.evening.length > 0;
  const tab = view.morning.length === 0 ? "pm" : view.evening.length === 0 ? "am" : routineTab;
  const stage = report ? 3 : loading ? 2 : gateOk ? 1 : 0;
  const book = bookHref();
  const pickBlocked = () => setGateError("לפני הצילום: אשרי שאת בת 18 ומעלה ואת ההסכמה לניתוח התמונה.");
  const angles = [
    { key: "front", label: "חזית", req: true, thumb: preview, onPick: () => fileRef.current?.click() },
    { key: "left", label: "פרופיל שמאל", req: false, thumb: leftPreview, onPick: () => leftRef.current?.click() },
    { key: "right", label: "פרופיל ימין", req: false, thumb: rightPreview, onPick: () => rightRef.current?.click() },
  ];
  const taken = angles.filter((a) => a.thumb).length;

  const routineCol = (id, title, icon, steps) => (
    <section className="ss-rcol" data-col={id} aria-label={title}>
      <p className="ss-rcol-h"><Icon name={icon} size={16} /> {title}</p>
      <ol className="ss-tl">
        {steps.map((t, i) => {
          const ings = ingredientsOf(t);
          return (
            <li key={i}>
              <span className="ss-tl-n">{i + 1}</span>
              <div>
                <p className="ss-tl-t">{t}</p>
                {ings.length > 0 && <div className="ss-ings">{ings.map((g) => <bdi key={g} dir="ltr" className="ss-ing">{g}</bdi>)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );

  return (
    <div dir="rtl" className="ss-root" style={accentStyle(accent)}>
      <style>{`
        .ss-root { font-family: var(--font-assistant),'Assistant',sans-serif; background: var(--brand-cream, #FBF8F1); min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: 0 0 48px; color: ${INK}; position: relative; z-index: 0; overflow-x: hidden; }
        .ss-root *, .ss-root *::before, .ss-root *::after { box-sizing: border-box; }
        .ss-root p, .ss-root h1, .ss-root h2, .ss-root h3, .ss-root ol { margin: 0; }
        .ss-root ol { padding: 0; list-style: none; }
        .serif { font-family: var(--font-frank),'Frank Ruhl Libre',var(--font-assistant),serif; }
        .ss-wrap { width: 100%; max-width: 560px; padding: 0 16px; }
        .ss-card { background: var(--surface, #FFFFFF); border: 1px solid var(--line, #E8E1D1); border-radius: var(--r-card, 19px); padding: 20px 18px; box-shadow: var(--shadow-sm); margin-bottom: 14px; }
        .ss-in { animation: ssIn 0.5s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes ssIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .ss-eyebrow { font-size: var(--t-xs); letter-spacing: 0.04em; font-weight: 700; color: ${ACCENT_TEXT}; margin-bottom: 6px; }
        .ss-h2 { font-size: var(--t-xl); font-weight: 600; color: ${INK}; line-height: 1.3; }
        .ss-muted { font-size: var(--t-sm); color: ${INK2}; line-height: 1.6; }
        .ss-btn { cursor: pointer; border: none; font-family: inherit; transition: transform 0.15s, filter 0.2s, background 0.2s; -webkit-tap-highlight-color: transparent; }
        .ss-btn:active:not(:disabled) { transform: scale(0.98); }
        .ss-btn:disabled { opacity: 0.55; cursor: default; }
        .ss-btn:focus-visible, .ss-vf-btn:focus-visible, .ss-slot:focus-visible, .ss-root a:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
        .ss-primary { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 52px; padding: 0 18px; border-radius: var(--r-full, 999px); background: var(--pc, #E9A9A1); color: var(--pc-contrast, #14261F); border: 1px solid var(--pc-deep, #C48E87); font-size: var(--t-lg); font-weight: 700; text-decoration: none; box-shadow: var(--shadow-accent, none); }
        .ss-quiet { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; padding: 0 16px; border-radius: var(--r-md, 16px); background: var(--surface, #FFFFFF); color: ${INK}; border: 1px solid var(--line-2, #DAD2BF); font-size: var(--t-md); font-weight: 600; text-decoration: none; }
        .ss-wa { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 48px; border-radius: var(--r-md, 16px); background: #25D366; color: #0B2A1A; font-size: var(--t-md); font-weight: 700; text-decoration: none; }
        .ss-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface, #FFFFFF); border: 1px solid var(--line, #E8E1D1); border-radius: 999px; padding: 5px 11px; font-size: var(--t-xs); font-weight: 600; color: ${INK2}; }

        .ss-steps { display: flex; justify-content: center; gap: 6px; margin: 4px 0 16px; }
        .ss-step { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 9px; border-radius: 999px; font-size: var(--t-xs); font-weight: 700; color: ${INK2}; background: transparent; border: 1px solid var(--line, #E8E1D1); }
        .ss-step i { font-style: normal; width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; background: var(--surface-2, #F4EFE4); color: ${INK2}; }
        .ss-step[data-state="now"] { border-color: var(--pc-deep, #C48E87); color: ${INK}; background: var(--surface, #FFFFFF); }
        .ss-step[data-state="now"] i { background: var(--pc, #E9A9A1); color: var(--pc-contrast, #14261F); }
        .ss-step[data-state="done"] i { background: var(--ink, #1F3A30); color: #FFFFFF; }

        .ss-check { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 8px 0; cursor: pointer; }
        .ss-check input { width: 22px; height: 22px; margin: 1px 0 0; flex-shrink: 0; accent-color: var(--pc-deep, #C48E87); cursor: pointer; }
        .ss-check span { font-size: var(--t-md); color: ${INK2}; line-height: 1.55; }
        .ss-privacy { display: flex; gap: 8px; align-items: flex-start; margin-top: 6px; padding: 10px 12px; border-radius: var(--r-sm, 12px); background: var(--surface-2, #F4EFE4); font-size: var(--t-sm); color: ${INK2}; line-height: 1.55; }
        .ss-privacy svg { flex-shrink: 0; margin-top: 2px; color: ${INK}; }

        .ss-vf { position: relative; display: block; width: 100%; max-width: 288px; margin: 0 auto; aspect-ratio: 3 / 4; border-radius: 24px; overflow: hidden; background: radial-gradient(ellipse at 50% 46%, #FFFFFF 0%, #FFFFFF 38%, var(--surface-2, #F4EFE4) 100%); border: 1px solid var(--line, #E8E1D1); padding: 0; }
        .ss-vf-btn { cursor: pointer; font-family: inherit; }
        .ss-vf[data-mode="scan"] { max-width: 228px; }
        .ss-vf-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
        .ss-vf-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .ss-vf-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: ${INK}; font-size: var(--t-sm); font-weight: 700; pointer-events: none; }
        .ss-zone { fill: var(--pc, #E9A9A1); fill-opacity: 0; stroke: #FFFFFF; stroke-opacity: 0; stroke-width: 1.5; transition: fill-opacity 0.6s, stroke-opacity 0.6s; }
        .ss-zone.on { fill-opacity: 0.32; stroke-opacity: 0.9; animation: ssPulse 1.6s ease-in-out infinite; }
        @keyframes ssPulse { 0%, 100% { fill-opacity: 0.18; } 50% { fill-opacity: 0.4; } }
        .ss-scanwrap { position: absolute; inset: 0; animation: ssScan 2.8s ease-in-out infinite alternate; pointer-events: none; }
        .ss-scanline { position: absolute; left: 7%; right: 7%; top: 50%; height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, #FFFFFF 18%, #FFFFFF 82%, transparent); box-shadow: 0 0 12px 3px var(--pc-shadow, rgba(233,169,161,0.5)); }
        .ss-scanline::before { content: ""; position: absolute; left: 0; right: 0; bottom: 2px; height: 56px; background: linear-gradient(180deg, transparent, rgba(255,255,255,0.22)); }
        @keyframes ssScan { from { transform: translateY(-36%); } to { transform: translateY(38%); } }

        .ss-tips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
        .ss-tip { display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; padding: 10px 6px; border-radius: var(--r-sm, 12px); background: var(--surface-2, #F4EFE4); font-size: var(--t-xs); color: ${INK2}; line-height: 1.4; font-weight: 600; }
        .ss-tip svg { color: ${INK}; }
        .ss-angles-h { display: flex; justify-content: space-between; align-items: baseline; margin: 18px 0 8px; }
        .ss-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .ss-slot { position: relative; aspect-ratio: 3 / 4; border-radius: var(--r-md, 16px); overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px; background: var(--brand-cream, #FBF8F1); border: 1.5px dashed var(--line-2, #DAD2BF); color: ${INK}; }
        .ss-slot[data-filled="true"] { border: 1px solid var(--line, #E8E1D1); background: var(--surface, #FFFFFF); }
        .ss-slot[data-req="true"]:not([data-filled="true"]) { border-color: var(--pc-deep, #C48E87); }
        .ss-slot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .ss-slot-cap { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(20,24,22,0.62); color: #FFFFFF; font-size: var(--t-xs); font-weight: 600; padding: 4px 0; }
        .ss-slot-ok { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 50%; background: var(--ink, #1F3A30); color: #FFFFFF; display: flex; align-items: center; justify-content: center; }
        .ss-bar { height: 4px; border-radius: 4px; background: var(--surface-2, #F4EFE4); overflow: hidden; margin-top: 10px; }
        .ss-bar > span { display: block; height: 100%; background: var(--pc-deep, #C48E87); transition: width 0.4s; }

        .ss-list { display: flex; flex-direction: column; gap: 2px; margin-top: 14px; text-align: right; }
        .ss-list li { display: flex; align-items: center; gap: 10px; min-height: 34px; font-size: var(--t-md); color: ${INK2}; transition: color 0.3s; }
        .ss-list li[data-state="now"] { color: ${INK}; font-weight: 700; }
        .ss-list li[data-state="next"] { color: var(--ink-3, #546860); }
        .ss-dot { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid var(--line-2, #DAD2BF); }
        li[data-state="done"] .ss-dot { background: var(--ink, #1F3A30); border-color: var(--ink, #1F3A30); color: #FFFFFF; }
        li[data-state="now"] .ss-dot { border-color: var(--pc-deep, #C48E87); }
        li[data-state="now"] .ss-dot::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--pc-deep, #C48E87); animation: ssBlink 1.1s ease-in-out infinite; }
        @keyframes ssBlink { 50% { opacity: 0.25; } }
        .ss-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

        .ss-sum { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; }
        .ss-ring { position: relative; width: 104px; height: 104px; }
        .ss-ring svg { width: 104px; height: 104px; transform: rotate(-90deg); }
        .ss-ring-v { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
        .ss-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
        .ss-closing { margin-top: 14px; padding: 10px 12px; border-radius: var(--r-sm, 12px); background: var(--pc-tint, #FDF6F6); font-size: var(--t-sm); color: ${INK}; line-height: 1.55; }

        .ss-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 12px; }
        .ss-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: ${INK}; font-weight: 600; }
        .ss-legend b, .ss-cn { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: var(--t-xs); font-weight: 700; background: var(--pc, #E9A9A1); color: var(--pc-contrast, #14261F); flex-shrink: 0; }

        .ss-concern { display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--line, #E8E1D1); }
        .ss-concern:first-of-type { border-top: none; padding-top: 6px; }
        .ss-ctext { font-size: var(--t-md); color: ${INK}; line-height: 1.55; font-weight: 600; }
        .ss-ctags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 7px; }
        .ss-ztag { display: inline-flex; align-items: center; gap: 4px; font-size: var(--t-xs); font-weight: 600; color: ${INK2}; background: var(--surface-2, #F4EFE4); border-radius: 999px; padding: 3px 9px; }
        .ss-focus { font-size: var(--t-xs); font-weight: 700; color: ${ACCENT_TEXT}; border: 1px solid var(--pc, #E9A9A1); border-radius: 999px; padding: 2px 9px; }
        .ss-sev { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-xs); font-weight: 600; color: ${INK2}; }
        .ss-sev i { display: inline-block; width: 14px; height: 6px; border-radius: 3px; background: var(--line-2, #DAD2BF); margin-left: 2px; }
        .ss-sev i[data-on="true"] { background: var(--ink-2, #44594F); }

        .ss-treat { border-top: 4px solid var(--pc, #E9A9A1); background: linear-gradient(180deg, var(--pc-tint, #FDF6F6) 0%, var(--surface, #FFFFFF) 70%); text-align: center; padding: 22px 18px; }
        .ss-svc { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 6px 12px; border-radius: 999px; background: var(--surface, #FFFFFF); border: 1px solid var(--line, #E8E1D1); font-size: var(--t-sm); color: ${INK}; font-weight: 600; }

        .ss-toggle { width: 100%; min-height: 52px; padding: 0 18px; border-radius: var(--r-md, 16px); background: var(--surface, #FFFFFF); color: ${INK}; font-size: var(--t-md); font-weight: 700; border: 1px solid var(--line, #E8E1D1); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .ss-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: var(--surface-2, #F4EFE4); margin-bottom: 14px; }
        .ss-tabs button { min-height: 44px; border-radius: 999px; background: transparent; color: ${INK2}; font-size: var(--t-md); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .ss-tabs button[aria-selected="true"] { background: var(--surface, #FFFFFF); color: ${INK}; box-shadow: var(--shadow-xs); }
        .ss-routine { display: grid; gap: 16px; }
        .ss-rcol-h { display: flex; align-items: center; gap: 6px; font-size: var(--t-md); font-weight: 700; color: ${INK}; margin-bottom: 10px; }
        .ss-tl li { position: relative; display: flex; gap: 12px; padding-bottom: 14px; }
        .ss-tl li:not(:last-child)::before { content: ""; position: absolute; right: 11px; top: 24px; bottom: 0; width: 1.5px; background: var(--line, #E8E1D1); }
        .ss-tl-n { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: var(--t-xs); font-weight: 700; border: 1.5px solid var(--pc-deep, #C48E87); color: ${INK}; background: var(--surface, #FFFFFF); position: relative; }
        .ss-tl-t { font-size: var(--t-md); color: ${INK}; line-height: 1.5; padding-top: 2px; }
        .ss-ings { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; justify-content: flex-start; }
        .ss-ing { display: inline-block; font-size: var(--t-xs); font-weight: 600; color: ${INK}; background: var(--pc-tint, #FDF6F6); border: 1px solid var(--pc-tint-2, #FBF0EE); border-radius: 6px; padding: 2px 8px; font-family: var(--font-inter), var(--font-assistant), sans-serif; }
        @media (max-width: 559px) {
          .ss-routine[data-tab="am"] [data-col="pm"], .ss-routine[data-tab="pm"] [data-col="am"] { display: none; }
          .ss-routine[data-tabs="true"] .ss-rcol-h { display: none; }
        }
        @media (min-width: 560px) {
          .ss-routine { grid-template-columns: 1fr 1fr; gap: 20px; }
          .ss-tabs { display: none; }
        }
        .ss-input { width: 100%; min-height: 48px; border: 1.5px solid var(--line-2, #DAD2BF); border-radius: var(--r-sm, 12px); padding: 0 14px; font-size: var(--t-lg); font-family: inherit; direction: rtl; background: var(--surface, #FFFFFF); color: ${INK}; margin-bottom: 10px; }
        .ss-input:focus { outline: 2px solid var(--pc-deep, #C48E87); outline-offset: 1px; }
        .ss-pro-row { padding: 9px 0; border-top: 1px solid var(--line, #E8E1D1); }
        .ss-pro-row:first-of-type { border-top: none; }
        .ss-pro-k { font-size: var(--t-xs); font-weight: 700; color: ${INK2}; margin-bottom: 2px; }
        .ss-pro-v { font-size: var(--t-md); color: ${INK}; line-height: 1.5; }
        .ss-err { background: rgba(192,57,79,0.07); border: 1px solid rgba(192,57,79,0.18); border-radius: var(--r-sm, 12px); padding: 10px 12px; margin-top: 14px; text-align: center; }
        .ss-err p { color: var(--danger, #C0394F); }

        @media (prefers-reduced-motion: reduce) {
          .ss-in, .ss-zone.on, .ss-scanwrap, li[data-state="now"] .ss-dot::after { animation: none !important; }
          .ss-scanwrap { display: none; }
          .ss-zone, .ss-bar > span, .ss-list li, .ss-btn { transition: none !important; }
        }
      `}</style>

      {/* One quiet flower behind everything (the public-page language: one watermark per page) */}
      <Watermark />

      {/* HEADER. Her logo at natural aspect on a soft surface (contain never crops), else her name. */}
      <div className="ss-wrap" style={{ paddingTop: 36, paddingBottom: 10, textAlign: "center" }}>
        {brand?.logoUrl ? (
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface, #FFFFFF)", borderRadius: "var(--r-card)", padding: "10px 16px", boxShadow: "var(--shadow-md)", margin: "0 auto 12px", border: "1px solid var(--line, #E8E1D1)", maxWidth: "80%" }}>
            <img src={brand.logoUrl} alt={brand.businessName || "קליניקה"} style={{ maxHeight: 84, maxWidth: 220, width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
          </div>
        ) : brand?.businessName ? (
          <p className="pub-biz-name" style={{ color: INK, marginBottom: 8 }}>{brand.businessName}</p>
        ) : null}
        <p className="ss-eyebrow">ניתוח עור אישי</p>
        {!linkError && (
          <h1 className="serif" style={{ fontSize: "var(--t-3xl)", fontWeight: 700, color: INK, lineHeight: 1.25, margin: "0 0 8px" }}>
            {report ? "דוח העור שלך מוכן" : (brand?.welcomeHeadline || <>הכירי את העור שלך<br />וקבלי המלצה מקצועית</>)}
          </h1>
        )}
        {!report && !linkError && !loading && <p style={{ fontSize: "var(--t-md)", color: INK2, lineHeight: 1.6 }}>{brand?.welcomeMessage || "העלי תמונה אחת, וקבלי ניתוח אישי והמלצת טיפול תוך כדקה."}</p>}
        {!report && !loading && !linkError && !refusal && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            <span className="ss-chip"><Icon name="sparkle" size={12} /> ניתוח אישי</span>
            <span className="ss-chip"><Icon name="spa" size={12} /> המלצה מקצועית</span>
            <span className="ss-chip"><Icon name="clock" size={12} /> כדקה</span>
          </div>
        )}
      </div>

      <div className="ss-wrap">
        {/* Progress: consent, photo, analysis */}
        {!report && !linkError && !refusal && (
          <ol className="ss-steps" aria-label="שלבי הסריקה">
            {["אישור", "צילום", "ניתוח"].map((s, i) => {
              const state = i < stage ? "done" : i === stage ? "now" : "next";
              return (
                <li key={s} className="ss-step" data-state={state} aria-current={state === "now" ? "step" : undefined}>
                  <i>{state === "done" ? <Icon name="check" size={11} strokeWidth={2.6} /> : i + 1}</i>{s}
                </li>
              );
            })}
          </ol>
        )}

        {/* ===== LINK ERROR ===== */}
        {linkError && (
          <div className="ss-card ss-in" style={{ textAlign: "center", padding: "28px 20px" }} role="alert">
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface-2, #F4EFE4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: INK }}><Icon name="lock" size={24} /></div>
            <h1 className="serif ss-h2" style={{ marginBottom: 6 }}>הקישור לסורק לא תקין</h1>
            <p className="ss-muted" style={{ fontSize: "var(--t-md)" }}>{INVALID_LINK_HE}</p>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="ss-wa" style={{ marginTop: 16 }}><Icon name="whatsapp" size={16} /> לבקש קישור בוואטסאפ</a>}
          </div>
        )}

        {/* ===== REFUSED (quota / unavailable / paused): retaking the photo will not help ===== */}
        {!linkError && refusal && !report && (
          <div className="ss-card ss-in" style={{ textAlign: "center", padding: "28px 20px" }} role="alert">
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface-2, #F4EFE4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: INK }}><Icon name={refusal === "quota" ? "hourglass" : "info"} size={24} /></div>
            <h2 className="serif ss-h2" style={{ marginBottom: 6 }}>{refusal === "quota" ? "הסורק מלא לחודש הזה" : "הסורק לא זמין כרגע"}</h2>
            <p className="ss-muted" style={{ fontSize: "var(--t-md)" }}>{errorMsg}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="ss-wa"><Icon name="whatsapp" size={16} /> לכתוב לקוסמטיקאית בוואטסאפ</a>}
              {refusal !== "paused" && book && <a href={book} className="ss-quiet"><Icon name="calendar" size={16} /> {ctaText}</a>}
              {refusal === "unavailable" && <button type="button" className="ss-btn ss-quiet" onClick={() => { setRefusal(null); setErrorMsg(""); }}><Icon name="refresh" size={16} /> לנסות שוב</button>}
            </div>
          </div>
        )}

        {/* ===== CAPTURE: gates, framing guide, angles ===== */}
        {!linkError && !refusal && !report && !loading && (
          <div className="ss-card ss-in">
            {/* AGE GATE + CONSENT, before any photo. The pickers refuse to open until both are ticked, and say why. */}
            <h2 className="serif ss-h2" style={{ fontSize: "var(--t-lg)", marginBottom: 4 }}>לפני שמתחילות</h2>
            <label className="ss-check">
              <input type="checkbox" checked={isAdult} onChange={(e) => { setIsAdult(e.target.checked); setGateError(""); }} aria-label="אני בת 18 ומעלה" />
              <span><b style={{ color: INK }}>אני בת 18 ומעלה.</b> הסריקה מיועדת לבגירות בלבד.</span>
            </label>
            <label className="ss-check">
              <input type="checkbox" checked={photoConsent} onChange={(e) => { setPhotoConsent(e.target.checked); setGateError(""); }} aria-label="הסכמה לניתוח התמונה" />
              <span>
                אני מסכימה שתמונת הפנים שלי תישלח לניתוח אוטומטי לצורך הערכה קוסמטית בלבד, ושהתוצאה תוצג לי ולעסק.{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT, fontWeight: 700, textDecoration: "underline" }}>מדיניות הפרטיות</a>
              </span>
            </label>
            <p className="ss-privacy"><Icon name="lock" size={15} /> <span>התמונה משמשת רק לניתוח הזה ולא נשמרת במערכת של העסק.</span></p>
            {gateError && <p role="alert" style={{ fontSize: "var(--t-sm)", color: "var(--danger, #C0394F)", fontWeight: 600, marginTop: 8 }}>{gateError}</p>}

            <div style={{ height: 1, background: "var(--line, #E8E1D1)", margin: "18px 0" }} />

            {/* FRAMING GUIDE: the front photo, which is the one the analysis reads */}
            <div style={{ opacity: gateOk ? 1 : 0.6, transition: "opacity 0.3s" }}>
              <Viewfinder src={preview} mode="guide" label={preview ? "החלפת תמונת החזית" : "צילום תמונת חזית"} onPick={gateOk ? angles[0].onPick : pickBlocked} />
            </div>
            <p className="ss-muted" style={{ textAlign: "center", marginTop: 10 }}>
              {preview ? "נראה טוב. אפשר להוסיף פרופילים, או להמשיך לניתוח." : "פנים בתוך האליפסה, העיניים בגובה הסימונים שבצדדים."}
            </p>

            {!preview && (
              <div className="ss-tips" aria-label="לתוצאה הכי מדויקת">
                <div className="ss-tip"><Icon name="sun" size={18} />אור טבעי ורך מולך</div>
                <div className="ss-tip"><Icon name="smile" size={18} />מבט ישר למצלמה</div>
                <div className="ss-tip"><Icon name="drop" size={18} />בלי איפור, שיער אסוף</div>
              </div>
            )}

            {/* 3-ANGLE CAPTURE: front (required, analyzed) then optional left/right profiles */}
            <div className="ss-angles-h">
              <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: INK }}>זוויות צילום</p>
              <p style={{ fontSize: "var(--t-xs)", color: INK2, fontWeight: 600 }}>{taken} מתוך 3</p>
            </div>
            <div className="ss-slots" style={{ opacity: gateOk ? 1 : 0.6 }}>
              {angles.map((a) => (
                <div key={a.key} className="ss-slot" data-filled={a.thumb ? "true" : "false"} data-req={a.req ? "true" : "false"} role="button" tabIndex={0} aria-label={`צילום ${a.label}${a.req ? " (חובה)" : " (רשות)"}`}
                  onClick={gateOk ? a.onPick : pickBlocked}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                  aria-disabled={!gateOk} style={{ cursor: gateOk ? "pointer" : "not-allowed" }}>
                  {a.thumb ? (
                    <>
                      <img src={a.thumb} alt={a.label} />
                      <span className="ss-slot-ok"><Icon name="check" size={13} strokeWidth={2.6} /></span>
                      <span className="ss-slot-cap">{a.label} · החלפה</span>
                    </>
                  ) : (
                    <>
                      <Icon name="camera" size={20} />
                      <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: INK, lineHeight: 1.3, marginTop: 4 }}>{a.label}</p>
                      <p style={{ fontSize: "var(--t-xs)", color: a.req ? ACCENT_TEXT : INK2, fontWeight: a.req ? 700 : 500 }}>{a.req ? "חובה" : "רשות"}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="ss-bar" aria-hidden="true"><span style={{ width: `${(taken / 3) * 100}%` }} /></div>
            <p className="ss-muted" style={{ textAlign: "center", marginTop: 10 }}>
              <b style={{ color: INK }}>תמונת חזית</b> היא כל מה שצריך לניתוח. אפשר להוסיף גם פרופיל שמאל וימין אם תרצי (רשות).
            </p>

            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFront} style={{ display: "none" }} />
            <input ref={leftRef} type="file" accept="image/*" capture="user" onChange={(e) => handleSide(e, "left")} style={{ display: "none" }} />
            <input ref={rightRef} type="file" accept="image/*" capture="user" onChange={(e) => handleSide(e, "right")} style={{ display: "none" }} />

            {errorMsg && (
              <div className="ss-err" role="alert">
                <p style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{errorMsg}</p>
                <p style={{ fontSize: "var(--t-sm)", marginTop: 3 }}>אפשר לנסות שוב עם תמונה ברורה יותר.</p>
              </div>
            )}

            {preview && gateOk && (
              <button onClick={analyze} className="ss-btn ss-primary" style={{ marginTop: 16 }}><Icon name="sparkle" size={17} /> קבלי את הניתוח שלך</button>
            )}
          </div>
        )}

        {/* ===== ANALYSIS WAIT: a scan over HER OWN front photo ===== */}
        {!linkError && loading && (
          <div className="ss-card ss-in" aria-busy="true">
            <p className="ss-eyebrow" style={{ textAlign: "center" }}>סריקה בתהליך</p>
            <Viewfinder src={preview} mode="scan" activeZones={SCAN_STEPS[loadStep].zones} />
            <ol className="ss-list" aria-hidden="true">
              {SCAN_STEPS.map((s, i) => {
                const state = i < loadStep ? "done" : i === loadStep ? "now" : "next";
                return <li key={s.t} data-state={state}><span className="ss-dot">{state === "done" ? <Icon name="check" size={12} strokeWidth={2.6} /> : null}</span>{s.t}</li>;
              })}
            </ol>
            <p className="ss-sr" aria-live="polite">{SCAN_STEPS[loadStep].t}</p>
            <p className="ss-muted" style={{ textAlign: "center", marginTop: 12 }}>רגע אחד, מכינות עבורך ניתוח אישי. זה לוקח בדרך כלל פחות מדקה.</p>
          </div>
        )}

        {/* ===== RESULTS ===== */}
        {report && !linkError && (
          <div className="ss-in">

            {/* MEDICAL DISCLAIMER: clear and visible at the very top of the results */}
            <div className="ss-card" style={{ background: "var(--surface-2, #F4EFE4)", border: "none", boxShadow: "none", display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px" }}>
              <span style={{ flexShrink: 0, marginTop: 2, color: INK }}><Icon name="info" size={16} /></span>
              <p className="ss-muted" style={{ fontWeight: 500 }}>הסריקה נועדה להתרשמות ראשונית בלבד ואינה מחליפה ייעוץ או אבחון מקצועי. אין להסתמך על ההמלצות כאבחנה סופית.</p>
            </div>

            {/* 1) SUMMARY: score ring, skin type, the score-band note, our fixed closing line */}
            <div className="ss-card">
              <p className="ss-eyebrow">סיכום{brand?.businessName ? ` · ${brand.businessName}` : ""}</p>
              <div className="ss-sum" style={view.score === null ? { gridTemplateColumns: "1fr" } : undefined}>
                {view.score !== null && (
                  <div className="ss-ring" role="img" aria-label={`מדד העור שלך: ${view.score} מתוך 100`}>
                    <svg viewBox="0 0 104 104" aria-hidden="true">
                      <circle cx="52" cy="52" r="45" fill="none" stroke="var(--pc-tint-2, #FBF0EE)" strokeWidth="8" />
                      <circle cx="52" cy="52" r="45" fill="none" stroke="var(--pc-deep, #C48E87)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(view.score / 100) * 282.7} 282.7`} />
                    </svg>
                    <div className="ss-ring-v"><span className="serif" style={{ fontSize: "var(--t-3xl)", fontWeight: 700, color: INK }}>{view.score}</span><span style={{ fontSize: "var(--t-xs)", color: INK2, marginTop: 3 }}>מתוך 100</span></div>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: "var(--t-xs)", color: INK2, fontWeight: 700 }}>{view.score !== null ? "מדד בריאות העור שלך" : "סוג העור שלך"}</p>
                  {view.skinType && <p className="serif" style={{ fontSize: "var(--t-xl)", fontWeight: 600, color: INK, lineHeight: 1.35, marginTop: 2 }}>{view.skinType}</p>}
                  {view.score !== null && <p className="ss-muted" style={{ marginTop: 6 }}>{positiveNote(view.score)}</p>}
                </div>
              </div>
              <div className="ss-meta">
                {view.concerns.length > 0 && <span className="ss-chip">{view.concerns.length === 1 ? "ממצא אחד" : `${view.concerns.length} ממצאים`}</span>}
                {view.zoneMarks.length > 0 && <span className="ss-chip">{view.zoneMarks.length === 1 ? "אזור אחד בפנים" : `${view.zoneMarks.length} אזורים בפנים`}</span>}
                {hasRoutine && <span className="ss-chip">שגרה לבוקר ולערב</span>}
              </div>
              {view.summary && <p className="ss-closing">{view.summary}</p>}
            </div>

            {/* 2) ZONE MAP: only the zones the concerns name, on her own photo */}
            {preview && view.zoneMarks.length > 0 && (
              <div className="ss-card">
                <p className="ss-eyebrow">מפת אזורים</p>
                <h2 className="serif ss-h2" style={{ marginBottom: 12 }}>איפה זה בפנים</h2>
                <Viewfinder src={preview} mode="map" marks={view.zoneMarks} />
                <div className="ss-legend">
                  {view.zoneMarks.map((m) => <span key={m.key}><b>{m.n}</b>{m.he}</span>)}
                </div>
                <p className="ss-muted" style={{ textAlign: "center", marginTop: 8, fontSize: "var(--t-xs)" }}>המיקום משוער, לפי אזורי הפנים שצוינו בדוח.</p>
              </div>
            )}

            {/* 3) CONCERNS: numbered like the map, zone tags, severity only when the report gave one */}
            {view.concerns.length > 0 && (
              <div className="ss-card">
                <p className="ss-eyebrow">ממצאים</p>
                <h2 className="serif ss-h2" style={{ marginBottom: 6 }}>מה שכדאי לשים לב אליו</h2>
                <ol>
                  {view.concerns.map((c, i) => (
                    <li key={i} className="ss-concern">
                      <span className="ss-cn">{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="ss-ctext">{c.text}</p>
                        <div className="ss-ctags">
                          {i === 0 && <span className="ss-focus">במוקד</span>}
                          {c.zones.map((z) => <span key={z} className="ss-ztag"><Icon name="pin" size={11} />{view.zoneMarks.find((m) => m.key === z)?.he}</span>)}
                          {c.level && (
                            <span className="ss-sev" role="img" aria-label={`רמה: ${c.level.label}`}>
                              <span aria-hidden="true">{[1, 2, 3].map((b) => <i key={b} data-on={b <= c.level.value ? "true" : "false"} />)}</span>
                              <span aria-hidden="true">{c.level.label}</span>
                            </span>
                          )}
                        </div>
                        <p className="ss-muted" style={{ marginTop: 6 }}>{i === 0 ? "מכאן הכי כדאי להתחיל. הטיפול שנמליץ עליו מטפל בדיוק בזה." : "ניתן לשיפור עם ליווי וטיפול מותאם"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* 4) RECOMMENDED TREATMENT: one primary recommendation + Book (money moment) */}
            <div className="ss-card ss-treat">
              <p className="ss-eyebrow">הטיפול המקצועי שהכי מתאים לך</p>
              <p className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: INK, lineHeight: 1.3 }}>{view.treatment || view.matchedService || "התאמת טיפול אישית בקליניקה"}</p>
              {view.matchedService && <p className="ss-svc"><Icon name="spa" size={14} /> אצלנו בקליניקה: {view.matchedService}</p>}
              {hasPlan && <p className="ss-muted" style={{ marginTop: 8 }}>{[plan.treatment_type, plan.sessions].filter(Boolean).join(" · ")}</p>}
              <p className="ss-muted" style={{ margin: "10px 0 16px" }}>נבחר במיוחד עבורך, כדי לטפל במה שזוהה בעור ולחדד את התוצאה.</p>
              {book && <a href={book} onClick={captureBookingLead} className="ss-primary"><Icon name="calendar" size={17} /> {ctaText}</a>}
              <p style={{ fontSize: "var(--t-xs)", color: INK2, marginTop: 10 }}>נשמור לך את הפרטים והטיפול, בלי למלא מחדש</p>
            </div>

            {/* Legacy reports only: clinic_plan.expected_results */}
            {plan.expected_results && (
              <div className="ss-card">
                <p className="ss-eyebrow">מה אפשר לצפות</p>
                <p style={{ fontSize: "var(--t-md)", color: INK, lineHeight: 1.7 }}>{plan.expected_results}</p>
              </div>
            )}

            {/* 5) HOME ROUTINE: valuable but secondary, collapsed; AM/PM as tabs on a phone, two columns wider */}
            {hasRoutine && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowRoutine(!showRoutine)} className="ss-btn ss-toggle" aria-expanded={showRoutine}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="drop" size={17} /> שגרת הטיפוח האישית שלך לבית</span>
                  <span style={{ color: INK2, fontSize: "var(--t-sm)" }} aria-hidden="true">{showRoutine ? "▲" : "▼"}</span>
                </button>
                {showRoutine && (
                  <div className="ss-card ss-in" style={{ marginTop: 10 }}>
                    {view.morning.length > 0 && view.evening.length > 0 && (
                      <div className="ss-tabs" role="tablist" aria-label="שגרה">
                        <button type="button" role="tab" className="ss-btn" aria-selected={tab === "am"} onClick={() => setRoutineTab("am")}><Icon name="sun" size={15} /> בוקר</button>
                        <button type="button" role="tab" className="ss-btn" aria-selected={tab === "pm"} onClick={() => setRoutineTab("pm")}><Icon name="moon" size={15} /> ערב</button>
                      </div>
                    )}
                    <div className="ss-routine" data-tab={tab} data-tabs={view.morning.length > 0 && view.evening.length > 0 ? "true" : "false"}>
                      {view.morning.length > 0 && routineCol("am", "בוקר", "sun", view.morning)}
                      {view.evening.length > 0 && routineCol("pm", "ערב", "moon", view.evening)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6) NEXT STEP: Book (primary, always reachable) + WhatsApp (secondary) */}
            <div className="ss-card" style={{ textAlign: "center" }}>
              <p className="ss-eyebrow">הצעד הבא</p>
              <p className="serif" style={{ fontSize: "var(--t-xl)", color: INK, fontWeight: 600, marginBottom: 4 }}>מוכנה להתחיל?</p>
              <p className="ss-muted" style={{ marginBottom: 14 }}>נשריין לך תור לטיפול המומלץ. הפרטים שלך כבר נשמרים.</p>
              {book && <a href={book} onClick={captureBookingLead} className="ss-primary">{ctaText}</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="ss-wa" style={{ marginTop: 10 }}><Icon name="whatsapp" size={16} /> ייעוץ נוסף בוואטסאפ</a>}
            </div>

            {/* SECONDARY: the full report on WhatsApp (also captures the lead). Queued is said as queued, never as sent. */}
            <div className="ss-card">
              {sent ? (
                <div style={{ textAlign: "center", padding: "6px 0" }} role="status">
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--success, #2E7D57)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}><Icon name={sentQueued ? "clock" : "check"} size={22} strokeWidth={2.4} /></div>
                  <p className="serif" style={{ fontSize: "var(--t-xl)", fontWeight: 600, color: INK }}>{sentQueued ? "הבקשה התקבלה" : "הדוח בדרך לוואטסאפ שלך"}</p>
                  <p className="ss-muted" style={{ marginTop: 4 }}>{sentQueued ? "הדוח ממתין לשליחה מהעסק, ויגיע אלייך לוואטסאפ בהקדם." : "אם הוא לא מגיע תוך כמה דקות, אפשר לכתוב לנו."} שמרנו לך גם את הפרטים לקביעת התור.</p>
                </div>
              ) : (
                <>
                  <p className="ss-eyebrow">הדוח המלא לנייד</p>
                  <p className="serif" style={{ fontSize: "var(--t-xl)", fontWeight: 600, color: INK, marginBottom: 3 }}>מעדיפה בוואטסאפ? נדבר.</p>
                  <p className="ss-muted" style={{ marginBottom: 12 }}>נשלח לך את הניתוח המלא לנייד, ונשמח לענות על כל שאלה.</p>
                  <input className="ss-input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="שם (לא חובה)" aria-label="שם (לא חובה)" autoComplete="name" />
                  <input className="ss-input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} type="tel" inputMode="tel" placeholder="טלפון נייד" aria-label="טלפון נייד" autoComplete="tel" />
                  {sendError && <p role="alert" style={{ color: "var(--danger, #C0394F)", fontSize: "var(--t-sm)", fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{sendError}</p>}
                  <button onClick={sendReport} disabled={sending} className="ss-btn ss-wa">{sending ? <Spinner inline label="שולחת" /> : <><Icon name="whatsapp" size={16} /> שליחה לוואטסאפ שלי</>}</button>
                </>
              )}
            </div>

            {/* TRUST: reassuring, honest */}
            <div className="ss-card" style={{ background: "var(--brand-cream, #FBF8F1)", boxShadow: "none" }}>
              <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: INK, marginBottom: 6 }}>איך זה עובד</p>
              {["הניתוח מבוסס על התמונה והמידע שהעלית.", "התוצאות מיועדות כהכוונה קוסמטית מקצועית, לא כאבחון רפואי.", "פגישת ייעוץ בקליניקה תאפשר התאמה אישית מלאה עבורך."].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < 2 ? 5 : 0 }}>
                  <span style={{ color: INK2, flexShrink: 0, marginTop: 2 }}><Icon name="check" size={13} /></span>
                  <p className="ss-muted">{t}</p>
                </div>
              ))}
            </div>

            {/* THERAPIST SECTION: de-emphasized, behind its toggle. A clinical digest of THIS report, plus the
                therapist_notes block that older reports carried. */}
            <button onClick={() => setShowPro(!showPro)} className="ss-btn ss-quiet" aria-expanded={showPro} style={{ color: INK2, marginBottom: 12, background: "transparent" }}>{showPro ? "הסתרת החלק המקצועי" : "חלק מקצועי למטפלת"}</button>
            {showPro && (
              <div className="ss-card ss-in" style={{ background: "var(--surface, #FFFFFF)" }}>
                <p className="ss-eyebrow">למטפלת</p>
                <h2 className="serif ss-h2" style={{ fontSize: "var(--t-lg)", marginBottom: 8 }}>תקציר קליני</h2>
                <div>
                  {view.skinType && <div className="ss-pro-row"><p className="ss-pro-k">סוג עור</p><p className="ss-pro-v">{view.skinType}{view.score !== null ? ` · מדד ${view.score}/100` : ""}</p></div>}
                  {view.concerns.length > 0 && (
                    <div className="ss-pro-row"><p className="ss-pro-k">ממצאים</p>
                      {view.concerns.map((c, i) => <p key={i} className="ss-pro-v">{i + 1}. {c.text}{c.level ? ` (${c.level.label})` : ""}</p>)}
                    </div>
                  )}
                  {(view.treatment || view.matchedService) && <div className="ss-pro-row"><p className="ss-pro-k">טיפול מוצע</p><p className="ss-pro-v">{view.treatment}{view.treatment && view.matchedService ? " · " : ""}{view.matchedService ? `שירות תואם: ${view.matchedService}` : ""}</p></div>}
                  {actives.length > 0 && <div className="ss-pro-row"><p className="ss-pro-k">מרכיבים פעילים בשגרה</p><div className="ss-ings" style={{ marginTop: 4 }}>{actives.map((g) => <bdi key={g} dir="ltr" className="ss-ing">{g}</bdi>)}</div></div>}
                </div>
                {report.therapist_notes && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line, #E8E1D1)" }}>
                    <p style={{ fontSize: "var(--t-md)", fontWeight: 800, color: ACCENT_TEXT, marginBottom: 10 }}>הערות קליניות למטפלת</p>
                    {pro.skin_assessment && (<div style={{ marginBottom: 12 }}><p className="ss-pro-k">הערכת עור</p><p className="ss-pro-v">{pro.skin_assessment}</p></div>)}
                    {pro.active_ingredients?.length > 0 && (<div style={{ marginBottom: 12 }}><p className="ss-pro-k">מרכיבים פעילים מומלצים</p>{pro.active_ingredients.map((a, i) => (<p key={i} className="ss-pro-v">• {a}</p>))}</div>)}
                    {pro.protocol && (<div style={{ marginBottom: 12 }}><p className="ss-pro-k">פרוטוקול טיפול</p><p className="ss-pro-v">{pro.protocol}</p></div>)}
                    {pro.cautions && (<div style={{ background: "rgba(192,57,79,0.07)", borderRadius: "var(--r-sm)", padding: "10px 12px", border: "1px solid rgba(192,57,79,0.18)" }}><p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--danger, #C0394F)", marginBottom: 3 }}>אזהרות / תשומת לב</p><p style={{ fontSize: "var(--t-sm)", color: "var(--danger, #C0394F)", lineHeight: 1.5 }}>{pro.cautions}</p></div>)}
                  </div>
                )}
              </div>
            )}

            <button onClick={reset} className="ss-btn ss-quiet" style={{ background: "transparent", border: "none", color: INK2 }}><Icon name="refresh" size={16} /> סריקה חדשה</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto", paddingTop: 10 }}><PoweredBy /></div>
    </div>
  );
}

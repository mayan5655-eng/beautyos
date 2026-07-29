"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { dayHoursFrom, isOpenOn, normalizeBusinessHours } from "@/lib/businessHours";
import { fetchPublicSettings, resolveBranding } from "@/lib/branding";
import FloralCorners from "../FloralCorners";

// ============================================================
// PUBLIC BOOKING PAGE  —  /book
// An elegant Google-Business-Profile-style mini-site for each clinic,
// with her BloomOS branding, that opens straight into the booking flow.
//
// MULTI-TENANT: this is a public page (no login), so the tenant is
// identified from the ?t=<tenantId> URL param. Every data query below
// is scoped to that tenant, so each cosmetician gets her own clean
// booking page (her services, her hours, her booked slots only).
// ============================================================

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function hh(n) { return `${String(n).padStart(2, "0")}:00`; }

// Normalize a phone into an international wa.me target (Israel-aware): strip
// non-digits, convert a leading 0 to 972, accept an already-972 or bare 9-digit.
function normalizeWa(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return d;
}
// Build a full URL from a handle OR a pasted link.
function socialHref(base, val) {
  const v = String(val || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, "");
}

export default function BookPage() {
  // === DATA ===
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState(null);
  const [tenantError, setTenantError] = useState(false);
  const [brand, setBrand] = useState(null); // resolved clinic branding (safe fallbacks)

  // === BOOKING FLOW STATE ===
  const [step, setStep] = useState(1); // 1=business card + service, 2=date+time, 3=details, 4=done
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Read the tenant from the URL (?t=...) on mount, then load that tenant's data.
  useEffect(() => {
    let t = null, svc = null;
    try {
      const params = new URLSearchParams(window.location.search);
      t = params.get("t");
      // Context carried over from the skin scanner (or any deep link) so the
      // visitor never re-enters what we already know.
      svc = params.get("service");
      const nm = params.get("name");
      const ph = params.get("phone");
      if (nm) setName(nm);
      if (ph) setPhone(ph);
    } catch {}
    if (!t) {
      // No tenant in the URL - we cannot safely show any business's data.
      setTenantError(true);
      setLoading(false);
      return;
    }
    setTenantId(t);
    loadData(t, svc);
  }, []);

  const loadData = async (t, prefillServiceName) => {
    try {
      // Every query is scoped to this tenant only.
      const [row, sv, ap] = await Promise.all([
        // SECURITY: public-safe settings via the shared layer (hardened RPC, no
        // direct anonymous settings access; never green_api_token or other secrets).
        fetchPublicSettings(supabase, t),
        supabase.from("service_prices").select("*").eq("tenant_id", t),
        supabase.from("appointments").select("date, hour").eq("tenant_id", t),
      ]);

      if (row) {
        setSettings(row);
        setBrand(resolveBranding(row)); // logo/colors/welcome/gallery/socials from the branding jsonb
      } else {
        // Tenant has no settings row - treat as not found rather than guessing.
        setTenantError(true);
        setLoading(false);
        return;
      }

      if (sv.data && sv.data.length > 0) {
        const active = sv.data.filter((s) => s.active !== false);
        setServices(active);
        // Preserve the scanner's recommended treatment: preselect it and skip the
        // service-selection step so the visitor lands straight on date/time.
        if (prefillServiceName) {
          const match = active.find((s) => s.name === prefillServiceName);
          if (match) { setSelectedService(match); setStep(2); }
        }
      }
      if (ap.data) setAppointments(ap.data);
    } catch (err) {
      console.error("loadData error:", err);
      setTenantError(true);
    } finally {
      setLoading(false);
    }
  };

  const pc = brand?.primary || settings?.primary_color || "#B08D74";
  const deep = brand?.deep || pc;

  // === Build next 14 available days (respecting per-day business_hours) ===
  const availableDays = [];
  for (let i = 0; i < 21 && availableDays.length < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (isOpenOn(settings, d)) availableDays.push(d);
  }

  // === Build hours for the SELECTED day (its own open→close window) ===
  const selDayHours = selectedDate ? dayHoursFrom(settings, selectedDate.getDay()) : null;
  const allHours = [];
  if (selDayHours) {
    for (let h = selDayHours.open; h < selDayHours.close; h++) allHours.push(h);
  }

  const takenHours = selectedDate
    ? appointments.filter((a) => a.date === formatDate(selectedDate)).map((a) => Number(a.hour))
    : [];

  const handleConfirm = async () => {
    setErrorMsg("");
    if (!name.trim()) { setErrorMsg("נא להזין שם"); return; }
    if (!phone.trim()) { setErrorMsg("נא להזין טלפון"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      // The API saves the appointment AND sends WhatsApp messages to both
      // the client and the business owner. We pass the tenantId so it lands
      // in the right account.
      const res = await fetch("/api/book-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          service: selectedService.name,
          date: formatDate(selectedDate),
          hour: selectedHour,
          duration: selectedService.duration || 60,
          price: selectedService.price || 0,
          color: selectedService.color || pc,
          tenantId: tenantId,
        }),
      });
      const result = await res.json();
      // Prefer the server's specific message (e.g. "slot taken") when provided,
      // otherwise fall back to the generic error.
      if (!result.success) { setErrorMsg(result.error || "אירעה שגיאה. נסי שוב."); setSubmitting(false); return; }
      setStep(4);
    } catch (err) {
      setErrorMsg("אירעה שגיאה. נסי שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Assistant',sans-serif", background: "#FBF8F5", fontSize: 15, letterSpacing: "1px", color: pc }}>
        ✦ טוען
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Assistant',sans-serif", background: "linear-gradient(160deg, #FBF8F5 0%, #F3ECE7 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16, color: "#C0917F" }}>✦</div>
        <h1 className="serif" style={{ fontSize: 23, fontWeight: 600, color: "#8A6F62", marginBottom: 10, letterSpacing: "0.3px" }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: "#9A8E86", maxWidth: 320, lineHeight: 1.7 }}>
          נראה שהקישור לקביעת התור חסר או שגוי. אנא פני לעסק לקבלת קישור עדכני.
        </p>
      </div>
    );
  }

  // === Derived branding/business-card values ===
  const bizName = brand?.welcomeHeadline || brand?.businessName || settings?.business_name || "העסק שלי";
  const phoneRaw = String(brand?.whatsappNumber || settings?.business_phone || "").trim();
  const wa = normalizeWa(phoneRaw);
  const addr = brand?.address || "";
  const mapsHref = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "";
  const gallery = brand?.gallery || [];
  const reviews = brand?.reviews || [];
  const avgRating = reviews.length ? reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length : 0;
  const now = new Date();
  const weekHours = normalizeBusinessHours(settings);
  const todayHours = weekHours[now.getDay()];
  const openNow = !!todayHours && now.getHours() >= todayHours.open && now.getHours() < todayHours.close;
  const socials = [
    brand?.website && { key: "web", label: "אתר", href: socialHref("https://", brand.website) },
    brand?.instagram && { key: "ig", label: "אינסטגרם", href: socialHref("https://instagram.com/", brand.instagram) },
    brand?.facebook && { key: "fb", label: "פייסבוק", href: socialHref("https://facebook.com/", brand.facebook) },
    brand?.tiktok && { key: "tt", label: "טיקטוק", href: socialHref("https://tiktok.com/@", brand.tiktok) },
  ].filter(Boolean);

  const goToServices = () => {
    const el = typeof document !== "undefined" ? document.getElementById("bk-services") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // === refined style tokens (premium / luxury visual layer) ===
  const ink = "#3E3439";
  const muted = "#8C8188";
  const faint = "#A99EA3";
  const hair = "#EEE6E1";
  const cream = "#FBF7F4";
  const section = { width: "100%", maxWidth: 540, padding: "0 20px", marginBottom: 26 };
  const cardBox = { background: "#fff", borderRadius: 22, padding: "26px 24px", boxShadow: "0 20px 48px -28px rgba(70,50,60,0.25)", border: `1px solid ${hair}` };
  const eyebrow = (text) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
      <span style={{ width: 22, height: 1.5, background: pc, opacity: 0.55, borderRadius: 2 }} />
      <span style={{ fontSize: 10.5, letterSpacing: "3px", color: pc, fontWeight: 700 }}>{text}</span>
    </div>
  );
  const qaBtn = { border: "none", borderRadius: 999, padding: "12px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7, letterSpacing: "0.4px", textDecoration: "none" };
  const qaOutline = { ...qaBtn, background: "#fff", color: ink, border: `1px solid ${pc}3D`, boxShadow: "0 8px 20px -14px rgba(70,50,60,0.4)" };
  const socialPill = (bg, color, borderColor) => ({ display: "inline-flex", alignItems: "center", gap: 7, background: bg, color: color || "#fff", textDecoration: "none", padding: "10px 20px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.4px", border: borderColor ? `1px solid ${borderColor}3D` : "none", boxShadow: "0 8px 20px -14px rgba(70,50,60,0.4)" });

  return (
    <div dir="rtl" style={{ fontFamily: "'Assistant','Heebo',sans-serif", background: "linear-gradient(180deg,#FBF8F5 0%,#F5EEE9 55%,#FBF9F7 100%)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 60px", color: ink, position: "relative", zIndex: 0, overflow: "hidden" }}>
      {/* Subtle brand-tinted floral watermark, behind all content */}
      <FloralCorners idPrefix="book" blush={pc} gold={deep} opacity={0.9} />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;600;700&family=Assistant:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Frank Ruhl Libre','Assistant',serif; }
        .bk-stack { width: 100%; display: flex; flex-direction: column; align-items: center; }
        .bk-stack > * { animation: rise 0.7s cubic-bezier(.2,.7,.3,1) both; }
        .bk-stack > *:nth-child(1){ animation-delay: .02s } .bk-stack > *:nth-child(2){ animation-delay: .08s }
        .bk-stack > *:nth-child(3){ animation-delay: .14s } .bk-stack > *:nth-child(4){ animation-delay: .20s }
        .bk-stack > *:nth-child(5){ animation-delay: .26s } .bk-stack > *:nth-child(6){ animation-delay: .32s }
        .bk-stack > *:nth-child(7){ animation-delay: .38s } .bk-stack > *:nth-child(8){ animation-delay: .44s }
        .bk-stack > *:nth-child(9){ animation-delay: .50s } .bk-stack > *:nth-child(n+10){ animation-delay: .56s }
        @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .bk-card { animation: rise 0.55s cubic-bezier(.2,.7,.3,1) both; }
        .bk-chip { transition: transform .2s, box-shadow .2s; cursor: pointer; }
        .bk-chip:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -22px rgba(70,50,60,0.4); }
        .bk-chip:active { transform: scale(.99); }
        .bk-btn { transition: transform .18s, filter .18s; cursor: pointer; border: none; font-family: inherit; }
        .bk-btn:hover:not(:disabled) { filter: brightness(1.04); transform: translateY(-1px); }
        .bk-btn:active:not(:disabled) { transform: scale(.98); }
        .bk-btn:disabled { opacity: .5; cursor: default; }
        .qa { transition: transform .2s, filter .2s; }
        .qa:hover { transform: translateY(-2px); filter: brightness(1.02); }
        .gal-item { transition: transform .28s, box-shadow .28s; }
        .gal-item:hover { transform: scale(1.04); box-shadow: 0 12px 26px -14px rgba(70,50,60,0.45); }
      `}</style>

      {/* ============ STEP 1 — BUSINESS CARD ============ */}
      {step === 1 && (
        <div className="bk-stack">

          {/* COVER */}
          {brand?.heroImageUrl ? (
            <div style={{ position: "relative", width: "100%", maxWidth: 540, height: 220, overflow: "hidden", borderRadius: "0 0 28px 28px" }}>
              <img src={brand.heroImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(251,247,244,0.72) 0%, rgba(251,247,244,0.06) 42%, transparent 68%)" }} />
            </div>
          ) : (
            <div style={{ width: "100%", maxWidth: 540, height: 150, background: `linear-gradient(135deg, ${pc}22, ${pc}0A)`, borderRadius: "0 0 28px 28px" }} />
          )}

          {/* HEADER (logo overlaps cover) */}
          <div style={{ ...section, marginTop: -54, textAlign: "center" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#fff", boxShadow: "0 14px 32px -14px rgba(70,50,60,0.4)", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: `1px solid ${pc}33`, outline: "4px solid #fff" }}>
              {brand?.logoUrl ? (
                <img src={brand.logoUrl} alt={bizName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 34, color: pc }}>✦</span>
              )}
            </div>
            <h1 className="serif" style={{ fontSize: 27, fontWeight: 600, color: deep, marginBottom: 8, letterSpacing: "0.3px", lineHeight: 1.25 }}>{bizName}</h1>
            {brand?.welcomeMessage && <p style={{ fontSize: 13.5, color: muted, fontWeight: 400, marginBottom: 14, lineHeight: 1.7, maxWidth: 380, marginInline: "auto" }}>{brand.welcomeMessage}</p>}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: openNow ? "#EEF5F0" : "#F6ECEA", color: openNow ? "#2E7D50" : "#B25B52", padding: "5px 14px", borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.6px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: openNow ? "#3EA76B" : "#CE8A82" }} />
              {openNow ? "פתוח עכשיו" : "סגור עכשיו"}
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div style={{ ...section }}>
            <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={goToServices} className="qa" style={{ ...qaBtn, background: pc, color: "#fff", boxShadow: `0 12px 26px -14px ${pc}` }}>{brand?.ctaLabel || "קביעת תור"}</button>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="qa" style={{ ...qaBtn, background: "#25D366", color: "#fff", boxShadow: "0 12px 26px -14px rgba(37,211,102,0.85)" }}>וואטסאפ</a>}
              {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" className="qa" style={qaOutline}>ניווט</a>}
              {phoneRaw && <a href={`tel:${phoneRaw}`} className="qa" style={qaOutline}>התקשרי</a>}
            </div>
          </div>

          {/* ABOUT */}
          {brand?.businessDescription && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("אודות")}
                <p style={{ fontSize: 14, color: "#635A60", lineHeight: 1.85, whiteSpace: "pre-line" }}>{brand.businessDescription}</p>
              </div>
            </div>
          )}

          {/* HOURS */}
          <div style={{ ...section }}>
            <div style={cardBox}>
              {eyebrow("שעות פעילות")}
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const v = weekHours[d];
                const today = d === now.getDay();
                return (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", margin: "0 -12px", borderRadius: 10, background: today ? `${pc}0D` : "transparent", borderBottom: d < 6 ? `1px solid ${hair}` : "none" }}>
                    <span style={{ fontSize: 13.5, color: today ? deep : "#6B626A", fontWeight: today ? 700 : 500 }}>{DAYS_HE[d]}{today ? " · היום" : ""}</span>
                    <span style={{ fontSize: 13.5, color: v ? (today ? deep : "#5A515A") : faint, fontWeight: today ? 700 : 500, letterSpacing: v ? "0.5px" : 0 }}>{v ? `${hh(v.open)}–${hh(v.close)}` : "סגור"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SERVICES (the booking entry point) */}
          {services.length > 0 && (
            <div id="bk-services" style={{ ...section, scrollMarginTop: 14 }}>
              <div style={cardBox}>
                {eyebrow("השירותים שלנו")}
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {services.map((s, i) => (
                    <div key={i} className="bk-chip" onClick={() => { setSelectedService(s); setStep(2); }}
                      style={{ background: cream, borderRadius: 16, padding: "16px 18px", border: `1px solid ${hair}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color || pc, flexShrink: 0, boxShadow: `0 0 0 3px ${(s.color || pc)}1F` }} />
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 600, color: ink }}>{s.name}</p>
                          <p style={{ fontSize: 12, color: faint, marginTop: 2, letterSpacing: "0.3px" }}>{s.duration || 60} דקות</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <p className="serif" style={{ fontSize: 18, fontWeight: 600, color: deep }}>₪{s.price}</p>
                        <span style={{ fontSize: 11, fontWeight: 600, color: pc, background: `${pc}12`, borderRadius: 999, padding: "6px 13px", letterSpacing: "0.4px" }}>{brand?.ctaLabel || "הזמיני"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEWS */}
          {reviews.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("ביקורות")}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <span className="serif" style={{ fontSize: 36, fontWeight: 600, color: deep, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                  <div>
                    <div style={{ fontSize: 15, color: pc, letterSpacing: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= Math.round(avgRating) ? "★" : "☆"}</span>)}
                    </div>
                    <span style={{ fontSize: 11, color: faint, letterSpacing: "0.5px" }}>{reviews.length} ביקורות</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, margin: "0 -2px" }}>
                  {reviews.map((rv, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 250, background: cream, border: `1px solid ${hair}`, borderRadius: 18, padding: "18px 20px" }}>
                      <div style={{ fontSize: 13.5, color: pc, letterSpacing: 1.5, marginBottom: 10 }}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= (Number(rv.rating) || 5) ? "★" : "☆"}</span>)}
                      </div>
                      {rv.text && <p className="serif" style={{ fontSize: 14.5, color: "#5A515A", lineHeight: 1.75, marginBottom: 12, fontStyle: "italic" }}>“{rv.text}”</p>}
                      {rv.name && <p style={{ fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: "1px" }}>— {rv.name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GALLERY */}
          {gallery.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("גלריה")}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                  {gallery.map((g, i) => (
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="gal-item" style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden", border: `1px solid ${hair}` }}>
                      <img src={g} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LOCATION */}
          {addr && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("מיקום")}
                <p style={{ fontSize: 14, color: "#635A60", marginBottom: 16, lineHeight: 1.7 }}>{addr}</p>
                {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: `${pc}10`, color: deep, textDecoration: "none", padding: "11px 20px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: "0.4px", border: `1px solid ${pc}30` }}>ניווט במפות Google</a>}
              </div>
            </div>
          )}

          {/* SOCIAL LINKS */}
          {(socials.length > 0 || wa) && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("עקבו אחרינו")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={socialPill("#25D366")}>וואטסאפ</a>}
                  {socials.map((s) => (
                    <a key={s.key} href={s.href} target="_blank" rel="noreferrer" style={socialPill("#fff", deep, pc)}>{s.label}</a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Primary book CTA at the bottom too */}
          {services.length > 0 && (
            <div style={{ ...section, marginTop: 2 }}>
              <button onClick={goToServices} className="bk-btn" style={{ width: "100%", padding: "16px 0", borderRadius: 16, background: pc, color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "1px", boxShadow: `0 16px 34px -18px ${pc}` }}>
                {brand?.ctaLabel || "קביעת תור"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ STEPS 2–4 — BOOKING FLOW ============ */}
      {step >= 2 && (
        <>
          {/* compact header */}
          <div style={{ width: "100%", maxWidth: 480, padding: "30px 20px 6px", textAlign: "center" }}>
            {brand?.logoUrl ? (
              <img src={brand.logoUrl} alt={bizName} style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
            ) : null}
            <h2 className="serif" style={{ fontSize: 20, fontWeight: 600, color: deep, letterSpacing: "0.3px" }}>{bizName}</h2>
          </div>

          {/* PROGRESS BAR */}
          {step < 4 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 22, padding: "10px 20px 0" }}>
              {[1, 2, 3].map((s) => (
                <div key={s} style={{ width: 44, height: 4, borderRadius: 4, background: step >= s ? pc : hair, transition: "background 0.3s" }} />
              ))}
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

            {/* STEP 2 — CHOOSE DATE + TIME */}
            {step === 2 && (
              <div className="bk-card">
                <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה לעמוד העסק</button>
                <div style={{ background: cream, borderRadius: 16, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${hair}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedService.color || pc }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: ink, flex: 1 }}>{selectedService.name}</p>
                  <p className="serif" style={{ fontSize: 15, fontWeight: 600, color: deep }}>₪{selectedService.price}</p>
                </div>

                <p style={{ fontSize: 10.5, letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי יום</p>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 22 }}>
                  {availableDays.map((d, i) => {
                    const isSel = selectedDate && formatDate(d) === formatDate(selectedDate);
                    return (
                      <div key={i} className="bk-chip" onClick={() => { setSelectedDate(d); setSelectedHour(null); }}
                        style={{ flexShrink: 0, width: 62, padding: "13px 0", borderRadius: 16, textAlign: "center", background: isSel ? pc : "#fff", color: isSel ? "#fff" : ink, boxShadow: isSel ? `0 10px 24px -12px ${pc}` : "0 6px 16px -12px rgba(70,50,60,0.4)", border: isSel ? "none" : `1px solid ${hair}` }}>
                        <p style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{DAYS_HE[d.getDay()]}</p>
                        <p className="serif" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.2 }}>{d.getDate()}</p>
                        <p style={{ fontSize: 9, opacity: 0.65 }}>{MONTHS_HE[d.getMonth()].slice(0, 3)}</p>
                      </div>
                    );
                  })}
                </div>

                {selectedDate && (
                  <>
                    <p style={{ fontSize: 10.5, letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי שעה</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                      {allHours.map((h) => {
                        const taken = takenHours.includes(h);
                        const isSel = selectedHour === h;
                        return (
                          <button key={h} disabled={taken} onClick={() => setSelectedHour(h)}
                            className="bk-btn"
                            style={{ padding: "12px 0", borderRadius: 12, fontSize: 14, fontWeight: 600, background: taken ? "#F1EAE6" : isSel ? pc : "#fff", color: taken ? faint : isSel ? "#fff" : ink, textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "0 4px 12px -8px rgba(70,50,60,0.4)", border: isSel ? "none" : `1px solid ${hair}` }}>
                            {h}:00
                          </button>
                        );
                      })}
                    </div>
                    {selectedHour !== null && (
                      <button onClick={() => setStep(3)} className="bk-btn"
                        style={{ width: "100%", padding: "16px 0", borderRadius: 16, background: pc, color: "#fff", fontSize: 15, fontWeight: 600, marginTop: 10, letterSpacing: "0.8px", boxShadow: `0 16px 34px -18px ${pc}` }}>
                        המשך ←
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3 — DETAILS */}
            {step === 3 && (
              <div className="bk-card">
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה</button>

                <div style={{ background: cream, borderRadius: 18, padding: "18px 20px", marginBottom: 20, border: `1px solid ${hair}` }}>
                  <p style={{ fontSize: 10.5, letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 12 }}>סיכום התור</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>טיפול</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{selectedService.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>תאריך</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>שעה</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{selectedHour}:00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${hair}`, paddingTop: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>מחיר</span>
                    <span className="serif" style={{ fontSize: 17, fontWeight: 600, color: deep }}>₪{selectedService.price}</span>
                  </div>
                </div>

                <p style={{ fontSize: 10.5, letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 14 }}>הפרטים שלך</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 14 }} />

                {errorMsg && <p style={{ color: "#C0685E", fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>{errorMsg}</p>}

                <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
                  style={{ width: "100%", padding: "16px 0", borderRadius: 16, background: pc, color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: "0.8px", boxShadow: `0 16px 36px -18px ${pc}` }}>
                  {submitting ? "קובע תור..." : (brand?.ctaLabel || "קביעת תור")}
                </button>
              </div>
            )}

            {/* STEP 4 — SUCCESS */}
            {step === 4 && (
              <div className="bk-card" style={{ textAlign: "center", paddingTop: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 14, color: pc }}>✦</div>
                <h2 className="serif" style={{ fontSize: 26, fontWeight: 600, color: deep, marginBottom: 10, letterSpacing: "0.3px" }}>התור נקבע!</h2>
                <p style={{ fontSize: 14, color: "#635A60", lineHeight: 1.7, marginBottom: 22 }}>
                  נתראה ב{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} בשעה {selectedHour}:00
                </p>
                <div style={{ background: cream, borderRadius: 18, padding: "20px 22px", border: `1px solid ${hair}`, textAlign: "right", marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, color: muted }}>טיפול</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{selectedService.name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, color: muted }}>שם</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: muted }}>טלפון</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{phone}</span></div>
                </div>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#25D366", color: "#fff", textDecoration: "none", padding: "12px 22px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.4px", marginBottom: 16 }}>💬 שלחי לנו הודעה</a>}
                <p style={{ fontSize: 12, color: faint, letterSpacing: "0.5px" }}>נשמח לראותך</p>
              </div>
            )}

          </div>
        </>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "34px 20px 0" }}>
        {addr && step === 1 && (
          <p style={{ fontSize: 12, color: muted, fontWeight: 500, marginBottom: 8, letterSpacing: "0.3px" }}>{addr}</p>
        )}
        <p style={{ fontSize: 10.5, color: faint, letterSpacing: "1px" }}>מופעל ע"י BloomOS ✦</p>
      </div>
    </div>
  );
}

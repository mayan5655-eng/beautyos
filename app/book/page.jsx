"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { dayHoursFrom, isOpenOn, normalizeBusinessHours } from "@/lib/businessHours";
import { fetchPublicSettings, resolveBranding } from "@/lib/branding";

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

  const pc = brand?.primary || settings?.primary_color || "#E91E63";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "#FBF7F9", fontSize: 18, color: pc }}>
        טוען... 💗
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "linear-gradient(160deg, #FBF7F9 0%, #F3E9EF 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>💔</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#C0392B", marginBottom: 8 }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: "#8A7E86", maxWidth: 320, lineHeight: 1.6 }}>
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
    brand?.website && { key: "web", label: "אתר", icon: "🌐", href: socialHref("https://", brand.website) },
    brand?.instagram && { key: "ig", label: "אינסטגרם", icon: "📸", href: socialHref("https://instagram.com/", brand.instagram) },
    brand?.facebook && { key: "fb", label: "פייסבוק", icon: "👍", href: socialHref("https://facebook.com/", brand.facebook) },
    brand?.tiktok && { key: "tt", label: "טיקטוק", icon: "🎵", href: socialHref("https://tiktok.com/@", brand.tiktok) },
  ].filter(Boolean);

  const goToServices = () => {
    const el = typeof document !== "undefined" ? document.getElementById("bk-services") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // === shared style tokens ===
  const section = { width: "100%", maxWidth: 560, padding: "0 16px", marginBottom: 14 };
  const cardBox = { background: "#fff", borderRadius: 18, padding: "18px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #F0E6EC" };
  const sectionTitle = { fontSize: 13, fontWeight: 800, color: deep, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 };
  const qaBtn = { border: "none", borderRadius: 14, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", textDecoration: "none" };
  const qaOutline = { ...qaBtn, background: "#fff", color: deep, border: `1.5px solid ${pc}33`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
  const socialPill = (bg, color, borderColor) => ({ display: "inline-flex", alignItems: "center", gap: 6, background: bg, color: color || "#fff", textDecoration: "none", padding: "9px 16px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: borderColor ? `1.5px solid ${borderColor}44` : "none", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" });

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo','Assistant',sans-serif", background: "linear-gradient(180deg,#FBF7F9 0%,#F5EEF2 60%,#FBFAFC 100%)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 44px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .bk-card { animation: bkIn 0.4s ease-out; }
        @keyframes bkIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .bk-chip { transition: all 0.15s; cursor: pointer; }
        .bk-chip:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
        .bk-chip:active { transform: scale(0.98); }
        .bk-btn { transition: all 0.15s; cursor: pointer; border: none; font-family: inherit; }
        .bk-btn:active:not(:disabled) { transform: scale(0.97); }
        .bk-btn:disabled { opacity: 0.5; cursor: default; }
        .qa:hover { filter: brightness(0.97); transform: translateY(-1px); }
        .gal-item { transition: transform 0.15s; }
        .gal-item:hover { transform: scale(1.03); }
      `}</style>

      {/* ============ STEP 1 — BUSINESS CARD ============ */}
      {step === 1 && (
        <div className="bk-card" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>

          {/* COVER */}
          {brand?.heroImageUrl ? (
            <div style={{ width: "100%", maxWidth: 560, height: 190, overflow: "hidden", borderRadius: "0 0 24px 24px" }}>
              <img src={brand.heroImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ) : (
            <div style={{ width: "100%", maxWidth: 560, height: 120, background: `linear-gradient(120deg, ${pc}, ${deep})`, borderRadius: "0 0 24px 24px" }} />
          )}

          {/* HEADER (logo overlaps cover) */}
          <div style={{ ...section, marginTop: -46, textAlign: "center" }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,0.14)", margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "3px solid #fff" }}>
              {brand?.logoUrl ? (
                <img src={brand.logoUrl} alt={bizName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 34 }}>💗</span>
              )}
            </div>
            <h1 style={{ fontSize: 23, fontWeight: 900, color: deep, marginBottom: 4 }}>{bizName}</h1>
            {brand?.welcomeMessage && <p style={{ fontSize: 13, color: "#8A7E86", fontWeight: 500, marginBottom: 8, lineHeight: 1.5 }}>{brand.welcomeMessage}</p>}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: openNow ? "#E7F6EC" : "#FBEAEA", color: openNow ? "#1E7E45" : "#C0392B", padding: "4px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: openNow ? "#25a355" : "#e05a5a" }} />
              {openNow ? "פתוח עכשיו" : "סגור עכשיו"}
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div style={{ ...section }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={goToServices} className="qa" style={{ ...qaBtn, background: pc, color: "#fff" }}>📅 {brand?.ctaLabel || "קבעי תור"}</button>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="qa" style={{ ...qaBtn, background: "#25D366", color: "#fff" }}>💬 וואטסאפ</a>}
              {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" className="qa" style={qaOutline}>🧭 נווט</a>}
              {phoneRaw && <a href={`tel:${phoneRaw}`} className="qa" style={qaOutline}>📞 התקשרי</a>}
            </div>
          </div>

          {/* ABOUT */}
          {brand?.businessDescription && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                <p style={sectionTitle}>ℹ️ אודות</p>
                <p style={{ fontSize: 13.5, color: "#5A5058", lineHeight: 1.7, whiteSpace: "pre-line" }}>{brand.businessDescription}</p>
              </div>
            </div>
          )}

          {/* HOURS */}
          <div style={{ ...section }}>
            <div style={cardBox}>
              <p style={sectionTitle}>🕐 שעות פעילות</p>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const v = weekHours[d];
                const today = d === now.getDay();
                return (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: d < 6 ? "1px solid #F4EDF1" : "none" }}>
                    <span style={{ fontSize: 13, color: today ? deep : "#6A616A", fontWeight: today ? 800 : 500 }}>{DAYS_HE[d]}{today ? " · היום" : ""}</span>
                    <span style={{ fontSize: 13, color: v ? (today ? deep : "#4A414A") : "#B0A6AE", fontWeight: today ? 800 : 500 }}>{v ? `${hh(v.open)}–${hh(v.close)}` : "סגור"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SERVICES (the booking entry point) */}
          {services.length > 0 && (
            <div id="bk-services" style={{ ...section, scrollMarginTop: 12 }}>
              <div style={cardBox}>
                <p style={sectionTitle}>💅 השירותים שלנו</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {services.map((s, i) => (
                    <div key={i} className="bk-chip" onClick={() => { setSelectedService(s); setStep(2); }}
                      style={{ background: "#FBF7FA", borderRadius: 14, padding: "14px 16px", border: "1px solid #F0E6EC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: s.color || pc, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 14.5, fontWeight: 700, color: "#3A2A30" }}>{s.name}</p>
                          <p style={{ fontSize: 12, color: "#9A8E96" }}>{s.duration || 60} דקות</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color: pc }}>₪{s.price}</p>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: pc, borderRadius: 999, padding: "5px 12px" }}>{brand?.ctaLabel || "קבעי"}</span>
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
                <p style={sectionTitle}>⭐ ביקורות</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: deep }}>{avgRating.toFixed(1)}</span>
                  <div>
                    <div style={{ fontSize: 15, color: pc, letterSpacing: 1 }}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= Math.round(avgRating) ? "★" : "☆"}</span>)}
                    </div>
                    <span style={{ fontSize: 11.5, color: "#9A8E96" }}>{reviews.length} ביקורות</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                  {reviews.map((rv, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 240, background: "#FBF7FA", border: "1px solid #F0E6EC", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ fontSize: 14, color: pc, letterSpacing: 1, marginBottom: 6 }}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= (Number(rv.rating) || 5) ? "★" : "☆"}</span>)}
                      </div>
                      {rv.text && <p style={{ fontSize: 13, color: "#5A5058", lineHeight: 1.6, marginBottom: 8 }}>{rv.text}</p>}
                      {rv.name && <p style={{ fontSize: 12.5, fontWeight: 700, color: deep }}>— {rv.name}</p>}
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
                <p style={sectionTitle}>📷 גלריה</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6 }}>
                  {gallery.map((g, i) => (
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="gal-item" style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", border: "1px solid #F0E6EC" }}>
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
                <p style={sectionTitle}>📍 מיקום</p>
                <p style={{ fontSize: 13.5, color: "#5A5058", marginBottom: 12, lineHeight: 1.6 }}>{addr}</p>
                {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: pc, color: "#fff", textDecoration: "none", padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}>🧭 נווט במפות Google</a>}
              </div>
            </div>
          )}

          {/* SOCIAL LINKS */}
          {(socials.length > 0 || wa) && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                <p style={sectionTitle}>🔗 עקבו אחרינו</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={socialPill("#25D366")}>💬 וואטסאפ</a>}
                  {socials.map((s) => (
                    <a key={s.key} href={s.href} target="_blank" rel="noreferrer" style={socialPill("#fff", deep, pc)}>{s.icon} {s.label}</a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Primary book CTA at the bottom too */}
          {services.length > 0 && (
            <div style={{ ...section, marginTop: 4 }}>
              <button onClick={goToServices} className="bk-btn" style={{ width: "100%", padding: "15px 0", borderRadius: 14, background: pc, color: "#fff", fontSize: 16, fontWeight: 800, boxShadow: `0 8px 20px ${pc}44` }}>
                ✨ {brand?.ctaLabel || "קבעי תור"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ STEPS 2–4 — BOOKING FLOW ============ */}
      {step >= 2 && (
        <>
          {/* compact header */}
          <div style={{ width: "100%", maxWidth: 480, padding: "26px 20px 6px", textAlign: "center" }}>
            {brand?.logoUrl ? (
              <img src={brand.logoUrl} alt={bizName} style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain", margin: "0 auto 8px", display: "block" }} />
            ) : null}
            <h2 style={{ fontSize: 18, fontWeight: 800, color: deep }}>{bizName}</h2>
          </div>

          {/* PROGRESS BAR */}
          {step < 4 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 18, padding: "8px 20px 0" }}>
              {[1, 2, 3].map((s) => (
                <div key={s} style={{ width: 44, height: 5, borderRadius: 4, background: step >= s ? pc : "#EAD9E2", transition: "background 0.3s" }} />
              ))}
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

            {/* STEP 2 — CHOOSE DATE + TIME */}
            {step === 2 && (
              <div className="bk-card">
                <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>← חזרה לעמוד העסק</button>
                <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedService.color || pc }} />
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#3A2A30", flex: 1 }}>{selectedService.name}</p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: pc }}>₪{selectedService.price}</p>
                </div>

                <h2 style={{ fontSize: 15, fontWeight: 800, color: "#3A2A30", marginBottom: 10 }}>בחרי יום</h2>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 18 }}>
                  {availableDays.map((d, i) => {
                    const isSel = selectedDate && formatDate(d) === formatDate(selectedDate);
                    return (
                      <div key={i} className="bk-chip" onClick={() => { setSelectedDate(d); setSelectedHour(null); }}
                        style={{ flexShrink: 0, width: 62, padding: "12px 0", borderRadius: 14, textAlign: "center", background: isSel ? pc : "#fff", color: isSel ? "#fff" : "#3A2A30", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", border: isSel ? "none" : "2px solid #F2E3EA" }}>
                        <p style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{DAYS_HE[d.getDay()]}</p>
                        <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{d.getDate()}</p>
                        <p style={{ fontSize: 9, opacity: 0.7 }}>{MONTHS_HE[d.getMonth()].slice(0, 3)}</p>
                      </div>
                    );
                  })}
                </div>

                {selectedDate && (
                  <>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: "#3A2A30", marginBottom: 10 }}>בחרי שעה</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                      {allHours.map((h) => {
                        const taken = takenHours.includes(h);
                        const isSel = selectedHour === h;
                        return (
                          <button key={h} disabled={taken} onClick={() => setSelectedHour(h)}
                            className="bk-btn"
                            style={{ padding: "11px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, background: taken ? "#F0E4EA" : isSel ? pc : "#fff", color: taken ? "#C9A9B6" : isSel ? "#fff" : "#3A2A30", textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "0 3px 10px rgba(0,0,0,0.05)", border: isSel ? "none" : "2px solid #F2E3EA" }}>
                            {h}:00
                          </button>
                        );
                      })}
                    </div>
                    {selectedHour !== null && (
                      <button onClick={() => setStep(3)} className="bk-btn"
                        style={{ width: "100%", padding: "15px 0", borderRadius: 14, background: pc, color: "#fff", fontSize: 16, fontWeight: 800, marginTop: 8, boxShadow: `0 8px 20px ${pc}44` }}>
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
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>← חזרה</button>

                <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 18, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
                  <p style={{ fontSize: 12, color: "#9A8E96", marginBottom: 6 }}>סיכום התור שלך</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#888" }}>טיפול</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#3A2A30" }}>{selectedService.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#888" }}>תאריך</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#3A2A30" }}>{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#888" }}>שעה</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#3A2A30" }}>{selectedHour}:00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #F2E3EA", paddingTop: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#3A2A30" }}>מחיר</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: pc }}>₪{selectedService.price}</span>
                  </div>
                </div>

                <h2 style={{ fontSize: 15, fontWeight: 800, color: "#3A2A30", marginBottom: 12 }}>הפרטים שלך</h2>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא"
                  style={{ width: "100%", border: "2px solid #F2E3EA", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
                  style={{ width: "100%", border: "2px solid #F2E3EA", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 12 }} />

                {errorMsg && <p style={{ color: "#D32F2F", fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{errorMsg}</p>}

                <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
                  style={{ width: "100%", padding: "16px 0", borderRadius: 14, background: pc, color: "#fff", fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55` }}>
                  {submitting ? "קובע תור..." : `✨ ${brand?.ctaLabel || "קבעי תור"}`}
                </button>
              </div>
            )}

            {/* STEP 4 — SUCCESS */}
            {step === 4 && (
              <div className="bk-card" style={{ textAlign: "center", paddingTop: 20 }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: pc, marginBottom: 8 }}>התור נקבע!</h2>
                <p style={{ fontSize: 14, color: "#3A2A30", lineHeight: 1.6, marginBottom: 20 }}>
                  נתראה ב{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} בשעה {selectedHour}:00
                </p>
                <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", textAlign: "right", marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#888" }}>טיפול</span><span style={{ fontSize: 13, fontWeight: 700 }}>{selectedService.name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#888" }}>שם</span><span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "#888" }}>טלפון</span><span style={{ fontSize: 13, fontWeight: 700 }}>{phone}</span></div>
                </div>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#25D366", color: "#fff", textDecoration: "none", padding: "11px 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>💬 שלחי לנו הודעה</a>}
                <p style={{ fontSize: 12, color: "#B49AA6" }}>נשמח לראותך! 💗</p>
              </div>
            )}

          </div>
        </>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "28px 20px 0" }}>
        {addr && step === 1 && (
          <p style={{ fontSize: 12.5, color: pc, fontWeight: 600, marginBottom: 6 }}>📍 {addr}</p>
        )}
        <p style={{ fontSize: 11, color: "#C9A9B6" }}>מופעל ע"י BloomOS 💎</p>
      </div>
    </div>
  );
}

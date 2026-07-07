"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// ============================================================
// PUBLIC BOOKING PAGE  —  /book
// Clients book their own appointments, 24/7.
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

export default function BookPage() {
  // === DATA ===
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState(null);
  const [tenantError, setTenantError] = useState(false);

  // === BOOKING FLOW STATE ===
  const [step, setStep] = useState(1); // 1=service, 2=date+time, 3=details, 4=done
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Read the tenant from the URL (?t=...) on mount, then load that tenant's data.
  useEffect(() => {
    let t = null;
    try {
      const params = new URLSearchParams(window.location.search);
      t = params.get("t");
    } catch {}
    if (!t) {
      // No tenant in the URL - we cannot safely show any business's data.
      setTenantError(true);
      setLoading(false);
      return;
    }
    setTenantId(t);
    loadData(t);
  }, []);

  const loadData = async (t) => {
    try {
      // Every query is scoped to this tenant only.
      const [st, sv, ap] = await Promise.all([
        supabase.from("settings").select("*").eq("tenant_id", t).limit(1),
        supabase.from("service_prices").select("*").eq("tenant_id", t),
        supabase.from("appointments").select("date, hour").eq("tenant_id", t),
      ]);

      if (st.data && st.data.length > 0) {
        setSettings(st.data[0]);
      } else {
        // Tenant has no settings row - treat as not found rather than guessing.
        setTenantError(true);
        setLoading(false);
        return;
      }

      if (sv.data && sv.data.length > 0) {
        setServices(sv.data.filter((s) => s.active !== false));
      }
      if (ap.data) setAppointments(ap.data);
    } catch (err) {
      console.error("loadData error:", err);
      setTenantError(true);
    } finally {
      setLoading(false);
    }
  };

  const pc = settings?.primary_color || "#E91E63";

  // === Build next 14 available days (respecting working_days) ===
  const workingDays = (settings?.working_days || "0,1,2,3,4,5")
    .split(",")
    .filter((x) => x !== "")
    .map(Number);
  const availableDays = [];
  for (let i = 0; i < 21 && availableDays.length < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (workingDays.includes(d.getDay())) availableDays.push(d);
  }

  // === Build hours for selected day ===
  const startH = settings?.working_hours_start || 9;
  const endH = settings?.working_hours_end || 19;
  const allHours = [];
  for (let h = startH; h < endH; h++) allHours.push(h);

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
      if (!result.success) { setErrorMsg("אירעה שגיאה. נסי שוב."); setSubmitting(false); return; }
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "#FFF0F6", fontSize: 18, color: "#E91E63" }}>
        טוען... 💗
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "linear-gradient(160deg, #FFF0F6 0%, #FFE3EF 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>💔</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#E91E63", marginBottom: 8 }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: "#B77", maxWidth: 320, lineHeight: 1.6 }}>
          נראה שהקישור לקביעת התור חסר או שגוי. אנא פני לעסק לקבלת קישור עדכני.
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo','Assistant',sans-serif", background: `linear-gradient(160deg, #FFF0F6 0%, #FFE3EF 100%)`, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .bk-card { animation: bkIn 0.4s ease-out; }
        @keyframes bkIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .bk-chip { transition: all 0.15s; cursor: pointer; }
        .bk-chip:active { transform: scale(0.96); }
        .bk-btn { transition: all 0.15s; cursor: pointer; border: none; font-family: inherit; }
        .bk-btn:active:not(:disabled) { transform: scale(0.97); }
        .bk-btn:disabled { opacity: 0.5; cursor: default; }
      `}</style>

      {/* HEADER */}
      <div style={{ width: "100%", maxWidth: 480, padding: "32px 20px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>💗</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: pc, marginBottom: 4 }}>{settings?.business_name || "קביעת תור"}</h1>
        <p style={{ fontSize: 13, color: "#B77", fontWeight: 500 }}>קביעת תור אונליין · 24/7</p>
      </div>

      {/* PROGRESS BAR */}
      {step < 4 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 18, padding: "0 20px" }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ width: 44, height: 5, borderRadius: 4, background: step >= s ? pc : "#F5C9DC", transition: "background 0.3s" }} />
          ))}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

        {/* STEP 1 — CHOOSE SERVICE */}
        {step === 1 && (
          <div className="bk-card">
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#3A2A30", marginBottom: 14, textAlign: "center" }}>איזה טיפול מעניין אותך?</h2>
            {services.length === 0 ? (
              <p style={{ textAlign: "center", color: "#B77", fontSize: 13 }}>אין שירותים זמינים כרגע</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {services.map((s, i) => (
                  <div key={i} className="bk-chip" onClick={() => { setSelectedService(s); setStep(2); }}
                    style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 4px 16px rgba(233,30,99,0.08)", border: "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color || pc, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "#3A2A30" }}>{s.name}</p>
                        <p style={{ fontSize: 12, color: "#B77" }}>{s.duration || 60} דקות</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: pc }}>₪{s.price}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — CHOOSE DATE + TIME */}
        {step === 2 && (
          <div className="bk-card">
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>← חזרה</button>
            <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(233,30,99,0.08)" }}>
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
                    style={{ flexShrink: 0, width: 62, padding: "12px 0", borderRadius: 14, textAlign: "center", background: isSel ? pc : "#fff", color: isSel ? "#fff" : "#3A2A30", boxShadow: "0 4px 12px rgba(233,30,99,0.08)", border: isSel ? "none" : "2px solid #FCE0EC" }}>
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
                        style={{ padding: "11px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, background: taken ? "#F2E3E9" : isSel ? pc : "#fff", color: taken ? "#C9A9B6" : isSel ? "#fff" : "#3A2A30", textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "0 3px 10px rgba(233,30,99,0.07)", border: isSel ? "none" : "2px solid #FCE0EC" }}>
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

            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 18, boxShadow: "0 4px 16px rgba(233,30,99,0.08)" }}>
              <p style={{ fontSize: 12, color: "#B77", marginBottom: 6 }}>סיכום התור שלך</p>
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
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #FCE0EC", paddingTop: 6, marginTop: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#3A2A30" }}>מחיר</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: pc }}>₪{selectedService.price}</span>
              </div>
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#3A2A30", marginBottom: 12 }}>הפרטים שלך</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא"
              style={{ width: "100%", border: "2px solid #FCE0EC", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 10 }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
              style={{ width: "100%", border: "2px solid #FCE0EC", borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "#fff", marginBottom: 12 }} />

            {errorMsg && <p style={{ color: "#D32F2F", fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>{errorMsg}</p>}

            <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
              style={{ width: "100%", padding: "16px 0", borderRadius: 14, background: pc, color: "#fff", fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55` }}>
              {submitting ? "קובע תור..." : "✨ קבעי תור"}
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
            <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", boxShadow: "0 4px 16px rgba(233,30,99,0.08)", textAlign: "right", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#888" }}>טיפול</span><span style={{ fontSize: 13, fontWeight: 700 }}>{selectedService.name}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: "#888" }}>שם</span><span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "#888" }}>טלפון</span><span style={{ fontSize: 13, fontWeight: 700 }}>{phone}</span></div>
            </div>
            <p style={{ fontSize: 12, color: "#B77" }}>נשמח לראותך! 💗</p>
          </div>
        )}

      </div>

      {/* FOOTER */}
      <div style={{ marginTop: "auto", paddingTop: 30, fontSize: 11, color: "#C9A9B6" }}>
        מופעל ע"י BloomOS 💎
      </div>
    </div>
  );
}

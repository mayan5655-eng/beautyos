"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

const PRESET_COLORS = ["#D4945A", "#F4A7B9", "#A7C4F4", "#B5EAD7", "#E2CFEA", "#FFDAC1", "#9C27B0", "#2C1A1A"];

type OnboardingData = {
  business_name: string;
  therapist_name: string;
  business_phone: string;
  primary_color: string;
  working_hours_start: number;
  working_hours_end: number;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    business_name: "",
    therapist_name: "",
    business_phone: "",
    primary_color: "#D4945A",
    working_hours_start: 8,
    working_hours_end: 19,
  });

  // === Auth + onboarding-status check ===
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        // Look up tenant_id for this user
        const { data: members, error: memberErr } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single();
        if (memberErr || !members) {
          setError("לא נמצא חיבור לעסק. נסי לצאת ולהיכנס שוב.");
          setLoading(false);
          return;
        }
        setTenantId(members.tenant_id);

        // If settings already exist → onboarding already complete
        const { data: existing } = await supabase
          .from("settings")
          .select("id")
          .limit(1);
        if (existing && existing.length > 0) {
          router.replace("/");
          return;
        }

        // Pre-fill therapist name from email/metadata if available
        const fullName = user.user_metadata?.full_name as string | undefined;
        const fromEmail = user.email?.split("@")[0] ?? "";
        setData(d => ({ ...d, therapist_name: fullName || fromEmail }));
        setLoading(false);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message || "שגיאה בטעינה");
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const next = () => setStep(s => Math.min(3, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  const finish = async () => {
    if (saving || !tenantId) return;
    setSaving(true);
    setError("");
    try {
      const settings = {
        tenant_id: tenantId,
        business_name: data.business_name.trim() || "העסק שלי",
        therapist_name: data.therapist_name.trim() || "רונית",
        business_phone: data.business_phone.trim(),
        primary_color: data.primary_color,
        working_hours_start: Number(data.working_hours_start) || 8,
        working_hours_end: Number(data.working_hours_end) || 19,
      };

      const { error: insertErr } = await supabase.from("settings").insert([settings]);
      if (insertErr) throw insertErr;

      // Update tenant.name only if user actually filled it in
      if (data.business_name.trim()) {
        await supabase.from("tenants").update({ name: data.business_name.trim() }).eq("id", tenantId);
      }

      router.replace("/");
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error("[Onboarding save error]", err);
      setError(err.message || "שגיאה בשמירה. נסי שוב.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ fontSize: 14, color: "#888", fontFamily: "'Heebo','Assistant',sans-serif" }}>💎 רגע, טוענים...</p>
      </div>
    );
  }

  const pc = data.primary_color || "#D4945A";

  return (
    <div dir="rtl" style={containerStyle}>
      <style>{`
        @keyframes fadeIn { from {opacity:0;transform:translateY(8px)} to {opacity:1;transform:translateY(0)} }
        .step-body { animation: fadeIn 0.28s ease-out; }
        .ob-input:focus { border-color: ${pc} !important; background: #fff !important; }
        .ob-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px ${pc}55; }
        .ob-btn-secondary:hover { background: #FAF7F5; }
        .swatch:hover { transform: scale(1.1); }
      `}</style>

      <div style={cardStyle}>
        {/* Brand mark */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>💎</div>
          <p style={{ fontSize: 10, color: "#BBB", fontWeight: 600, letterSpacing: 1.5 }}>BEAUTYOS</p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#888", fontWeight: 600 }}>
            <span>שלב {step} מתוך 3</span>
            <span>{Math.round((step / 3) * 100)}%</span>
          </div>
          <div style={{ height: 6, background: "#EEE8E2", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(step / 3) * 100}%`, background: pc, transition: "width 0.35s ease", borderRadius: 3 }} />
          </div>
        </div>

        {/* Steps */}
        <div key={step} className="step-body">
          {step === 1 && (
            <>
              <h1 style={titleStyle}>😊 ברוכה הבאה!</h1>
              <p style={subtitleStyle}>שמחים שאת איתנו. בואי נכיר — נתחיל מהדברים הבסיסיים על העסק שלך. אפשר תמיד לדלג ולעדכן אחר כך.</p>
              <Field label="שם העסק">
                <input
                  className="ob-input"
                  value={data.business_name}
                  onChange={e => setData({ ...data, business_name: e.target.value })}
                  placeholder="למשל: סטודיו רונית"
                  style={inputStyle}
                />
              </Field>
              <Field label="שם המטפלת">
                <input
                  className="ob-input"
                  value={data.therapist_name}
                  onChange={e => setData({ ...data, therapist_name: e.target.value })}
                  placeholder="השם שלך"
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={titleStyle}>📱 פרטי קשר ועיצוב</h1>
              <p style={subtitleStyle}>הטלפון לתשלומים יוצמד אוטומטית להודעות הבקשה לתשלום בוואטסאפ. אפשר להשאיר ריק.</p>
              <Field label="טלפון לתשלומים (ביט / פייבוקס)">
                <input
                  className="ob-input"
                  value={data.business_phone}
                  onChange={e => setData({ ...data, business_phone: e.target.value })}
                  placeholder="0501234567"
                  style={{ ...inputStyle, direction: "ltr" }}
                />
              </Field>
              <Field label="צבע ראשי של המערכת">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <input type="color" value={data.primary_color} onChange={e => setData({ ...data, primary_color: e.target.value })}
                    style={{ width: 56, height: 44, border: "1.5px solid #EEE8E2", borderRadius: 10, cursor: "pointer", background: "#FAF7F5" }} />
                  <input
                    className="ob-input"
                    value={data.primary_color}
                    onChange={e => setData({ ...data, primary_color: e.target.value })}
                    style={{ ...inputStyle, direction: "ltr", margin: 0, flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setData({ ...data, primary_color: c })}
                      className="swatch"
                      title={c}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", padding: 0,
                        border: data.primary_color.toLowerCase() === c.toLowerCase() ? `3px solid #2C1A1A` : "2px solid #EEE8E2",
                        background: c, cursor: "pointer", transition: "transform 0.15s",
                      }}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={titleStyle}>🕐 שעות עבודה</h1>
              <p style={subtitleStyle}>השעות האלה יקבעו אילו משבצות זמן יוצגו ביומן השבועי. תמיד אפשר לשנות בהגדרות.</p>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <Field label="התחלה" inline>
                  <input
                    className="ob-input"
                    type="number"
                    min={6}
                    max={20}
                    value={data.working_hours_start}
                    onChange={e => setData({ ...data, working_hours_start: Number(e.target.value) })}
                    style={{ ...inputStyle, textAlign: "center" }}
                  />
                </Field>
                <span style={{ fontSize: 18, color: "#BBB", marginTop: 22, fontWeight: 600 }}>—</span>
                <Field label="סיום" inline>
                  <input
                    className="ob-input"
                    type="number"
                    min={7}
                    max={22}
                    value={data.working_hours_end}
                    onChange={e => setData({ ...data, working_hours_end: Number(e.target.value) })}
                    style={{ ...inputStyle, textAlign: "center" }}
                  />
                </Field>
              </div>
              <div style={{ background: "#FAF7F5", borderRadius: 11, padding: "11px 14px", fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                ✨ מצוין! בלחיצה על &quot;סיום&quot; נכין את החשבון ונעבור למערכת.
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#FEEBEE", border: "1px solid #EF9A9A", color: "#C62828", padding: "10px 14px", borderRadius: 10, fontSize: 12, marginTop: 14, textAlign: "right" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, marginTop: 26, alignItems: "center", flexWrap: "wrap" }}>
          {step > 1 && !saving && (
            <button onClick={prev} className="ob-btn-secondary" style={btnSecondaryStyle}>
              ← הקודם
            </button>
          )}

          {step < 3 ? (
            <>
              <button onClick={next} className="ob-btn-secondary" style={{ ...btnSecondaryStyle, marginRight: "auto", color: "#888" }}>
                דלג
              </button>
              <button onClick={next} className="ob-btn-primary" style={{ ...btnPrimaryStyle, background: pc }}>
                הבא ←
              </button>
            </>
          ) : (
            <button onClick={finish} disabled={saving} className="ob-btn-primary"
              style={{ ...btnPrimaryStyle, background: saving ? "#CCC" : pc, marginRight: "auto", flex: 1, justifyContent: "center" }}>
              {saving ? "שומר..." : "סיום ✓"}
            </button>
          )}
        </div>
      </div>

      {/* Tiny footer hint */}
      <p style={{ marginTop: 14, fontSize: 10, color: "#BBB", fontFamily: "'Heebo','Assistant',sans-serif" }}>
        תמיד אפשר לעדכן את כל ההגדרות מאוחר יותר ב-⚙️ הגדרות
      </p>
    </div>
  );
}

// === Sub-components ===
function Field({ label, children, inline = false }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 14, flex: inline ? 1 : undefined }}>
      <label style={{ display: "block", fontSize: 11, color: "#666", fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

// === Styles ===
const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #FAF7F5 0%, #F3EEE9 100%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
  fontFamily: "'Heebo','Assistant',sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 14px 44px rgba(44,26,26,0.08), 0 2px 8px rgba(44,26,26,0.04)",
  border: "1px solid #EEE8E2",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "#2C1A1A",
  marginBottom: 6,
  lineHeight: 1.3,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "#888",
  marginBottom: 22,
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #EEE8E2",
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
  direction: "rtl",
  background: "#FAF7F5",
  color: "#2C1A1A",
  transition: "border-color 0.15s, background 0.15s",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "11px 24px",
  border: "none",
  borderRadius: 10,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  transition: "transform 0.15s, box-shadow 0.15s",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "11px 16px",
  border: "1.5px solid #EEE8E2",
  borderRadius: 10,
  background: "#fff",
  fontSize: 13,
  color: "#666",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 500,
  transition: "background 0.15s",
};

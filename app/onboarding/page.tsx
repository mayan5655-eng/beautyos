"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

const PRESET_COLORS = ["#4A2E5A", "var(--pc-tint)", "#A7C4F4", "var(--success)", "var(--pc-tint)", "rgba(242,184,75,0.16)", "var(--pc)", "var(--ink)"];

type OnboardingData = {
  business_name: string;
  therapist_name: string;
  business_phone: string;
  primary_color: string;
  working_hours_start: number;
  working_hours_end: number;
};

// The three step names, matching the headings shown in each step body.
const STEP_NAMES = ["ברוכה הבאה", "פרטי קשר ועיצוב", "שעות עבודה"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Written step flow, taken from the three step headings below.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    business_name: "",
    therapist_name: "",
    business_phone: "",
    primary_color: "#4A2E5A",
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
        // Left blank rather than backfilled with a fake placeholder: the app
        // shows a neutral greeting and a first-run checklist prompting her to
        // fill these in, so no "העסק שלי" / "רונית" ever leaks to real clients.
        business_name: data.business_name.trim(),
        therapist_name: data.therapist_name.trim(),
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
        <p style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "'Heebo','Assistant',sans-serif" }}>💎 רגע, טוענים...</p>
      </div>
    );
  }

  const pc = data.primary_color || "#4A2E5A";

  return (
    <div dir="rtl" style={containerStyle}>
      <style>{`
        @keyframes fadeIn { from {opacity:0;transform:translateY(8px)} to {opacity:1;transform:translateY(0)} }
        .step-body { animation: fadeIn 0.28s ease-out; }
        .ob-input:focus { border-color: ${pc} !important; background: var(--surface) !important; }
        .ob-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px ${pc}55; }
        .ob-btn-secondary:hover { background: var(--brand-cream, #FEFAF7); }
        .swatch:hover { transform: scale(1.1); }
      `}</style>

      <div style={cardStyle}>
        {/* Brand mark */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 26, marginBottom: 4 }}>💎</div>
          <p style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600, letterSpacing: 1.5 }}>BLOOMOS</p>
        </div>

        {/* Progress — written, not graphic. Step names with arrows between
            them, the current one in her accent. RTL reads right to left, so
            "←" points forward. */}
        <nav aria-label="התקדמות" style={{ marginBottom: 26, display: "flex", alignItems: "center",
              justifyContent: "center", flexWrap: "wrap", gap: 7, fontSize: 12.5, lineHeight: 1.6 }}>
          {STEP_NAMES.map((name, i) => {
            const n = i + 1;
            const current = n === step;
            const done = n < step;
            return (
              <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span
                  aria-current={current ? "step" : undefined}
                  style={{
                    color: current ? pc : done ? "var(--ink-2)" : "var(--ink-3)",
                    fontWeight: current ? 700 : 500,
                  }}
                >
                  {name}
                </span>
                {n < STEP_NAMES.length && (
                  <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 11 }}>←</span>
                )}
              </span>
            );
          })}
        </nav>

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
                    style={{ width: 56, height: 44, border: "1.5px solid var(--line)", borderRadius: 10, cursor: "pointer", background: "var(--brand-cream, #FEFAF7)" }} />
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
                        border: data.primary_color.toLowerCase() === c.toLowerCase() ? `3px solid var(--ink)` : "2px solid var(--line)",
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
                <span style={{ fontSize: 18, color: "var(--ink-3)", marginTop: 22, fontWeight: 600 }}>—</span>
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
              <div style={{ background: "var(--brand-cream, #FEFAF7)", borderRadius: 11, padding: "11px 14px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
                ✨ מצוין! בלחיצה על &quot;סיום&quot; נכין את החשבון ונעבור למערכת.
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(224,91,111,0.10)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px 14px", borderRadius: 10, fontSize: 12, marginTop: 14, textAlign: "right" }}>
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
              <button onClick={next} className="ob-btn-secondary" style={{ ...btnSecondaryStyle, marginRight: "auto", color: "var(--ink-3)" }}>
                דלג
              </button>
              <button onClick={next} className="ob-btn-primary" style={{ ...btnPrimaryStyle, background: pc }}>
                הבא ←
              </button>
            </>
          ) : (
            <button onClick={finish} disabled={saving} className="ob-btn-primary"
              style={{ ...btnPrimaryStyle, background: saving ? "var(--line-2)" : pc, marginRight: "auto", flex: 1, justifyContent: "center" }}>
              {saving ? "שומר..." : "סיום ✓"}
            </button>
          )}
        </div>
      </div>

      {/* Tiny footer hint */}
      <p style={{ marginTop: 14, fontSize: 10, color: "var(--ink-3)", fontFamily: "'Heebo','Assistant',sans-serif" }}>
        תמיד אפשר לעדכן את כל ההגדרות מאוחר יותר ב-⚙️ הגדרות
      </p>
    </div>
  );
}

// === Sub-components ===
function Field({ label, children, inline = false }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 14, flex: inline ? 1 : undefined }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--ink-2)", fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

// === Styles ===
const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, var(--brand-cream, #FEFAF7) 0%, var(--brand-cream, #FEFAF7) 100%)",
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
  background: "var(--surface)",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 14px 44px rgba(44,26,26,0.08), 0 2px 8px rgba(44,26,26,0.04)",
  border: "1px solid var(--line)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "var(--ink)",
  marginBottom: 6,
  lineHeight: 1.3,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--ink-3)",
  marginBottom: 22,
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--line)",
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
  direction: "rtl",
  background: "var(--brand-cream, #FEFAF7)",
  color: "var(--ink)",
  transition: "border-color 0.15s, background 0.15s",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "11px 24px",
  border: "none",
  borderRadius: 10,
  color: "var(--surface)",
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
  border: "1.5px solid var(--line)",
  borderRadius: 10,
  background: "var(--surface)",
  fontSize: 13,
  color: "var(--ink-2)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 500,
  transition: "background 0.15s",
};

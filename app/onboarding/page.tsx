"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import ImportChooser, { type ImportKind } from "../ImportChooser";
import ServiceTemplatePicker from "../ServiceTemplatePicker";
import { lighten } from "@/lib/theme";
import { buildSeedSettings, SEEDED_SETTINGS_KEYS } from "@/lib/tenantTemplate";
import { insertPickedServices, type PickedService } from "@/lib/seedServices";

// PostgREST reports an unknown column as PGRST204 ("column ... does not exist
// in the schema cache"); Postgres itself uses SQLSTATE 42703. The message check
// is the belt-and-braces third form, because this decides whether a failed
// signup is retried or surfaced, and guessing wrong in the strict direction
// costs a customer her account.
function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return true;
  return /could not find|does not exist|schema cache|unknown column/i.test(e.message || "");
}

const PRESET_COLORS = ["#4A2E5A", "var(--pc-tint)", "#A7C4F4", "var(--success)", "var(--pc-tint)", "rgba(242,184,75,0.16)", "var(--pc)", "var(--ink)"];

type OnboardingData = {
  business_name: string;
  therapist_name: string;
  business_phone: string;
  primary_color: string;
  working_hours_start: number;
  working_hours_end: number;
};

// The step names, matching the headings shown in each step body. The list IS
// the step count — `next` and the footer both cap on its length, so adding a
// step here and a `step === n` block below is the whole change.
const STEP_NAMES = ["ברוכה הבאה", "פרטי קשר ועיצוב", "שעות עבודה", "השירותים שלך", "ייבוא נתונים"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Written step flow, taken from the three step headings below.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  // The import chooser is rendered here, in this step, rather than waiting for
  // the save round-trip and a redirect. Tapping the button must feel instant.
  const [showChooser, setShowChooser] = useState(false);

  // Treatments she ticked in step 4. Held here rather than written on tap:
  // onboarding is "complete" when a settings row exists, so services inserted
  // before that row would leave an abandoned signup with a menu and no
  // settings — and send her back through onboarding over populated tables.
  // They go in inside finish(), straight after the settings insert.
  const [pickedServices, setPickedServices] = useState<PickedService[]>([]);

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
          // Already onboarded: straight to the app, no import detour.
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

  // Capped by the step list, not a literal: adding the import step left this at
  // 3 and made the last step unreachable from "הבא".
  const next = () => setStep(s => Math.min(STEP_NAMES.length, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  // Saves onboarding, then lands her wherever she asked to go. importKind is
  // set once she has already chosen what to bring across, so the app opens
  // that wizard directly instead of asking her the same question again.
  const finish = async (importKind: ImportKind | null = null) => {
    if (saving || !tenantId) return;
    setSaving(true);
    setError("");
    try {
      const openHour = Number(data.working_hours_start) || 8;
      const closeHour = Number(data.working_hours_end) || 19;

      const settings = {
        // Starting configuration every new cosmetician gets: a per-day week
        // built around the hours just above, the automation toggles written
        // down explicitly instead of left to a default buried in a render, and
        // five blank FAQ questions for her bot. Hand-written generic values
        // only — see lib/tenantTemplate.ts for what is deliberately absent and
        // why, and scripts/check-template-clean.mjs for the build check that
        // keeps it that way.
        //
        // Spread FIRST so that anything she actually typed below wins on any
        // key the two ever come to share.
        ...buildSeedSettings(openHour, closeHour),
        tenant_id: tenantId,
        // Left blank rather than backfilled with a fake placeholder: the app
        // shows a neutral greeting and a first-run checklist prompting her to
        // fill these in, so no "העסק שלי" / "רונית" ever leaks to real clients.
        business_name: data.business_name.trim(),
        therapist_name: data.therapist_name.trim(),
        business_phone: data.business_phone.trim(),
        primary_color: data.primary_color,
        // working_hours_start/end are NOT set here. They come from
        // buildSeedSettings above, derived from the same per-day map as
        // business_hours and working_days, so the four scheduling columns
        // cannot disagree with one another. openHour/closeHour are what she
        // typed; they reach the row through that one derivation.
      };

      const { error: insertErr } = await supabase.from("settings").insert([settings]);
      if (insertErr) {
        // Every column the seed writes was verified against information_schema
        // on 2026-08-31 and all 19 exist, so this branch should never run.
        //
        // It stays because of HOW schema changes reach this database: by hand,
        // in the Supabase SQL editor, with finished migrations sometimes parked
        // in supabase/migrations/pending for weeks. An insert naming one column
        // that does not exist fails the WHOLE row — so the day someone adds a
        // key to the seed ahead of its migration, signup breaks for every new
        // cosmetician, and the only symptom is "שגיאה בשמירה".
        //
        // One retry with the seeded keys stripped. She still gets her account
        // with what she typed; the seeded defaults are what is lost, and every
        // one of them has a working fallback in its reader. When the migration
        // does land, the full seed starts applying again on its own.
        if (isMissingColumnError(insertErr)) {
          console.warn("[Onboarding] settings insert rejected a seeded column; retrying with the seed stripped", insertErr);
          const reduced: Record<string, unknown> = { ...settings };
          for (const key of SEEDED_SETTINGS_KEYS) delete reduced[key];
          const { error: retryErr } = await supabase.from("settings").insert([reduced]);
          if (retryErr) throw retryErr;
        } else {
          throw insertErr;
        }
      }

      // Her picked treatments, now that the settings row exists. A failure here
      // is reported but does NOT block the redirect: she has an account, and
      // the same picker is waiting in Settings → שירותים. Losing the menu is a
      // retry; losing the finished signup is not.
      if (pickedServices.length > 0) {
        const { error: svcErr } = await insertPickedServices(
          supabase,
          tenantId,
          pickedServices
        );
        if (svcErr) {
          console.error("[Onboarding] service seed failed", svcErr);
        }
      }

      // Update tenant.name only if user actually filled it in
      if (data.business_name.trim()) {
        await supabase.from("tenants").update({ name: data.business_name.trim() }).eq("id", tenantId);
      }

      router.replace(importKind ? `/?import=1&kind=${importKind}` : "/");
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
  // Onboarding runs before the app applies the --pc-* tokens, so derive the
  // tint here rather than relying on a variable that is not set on this route.
  const pcTint = lighten(pc, 0.90);

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

          {step === 4 && (
            <>
              <h1 style={titleStyle}>✦ השירותים שלך</h1>
              <p style={subtitleStyle}>
                סימני את הטיפולים שאת מבצעת — רק אותם נוסיף. המחירים הם הצעה לפי המקובל בשוק
                ואפשר לשנות כל אחד מהם כאן, או אחר כך בהגדרות. אפשר גם לדלג ולבנות את המחירון מאפס.
              </p>
              <ServiceTemplatePicker
                value={pickedServices}
                onChange={setPickedServices}
                accent={pc}
                accentTint={pcTint}
              />
              <div style={{ background: pcTint, border: "1px solid var(--line)", borderRadius: 14, padding: "12px 15px", marginTop: 12 }}>
                <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7, margin: 0 }}>
                  {pickedServices.length === 0
                    ? "לא נוסיף שום טיפול שלא סימנת. אפשר להוסיף הכל ידנית מאוחר יותר תחת הגדרות ← שירותים."
                    : `${pickedServices.length} טיפולים ייווספו למחירון שלך. משם הם שלך לגמרי — לשנות שם, מחיר או משך בכל רגע.`}
                </p>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1 style={titleStyle}>📥 יש לך נתונים בתוכנה אחרת?</h1>
              {!showChooser ? (
                <>
                  <p style={subtitleStyle}>
                    אם את עוברת ממערכת אחרת, אפשר להעביר את רשימת הלקוחות והמחירון לכאן בכמה דקות — בלי להקליד הכל מחדש.
                    מייצאים מהתוכנה הקודמת לאקסל, מעתיקים ומדביקים. אנחנו נשאל מה כל עמודה מייצגת.
                  </p>
                  <div style={{ background: pcTint, border: "1px solid var(--line)", borderRadius: 14, padding: "13px 15px", marginTop: 4 }}>
                    <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7, margin: 0 }}>
                      אפשר גם לדלג עכשיו ולעשות את זה מתי שנוח — ההגדרות תמיד מחכות לך תחת <strong style={{ color: pc }}>הגדרות ← ייבוא נתונים</strong>.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p style={subtitleStyle}>
                    {saving
                      ? "רגע, שומרים את ההגדרות ופותחים את הייבוא..."
                      : "מה להעביר קודם? נשמור את ההגדרות ונמשיך ישר לשם."}
                  </p>
                  <ImportChooser onPick={k => finish(k)} accent={pc} accentTint={pcTint} />
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={titleStyle}>🕐 שעות עבודה</h1>
              <p style={subtitleStyle}>שעות ההתחלה והסיום הרגילות שלך, מ-0 עד 24. בהגדרות ← שעות אפשר לקבוע שעות שונות לכל יום בנפרד, כולל שישי ושבת וכולל שעות ערב.</p>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <Field label="התחלה" inline>
                  <input
                    className="ob-input"
                    type="number"
                    min={0}
                    max={23}
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
                    min={1}
                    max={24}
                    value={data.working_hours_end}
                    onChange={e => setData({ ...data, working_hours_end: Number(e.target.value) })}
                    style={{ ...inputStyle, textAlign: "center" }}
                  />
                </Field>
              </div>
              <div style={{ background: "var(--brand-cream, #FEFAF7)", borderRadius: 11, padding: "11px 14px", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
                ✨ כמעט סיימנו — עוד שלב אחד ואנחנו בפנים.
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

          {step < STEP_NAMES.length ? (
            <>
              <button onClick={next} className="ob-btn-secondary" style={{ ...btnSecondaryStyle, marginRight: "auto", color: "var(--ink-3)" }}>
                דלג
              </button>
              <button onClick={next} className="ob-btn-primary" style={{ ...btnPrimaryStyle, background: pc }}>
                הבא ←
              </button>
            </>
          ) : (
            // "ייבוא נתונים" only opens the chooser - it deliberately does NOT
            // save first. Saving before showing the list made the button feel
            // broken: nothing happened until the round-trip came back. The save
            // now runs once she picks a kind, on her way into the wizard.
            <>
              <button onClick={()=>finish(null)} disabled={saving} className="ob-btn-secondary"
                style={{ ...btnSecondaryStyle, marginRight: "auto", color: "var(--ink-3)" }}>
                {saving ? "שומר..." : "לא עכשיו"}
              </button>
              {!showChooser && (
                <button onClick={()=>setShowChooser(true)} className="ob-btn-primary"
                  style={{ ...btnPrimaryStyle, background: pc }}>
                  ייבוא נתונים ←
                </button>
              )}
            </>
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
  minHeight: "100dvh",
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

"use client";

import { useState, useEffect } from "react";
import { displayName } from "@/lib/personName";
import { ONBOARDING_SWATCHES, swatchLabel } from "@/lib/brandSwatches";
import Image from "next/image";
import Icon from "../Icon";
import Spinner from "../Spinner";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import ImportChooser, { type ImportKind } from "../ImportChooser";
import ServiceTemplatePicker from "../ServiceTemplatePicker";
import FieldPicker from "../FieldPicker";
import { lighten } from "@/lib/theme";
import { buildSeedSettings } from "@/lib/tenantTemplate";
import { insertPickedServices, type PickedService } from "@/lib/seedServices";
import type { FieldKey } from "@/lib/businessFields";
import BrandBackdrop from "../BrandBackdrop";
import { BANNER_HEADER, BANNER_HEADER_W, BANNER_HEADER_H, BANNER_WIDE, BANNER_WIDE_W, BANNER_WIDE_H } from "@/lib/brand";

// The missing-column retry that used to live here moved with the insert into
// app/api/settings/save; lib/pgError.ts is its one definition now.

// Real hex values, by name (lib/brandSwatches.js): this list had been run through the token sweep and offered
// "var(--success)" and friends as colours, which saved a string her page cannot use.
const PRESET_COLORS = ONBOARDING_SWATCHES;

type OnboardingData = {
  business_name: string;
  therapist_name: string;
  business_phone: string;
  primary_color: string;
  working_hours_start: number;
  working_hours_end: number;
  /** Which field(s) she practices in. Empty until she picks — no field is
   *  pre-checked, on purpose: defaulting to cosmetics would put a nails
   *  technician's own onboarding through a facial-treatment menu. See
   *  lib/businessFields.ts. */
  business_fields: FieldKey[];
};

// The step names, matching the headings shown in each step body. The list IS
// the step count — `next` and the footer both cap on its length, so adding a
// step here and a `step === n` block below is the whole change.
const STEP_NAMES = ["ברוכה הבאה", "פרטי קשר ועיצוב", "שעות עבודה", "התחום והשירותים", "ייבוא נתונים"];

// Reloading mid-flow used to restart her from step 1, losing everything she'd
// already typed - nothing touched the database until finish(). Keyed by
// tenant, not just "the" draft, so two different onboarding attempts on the
// same browser (e.g. a second signup after abandoning the first) never
// cross-contaminate. Cleared on a successful finish(), so a completed
// signup never leaves a stale draft behind for anyone to stumble into.
const draftKey = (tenantId: string) => `kalmea-onboarding-draft:${tenantId}`;

type OnboardingDraft = {
  step: number;
  data: OnboardingData;
  pickedServices: PickedService[];
};

function loadDraft(tenantId: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as OnboardingDraft;
  } catch {
    // Private browsing, blocked storage, or corrupted JSON - a lost draft is
    // a minor inconvenience (she retypes), not a reason to break onboarding.
    return null;
  }
}

function saveDraft(tenantId: string, draft: OnboardingDraft) {
  try {
    window.localStorage.setItem(draftKey(tenantId), JSON.stringify(draft));
  } catch {
    // Same as above: storage failing silently is fine, onboarding still works.
  }
}

function clearDraft(tenantId: string) {
  try {
    window.localStorage.removeItem(draftKey(tenantId));
  } catch {
    // Nothing to do if this fails - worst case a stale draft lingers.
  }
}

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
    primary_color: "#E9A9A1", // Kalmea's DEFAULT_ACCENT (lib/theme.ts) - a product default, not her choice yet
    working_hours_start: 8,
    working_hours_end: 19,
    business_fields: [],
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

        // Resolve the tenant with the SAME function the RLS policies use,
        // like beautyos.jsx does. Reading tenant_members directly from the
        // client is itself gated by RLS and can return empty instead of
        // erroring - a query that cannot succeed pretending it succeeded
        // with no rows. An error and a null result are kept distinct: an
        // error means we do not know, null means "this user has no tenant".
        const { data: rpcTenant, error: memberErr } = await supabase.rpc(
          "get_user_tenant_id"
        );
        if (memberErr) {
          console.error("[onboarding] get_user_tenant_id failed", memberErr);
          setError(`שגיאה בזיהוי העסק: ${memberErr.message}`);
          setLoading(false);
          return;
        }
        if (!rpcTenant) {
          setError("לא נמצא חיבור לעסק. נסי לצאת ולהיכנס שוב.");
          setLoading(false);
          return;
        }
        setTenantId(rpcTenant);

        // Which ad brought her? The landing page left a first-party cookie (app/AttributionCapture.jsx); hand it
        // to the server once, now that she has an account, and clear it. Fire-and-forget: a failure here must
        // never stand between her and her first screen. (lib/attribution.js)
        try {
          // The cookie of THIS browser, else what the signup form stored in her account (she may well confirm her email
          // on her phone after signing up on a laptop: a cookie alone would lose the ad). The server re-parses either.
          const raw = document.cookie.split("; ").find((c) => c.startsWith("kl_attr="))?.slice("kl_attr=".length)
            || (typeof user.user_metadata?.kl_attr === "string" ? (user.user_metadata.kl_attr as string) : "");
          if (raw) {
            fetch("/api/attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attr: raw }), keepalive: true })
              // Cleared only when the server took it: a 401/500 used to clear it too, and the ad was lost for good.
              .then((r) => { if (r.ok) document.cookie = "kl_attr=; Max-Age=0; Path=/; SameSite=Lax"; })
              .catch(() => {});
          }
        } catch { /* attribution is a nicety */ }

        // If settings already exist → onboarding already complete
        const { data: existing } = await supabase
          .from("settings")
          .select("id")
          .limit(1);
        if (existing && existing.length > 0) {
          // Already onboarded: straight to the app, no import detour.
          // A stale draft from this same tenant (e.g. she finished, then hit
          // back) is meaningless now - clear it rather than leave it to be
          // found by a future, unrelated onboarding attempt.
          clearDraft(rpcTenant);
          router.replace("/");
          return;
        }

        // A reload mid-flow: restore exactly what she'd typed, on the step
        // she was on, instead of restarting her at step 1.
        const draft = loadDraft(rpcTenant);
        if (draft) {
          setData(draft.data);
          setPickedServices(draft.pickedServices || []);
          setStep(draft.step || 1);
          setLoading(false);
          return;
        }

        // Pre-fill her name ONLY from a name she gave (user_metadata.full_name), never from the email: the email's
        // local part ("maya.cohen") used to be saved as her name when she skipped the field, and her clients
        // then read "נעים מאוד, אני maya.cohen" on her booking page (found 2026-10-06). Empty is honest: the
        // page and the messages are written in the first person without a name. See lib/personName.js.
        const fullName = user.user_metadata?.full_name as string | undefined;
        // Pre-fill business name from signup too (app/signup/page.tsx sends it
        // as user_metadata.business_name) - she already typed it once there.
        // Missed before today: therapist_name got this same treatment, business
        // name didn't, so she was asked for it again a few seconds later.
        const signupBusinessName = user.user_metadata?.business_name as string | undefined;
        setData(d => ({
          ...d,
          therapist_name: displayName(fullName),
          business_name: signupBusinessName || d.business_name,
        }));
        setLoading(false);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message || "שגיאה בטעינה");
        setLoading(false);
      }
    };
    init();
  }, [router]);

  // Writes the draft on every change, once the initial load (including any
  // restore above) has finished - gated on !loading so this never fires
  // before restoration and overwrites a just-loaded draft with the blank
  // default state.
  useEffect(() => {
    if (loading || !tenantId) return;
    saveDraft(tenantId, { step, data, pickedServices });
  }, [loading, tenantId, step, data, pickedServices]);

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
        // Written as-is, even empty: if she skipped the field picker,
        // businessFieldsOf() (lib/businessFields.ts) is what every reader
        // goes through, and it falls back to cosmetics on an empty array —
        // the same "don't fake a value, let the reader default it" shape
        // business_name uses above.
        business_fields: data.business_fields,
        // working_hours_start/end are NOT set here. They come from
        // buildSeedSettings above, derived from the same per-day map as
        // business_hours and working_days, so the four scheduling columns
        // cannot disagree with one another. openHour/closeHour are what she
        // typed; they reach the row through that one derivation.
      };

      // Through the server, like every settings write (app/api/settings/save).
      // The route stamps tenant_id from her session, keeps only the columns in
      // lib/settingsColumns.ts, and carries the retry-with-the-seed-stripped
      // that used to live here: migrations are applied by hand and can lag
      // the code, and an insert naming one column that does not exist fails
      // the whole row - on the signup path, for every new cosmetician.
      // The browser can no longer insert into settings directly
      // (supabase/migrations/add_settings_write_guard.sql).
      const saveRes = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || `settings save failed (HTTP ${saveRes.status})`);
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

      clearDraft(tenantId);
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
        <p style={{ fontSize:"var(--t-md)", color: "var(--ink-3)", fontFamily: "'Heebo','Assistant',sans-serif" }}><Spinner inline label="רגע, טוענת" /></p>
      </div>
    );
  }

  const pc = data.primary_color || "#E9A9A1";
  // Onboarding runs before the app applies the --pc-* tokens, so derive the
  // tint here rather than relying on a variable that is not set on this route.
  const pcTint = lighten(pc, 0.90);

  return (
    <div dir="rtl" style={containerStyle}>
      {/* Ad-aligned pass: onboarding is a "moment" screen, same as /login and
          /signup - BrandBackdrop's bold corner flowers replace the old
          single quiet ChromeFlowerBg it shared with the dashboard chrome. */}
      <BrandBackdrop density="full" idPrefix="onboarding" />
      <style>{`
        @keyframes fadeIn { from {opacity:0;transform:translateY(8px)} to {opacity:1;transform:translateY(0)} }
        .step-body { animation: fadeIn 0.28s ease-out; }
        .ob-input:focus { border-color: ${pc} !important; background: var(--surface) !important; }
        .ob-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px ${pc}55; }
        .ob-btn-secondary:hover { background: var(--brand-cream, #F0EADE); }
        .swatch:hover { transform: scale(1.1); }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 460 }}>
        {/* Step 1 only: the FULL banner, flowers included - a real "welcome"
            moment, not the cropped header. Steps 2-5 keep BANNER_HEADER
            (the legible-at-phone-width crop): she's in task mode by then,
            and the full banner's slogan/domain line tested illegible at
            this column width (see BANNER_HEADER's comment). */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          {step === 1 ? (
            <Image
              src={BANNER_WIDE}
              alt="קלמיה — עסק שפורח. חיים עם יותר שקט."
              width={BANNER_WIDE_W}
              height={BANNER_WIDE_H}
              priority
              style={{ width: "min(460px, 100%)", height: "auto", filter: "drop-shadow(0 10px 22px rgba(48,24,72,0.16))" }}
            />
          ) : (
            <Image
              src={BANNER_HEADER}
              alt="קלמיה — עסק שפורח. חיים עם יותר שקט."
              width={BANNER_HEADER_W}
              height={BANNER_HEADER_H}
              style={{ width: "min(380px, 96%)", height: "auto", filter: "drop-shadow(0 10px 22px rgba(48,24,72,0.16))" }}
            />
          )}
        </div>

      <div style={cardStyle}>

        {/* Progress — written, not graphic. Step names with arrows between
            them, the current one in her accent. RTL reads right to left, so
            "←" points forward. */}
        <nav aria-label="התקדמות" style={{ marginBottom: 26, display: "flex", alignItems: "center",
              justifyContent: "center", flexWrap: "wrap", gap: 7, fontSize:"var(--t-sm)", lineHeight: 1.6 }}>
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
                  <span aria-hidden style={{ color: "var(--ink-3)", fontSize:"var(--t-xs)" }}>←</span>
                )}
              </span>
            );
          })}
        </nav>

        {/* Steps */}
        <div key={step} className="step-body">
          {step === 1 && (
            <>
              <h1 style={titleStyle}><Icon name="smile" size={22}/> ברוכה הבאה!</h1>
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
              <h1 style={titleStyle}><Icon name="phone" size={22}/> פרטי קשר ועיצוב</h1>
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
              {/* The one thing every new tenant must be told before her first
                  payment, not after: "אישור תשלום" (what she issues by default)
                  is not a legal receipt. The real disclosure text already lives
                  in Settings → תשלום and on every receipt/WhatsApp message - this
                  is just the first time she hears it, early enough to matter. */}
              <div style={{ background: "var(--brand-cream, #FDFBF9)", border: "1px solid var(--line)", borderRadius:"var(--r-sm)", padding: "11px 14px", fontSize:"var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 14 }}>
                שימי לב: המערכת מפיקה &quot;אישור תשלום&quot; בלבד — לא קבלה או חשבונית מס. קבלה חוקית צריכה לצאת מתוכנה רשומה; אפשר לחבר אחת (למשל מורנינג) מאוחר יותר תחת <strong style={{ color: pc }}>הגדרות ← תשלום</strong>.
              </div>
              <Field label="צבע ראשי של המערכת">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <input type="color" value={data.primary_color} onChange={e => setData({ ...data, primary_color: e.target.value })}
                    style={{ width: 56, height: 44, border: "1.5px solid var(--line)", borderRadius:"var(--r-sm)", cursor: "pointer", background: "var(--brand-cream, #FDFBF9)" }} />
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
                      title={swatchLabel(c)}
                      aria-label={swatchLabel(c)}
                      aria-pressed={data.primary_color.toLowerCase() === c.toLowerCase()}
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
              <h1 style={titleStyle}>✦ התחום שלך והשירותים</h1>
              <p style={subtitleStyle}>
                באיזה תחום את עובדת? אפשר לסמן יותר מאחד — מכאן והלאה נראה לך רק טיפולים רלוונטיים.
              </p>
              <div style={{ marginBottom: 18 }}>
                <FieldPicker
                  value={data.business_fields}
                  onChange={(fields) => setData({ ...data, business_fields: fields })}
                  accent={pc}
                  accentTint={pcTint}
                />
              </div>

              {data.business_fields.length === 0 ? (
                <div style={{ background: "var(--brand-cream, #FDFBF9)", borderRadius:"var(--r-sm)", padding: "11px 14px", fontSize:"var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>
                  בחרי תחום למעלה כדי לראות טיפולים מוצעים — או דלגי, ובני את המחירון מאפס בהגדרות ← שירותים.
                </div>
              ) : (
                <>
                  <p style={{ fontSize:"var(--t-sm)", color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.6 }}>
                    סימני את הטיפולים שאת מבצעת — רק אותם נוסיף. המחירים הם הצעה לפי המקובל בשוק
                    ואפשר לשנות כל אחד מהם כאן, או אחר כך בהגדרות.
                  </p>
                  <ServiceTemplatePicker
                    value={pickedServices}
                    onChange={setPickedServices}
                    fields={data.business_fields}
                    accent={pc}
                    accentTint={pcTint}
                  />
                </>
              )}
              <div style={{ background: pcTint, border: "1px solid var(--line)", borderRadius:"var(--r-md)", padding: "12px 15px", marginTop: 12 }}>
                <p style={{ fontSize:"var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.7, margin: 0 }}>
                  {pickedServices.length === 0
                    ? "לא נוסיף שום טיפול שלא סימנת. אפשר להוסיף הכל ידנית מאוחר יותר תחת הגדרות ← שירותים."
                    : `${pickedServices.length} טיפולים ייווספו למחירון שלך. משם הם שלך לגמרי — לשנות שם, מחיר או משך בכל רגע.`}
                </p>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1 style={titleStyle}><Icon name="download" size={22}/> יש לך נתונים בתוכנה אחרת?</h1>
              {!showChooser ? (
                <>
                  <p style={subtitleStyle}>
                    אם את עוברת ממערכת אחרת, אפשר להעביר את רשימת הלקוחות והמחירון לכאן בכמה דקות — בלי להקליד הכל מחדש.
                    מייצאים מהתוכנה הקודמת לאקסל, מעתיקים ומדביקים. אנחנו נשאל מה כל עמודה מייצגת.
                  </p>
                  <div style={{ background: pcTint, border: "1px solid var(--line)", borderRadius:"var(--r-md)", padding: "13px 15px", marginTop: 4 }}>
                    <p style={{ fontSize:"var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.7, margin: 0 }}>
                      אפשר גם לדלג עכשיו ולעשות את זה מתי שנוח — ההגדרות תמיד מחכות לך תחת <strong style={{ color: pc }}>הגדרות ← ייבוא נתונים</strong>.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p style={subtitleStyle}>
                    {saving
                      ?<Spinner inline label="רגע, שומרים את ההגדרות ופותחים את הייבוא"/>: "מה להעביר קודם? נשמור את ההגדרות ונמשיך ישר לשם."}
                  </p>
                  <ImportChooser onPick={k => finish(k)} accent={pc} accentTint={pcTint} />
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={titleStyle}><Icon name="clock" size={22}/> שעות עבודה</h1>
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
                <span style={{ fontSize:"var(--t-xl)", color: "var(--ink-3)", marginTop: 22, fontWeight: 600 }}>—</span>
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
              <div style={{ background: "var(--brand-cream, #FDFBF9)", borderRadius:"var(--r-sm)", padding: "11px 14px", fontSize:"var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>
                ✨ כמעט סיימנו — עוד שלב אחד ואנחנו בפנים.
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(224,91,111,0.10)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "10px 14px", borderRadius:"var(--r-sm)", fontSize:"var(--t-sm)", marginTop: 14, textAlign: "right" }}>
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
                דלגי
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
                {saving ?<Spinner inline label="שומר"/>: "לא עכשיו"}
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
      </div>

      {/* Tiny footer hint */}
      <p style={{ marginTop: 14, fontSize:"var(--t-sm)", color: "var(--ink-3)", fontFamily: "'Heebo','Assistant',sans-serif" }}>
        {/* The gear is an inline SVG in the app now, so naming an emoji here
            points her at a glyph that no longer appears anywhere. */}
        תמיד אפשר לעדכן את כל ההגדרות מאוחר יותר במסך ההגדרות
      </p>
    </div>
  );
}

// === Sub-components ===
function Field({ label, children, inline = false }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 14, flex: inline ? 1 : undefined }}>
      <label style={{ display: "block", fontSize:"var(--t-xs)", color: "var(--ink-2)", fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

// === Styles ===
const containerStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 0,
  overflow: "hidden",
  minHeight: "100dvh",
  // Flat cream now, not a (visually identical) two-stop gradient - the real
  // wash comes from BrandBackdrop, same as /login and /signup.
  background: "var(--brand-cream, #F0EADE)",
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
  borderRadius:"var(--r-lg)",
  padding: 28,
  boxShadow:"var(--shadow-lg)",
  border: "1px solid var(--line)",
};

const titleStyle: React.CSSProperties = {
  fontSize:"var(--t-2xl)",
  fontWeight: 800,
  color: "var(--ink)",
  marginBottom: 6,
  lineHeight: 1.3,
};

const subtitleStyle: React.CSSProperties = {
  fontSize:"var(--t-sm)",
  color: "var(--ink-3)",
  marginBottom: 22,
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--line)",
  borderRadius:"var(--r-sm)",
  padding: "11px 13px",
  fontSize:"var(--t-md)",
  fontFamily: "inherit",
  outline: "none",
  direction: "rtl",
  background: "var(--brand-cream, #FDFBF9)",
  color: "var(--ink)",
  transition: "border-color 0.15s, background 0.15s",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "11px 24px",
  border: "none",
  borderRadius:"var(--r-sm)",
  color: "var(--surface)",
  fontSize:"var(--t-md)",
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
  borderRadius:"var(--r-sm)",
  background: "var(--surface)",
  fontSize:"var(--t-md)",
  color: "var(--ink-2)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontWeight: 500,
  transition: "background 0.15s",
};

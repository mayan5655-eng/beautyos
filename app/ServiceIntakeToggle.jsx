'use client';

// app/ServiceIntakeToggle.jsx
//
// In the services settings, on each service: "טופס חובה לפני הטיפול" (which form) and "בדיקת רגישות ללקוחה חדשה". Both off by
// default; a service with both off stores nothing and books exactly as before (lib/intakeGate.ts).
//
// Shown only once service_prices.intake exists (add_reschedule_intake_2026-11-09.sql, hand-run): `ready` is false before
// that, and then this renders nothing at all, because a setting that cannot be saved is not shown (owner rule 2026-11-09).
import { resolveIntake, intakeToStore, intakeFormChoices, DEFAULT_FORM_TYPE } from '@/lib/intakeGate';
import { tr, trv } from "@/lib/i18n/tr";

const CHOICES = intakeFormChoices();

export default function ServiceIntakeToggle({ ready, value, onChange }) {
  if (!ready) return null;
  const cur = resolveIntake({ intake: value }) || { form: false, formType: DEFAULT_FORM_TYPE, patchTest: false };
  const set = (patch) => onChange(intakeToStore({ ...cur, ...patch }));
  const row = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--ink)' };
  return (
    <div data-testid="service-intake" style={{ marginTop: 7 }}>
      <label style={row}>
        <input type="checkbox" aria-label={tr("טופס חובה לפני הטיפול")} checked={cur.form} onChange={(e) => set({ form: e.target.checked })} style={{ width: 20, height: 20, flexShrink: 0 }} />
        <span>{tr("טופס חובה לפני הטיפול")}</span>
      </label>
      {cur.form && (
        <select value={cur.formType} aria-label={tr("איזה טופס")} onChange={(e) => set({ formType: e.target.value })}
          style={{ width: '100%', maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', padding: '8px 6px', minHeight: 40, fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)', marginBottom: 4 }}>
          {CHOICES.map((c) => <option key={c.key} value={c.key}>{trv(c.title)}</option>)}
        </select>
      )}
      <label style={row}>
        <input type="checkbox" aria-label={tr("בדיקת רגישות ללקוחה חדשה")} checked={cur.patchTest} onChange={(e) => set({ patchTest: e.target.checked })} style={{ width: 20, height: 20, flexShrink: 0 }} />
        <span>{tr("בדיקת רגישות ללקוחה חדשה")}</span>
      </label>
      {(cur.form || cur.patchTest) && (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
          {cur.form ? tr("בהזמנה דרך העמוד שלך הלקוחה מקבלת את הקישור לטופס, וההודעה עם הטופס מחכה לך ברשימת ההודעות לשליחה. ") : ''}
          {tr("ביומן יופיע על התור")} {cur.form ? tr("״חסר טופס״ או ״טופס מולא״") : ''}{cur.form && cur.patchTest ? tr(", ו") : ''}{cur.patchTest ? tr("״בדיקת רגישות נדרשת״ ללקוחה חדשה") : ''}.
        </p>
      )}
    </div>
  );
}

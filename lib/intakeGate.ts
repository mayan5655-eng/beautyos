// lib/intakeGate.ts
//
// The pre-visit intake gate: per service, "טופס חובה לפני הטיפול" (a health / consent form the client signs before she
// arrives) and, optionally, "בדיקת רגישות" (a patch test before a first-time client's first treatment).
//
// Stored on the service row: service_prices.intake (jsonb), from add_reschedule_intake_2026-11-09.sql (hand-run):
//   { form: true, form_type: 'general', patch_test: true }
// OFF BY DEFAULT and changes nothing until she turns it on for a service: a row with no `intake`, a null one, or a missing
// column (the migration has not run) is "no gate". Before the migration the setting is not shown at all (owner rule
// 2026-11-09: nothing that does not work is shown), and every reader here answers "off".
//
// Delivery: there is no automatic WhatsApp for this. When a gated service is booked on her page, the client sees the form
// link on the confirmation screen, and a "send the form" message waits in HER manual send queue (whatsapp_messages,
// status pending_manual, type intake_form, which is never a utility type, so it never sends itself). She sends it from her
// own WhatsApp with one tap. The calendar card shows "חסר טופס" / "טופס מולא" / "בדיקת רגישות נדרשת" only on gated services.
//
// Pure: no database, no clock. test-intake-gate.ts runs it with node alone.

import { FORMS } from './formTemplates.ts';

export const INTAKE_COLUMN = 'intake';
export const DEFAULT_FORM_TYPE = 'general';
/** The message type of the "send the form" line in her manual queue. Not in lib/whatsapp.js UTILITY_TYPES, on purpose. */
export const INTAKE_MESSAGE_TYPE = 'intake_form';

export type Intake = { form: boolean; formType: string; patchTest: boolean };

const asObj = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { return asObj(JSON.parse(v)); } catch { return {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

/** A known template key, else the general health declaration. */
export function cleanFormType(v: unknown): string {
  const k = typeof v === 'string' ? v.trim() : '';
  return k && Object.prototype.hasOwnProperty.call(FORMS, k) ? k : DEFAULT_FORM_TYPE;
}

/** The gate of one service, or null when nothing is on (the default). Only literal `true` turns a part on. */
export function resolveIntake(service: { intake?: unknown } | null | undefined): Intake | null {
  const o = asObj(service?.intake);
  const form = o.form === true;
  const patchTest = o.patch_test === true;
  if (!form && !patchTest) return null;
  return { form, formType: cleanFormType(o.form_type), patchTest };
}

/** What the services editor stores. Both off = null, so a turned-off gate leaves no trace on the row. */
export function intakeToStore(v: { form?: boolean; formType?: string; patchTest?: boolean } | null | undefined): { form: boolean; form_type: string; patch_test: boolean } | null {
  if (!v || (v.form !== true && v.patchTest !== true)) return null;
  return { form: v.form === true, form_type: cleanFormType(v.formType), patch_test: v.patchTest === true };
}

/** Has the migration run? The column is on the rows she already loaded (select '*'). An empty menu cannot tell, so: no. */
export function intakeColumnReady(services: Array<Record<string, unknown>> | null | undefined): boolean {
  return (services || []).some((s) => s && Object.prototype.hasOwnProperty.call(s, INTAKE_COLUMN));
}

/** The template choices for the setting: key and Hebrew title. */
export function intakeFormChoices(): Array<{ key: string; title: string }> {
  return Object.entries(FORMS).map(([key, t]) => ({ key, title: t.title }));
}

export type IntakeBadge = { kind: 'form_missing' | 'form_done' | 'patch_test'; label: string };

/**
 * The badges for one appointment card. Nothing at all for a service without a gate.
 *  - form on: "טופס מולא" when this client has a SIGNED form of that type, else "חסר טופס".
 *  - patch test on: "בדיקת רגישות נדרשת" when this is her first visit (no earlier, non-cancelled appointment).
 */
export function intakeBadges(p: { intake: Intake | null; signedFormTypes: Set<string> | string[]; firstVisit: boolean }): IntakeBadge[] {
  if (!p.intake) return [];
  const signed = p.signedFormTypes instanceof Set ? p.signedFormTypes : new Set(p.signedFormTypes || []);
  const out: IntakeBadge[] = [];
  if (p.intake.form) out.push(signed.has(p.intake.formType) ? { kind: 'form_done', label: 'טופס מולא' } : { kind: 'form_missing', label: 'חסר טופס' });
  if (p.intake.patchTest && p.firstVisit) out.push({ kind: 'patch_test', label: 'בדיקת רגישות נדרשת' });
  return out;
}

/** The client's form link (app/form/page.jsx reads ?id=). */
export function formLink(origin: string, formId: string): string {
  return `${String(origin || '').replace(/\/+$/, '')}/form?id=${encodeURIComponent(formId)}`;
}

/** First name only, as every client message greets her. */
const firstName = (name: unknown) => String(name ?? '').trim().split(/\s+/)[0] || '';

/**
 * The message that waits in her manual queue. Her voice, to her own client. No "sent automatically" anywhere: she sends it.
 * No em dashes.
 */
export function intakeFormMessage(p: { name?: string | null; businessName?: string | null; service?: string | null; when?: string | null; url: string }): string {
  const hi = firstName(p.name) ? `היי ${firstName(p.name)} 🌸` : 'היי 🌸';
  const svc = String(p.service || '').trim();
  const when = String(p.when || '').trim();
  return [
    hi,
    `לקראת ה${svc || 'טיפול'}${when ? ` ${when}` : ''}, אשמח שתמלאי טופס קצר לפני שמגיעים. זה לוקח כמה דקות, ומאפשר לי להתאים את הטיפול בדיוק אלייך:`,
    p.url,
    `תודה, ${String(p.businessName || '').trim() || 'מחכה לראותך'}`,
  ].join('\n');
}

export { INTAKE_CONFIRM_HE, INTAKE_CONFIRM_BTN_HE, patchTestConfirmHe, intakeFromBusinessHe } from './intakeCopy.ts';

// lib/waCloud/autoTemplates.ts
//
// The two UTILITY templates of the AUTOMATIC messages (lib/waCloud/auto.ts), with quick-reply buttons, and the signed
// payload each button carries. docs/WA_TEMPLATES.md is the copy to paste into WhatsApp Manager; test-wa-auto-reminders.ts
// fails if the two differ by one character.
//
// Kept apart from templates.ts on purpose: those five are sent by sendWhatsApp() with links in the body; these two are
// sent only by the automatic path, and the client answers with a tap instead of opening a link.
//
// Buttons. Meta delivers a quick-reply tap to the webhook as { type: 'button', button: { text, payload } }. The payload is
// set by us at SEND time (one per button, by index), so it can name the appointment. It is HMAC-signed and bound to the
// appointment, the business, the recipient's number and an expiry (see "button payloads" below), and the webhook also
// checks that this appointment's automatic message really went to the number that tapped.
//
// Reschedule: a third "להזיז את התור" button belongs here once the reschedule flow is on main (it is not, 2026-11-09).
// Adding a button changes the template, so it is a new submission to Meta, not an edit.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { signingSecret, type SecretEnv } from '../linkSecret.ts';
import { sanitizeParam, paramCount } from './templates.ts';

export type AutoKind = 'reminder' | 'booking_confirm';
export type ButtonAction = 'confirm' | 'cancel' | 'optout';

export type AutoTemplate = {
  kind: AutoKind;
  name: string;
  language: 'he';
  category: 'UTILITY';
  params: string[];
  body: string;
  footer: string;
  /** Quick-reply buttons, in index order: the label the client sees and what a tap does. */
  buttons: { text: string; action: ButtonAction }[];
  example: string[];
};

export const OPT_OUT_BUTTON = 'לא לשלוח לי הודעות';

export const WA_AUTO_TEMPLATES: Record<AutoKind, AutoTemplate> = {
  reminder: {
    kind: 'reminder',
    name: 'kalmea_auto_reminder',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'service and duration', 'day, date and time'],
    body:
      'שלום {{1}}, תזכורת לתור שלך ב{{2}}.\n' +
      '{{3}}\n' +
      '{{4}}\n\n' +
      'לאישור הגעה או לביטול, אפשר ללחוץ על הכפתורים כאן למטה.\n' +
      'נשמח לראות אותך!',
    footer: 'הודעה אוטומטית דרך קלמיה',
    buttons: [
      { text: 'מאשרת הגעה', action: 'confirm' },
      { text: 'צריכה לבטל', action: 'cancel' },
      { text: OPT_OUT_BUTTON, action: 'optout' },
    ],
    example: ['רונית', 'סטודיו נועה', 'טיפול פנים · שעה', 'יום ג׳ 21.10, 10:00-11:00'],
  },
  booking_confirm: {
    kind: 'booking_confirm',
    name: 'kalmea_auto_booking',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'service and duration', 'day, date and time'],
    body:
      'שלום {{1}}! התור שלך ב{{2}} נקבע.\n' +
      '{{3}}\n' +
      '{{4}}\n\n' +
      'אם משהו משתנה, אפשר ללחוץ על הכפתור כאן למטה.\n' +
      'נשמח לראות אותך!',
    footer: 'הודעה אוטומטית דרך קלמיה',
    buttons: [
      { text: 'צריכה לבטל', action: 'cancel' },
      { text: OPT_OUT_BUTTON, action: 'optout' },
    ],
    example: ['רונית', 'סטודיו נועה', 'טיפול פנים · שעה', 'יום ג׳ 21.10, 10:00-11:00'],
  },
};

// ── button payloads ──────────────────────────────────────────────────────────
// "k2|<c|x|o>|<appointment, 32 hex>|<tenant, 32 hex>|<expiry, base36 seconds>|<signature, 22 base64url>", about 100
// characters. The signature is HMAC-SHA256 (CONFIRM_LINK_SECRET, under its own "wa-auto-v2" label so it is never a
// valid confirm-link token) over the action, the appointment, the tenant, the RECIPIENT'S NUMBER and the expiry. The
// number is not in the payload: the webhook recomputes it from the sender's wa_id (which Meta's own X-Hub-Signature-256
// vouches for), so a payload tapped or replayed from any other phone fails here, before the database is read. Editing
// any field (another appointment, another business, a later expiry, cancel instead of confirm) breaks the signature.
// The expiry is the confirm link's: three days after the visit.
const CODE: Record<ButtonAction, string> = { confirm: 'c', cancel: 'x', optout: 'o' };
const ACTION: Record<string, ButtonAction> = { c: 'confirm', x: 'cancel', o: 'optout' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENV = 'CONFIRM_LINK_SECRET';
const PAYLOAD = /^k2\|([cxo])\|([0-9a-f]{32})\|([0-9a-f]{32})\|([0-9a-z]{1,10})\|([A-Za-z0-9_-]{22})$/;

const hex32 = (uuid: string) => uuid.toLowerCase().replace(/-/g, '');
const uuidOf = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const digitsOf = (phone: unknown) => String(phone ?? '').replace(/\D/g, '');

const mac = (code: string, appt32: string, tenant32: string, recipientDigits: string, exp36: string, env: SecretEnv) =>
  createHmac('sha256', signingSecret(ENV, env)).update(`wa-auto-v2|${code}|${appt32}|${tenant32}|${recipientDigits}|${exp36}`).digest('base64url').slice(0, 22);

export type PayloadBinding = { appointmentId: string; tenantId: string; recipient: string; expiresAtMs: number };

/** One button's payload, bound to this appointment, business, recipient number and expiry. Throws on a bad binding. */
export function buttonPayload(action: ButtonAction, b: PayloadBinding, env: SecretEnv = process.env): string {
  const code = CODE[action];
  const to = digitsOf(b.recipient);
  if (!code || !UUID.test(String(b.appointmentId)) || !UUID.test(String(b.tenantId)) || to.length < 8 || !Number.isFinite(b.expiresAtMs)) {
    throw new Error('buttonPayload: invalid binding');
  }
  const a = hex32(b.appointmentId);
  const t = hex32(b.tenantId);
  const exp = Math.ceil(b.expiresAtMs / 1000).toString(36);
  return `k2|${code}|${a}|${t}|${exp}|${mac(code, a, t, to, exp, env)}`;
}

export type ParsedPayload = { action: ButtonAction; appointmentId: string; tenantId: string; expiresAtMs: number };

/**
 * The action, appointment and business of a payload we signed FOR THIS SENDER and that has not expired; null for anything
 * else (forged, edited, from another number, expired, an old format, junk). Constant-time compare. Never throws.
 */
export function parseButtonPayload(payload: unknown, sender: unknown, env: SecretEnv = process.env, nowMs: number = Date.now()): ParsedPayload | null {
  try {
    if (typeof payload !== 'string' || payload.length > 200) return null;
    const m = PAYLOAD.exec(payload.trim());
    const from = digitsOf(sender);
    if (!m || from.length < 8) return null;
    const [, code, a, t, exp, sig] = m;
    const want = Buffer.from(mac(code, a, t, from, exp, env));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const expiresAtMs = parseInt(exp, 36) * 1000;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
    return { action: ACTION[code], appointmentId: uuidOf(a), tenantId: uuidOf(t), expiresAtMs };
  } catch {
    return null;
  }
}

export type BuiltAutoTemplate =
  | { ok: true; template: AutoTemplate; preview: string; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** The Graph API `template` object: body parameters plus one signed payload per quick-reply button. */
export function buildAutoTemplate(kind: AutoKind, rawParams: unknown[], binding: PayloadBinding, env: SecretEnv = process.env): BuiltAutoTemplate {
  const template = WA_AUTO_TEMPLATES[kind];
  if (!template) return { ok: false, error: `unknown automatic template ${kind}` };
  if (!UUID.test(String(binding?.appointmentId || ''))) return { ok: false, error: `${template.name}: appointment id is not a uuid` };
  if (!UUID.test(String(binding?.tenantId || ''))) return { ok: false, error: `${template.name}: tenant id is not a uuid` };
  if (digitsOf(binding?.recipient).length < 8) return { ok: false, error: `${template.name}: recipient number is not usable` };
  if (!Number.isFinite(binding?.expiresAtMs)) return { ok: false, error: `${template.name}: no expiry` };
  const need = paramCount(template.body);
  const params = (Array.isArray(rawParams) ? rawParams : []).map(sanitizeParam);
  if (params.length !== need) return { ok: false, error: `${template.name} needs ${need} parameters, got ${params.length}` };
  const empty = params.findIndex((p) => !p);
  if (empty !== -1) return { ok: false, error: `${template.name} parameter {{${empty + 1}}} is empty` };
  const preview = template.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? '')
    + `\n\n[${template.buttons.map((b) => b.text).join('] [')}]`;
  return {
    ok: true,
    template,
    preview,
    payload: {
      name: template.name,
      language: { code: template.language },
      components: [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
        ...template.buttons.map((b, i) => ({
          type: 'button', sub_type: 'quick_reply', index: String(i),
          parameters: [{ type: 'payload', payload: buttonPayload(b.action, binding, env) }],
        })),
      ],
    },
  };
}

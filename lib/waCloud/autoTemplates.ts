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
// set by us at SEND time (one per button, by index), so it can name the appointment. It is signed with the same secret as
// the confirm links (CONFIRM_LINK_SECRET), so a payload cannot be typed or edited into another appointment's, and the
// webhook also checks that the tap came from the very number this appointment's message was sent to.
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
const CODE: Record<ButtonAction, string> = { confirm: 'c', cancel: 'x', optout: 'o' };
const ACTION: Record<string, ButtonAction> = { c: 'confirm', x: 'cancel', o: 'optout' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENV = 'CONFIRM_LINK_SECRET';

const mac = (code: string, appointmentId: string, env: SecretEnv) =>
  createHmac('sha256', signingSecret(ENV, env)).update(`wa-auto|${code}|${appointmentId.toLowerCase()}`).digest('hex').slice(0, 20);

/** "ka1|<c|x|o>|<appointment id>|<signature>" - about 65 characters, under Meta's payload limit. */
export function buttonPayload(action: ButtonAction, appointmentId: string, env: SecretEnv = process.env): string {
  const code = CODE[action];
  return `ka1|${code}|${appointmentId.toLowerCase()}|${mac(code, appointmentId, env)}`;
}

/** The action and appointment of a payload we signed, or null for anything else (never throws). */
export function parseButtonPayload(payload: unknown, env: SecretEnv = process.env): { action: ButtonAction; appointmentId: string } | null {
  try {
    const m = /^ka1\|([cxo])\|([0-9a-fA-F-]{36})\|([0-9a-f]{20})$/.exec(String(payload ?? '').trim());
    if (!m || !UUID.test(m[2])) return null;
    const want = Buffer.from(mac(m[1], m[2], env));
    const got = Buffer.from(m[3]);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return { action: ACTION[m[1]], appointmentId: m[2].toLowerCase() };
  } catch {
    return null;
  }
}

export type BuiltAutoTemplate =
  | { ok: true; template: AutoTemplate; preview: string; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** The Graph API `template` object: body parameters plus one signed payload per quick-reply button. */
export function buildAutoTemplate(kind: AutoKind, rawParams: unknown[], appointmentId: string, env: SecretEnv = process.env): BuiltAutoTemplate {
  const template = WA_AUTO_TEMPLATES[kind];
  if (!template) return { ok: false, error: `unknown automatic template ${kind}` };
  if (!UUID.test(String(appointmentId || ''))) return { ok: false, error: `${template.name}: appointment id is not a uuid` };
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
          parameters: [{ type: 'payload', payload: buttonPayload(b.action, appointmentId, env) }],
        })),
      ],
    },
  };
}

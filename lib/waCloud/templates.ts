// lib/waCloud/templates.ts
//
// The Hebrew UTILITY message templates Kalmea submits to Meta for the central business number. One source of truth:
// docs/WA_TEMPLATES.md is the human copy for submitting them in WhatsApp Manager, and test-wa-cloud.ts checks the two
// agree, so the text Meta approves is the text this code fills in.
//
// Meta's rules this file obeys (a template that breaks one is rejected at review, or a send fails at runtime):
//   * names are lowercase a-z, 0-9 and underscores;
//   * the body may not START or END with a variable, and variables are numbered {{1}}..{{n}} in order;
//   * a parameter value may not contain a newline or a tab, or more than four spaces in a row (sanitizeParam);
//   * UTILITY means about a transaction the client already started - nothing promotional, no offers, no "come back".
//
// Copy rules (the kalmea skill): warm, in the business's voice, feminine forms, and "אישור תשלום" - never "קבלה" for
// what the system issues by default. The receipt template takes the document's own title as a parameter, so a real
// legal document is named as one and a payment confirmation is never dressed up as a receipt.

export type WaTemplateKey = 'reminder' | 'booking_confirm' | 'receipt' | 'deposit_request' | 'cancellation_fee';

export type WaTemplate = {
  key: WaTemplateKey;
  /** The name it is submitted under in WhatsApp Manager. */
  name: string;
  language: 'he';
  category: 'UTILITY';
  /** What each {{n}} is, in order - for the docs and for callers. */
  params: string[];
  body: string;
  /** Sent at any hour. Only a booking confirmation: she just booked and is waiting for it. */
  quietHoursExempt: boolean;
  /** Sample values Meta asks for at submission time. */
  example: string[];
};

export const WA_TEMPLATES: Record<WaTemplateKey, WaTemplate> = {
  reminder: {
    key: 'reminder',
    name: 'kalmea_appointment_reminder',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'service', 'date and time', 'confirm link', 'change link'],
    body:
      'שלום {{1}}, תזכורת לתור שלך ב{{2}} מחר.\n' +
      '{{3}}, {{4}}\n\n' +
      'לאישור: {{5}}\n' +
      'אם לא מתאים, אפשר לשנות כאן: {{6}}\n\n' +
      'מחכות לראות אותך!',
    quietHoursExempt: false,
    example: ['רונית', 'סטודיו נועה', 'טיפול פנים', 'יום ג׳ 21.10 בשעה 10:00', 'https://kalmea.app/c/abc', 'https://kalmea.app/x/abc'],
  },
  booking_confirm: {
    key: 'booking_confirm',
    name: 'kalmea_booking_confirmation',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'service', 'date and time', 'cancel link'],
    body:
      'שלום {{1}}! התור שלך ב{{2}} נקבע.\n' +
      '{{3}}, {{4}}\n\n' +
      'אם משהו משתנה, אפשר לבטל בלחיצה אחת: {{5}}\n\n' +
      'מתרגשות לראות אותך!',
    quietHoursExempt: true,
    example: ['רונית', 'סטודיו נועה', 'טיפול פנים', 'יום ג׳ 21.10 בשעה 10:00', 'https://kalmea.app/x/abc'],
  },
  receipt: {
    key: 'receipt',
    name: 'kalmea_payment_document',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'document title (e.g. "אישור תשלום" or the legal document name and number)', 'business name', 'amount', 'document link'],
    body:
      'שלום {{1}}, {{2}} מ{{3}} על סך ₪{{4}} נמצא כאן:\n' +
      '{{5}}\n\n' +
      'תודה, ונתראה בקרוב.',
    quietHoursExempt: false,
    example: ['רונית', 'אישור תשלום', 'סטודיו נועה', '250', 'https://kalmea.app/r/abc'],
  },
  deposit_request: {
    key: 'deposit_request',
    name: 'kalmea_deposit_request',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'date and time', 'deposit amount', 'payment link', 'hold minutes'],
    body:
      'שלום {{1}}, כדי לשמור את התור שלך ב{{2}} ב-{{3}} נדרשת מקדמה של ₪{{4}}.\n\n' +
      'לתשלום מאובטח: {{5}}\n\n' +
      'התור שמור עבורך {{6}} דקות, ואחרי התשלום יגיע אישור.',
    quietHoursExempt: false,
    example: ['רונית', 'סטודיו נועה', 'יום ג׳ 21.10 בשעה 10:00', '100', 'https://pay.grow.link/abc', '30'],
  },
  cancellation_fee: {
    key: 'cancellation_fee',
    name: 'kalmea_cancellation_fee',
    language: 'he',
    category: 'UTILITY',
    params: ['client name', 'business name', 'appointment date and time', 'fee amount', 'payment link'],
    body:
      'שלום {{1}}, בהתאם למדיניות הביטולים של {{2}} שאישרת בעת קביעת התור, על ביטול התור מ-{{3}} חלים דמי ביטול של ₪{{4}}.\n\n' +
      'לתשלום: {{5}}\n\n' +
      'לכל שאלה אפשר לפנות ישירות לעסק.',
    quietHoursExempt: false,
    example: ['רונית', 'סטודיו נועה', 'יום ג׳ 21.10 בשעה 10:00', '80', 'https://pay.grow.link/abc'],
  },
};

/** The template for a sendWhatsApp() message type, or null when that type has no Cloud template (it stays on GreenAPI). */
export function templateForType(type: unknown): WaTemplate | null {
  const k = String(type || '') as WaTemplateKey;
  return Object.prototype.hasOwnProperty.call(WA_TEMPLATES, k) ? WA_TEMPLATES[k] : null;
}

/** The highest {{n}} in a body. Every template here uses each variable once, in order (the test holds that). */
export function paramCount(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** One value Meta will accept: no newline, no tab, no run of more than four spaces, trimmed, bounded. */
export function sanitizeParam(v: unknown): string {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 500);
}

export type BuiltTemplate =
  | { ok: true; template: WaTemplate; params: string[]; preview: string; payload: Record<string, unknown> }
  | { ok: false; error: string };

/** The Graph API `template` object for a send, plus the text the client will read (for the message log). */
export function buildTemplate(key: WaTemplateKey, rawParams: unknown[]): BuiltTemplate {
  const template = WA_TEMPLATES[key];
  if (!template) return { ok: false, error: `unknown template ${key}` };
  const need = paramCount(template.body);
  const params = (Array.isArray(rawParams) ? rawParams : []).map(sanitizeParam);
  if (params.length !== need) return { ok: false, error: `${template.name} needs ${need} parameters, got ${params.length}` };
  const empty = params.findIndex((p) => !p);
  if (empty !== -1) return { ok: false, error: `${template.name} parameter {{${empty + 1}}} is empty` };
  const preview = template.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? '');
  return {
    ok: true,
    template,
    params,
    preview,
    payload: {
      name: template.name,
      language: { code: template.language },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    },
  };
}

// lib/grow/payload.ts
//
// Pure helpers for the Grow integration: what we send, what we accept back. No network, no database.
//
// Grow's rules, from developers.grow.business: requests are multipart/form-data from the server only, no
// "special characters" in any parameter, a full name needs two names, the phone must be an Israeli mobile, the
// success URL must be https. Its server-to-server callback is a form POST (not JSON) with the transaction
// details, and it carries no signature - so authenticity is established by OUR per-payment secret in the
// callback URL plus a check that the process id and the amount match what we created.

export const MAX_CHARGE_AMOUNT = 20000;

const TEXT_SAFE = /[^\p{L}\p{N} ]+/gu;

/** Letters, digits and single spaces only: Grow refuses special characters in any parameter. */
export function growText(v: unknown, max = 100): string {
  return String(v ?? '').replace(TEXT_SAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Grow wants at least two names. A single name is padded with a neutral second one rather than refused. */
export function growFullName(v: unknown): string {
  const t = growText(v, 60);
  if (!t) return 'לקוחה קלמיה';
  return t.split(' ').length >= 2 ? t : `${t} לקוחה`;
}

/** Israeli mobile as Grow expects it: 05XXXXXXXX. Returns null when it is not one. */
export function growPhone(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D+/g, '');
  const local = d.startsWith('972') ? '0' + d.slice(3) : d;
  return /^05\d{8}$/.test(local) ? local : null;
}

/** A charge amount in shekels: positive, at most two decimals, bounded. */
export function parseChargeAmount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_CHARGE_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

export type ProcessInput = {
  userId: string;
  pageCode: string;
  sum: number;
  description: string;
  fullName: string;
  phone: string;
  email?: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  invoiceNotifyUrl?: string;
  /** Our own payment id, echoed back by Grow in customFields.cField1. */
  paymentRef: string;
  /** Our tenant id (tenantRefOf), echoed back in customFields.cField2: the notification says whose payment it is. */
  tenantRef?: string;
};

/** A tenant id as it travels in cField2: lower-case letters and digits only (Grow refuses special characters). */
export function tenantRefOf(tenantId: unknown): string {
  return String(tenantId ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/** The multipart fields of createPaymentProcess, in Grow's own parameter names. */
export function buildProcessFields(i: ProcessInput): [string, string][] {
  const f: [string, string][] = [
    ['userId', i.userId],
    ['pageCode', i.pageCode],
    ['sum', i.sum.toFixed(2)],
    ['description', growText(i.description, 100) || 'טיפול'],
    ['pageField[fullName]', growFullName(i.fullName)],
    ['pageField[phone]', i.phone],
    ['successUrl', i.successUrl],
    ['cancelUrl', i.cancelUrl],
    ['notifyUrl', i.notifyUrl],
    ['cField1', growText(String(i.paymentRef).replace(/-/g, ''), 60)],
  ];
  if (i.tenantRef) f.push(['cField2', tenantRefOf(i.tenantRef)]);
  if (i.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) f.push(['pageField[email]', i.email]);
  if (i.invoiceNotifyUrl) f.push(['invoiceNotifyUrl', i.invoiceNotifyUrl]);
  return f;
}

export type ProcessResult = { ok: true; processId: string; url: string } | { ok: false; reason: string };

/** Reads createPaymentProcess's answer: { status: 1, err: '', data: { processId, processToken, url } }. */
export function parseProcessResponse(body: unknown): ProcessResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const status = String(b.status ?? '');
  const data = (b.data && typeof b.data === 'object' ? b.data : {}) as Record<string, unknown>;
  const url = typeof data.url === 'string' ? data.url : '';
  const processId = data.processId != null ? String(data.processId) : '';
  if (status !== '1' || !url || !processId) {
    const err = typeof b.err === 'string' ? b.err : (b.err && typeof (b.err as { message?: unknown }).message === 'string' ? String((b.err as { message: string }).message) : '');
    return { ok: false, reason: err || 'no-url' };
  }
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: 'insecure-url' };
  return { ok: true, processId, url };
}

export type Notification = {
  processId: string;
  transactionId: string;
  transactionToken: string;
  sum: number;
  statusCode: string;
  paid: boolean;
  asmachta: string;
  fullName: string;
  payerPhone: string;
  payerEmail: string;
  paymentRef: string;
  /** customFields.cField2: the tenant id we sent with the charge ('' on payments created before it existed). */
  tenantRef: string;
  /** Everything approveTransaction asks to be echoed back, as received. */
  echo: Record<string, string>;
};

const ECHO_KEYS = [
  'transactionId', 'transactionToken', 'transactionTypeId', 'paymentType', 'sum', 'firstPaymentSum', 'periodicalPaymentSum',
  'paymentsNum', 'allPaymentsNum', 'paymentDate', 'asmachta', 'description', 'fullName', 'payerPhone', 'payerEmail',
  'cardSuffix', 'cardType', 'cardTypeCode', 'cardBrand', 'cardBrandCode', 'cardExp', 'processId', 'processToken',
] as const;

/** Grow posts form fields; nested ones arrive as data[sum] (PHP style) or a real nested object. Both are read. */
export function readNotification(raw: Record<string, unknown>): Notification | null {
  const flat: Record<string, string> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && typeof v !== 'object') flat[k] = String(v); };
  for (const [k, v] of Object.entries(raw)) {
    const m = k.match(/^data\[(.+?)\](?:\[(.+?)\])?$/);
    if (m) put(m[2] ? `${m[1]}.${m[2]}` : m[1], v);
    else if (k === 'data' && v && typeof v === 'object') {
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        if (vv && typeof vv === 'object') for (const [k3, v3] of Object.entries(vv as Record<string, unknown>)) put(`${kk}.${k3}`, v3);
        else put(kk, vv);
      }
    } else put(k, v);
  }
  const processId = flat.processId || '';
  const transactionId = flat.transactionId || '';
  if (!processId || !transactionId) return null;
  const sum = Number(String(flat.sum ?? '').replace(/,/g, ''));
  const statusCode = flat.statusCode || '';
  const echo: Record<string, string> = {};
  for (const k of ECHO_KEYS) if (flat[k] !== undefined) echo[k] = flat[k];
  return {
    processId,
    transactionId,
    transactionToken: flat.transactionToken || '',
    sum: Number.isFinite(sum) ? sum : NaN,
    statusCode,
    // statusCode "2" is "paid" in Grow's sample; anything else is not treated as money received.
    paid: statusCode === '2',
    asmachta: flat.asmachta || '',
    fullName: flat.fullName || '',
    payerPhone: flat.payerPhone || '',
    payerEmail: flat.payerEmail || '',
    paymentRef: flat['customFields.cField1'] || flat.cField1 || '',
    tenantRef: tenantRefOf(flat['customFields.cField2'] || flat.cField2 || ''),
    echo,
  };
}

/** The callback is trusted only when it is about the process we created, for the amount we created. */
export function notificationMatches(n: Notification, expected: { processId: string; amount: number }): boolean {
  return n.processId === String(expected.processId) && Number.isFinite(n.sum) && Math.abs(n.sum - expected.amount) < 0.005;
}

/** The invoice/receipt link in an invoice callback, wherever Grow put it. First https URL wins. */
export function findInvoiceUrl(raw: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string | null => {
    if (depth > 4 || v === null || v === undefined || seen.has(v)) return null;
    if (typeof v === 'string') return /^https:\/\/[^\s"']+$/i.test(v.trim()) ? v.trim() : null;
    if (typeof v === 'object') {
      seen.add(v);
      for (const x of Object.values(v as Record<string, unknown>)) { const r = walk(x, depth + 1); if (r) return r; }
    }
    return null;
  };
  return walk(raw, 0);
}

/**
 * A custom field (cField1, cField2) wherever an invoice notification carries it: top level, nested under customFields, or
 * PHP-style data[customFields][cField2]. Returns '' when absent.
 */
export function findCustomField(raw: unknown, name: string): string {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string => {
    if (depth > 4 || !v || typeof v !== 'object' || seen.has(v)) return '';
    seen.add(v);
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x !== null && x !== undefined && typeof x !== 'object' && (k === name || k.endsWith('[' + name + ']'))) return String(x);
    }
    for (const x of Object.values(v as Record<string, unknown>)) { const r = walk(x, depth + 1); if (r) return r; }
    return '';
  };
  return walk(raw, 0);
}

/** 'a1b2…' for the settings card: enough to recognise, not enough to use. */
export function maskUserId(id: string): string {
  const s = String(id || '');
  return s.length <= 4 ? '••••' : `${s.slice(0, 2)}••••${s.slice(-2)}`;
}

export const USER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

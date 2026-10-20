// lib/grow/tokenFlow.ts
//
// Pure helpers for Grow's TOKEN (saved card) flows, from developers.grow.business ("Work with Token"). No network, no database.
//
// The three modes:
//   save_only        createPaymentProcess chargeType=3 (create token), saveCardToken=1, sum=1. The client types the card on Grow's hosted
//                    credit-card page; nothing is charged; the token arrives in the server-to-server callback (data.cardToken).
//   charge_and_save  createPaymentProcess chargeType=1 (regular), saveCardToken=1, the real sum. Charges now AND saves the token.
//   charge_token     createTransactionWithToken: charge an already saved token later, from our server, with no client present.
//
// Rules that live here:
//   - authentication is userId + pageCode + apiKey, and apiKey travels as a BODY field (a header is refused with error 701).
//   - transactionUniqueIdentifier is numeric, generated on our server, and never reused: Grow rejects a repeated one outright, even after a
//     failed charge (error 1010). newUniqueIdentifier() is only a generator; the ledger (tokenCharge.ts) saves it BEFORE the call.
//   - getTokenTransactionsByExternalIdentifiers takes exactly ONE identifier; sending both is an error.
//   - the first transaction of a token sends a callback and needs approveTransaction; later token charges do neither: their result is the
//     API response.
import { growText, tenantRefOf } from './payload.ts';
import type { GrowEnv } from './config.ts';

export type TokenMode = 'save_only' | 'charge_and_save' | 'charge_token';

/** Grow's duplicate-identifier error on createTransactionWithToken. */
export const GROW_ERR_DUPLICATE = 1010;
/** Final card errors from Grow's token page: stop charging this token, ask for a new card. */
export const GROW_FINAL_CARD_ERRORS = new Set([103, 451, 452, 453]);

/** The wording of the required tick on the booking page. The exact text is stored with the consent. */
export const CARD_CONSENT_TEXT_HE =
  'אני מאשרת לשמור את פרטי כרטיס האשראי שלי באופן מאובטח אצל חברת הסליקה Grow, כדי שהעסק יוכל לחייב אותו בעתיד לפי מדיניות הביטולים שלמעלה. הפרטים נשמרים רק לצורך זה.';
export const CARD_CONSENT_VERSION = 'card-save-v1';

// ── credentials ──────────────────────────────────────────────────────────────

export type TokenCreds = {
  apiKey: string;
  pageCode: string;
  apiBase: string;
  /** Sandbox only: the one test business. In production each cosmetician's own Grow userId is used. */
  userIdOverride?: string;
  env: 'sandbox' | 'production';
};

export const SANDBOX_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';

/**
 * Where the token flows get their credentials. Sandbox: the TEST triple Grow issued (GROW_TOKEN_*_TEST). Production: GROW_TOKEN_API_KEY and
 * GROW_TOKEN_PAGE_CODE with GROW_API_BASE, and every call carries the cosmetician's own userId. Null when anything is missing, so the caller
 * can say "not configured" instead of calling Grow with half a key.
 */
export function tokenCredentials(env: GrowEnv = process.env): TokenCreds | null {
  const production = (env.GROW_ENV || '').trim().toLowerCase() === 'production';
  const t = (k: string) => (env[k] || '').trim();
  if (production) {
    const apiBase = t('GROW_API_BASE').replace(/\/+$/, '');
    if (!t('GROW_TOKEN_API_KEY') || !t('GROW_TOKEN_PAGE_CODE') || !/^https:\/\//i.test(apiBase)) return null;
    return { apiKey: t('GROW_TOKEN_API_KEY'), pageCode: t('GROW_TOKEN_PAGE_CODE'), apiBase, env: 'production' };
  }
  if (!t('GROW_TOKEN_API_KEY_TEST') || !t('GROW_TOKEN_PAGE_CODE_TEST') || !t('GROW_TOKEN_USER_ID_TEST')) return null;
  return { apiKey: t('GROW_TOKEN_API_KEY_TEST'), pageCode: t('GROW_TOKEN_PAGE_CODE_TEST'), apiBase: t('GROW_API_BASE').replace(/\/+$/, '') || SANDBOX_BASE, userIdOverride: t('GROW_TOKEN_USER_ID_TEST'), env: 'sandbox' };
}

// ── identifiers ──────────────────────────────────────────────────────────────

/**
 * Grow accepts a transactionUniqueIdentifier that is a positive whole number with no leading zeros and below 4,294,967,295 (a 32-bit
 * value; error 1013 otherwise). A random value in [100,000,000 .. 4,294,967,000): uniqueness is enforced by the ledger's UNIQUE index
 * on unique_identifier (across all tenants, because in the sandbox every tenant shares one Grow business), not by luck: a collision makes
 * the insert fail and the caller draws another BEFORE anything is sent to Grow.
 */
export function newUniqueIdentifier(rand: () => number = Math.random): number {
  const LOW = 100000000;
  const HIGH = 4294967000;
  return LOW + Math.floor(rand() * (HIGH - LOW));
}

/** A numeric transactionGroupIdentifier from a text id (an appointment uuid): stable for the same input, a positive 31-bit whole number. */
export function groupIdentifierOf(text: string): number {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 2147483000;
  return h + 1;
}

// ── requests ─────────────────────────────────────────────────────────────────

export type SessionFields = {
  mode: 'save_only' | 'charge_and_save';
  userId: string;
  amount?: number;
  description: string;
  fullName: string;
  phone: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Echoed back in the callback as customFields.cField1 / cField2: our appointment id and tenant. */
  appointmentRef: string;
  tenantId: string;
};

/** createPaymentProcess for the token page (credit card only: the page code belongs to Grow's credit-card token page, no wallets). */
export function buildSessionFields(c: TokenCreds, i: SessionFields): [string, string][] {
  const save = i.mode === 'save_only';
  return [
    ['apiKey', c.apiKey],
    ['userId', i.userId],
    ['pageCode', c.pageCode],
    ['chargeType', save ? '3' : '1'],
    ['sum', save ? '1' : (i.amount ?? 0).toFixed(2)],
    ['saveCardToken', '1'],
    ['description', growText(i.description, 100) || 'שמירת כרטיס'],
    ['pageField[fullName]', i.fullName],
    ['pageField[phone]', i.phone],
    ['successUrl', i.successUrl],
    ['cancelUrl', i.cancelUrl],
    ['notifyUrl', i.notifyUrl],
    ['cField1', growText(String(i.appointmentRef).replace(/-/g, ''), 60)],
    ['cField2', tenantRefOf(i.tenantId)],
  ];
}

export type TokenChargeFields = {
  userId: string;
  cardToken: string;
  amount: number;
  description: string;
  fullName: string;
  phone: string;
  uniqueIdentifier: number;
  groupIdentifier?: number;
};

/** createTransactionWithToken. paymentType 2 = regular single payment. */
export function buildTokenChargeFields(c: TokenCreds, i: TokenChargeFields): [string, string][] {
  const f: [string, string][] = [
    ['apiKey', c.apiKey],
    ['userId', i.userId],
    ['cardToken', i.cardToken],
    ['sum', i.amount.toFixed(2)],
    ['description', growText(i.description, 100) || 'חיוב'],
    ['paymentType', '2'],
    ['paymentNum', '1'],
    ['pageField[fullName]', i.fullName],
    ['pageField[phone]', i.phone],
    ['transactionUniqueIdentifier', String(i.uniqueIdentifier)],
  ];
  if (i.groupIdentifier !== undefined) f.push(['transactionGroupIdentifier', String(i.groupIdentifier)]);
  return f;
}

/** getTokenTransactionsByExternalIdentifiers with exactly ONE identifier (the unique one): both together is an error. */
export function buildLookupFields(c: TokenCreds, i: { userId: string; cardToken: string; uniqueIdentifier: number }): [string, string][] {
  return [['apiKey', c.apiKey], ['userId', i.userId], ['cardToken', i.cardToken], ['transactionUniqueIdentifier', String(i.uniqueIdentifier)]];
}

// ── responses ────────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export type GrowEnvelope = { ok: boolean; errId: number | null; errMessage: string; data: Record<string, unknown> };

/** { status: 1|0, err: '' | { id, message }, data: {...} | '' } */
export function readEnvelope(body: unknown): GrowEnvelope {
  const b = obj(body);
  const err = obj(b.err);
  const idRaw = err.id ?? (typeof b.err === 'number' ? b.err : undefined);
  const id = idRaw !== undefined && idRaw !== null && Number.isFinite(Number(idRaw)) ? Number(idRaw) : null;
  return {
    ok: String(b.status ?? '') === '1',
    errId: id,
    errMessage: String(err.message ?? (typeof b.err === 'string' ? b.err : '')).slice(0, 160),
    data: obj(b.data),
  };
}

export type CardTokenNotification = {
  processId: string;
  cardToken: string;
  last4: string;
  brand: string;
  exp: string;
  transactionId: string;
  transactionToken: string;
  asmachta: string;
  /** customFields.cField1 / cField2, as we sent them. */
  appointmentRef: string;
  tenantRef: string;
  /** Everything approveTransaction asks to be echoed back. */
  echo: Record<string, string>;
};

const ECHO = ['transactionId', 'transactionToken', 'transactionTypeId', 'paymentType', 'sum', 'firstPaymentSum', 'periodicalPaymentSum', 'paymentsNum', 'allPaymentsNum', 'paymentDate', 'asmachta', 'description', 'fullName', 'payerPhone', 'payerEmail', 'cardSuffix', 'cardType', 'cardTypeCode', 'cardBrand', 'cardBrandCode', 'cardExp', 'processId', 'processToken'] as const;

/** Flattens Grow's form/JSON callback (data[x], data[customFields][cField1], or nested objects) and reads the token fields. Null when no cardToken. */
export function readCardTokenNotification(raw: Record<string, unknown>): CardTokenNotification | null {
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
  const cardToken = (flat.cardToken || '').trim();
  const processId = flat.processId || '';
  if (!cardToken || !processId) return null;
  const echo: Record<string, string> = {};
  for (const k of ECHO) if (flat[k] !== undefined) echo[k] = flat[k];
  return {
    processId, cardToken,
    last4: (flat.cardSuffix || '').replace(/\D/g, '').slice(-4),
    brand: (flat.cardBrand || '').slice(0, 20),
    exp: (flat.cardExp || '').slice(0, 8),
    transactionId: flat.transactionId || '',
    transactionToken: flat.transactionToken || '',
    asmachta: flat.asmachta || '',
    appointmentRef: flat['customFields.cField1'] || flat.cField1 || '',
    tenantRef: tenantRefOf(flat['customFields.cField2'] || flat.cField2 || ''),
    echo,
  };
}

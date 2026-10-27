// lib/grow/wallet.ts
//
// The wallet checkout: ONE payment page for card, Bit, Apple Pay and Google Pay (Grow's "Growin Wallet SDK",
// developers.grow.business > Growin Wallet SDK). Unlike an ordinary payment page, a wallet pageCode makes createPaymentProcess answer
// with an `authCode` (valid 4 minutes) instead of a redirect URL, and the form is drawn by Grow's script inside OUR page /pay/<token>.
//
//   cashier / payment request   createCharge({ wallet: true }) writes the grow_payments row (status 'created', random notify_token) and
//                               hands back  <app>/pay/<notify_token>  -  the link she opens, shows as a QR, or sends from her own
//                               WhatsApp. NOTHING is asked from Grow yet.
//   the client opens the link   the page calls startWalletSession(token): only now is createPaymentProcess called (immediately before the
//                               wallet is drawn, as Grow requires), for HER Grow userId, and the process id is saved on the row.
//   paid                        Grow's server callback (/api/grow/notify?t=<token>) and invoice callback (invoiceNotifyUrl) arrive exactly
//                               as for any other payment: same checks, same receipt, then approveTransaction.
//
// The link is as safe as the notify token (48 random hex characters), is good for LINK_LIFETIME_HOURS, and stops working once paid.
// Sandbox: Bit, Apple Pay and Google Pay have NO test environment at Grow (real money even on the test account); only cards test.

import { buildProcessFields, parseProcessResponse, growPhone, tenantRefOf } from './payload.ts';
import type { GrowPayment } from './service.ts';

export const LINK_LIFETIME_HOURS = 24;
export const WALLET_METHODS_HE = 'כרטיס אשראי, ביט, Apple Pay ו-Google Pay';

export type WalletCreds = {
  apiKey: string;
  pageCode: string;
  apiBase: string;
  /** Sandbox: every call is for the one Grow test business, whichever cosmetician asks. */
  userIdOverride?: string;
  env: 'sandbox' | 'production';
  /** The SDK's `environment` option. */
  sdkEnv: 'DEV' | 'PRODUCTION';
};

type Env = Record<string, string | undefined>;
const SANDBOX_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';
const PRODUCTION_BASE = 'https://secure.meshulam.co.il/api/light/server/1.0';

/**
 * The wallet credentials of this deployment, or null.
 *   sandbox     GROW_WALLET_PAGE_CODE_TEST with the same test userId / apiKey as the token flow (GROW_TOKEN_USER_ID_TEST / GROW_TOKEN_API_KEY_TEST)
 *   production  GROW_WALLET_PAGE_CODE with the platform GROW_API_KEY (and GROW_API_BASE when Grow gave a different base)
 */
export function walletCredentials(env: Env = process.env): WalletCreds | null {
  const t = (k: string) => String(env[k] || '').trim();
  const production = t('GROW_ENV').toLowerCase() === 'production';
  const override = t('GROW_API_BASE').replace(/\/+$/, '');
  if (production) {
    const apiKey = t('GROW_API_KEY'); const pageCode = t('GROW_WALLET_PAGE_CODE');
    if (!apiKey || !pageCode) return null;
    return { apiKey, pageCode, apiBase: override || PRODUCTION_BASE, env: 'production', sdkEnv: 'PRODUCTION' };
  }
  const apiKey = t('GROW_TOKEN_API_KEY_TEST'); const pageCode = t('GROW_WALLET_PAGE_CODE_TEST'); const userId = t('GROW_TOKEN_USER_ID_TEST');
  if (!apiKey || !pageCode || !userId) return null;
  return { apiKey, pageCode, apiBase: override || SANDBOX_BASE, userIdOverride: userId, env: 'sandbox', sdkEnv: 'DEV' };
}

/** The credentials createCharge needs when only the wallet is configured (no separate payment-page code). */
export const walletAsCreds = (w: WalletCreds | null | undefined) => (w ? { apiKey: w.apiKey, pageCode: w.pageCode, apiBase: w.apiBase } : null);

/**
 * Whether this payment was opened on the wallet page. A booking deposit opened by lib/grow/cancelFees.ts (an appointment id and a
 * "מקדמה ל..." description) is the one payment that never uses the wallet: it opens Grow's credit-card page, which can also keep the card.
 * Every other payment uses the wallet whenever the wallet is configured (the charge, booking-pay and payment-request routes).
 */
export function opensOnWallet(p: Pick<GrowPayment, 'appointment_id' | 'description'>, walletConfigured: boolean): boolean {
  if (!walletConfigured) return false;
  return !(p.appointment_id && /^מקדמה ל/.test(p.description || ''));
}

/**
 * The credentials approveTransaction must use: those of the page the client paid on. Grow sends the same callback to the payment's own
 * notifyUrl AND to the account webhook, and whichever lands first approves, so this is decided by the payment, never by the route.
 * A wallet payment approved with the card or token page code is refused by Grow (its review, 2026-10-27).
 */
export function approveCredsFor<C extends { apiKey: string; pageCode: string; apiBase: string }>(
  p: Pick<GrowPayment, 'appointment_id' | 'description'>,
  grow: { creds: C | null; wallet?: WalletCreds | null },
): C | { apiKey: string; pageCode: string; apiBase: string } | null {
  return opensOnWallet(p, !!grow.wallet) ? walletAsCreds(grow.wallet) : grow.creds;
}

/** The payment link the client opens. */
export function walletLink(appUrl: string, notifyToken: string): string {
  return `${appUrl.replace(/\/+$/, '')}/pay/${notifyToken}`;
}

export type WalletSession =
  | { ok: true; authCode: string; processId: string; processToken: string; sdkEnv: 'DEV' | 'PRODUCTION'; amount: number; description: string; clientName: string }
  | { ok: false; code: 'unknown' | 'closed' | 'paid' | 'expired' | 'not-connected' | 'grow-refused' | 'grow-unreachable'; message: string };

export type WalletDeps = {
  repo: {
    findByToken(token: string): Promise<GrowPayment | null>;
    updatePayment(id: string, patch: Record<string, unknown>): Promise<void>;
  };
  creds: WalletCreds;
  /** The cosmetician's Grow userId when her account is connected AND enabled, else null. */
  userIdFor(tenantId: string): Promise<string | null>;
  fetchImpl?: typeof fetch;
  appUrl: string;
  now?: () => Date;
};

/** The state of a payment link for the page that shows it (no Grow call). */
export async function walletLinkState(token: string, d: Pick<WalletDeps, 'repo' | 'now'>): Promise<{ state: 'unknown' | 'open' | 'paid' | 'closed' | 'expired'; payment: GrowPayment | null }> {
  if (!/^[0-9a-f]{32,128}$/.test(token)) return { state: 'unknown', payment: null };
  const p = await d.repo.findByToken(token);
  if (!p) return { state: 'unknown', payment: null };
  if (p.status === 'paid') return { state: 'paid', payment: p };
  if (p.status !== 'created') return { state: 'closed', payment: p };
  const created = p.created_at ? Date.parse(p.created_at) : NaN;
  const now = (d.now || (() => new Date()))().getTime();
  if (Number.isFinite(created) && now - created > LINK_LIFETIME_HOURS * 3600_000) return { state: 'expired', payment: p };
  return { state: 'open', payment: p };
}

/** createPaymentProcess with the wallet page code, immediately before the wallet is drawn. */
export async function startWalletSession(token: string, d: WalletDeps): Promise<WalletSession> {
  const { state, payment: p } = await walletLinkState(token, d);
  if (state === 'unknown' || !p) return { ok: false, code: 'unknown', message: 'הקישור הזה לא תקין' };
  if (state === 'paid') return { ok: false, code: 'paid', message: 'התשלום הזה כבר התקבל. תודה!' };
  if (state === 'closed') return { ok: false, code: 'closed', message: 'הקישור הזה כבר לא פעיל' };
  if (state === 'expired') return { ok: false, code: 'expired', message: 'תוקף הקישור הסתיים. אפשר לבקש קישור חדש.' };

  const uid = d.creds.userIdOverride || (await d.userIdFor(p.tenant_id));
  if (!uid) return { ok: false, code: 'not-connected', message: 'התשלום הזה עוד לא זמין. אפשר לפנות לעסק.' };
  const phone = growPhone(p.payer_phone);
  if (!phone) return { ok: false, code: 'grow-refused', message: 'לא הצלחנו לפתוח את התשלום. אפשר לפנות לעסק.' };

  const base = d.appUrl.replace(/\/+$/, '');
  const back = walletLink(base, p.notify_token);
  const fields = buildProcessFields({
    userId: uid,
    pageCode: d.creds.pageCode,
    sum: Number(p.amount),
    description: p.description || 'טיפול',
    fullName: p.client_name || '',
    phone,
    successUrl: `${back}?paid=1`,
    cancelUrl: back,
    notifyUrl: `${base}/api/grow/notify?t=${p.notify_token}`,
    invoiceNotifyUrl: `${base}/api/grow/invoice?t=${p.notify_token}`,
    paymentRef: p.id,
    tenantRef: tenantRefOf(p.tenant_id),
  });
  const form = new FormData();
  form.append('apiKey', d.creds.apiKey); // a body field: Grow refuses a header (error 701)
  for (const [k, v] of fields) form.append(k, v);

  let json: unknown = null;
  try {
    const res = await (d.fetchImpl || fetch)(`${d.creds.apiBase}/createPaymentProcess`, { method: 'POST', body: form });
    json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' };
  } catch {
    return { ok: false, code: 'grow-unreachable', message: 'לא הצלחנו להגיע ל-Grow. לא חויבת, אפשר לנסות שוב.' };
  }
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
  const authCode = typeof data.authCode === 'string' ? data.authCode : '';
  const processId = data.processId != null ? String(data.processId) : '';
  const processToken = data.processToken != null ? String(data.processToken) : '';
  if (String(o.status) !== '1' || !authCode || !processId) {
    // A page code that is not a wallet code answers with a url instead: say so in the log, not to the client.
    const why = parseProcessResponse(json);
    console.error('[grow] wallet session refused:', why.ok ? 'answer had a url but no authCode (not a wallet page code)' : why.reason);
    return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' };
  }
  // Each time the page opens, a new process: the callback is matched to the LAST one (service.notificationMatches).
  await d.repo.updatePayment(p.id, { process_id: processId });
  return { ok: true, authCode, processId, processToken, sdkEnv: d.creds.sdkEnv, amount: Number(p.amount), description: p.description || '', clientName: p.client_name || '' };
}

export const METHOD_BY_TYPE_ID: Record<string, string> = { '1': 'אשראי', '6': 'ביט', '13': 'Apple Pay', '14': 'Google Pay' };

/** The words on her receipt for how the client paid. Card when Grow did not say. */
export function paymentMethodLabel(transactionTypeId: unknown): string {
  return METHOD_BY_TYPE_ID[String(transactionTypeId ?? '').trim()] || 'אשראי';
}

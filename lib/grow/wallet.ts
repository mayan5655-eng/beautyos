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

import { buildProcessFields, parseProcessResponse, growPhone, tenantRefOf, withGrowResult } from './payload.ts';
import type { GrowPayment } from './service.ts';
import { growCredentials } from './config.ts';
import { sessionReportOf } from './walletDiagServer.ts';
import type { SessionReport } from './walletDiagServer.ts';
import { safeHostedUrl } from './walletDiag.js';

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
  if (override && !/^https:\/\//i.test(override)) return null; // the same rule as config.ts and tokenFlow.ts: never an insecure base
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
 * Whether booking deposits (lib/grow/cancelFees.ts) open on the wallet too. Grow live issued a wallet page code and a token page code; the
 * card REDIRECT page code (GROW_PAGE_CODE, createPaymentProcess answering with a URL) may never come. So: with the wallet configured and no
 * GROW_PAGE_CODE, a deposit is a Kalmea /pay/<token> link like every other client payment (card, Bit, Apple Pay, Google Pay). With
 * GROW_PAGE_CODE set, deposits keep Grow's card page, which can also keep the card (charge and save). Read from the environment, so the
 * create side and the approve side always agree; change GROW_PAGE_CODE only when no deposit is waiting (a hold lasts 30 minutes).
 */
export function depositsOnWallet(env: Env = process.env): boolean {
  if (String(env.GROW_MODE || '').trim().toLowerCase() !== 'live') return false;
  // growCredentials: GROW_PAGE_CODE with the platform key it belongs to; a page code without its key could not open a page anyway.
  return !!walletCredentials(env) && !growCredentials(env);
}

/** A booking deposit opened by lib/grow/cancelFees.ts: an appointment id and a "מקדמה ל..." description. */
export const isBookingDeposit = (p: Pick<GrowPayment, 'appointment_id' | 'description'>) => !!p.appointment_id && /^מקדמה ל/.test(p.description || '');

/**
 * Whether this payment was opened on the wallet page. Every other payment uses the wallet whenever the wallet is configured (the charge,
 * booking-pay, payment-request and voucher routes). A booking deposit uses it only when depositWallet (depositsOnWallet: no card page
 * code); otherwise it opens Grow's credit-card page, which can also keep the card.
 */
export function opensOnWallet(p: Pick<GrowPayment, 'appointment_id' | 'description'>, walletConfigured: boolean, depositWallet = false): boolean {
  if (!walletConfigured) return false;
  return !isBookingDeposit(p) || depositWallet;
}

/**
 * The credentials approveTransaction must use: those of the page the client paid on. Grow sends the same callback to the payment's own
 * notifyUrl AND to the account webhook, and whichever lands first approves, so this is decided by the payment, never by the route.
 * A wallet payment approved with the card or token page code is refused by Grow (its review, 2026-10-27).
 */
export function approveCredsFor<C extends { apiKey: string; pageCode: string; apiBase: string }>(
  p: Pick<GrowPayment, 'appointment_id' | 'description'>,
  grow: { creds: C | null; wallet?: WalletCreds | null; depositWallet?: boolean },
): C | { apiKey: string; pageCode: string; apiBase: string } | null {
  return opensOnWallet(p, !!grow.wallet, !!grow.depositWallet) ? walletAsCreds(grow.wallet) : grow.creds;
}

/** The payment link the client opens. */
export function walletLink(appUrl: string, notifyToken: string): string {
  return `${appUrl.replace(/\/+$/, '')}/pay/${notifyToken}`;
}

export type WalletSession =
  | {
      ok: true; authCode: string; processId: string; processToken: string; sdkEnv: 'DEV' | 'PRODUCTION'; amount: number; description: string; clientName: string;
      /** Grow's own hosted page for the SAME process, when its answer carried one (data.url, Grow hosts only), else ''. The page sends a
       *  client there when the wallet script cannot open (in-app browsers): same process, so the callback and approve are unchanged. */
      hostedUrl: string;
    }
  | { ok: false; code: 'unknown' | 'closed' | 'paid' | 'expired' | 'not-connected' | 'grow-refused' | 'grow-unreachable'; message: string };

export type WalletDeps = {
  repo: {
    findByToken(token: string): Promise<GrowPayment | null>;
    updatePayment(id: string, patch: Record<string, unknown>): Promise<void>;
  };
  creds: WalletCreds;
  /** The cosmetician's Grow userId when her account is connected AND enabled, else null. */
  userIdFor(tenantId: string): Promise<string | null>;
  /**
   * A booking deposit only: whether its 30-minute hold is still open (lib/grow/cancelFees.depositHoldOpen). A deposit link is not opened
   * after the hold ran out, even before the release cron closed its payment row, so the client never pays for a slot already released.
   */
  holdOpen?(p: GrowPayment): Promise<boolean>;
  fetchImpl?: typeof fetch;
  appUrl: string;
  now?: () => Date;
  /** What createPaymentProcess answered (flags and Grow's error only), for ops_events. Best effort: never fails the session. */
  report?(r: SessionReport): Promise<void> | void;
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
  if (isBookingDeposit(p) && d.holdOpen && !(await d.holdOpen(p))) return { ok: false, code: 'expired', message: DEPOSIT_HOLD_OVER_HE };

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
  let httpStatus: number | null = null;
  const report = async (reason = '') => { try { await d.report?.(sessionReportOf(json, httpStatus, p, reason)); } catch { /* best effort */ } };
  try {
    const res = await (d.fetchImpl || fetch)(`${d.creds.apiBase}/createPaymentProcess`, { method: 'POST', body: form });
    httpStatus = res.status;
    json = await res.json().catch(() => null);
    if (!res.ok) { await report('http'); return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' }; }
  } catch {
    await report('unreachable');
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
    await report(why.ok ? 'url-no-authcode' : 'grow');
    return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' };
  }
  // Each time the page opens, a new process: the callback is matched to the LAST one (service.notificationMatches).
  await d.repo.updatePayment(p.id, { process_id: processId });
  await report();
  const hostedUrl = safeHostedUrl(data.url);
  return { ok: true, authCode, processId, processToken, sdkEnv: d.creds.sdkEnv, amount: Number(p.amount), description: p.description || '', clientName: p.client_name || '', hostedUrl };
}

export const DEPOSIT_HOLD_OVER_HE = 'הזמן לתשלום המקדמה עבר והתור שוחרר. אפשר לקבוע תור חדש.';

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "יום שלישי 12/11 בשעה 10:30" for an appointment's date (YYYY-MM-DD) and start minute; '' when the date is unreadable. */
export function visitWhenHe(date: unknown, startMinute: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return '';
  const day = `יום ${DAY_NAMES_HE[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  const sm = Number(startMinute);
  if (startMinute == null || !Number.isFinite(sm) || sm < 0 || sm >= 1440) return day;
  return `${day} בשעה ${String(Math.floor(sm / 60)).padStart(2, '0')}:${String(sm % 60).padStart(2, '0')}`;
}

/** What the /pay page says the payment is for, and where it sends the client once paid. */
export type PayContext = { kind: 'deposit' | 'booking' | 'voucher'; service: string; when: string; returnUrl: string; returnLabel: string };

/**
 * The context of a payment for its /pay page (no Grow call): a booking deposit or a visit paid from the booking page shows the service and
 * the date and time, and returns the client to HER booking page with ?grow=paid (its "your booking is saved" confirmation). A gift voucher
 * returns the buyer to the voucher page. Anything else (a cashier charge, a payment request) has no context: the page stays as it was.
 */
export function payContextOf(
  p: Pick<GrowPayment, 'tenant_id' | 'appointment_id' | 'description'>,
  extra: { appUrl: string; appt?: { service?: unknown; date?: unknown; start_minute?: unknown; hour?: unknown } | null; voucherToken?: string | null },
): PayContext | null {
  const base = extra.appUrl.replace(/\/+$/, '');
  if (extra.voucherToken && /^[A-Za-z0-9_-]{6,128}$/.test(extra.voucherToken)) {
    return { kind: 'voucher', service: '', when: '', returnUrl: `${base}/v/${extra.voucherToken}?b=1`, returnLabel: 'לשובר המתנה' };
  }
  if (!p.appointment_id || !extra.appt) return null;
  const a = extra.appt;
  const start = a.start_minute != null && String(a.start_minute) !== '' ? Number(a.start_minute) : a.hour != null && String(a.hour) !== '' ? Number(a.hour) * 60 : null;
  return {
    kind: isBookingDeposit(p) ? 'deposit' : 'booking',
    service: String(a.service || '').slice(0, 80),
    when: visitWhenHe(a.date, start),
    returnUrl: withGrowResult(`${base}/book?t=${p.tenant_id}`, 'paid'),
    returnLabel: 'חזרה לאישור התור',
  };
}

export const METHOD_BY_TYPE_ID: Record<string, string> ={ '1': 'אשראי', '6': 'ביט', '13': 'Apple Pay', '14': 'Google Pay' };

/** The words on her receipt for how the client paid. Card when Grow did not say. */
export function paymentMethodLabel(transactionTypeId: unknown): string {
  return METHOD_BY_TYPE_ID[String(transactionTypeId ?? '').trim()] || 'אשראי';
}

// lib/grow/paymentLink.ts
//
// Grow's payment request ("דרישת תשלום", CreatePaymentLink, developers.grow.business > Payment Link), the call Grow asked Kalmea to use
// for payment requests (onboarding mail, 2026-11-23, with the test userId and a "דרישת תשלום" pageCode).
//
// Off unless GROW_PAYMENT_LINK=1. While off, nothing here runs and /pay/<token> opens the wallet exactly as before (lib/grow/wallet.ts).
// On, the client who opens /pay/<token> is sent to Grow's own payment-request page for THIS payment, created at that moment:
//
//   CreatePaymentLink (server only, multipart, no special characters)  ->  { status: 1, data: { paymentLinkProcessId, paymentLinkProcessToken, url } }
//   the client pays on Grow's page (card, Bit, Apple Pay, Google Pay, PayBox: whatever the page code allows)
//   Grow's server callback to notifyUrl = /api/grow/notify?t=<per-payment secret>, carrying data.paymentLinkProcessId (service.ts matches it)
//   approveTransaction with THIS page code (approveCredsFor), on the regular light/server/1.0 base
//
// The stored process id is `pl<paymentLinkProcessId>`: the prefix keeps it apart from a wallet process id and tells approveCredsFor which
// page code to approve with. Grow asked not to use Get Transaction Info / Get Payment Process Info: nothing here does.
//
// UNVERIFIED against Grow's sandbox (its API host is not reachable from the build container). Open questions for Grow are in
// docs/GROW_SETUP.md ("Payment request"): paymentLinkType for a one-payment link, the production base, whether apiKey is sent.

import { growFullName, growPhone, growText, tenantRefOf } from './payload.ts';
import { walletLinkState, isBookingDeposit, DEPOSIT_HOLD_OVER_HE, walletLink } from './wallet.ts';
import type { GrowPayment } from './service.ts';

type Env = Record<string, string | undefined>;

export const LINK_PREFIX = 'pl';
const SANDBOX_LINK_BASE = 'https://sandboxapi.grow.link/api/light/server/1.1';
const SANDBOX_APPROVE_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';
const PRODUCTION_APPROVE_BASE = 'https://secure.meshulam.co.il/api/light/server/1.0';

export type PaymentLinkCreds = {
  apiKey: string;
  pageCode: string;
  /** Where CreatePaymentLink lives (light/server/1.1). */
  linkBase: string;
  /** Where approveTransaction lives (light/server/1.0): the same name as every other creds object, so approveTransaction takes it as is. */
  apiBase: string;
  /** Sandbox: every link is for the one Grow test business. */
  userIdOverride?: string;
  env: 'sandbox' | 'production';
};

const https = (v: string) => /^https:\/\/[^\s]+$/i.test(v);

export const paymentLinkEnabled = (env: Env = process.env) => String(env.GROW_PAYMENT_LINK || '').trim() === '1';

/**
 * The payment-request credentials of this deployment, or null (then the wallet stays in charge).
 *   sandbox     GROW_PAYMENT_LINK_PAGE_CODE_TEST + GROW_TOKEN_USER_ID_TEST (+ GROW_TOKEN_API_KEY_TEST when Grow gave one)
 *   production  GROW_PAYMENT_LINK_PAGE_CODE + GROW_API_KEY + GROW_PAYMENT_LINK_API_BASE (required: Grow has not published it)
 */
export function paymentLinkCredentials(env: Env = process.env): PaymentLinkCreds | null {
  if (!paymentLinkEnabled(env)) return null;
  const t = (k: string) => String(env[k] || '').trim();
  const production = t('GROW_ENV').toLowerCase() === 'production';
  const linkOverride = t('GROW_PAYMENT_LINK_API_BASE').replace(/\/+$/, '');
  const approveOverride = t('GROW_API_BASE').replace(/\/+$/, '');
  if ((linkOverride && !https(linkOverride)) || (approveOverride && !https(approveOverride))) return null;
  if (production) {
    const apiKey = t('GROW_API_KEY'); const pageCode = t('GROW_PAYMENT_LINK_PAGE_CODE');
    if (!apiKey || !pageCode || !linkOverride) return null;
    return { apiKey, pageCode, linkBase: linkOverride, apiBase: approveOverride || PRODUCTION_APPROVE_BASE, env: 'production' };
  }
  const pageCode = t('GROW_PAYMENT_LINK_PAGE_CODE_TEST'); const userId = t('GROW_TOKEN_USER_ID_TEST');
  if (!pageCode || !userId) return null;
  return { apiKey: t('GROW_TOKEN_API_KEY_TEST'), pageCode, linkBase: linkOverride || SANDBOX_LINK_BASE, apiBase: approveOverride || SANDBOX_APPROVE_BASE, userIdOverride: userId, env: 'sandbox' };
}

/** Whether a payment was opened as a payment request (its stored process id carries the prefix). */
export const isPaymentLinkProcess = (processId: unknown) => new RegExp(`^${LINK_PREFIX}\\d+$`).test(String(processId ?? ''));

/** Grow's vatType for the product line, from HER registration (settings.business_tax_status). Unknown = null: never guessed. */
export function vatTypeOf(taxStatus: unknown): 1 | 3 | null {
  const s = String(taxStatus ?? '').trim().toLowerCase();
  if (s === 'exempt') return 3;
  if (s === 'licensed') return 1;
  return null;
}

export type LinkInput = {
  userId: string;
  pageCode: string;
  apiKey?: string;
  sum: number;
  title: string;
  fullName: string;
  phone: string;
  email?: string;
  vatType: 1 | 3;
  successUrl: string;
  notifyUrl: string;
  invoiceNotifyUrl: string;
  paymentRef: string;
  tenantRef: string;
};

/** The multipart fields of CreatePaymentLink, in Grow's own parameter names: one product, one payment, one use. */
export function buildPaymentLinkFields(i: LinkInput): [string, string][] {
  const title = growText(i.title, 60) || 'תשלום';
  const f: [string, string][] = [
    ['userId', i.userId],
    ['pageCode', i.pageCode],
    // "The link is closed for one payment". TODO(grow): confirm 1 is the one-payment value (the docs' example shows 2).
    ['paymentLinkType', '1'],
    ['isActive', '1'],
    ['chargeType', '1'],
    ['title', title],
    ['customText[pageTitle]', title],
    ['successUrl', i.successUrl],
    ['notifyUrl', i.notifyUrl],
    ['invoiceNotifyUrl', i.invoiceNotifyUrl],
    ['paymentTypes[0][type]', 'payments'],
    ['paymentTypes[0][payments][paymentsPaymentNum]', '1'],
    ['pageFieldSettings[fullName][value]', growFullName(i.fullName)],
    ['pageFieldSettings[phone][value]', i.phone],
    ['products[data][0][name]', title],
    ['products[data][0][price]', i.sum.toFixed(2)],
    ['products[data][0][quantity]', '1'],
    ['products[data][0][minQuantity]', '1'],
    ['products[data][0][vatType]', String(i.vatType)],
    ['cField1', growText(String(i.paymentRef).replace(/-/g, ''), 60)],
    ['cField2', tenantRefOf(i.tenantRef)],
  ];
  if (i.apiKey) f.unshift(['apiKey', i.apiKey]); // a body field, as every other Grow call (a header is refused, error 701)
  if (i.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) f.push(['pageFieldSettings[email][value]', i.email]);
  return f;
}

/** Only Grow's own hosts, https: the address the client is sent to. */
export function safeLinkUrl(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return '';
    return /(^|\.)(meshulam\.co\.il|grow\.link|grow\.business)$/i.test(u.hostname) ? u.toString() : '';
  } catch { return ''; }
}

export type LinkSession =
  | { ok: true; url: string }
  | { ok: false; code: 'unknown' | 'closed' | 'paid' | 'expired' | 'not-connected' | 'not-ready' | 'grow-refused' | 'grow-unreachable'; message: string };

export type LinkDeps = {
  repo: { findByToken(token: string): Promise<GrowPayment | null>; updatePayment(id: string, patch: Record<string, unknown>): Promise<void> };
  creds: PaymentLinkCreds;
  userIdFor(tenantId: string): Promise<string | null>;
  /** settings.business_tax_status of the business. */
  taxStatusFor(tenantId: string): Promise<unknown>;
  holdOpen?(p: GrowPayment): Promise<boolean>;
  fetchImpl?: typeof fetch;
  appUrl: string;
  now?: () => Date;
};

/** CreatePaymentLink for this payment, right when the client opens it. */
export async function startPaymentLink(token: string, d: LinkDeps): Promise<LinkSession> {
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
  // Her VAT registration decides the document Grow issues: never guessed. Unknown = the caller falls back to the wallet.
  const vatType = vatTypeOf(await d.taxStatusFor(p.tenant_id));
  if (!vatType) return { ok: false, code: 'not-ready', message: 'התשלום הזה עוד לא זמין. אפשר לפנות לעסק.' };

  const base = d.appUrl.replace(/\/+$/, '');
  const fields = buildPaymentLinkFields({
    userId: uid, pageCode: d.creds.pageCode, apiKey: d.creds.apiKey, sum: Number(p.amount), title: p.description || 'טיפול',
    fullName: p.client_name || '', phone, vatType,
    successUrl: `${walletLink(base, p.notify_token)}?paid=1`,
    notifyUrl: `${base}/api/grow/notify?t=${p.notify_token}`,
    invoiceNotifyUrl: `${base}/api/grow/invoice?t=${p.notify_token}`,
    paymentRef: p.id, tenantRef: p.tenant_id,
  });
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);
  let json: unknown = null;
  try {
    const res = await (d.fetchImpl || fetch)(`${d.creds.linkBase}/CreatePaymentLink`, { method: 'POST', body: form });
    json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' };
  } catch {
    return { ok: false, code: 'grow-unreachable', message: 'לא הצלחנו להגיע ל-Grow. לא חויבת, אפשר לנסות שוב.' };
  }
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
  const linkId = String(data.paymentLinkProcessId ?? '').trim();
  const url = safeLinkUrl(data.url);
  if (String(o.status) !== '1' || !/^\d+$/.test(linkId) || !url) {
    const err = o.err && typeof o.err === 'object' ? String((o.err as { id?: unknown }).id ?? '') : String(o.err || '');
    console.error('[grow] payment link refused:', err || 'no link in the answer');
    return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה את התשלום. נסי שוב בעוד רגע.' };
  }
  await d.repo.updatePayment(p.id, { process_id: `${LINK_PREFIX}${linkId}` });
  return { ok: true, url };
}

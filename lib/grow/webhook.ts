// lib/grow/webhook.ts
//
// Grow's one webhook URL (/api/grow/webhook). Pure helpers and the onboarding handler, with the database injected so
// everything is tested without a network or a database (test-grow-webhook.ts).
//
// Grow signs nothing, so a request is accepted only from Grow's published addresses
// (https://developers.grow.business/reference/ip-address). Payment notifications keep their own checks on top of that:
// the process id and the amount must match the payment we created (lib/grow/service.ts), and the per-payment secret
// when the URL carries one.
//
// Three kinds of update arrive here:
//   payment     a transaction notification (processId + transactionId)         -> applyNotification
//   invoice     an invoice / receipt notification (a document link)           -> applyInvoice
//   onboarding  a merchant-onboarding update { err, data: { user_id, tracking_code, ... }, status }
//               -> stored in grow_onboarding_updates; attached to a tenant ONLY when its tracking code equals a
//                  pending onboarding we recorded for that tenant. Nothing is ever matched by guesswork.
//
// The merchant's api_key and phone are never stored or logged; user_id is stored server-side only and is masked
// (lib/grow/payload.maskUserId) wherever a person sees it.

import { findInvoiceUrl, readNotification, USER_ID_RE } from './payload.ts';
import { GROW_IPS } from './growIps.ts';
import { registrationStatusOf } from './registration.ts';
import type { RegistrationStatus } from './registration.ts';

export { GROW_IPS };

type Env = Record<string, string | undefined>;

export function normalizeIp(v: string): string {
  return String(v || '').trim().replace(/^::ffff:/i, '');
}

/** The caller's address as Vercel reports it (it overwrites x-forwarded-for, so the first entry is the real client). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get('x-real-ip');
  if (real) return normalizeIp(real);
  const xff = headers.get('x-forwarded-for');
  return xff ? normalizeIp(xff.split(',')[0]) : '';
}

export function allowedIps(env: Env = process.env): Set<string> {
  const custom = (env.GROW_WEBHOOK_IPS || '').split(/[,\s]+/).map(normalizeIp).filter(Boolean);
  return new Set(custom.length ? custom : [...GROW_IPS]);
}

/**
 * Enforced everywhere, including production. It can be relaxed only for testing: GROW_WEBHOOK_IP_CHECK=off AND
 * GROW_ENV is explicitly a test environment (sandbox, test or development). An unset GROW_ENV counts as production, so a
 * forgotten variable can never switch the check off on a live deployment.
 */
export function ipCheckEnforced(env: Env = process.env): boolean {
  const off = (env.GROW_WEBHOOK_IP_CHECK || '').trim().toLowerCase() === 'off';
  const testEnv = ['sandbox', 'test', 'development'].includes((env.GROW_ENV || '').trim().toLowerCase());
  return !(off && testEnv);
}

export function ipAllowed(ip: string, env: Env = process.env): boolean {
  return !!ip && allowedIps(env).has(normalizeIp(ip));
}

// ── payload shapes ───────────────────────────────────────────────────────

export type WebhookKind = 'payment' | 'invoice' | 'onboarding' | 'unknown';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function onboardingData(raw: Record<string, unknown>): Record<string, unknown> | null {
  const d = raw.data;
  if (!isObj(d)) return null;
  const has = (k: string) => d[k] !== undefined && d[k] !== null && d[k] !== '';
  // user_id alone could be anything; require one more field that only an onboarding update carries. A registration that was
  // REJECTED (or is still in review) carries no user_id yet, only our tracking code and Grow's status: that is an update too.
  if (has('user_id') && (has('tracking_code') || has('tracking_status') || has('package_id') || has('api_key') || has('business_title'))) return d;
  if (has('tracking_code') && (has('tracking_status') || raw.status !== undefined)) return d;
  return null;
}

export function classifyWebhook(raw: unknown): WebhookKind {
  if (!isObj(raw)) return 'unknown';
  if (readNotification(raw)) return 'payment';
  if (onboardingData(raw)) return 'onboarding';
  if (findInvoiceUrl(raw)) return 'invoice';
  return 'unknown';
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export type OnboardingUpdate = {
  userId: string | null;
  trackingCode: string;
  businessTitle: string;
  name: string;
  packageId: string;
  packageName: string;
  trackingStatusId: string;
  trackingStatusMessage: string;
  status: string;
  err: string;
  /** Only whether an api_key came with it. The key itself is dropped here and never reaches storage or logs. */
  hadApiKey: boolean;
};

/** The sanitised, bounded fields of an onboarding update. api_key and phone are deliberately not carried. */
export function readOnboarding(raw: unknown): OnboardingUpdate | null {
  if (!isObj(raw)) return null;
  const d = onboardingData(raw);
  if (!d) return null;
  const ts = isObj(d.tracking_status) ? d.tracking_status : {};
  const uid = clip(d.user_id, 80);
  const err = isObj(raw.err) ? clip((raw.err as Record<string, unknown>).message, 200) : clip(raw.err, 200);
  return {
    userId: USER_ID_RE.test(uid) ? uid : null,
    trackingCode: clip(d.tracking_code, 100),
    businessTitle: clip(d.business_title, 120),
    name: clip(d.name, 120),
    packageId: clip(d.package_id, 40),
    packageName: clip(d.package_name, 80),
    trackingStatusId: clip(ts.id, 40),
    trackingStatusMessage: clip(ts.message, 200),
    status: clip(raw.status, 20),
    err,
    hadApiKey: typeof d.api_key === 'string' && d.api_key.length > 0,
  };
}

// ── onboarding handler ──────────────────────────────────────────────────────

export type MatchState = 'unmatched' | 'matched' | 'conflict';

export type OnboardingRepo = {
  /** Writes the update row and returns its id. Throws when the table is not there or the write fails. */
  insertUpdate(row: Record<string, unknown>): Promise<string>;
  /** A pending Grow onboarding that one of our tenants started, by the tracking code Grow gave it. */
  findPendingByTrackingCode(code: string): Promise<{ tenant_id: string } | null>;
  getAccount(tenantId: string): Promise<{ user_id: string; enabled: boolean } | null>;
  /** Saves her Grow userId on the tenant. Never enables charging. */
  saveAccount(tenantId: string, userId: string, enabled: boolean): Promise<void>;
  setMatch(updateId: string, state: MatchState, tenantId: string | null): Promise<void>;
  clearPending(tenantId: string): Promise<void>;
  /** The registration's status as she sees it on her card (waiting / approved / rejected, with Grow's words). Optional. */
  setPendingStatus?(tenantId: string, status: RegistrationStatus, message: string): Promise<void>;
};

export type OnboardingResult = { status: 'matched' | 'unmatched' | 'conflict'; updateId: string; registration?: RegistrationStatus };

export async function applyOnboarding(u: OnboardingUpdate, repo: OnboardingRepo, now: () => Date = () => new Date()): Promise<OnboardingResult> {
  const updateId = await repo.insertUpdate({
    received_at: now().toISOString(),
    user_id: u.userId,
    tracking_code: u.trackingCode || null,
    business_title: u.businessTitle || null,
    name: u.name || null,
    package_id: u.packageId || null,
    package_name: u.packageName || null,
    tracking_status_id: u.trackingStatusId || null,
    tracking_status_message: u.trackingStatusMessage || null,
    grow_status: u.status || null,
    grow_error: u.err || null,
    had_api_key: u.hadApiKey,
    match_state: 'unmatched',
  });
  // No correlation field means no match: we never pick a tenant by name, phone or timing.
  if (!u.trackingCode) return { status: 'unmatched', updateId };
  const pending = await repo.findPendingByTrackingCode(u.trackingCode);
  if (!pending) return { status: 'unmatched', updateId };
  const tenantId = pending.tenant_id;
  const registration = registrationStatusOf(u);
  const why = u.trackingStatusMessage || u.err || '';

  // Rejected, or still in review: her card says so. Nothing is connected or switched on.
  if (registration !== 'approved' || !u.userId) {
    if (repo.setPendingStatus) await repo.setPendingStatus(tenantId, registration, why);
    await repo.setMatch(updateId, 'matched', tenantId);
    return { status: 'matched', updateId, registration };
  }

  const existing = await repo.getAccount(tenantId);
  if (existing && existing.user_id !== u.userId) {
    // She already connected a different Grow business: a person decides which one is right.
    await repo.setMatch(updateId, 'conflict', tenantId);
    return { status: 'conflict', updateId };
  }
  // Approved through HER registration link (only our tracking code proves that): store her userId and switch clearing ON,
  // for her business only. She opted in by starting the registration, and can switch it off on the same card.
  await repo.saveAccount(tenantId, u.userId, true);
  if (repo.setPendingStatus) await repo.setPendingStatus(tenantId, 'approved', why);
  await repo.setMatch(updateId, 'matched', tenantId);
  await repo.clearPending(tenantId);
  return { status: 'matched', updateId, registration: 'approved' };
}

/** Reads a webhook body whatever it was sent as: JSON, or a form. Bounded, never throws. */
export function parseWebhookBody(text: string, contentType: string): Record<string, unknown> | null {
  const t = String(text || '');
  if (!t.trim() || t.length > 64 * 1024) return null;
  try {
    const j = JSON.parse(t);
    return isObj(j) ? j : null;
  } catch { /* not JSON */ }
  if (/application\/x-www-form-urlencoded/i.test(contentType) || /^[^{\[][^\n]*=/.test(t)) {
    const out: Record<string, unknown> = {};
    new URLSearchParams(t).forEach((v, k) => { out[k] = v; });
    return Object.keys(out).length ? out : null;
  }
  return null;
}

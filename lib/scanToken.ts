// lib/scanToken.ts
//
// SERVER ONLY. Never import this into a client component - it reads a secret.
//
// Signs the public skin-scanner link so that the tenant it names cannot be
// forged.
//
// ── What this fixes, and what it does NOT ──────────────────────────────────
// /api/skin-scan is a PUBLIC route with no session, and it took tenantId
// straight from the request body. Anyone could therefore attribute the cost of
// the app's single most expensive call to any business they cared to name -
// which is why skin-scan usage records `attribution: 'claimed'`.
//
// A signature fixes exactly that: naming a tenant whose link you never had.
//
// It does NOT stop abuse by someone who HAS a link, because the link is public
// by design - it lives in an Instagram bio, on printed cards, in a QR code.
// Anyone who can see it can use it. The defence against that is the monthly
// ceiling in lib/skinScanQuota.ts, not this file. Do not let a valid signature
// convince you the route is protected from volume; it is protected from
// misattribution.
//
// ── No expiry, deliberately ────────────────────────────────────────────────
// This is the one real departure from lib/confirmToken.ts, which signs a
// short-lived action link. A scanner link is a DURABLE PUBLIC ARTEFACT: it is
// printed, screenshotted and pasted into a bio, and it has to keep working for
// as long as those exist. A token that expired would break her funnel silently
// - the QR code on the counter would simply stop producing leads, with no error
// she would ever see. Rotation, if it is ever needed, is by changing the
// secret, which invalidates every link at once and is a deliberate act.

import { createHmac, timingSafeEqual } from 'crypto';

// The signing key: SCAN_LINK_SECRET if set, else CONFIRM_LINK_SECRET (the
// historical choice, namespaced by PURPOSE below), else the service-role key
// with the loud warning lib/linkSecret.ts prints. Verification tries every
// key in that chain, so setting a dedicated variable later does not turn the
// QR code on her counter into a dead link - the durable-artefact rule at the
// top of this file is exactly why.
import { signingSecret, legacySecrets } from './linkSecret.ts';

function secret(): string {
  const dedicated = String(process.env.SCAN_LINK_SECRET || '').trim();
  if (dedicated) return dedicated;
  return signingSecret('CONFIRM_LINK_SECRET');
}

function allSecrets(): string[] {
  const out: string[] = [];
  for (const s of [String(process.env.SCAN_LINK_SECRET || '').trim(), ...legacySecrets('CONFIRM_LINK_SECRET')]) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Namespaced so a scanner signature can never be replayed as a confirm-link
// signature, or vice versa, even though they share a secret.
const PURPOSE = 'skin-scan';

/** Signature binding one tenant id to the scanner link. URL-safe, 32 chars. */
export function signScanLink(tenantId: string): string {
  return createHmac('sha256', secret())
    .update(`${PURPOSE}:${tenantId}`)
    .digest('base64url')
    .slice(0, 32);
}

/**
 * Constant-time check. Returns false rather than throwing on malformed input,
 * so a garbage query string is an ordinary rejection and not a 500.
 */
export function verifyScanLink(tenantId: string, token: string | null | undefined): boolean {
  if (!tenantId || !token) return false;
  const b = Buffer.from(String(token));
  let keys: string[];
  try {
    keys = allSecrets();
  } catch {
    return false;
  }
  for (const key of keys) {
    const expected = createHmac('sha256', key).update(`${PURPOSE}:${tenantId}`).digest('base64url').slice(0, 32);
    const a = Buffer.from(expected);
    // timingSafeEqual throws on a length mismatch, which would itself leak
    // length. Compare lengths first and return the same false either way.
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** The full public scanner URL for a tenant, signed. */
export function buildScanUrl(baseUrl: string, tenantId: string): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/skin-scan?t=${encodeURIComponent(tenantId)}&s=${signScanLink(tenantId)}`;
}

// lib/clientPage.ts
//
// The client's personal results page (kalmea.app/c/<token>): what the link is, who may be shown on it, and what it says.
// Pure and dependency-light on purpose: the token is signing, the consent filter is a privacy rule, and both are tested
// (test-client-page.ts). The database reads live in lib/clientPageData.ts.
//
// ── The link ───────────────────────────────────────────────────────────────
//   <token_id>.<exp>.<sig>
//     token_id   22 random chars (128 bits) - the handle of one row in client_pages. It says nothing about the business or
//                the client: no tenant id, no client id, nothing to walk.
//     exp.sig    lib/signedToken.ts over `clientpage:<token_id>`: a stranger cannot even make the database look something up,
//                and the link dies on its date.
// REVOCABLE: client_pages.revoked_at. A link is valid only if the signature holds AND the row is there, not revoked and not
// expired - so "cancel the link" works the moment she taps it, whatever copies are in WhatsApp threads.
// The secret is the same family as the confirm/cancel links (CONFIRM_LINK_SECRET, else the service key, loudly), and the
// message is namespaced so a page token can never be replayed as a confirm, review or scanner signature.
//
// ── The photos ─────────────────────────────────────────────────────────────
// A photo is shown on her page only if (1) it is linked to THIS client (treatment_results.client_id) and (2) the consent
// record is complete - the same rule as the database check on treatment_results (lib/results.consentComplete, plus the
// server-stamped confirmation time). "Published on the public page" is a separate switch and is NOT required: this is the
// client looking at her own results, which she (or the owner for her) agreed to in writing in the consent record.

import { randomBytes } from 'crypto';
import { signingSecret } from './linkSecret.ts';
import { signWithExpiry, verifyWithExpiry } from './signedToken.ts';
import { consentComplete } from './results.js';

const ENV = 'CONFIRM_LINK_SECRET';
const TOKEN_ID = /^[A-Za-z0-9_-]{22}$/;
export const CLIENT_PAGE_TTL_MS = 180 * 86_400_000;
/** A link with less than this left is replaced when she next sends the page, so a client never opens a dying one. */
export const CLIENT_PAGE_RENEW_MS = 30 * 86_400_000;

const message = (tokenId: string) => `clientpage:${tokenId}`;

export function newTokenId(): string {
  return randomBytes(16).toString('base64url');
}

/** Whole seconds, because that is what the signature carries. */
export function pageExpiry(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + CLIENT_PAGE_TTL_MS) / 1000) * 1000;
}

export function buildPageToken(tokenId: string, expiresAtMs: number): string {
  return `${tokenId}.${signWithExpiry(signingSecret(ENV), message(tokenId), expiresAtMs)}`;
}

/** { tokenId } when the shape and the signature (and expiry) are right; null otherwise. Never throws. */
export function parsePageToken(token: string | null | undefined, nowMs: number = Date.now()): { tokenId: string } | null {
  const t = String(token || '').trim();
  if (!t || t.length > 120) return null;
  const parts = t.split('.');
  if (parts.length !== 3) return null; // no dot-less "legacy" form exists for this token
  const [tokenId, exp, sig] = parts;
  if (!TOKEN_ID.test(tokenId)) return null;
  try {
    return verifyWithExpiry(`${exp}.${sig}`, message(tokenId), signingSecret(ENV), [], nowMs) ? { tokenId } : null;
  } catch {
    return null;
  }
}

export function clientPageUrl(origin: string, token: string): string {
  return `${String(origin || '').replace(/\/+$/, '')}/c/${token}`;
}

// ── consent ────────────────────────────────────────────────────────────────

export type ResultRow = {
  id?: string | null;
  client_id?: string | null;
  service_name?: string | null;
  before_url?: string | null;
  after_url?: string | null;
  caption?: string | null;
  sessions?: number | null;
  consent_name?: string | null;
  consent_given_on?: string | null;
  consent_confirmed?: boolean | null;
  consent_confirmed_at?: string | null;
};

/** The database's own consent rule (treatment_results_consent_before_publish), applied to a row. */
export function rowConsented(r: ResultRow | null | undefined): boolean {
  if (!r) return false;
  return (
    consentComplete({ consentName: r.consent_name, consentGivenOn: r.consent_given_on, consentConfirmed: r.consent_confirmed === true }) &&
    !!String(r.consent_confirmed_at || '').trim()
  );
}

export type PageResult = { id: string; serviceName: string; before: string; after: string; caption: string; sessions: number | null };

/**
 * The photos for ONE client's page: hers (client_id matches), with a complete consent record, and an after photo.
 * Nothing else gets through - not another client's, not an unlinked one, not one with a half-filled consent record -
 * and no consent field (a name, a date) is carried into the result.
 */
export function consentedResultsFor(clientId: string, rows: ResultRow[] | null | undefined): PageResult[] {
  if (!clientId || !Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && String(r.client_id || '') === String(clientId) && rowConsented(r) && String(r.after_url || '').trim())
    .map((r) => ({
      id: String(r.id || ''),
      serviceName: String(r.service_name || '').trim(),
      before: String(r.before_url || '').trim(),
      after: String(r.after_url || '').trim(),
      caption: String(r.caption || '').trim(),
      sessions: Number.isInteger(r.sessions) && (r.sessions as number) > 0 ? (r.sessions as number) : null,
    }));
}

// ── treatments ─────────────────────────────────────────────────────────────

export type ApptRow = { service?: string | null; date?: string | null; confirmation_status?: string | null; kind?: string | null };
export type PageTreatment = { service: string; count: number; lastDate: string };

/** What she has actually had: past, not cancelled, not a no-show, not the owner's own blocked time. One line per treatment, latest first. */
export function treatmentsFrom(appts: ApptRow[] | null | undefined, todayIso: string, max = 8): PageTreatment[] {
  const by = new Map<string, PageTreatment>();
  for (const a of appts || []) {
    const service = String(a?.service || '').trim();
    const date = String(a?.date || '');
    if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso) continue;
    if (a.kind === 'personal') continue;
    if (a.confirmation_status === 'cancelled' || a.confirmation_status === 'no_show') continue;
    const cur = by.get(service);
    if (cur) { cur.count += 1; if (date > cur.lastDate) cur.lastDate = date; } else by.set(service, { service, count: 1, lastDate: date });
  }
  return [...by.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate)).slice(0, max);
}

export function firstName(name: string | null | undefined): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** The booking page link. The slug when she has one, else the long form her booking page already uses. */
export function bookingPath(slug: string | null | undefined, tenantId: string): string {
  const s = String(slug || '').trim();
  return s ? `/${encodeURIComponent(s)}` : `/book?t=${encodeURIComponent(tenantId)}`;
}

/** The booking link with the client's name and her usual treatment filled in. Never her phone. */
export function bookingHref(path: string, name: string | null | undefined, service: string | null | undefined): string {
  const q = new URLSearchParams();
  const n = String(name || '').trim();
  const s = String(service || '').trim();
  if (n) q.set('name', n);
  if (s) q.set('service', s);
  const qs = q.toString();
  if (!qs) return path;
  return path + (path.includes('?') ? '&' : '?') + qs;
}

/** Aftercare text, trimmed and capped (it renders on a public page). */
export function cleanAftercare(v: unknown): string {
  return String(v ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
}

/** Aftercare as lines for the page: one tip per line, leading bullets dropped. */
export function aftercareLines(text: string): string[] {
  return cleanAftercare(text).split('\n').map((l) => l.replace(/^[\s\-•*·✦]+/, '').trim()).filter(Boolean);
}

/** The state of a page row, for the owner's sheet. */
export function pageStatus(row: { revoked_at?: string | null; expires_at?: string | null } | null | undefined, nowMs: number = Date.now()): 'none' | 'active' | 'revoked' | 'expired' {
  if (!row) return 'none';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return 'expired';
  return 'active';
}

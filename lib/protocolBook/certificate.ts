// lib/protocolBook/certificate.ts — the cosmetician's certificate that opens the facial chapters of the protocol book. PURE.
//
// The facial protocols are professional material (acid peels, electrical devices), so a business in the cosmetics field
// uploads a photo or PDF of her cosmetician certificate and ticks a declaration before they open. A nails-only business is
// not asked: the nail chapters open as before (owner decision, 2026-11-27).
//
// There is no registry to check a certificate against (cosmetics is not a state-licensed profession in Israel), so nothing
// here pretends to verify it. The chapters open on upload ('submitted'); a platform admin looks at it afterwards and can
// approve or reject it (app/dashboard/admin/ProtocolCertificates.tsx). 'rejected' closes the chapters again.
//
// Stored at settings.automations.protocol_certificate, a PROTECTED key (lib/settingsColumns.ts): only
// /api/protocol-book/certificate and the admin route write it, so she cannot mark herself approved through Settings.
// The file is in the private bucket under her own tenant folder. It usually shows an ID number: it is never public, never
// in branding, and only a platform admin opens it, through a short-lived signed link.
import type { FieldKey } from '../businessFields.ts';

export const CERT_KEY = 'protocol_certificate';
export const CERT_BUCKET = 'client-images'; // the private bucket (lib/clientImages.js PRIVATE_BUCKET)
/** Vercel refuses a request body over 4.5MB; the browser shrinks photos first, a PDF must already fit. */
export const CERT_MAX_BYTES = 4 * 1024 * 1024;
export const CERT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export type CertStatus = 'submitted' | 'approved' | 'rejected';
export type Certificate = { path: string; status: CertStatus; uploaded_at: string; declared_at: string; reviewed_at?: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const STATUSES: readonly string[] = ['submitted', 'approved', 'rejected'];

/** Does a business in these fields need a certificate for anything? Only cosmetics does. */
export const needsCertificate = (fields: readonly FieldKey[]): boolean => fields.includes('cosmetics');

export const certPath = (tenantId: string, ext: string, now: number): string => `${tenantId}/certificates/cosmetician-${now}.${ext}`;

/** A stored path is only ever one this module built, inside HER folder. */
export function isCertPath(tenantId: string, path: unknown): path is string {
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) return false;
  return new RegExp(`^${tenantId}/certificates/cosmetician-\\d{10,16}\\.(jpg|png|webp|pdf)$`, 'i').test(path);
}

/** Her certificate as stored, or null when there is none or the record is malformed (malformed never counts as certified). */
export function certificateOf(settings: { automations?: unknown; tenant_id?: unknown } | null | undefined): Certificate | null {
  const c = obj(obj(settings?.automations)[CERT_KEY]);
  if (typeof c.path !== 'string' || !c.path || typeof c.status !== 'string' || !STATUSES.includes(c.status)) return null;
  if (typeof c.uploaded_at !== 'string' || typeof c.declared_at !== 'string' || !c.declared_at) return null;
  return {
    path: c.path, status: c.status as CertStatus, uploaded_at: c.uploaded_at, declared_at: c.declared_at,
    ...(typeof c.reviewed_at === 'string' ? { reviewed_at: c.reviewed_at } : {}),
  };
}

/** The facial chapters are open: a certificate was uploaded with the declaration, and no admin has rejected it. */
export function isCertified(settings: { automations?: unknown } | null | undefined): boolean {
  const c = certificateOf(settings);
  return !!c && c.status !== 'rejected';
}

/** What the upload route stores. */
export const newCertificate = (path: string, nowIso: string): Certificate => ({ path, status: 'submitted', uploaded_at: nowIso, declared_at: nowIso });

/** An admin's verdict on a stored certificate; null when there is nothing to review. */
export function reviewed(c: Certificate | null, status: 'approved' | 'rejected', nowIso: string): Certificate | null {
  return c ? { ...c, status, reviewed_at: nowIso } : null;
}

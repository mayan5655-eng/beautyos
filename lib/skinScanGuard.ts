// lib/skinScanGuard.ts
//
// What a request to the public skin scanner must satisfy BEFORE it can cost money or send a
// message. Pure functions, so every rule is tested with real inputs (test-skin-scan-guard-2).
//
// Found 2026-10-06 (audit): POST /api/skin-scan with NO tenantId skipped the signature check, the
// tenant limit, the monthly quota and the dollar ceiling (callCaps allows a null tenant) and went
// straight to a Claude vision call; the file's own comment claimed the ceiling was enforced
// "regardless of signature". The only brake was a per-IP, per-instance, in-memory limit. And
// /send took the phone AND the message content from the body with no verification at all.

import { normalizeIsraeliMobile } from './phone.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCAN_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** base64 characters. ~4.1 MB of image: Vercel refuses request bodies over 4.5 MB anyway, and a selfie is far smaller. */
export const SCAN_MAX_IMAGE_CHARS = 5_500_000;
export const SCAN_MIN_IMAGE_CHARS = 2_000;

export const INVALID_LINK_HE = 'הקישור לסורק אינו תקין או שפג תוקפו. כדאי לבקש מהקוסמטיקאית קישור מעודכן.';

export type Verdict = { ok: true } | { ok: false; status: number; error: string; reason: string };
const no = (status: number, reason: string, error: string): Verdict => ({ ok: false, status, error, reason });

export const isTenantId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Shape and size of the scan request. Cheap, no I/O, runs before the signature and the database. */
export function checkScanPayload(p: { image?: unknown; mediaType?: unknown; tenantId?: unknown }): Verdict {
  if (!isTenantId(p.tenantId)) return no(400, 'no_tenant', INVALID_LINK_HE);
  if (typeof p.image !== 'string' || !p.image) return no(400, 'no_image', 'חסרה תמונה');
  if (p.image.length < SCAN_MIN_IMAGE_CHARS) return no(400, 'image_too_small', 'התמונה לא תקינה. נסי תמונה אחרת.');
  if (p.image.length > SCAN_MAX_IMAGE_CHARS) return no(413, 'image_too_large', 'התמונה גדולה מדי. נסי תמונה קטנה יותר.');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(p.image.slice(0, 200))) return no(400, 'image_not_base64', 'התמונה לא תקינה. נסי תמונה אחרת.');
  const type = p.mediaType === undefined || p.mediaType === null ? 'image/jpeg' : p.mediaType;
  if (!(SCAN_MEDIA_TYPES as readonly unknown[]).includes(type)) return no(400, 'media_type', 'סוג התמונה לא נתמך. אפשר JPEG, PNG או WebP.');
  return { ok: true };
}

/**
 * Who may scan for this business: someone holding her SIGNED link (a client), or her own signed-in
 * session whose tenant is this one (the scanner inside her app). Naming a tenant is never enough.
 */
export function admitScan(a: { tenantId: unknown; signatureValid: boolean; sessionTenantId?: string | null }): Verdict {
  if (!isTenantId(a.tenantId)) return no(400, 'no_tenant', INVALID_LINK_HE);
  if (a.signatureValid) return { ok: true };
  if (a.sessionTenantId && a.sessionTenantId === a.tenantId) return { ok: true };
  return no(403, 'not_admitted', INVALID_LINK_HE);
}

/** The "send me my report" request: a real tenant, a mobile number, and a report WE signed. */
export function checkSendPayload(
  p: { report?: unknown; clientPhone?: unknown; tenantId?: unknown; reportToken?: unknown },
  verifyReport: (tenantId: string, report: unknown, token: string) => boolean
): Verdict & { phone?: string } {
  if (!isTenantId(p.tenantId)) return no(400, 'no_tenant', 'קישור הסורק אינו תקין (חסר מזהה עסק)');
  if (!p.report || typeof p.report !== 'object' || Array.isArray(p.report)) return no(400, 'no_report', 'חסרים פרטים');
  const phone = normalizeIsraeliMobile(typeof p.clientPhone === 'string' ? p.clientPhone : '');
  if (!phone.ok) return no(400, 'bad_phone', 'מספר הטלפון לא תקין. צריך מספר נייד ישראלי, למשל 0501234567.');
  if (typeof p.reportToken !== 'string' || !verifyReport(p.tenantId, p.report, p.reportToken)) {
    return no(403, 'report_not_signed', 'הדוח לא אומת או שפג תוקפו. אפשר לסרוק שוב ולשלוח.');
  }
  return { ok: true, phone: phone.e164 };
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/**
 * The booking-intent lead the scanner page fires as the visitor moves on to /book. It writes into a
 * business's CRM, so it needs her SIGNED link, a mobile number, and only a small whitelist of the
 * report (bounded strings and one number) - never the caller's whole object. Found 2026-10-06: it was
 * anonymous, unsigned, and its upsert overwrote the name and data of an existing lead for any
 * (tenant, phone) the caller named.
 */
export function checkLeadPayload(
  p: { tenantId?: unknown; phone?: unknown; name?: unknown; report?: unknown; signature?: unknown },
  verifyLink: (tenantId: string, signature: string) => boolean
): Verdict & { lead?: { tenantId: string; phone: string; name: string; report: { matched_service: string; clinical_treatment: string; score: number | null; skin_type: string } } } {
  if (!isTenantId(p.tenantId)) return no(400, 'no_tenant', 'missing tenant or phone');
  if (typeof p.signature !== 'string' || !verifyLink(p.tenantId, p.signature)) return no(403, 'not_signed', INVALID_LINK_HE);
  const phone = normalizeIsraeliMobile(typeof p.phone === 'string' ? p.phone : '');
  if (!phone.ok) return no(400, 'bad_phone', 'missing tenant or phone');
  const r = (p.report && typeof p.report === 'object' ? p.report : {}) as Record<string, unknown>;
  const score = Number(r.score);
  return {
    ok: true,
    lead: {
      tenantId: p.tenantId,
      phone: phone.e164,
      name: clip(p.name, 60),
      report: {
        matched_service: clip(r.matched_service, 80),
        clinical_treatment: clip(r.clinical_treatment, 120),
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
        skin_type: clip(r.skin_type, 40),
      },
    },
  };
}

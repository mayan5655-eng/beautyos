// lib/publicContact.ts
// Where a client can go next from a public page that ended without a visit (a cancelled appointment, a claim that was taken or
// expired, a link that could not change the booking): her booking page, and her WhatsApp. 2026-11-03 UX review.
//
// Only what her own public booking page already shows to anyone: the booking link (tenants.slug, else the /book?t= form her
// page already uses) and the business WhatsApp number (the same one the booking page links to). Nothing about the appointment or
// the client. Callers return it only after their own authorisation check (a signed confirm token, a valid claim token).
import { bookingPath } from './clientPage.ts';

export type PublicContact = { bookUrl: string; whatsapp: string };

// The booking page's own rule (app/BookingPage.jsx normalizeWa): digits, Israeli 0 -> 972.
export function waDigits(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  if (d.length === 9) return '972' + d;
  return d;
}

type Row = { business_phone?: string | null; branding?: unknown } | null | undefined;
type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The same number the booking page links to: branding.whatsapp_number, else business_phone. */
export function publicWhatsapp(settings: Row): string {
  const b = (settings?.branding && typeof settings.branding === 'object' ? settings.branding : {}) as { whatsapp_number?: string };
  return waDigits(b.whatsapp_number || settings?.business_phone || '');
}

/** Best effort: a failed read returns the long booking link and no number, never throws. */
export async function publicContactFor(db: Db, tenantId: string, settings: Row): Promise<PublicContact> {
  let slug = '';
  try {
    const { data } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
    slug = String(data?.slug || '');
  } catch { /* the long link still works */ }
  return { bookUrl: tenantId ? bookingPath(slug, tenantId) : '', whatsapp: publicWhatsapp(settings) };
}

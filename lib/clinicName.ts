// lib/clinicName.ts
// One definition of "what do we call this business in a customer-facing
// message", shared by every message path (lead templates, gap-fill offers, and
// anything added later).
//
// It lives here rather than inside a leads module so that a new message path
// picks up the placeholder blocklist automatically instead of copying it.

// Used when no real clinic name is set.
export const CLINIC_FALLBACK = 'הקליניקה';

// Values that mean the clinic name was never really set: the settings column's
// own DB default, the product name used on test tenants, and the placeholder
// the setup checklist already treats as unset (see the "details" step in
// app/beautyos.jsx). Compared lower-cased and trimmed.
//
// A real customer's typed name must never be listed here - that would erase a
// live clinic's name from every message it sends.
const CLINIC_PLACEHOLDER_NAMES = ['beautyos', 'bloom os', 'העסק שלי'];

// Resolve the clinic name to show, or the neutral fallback.
export function clinicName(settings: any): string {
  const raw = (settings?.business_name || '').trim();
  if (!raw) return CLINIC_FALLBACK;
  if (CLINIC_PLACEHOLDER_NAMES.includes(raw.toLowerCase())) return CLINIC_FALLBACK;
  return raw;
}

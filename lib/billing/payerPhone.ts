// lib/billing/payerPhone.ts
//
// The mobile Grow needs for HER subscription card page and token charges. Grow refuses anything but an Israeli mobile, and onboarding
// lets her leave the phone empty or type a studio landline, so the typed numbers alone left some businesses unable to save a card at
// all, on the blocked screen too (2026-11-02 audit). Order: the alert phone she typed in Settings, the business phone, then the mobile
// she verified by SMS (owner_phones). Only an Israeli mobile counts; null when there is none.
import { normalizeIsraeliMobile } from '../phone.ts';

type Db = { from(t: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function billingPayerPhone(db: Db, tenantId: string, typed: unknown[]): Promise<string | null> {
  for (const t of typed) {
    const p = normalizeIsraeliMobile(String(t ?? ''));
    if (p.ok) return p.e164;
  }
  try {
    const { data, error } = await db.from('owner_phones').select('phone_e164').eq('tenant_id', tenantId).limit(1);
    const row = !error && Array.isArray(data) ? data[0] : null;
    const p = normalizeIsraeliMobile(String(row?.phone_e164 ?? ''));
    if (p.ok) return p.e164;
  } catch { /* table missing or unreadable: no verified mobile */ }
  return null;
}

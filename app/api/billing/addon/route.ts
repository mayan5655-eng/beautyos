// app/api/billing/addon/route.ts
//
// POST { pack } -> she buys one add-on pack (lib/pricing.ts ADDON_PACKS) for this month, charged once to the card saved for her subscription
// (lib/billing/service.ts buyAddon). Off unless add-on packs are switched on (NEXT_PUBLIC_ADDON_PACKS) and billing is on (caller()).
// The units count on the server from her very next AI call (lib/addonQuota.ts), never from anything the browser sends.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { buyAddon } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { ADDON_PACKS, addonPacksEnabled, type AddonPackKey } from '@/lib/pricing';
import { forgetPurchased } from '@/lib/addonQuota';
import { admin, billing, caller } from '../_shared';

const REFUSAL_HE: Record<string, string> = {
  'no-card': 'כדי להוסיף חבילה צריך כרטיס שמור. אפשר להוסיף אותו כאן למעלה, במנוי שלך.',
  declined: 'חברת האשראי לא אישרה את החיוב. כדאי לעדכן כרטיס ולנסות שוב.',
  pending: 'אנחנו מחכות לאישור מחברת האשראי. אם החיוב עבר, החבילה תתווסף ונעדכן אותך.',
  'not-configured': 'התשלום עוד לא זמין. כתבי לנו ונסדר את זה.',
  unavailable: 'החבילות עוד לא זמינות. כתבי לנו ונסדר את זה.',
};

export async function POST(req: Request) {
  if (!addonPacksEnabled()) return NextResponse.json({ success: false, hidden: true, error: 'off' });
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, בחשבון הדגמה לא מחייבים' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const key = String(body?.pack || '') as AddonPackKey;
  const pack = ADDON_PACKS[key];
  if (!pack) return NextResponse.json({ success: false, error: 'חבילה לא מוכרת' }, { status: 400 });
  try {
    const b = billing();
    const r = await buyAddon({ repo: supabaseBillingRepo(admin()), payments: b.payments!, invoicing: b.invoicing! }, c.tenantId, pack);
    if (!r.ok) {
      console.warn('[billing] add-on not bought for tenant', c.tenantId, key, r.reason, r.error);
      return NextResponse.json({ success: false, reason: r.reason, error: REFUSAL_HE[r.reason] || 'החיוב לא הצליח, נסי שוב' }, { status: r.reason === 'pending' ? 202 : 402 });
    }
    forgetPurchased(c.tenantId);
    console.log('[billing] add-on bought', c.tenantId, key, pack.price);
    return NextResponse.json({ success: true, pack: key, units: pack.units });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error('[billing] add-on failed:', msg);
    if (/billing_addons|kind_check|does not exist/i.test(msg)) return NextResponse.json({ success: false, error: 'החבילות צריכות עדכון במסד הנתונים שעוד לא הורץ (add_billing_addons.sql).' }, { status: 503 });
    return NextResponse.json({ success: false, error: 'החיוב לא הצליח, נסי שוב' }, { status: 500 });
  }
}

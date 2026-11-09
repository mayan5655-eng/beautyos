// app/api/billing/addon/route.ts
//
// POST { pack } -> she buys one add-on pack (lib/pricing.ts ADDON_PACKS) for this month, charged once to the card saved for her subscription
// (lib/billing/service.ts buyAddon). Off unless add-on packs are switched on (NEXT_PUBLIC_ADDON_PACKS) and billing is on (caller()).
// The units count on the server from her very next AI call (lib/addonQuota.ts), never from anything the browser sends.
//
// Double taps (2026-11-09, the upgrades store): three layers, so one confirm can never become two charges.
//   1. the browser disables the button while the request is in flight (app/UpgradesStore.jsx);
//   2. `requestId` (one per confirm sheet): a repeat of an id this instance already answered gets the same answer, and one still running
//      is answered "in progress"; a second request for the same pack from the same business while one runs is answered "in progress" too;
//   3. buyAddon refuses a new charge while a charge of the same pack is still open in the ledger (any instance), fail closed.
// Rate-limited (lib/rateLimit.ts 'billing-addon').
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { buyAddon } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { ADDON_PACKS, addonPacksEnabled, type AddonPackKey } from '@/lib/pricing';
import { forgetPurchased } from '@/lib/addonQuota';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { admin, billing, caller, callerIsOwner, NOT_OWNER_HE } from '../_shared';

type Answer = { status: number; body: Record<string, unknown> };
const REPLAY_MS = 10 * 60 * 1000;
/** The replay memory never grows without bound: past this, the oldest answers are dropped (they are only a double-tap guard). */
const REPLAY_MAX = 2000;
const answered = new Map<string, { at: number; a: Answer }>();
const running = new Set<string>();
const reply = (a: Answer) => NextResponse.json(a.body, { status: a.status });
const cleanId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : '');

const REFUSAL_HE: Record<string, string> = {
  'no-card': 'כדי להוסיף חבילה צריך כרטיס שמור. אפשר להוסיף אותו כאן למעלה, במנוי שלך.',
  declined: 'חברת האשראי לא אישרה את החיוב. כדאי לעדכן כרטיס ולנסות שוב.',
  pending: 'אנחנו מחכות לאישור מחברת האשראי. אם החיוב עבר, החבילה תתווסף ונעדכן אותך.',
  'not-configured': 'התשלום עוד לא זמין. כתבי לנו ונסדר את זה.',
  'in-progress': 'החיוב הקודם עוד בטיפול. אין צורך ללחוץ שוב, נעדכן אותך בעוד רגע.',
  unavailable: 'החבילות עוד לא זמינות. כתבי לנו ונסדר את זה.',
};

export async function POST(req: Request) {
  if (!addonPacksEnabled()) return NextResponse.json({ success: false, hidden: true, error: 'off' });
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, בחשבון הדגמה לא מחייבים' }, { status: 403 });
  const ipLimited = checkIpLimit(req, 'billing-addon');
  if (ipLimited) return ipLimited;
  const limited = checkTenantLimit(c.tenantId, 'billing-addon');
  if (limited) return limited;
  // Only the owner charges the business's card; a member of the business never can (fails closed).
  if (!(await callerIsOwner(admin(), c.tenantId, c.userId))) return NextResponse.json({ success: false, reason: 'not-owner', error: NOT_OWNER_HE }, { status: 403 });
  const body = await req.json().catch(() => null);
  const key = String(body?.pack || '') as AddonPackKey;
  const pack = ADDON_PACKS[key];
  if (!pack) return NextResponse.json({ success: false, error: 'חבילה לא מוכרת' }, { status: 400 });

  const now = Date.now();
  for (const [k, v] of answered) if (now - v.at > REPLAY_MS) answered.delete(k);
  const rid = cleanId(body?.requestId);
  // Keyed by business AND user: an id can only ever replay her own answer, never another business's or another member's.
  const ridKey = rid ? `${c.tenantId}|${c.userId}|${rid}` : '';
  const prior = ridKey ? answered.get(ridKey) : undefined;
  if (prior) return reply({ status: prior.a.status, body: { ...prior.a.body, replay: true } });
  const lock = `${c.tenantId}|${key}`;
  if (running.has(lock) || (ridKey && running.has(ridKey))) {
    return NextResponse.json({ success: false, reason: 'in-progress', error: REFUSAL_HE['in-progress'] }, { status: 409 });
  }
  running.add(lock);
  if (ridKey) running.add(ridKey);
  const remember = (a: Answer) => {
    if (ridKey) {
      answered.set(ridKey, { at: Date.now(), a });
      while (answered.size > REPLAY_MAX) { const oldest = answered.keys().next().value; if (oldest === undefined) break; answered.delete(oldest); }
    }
    return reply(a);
  };
  try {
    const b = billing();
    const r = await buyAddon({ repo: supabaseBillingRepo(admin()), payments: b.payments!, invoicing: b.invoicing! }, c.tenantId, pack);
    if (!r.ok) {
      console.warn('[billing] add-on not bought for tenant', c.tenantId, key, r.reason, r.error);
      const status = r.reason === 'pending' ? 202 : r.reason === 'in-progress' ? 409 : 402;
      return remember({ status, body: { success: false, reason: r.reason, error: REFUSAL_HE[r.reason] || 'החיוב לא הצליח, נסי שוב' } });
    }
    forgetPurchased(c.tenantId);
    console.log('[billing] add-on bought', c.tenantId, key, pack.price);
    return remember({ status: 200, body: { success: true, pack: key, units: pack.units } });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error('[billing] add-on failed:', msg);
    // Not remembered: nothing was charged on a throw before the provider call, and a retry with the same id must be allowed.
    if (/billing_addons|kind_check|does not exist/i.test(msg)) return NextResponse.json({ success: false, error: 'החבילות צריכות עדכון במסד הנתונים שעוד לא הורץ (add_billing_addons.sql).' }, { status: 503 });
    return NextResponse.json({ success: false, error: 'החיוב לא הצליח, נסי שוב' }, { status: 500 });
  } finally {
    running.delete(lock);
    if (ridKey) running.delete(ridKey);
  }
}

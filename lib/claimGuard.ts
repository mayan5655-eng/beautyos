// lib/claimGuard.ts
//
// Can a freed slot be offered, and claimed, through the one-tap claim link (app/api/claim), which books CONFIRMED at once?
// Only when the public booking page would book the same service with no conditions. Vercel security review on PR #39: with a
// Grow deposit policy on, someone could book with phone A, let the unpaid deposit hold expire, and claim the freed slot from
// the waiting list with phone B: a confirmed appointment with no deposit and no cancellation-policy consent.
//
// The predicate is the public booking route's own (app/api/book-appointment): her active Grow policy (activePolicy, read only
// while the Grow screens are on and Grow is connected) applies to the service when policyAppliesToService says so. On top of it,
// fail closed: a service she marked "requires deposit" is never claimable in one tap, whatever the policy says, and a policy that
// could not be read counts as applying (app/api/grow/_claimPolicy.ts).
// The safe path for those slots is her booking link, which takes the consent and the deposit and confirms only after payment.

import { policyAppliesToService, type PolicyMode } from './cancellationPolicy.ts';

type ServiceRow = { name?: unknown; active?: unknown; requires_deposit?: unknown } | null | undefined;
type PolicyLike = { mode: PolicyMode } | null | undefined;

/** true = this service may NOT be booked through the claim link: a deposit or her cancellation policy applies to it. */
export function claimNeedsBookingFlow(policy: PolicyLike, service: ServiceRow): boolean {
  if (service?.requires_deposit === true) return true;
  return !!(policy && policyAppliesToService(policy.mode, service));
}

/** Her service row by name: an active row wins over an archived namesake (same rule as the claim's price and buffer). */
export function serviceRowByName<T extends ServiceRow>(menu: T[] | null | undefined, name: unknown): T | null {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) return null;
  const rows = (menu || []).filter((r) => typeof r?.name === 'string' && (r.name as string).trim() === n);
  return rows.find((r) => r?.active !== false) || rows[0] || null;
}

/** What the claim page says instead of booking: calm, with her booking link. */
export const NEEDS_BOOKING_HE = 'כדי לשמור את התור הזה צריך לקבוע אותו דרך דף ההזמנות, שם מאשרים את תנאי ההזמנה (ולפעמים משלמים מקדמה). זה לוקח דקה:';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the supabase client and the test fakes share only this shape
type Db = { from: (t: string) => any };
type PolicyRead = { ok: true; policy: PolicyLike } | { ok: false };

export const TRY_AGAIN_HE = 'לא הצלחנו לבדוק את התור כרגע. נסי שוב בעוד רגע.';

export type OfferRow = { tenant_id: string; service: string | null; status: string; slot_date: string; slot_hour: number | null; slot_start_minute: number | null; expires_at: string };
export type GateResult =
  | { kind: 'proceed'; offer: OfferRow }
  | { kind: 'invalid' }
  | { kind: 'error' }
  | { kind: 'needs_booking'; offer: OfferRow };

/**
 * Everything /api/claim must know BEFORE it may mark an offer claimed or write an appointment, in one place that cannot be skipped
 * (Vercel review, PR #39): the offer is read, and a read that ERRORS is "error" (try again, nothing written), never "no offer" and
 * never "go ahead". Then the deposit / policy guard (claimAllowed) runs on every offer that exists, whatever its status, so no error
 * branch and no stale status can lead past it. Only "proceed" lets the route continue to the claim update.
 */
export async function claimGate({ db, token, policyFor }: { db: Db; token: string; policyFor: (t: string) => Promise<PolicyRead> }): Promise<GateResult> {
  try {
    const { data: offer, error } = await db.from('slot_offers')
      .select('tenant_id, slot_date, slot_hour, slot_start_minute, service, client_name, status, expires_at')
      .eq('token', token).maybeSingle();
    if (error) return { kind: 'error' };
    if (!offer) return { kind: 'invalid' };
    if (!(await claimAllowed({ db, tenantId: offer.tenant_id, service: offer.service, policyFor }))) return { kind: 'needs_booking', offer };
    return { kind: 'proceed', offer };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * The claim link's server-side check, at claim time: false when the service must go through her booking page. Fails closed: a menu
 * or a policy that cannot be read is false. `policyFor` is app/api/grow/_claimPolicy.ts publicBookingPolicy in the route.
 */
export async function claimAllowed({ db, tenantId, service, policyFor }: { db: Db; tenantId: string; service: string | null; policyFor: (t: string) => Promise<PolicyRead> }): Promise<boolean> {
  try {
    const { data: rows, error } = await db.from('service_prices').select('*').eq('tenant_id', tenantId).eq('name', service || '');
    if (error) return false;
    const pol = await policyFor(tenantId);
    if (!pol || pol.ok !== true) return false;
    return !claimNeedsBookingFlow(pol.policy, serviceRowByName(Array.isArray(rows) ? rows : [], service));
  } catch {
    return false;
  }
}

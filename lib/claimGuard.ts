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

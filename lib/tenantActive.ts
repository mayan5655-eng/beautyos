// lib/tenantActive.ts
//
// "Is this tenant's plan on hold?" for the paths that have NO session: the Facebook webhook and the
// API-key lead intake. requireActiveTenant (lib/planGuard.ts) asks the database through the caller's
// session; here there is only a tenant id and a service-role client, so the tenants row is read and run
// through the same planState() rule the UI uses.
//
// FAILS OPEN, like everything billing-related: an unreadable row, a missing table or a missing column is
// "not blocked". A billing check must never be the reason a paying tenant loses a lead.

import { planState, publicBookingClosedFor } from './planState.ts';
import { isDemoTenantId } from './demoTenants.ts';

type Reader = { from: (table: string) => any };

export async function tenantIsBlocked(admin: Reader, tenantId: string): Promise<boolean> {
  // The demo is never closed, even if its nightly reset missed the trial roll-forward (lib/demoSeed.ts).
  if (isDemoTenantId(tenantId)) return false;
  try {
    const { data, error } = await admin
      .from('tenants')
      .select('plan_status, trial_started_at, trial_ends_at')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return false;
    return planState(data).isBlocked;
  } catch {
    return false;
  }
}

/**
 * Is her PUBLIC booking page closed to new bookings? Like tenantIsBlocked, except a trial that ended in the last few days
 * (lib/planState publicGraceDays) keeps her page open, so her clients are not turned away the morning her trial ends.
 * Used by every path a stranger books through: the page itself, /api/book-appointment, the waitlist, and the client's own
 * "move my appointment" link. Fails open, like tenantIsBlocked.
 */
export async function tenantPublicClosed(admin: Reader, tenantId: string, now: Date = new Date()): Promise<boolean> {
  if (isDemoTenantId(tenantId)) return false;
  try {
    const { data, error } = await admin
      .from('tenants')
      .select('plan_status, trial_started_at, trial_ends_at')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return false;
    return publicBookingClosedFor(data, now);
  } catch {
    return false;
  }
}

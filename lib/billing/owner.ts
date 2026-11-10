// lib/billing/owner.ts
//
// SERVER ONLY (takes the service-role client). Who may move money for a business: its OWNER, never only a member of it.
// Used by the routes that charge or change the subscription (app/api/billing/addon, /period) and by the upgrades read, which offers
// nothing chargeable and no card digits to a member. Kept free of Next imports so it is unit-tested (test-upgrades-store.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OwnerDb = { from: (t: string) => any };

/**
 * Is this signed-in user the OWNER of the business, not only a member of it? Money moves only for the owner (a pack charge, the
 * yearly switch): a tenant_members row with another role (a 'member') may use the app but never charges the business's card.
 * tenants.owner_id decides when it is set. A business made before owner_id existed falls back to her membership row: 'owner', or a
 * row with no role at all (the original single-user signup). FAILS CLOSED: any read error is "not the owner".
 */
export async function callerIsOwner(db: OwnerDb, tenantId: string, userId: string): Promise<boolean> {
  try {
    const t = await db.from('tenants').select('owner_id').eq('id', tenantId).maybeSingle();
    if (t.error || !t.data) return false;
    if (t.data.owner_id) return String(t.data.owner_id) === userId;
    const m = await db.from('tenant_members').select('role').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
    if (m.error || !m.data) return false;
    const role = m.data.role == null ? '' : String(m.data.role).trim().toLowerCase();
    return role === '' || role === 'owner';
  } catch {
    return false;
  }
}

export const NOT_OWNER_HE = 'רק בעלת העסק יכולה לבצע חיוב או לשנות את המנוי.';

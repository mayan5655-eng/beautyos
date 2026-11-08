// lib/weeklyDigestLoad.ts
//
// Reads what lib/weeklyDigest.ts needs for one tenant, with a service-role client (the cron) or the same client after the
// session tenant was resolved (/api/weekly-digest). Every query is scoped to the tenant here, never left to RLS, because the
// cron's client bypasses it.
//
// Failure rules (lib/weeklyReport's, kept): receipts, voids, appointments and clients are the numbers, so a failed read
// throws and nothing is sent; a wrong number is worse than no note. The queue and the leads are only actions, so a failed
// read leaves that action out (null), and it is never shown as "nothing waiting".

import { readAllRows } from './pagedRead.js';
import { liveReceipts } from './till.ts';
import { isTabVisible } from './featureFlags.ts';
import { digestWeeks, addDays, type DigestInput } from './weeklyDigest.ts';

type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadDigestInput(
  db: Db,
  tenantId: string,
  settings: DigestInput['settings'],
  now: Date,
  isYomTov?: (day: string) => boolean,
): Promise<DigestInput> {
  const weeks = digestWeeks(now);
  // A day early: a bare date bound is UTC midnight, two or three hours into the Israeli day. The digest cuts by Israeli day.
  const since = addDays(weeks.prev.from, -1);
  const byTenant = (q: any) => q.eq('tenant_id', tenantId); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [rc, ap, cl, wa, ld] = await Promise.all([
    readAllRows(db, 'receipts', { columns: 'id, amount, created_at, service, items', filter: (q: any) => byTenant(q).gte('created_at', since) }), // eslint-disable-line @typescript-eslint/no-explicit-any
    // All of her appointments, future ones included: the win-back rule needs each client's last visit however old, and a
    // booking further out than the coming week still means she is coming back (not overdue). Every other use cuts by date.
    readAllRows(db, 'appointments', { columns: 'id, client_id, date, confirmation_status, kind, start_minute, hour, duration, service', filter: byTenant }),
    readAllRows(db, 'clients', { columns: 'id, name, created_at, birthday', filter: byTenant }),
    db.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending_manual'),
    isTabVisible(settings as never, 'leads')
      ? db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'new')
      : Promise.resolve({ count: null, error: { message: 'leads screen is off' } }),
  ]);
  const broken = [rc, ap, cl].find((r) => r.error || !r.complete);
  if (broken) throw new Error(`digest reads failed: ${broken.error?.message || 'incomplete read'}`);

  const ids = (rc.data || []).map((r: { id: unknown }) => r.id);
  let voids: { receipt_id?: unknown; credit_status?: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const v = await db.from('receipt_voids').select('receipt_id, credit_status').in('receipt_id', ids.slice(i, i + 200));
    // A failed read is not "nothing voided": voided receipts would count as income.
    if (v.error) throw new Error(`voids read failed: ${v.error.message}`);
    voids = voids.concat(v.data || []);
  }

  const count = (r: { count?: number | null; error?: unknown }) => (r && !r.error && typeof r.count === 'number' ? r.count : null);
  return {
    now,
    receipts: liveReceipts(rc.data || [], voids),
    appointments: ap.data || [],
    clients: cl.data || [],
    pendingMessages: count(wa),
    newLeads: count(ld),
    settings,
    isYomTov,
  };
}

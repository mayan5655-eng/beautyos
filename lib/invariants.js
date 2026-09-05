// lib/invariants.js
//
// The checks that compare what the system CLAIMS to what is actually there.
//
// ── Why these, specifically ───────────────────────────────────────────────
//
// Every bug found in this codebase over a long session shared one shape: a code
// path completed successfully and produced something plausible. None of them
// threw. An empty <select> looked like a time picker, a package sale with no
// receipt looked like a completed sale, a booking with no client_id looked like
// a booking, a feature nothing linked to looked shipped.
//
// The common cause is that an assertion and the fact it asserts live in
// different places, and nothing in normal operation brings them together.
// used_sessions asserted a count while the ledger held the truth. A booking
// asserted a client while the phone number held the truth. A STATUS header
// asserted "applied" while the database held the truth.
//
// So this file is not a health check for outages. Outages are loud. It is a set
// of statements that must be true, run against the data, on a schedule, so that
// silent drift has to announce itself instead of waiting to be tripped over
// while building the next thing.
//
// ── Rules for adding one ──────────────────────────────────────────────────
//
// A good invariant here is one where a violation is INVISIBLE in the product.
// If a broken state already shows up as an error, a blank screen or a support
// message, it does not need to be here. Every check below earned its place by
// having actually happened and having been found by accident.
//
// Each returns a count and a one-line human summary. Zero is healthy.

import { REFERENCED_TABLES } from './referencedTables.js';

/**
 * @typedef {{ key: string, label: string, count: number, detail?: string }} InvariantResult
 */

/**
 * Run every invariant against a Supabase client holding the service key.
 * Reads only - nothing here writes, and nothing here should ever be given a
 * reason to.
 *
 * @param {{ from: Function }} db supabase-js client (service role)
 * @returns {Promise<{ results: InvariantResult[], failures: InvariantResult[], errors: string[] }>}
 */
export async function runInvariants(db) {
  const results = [];
  const errors = [];

  const add = (key, label, count, detail) => results.push({ key, label, count, detail });
  const safe = async (key, fn) => {
    try { await fn(); }
    catch (err) { errors.push(`${key}: ${err?.message || String(err)}`); }
  };

  // 1. ORPHANED BOOKINGS.
  // A booking with a phone number and no client_id belongs to a person the
  // system cannot name. It never joins her card, never counts towards her last
  // visit, and - the part that went unnoticed for weeks - never reaches the
  // review request, which resolves a client from client_id and skips the row
  // without one. Fixed at the source in the booking route; this is the check
  // that says whether it stayed fixed.
  await safe('orphan_bookings', async () => {
    const { data, error } = await db
      .from('appointments')
      .select('id', { count: 'exact' })
      .not('client_phone', 'is', null)
      .is('client_id', null)
      .limit(1);
    if (error) throw new Error(error.message);
    add('orphan_bookings', 'תורים עם טלפון ובלי כרטיס לקוחה', data?.length ? -1 : 0);
  });

  // 2. PACKAGE COUNT vs LEDGER.
  // used_sessions is derived by a trigger from package_entries, and another
  // trigger refuses any direct write. Both are proven. This checks the thing
  // triggers cannot: that the derivation is actually correct over time, across
  // deletes, backfills and anything applied by hand in the SQL editor.
  await safe('package_ledger_drift', async () => {
    const { data: pkgs, error: pe } = await db.from('packages').select('id, used_sessions');
    if (pe) throw new Error(pe.message);
    const { data: entries, error: ee } = await db.from('package_entries').select('package_id, delta');
    if (ee) throw new Error(ee.message);
    const used = new Map();
    for (const e of entries || []) {
      used.set(String(e.package_id), (used.get(String(e.package_id)) || 0) - Number(e.delta));
    }
    const drifted = (pkgs || []).filter(
      (p) => Number(p.used_sessions || 0) !== (used.get(String(p.id)) || 0)
    );
    add('package_ledger_drift', 'חבילות שהמונה שלהן לא תואם ליומן', drifted.length,
      drifted.slice(0, 5).map((p) => p.id).join(', '));
  });

  // 3. PACKAGES SOLD WITH NO MONEY.
  // Selling a package used to write a row with a price and no receipt, so the
  // largest single transaction she makes was absent from her revenue, her
  // payment breakdown and her tax report while looking like a completed sale on
  // screen. The route creates the receipt now; this is what notices if a path
  // is ever added that does not.
  await safe('packages_without_receipt', async () => {
    const { data: pkgs, error: pe } = await db
      .from('packages').select('id, client_id, price, created_at');
    if (pe) throw new Error(pe.message);
    const paid = (pkgs || []).filter((p) => Number(p.price) > 0);
    if (paid.length === 0) { add('packages_without_receipt', 'חבילות שנמכרו בלי קבלה', 0); return; }
    const { data: receipts, error: re } = await db
      .from('receipts').select('client_id, service, amount');
    if (re) throw new Error(re.message);
    const packageReceipts = (receipts || []).filter((r) => String(r.service || '').startsWith('חבילה'));
    const missing = paid.filter((p) => !packageReceipts.some(
      (r) => String(r.client_id) === String(p.client_id) && Number(r.amount) === Number(p.price)
    ));
    add('packages_without_receipt', 'חבילות שנמכרו בלי קבלה', missing.length,
      missing.slice(0, 5).map((p) => p.id).join(', '));
  });

  // 4. REVIEWS THAT CANNOT BE REACHED.
  // A review belongs to an appointment. One pointing at an appointment that no
  // longer exists is not dangerous, but it is a sign that something deleted a
  // row the schema expected to outlive it.
  await safe('orphan_reviews', async () => {
    const { data: reviews, error: re } = await db.from('reviews').select('id, appointment_id');
    if (re) throw new Error(re.message);
    if (!reviews?.length) { add('orphan_reviews', 'ביקורות ללא תור', 0); return; }
    const { data: appts, error: ae } = await db
      .from('appointments')
      .select('id')
      .in('id', reviews.map((r) => r.appointment_id));
    if (ae) throw new Error(ae.message);
    const live = new Set((appts || []).map((a) => String(a.id)));
    const orphans = reviews.filter((r) => !live.has(String(r.appointment_id)));
    add('orphan_reviews', 'ביקורות ללא תור', orphans.length);
  });

  // 5. TENANT-LESS ROWS.
  // Every table in this schema is scoped by tenant_id, and two insert paths
  // shipped without stamping it - they leaned on a column default that nothing
  // in the repo guarantees. A row with a null tenant belongs to nobody, is
  // invisible to RLS, and will never be seen again by the business that created
  // it.
  for (const table of ['appointments', 'clients', 'receipts', 'packages', 'waitlist', 'reviews']) {
    await safe(`no_tenant_${table}`, async () => {
      const { data, error } = await db.from(table).select('id').is('tenant_id', null).limit(20);
      if (error) throw new Error(error.message);
      add(`no_tenant_${table}`, `שורות ללא שיוך לעסק ב-${table}`, (data || []).length);
    });
  }

  // 6. DOUBLE-BOOKED CLIENTS.
  // appointments_no_overlap enforces this at the database level and has been
  // proven to bite. The check is here anyway, because the constraint exempts
  // rows with a null or zero duration - deliberately, so one broken row cannot
  // veto a whole tenant's calendar - and that exemption is exactly where an
  // overlap could still hide.
  await safe('zero_duration_appointments', async () => {
    const { data, error } = await db
      .from('appointments')
      .select('id')
      .neq('confirmation_status', 'cancelled')
      .or('duration.is.null,duration.eq.0')
      .limit(20);
    if (error) throw new Error(error.message);
    add('zero_duration_appointments', 'תורים ללא משך - פטורים מבדיקת החפיפה', (data || []).length);
  });

  // 7. EVERY TABLE THE CODE REFERENCES EXISTS.
  // Three features shipped whose table was missing, misnamed or misshapen in
  // production - facebook_webhook_events, facebook_pages, owner_questions
  // (created as next_questions by a hand-run migration). The build cannot see
  // the database and the writes sat behind deliberate catch-and-continue, so
  // each was found by a person looking at the actual schema. This is that
  // look, nightly: the manifest (lib/referencedTables.js, kept honest by
  // test-referenced-tables.js) against schema_objects(), the SECURITY DEFINER
  // introspection RPC. A missing table here is a feature silently dead.
  await safe('missing_tables', async () => {
    const { data, error } = await db.rpc('schema_objects');
    if (error) throw new Error(error.message);
    const live = new Set((data || []).filter((o) => o.kind === 'table').map((o) => o.name));
    if (live.size === 0) throw new Error('schema_objects() returned no tables - the RPC itself is broken');
    const missing = REFERENCED_TABLES.filter((t) => !live.has(t));
    add('missing_tables', 'טבלאות שהקוד משתמש בהן ולא קיימות בבסיס הנתונים', missing.length,
      missing.join(', '));
  });

  const failures = results.filter((r) => r.count !== 0);
  return { results, failures, errors };
}

/** A short report a person can read on a phone. */
export function formatInvariantReport({ failures, errors }) {
  if (!failures.length && !errors.length) return '';
  const lines = [];
  if (failures.length) {
    lines.push('נמצאו אי-התאמות בנתונים:');
    for (const f of failures) {
      lines.push(`· ${f.label}: ${f.count === -1 ? 'קיימות' : f.count}${f.detail ? ` (${f.detail})` : ''}`);
    }
  }
  if (errors.length) {
    lines.push('');
    lines.push('בדיקות שלא הצליחו לרוץ:');
    for (const e of errors) lines.push(`· ${e}`);
  }
  return lines.join('\n');
}

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

import { REFERENCED_TABLES, REFERENCED_COLUMNS } from './referencedTables.js';
import { readAllRows } from './pagedRead.js';
import { CRON_JOBS, CRON_JOB_HE, staleCronJobs } from './cronHeartbeat.js';

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

  // Every whole-table read goes through readAllRows. PostgREST hands back at most
  // max_rows (1000 by default) without saying so, and a check run over a
  // fragment reports "healthy" about rows it never saw - the one wrong answer a
  // monitor must not give. A read that cannot be finished is thrown, so it lands
  // in `errors` and the report says the check did NOT run.
  const all = async (table, opts) => {
    const r = await readAllRows(db, table, opts);
    if (r.error) throw new Error(r.error.message);
    if (!r.complete) throw new Error(`${table} could not be read completely (${r.fetched}/${r.total})`);
    return r.data;
  };

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
    const pkgs = await all('packages', { columns: 'id, used_sessions' });
    const entries = await all('package_entries', { columns: 'id, package_id, delta' });
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
    const pkgs = await all('packages', { columns: 'id, client_id, price, created_at' });
    const paid = (pkgs || []).filter((p) => Number(p.price) > 0);
    if (paid.length === 0) { add('packages_without_receipt', 'חבילות שנמכרו בלי תשלום רשום', 0); return; }
    // Only package receipts matter here; filtering in the query keeps the read
    // small however many ordinary receipts the platform has accumulated.
    const receipts = await all('receipts', { columns: 'id, client_id, service, amount', filter: (q) => q.like('service', 'חבילה%') });
    const packageReceipts = (receipts || []).filter((r) => String(r.service || '').startsWith('חבילה'));
    const missing = paid.filter((p) => !packageReceipts.some(
      (r) => String(r.client_id) === String(p.client_id) && Number(r.amount) === Number(p.price)
    ));
    add('packages_without_receipt', 'חבילות שנמכרו בלי תשלום רשום', missing.length,
      missing.slice(0, 5).map((p) => p.id).join(', '));
  });

  // 4. REVIEWS THAT CANNOT BE REACHED.
  // A review belongs to an appointment. One pointing at an appointment that no
  // longer exists is not dangerous, but it is a sign that something deleted a
  // row the schema expected to outlive it.
  await safe('orphan_reviews', async () => {
    const reviews = await all('reviews', { columns: 'id, appointment_id' });
    if (!reviews?.length) { add('orphan_reviews', 'ביקורות ללא תור', 0); return; }
    // In chunks: one .in() with a thousand ids is a ~40 KB URL, and the answer
    // is also subject to the row cap.
    const live = new Set();
    const ids = [...new Set(reviews.map((r) => r.appointment_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 150) {
      const { data: appts, error: ae } = await db.from('appointments').select('id').in('id', ids.slice(i, i + 150));
      if (ae) throw new Error(ae.message);
      for (const a of appts || []) live.add(String(a.id));
    }
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
      // An exact count, not a 20-row sample: the old version could never report
      // more than 20 and called that the number.
      const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).is('tenant_id', null);
      if (error) throw new Error(error.message);
      add(`no_tenant_${table}`, `שורות ללא שיוך לעסק ב-${table}`, count || 0);
    });
  }

  // 6. DOUBLE-BOOKED CLIENTS.
  // appointments_no_overlap enforces this at the database level and has been
  // proven to bite. The check is here anyway, because the constraint exempts
  // rows with a null or zero duration - deliberately, so one broken row cannot
  // veto a whole tenant's calendar - and that exemption is exactly where an
  // overlap could still hide.
  await safe('zero_duration_appointments', async () => {
    const { count, error } = await db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .neq('confirmation_status', 'cancelled')
      .or('duration.is.null,duration.eq.0');
    if (error) throw new Error(error.message);
    add('zero_duration_appointments', 'תורים ללא משך - פטורים מבדיקת החפיפה', count || 0);
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
    // Paged: the API answers at most 1000 rows and does not say it stopped (add_schema_objects.sql's own warning). One call
    // used to see only the first 1000 of ~1500 objects, so columns past the cut were reported missing when they were there.
    const data = await readSchemaObjects(db);
    const live = new Set((data || []).filter((o) => o.kind === 'table').map((o) => o.name));
    if (live.size === 0) throw new Error('schema_objects() returned no tables - the RPC itself is broken');
    const missing = REFERENCED_TABLES.filter((t) => !live.has(t));
    add('missing_tables', 'טבלאות שהקוד משתמש בהן ולא קיימות בבסיס הנתונים', missing.length,
      missing.join(', '));

    // 7b. AND THE COLUMNS. Existence alone missed the shape mismatches twice:
    // facebook_pages lacked the columns the callback writes, owner_questions
    // lacked status/result after a rename from a legacy table. schema_objects
    // returns columns as "table.column"; only tables that exist are checked
    // here, so a missing table is reported once above, not per column.
    const liveColumns = new Set((data || []).filter((o) => o.kind === 'column').map((o) => o.name));
    const missingColumns = [];
    for (const [table, cols] of Object.entries(REFERENCED_COLUMNS)) {
      if (!live.has(table)) continue;
      for (const col of cols) {
        if (!liveColumns.has(`${table}.${col}`)) missingColumns.push(`${table}.${col}`);
      }
    }
    add('missing_columns', 'עמודות שהקוד משתמש בהן ולא קיימות בבסיס הנתונים', missingColumns.length,
      missingColumns.join(', '));
  });

  // 8. SCHEDULED JOBS THAT DID NOT RUN.
  // A job that fails writes a log line; a job that never starts writes nothing, so no check above could see it. Each cron route
  // stamps cron_runs right after its auth check (lib/cronHeartbeat.js); this compares the stamps to the schedule. The monthly
  // billing charge is the one that matters most: if it stops, nobody is charged and nothing says so.
  await safe('stale_cron_jobs', async () => {
    const { data, error } = await db.from('cron_runs').select('job, last_run_at');
    if (error) {
      if (isMissingRelation(error)) { add('stale_cron_jobs', 'משימות מתוזמנות שלא רצו בזמן', 0, 'cron_runs עוד לא קיימת'); return; }
      throw new Error(error.message);
    }
    // The table is new: until every job has had one full interval to stamp it, "never ran" would be noise, not news.
    const stale = staleCronJobs(data, new Date()).filter((s) => s.lastRunAt !== null || (data || []).length > 0 && hadTimeToRun(data, s.job));
    add('stale_cron_jobs', 'משימות מתוזמנות שלא רצו בזמן', stale.length,
      stale.map((s) => `${CRON_JOB_HE[s.job] || s.job}${s.lastRunAt ? ` (לאחרונה ${s.lastRunAt.slice(0, 16).replace('T', ' ')})` : ' (אף פעם)'}`).join(', '));
  });

  // 9. ONE BUSINESS, TWO STORIES ABOUT WHETHER SHE PAYS.
  // tenants.plan_status (what the app lets her do) and billing_subscriptions.status (what Grow charges her) are written by
  // different paths. When they disagree she is either blocked although she pays, or served although she cancelled.
  await safe('plan_billing_mismatch', async () => {
    const subs = await db.from('billing_subscriptions').select('tenant_id, status');
    if (subs.error) {
      if (isMissingRelation(subs.error)) { add('plan_billing_mismatch', 'עסקים שמצב המנוי שלהם סותר את מצב החיוב', 0); return; }
      throw new Error(subs.error.message);
    }
    const rows = subs.data || [];
    if (!rows.length) { add('plan_billing_mismatch', 'עסקים שמצב המנוי שלהם סותר את מצב החיוב', 0); return; }
    const plan = new Map();
    const ids = rows.map((r) => r.tenant_id);
    for (let i = 0; i < ids.length; i += 150) {
      const { data: ts, error: te } = await db.from('tenants').select('id, plan_status').in('id', ids.slice(i, i + 150));
      if (te) throw new Error(te.message);
      for (const t of ts || []) plan.set(String(t.id), t.plan_status);
    }
    const bad = planBillingMismatches(rows, plan);
    add('plan_billing_mismatch', 'עסקים שמצב המנוי שלהם סותר את מצב החיוב', bad.length,
      bad.slice(0, 5).map((b) => `${b.tenantId.slice(0, 8)}: ${b.why}`).join(', '));
  });

  // 10. MONEY WITHOUT A DOCUMENT.
  // Money moves through Grow, our ledger and the receipt provider; nothing compared them. A day after the money moved there
  // should be a document. Two places: Kalmea's own subscription charges (billing_payments) and the businesses' Grow payments.
  await safe('billing_without_invoice', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await db.from('billing_payments').select('id', { count: 'exact', head: true })
      .eq('status', 'succeeded').in('invoice_status', ['pending', 'failed']).lt('created_at', since);
    if (error) {
      if (isMissingRelation(error)) { add('billing_without_invoice', 'חיובי מנוי שנגבו בלי חשבונית (יותר מיום)', 0); return; }
      throw new Error(error.message);
    }
    add('billing_without_invoice', 'חיובי מנוי שנגבו בלי חשבונית (יותר מיום)', count || 0);
  });
  await safe('grow_paid_without_document', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await db.from('grow_payments').select('id', { count: 'exact', head: true })
      .eq('status', 'paid').is('receipt_id', null).is('invoice_url', null).lt('paid_at', since);
    if (error) {
      if (isMissingRelation(error)) { add('grow_paid_without_document', 'תשלומי Grow ששולמו בלי קבלה (יותר מיום)', 0); return; }
      throw new Error(error.message);
    }
    add('grow_paid_without_document', 'תשלומי Grow ששולמו בלי קבלה (יותר מיום)', count || 0);
  });

  const failures = results.filter((r) => r.count !== 0);
  return { results, failures, errors };
}

const isMissingRelation = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(String(e.message || '')));

/** A job that never stamped is only "late" once the table has existed for that job's whole interval. */
function hadTimeToRun(rows, job) {
  const firstStamp = Math.min(...rows.map((r) => Date.parse(r.last_run_at)).filter(Number.isFinite));
  return Number.isFinite(firstStamp) && Date.now() - firstStamp > (CRON_JOBS[job]?.maxGapMs || 0);
}

/**
 * plan_status vs billing status. Only clear contradictions:
 *   billing active/trialing  but the plan is expired or paused   -> she pays and is blocked
 *   billing canceled         but the plan is active              -> she cancelled and is still served
 * @param {Array<{ tenant_id: string, status: string }>} subs
 * @param {Map<string, string | null>} planOf
 */
export function planBillingMismatches(subs, planOf) {
  const out = [];
  for (const s of subs || []) {
    const plan = planOf.get(String(s.tenant_id));
    if (plan === undefined) continue;
    if ((s.status === 'active' || s.status === 'trialing') && (plan === 'expired' || plan === 'paused')) {
      out.push({ tenantId: String(s.tenant_id), why: `משלמת אבל ${plan === 'paused' ? 'מושהית' : 'חסומה'}` });
    } else if (s.status === 'canceled' && plan === 'active') {
      out.push({ tenantId: String(s.tenant_id), why: 'ביטלה אבל עדיין פעילה' });
    }
  }
  return out;
}

/** Every row of schema_objects(), 1000 at a time, in a stable order. Throws when a page fails. */
export async function readSchemaObjects(db) {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.rpc('schema_objects').order('kind').order('name').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
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

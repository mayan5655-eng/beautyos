/**
 * check-appointment-overlaps.js
 *
 * READ-ONLY. Answers one question: do any appointments that are live at the
 * same time in the same business already overlap each other?
 *
 * Why it exists: add_appointment_start_minute.sql deliberately stopped short of
 * a database-level overlap guarantee. Its unique index only prevents two
 * appointments starting at the SAME minute - at whole-hour granularity that was
 * the same thing as "no overlap", and since half-hour starts it is not. A
 * 14:00+60 and a 14:30+30 are now both accepted by the database. Overlap is
 * enforced only in application code, which means it is enforced only on the
 * paths that remembered to call it.
 *
 * The fix is an exclusion constraint (see
 * supabase/migrations/add_appointment_no_overlap.sql). PostgreSQL validates an
 * exclusion constraint against every existing row when it is created, so if any
 * row already overlaps another, the ALTER TABLE fails outright. This script is
 * how you find that out BEFORE running it, and - more importantly - it is how
 * you find out whose data is involved, because the answer to "an existing row
 * overlaps" must never be "delete the row so the constraint fits".
 *
 * ── Tenant filter ──────────────────────────────────────────────────────────
 * Default mode is scoped to ONE tenant and prints the filter it used, per the
 * standing rule for ad-hoc scripts in this repo.
 *
 * `--all-tenants` widens the scan, because a constraint is table-wide: it
 * cannot be added while ANY tenant has an overlap, so a single-tenant answer
 * cannot decide the question. That mode is a deliberate, flagged exception and
 * it is safe to be one - this script issues SELECTs and nothing else, and it
 * prints counts and tenant ids only, never another tenant's client names,
 * phone numbers or services.
 *
 * Usage:
 *   node --env-file=.env.local check-appointment-overlaps.js
 *   node --env-file=.env.local check-appointment-overlaps.js --all-tenants
 *   node --env-file=.env.local check-appointment-overlaps.js --tenant=<uuid>
 */

const { createClient } = require("@supabase/supabase-js");

// NO DEFAULT TENANT, deliberately. This script used to carry
// OWNER_TENANT_ID = b09637c8-…, which is not the owner's tenant and never was:
// the owner's is 448e9e45-2251-4572-b665-886c5bc7a4c8. The constant was copied
// into five other files and two migrations, and for weeks every verification
// "against the owner's data" was actually run against a near-empty tenant
// nobody uses. Nothing leaked and nothing was lost - this script only reads,
// and RLS was never involved because it runs on the service-role key, which
// sees all tenants equally. That is exactly why the label had nothing to
// contradict it.
//
// A script holding the service-role key does not get to guess whose data it is
// looking at. Say which tenant, or say --all-tenants and mean it.
const argv = process.argv.slice(2);
const allTenants = argv.includes("--all-tenants");
const tenantArg = (argv.find((a) => a.startsWith("--tenant=")) || "").split("=")[1];
const tenantId = tenantArg || process.env.TENANT_ID || "";

if (!allTenants && !tenantId) {
  console.error("Refusing to run without a target.");
  console.error("  node --env-file=.env.local check-appointment-overlaps.js --tenant=<uuid>");
  console.error("  node --env-file=.env.local check-appointment-overlaps.js --all-tenants");
  process.exit(2);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Same semantics as lib/apptTime.ts, restated here so this script stays a
// standalone diagnostic with no build step: start_minute is the truth, hour*60
// is the fallback for rows written before the migration.
const startOf = (r) => {
  if (r.start_minute !== null && r.start_minute !== undefined && Number.isFinite(Number(r.start_minute))) {
    return Number(r.start_minute);
  }
  if (r.hour !== null && r.hour !== undefined && Number.isFinite(Number(r.hour))) return Number(r.hour) * 60;
  return null;
};

async function fetchAll() {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("appointments")
      .select("id, tenant_id, date, start_minute, hour, duration, confirmation_status")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    // The filter. Applied unless the table-wide census was explicitly asked for.
    if (!allTenants) q = q.eq("tenant_id", tenantId);

    const { data, error } = await q;
    if (error) throw new Error(`select failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function overlapsIn(rows) {
  // Group by (tenant, date) - two appointments can only clash inside one day of
  // one business - then compare pairs within each group.
  const groups = new Map();
  for (const r of rows) {
    if (String(r.confirmation_status || "") === "cancelled") continue; // a cancelled row frees its slot
    const s = startOf(r);
    if (s === null) continue; // no usable start: the constraint will not cover it either
    const d = Number(r.duration);
    const dur = Number.isFinite(d) ? d : 0;
    if (dur <= 0) continue; // zero-length range overlaps nothing, in JS and in Postgres
    const key = `${r.tenant_id}|${r.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: r.id, tenant_id: r.tenant_id, date: r.date, start: s, end: s + dur });
  }

  const clashes = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].start >= list[i].end) break; // sorted: nothing later can reach back
        // Half-open [start, end): ending at 15:00 and starting at 15:00 is not
        // an overlap. Same rule as lib/apptTime.overlaps and as int4range &&.
        clashes.push([list[i], list[j]]);
      }
    }
  }
  return clashes;
}

(async () => {
  console.log("=".repeat(72));
  console.log("check-appointment-overlaps  —  READ ONLY (SELECT only, no writes)");
  if (allTenants) {
    console.log("TENANT FILTER: none — --all-tenants census across every tenant.");
    console.log("               Required because an exclusion constraint is table-wide:");
    console.log("               one tenant's answer cannot decide whether it can be added.");
    console.log("               Counts and tenant ids only; no client data is read out.");
  } else {
    console.log(`TENANT FILTER: tenant_id = ${tenantId}`);
  }
  console.log("=".repeat(72));

  const rows = await fetchAll();
  console.log(`rows scanned: ${rows.length}`);

  // Facts the migration depends on, worth knowing before writing it.
  const nullStatus = rows.filter((r) => r.confirmation_status === null || r.confirmation_status === undefined).length;
  const nullStart = rows.filter((r) => startOf(r) === null).length;
  const nullDuration = rows.filter((r) => r.duration === null || r.duration === undefined).length;
  const zeroDuration = rows.filter((r) => Number(r.duration) === 0).length;
  const cancelled = rows.filter((r) => String(r.confirmation_status || "") === "cancelled").length;
  console.log(
    `  confirmation_status NULL: ${nullStatus} | cancelled: ${cancelled} | ` +
      `start unusable: ${nullStart} | duration NULL: ${nullDuration} | duration 0: ${zeroDuration}`,
  );

  const clashes = overlapsIn(rows);

  const perTenant = new Map();
  for (const r of rows) perTenant.set(r.tenant_id, { rows: (perTenant.get(r.tenant_id)?.rows || 0) + 1, overlaps: perTenant.get(r.tenant_id)?.overlaps || 0 });
  for (const [a] of clashes) {
    const e = perTenant.get(a.tenant_id) || { rows: 0, overlaps: 0 };
    e.overlaps += 1;
    perTenant.set(a.tenant_id, e);
  }

  console.log("");
  console.log("per tenant:");
  console.log("  tenant_id                              rows   overlapping pairs");
  const sorted = [...perTenant.entries()].sort((x, y) => y[1].overlaps - x[1].overlaps);
  for (const [tid, v] of sorted) {
    console.log(`  ${String(tid).padEnd(38)} ${String(v.rows).padStart(5)}   ${String(v.overlaps).padStart(6)}`);
  }

  const tenantsWithOverlaps = sorted.filter(([, v]) => v.overlaps > 0);
  console.log("");
  console.log("-".repeat(72));
  console.log(`TENANTS WITH OVERLAPS: ${tenantsWithOverlaps.length}`);
  console.log(`OVERLAPPING PAIRS TOTAL: ${clashes.length}`);
  console.log("-".repeat(72));

  if (clashes.length > 0) {
    console.log("");
    console.log("First 20 pairs (ids and minute ranges only — no client data):");
    for (const [a, b] of clashes.slice(0, 20)) {
      const f = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      console.log(
        `  tenant ${a.tenant_id}  ${a.date}  ` +
          `#${a.id} ${f(a.start)}-${f(a.end)}  ><  #${b.id} ${f(b.start)}-${f(b.end)}`,
      );
    }
    console.log("");
    console.log("DO NOT delete or move any of these rows to make the constraint fit.");
    console.log("They are real appointments. Take this list to the owner first.");
  } else {
    console.log("");
    console.log("No overlaps. add_appointment_no_overlap.sql can be applied as written.");
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

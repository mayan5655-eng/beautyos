/**
 * verify-appointment-no-overlap.js
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  THIS SCRIPT WRITES TO THE PRODUCTION DATABASE.                          │
 * │                                                                          │
 * │  It INSERTs and then DELETEs real rows in `appointments`. That is not    │
 * │  incidental — it is the whole point. A database constraint can only be   │
 * │  proved by making the database reject something, so this cannot be done  │
 * │  with a read-only script. Contrast check-appointment-overlaps.js, which  │
 * │  is SELECT-only and safe to run any time.                                │
 * │                                                                          │
 * │  Every write is confined to, and NOTHING ELSE in the table is touched:   │
 * │    tenant_id = whatever --tenant=<uuid> says          (no default)       │
 * │    date      = 2020-01-09                            (sentinel, 2020)    │
 * │    name      LIKE 'STAGE-C-VERIFY%'                  (marker)            │
 * │                                                                          │
 * │  NEVER POINT THIS AT A REAL DATE. The sentinel date is what makes the    │
 * │  script safe: it is years in the past, so no calendar view, no reminder  │
 * │  job (they filter date = tomorrow) and no client can ever see these rows,│
 * │  and a bug in cleanup strands them somewhere nobody is looking rather    │
 * │  than in a live day. Changing SENTINEL_DATE to a date a cosmetician      │
 * │  actually books would put test rows in a working calendar AND — because  │
 * │  the constraint under test is real — could block her genuine bookings    │
 * │  for as long as they sat there. The guard below refuses to run if the    │
 * │  date is later than 2021, but do not go looking for ways around it.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WHAT IT PROVES — that appointments_no_overlap (Stage C,
 * supabase/migrations/add_appointment_no_overlap.sql) is live and correct:
 *   - an overlapping 14:30+30 against a 14:00+60 is rejected with SQLSTATE
 *     23P01, by the DATABASE — inserts go through PostgREST, so lib/apptTime
 *     and every application guard are bypassed and cannot be what refused it;
 *   - a back-to-back 15:00+30 is still accepted (not over-blocking);
 *   - a cancelled appointment still frees its slot.
 *
 * There is no test runner in this repo. This script is the behavioural test for
 * that constraint, which is why it is committed rather than thrown away.
 *
 * SAFETY RAILS, in the order they fire:
 *   1. The sentinel-date guard above.
 *   2. A pre-flight that ABORTS unless the sentinel day is completely empty,
 *      so the script can never write next to, or delete near, a real row.
 *   3. Cleanup in a `finally` block — it runs even if a test throws mid-way.
 *   4. Deletes are by explicit id AND tenant_id AND date, never a bare id, plus
 *      a marker-scoped sweep for any row whose id did not come back.
 *   5. A post-cleanup census that re-asserts the day is empty, and fails the
 *      run if it is not.
 *
 * Per the standing repo rule, every query prints the tenant filter it applied.
 *
 * Usage:
 *   node --env-file=.env.local verify-appointment-no-overlap.js
 *
 * Exit code 0 = all checks passed and every test row was removed.
 */

const { createClient } = require("@supabase/supabase-js");

// NO DEFAULT, and for this script that matters more than for its read-only
// sibling: every run of this file INSERTS rows. It used to default to
// b09637c8-…, labelled "the owner's tenant" in the header above. It is not:
// the owner's tenant is 448e9e45-2251-4572-b665-886c5bc7a4c8. b09637c8 is a
// near-empty tenant that was almost certainly picked BECAUSE it was empty and
// therefore safe to write into - and then described as the owner's, which is
// how a sensible choice became a wrong fact that five other files copied.
//
// Being wrong in the safe direction is luck, not design. A script that inserts
// rows on the service-role key must be told whose table it is writing to.
const TENANT_ID = (process.argv.slice(2).find((a) => a.startsWith("--tenant=")) || "").split("=")[1]
  || process.env.TENANT_ID
  || "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(TENANT_ID)) {
  console.error("Refusing to run: this script INSERTS rows and has no default tenant.");
  console.error("  node --env-file=.env.local verify-appointment-no-overlap.js --tenant=<uuid>");
  process.exit(2);
}

const SENTINEL_DATE = "2020-01-09";
const MARKER = "STAGE-C-VERIFY";

// Rail 1. The header's "never point this at a real date" rule, enforced rather
// than merely asked for. A plain string compare is enough — ISO dates sort
// lexicographically — and it needs no clock, so the check cannot drift.
if (!/^\d{4}-\d{2}-\d{2}$/.test(SENTINEL_DATE) || SENTINEL_DATE >= "2021-01-01") {
  console.error("=".repeat(78));
  console.error(`REFUSING TO RUN: SENTINEL_DATE is "${SENTINEL_DATE}".`);
  console.error("This script INSERTs into appointments. It is only safe on a date years in");
  console.error("the past, where no calendar, reminder job or client can ever see the rows.");
  console.error("A date a cosmetician might actually book could put test rows in a live day");
  console.error("and block her real bookings. Change it back to 2020-01-09.");
  console.error("=".repeat(78));
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Every query in this script goes through one of these two helpers, and each
// prints the tenant filter it applied. Per the standing repo rule, there is no
// path here that touches the table without an explicit tenant_id filter.
const banner = (what) => {
  console.log(`    TENANT FILTER: tenant_id = ${TENANT_ID}  AND date = ${SENTINEL_DATE}   [${what}]`);
};

const inserted = [];

async function insertAppt(label, startMinute, duration, status) {
  const row = {
    tenant_id: TENANT_ID,
    date: SENTINEL_DATE,
    start_minute: startMinute,
    duration,
    name: `${MARKER} ${label}`,
    service: "stage-c verification",
  };
  if (status) row.confirmation_status = status;

  banner(`insert ${label}`);
  const { data, error } = await supabase.from("appointments").insert(row).select("id, start_minute, duration, confirmation_status").single();
  if (data?.id) inserted.push(data.id);
  return { data, error };
}

async function selectSentinelDay(what) {
  banner(what);
  const { data, error } = await supabase
    .from("appointments")
    .select("id, name, start_minute, duration, confirmation_status")
    .eq("tenant_id", TENANT_ID)      // the filter
    .eq("date", SENTINEL_DATE)
    .order("start_minute", { ascending: true });
  if (error) throw new Error(`select failed: ${error.message}`);
  return data || [];
}

const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

(async () => {
  console.log("=".repeat(78));
  console.log("verify-appointment-no-overlap  —  behavioural check of appointments_no_overlap");
  console.log(`TENANT FILTER (all writes and reads): tenant_id = ${TENANT_ID}`);
  console.log(`SENTINEL DATE (all writes and reads): date = ${SENTINEL_DATE}`);
  console.log("=".repeat(78));

  // ── Pre-flight ──────────────────────────────────────────────────────────
  console.log("\n[0] PRE-FLIGHT — the sentinel day must be empty before we write to it");
  const before = await selectSentinelDay("pre-flight");
  console.log(`    rows already on ${SENTINEL_DATE} for this tenant: ${before.length}`);
  if (before.length > 0) {
    console.log("    ABORT: sentinel day is not empty. Refusing to write near existing rows.");
    console.log(JSON.stringify(before, null, 2));
    process.exit(1);
  }
  console.log("    empty — safe to proceed.");

  try {
    // ── 2a. The overlapping pair the OLD schema accepted ──────────────────
    console.log("\n[2] OVERLAP IS REJECTED BY THE DATABASE");
    console.log("    14:00+60 then 14:30+30. Different start_minute, so uniq_appt_slot_active");
    console.log("    cannot be what rejects it — only the exclusion constraint can.");

    const a = await insertAppt("A 14:00+60", 840, 60);
    record(
      "14:00+60 inserted (baseline)",
      !a.error,
      a.error ? `unexpected error: ${a.error.code} ${a.error.message}` : `id=${a.data.id} ${fmt(840)}–${fmt(900)}`,
    );
    if (a.error) throw new Error("baseline insert failed; cannot continue");

    const b = await insertAppt("B 14:30+30 MUST FAIL", 870, 30);
    const isExclusion = b.error?.code === "23P01";
    const namesConstraint = /appointments_no_overlap/.test(`${b.error?.message} ${b.error?.details}`);
    record(
      "14:30+30 REJECTED by the database with 23P01 (exclusion_violation)",
      !!b.error && isExclusion,
      b.error
        ? `code=${b.error.code}  message=${b.error.message}`
        : "NO ERROR — the row was accepted. The constraint is NOT enforcing.",
    );
    record(
      "the rejecting constraint is named appointments_no_overlap",
      namesConstraint,
      namesConstraint ? "constraint name present in the server error" : "constraint name NOT in the error text",
    );

    // ── 1. Constraint + extension, inferred from the above ────────────────
    console.log("\n[1] CONSTRAINT AND EXTENSION");
    record(
      "appointments_no_overlap exists on public.appointments",
      !!b.error && isExclusion && namesConstraint,
      "proved by the server naming it in a 23P01 raised at insert time",
    );
    record(
      "btree_gist is enabled",
      !!b.error && isExclusion && namesConstraint,
      "necessarily true: a GiST exclusion constraint using `tenant_id WITH =` on uuid " +
        "cannot be created without btree_gist, so its existence entails the extension",
    );

    // ── 2b. Back-to-back must still be allowed ────────────────────────────
    console.log("\n[3] BACK-TO-BACK IS STILL ALLOWED (not over-blocking)");
    console.log("    15:00+30 begins exactly when the 14:00+60 ends. Half-open [start,end).");
    const c = await insertAppt("C 15:00+30 adjacent", 900, 30);
    record(
      "15:00+30 accepted alongside 14:00–15:00",
      !c.error,
      c.error ? `WRONGLY REJECTED: ${c.error.code} ${c.error.message}` : `id=${c.data.id} ${fmt(900)}–${fmt(930)}`,
    );

    // ── 3. A cancelled appointment frees its slot ─────────────────────────
    console.log("\n[4] A CANCELLED APPOINTMENT STILL FREES ITS SLOT");
    console.log("    cancelled 16:00+60, then a NEW active 16:00+60 at the identical time.");
    const d = await insertAppt("D 16:00+60 cancelled", 960, 60, "cancelled");
    record(
      "cancelled 16:00+60 inserted",
      !d.error,
      d.error ? `unexpected error: ${d.error.code} ${d.error.message}` : `id=${d.data.id} status=${d.data.confirmation_status}`,
    );

    const e = await insertAppt("E 16:00+60 replacement", 960, 60);
    record(
      "active 16:00+60 accepted over the cancelled one",
      !e.error,
      e.error
        ? `WRONGLY REJECTED: ${e.error.code} ${e.error.message} — cancelled rows are NOT freeing their slot`
        : `id=${e.data.id} — same tenant, same date, same start_minute as the cancelled row`,
    );

    // Sanity: the exclusion constraint is still armed on this same day.
    const f = await insertAppt("F 16:30+30 MUST FAIL", 990, 30);
    record(
      "16:30+30 still rejected — the constraint is armed on this day too",
      f.error?.code === "23P01",
      f.error ? `code=${f.error.code}  message=${f.error.message}` : "NO ERROR — unexpectedly accepted",
    );

    // ── State before cleanup ──────────────────────────────────────────────
    console.log("\n[5] ROWS PRESENT BEFORE CLEANUP");
    const live = await selectSentinelDay("pre-cleanup census");
    for (const r of live) {
      console.log(`    id=${r.id}  ${fmt(r.start_minute)}+${r.duration}  ${r.confirmation_status}  ${r.name}`);
    }
  } finally {
    // ── Cleanup — runs even if a test threw ───────────────────────────────
    console.log("\n[6] CLEANUP");
    console.log(`    deleting ${inserted.length} inserted row(s) by id, each with the tenant filter`);
    for (const id of inserted) {
      banner(`delete id=${id}`);
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("tenant_id", TENANT_ID)      // the filter — never a bare id delete
        .eq("date", SENTINEL_DATE);
      console.log(`      id=${id} -> ${error ? `DELETE FAILED: ${error.message}` : "deleted"}`);
    }

    // Belt and braces: a marker-scoped sweep, still tenant- and date-filtered,
    // in case a row was inserted but its id never came back.
    banner("marker sweep");
    const { error: sweepErr } = await supabase
      .from("appointments")
      .delete()
      .eq("tenant_id", TENANT_ID)        // the filter
      .eq("date", SENTINEL_DATE)
      .like("name", `${MARKER}%`);
    console.log(`      marker sweep -> ${sweepErr ? `FAILED: ${sweepErr.message}` : "done"}`);

    console.log("\n[7] CLEANUP VERIFICATION — the sentinel day must be empty again");
    const after = await selectSentinelDay("post-cleanup");
    console.log(`    rows remaining on ${SENTINEL_DATE} for this tenant: ${after.length}`);
    if (after.length > 0) console.log(JSON.stringify(after, null, 2));
    record("every test row removed", after.length === 0, `${after.length} row(s) remain`);

    console.log("\n" + "=".repeat(78));
    const failed = results.filter((r) => !r.pass);
    for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
    console.log("-".repeat(78));
    console.log(failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`);
    console.log("=".repeat(78));
    process.exitCode = failed.length === 0 ? 0 : 1;
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});

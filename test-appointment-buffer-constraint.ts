// test-appointment-buffer-constraint.ts
//
// Vercel security review (2026-11-08): concurrent public bookings could both pass the buffer check (a snapshot) and
// insert back-to-back rows that ate each other's buffer, because appointments_no_overlap guarded [start, start +
// duration) only. add_service_buffer_2026-11-05.sql stores the buffer on each appointment and rebuilds the constraint
// over [start, start + duration + coalesce(buffer_minutes, 0)). This checks:
//   1. the constraint's interval math is exactly the app's clashesWithBuffer, over a grid;
//   2. the migration changes ONLY the upper bound of the original constraint (both SQL files parsed and compared);
//   3. every appointment writer stores the buffer it checked with, through writeWithApptBuffer;
//   4. before the migration, the retry drops buffer_minutes and nothing else;
//   5. a 23P01 is still every writer's "slot taken".
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bufferedRange, clashesWithBuffer, bufferLookup } from './lib/serviceBuffer.ts';
import { apptBufferField, isMissingApptBufferColumn, withoutApptBuffer, writeWithApptBuffer } from './lib/apptBuffer.ts';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// ── 2. Parse both SQL files ────────────────────────────────────────────────
const stripComments = (sql: string) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const norm = (sql: string) => stripComments(sql).replace(/\s+/g, ' ').trim();
/** The `add constraint appointments_no_overlap exclude ... where (...);` statement, comments stripped. */
function constraintOf(sql: string): string {
  const body = stripComments(sql);
  const m = body.match(/add constraint appointments_no_overlap\s+exclude using gist[\s\S]*?where \(coalesce\(confirmation_status, ''\) <> 'cancelled'\);/);
  assert.ok(m, 'constraint statement found');
  return m![0].replace(/\s+/g, ' ').trim();
}
const oldSql = read('supabase/migrations/add_appointment_no_overlap.sql');
const newSql = read('supabase/migrations/add_service_buffer_2026-11-05.sql');
const oldC = constraintOf(oldSql);
const newC = constraintOf(newSql);
const whereOf = (c: string) => c.slice(c.lastIndexOf(' where ('));
eq(whereOf(newC), whereOf(oldC), 'the WHERE clause (cancelled rows free their slot) is copied verbatim');
const caseOf = (c: string) => c.match(/case when [\s\S]*? then 'empty'::int4range/)![0];
eq(caseOf(newC), caseOf(oldC), 'the CASE that makes a null start, a null duration or duration <= 0 empty is copied verbatim');
ok(newC.includes('else int4range(start_minute, start_minute + duration + coalesce(buffer_minutes, 0)) end'), 'the upper bound carries the row\'s own buffer');
eq(newC.replace(' + coalesce(buffer_minutes, 0)', ''), oldC, 'nothing but the upper bound differs from the original constraint');
ok(oldC.includes('tenant_id with =, date with =,'), 'per tenant and day, as before');
ok(!/\bkind\b|\bhour\b/.test(oldC) && !/\bkind\b|\bhour\b/.test(newC), 'the original has no kind or hour term, and neither does the rebuild');

const exec = norm(newSql);
const at = (s: string) => { const i = exec.indexOf(s); assert.ok(i >= 0, 'found: ' + s); return i; };
ok(at('begin;') < at('alter table public.appointments drop constraint if exists appointments_no_overlap;'), 'the drop is inside the transaction');
ok(at('alter table public.appointments drop constraint if exists appointments_no_overlap;') < at('add constraint appointments_no_overlap'), 'dropped, then created by name');
ok(at('add constraint appointments_no_overlap') < exec.lastIndexOf('commit;'), 'and committed together');
ok(exec.includes('add column if not exists buffer_minutes smallint;'), 'appointments.buffer_minutes is a nullable smallint');
ok(exec.includes('check (buffer_minutes is null or (buffer_minutes >= 0 and buffer_minutes <= 120))'), 'null or 0..120');
ok(at('add column if not exists buffer_minutes smallint;') < at('add constraint appointments_no_overlap'), 'the column exists before the constraint uses it');
ok(/pg_get_constraintdef\(oid\) like '%buffer_minutes%'/.test(exec), 're-running is a no-op');
ok(/past closing/i.test(newSql) && /does not (check|know) (closing|her hours)/i.test(newSql), 'says the buffer may run past closing, which the database does not check');
// The rollback restores the original expression exactly.
const rollback = newSql.slice(newSql.indexOf('── Rollback')).split('\n').map((l) => l.replace(/^--\s?/, '')).join('\n');
eq(constraintOf(rollback), oldC, 'the rollback recreates the original constraint');
ok(/verify/i.test(newSql) && /23P01/.test(newSql), 'verify queries are included');
ok(!newSql.includes("'448e9e45-2251-4572-b665-886c5bc7a4c8'"), 'no example writes to the owner\'s tenant');

// ── 1. The interval math, against the app's rule ───────────────────────────
// The database's range for a row, as the CASE above computes it. null = 'empty'.
const dbRange = (s: number | null, d: number | null, b: number | null): [number, number] | null =>
  s === null || d === null || d <= 0 ? null : [s, s + d + (b ?? 0)];
const dbOverlap = (a: [number, number] | null, b: [number, number] | null) => !!a && !!b && a[0] < b[1] && b[0] < a[1];
const starts = [480, 525, 540, 555, 570, 600];
const durations = [15, 30, 45, 60];
const buffers = [null, 0, 5, 15, 30];
let cases = 0;
for (const sA of starts) for (const dA of durations) for (const bA of buffers)
  for (const sB of starts) for (const dB of durations) for (const bB of buffers) {
    // The app: an existing A is busy until its end plus its buffer; the new B brings its own.
    const app = clashesWithBuffer(sB, dB, bB ?? 0, [bufferedRange(sA, sA + dA, bA ?? 0)]);
    const db = dbOverlap(dbRange(sA, dA, bA), dbRange(sB, dB, bB));
    assert.equal(db, app, `A=${sA}+${dA}+${bA} B=${sB}+${dB}+${bB}`);
    // And it is symmetric: which of the two came first does not matter to the database or to the app.
    assert.equal(clashesWithBuffer(sA, dA, bA ?? 0, [bufferedRange(sB, sB + dB, bB ?? 0)]), app, 'symmetric');
    cases++;
  }
ok(cases === (starts.length * durations.length * buffers.length) ** 2, `constraint == clashesWithBuffer over ${cases} pairs`);
ok(!dbOverlap(dbRange(540, 60, 0), dbRange(600, 30, 0)), 'back-to-back with no buffers is still allowed');
ok(!dbOverlap(dbRange(540, 60, null), dbRange(600, 30, null)), 'and with null buffers (every row before this migration)');
ok(dbOverlap(dbRange(540, 60, 15), dbRange(600, 30, 0)), 'a start inside the buffer before it is refused');
ok(!dbOverlap(dbRange(540, 60, 15), dbRange(615, 30, 0)), 'a start exactly as the buffer ends is allowed');
ok(dbOverlap(dbRange(510, 15, 20), dbRange(540, 60, 0)), 'its own buffer running into the next appointment is refused');
ok(!dbOverlap(dbRange(510, 15, 15), dbRange(540, 60, 0)), 'its own buffer ending exactly at the next start is allowed');
ok(dbOverlap(dbRange(540, 60, 15), dbRange(600, 30, 15)), 'overlapping buffers: refused');
ok(!dbOverlap(dbRange(540, 0, 30), dbRange(540, 60, 0)) && !dbOverlap(dbRange(null, 60, 30), dbRange(540, 60, 0)), 'a row with no usable time stays exempt, buffer or not');
ok(!dbOverlap(dbRange(0, 1440, 0), null), 'an empty range overlaps nothing');

// A stored buffer is a floor for the app's lookup, so the app never offers what the database would refuse.
const look = bufferLookup([{ name: 'ריסים', buffer_minutes: 5 }], 0);
eq(look({ service: 'ריסים' }), 5, 'today\'s service buffer');
eq(look({ service: 'ריסים', buffer_minutes: 15 }), 15, 'booked with 15, lowered to 5 since: still busy for 15, as the database holds it');
eq(look({ service: 'ריסים', buffer_minutes: 0 }), 5, 'booked with 0, raised since: today\'s buffer applies');
eq(look({ service: 'ריסים', buffer_minutes: null }), 5, 'a row from before the migration: today\'s buffer');
eq(look({ kind: 'personal', service: '', buffer_minutes: 0 }), 0, 'a personal block: 0');

// ── 4. Before the migration: drop buffer_minutes, and only it ──────────────
eq(apptBufferField(15), { buffer_minutes: 15 }, 'the field');
eq(apptBufferField(null), { buffer_minutes: 0 }, 'no buffer is stored as 0, never null');
eq(apptBufferField(999), { buffer_minutes: 120 }, 'clamped to the column\'s range');
const pgrst = { code: 'PGRST204', message: "Could not find the 'buffer_minutes' column of 'appointments' in the schema cache" };
const pg = { code: '42703', message: 'column "buffer_minutes" of relation "appointments" does not exist' };
const other = { code: 'PGRST204', message: "Could not find the 'requires_deposit' column of 'appointments' in the schema cache" };
ok(isMissingApptBufferColumn(pgrst) && isMissingApptBufferColumn(pg), 'both ways the column can be missing');
ok(!isMissingApptBufferColumn(other), 'another missing column is not this one');
ok(!isMissingApptBufferColumn({ code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' }), 'an overlap is not a missing column');
ok(!isMissingApptBufferColumn(null), 'no error');
const row = { tenant_id: 't', date: '2030-01-01', start_minute: 600, hour: 10, duration: 60, price: 200, client_id: 'c', confirmation_status: 'pending', ...apptBufferField(15) };
{ const { buffer_minutes: _b, ...rest } = row; eq(withoutApptBuffer(row), rest, 'withoutApptBuffer drops that one field and keeps every other'); void _b; }
eq(withoutApptBuffer([row, row]).map((r) => Object.keys(r).length), [8, 8], 'for every row of a batch');

type Res = { data: unknown; error: { code?: string; message?: string } | null };
async function runWith(firstError: Res['error'], rows: Record<string, unknown> | Record<string, unknown>[]) {
  const calls: unknown[] = [];
  const res = await writeWithApptBuffer(rows, async (r) => { calls.push(r); return calls.length === 1 ? { data: null, error: firstError } : { data: [r], error: null }; });
  return { calls, res };
}
{
  const { calls, res } = await runWith(pgrst, row);
  eq(calls.length, 2, 'missing buffer column: retried once');
  const { buffer_minutes: _b, ...rest } = row; void _b;
  eq(calls[1], rest, 'the retry carries every other field, unchanged');
  ok(res.error === null, 'and the booking is saved');
}
{
  const { calls } = await runWith(pg, [row, { ...row, date: '2030-01-08' }]);
  eq(calls.length, 2, 'a batch is retried once too');
  ok((calls[1] as Record<string, unknown>[]).every((r) => !('buffer_minutes' in r) && 'price' in r && 'client_id' in r), 'without the buffer only');
}
{
  const { calls, res } = await runWith(other, row);
  eq(calls.length, 1, 'another missing column: no retry, nothing dropped');
  eq(res.error, other, 'its error comes back for the caller');
}
{
  const taken = { code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' };
  const { calls, res } = await runWith(taken, row);
  eq(calls.length, 1, 'a 23P01 is not retried');
  eq(res.error, taken, 'and reaches the caller, whose answer is "slot taken"');
}
{
  const { calls } = await runWith(pgrst, { start_minute: 600, duration: 60 });
  eq(calls.length, 1, 'a row without the buffer is never retried');
}

// ── 3. Every writer stores the buffer it checked with ──────────────────────
const app = read('app/beautyos.jsx');
const route = read('app/api/book-appointment/route.js');
const booking = read('lib/booking.ts');
const claim = read('app/api/claim/route.ts');
ok(route.includes('...apptBufferField(svcBuffer),') && route.includes('writeWithApptBuffer({'), 'public booking: stores the buffer it checked (svcBuffer)');
ok(route.includes('if (error.code === "23505" || error.code === "23P01") {') && route.includes('{ status: 409 }') && route.includes('"השעה הזו כבר נתפסה, אפשר לבחור שעה אחרת?"'), 'public booking: 23P01 is still a clean 409 in Hebrew');
ok(/SAME_DAY_OPTIONAL = \["kind", "buffer_minutes"\]/.test(route), 'public booking: reads the stored buffers, dropping only a missing optional column');
ok(app.includes('...(apptBuffersApply?apptBufferField(newApptBuffer):{})};') , 'in-app edit: refreshes the buffer only when it moves');
ok(/String\(apptEditOrig\.service\|\|""\)===String\(newAppt\.service\|\|""\)\);/.test(app), 'in-app edit: a service change counts as a move');
ok(app.includes('confirmation_status:"pending",confirmation_sent:false,...tenantField,...apptBufferField(newApptBuffer)};'), 'in-app new appointment: the buffer it checked');
ok(app.includes('...(seriesId?{series_id:seriesId}:{}),...tenantField,...apptBufferField(newApptBuffer)};'), 'in-app recurring series: the same');
ok(app.includes('return start < rawEnd + apptBufferOf(a) && bs < end;'), 'in-app recurring series: checked with buffers before the database is asked');
ok(app.includes('...apptBufferField(newApptBufferFor(svc.name)),'), 'rebook sheet and till strip (insertRebookAppointment): the buffer isFreeAt checked');
ok(app.includes('...apptBufferField(newApptBufferFor(svc?.name)),'), 'voice booking: the buffer its clash check used');
ok((app.match(/\.\.\.apptBufferField\(0\),/g) || []).length === 2, 'personal blocks and imported history: 0');
ok(booking.includes('...apptBufferField(b.buffer_minutes),') && booking.includes('if (code === "23505" || code === "23P01") return { ok: false, taken: true };'), 'slot claim (waitlist / gap offers): stores the buffer, 23P01 is still "taken"');
ok(claim.includes('buffer_minutes: claimBuffer,'), 'the claim route passes the service buffer');
ok(!/\.eq\("name", claimed\.service\)\s*\.maybeSingle\(\)/.test(claim) && claim.includes('claimBuffer = bufferLookup(rows, claimBufferDefault)'), 'an archived namesake never hides the active service buffer on a claim');
ok(app.includes('if (code === "23505" || code === "23P01") {'), 'in-app writers: 23P01 is still "this time is taken"');

// Every insert into appointments in app/ and lib/ goes through writeWithApptBuffer. Allowed exceptions, each with a
// reason: the personal-event restore (re-inserts the rows just deleted, exactly as they were read) and the demo seed
// (lib/demoSeed.ts, the demo tenant's sample diary, not a booking: null buffer = 0, which is what it was checked with).
const EXEMPT = [/insert\(existing\)/, /^lib\/demoSeed\.ts:/];
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
let writers = 0;
for (const file of [...walk('app'), ...walk('lib')]) {
  const lines = read(file).split('\n');
  lines.forEach((line, i) => {
    if (!/from\(\s*["']appointments["']\s*\)\s*\.insert\(/.test(line)) return;
    const tag = `${file.split("\\").join("/")}:${i + 1}: ${line.trim()}`;
    if (EXEMPT.some((re) => re.test(tag))) return;
    const ctx = lines.slice(Math.max(0, i - 25), i + 1).join('\n');
    ok(/writeWithApptBuffer\(/.test(ctx) && /\(r(ow)?\) => [a-z]+\.from\(\s*["']appointments["']\s*\)\.insert\(r(ow)?\)/.test(line), `goes through writeWithApptBuffer: ${tag}`);
    writers++;
  });
}
ok(writers >= 8, `found ${writers} appointment inserts, all buffered`);

console.log(`appointment buffer constraint: passed ${passed} failed 0`);

// scripts/mark-reminder-backlog.mjs
//
// Marks the EXISTING smart-reminder backlog as already-sent, so the fixed cron
// starts clean and nobody receives an automated message about a visit from two
// years ago just because we deployed a fix.
//
//   node --env-file=.env.local scripts/mark-reminder-backlog.mjs           # DRY RUN
//   node --env-file=.env.local scripts/mark-reminder-backlog.mjs --write   # do it
//
// DRY RUN IS THE DEFAULT. --write is required to change anything.
//
// ── What it writes, and what it does not ───────────────────────────────────
// It inserts rows into auto_reminders_log ONLY. It sends nothing, it touches no
// client record, and it deletes nothing. Every row it writes says "this
// reminder counts as already delivered", which is exactly what stops the cron
// from delivering it.
//
// ── Why only winback and package_done ──────────────────────────────────────
// Those are the two types with a backlog: their candidate sets grow
// monotonically, so at cutover there is a pile of people who have been eligible
// for months and never messaged. `review` looks only at appointments from two
// days ago and `birthday` only at today, so neither can accumulate - marking
// them would suppress a legitimate message due today.
//
// ── Why it calls the engine ────────────────────────────────────────────────
// The candidate list comes from lib/reminders/smartReminders.js in collectOnly
// mode - the same module the cron runs. A second implementation of "who is a
// winback candidate" would drift from the first, and the failure mode of drift
// here is silent: either people get messaged who should not, or people never
// get messaged who should.
//
// ── This does not lose the list ────────────────────────────────────────────
// The lapsed-client view she will get is computed from appointment history, not
// from this log, so marking here hides nobody from her. It only stops the
// AUTOMATION from acting on its own. She still chooses who to contact.

import { createClient } from '@supabase/supabase-js';
import { runSmartReminders } from '../lib/reminders/smartReminders.js';

const WRITE = process.argv.includes('--write');
const CHUNK = 200;
const BACKLOG_TYPES = new Set(['winback', 'package_done']);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(74));

line('='.repeat(74));
line(`Smart-reminder backlog marking — ${WRITE ? 'WRITE' : 'DRY RUN'}`);
if (!WRITE) line('DRY RUN. Nothing will be written. Pass --write to apply.');
line('Sends NOTHING. Writes only auto_reminders_log. Deletes nothing.');
line('='.repeat(74));

// collectOnly: the full eligible list, uncapped, with no sends and no writes.
const { eligible, stats } = await runSmartReminders({
  db,
  send: async () => { throw new Error('BUG: the backlog script must never send'); },
  collectOnly: true,
});

const backlog = (eligible || []).filter((c) => BACKLOG_TYPES.has(c.type));

line(`\ncandidates considered      : ${stats.considered}`);
line(`  already logged (skipped) : ${stats.skipped.alreadySent}`);
line(`  no phone                 : ${stats.skipped.noPhone}`);
line(`  tenant paused            : ${stats.skipped.paused}`);
line(`  type toggled off         : ${stats.skipped.toggledOff}`);
line(`\neligible right now         : ${(eligible || []).length}`);
line(`  winback                  : ${backlog.filter((c) => c.type === 'winback').length}`);
line(`  package_done             : ${backlog.filter((c) => c.type === 'package_done').length}`);
line(`  review / birthday        : ${(eligible || []).length - backlog.length}  (NOT marked - time-bounded)`);
rule();

if (backlog.length === 0) {
  line('\nNothing to mark. The automation is already clean.');
  line(WRITE ? 'Nothing was written.' : 'DRY RUN — nothing was written.');
  process.exit(0);
}

const byTenant = {};
for (const c of backlog) byTenant[c.tenantId] = (byTenant[c.tenantId] || 0) + 1;
line('\nper tenant:');
for (const [t, n] of Object.entries(byTenant).sort()) {
  line(`  TENANT FILTER tenant_id=${t}   ${n} row(s) to mark`);
}
rule();

line('\nsample of what would be suppressed (first 10):');
for (const c of backlog.slice(0, 10)) {
  line(`  TENANT FILTER tenant_id=${c.tenantId}  ${c.type.padEnd(13)} ref=${String(c.referenceId).padEnd(38)} ${c.client?.name ?? ''}`);
}

if (!WRITE) {
  rule();
  line(`DRY RUN — would insert ${backlog.length} row(s) into auto_reminders_log.`);
  line('Re-run with --write to apply.');
  process.exit(0);
}

line(`\nWRITING ${backlog.length} row(s) in chunks of ${CHUNK}…`);
let written = 0, failed = 0;
for (let i = 0; i < backlog.length; i += CHUNK) {
  const slice = backlog.slice(i, i + CHUNK);
  const chunkNo = Math.floor(i / CHUNK) + 1;
  const rows = slice.map((c) => ({
    tenant_id: c.tenantId,
    client_id: c.clientId,
    reminder_type: c.type,
    reference_id: c.referenceId || '',
  }));
  line(`  chunk ${chunkNo}: insert ${rows.length} row(s) into auto_reminders_log`);
  const { error } = await db.from('auto_reminders_log').insert(rows);
  if (error) { failed += rows.length; line(`      FAILED: ${error.message}`); continue; }
  written += rows.length;
}
rule();
line(`  marked: ${written}   failed: ${failed}`);
line('\nRe-run the cron with ?dryRun=1 to confirm these no longer appear as');
line('candidates. They will still show in the lapsed-client view, which reads');
line('appointment history rather than this log.');
process.exit(failed === 0 ? 0 : 1);

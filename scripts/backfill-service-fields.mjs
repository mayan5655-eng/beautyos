// scripts/backfill-service-fields.mjs
//
// service_prices.field is only ever written by the onboarding / "add from
// templates" seed picker (app/beautyos.jsx's handleAddTemplateServices).
// Every hand-typed or hand-edited service — on every tenant, not only one —
// was silently left with field: null forever, with no UI to fix it until
// now (app/beautyos.jsx's per-row field selector, added alongside this
// script). This backfills the existing null rows it can, from the name.
//
//   node --env-file=.env.local scripts/backfill-service-fields.mjs            # DRY RUN
//   node --env-file=.env.local scripts/backfill-service-fields.mjs --write    # do it
//
// DRY RUN IS THE DEFAULT. --write is required to change anything.
//
// ── Guessing, honestly ──────────────────────────────────────────────────────
// guessFieldFromName (lib/defaultImages.js) is the SAME vocabulary table the
// default-image lookup already uses, so a row backfilled here gets exactly
// the photo you would expect from its new field — nothing here is a second,
// separately-drifting classifier. A name that matches neither table's
// keywords is left alone in EVERY mode, --write included: it is reported
// under "ambiguous, needs a person" and never guessed at. That is very
// likely where a genuine leftover — a service from before a tenant narrowed
// to one field — will show up: a generic name that isn't recognisably either
// field's vocabulary. Fix those by hand in Settings -> services, or delete
// them if they no longer apply.
//
// ── It never overwrites an existing field ───────────────────────────────────
// Only rows where field IS NULL or '' are touched, in every mode. A service
// already tagged - correctly or not - is not this script's business; use the
// row selector for that.
import { createClient } from '@supabase/supabase-js';
import { guessFieldFromName } from '../lib/defaultImages.js';

const WRITE = process.argv.includes('--write');

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(72));

line('='.repeat(72));
line(`service_prices field backfill — MODE: ${WRITE ? 'WRITE' : 'DRY RUN'}`);
if (!WRITE) line('DRY RUN. Nothing will be written. Pass --write to act.');
line('='.repeat(72));

const { data: rows, error } = await db
  .from('service_prices')
  .select('id, tenant_id, name, field')
  .order('tenant_id');

if (error) {
  line(`\nABORT: could not read service_prices — ${error.message}`);
  process.exit(1);
}

const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const untagged = rows.filter((r) => blank(r.field));
const already = rows.filter((r) => !blank(r.field));

const guessed = untagged
  .map((r) => ({ ...r, guess: guessFieldFromName(r.name) }))
  .reduce(
    (acc, r) => {
      (r.guess ? acc.confident : acc.ambiguous).push(r);
      return acc;
    },
    { confident: [], ambiguous: [] }
  );

line(`\nservice_prices rows: ${rows.length}`);
line(`  already tagged          : ${already.length}`);
line(`  untagged, name matches  : ${guessed.confident.length}`);
line(`  untagged, ambiguous     : ${guessed.ambiguous.length}`);
rule();

if (guessed.confident.length) {
  line('\nWould assign (name matched one field\'s vocabulary):\n');
  let tenant = null;
  for (const r of guessed.confident.sort((a, b) => String(a.tenant_id).localeCompare(String(b.tenant_id)))) {
    if (r.tenant_id !== tenant) { tenant = r.tenant_id; line(`  TENANT FILTER tenant_id=${tenant}`); }
    line(`      "${r.name}"  ->  ${r.guess}   (id=${r.id})`);
  }
}

if (guessed.ambiguous.length) {
  rule();
  line('\nAmbiguous — name matches neither field\'s vocabulary. NEVER auto-assigned,');
  line('in any mode. Fix by hand in Settings -> services, or delete if stale:\n');
  let tenant = null;
  for (const r of guessed.ambiguous.sort((a, b) => String(a.tenant_id).localeCompare(String(b.tenant_id)))) {
    if (r.tenant_id !== tenant) { tenant = r.tenant_id; line(`  TENANT FILTER tenant_id=${tenant}`); }
    line(`      "${r.name}"   (id=${r.id})`);
  }
}

if (guessed.confident.length === 0) {
  rule();
  line('\nNothing this script can confidently backfill.');
  process.exit(0);
}

if (!WRITE) {
  rule();
  line('\nDRY RUN — nothing was written. Re-run with --write to apply the confident assignments above.');
  line('The ambiguous rows above are never touched by this script, with or without --write.');
  process.exit(0);
}

rule();
line('\nWRITING…');
let written = 0, failed = 0;
for (const r of guessed.confident) {
  const { error: e } = await db.from('service_prices').update({ field: r.guess }).eq('id', r.id);
  if (e) { failed++; line(`  id=${r.id} "${r.name}"  FAILED: ${e.message}`); continue; }
  // Read back, not just trust a 200: prove the stored value is what was asked for.
  const { data: back, error: rErr } = await db.from('service_prices').select('field').eq('id', r.id).limit(1);
  if (rErr || back?.[0]?.field !== r.guess) { failed++; line(`  id=${r.id} "${r.name}"  FAILED: read-back mismatch`); continue; }
  written++;
  line(`  id=${r.id} "${r.name}"  -> ${r.guess}  OK, verified`);
}
rule();
line(`  written and verified: ${written}   failed: ${failed}`);
process.exit(failed ? 1 : 0);

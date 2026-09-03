// scripts/migration-status.mjs
//
//   node --env-file=.env.local scripts/migration-status.mjs
//   npm run migrations:status
//
// Prints, for every migration file, whether the objects it creates are actually
// in the database - derived, not read from the STATUS comment at the top.
//
// ── Why this exists ───────────────────────────────────────────────────────
//
// Twice in one week a STATUS header was wrong, both times claiming NOT APPLIED
// while the object was live: add_appointment_no_overlap.sql while its exclusion
// constraint was enforcing on every insert, and tenant-resolution-fix.sql while
// the ordered function it describes was already the live definition. Neither
// was found by reading. Both were found by asking the database, and only
// because somebody happened to ask.
//
// A header is a claim about a system it cannot observe. This asks the system.
//
// ── How it decides ────────────────────────────────────────────────────────
//
// It parses each .sql file for the objects it creates - tables, columns,
// constraints, indexes, functions, triggers, policies - and checks each against
// public.schema_objects(). A file whose objects are all present is APPLIED; all
// absent is NOT APPLIED; some of each is PARTIAL, which is the state worth
// having a name for, because it is what a migration interrupted halfway leaves
// behind and nothing else in this repo would notice it.
//
// It is deliberately a HEURISTIC and says so in its output. A file that only
// grants, revokes, backfills or drops creates nothing to look for and comes out
// UNKNOWN rather than pretending. The alternative - a hand-maintained manifest
// of what each file creates - would be one more thing that can disagree with
// reality, which is the problem this is meant to solve.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY || /placeholder|SENSITIVE/i.test(KEY)) {
  console.error('Missing real Supabase credentials.');
  console.error('  node --env-file=.env.local scripts/migration-status.mjs');
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to real values.');
  process.exit(2);
}

// Objects a migration file creates. Each pattern captures one name.
const PATTERNS = [
  [/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi, 'table'],
  [/add\s+constraint\s+"?([a-z0-9_]+)"?/gi, 'constraint'],
  [/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi, 'index'],
  [/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi, 'function'],
  [/create\s+trigger\s+"?([a-z0-9_]+)"?/gi, 'trigger'],
  [/create\s+policy\s+"?([a-z0-9_]+)"?/gi, 'policy'],
  [/alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi, 'column'],
];

// Comments are stripped first, so an example inside a -- VERIFY block is not
// mistaken for something the file creates. That distinction matters here: these
// files carry more commented SQL than live SQL.
function stripComments(sql) {
  return sql.replace(/^\s*--.*$/gm, '');
}

function objectsCreatedBy(sql) {
  const body = stripComments(sql);
  const found = new Set();
  for (const [re, kind] of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      const name = kind === 'column' ? `${m[1]}.${m[2]}` : m[1];
      if (name) found.add(`${kind}:${name}`);
    }
  }
  return [...found];
}

function sqlFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sqlFiles(p, acc);
    else if (entry.endsWith('.sql')) acc.push(p);
  }
  return acc;
}

/** What the file's own header claims, for comparison. */
function declaredStatus(sql) {
  const m = /--\s*(?:──\s*)?STATUS:\s*([^\n─]+)/i.exec(sql);
  if (!m) return '';
  return m[1].trim().replace(/\s+/g, ' ').slice(0, 40);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const { data, error } = await db.rpc('schema_objects');

if (error) {
  console.error('schema_objects() failed:', error.message);
  console.error('\nIf it does not exist yet, apply supabase/migrations/add_schema_introspection.sql first.');
  console.error('That file is the one exception to this script: its own status has to be checked by hand.');
  process.exit(1);
}

const live = new Set((data || []).map((r) => `${r.kind}:${r.name}`));
const files = sqlFiles('supabase/migrations').sort();

const rows = [];
for (const file of files) {
  const sql = readFileSync(file, 'utf8');
  const objects = objectsCreatedBy(sql);
  const present = objects.filter((o) => live.has(o));
  const missing = objects.filter((o) => !live.has(o));

  const derived = objects.length === 0 ? 'UNKNOWN'
    : missing.length === 0 ? 'APPLIED'
    : present.length === 0 ? 'NOT APPLIED'
    : 'PARTIAL';

  rows.push({ file: file.replace(/\\/g, '/'), derived, declared: declaredStatus(sql), present: present.length, total: objects.length, missing });
}

const pad = (s, n) => String(s).padEnd(n);
const w = Math.min(64, Math.max(...rows.map((r) => r.file.length)));

console.log('');
console.log(pad('MIGRATION', w) + '  ' + pad('DERIVED', 12) + 'OBJECTS   DECLARED');
console.log('─'.repeat(w + 46));
for (const r of rows) {
  console.log(pad(r.file, w) + '  ' + pad(r.derived, 12) + pad(`${r.present}/${r.total}`, 10) + (r.declared || '—'));
}

const partial = rows.filter((r) => r.derived === 'PARTIAL');
if (partial.length) {
  console.log('\nPARTIAL — applied in part. This is the state nothing else would notice:');
  for (const r of partial) console.log(`  ${r.file}\n    missing: ${r.missing.join(', ')}`);
}

// The point of the whole exercise: where the file's story and the database's
// disagree. Not an error - a prompt to trust the derived column and fix the
// header.
const disagree = rows.filter((r) => {
  if (!r.declared || r.derived === 'UNKNOWN') return false;
  const saysApplied = /^applied/i.test(r.declared);
  return saysApplied !== (r.derived === 'APPLIED');
});
if (disagree.length) {
  console.log('\nHEADER DISAGREES WITH THE DATABASE — the database is right:');
  for (const r of disagree) console.log(`  ${r.file}: header says "${r.declared}", objects say ${r.derived}`);
}

console.log('\nUNKNOWN means the file creates no named object this can look for —');
console.log('a grant, a backfill or a drop. It is not a failure.\n');

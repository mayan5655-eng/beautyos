// test-referenced-tables.js
//
// The repo-side half of the referenced-tables guard: every table the code
// names in a .from('...') call must appear in lib/referencedTables.js, so
// the manifest the nightly invariant checks against production can never
// fall behind the code. Plain node, no database - the database half runs in
// the cron (lib/invariants.js).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REFERENCED_TABLES } from './lib/referencedTables.js';

const ROOTS = ['app', 'lib', 'scripts'];
const EXT = /\.(js|jsx|ts|tsx|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.next']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

// Same shape the codebase uses everywhere: .from("table") / .from('table').
// Dynamic table names (.from(variable)) do not occur; if one ever does, this
// test will not see it - keep table names literal.
const FROM_RE = /\.from\(\s*["']([a-z_]+)["']\s*\)/g;

const manifest = new Set(REFERENCED_TABLES);
const found = new Map(); // table -> first file seen
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(FROM_RE)) {
      if (!found.has(m[1])) found.set(m[1], file);
    }
  }
}

const missing = [...found.entries()].filter(([t]) => !manifest.has(t));

if (found.size === 0) {
  console.error('FAIL: the grep found no .from() calls at all - the pattern or roots are wrong, which would make this guard silently useless.');
  process.exit(1);
}
if (missing.length) {
  console.error('FAIL: code references tables missing from lib/referencedTables.js:');
  for (const [t, f] of missing) console.error(`  ${t}  (first seen in ${f})`);
  console.error('Add them to REFERENCED_TABLES so the nightly invariant checks they exist in prod.');
  process.exit(1);
}

console.log(`referenced-tables: ${found.size} tables in code, all in the manifest (${manifest.size} entries)`);

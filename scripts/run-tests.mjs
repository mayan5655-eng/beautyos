// scripts/run-tests.mjs
//
// Runs every test-*.{js,ts} in the repo root and exits non-zero if any fails.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// There were six test files and no way to run them except typing a filename.
// package.json had no `test` script and there was no CI, so the suite executed
// only when somebody remembered it existed. The consequences were exactly what
// you would predict and worse than you would guess:
//
//   * THREE OF THE SIX HAD BEEN BROKEN FOR SOME TIME - test-ai-usage,
//     test-leads-csv-import and test-leads-xlsx-import all failed to load. Not
//     failing assertions: failing to import at all, so they had been running
//     zero tests while looking like coverage in the file listing.
//   * A fourth was broken by this session and nobody noticed for a commit,
//     because `next build` stayed green. The build compiles TypeScript; it has
//     never once meant the code works.
//
// So the point of this file is not convenience. It is that a check nobody runs
// is not a check, and a suite whose failures are invisible is worse than no
// suite - it is a claim of coverage with nothing behind it.
//
// ── Placeholder environment ───────────────────────────────────────────────
//
// Some modules build a Supabase client at import time and throw without a URL.
// The values below are fake and deliberately unusable: they let a module
// CONSTRUCT so its pure logic can be tested, and any real network call made
// with them fails loudly rather than touching a live database from a test.
// A test that needs real data belongs in a script, not here.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FAKE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
  CONFIRM_LINK_SECRET: 'placeholder-signing-secret',
  REVIEW_LINK_SECRET: 'placeholder-signing-secret',
};

const files = readdirSync('.')
  .filter((f) => /^test-.*\.(js|ts)$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('No test files found. Expected test-*.js or test-*.ts in the repo root.');
  process.exit(1);
}

let failed = 0;
const results = [];

for (const file of files) {
  // --experimental-strip-types lets node run the .ts files directly. It is a
  // no-op for .js, so one invocation covers both.
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', file],
    { encoding: 'utf8', env: { ...FAKE_ENV, ...process.env } }
  );

  const ok = run.status === 0;
  if (!ok) failed++;
  results.push({ file, ok, out: (run.stdout || '') + (run.stderr || '') });

  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${file}\n`);
  // A passing run's output is noise; a failing one is the whole point.
  if (!ok) {
    process.stdout.write(
      run.stdout || run.stderr
        ? '\n' + [run.stdout, run.stderr].filter(Boolean).join('\n').trimEnd() + '\n\n'
        : '  (no output)\n\n'
    );
  }
}

// Assertion counts, pulled out of whatever each suite printed. They use
// different formats, so this is best-effort and never fails the run.
const totals = results.reduce((acc, r) => {
  const m = /passed\s+(\d+)\s+failed\s+(\d+)/i.exec(r.out);
  if (m) { acc.passed += Number(m[1]); acc.failed += Number(m[2]); }
  return acc;
}, { passed: 0, failed: 0 });

console.log('─'.repeat(52));
console.log(`${files.length - failed}/${files.length} files passed` +
  (totals.passed ? `   ·   ${totals.passed} assertions` : ''));

process.exit(failed > 0 ? 1 : 0);

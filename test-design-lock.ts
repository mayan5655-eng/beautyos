// The template hash-lock: a forced refresh must carry a reason and leave a record.
//
// Added 2026-10-06. `--force` used to be a bare flag; it was used seven times and three of them (6995518,
// cb091bd, 954fb44) were never mentioned in a commit message, while a saved design is re-drawn from the
// CURRENT template of its (key, version) - so each refresh silently changed designs already saved.
// This runs the real script (in a temp directory, never touching the real lock) and checks what it does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
const lockFile = path.join(dir, 'templates.lock.json');
const historyFile = path.join(dir, 'templates.lock-history.json');
const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/design-templates-lock.mjs', ...args], {
  encoding: 'utf8', env: { ...process.env, TEMPLATES_LOCK_DIR: dir },
});

// a first run writes a lock for every template and records nothing
let r = run();
assert.equal(r.status, 0, r.stderr);
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
const ids = Object.keys(lock);
assert.ok(ids.length > 100, `a real lock was written (${ids.length} entries)`);
assert.ok(!fs.existsSync(historyFile), 'a first lock is not a forced change: no history');

// an unchanged re-run is clean and records nothing
r = run();
assert.equal(r.status, 0, r.stderr);
assert.ok(!fs.existsSync(historyFile), 'no change, no history');

// a template that moved WITHOUT a version bump: refused, file untouched
const victim = ids[3];
const tampered = { ...lock, [victim]: '0000000000000000' };
const write = () => fs.writeFileSync(lockFile, JSON.stringify(tampered, null, 2) + '\n');
write();
const before = fs.readFileSync(lockFile, 'utf8');
r = run();
assert.equal(r.status, 1, 'a changed template without --force is refused');
assert.match(r.stderr, /version did not/);
assert.equal(fs.readFileSync(lockFile, 'utf8'), before, 'and the lock is left as it was');

// --force alone: refused - the reason is the point
for (const args of [['--force'], ['--force', '--reason'], ['--force', '--reason', 'fix'], ['--force', '--reason', '   ']]) {
  r = run(...args);
  assert.equal(r.status, 1, `${args.join(' ')}: refused`);
  assert.match(r.stderr, /needs --reason/);
  assert.equal(fs.readFileSync(lockFile, 'utf8'), before, `${args.join(' ')}: nothing written`);
  assert.ok(!fs.existsSync(historyFile), `${args.join(' ')}: no history written`);
}

// --force with a reason: accepted, and recorded
r = run('--force', '--reason', 'Deliberate pre-release edit: nobody has saved a design from this yet');
assert.equal(r.status, 0, r.stderr);
assert.deepEqual(JSON.parse(fs.readFileSync(lockFile, 'utf8')), lock, 'the lock now holds the real hash again');
const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
assert.equal(history.length, 1);
assert.deepEqual(history[0].moved, [victim], 'it names exactly what moved');
assert.match(history[0].reason, /pre-release/);
assert.match(history[0].date, /^\d{4}-\d{2}-\d{2}$/);

// the committed history exists and is readable (the seven refreshes before this rule, reconstructed)
const real = JSON.parse(fs.readFileSync('lib/design/templates/templates.lock-history.json', 'utf8'));
assert.ok(real.length >= 7 && real.every((e: any) => e.commit && e.reason && e.movedCount > 0), 'the committed history lists the earlier refreshes with a reason each');
assert.equal(real.filter((e: any) => e.disclosedInCommitMessage === false).length, 3, 'and marks the three that no commit message mentioned');

fs.rmSync(dir, { recursive: true, force: true });
console.log('design lock: ok');

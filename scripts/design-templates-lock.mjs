// scripts/design-templates-lock.mjs
//
// Records a hash of every template at its (key, version) into
// lib/design/templates/templates.lock.json. test-design-templates.ts fails
// when a hash moves, which is how "a version is immutable" is enforced:
// change a template = add a new version file and run this once.
//
//   node --experimental-strip-types --no-warnings scripts/design-templates-lock.mjs
//
// Why it matters: a saved design stores only (template key, version) and is re-drawn from the CURRENT
// definition, so editing a template without bumping its version silently changes every design a tenant has
// already saved from it.
//
// A deliberate edit of a version nobody has used yet is allowed, but it must be SAID:
//
//   ... design-templates-lock.mjs --force --reason "why, in a sentence"
//
// --force without a reason is refused, and every forced refresh is appended to templates.lock-history.json
// (date, reason, which ids moved) so the next audit can read it instead of reconstructing it from git. The
// first version of this script had a bare --force; it was used seven times and three of those (6995518,
// cb091bd, 954fb44, September 2026) were never mentioned in a commit message. The history file starts with
// those seven, marked "reconstructed", because nothing was recorded at the time.
//
// TEMPLATES_LOCK_DIR overrides where the two files live (the test uses it so it never touches the real ones).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TEMPLATES } from '../lib/design/templates/index.ts';
import { REELS } from '../lib/design/reels/index.ts';

const stable = (v) => JSON.stringify(v, Object.keys(v).sort());
const deep = (v) => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, deep(v[k])])) : v);
export const hashTemplate = (t) => createHash('sha256').update(JSON.stringify(deep(t))).digest('hex').slice(0, 16);

const dir = process.env.TEMPLATES_LOCK_DIR ? new URL('file:///' + process.env.TEMPLATES_LOCK_DIR.replace(/\\/g, '/').replace(/\/?$/, '/')) : new URL('../lib/design/templates/', import.meta.url);
const file = new URL('templates.lock.json', dir);
const historyFile = new URL('templates.lock-history.json', dir);

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const ri = argv.indexOf('--reason');
const reason = ri >= 0 ? String(argv[ri + 1] || '').trim() : '';

const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const next = {};
const moved = [];
for (const t of [...TEMPLATES, ...REELS]) {
  const id = `${t.key}@${t.version}`;
  const h = hashTemplate(t);
  if (existing[id] && existing[id] !== h) moved.push({ id, from: existing[id], to: h });
  next[id] = h;
}

if (moved.length && !force) {
  console.error(`${moved.length} template(s) changed but their version did not, e.g. ${moved[0].id}. Add a new version instead (or --force --reason "..." if this is a deliberate edit of a version nobody has saved a design from).`);
  process.exit(1);
}
if (moved.length && reason.length < 15) {
  console.error(`--force needs --reason "<why, in a sentence>" (at least 15 characters). ${moved.length} template(s) would change under their existing version, and every design saved from them changes with them. Nothing was written.`);
  process.exit(1);
}

if (moved.length) {
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : [];
  history.push({ date: new Date().toISOString().slice(0, 10), reason, recordedAt: 'at the time', movedCount: moved.length, moved: moved.map((m) => m.id) });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n');
}
fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
console.log('locked', Object.keys(next).length, 'templates', stable(next).length, 'bytes' + (moved.length ? `; ${moved.length} forced, recorded in templates.lock-history.json` : ''));

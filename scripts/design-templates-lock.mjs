// scripts/design-templates-lock.mjs
//
// Records a hash of every template at its (key, version) into
// lib/design/templates/templates.lock.json. test-design-templates.ts fails
// when a hash moves, which is how "a version is immutable" is enforced:
// change a template = add a new version file and run this once.
//
//   node --experimental-strip-types --no-warnings scripts/design-templates-lock.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TEMPLATES } from '../lib/design/templates/index.ts';
import { REELS } from '../lib/design/reels/index.ts';

const stable = (v) => JSON.stringify(v, Object.keys(v).sort());
const deep = (v) => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, deep(v[k])])) : v);
export const hashTemplate = (t) => createHash('sha256').update(JSON.stringify(deep(t))).digest('hex').slice(0, 16);

const file = new URL('../lib/design/templates/templates.lock.json', import.meta.url);
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const next = {};
for (const t of [...TEMPLATES, ...REELS]) {
  const id = `${t.key}@${t.version}`;
  const h = hashTemplate(t);
  if (existing[id] && existing[id] !== h && !process.argv.includes('--force')) {
    console.error(`${id} changed but its version did not. Add a new version instead (or --force if this is a deliberate pre-release edit).`);
    process.exit(1);
  }
  next[id] = h;
}
fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
console.log('locked', Object.keys(next).length, 'templates', stable(next).length, 'bytes');

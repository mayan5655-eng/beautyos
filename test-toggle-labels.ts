// Every on/off switch in the app has a name and says it is a switch. Found 2026-10-07 on the live Automations tab: nine <button>s with no
// text, no aria-label and no role, so a screen reader announced "button" nine times for nine different automations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const toggle = src.slice(src.indexOf('function Toggle('), src.indexOf('function AutoToggleRow('));
assert.ok(/role="switch"/.test(toggle) && /aria-checked=\{!!on\}/.test(toggle) && /aria-label=\{label \|\| undefined\}/.test(toggle), 'Toggle is a named switch with its state');
assert.ok(/type="button"/.test(toggle), 'and never submits a form');

const row = src.slice(src.indexOf('function AutoToggleRow('), src.indexOf('// Beauty Voice'));
assert.ok(/<Toggle [^>]*label=\{label\}/.test(row), 'AutoToggleRow names its switch with its own label');

// every place that uses <Toggle .../> directly passes a label
const uses = [...src.matchAll(/<Toggle\s[\s\S]*?\/>/g)].map((m) => m[0]);
assert.ok(uses.length >= 4, `found the Toggle uses (${uses.length})`);
for (const u of uses) assert.ok(/\blabel=/.test(u), `a Toggle without a label: ${u.slice(0, 90)}`);

// and every AutoToggleRow has a label
const rows = [...src.matchAll(/<AutoToggleRow\s[\s\S]*?(?=\/>|>\s*\n)/g)].map((m) => m[0]);
assert.ok(rows.length >= 10, `found the AutoToggleRow uses (${rows.length})`);
for (const r of rows) assert.ok(/\blabel=/.test(r), `an AutoToggleRow without a label: ${r.slice(0, 90)}`);

console.log('toggle labels: ok');

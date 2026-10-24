// RTL calendar arrows, and browsing templates no longer piles up untouched designs (2026-10-23 pass, E3 + G1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const dash = read('./app/beautyos.jsx').split('\n');
const btn = (label: string) => dash.find((l) => l.includes(`aria-label="${label}"`)) || '';
// In RTL the earlier day/week sits on the right and points right; the later one points left.
for (const [label, glyph] of [['שבוע קודם', '→'], ['שבוע הבא', '←'], ['יום קודם', '→'], ['יום הבא', '←']] as const) {
  const l = btn(label);
  assert.ok(l, `button ${label} exists`);
  assert.ok(l.trimEnd().endsWith(`>${glyph}</button>`), `${label} shows ${glyph}`);
}
assert.ok(btn('שבוע קודם').includes('d.getDate()-7') && btn('שבוע הבא').includes('d.getDate()+7'));
assert.ok(btn('יום קודם').includes('d.getDate()-1') && btn('יום הבא').includes('d.getDate()+1'));

const studio = read('./app/design/DesignStudio.jsx');
assert.ok(studio.includes('freshIds.current.add(data.design.id);'), 'a design opened from a template is marked fresh');
assert.equal((studio.match(/onBack=\{\(\) => leave\(open\)\}/g) || []).length, 2, 'both editors leave through leave()');
assert.ok(/const leave = \(d\) => \{[\s\S]*?if \(!d \|\| !freshIds\.current\.has\(d\.id\)\) return;[\s\S]*?method: 'DELETE'/.test(studio), 'only a fresh, never-saved design is removed');
assert.equal((studio.match(/onSaved=\{\(d\) => \{ kept\(d\);/g) || []).length, 2, 'saving keeps it');
for (const f of ['./app/design/DesignEditor.jsx', './app/design/ReelEditor.jsx']) assert.ok(read(f).includes('onSaved?.(await patch({ export_path: path }))'), `${f}: exporting keeps it`);
console.log('test-calendar-arrows-design-drafts: ok');

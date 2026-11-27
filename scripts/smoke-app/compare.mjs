// scripts/smoke-app/compare.mjs — are two browser runs (run.mjs) the same app?
//
//   node scripts/smoke-app/compare.mjs before.json after.json
//
// Three things are compared, step by step: the words on the page, the errors the browser reported, and the writes the app
// sent to the database. Exit code 1 when anything differs.
import fs from 'node:fs';
const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('usage: node scripts/smoke-app/compare.mjs <before.json> <after.json>'); process.exit(2); }
const a = JSON.parse(fs.readFileSync(fa, 'utf8')), b = JSON.parse(fs.readFileSync(fb, 'utf8'));
let bad = 0;
const diff = [];
for (const x of a.out) { const y = b.out.find((o) => o.name === x.name); if (!y || x.text !== y.text || x.ok !== y.ok) diff.push(`${x.name}: ${x.ok ? 'ok' : 'click failed'} / ${y ? (y.ok ? 'ok' : 'click failed') : 'missing'}, ${x.text.length} / ${y ? y.text.length : 0} characters`); }
console.log(`steps ${a.out.length} | same words and same click result: ${a.out.length - diff.length} | different: ${diff.length}`);
diff.forEach((d) => console.log('  ' + d)); bad += diff.length;
const sig = (r) => { const m = new Set(); for (const e of r.errors) m.add(`${e.step} | ${e.kind} | ${e.text.split('\n').slice(0, 3).join(' / ').replace(/chunks\/[^\s)]+/g, 'chunk').slice(0, 220)}`); return m; };
const sa = sig(a), sb = sig(b);
const onlyA = [...sa].filter((k) => !sb.has(k)), onlyB = [...sb].filter((k) => !sa.has(k));
console.log(`browser errors: ${sa.size} / ${sb.size} | only before: ${onlyA.length} | only after: ${onlyB.length}`);
onlyA.forEach((k) => console.log('  only before: ' + k)); onlyB.forEach((k) => console.log('  only after : ' + k)); bad += onlyA.length + onlyB.length;
const w = (r) => JSON.stringify((r.writes || []).map((x) => `${x.step} ${x.m} ${x.table} [${x.q}] ${x.keys}`));
const sameWrites = w(a) === w(b);
console.log(`database writes: ${(a.writes || []).length} / ${(b.writes || []).length} | same list, same order: ${sameWrites}`); if (!sameWrites) bad++;
const failed = b.out.filter((o) => !o.ok).map((o) => `${o.name} (${o.note})`);
if (failed.length) console.log('clicks that found nothing to press (after): ' + failed.join(', '));
console.log(bad ? 'DIFFERENT' : 'SAME');
process.exit(bad ? 1 : 0);

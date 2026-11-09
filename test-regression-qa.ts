// Regression QA of main after #32-#34 (2026-11-09). One check per bug found by walking the app on a fresh tenant:
// pure functions where the rule lives in lib/, source checks where it is wiring, so a later edit cannot quietly undo one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore: plain .js module
import { parseImportGrid, buildApptRows, buildServiceRows, withServiceDefaults, countExistingServices, IMPORT_SPEC } from './lib/importMapping.js';
import { HELP_SECTIONS } from './lib/helpSections.ts';

const rd = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const app = rd('app/beautyos.jsx');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const noEmDash = (s: string, what: string) => assert.ok(!s.includes('—'), `em dash in ${what}: ${s}`);

const SERVICES = [
  { name: 'טיפול פנים קלאסי', price: 260, duration: 60 },
  { name: 'עיצוב גבות', price: 120, duration: 30 },
];

// ── 1. appointments import: duration and price from her own treatment ──────
ok('appointments import: a row with no duration or price takes her treatment\'s own, not 60 min and ₪0', () => {
  const grid = parseImportGrid('תאריך\tשעה\tשם\tטלפון\tטיפול\n20/11/2026\t10:30\tמיכל לוי\t0521111111\tעיצוב גבות\n20/11/2026\t12:00\tדנה כהן\t0522222222\tטיפול לא ברשימה');
  const built = buildApptRows(grid, ['date', 'time', 'name', 'phone', 'service'], true, '2026-11-09', 600, new Set(SERVICES.map((s) => s.name)));
  assert.equal(built.rows.length, 2);
  // the raw builder still has the old defaults and says the paste gave neither value
  assert.equal(built.rows[0].duration, 60); assert.equal(built.rows[0].price, 0);
  assert.equal(built.rows[0].durationGiven, false); assert.equal(built.rows[0].priceGiven, false);
  const rows = withServiceDefaults(built.rows, SERVICES);
  assert.equal(rows[0].duration, 30, 'eyebrows last 30 minutes, not an hour');
  assert.equal(rows[0].price, 120, 'and cost ₪120, not ₪0');
  // a treatment that is not on her list keeps the defaults
  assert.equal(rows[1].duration, 60); assert.equal(rows[1].price, 0);
});

ok('appointments import: a duration or price the paste DID give always wins, even ₪0', () => {
  const grid = parseImportGrid('20/11/2026\t10:30\tמיכל לוי\t0521111111\tעיצוב גבות\t45\t0');
  const built = buildApptRows(grid, ['date', 'time', 'name', 'phone', 'service', 'duration', 'price'], false, '2026-11-09', 600, new Set());
  assert.equal(built.rows[0].durationGiven, true); assert.equal(built.rows[0].priceGiven, true);
  const [r] = withServiceDefaults(built.rows, SERVICES);
  assert.equal(r.duration, 45);
  assert.equal(r.price, 0, 'a free visit written in her old diary stays free');
  // service names are matched trimmed; a service with no usable duration does not erase the default
  const g2 = parseImportGrid('20/11/2026\t10:30\tדנה\t0522222222\t  עיצוב גבות  ');
  const b2 = buildApptRows(g2, ['date', 'time', 'name', 'phone', 'service'], false, '2026-11-09', 600, new Set());
  assert.equal(withServiceDefaults(b2.rows, SERVICES)[0].duration, 30);
  assert.equal(withServiceDefaults(b2.rows, [{ name: 'עיצוב גבות', price: null, duration: 0 }])[0].duration, 60);
  assert.deepEqual(withServiceDefaults([], SERVICES), []);
  assert.deepEqual(withServiceDefaults(b2.rows, null).length, 1);
});

ok('appointments import wiring: the preview AND the write both use her treatment, before the overlap check', () => {
  const builder = app.slice(app.indexOf('const importBuilder = importTarget === "appts"'), app.indexOf('const importBuilder = importTarget === "appts"') + 300);
  assert.ok(builder.includes('return { ...b, rows: withServiceDefaults(b.rows, services) }'), 'the preview fills from her treatments');
  const fn = app.slice(app.indexOf('const importAppointments = async'), app.indexOf('const importAppointments = async') + 9000);
  const fill = fn.indexOf('withServiceDefaults(built0.rows, services)');
  assert.ok(fill > 0, 'importAppointments fills from her treatments');
  assert.ok(fill < fn.indexOf('clashesWith('), 'before the overlap check reads the duration');
});

// ── 2. services import: its own copy, and a preview that counts names already on her list ──
ok('services import: names already on her list (or repeated) are counted in the preview', () => {
  const grid = parseImportGrid('שם\tמחיר\tמשך\nניקוי פנים עמוק\t320\t75\nטיפול פנים קלאסי\t260\t60\nניקוי פנים עמוק\t300\t75\n');
  const { rows } = buildServiceRows(grid, ['name', 'price', 'duration'], true);
  assert.equal(rows.length, 3);
  assert.equal(countExistingServices(rows, SERVICES), 2, 'one already on her list, one repeated in the paste');
  assert.equal(countExistingServices(rows, []), 1);
  assert.equal(countExistingServices([], SERVICES), 0);
  assert.ok(app.includes('importTarget==="services" ? countExistingServices(built.rows, services)'), 'the preview counts them');
});

ok('import copy: each import says its own thing (no "זוהו לפי טלפון" for treatments, no "לא לקוחה" for a price list)', () => {
  for (const k of ['clients', 'services', 'appts']) {
    const s = (IMPORT_SPEC as Record<string, Record<string, unknown>>)[k] as Record<string, string>;
    for (const f of ['headerNote', 'existingNote', 'dupesNote', 'failedNote']) {
      assert.ok(typeof s[f] === 'string' && s[f].length > 5, `${k}.${f}`);
      noEmDash(s[f], `${k}.${f}`);
    }
  }
  assert.ok(!/טלפון/.test(IMPORT_SPEC.services.dupesNote));
  assert.ok(!/לקוח/.test(IMPORT_SPEC.services.headerNote + IMPORT_SPEC.services.failedNote + IMPORT_SPEC.services.existingNote));
  assert.ok(!/לקוח/.test(IMPORT_SPEC.appts.failedNote));
  // the clients import keeps exactly what it said before
  assert.equal(IMPORT_SPEC.clients.dupesNote, 'דולגו, כבר קיימות אצלך (זוהו לפי טלפון)');
  assert.equal(IMPORT_SPEC.clients.headerNote, 'השורה הראשונה היא כותרות (לא לקוחה)');
  // and the wizard reads them from the spec, no hard-coded client wording left
  for (const k of ['headerNote', 'existingNote', 'dupesNote', 'failedNote']) assert.ok(app.includes(`{importSpec.${k}}`), k);
  assert.ok(!app.includes('השורה הראשונה היא כותרות (לא לקוחה)'));
  assert.ok(!app.includes('דולגו, כבר קיימות אצלך (זוהו לפי טלפון)'));
  assert.ok(!app.includes('שאר הלקוחות נוספו בהצלחה'));
});

// ── 3. Settings > תשלומים: two deposits at once are said out loud ───────────
ok('payments settings: a direct deposit AND a Grow deposit policy show a warning about two deposits', () => {
  const ps = rd('app/PaymentsSettings.jsx');
  const i = ps.indexOf('data-testid="deposit-both-warning"');
  assert.ok(i > 0);
  assert.match(ps, /\{mode === 'deposit' && amount > 0 && \(\s*\n?\s*<p data-testid="deposit-both-warning"/);
  const text = ps.slice(i, ps.indexOf('</p>', i));
  assert.match(text, /שתי מקדמות/);
  assert.match(text, /דורש מקדמה/, 'the Grow deposit applies only to treatments marked as needing one');
  noEmDash(text, 'two-deposits warning');
  // inside the connected-to-Grow block only
  assert.ok(i > ps.indexOf('{loaded && connected && ('));
});

// ── 4. help: the new tab is described ──────────────────────────────────────
ok('help: Settings lists the new תשלומים tab', () => {
  const settings = HELP_SECTIONS.find((s) => s.key === 'settings');
  assert.ok(settings);
  const line = settings!.body.find((l) => l.includes('**תשלומים**'));
  assert.ok(line, 'a line for the תשלומים tab');
  assert.match(line!, /מקדמה/);
  noEmDash(line!, 'help line');
});

console.log(`\n${n} checks passed`);

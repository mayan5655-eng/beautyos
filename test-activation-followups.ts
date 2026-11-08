// Activation follow-ups (2026-11), after "3 צעדים לתור הראשון":
//   1. the tour waits for the 3-step card and is short for a business that came through it
//   2. a .vcf (vCard) contacts file goes into the clients import (the iPhone way in), with a how-to
//   3. "דורש תשומת לב" is not on Today while the 3-step card is
//   4. the admin panel's "צעדים" column (X/3)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tourMayStart, shortTourSteps, tourStepsFor, tourOnNavigate, tourResumeStep, SHORT_TOUR_IDS } from './lib/tourFlow.js';
import { showAttentionOnToday, firstBookingScore, firstBookingView, firstBookingSteps } from './lib/firstBooking.js';
import { parseVCards, pickPhone, vcardImportText, isVcardFile, cleanTel, MAX_TEL_LENGTH } from './lib/vcard.js';
import { parseImportGrid, detectHeaderRow, guessColumns, buildImportRows, importPhoneKey } from './lib/importMapping.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const app = rd('app/beautyos.jsx');
const fixture = (f: string) => readFileSync(`test-fixtures/vcard/${f}`, 'utf8');

// the real tour steps, read from the app
const block = app.slice(app.indexOf('const TOUR_STEPS = ['), app.indexOf('];', app.indexOf('const TOUR_STEPS = [')));
const STEPS = block.split(/\{\s*id:"/).slice(1).map((chunk) => ({
  id: chunk.slice(0, chunk.indexOf('"')),
  tab: /\btab:"([^"]+)"/.exec(chunk)?.[1],
  requiresSettings: /requiresSettings:true/.test(chunk),
  cta: /\bcta:"([^"]+)"/.exec(chunk)?.[1],
}));

// ── 1. The tour ──────────────────────────────────────────────────────────────
ok('the tour never starts while the 3-step card is on screen or still being decided', () => {
  for (const v of ['active', 'celebrate', 'pending']) assert.equal(tourMayStart(v), false, v);
  assert.equal(tourMayStart('hidden'), true, 'finished, or a business that never needed the card');
  assert.equal(tourMayStart('off'), true, 'the card switched off: the tour exactly as before');
  // a brand-new business: the card is active, so no tour on day 1
  assert.equal(tourMayStart(firstBookingView({ steps: firstBookingSteps({}), record: {} })), false);
  // all three done and the completion line already seen: the tour may start
  assert.equal(tourMayStart(firstBookingView({ steps: firstBookingSteps({ services: [{}], clients: [{}], linkShared: true }), record: { shown_at: 'a', done_at: 'b' } })), true);
});

ok('wired: the trigger waits on fbView, after the card is decided, and every tour use reads the tour she gets', () => {
  const trig = app.slice(app.indexOf('if (tourTriggeredRef.current) return;'), app.indexOf('}, [settings?.tenant_id, settings?.automations, showImportModal, showImportHub, fbView, tourSteps]);'));
  assert.ok(trig.length > 0 && trig.length < 1500, 'the trigger effect, with fbView in its deps');
  assert.match(trig, /if \(showImportModal \|\| showImportHub\) return;[\s\S]*if \(!tourMayStart\(fbView\)\) return;[\s\S]*tourTriggeredRef\.current = true;/, 'the gate comes before the once-only latch, so it starts later instead of never');
  assert.ok(app.indexOf('const fbView = ') < app.indexOf('if (!tourMayStart(fbView)) return;'), 'declared after fbView (no read before init)');
  assert.match(app, /const tourSteps = useMemo\(\(\) => tourStepsFor\(TOUR_STEPS, fbRecord\)/);
  assert.match(app, /steps=\{tourSteps\}/);
  assert.match(app, /const nextStep = tourSteps\[next\];/);
  assert.equal((app.match(/\bTOUR_STEPS\b/g) || []).length, 2, 'TOUR_STEPS is declared once and read only through tourStepsFor');
});

ok('the short tour: היום, תשלומים, יומן, ending on the calendar with the real "book" action', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['dashboard', 'calendar', 'clients', 'cashier', 'content', 'booking-link'], 'the full six are kept');
  const short = shortTourSteps(STEPS);
  assert.deepEqual(short.map((s) => s.id), SHORT_TOUR_IDS);
  assert.deepEqual(short.map((s) => s.id), ['dashboard', 'cashier', 'calendar']);
  assert.ok(short.every((s) => !s.requiresSettings), 'no step inside Settings: nothing can strand');
  assert.equal(short[short.length - 1].cta, 'קביעת תור ✦', 'the last button opens a new appointment (handleTourFinish)');
  assert.equal(STEPS.find((s) => s.id === 'calendar')!.cta, undefined, 'the full tour is untouched');
  // who gets which
  assert.equal(tourStepsFor(STEPS, {}).length, 6);
  assert.equal(tourStepsFor(STEPS, null).length, 6);
  assert.equal(tourStepsFor(STEPS, { shown_at: 'x' }).length, 3);
  assert.equal(tourStepsFor(STEPS, { done_at: 'y' }).length, 3);
  // it still follows her, and ends where it has no step
  assert.deepEqual(tourOnNavigate({ steps: short, stepIndex: 0, prevTab: 'dashboard', tab: 'calendar', showSettings: false }), { type: 'jump', step: 2 });
  assert.deepEqual(tourOnNavigate({ steps: short, stepIndex: 0, prevTab: 'dashboard', tab: 'clients', showSettings: false }), { type: 'end' });
  assert.equal(tourResumeStep(5, short), null, 'a long-tour position past the short one ends it, never a blank card');
  assert.equal(tourResumeStep(1, short), 1);
  const hebrew = rd('lib/tourFlow.js').split('\n').filter((l) => /[֐-׿]/.test(l) && !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(hebrew, /[–—]/);
});

// ── 2. vCard import ──────────────────────────────────────────────────────────
ok('iPhone vCard 3.0: item groups, pref, folded lines, an ORG-only card, a repeat, Hebrew', () => {
  const cards = parseVCards(fixture('iphone-3.0.vcf'));
  assert.equal(cards.length, 8);
  assert.equal(cards[0].name, 'מיכל כהן');
  assert.deepEqual(cards[0].phones.map((p) => p.value), ['+972 52-111-1111', '03-555-1234'], 'item1.TEL is a TEL');
  assert.equal(cards[2].name, 'סטודיו לק ג;ל', 'no FN: the ORG, with its escaped ; restored');
  assert.equal(cards[5].name, 'נועה בת שבע ישראלי', 'a folded FN is joined');
  assert.equal(cards[5].phones[0].value, '050 666 6666', 'a folded TEL is joined');
  const r = vcardImportText(fixture('iphone-3.0.vcf'));
  assert.equal(r.count, 6); assert.equal(r.repeated, 1, 'the same phone twice in one file is kept once'); assert.equal(r.empty, 1);
  const lines = r.text.split('\n');
  assert.equal(lines[0], 'שם\tטלפון\tהערות');
  assert.ok(lines.includes('מיכל כהן\t0521111111\tטלפון נוסף: 035551234'), 'Israeli mobile in her format, the landline kept as a note');
  assert.ok(lines.includes('דנה לוי\t0532222222\tטלפון נוסף: 0543333333'), 'the preferred mobile wins over another mobile');
  assert.ok(lines.includes('Jane Smith\t+447700900123\t'), 'a foreign number is kept as written');
  assert.ok(lines.includes('רק שם בלי טלפון\t\t'), 'a name with no phone is still a client (as in a paste)');
});

ok('Android vCard 2.1: quoted-printable with soft breaks, windows-1255 Hebrew, BASE64, bare types', () => {
  const cards = parseVCards(fixture('android-2.1.vcf'));
  assert.deepEqual(cards.map((c) => c.name), ['דנה כהן', 'רונית', 'שירה לוי']);
  assert.deepEqual(cards[0].phones[0].types, ['cell', 'pref'], 'TEL;CELL;PREF');
  const r = vcardImportText(fixture('android-2.1.vcf'));
  assert.ok(r.text.includes('רונית\t0587777777\tטלפון נוסף: 036123456'), '00972 mobile chosen over the WORK landline listed first');
  assert.ok(r.text.includes('דנה כהן\t0501234567\tטלפון נוסף: 035551234'));
});

ok('vCard 4.0: tel: URIs, PREF=1, quoted TYPE lists, extensions, no mobile at all', () => {
  const cards = parseVCards(fixture('rfc-4.0.vcf'));
  assert.deepEqual(cards[0].phones[0], { value: '+972-55-999-9999', types: ['pref', 'voice', 'cell'] });
  assert.equal(cards[0].phones[1].value, '+972-3-555-0000', 'the ;ext= is dropped');
  const r = vcardImportText(fixture('rfc-4.0.vcf'));
  assert.ok(r.text.includes('יעל אברהם\t0559999999\tטלפון נוסף: 035550000'));
  assert.ok(r.text.includes('אורית שמש\t025551111\tטלפון נוסף: 045552222'), 'no mobile: the first number, the rest noted');
});

ok('pickPhone and edge cases: empty input, no cards, a junk file', () => {
  assert.deepEqual(pickPhone([]), { phone: '', others: [] });
  assert.deepEqual(pickPhone([{ value: '03-1234567', types: ['pref'] }, { value: '054-1234567', types: [] }]), { phone: '0541234567', others: ['031234567'] });
  assert.equal(parseVCards('').length, 0);
  assert.equal(vcardImportText('שם, טלפון\nדנה, 050').count, 0, 'not a vCard: nothing, so the screen says so');
  assert.equal(vcardImportText('BEGIN:VCARD\nVERSION:3.0\nFN:בלי סוף').count, 0, 'an unterminated card is not half-imported');
  assert.equal(isVcardFile({ name: 'Contacts.vcf', type: '' }), true);
  assert.equal(isVcardFile({ name: 'x', type: 'text/x-vcard' }), true);
  assert.equal(isVcardFile({ name: 'list.csv', type: 'text/csv' }), false);
});

ok('the vCard text goes through the existing mapping, preview and dedupe unchanged', () => {
  const { text } = vcardImportText(fixture('iphone-3.0.vcf'));
  const grid = parseImportGrid(text);
  assert.equal(detectHeaderRow(grid.rows), true, 'the header row is recognised');
  const cols = guessColumns(grid.rows, true);
  assert.deepEqual(cols, ['name', 'phone', 'notes']);
  const built = buildImportRows(grid, cols, true);
  assert.equal(built.rows.length, 6);
  assert.deepEqual(built.rows[0], { name: 'מיכל כהן', phone: '0521111111', notes: 'טלפון נוסף: 035551234' });
  // an existing client stored the way online booking stores her (972...) is the same person
  const existing = new Set(['972521111111'].map(importPhoneKey));
  assert.equal((built.rows as { phone?: string }[]).filter((r) => r.phone && existing.has(importPhoneKey(r.phone))).length, 1, 'she is skipped as already on file');
});

ok('wired: the vCard button is in the clients import paste step, with the iPhone how-to', () => {
  assert.match(app, /import \{ vcardImportText, isVcardFile, VCARD_ACCEPT \} from "@\/lib\/vcard";/);
  assert.match(app, /<input type="file" accept=\{VCARD_ACCEPT\} onChange=\{importVcardFile\}/);
  assert.match(app, /const importVcardFile = async \(e\) => \{[\s\S]{0,1200}setImportText\(r\.text\);\n\s*goToImportMapping\(r\.text\);/, 'straight to the mapping step');
  assert.match(app, /const goToImportMapping = \(text\) => \{\n\s*const grid = parseImportGrid\(typeof text === "string" \? text : importText\);/);
  // it sits inside the clients-only block of the paste stage, not for services or appointments
  const paste = app.slice(app.indexOf('{importTarget==="clients"&&(<>'), app.indexOf('{importSpec.rowLabel}'));
  assert.ok(paste.includes('data-testid="import-vcf"') && paste.includes('data-testid="import-vcf-howto"'));
  const howto = paste.slice(paste.indexOf('import-vcf-howto'));
  for (const t of ['איך שולחים אנשי קשר מהאייפון?', 'שיתוף איש קשר', 'שמירה בקבצים', 'בחירת קובץ אנשי קשר']) assert.ok(howto.includes(t), t);
  // the Android contact picker is still there, still only where it can work
  assert.match(paste, /navigator\.contacts&&typeof navigator\.contacts\.select==="function"&&<button onClick=\{pickFromContacts\}/);
  const hebrew = paste.split('\n').filter((l) => /[֐-׿]/.test(l) && !l.includes('{/*')).join('\n');
  assert.doesNotMatch(hebrew, /[–—]/, 'no em or en dashes in the new copy');
  assert.doesNotMatch(rd('lib/vcard.js').split('\n').filter((l) => /[֐-׿]/.test(l) && !l.trim().startsWith('//')).join('\n'), /[–—]/);
  assert.ok(rd('app/FirstBookingCard.jsx').includes('בחרי קובץ אנשי קשר מהטלפון'), 'the card points at it too');
});

// ── 3. "דורש תשומת לב" ───────────────────────────────────────────────────────
ok('"דורש תשומת לב" steps aside while the 3-step card is on Today, and only then', () => {
  assert.equal(showAttentionOnToday('active'), false);
  assert.equal(showAttentionOnToday('celebrate'), false);
  assert.equal(showAttentionOnToday('hidden'), true);
  assert.equal(showAttentionOnToday('off'), true, 'the card switched off: as before');
  assert.equal(showAttentionOnToday('pending'), true, 'still deciding: kept, so a failed history load still shows its line');
  assert.match(app, /const attentionOnToday = showAttentionOnToday\(fbView\);/);
  assert.match(app, /\{attentionOnToday&&<div className="fm-in glass-card card-boxed" data-testid="needs-attention"/);
  // the conditional wraps the whole card: it closes right after the list's IIFE
  const card = app.slice(app.indexOf('data-testid="needs-attention"'));
  assert.match(card, /^[\s\S]*?הכל מטופל[\s\S]*?\}\)\(\)\}\n <\/div>\}/);
});

// ── 4. Admin "צעדים" ─────────────────────────────────────────────────────────
ok('firstBookingScore: X of 3 from counts, by the card\'s own rules; unknown is null, not 0', () => {
  assert.equal(firstBookingScore({ hasActiveService: false, clientCount: 0, appointmentCount: 0 }), 0);
  assert.equal(firstBookingScore({ hasActiveService: true, clientCount: 0, appointmentCount: 0 }), 1);
  assert.equal(firstBookingScore({ hasActiveService: true, clientCount: 3, appointmentCount: 0 }), 2);
  assert.equal(firstBookingScore({ hasActiveService: true, clientCount: 3, appointmentCount: 0, linkSharedAt: '2026-11-01' }), 3);
  assert.equal(firstBookingScore({ hasActiveService: false, clientCount: 0, appointmentCount: 2 }), 1, 'any appointment counts as the link step');
  assert.equal(firstBookingScore({ hasActiveService: true, clientCount: null, appointmentCount: 0 }), null);
  assert.equal(firstBookingScore({ hasActiveService: null, clientCount: 1, appointmentCount: 0 }), null);
});

ok('admin: the column reads only tenant_id and one timestamp, and shows X/3 or a dash', () => {
  const page = rd('app/dashboard/admin/page.tsx');
  assert.match(page, /from\('service_prices'\)\.select\('tenant_id'\)\.or\('active\.is\.null,active\.eq\.true'\)/);
  assert.match(page, /from\('settings'\)\.select\('tenant_id, link_shared_at:automations->>link_shared_at'\)/);
  assert.doesNotMatch(page.slice(page.indexOf('async function loadFirstSteps'), page.indexOf('export default')), /from\('(clients|appointments)'\)/, 'no client-bearing table');
  assert.match(page, /const steps = await loadFirstSteps\(db\)/, 'only on the rich path, where the counts exist');
  const ui = rd('app/dashboard/admin/AdminClient.tsx');
  assert.ok(ui.includes('>צעדים</th>'));
  assert.match(ui, /tenant\.first_steps == null \? '—' :[\s\S]{0,200}\{tenant\.first_steps\}\/3/);
});

// Vercel review 2026-11-05: a large folded contact PHOTO must not make parsing quadratic (it used to re-scan and re-copy the growing
// line on every folded row). About 6 MB of photo in 75-character rows, the shape iPhone writes, parses in well under a second.
await ok('a vCard with a huge folded photo parses fast, keeps the contact and drops the photo', () => {
  const row = ' ' + 'A'.repeat(74);
  const photo = 'PHOTO;ENCODING=b;TYPE=JPEG:' + 'B'.repeat(48) + '\n' + Array.from({ length: 80000 }, () => row).join('\n');
  const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:דנה כהן', 'N:כהן;דנה;;;', photo, 'TEL;TYPE=CELL:054-123-4567', 'END:VCARD'].join('\n');
  const t0 = Date.now();
  const cards = parseVCards(vcf);
  const ms = Date.now() - t0;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].phones.length, 1, 'the TEL after the photo is still read');
  assert.ok(ms < 1500, `parsed in ${ms} ms`);
  assert.ok(!JSON.stringify(cards[0]).includes('AAAA'), 'the photo bytes are not kept');
});

await ok('vCard: a crafted TEL with a long run of spaces is dropped fast, and real extensions still clean', () => {
  assert.equal(cleanTel('tel:+972-52-123-4567;ext=12'), '+972-52-123-4567');
  assert.equal(cleanTel('052-1234567 x 9'), '052-1234567');
  assert.equal(cleanTel('052-1234567   '), '052-1234567');
  assert.equal(cleanTel('1' + ' '.repeat(MAX_TEL_LENGTH)), '', 'too long: not a phone');
  const evil = 'BEGIN:VCARD\nVERSION:3.0\nFN:x\nTEL:1' + ' '.repeat(200_000) + 'a\nEND:VCARD\n';
  const t0 = Date.now();
  const cards = parseVCards(evil.repeat(20));
  assert.ok(Date.now() - t0 < 2000, `parsed in ${Date.now() - t0}ms`);
  assert.equal(cards.length, 20);
  assert.ok(cards.every((c) => c.phones.length === 0), 'the crafted value is not taken as a phone');
});

console.log(`${n} passed`);

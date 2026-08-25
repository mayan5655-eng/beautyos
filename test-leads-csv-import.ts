// test-leads-csv-import.ts
//
// Tests for Stage 1 of the CSV lead importer. Run with plain node - Node 24
// strips TypeScript types natively, so there is no build step and no test
// dependency:
//
//     node test-leads-csv-import.ts
//
// READ-ONLY. No database, no network. The Claude client is INJECTED, which is
// the whole reason the fallback is testable: the last group below drives
// proposeMapping with clients that fail in four different ways and asserts it
// still produces a usable mapping and says it fell back.

import {
  decodeCsv,
  parseCsv,
  detectDelimiter,
  maskValue,
  normalizeIsraeliMobile,
} from './lib/leads/csvImport.ts';
import { proposeMapping, fallbackMapping } from './lib/leads/mapHeaders.ts';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); failed++; }
}
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? '\n          ' + detail : ''}`); failed++; }
}

// ── 1. Encoding ─────────────────────────────────────────────────────────────
console.log('\n[1] Encoding — Hebrew CSVs from Israeli Excel are often windows-1255');

// "שם,טלפון" encoded as windows-1255
const cp1255 = new Uint8Array([0xF9, 0xED, 0x2C, 0xE8, 0xEC, 0xF4, 0xE5, 0xEF]);
const d1 = decodeCsv(cp1255);
check('windows-1255 decodes to real Hebrew', d1.text, 'שם,טלפון');
check('  and reports the encoding it used', d1.encoding, 'windows-1255');

const utf8 = new TextEncoder().encode('שם,טלפון');
const d2 = decodeCsv(utf8);
check('utf-8 still decodes as utf-8', d2.text, 'שם,טלפון');
check('  and is not misreported', d2.encoding, 'utf-8');

const withBom = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('a,b')]);
check('BOM is stripped', decodeCsv(withBom).text, 'a,b');

// ── 2. Parsing ──────────────────────────────────────────────────────────────
console.log('\n[2] Parsing — the three things a naive split gets wrong');

check('delimiter: semicolon wins on a Hebrew export', detectDelimiter('שם;טלפון;אימייל'), ';');
check('delimiter: comma when it dominates', detectDelimiter('a,b,c'), ',');
check('delimiter: a comma inside quotes does not vote',
  detectDelimiter('"Cohen, Dana";phone'), ';');

const quoted = parseCsv('name,notes\n"Cohen, Dana","said ""yes"" twice"\n');
check('a delimiter inside quotes is not a column break', quoted.rows[0], ['Cohen, Dana', 'said "yes" twice']);

const multiline = parseCsv('name,notes\n"Dana","line one\nline two"\n');
check('a newline inside quotes is not a row break', multiline.rows.length, 1);
check('  and the field keeps its newline', multiline.rows[0][1], 'line one\nline two');

const crlf = parseCsv('a,b\r\n1,2\r\n\r\n');
check('CRLF handled, blank trailing lines dropped', crlf.rows, [['1', '2']]);
check('headers are trimmed', parseCsv(' a , b \n1,2').headers, ['a', 'b']);

// ── 3. Masking ──────────────────────────────────────────────────────────────
console.log('\n[3] Masking — shape preserved, nobody identifiable');

check('phone keeps its shape', maskValue('054-123-4567'), '999-999-9999');
check('hebrew name stays hebrew', maskValue('דנה כהן'), 'אאא אאא');
check('email keeps @ and dot', maskValue('Dana.C@gmail.com'), 'Xxxx.X@xxxxx.xxx');
ok('no original digit survives', !/[0-9]/.test(maskValue('0541234567').replace(/9/g, '')));

// ── 4. Phone normalisation ──────────────────────────────────────────────────
console.log('\n[4] Phone — this value becomes external_id, so it must be strict');

check('local mobile', normalizeIsraeliMobile('054-1234567'), { ok: true, e164: '972541234567' });
check('spaces and plus', normalizeIsraeliMobile('+972 54 123 4567'), { ok: true, e164: '972541234567' });
check('00 prefix', normalizeIsraeliMobile('00972541234567'), { ok: true, e164: '972541234567' });
check('bare 9-digit mobile', normalizeIsraeliMobile('541234567'), { ok: true, e164: '972541234567' });

// The dangerous ones. An empty external_id is NOT null, and two of them in the
// same (tenant_id, source) would COLLIDE and upsert into each other.
check('empty is refused', normalizeIsraeliMobile(''), { ok: false, reason: 'empty' });
check('null is refused', normalizeIsraeliMobile(null), { ok: false, reason: 'empty' });
check('text is refused', normalizeIsraeliMobile('לא ידוע'), { ok: false, reason: 'no_digits' });
check('landline is refused', normalizeIsraeliMobile('03-1234567'), { ok: false, reason: 'not_israeli_mobile' });
check('too short is refused', normalizeIsraeliMobile('05412'), { ok: false, reason: 'not_israeli_mobile' });
check('foreign number is refused', normalizeIsraeliMobile('+1 415 555 0100'), { ok: false, reason: 'not_israeli_mobile' });

const keys = ['054-1234567', '+972541234567', '0541234567']
  .map((p) => normalizeIsraeliMobile(p))
  .map((r) => (r.ok ? r.e164 : 'x'));
check('the same mobile written three ways yields one key', new Set(keys).size, 1);

// ── 5. THE FALLBACK, exercised rather than assumed ──────────────────────────
console.log('\n[5] Fallback — proven to work when Claude is unavailable');

const HEADERS = ['שם מלא', 'טלפון נייד', 'אימייל', 'מאיפה הגיעה', 'הערות', 'תאריך'];
const SAMPLES = [['אאא אאא', '999-9999999', 'xxxx@xxxxx.xxx', 'אאאאאאא', 'אאאא', '99/99/9999']];

// Four ways the call can fail, all of which must land on the same safe path.
const failingClients: Array<[string, unknown]> = [
  ['network error', { messages: { create: async () => { throw new Error('fetch failed'); } } }],
  ['rate limited', { messages: { create: async () => { const e: any = new Error('429'); e.status = 429; throw e; } } }],
  ['no text block', { messages: { create: async () => ({ content: [{ type: 'thinking', thinking: '' }] }) } }],
  ['unparseable body', { messages: { create: async () => ({ content: [{ type: 'text', text: 'not json at all' }] }) } }],
];

for (const [label, client] of failingClients) {
  const p = await proposeMapping(HEADERS, SAMPLES, { client: client as any });
  ok(`${label}: falls back rather than throwing`, p.source === 'fallback', `source was ${p.source}`);
  ok(`${label}: still finds the phone column`, p.mapping.phone.csvColumn === 'טלפון נייד',
    `got ${p.mapping.phone.csvColumn}`);
  ok(`${label}: states why it fell back`, typeof p.fallbackReason === 'string' && p.fallbackReason.length > 0);
}

const fb = fallbackMapping(HEADERS, 'test');
check('fallback maps name', fb.mapping.name.csvColumn, 'שם מלא');
check('fallback maps email', fb.mapping.email.csvColumn, 'אימייל');
check('fallback maps source', fb.mapping.source.csvColumn, 'מאיפה הגיעה');
check('fallback maps notes', fb.mapping.notes.csvColumn, 'הערות');
check('fallback leaves an unknown column unmapped', fb.unmappedColumns, ['תאריך']);
ok('fallback confidence is honest, not 1.0',
  Object.values(fb.mapping).every((m) => m.confidence <= 0.5));

const noMatch = fallbackMapping(['col1', 'col2'], 'test');
check('nothing matches -> nulls, not guesses', noMatch.mapping.phone.csvColumn, null);

// A column is never claimed twice, which would silently drop data.
const dupes = fallbackMapping(['טלפון', 'נייד'], 'test');
const claimed = Object.values(dupes.mapping).map((m) => m.csvColumn).filter(Boolean);
check('no column is mapped to two fields', claimed.length, new Set(claimed).size);

// A missing API key must fall back too, not throw.
const savedKey = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
const noKey = await proposeMapping(HEADERS, SAMPLES);
ok('no API key: falls back instead of throwing', noKey.source === 'fallback');
ok('  and says so', /ANTHROPIC_API_KEY/.test(noKey.fallbackReason ?? ''));
if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;

console.log('\n' + '='.repeat(66));
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(66));
process.exitCode = failed ? 1 : 0;

// ── 6. buildRows — the preview and the eventual insert share this ───────────
console.log('\n[6] buildRows — preview counts must equal what Stage 3 would write');

const { buildRows, IMPORT_STATUS, IMPORT_SOURCE } = await import('./lib/leads/buildRows.ts');

const H2 = ['שם', 'נייד', 'אימייל', 'מאיפה', 'הערות'];
const R2 = [
  ['דנה',  '054-1234567', 'd@x.com',  'אינסטגרם', 'פילינג'],
  ['מיכל', '0529876543',  'm@x.com',  'חברה',     ''],
  ['רונית','לא ידוע',      'r@x.com',  '',         ''],   // bad_phone
  ['שירה', '',            's@x.com',  '',         ''],   // no_phone
  ['כפולה','+972541234567','k@x.com',  '',         ''],   // duplicate of row 2
  ['נועה', '03-1234567',  'n@x.com',  '',         ''],   // landline -> bad_phone
];
const M2 = { name:'שם', phone:'נייד', email:'אימייל', source:'מאיפה', notes:'הערות' };
const b = buildRows(H2, R2, M2);

check('total counted', b.counts.total, 6);
check('valid counted', b.counts.valid, 2);
check('skipped counted', b.counts.skipped, 4);
check('valid + skipped === total', b.counts.valid + b.counts.skipped, b.counts.total);
check('no_phone reason', b.counts.byReason.no_phone, 1);
check('bad_phone reason', b.counts.byReason.bad_phone, 2);
check('duplicate_in_file reason', b.counts.byReason.duplicate_in_file, 1);

check('phone normalised on the built row', b.valid[0].phone, '972541234567');
check('external_id equals the phone', b.valid[0].external_id, b.valid[0].phone);
ok('external_id is never empty', b.valid.every((r) => r.external_id && r.external_id.length > 0));
check('status is the agreed one', b.valid[0].status, IMPORT_STATUS);
check('source is the agreed one', b.valid[0].source, IMPORT_SOURCE);
ok('the CSV source column does NOT overwrite source',
  b.valid.every((r) => r.source === IMPORT_SOURCE));
ok('the CSV source value is preserved in notes',
  (b.valid[0].notes || '').includes('אינסטגרם'), b.valid[0].notes || '(null)');

// Row numbers must point at the real line in her file, header counted as 1.
check('skipped row numbers are file line numbers', b.skipped.map((s) => s.row), [4, 5, 6, 7]);

// Unmapped optional fields must not throw and must come back null.
const b2 = buildRows(H2, R2, { phone: 'נייד' });
check('unmapped name -> empty string', b2.valid[0].name, '');
check('unmapped email -> null', b2.valid[0].email, null);
check('still finds the same valid rows', b2.counts.valid, 2);

// No phone column at all: everything skips, nothing throws.
const b3 = buildRows(H2, R2, { name: 'שם' });
check('no phone column -> zero valid', b3.counts.valid, 0);
check('no phone column -> all skipped', b3.counts.skipped, 6);

// Re-running the same file must produce identical keys (idempotent upsert).
const again = buildRows(H2, R2, M2);
check('deterministic external_ids', again.valid.map((r) => r.external_id), b.valid.map((r) => r.external_id));

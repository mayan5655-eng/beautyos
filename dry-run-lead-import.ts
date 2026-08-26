// dry-run-lead-import.ts
//
// DRY RUN ONLY. Makes NO database call of any kind - not a write, not a read,
// not a count. It runs the exact modules the commit endpoint runs
// (readUpload -> buildRows -> chunk plan) and prints what a real import WOULD
// do. Handles .csv, .xlsx and .xls, because readUpload does.
//
//   node dry-run-lead-import.ts                  # generated 247-row fixture
//   node dry-run-lead-import.ts path/to/her.csv  # a real file
//   node dry-run-lead-import.ts her.xlsx --sheet=לידים
//
// Nothing here imports supabase. That is deliberate: a dry-run script that
// could reach the database is one typo away from not being a dry run.

import { readFileSync } from 'node:fs';
import { maskValue } from './lib/leads/csvImport.ts';
// The SAME entry point both routes use. This script used to call decodeCsv and
// parseCsv directly, which was already a second path through the same decision
// and would have silently failed to read a workbook at all.
import { readUpload } from './lib/leads/readUpload.ts';
import { buildRows, SKIP_REASON_HE, IMPORT_STATUS, IMPORT_SOURCE } from './lib/leads/buildRows.ts';
import { fallbackMapping, TARGET_FIELDS } from './lib/leads/mapHeaders.ts';

const TENANT = 'b09637c8-a5c8-4b80-bda8-ff603f7ada60';
const CHUNK = 50;

// ── fixture ────────────────────────────────────────────────────────────────
// Deterministic, and shaped like a real export: Hebrew names, mixed phone
// formats, and the imperfections every real list carries.
function fixture(): Uint8Array {
  const first = ['דנה', 'מיכל', 'רונית', 'שירה', 'נועה', 'תמר', 'יעל', 'אורית', 'הילה', 'ליאת'];
  const last = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אבני', 'שרון', 'גל'];
  const src = ['אינסטגרם', 'פייסבוק', 'המלצה', 'גוגל', ''];
  const svc = ['פילינג', 'לק ג׳ל', 'טיפול פנים', 'הסרת שיער', ''];
  const rows: string[][] = [];
  for (let i = 0; i < 247; i++) {
    const name = `${first[i % first.length]} ${last[i % last.length]}`;
    let phone: string;
    if (i % 37 === 0) phone = '';                                  // blank
    else if (i % 41 === 0) phone = 'לא ידוע';                       // text
    else if (i % 53 === 0) phone = `03-${5000000 + i}`;             // landline
    else if (i === 100) phone = '054-1234500';                      // dup of row 0
    else phone = `05${(i % 5) + 2}-${String(1234500 + i).padStart(7, '0')}`;
    rows.push([name, phone, `lead${i}@example.com`, src[i % src.length], svc[i % svc.length]]);
  }
  rows[0][1] = '054-1234500';
  const headers = ['שם מלא', 'טלפון נייד', 'אימייל', 'מאיפה הגיעה', 'טיפול מבוקש'];
  const text = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n') + '\r\n';
  // windows-1255, like Excel on a Hebrew locale.
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out.push(c < 0x80 ? c : (c >= 0x05d0 && c <= 0x05ea ? c - 0x05d0 + 0xe0 : 0x3f));
  }
  return new Uint8Array(out);
}

const path = process.argv[2];
const bytes = path ? new Uint8Array(readFileSync(path)) : fixture();
const line = (s = '') => console.log(s);
const rule = (n = 74) => line('─'.repeat(n));

line('='.repeat(74));
line('LEAD IMPORT — DRY RUN');
line('NO DATABASE CALL IS MADE BY THIS SCRIPT. Nothing is written or read.');
line(`source: ${path ? path : 'generated 247-row fixture (windows-1255, ";", CRLF)'}`);
line(`TENANT FILTER that a real run would use: tenant_id = ${TENANT}`);
line('='.repeat(74));

const sheetArg = process.argv.slice(3).find((a) => a.startsWith('--sheet='));
const read = readUpload(bytes, {
  filename: path ?? 'fixture.csv',
  sheet: sheetArg ? sheetArg.slice('--sheet='.length) : null,
  maxRows: 20_000,
});

if (!read.ok) {
  line(`\nFILE UNUSABLE — ${read.problem}`);
  line(`  ${read.message}`);
  if (read.sheetNames.length > 0) line(`  sheets in file: ${read.sheetNames.join(' | ')}`);
  process.exit(1);
}

const { format, headers, rows, delimiter, encoding, sheetNames, sheetName } = read;

line(`\nformat detected   : ${format}`);
if (format === 'csv') {
  line(`encoding detected : ${encoding}`);
  line(`delimiter detected: ${delimiter === '\t' ? 'TAB' : `"${delimiter}"`}`);
} else {
  line(`sheets in file    : ${sheetNames.length} — ${sheetNames.join(' | ')}`);
  line(`sheet read        : ${sheetName}`);
}
line(`header row        : ${headers.join(' | ')}`);
line(`data rows         : ${rows.length}`);
line('diagnosis         : usable');

// The mapping the preview would produce, from THE REAL fallbackMapping in
// lib/leads/mapHeaders.ts - not a copy of it.
//
// This script originally carried its own little Hebrew-only regex here
// (/טלפון|נייד/). On a file with LATIN headers - name, phone_local,
// phone_intl - it matched nothing, reported 0 valid and 247 skipped for
// "no phone", and looked exactly like a broken importer. The importer was
// fine; the script had a second, worse implementation of a decision the
// app already makes. Precisely the drift buildRows exists to prevent, so
// the script now calls the same function the app calls.
//
// fallbackMapping is used rather than proposeMapping so the dry run stays
// offline and deterministic - no API call, no key needed. Override any
// column from the command line:  --phone=phone_intl  --name=name
const overrides: Record<string, string> = {};
for (const a of process.argv.slice(3)) {
  const m = a.match(/^--([a-z_]+)=(.*)$/);
  if (m) overrides[m[1]] = m[2];
}
const proposal = fallbackMapping(headers, 'dry run (offline, header matching)');
const mapping: Record<string, string | null> = {};
for (const f of TARGET_FIELDS) {
  mapping[f] = overrides[f] !== undefined
    ? (overrides[f] || null)
    : proposal.mapping[f].csvColumn;
}
line('\nmapping used:');
for (const [k, v] of Object.entries(mapping)) line(`  ${k.padEnd(18)} -> ${v ?? '— not imported —'}`);

const built = buildRows(headers, rows, mapping);

line('');
rule();
line('WHAT A REAL RUN WOULD DO');
rule();
line(`  total rows in file : ${built.counts.total}`);
line(`  would upsert       : ${built.counts.valid}`);
line(`  would skip         : ${built.counts.skipped}`);
for (const [reason, n] of Object.entries(built.counts.byReason)) {
  if (n > 0) line(`      ${SKIP_REASON_HE[reason as keyof typeof SKIP_REASON_HE].padEnd(34)} ${n}`);
}
line(`  valid + skipped    : ${built.counts.valid + built.counts.skipped}  (must equal ${built.counts.total})`);

const chunkCount = Math.ceil(built.valid.length / CHUNK);
line(`\n  chunk plan         : ${chunkCount} statements of up to ${CHUNK} rows`);
for (let i = 0, c = 1; i < built.valid.length; i += CHUNK, c++) {
  const size = Math.min(CHUNK, built.valid.length - i);
  line(`      chunk ${String(c).padStart(2)}/${chunkCount}  rows ${String(i + 1).padStart(3)}–${String(i + size).padStart(3)}  (${size} rows)`);
}
line(`\n  upsert target      : public.leads`);
line(`  on conflict        : (tenant_id, source, external_id)`);
line(`  status written     : ${IMPORT_STATUS}`);
line(`  source written     : ${IMPORT_SOURCE}`);

line('\n  first 5 rows exactly as they would land:');
rule();
for (const r of built.valid.slice(0, 5)) {
  line(`    name=${(r.name || '—').padEnd(14)} phone=${r.phone}  ext_id=${r.external_id}`);
  line(`      email=${r.email ?? '—'}  status=${r.status}  source=${r.source}`);
  line(`      notes=${(r.notes ?? '—').replace(/\n/g, ' / ')}`);
}
rule();

if (built.skipped.length) {
  line('\n  first 5 skipped rows (phone values MASKED — real people):');
  for (const s of built.skipped.slice(0, 5)) {
    line(`    line ${String(s.row).padStart(4)}  ${(s.name || '—').padEnd(14)} ${maskValue(s.value).padEnd(14)} ${SKIP_REASON_HE[s.reason]}`);
  }
}

// Idempotency is the property the whole design rests on; check it here rather
// than discover it after a double import.
const keys = built.valid.map((r) => r.external_id);
line('');
rule();
line(`  unique external_ids: ${new Set(keys).size} of ${keys.length}  ${new Set(keys).size === keys.length ? '(no collisions — re-running updates, never duplicates)' : '*** COLLISION ***'}`);
line(`  any empty ext_id   : ${keys.some((k) => !k) ? '*** YES — would collide on upsert ***' : 'no'}`);
rule();
line('\nNOTHING WAS WRITTEN. NO DATABASE CALL WAS MADE.');
line('='.repeat(74));

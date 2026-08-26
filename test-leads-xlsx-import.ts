// test-leads-xlsx-import.ts
//
// Tests for .xlsx / .xls support in the lead importer. Run with plain node -
// Node 24 strips TypeScript types natively, so there is no build step and no
// test dependency:
//
//     node test-leads-xlsx-import.ts
//
// READ-ONLY. No database, no network. Every workbook below is built in memory.
//
// ── The assertion that matters most ────────────────────────────────────────
// "phone survives" is not an ordinary case. The failure is SILENT and the
// output looks entirely reasonable - a phone that became 9.72541E+11 is still
// a string, and nothing downstream would flag it - but it is not her client's
// number any more, and nobody would catch it by eyeballing a preview. It is
// asserted here against SheetJS's own convenience modes, so that if anyone ever
// "simplifies" the reader back to sheet_to_json, this file says why that is
// wrong.
//
// The date cases pin behaviour that is VERSION-DEPENDENT: xlsx 0.18.5 returned
// local-time Dates and slipped a day; 0.20.3 (what we pin) returns UTC
// midnight. The reader takes `w` and so is correct on both, and the tests below
// assert 0.20.3's actual behaviour rather than a bug that has been fixed.

import * as XLSX from 'xlsx';
import {
  detectFormat,
  readWorkbook,
  isReadError,
  defaultSheet,
  sheetToParsed,
  diagnoseXlsx,
  cellToString,
  serialToDate,
  type Workbook,
} from './lib/leads/xlsxImport.ts';
import { readUpload, detectForeignFormat, foreignFormatMessage, sniffZipKind } from './lib/leads/readUpload.ts';
import { normalizeIsraeliMobile } from './lib/leads/csvImport.ts';

let passed = 0;
let failed = 0;

function eq(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
    console.log(`        got  ${a}`);
    console.log(`        want ${b}`);
  }
}
function ok(label: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}
function group(name: string) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`);
}

// ── fixture helpers ────────────────────────────────────────────────────────
const S = (v: string) => ({ t: 's', v });
const N = (v: number, z?: string) => (z ? { t: 'n', v, z } : { t: 'n', v });
const B = (v: boolean) => ({ t: 'b', v });
const E = () => ({ t: 'e', v: 0x07 }); // #DIV/0!
type C = ReturnType<typeof S> | ReturnType<typeof N> | ReturnType<typeof B> | ReturnType<typeof E> | null;

/** Build a workbook from raw cells and return its bytes. */
function book(sheets: Array<{ name: string; cells: C[][]; origin?: string }>, bookType: 'xlsx' | 'xls' = 'xlsx'): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const { name, cells, origin } of sheets) {
    const ws: Record<string, unknown> = {};
    const off = origin ? XLSX.utils.decode_cell(origin) : { r: 0, c: 0 };
    let maxC = 0;
    cells.forEach((row, i) => {
      maxC = Math.max(maxC, row.length - 1);
      row.forEach((cell, j) => {
        if (cell) ws[XLSX.utils.encode_cell({ r: i + off.r, c: j + off.c })] = cell;
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: off.r, c: off.c },
      e: { r: off.r + cells.length - 1, c: off.c + maxC },
    });
    XLSX.utils.book_append_sheet(wb, ws as XLSX.WorkSheet, name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

function mustRead(bytes: Uint8Array, maxRows = 20000): Workbook {
  const r = readWorkbook(bytes, maxRows);
  if (isReadError(r)) throw new Error(`readWorkbook failed: ${r.error}`);
  return r;
}

console.log('='.repeat(66));
console.log('xlsx lead importer tests');
console.log('='.repeat(66));

// ── 1. format detection ────────────────────────────────────────────────────
group('format detection');
{
  const xlsxBytes = book([{ name: 'a', cells: [[S('h')], [S('v')]] }]);
  const xlsBytes = book([{ name: 'a', cells: [[S('h')], [S('v')]] }], 'xls');
  eq('xlsx by magic bytes', detectFormat(xlsxBytes, null), 'xlsx');
  eq('xls by magic bytes', detectFormat(xlsBytes, null), 'xls');
  eq('magic bytes beat a wrong .csv name', detectFormat(xlsxBytes, 'leads.csv'), 'xlsx');
  eq('plain text is csv', detectFormat(new TextEncoder().encode('a,b\n1,2'), 'x.csv'), 'csv');
  eq('name fallback .xlsx', detectFormat(new Uint8Array([1, 2, 3]), 'x.XLSX'), 'xlsx');
  eq('name fallback .xls', detectFormat(new Uint8Array([1, 2, 3]), 'x.xls'), 'xls');
  eq('empty buffer is csv', detectFormat(new Uint8Array([]), null), 'csv');
  eq('short buffer does not overrun', detectFormat(new Uint8Array([0x50]), null), 'csv');
}

// ── 2. cellToString ────────────────────────────────────────────────────────
group('cellToString');
{
  eq('null cell', cellToString(null), '');
  eq('undefined cell', cellToString(undefined), '');
  eq('empty string cell', cellToString({ t: 's', v: '' }), '');
  eq('string trimmed', cellToString({ t: 's', v: '  דנה  ' }), 'דנה');
  eq('boolean true', cellToString({ t: 'b', v: true }), 'TRUE');
  eq('boolean false', cellToString({ t: 'b', v: false }), 'FALSE');
  eq('error cell -> empty', cellToString({ t: 'e', v: 0x07, w: '#DIV/0!' }), '');
  eq('integer lossless', cellToString({ t: 'n', v: 972541234567 }), '972541234567');
  eq('13-digit lossless', cellToString({ t: 'n', v: 1234567890123 }), '1234567890123');
  eq('decimal preserved', cellToString({ t: 'n', v: 1234.5 }), '1234.5');
  eq('zero is not empty', cellToString({ t: 'n', v: 0 }), '0');
  eq('General w is IGNORED for numbers', cellToString({ t: 'n', v: 972541234567, w: '9.72541E+11' }), '972541234567');
  eq('date cell uses w', cellToString({ t: 'n', v: 45678, z: 'dd/mm/yyyy', w: '21/01/2025' }), '21/01/2025');
  eq('date cell falls back to serial conversion', cellToString({ t: 'n', v: 45678, z: 'dd/mm/yyyy' }), '21/01/2025');
  eq('currency format is not a date', cellToString({ t: 'n', v: 1500, z: '[$$-409]#,##0.00', w: '$1,500.00' }), '1500');
  eq('quoted literal in format is not a date', cellToString({ t: 'n', v: 42, z: '0" days"', w: '42 days' }), '42');
  eq('t:d with w', cellToString({ t: 'd', v: new Date(Date.UTC(2025, 0, 21)), w: '21/01/2025' }), '21/01/2025');
}

// ── 3. serialToDate ────────────────────────────────────────────────────────
group('serialToDate');
{
  eq('45678', serialToDate(45678), '21/01/2025');
  eq('45679', serialToDate(45679), '22/01/2025');
  eq('44927', serialToDate(44927), '01/01/2023');
  eq('61 (first safe serial)', serialToDate(61), '01/03/1900');
  eq('60 refused (Excel fictional leap day)', serialToDate(60), null);
  eq('1 refused', serialToDate(1), null);
  eq('0 refused', serialToDate(0), null);
  eq('negative refused', serialToDate(-5), null);
  eq('NaN refused', serialToDate(NaN), null);
  eq('beyond 9999 refused', serialToDate(2958466), null);
}

// ── 4. THE PHONE MATRIX ────────────────────────────────────────────────────
group('phone preservation (the silent-corruption case)');
{
  const bytes = book([
    {
      name: 'לידים',
      cells: [
        [S('שם'), S('טלפון'), S('תאריך'), S('מקור')],
        [S('דנה כהן'), S('0541234567'), N(45678, 'dd/mm/yyyy'), S('אינסטגרם')],
        [S('רוני לוי'), N(541234567), N(45679, 'dd/mm/yyyy'), S('פייסבוק')],
        [S('מיכל בר'), N(972541234567), N(45680, 'dd/mm/yyyy'), S('המלצה')],
        [S('יעל אבן'), N(1234567890123), null, null],
      ],
    },
  ]);
  const wbr = mustRead(bytes);
  const { headers, rows } = sheetToParsed(wbr, 'לידים');

  eq('headers', headers, ['שם', 'טלפון', 'תאריך', 'מקור']);
  const phones = rows.map((r) => r[1]);
  const expect = ['0541234567', '541234567', '972541234567', '1234567890123'];
  eq('phones survive intact', phones, expect);

  // Prove the two convenience modes really do fail, so nobody "simplifies"
  // this back to sheet_to_json later.
  const ws = wbr.wb.Sheets['לידים'];
  const rawFalse = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][])
    .slice(1)
    .map((r) => String(r[1]));
  const rawTrue = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][])
    .slice(1)
    .map((r) => String(r[1]));
  ok('raw:false DOES corrupt long numbers (regression guard)', JSON.stringify(rawFalse) !== JSON.stringify(expect));
  ok('raw:false produces scientific notation', rawFalse.some((p) => /E\+/i.test(p)));
  eq('our output beats raw:false', phones, expect);
  ok('raw:true keeps phones (but breaks dates, see next group)', JSON.stringify(rawTrue) === JSON.stringify(expect));

  // And the whole point: these normalise to real Israeli mobiles.
  eq('0541234567 normalises', normalizeIsraeliMobile(phones[0]), { ok: true, e164: '972541234567' });
  eq('541234567 normalises (leading zero recovered)', normalizeIsraeliMobile(phones[1]), { ok: true, e164: '972541234567' });
  eq('972541234567 normalises', normalizeIsraeliMobile(phones[2]), { ok: true, e164: '972541234567' });
  eq('corrupted form would NOT normalise', normalizeIsraeliMobile('9.72541E+11').ok, false);

  eq('dates are the day Excel shows', rows.map((r) => r[2]), ['21/01/2025', '22/01/2025', '23/01/2025', '']);
  eq('gap cells are empty strings', rows[3], ['יעל אבן', '1234567890123', '', '']);
}

// ── 5. the date timezone trap ──────────────────────────────────────────────
group('date timezone trap');
{
  const bytes = book([{ name: 'd', cells: [[S('when')], [N(45678, 'dd/mm/yyyy')]] }]);
  const wbr = mustRead(bytes);
  eq('our reader gives the displayed day', sheetToParsed(wbr, 'd').rows[0][0], '21/01/2025');

  // Pin what cellDates:true actually does on the pinned version. On 0.18.5 this
  // was a LOCAL-time Date and .slice(0,10) gave 2025-01-20, a day early; 0.20.3
  // returns UTC midnight. If this assertion ever fails, the CDN pin moved and
  // the date handling needs re-checking before shipping.
  const asDates = XLSX.read(bytes, { type: 'array', cellDates: true });
  const cell = asDates.Sheets.d.A2 as { v: Date };
  eq('cellDates:true is UTC midnight on the pinned version', cell.v.toISOString(), '2025-01-21T00:00:00.000Z');

  // The reason we still do not use sheet_to_json for dates: raw:true yields a
  // Date object whose string form is a locale-dependent timestamp, not a date.
  const viaRaw = String((XLSX.utils.sheet_to_json(asDates.Sheets.d, { header: 1, raw: true })[1] as unknown[])[0]);
  ok('raw:true still gives an unusable date string', !/^\d{2}\/\d{2}\/\d{4}$/.test(viaRaw));
}

// ── 6. sheet structure ─────────────────────────────────────────────────────
group('sheet structure');
{
  // ragged + trailing blanks + interior blank + phantom trailing header column
  const bytes = book([
    {
      name: 's',
      cells: [
        [S('a'), S('b'), S('c'), null],
        [S('1'), S('2'), S('3')],
        [S('4')],
        [null, null, null],
        [S('6'), S('7'), S('8')],
        [null, null, null],
        [null, null, null],
      ],
    },
  ]);
  const wbr = mustRead(bytes);
  const p = sheetToParsed(wbr, 's');
  eq('phantom trailing header column trimmed', p.headers, ['a', 'b', 'c']);
  eq('ragged row padded to header width', p.rows[1], ['4', '', '']);
  eq('interior blank row KEPT (row numbers stay aligned)', p.rows[2], ['', '', '']);
  eq('trailing blank rows dropped', p.rows.length, 4);
  eq('all rows are header width', p.rows.every((r) => r.length === 3), true);
  eq('delimiter is empty for a workbook', p.delimiter, '');
}
{
  // used range not starting at A1
  const bytes = book([{ name: 's', cells: [[S('name'), S('phone')], [S('דנה'), N(541234567)]], origin: 'C5' }]);
  const p = sheetToParsed(mustRead(bytes), 's');
  eq('offset range: headers', p.headers, ['name', 'phone']);
  eq('offset range: rows', p.rows, [['דנה', '541234567']]);
}
{
  const bytes = book([{ name: 's', cells: [[S('a'), null, S('c')], [S('1'), S('2'), S('3')]] }]);
  const p = sheetToParsed(mustRead(bytes), 's');
  eq('interior blank header KEPT', p.headers, ['a', '', 'c']);
}

// ── 7. multi-sheet ─────────────────────────────────────────────────────────
group('multi-sheet');
{
  const bytes = book([
    { name: 'ריק', cells: [[null]] },
    { name: 'לידים', cells: [[S('שם'), S('טלפון')], [S('דנה'), N(541234567)]] },
    { name: 'ארכיון', cells: [[S('x')], [S('9')]] },
  ]);
  const wbr = mustRead(bytes);
  eq('sheet names preserved in order', wbr.sheetNames, ['ריק', 'לידים', 'ארכיון']);
  eq('defaultSheet skips the empty tab', defaultSheet(wbr), 'לידים');
  eq('explicit sheet 1', sheetToParsed(wbr, 'לידים').headers, ['שם', 'טלפון']);
  eq('explicit sheet 2 reads independently', sheetToParsed(wbr, 'ארכיון').rows, [['9']]);

  // The divergence guard: an unknown sheet must FAIL, never fall back.
  const r = readUpload(bytes, { maxRows: 100, sheet: 'לא קיים' });
  eq('unknown sheet is an error', r.ok, false);
  if (!r.ok) {
    eq('unknown sheet problem', r.problem, 'unknown-sheet');
    eq('unknown sheet still offers the picker', r.sheetNames, ['ריק', 'לידים', 'ארכיון']);
  }

  // Same bytes, no sheet given, twice -> identical. This is the property that
  // makes preview and insert agree.
  const a = readUpload(bytes, { maxRows: 100 });
  const b = readUpload(bytes, { maxRows: 100 });
  eq('default sheet resolution is deterministic', JSON.stringify(a), JSON.stringify(b));
  if (a.ok) eq('default resolves to the first non-empty tab', a.sheetName, 'לידים');
}

// ── 8. .xls legacy ─────────────────────────────────────────────────────────
group('.xls legacy');
{
  const bytes = book(
    [{ name: 'לידים', cells: [[S('שם'), S('טלפון'), S('תאריך')], [S('דנה'), N(541234567), N(45678, 'dd/mm/yyyy')]] }],
    'xls'
  );
  eq('detected as xls', detectFormat(bytes, 'old.xls'), 'xls');
  const r = readUpload(bytes, { maxRows: 100 });
  eq('xls reads ok', r.ok, true);
  if (r.ok) {
    eq('xls format reported', r.format, 'xls');
    eq('xls headers', r.headers, ['שם', 'טלפון', 'תאריך']);
    eq('xls phone lossless', r.rows[0][1], '541234567');
    eq('xls date correct', r.rows[0][2], '21/01/2025');
  }
}

// ── 9. row cap ─────────────────────────────────────────────────────────────
group('row cap');
{
  const rows: C[][] = [[S('name'), S('phone')]];
  for (let i = 0; i < 10; i++) rows.push([S(`n${i}`), S('0541234567')]);
  const bytes = book([{ name: 's', cells: rows }]);

  const under = readUpload(bytes, { maxRows: 100 });
  eq('under the cap reads fine', under.ok, true);
  if (under.ok) eq('all 10 rows present', under.rows.length, 10);

  // Exactly at the cap must PASS, not trip the guard.
  const exact = readUpload(bytes, { maxRows: 10 });
  eq('exactly at the cap is accepted', exact.ok, true);
  if (exact.ok) eq('exactly at the cap keeps every row', exact.rows.length, 10);

  // Over the cap must be REJECTED, not silently truncated.
  const over = readUpload(bytes, { maxRows: 5 });
  eq('over the cap is rejected', over.ok, false);
  if (!over.ok) eq('over the cap problem', over.problem, 'too-many-rows');

  // And prove the truncation it is guarding against is real.
  const truncated = XLSX.read(bytes, { type: 'array', sheetRows: 5 });
  const tr = XLSX.utils.decode_range(truncated.Sheets.s['!ref'] as string);
  ok('sheetRows really does truncate silently', tr.e.r + 1 < 11);
}

// ── 10. diagnosis ──────────────────────────────────────────────────────────
group('diagnosis');
{
  eq('empty sheet', diagnoseXlsx(null, [], []).problem, 'empty-sheet');
  eq('header only', diagnoseXlsx(null, ['a'], []).problem, 'header-only');
  eq('no header', diagnoseXlsx(null, [], [['1']]).problem, 'no-header');
  eq('healthy', diagnoseXlsx(null, ['a'], [['1']]).problem, null);
  eq('healthy message empty', diagnoseXlsx(null, ['a'], [['1']]).message, '');

  // The user-facing requirement: xlsx advice must never be CSV advice.
  const messages = (['corrupt', 'no-sheets', 'unknown-sheet', 'too-many-rows'] as const)
    .map((p) => diagnoseXlsx(p, [], []).message)
    .concat(diagnoseXlsx(null, [], [], 'גיליון1', 2).message)
    .concat(diagnoseXlsx(null, ['a'], [], 'גיליון1', 2).message);
  for (const m of messages) {
    ok(`message is non-empty: ${m.slice(0, 28)}...`, m.length > 0);
    ok('message does not mention CSV', !/CSV/i.test(m));
    ok('message does not mention UTF', !/UTF/i.test(m));
    ok('message does not mention a delimiter', !/מפריד|מופרד/.test(m));
  }

  // Only offer "pick another tab" when another tab exists.
  ok('single-sheet message omits the tab hint', !diagnoseXlsx(null, ['a'], [], 'ג', 1).message.includes('גיליון אחר'));
  ok('multi-sheet message includes the tab hint', diagnoseXlsx(null, ['a'], [], 'ג', 2).message.includes('גיליון אחר'));

  // Corrupt bytes that merely look like a zip.
  const fake = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 9, 9, 9, 9]);
  eq('garbage zip is detected as xlsx', detectFormat(fake, null), 'xlsx');
  const r = readUpload(fake, { maxRows: 100 });
  eq('garbage zip fails cleanly', r.ok, false);
  if (!r.ok) ok('garbage zip does not throw and has a message', r.message.length > 0);
}

// ── 11. readUpload keeps the CSV path intact ───────────────────────────────
group('readUpload: CSV path unchanged');
{
  const csv = new TextEncoder().encode('name,phone\nדנה,0541234567\nרוני,054-765-4321\n');
  const r = readUpload(csv, { maxRows: 100, filename: 'leads.csv' });
  eq('csv ok', r.ok, true);
  if (r.ok) {
    eq('csv format', r.format, 'csv');
    eq('csv headers', r.headers, ['name', 'phone']);
    eq('csv rows', r.rows.length, 2);
    eq('csv encoding reported', r.encoding, 'utf-8');
    eq('csv delimiter reported', r.delimiter, ',');
    eq('csv has no sheets', r.sheetNames, []);
    eq('csv sheetName null', r.sheetName, null);
  }

  const semi = new TextEncoder().encode('name;phone\nדנה;0541234567\n');
  const r2 = readUpload(semi, { maxRows: 100, filename: 'leads.csv' });
  if (r2.ok) eq('semicolon csv still detected', r2.delimiter, ';');

  const empty = readUpload(new TextEncoder().encode(''), { maxRows: 100, filename: 'x.csv' });
  eq('empty csv rejected', empty.ok, false);
  if (!empty.ok) eq('empty csv problem', empty.problem, 'empty-file');

  const headerOnly = readUpload(new TextEncoder().encode('a,b\n'), { maxRows: 100, filename: 'x.csv' });
  eq('header-only csv rejected', headerOnly.ok, false);
}

// ── 12. end to end, workbook -> importable rows ────────────────────────────
group('end to end');
{
  const bytes = book([
    {
      name: 'Sheet1',
      cells: [
        [S('שם מלא'), S('נייד'), S('תאריך פנייה'), S('מקור')],
        [S('דנה כהן'), N(541234567), N(45678, 'dd/mm/yyyy'), S('אינסטגרם')],
        [S('רוני לוי'), S('054-765-4321'), N(45679, 'dd/mm/yyyy'), S('פייסבוק')],
        [S('בלי טלפון'), null, N(45680, 'dd/mm/yyyy'), S('המלצה')],
        [S('טלפון שגוי'), S('03-1234567'), null, null],
        [S('כפול'), N(541234567), null, S('אינסטגרם')],
      ],
    },
  ]);
  const r = readUpload(bytes, { maxRows: 20000, filename: 'leads.xlsx' });
  eq('reads ok', r.ok, true);
  if (r.ok) {
    eq('5 data rows', r.rows.length, 5);
    const phoneIdx = r.headers.indexOf('נייד');
    const results = r.rows.map((row) => normalizeIsraeliMobile(row[phoneIdx]));
    eq('row 1 valid', results[0], { ok: true, e164: '972541234567' });
    eq('row 2 valid (dashes stripped)', results[1], { ok: true, e164: '972547654321' });
    eq('row 3 empty phone', results[2], { ok: false, reason: 'empty' });
    eq('row 4 landline refused', results[3], { ok: false, reason: 'not_israeli_mobile' });
    eq('row 5 duplicate of row 1', results[4], { ok: true, e164: '972541234567' });
    eq('valid count', results.filter((x) => x.ok).length, 3);
  }
}

// ── 13. files that are not spreadsheets at all ─────────────────────────────
group('wrong file type');
{
  const bytesOf = (...parts: Array<number[] | string>) => {
    const out: number[] = [];
    for (const p of parts) {
      if (typeof p === 'string') for (const ch of p) out.push(ch.charCodeAt(0));
      else out.push(...p);
    }
    return new Uint8Array(out);
  };

  const pdf = bytesOf('%PDF-1.7\n\n4 0 obj', [0x0a]);
  const png = bytesOf([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13]);
  const jpeg = bytesOf([0xff, 0xd8, 0xff, 0xe0], 'JFIF');
  const gif = bytesOf('GIF89a', [1, 0, 1, 0]);
  const webp = bytesOf('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');

  eq('pdf detected', detectForeignFormat(pdf), 'pdf');
  eq('png detected', detectForeignFormat(png), 'png');
  eq('jpeg detected', detectForeignFormat(jpeg), 'jpeg');
  eq('gif detected', detectForeignFormat(gif), 'gif');
  eq('webp detected', detectForeignFormat(webp), 'webp');

  // BMP needs its declared size to match, so build a real 12-byte one.
  const bmp = new Uint8Array(12);
  bmp[0] = 0x42; bmp[1] = 0x4d;
  bmp[2] = 12; bmp[3] = 0; bmp[4] = 0; bmp[5] = 0;
  eq('bmp detected when the size field agrees', detectForeignFormat(bmp), 'bmp');

  // THE FALSE POSITIVE THAT MATTERS: "BM" is two ordinary letters, and a real
  // Hebrew-clinic export could easily open with a BMI column.
  const bmiCsv = new TextEncoder().encode('BMI,שם,טלפון\n22.4,דנה,0541234567\n');
  eq('a CSV starting "BMI" is NOT a bitmap', detectForeignFormat(bmiCsv), null);
  const bmiRead = readUpload(bmiCsv, { maxRows: 100, filename: 'x.csv' });
  eq('and it still imports', bmiRead.ok, true);
  if (bmiRead.ok) eq('BMI csv headers intact', bmiRead.headers, ['BMI', 'שם', 'טלפון']);

  // Real files must not be mistaken for foreign ones.
  eq('a real xlsx is not foreign', detectForeignFormat(book([{ name: 'a', cells: [[S('h')], [S('v')]] }])), null);
  eq('a real xls is not foreign', detectForeignFormat(book([{ name: 'a', cells: [[S('h')], [S('v')]] }], 'xls')), null);
  eq('a plain csv is not foreign', detectForeignFormat(new TextEncoder().encode('a,b\n1,2')), null);
  eq('empty bytes are not foreign', detectForeignFormat(new Uint8Array([])), null);
  eq('two bytes do not overrun', detectForeignFormat(new Uint8Array([0x42, 0x4d])), null);

  // End to end: the whole point is the MESSAGE, not the rejection.
  const r = readUpload(pdf, { maxRows: 100, filename: 'leads_clean_247.csv' });
  eq('pdf rejected', r.ok, false);
  if (!r.ok) {
    eq('pdf problem is wrong-file-type, not unreadable', r.problem, 'wrong-file-type');
    ok('message says it is a PDF', r.message.includes('PDF'));
    ok('message does NOT give CSV-encoding advice', !/CSV UTF-8|קידוד/.test(r.message));
    ok('message points at the .xlsx export', r.message.includes('.xlsx'));
  }

  const rp = readUpload(png, { maxRows: 100, filename: 'list.png' });
  if (!rp.ok) {
    ok('image message says it is an image', rp.message.includes('תמונה'));
    ok('image message mentions screenshots', rp.message.includes('צילום מסך'));
    ok('image message does NOT give CSV-encoding advice', !/CSV UTF-8|קידוד/.test(rp.message));
  }

  for (const f of ['pdf', 'png', 'jpeg', 'gif', 'bmp', 'webp', 'xps', 'docx', 'pptx'] as const) {
    const m = foreignFormatMessage(f);
    ok(`${f} message is non-empty`, m.length > 0);
    ok(`${f} message never says "encoding"`, !/קידוד/.test(m));
    ok(`${f} message never says "damaged"`, !/פגום/.test(m));
  }
}

// ── 14. ZIPs that are not workbooks ────────────────────────────────────────
group('zip that is not a workbook');
{
  // Build real zips whose entry names carry the signature. Content does not
  // matter - the sniff reads the directory, which is what a real file has too.
  const zipOf = (names: string[]): Uint8Array => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['1']]), 's');
    const real = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    // Prepend the marker names as raw bytes; sniffZipKind scans the buffer, and
    // a real file has these names in its directory just the same.
    const extra = new TextEncoder().encode(names.join(' '));
    const out = new Uint8Array(extra.length + real.length);
    out.set(extra, 0);
    out.set(real, extra.length);
    return out;
  };

  // A REAL workbook must always win, even with foreign-looking names present.
  const realXlsx = book([{ name: 'לידים', cells: [[S('שם')], [S('דנה')]] }]);
  eq('a real xlsx sniffs as a workbook', sniffZipKind(realXlsx), null);
  eq('a real xlsx still imports', readUpload(realXlsx, { maxRows: 100 }).ok, true);

  // xl/ markers take precedence over an XPS-looking name in the same buffer.
  eq('workbook markers win over stray names', sniffZipKind(zipOf(['Metadata/Job_PT.xml'])), null);

  // Pure-signature buffers (no xl/ anywhere).
  const fakeZip = (names: string[]): Uint8Array =>
    new TextEncoder().encode('PK' + names.join(' '));
  eq('XPS by Job_PT.xml', sniffZipKind(fakeZip(['Metadata/Job_PT.xml'])), 'xps');
  eq('XPS by .fpage', sniffZipKind(fakeZip(['Documents/1/Pages/1.fpage'])), 'xps');
  eq('docx', sniffZipKind(fakeZip(['word/document.xml'])), 'docx');
  eq('pptx', sniffZipKind(fakeZip(['ppt/slides/slide1.xml'])), 'pptx');

  // .ods must pass through - SheetJS reads OpenDocument spreadsheets.
  eq('ods is NOT flagged', sniffZipKind(fakeZip(['META-INF/manifest.xml', 'content.xml'])), null);
  // An unrecognised zip falls through to SheetJS, keeping 'corrupt' meaningful.
  eq('unknown zip falls through', sniffZipKind(fakeZip(['random/thing.txt'])), null);

  // End to end on an XPS: the message must not say "damaged".
  const xps = fakeZip(['Metadata/Job_PT.xml', 'Documents/1/Pages/1.fpage']);
  const r = readUpload(xps, { maxRows: 100, filename: 'leads.csv' });
  eq('xps rejected', r.ok, false);
  if (!r.ok) {
    eq('xps problem is wrong-file-type, not corrupt', r.problem, 'wrong-file-type');
    ok('xps message says XPS', r.message.includes('XPS'));
    ok('xps message says it is a print-out', r.message.includes('מודפסת'));
    ok('xps message does NOT say damaged', !/פגום/.test(r.message));
    ok('xps message does NOT suggest re-saving in Excel to fix it', !/מוגן בסיסמה/.test(r.message));
  }
}

console.log('\n' + '='.repeat(66));
console.log(`  passed ${passed}   failed ${failed}`);
console.log('='.repeat(66));
if (failed > 0) process.exit(1);

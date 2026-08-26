// lib/leads/xlsxImport.ts
//
// Excel (.xlsx / .xls) handling for the lead importer, converted into exactly
// the {headers, rows} shape parseCsv already produces so that buildRows,
// mapHeaders, the preview and the insert are all untouched.
//
// Pure, like csvImport.ts: no I/O, no network, no database. Tested directly by
// test-leads-xlsx-import.ts with plain `node`.
//
// ── Why a cosmetician's phone numbers survive this, and not the obvious way ──
//
// SheetJS's sheet_to_json has two modes and BOTH lose data that matters here.
// Measured, not assumed (the test matrix re-checks all four every run):
//
//   phone in Excel      raw:false          raw:true        per-cell (this file)
//   0541234567 (text)   0541234567         0541234567      0541234567
//   541234567  (num)    541234567          541234567       541234567
//   972541234567        9.72541E+11  <--   972541234567    972541234567
//   1234567890123       1.23457E+12  <--   1234567890123   1234567890123
//
// raw:false renders every number through Excel's *General* format, which flips
// to scientific notation at 12 significant digits and rounds to six. It does not
// throw and it does not look broken - "9.72541E+11" is a perfectly ordinary
// string - it simply is not her client's phone number any more.
//
// raw:true keeps the digits but hands back Date OBJECTS for date cells, which
// stringify to "Tue Jan 21 2025 00:00:00 GMT+0200 (שעון ישראל)" - not a date
// any downstream code here wants, and locale-dependent to boot.
//
// Version note, because it decides how much the pin matters: on xlsx 0.18.5
// (the frozen npm build) those Date objects were built in LOCAL time, so serial
// 45678 arrived as 2025-01-20T21:59:20.000Z and .toISOString().slice(0,10) gave
// 2025-01-20 - one day EARLY, silently, for every date in the file. 0.20.3
// fixed that; it now returns a clean UTC midnight. We are pinned to 0.20.3 and
// the test matrix asserts the corrected behaviour, but taking `w` rather than
// constructing a day from a Date is what makes this reader correct on either.
//
// So: per cell, switching on cell.t. Numbers via String(v), never the formatted
// w. Date cells via w, which SheetJS has already rendered exactly as Excel
// displays it, with no timezone in the path at all.
//
// ── cellNF: true is load-bearing ───────────────────────────────────────────
// cell.z (the number format) is the ONLY way to tell a date cell from an
// ordinary number - both are t:'n' - and it is dropped unless the read asks for
// it. Without cellNF the date branch below never fires and every date imports
// as a raw serial like "45678". Do not remove it as an optimisation.

import * as XLSX from 'xlsx';
import type { ParsedCsv } from './csvImport.ts';

/** Which kind of upload we are looking at. */
export type UploadFormat = 'csv' | 'xlsx' | 'xls';

export type XlsxProblem =
  | 'corrupt'
  | 'no-sheets'
  | 'unknown-sheet'
  | 'empty-sheet'
  | 'no-header'
  | 'header-only'
  | 'too-many-rows';

export interface XlsxDiagnosis {
  problem: XlsxProblem | null;
  /** Hebrew, aimed at the cosmetician, saying what to actually do next. */
  message: string;
}

export interface Workbook {
  sheetNames: string[];
  /** Opaque; hand back to sheetToParsed. */
  wb: XLSX.WorkBook;
  /** True when the parse hit the row cap - the file has more rows than we allow. */
  hitRowCap: boolean;
}

export interface ReadError {
  error: XlsxProblem;
}

// ── Format detection ───────────────────────────────────────────────────────
//
// MAGIC BYTES first, filename second. A cosmetician exporting from another
// system gets whatever extension that system felt like, and a workbook named
// .csv must not reach the CSV decoder: it would come out as binary garbage and
// trip the 'unreadable' path, which would tell her to re-save it in a different
// encoding - advice that cannot help, because encoding is not the problem.

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" - an .xlsx is a zip
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls compound file

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

export function detectFormat(bytes: Uint8Array, filename?: string | null): UploadFormat {
  if (startsWith(bytes, ZIP_MAGIC)) return 'xlsx';
  if (startsWith(bytes, OLE2_MAGIC)) return 'xls';
  const name = String(filename ?? '').toLowerCase();
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.xls')) return 'xls';
  return 'csv';
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Parse the workbook, bounded.
 *
 * maxRows bounds the PARSE ITSELF via sheetRows, not merely the result. That
 * matters because .xlsx is a zip: 200,000 rows of repetitive data compress to
 * ~5 MB, so a file that slips under an upload size cap can still take 8 seconds
 * and 258 MB of heap to expand - on a serverless function that is a timeout,
 * not a validation error. Bounded, the same file parses in 1.4 s.
 *
 * We ask for maxRows + 2 (header + maxRows + one spare) so that hitting the cap
 * is DETECTABLE. sheetRows truncates SILENTLY; without the spare row an
 * oversized file would import looking complete while quietly missing its tail.
 */
export function readWorkbook(bytes: Uint8Array, maxRows: number): Workbook | ReadError {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: 'array',
      cellNF: true, // load-bearing: see the header note
      cellDates: false, // keep dates as serial + format so `w` stays authoritative
      cellText: true, // we need `w` for date cells
      sheetRows: maxRows + 2,
    });
  } catch {
    return { error: 'corrupt' };
  }

  const sheetNames = Array.isArray(wb.SheetNames) ? wb.SheetNames.slice() : [];
  if (sheetNames.length === 0) return { error: 'no-sheets' };

  const hitRowCap = sheetNames.some((n) => {
    const ws = wb.Sheets[n];
    if (!ws || !ws['!ref']) return false;
    const r = XLSX.utils.decode_range(ws['!ref']);
    return r.e.r - r.s.r + 1 >= maxRows + 2;
  });

  return { sheetNames, wb, hitRowCap };
}

/** Narrowing helper: did readWorkbook fail? */
export function isReadError(r: Workbook | ReadError): r is ReadError {
  return (r as ReadError).error !== undefined;
}

// ── Cell conversion ────────────────────────────────────────────────────────

/**
 * Does this number format describe a date/time?
 *
 * Colour/locale sections in [...] and literal "..." runs are stripped first, so
 * a currency format like [$$-409]#,##0.00 is not mistaken for a day token.
 */
function isDateFormat(z: unknown): boolean {
  if (!z || typeof z !== 'string') return false;
  const bare = z.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  return /[ymdhs]/i.test(bare);
}

/**
 * Excel serial -> dd/mm/yyyy, computed in UTC so no local timezone can shift
 * the day.
 *
 * Only a fallback, for a date cell whose `w` SheetJS did not render. Refuses
 * serials below 61: Excel models a fictional 29/02/1900 that never existed, so
 * dates in that range cannot be converted correctly, and a confidently wrong
 * date is worse than an unconverted one.
 */
export function serialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

type Cell = { t?: string; v?: unknown; w?: string; z?: unknown };

/** One cell, as the string the CSV path would have produced. */
export function cellToString(cell: Cell | undefined | null): string {
  if (cell == null || cell.v == null || cell.v === '') return '';
  switch (cell.t) {
    case 's':
    case 'str':
      return String(cell.v).trim();
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE';
    // #REF!, #N/A, #DIV/0! - an error is not a value. Empty, so the row is
    // skipped for a missing phone rather than importing the literal "#N/A".
    case 'e':
      return '';
    case 'd': {
      if (cell.w) return String(cell.w).trim();
      const d = cell.v as Date;
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    }
    case 'n': {
      if (isDateFormat(cell.z)) {
        if (cell.w) return String(cell.w).trim();
        const asDate = serialToDate(Number(cell.v));
        if (asDate) return asDate;
      }
      // NEVER cell.w here. That is Excel's General format, and it is exactly
      // where 972541234567 becomes "9.72541E+11".
      return String(cell.v);
    }
    default:
      return String(cell.v).trim();
  }
}

// ── Sheet -> ParsedCsv ─────────────────────────────────────────────────────

function readSheetRows(ws: XLSX.WorkSheet | undefined): string[][] {
  if (!ws || !ws['!ref']) return [];
  const r = XLSX.utils.decode_range(ws['!ref']);
  const out: string[][] = [];
  for (let R = r.s.r; R <= r.e.r; R++) {
    const row: string[] = [];
    for (let C = r.s.c; C <= r.e.c; C++) {
      row.push(cellToString(ws[XLSX.utils.encode_cell({ r: R, c: C })] as Cell));
    }
    out.push(row);
  }
  // TRAILING blank rows only. Excel files routinely carry hundreds of them from
  // stray formatting. INTERIOR blank rows are kept on purpose: dropping them
  // would shift every row number after the gap, and the preview reports "row N"
  // to send her to that row in her own spreadsheet. Keeping them means data row
  // i is always Excel row i + 2.
  while (out.length > 0 && out[out.length - 1].every((v) => v === '')) out.pop();
  return out;
}

/** The first sheet that actually has data, else the first sheet. */
export function defaultSheet(wbr: Workbook): string {
  for (const name of wbr.sheetNames) {
    const rows = readSheetRows(wbr.wb.Sheets[name]);
    if (rows.some((r) => r.some((v) => v !== ''))) return name;
  }
  return wbr.sheetNames[0];
}

/**
 * The chosen sheet, in the exact shape parseCsv returns.
 *
 * delimiter is '' - a workbook has no delimiter, and callers must not present
 * one.
 */
export function sheetToParsed(wbr: Workbook, sheetName: string): ParsedCsv {
  const all = readSheetRows(wbr.wb.Sheets[sheetName]);
  if (all.length === 0) return { headers: [], rows: [], delimiter: '' };

  const rawHeaders = all[0].map((h) => h.trim());
  // Trailing empty header cells are phantom columns from stray formatting and
  // would otherwise reach the mapper as unnamed columns. Interior blanks stay:
  // those are real columns that merely have no title.
  let width = rawHeaders.length;
  while (width > 0 && rawHeaders[width - 1] === '') width--;
  const headers = rawHeaders.slice(0, width);

  const rows = all.slice(1).map((r) => {
    const row = r.slice(0, width);
    while (row.length < width) row.push(''); // pad ragged rows to header width
    return row;
  });

  return { headers, rows, delimiter: '' };
}

// ── Diagnosis ──────────────────────────────────────────────────────────────
//
// Deliberately NOT diagnoseCsv. Its messages tell her to re-save the file as
// "CSV UTF-8 (comma separated)" and to check the delimiter - advice that is
// simply wrong for a workbook, where neither encoding nor delimiter exists. It
// would send her reformatting a file that has nothing wrong with it.

export function diagnoseXlsx(
  problem: XlsxProblem | null,
  headers: string[],
  rows: string[][],
  sheetName?: string | null,
  sheetCount = 1
): XlsxDiagnosis {
  const where = sheetName ? ` (גיליון "${sheetName}")` : '';
  // Only suggest another tab when there actually is one.
  const tryAnother = sheetCount > 1 ? ' אפשר לבחור גיליון אחר מהרשימה.' : '';

  switch (problem) {
    case 'corrupt':
      return {
        problem,
        message:
          'לא הצלחנו לפתוח את הקובץ. ייתכן שהוא פגום או מוגן בסיסמה. ' +
          'כדאי לפתוח אותו באקסל, לשמור עותק חדש (קובץ > שמירה בשם > חוברת עבודה של Excel) ולנסות שוב.',
      };
    case 'no-sheets':
      return { problem, message: 'הקובץ לא מכיל אף גיליון.' };
    case 'unknown-sheet':
      return {
        problem,
        message: 'הגיליון שנבחר לא נמצא בקובץ. כדאי לבחור גיליון מהרשימה ולנסות שוב.',
      };
    case 'too-many-rows':
      return {
        problem,
        message:
          'יש בקובץ יותר מדי שורות. כדאי לפצל אותו לכמה קבצים קטנים יותר ולייבא אותם בזה אחר זה.',
      };
    default:
      break;
  }

  if (headers.length === 0) {
    return rows.length === 0
      ? { problem: 'empty-sheet', message: `הגיליון ריק${where}.${tryAnother}` }
      : { problem: 'no-header', message: `לא נמצאה שורת כותרות${where}.` };
  }
  if (rows.length === 0) {
    return {
      problem: 'header-only',
      message: `הגיליון מכיל שורת כותרות בלבד, בלי שורות נתונים${where}.${tryAnother}`,
    };
  }
  return { problem: null, message: '' };
}

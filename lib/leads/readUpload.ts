// lib/leads/readUpload.ts
//
// The ONE way an uploaded lead file becomes {headers, rows}. Both the analyse
// route (preview) and the commit route (insert) call this and nothing else.
//
// ── Why it is one function and not a branch in each route ──────────────────
// The commit route re-parses the uploaded file from scratch rather than
// trusting numbers the browser sends back. That is the right call, but it means
// there are two independent parses of the same bytes, and any difference
// between them shows up as "she approved 247 rows and 244 landed" - or worse,
// with a workbook, "she previewed the גיליון tab and imported the ארכיון tab".
// buildRows already exists for exactly this reason on the mapping side; this is
// the same argument one step earlier, at the parse.
//
// Given identical bytes and identical options this is deterministic, including
// which sheet it picks, so the two parses cannot disagree.
//
// Pure: no I/O, no network, no database.

import {
  decodeCsv,
  parseCsv,
  diagnoseCsv,
  type CsvEncoding,
  type CsvProblem,
} from './csvImport.ts';
import {
  detectFormat,
  readWorkbook,
  isReadError,
  defaultSheet,
  sheetToParsed,
  diagnoseXlsx,
  type UploadFormat,
  type XlsxProblem,
} from './xlsxImport.ts';

export interface ReadUploadOptions {
  /** Used only as a fallback hint; magic bytes win. */
  filename?: string | null;
  /** Which sheet to read. Workbooks only; ignored for CSV. */
  sheet?: string | null;
  maxRows: number;
}

export interface UploadOk {
  ok: true;
  format: UploadFormat;
  headers: string[];
  rows: string[][];
  /** CSV only. '' for a workbook - it has no delimiter. */
  delimiter: string;
  /** CSV only. null for a workbook - it has no character encoding. */
  encoding: CsvEncoding | null;
  /** Workbook only; [] for CSV. */
  sheetNames: string[];
  /** Workbook only; null for CSV. The sheet these rows actually came from. */
  sheetName: string | null;
}

export interface UploadFail {
  ok: false;
  problem: CsvProblem | XlsxProblem;
  message: string;
  /** Present for workbooks, so the UI can still offer the tab picker. */
  sheetNames: string[];
}

export type UploadResult = UploadOk | UploadFail;

export function readUpload(bytes: Uint8Array, opts: ReadUploadOptions): UploadResult {
  const { filename = null, sheet = null, maxRows } = opts;
  const format = detectFormat(bytes, filename);

  // ── CSV ──────────────────────────────────────────────────────────────────
  if (format === 'csv') {
    const { text, encoding } = decodeCsv(bytes);
    const { headers, rows, delimiter } = parseCsv(text);

    const diagnosis = diagnoseCsv(text, headers, rows);
    if (diagnosis.problem) {
      return { ok: false, problem: diagnosis.problem, message: diagnosis.message, sheetNames: [] };
    }
    if (rows.length > maxRows) {
      return {
        ok: false,
        problem: 'too-many-rows',
        message:
          'יש בקובץ יותר מדי שורות. כדאי לפצל אותו לכמה קבצים קטנים יותר ולייבא אותם בזה אחר זה.',
        sheetNames: [],
      };
    }
    return {
      ok: true,
      format,
      headers,
      rows,
      delimiter,
      encoding,
      sheetNames: [],
      sheetName: null,
    };
  }

  // ── Workbook (.xlsx / .xls) ──────────────────────────────────────────────
  const read = readWorkbook(bytes, maxRows);
  if (isReadError(read)) {
    return { ok: false, ...diagnoseXlsx(read.error, [], []), sheetNames: [] } as UploadFail;
  }

  // Reject BEFORE parsing rows: sheetRows truncated the parse silently, so
  // continuing here would import a file that merely looks complete.
  if (read.hitRowCap) {
    return {
      ok: false,
      ...diagnoseXlsx('too-many-rows', [], []),
      sheetNames: read.sheetNames,
    } as UploadFail;
  }

  // An explicitly requested sheet that does not exist is an ERROR, never a
  // quiet fallback to the default. A silent fallback is precisely how the
  // preview and the insert would end up reading different tabs.
  let sheetName: string;
  if (sheet) {
    if (!read.sheetNames.includes(sheet)) {
      return {
        ok: false,
        ...diagnoseXlsx('unknown-sheet', [], [], sheet, read.sheetNames.length),
        sheetNames: read.sheetNames,
      } as UploadFail;
    }
    sheetName = sheet;
  } else {
    sheetName = defaultSheet(read);
  }

  const { headers, rows } = sheetToParsed(read, sheetName);
  const diagnosis = diagnoseXlsx(null, headers, rows, sheetName, read.sheetNames.length);
  if (diagnosis.problem) {
    return {
      ok: false,
      problem: diagnosis.problem,
      message: diagnosis.message,
      sheetNames: read.sheetNames,
    };
  }

  return {
    ok: true,
    format,
    headers,
    rows,
    delimiter: '',
    encoding: null,
    sheetNames: read.sheetNames,
    sheetName,
  };
}

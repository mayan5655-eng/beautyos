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

export type UploadProblem = CsvProblem | XlsxProblem | 'wrong-file-type';

export interface UploadFail {
  ok: false;
  problem: UploadProblem;
  message: string;
  /** Present for workbooks, so the UI can still offer the tab picker. */
  sheetNames: string[];
}

export type UploadResult = UploadOk | UploadFail;

// ── Files that are not spreadsheets at all ─────────────────────────────────
//
// A cosmetician asked for "her client list" will quite reasonably send a PDF of
// it, or a photo of a printed page, or a screenshot. Before this check those
// fell through to the CSV decoder, produced binary garbage, and were reported
// as 'unreadable' with the message "it seems to be saved in an encoding we do
// not recognise - in Excel, save as CSV UTF-8". That advice is useless for a
// PDF and actively misleading for a photograph: it sends her into Excel to fix
// an encoding problem that does not exist, on a file that could never have
// worked.
//
// Same principle as the xlsx diagnosis messages: say what the file actually is.

export type ForeignFormat =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'bmp'
  | 'webp'
  // These three are ZIPs, exactly like an .xlsx, so magic bytes alone call them
  // workbooks. They are told apart by what is inside - see sniffZipKind.
  | 'xps'
  | 'docx'
  | 'pptx';

function matchesAt(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((b, i) => bytes[offset + i] === b);
}

export function detectForeignFormat(bytes: Uint8Array): ForeignFormat | null {
  if (matchesAt(bytes, 0, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (matchesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (matchesAt(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (matchesAt(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif'; // GIF8[79]a
  if (matchesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return 'webp'; // RIFF....WEBP
  }
  // BMP is only "BM", two ASCII letters that a real CSV could legitimately
  // start with - a column called "BMI" is entirely plausible in this business.
  // So require the little-endian size field at offset 2 to match the actual
  // length as well, which a text file will not do by accident.
  if (matchesAt(bytes, 0, [0x42, 0x4d]) && bytes.length >= 6) {
    const declared = bytes[2] | (bytes[3] << 8) | (bytes[4] << 16) | (bytes[5] << 24);
    if (declared === bytes.length) return 'bmp';
  }
  return null;
}

// ── ZIPs that are not workbooks ────────────────────────────────────────────
//
// An .xlsx IS a zip, so "starts with PK" cannot distinguish a workbook from a
// Word document, a PowerPoint, or - the one that actually turned up here - an
// XPS print-out of a spreadsheet. Printing a list to XPS or PDF is a very
// natural thing to do when someone asks you for "your client list".
//
// Left to itself, SheetJS fails to open those and we report 'corrupt', whose
// message says the file may be damaged or password-protected and suggests
// re-saving it in Excel. The file is not damaged. It is a print-out, and no
// amount of re-saving will turn it back into data.
//
// Conservative on purpose: this only reports a format it is CONFIDENT about.
// Anything unrecognised falls through to SheetJS, so a genuinely corrupt
// workbook still gets the corrupt message. .ods is deliberately NOT listed -
// SheetJS reads OpenDocument spreadsheets, so that one must go through.

/** Entry names appear as plain text in the zip directory; no need to inflate. */
function zipContains(text: string, entry: string): boolean {
  return text.includes(entry);
}

export function sniffZipKind(bytes: Uint8Array): ForeignFormat | null {
  // Entry names live in the local headers and the central directory. Scanning
  // the raw bytes as latin1 finds them without decompressing anything.
  const text = Buffer.from(bytes).toString('latin1');

  // A real workbook first - never misreport one of these.
  if (zipContains(text, 'xl/workbook.xml') || zipContains(text, 'xl/worksheets/')) return null;
  // OpenDocument (.ods). SheetJS reads these, so let it.
  if (zipContains(text, 'META-INF/manifest.xml') && zipContains(text, 'content.xml')) return null;

  // XPS / OpenXPS: a printed page sequence. MXDC is Microsoft's XPS Document
  // Converter, i.e. "Print to XPS".
  if (zipContains(text, 'Metadata/Job_PT.xml') || zipContains(text, '.fpage')) return 'xps';
  if (zipContains(text, 'word/document.xml')) return 'docx';
  if (zipContains(text, 'ppt/slides/')) return 'pptx';

  return null;
}

/** What to call it when telling her, in Hebrew. */
const FOREIGN_FORMAT_HE: Record<ForeignFormat, string> = {
  pdf: 'PDF',
  png: 'תמונה (PNG)',
  jpeg: 'תמונה (JPEG)',
  gif: 'תמונה (GIF)',
  bmp: 'תמונה (BMP)',
  webp: 'תמונה (WEBP)',
  xps: 'מסמך מודפס (XPS)',
  docx: 'מסמך Word',
  pptx: 'מצגת PowerPoint',
};

const IMAGE_FORMATS: ForeignFormat[] = ['png', 'jpeg', 'gif', 'bmp', 'webp'];

/** Formats that are a rendering of a list rather than the list itself. */
const PRINTOUT_FORMATS: ForeignFormat[] = ['pdf', 'xps'];

export function foreignFormatMessage(format: ForeignFormat): string {
  const what = FOREIGN_FORMAT_HE[format];
  let why = '';
  if (IMAGE_FORMATS.includes(format)) {
    why = 'צילום מסך או תמונה של רשימה לא ניתנים לייבוא - צריך את הקובץ עצמו. ';
  } else if (PRINTOUT_FORMATS.includes(format)) {
    // The distinction that matters: this is not a broken file, it is the wrong
    // KIND of file, and re-saving it will not help.
    why = 'זו גרסה מודפסת של הרשימה, לא הנתונים עצמם, ולכן אין מה לייבא ממנה. ';
  }
  return (
    `הקובץ שנבחר הוא ${what}, לא גיליון נתונים, ולכן אי אפשר לייבא ממנו פניות. ` +
    why +
    'בגוגל שיטס: קובץ > הורדה > "Microsoft Excel (‎.xlsx)". ' +
    'באקסל: קובץ > שמירה בשם > "חוברת עבודה של Excel".'
  );
}

export function readUpload(bytes: Uint8Array, opts: ReadUploadOptions): UploadResult {
  const { filename = null, sheet = null, maxRows } = opts;

  // FIRST, before anything tries to decode it. A PDF or a photograph cannot be
  // a spreadsheet under any interpretation, and every message downstream of
  // here assumes it is looking at one.
  const foreign = detectForeignFormat(bytes);
  if (foreign) {
    return {
      ok: false,
      problem: 'wrong-file-type',
      message: foreignFormatMessage(foreign),
      sheetNames: [],
    };
  }

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

  // An .xlsx is a zip, so detectFormat says "xlsx" for every zip - including a
  // Word file or an XPS print-out. Check what is actually inside before handing
  // it to SheetJS, so those get told what they are instead of "damaged".
  if (format === 'xlsx') {
    const zipKind = sniffZipKind(bytes);
    if (zipKind) {
      return {
        ok: false,
        problem: 'wrong-file-type',
        message: foreignFormatMessage(zipKind),
        sheetNames: [],
      };
    }
  }

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

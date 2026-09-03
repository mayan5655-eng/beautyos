// lib/leads/csvImport.ts
//
// Pure CSV handling for the lead importer. No I/O, no network, no database -
// everything here is a function of its arguments, so it can be tested directly
// (see test-leads-csv-import.ts, run with plain `node`).
//
// Stage 1 does not write anything. This module only decodes, parses, masks and
// validates.

/** Which encoding decodeCsv settled on, so the caller can show it. */
export type CsvEncoding = 'utf-8' | 'windows-1255' | 'utf-16le' | 'utf-16be';

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

// ── Encoding ────────────────────────────────────────────────────────────────
//
// Hebrew CSVs exported from Israeli Excel are very often windows-1255, not
// UTF-8. Decoded as UTF-8 they come out as replacement characters, and the
// import would either fail or silently write mojibake client names.
//
// Strategy: try UTF-8 in FATAL mode, which throws on invalid sequences rather
// than substituting U+FFFD. If it throws - or if it succeeds but the result
// still contains U+FFFD, which happens when the file legitimately contains that
// codepoint-shaped byte run - fall back to windows-1255.
//
// Node decodes windows-1255 natively (full ICU); no dependency is required.

const BOM = '﻿';

export function decodeCsv(buffer: Uint8Array): DecodedCsv {
  // UTF-16 FIRST, and the ordering is the fix. Excel's "Unicode Text" export is
  // UTF-16LE. UTF-16 bytes are not valid UTF-8, so the old code fell straight
  // through to windows-1255 - which decodes ANY byte sequence without
  // complaining. The file then "parsed": three headers, three rows, every one
  // of them mojibake. It did not error. It would have imported garbage names
  // and garbage phone numbers. Failing loudly is bad; succeeding wrongly is
  // worse.
  const utf16 = detectUtf16(buffer);
  if (utf16) {
    return { text: stripBom(new TextDecoder(utf16).decode(buffer)), encoding: utf16 };
  }

  let text: string | null = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = null;
  }
  if (text !== null && !text.includes('�')) {
    return { text: stripBom(text), encoding: 'utf-8' };
  }
  const fallback = new TextDecoder('windows-1255').decode(buffer);
  return { text: stripBom(fallback), encoding: 'windows-1255' };
}

function stripBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s;
}

/**
 * UTF-16 by BOM, or by the NUL pattern when there is no BOM.
 *
 * A UTF-16LE file of mostly-ASCII text carries 0x00 in every ODD byte position;
 * UTF-16BE carries it in every EVEN one. No single-byte encoding produces that,
 * so the pattern is a reliable signal and costs one pass over a 512-byte sample.
 */
function detectUtf16(b: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  if (b.length >= 2) {
    if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
    if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  }
  const sample = Math.min(b.length, 512);
  if (sample < 8) return null;
  let oddNuls = 0, evenNuls = 0;
  for (let i = 0; i < sample; i++) {
    if (b[i] !== 0) continue;
    if (i % 2 === 0) evenNuls++; else oddNuls++;
  }
  const half = sample / 2;
  if (oddNuls > half * 0.6 && evenNuls === 0) return 'utf-16le';
  if (evenNuls > half * 0.6 && oddNuls === 0) return 'utf-16be';
  return null;
}

// ── Delimiter ───────────────────────────────────────────────────────────────
//
// Israeli Excel writes `;` on a Hebrew locale far more often than `,`. Guessing
// wrong yields a single column containing the whole row, which the AI mapper
// would then confidently map as "name" - so this is worth detecting rather than
// assuming.
//
// Counted OUTSIDE quotes only: a name field like "Cohen, Dana" must not vote.

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'];

export function detectDelimiter(firstLine: string): string {
  let best = ',';
  let bestCount = -1;
  for (const d of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (inQuotes && firstLine[i + 1] === '"') { i++; continue; }
        inQuotes = !inQuotes;
      } else if (ch === d && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// ── Parsing ─────────────────────────────────────────────────────────────────
//
// A small RFC 4180 state machine rather than a split on the delimiter, and
// rather than a new dependency. It handles the three things a naive split gets
// wrong and that real exports contain: quoted fields, delimiters inside quotes,
// and newlines inside quotes. Doubled quotes ("") are the escape.

export function parseCsv(text: string): ParsedCsv {
  const firstLineEnd = findFirstUnquotedNewline(text);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { record.push(field); field = ''; continue; }
    if (ch === '\r') {
      // CRLF: skip the CR and let the LF end the record.
      // LONE CR: this IS the record separator. The old code skipped every \r
      // unconditionally and ended records only on \n, so a CR-only file - the
      // Excel-for-Mac / old-export line ending - collapsed into ONE record. The
      // header swallowed the whole file, rows came back empty, and the importer
      // reported "no data rows" for a file that was full of them.
      if (text[i + 1] === '\n') continue;
      record.push(field); field = '';
      records.push(record); record = [];
      continue;
    }
    if (ch === '\n') {
      record.push(field); field = '';
      records.push(record); record = [];
      continue;
    }
    field += ch;
  }
  // Trailing field / record, unless the file ended on a newline.
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }

  const headers = (records.shift() || []).map((h) => h.trim());
  // Blank trailing lines are common in exports and are not data.
  const rows = records.filter((r) => r.some((c) => c.trim() !== ''));
  return { headers, rows, delimiter };
}

function findFirstUnquotedNewline(text: string): number {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // \r included: on a CR-only file there is no \n at all, so without this
      // the "first line" was the whole file and the delimiter vote counted
      // every separator in every row.
      return i;
    }
  }
  return -1;
}

// ── Masking ─────────────────────────────────────────────────────────────────
//
// These rows are real clients' names, phone numbers and email addresses. The
// header-mapping call only needs to see the SHAPE of a column to tell a phone
// from an id from a date, so it is sent shapes, not values: 054-1234567 becomes
// 999-9999999, which is exactly as informative for mapping and identifies
// nobody.
//
// Punctuation and length are preserved because that is what carries the signal.
// Script is preserved too (Hebrew stays Hebrew) so the model can still tell a
// Hebrew name column from a Latin email column.

export function maskValue(value: string): string {
  return Array.from(value ?? '')
    .map((ch) => {
      if (/[0-9]/.test(ch)) return '9';
      if (/[֐-׿]/.test(ch)) return 'א';   // Hebrew block
      if (/[a-z]/.test(ch)) return 'x';
      if (/[A-Z]/.test(ch)) return 'X';
      return ch;                                     // @ . - / space etc.
    })
    .join('');
}

export function maskRow(row: string[]): string[] {
  return row.map(maskValue);
}

// ── Phone normalisation ─────────────────────────────────────────────────────
//
// Moved to lib/phone.ts and re-exported here, unchanged, so every existing
// importer keeps its import path. The public booking flow needs exactly this
// rule — a number a human is typing right now, refused with a reason she can
// act on — and two copies of a validator is how they drift apart.
//
// The reasoning that produced it still applies and is worth keeping in view:
// this value becomes the external_id the upsert dedupes on, and the unique
// index is NULLS DISTINCT — so NULL never collides, but empty string is NOT
// null, and two rows with external_id = '' in the same (tenant_id, source) DO
// collide and would silently merge unrelated leads. Only a well-formed Israeli
// mobile may produce a key; everything else is refused with a reason the
// preview can show, and those rows are skipped — they could not have been
// messaged anyway, which is the whole point of the import.

import type { PhoneReason } from '../phone.ts';

export {
  normalizeIsraeliMobile,
  type PhoneResult,
  type PhoneReason,
} from '../phone.ts';

/** Human-readable Hebrew for each refusal, for the preview screen. */
export const PHONE_REASON_HE: Record<PhoneReason, string> = {
  empty: 'אין מספר טלפון',
  no_digits: 'הטלפון לא מכיל ספרות',
  not_israeli_mobile: 'לא מספר נייד ישראלי תקין',
};


// ── Why a file could not be used ────────────────────────────────────────────
//
// "The file contains no data rows" used to be the only failure message, and it
// is wrong for every cause except the one where it is literally true. A file
// that was unreadable, or split on the wrong delimiter, or written in an
// encoding we mis-guessed, all reported "no data rows" - sending her to look
// for missing rows in a file that was full of them.

export type CsvProblem =
  | 'empty-file'
  | 'no-header'
  | 'header-only'
  | 'unreadable'
  | 'single-column';

export interface CsvDiagnosis {
  problem: CsvProblem | null;
  /** Hebrew, aimed at the cosmetician, saying what to actually do next. */
  message: string;
}

/** Fraction of characters that are neither printable nor ordinary whitespace. */
function garbageRatio(text: string): number {
  const sample = [...text.slice(0, 2000)];
  if (sample.length === 0) return 0;
  let bad = 0;
  for (const ch of sample) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    const c = ch.codePointAt(0)!;
    // C0/C1 controls and the replacement character are the tells for a file
    // decoded with the wrong encoding.
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0xfffd) bad++;
  }
  return bad / sample.length;
}

export function diagnoseCsv(
  text: string,
  headers: string[],
  rows: string[][]
): CsvDiagnosis {
  if (!text.trim()) {
    return { problem: 'empty-file', message: 'הקובץ ריק.' };
  }

  if (garbageRatio(text) > 0.1) {
    return {
      problem: 'unreadable',
      message:
        'לא הצלחנו לקרוא את הקובץ - נראה שהוא נשמר בקידוד שאנחנו לא מזהים. ' +
        'באקסל: קובץ > שמירה בשם > "CSV UTF-8 (מופרד בפסיקים)", ואז לנסות שוב.',
    };
  }

  if (headers.length === 0) {
    return { problem: 'no-header', message: 'לא נמצאה שורת כותרות בקובץ.' };
  }

  // One column across the whole file, while the header itself clearly contains
  // another separator, means we split on the wrong thing - not that the file is
  // empty.
  if (headers.length === 1 && [',', ';', '\t', '|'].some((d) => headers[0].includes(d))) {
    return {
      problem: 'single-column',
      message:
        'זיהינו עמודה אחת בלבד, אבל בשורת הכותרות יש מפרידים אחרים. ' +
        'כנראה הקובץ נשמר עם מפריד אחר. באקסל: שמירה בשם > "CSV UTF-8 (מופרד בפסיקים)".',
    };
  }

  if (rows.length === 0) {
    return {
      problem: 'header-only',
      message: 'הקובץ מכיל שורת כותרות בלבד, בלי שורות נתונים.',
    };
  }

  return { problem: null, message: '' };
}

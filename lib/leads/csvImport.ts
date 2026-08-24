// lib/leads/csvImport.ts
//
// Pure CSV handling for the lead importer. No I/O, no network, no database -
// everything here is a function of its arguments, so it can be tested directly
// (see test-leads-csv-import.ts, run with plain `node`).
//
// Stage 1 does not write anything. This module only decodes, parses, masks and
// validates.

/** Which encoding decodeCsv settled on, so the caller can show it. */
export type CsvEncoding = 'utf-8' | 'windows-1255';

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
    if (ch === '\r') continue;             // CRLF and lone CR both handled
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
    } else if (ch === '\n' && !inQuotes) {
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
// STRICTER than lib/whatsapp.js formatPhone, deliberately, because this value
// becomes the external_id that the upsert dedupes on.
//
// formatPhone only strips spaces/dashes/plus and swaps a leading 0 for 972. It
// accepts anything else unchanged, so "לא ידוע" and "" both survive it. An
// empty external_id is the dangerous one: the unique index is NULLS DISTINCT,
// so NULLs never collide - but empty string is NOT null, and two rows with
// external_id = '' in the same (tenant_id, source) DO collide and would upsert
// into each other, silently merging unrelated leads. The migration file warns
// about exactly this.
//
// So: only a well-formed Israeli mobile produces a key. Everything else is
// refused with a reason the preview can show, and those rows are skipped - they
// could not have been messaged anyway, which is the whole point of the import.

export type PhoneReason =
  | 'empty'
  | 'no_digits'
  | 'not_israeli_mobile';

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneReason };

/** 972 + 5 + 8 more digits. Israeli mobiles only; landlines are refused. */
const ISRAELI_MOBILE = /^9725\d{8}$/;

export function normalizeIsraeliMobile(raw: string | null | undefined): PhoneResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, reason: 'empty' };

  // Strip everything that is not a digit. This also removes a leading +, any
  // Hebrew text, and the (0) some exports write inside international numbers.
  const digits = input.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'no_digits' };

  let candidate = digits;
  if (candidate.startsWith('00972')) candidate = candidate.slice(2);
  if (candidate.startsWith('0')) candidate = '972' + candidate.slice(1);
  else if (candidate.startsWith('5') && candidate.length === 9) candidate = '972' + candidate;

  if (!ISRAELI_MOBILE.test(candidate)) return { ok: false, reason: 'not_israeli_mobile' };
  return { ok: true, e164: candidate };
}

/** Human-readable Hebrew for each refusal, for the preview screen. */
export const PHONE_REASON_HE: Record<PhoneReason, string> = {
  empty: 'אין מספר טלפון',
  no_digits: 'הטלפון לא מכיל ספרות',
  not_israeli_mobile: 'לא מספר נייד ישראלי תקין',
};

// lib/leads/buildRows.ts
//
// Turns a parsed CSV plus a column mapping into the exact rows that WOULD be
// inserted into public.leads - and the rows that would not, with the reason.
//
// Pure and shared on purpose. Stage 2 (preview) and Stage 3 (the actual insert)
// must agree to the row: a preview that says "247 will import" and an insert
// that writes 244 is worse than no preview at all. Both call this.
//
// No I/O, no network, no database. Tested directly in test-leads-csv-import.ts.

import { normalizeIsraeliMobile } from './csvImport.ts';
import type { TargetField } from './mapHeaders.ts';

/** Decided in advance: the batch lands in one status with zero existing rows. */
export const IMPORT_STATUS = 'follow_up_later';
export const IMPORT_SOURCE = 'csv_import';

export type SkipReason = 'no_phone' | 'bad_phone' | 'duplicate_in_file';

export const SKIP_REASON_HE: Record<SkipReason, string> = {
  no_phone: 'אין מספר טלפון',
  bad_phone: 'מספר לא תקין (לא נייד ישראלי)',
  duplicate_in_file: 'כפילות בתוך הקובץ',
};

export interface BuiltLead {
  name: string;
  phone: string;            // normalised E.164-ish: 9725XXXXXXXX
  email: string | null;
  source: string;
  notes: string | null;
  service_interest: string | null;
  status: string;
  external_id: string;      // == phone. Never null - see csvImport.ts.
}

export interface SkippedLead {
  /** 1-based row number as it appears in the file, header counted as row 1. */
  row: number;
  reason: SkipReason;
  /** The offending phone value, RAW. Callers that display it should mask it. */
  value: string;
  name: string;
}

export interface BuildResult {
  valid: BuiltLead[];
  skipped: SkippedLead[];
  counts: {
    total: number;
    valid: number;
    skipped: number;
    byReason: Record<SkipReason, number>;
  };
}

/** field -> the CSV header it is mapped to, or null when unmapped. */
export type ColumnMapping = Partial<Record<TargetField, string | null>>;

export function buildRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): BuildResult {
  const idx = (field: TargetField): number => {
    const col = mapping[field];
    return col ? headers.indexOf(col) : -1;
  };
  const at = (row: string[], i: number): string => (i >= 0 ? String(row[i] ?? '').trim() : '');

  const iName = idx('name');
  const iPhone = idx('phone');
  const iEmail = idx('email');
  const iSource = idx('source');
  const iNotes = idx('notes');
  const iService = idx('service_interest');

  const valid: BuiltLead[] = [];
  const skipped: SkippedLead[] = [];
  const byReason: Record<SkipReason, number> = { no_phone: 0, bad_phone: 0, duplicate_in_file: 0 };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2;                 // +1 for zero-index, +1 for the header row
    const rawPhone = at(row, iPhone);
    const name = at(row, iName);

    const skip = (reason: SkipReason) => {
      byReason[reason]++;
      skipped.push({ row: rowNumber, reason, value: rawPhone, name });
    };

    const phone = normalizeIsraeliMobile(rawPhone);
    if (!phone.ok) {
      // 'empty' is worth separating from a real but unusable number: one means
      // the column is blank, the other means it was filled in wrongly, and they
      // call for different corrections from her.
      skip(phone.reason === 'empty' ? 'no_phone' : 'bad_phone');
      return;
    }

    // Within-file duplicates would silently collapse on upsert, because
    // external_id IS the phone. Counting them here means the preview's number
    // matches what actually lands.
    if (seen.has(phone.e164)) { skip('duplicate_in_file'); return; }
    seen.add(phone.e164);

    // The source column, when mapped, describes where SHE got the lead. It does
    // not override IMPORT_SOURCE, which is what the upsert key depends on -
    // letting a CSV column change `source` would change the conflict target and
    // break idempotency. Her value is preserved in notes instead.
    const csvSource = at(row, iSource);
    const notes = at(row, iNotes);
    const mergedNotes = [notes, csvSource ? `מקור מהקובץ: ${csvSource}` : '']
      .filter(Boolean)
      .join('\n') || null;

    valid.push({
      name,
      phone: phone.e164,
      email: at(row, iEmail) || null,
      source: IMPORT_SOURCE,
      notes: mergedNotes,
      service_interest: at(row, iService) || null,
      status: IMPORT_STATUS,
      external_id: phone.e164,
    });
  });

  return {
    valid,
    skipped,
    counts: { total: rows.length, valid: valid.length, skipped: skipped.length, byReason },
  };
}

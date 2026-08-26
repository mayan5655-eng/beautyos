// lib/search/matchQuery.ts
//
// One matcher for the "search by name or phone" boxes on the leads and clients
// screens. Pure: no I/O, no React, testable directly.
//
// ── The bug this exists to fix ────────────────────────────────────────────
// Both screens matched with a raw `record.phone?.includes(query)` and a raw
// `record.name?.includes(query)`. Two things were broken by that, and the first
// one made real data unfindable.
//
// PHONE FORMAT. The importer normalises to E.164 and the app stores whatever
// she typed, so the leads table now holds both side by side:
//
//   phone = "0542845655"      created in the app
//   phone = "972526666306"    imported
//
// Typing 052 found the first and none of the imported ones. Typing 0526666306 -
// the number as she would read it off her own phone - found nothing at all. She
// could not look up a lead by the only identifier she actually knows.
//
// CASE. `includes` is case-sensitive, so "sigal" did not match
// "Sigal Hakak Ben-Yacov". Irrelevant for Hebrew, which has no case, and
// exactly wrong for the Latin names her imported file is full of. Note the
// app's own global top-bar search already lowercases correctly - the two
// screen-level searches were the inconsistent ones.
//
// ── How phones are compared ───────────────────────────────────────────────
// Both sides are reduced to the Israeli national significant number - digits
// only, with a leading 972 or a leading 0 removed - and then compared as a
// SUBSTRING, not a prefix or a suffix:
//
//   stored 972526666306 -> 526666306
//   stored 0542845655   -> 542845655
//   query  052          -> 52          matches the first, not the second
//   query  0526666306   -> 526666306   matches
//   query  6666306      -> 6666306     matches (a middle chunk is still useful)
//
// Substring rather than suffix because she types partial numbers from either
// end: the first three digits she remembers, or the last four off a caller ID.
//
// A raw-digit comparison is kept as a second chance so that pasting the value
// exactly as stored always works, including for anything that is not an Israeli
// mobile at all - a landline, or an international number the importer refused.

/** Digits only. Strips +, -, spaces, parentheses, Hebrew, everything. */
export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Israeli national significant number: digits with the country code or the
 * trunk 0 removed. Returns '' when nothing is left, which the caller must treat
 * as "no usable phone form" rather than as a match-everything wildcard.
 */
export function nationalDigits(value: string | null | undefined): string {
  const d = digitsOnly(value);
  if (d.startsWith('972')) return d.slice(3);
  if (d.startsWith('0')) return d.replace(/^0+/, '');
  return d;
}

/** Does one stored phone match one query term? */
export function phoneMatches(stored: string | null | undefined, term: string): boolean {
  const qDigits = digitsOnly(term);
  if (!qDigits) return false;

  const sDigits = digitsOnly(stored);
  if (!sDigits) return false;

  // Literal match on exactly what is stored - covers pasting the stored value,
  // and non-Israeli numbers that nationalDigits would mangle.
  if (sDigits.includes(qDigits)) return true;

  // Both reduced to the national form, so 052... and 97252... are the same
  // number regardless of which one is stored and which one she typed.
  const qNat = nationalDigits(term);
  const sNat = nationalDigits(stored);
  if (!qNat || !sNat) return false;
  return sNat.includes(qNat);
}

/** Does one stored text field match one query term? Case-insensitive. */
export function textMatches(stored: string | null | undefined, term: string): boolean {
  if (!term) return false;
  return String(stored ?? '').toLowerCase().includes(term);
}

export interface MatchFields {
  /** Name, service interest, email, source - anything compared as text. */
  text?: Array<string | null | undefined>;
  /** Compared digit-wise, in both stored and national form. */
  phones?: Array<string | null | undefined>;
}

/**
 * True when EVERY whitespace-separated term in the query matches at least one
 * field.
 *
 * All-terms-must-match is what makes "sigal ben" find "Sigal Hakak Ben-Yacov"
 * while "sigal cohen" does not - typing more should narrow the list, which a
 * single `includes` over the whole query cannot do (it would need the words
 * adjacent and in order).
 *
 * An empty query matches everything, matching what the screens did before:
 * an empty search box is not a filter.
 */
export function matchesQuery(query: string | null | undefined, fields: MatchFields): boolean {
  const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const texts = fields.text ?? [];
  const phones = fields.phones ?? [];

  return terms.every((term) =>
    texts.some((t) => textMatches(t, term)) || phones.some((p) => phoneMatches(p, term))
  );
}

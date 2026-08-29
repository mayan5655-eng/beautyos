// lib/ai/profileHygiene.ts
//
// Guards between what is stored about the business and what an AI is allowed to
// write in public copy on her behalf.
//
// The three problems here all have the same shape: a field that is perfectly
// fine as internal data becomes a liability the moment it is published under
// her name. A login handle is a fine primary key and a terrible byline. A
// half-typed address is fine in a private note and reads as a broken autofill
// in a Facebook post. And a treatment she is qualified to PERFORM is not
// automatically one she is permitted to ADVERTISE.

// ── Treatments that must never appear in advertising ─────────────────────────
//
// In Israel, injectables and blood-derived procedures are medical acts
// restricted to physicians. A cosmetician may have them on her price list
// because a visiting doctor performs them, or because the list is aspirational,
// or because the line means something else entirely - but a Facebook post in
// her name offering בוטוקס at ₪800 is an advertising problem regardless of
// which of those is true, and it is not one she is likely to spot in the fifth
// of five generated variations.
//
// So the rule is: these never reach the prompt as advertisable services, and
// GROUNDING_RULES separately forbids naming them even if they leak in some
// other way. Two independent guards, because either alone is one edit from
// being removed by someone who does not know why it is there.
//
// DELIBERATELY CONSERVATIVE. "טיפול פלזמה" is flagged because PRP is medical,
// even though a non-invasive "plasma pen" device shares the name. Over-blocking
// costs her one line of copy; under-blocking costs her a regulator. The right
// long-term fix is a per-service `advertisable` flag on service_prices that she
// controls - this list is the safe default until that exists.
const REGULATED_PATTERNS: RegExp[] = [
  /בוטוק?ס/i,                    // botox (בוטוקס / בוטקס)
  /\bbotox\b/i,
  /פילר/i,                       // dermal filler
  /\bfiller/i,
  /חומצה\s*היאלורונית/i,
  /\bhyaluron/i,
  /הזרק|זריק/i,                  // injections, any form
  /\binject/i,
  /מזותרפי/i,
  /\bmesotherap/i,
  /פלזמה|פי\.?אר\.?פי/i,         // PRP / plasma
  /\bprp\b|\bplasma\b/i,
  /ליפוליז/i,
  /\blipolys/i,
  /חוטים\s*מותח|חוטי\s*הרמה/i,   // thread lift
  /\bthread\s*lift/i,
];

/** True when a service line must not be named in public marketing copy. */
export function isRegulatedTreatment(name: string): boolean {
  const s = String(name || '');
  return REGULATED_PATTERNS.some((re) => re.test(s));
}

/**
 * Split a service menu into what may be advertised and what may not.
 * Both halves are returned: the caller needs the count of the blocked half to
 * tell her why a treatment is missing from her posts.
 */
export function splitAdvertisable<T>(
  services: T[],
  nameOf: (s: T) => string
): { advertisable: T[]; restricted: T[] } {
  const advertisable: T[] = [];
  const restricted: T[] = [];
  for (const s of services) {
    (isRegulatedTreatment(nameOf(s)) ? restricted : advertisable).push(s);
  }
  return { advertisable, restricted };
}

// ── Names ────────────────────────────────────────────────────────────────────

/**
 * True when a "name" is really a login handle.
 *
 * settings.therapist_name is whatever was captured at signup, which for this
 * account is "mayan5655". Handed to the model as שם הקוסמטיקאית, it produced a
 * post referring to her as "מיין" - it reverse-engineered a first name out of a
 * username. Better to give the model no name than a wrong one: with the field
 * absent it writes in first person, which is what the copy wants anyway.
 *
 * Digits or an @ are the giveaway; so is an all-lowercase ASCII token with no
 * spaces. A real name - Hebrew, or capitalised Latin - passes.
 */
export function looksLikeLoginHandle(name: string): boolean {
  const s = String(name || '').trim();
  if (!s) return true;
  if (/\d/.test(s)) return true;
  if (s.includes('@')) return true;
  if (/^[a-z0-9._\-]+$/.test(s)) return true; // "mayan", "maayan_b"
  return false;
}

/** The name, or undefined when it is a handle rather than a name. */
export function usableTherapistName(name?: string | null): string | undefined {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s || looksLikeLoginHandle(s)) return undefined;
  return s;
}

// ── Addresses ────────────────────────────────────────────────────────────────

/**
 * Parse the clinic address into something publishable, or nothing.
 *
 * public_address is free text with a "רחוב, עיר" placeholder, and this account
 * holds "אחד העם 6 רג" - a street, a number, and two characters where the city
 * should be. That string went out verbatim in four generated posts as
 * "באחד העם 6, רג", which reads as a broken autofill to every local who sees it.
 *
 * The rule is full address or none. A city shorter than three characters is an
 * abbreviation or a typo, not somewhere anyone can search for, so the whole
 * address is dropped rather than published half-written. Losing the local angle
 * is a real cost - it is still cheaper than publishing a wrong address.
 */
export function parseClinicAddress(raw?: string | null): { full: string; city: string } | null {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!s) return null;

  // The comma is the contract — the field's own placeholder is "רחוב, עיר".
  //
  // Without one there is no safe way to find the city: guessing the last
  // whitespace token turns "הרצל 12 תל אביב" into "אביב", and most Israeli
  // cities are two words (תל אביב, רמת גן, באר שבע, כפר סבא, ראשון לציון), so
  // the guess is wrong more often than right — and it fails loudest exactly
  // where the geo hashtag matters most. Better no address than a confident
  // wrong one.
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const city = parts[parts.length - 1];
  // A city that is numeric or an abbreviation is not somewhere anyone searches.
  if (city.length < 3 || /^\d+$/.test(city)) return null;
  return { full: s, city };
}

/**
 * A hashtag-safe form of a city name: Hebrew tags do not take underscores, and
 * a multi-word city has to close up rather than break into two tags.
 */
export function cityHashtag(city: string): string {
  return '#' + String(city || '').replace(/[\s_"'׳״]/g, '');
}

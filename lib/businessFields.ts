// lib/businessFields.ts
//
// Which kind of business a tenant practices — cosmetics, nails, or (soon)
// more. Multi-select at onboarding, changeable later in Settings → כללי.
//
// ONE list. Every place that needs to know the set of fields — the picker in
// onboarding and in Settings, the seed service menu, default-image lookup,
// the marketing template gallery, the AI prompt persona — imports FieldKey
// and BUSINESS_FIELDS from here rather than repeating the enum. Adding a
// third field later is one entry here, one seed group in lib/tenantTemplate,
// one image-rule table, and a handful of design templates — not a schema
// change and not a hunt through five files for a hardcoded 'cosmetics'.
//
// A tenant with more than one field gets the UNION of every field's seed
// menu, default images and templates. Picking a second field never hides or
// removes anything from the first.

export type FieldKey = 'cosmetics' | 'nails';

export type BusinessField = {
  key: FieldKey;
  /** Shown in the picker and used as the AI persona noun. */
  label: string;
  /** One line under the label — what it covers, so the choice is legible at
   *  a glance instead of a bare category word. */
  hint: string;
};

// Order here is display order everywhere: the picker, a multi-field
// tenant's grouped service menu, the template gallery's field badge.
export const BUSINESS_FIELDS: BusinessField[] = [
  { key: 'cosmetics', label: 'קוסמטיקה וטיפוח פנים', hint: 'טיפולי פנים, גבות וריסים, הסרת שיער' },
  { key: 'nails', label: 'מניקור ופדיקור', hint: "ג'ל, לק, עיצוב ציפורניים" },
];

export const FIELD_KEYS: FieldKey[] = BUSINESS_FIELDS.map((f) => f.key);

// Every tenant on this product today is a cosmetician — this is the migration
// column's own default (see supabase/migrations/add_business_fields.sql) and
// the fallback below, so the two can never disagree.
export const DEFAULT_BUSINESS_FIELDS: FieldKey[] = ['cosmetics'];

export function isFieldKey(v: unknown): v is FieldKey {
  return typeof v === 'string' && (FIELD_KEYS as string[]).includes(v);
}

/**
 * Reads settings.business_fields defensively.
 *
 * A missing column (migration not yet run), a null, an empty array (she
 * reached the end of onboarding without picking one) or anything malformed
 * all fall back to cosmetics — never to an empty result that would leave the
 * seed picker, the template gallery or an AI prompt with nothing to show.
 */
export function businessFieldsOf(
  settings: { business_fields?: unknown } | null | undefined
): FieldKey[] {
  const raw = settings?.business_fields;
  if (Array.isArray(raw)) {
    const valid = raw.filter(isFieldKey);
    if (valid.length > 0) return valid;
  }
  return DEFAULT_BUSINESS_FIELDS;
}

export function fieldLabel(key: FieldKey): string {
  return BUSINESS_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/** True if `fields` includes at least one of `targets`. Used everywhere a
 *  template, image or prompt is tagged with the field(s) it applies to. */
export function fieldsIntersect(fields: FieldKey[], targets: FieldKey[]): boolean {
  return fields.some((f) => targets.includes(f));
}

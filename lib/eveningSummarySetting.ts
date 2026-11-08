// lib/eveningSummarySetting.ts
//
// Where the "סיכום ערב" switch lives.
//
// It used to be `settings.branding.evening_summary`. `branding` is the PUBLIC bag: it feeds her booking page, her
// link previews and the public branding RPC, so a private preference sat in the one place built to be shown to
// strangers (2026-11-05 product review, "broken or inconsistent" 4). Every other owner automation lives in
// `settings.automations`, so this one does too now.
//
//   READ    automations.evening_summary when it is a boolean (the new place, wins), else the old
//           branding.evening_summary === true, so a tenant who turned it on before this change keeps it on.
//   WRITE   automations.evening_summary only. Any save that writes both bags also removes the old branding key
//           (moveEveningSummaryOnSave, called by lib/settingsColumns.mergeStoredBags), carrying its value across first
//           when the new place has none.
//   PUBLIC  stripPrivateBranding drops the key from anything handed to a public page, for rows not yet re-saved.
//           move_evening_summary_2026-11-05.sql moves every tenant at once (hand-run, optional: the code does not
//           depend on it).
//
// Pure, no imports: used by the cron (lib/eveningRun.js), the settings save, the Settings screen and the public layer.

export const EVENING_SUMMARY_KEY = 'evening_summary';

type Bag = Record<string, unknown>;
const asObj = (v: unknown): Bag | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bag) : null);

/** Is the evening summary on for this settings row? New place first, old place as the fallback. */
export function eveningSummaryOn(row: { automations?: unknown; branding?: unknown } | null | undefined): boolean {
  const autos = asObj(row?.automations);
  if (autos && typeof autos[EVENING_SUMMARY_KEY] === 'boolean') return autos[EVENING_SUMMARY_KEY] as boolean;
  const branding = asObj(row?.branding);
  return branding?.[EVENING_SUMMARY_KEY] === true;
}

/**
 * The Settings draft with the switch set: written to automations, removed from the branding draft.
 * (Removing it from the draft alone does not clear the stored copy, because a save merges into the stored bag;
 * moveEveningSummaryOnSave does that on the server.)
 */
export function withEveningSummary<T extends { automations?: unknown; branding?: unknown }>(draft: T, on: boolean): T {
  const autos = asObj(draft?.automations) || {};
  const branding = asObj(draft?.branding);
  const next = { ...draft, automations: { ...autos, [EVENING_SUMMARY_KEY]: on === true } } as T;
  if (branding && EVENING_SUMMARY_KEY in branding) {
    const { [EVENING_SUMMARY_KEY]: _old, ...rest } = branding; // eslint-disable-line @typescript-eslint/no-unused-vars
    (next as { branding?: unknown }).branding = rest;
  }
  return next;
}

/**
 * On a save that writes BOTH bags (the merged payload): carry an old branding value into automations when the new place
 * has none, then remove it from branding. A save that writes only one bag is left alone, so the value is never lost.
 */
export function moveEveningSummaryOnSave(payload: Bag): Bag {
  const autos = asObj(payload.automations);
  const branding = asObj(payload.branding);
  if (!autos || !branding || !(EVENING_SUMMARY_KEY in branding)) return payload;
  const nextAutos = typeof autos[EVENING_SUMMARY_KEY] === 'boolean'
    ? autos
    : { ...autos, [EVENING_SUMMARY_KEY]: branding[EVENING_SUMMARY_KEY] === true };
  const { [EVENING_SUMMARY_KEY]: _old, ...rest } = branding; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...payload, automations: nextAutos, branding: rest };
}

/** A branding bag safe to hand to a public page: private owner preferences removed. Anything else passes through. */
export function stripPrivateBranding<T>(branding: T): T {
  const b = asObj(branding);
  if (!b || !(EVENING_SUMMARY_KEY in b)) return branding;
  const { [EVENING_SUMMARY_KEY]: _old, ...rest } = b; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest as T;
}

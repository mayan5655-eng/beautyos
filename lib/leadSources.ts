// lib/leadSources.ts
//
// Where a lead came from. Two things live here and nowhere else:
//
//   1. the list of sources SHE picks from by hand. It starts as the defaults below and is hers to edit in
//      Settings > Clients and leads; the edited list is stored in settings.automations.lead_sources (a plain
//      array of short strings), so no migration is needed and a tenant that never edits it keeps the defaults.
//   2. the Hebrew label for a machine-written source (the importer stamps csv_import, the Facebook webhook
//      stamps facebook_lead_ad, the scanner stamps skin_scan). Anything unknown passes through unchanged.
//
// A source is a free string on leads.source. Editing the list never rewrites leads: a lead keeps whatever
// source it was created with, and the report groups by what is stored, so removing "טיקטוק" from her list does
// not make last month's TikTok leads disappear from the report.

export const DEFAULT_LEAD_SOURCES: readonly string[] = [
  'פייסבוק', 'אינסטגרם', 'גוגל', 'טיקטוק', 'המלצה', 'הליכה ברחוב', 'סורק העור', 'אחר',
];

export const MAX_LEAD_SOURCES = 20;
export const MAX_SOURCE_LENGTH = 30;

const SOURCE_LABELS_HE: Record<string, string> = {
  csv_import: 'ייבוא מקובץ',
  facebook_lead_ad: 'מודעת לידים בפייסבוק',
  skin_scan: 'סורק העור',
};

/** The label to SHOW for a stored source value. Unknown values pass through; empty is "לא ידוע". */
export function sourceLabelHe(src: unknown): string {
  const s = String(src ?? '').trim();
  if (!s) return 'לא ידוע';
  return SOURCE_LABELS_HE[s] || s;
}

/** One source name as it may be stored: trimmed, single-spaced, cut at the limit. Empty when unusable. */
export function cleanSourceName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_LENGTH);
}

/**
 * The list she picks from. `automations` is the settings bag (or anything); a missing, empty or malformed
 * value is the default list, never an empty picker. Duplicates (case-insensitive) are dropped, order is kept.
 */
export function resolveLeadSources(automations: unknown): string[] {
  const raw = automations && typeof automations === 'object' && !Array.isArray(automations)
    ? (automations as Record<string, unknown>).lead_sources
    : null;
  if (!Array.isArray(raw)) return [...DEFAULT_LEAD_SOURCES];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = cleanSourceName(item);
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= MAX_LEAD_SOURCES) break;
  }
  return out.length ? out : [...DEFAULT_LEAD_SOURCES];
}

/** The value to store back: the same cleaning, so what she sees is what is saved. */
export function normalizeLeadSourcesForSave(list: unknown): string[] {
  return resolveLeadSources({ lead_sources: list });
}

// lib/design/reels/index.ts
//
// The reel library, the same way lib/design/templates/index.ts is the
// static one: plain data at a fixed (key, version), hashed into the same
// lock file, immutable by test.

import type { Category, TemplateGroup } from '../contract.ts';
import type { ReelTemplate } from '../reel.ts';
import type { FieldKey } from '../../businessFields.ts';
import { REELS as LAUNCH } from './launch.ts';
import { NAILS_REELS } from './nails.ts';

export const REELS: ReelTemplate[] = [...LAUNCH, ...NAILS_REELS];

/** A reel at an exact version, or null. */
export function getReel(key: string, version?: number | null): ReelTemplate | null {
  const same = REELS.filter((r) => r.key === key);
  if (!same.length) return null;
  if (version == null) return same.reduce((a, b) => (b.version > a.version ? b : a));
  return same.find((r) => r.version === version) || null;
}

/** The newest version of every reel, for the gallery. `fields`, when given,
 *  keeps only reels sharing at least one field with it — same rule as
 *  lib/design/templates/index.ts's galleryTemplates. Omitted shows every
 *  field, unchanged from before this parameter existed. */
export function latestReels(category?: Category | null, group?: TemplateGroup | null, fields?: FieldKey[] | null): ReelTemplate[] {
  const byKey = new Map<string, ReelTemplate>();
  for (const r of REELS) {
    const cur = byKey.get(r.key);
    if (!cur || r.version > cur.version) byKey.set(r.key, r);
  }
  return [...byKey.values()].filter((r) =>
    (!category || r.category === category) &&
    (!group || r.group === group) &&
    (!fields || !fields.length || r.fields.some((f) => fields.includes(f)))
  );
}

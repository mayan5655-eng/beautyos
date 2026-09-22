// lib/design/templates/index.ts
//
// The library. Every template is a plain object (JSON-shaped, a test proves
// it round-trips through JSON.stringify) at a fixed (key, version). A saved
// design points at both, so a new version never re-flows an old design:
// add a file, bump the version, keep the old one.
//
// Versions are immutable by test: templates.lock.json holds a hash of every
// (key, version) and test-design-templates.ts fails when a hash moves.

import type { Template, Category } from '../contract.ts';
import { offerFeedV1 } from './offer-feed.v1.ts';
import { beforeAfterFeedV1 } from './before-after-feed.v1.ts';
import { tipFeedV1 } from './tip-feed.v1.ts';
import { reviewFeedV1 } from './review-feed.v1.ts';
import { newTreatmentFeedV1 } from './new-treatment-feed.v1.ts';
import { seasonalFeedV1 } from './seasonal-feed.v1.ts';

export const TEMPLATES: Template[] = [
  offerFeedV1,
  beforeAfterFeedV1,
  tipFeedV1,
  reviewFeedV1,
  newTreatmentFeedV1,
  seasonalFeedV1,
];

/** A template at an exact version, or null. */
export function getTemplate(key: string, version?: number | null): Template | null {
  const same = TEMPLATES.filter((t) => t.key === key);
  if (!same.length) return null;
  if (version == null) return same.reduce((a, b) => (b.version > a.version ? b : a));
  return same.find((t) => t.version === version) || null;
}

/** The newest version of every key, for the gallery. */
export function latestTemplates(category?: Category | null): Template[] {
  const byKey = new Map<string, Template>();
  for (const t of TEMPLATES) {
    const cur = byKey.get(t.key);
    if (!cur || t.version > cur.version) byKey.set(t.key, t);
  }
  return [...byKey.values()].filter((t) => !category || t.category === category);
}

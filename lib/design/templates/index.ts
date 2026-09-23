// lib/design/templates/index.ts
//
// The library. Every template is a plain object (JSON-shaped, a test proves
// it round-trips through JSON.stringify) at a fixed (key, version). A saved
// design points at both, so a new version never re-flows an old design:
// add a file, bump the version, keep the old one.
//
// Versions are immutable by test: templates.lock.json holds a hash of every
// (key, version) and test-design-templates.ts fails when a hash moves.
//
// Two generations live here: the six hand-written v1 templates of the first
// stage, and the studio look built from short definitions by cream.ts
// (feed 4:5 and story 9:16 of each). New keys go in cream/*.ts.

import type { Template, Category, TemplateGroup } from '../contract.ts';
import { offerFeedV1 } from './offer-feed.v1.ts';
import { beforeAfterFeedV1 } from './before-after-feed.v1.ts';
import { tipFeedV1 } from './tip-feed.v1.ts';
import { reviewFeedV1 } from './review-feed.v1.ts';
import { newTreatmentFeedV1 } from './new-treatment-feed.v1.ts';
import { seasonalFeedV1 } from './seasonal-feed.v1.ts';
import { creamTemplates, type CreamDef } from './cream.ts';
import { EVERGREEN } from './cream/evergreen.ts';
import { HOLIDAYS } from './cream/holidays.ts';
import { CLOSERS } from './cream/closers.ts';

export const CREAM_DEFS: CreamDef[] = [...EVERGREEN, ...HOLIDAYS, ...CLOSERS];

export const TEMPLATES: Template[] = [
  offerFeedV1,
  beforeAfterFeedV1,
  tipFeedV1,
  reviewFeedV1,
  newTreatmentFeedV1,
  seasonalFeedV1,
  ...CREAM_DEFS.flatMap(creamTemplates),
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

/** 'offer-story' -> 'offer-feed': the 4:5 sibling the gallery shows as the card. */
export const feedKeyOf = (key: string) => key.replace(/-story$/, '-feed');
/** 'offer-feed' -> the newest 'offer-story', or null when the key has no 9:16 version. */
export function storySibling(feedKey: string): Template | null {
  if (!/-feed$/.test(feedKey)) return null;
  return getTemplate(feedKey.replace(/-feed$/, '-story'));
}

/**
 * Newest templates with a card in the gallery: the studio generation only
 * (a template with a group), one card per key, stories folded into their
 * feed sibling. The first-stage v1 templates stay in TEMPLATES so saved
 * designs reopen, but they are no longer offered.
 */
export function galleryTemplates(category?: Category | null, group?: TemplateGroup | null): Template[] {
  const latest = latestTemplates(category).filter((t) => t.group && (!group || t.group === group));
  const feedKeys = new Set(latest.map((t) => t.key));
  return latest.filter((t) => !(/-story$/.test(t.key) && feedKeys.has(feedKeyOf(t.key))));
}

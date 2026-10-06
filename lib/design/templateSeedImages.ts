// lib/design/templateSeedImages.ts
//
// Before this, every template's photo slot with nothing of her own to show
// (no upload, no gallery, no clinic photo - the common case before she has
// uploaded anything) rendered as an empty colour-gradient placeholder in
// DomPreview: `fill.images[slot.key]` was simply null and the <img> never
// rendered. The gallery looked identical, template after template, until
// she had real content of her own.
//
// Each template's photo slot already carries a hand-written `aiHint` (see
// lib/design/templates/cream.ts's compiler and every def in
// lib/design/templates/cream/*.ts) - a per-template photographic direction,
// written for the paid on-demand AI fill, never before used to pre-render a
// FREE static preview. scripts/generate-template-seed-images.ts generates
// one real photo per template from that exact hint (same STYLE prefix as
// lib/defaultImages.js's set, so the two read as one family) and commits it
// under public/defaults/seed/. This file is only the map from a template's
// key to that file - the fallback fillTemplate reaches for last, after
// everything of her own.
//
// One file per CONCEPT, not per format: 'offer-feed' and 'offer-story' are
// the same subject at a different crop, so they share one seed image - the
// stem strips the trailing -feed/-story. A consent-gated slot (before/after,
// a real client photo) never uses one of these, whatever the template.

import { SEED_STEMS } from './templateSeedManifest.ts';

/** 'offer-feed' -> 'offer', 'nail-french-story' -> 'nail-french'. */
function stem(templateKey: string): string {
  return templateKey.replace(/-(feed|story)$/, '');
}

/**
 * The seed image for a template, or null when none was generated.
 *
 * Null is a real answer: the preview then draws its clean placeholder. Before this check the URL was built
 * for every template, so each one whose image had never been made (every reel scene, and story-only
 * templates - the generator covered neither) requested a file that 404'd and showed a broken-image icon.
 * The list of files that exist is lib/design/templateSeedManifest.ts (scripts/seed-manifest.mjs).
 */
export function templateSeedImageUrl(templateKey: string): string | null {
  const s = stem(templateKey);
  return SEED_STEMS.has(s) ? `/defaults/seed/${s}.jpg` : null;
}

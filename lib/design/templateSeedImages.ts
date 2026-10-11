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

// ── The Kalmea pack (lib/design/templates/pack, lib/design/reels/pack*.ts) ──────────────────────────────────
//
// The pack's templates have no generated seed of their own: scripts/generate-template-seed-images.ts covers the
// cream library, and the pack was built after it. Without a seed the gallery fell back to HER first gallery or
// hero picture (mapBranding takes gallery[0] for every slot), so every new card showed the same photo.
//
// Each photo-led pack template now borrows an existing seed picture, chosen once, by hand, by topic and field -
// a fixed table, so the same template always shows the same picture (deterministic by key). The choices:
//   - are in the right field (nails templates take nail pictures, cosmetics templates take skin pictures)
//   - are different from each other inside the pack
//   - for statics, come from a section the pack's cards do not sit next to: the pack's cards are lifted to the
//     front of "evergreen" (DesignStudio), so a picture owned by an evergreen template is never used
//     (test-design-seeds.ts walks every gallery section and fails on two neighbours with the same picture)
// Presenter templates are not here on purpose: their picture is their AI character, never a general default.
// Graphic and statement templates have no photo slot.
const PACK_STATIC_SEEDS: Record<string, string> = {
  'pk-skin-consultation': 'info',
  'pk-meet-cosmetician': 'skin-health',
  'pk-nail-bold-colour': 'nail-clearance',
  'pk-nail-refresh': 'nail-testimonial-story',
  'pk-meet-nail-tech': 'nail-mother-daughter',
};

/** A reel with one shared picture shows that picture on every scene; a tour has one per scene. */
const PACK_REEL_SEEDS: Record<string, string | string[]> = {
  'pk-nail-french-reel': 'nail-french',
  'pk-nail-burgundy-reel': 'nail-winter-palette',
  'pk-nail-studio-reel': 'nail-design-showcase',
  'pk-nail-nude-reel': 'nail-new-shade',
  'pk-nail-art-reel': 'nail-art-macro',
  'pk-nail-chrome-reel': 'nail-chrome-ombre',
  'pk-skin-clinic-tour-reel': ['info', 'pampering', 'massage'],
};

/** The existing seed a pack template borrows, or null when it is not a pack template with a photo. */
function packSeedStem(templateKey: string): string | null {
  const own = PACK_STATIC_SEEDS[stem(templateKey)];
  if (own) return own;
  const m = templateKey.match(/^(pk-.+-reel)-s(\d+)$/);
  if (!m) return null;
  const seed = PACK_REEL_SEEDS[m[1]];
  if (!seed) return null;
  return Array.isArray(seed) ? seed[Number(m[2]) - 1] ?? null : seed;
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
  const borrowed = packSeedStem(templateKey);
  if (borrowed) return SEED_STEMS.has(borrowed) ? `/defaults/seed/${borrowed}.jpg` : null;
  const s = stem(templateKey);
  return SEED_STEMS.has(s) ? `/defaults/seed/${s}.jpg` : null;
}

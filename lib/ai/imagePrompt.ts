// lib/ai/imagePrompt.ts
//
// The contract between the (future) Creative Director and the image model.
//
// Stage 1 of the creatives work: the SHAPE is final, the body is minimal.
// `ImagePromptSpec` is everything the Creative Director will receive in the
// next stage - brand kit, campaign, service, offer, her request, the chosen
// visual direction - and `composeImagePrompt` is the one function that turns
// it into the string sent to OpenAI. Stage 2 replaces the body of that
// function with the director's prompt, not its signature.
//
// The one rule that never changes: the picture carries NO typography. No
// text, no numbers, no price, no logo, no call to action, no watermark. The
// headline, the price and the logo are drawn later by the app as a separate
// layer, so Hebrew is always exact and editable. The model is told this in
// the same words every time (HARD_CONSTRAINTS), and the offer text is used
// for mood only, with its digits removed, so "249 ₪" never becomes pixels.

import type { FieldKey } from '../businessFields.ts';

export type ImageFormat = 'feed45' | 'square' | 'story';

/** Where the design layer will put the typography, so the picture leaves room. */
export type NegativeSpace = 'top' | 'bottom' | 'none';

export type ImagePromptSpec = {
  /** What she typed, e.g. "טיפול פנים קלאסי במבצע 249 ₪". */
  request: string;
  /** The treatment / service the campaign is about. */
  service?: string | null;
  /** The offer or price line. Mood only - digits are stripped before use. */
  offer?: string | null;
  campaign?: { name?: string | null; goal?: string | null; audience?: string | null } | null;
  brandKit?: {
    businessName?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    /** clean | luxury | natural | bold | minimal (free text tolerated) */
    visualStyle?: string | null;
    tone?: string | null;
    /** What she never wants to see. */
    avoid?: string | null;
    /** Notes distilled from her reference images (stage 2+). */
    referenceNotes?: string | null;
  } | null;
  direction?: {
    name?: string | null;
    concept?: string | null;
    /** Composition strategy: framing, subject, lens, light. */
    composition?: string | null;
    negativeSpace?: NegativeSpace | null;
    palette?: string[] | null;
  } | null;
  format?: ImageFormat;
  /**
   * "Another variation": same direction, same brand, same offer, same
   * composition strategy - a genuinely different picture. The index makes
   * successive takes diverge instead of repeating.
   */
  variation?: { index: number; hint?: string | null } | null;
  /** Her business_fields (lib/businessFields.ts). Decides the opening line's
   *  subject — see campaignPhotoStyle. Unset reads as cosmetics, the exact
   *  text every image prompt used unconditionally before this existed. */
  fields?: FieldKey[] | null;
};

/** Sizes the model accepts (custom WIDTHxHEIGHT: multiples of 16, ratio 1:3..3:1). */
export const FORMAT_SIZES: Record<ImageFormat, string> = {
  feed45: '1024x1280', // Instagram feed 4:5 - the default
  square: '1024x1024',
  story: '1024x1536',  // 2:3, the closest recommended size to 9:16; cropped by the design layer
};

export const HARD_CONSTRAINTS =
  'Strictly no text of any kind: no letters, no words, no numbers, no price tags, no captions, ' +
  'no signage, no labels on products, no logos, no brand marks, no watermarks, no call-to-action, ' +
  'no UI elements, no borders or frames. The picture is a clean photograph only; all typography ' +
  'is added later as a separate layer.';

/** Keep the prompt well inside what the API accepts. */
export const MAX_PROMPT_CHARS = 3500;

const NEGATIVE_SPACE_TEXT: Record<NegativeSpace, string> = {
  top: 'Composition leaves the top third of the frame as calm, uncluttered negative space ' +
       '(soft background, gentle gradient or out-of-focus surface) where a headline will be placed later.',
  bottom: 'Composition leaves the bottom third of the frame as calm, uncluttered negative space ' +
          '(soft background, gentle gradient or out-of-focus surface) where a headline will be placed later.',
  none: '',
};

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * The opening line's subject: what kind of business, what kind of "editorial
 * quality" detail (skin, or hand-and-nail). This is the single highest-impact
 * hardcoded line an image prompt carried before business_fields existed —
 * unconditionally "Israeli cosmetics clinic... skin texture" on EVERY
 * generated image regardless of template. The cosmetics case below is that
 * exact original sentence, unchanged, so a profile with no fields set (or
 * only 'cosmetics') produces byte-identical output to before.
 */
export function campaignPhotoStyle(fields?: FieldKey[] | null): string {
  const has = (f: FieldKey) => !!fields && fields.includes(f);
  if (has('nails') && !has('cosmetics')) {
    return 'Professional beauty campaign photograph for an Israeli nail studio, ' +
      'editorial quality, natural realistic hand and nail detail, soft flattering light, shallow depth of field.';
  }
  if (has('nails') && has('cosmetics')) {
    return 'Professional beauty campaign photograph for an Israeli beauty studio offering cosmetic and nail treatments, ' +
      'editorial quality, natural realistic skin and nail detail, soft flattering light, shallow depth of field.';
  }
  return 'Professional beauty campaign photograph for an Israeli cosmetics clinic, ' +
    'editorial quality, natural realistic skin texture, soft flattering light, shallow depth of field.';
}

/** "249 ₪ במבצע" -> "₪ במבצע": the mood of an offer without anything the model could letter. */
export function stripDigits(v: unknown): string {
  return clean(v).replace(/[0-9٠-٩]+([.,][0-9]+)?/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function composeImagePrompt(spec: ImagePromptSpec): string {
  const bk = spec.brandKit || {};
  const d = spec.direction || {};
  const parts: string[] = [];

  // Stage 1 body: a professional beauty campaign photograph of her request.
  parts.push(campaignPhotoStyle(spec.fields));
  const subject = clean(spec.request);
  if (subject) parts.push(`Subject: ${subject}.`);
  if (clean(spec.service)) parts.push(`Treatment in focus: ${clean(spec.service)}.`);
  if (stripDigits(spec.offer)) parts.push(`Mood: a promotional campaign (${stripDigits(spec.offer)}), inviting and premium.`);
  if (clean(d.concept)) parts.push(`Creative concept: ${clean(d.concept)}.`);
  if (clean(d.composition)) parts.push(`Composition: ${clean(d.composition)}.`);
  if (clean(bk.visualStyle)) parts.push(`Visual style: ${clean(bk.visualStyle)}.`);
  const palette = [
    ...(Array.isArray(d.palette) ? d.palette : []),
    bk.primaryColor, bk.secondaryColor,
  ].map(clean).filter(Boolean);
  if (palette.length) parts.push(`Colour palette to echo subtly in styling and props: ${palette.join(', ')}.`);
  if (clean(bk.avoid)) parts.push(`Avoid: ${clean(bk.avoid)}.`);
  if (clean(bk.referenceNotes)) parts.push(`Reference notes: ${clean(bk.referenceNotes)}.`);
  if (spec.variation && spec.variation.index > 0) {
    parts.push(
      `Variation ${spec.variation.index + 1}: keep the same concept, style and composition strategy, ` +
      `but a clearly different picture - different angle, framing, moment or model` +
      (clean(spec.variation.hint) ? ` (${clean(spec.variation.hint)})` : '') + '.'
    );
  }
  const ns = NEGATIVE_SPACE_TEXT[(d.negativeSpace as NegativeSpace) || 'bottom'];
  if (ns) parts.push(ns);
  parts.push(HARD_CONSTRAINTS);

  let prompt = parts.join(' ');
  if (prompt.length > MAX_PROMPT_CHARS) {
    // Never trim the constraints: cut the descriptive part instead.
    const keep = MAX_PROMPT_CHARS - HARD_CONSTRAINTS.length - 1;
    prompt = prompt.slice(0, keep).replace(/\s+\S*$/, '') + ' ' + HARD_CONSTRAINTS;
  }
  return prompt;
}

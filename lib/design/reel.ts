// lib/design/reel.ts
//
// A reel template: a ready 9:16 SEQUENCE she picks and fills. It is not a
// new schema - it is a wrapper around story frames. Every scene's frame is
// an ordinary story-format Template (built by the same cream builder, in
// any layout family), so the fill pipeline, the branding, the brand
// toggles, the renderers and the validation all apply per scene unchanged.
// The wrapper adds only what motion needs: seconds, a transition, a motion
// on the photo, and one variable/slot namespace across the scenes.
//
// Namespace: scene N's variable `headline` is `sN_headline` on the reel,
// its slot `photo` is `sN_photo`. Values not hers to type (business name,
// contact, reviews) come from her settings per frame and are not listed on
// the reel. One fill form fills the whole reel; fillReel() splits it back
// into one Fill per scene for whoever draws it.

import type { Category, Format, ImageSource, SlotDef, Template, TemplateGroup, VariableDef } from './contract.ts';
import { validateTemplate } from './contract.ts';
import { fillTemplate, type BrandingInput, type Fill } from './mapBranding.ts';

export type Transition = 'cut' | 'fade' | 'slide';
export type Motion = 'kenburns' | 'none';

export type ReelScene = {
  id: string;
  /** How long the scene stays, in seconds (1.5 .. 8). */
  seconds: number;
  /** How the scene arrives; the first scene always cuts in. */
  transition: Transition;
  /** What the photo does while the scene is on. */
  motion: Motion;
  /** Hebrew, for the fill form's section heading. */
  label: string;
  /** A story-format template: the frame. */
  frame: Template;
};

export type ReelTemplate = {
  key: string;
  version: number;
  category: Category;
  group: TemplateGroup;
  name: string;
  description: string;
  format: 'reel';
  scenes: ReelScene[];
  /** What she must have (shown in the gallery). */
  needs: string[];
  holiday?: string;
  /** A word for her music choice; nothing is bundled. */
  musicVibe?: string;
  /** The union of every scene's fillable variables, namespaced sN_. */
  variables: VariableDef[];
  /** The union of every scene's slots, namespaced sN_. */
  slots: SlotDef[];
};

export const reelId = (r: Pick<ReelTemplate, 'key' | 'version'>) => `${r.key}@${r.version}`;
export const scenePrefix = (i: number) => `s${i + 1}_`;

/** The sources she types or that the AI writes; the rest comes from settings per frame. */
const HERS = new Set<VariableDef['source']>(['user', 'static']);

/** Build the namespaced variable and slot lists from the scenes. */
export function reelSurface(scenes: ReelScene[]): { variables: VariableDef[]; slots: SlotDef[] } {
  const variables: VariableDef[] = [];
  const slots: SlotDef[] = [];
  scenes.forEach((s, i) => {
    const p = scenePrefix(i);
    for (const v of s.frame.variables) if (HERS.has(v.source)) variables.push({ ...v, key: p + v.key, label: `${s.label}: ${v.label}` });
    for (const sl of s.frame.slots) slots.push({ ...sl, key: p + sl.key, label: `${s.label}: ${sl.label}` });
  });
  return { variables, slots };
}

/** A reel from its scenes: the surface is derived, never hand-written. */
export function makeReel(def: { key: string; version: number; category: Category; group: TemplateGroup; name: string; description: string; needs?: string[]; holiday?: string; musicVibe?: string; scenes: ReelScene[] }): ReelTemplate {
  const { variables, slots } = reelSurface(def.scenes);
  const r: ReelTemplate = {
    key: def.key, version: def.version, category: def.category, group: def.group, name: def.name, description: def.description,
    format: 'reel', scenes: def.scenes,
    needs: def.needs || (slots.some((s) => s.consent) ? ['תמונות של לקוחה שאישרה פרסום'] : [`${slots.filter((s) => s.required).length} תמונות (מהגלריה או AI)`]),
    variables, slots,
  };
  if (def.holiday) r.holiday = def.holiday;
  if (def.musicVibe) r.musicVibe = def.musicVibe;
  return r;
}

/** Every problem with a reel, or an empty list. */
export function validateReel(r: ReelTemplate): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9-]+$/.test(r.key)) errors.push(`key "${r.key}" must be kebab-case`);
  if (!Number.isInteger(r.version) || r.version < 1) errors.push('version must be a positive integer');
  if (r.format !== 'reel') errors.push('format must be reel');
  if (r.scenes.length < 2 || r.scenes.length > 6) errors.push('a reel has 2 to 6 scenes');
  const total = r.scenes.reduce((n, s) => n + s.seconds, 0);
  if (total > 30) errors.push(`too long: ${total}s (max 30)`);
  const ids = new Set<string>();
  r.scenes.forEach((s, i) => {
    if (ids.has(s.id)) errors.push(`duplicate scene id ${s.id}`);
    ids.add(s.id);
    if (!(s.seconds >= 1.5 && s.seconds <= 8)) errors.push(`scene ${s.id}: seconds must be 1.5..8`);
    if (s.frame.format !== 'story') errors.push(`scene ${s.id}: frame must be a story template`);
    if (i === 0 && s.transition !== 'cut') errors.push('the first scene cuts in');
    for (const e of validateTemplate(s.frame)) errors.push(`scene ${s.id}: ${e}`);
  });
  const { variables, slots } = reelSurface(r.scenes);
  if (JSON.stringify(variables) !== JSON.stringify(r.variables)) errors.push('variables are not the derived surface');
  if (JSON.stringify(slots) !== JSON.stringify(r.slots)) errors.push('slots are not the derived surface');
  return errors;
}

export type ReelFill = { scenes: Fill[]; missing: string[]; totalSeconds: number };

/** The reel's one value/image map split into a Fill per scene, through the same pipeline as a static design. */
export function fillReel(reel: ReelTemplate, input: BrandingInput): ReelFill {
  const inputs = input.inputs || {};
  const images = input.images || {};
  const missing: string[] = [];
  const scenes = reel.scenes.map((s, i) => {
    const p = scenePrefix(i);
    const own = (m: Record<string, unknown>) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]));
    const fill = fillTemplate(s.frame, { ...input, inputs: own(inputs) as Record<string, string>, images: own(images) as Record<string, string | null> });
    for (const m of fill.missing) missing.push(m.startsWith('slot:') ? `slot:${p}${m.slice(5)}` : p + m);
    return fill;
  });
  return { scenes, missing, totalSeconds: reel.scenes.reduce((n, s) => n + s.seconds, 0) };
}

/** Anything the fill routes accept: a static template or a reel. */
export type Fillable = { key: string; version: number; category: Category; format: Format | 'reel'; name: string; variables: VariableDef[]; slots: SlotDef[] };

export const isReel = (t: Fillable | null | undefined): t is ReelTemplate => !!t && t.format === 'reel';

/** Sources a scene's photo may come from; reels never take a client photo without consent, like statics. */
export const REEL_SOURCES: ImageSource[] = ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'];

// lib/design/safeZone.ts
//
// Where words may sit on a 1080x1920 reel or story. Instagram draws its own interface over the picture: the
// profile row and the "reels" label across the top, and the caption, the account name and the buttons up the
// lower part. A line of text under any of it is a line nobody can read. Content stays inside:
//
//     y 250 .. 1580      x 64 .. 1016
//
// Photos and washes may run to the edge (they are the background, not the message). Only layers that CARRY
// words or a contact - text, logo, rating - are held to the zone. The "AI character" label is a text layer,
// so it is checked too, which is the point: it has to be where it cannot be cropped or covered.
//
// This is a check, not a layout engine: a template builder places things; the test calls this on every new
// reel scene and fails with the layer's id and where it sits.

import type { Layer, Template } from './contract.ts';
import { CANVAS } from './contract.ts';

export const REEL_SAFE = { top: 250, bottom: 1580, side: 64 } as const;

const CARRIES_WORDS = new Set<Layer['type']>(['text', 'logo', 'rating']);

/** Every content layer of a story-format frame that leaves the safe zone, as readable strings. */
export function safeZoneViolations(frame: Template): string[] {
  if (frame.format !== 'story') return [];
  const { w: W, h: H } = CANVAS.story;
  const out: string[] = [];
  for (const l of frame.layers) {
    if (!CARRIES_WORDS.has(l.type)) continue;
    const x = (l.box.x / 100) * W, y = (l.box.y / 100) * H;
    const r = x + (l.box.w / 100) * W, b = y + (l.box.h / 100) * H;
    const why: string[] = [];
    if (y < REEL_SAFE.top - 0.5) why.push(`top ${Math.round(y)} < ${REEL_SAFE.top}`);
    if (b > REEL_SAFE.bottom + 0.5) why.push(`bottom ${Math.round(b)} > ${REEL_SAFE.bottom}`);
    if (x < REEL_SAFE.side - 0.5) why.push(`left ${Math.round(x)} < ${REEL_SAFE.side}`);
    if (r > W - REEL_SAFE.side + 0.5) why.push(`right ${Math.round(r)} > ${W - REEL_SAFE.side}`);
    if (why.length) out.push(`${frame.key}/${l.id}: ${why.join(', ')}`);
  }
  return out;
}

/** The same check across every scene of a reel (anything with `scenes[].frame`). */
export function reelSafeZoneViolations(reel: { key: string; scenes: { id: string; frame: Template }[] }): string[] {
  return reel.scenes.flatMap((s) => safeZoneViolations(s.frame).map((v) => `${reel.key}:${s.id}: ${v}`));
}

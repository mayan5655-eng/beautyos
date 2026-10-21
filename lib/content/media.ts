// lib/content/media.ts
//
// Instagram's API publishes JPEG images only, with a width/height ratio between 4:5 (0.8) and 1.91:1. A picture outside
// that gets soft margins (never cropped), and is drawn at most 1440 px wide. Pure, so the test pins it; the drawing and the
// upload live in app/design/contentMedia.js.

export const MIN_RATIO = 0.8;
export const MAX_RATIO = 1.91;
export const MAX_WIDTH = 1440;

/** Canvas size and where the picture sits on it, for a source of w x h. */
export function fitForInstagram(w: number, h: number): { W: number; H: number; x: number; y: number; dw: number; dh: number } {
  const r = w / h;
  let cw = w, ch = h;
  if (r < MIN_RATIO) cw = Math.round(h * MIN_RATIO);
  else if (r > MAX_RATIO) ch = Math.round(w / MAX_RATIO);
  const scale = Math.min(1, MAX_WIDTH / cw);
  const W = Math.round(cw * scale), H = Math.round(ch * scale);
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  return { W, H, x: Math.round((W - dw) / 2), y: Math.round((H - dh) / 2), dw, dh };
}

// lib/logoKnockout.ts
//
// A logo that was uploaded with a white background, made transparent.
//
// Found 2026-10-06 on her booking page: the logo sat in a white square. Neither of the two
// suspects was guilty - the upload pipeline keeps a PNG's alpha (lib/imageResize.ts, preset
// `logo`) and the page draws the logo with no backdrop. The white is IN THE FILE: her logo is
// an opaque JPEG, a circle on pure white, uploaded before the resize pipeline existed. A JPEG
// has no alpha, so the only way to a transparent logo for the ones already uploaded is to
// take the white background out of the picture. On a white page nobody noticed; on the cream
// the public pages sit on, it is a box.
//
// What counts as background: near-white pixels CONNECTED TO THE IMAGE BORDER (a flood fill
// from the edge). Whites that are enclosed - the inside of an "o", a highlight in her artwork -
// are the logo and stay. The one-pixel antialiasing ring along the boundary is un-blended from
// white so there is no pale halo on any background. A logo that already has real transparency,
// or no white border at all, is returned untouched (null).

import type { Sharp } from 'sharp';

const WHITE_MIN = 238; // every channel at least this: background (JPEG noise leaves 250-254, not 255)
const RING_FROM = 190; // along the boundary, pixels lighter than this are partly white and are un-blended

export type KnockoutResult = { png: Buffer; removed: number } | null;

export async function knockOutWhiteBackground(
  input: Buffer,
  sharp: (b: Buffer, o?: { raw: { width: number; height: number; channels: 4 } }) => Sharp
): Promise<KnockoutResult> {
  const meta = await sharp(input).metadata();
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;

  // already transparent somewhere meaningful: it is a real cut-out, leave it alone
  if (meta.hasAlpha) {
    let clear = 0;
    for (let i = 0; i < N; i++) if (data[i * 4 + 3] < 200) clear++;
    if (clear > N * 0.005) return null;
  }

  const isWhite = (i: number) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= WHITE_MIN;
  const bg = new Uint8Array(N);
  const stack: number[] = [];
  const push = (i: number) => { if (!bg[i] && isWhite(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop()!; const x = p % W;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (p >= W) push(p - W);
    if (p < N - W) push(p + W);
  }

  let removed = 0;
  for (let i = 0; i < N; i++) if (bg[i]) removed++;
  if (removed < N * 0.01) return null; // no white border to speak of

  const out = Buffer.from(data);
  for (let i = 0; i < N; i++) {
    if (bg[i]) { out[i * 4 + 3] = 0; continue; }
    const x = i % W, y = (i / W) | 0;
    let nextToBg = false;
    for (let dy = -1; dy <= 1 && !nextToBg; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && bg[yy * W + xx]) { nextToBg = true; break; }
    }
    if (!nextToBg) continue;
    const m = Math.min(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
    if (m <= RING_FROM) continue; // solid enough: keep
    const t = Math.max(0, 1 - (m - RING_FROM) / (255 - RING_FROM)); // share of the pixel that is logo
    if (t < 0.1) { out[i * 4 + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round((out[i * 4 + c] - 255 * (1 - t)) / t)));
    out[i * 4 + 3] = Math.round(255 * t);
  }

  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, removed };
}

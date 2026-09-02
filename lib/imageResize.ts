// lib/imageResize.ts
//
// Downscale and re-encode an image in the browser, before it is uploaded.
//
// Until now nothing did. uploadBrandAsset accepted anything up to 3MB and put
// it in the bucket exactly as shot, so a 4032x3024 phone photo was served at
// full size to every visitor of a booking page - on her client's mobile data,
// as the first thing that has to paint. It is also why an Open Graph image was
// not possible: WhatsApp skips previews well under the size a raw photo lands
// at, so the link she shares had no picture no matter what she uploaded.
//
// Browser-only: it needs a canvas. Called from the settings screen, which is a
// client component.
//
// ── Why an <img> and not createImageBitmap ─────────────────────────────────
// Phone photos carry EXIF orientation, and a portrait held upright is very
// often stored landscape with a "rotate 90" flag. Browsers apply that flag when
// rendering an <img> (image-orientation: from-image is the CSS default) and
// drawImage inherits the corrected geometry. createImageBitmap only honours it
// with { imageOrientation: 'from-image' }, which Safari did not support until
// 16.4 - and a cosmetician on an older iPhone uploading a photo of herself
// sideways is exactly the case this must not get wrong.

export type ResizeMode = 'contain' | 'cover';

export type ResizeOptions = {
  /** Bounding box for 'contain'; exact output size for 'cover'. */
  maxWidth: number;
  maxHeight: number;
  mode?: ResizeMode;
  /** JPEG quality 0..1. Ignored for PNG output. */
  quality?: number;
  /** 'image/jpeg' flattens alpha onto white; 'image/png' keeps it. */
  type?: 'image/jpeg' | 'image/png';
  /**
   * For 'cover': which part of the image survives the crop, 0..1 top to bottom.
   * 0.5 is the middle. A portrait cropped to a wide banner wants roughly a
   * third down, because that is where a face sits when someone frames
   * themselves - dead centre gives you a chin and a collarbone.
   */
  focusY?: number;
};

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });

/**
 * Returns a resized Blob, or the ORIGINAL FILE UNCHANGED if anything goes
 * wrong. Failing closed here would mean an upload button that silently does
 * nothing on some phone we cannot reproduce; failing open costs a large file,
 * which is exactly what happens today anyway.
 *
 * SVG is returned untouched: it is already small, it is resolution-independent,
 * and rasterising it would make it worse.
 */
export async function resizeImage(file: File, opts: ResizeOptions): Promise<Blob> {
  const { maxWidth, maxHeight, mode = 'contain', quality = 0.82, type = 'image/jpeg', focusY = 0.5 } = opts;
  if (typeof document === 'undefined') return file;
  if (/svg/i.test(file.type)) return file;

  try {
    const img = await loadImage(file);
    const sw = img.naturalWidth, sh = img.naturalHeight;
    if (!sw || !sh) return file;

    let dw: number, dh: number, sx = 0, sy = 0, cw = sw, ch = sh;

    if (mode === 'cover') {
      dw = maxWidth; dh = maxHeight;
      // Take the largest source rectangle with the target's aspect ratio.
      const targetAspect = maxWidth / maxHeight;
      if (sw / sh > targetAspect) {
        ch = sh; cw = Math.round(sh * targetAspect);
        sx = Math.round((sw - cw) / 2);
      } else {
        cw = sw; ch = Math.round(sw / targetAspect);
        sy = Math.round((sh - ch) * Math.min(1, Math.max(0, focusY)));
      }
    } else {
      const scale = Math.min(1, maxWidth / sw, maxHeight / sh);
      dw = Math.max(1, Math.round(sw * scale));
      dh = Math.max(1, Math.round(sh * scale));
      // Already smaller than the box AND already a jpeg: nothing to gain.
      if (scale === 1 && file.type === type) return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = dw; canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no alpha. Without this a transparent PNG composites onto black,
    // which turns a logo on a transparent background into a logo in a box.
    if (type === 'image/jpeg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, dw, dh); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, dw, dh);

    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, quality));
    if (!blob) return file;
    // A re-encode that made it bigger is not a win. Happens with small PNGs.
    return blob.size < file.size || mode === 'cover' ? blob : file;
  } catch {
    return file;
  }
}

/** What each branding asset is for, and therefore how it should be encoded. */
export const IMAGE_PRESETS = {
  // A face, or the room. The largest thing on the booking page.
  portrait: { maxWidth: 1400, maxHeight: 1400, mode: 'contain', quality: 0.82, type: 'image/jpeg' },
  // The same photo, cropped to what link previews want. 1200x630 is the size
  // WhatsApp, iMessage and every other unfurler is built around.
  portraitOg: { maxWidth: 1200, maxHeight: 630, mode: 'cover', quality: 0.82, type: 'image/jpeg', focusY: 0.38 },
  hero: { maxWidth: 1600, maxHeight: 1600, mode: 'contain', quality: 0.82, type: 'image/jpeg' },
  gallery: { maxWidth: 1400, maxHeight: 1400, mode: 'contain', quality: 0.82, type: 'image/jpeg' },
  // PNG, not JPEG: a logo is usually on a transparent background and flattening
  // it onto white gives her a white rectangle wherever the page is not white.
  logo: { maxWidth: 600, maxHeight: 600, mode: 'contain', quality: 1, type: 'image/png' },
} as const satisfies Record<string, ResizeOptions>;

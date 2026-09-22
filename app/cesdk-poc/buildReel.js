// app/cesdk-poc/buildReel.js
//
// The one template of the proof of concept: a 9:16 reel. Her logo and
// business name pinned top-right, three full-bleed photos three seconds each,
// and a Hebrew caption pill in her accent colour under every photo.
//
// Pure engine code with no DOM, so the same function runs in the browser
// (ReelPoc.jsx, where the mp4 is exported) and in headless Node (where a
// still frame can be exported to check the layout without a browser).
//
// What the CE.SDK evaluation taught, applied here:
//   - createVideo({ designUnit: 'Pixel' }) or every size is three times off
//   - a text block's fill is its glyph colour; a pill is backgroundColor/*
//   - time offsets go on plain page children, not inside a track
//   - Hebrew, digits and ₪ in one line need no direction marks

const SECONDS_PER_PHOTO = 3;
const W = 1080;
const H = 1920;

const hexToRgba = (hex, a = 1) => {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  if (Number.isNaN(v) || n.length !== 6) return { r: 0.3, g: 0.2, b: 0.35, a };
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255, a };
};

// Readable text on the accent: same rule as lib/theme contrastOn, inlined so
// this file stays engine-only (it also runs outside the app in Node).
const luminance = ({ r, g, b }) => {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastOn = (rgb) => {
  const L = luminance(rgb);
  const white = 1.05 / (L + 0.05);
  const ink = (L + 0.05) / (luminance({ r: 42 / 255, g: 34 / 255, b: 51 / 255 }) + 0.05);
  return white >= ink ? { r: 1, g: 1, b: 1, a: 1 } : { r: 42 / 255, g: 34 / 255, b: 51 / 255, a: 1 };
};

/**
 * @param engine  a CreativeEngine (browser or @cesdk/node)
 * @param data    { photos: string[], captions: string[], logoUrl?: string,
 *                  businessName?: string, accent?: string, fontUri: string }
 * @returns       { page, duration } - export `page` with exportVideo / export
 */
export function buildReel(engine, data) {
  const photos = (data.photos || []).filter(Boolean).slice(0, 3);
  if (!photos.length) throw new Error('buildReel: no photos');
  const captions = data.captions || [];
  const accent = hexToRgba(data.accent || '#5B3E67');
  const onAccent = contrastOn(accent);
  const duration = photos.length * SECONDS_PER_PHOTO;

  const typeface = {
    name: 'Assistant',
    fonts: [{ uri: data.fontUri, subFamily: 'Regular', weight: 'normal', style: 'normal' }],
  };

  const scene = engine.scene.createVideo({ designUnit: 'Pixel' });
  const page = engine.block.create('page');
  engine.block.setWidth(page, W);
  engine.block.setHeight(page, H);
  engine.block.appendChild(scene, page);
  engine.block.setDuration(page, duration);
  const pageFill = engine.block.createFill('color');
  engine.block.setColor(pageFill, 'fill/color/value', { ...accent, a: 1 });
  engine.block.setFill(page, pageFill);

  // ── The photos, one after another, each covering the frame ──────────────
  photos.forEach((url, i) => {
    const img = engine.block.create('graphic');
    engine.block.setShape(img, engine.block.createShape('rect'));
    const fill = engine.block.createFill('image');
    engine.block.setString(fill, 'fill/image/imageFileURI', url);
    engine.block.setFill(img, fill);
    engine.block.setContentFillMode(img, 'Cover');
    engine.block.setWidth(img, W);
    engine.block.setHeight(img, H);
    engine.block.setPositionX(img, 0);
    engine.block.setPositionY(img, 0);
    engine.block.appendChild(page, img);
    engine.block.setTimeOffset(img, i * SECONDS_PER_PHOTO);
    engine.block.setDuration(img, SECONDS_PER_PHOTO);
    // A soft entrance if this engine build has it; the reel is fine without.
    try {
      const anim = engine.block.createAnimation('fade');
      engine.block.setInAnimation(img, anim);
    } catch { /* no animation in this build */ }
  });

  // ── Shared text style ────────────────────────────────────────────────────
  const text = (str, { y, size, color, width = 0.84, bg = null, pad = 22, time = null, dur = null }) => {
    const t = engine.block.create('text');
    engine.block.setString(t, 'text/text', str);
    engine.block.setBool(t, 'text/automaticFontSizeEnabled', false);
    engine.block.setFloat(t, 'text/fontSize', size);
    engine.block.setFloat(t, 'text/lineHeight', 1.25);
    engine.block.setEnum(t, 'text/horizontalAlignment', 'Right');
    engine.block.setFont(t, typeface.fonts[0].uri, typeface);
    engine.block.setTextColor(t, color);
    engine.block.setWidth(t, W * width);
    engine.block.setHeightMode(t, 'Auto');
    engine.block.setPositionX(t, W * (0.92 - width));
    engine.block.setPositionY(t, H * y);
    if (bg) {
      engine.block.setBool(t, 'backgroundColor/enabled', true);
      engine.block.setColor(t, 'backgroundColor/color', bg);
      engine.block.setFloat(t, 'backgroundColor/cornerRadius', 18);
      engine.block.setFloat(t, 'backgroundColor/paddingLeft', pad);
      engine.block.setFloat(t, 'backgroundColor/paddingRight', pad);
      engine.block.setFloat(t, 'backgroundColor/paddingTop', Math.round(pad * 0.55));
      engine.block.setFloat(t, 'backgroundColor/paddingBottom', Math.round(pad * 0.55));
    }
    engine.block.appendChild(page, t);
    if (time != null) {
      engine.block.setTimeOffset(t, time);
      engine.block.setDuration(t, dur);
    }
    return t;
  };

  // ── Her mark, top-right, the whole way through ───────────────────────────
  let nameY = 0.045;
  if (data.logoUrl) {
    const logo = engine.block.create('graphic');
    engine.block.setShape(logo, engine.block.createShape('rect'));
    const lf = engine.block.createFill('image');
    engine.block.setString(lf, 'fill/image/imageFileURI', data.logoUrl);
    engine.block.setFill(logo, lf);
    engine.block.setContentFillMode(logo, 'Contain');
    const size = 150;
    engine.block.setWidth(logo, size);
    engine.block.setHeight(logo, size);
    engine.block.setPositionX(logo, W * 0.92 - size);
    engine.block.setPositionY(logo, H * 0.04);
    engine.block.appendChild(page, logo);
    nameY = 0.04 + size / H + 0.012;
  }
  if (data.businessName) {
    text(data.businessName, { y: nameY, size: 36, color: onAccent, width: 0.6, bg: accent, pad: 18 });
  }

  // ── One caption per photo, in her colour, timed with it ──────────────────
  photos.forEach((_, i) => {
    const caption = String(captions[i] || '').trim();
    if (!caption) return;
    text(caption, { y: 0.78, size: 54, color: onAccent, bg: accent, pad: 26, time: i * SECONDS_PER_PHOTO, dur: SECONDS_PER_PHOTO });
  });

  return { page, duration };
}

export { SECONDS_PER_PHOTO };

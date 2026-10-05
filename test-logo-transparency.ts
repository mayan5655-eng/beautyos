// Transparency on the public pages' two logos: HERS and Kalmea's.
//
// 2026-10-06, both visible only because the pages sit on cream and not on white:
//   * her logo was an opaque JPEG on white (uploaded before the resize pipeline existed): a
//     white box on the booking page. The pipeline and the render were both innocent; the white
//     was in the file, so logos already uploaded are fixed at render (app/logo/[key]).
//   * the Kalmea wordmark had white fragments in the counters of a, e, a: the cut-out had stopped
//     at the outline. scripts/clean-wordmark-alpha.mjs made them transparent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { logoSrc } from './lib/logoSrc.js';

const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── wiring (always checked) ─────────────────────────────────────────────────
assert.ok(code('app/BookingPage.jsx').includes('logoSrc(brand.logoUrl'), 'the booking page draws her logo through /logo, not straight from storage');
assert.ok(/'\/logo'/.test(code('lib/supabase/middleware.ts')), '/logo is public: the page is seen by clients with no session');
assert.ok(fs.existsSync('app/logo/[key]/route.ts'), 'the route exists');
const route = code('app/logo/[key]/route.ts');
assert.ok(route.includes('allowedImageUrl'), 'only images on our own storage host are fetched');
assert.ok(/redirect\(original/.test(route), 'every failure falls back to the original: never a broken image');
assert.ok(!/\.upload\(|storage\.from/.test(route), 'her uploaded file is never modified or duplicated');
assert.ok(/s-maxage=86400/.test(route) && !/immutable/.test(route), 'cached at the CDN, and a new logo is a new URL (?v=)');

assert.equal(logoSrc('', 'abc'), '', 'no logo: nothing');
assert.equal(logoSrc('https://x/y.jpeg', ''), 'https://x/y.jpeg', 'no tenant key yet: the original, never a broken /logo/');
assert.equal(logoSrc('https://x/y.svg', 'abc'), 'https://x/y.svg', 'svg is left alone');
assert.ok(/^\/logo\/abc\?v=[a-z0-9]+$/.test(logoSrc('https://x/y.jpeg', 'abc')), 'a jpeg goes through the route');
assert.notEqual(logoSrc('https://x/y1.jpeg', 'abc'), logoSrc('https://x/y2.jpeg', 'abc'), 'a new logo file is a new URL');

// ── pixels (needs sharp, which ships with Next; say so loudly if it is missing) ──────────
let sharp: any = null;
try { sharp = (await import('sharp')).default; } catch { console.log('logo transparency: PIXEL CHECKS SKIPPED - sharp could not be loaded here'); }

if (sharp) {
  const { knockOutWhiteBackground } = await import('./lib/logoKnockout.ts');
  const S = 200;
  const svgOf = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${body}</svg>`);
  const px = async (buf: Buffer, x: number, y: number) => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  // an opaque JPEG on white: a dark ring, a WHITE disc inside it (the "o" of a logo), a coloured dot
  const opaque = await sharp(svgOf('<rect width="200" height="200" fill="#fff"/><circle cx="100" cy="100" r="80" fill="#1f3a30"/><circle cx="100" cy="100" r="40" fill="#fff"/><circle cx="100" cy="100" r="10" fill="#e9a9a1"/>')).jpeg({ quality: 92 }).toBuffer();
  const cut = await knockOutWhiteBackground(opaque, sharp);
  assert.ok(cut, 'a logo on a white border is cut out');
  assert.equal((await px(cut!.png, 2, 2))[3], 0, 'the white corner is transparent');
  assert.equal((await px(cut!.png, 197, 197))[3], 0, 'the opposite corner too');
  assert.equal((await px(cut!.png, 100, 40))[3], 255, 'the ring (the logo) is untouched');
  const inner = await px(cut!.png, 100, 70);
  assert.ok(inner[3] === 255 && inner[0] > 235, 'the white INSIDE the logo is part of the logo and stays - only background connected to the edge goes');
  assert.ok(cut!.removed > 200 * 200 * 0.15, 'a real share of the picture was background');

  // on cream, no pale halo: the pixels along the boundary are mostly transparent or dark, not near-white and opaque
  const { data, info } = await sharp(cut!.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let halo = 0;
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] > 200 && Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > 225 && Math.hypot((i % S) - 100, Math.floor(i / S) - 100) > 82) halo++;
  assert.ok(halo < 25, `no ring of opaque white around the edge (found ${halo})`);

  // already a real cut-out: untouched
  const cutout = await sharp(svgOf('<circle cx="100" cy="100" r="80" fill="#1f3a30"/>')).png().toBuffer();
  assert.equal(await knockOutWhiteBackground(cutout, sharp), null, 'a PNG that already has transparency is left alone');
  // no white border: untouched
  const full = await sharp(svgOf('<rect width="200" height="200" fill="#1f3a30"/><circle cx="100" cy="100" r="50" fill="#fff"/>')).png().toBuffer();
  assert.equal(await knockOutWhiteBackground(full, sharp), null, 'a full-bleed picture has no background to remove');

  // ── the Kalmea wordmark: no opaque white left in the lettering ─────────────────────────
  const enclosedWhite = async (file: string, fromX: number) => {
    const r = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < r.info.width * r.info.height; i++) {
      if ((i % r.info.width) < fromX) continue;
      const a = r.data[i * 4 + 3], lo = Math.min(r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]);
      if (a >= 128 && lo >= 225) n++;
    }
    return n;
  };
  assert.ok((await enclosedWhite('public/kalmea-wordmark.png', 260)) < 30, 'the full wordmark has no opaque white in its lettering (was 1,900+ px in the counters)');
  assert.ok((await enclosedWhite('public/kalmea-wordmark-text.png', 0)) < 30, 'the text wordmark has no opaque white in its counters (was 2,900 px)');
}

console.log('logo transparency: ok');

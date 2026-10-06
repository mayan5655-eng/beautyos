// Transparency on the public pages' two logos: HERS and Kalmea's.
//
// 2026-10-06, both visible only because the pages sit on cream and not on white:
//   * her logo was an opaque JPEG on white (uploaded before the resize pipeline existed): a
//     white box on the booking page. The white was in the file, so logos already uploaded are
//     fixed at render (app/logo/[key]);
//   * the Kalmea wordmark had white fragments in the counters of a, e, a: the cut-out had stopped
//     at the outline. scripts/clean-wordmark-alpha.mjs made them transparent.
//
// Rewritten 2026-10-06 (Stage 3). The first version grepped the route's source ("redirect(original",
// "!/\.upload\(/") and SKIPPED every pixel check when sharp could not load - so on a machine without
// sharp it printed "ok" having checked nothing. Now:
//   * sharp missing is a FAILURE, with the reason, never a skip;
//   * the route is CALLED (GET /logo/<id>) with the network replaced by in-memory files, and the answer
//     is read: the pixels of the PNG it returns, the redirect it gives when something goes wrong, the
//     request it refuses to make for a host that is not ours;
//   * /logo and /og being public is asked of the real middleware, not read from its source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { logoSrc } from './lib/logoSrc.js';
import { importApp } from './testkit/render.mjs';

let sharp: any;
try {
  sharp = (await import('sharp')).default;
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>')).png().toBuffer();
} catch (e) {
  throw new Error(`logo transparency: sharp cannot run here (${e instanceof Error ? e.message : e}). This test checks pixels and will not pass by skipping them. Install it (npm i) or fix the platform binary.`);
}

const { knockOutWhiteBackground } = await import('./lib/logoKnockout.ts');
const S = 200;
const svgOf = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${body}</svg>`);
const pixels = async (buf: Buffer) => { const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { ...r.info, data: r.data as Buffer }; };
const px = async (buf: Buffer, x: number, y: number) => { const r = await pixels(buf); const i = (y * r.width + x) * 4; return [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]]; };

// the pictures: an opaque JPEG on white (a dark ring, a WHITE disc inside it - the "o" of a logo - and a coloured dot)
const OPAQUE_ON_WHITE = '<rect width="200" height="200" fill="#fff"/><circle cx="100" cy="100" r="80" fill="#1f3a30"/><circle cx="100" cy="100" r="40" fill="#fff"/><circle cx="100" cy="100" r="10" fill="#e9a9a1"/>';
const opaque = await sharp(svgOf(OPAQUE_ON_WHITE)).jpeg({ quality: 92 }).toBuffer();
const cutoutPng = await sharp(svgOf('<circle cx="100" cy="100" r="80" fill="#1f3a30"/>')).png().toBuffer();
const fullBleed = await sharp(svgOf('<rect width="200" height="200" fill="#1f3a30"/><circle cx="100" cy="100" r="50" fill="#fff"/>')).png().toBuffer();

// ── logoSrc: where a page loads her logo from ────────────────────────────────────────────────────────
assert.equal(logoSrc('', 'abc'), '', 'no logo: nothing');
assert.equal(logoSrc('https://x/y.jpeg', ''), 'https://x/y.jpeg', 'no tenant key yet: the original, never a broken /logo/');
assert.equal(logoSrc('https://x/y.svg', 'abc'), 'https://x/y.svg', 'svg is left alone');
assert.ok(/^\/logo\/abc\?v=[a-z0-9]+$/.test(logoSrc('https://x/y.jpeg', 'abc')), 'a jpeg goes through the route');
assert.notEqual(logoSrc('https://x/y1.jpeg', 'abc'), logoSrc('https://x/y2.jpeg', 'abc'), 'a new logo file is a new URL');

// ── the knock-out itself, on pixels ──────────────────────────────────────────────────────────────────
const cut = await knockOutWhiteBackground(opaque, sharp);
assert.ok(cut, 'a logo on a white border is cut out');
assert.equal((await px(cut!.png, 2, 2))[3], 0, 'the white corner is transparent');
assert.equal((await px(cut!.png, 197, 197))[3], 0, 'the opposite corner too');
assert.equal((await px(cut!.png, 100, 40))[3], 255, 'the ring (the logo) is untouched');
const inner = await px(cut!.png, 100, 70);
assert.ok(inner[3] === 255 && inner[0] > 235, 'the white INSIDE the logo is part of the logo and stays - only background connected to the edge goes');
assert.ok(cut!.removed > S * S * 0.15, 'a real share of the picture was background');
{
  const r = await pixels(cut!.png);
  let halo = 0;
  for (let i = 0; i < r.width * r.height; i++) if (r.data[i * 4 + 3] > 200 && Math.min(r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]) > 225 && Math.hypot((i % S) - 100, Math.floor(i / S) - 100) > 82) halo++;
  assert.ok(halo < 25, `no ring of opaque white around the edge (found ${halo})`);
}
assert.equal(await knockOutWhiteBackground(cutoutPng, sharp), null, 'a PNG that already has transparency is left alone');
assert.equal(await knockOutWhiteBackground(fullBleed, sharp), null, 'a full-bleed picture has no background to remove');

// ── the real route, with the network replaced ────────────────────────────────────────────────────────
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(SUPA && SUPA.startsWith('https://'), 'the test environment sets NEXT_PUBLIC_SUPABASE_URL (the runner does)');
const TENANT = '11111111-2222-3333-4444-555555555555';
const OURS = `${SUPA}/storage/v1/object/public/logos/${TENANT}/logo`;

const realFetch = globalThis.fetch;
let logoSetting = '';
let storage: (url: string) => Response | Promise<Response> = () => new Response('', { status: 404 });
const calls: string[] = [];
globalThis.fetch = (async (input: any) => {
  const url = typeof input === 'string' ? input : input.url || String(input);
  calls.push(url);
  if (url.includes('/rest/v1/rpc/get_public_branding')) return new Response(JSON.stringify({ logo_url: logoSetting, primary_color: '#C2557A' }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith(SUPA!)) return storage(url);
  throw new Error('the route reached for a URL that is not ours: ' + url);
}) as typeof fetch;

const { GET } = await importApp('app/logo/[key]/route.ts');
const get = async () => { calls.length = 0; return GET({} as any, { params: Promise.resolve({ key: TENANT }) }) as Promise<Response>; };
const img = (buf: Buffer, type: string) => () => new Response(new Uint8Array(buf), { status: 200, headers: { 'content-type': type } });
const origErr = console.error; console.error = () => {};
try {
  // an opaque JPEG on white: she gets a PNG with a transparent corner and the logo intact
  logoSetting = OURS + '.jpg'; storage = img(opaque, 'image/jpeg');
  let res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png', 'a knocked-out logo comes back as a PNG');
  const served = Buffer.from(await res.arrayBuffer());
  assert.equal((await px(served, 2, 2))[3], 0, 'the route\'s answer has a transparent corner');
  assert.equal((await px(served, 100, 40))[3], 255, 'and an untouched logo');
  assert.match(res.headers.get('cache-control') || '', /s-maxage=86400/, 'cached at the CDN for a day');
  assert.doesNotMatch(res.headers.get('cache-control') || '', /immutable/, 'never immutable: a new logo is a new URL (?v=), not a purge');

  // already transparent: served byte for byte, not re-encoded
  logoSetting = OURS + '.png'; storage = img(cutoutPng, 'image/png');
  res = await get();
  assert.equal(res.status, 200);
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(cutoutPng), 'a logo that is already a cut-out is served exactly as uploaded');

  // svg: not touched, handed back as a redirect
  logoSetting = OURS + '.svg'; storage = img(Buffer.from('<svg/>'), 'image/svg+xml');
  res = await get();
  assert.equal(res.status, 307, 'svg: redirected to the original');
  assert.equal(res.headers.get('location'), logoSetting);

  // the storage fetch fails: the answer is the original, never a broken image
  logoSetting = OURS + '.jpg'; storage = () => new Response('nope', { status: 500 });
  res = await get();
  assert.equal(res.status, 307, 'a failed fetch redirects to the original');
  assert.equal(res.headers.get('location'), logoSetting);
  storage = () => { throw new Error('network down'); };
  res = await get();
  assert.equal(res.status, 307, 'a thrown error redirects to the original too');

  // bytes that are not an image: still the original
  storage = img(Buffer.from('this is not a picture'), 'image/jpeg');
  res = await get();
  assert.equal(res.status, 307, 'unreadable image bytes fall back to the original');

  // no logo at all
  logoSetting = ''; storage = img(opaque, 'image/jpeg');
  res = await get();
  assert.equal(res.status, 404, 'no logo: 404, nothing fetched');
  assert.equal(calls.filter((u) => !u.includes('/rpc/')).length, 0, 'and no image request was made');

  // a logo URL that is not on our storage host is never fetched (the URL comes from her settings)
  for (const evil of ['https://evil.example/logo.jpg', 'http://169.254.169.254/latest/meta-data', `http://${new URL(SUPA!).host}/logo.jpg`, 'javascript:alert(1)']) {
    logoSetting = evil;
    res = await get();
    assert.equal(res.status, 404, `${evil}: refused`);
    assert.equal(calls.filter((u) => !u.includes('/rpc/')).length, 0, `${evil}: no request made to it`);
  }

  // an image over 6 MB is not decoded
  logoSetting = OURS + '.jpg'; storage = img(Buffer.alloc(6_000_001, 1), 'image/jpeg');
  res = await get();
  assert.equal(res.status, 307, 'a huge file is passed through, not decoded');
} finally {
  globalThis.fetch = realFetch;
  console.error = origErr;
}

// ── /logo and /og are reachable with no session; the dashboard is not ────────────────────────────────
{
  const { NextRequest } = await import('next/server');
  const { updateSession } = await importApp('lib/supabase/middleware.ts');
  const visit = async (p: string) => { const r = await updateSession(new NextRequest('https://kalmea.app' + p)); return r.headers.get('location') || ''; };
  assert.equal(await visit('/logo/abc'), '', '/logo is public: clients see her page with no session');
  assert.equal(await visit('/og/abc'), '', '/og is public: a link scraper has no session');
  assert.match(await visit('/dashboard'), /\/login$/, 'and the real gate still sends the dashboard to /login (so the two checks above mean something)');
}

// ── the Kalmea wordmark: no opaque white left in the lettering ───────────────────────────────────────
const opaqueWhite = async (file: string, fromX: number) => {
  const r = await pixels(fs.readFileSync(file));
  let n = 0;
  for (let i = 0; i < r.width * r.height; i++) {
    if ((i % r.width) < fromX) continue;
    if (r.data[i * 4 + 3] >= 128 && Math.min(r.data[i * 4], r.data[i * 4 + 1], r.data[i * 4 + 2]) >= 225) n++;
  }
  return n;
};
assert.ok((await opaqueWhite('public/kalmea-wordmark.png', 260)) < 30, 'the full wordmark has no opaque white in its lettering (was 1,900+ px in the counters)');
assert.ok((await opaqueWhite('public/kalmea-wordmark-text.png', 0)) < 30, 'the text wordmark has no opaque white in its counters (was 2,900 px)');

console.log('logo transparency: ok');

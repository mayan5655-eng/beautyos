// The link-preview image of a tenant's page.
//
// next/og's renderer draws glyphs left to right in string order, so "קביעת תור אונליין" came out as
// "ויילנוא רות תעיבק" on the first real render (2026-10-05). The fix hands it Hebrew already in
// visual order (lib/og/visualRtl.ts).
//
// Rewritten 2026-10-06 (Stage 3). The first version's "wiring" half grepped source for strings
// (`slug.includes("'summary_large_image'")`, `!/immutable/.test(og)`) - green whatever the code did.
// Now the ordering cases are kept (they were always behavioural, plus niqqud, which was a real bug in
// them), and everything else CALLS the real thing with the network replaced by in-memory answers:
//   * GET /og/<tenant> is requested and the IMAGE it returns is decoded: size, type, her accent colour in
//     the bar, the neutral banner when she has no photo, 502 (not a cached blank) when the lookup fails;
//   * generateMetadata of both public routes is called and the tags it emits are read;
//   * nothing is written to storage while an image is made.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { visualRtl, rtlLines } from './lib/og/visualRtl.ts';
import { importApp } from './testkit/render.mjs';

const rev = (s: string) => [...s].reverse().join('');
const clusters = (s: string) => s.match(/\P{M}\p{M}*/gu) || [];
const revClusters = (s: string) => clusters(s).reverse().join('');

// ── ordering ───────────────────────────────────────────────────────────────
assert.equal(visualRtl('abc'), 'abc', 'text without Hebrew is untouched');
assert.equal(visualRtl('קביעת תור אונליין'), rev('קביעת תור אונליין'), 'plain Hebrew is reversed whole (what the renderer then draws left to right)');
assert.equal(visualRtl('ליאור Beauty 24'), 'Beauty 24 ' + rev('ליאור'), '"Beauty 24" stays ONE left-to-right unit, drawn left of the Hebrew word (first version drew "24 Beauty")');
assert.equal(visualRtl('קליניקת דמו - קוסמטיקה'), rev('קוסמטיקה') + ' - ' + rev('דמו') + ' ' + rev('קליניקת'), 'a hyphen between Hebrew words keeps its place between them');
assert.equal(visualRtl('מבצע 20 30'), '30 20 ' + rev('מבצע'), 'numbers separated by a space are separate runs and read right to left, as in a Hebrew line');
assert.equal(visualRtl('(דנה)'), '(' + rev('דנה') + ')', 'brackets are mirrored, not turned inside out');
assert.equal(visualRtl('מחיר 1,200'), '1,200 ' + rev('מחיר'), 'a number with a thousands comma is one run');

// ── niqqud: a mark stays on ITS letter ────────────────────────────────────────
// Reversing code point by code point put every mark BEFORE its letter; a left-to-right layout attaches a
// combining mark to the letter that precedes it, so each vowel landed on its neighbour. (Found 2026-10-06.)
const SHALOM = 'שָׁלוֹם'; // shin + shin-dot + qamats, lamed, vav + holam, final mem
assert.equal(visualRtl(SHALOM), 'ם' + 'וֹ' + 'ל' + 'שָׁ', 'שָׁלוֹם: letters reversed, every vowel still attached to its own letter');
assert.notEqual(visualRtl(SHALOM), rev(SHALOM), 'and it is NOT the code-point reversal that detaches the marks');
for (const word of ['שָׁלוֹם', 'בְּרֵאשִׁית', 'קְלִינִיקָה', 'הַ']) {
  assert.deepEqual(clusters(visualRtl(word)), clusters(word).reverse(), `${word}: the same letter+mark units, in reverse order`);
  for (const c of clusters(visualRtl(word))) assert.ok(!/^\p{M}/u.test(c), `${word}: no unit starts with a bare mark`);
}
assert.equal(visualRtl('שָׁלוֹם Beauty 24'), 'Beauty 24 ' + revClusters(SHALOM), 'niqqud next to a Latin run: the run is untouched and the vowels still stay put');
assert.equal(visualRtl('(שָׁלוֹם)'), '(' + revClusters(SHALOM) + ')', 'brackets around niqqud mirror and the marks stay put');

// ── lines are broken by us, never auto-wrapped ─────────────────────────────
const long = 'סטודיו לקוסמטיקה ויופי של מאיה כהן - טיפולי פנים וגוף מתקדמים';
const lines = rtlLines(long, 26, 2);
assert.equal(lines.length, 2, 'at most two lines');
assert.ok(rev(lines[0]).startsWith('סטודיו'), 'line 1 is the START of the name (drawn on top)');
assert.ok(lines[1].includes('…') && !/מתקדמ…/.test(rev(lines[1])), 'the cut is at a word boundary, marked with …');
assert.deepEqual(rtlLines('דנה', 26), [rev('דנה')]);
assert.deepEqual(rtlLines('', 26), []);

// ── the real route, with the network replaced ──────────────────────────────
let sharp: any;
try { sharp = (await import('sharp')).default; await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>')).png().toBuffer(); }
catch (e) { throw new Error(`og: sharp cannot run here (${e instanceof Error ? e.message : e}); this test decodes the images the route returns and will not pass by skipping that.`); }

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(SUPA && SUPA.startsWith('https://'), 'the test environment sets NEXT_PUBLIC_SUPABASE_URL (the runner does)');
const TENANT = '11111111-2222-3333-4444-555555555555';
const ORIGIN = 'https://kalmea.app';
const OURS = `${SUPA}/storage/v1/object/public/portraits/${TENANT}/og.jpg`;
const PINK = [0xC2, 0x55, 0x7A];

const photo = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#335544' } }).jpeg().toBuffer();

type Settings = Record<string, unknown> | null;
let settings: Settings = null;
let lookup: 'ok' | 'fails' = 'ok';
let storage: (url: string) => Response = () => new Response('', { status: 404 });
let calls: { url: string; method: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url || String(input);
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  calls.push({ url, method });
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/rest/v1/rpc/get_public_branding')) return lookup === 'fails' ? json({ message: 'boom', code: 'XX000' }, 500) : json(settings);
  if (url.includes('/rest/v1/rpc/get_public_page')) return json({ tenant: settings ? { id: TENANT, name: 'שם מהטבלה' } : null, settings, services: [{ name: 'פנים' }, { name: 'גבות' }] });
  if (url.includes('/rest/v1/rpc/get_public_tenant_by_slug')) return lookup === 'fails' ? json({ message: 'boom', code: 'XX000' }, 500) : json(settings ? [{ id: TENANT, name: 'שם מהטבלה' }] : []);
  if (url.startsWith(SUPA!)) return storage(url);
  if (url.startsWith(ORIGIN + '/design-fonts/') || url === ORIGIN + '/og-1200x630.jpg') {
    const f = fs.readFileSync('public' + url.slice(ORIGIN.length));
    return new Response(new Uint8Array(f), { status: 200 });
  }
  throw new Error('the code reached for a URL the test does not know: ' + url);
}) as typeof fetch;
const origErr = console.error; console.error = () => {};

const { GET } = await importApp('app/og/[key]/route.tsx');
const { NextRequest } = await import('next/server');
const og = async (key = TENANT) => { calls = []; return GET(new NextRequest(`${ORIGIN}/og/${key}`), { params: Promise.resolve({ key }) }) as Promise<Response>; };
const decode = async (res: Response) => {
  const buf = Buffer.from(await res.arrayBuffer());
  const m = await sharp(buf).metadata();
  const raw = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => { const i = (y * raw.info.width + x) * 3; return [raw.data[i], raw.data[i + 1], raw.data[i + 2]]; };
  return { m, at, bytes: buf.length };
};
const near = (a: number[], b: number[], tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

try {
  // she has a photo and a colour: her photo, her accent in the bar, 1200x630, a JPEG small enough for WhatsApp
  settings = { business_name: 'קליניקת דנה', primary_color: '#C2557A', portrait_og_url: OURS };
  storage = (url) => url === OURS ? new Response(new Uint8Array(photo), { status: 200, headers: { 'content-type': 'image/jpeg' } }) : new Response('', { status: 404 });
  let res = await og();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg', 'a JPEG (the PNG was ~1 MB and WhatsApp drops heavy previews)');
  let img = await decode(res);
  assert.deepEqual([img.m.width, img.m.height], [1200, 630], 'the size every platform expects');
  assert.ok(img.bytes < 400_000, `small enough to be kept by WhatsApp (${img.bytes} bytes)`);
  assert.ok(near(img.at(600, 5), PINK), `the top bar is HER accent, not Kalmea's (got ${img.at(600, 5)})`);
  assert.ok(near(img.at(300, 200), [0x33, 0x55, 0x44], 30), 'her photo fills the picture');
  assert.match(res.headers.get('cache-control') || '', /s-maxage=600/, 'cached at the CDN for minutes');
  assert.doesNotMatch(res.headers.get('cache-control') || '', /immutable|31536000/, 'not for a year: her photo can change');
  assert.deepEqual(calls.filter((c) => c.method !== 'GET' && !c.url.includes('/rest/v1/rpc/')), [], 'nothing is uploaded or written while the image is made');

  // a different colour is a different picture
  settings = { business_name: 'קליניקת דנה', primary_color: '#2E6F5E', portrait_og_url: OURS };
  img = await decode(await og());
  assert.ok(!near(img.at(600, 5), PINK, 30) && near(img.at(600, 5), [0x2E, 0x6F, 0x5E]), 'another business, another accent');

  // her photo is on a host that is not ours: never fetched
  settings = { business_name: 'קליניקת דנה', primary_color: '#C2557A', portrait_og_url: 'https://evil.example/p.jpg' };
  res = await og();
  assert.equal(res.status, 200, 'still an image');
  assert.ok(!calls.some((c) => c.url.includes('evil.example')), 'the foreign host was never requested');

  // nothing uploaded: the neutral Kalmea banner, still a valid image, still 1200x630
  settings = { business_name: 'קליניקת דנה' };
  res = await og();
  assert.equal(res.status, 200);
  img = await decode(res);
  assert.deepEqual([img.m.width, img.m.height], [1200, 630], 'no photo: the banner, same size');

  // the lookup FAILS: 502 and never cached - a blank must not stick on a CDN
  // (Known gap, found by writing this test: for a tenant UUID - the old /book?t= links - a failed BRANDING read is
  // swallowed by fetchPublicSettings, so the route serves the neutral banner as a 200 and the CDN keeps it ten
  // minutes. The promise below holds for the slug lookup, which throws. Reported, not changed here.)
  lookup = 'fails'; settings = { business_name: 'x' };
  res = await og('dana');
  assert.equal(res.status, 502, 'a failed slug lookup is an error, not an empty picture');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  lookup = 'ok';

  // ── generateMetadata of both public routes ──────────────────────────────────────────────────────────
  settings = { business_name: 'קליניקת דנה', primary_color: '#C2557A', welcome_message: 'ברוכה הבאה', portrait_og_url: OURS };
  const { generateMetadata: slugMeta } = await importApp('app/[slug]/page.tsx');
  const m1: any = await slugMeta({ params: Promise.resolve({ slug: 'dana' }) });
  assert.equal(m1.title, 'קליניקת דנה');
  assert.equal(m1.description, 'ברוכה הבאה · פנים, גבות', 'her short line, then her treatments');
  assert.equal(m1.twitter.card, 'summary_large_image', 'a large card, not the bare summary line');
  const img1 = m1.openGraph.images[0];
  assert.match(img1.url, /\/og\/dana\?v=[a-z0-9]+$/, 'the preview image is the per-tenant route, versioned by content');
  assert.deepEqual([img1.width, img1.height], [1200, 630]);
  assert.equal(m1.twitter.images[0], img1.url, 'twitter and open graph agree');
  settings = { ...settings, primary_color: '#2E6F5E' };
  const m2: any = await slugMeta({ params: Promise.resolve({ slug: 'dana2' }) });
  assert.notEqual(m2.openGraph.images[0].url.split('?v=')[1], img1.url.split('?v=')[1], 'a changed colour is a new image URL, so a scraper cannot keep the old picture');

  const { generateMetadata: bookMeta } = await importApp('app/book/page.jsx');
  const b: any = await bookMeta({ searchParams: Promise.resolve({ t: TENANT }) });
  assert.equal(b.title, 'קליניקת דנה', 'the old /book?t= link gets her title');
  assert.equal(b.twitter.card, 'summary_large_image');
  assert.match(b.openGraph.images[0].url, new RegExp(`/og/${TENANT}\\?v=[a-z0-9]+$`), 'and her image');
  assert.deepEqual(await bookMeta({ searchParams: Promise.resolve({}) }), {}, 'no business named: the site-wide defaults');
  assert.deepEqual(await bookMeta({ searchParams: Promise.resolve({ t: 'not-a-uuid' }) }), {}, 'garbage in ?t= is not looked up');
} finally {
  globalThis.fetch = realFetch;
  console.error = origErr;
}

// ── /og is reachable with no session ───────────────────────────────────────
{
  const { NextRequest: Req } = await import('next/server');
  const { updateSession } = await importApp('lib/supabase/middleware.ts');
  const visit = async (p: string) => (await updateSession(new Req(ORIGIN + p))).headers.get('location') || '';
  assert.equal(await visit('/og/dana'), '', '/og is public: a link scraper has no session');
  assert.match(await visit('/dashboard'), /\/login$/, 'while the dashboard still is not');
}
assert.ok(!fs.existsSync('app/og/dbg'), 'no debug route left behind');

console.log('og: ok');

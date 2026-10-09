// Unknown URLs are 404s, not live pages; a failed lookup is not a missing business.
//
// 2026-10-06: /sitemap.xml and any unknown path answered 200 with the "no business at this address" HTML,
// because the [slug] catch-all handled them (the same bug app/robots.ts was written for): crawlers and
// monitoring saw a live page for every URL, and robots.txt pointed nowhere. Also found while fixing it:
// resolveTenant returned null both for "no such business" and for "the lookup failed", so with a real 404
// a database hiccup would have become a 404 a crawler keeps. Verified live after deploy (status codes);
// these pin the structure so it cannot quietly regress.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const raw = (f: string) => fs.readFileSync(f, 'utf8');
const page = raw('app/[slug]/page.tsx');

// ── a missing business is a real 404, with her Hebrew words ───────────────────────────────
assert.ok(fs.existsSync('app/[slug]/not-found.tsx'), 'the segment has its own not-found page');
assert.ok(raw('app/[slug]/not-found.tsx').includes('לא מצאנו עסק בכתובת הזו'), 'in Hebrew, with the explanation she can act on');
assert.ok(/if \(!tenant\) notFound\(\)/.test(page), 'the page answers notFound() (a 404) for an unknown slug');
assert.ok(!page.includes('לא מצאנו עסק'), 'and no longer renders the "not found" body inline with a 200');
assert.ok(/robots: \{ index: false/.test(page), 'and its metadata says noindex');

// ── a FAILED lookup is not a missing business ─────────────────────────────────────────────
const resolve = page.slice(page.indexOf('const resolveTenant'), page.indexOf('const loadPublicSettings'));
assert.ok(/if \(error\) throw new Error/.test(resolve), 'an RPC error is thrown (a 500 the error page handles)...');
assert.ok(/throw err instanceof Error/.test(resolve), '...including a thrown one');
assert.ok(!/return null;\s*\n\s*}\s*catch/.test(resolve) && !/error\) \{[^}]*return null/.test(resolve), 'and neither path returns null, which would read as "no such business"');
assert.ok(/return row \|\| null/.test(resolve), 'null still means exactly: the lookup worked and there is no such business');

// ── sitemap and robots: call the real functions ─────────────────────────────────────────────
const sitemap = (await import('./app/sitemap.ts')).default();
const robots: any = (await import('./app/robots.ts')).default();
const urls = sitemap.map((e: any) => new URL(e.url));
assert.ok(urls.length >= 4 && urls.every((u: URL) => u.protocol === 'https:' || u.hostname === 'localhost'), 'absolute URLs');
assert.equal(new Set(urls.map((u: URL) => u.origin)).size, 1, 'all on one origin');
const paths = urls.map((u: URL) => u.pathname);
for (const p of ['/', '/signup', '/privacy', '/terms', '/accessibility']) assert.ok(paths.includes(p), `the sitemap lists ${p}`);
assert.ok(!paths.some((p: string) => p.length > 1 && !['/signup', '/demo', '/privacy', '/terms', '/accessibility'].includes(p)), "and nothing else: a business's page is not listed (that is hers to opt into)");
assert.equal(new URL(robots.sitemap).pathname, '/sitemap.xml', 'robots.txt points at the sitemap');
assert.equal(new URL(robots.sitemap).origin, urls[0].origin, 'on the same origin as the entries');

console.log('public routes: ok');

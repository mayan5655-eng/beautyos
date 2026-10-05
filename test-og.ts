// The link-preview image of a tenant's page.
//
// next/og's renderer draws glyphs left to right in string order, so "קביעת תור אונליין" came out as
// "ויילנוא רות תעיבק" on the first real render (2026-10-05). The fix hands it Hebrew already in
// visual order (lib/og/visualRtl.ts). These cases are the ones that were wrong on real output, plus
// the wiring: public path, metadata on both public routes, never an image per tenant in storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { visualRtl, rtlLines } from './lib/og/visualRtl.ts';

const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const rev = (s: string) => [...s].reverse().join('');

// ── ordering ───────────────────────────────────────────────────────────────
assert.equal(visualRtl('abc'), 'abc', 'text without Hebrew is untouched');
assert.equal(visualRtl('קביעת תור אונליין'), rev('קביעת תור אונליין'), 'plain Hebrew is reversed whole (what the renderer then draws left to right)');
assert.equal(visualRtl('ליאור Beauty 24'), 'Beauty 24 ' + rev('ליאור'), '"Beauty 24" stays ONE left-to-right unit, drawn left of the Hebrew word (first version drew "24 Beauty")');
assert.equal(visualRtl('קליניקת דמו - קוסמטיקה'), rev('קוסמטיקה') + ' - ' + rev('דמו') + ' ' + rev('קליניקת'), 'a hyphen between Hebrew words keeps its place between them');
assert.equal(visualRtl('מבצע 20 30'), '30 20 ' + rev('מבצע'), 'numbers separated by a space are separate runs and read right to left, as in a Hebrew line');
assert.equal(visualRtl('(דנה)'), '(' + rev('דנה') + ')', 'brackets are mirrored, not turned inside out');
assert.equal(visualRtl('מחיר 1,200'), '1,200 ' + rev('מחיר'), 'a number with a thousands comma is one run');

// ── lines are broken by us, never auto-wrapped ─────────────────────────────
const long = 'סטודיו לקוסמטיקה ויופי של מאיה כהן - טיפולי פנים וגוף מתקדמים';
const lines = rtlLines(long, 26, 2);
assert.equal(lines.length, 2, 'at most two lines');
assert.ok(rev(lines[0]).startsWith('סטודיו'), 'line 1 is the START of the name (drawn on top)');
assert.ok(lines[1].includes('…') && !/מתקדמ…/.test(rev(lines[1])), 'the cut is at a word boundary, marked with …');
assert.deepEqual(rtlLines('דנה', 26), [rev('דנה')]);
assert.deepEqual(rtlLines('', 26), []);

// ── wiring ─────────────────────────────────────────────────────────────────
assert.ok(/'\/og'/.test(code('lib/supabase/middleware.ts')), '/og is a public path: a link scraper has no session');
const slug = code('app/[slug]/page.tsx');
assert.ok(slug.includes('/og/') && slug.includes('ogVersion('), 'her page points its preview at the generated image, versioned by content');
assert.ok(slug.includes("'summary_large_image'") && !slug.includes("'summary'"), 'a large card always, not the bare summary line');
assert.ok(code('app/book/page.jsx').includes('generateMetadata'), 'the old /book?t= links get her title, description and image too');
const og = code('lib/og/tenantOg.tsx');
assert.ok(/s-maxage=600/.test(og) && !/immutable/.test(og), 'cached at the CDN for minutes, not a year: her photo can change');
assert.ok(!/\.upload\(|storage\.from/.test(og + code('app/og/[key]/route.tsx')), 'nothing is stored per tenant: built on request');
assert.ok(og.includes('allowedImageUrl'), 'only images on our own storage host are fetched');
assert.ok(og.includes('visualRtl') && og.includes('rtlLines'), 'every Hebrew string is put in visual order before it is drawn');
assert.ok(!fs.existsSync('app/og/dbg'), 'no debug route left behind');

console.log('og: ok');

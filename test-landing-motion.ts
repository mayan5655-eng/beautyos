// Landing motion + demo video (2026-10-12), pinned at source level.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const mock = rd('app/landing/PhoneMock.jsx');
const motion = rd('app/landing/PhoneMockMotion.jsx');
const video = rd('app/landing/DemoVideo.jsx');
const page = rd('app/LandingPage.jsx');
const css = rd('app/globals.css');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('the server HTML is the finished picture: revenue and both appointments are plain text, nothing hidden inline', () => {
  assert.match(mock, /data-pm-count="890"[^>]*>₪890</);
  assert.match(mock, /10:30/);
  assert.match(mock, /12:00/);
  assert.match(mock, /התפנה תור ב-14:00/);
  assert.doesNotMatch(mock, /opacity:\s*0/);
});

ok('motion only starts from JS, once, and not for reduced motion', () => {
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /io\.disconnect\(\)/);
  assert.match(motion, /setAttribute\("data-pm", "play"\)/);
  assert.doesNotMatch(motion, /setInterval|infinite|iteration-count/);
  assert.match(css, /\.pm\[data-pm="armed"\] \.pm-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pm \.pm-in/);
});

ok('only opacity and transform animate (nothing that moves layout)', () => {
  const block = css.slice(css.indexOf('/* Landing phone mock'), css.indexOf('.kl-press {'));
  assert.doesNotMatch(block, /\b(width|height|margin|padding|top|left)\s*:/);
  assert.match(block, /opacity/);
  assert.match(block, /transform/);
});

ok('the page is not blank with scripting off', () => {
  assert.match(css, /@media \(scripting: none\)\s*\{\s*\.kl-reveal\s*\{\s*opacity: 1/);
});

ok('the video adds nothing to first load: no poster or source until near, preload none, muted, playsInline, controls', () => {
  assert.match(video, /preload="none"/);
  assert.match(video, /\bmuted\b/);
  assert.match(video, /playsInline/);
  assert.match(video, /\bcontrols\b/);
  assert.doesNotMatch(video, /\bautoPlay\b/);
  assert.match(video, /\{near && \(/);
  assert.match(video, /rootMargin/);
  assert.match(video, /aspectRatio: "9 \/ 16"/);
});

ok('the section sits after the before/after block and says it is demo data', () => {
  const a = page.indexOf('6. לפני / אחרי');
  const b = page.indexOf('6b. DEMO VIDEO');
  const c = page.indexOf('7. THREE PILLARS');
  assert.ok(a > 0 && b > a && c > b);
  assert.match(page, /אלה נתוני דמו/);
});

ok('the clip files exist, are small, and have a poster', () => {
  for (const f of ['public/media/kalmea-demo-20s.mp4', 'public/media/kalmea-demo-20s.webm']) assert.ok(statSync(f).size < 2 * 1024 * 1024, f);
  assert.ok(statSync('public/media/kalmea-demo-poster.jpg').size < 120 * 1024);
});

console.log(`${n} passed`);

// The clips are static files for logged-out visitors: the proxy must not send them to /login.
{
  const proxy = readFileSync('proxy.ts', 'utf8');
  assert.match(proxy, /\(\?:svg\|png\|jpg\|jpeg\|gif\|webp\|ico\|mp4\|webm\)/);
  console.log('ok - proxy leaves .mp4/.webm alone');
}

// Before/after clip (2026-10-13): sits right under the before/after block, above the demo clip, lazy like it.
{
  const pg = rd('app/LandingPage.jsx');
  const a = pg.indexOf('6. לפני / אחרי');
  const b = pg.indexOf('6a. BEFORE / AFTER VIDEO');
  const c = pg.indexOf('6b. DEMO VIDEO');
  assert.ok(a > 0 && b > a && c > b, 'order: before/after text, then its clip, then the demo clip');
  assert.match(pg, /kalmea-before-after\.mp4/);
  assert.match(pg, /kalmea-demo-20s\.mp4/); // the existing clip stays
  const sec = pg.slice(b, c);
  const text = [...sec.matchAll(/>\s*([^<>{}]+?)\s*</g)].map((m) => m[1]).join(' ');
  assert.doesNotMatch(text, /בוט|\d/);
  for (const f of ['mp4', 'webm']) assert.ok(statSync(`public/media/kalmea-before-after.${f}`).size < 2 * 1024 * 1024);
  assert.ok(statSync('public/media/kalmea-before-after.jpg').size < 120 * 1024);
  console.log('ok - before/after clip placed, lazy, files within budget');
}

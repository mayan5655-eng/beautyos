// Landing page (2026-10-12): claims that must stay true, and the things that must never regress. Source-level, since the
// page is a server component with no render harness here.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PLAN_PRICES } from './lib/pricing.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const page = rd('app/LandingPage.jsx');
const cost = rd('app/landing/CostTable.jsx');
const meta = rd('app/page.tsx');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('the cost total starts at the real sum, never at 0', () => {
  assert.match(cost, /useState\(totalLow\)/);
  assert.match(cost, /useState\(totalHigh\)/);
  assert.doesNotMatch(cost, /useState\(0\)/);
});

ok('the listed ranges add up to the figure on the page', () => {
  const rows = [...page.matchAll(/low: (\d+), high: (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(rows.length, 6);
  assert.equal(rows.reduce((s, r) => s + r[0], 0), 3831);
  assert.equal(rows.reduce((s, r) => s + r[1], 0), 10068);
});

ok('Kalmea price is shown: launch price 349 with no end date, regular price 499, no promise of limited spots', () => {
  // The numbers live in lib/pricing.ts (test-pricing.ts); the page reads them from there.
  assert.equal(PLAN_PRICES.regular, 499);
  assert.equal(PLAN_PRICES.launch, 349);
  assert.match(page, /\{priceHe\(PLAN_PRICES\.regular\)\} <span/);
  // Owner, 2026-10-21: an introductory price "for a limited time", with no date shown.
  assert.match(page, /מחיר היכרות \{priceHe\(PLAN_PRICES\.launch\)\} לזמן מוגבל/);
  assert.doesNotMatch(page, /20\.10\.2026|LAUNCH_PRICE_CUTOFF_ISO|Date\.now\(\)\s*<=/, 'the launch price has no end date and no automatic expiry');
  assert.doesNotMatch(page, /לכל החיים/, 'the page must not say "for life"');
  assert.doesNotMatch(page, /לחברות הראשונות/);
  // "לזמן מוגבל" is the owner's wording for the intro price (2026-10-21); limited spots or quantities stay banned.
  assert.doesNotMatch(page, /מקומות|מספר מוגבל|כמות מוגבלת|עד שיגמר|רק ל-\d+ /);
});

ok('the terms page matches the landing: launch price 349, regular 499, no end date', () => {
  const terms = readFileSync('app/terms/page.tsx', 'utf8');
  assert.match(terms, /\{priceHe\(PLAN_PRICES\.launch\)\} לחודש/);
  assert.match(terms, /\{priceHe\(PLAN_PRICES\.regular\)\} לחודש/);
  assert.doesNotMatch(terms, /20\.10\.2026/);
  assert.doesNotMatch(terms, /לכל החיים/);
});

ok('"no credit card" sits next to both sign-up buttons', () => {
  assert.equal((page.match(/בלי כרטיס אשראי/g) || []).length >= 3, true);
});

ok('no claim about an answering bot, and the win-back day count is the app default (90)', () => {
  assert.doesNotMatch(page, /בוט/);
  assert.match(page, /אחרי 90 יום/);
  assert.doesNotMatch(page, /אחרי 60 יום/);
  assert.match(rd('lib/reminders/smartReminders.js'), /winbackDays: .*: 90,/);
});

ok('who is behind Kalmea has no invented numbers, names or quotes', () => {
  const section = page.slice(page.indexOf('8b. WHO IS BEHIND'), page.indexOf('9. DEMO'));
  assert.match(section, /קוסמטיקאית מוסמכת/);
  const text = [...section.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(' ');
  assert.ok(text.length > 40);
  assert.doesNotMatch(text, /\d/);
  assert.doesNotMatch(text, /[“”"]/);
});

ok('FAQ has the five documented answers and the WhatsApp button uses the support number helper', () => {
  assert.equal((page.match(/q: "/g) || []).length, 5);
  assert.match(page, /supportWhatsAppUrl/);
  assert.match(page, /בכל עת/);
  assert.match(page, /תוך 30 יום/);
});

ok('nail techs are addressed and the nails demo link is still there', () => {
  assert.match(page, /ציפורניסטיות/);
  assert.match(page, /\/demo\/nails/);
});

ok('the share card title matches the Hebrew page title', () => {
  const title = 'title: "קלמיה: ניהול העסק לקוסמטיקאיות ולציפורניסטיות"';
  assert.equal(meta.split(title).length - 1, 3); // page, openGraph, twitter
  assert.match(meta, /twitter: \{/);
});

ok('the page carries no long dashes or arrows, and says who it is for in the hero', () => {
  const copy = (s: string) => s.replace(/^\s*(\/\/|\{?\/\*).*$/gm, '');
  for (const src of [page, cost, rd('app/landing/PhoneMock.jsx'), meta]) assert.doesNotMatch(copy(src), /[—–←]| -- /);
  const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. PHONE MOCK'));
  assert.match(hero, /לקוסמטיקאיות ולציפורניסטיות/);
  assert.match(page, /facial-classic\.jpg/);
  assert.match(page, /nails-manicure\.jpg/);
});

ok('the three tutorial videos are on the page and every one of them exists, nothing loads before play', () => {
  const ids = [...page.matchAll(/\{ id: "(\w+)", title:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['welcome', 'booking', 'tour']);
  for (const id of ids) for (const ext of ['mp4', 'jpg']) assert.ok(existsSync(`public/tutorials/kalmea-${id}.${ext}`));
  assert.match(rd('app/landing/DemoVideo.jsx'), /preload="none"/);
});

ok('before and after: red crossed out, green pops, finished picture without JS, sound only after a press', () => {
  const ba = rd('app/landing/BeforeAfter.jsx');
  assert.match(page, /<BeforeAfter rows=\{BEFORE_AFTER\} \/>/);
  assert.match(ba, /useState\("done"\)/); // the server HTML shows both banners
  assert.match(ba, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(ba, /autoplay|<audio|new Audio\(/i);
  const css = rd('app/globals.css');
  assert.match(css, /\.ba-row \.ba-strike, \.ba-row \.ba-after \{ opacity: 1 !important/);
  // withSound only arrives from the row's press; the scroll-in play never creates an AudioContext.
  assert.match(ba, /onClick=\{\(\) => play\(true\)\}/);
  assert.match(ba, /play\(false\)/);
});

ok('the landing page leaves out the business line, terms and privacy keep it', () => {
  assert.match(page, /<KalmeaLegalFooter showBusinessLine=\{false\}/);
  for (const f of ['app/terms/page.tsx', 'app/privacy/page.tsx']) assert.doesNotMatch(rd(f), /showBusinessLine/);
});

ok('a real day: the times run in order and the messages stay "ready", never "sent"', () => {
  const times = [...page.matchAll(/\{ time: "(\d\d:\d\d)"/g)].map((m) => m[1]);
  assert.equal(times.length, 5);
  assert.deepEqual(times, [...times].sort());
  assert.doesNotMatch(page.slice(page.indexOf('const A_DAY'), page.indexOf('const VOICE_LINES')), /נשלח/);
});

ok('the free month without a credit card is said at every call to action', () => {
  const links = page.split('href="/signup"').length - 1;
  assert.equal(links, 3);
  assert.ok((page.match(/בלי כרטיס אשראי/g) || []).length >= 4);
  assert.match(page, /בלי כרטיס אשראי ובלי התחייבות/);
});

console.log(`${n} passed`);

// Landing focus (2026-10-13): one prominent action, everything else quiet.
{
  const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. PHONE MOCK'));
  assert.equal((hero.match(/style=\{pillBtn\}/g) || []).length, 1, 'one prominent button in the hero');
  assert.match(hero, /href="\/signup"[^>]*style=\{pillBtn\}[\s\S]*חודש ראשון חינם/);
  assert.match(hero, /href="\/demo"/); // the demo is still one click away, as a quiet text link
  assert.doesNotMatch(hero.slice(hero.indexOf('href="/demo"') - 40, hero.indexOf('href="/demo"') + 200), /pillBtn/);
  const demo = page.slice(page.indexOf('9. DEMO'), page.indexOf('9b. FAQ'));
  assert.doesNotMatch(demo, /boxShadow: "var\(--shadow-sm\)"/); // the two big cards are gone
  assert.match(demo, /DEMOS\.map/);
  assert.match(demo, /ציפורניסטיות/);
  const finalCta = page.slice(page.indexOf('10. FINAL CTA'));
  assert.equal((finalCta.match(/style=\{pillBtn\}/g) || []).length, 1);
  console.log('ok - landing focus: one prominent action in the hero and at the end, demo as quiet links');
}

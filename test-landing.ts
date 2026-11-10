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
  assert.match(page, /מניקוריסטיות/);
  assert.match(page, /\/demo\/nails/);
});

ok('the share card title matches the Hebrew page title', () => {
  const title = 'title: "קלמיה: ניהול העסק לקוסמטיקאיות ולמניקוריסטיות"';
  assert.equal(meta.split(title).length - 1, 3); // page, openGraph, twitter
  assert.match(meta, /twitter: \{/);
});

ok('the page carries no long dashes or arrows, and says who it is for in the hero', () => {
  const copy = (s: string) => s.replace(/^\s*(\/\/|\{?\/\*).*$/gm, '');
  for (const src of [page, cost, rd('app/landing/PhoneMock.jsx'), meta]) assert.doesNotMatch(copy(src), /[—–←]| -- /);
  const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. BEFORE AND AFTER'));
  assert.match(hero, /<h1[^>]*>קוסמטיקאית או מניקוריסטית שעובדת לבד\?<\/h1>/, 'who it is for IS the headline');
  assert.match(page, /photo-cosmetician\.jpg/);
  assert.match(page, /photo-manicure\.jpg/);
});

ok('owner, 2026-10-30: nothing AI-made on the page, every screen is a real one, nothing claims more than the product does', () => {
  assert.doesNotMatch(page, /\/defaults\//, 'the /defaults/ pictures are AI-generated');
  assert.doesNotMatch(page, /presenter|PRESENTER|דמות AI/);
  for (const m of page.matchAll(/"\/landing\/([\w-]+\.jpg)"/g)) assert.ok(existsSync(`public/landing/${m[1]}`), m[1]);
  assert.equal((page.match(/shot: "\/landing\/app-/g) || []).length, 6, 'five areas and the booking moment');
  // Automatic WhatsApp is off (platform_settings), so reminders are "ready to send" until it is switched on.
  assert.doesNotMatch(page, /תזכורות אוטומטיות/);
  assert.match(page, /תזכורות מוכנות לשליחה/);
  assert.doesNotMatch(page, /[״"]\s*[א-ת ]+\s*[״"]\s*-\s*[א-ת]+/, 'no quoted testimonial');
});

ok('the in-action clips exist and nothing loads before play', () => {
  const ids = [...page.matchAll(/\{ id: "(\w+)", title:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['leads', 'booking', 'messages', 'content', 'data']);
  for (const id of ids) for (const ext of ['mp4', 'jpg']) assert.ok(existsSync(`public/media/landing-${id}.${ext}`));
  assert.match(rd('app/landing/DemoVideo.jsx'), /preload="none"/);
});

ok('before and after: soft red and green in pairs, finished picture without JS, no sound', () => {
  const ba = rd('app/landing/BeforeAfter.jsx');
  assert.match(page, /<BeforeAfter rows=\{beforeAfterRows\(claims\)\} \/>/);
  // 8 written inline plus the no-show row and the reschedule row: ten pairs, the most the section should carry.
  const list = page.slice(page.indexOf('const BEFORE_AFTER = ['), page.indexOf('function beforeAfterRows'));
  assert.equal((list.match(/before: "/g) || []).length + (list.match(/^\s+(NO_SHOW_READY|RESCHEDULE),$/gm) || []).length, 10);
  for (const icon of [...page.matchAll(/icon: "(\w+)"/g)].map((m) => m[1])) assert.match(ba, new RegExp(`\\b${icon}: "M`), `icon ${icon} has a path`);
  assert.doesNotMatch(ba, /use client|autoplay|<audio|AudioContext/i);
  const css = rd('app/globals.css');
  assert.match(css, /\.lp-ba-cell\.is-before \{ background: #FBF0EE/);
  assert.match(css, /\.lp-ba-cell\.is-after \{ background: #EEF4EE/);
});

ok('the landing page leaves out the business line, terms and privacy keep it', () => {
  assert.match(page, /<KalmeaLegalFooter showBusinessLine=\{false\}/);
  for (const f of ['app/terms/page.tsx', 'app/privacy/page.tsx']) assert.doesNotMatch(rd(f), /showBusinessLine/);
});

ok('a real day: three moments, and the "with" side never says a message went out by itself', () => {
  const m = page.slice(page.indexOf('const MOMENTS'), page.indexOf('const AREAS'));
  assert.equal((m.match(/\bid: "/g) || []).length, 3);
  assert.doesNotMatch(m, /נשלח/);
  assert.match(rd('app/landing/ClinicDay.jsx'), /שום דבר לא יוצא בלי שאת שולחת/);
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
  const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. BEFORE AND AFTER'));
  assert.equal((hero.match(/style=\{pillBtn\}/g) || []).length, 1, 'one prominent button in the hero');
  assert.match(hero, /href="\/signup"[^>]*style=\{pillBtn\}>התחילי חודש בחינם/);
  assert.match(hero, /href="#how"/); // the second action is a quiet link down to the real day
  const demo = page.slice(page.indexOf('9. DEMO'), page.indexOf('9b. FAQ'));
  assert.doesNotMatch(demo, /boxShadow: "var\(--shadow-sm\)"/); // the two big cards are gone
  assert.match(demo, /DEMOS\.map/);
  assert.match(demo, /מניקוריסטיות/);
  const finalCta = page.slice(page.indexOf('10. FINAL CTA'));
  assert.equal((finalCta.match(/style=\{pillBtn\}/g) || []).length, 1);
  console.log('ok - landing focus: one prominent action in the hero and at the end, demo as quiet links');
}

// Landing sharpen (2026-11-10): founder line up top, a concrete hero line, and only claims that are live for every business.
{
  const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. BEFORE AND AFTER'));
  const kicker = hero.indexOf('<p className="lp-kicker">נבנתה על ידי קוסמטיקאית, בשביל קוסמטיקאיות</p>');
  assert.ok(kicker > 0 && kicker < hero.indexOf('<h1'), 'the founder line sits right above the headline');
  assert.match(hero, /<p className="lp-h1-sub">את מטפלת בלקוחות\. Kalmea עוזרת לך לטפל בעסק\.<\/p>/);
  assert.match(page, /נולדה מתוך הקליניקה/, 'the founder section at the bottom stays');
  // The hero line names the deposit only while deposits are on for everyone; otherwise the same line without it.
  assert.match(hero, /claims\.deposits \? "יומן, קופה ושיווק במערכת אחת\. הלקוחות קובעות, משלמות מקדמה ומזיזות תור לבד\." : "יומן, קופה ושיווק במערכת אחת\. הלקוחות קובעות ומזיזות תור לבד\."/);
  assert.equal((page.match(/משלמות מקדמה/g) || []).length, 1);
  // Deposit rows exist only as the deposit-on swap, and the Grow requirement is said next to them.
  assert.match(page, /if \(!claims\.deposits\) return BEFORE_AFTER;/);
  assert.match(page, /claims\.depositBit \? NO_SHOW_DEPOSIT_BIT : NO_SHOW_DEPOSIT/);
  assert.match(page, /\{claims\.deposits && <p className="lp-fine" data-testid="deposit-note">[^<]*Grow[^<]*<\/p>\}/);
  assert.match(page, /after: "מזיזה לבד, לפי מדיניות הביטול שלך"/);
  // Not claimed: automatic reminders (off).
  assert.doesNotMatch(page, /תזכורות אוטומטיות|נשלחות אוטומטית/);
  // The intake gate is live (its migration ran 2026-11-10). The form is digital; the patch test is never called digital.
  assert.match(page, /before: "ניירת והצהרות בריאות", after: "הצהרת בריאות דיגיטלית לפני הטיפול, ותזכורת לבדיקת רגישות ללקוחה חדשה"/);
  assert.doesNotMatch(page, /בדיקת רגישות דיגיטלית/);
  // The terms say the launch price may change with notice, so the page promises no lock-in.
  assert.doesNotMatch(page, /נשארת על המחיר/);
  assert.match(page, /Kalmea לא לוקחת אחוזים מהמכירות שלך/);
  // Testimonials: a slot that renders nothing while the list is empty.
  assert.match(page, /<Testimonials \/>/);
  assert.match(rd('app/landing/Testimonials.jsx'), /if \(list\.length === 0\) return null;/);
  console.log('ok - landing sharpen: founder kicker, concrete hero line, deposit claims behind the live switch, no lock-in promise');
}


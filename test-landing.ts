// Landing page (2026-10-12, reworked 2026-11-25 "less text"): claims that must stay true, and the things that must never regress.
// Source-level, since the page is a server component with no render harness here.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PLAN_PRICES } from './lib/pricing.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const page = rd('app/LandingPage.jsx');
const meta = rd('app/page.tsx');
const css = rd('app/globals.css');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const copy = (s: string) => s.replace(/^\s*(\/\/|\{?\/\*).*$/gm, '');

// The page above the FAQ, and the FAQ itself.
// The hero is the original one (restored 2026-11-25) and is outside the 12-word rule; the rule covers everything below it.
const belowHero = page.slice(page.indexOf('3. THREE BLOCKS'), page.indexOf('6. FAQ'));
const hero = page.slice(page.indexOf('2. HERO'), page.indexOf('3. THREE BLOCKS'));
const blocksSrc = page.slice(page.indexOf('const BLOCKS = ['), page.indexOf('// The comparison list'));
const faqSrc = page.slice(page.indexOf('const faq = ['), page.indexOf('return (\n    <div dir="rtl"'));

ok('Kalmea price is shown: launch price 349 only (owner 2026-11-16: no struck regular price), no end date, no limited spots', () => {
  // The numbers live in lib/pricing.ts (test-pricing.ts); the page reads them from there.
  assert.equal(PLAN_PRICES.regular, 499);
  assert.equal(PLAN_PRICES.launch, 349);
  assert.match(page, /\{priceHe\(PLAN_PRICES\.launch\)\} <span/);
  assert.ok(page.includes('>מחיר השקה</p>'));
  assert.doesNotMatch(page, /priceHe\(PLAN_PRICES\.regular\)/, 'no regular price beside it');
  assert.doesNotMatch(page, /20\.10\.2026|LAUNCH_PRICE_CUTOFF_ISO|Date\.now\(\)\s*<=/, 'the launch price has no end date and no automatic expiry');
  assert.doesNotMatch(page, /לכל החיים/, 'the page must not say "for life"');
  assert.doesNotMatch(page, /לחברות הראשונות/);
  assert.doesNotMatch(page, /מקומות|מספר מוגבל|כמות מוגבלת|עד שיגמר|רק ל-\d+ /);
  // The terms say the launch price may change with notice, so the page promises no lock-in.
  assert.doesNotMatch(page, /נשארת על המחיר/);
});

ok('price details moved to the FAQ: final price, no cut of her sales, payback line', () => {
  assert.match(faqSrc, /q: "כמה זה עולה\?"/);
  assert.match(faqSrc, /זה המחיר הסופי: אין תוספת מע״מ ואין עלויות נסתרות/);
  assert.match(faqSrc, /Kalmea לא לוקחת אחוזים מהמכירות שלך/);
  assert.match(faqSrc, /שניים או שלושה תורים בחודש/);
  assert.match(faqSrc, /annualPlanEnabled\(\) \?/, 'the yearly plan only behind its switch');
});

ok('the terms page matches the landing: launch price 349 only, no end date', () => {
  const terms = readFileSync('app/terms/page.tsx', 'utf8');
  assert.match(terms, /\{priceHe\(PLAN_PRICES\.launch\)\} לחודש/);
  assert.doesNotMatch(terms, /PLAN_PRICES\.regular/);
  assert.doesNotMatch(terms, /20\.10\.2026/);
  assert.doesNotMatch(terms, /לכל החיים/);
});

ok('"no credit card" sits next to both sign-up buttons, and there are exactly two', () => {
  assert.equal(page.split('href="/signup"').length - 1, 2);
  assert.ok((page.match(/בלי כרטיס אשראי/g) || []).length >= 2);
  assert.match(hero, /התחילי חודש בחינם<\/Link>\s*<p className="lp-cta-note">בלי כרטיס אשראי ובלי התחייבות<\/p>/);
  assert.match(page, /החודש הראשון חינם, בלי כרטיס אשראי\./);
});

ok('no claim about an answering bot, and the win-back day count is the app default (90)', () => {
  assert.doesNotMatch(page, /בוט/);
  assert.match(page, /אחרי 90 יום/);
  assert.doesNotMatch(page, /אחרי 60 יום/);
  assert.match(rd('lib/reminders/smartReminders.js'), /winbackDays: .*: 90,/);
});

ok('the founder strip is her own reel plus one sentence, with no invented numbers, names or quotes', () => {
  const section = page.slice(page.indexOf('4. FOUNDER STRIP'), page.indexOf('4b. TESTIMONIALS'));
  assert.match(section, /<DemoVideo mp4="\/media\/landing-founder\.mp4" poster="\/media\/landing-founder\.jpg"[^>]*\bsound\b/);
  assert.ok(existsSync('public/media/landing-founder.mp4') && existsSync('public/media/landing-founder.jpg'));
  const line = section.match(/<p className="lp-founder-line">([^<]+)<\/p>/)?.[1] ?? '';
  assert.ok(line.length > 20);
  assert.doesNotMatch(line, /\d/);
  assert.doesNotMatch(line, /[“”"]/);
  // The longer founder story lives in the FAQ.
  assert.match(faqSrc, /קוסמטיקאית מוסמכת/);
});

ok('FAQ: closed by default, every documented answer kept, the WhatsApp button uses the support number helper', () => {
  assert.equal((faqSrc.match(/\bq: "/g) || []).length, 12);
  assert.match(page, /supportWhatsAppUrl/);
  assert.match(page, /בכל עת/);
  assert.match(page, /תוך 30 יום/);
  assert.match(page, /<details key=\{f\.q\}/);
  assert.doesNotMatch(page, /<details[^>]*\bopen\b/, 'no answer is open by default');
});

ok('nail techs are addressed and the nails demo link is still there, as a plain link (no prefetch of a signing-in route)', () => {
  assert.match(page, /מניקוריסטיות/);
  assert.match(page, /\/demo\/nails/);
  assert.match(page, /\/demo\/cosmetics/);
  assert.match(page, /data-testid="hero-demos"/);
  assert.doesNotMatch(page, /<Link href=\{d\.href\}/);
});

ok('the share card title matches the Hebrew page title', () => {
  const title = 'title: "קלמיה: ניהול העסק לקוסמטיקאיות ולמניקוריסטיות"';
  assert.equal(meta.split(title).length - 1, 3); // page, openGraph, twitter
  assert.match(meta, /twitter: \{/);
});

ok('hero: the original opening, restored exactly (kicker, slogan, subline, founder reel, one button, quiet link, demo links)', () => {
  assert.match(hero, /<p className="lp-kicker">נבנתה על ידי קוסמטיקאית, בשביל קוסמטיקאיות ומניקוריסטיות<\/p>/);
  assert.ok(hero.indexOf('lp-kicker') > 0 && hero.indexOf('lp-kicker') < hero.indexOf('<h1'), 'the founder line sits right above the headline');
  assert.match(hero, /<h1[^>]*>קוסמטיקאית או מניקוריסטית שעובדת לבד\?<\/h1>/, 'who it is for IS the headline');
  assert.match(hero, /<p className="lp-h1-sub">את מטפלת בלקוחות\. Kalmea עוזרת לך לטפל בעסק\.<\/p>/);
  // Value pass (2026-11-25): the feature-list line became the brand slogan, the same with deposits on or off.
  assert.match(hero, /<p className="lp-hero-desc">פחות זמן על ניהול, יותר זמן בשבילך\.<\/p>/);
  assert.doesNotMatch(hero, /משלמות מקדמה|יומן, קופה ושיווק/, 'no feature list in the hero');
  assert.equal((hero.match(/style=\{pillBtn\}/g) || []).length, 1, 'one prominent button in the hero');
  assert.match(hero, /href="\/signup"[^>]*style=\{pillBtn\}>התחילי חודש בחינם/);
  assert.match(hero, /href="#how"/);
  assert.match(page, /<section id="how"/, 'the quiet link lands on a real section');
  assert.match(hero, /data-testid="hero-demos"/);
  assert.match(hero, /DEMOS\.map/);
  assert.doesNotMatch(hero, /<Link href=\{d\.href\}/, 'demo links are plain <a>, no prefetch');
  // Owner, 2026-11-17: the hero shows her own explainer reel, with sound, and the file is there.
  assert.match(page, /const HERO_VIDEO = true;/);
  assert.match(hero, /<DemoVideo mp4="\/media\/landing-founder\.mp4" poster="\/media\/landing-founder\.jpg"[^>]*\bsound\b/);
  assert.match(page, /photo-cosmetician\.jpg/);
  assert.match(page, /photo-manicure\.jpg/);
});


ok('three blocks (secretary, marketing, sales): an icon, a title of at most 3 words, a line of at most 12, a real screen each', () => {
  const rows = [...blocksSrc.matchAll(/id: "(\w+)", icon: "(\w+)", title: "([^"]+)", text: "([^"]+)",\s*shot: "(\/landing\/[\w-]+\.jpg)"/g)];
  assert.deepEqual(rows.map((r) => r[1]), ['secretary', 'marketing', 'sales']);
  for (const [, id, icon, title, text, shot] of rows) {
    assert.ok(words(title) <= 3, `${id} title: ${title}`);
    assert.ok(words(text) <= 12, `${id} line: ${text}`);
    assert.match(page, new RegExp(`${icon}: <>`), `${id} icon is drawn`);
    assert.ok(existsSync(`public${shot}`), shot);
  }
  assert.deepEqual(rows.map((r) => r[4]), [
    'לקוחות קובעות לבד. את לא עוצרת טיפול בשביל הטלפון.',
    'יודעת מה לפרסם כל שבוע, בלי לשבור את הראש.',
    'פניות לא הולכות לאיבוד. הן הופכות לתורים.',
  ]);
  assert.match(page, /className="lp-block-shot"/);
});

ok('word budget: no block below the hero and outside the FAQ has more than 12 words', () => {
  // Every static text node of the JSX above the FAQ, plus the strings of the data tables it renders.
  const nodes = [...copy(belowHero).matchAll(/>([^<>{}]*[א-תA-Za-z0-9][^<>{}]*)</g)].map((m) => m[1].trim());
  assert.ok(nodes.length >= 4, String(nodes.length));
  for (const t of nodes) assert.ok(words(t) <= 12, `too long (${words(t)}): ${t}`);
  for (const m of blocksSrc.matchAll(/(?:title|text): "([^"]+)"/g)) assert.ok(words(m[1]) <= 12, m[1]);
});

ok('only what exists today: nothing in development is promised (campaigns, supplier ordering, automatic sending)', () => {
  assert.doesNotMatch(copy(page), /קמפיינ|ספק|הזמנת ציוד|אוטומטית|נשלחות אוטומטית|תזכורות אוטומטיות/);
  assert.match(page, /תזכורות מוכנות/);
});

ok('the page carries no long dashes or arrows', () => {
  for (const src of [page, meta]) assert.doesNotMatch(copy(src), /[—–←]| -- /);
});

ok('owner, 2026-10-30: nothing AI-made on the page, every screen is a real one', () => {
  assert.doesNotMatch(page, /\/defaults\//, 'the /defaults/ pictures are AI-generated');
  assert.doesNotMatch(page, /presenter|PRESENTER|דמות AI/);
  for (const m of page.matchAll(/"\/landing\/([\w-]+\.jpg)"/g)) assert.ok(existsSync(`public/landing/${m[1]}`), m[1]);
  assert.equal((page.match(/"\/landing\/app-[\w-]+\.jpg"/g) || []).length, 4, 'the three blocks and the hero fallback photo layout');
  assert.doesNotMatch(page, /[״"]\s*[א-ת ]+\s*[״"]\s*-\s*[א-ת]+/, 'no quoted testimonial');
});

ok('FAQ keeps the explanations that left the page, and only live claims', () => {
  assert.match(faqSrc, /q: "מה Kalmea נותנת מעבר למערכת תורים\?"/);
  assert.match(faqSrc, /list: compareExtras\(claims\)/);
  assert.match(faqSrc, /q: "איך עובדות התזכורות וההודעות\?"/);
  assert.match(faqSrc, /ומזיזות תור לבד לפי מדיניות הביטול שלך/);
  assert.match(faqSrc, /q: "יש לי כבר לקוחות\. צריך להקליד את כולן מחדש\?"/);
  // The file import (Excel / another system) is behind NEXT_PUBLIC_IMPORT_TOOL, so the page does not promise it.
  assert.doesNotMatch(faqSrc, /אקסל|מתוכנה אחרת/);
  // Deposit rows exist only while deposits are on for everyone, and the Grow requirement is said next to them.
  assert.match(page, /if \(claims\.deposits\) out\.splice/);
  assert.match(page, /\{claims\.deposits && <p className="lp-fine" data-testid="deposit-note">[^<]*Grow[^<]*<\/p>\}/);
  assert.match(page, /if \(claims\.receipts\) out\.splice/);
});

ok('the landing page leaves out the business line, terms and privacy keep it', () => {
  assert.match(page, /<KalmeaLegalFooter showBusinessLine=\{false\}/);
  for (const f of ['app/terms/page.tsx', 'app/privacy/page.tsx']) assert.doesNotMatch(rd(f), /showBusinessLine/);
});

ok('existing links and analytics are intact: login, signup, legal footer, analytics, pixel, testimonials slot', () => {
  assert.match(page, /href=\{signedIn \? "\/dashboard" : "\/login"\}/);
  assert.match(page, /<PublicFooterLinks/);
  assert.match(page, /<PublicAnalytics \/>/);
  assert.match(page, /<MetaPixel \/>/);
  assert.match(page, /<Testimonials \/>/);
  assert.match(rd('app/landing/Testimonials.jsx'), /if \(list\.length === 0\) return null;/);
});

ok('mobile first: the original hero is a single column, and the three blocks stack on a phone', () => {
  assert.match(css, /\.lp-hero \{[^}]*flex-direction: column/);
  assert.match(css, /\.lp-trio \{ display: grid; grid-template-columns: 1fr;/);
  assert.doesNotMatch(css, /lp-hero2/, 'the replaced hero left no CSS behind');
});


console.log(`${n} passed`);

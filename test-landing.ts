// Landing page (2026-10-12): claims that must stay true, and the things that must never regress. Source-level, since the
// page is a server component with no render harness here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

ok('Kalmea price is shown, with the first-members line and no promise of limited spots', () => {
  assert.match(page, /499 ₪/);
  assert.match(page, /349 ₪ לחודש, לכל החיים, למצטרפות עד 20.10/);
  assert.match(page, /המחיר נשאר כל עוד המנוי פעיל, בלי הפסקה./);
  assert.doesNotMatch(page, /לחברות הראשונות/);
  assert.doesNotMatch(page, /מקומות|מוגבל|עד שיגמר|רק ל-\d+ /);
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
  assert.match(page, /טכנאיות ציפורניים/);
  assert.match(page, /\/demo\/nails/);
});

ok('the share card title matches the Hebrew page title', () => {
  const title = 'title: "קלמיה — עסק פורח, חיים עם יותר שקט"';
  assert.equal(meta.split(title).length - 1, 3); // page, openGraph, twitter
  assert.match(meta, /twitter: \{/);
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
  assert.match(demo, /טכנאיות ציפורניים/);
  const finalCta = page.slice(page.indexOf('10. FINAL CTA'));
  assert.equal((finalCta.match(/style=\{pillBtn\}/g) || []).length, 1);
  console.log('ok - landing focus: one prominent action in the hero and at the end, demo as quiet links');
}

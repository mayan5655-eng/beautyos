// Pre-launch fixes (2026-10-13): Hebrew metadata on the public client pages, the regular-price clause in the terms,
// and the one leftover English label. Source-level checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('signup and login have their own Hebrew title and description, not the English root metadata', () => {
  const s = rd('app/signup/layout.tsx');
  const l = rd('app/login/layout.tsx');
  assert.match(s, /'הרשמה · קלמיה'/);
  assert.match(s, /'החודש הראשון חינם, בלי כרטיס אשראי\.'/);
  assert.match(l, /'התחברות · קלמיה'/);
  for (const t of [s, l]) assert.doesNotMatch(t, /Beauty Business OS/);
});

ok('the share card helper sets og + twitter in Hebrew and keeps the shared image', () => {
  const m = rd('lib/pageMeta.ts');
  assert.match(m, /openGraph:/);
  assert.match(m, /twitter:/);
  assert.equal((m.match(/\/og-1200x630\.jpg/g) || []).length, 2);
  assert.match(m, /locale: 'he_IL'/);
});

ok('demo, terms and privacy have Hebrew descriptions', () => {
  assert.match(rd('app/demo/page.tsx'), /hebrewPageMeta\(/);
  assert.doesNotMatch(rd('app/terms/page.tsx'), /Beauty Business OS/);
  assert.doesNotMatch(rd('app/privacy/page.tsx'), /Beauty Business OS/);
  assert.match(rd('app/terms/page.tsx'), /title: "תנאי שימוש · Kalmea"/); // titles stay as they were
  assert.match(rd('app/privacy/page.tsx'), /title: "מדיניות פרטיות · Kalmea"/);
});

ok('terms state the regular price and the free month, in Hebrew with the English line after it', () => {
  const t = rd('app/terms/page.tsx');
  const i = t.indexOf('המחיר הרגיל הוא 499 ₪ לחודש. החודש הראשון חינם, בלי כרטיס אשראי.');
  assert.ok(i > 0);
  const en = t.indexOf('The regular price is NIS 499 per month', i);
  assert.ok(en > i);
  assert.ok(t.indexOf('Launch Price') > en, 'the clause sits before the launch-price clause');
});

ok('payments export button is Hebrew', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /ייצוא לאקסל/);
  assert.doesNotMatch(a, /ייצוא Excel/);
});

ok('the posts-and-templates subtitle no longer ends with the "בלי AI" wording and keeps the rest', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, />תבניות מוכנות בצבעים שלך, העיצובים שלך ופוסטים לשבוע<\/p>/);
  assert.doesNotMatch(a, /ופוסטים לשבוע — בלי AI/);
});

console.log(`${n} passed`);

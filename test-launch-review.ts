// Launch review (2026-10-12): copy and small day-one fixes, pinned at source level.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const app = rd('app/beautyos.jsx');

ok('no impersonal "נא ל..." left in the app shell or in what her clients read', () => {
  for (const f of ['app/beautyos.jsx', 'app/BookingPage.jsx', 'app/api/book-appointment/route.js', 'app/api/reviews/route.js', 'app/form/page.jsx']) {
    assert.doesNotMatch(rd(f), /["'`>\s]נא [א-ת]/, f);
    assert.doesNotMatch(rd(f), /אנא /, f);
  }
});

ok('the two package buttons have different names', () => {
  assert.match(app, /\+ מכירת חבילה ללקוחה/);
  assert.match(app, /\+ הגדרת חבילה למכירה/);
  assert.doesNotMatch(app, /\+ חבילה חדשה/);
});

ok('on phones the help bubble is icon only and the mic is smaller', () => {
  assert.match(app, /\.fab-help\{font-size:0!important/);
  assert.match(app, /\.fab-voice\{width:48px!important/);
});

ok('settings > advanced carries a visible way to ask for the account to be deleted', () => {
  assert.match(app, /data-testid="account-deletion"/);
  assert.match(app, /לבקש מחיקת חשבון/);
});

ok('sign-up says the first month is free and asks for no card', () => {
  assert.match(rd('app/signup/page.tsx'), /החודש הראשון חינם, בלי כרטיס אשראי/);
});

console.log(`${n} passed`);

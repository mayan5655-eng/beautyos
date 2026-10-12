// Things the new-tenant walkthrough (2026-10-12) found, pinned so they do not come back. Source-level: the
// onboarding page needs a session and a database to render.
import assert from 'node:assert/strict';
import { readAppSource } from './lib/appSource.ts';
import { readFileSync } from 'node:fs';

const rd = (p: string) => (p === 'app/beautyos.jsx' ? readAppSource() : readFileSync(p, 'utf8')).split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const ob = rd('app/onboarding/page.tsx');
const app = rd('app/beautyos.jsx');

ok('onboarding progress is "step N of M" with a bar, not a wrapping chain of arrows', () => {
  assert.match(ob, /שלב \{step\} מתוך \{STEP_NAMES\.length\}/);
  assert.doesNotMatch(ob, /<span aria-hidden style=\{\{ color: "var\(--ink-3\)", fontSize:"var\(--t-xs\)" \}\}>←<\/span>/);
});

ok('the back button points back (right in RTL) and forward buttons keep the left arrow', () => {
  assert.match(ob, /→ הקודם/);
  assert.doesNotMatch(ob, /← הקודם/);
  assert.match(ob, /הבא ←/);
});

ok('the welcome banner is only on step 1; later steps use the compact mark so the form is not pushed down', () => {
  assert.match(ob, /LOGO_COMPACT/);
  assert.doesNotMatch(ob, /BANNER_HEADER/);
});

ok('no "one more step" promise on a step with two left, and no confusing "0 to 24"', () => {
  assert.doesNotMatch(ob, /מ-0 עד 24/);
  assert.match(ob, /STEP_NAMES\.length - step/);
});

ok('the mic is lifted above the sidebar booking pill on desktop', () => {
  assert.match(app, /@media \(min-width:681px\)\{\s*\.fab-voice\{bottom:84px!important\}/);
});

ok('a day-one account gets no goals invitation, and an empty revenue chart says why', () => {
  assert.match(rd('app/GoalsCard.jsx'), /if \(!hasActivity\) return null;/);
  assert.match(app, /עוד אין הכנסות להצגה/);
});

ok('the seven settings groups all show: the tab row wraps instead of scrolling two of them out of sight', () => {
  assert.ok(app.includes('borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>\n                {[{k:"business"'));
});

console.log(`${n} passed`);

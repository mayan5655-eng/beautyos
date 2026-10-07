// The floating mic and "תקועה?" bubble must not sit on top of a form. Found 2026-10-07 at 390 and 430 px: inside the client form, the payment
// sheet and the appointment sheet they covered the status chips, the note field and the save row. They step aside while anything modal is open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./app/globals.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('./app/Sheet.tsx', import.meta.url), 'utf8');

// the rule: both helpers hide while a Sheet or a data-overlay is in the page
const rule = css.match(/body:has\(([^)]*)\)\s+\.fab-voice,\s*body:has\(([^)]*)\)\s+\.fab-help\s*\{([^}]*)\}/);
assert.ok(rule, 'the rule exists');
assert.equal(rule![1], rule![2], 'the same condition for both helpers');
assert.ok(/\.sheet-backdrop/.test(rule![1]) && /\[data-overlay\]/.test(rule![1]), 'a Sheet OR a data-overlay');
assert.ok(/display:\s*none\s*!important/.test(rule![3]), 'it beats the inline display:flex the helpers carry');

// the selectors are real: every modal is a .sheet-backdrop, or carries the marker
assert.ok(/className="sheet-backdrop"/.test(sheet), 'Sheet renders .sheet-backdrop');
for (const kind of ['client', 'lead', 'more']) assert.ok(new RegExp(`data-overlay="${kind}"`).test(app), `the ${kind} overlay carries data-overlay`);
assert.ok(/className="fab-voice"/.test(app) && /className="fab-help"/.test(app), 'the two helpers carry the classes the rule names');

// every full-screen fixed overlay in the app is covered: either a Sheet, or marked
let seen = 0;
for (const [i, line] of app.split('\n').entries()) {
  if (/position:"fixed",inset:0/.test(line) && /<div/.test(line)) seen++;
  if (/position:"fixed",inset:0/.test(line) && /<div/.test(line) && !/data-overlay=/.test(line)) {
    // the "more" sheet opens its <div> on the line above its style; accept it when the marker is within two lines above
    const near = app.split('\n').slice(Math.max(0, i - 2), i + 1).join('\n');
    assert.ok(/data-overlay=/.test(near), `unmarked full-screen overlay at line ${i + 1}: ${line.slice(0, 90)}`);
  }
}

assert.ok(seen >= 2, `the scan found the full-screen overlays (${seen})`);

console.log('fab overlap: ok');

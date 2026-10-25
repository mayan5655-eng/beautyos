// A phone before Safari/iOS 15.4 (Chrome 105) gets a page whose styles (@layer, :has) and buttons do not work. Instead of a dead page it must get a
// line saying so. The probe has to be a real <script> in the root layout, use no eval (the CSP), and fire only when :has() is missing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const m = /id="old-browser-note"[\s\S]*?__html: `([^`]+)`/.exec(layout);
assert.ok(m, 'the old-browser note script is in the root layout');
const js = m![1];
assert.match(js, /CSS\.supports\("selector\(:has\(\*\)\)"\)/, 'probes :has()');
assert.doesNotMatch(js, /\beval\(|new Function/, 'no eval: the CSP forbids it');
// run it in a fake page: modern browser -> nothing; old browser (no :has()) -> one alert
const run = (modern: boolean) => {
  const added: string[] = []; const listeners: Array<() => void> = [];
  const doc = { addEventListener: (_: string, f: () => void) => listeners.push(f), createElement: () => ({ style: {}, setAttribute() {}, set textContent(t: string) { added.push(t); } }), body: { appendChild() {} } };
  const fakeWindow = { CSS: { supports: (q: string) => modern || !/:has/.test(q) } };
  new Function('document', 'window', 'CSS', js)(doc, fakeWindow, fakeWindow.CSS);
  listeners.forEach((f) => f());
  return added;
};
assert.deepEqual(run(true), [], 'a modern browser sees nothing');
const old = run(false);
assert.equal(old.length, 1, 'an old browser gets exactly one note');
assert.match(old[0], /iOS 15\.4/);
console.log('old-browser-note: ok');

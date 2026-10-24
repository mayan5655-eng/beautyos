// A phone on Safari before 16.4 cannot run this version of Kalmea (Next 16 ships class static blocks). Instead of a dead page it must get a
// line saying so. The probe has to be a real <script> in the root layout, use no eval (the CSP), and fire only when lookbehind is missing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const m = /id="old-browser-note"[\s\S]*?__html: `([^`]+)`/.exec(layout);
assert.ok(m, 'the old-browser note script is in the root layout');
const js = m![1];
assert.match(js, /new RegExp\("\(\?<=a\)b"\)/, 'probes lookbehind');
assert.doesNotMatch(js, /\beval\(|new Function/, 'no eval: the CSP forbids it');
// run it in a fake page: modern browser -> nothing; old browser (RegExp throws on lookbehind) -> one alert
const run = (modern: boolean) => {
  const added: string[] = []; const listeners: Array<() => void> = [];
  const doc = { addEventListener: (_: string, f: () => void) => listeners.push(f), createElement: () => ({ style: {}, setAttribute() {}, set textContent(t: string) { added.push(t); } }), body: { appendChild() {} } };
  const FakeRegExp = function (src: string) { if (!modern && /\(\?<[=!]/.test(src)) throw new SyntaxError('invalid'); } as unknown as RegExpConstructor;
  new Function('document', 'RegExp', js)(doc, FakeRegExp);
  listeners.forEach((f) => f());
  return added;
};
assert.deepEqual(run(true), [], 'a modern browser sees nothing');
const old = run(false);
assert.equal(old.length, 1, 'an old browser gets exactly one note');
assert.match(old[0], /iOS 16\.4/);
console.log('old-browser-note: ok');

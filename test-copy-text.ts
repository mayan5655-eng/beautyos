// Copy buttons must say "copied" only when something was copied, and must not throw where the page has no clipboard (in-app browsers).
import assert from 'node:assert/strict';
import { copyText } from './lib/copyText.js';

const written: string[] = [];
assert.equal(await copyText('a', { navigator: { clipboard: { writeText: async (t: string) => { written.push(t); } } }, document: null }), true);
assert.deepEqual(written, ['a']);
// no clipboard object, no selection copy: false, never a throw
assert.equal(await copyText('a', { navigator: {}, document: null }), false);
assert.equal(await copyText('a', { navigator: { clipboard: undefined }, document: { execCommand: undefined } }), false);
// a refused write falls through to the selection copy
const el: Record<string, unknown> = { style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() {} };
const doc = { createElement: () => el, body: { appendChild() {} }, execCommand: (c: string) => c === 'copy' };
assert.equal(await copyText('hello', { navigator: { clipboard: { writeText: async () => { throw new Error('NotAllowed'); } } }, document: doc }), true);
assert.equal(el.value, 'hello');
// selection copy that the browser refuses is false
assert.equal(await copyText('x', { navigator: {}, document: { ...doc, execCommand: () => false } }), false);
console.log('copy-text: ok');

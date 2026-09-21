// The design-token codemod thresholds and the lint rule that keeps them.
//
// The codemod ran once; the rule is what matters going forward. Both are
// tested here because the first pass of shadowToken silently sent every
// "0 24px 60px …" shadow to the smallest tier (the bare 0 had no "px").
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import { fontToken, radiusToken, shadowToken } from './scripts/tokenize-styles.mjs';
import designTokens from './eslint-rules/design-tokens.mjs';

// ── codemod mapping ──────────────────────────────────────────────────────────
assert.equal(fontToken(11), 'var(--t-xs)');
assert.equal(fontToken(12.5), 'var(--t-sm)');
assert.equal(fontToken(14), 'var(--t-md)');
assert.equal(fontToken(16), 'var(--t-lg)');
assert.equal(fontToken(20), 'var(--t-xl)');
assert.equal(fontToken(24), 'var(--t-2xl)');
assert.equal(fontToken(28), 'var(--t-3xl)');
assert.equal(fontToken(34), 'var(--t-hero)');

assert.equal(radiusToken(0), null, 'a 0 radius is not a token');
assert.equal(radiusToken(999), 'var(--r-full)');
assert.equal(radiusToken(8), 'var(--r-xs)');
assert.equal(radiusToken(12), 'var(--r-sm)');
assert.equal(radiusToken(16), 'var(--r-md)');
assert.equal(radiusToken(22), 'var(--r-lg)');
assert.equal(radiusToken(24), 'var(--r-xl)');

assert.equal(shadowToken('none'), null);
assert.equal(shadowToken('var(--shadow-md)'), null);
assert.equal(shadowToken('inset 0 0 0 2px red'), null, 'an inset is a border');
assert.equal(shadowToken('0 8px 18px ${pcShadow}'), 'var(--shadow-accent)');
assert.equal(shadowToken('0 0 0 3px rgba(70,179,123,0.18)'), 'var(--shadow-xs)');
assert.equal(shadowToken('0 2px 8px rgba(0,0,0,0.06)'), 'var(--shadow-sm)');
assert.equal(shadowToken('0 8px 20px rgba(0,0,0,0.12)'), 'var(--shadow-md)');
assert.equal(shadowToken('0 20px 48px -28px rgba(70,50,60,0.25)'), 'var(--shadow-lg)');
assert.equal(shadowToken('0 24px 60px rgba(74,46,90,0.28)'), 'var(--shadow-xl)', 'a bare 0 offset still parses');
assert.equal(shadowToken('0 14px 44px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)'), 'var(--shadow-lg)', 'largest layer wins');

// ── lint rule ────────────────────────────────────────────────────────────────
const linter = new Linter({ configType: 'flat' });
// The rule module is plain JS; ESLint's typings want a fully typed plugin, so
// the config is cast once here rather than typing the rule for a test.
const config = [{
  files: ['**/*.jsx'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { local: { rules: { 'design-tokens': designTokens } } },
  rules: { 'local/design-tokens': 'error' },
}] as unknown as Parameters<Linter['verify']>[1];
const lint = (code: string) => linter.verify(code, config, { filename: 'x.jsx' }).map((m) => m.messageId ?? m.message);

assert.deepEqual(lint('const s = { fontSize: 13 };'), ['type']);
assert.deepEqual(lint('const s = { fontSize: "13px" };'), ['type']);
assert.deepEqual(lint('const s = { fontSize: "var(--t-sm)" };'), []);
assert.deepEqual(lint('const s = { fontSize: big ? 30 : "var(--t-md)" };'), ['type'], 'ternary branches are checked');
assert.deepEqual(lint('const s = { borderRadius: 14 };'), ['radius']);
assert.deepEqual(lint('const s = { borderRadius: 0 };'), [], 'a 0 radius is allowed');
assert.deepEqual(lint('const s = { borderRadius: "50%" };'), [], 'percent radii are allowed');
assert.deepEqual(lint('const s = { boxShadow: "0 2px 8px rgba(0,0,0,0.1)" };'), ['shadow']);
assert.deepEqual(lint('const s = { boxShadow: `0 8px 18px ${pcShadow}` };'), ['shadow']);
assert.deepEqual(lint('const s = { boxShadow: sel ? "var(--shadow-accent)" : "none" };'), []);
assert.deepEqual(lint('const s = { boxShadow: "inset 0 0 0 2px red" };'), [], 'an inset is a border');
assert.deepEqual(lint('const s = { boxShadow: on ? "0 1px 2px red" : "none" };'), ['shadow'], 'the raw branch of a ternary is caught');

console.log('design tokens: ok');

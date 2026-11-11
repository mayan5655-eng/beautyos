// scripts/test-source-view.mjs
//
// Preloaded by scripts/run-tests.mjs (--import) for every test file.
//
// Since 2026-11-11 the screens show their Hebrew through tr() (lib/i18n/tr.ts), so the source says
// {tr("שמירה")} where it used to say שמירה. Many tests read a screen's source and look for its Hebrew copy, which is
// what they mean to protect: the words. This gives them the Hebrew view of the source, the way it read before the
// wrapping: {tr("X")} -> X, attr={tr("X")} -> attr="X", tr("X") -> "X", tr("A {0}", [e]) -> `A ${e}`, trv(e) -> e.
//
// Only a test's own readFileSync(path, 'utf8') of a file under app/ is changed. Module loading is not (node's loader
// does not go through this function with an encoding), lib/ is not, and a test that needs the real wrapped source
// reads it with readRawSource() below or { encoding: 'utf8', raw: true }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const realRead = fs.readFileSync;
const ROOT = process.cwd();

const str = (s) => JSON.parse(s);
const escTpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

export function hebrewView(src) {
  const S = '"((?:[^"\\\\\\n]|\\\\.)*)"';
  let out = src;
  // tr("A {0} B", [x, y]) with a flat argument list -> `A ${x} B`
  // (one level of [] inside an argument is fine: [examples[0]])
  out = out.replace(new RegExp(`\\btr\\(${S}, \\[((?:[^\\[\\]\\n]|\\[[^\\[\\]\\n]*\\])*)\\]\\)`, 'g'), (m, s, args) => {
    const parts = args.split(/,\s*(?![^()]*\))(?![^[]*\])/).map((a) => a.trim());
    const text = escTpl(str(`"${s}"`)).replace(/\{(\d+)\}/g, (mm, i) => (parts[Number(i)] !== undefined ? `\${${parts[Number(i)]}}` : mm));
    return '`' + text + '`';
  });
  // JSX child {tr("X")} -> X
  out = out.replace(new RegExp(`\\{tr\\(${S}\\)\\}`, 'g'), (m, s, off, whole) => {
    const before = whole.slice(Math.max(0, off - 2), off);
    if (/=$/.test(before)) return m; // an attribute, handled next
    return str(`"${s}"`);
  });
  // attr={tr("X")} -> attr="X"
  out = out.replace(new RegExp(`=\\{tr\\(${S}\\)\\}`, 'g'), (m, s) => `="${s}"`);
  // tr("X") -> "X"
  out = out.replace(new RegExp(`\\btr\\(${S}\\)`, 'g'), (m, s) => `"${s}"`);
  // trv(x) -> x  (flat argument)
  out = out.replace(/\btrv\(([^()\n]*(?:\([^()\n]*\))?[^()\n]*)\)/g, '$1');
  return out;
}

fs.readFileSync = function patchedRead(p, opts) {
  const enc = typeof opts === 'string' ? opts : opts && opts.encoding;
  const raw = !!(opts && typeof opts === 'object' && opts.raw);
  const out = realRead.call(fs, p, typeof opts === 'object' && opts && 'raw' in opts ? { ...opts, raw: undefined } : opts);
  if (raw || typeof out !== 'string' || !/^utf-?8$/i.test(String(enc || ''))) return out;
  const abs = p instanceof URL || /^file:/.test(String(p)) ? fileURLToPath(p) : path.resolve(String(p));
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (rel.startsWith('..')) return out;
  // A Windows checkout (core.autocrlf) has CRLF; the tests' patterns, CI and Vercel see LF. Read every repo file as LF,
  // so a run here means what it means there.
  const lf = out.replace(/\r\n/g, '\n');
  if (!rel.startsWith('app/') || !/\.(jsx|tsx|ts|js)$/.test(rel)) return lf;
  return hebrewView(lf);
};

// `import { readFileSync } from 'node:fs'` is a separate binding: this makes it the patched one too.
syncBuiltinESMExports();

export const readRawSource = (p) => realRead.call(fs, p, 'utf8');

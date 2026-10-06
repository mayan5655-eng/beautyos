// testkit/jsxLoader.mjs
//
// A Node module-loader hook that lets a test import the app's REAL components and render them, instead of
// grepping their source for strings. Added 2026-10-06 after an audit found that most of the newest tests
// asserted that text appeared in a file ("the AI block contains 'part="ai"'") - a test that stays green when
// the component renders something else, or nothing.
//
// It does three things and nothing clever:
//   * resolves the `@/` alias to the repo root;
//   * resolves extensionless and directory imports (`./Icon`, `@/lib/design/reels`) the way the bundler does;
//   * transpiles .jsx/.tsx with the TypeScript compiler that is already a dev dependency (jsx: react-jsx).
// Anything a component imports that cannot run outside a browser is replaced with an inert stub (below), so the
// test renders the structure under test and nothing else.
//
// Used through testkit/render.mjs (importApp / renderApp). Not used in production.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['', '.ts', '.tsx', '.jsx', '.js', '.mjs'];

// Editors and anything else that needs a browser to even load. The studio's LIST screens never render them.
const STUBS = [/app\/design\/(DesignEditor|ReelEditor|Archive|CesdkEditor|ReelRender)\.jsx?$/];
const STUB_SOURCE = `export default function Stub() { return null; }
export const FORMAT_FOR_CHANNEL = {};
`;

// Framework modules a presentational component imports but a render does not need. Inert stand-ins.
const NEXT_STUBS = {
  'next/image': `import React from 'react';
export default function Image(p) { return React.createElement('img', { src: typeof p.src === 'string' ? p.src : '', alt: p.alt || '' }); }
`,
  'next/link': `import React from 'react';
export default function Link(p) { return React.createElement('a', { href: p.href }, p.children); }
`,
  'next/navigation': `export const useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {} });
export const usePathname = () => '/';
export const useSearchParams = () => new URLSearchParams('');
export const notFound = () => { throw new Error('notFound'); };
`,
  'next/dynamic': `export default function dynamic() { return function Dynamic() { return null; }; }
`,
};

function tryFile(p) {
  for (const ext of EXTS) {
    const f = p + ext;
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  for (const ext of EXTS.slice(1)) {
    const f = path.join(p, 'index' + ext);
    if (existsSync(f)) return f;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (NEXT_STUBS[specifier]) return { url: 'nextstub:' + specifier, shortCircuit: true };
  let base = null;
  if (specifier.startsWith('@/')) base = path.join(ROOT, specifier.slice(2));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && context.parentURL.startsWith('file:')) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const found = tryFile(base);
    if (found) {
      if (STUBS.some((re) => re.test(found.replace(/\\/g, '/')))) return { url: 'stub:' + pathToFileURL(found).href, shortCircuit: true };
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }
  // A stub's own imports (react) have a non-file parent URL, which Node cannot resolve packages from.
  if (context.parentURL && !context.parentURL.startsWith('file:')) {
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(ROOT, 'package.json')).href });
  }
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    // the bundler lets `next/server` stand for `next/server.js`; plain Node does not
    if (/^next\/[\w/-]+$/.test(specifier)) return nextResolve(specifier + '.js', context);
    throw e;
  }
}

const transpile = (url) => ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: fileURLToPath(url),
}).outputText;

export async function load(url, context, nextLoad) {
  if (url.startsWith('nextstub:')) return { format: 'module', source: NEXT_STUBS[url.slice('nextstub:'.length)], shortCircuit: true };
  if (url.startsWith('stub:')) return { format: 'module', source: STUB_SOURCE, shortCircuit: true };
  if (/\.(jsx|tsx)$/.test(url)) return { format: 'module', source: transpile(url), shortCircuit: true };
  return nextLoad(url, context);
}

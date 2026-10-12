// scripts/extract-block.mjs
//
// One-shot refactoring helper (2026-10-12, perf/split-monolith): moves ONE large JSX block out of app/beautyos.jsx
// into its own file, loaded on demand, without changing behaviour.
//
//   node scripts/extract-block.mjs <line> <ComponentName> <file-slug>
//
// <line> is the line where a `{ cond && ( ... ) }` JSX expression container starts in app/beautyos.jsx.
// What it does:
//   1. finds that container, and every identifier the block uses that is NOT declared inside the block;
//   2. writes app/<file-slug>.jsx exporting <ComponentName>, which receives exactly those identifiers as props and
//      renders the very same JSX (imports are copied for the ones the block uses);
//   3. replaces the block in beautyos.jsx with `{cond && <ComponentName a={a} b={b} />}` and adds a next/dynamic import.
// It refuses (exit 1, file untouched) when the block assigns to a variable of the parent, uses `this`/`arguments`,
// or calls a hook directly, because those cannot be moved by passing props.

import fs from 'node:fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const [lineArg, compName, slug] = process.argv.slice(2);
const line = Number(lineArg);
if (!line || !compName || !slug) { console.error('usage: extract-block.mjs <line> <Component> <slug>'); process.exit(1); }

const FILE = 'app/beautyos.jsx';
let src = fs.readFileSync(FILE, 'utf8');
const crlf = src.includes('\r\n');
if (crlf) src = src.replace(/\r\n/g, '\n');

const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });

let target = null;
traverse(ast, {
  JSXExpressionContainer(path) {
    if (path.node.loc.start.line === line && !target) { target = path; path.stop(); }
  },
});
if (!target) { console.error(`no JSX expression container starts on line ${line}`); process.exit(1); }

const container = target.node;
const expr = container.expression;
if (expr.type !== 'LogicalExpression' || expr.operator !== '&&') { console.error('block is not `cond && (...)`'); process.exit(1); }
const condSrc = src.slice(expr.left.start, expr.left.end);
const bodyPath = target.get('expression.right');
const body = expr.right;

// ── free identifiers of the body ──────────────────────────────────────────────
const used = new Map(); // name -> { kind: 'import'|'module'|'local' }
const problems = [];
const HOOKS = /^use[A-Z]/;
const insideBody = (p) => p.findParent((q) => q.node === body) || p.node === body;

const KNOWN_GLOBALS = new Set('window document Math Date JSON Number String Array Object parseInt parseFloat isNaN isFinite navigator console setTimeout clearTimeout setInterval clearInterval encodeURIComponent decodeURIComponent encodeURI URL Intl Boolean Promise Set Map WeakMap fetch location localStorage sessionStorage FormData Blob File FileReader undefined NaN Infinity Error RegExp requestAnimationFrame cancelAnimationFrame alert confirm prompt process atob btoa URLSearchParams Event Image Audio AbortController history screen performance getComputedStyle matchMedia Symbol structuredClone queueMicrotask TextEncoder TextDecoder Notification Response Request Headers IntersectionObserver ResizeObserver MutationObserver CustomEvent KeyboardEvent MouseEvent Element HTMLElement Node crypto escape unescape open'.split(' '));
const unknownGlobals = new Set();
function noteRef(name, scope) {
  const binding = scope.getBinding(name);
  if (!binding) { if (!KNOWN_GLOBALS.has(name)) unknownGlobals.add(name); return; } // a global (window, Math, ...)
  // declared inside the body: not free
  const decl = binding.path;
  if (decl.node.start >= body.start && decl.node.end <= body.end) return;
  const kind = binding.kind === 'module' ? 'import' : binding.scope.path.isProgram() ? 'module' : 'local';
  used.set(name, { kind, binding });
}

bodyPath.traverse({
  Identifier(p) {
    if (!p.isReferencedIdentifier()) return;
    noteRef(p.node.name, p.scope);
  },
  JSXIdentifier(p) {
    // <Foo ...> and <Foo.Bar> refer to a binding; <div>, attribute names and member property names do not.
    const parent = p.parent;
    const isTag = (parent.type === 'JSXOpeningElement' || parent.type === 'JSXClosingElement') && parent.name === p.node;
    const isMemberObject = parent.type === 'JSXMemberExpression' && parent.object === p.node;
    if (!(isTag || isMemberObject)) return;
    if (/^[a-z]/.test(p.node.name)) return;
    noteRef(p.node.name, p.scope);
  },
  AssignmentExpression(p) {
    const l = p.node.left;
    if (l.type === 'Identifier') {
      const b = p.scope.getBinding(l.name);
      if (b && !(b.path.node.start >= body.start && b.path.node.end <= body.end)) problems.push(`assigns to outer variable ${l.name}`);
    }
  },
  UpdateExpression(p) {
    if (p.node.argument.type === 'Identifier') {
      const b = p.scope.getBinding(p.node.argument.name);
      if (b && !(b.path.node.start >= body.start && b.path.node.end <= body.end)) problems.push(`updates outer variable ${p.node.argument.name}`);
    }
  },
  ThisExpression() { problems.push('uses this'); },
  CallExpression(p) {
    const c = p.node.callee;
    if (c.type === 'Identifier' && HOOKS.test(c.name) && !p.scope.getBinding(c.name)?.path.isImportSpecifier?.()) {
      /* a hook defined in this file would be a module binding; flagged below with the generic list */
    }
    if (c.type === 'Identifier' && /^use(State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect)$/.test(c.name)) problems.push(`calls hook ${c.name}`);
  },
});
for (const g of unknownGlobals) problems.push(`unresolved identifier ${g}`);
if (problems.length) { console.error('REFUSED: ' + [...new Set(problems)].join('; ')); process.exit(1); }

// ── the new file ──────────────────────────────────────────────────────────────
const importDecls = ast.program.body.filter((n) => n.type === 'ImportDeclaration');
const importLines = [];
const importedNames = new Set();
for (const d of importDecls) {
  const keep = d.specifiers.filter((s) => used.has(s.local.name) && used.get(s.local.name).kind === 'import');
  if (!keep.length) continue;
  const def = keep.find((s) => s.type === 'ImportDefaultSpecifier');
  const ns = keep.find((s) => s.type === 'ImportNamespaceSpecifier');
  const named = keep.filter((s) => s.type === 'ImportSpecifier');
  const parts = [];
  if (def) parts.push(def.local.name);
  if (ns) parts.push(`* as ${ns.local.name}`);
  if (named.length) parts.push(`{ ${named.map((s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`)).join(', ')} }`);
  importLines.push(`import ${parts.join(', ')} from ${JSON.stringify(d.source.value)};`);
  keep.forEach((s) => importedNames.add(s.local.name));
}

const propNames = [...used.entries()].filter(([, v]) => v.kind !== 'import').map(([k]) => k).sort();
const bodySrc = src.slice(body.start, body.end);
const needsReact = /<>|<\//.test(bodySrc) || true;

const out = `"use client";
// app/${slug}.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
${needsReact ? 'import React from "react";\n' : ''}${importLines.join('\n')}

export default function ${compName}(props) {
  const {
${propNames.map((n) => `    ${n},`).join('\n')}
  } = props;
  return (
${bodySrc}
  );
}
`;
fs.writeFileSync(`app/${slug}.jsx`, out);

// ── the replacement in beautyos.jsx ───────────────────────────────────────────
const propsAttr = propNames.map((n) => `${n}={${n}}`).join(' ');
const replacement = `{${condSrc} && <${compName} ${propsAttr} />}`;
let next = src.slice(0, container.start) + replacement + src.slice(container.end);

// next/dynamic import next to the other lazy ones
const lazyLine = `const ${compName} = dynamic(() => import("./${slug}"), { ssr: false });\n`;
const anchor = next.search(/const \w+ = dynamic\(\(\) => import\(/);
if (anchor < 0) { console.error('no existing dynamic import to anchor next to'); process.exit(1); }
next = next.slice(0, anchor) + lazyLine + next.slice(anchor);

if (crlf) next = next.replace(/\n/g, '\r\n');
fs.writeFileSync(FILE, next);
console.log(`extracted ${compName}: ${bodySrc.split('\n').length} lines, ${propNames.length} props -> app/${slug}.jsx`);

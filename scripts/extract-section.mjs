// scripts/extract-section.mjs
//
// Moves a run of consecutive statements out of the BeautyOS component (app/beautyos.jsx) into a custom hook under
// app/sections/, mechanically. The sibling of scripts/extract-screen.mjs: that one moves what the app SHOWS (JSX blocks),
// this one moves what it DOES (state, effects, handlers).
//
//   node scripts/extract-section.mjs <firstLine> <lastLine> <Name>          -> app/sections/use<Name>Section.jsx
//   node scripts/extract-section.mjs <firstLine> <lastLine> <Name> --dry    -> the analysis only
//
// The lines are those of the first and last statement to move; every top-level statement of the component between them
// goes, whole. The statements are moved byte for byte, and the component gets in their place
//
//     const { ...what later code uses } = use<Name>Section({ ...what the statements read });
//
// at the same position, so every hook inside still runs in the same order on every render.
//
// ── What is computed, by scope analysis (Babel) ──────────────────────────────────────────────────────────────────────────
//   in      names the statements read that the component declares EARLIER (or module-level helpers of beautyos.jsx):
//           passed in ctx. Imports of beautyos.jsx are re-imported by the hook file instead.
//   out     names the statements declare that anything OUTSIDE them reads: returned, and destructured at the call site.
//   late    names the statements read that the component declares LATER. In the original this works because a handler only
//           runs after the whole component body has: `const a = () => b()` may sit above `const b = ...`. Passing `b` in
//           ctx would read it during render, before it exists (a "Cannot access 'b' before initialization" on every visit).
//           So a late name travels as a getter, `late: { get b() { return b; } }`, and the hook declares
//           `const b = (...args) => late.b(...args)`: read only when called, exactly as before.
//
// ── What is refused ──────────────────────────────────────────────────────────────────────────────────────────────────────
//   * a late name that is not a function, or that sits in a dependency array (a fresh wrapper every render would re-run
//     the effect every render);
//   * an assignment, inside the range, to a variable declared outside it, and the reverse: a copy would be assigned;
//   * a `let` that crosses the boundary and is ever reassigned;
//   * a top-level `return` in the range (an early return of the component cannot live in a hook);
//   * a function declaration in the range that earlier render-time code calls (it was hoisted; a hook's result is not).
//
// scripts/test-source-view.mjs puts each section's statements back in place when a test reads app/beautyos.jsx, and
// scripts/check-screens.mjs holds both sides of every section equal, name for name.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const SRC = 'app/beautyos.jsx';
const DIR = 'app/sections';
const OPEN = '/* @section-body */';
const CLOSE = '/* @section-end */';

const args = process.argv.slice(2).filter((a) => a !== '--dry');
const dry = process.argv.includes('--dry');
const first = Number(args[0]), last = Number(args[1]), base = args[2];
if (!first || !last || !/^[A-Z][A-Za-z]*$/.test(base || '')) { console.error('usage: node scripts/extract-section.mjs <firstLine> <lastLine> <Name> [--dry]'); process.exit(2); }
const hook = `use${base}Section`;
const out = `${DIR}/${hook}.jsx`;
if (fs.existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }
const die = (msg) => { console.error(`refusing ${hook} (${first}-${last}): ${msg}`); process.exit(1); };

const code = fs.readFileSync(SRC, 'utf8');
const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });

let comp = null, program = null;
traverse(ast, { Program(p) { program = p; }, ExportDefaultDeclaration(p) { comp = p.get('declaration'); p.skip(); } });
const stmts = comp.get('body.body');
const idxOfStmt = new Map(stmts.map((s, i) => [s.node, i]));
const inRange = stmts.filter((s) => s.node.loc.start.line >= first && s.node.loc.end.line <= last);
if (!inRange.length) die('no whole statement in those lines');
const i0 = idxOfStmt.get(inRange[0].node), i1 = idxOfStmt.get(inRange.at(-1).node);
if (inRange[0].node.loc.start.line !== first || inRange.at(-1).node.loc.end.line !== last) die(`the lines must be the first line of a statement and the last line of one (nearest: ${inRange[0].node.loc.start.line}-${inRange.at(-1).node.loc.end.line})`);
if (i1 - i0 + 1 !== inRange.length) die('the statements are not consecutive');

const compScope = comp.scope, progScope = program.scope;
/** Index of the component-level statement a path sits in; -1 for a parameter of the component. */
const topIndex = (p) => { let cur = p; while (cur && !idxOfStmt.has(cur.node)) cur = cur.parentPath; return cur ? idxOfStmt.get(cur.node) : -1; };
const inside = (p) => { const k = topIndex(p); return k >= i0 && k <= i1; };
const isFn = (b) => {
  if (b.kind === 'hoisted') return true;
  const init = b.path.node.init;
  if (!init) return false;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return true;
  return init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'useCallback' && b.path.node.id.type === 'Identifier';
};

const ins = new Set(), late = new Set(), imports = new Map(), problems = [];
const seen = new Set();
const note = (name, ref) => {
  const b = ref.scope.getBinding(name);
  if (!b) return;
  if (b.scope === progScope) {
    if (b.kind === 'module') { const d = b.path.parentPath.node; if (!imports.has(d)) imports.set(d, new Set()); imports.get(d).add(name); }
    else ins.add(name);
    if (b.kind !== 'module') for (const v of b.constantViolations) if (inside(v)) problems.push(`assigns to the module-level variable ${name}`);
    return;
  }
  if (b.scope !== compScope) return; // a local of some function inside the range
  const k = topIndex(b.path);
  if (k >= i0 && k <= i1) return; // declared by the range itself
  if (!seen.has(name)) { seen.add(name); for (const v of b.constantViolations) if (inside(v)) problems.push(`assigns to ${name}, which is declared outside the range`); }
  if (k > i1 && b.kind !== 'hoisted' && b.kind !== 'param') {
    late.add(name);
    if (!isFn(b)) problems.push(`reads ${name}, declared later (line ${b.path.node.loc.start.line}) and not a function`);
    // In a dependency array a per-render wrapper would defeat the array.
    const arr = ref.findParent((x) => x.isArrayExpression());
    if (arr && arr.parentPath.isCallExpression() && arr.parentPath.node.callee.type === 'Identifier' && /^use[A-Z]/.test(arr.parentPath.node.callee.name) && arr.key !== 0) problems.push(`${name} (declared later) sits in a dependency array`);
  } else ins.add(name);
};
for (const s of inRange) {
  s.traverse({
    Identifier(p) { if (p.isReferencedIdentifier()) note(p.node.name, p); },
    JSXIdentifier(p) { if (p.isReferencedIdentifier()) note(p.node.name, p); },
    AssignmentExpression(p) { if (p.node.left.type === 'Identifier') note(p.node.left.name, p); },
    UpdateExpression(p) { if (p.node.argument.type === 'Identifier') note(p.node.argument.name, p); },
    ReturnStatement(p) { if (p.getFunctionParent() === comp) problems.push(`a top-level return at line ${p.node.loc.start.line}`); },
    ThisExpression() { problems.push('uses `this`'); },
  });
  if (s.isReturnStatement()) problems.push('a top-level return');
}

// What the range declares at component level, and who else reads it.
const outs = [];
for (const [name, b] of Object.entries(compScope.bindings)) {
  const k = topIndex(b.path);
  if (k < i0 || k > i1) continue;
  const outsideRefs = b.referencePaths.filter((r) => !inside(r));
  const outsideWrites = b.constantViolations.filter((v) => !inside(v));
  if (outsideWrites.length) problems.push(`${name} is declared in the range and assigned outside it`);
  if (!outsideRefs.length) continue;
  outs.push(name);
  if ((b.kind === 'let' || b.kind === 'var') && b.constantViolations.length) problems.push(`${name} is a reassigned ${b.kind} that code outside the range reads`);
  if (b.kind === 'hoisted') for (const r of outsideRefs) { const fp = r.getFunctionParent(); if (topIndex(r) < i0 && fp === comp) problems.push(`the function ${name} is called by earlier render-time code (line ${r.node.loc.start.line})`); }
}
const used = new Set([...ins, ...late, ...outs]);
for (const reserved of ['ctx', 'late']) if (used.has(reserved)) problems.push(`the range uses the name ${reserved}`);
if (problems.length) die([...new Set(problems)].join('; '));

const sorted = (s) => [...s].sort((a, b) => a.localeCompare(b));
const inNames = sorted(ins), lateNames = sorted(late), outNames = outs.sort((a, b) => a.localeCompare(b));
const start = inRange[0].node.start, end = inRange.at(-1).node.end;
const body = code.slice(start, end);
const nLines = body.split('\n').length;

if (dry) {
  console.log(`${hook}: ${nLines} lines, ${inRange.length} statements | in ${inNames.length} | out ${outNames.length} | late ${lateNames.length}${lateNames.length ? ' (' + lateNames.join(', ') + ')' : ''}`);
  process.exit(0);
}

const rebase = (src) => (src.startsWith('.') ? path.posix.relative(DIR, path.posix.join('app', src)).replace(/^(?!\.)/, './') : src);
const importLines = [...imports.entries()].sort((a, b) => a[0].start - b[0].start).map(([decl, u]) => {
  const def = decl.specifiers.find((s) => s.type === 'ImportDefaultSpecifier' && u.has(s.local.name));
  const ns = decl.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier' && u.has(s.local.name));
  const named = decl.specifiers.filter((s) => s.type === 'ImportSpecifier' && u.has(s.local.name)).map((s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
  const parts = [];
  if (def) parts.push(def.local.name);
  if (ns) parts.push(`* as ${ns.local.name}`);
  if (named.length) parts.push(`{ ${named.join(', ')} }`);
  return `import ${parts.join(', ')} from ${JSON.stringify(rebase(decl.source.value))};`;
});
const wrap = (list, indent) => { const lines = []; let cur = ''; for (const n of list) { if ((cur + n).length > 108) { lines.push(cur.trimEnd()); cur = ''; } cur += n + ', '; } if (cur) lines.push(cur.trimEnd().replace(/,$/, '')); return lines.join('\n' + indent); };
const ctxNames = lateNames.length ? [...inNames, 'late'] : inNames;

const file = `"use client";
// ${out} — part of the owner's app: ${nLines} lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in \`ctx\`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
${lateNames.length ? `//
// \`late\`: ${lateNames.join(', ')} ${lateNames.length === 1 ? 'is' : 'are'} declared further down the component than this hook's call. A handler here may call
// ${lateNames.length === 1 ? 'it' : 'them'} (handlers run after the whole component body has), but reading ${lateNames.length === 1 ? 'it' : 'them'} while rendering would be an error. So ${lateNames.length === 1 ? 'it arrives as a getter and is' : 'they arrive as getters and are'}
// wrapped below: read only when called.
` : ''}${importLines.join('\n')}

export function ${hook}(ctx) {
  const {
    ${wrap(ctxNames, '    ')},
  } = ctx;
${lateNames.map((n) => `  const ${n} = (...args) => late.${n}(...args);\n`).join('')}  ${OPEN}${body}${CLOSE}
  return { ${wrap(outNames, '    ')} };
}
`;
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(out, file);

const lateArg = lateNames.length ? `${inNames.length ? ',' : ''}late:{${lateNames.map((n) => `get ${n}(){return ${n};}`).join(',')}}` : '';
const call = `${outNames.length ? `const {${outNames.join(',')}} = ` : ''}${hook}({${inNames.join(',')}${lateArg}});`;
let next = code.slice(0, start) + call + code.slice(end);
const lastImport = ast.program.body.filter((n) => n.type === 'ImportDeclaration').at(-1);
const at = next.indexOf('\n', lastImport.end) + 1;
next = next.slice(0, at) + `import { ${hook} } from "./sections/${hook}";\n` + next.slice(at);
fs.writeFileSync(SRC, next);
console.log(`${hook}: moved ${nLines} lines (${inRange.length} statements) | in ${inNames.length} | out ${outNames.length} | late ${lateNames.length}`);

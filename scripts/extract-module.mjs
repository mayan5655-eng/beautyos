// scripts/extract-module.mjs
//
// Moves a run of TOP-LEVEL statements of app/beautyos.jsx (constants, formatters, small components that sit above the
// BeautyOS component) into a module of their own under app/shared/, mechanically.
//
//   node scripts/extract-module.mjs <firstLine> <lastLine> <name> [--dry]
//   node scripts/extract-module.mjs 558 633 dates            -> app/shared/dates.jsx
//
// The third of the three tools (extract-screen.mjs moves JSX, extract-section.mjs moves the component's logic). Same rule:
// the text is moved byte for byte between two markers, and what crosses the boundary is computed by scope analysis, not read
// by eye.
//
//   a name the statements read that is an import of beautyos.jsx   -> the same import is written into the module
//   a name they read that an earlier app/shared module exports     -> imported from that module
//   a name they declare                                            -> exported, and imported back by beautyos.jsx
//
// It refuses what would not be the same program:
//   - a statement that reads a top-level name still declared in beautyos.jsx (the module would have to import the app)
//   - a relative import() or require() inside the range (its path is relative to app/, not to app/shared/)
//   - a declared name that is reassigned anywhere (an imported binding is read-only)
//   - a range that cuts a statement, or holds an import or the component itself
//
// Order: an ES module is evaluated before the module that imports it, and these statements only depend on imports and on
// each other, so running them earlier changes nothing they can observe.
//
// scripts/test-source-view.mjs puts each module's body back where its import line is when a test reads app/beautyos.jsx, and
// scripts/check-screens.mjs holds the import line, the export line and the declarations equal, name for name.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const SRC = 'app/beautyos.jsx';
export const SHARED_DIR = 'app/shared';
export const MOD_OPEN = '/* @module-body */';
export const MOD_CLOSE = '/* @module-end */';
export const MOD_TAG = '// @shared-module';

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry');
  const dry = process.argv.includes('--dry');
  const [first, last, name] = [Number(args[0]), Number(args[1]), args[2]];
  if (!(first > 0 && last >= first && /^[a-z][A-Za-z]*$/.test(name || ''))) {
    console.error('usage: node scripts/extract-module.mjs <firstLine> <lastLine> <name> [--dry]'); process.exit(2);
  }
  const out = `${SHARED_DIR}/${name}.jsx`;
  if (fs.existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }

  const code = fs.readFileSync(SRC, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const body = ast.program.body;
  const inRange = (n) => n.loc.start.line >= first && n.loc.end.line <= last;
  const moved = body.filter(inRange);
  const cut = body.filter((n) => !inRange(n) && n.loc.end.line >= first && n.loc.start.line <= last);
  if (!moved.length) { console.error('no whole statement in that range'); process.exit(1); }
  if (cut.length) { console.error(`the range cuts a statement that starts on line ${cut[0].loc.start.line}`); process.exit(1); }
  const bad = moved.find((n) => n.type !== 'VariableDeclaration' && n.type !== 'FunctionDeclaration');
  if (bad) { console.error(`line ${bad.loc.start.line}: only const/let/function statements can move (found ${bad.type})`); process.exit(1); }

  // The comment block directly above the first statement travels with it; so does everything up to the end of the last line.
  const lineStart = (pos) => code.lastIndexOf('\n', pos - 1) + 1;
  const lead = (moved[0].leadingComments || []).filter((c) => c.loc.start.line >= first);
  const from = lineStart(lead.length ? lead[0].start : moved[0].start);
  const nl = code.indexOf('\n', moved.at(-1).end);
  const to = nl === -1 ? code.length : nl;
  const text = code.slice(from, to);

  // What earlier shared modules export, so a later one can read it.
  const sharedExports = new Map(); // name -> module file (without extension)
  for (const imp of body) {
    if (imp.type !== 'ImportDeclaration' || !imp.source.value.startsWith('./shared/')) continue;
    for (const s of imp.specifiers) sharedExports.set(s.local.name, imp.source.value.replace('./shared/', './'));
  }

  const declared = new Set();
  const imports = new Map(); // import declaration node -> Set of local names
  const fromShared = new Map(); // './x' -> Set of names
  const problems = [];
  const movedSet = new Set(moved);
  const topOf = (p) => p.findParent((x) => x.parentPath && x.parentPath.isProgram()) || p;
  traverse(ast, {
    Program(prog) {
      for (const [n, b] of Object.entries(prog.scope.bindings)) {
        const top = topOf(b.path).node;
        if (!movedSet.has(top)) continue;
        declared.add(n);
        if (b.constantViolations.length) problems.push(`${n} is reassigned (line ${b.constantViolations[0].node.loc.start.line})`);
      }
    },
  });
  traverse(ast, {
    'Identifier|JSXIdentifier'(p) {
      if (!p.isReferencedIdentifier()) return;
      const top = topOf(p).node;
      if (!movedSet.has(top)) return;
      const n = p.node.name;
      const b = p.scope.getBinding(n);
      if (!b) return; // a global
      if (!b.scope.path.isProgram()) return; // local to something inside the range
      if (declared.has(n)) return;
      if (b.kind === 'module') {
        const decl = b.path.parentPath.node;
        if (decl.source.value.startsWith('./shared/')) { const m = sharedExports.get(n); if (!fromShared.has(m)) fromShared.set(m, new Set()); fromShared.get(m).add(n); return; }
        if (!imports.has(decl)) imports.set(decl, new Set());
        imports.get(decl).add(n);
        return;
      }
      problems.push(`line ${p.node.loc.start.line} reads ${n}, which is still declared in ${SRC} (line ${b.path.node.loc.start.line})`);
    },
    'ImportExpression|CallExpression'(p) {
      if (!movedSet.has(topOf(p).node)) return;
      const isImport = p.isImportExpression() || p.node.callee.type === 'Import' || (p.node.callee.type === 'Identifier' && p.node.callee.name === 'require');
      const arg = p.isImportExpression() ? p.node.source : p.node.arguments[0];
      if (isImport && arg && arg.type === 'StringLiteral' && arg.value.startsWith('.')) problems.push(`line ${p.node.loc.start.line}: a relative import("${arg.value}") cannot move as it is`);
    },
  });
  if (problems.length) { console.error('refusing:\n  ' + [...new Set(problems)].join('\n  ')); process.exit(1); }

  const names = [...declared].sort((a, b) => a.localeCompare(b));
  const rebase = (src) => (src.startsWith('.') ? path.posix.relative(SHARED_DIR, path.posix.join('app', src)).replace(/^(?!\.)/, './') : src);
  const importLines = [...imports.entries()].sort((a, b) => a[0].start - b[0].start).map(([decl, used]) => {
    const def = decl.specifiers.find((s) => s.type === 'ImportDefaultSpecifier' && used.has(s.local.name));
    const ns = decl.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier' && used.has(s.local.name));
    const named = decl.specifiers.filter((s) => s.type === 'ImportSpecifier' && used.has(s.local.name))
      .map((s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
    const parts = [];
    if (def) parts.push(def.local.name);
    if (ns) parts.push(`* as ${ns.local.name}`);
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    return `import ${parts.join(', ')} from ${JSON.stringify(rebase(decl.source.value))};`;
  });
  for (const [m, used] of [...fromShared.entries()].sort()) importLines.push(`import { ${[...used].sort().join(', ')} } from ${JSON.stringify(m)};`);

  if (dry) {
    console.log(`${name}: ${text.split('\n').length} lines, exports ${names.length}, ${importLines.length} import lines`);
    console.log('exports:', names.join(', '));
    return;
  }

  const wrap = (list, indent) => {
    const lines = []; let cur = '';
    for (const n of list) { if ((cur + n).length > 108) { lines.push(cur.trimEnd()); cur = ''; } cur += n + ', '; }
    if (cur) lines.push(cur.trimEnd().replace(/,$/, ''));
    return lines.join('\n' + indent);
  };
  const file = `"use client";
// ${out} — constants, formatters and small parts the owner's app shares between its screens and sections.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
${importLines.join('\n')}

${MOD_OPEN}
${text}
${MOD_CLOSE}
export {
  ${wrap(names, '  ')},
};
`;
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  fs.writeFileSync(out, file);
  const call = `import {${names.join(',')}} from "./shared/${name}"; ${MOD_TAG}`;
  fs.writeFileSync(SRC, code.slice(0, from) + call + code.slice(to));
  console.log(`${name}: moved ${text.split('\n').length} lines, ${names.length} names exported, ${importLines.length} import lines`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

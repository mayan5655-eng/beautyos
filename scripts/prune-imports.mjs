// scripts/prune-imports.mjs
//
// Removes from app/beautyos.jsx the imports it no longer uses.
//
//   node scripts/prune-imports.mjs          -> rewrites the file, prints what went
//   node scripts/prune-imports.mjs --dry    -> prints only
//   node scripts/prune-imports.mjs --check  -> exit 1 if anything is unused (part of `npm test` through check-screens)
//
// ── Why ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The three extract tools move code out of app/beautyos.jsx and write, into the new file, the imports that code needs.
// They do not take those imports out of beautyos.jsx: at the time of a move the tool cannot know that no later line still
// needs them, and a missing import is a crash where an extra one is only weight. After the moves were done, 332 names were
// imported here and read nowhere here. That weight is real: a module imported by the app's entry file is in the app's first
// download whether or not anything on the first screen uses it, so a screen cannot be loaded on demand while the entry file
// still imports what only that screen needs.
//
// What it does, by scope analysis (Babel), never by text search:
//   - an imported name with no reference in this file is removed from its import statement;
//   - an import statement left with no names is removed, with the comment lines directly above it (they described it);
//   - a `const X = dynamic(() => import(...))` that nothing reads is removed the same way;
//   - an import with no names at all (`import "./x.css"`) is a side effect and stays;
//   - the tagged `// @shared-module` lines stay whole: scripts/check-screens.mjs holds each equal to the module's exports.
//
// Every name removed here is imported by the file that actually uses it (the extract tools wrote that import), so the module
// stays in the program; ESLint's no-undef over the app's files is the net under this.
import fs from 'node:fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const SRC = 'app/beautyos.jsx';
const dry = process.argv.includes('--dry');
const check = process.argv.includes('--check');

export function unusedImports(code) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = []; // { start, end, text, names }
  traverse(ast, {
    Program(p) {
      const unused = (name) => { const b = p.scope.getBinding(name); return !!b && b.referencePaths.length === 0 && b.constantViolations.length === 0; };
      const lineStart = (pos) => code.lastIndexOf('\n', pos - 1) + 1;
      const lineEnd = (pos) => { const i = code.indexOf('\n', pos); return i === -1 ? code.length : i + 1; };
      // The comment lines directly above a statement (no blank line between), which go with it when it goes.
      const withLead = (node, prevEnd) => {
        let start = lineStart(node.start);
        const lead = (node.leadingComments || []).filter((c) => c.start >= prevEnd);
        for (let i = lead.length - 1; i >= 0; i--) {
          const c = lead[i];
          if (code.slice(c.end, start).trim() !== '' || /\n\s*\n/.test(code.slice(c.end, start))) break;
          if (code.slice(lineStart(c.start), c.start).trim() !== '') break; // a trailing comment of the line above
          start = lineStart(c.start);
        }
        return start;
      };
      let prevEnd = 0;
      for (const node of p.node.body) {
        const from = prevEnd; prevEnd = node.end;
        if (node.type === 'ImportDeclaration') {
          if (node.specifiers.length === 0) continue; // a side-effect import
          const rest = code.slice(node.end, lineEnd(node.end));
          if (rest.includes('@shared-module')) continue;
          const gone = node.specifiers.filter((s) => unused(s.local.name));
          if (!gone.length) continue;
          const keep = node.specifiers.filter((s) => !gone.includes(s));
          const names = gone.map((s) => s.local.name);
          if (!keep.length) { edits.push({ start: withLead(node, from), end: lineEnd(node.end), text: '', names, source: node.source.value }); continue; }
          const def = keep.find((s) => s.type === 'ImportDefaultSpecifier');
          const ns = keep.find((s) => s.type === 'ImportNamespaceSpecifier');
          const named = keep.filter((s) => s.type === 'ImportSpecifier').map((s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
          const parts = [];
          if (def) parts.push(def.local.name);
          if (ns) parts.push(`* as ${ns.local.name}`);
          if (named.length) parts.push(`{ ${named.join(', ')} }`);
          edits.push({ start: node.start, end: node.end, text: `import ${parts.join(', ')} from ${code.slice(node.source.start, node.source.end)};`, names, source: node.source.value });
        } else if (node.type === 'VariableDeclaration' && node.declarations.length === 1) {
          const d = node.declarations[0];
          const isDynamic = d.init && d.init.type === 'CallExpression' && d.init.callee.type === 'Identifier' && d.init.callee.name === 'dynamic';
          if (isDynamic && d.id.type === 'Identifier' && unused(d.id.name)) edits.push({ start: withLead(node, from), end: lineEnd(node.end), text: '', names: [d.id.name], source: 'dynamic()' });
        }
      }
    },
  });
  return edits;
}

function main() {
  let code = fs.readFileSync(SRC, 'utf8');
  let total = 0; const log = [];
  // Removing one import can leave another unused (a `dynamic` const gone leaves `dynamic` itself): repeat until stable.
  for (let round = 0; round < 6; round++) {
    const edits = unusedImports(code);
    if (!edits.length) break;
    for (const e of edits) { total += e.names.length; log.push(`${e.source}: ${e.names.join(', ')}`); }
    if (check || dry) break;
    for (const e of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  }
  if (check) {
    if (total) { console.error(`prune-imports: ${SRC} imports ${total} name(s) it does not use (node scripts/prune-imports.mjs):\n  ` + log.join('\n  ')); process.exit(1); }
    console.log(`prune-imports: every import of ${SRC} is used`);
    return;
  }
  if (!dry && total) fs.writeFileSync(SRC, code);
  console.log(`${dry ? 'would remove' : 'removed'} ${total} unused name(s) from ${SRC}${total ? ':\n  ' + log.join('\n  ') : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

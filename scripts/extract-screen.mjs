// scripts/extract-screen.mjs
//
// Moves one tab of app/beautyos.jsx into its own file under app/screens/, mechanically.
//
//   node scripts/extract-screen.mjs packages                         -> app/screens/PackagesScreen.jsx (the "packages" tab)
//   node scripts/extract-screen.mjs --cond 'showCashier' CashierModal   -> any `{<cond> && (...)}` block, by its condition
//   node scripts/extract-screen.mjs --at 3827 AppHeaderPart             -> the JSX element that starts on that line
//   ... --dry                                                        -> prints what it would pass, changes nothing
//
// A name ends in Screen (a tab or a whole view), Modal (something that opens over the app) or Part (a piece of the app's
// frame: its header, its menus, its stylesheet).
//
// ── Why a tool and not a hand edit ───────────────────────────────────────────────────────────────────────────────────────
// app/beautyos.jsx is one component of some 13,800 lines. Every tab's JSX reads dozens of that component's variables. Moving
// a tab by hand means finding every one of them by eye, and the one that is missed is `undefined` at runtime on a screen
// nobody opened before the deploy. So the list is computed, not read:
//
//   1. Parse the file (Babel) and find `activeTab==="<tab>" && <expr>`.
//   2. Every identifier <expr> references is resolved by scope analysis:
//        bound inside <expr> itself           -> stays as it is
//        an import of beautyos.jsx            -> the same import is written into the screen file (path adjusted)
//        any other binding of beautyos.jsx    -> passed to the screen in one `ctx` object (state, handlers, helpers)
//        no binding at all                    -> a global (window, Math, JSON...): nothing to do
//   3. Refuse if <expr> ASSIGNS to an outer variable: a copy in the screen would be assigned instead, silently.
//   4. The JSX is moved byte for byte, between two markers, and replaced in beautyos.jsx by <XScreen ctx={{...}}/>.
//
// The byte-for-byte move is what keeps the test suite honest: scripts/test-source-view.mjs puts each screen's body back in
// place when a test reads app/beautyos.jsx, so the hundred-odd tests that protect the words on these screens read exactly
// the text they read before. scripts/check-screens.mjs (part of `npm test`) then holds the two sides together: what a
// screen takes from ctx is what beautyos.jsx passes, name for name.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const SRC = 'app/beautyos.jsx';
export const SCREENS_DIR = 'app/screens';
export const BODY_OPEN = '/* @screen-body */';
export const BODY_CLOSE = '/* @screen-end */';
export const screenNameOf = (tab) => tab.replace(/(^|[-_])([a-z])/g, (m, a, c) => c.toUpperCase()) + 'Screen';
export const NAME_RE = /^[A-Z][A-Za-z]*(?:Screen|Modal|Part)$/;
const squash = (s) => s.replace(/\s+/g, '');

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry');
  const dry = process.argv.includes('--dry');
  const byCond = args[0] === '--cond';
  const byLine = args[0] === '--at';
  const tab = byCond || byLine ? null : args[0];
  const cond = byCond ? args[1] : null;
  const atLine = byLine ? Number(args[1]) : null;
  const name = byCond || byLine ? args[2] : tab && screenNameOf(tab);
  if (byLine ? !(atLine > 0 && NAME_RE.test(name || '')) : byCond ? !(cond && NAME_RE.test(name || '')) : !(tab && /^[a-z_]+$/.test(tab))) {
    console.error("usage: node scripts/extract-screen.mjs <tab> [--dry]\n       node scripts/extract-screen.mjs --cond '<condition>' <NameScreen|NameModal> [--dry]\n       node scripts/extract-screen.mjs --at <line> <NamePart> [--dry]"); process.exit(2);
  }
  const what = byLine ? `the <${name.replace(/Part$/, '')}> piece of the frame` : byCond ? `{${cond} && ...}` : `the "${tab}" tab`;
  const out = `${SCREENS_DIR}/${name}.jsx`;
  if (fs.existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }

  const code = fs.readFileSync(SRC, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });

  // 1. The block: the right-hand side of the `&&` whose chain tests activeTab === "<tab>".
  let block = null;
  traverse(ast, {
    // By line: the outermost JSX element that starts on that line, and only where an element can be swapped for another
    // (a child of JSX, not an attribute value or an argument).
    JSXElement(p) {
      if (!byLine || block || p.node.loc.start.line !== atLine) return;
      if (!p.parentPath.isJSXElement() && !p.parentPath.isJSXFragment()) { console.error(`the element on line ${atLine} is not a child of JSX`); process.exit(1); }
      block = p;
    },
    JSXExpressionContainer(p) {
      if (byLine) return;
      const e = p.node.expression;
      if (e.type !== 'LogicalExpression' || e.operator !== '&&') return;
      if (byCond) {
        // By condition: the whole left-hand side, compared without whitespace. Small blocks with the same condition
        // (a one-line badge) are not what is being moved.
        if (squash(code.slice(e.left.start, e.left.end)) !== squash(cond)) return;
        if (e.right.loc.end.line - e.right.loc.start.line < 30) return;
        if (block) { console.error(`more than one large block with the condition ${cond}`); process.exit(1); }
        block = p.get('expression.right');
        return;
      }
      const tests = [];
      let cur = e.left;
      while (cur.type === 'LogicalExpression' && cur.operator === '&&') { tests.push(cur.right); cur = cur.left; }
      tests.push(cur);
      const hit = tests.some((t) => t.type === 'BinaryExpression' && t.operator === '===' && t.left.type === 'Identifier' && t.left.name === 'activeTab'
        && t.right.type === 'StringLiteral' && t.right.value === tab);
      if (!hit) return;
      if (block) { console.error(`more than one block for tab "${tab}"`); process.exit(1); }
      block = p.get('expression.right');
    },
  });
  if (!block) { console.error(`no block found for ${what}`); process.exit(1); }

  // 2. Resolve what the block references from outside itself.
  const inside = (p) => p.node === block.node || !!p.findParent((x) => x.node === block.node);
  const fromCtx = new Set();
  const imports = new Map(); // import declaration node -> Set of local names used
  const assigned = new Set();
  const note = (name, refPath) => {
    const b = refPath.scope.getBinding(name);
    if (!b) return; // a global
    if (inside(b.path)) return; // declared inside the block
    if (b.kind === 'module') {
      const decl = b.path.parentPath.node;
      if (!imports.has(decl)) imports.set(decl, new Set());
      imports.get(decl).add(name);
      return;
    }
    fromCtx.add(name);
    for (const v of b.constantViolations) if (inside(v)) assigned.add(name);
  };
  block.traverse({
    Identifier(p) { if (p.isReferencedIdentifier()) note(p.node.name, p); },
    JSXIdentifier(p) { if (p.isReferencedIdentifier()) note(p.node.name, p); },
    AssignmentExpression(p) { const l = p.node.left; if (l.type === 'Identifier') note(l.name, p); },
    UpdateExpression(p) { const a = p.node.argument; if (a.type === 'Identifier') note(a.name, p); },
    ThisExpression() { console.error('the block uses `this`'); process.exit(1); },
    AwaitExpression(p) { if (!p.getFunctionParent() || !inside(p.getFunctionParent())) { console.error('the block awaits outside a function of its own'); process.exit(1); } },
  });
  // The block itself may be a bare identifier reference.
  if (block.isIdentifier()) note(block.node.name, block);

  // 3. Refuse outer assignments.
  if (assigned.size) { console.error(`refusing: the block assigns to outer variable(s): ${[...assigned].join(', ')}`); process.exit(1); }
  // A hook called in the block would change hook order once it lives in another component.
  let hook = null;
  block.traverse({ CallExpression(p) { const c = p.node.callee; if (c.type === 'Identifier' && /^use[A-Z]/.test(c.name)) hook = c.name; } });
  if (hook) { console.error(`refusing: the block calls a hook (${hook})`); process.exit(1); }

  const names = [...fromCtx].sort((a, b) => a.localeCompare(b));
  const body = code.slice(block.node.start, block.node.end);

  // Imports, with relative paths re-based from app/ to app/screens/.
  const rebase = (src) => (src.startsWith('.') ? path.posix.relative(SCREENS_DIR, path.posix.join('app', src)).replace(/^(?!\.)/, './') : src);
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

  if (dry) {
    console.log(`${name}: ${body.split('\n').length} lines, ${names.length} from ctx, ${importLines.length} import lines`);
    console.log('ctx:', names.join(', '));
    return;
  }

  const wrap = (list, indent) => {
    const lines = []; let cur = '';
    for (const n of list) { if ((cur + n).length > 108) { lines.push(cur.trimEnd()); cur = ''; } cur += n + ', '; }
    if (cur) lines.push(cur.trimEnd().replace(/,$/, ''));
    return lines.join('\n' + indent);
  };

  const screen = `"use client";
// ${out} — ${what} of the owner's app.
//
// Moved out of app/beautyos.jsx by scripts/extract-screen.mjs, byte for byte: nothing between the two markers below was
// rewritten. Everything it reads from the app arrives in one \`ctx\` object, whose names scripts/check-screens.mjs holds
// equal to what beautyos.jsx passes. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back
// in its place, so the tests that protect these words still read them where they always were.
//
// To change this screen: edit it here. To give it something new from the app: add the name to the destructuring below
// AND to the ctx={{...}} of <${name}> in app/beautyos.jsx (the check fails until both sides agree).
${importLines.join('\n')}

export default function ${name}({ ctx }) {
  const {
    ${wrap(names, '    ')},
  } = ctx;
  return (
    ${BODY_OPEN}${body}${BODY_CLOSE}
  );
}
`;
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  fs.writeFileSync(out, screen);

  // 4. Replace the block in beautyos.jsx and add the import after the last import line.
  const call = `<${name} ctx={{${names.join(',')}}}/>`;
  let next = code.slice(0, block.node.start) + call + code.slice(block.node.end);
  const lastImport = ast.program.body.filter((n) => n.type === 'ImportDeclaration' && !n.source.value.startsWith('./shared/')).at(-1);
  const at = next.indexOf('\n', lastImport.end) + 1;
  next = next.slice(0, at) + `import ${name} from "./screens/${name}";\n` + next.slice(at);
  fs.writeFileSync(SRC, next);
  console.log(`${name}: moved ${body.split('\n').length} lines, ${names.length} names through ctx, ${importLines.length} import lines`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

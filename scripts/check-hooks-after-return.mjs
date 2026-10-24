// Fails when a React component calls a hook after one of its early returns.
//
// "Rendered more hooks than during the previous render" (React error #310): the render that takes the early
// return calls fewer hooks than the one that does not, and React throws. It is invisible to tsc, to the unit
// tests and to `next build`; it throws only in the browser, and it took the public booking page down on a
// branch preview on 2026-10-24 (a useEffect placed below BookingPage's `if (loading) return`). The render-order
// check reads declarations, not hooks, so it did not see it.
//
// What counts: the top-level statements of every component (a function whose name starts with a capital
// letter, declared or assigned). Once a statement returns - a `return`, or an `if` whose branch returns, not
// counting returns inside nested functions - any later top-level statement that calls use*() outside a nested
// function is reported.
//   node scripts/check-hooks-after-return.mjs [file ...]   (default: every .jsx/.tsx under app/)

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2).length ? process.argv.slice(2) : (function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(jsx|tsx)$/.test(e.name) ? [p] : [];
  });
})('app');

// true when `node` contains a return statement that belongs to the same function (not a nested one)
const returnsHere = (node) => {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (ts.isReturnStatement(n)) { found = true; return; }
    if (ts.isFunctionLike(n)) return;
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
};
// the first hook call in `node` that is not inside a nested function
const hookCall = (node) => {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isFunctionLike(n)) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use[A-Z]/.test(n.expression.text)) { hit = n; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
};

let bad = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  const comps = [];
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) comps.push([n.name.text, n.body]);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && n.initializer.body && ts.isBlock(n.initializer.body)) comps.push([n.name.text, n.initializer.body]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const [name, body] of comps) {
    let returnedAt = null;
    for (const st of body.statements) {
      if (returnedAt !== null) {
        const h = hookCall(st);
        if (h) {
          const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          console.error(`${file}:${at(h)}: ${name} calls ${h.expression.text}() after an early return (line ${returnedAt}); move it above`);
          bad++;
        }
      } else if (ts.isReturnStatement(st) || (ts.isIfStatement(st) && returnsHere(st))) {
        returnedAt = sf.getLineAndCharacterOfPosition(st.getStart()).line + 1;
      }
    }
  }
}
if (bad) { console.error(`hooks after return: ${bad} hook call(s) after an early return`); process.exit(1); }
console.log(`hooks after return: ok (${files.length} files)`);

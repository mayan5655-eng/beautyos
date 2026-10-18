// Fails when the dashboard component reads a const/let while it RENDERS before the line that declares it.
//
// That is a temporal dead zone error ("Cannot access 'x' before initialization"). It is invisible to tsc, to the unit tests and to `next
// build` (the code is syntactically fine); it only throws when the component actually runs, i.e. on every logged-in visit. Error DA1A34
// (2026-10-18) was exactly this: a const placed 15 lines above the `const [settings, ...]` it read.
//
// What counts as "while it renders": every statement of the component body is walked in order. Function bodies are skipped (they run
// later, when called) EXCEPT the callbacks React runs during render itself: the first argument of useMemo and useState/useReducer's lazy
// initialiser, plus every dependency array. Identifiers declared with function declarations are hoisted and never flagged.
import ts from 'typescript';
import fs from 'node:fs';

const FILES = ['app/beautyos.jsx', 'app/onboarding/page.tsx', 'app/signup/page.tsx', 'app/login/page.tsx', 'app/design/DesignStudio.jsx', 'app/BookingPage.jsx'];
const RUNS_DURING_RENDER = new Set(['useMemo', 'useState', 'useReducer', 'useRef']);

let bad = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  // the component bodies: every function whose block has many statements and returns JSX
  const comps = [];
  const visit = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.body && ts.isBlock(n.body) && n.body.statements.length > 25) comps.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);

  for (const comp of comps) {
    const stmts = comp.body.statements;
    // name -> index of the statement that declares it (const/let/var only; function declarations are hoisted)
    const declaredAt = new Map();
    const bindingNames = (b, out) => {
      if (ts.isIdentifier(b)) out.push(b.text);
      else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) for (const e of b.elements) if (!ts.isOmittedExpression(e)) bindingNames(e.name, out);
    };
    stmts.forEach((st, i) => {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { const names = []; bindingNames(d.name, names); for (const n of names) if (!declaredAt.has(n)) declaredAt.set(n, i); }
    });

    const renderRefs = (node, out) => {
      const walk = (n, ctx) => {
        if (ts.isIdentifier(n)) {
          const p = n.parent;
          const isDecl = (ts.isVariableDeclaration(p) && p.name === n) || (ts.isBindingElement(p) && p.name === n) || (ts.isParameter(p) && p.name === n);
          const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isJsxAttribute(p) && p.name === n);
          if (!isDecl && !isProp) out.push(n);
          return;
        }
        if (ts.isFunctionLike(n) && n !== node) {
          // a callback: skipped, unless it is run by React during render
          const call = n.parent;
          const runsNow = call && ts.isCallExpression(call) && call.arguments[0] === n && ts.isIdentifier(call.expression) && RUNS_DURING_RENDER.has(call.expression.text);
          if (!runsNow) return;
        }
        ts.forEachChild(n, (c) => walk(c, ctx));
      };
      walk(node, null);
    };

    stmts.forEach((st, i) => {
      if (!ts.isVariableStatement(st) && !ts.isExpressionStatement(st) && !ts.isReturnStatement(st)) return;
      const refs = [];
      renderRefs(st, refs);
      for (const id of refs) {
        const j = declaredAt.get(id.text);
        if (j !== undefined && j > i) {
          // an inner declaration of the same name (a callback parameter or a local const) shadows it: look for one on the way up
          let shadowed = false;
          for (let a = id.parent; a && a !== st; a = a.parent) {
            if (ts.isFunctionLike(a) && a.parameters.some((pm) => { const ns = []; bindingNames(pm.name, ns); return ns.includes(id.text); })) { shadowed = true; break; }
            if ((ts.isBlock(a) || ts.isSourceFile(a)) && a.statements.some((s2) => ts.isVariableStatement(s2) && s2.declarationList.declarations.some((d) => { const ns = []; bindingNames(d.name, ns); return ns.includes(id.text); }))) { shadowed = true; break; }
          }
          if (shadowed) continue;
          const { line } = sf.getLineAndCharacterOfPosition(id.getStart());
          const declLine = sf.getLineAndCharacterOfPosition(stmts[j].getStart()).line;
          console.error(`${file}:${line + 1}: '${id.text}' is read while rendering, but declared later (line ${declLine + 1})`);
          bad++;
        }
      }
    });
  }
}
if (bad) { console.error(`render order: ${bad} read(s) before declaration`); process.exit(1); }
console.log('render order: ok');

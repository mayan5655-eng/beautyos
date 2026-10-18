// Fails when a .jsx/.tsx file has a syntax error. `tsc --noEmit` does not read the .jsx files (allowJs is off for them), so a broken
// bracket in app/beautyos.jsx would only show up at `next build`. This is the fast check that runs with the tests.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.next', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx|tsx)$/.test(e.name)) files.push(p); } };
walk('app');
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const out = ts.transpileModule(src, { fileName: f, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 } });
  const errs = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  for (const d of errs) { bad++; const { line } = d.file ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0 }; console.error(`${f}:${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`); }
}
if (bad) { console.error(`jsx parse: ${bad} syntax error(s)`); process.exit(1); }
console.log(`jsx parse: ok (${files.length} files)`);

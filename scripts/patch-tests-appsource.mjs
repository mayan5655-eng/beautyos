// one-shot (perf/split-monolith): point source-level tests at readAppSource() instead of beautyos.jsx alone
import fs from 'node:fs';
const files = fs.readdirSync('.').filter((f) => /^test-.*\.(ts|js)$/.test(f));
const INLINE = `const readAppSource = () => { const n = (s) => s.split('\\r\\n').join('\\n'); return [n(fs.readFileSync('app/beautyos.jsx', 'utf8')), ...fs.readdirSync('app').filter((f) => /^tab-.*\\.jsx$/.test(f)).sort().map((f) => n(fs.readFileSync('app/' + f, 'utf8')))].join('\\n'); };\n`;
let touched = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (!s.includes('app/beautyos.jsx')) continue;
  const o = s;
  // direct reads
  s = s.replace(/(?:fs\.)?readFileSync\('app\/beautyos\.jsx', 'utf8'\)/g, 'readAppSource()');
  s = s.replace(/(?:fs\.)?readFileSync\(new URL\('\.\/app\/beautyos\.jsx', import\.meta\.url\), 'utf8'\)/g, 'readAppSource()');
  // helper readers that take a path
  s = s.replace(/const code = \(f: string\) => fs\.readFileSync\(f, 'utf8'\)/g, "const code = (f: string) => (f === 'app/beautyos.jsx' ? readAppSource() : fs.readFileSync(f, 'utf8'))");
  s = s.replace(/const src = \(f: string\) => fs\.readFileSync\(f, 'utf8'\);/g, "const src = (f: string) => (f === 'app/beautyos.jsx' ? readAppSource() : fs.readFileSync(f, 'utf8'));");
  s = s.replace(/const rd = \(p: string\) => readFileSync\(p, 'utf8'\)/g, "const rd = (p: string) => (p === 'app/beautyos.jsx' ? readAppSource() : readFileSync(p, 'utf8'))");
  // the line-local `code(...)` helper in test-ai-stream sits inside a block
  s = s.replace(/const code = \(f: string\) => fs\.readFileSync\(f, 'utf8'\)/g, "const code = (f: string) => (f === 'app/beautyos.jsx' ? readAppSource() : fs.readFileSync(f, 'utf8'))");
  if (s === o) { console.log('NOCHANGE', f); continue; }
  // import
  if (f.endsWith('.ts')) {
    const m = s.match(/^import [^\n]*\n/m);
    s = s.replace(m[0], m[0] + "import { readAppSource } from './lib/appSource.ts';\n");
  } else {
    // plain JS tests: define it locally after the first import/require of fs
    const m = s.match(/^(?:import fs from [^\n]*|const fs = require\([^\n]*)\n/m);
    if (!m) { console.log('NO-FS-IMPORT', f); continue; }
    s = s.replace(m[0], m[0] + INLINE);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s);
  touched++;
}
console.log('patched', touched);

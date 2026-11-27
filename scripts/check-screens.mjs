// scripts/check-screens.mjs — part of `npm test`.
//
// The tabs of app/beautyos.jsx live in app/screens/ (scripts/extract-screen.mjs). Each screen takes what it needs from the
// app in one `ctx` object. A name the screen destructures but beautyos.jsx does not pass is `undefined` at runtime, on that
// screen only, and nothing else would notice: JavaScript does not, the build does not, and the tests read text, not values.
// So this holds the two sides together, name for name, and checks the markers the test source view depends on.
import fs from 'node:fs';

const DIR = 'app/screens';
const main = fs.readFileSync('app/beautyos.jsx', 'utf8');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /(?:Screen|Modal|Part)\.jsx$/.test(f)).sort() : [];
const fail = [];
const names = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

for (const f of files) {
  const name = f.replace(/\.jsx$/, '');
  const src = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  const taken = src.match(/const \{([\s\S]*?)\} = ctx;/);
  const calls = [...main.matchAll(new RegExp(`<${name} ctx=\\{\\{([^{}]*)\\}\\}\\/>`, 'g'))];
  if (!taken) { fail.push(`${f}: no \`const { ... } = ctx;\``); continue; }
  if (calls.length !== 1) { fail.push(`${f}: beautyos.jsx renders <${name} ctx={{...}}/> ${calls.length} times, expected once`); continue; }
  if (!new RegExp(`^import ${name} from "\\./screens/${name}";$`, 'm').test(main)) fail.push(`${f}: beautyos.jsx does not import it`);
  const want = new Set(names(taken[1])), given = new Set(names(calls[0][1]));
  const missing = [...want].filter((n) => !given.has(n)), extra = [...given].filter((n) => !want.has(n));
  if (missing.length) fail.push(`${f}: takes from ctx what beautyos.jsx does not pass: ${missing.join(', ')}`);
  if (extra.length) fail.push(`${f}: beautyos.jsx passes what the screen never takes: ${extra.join(', ')}`);
  for (const m of ['/* @screen-body */', '/* @screen-end */']) {
    if (src.split(m).length !== 2) fail.push(`${f}: the marker ${m} must appear exactly once`);
  }
}

// ── The logic sections (app/sections/, scripts/extract-section.mjs) ─────────────────────────────────────────────────────
// Three lists per section must agree with the call in beautyos.jsx: what it takes from ctx, the late names it wraps, and
// what it returns.
const SDIR = 'app/sections';
const sections = fs.existsSync(SDIR) ? fs.readdirSync(SDIR).filter((f) => /^use[A-Z][A-Za-z]*Section\.jsx$/.test(f)).sort() : [];
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
for (const f of sections) {
  const name = f.replace(/\.jsx$/, '');
  const src = fs.readFileSync(`${SDIR}/${f}`, 'utf8');
  const call = main.match(new RegExp(`^[ \\t]*(?:const \\{([^{}\\n]*)\\} = )?${name}\\(\\{(.*)\\}\\);$`, 'm'));
  if (!call) { fail.push(`${f}: beautyos.jsx does not call ${name}({...}) on one line`); continue; }
  if ((main.match(new RegExp(`\\b${name}\\(`, 'g')) || []).length !== 1) fail.push(`${f}: called more than once`);
  if (!new RegExp(`^import \\{ ${name} \\} from "\\./sections/${name}";$`, 'm').test(main)) fail.push(`${f}: beautyos.jsx does not import it`);
  const taken = src.match(/const \{([\s\S]*?)\} = ctx;/);
  if (!taken) { fail.push(`${f}: no \`const { ... } = ctx;\``); continue; }
  const lateArg = call[2].match(/late:\{(.*)\}$/);
  const passedIn = new Set(names(call[2].replace(/,?late:\{.*\}$/, '')));
  const lateGiven = new Set(lateArg ? [...lateArg[1].matchAll(/get ([A-Za-z_$][\w$]*)\(\)\{return \1;\}/g)].map((m) => m[1]) : []);
  const want = new Set(names(taken[1]).filter((n) => n !== 'late'));
  const lateWrapped = new Set([...src.matchAll(/^  const ([A-Za-z_$][\w$]*) = \(\.\.\.args\) => late\.\1\(\.\.\.args\);$/gm)].map((m) => m[1]));
  const ret = src.match(/\/\* @section-end \*\/\n  return \{([\s\S]*?)\};\n\}\n$/);
  const returned = new Set(ret ? names(ret[1]) : []), received = new Set(call[1] ? names(call[1]) : []);
  if (!same(want, passedIn)) fail.push(`${f}: ctx names differ from the call (takes ${[...want].filter((n) => !passedIn.has(n)).join(', ') || '-'} not passed; passed ${[...passedIn].filter((n) => !want.has(n)).join(', ') || '-'} not taken)`);
  if (!same(lateWrapped, lateGiven)) fail.push(`${f}: late names differ from the call`);
  if (names(taken[1]).includes('late') !== lateGiven.size > 0) fail.push(`${f}: \`late\` is taken on one side only`);
  if (!ret) fail.push(`${f}: no return after the end marker`);
  else if (!same(returned, received)) fail.push(`${f}: returns differ from what beautyos.jsx destructures`);
  for (const m of ['/* @section-body */', '/* @section-end */']) if (src.split(m).length !== 2) fail.push(`${f}: the marker ${m} must appear exactly once`);
}

// ── The shared modules (app/shared/, scripts/extract-module.mjs) ────────────────────────────────────────────────────────
// What a module exports is what beautyos.jsx imports from it, on the one tagged line the test source view looks for.
const MDIR = 'app/shared';
const shared = fs.existsSync(MDIR) ? fs.readdirSync(MDIR).filter((f) => /^[a-z][A-Za-z]*\.jsx$/.test(f)).sort() : [];
for (const f of shared) {
  const name = f.replace(/\.jsx$/, '');
  const src = fs.readFileSync(`${MDIR}/${f}`, 'utf8');
  const imp = [...main.matchAll(new RegExp(`^import \\{([^{}\\n]*)\\} from "\\./shared/${name}"; // @shared-module$`, 'gm'))];
  if (imp.length !== 1) { fail.push(`${f}: beautyos.jsx has ${imp.length} tagged import lines for it, expected one`); continue; }
  const exp = src.match(/\/\* @module-end \*\/\nexport \{([\s\S]*?)\};\n$/);
  if (!exp) { fail.push(`${f}: no export list after the end marker`); continue; }
  if (!same(new Set(names(exp[1])), new Set(names(imp[0][1])))) fail.push(`${f}: its export list differs from what beautyos.jsx imports`);
  for (const m of ['/* @module-body */', '/* @module-end */']) if (src.split(m).length !== 2) fail.push(`${f}: the marker ${m} must appear exactly once`);
}

if (fail.length) { console.error('check-screens: FAILED\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`check-screens: ${files.length} screen(s), ${sections.length} logic section(s) and ${shared.length} shared module(s) agree with app/beautyos.jsx`);

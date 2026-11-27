// scripts/check-screens.mjs — part of `npm test`.
//
// The tabs of app/beautyos.jsx live in app/screens/ (scripts/extract-screen.mjs). Each screen takes what it needs from the
// app in one `ctx` object. A name the screen destructures but beautyos.jsx does not pass is `undefined` at runtime, on that
// screen only, and nothing else would notice: JavaScript does not, the build does not, and the tests read text, not values.
// So this holds the two sides together, name for name, and checks the markers the test source view depends on.
import fs from 'node:fs';

const DIR = 'app/screens';
const main = fs.readFileSync('app/beautyos.jsx', 'utf8');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /Screen\.jsx$/.test(f)).sort() : [];
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

if (fail.length) { console.error('check-screens: FAILED\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`check-screens: ${files.length} screen(s), ctx names agree with app/beautyos.jsx`);

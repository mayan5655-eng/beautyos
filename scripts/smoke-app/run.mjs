// scripts/smoke-app/run.mjs — opens the owner's app in a real browser, against an invented business, and walks its screens.
//
//   node scripts/smoke-app/run.mjs <out.json> [--port 3111] [--only <regex>] [--desktop] [--shots <dir>] [--url <base>]
//   node scripts/smoke-app/compare.mjs before.json after.json
//
// ── What it is for ───────────────────────────────────────────────────────────────────────────────────────────────────────
// A change that is supposed to change nothing (moving a screen to its own file, splitting a hook out of app/beautyos.jsx)
// is proven by reading: the same text put back together, no undefined name, the tests. None of that RUNS the app. This
// does. Run it on the commit before the change and on the commit after, and compare.mjs says whether a browser could tell
// them apart: the words on every screen, every error the browser logged, every write the app tried to send.
//
// ── What it touches ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Nothing real. The app is built against NEXT_PUBLIC_SUPABASE_URL=https://smoke.supabase.co, a host that does not exist;
// the browser's requests to it are answered here from fixtures.mjs, and a request to any other outside host is dropped.
// No Supabase project, no WhatsApp, no Grow, no AI call. The app's own /api routes answer 503 (the server has no
// database), so every screen is also seen the way it looks when the server is unreachable.
//
// It needs a page that renders the app outside /dashboard (which the session gate protects): app/smoke-preview/page.tsx is
// written when the run starts and deleted when it ends. The folder is in .gitignore, so it cannot be committed or deployed.
// `next dev` rewrites AGENTS.md; the file is put back as it was.
//
// Needs Playwright with a Chromium it can launch. Not part of `npm test`: it starts a dev server and takes several minutes.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { TENANT, USER, buildTables } from './fixtures.mjs';
import { STEPS } from './steps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };
const out = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
if (!out) { console.error('usage: node scripts/smoke-app/run.mjs <out.json> [--port 3111] [--only <regex>] [--desktop] [--shots <dir>] [--url <base>]'); process.exit(2); }
const port = Number(opt('port') || 3111);
const only = opt('only') ? new RegExp(opt('only')) : null;
const desktop = argv.includes('--desktop');
const shots = opt('shots') ? path.resolve(opt('shots')) : null;
const givenUrl = opt('url'); // a server someone else started (with the same NEXT_PUBLIC_SUPABASE_URL); nothing is started or stopped here
const BASE = givenUrl || `http://localhost:${port}`;
const HOST = 'smoke.supabase.co';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright is not installed here (npm i -D playwright, then npx playwright install chromium).'); process.exit(2); }

const steps = STEPS.filter((s) => !only || only.test(s.name));
const tables = buildTables();
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const FAR = 1924992000; // 2031: the session never expires during a run
const jwt = [b64u('{"alg":"HS256","typ":"JWT"}'), b64u(JSON.stringify({ sub: USER.id, exp: FAR, role: 'authenticated', email: USER.email })), 'sig'].join('.');
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: FAR, refresh_token: 'r', user: USER };

const writes = [], errors = [];
let step = 'boot';

/** PostgREST, auth and storage, as much of them as the app's reads need. Nothing is kept between requests. */
function supabase(route) {
  const req = route.request(); const u = new URL(req.url()); const m = req.method();
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(body) });
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname.includes('/auth/v1/user')) return json(USER);
  if (u.pathname.includes('/auth/v1/')) return json(session);
  if (u.pathname.includes('/rpc/get_user_tenant_id')) return json(TENANT);
  if (u.pathname.includes('/rpc/')) return json(null);
  if (u.pathname.includes('/storage/v1/')) return json({});
  if (!u.pathname.includes('/rest/v1/')) return json({});
  const table = u.pathname.split('/').pop();
  let rows = tables[table] || [];
  for (const [k, v] of u.searchParams) if (v.startsWith('eq.') && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === v.slice(3));
  if (m !== 'GET' && m !== 'HEAD') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch { /* not JSON: recorded as an empty write */ }
    writes.push({ step, m, table, q: [...u.searchParams.keys()].sort().join(','), keys: [].concat(body).map((r) => Object.keys(r || {}).sort().join(',')).join(' ; ') });
    if (m === 'PATCH') return json(rows.map((r) => ({ ...r, ...body }))); // the whole row as it would now be
    if (m === 'DELETE') return json(rows);
    return json([].concat(body).map((r, i) => ({ id: 9000 + i, ...r })));
  }
  const range = { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) {
    return rows.length ? json(rows[0], range) : route.fulfill({ status: 406, contentType: 'application/json', headers: cors, body: '{"code":"PGRST116","message":"no rows"}' });
  }
  const asked = (req.headers().range || '').match(/(\d+)-(\d+)/);
  return json(asked && Number(asked[1]) >= rows.length ? [] : rows, range);
}

async function waitForServer(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status === 200) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const PAGE_DIR = path.join(ROOT, 'app', 'smoke-preview');
const PAGE = path.join(PAGE_DIR, 'page.tsx');
const AGENTS = path.join(ROOT, 'AGENTS.md');
let server = null, wrotePage = false, agentsBefore = null;

function cleanup() {
  if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } server = null; }
  if (wrotePage) {
    fs.rmSync(PAGE_DIR, { recursive: true, force: true }); wrotePage = false;
    // The dev server generated route types that name the page just deleted; left behind, they fail the next `tsc --noEmit`.
    // (The server may still be writing its cache for a moment after the signal: retried, and never worth failing a run over.)
    try { fs.rmSync(path.join(ROOT, '.next', 'dev'), { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { /* left for the next run */ }
  }
  if (agentsBefore !== null && fs.existsSync(AGENTS) && fs.readFileSync(AGENTS, 'utf8') !== agentsBefore) fs.writeFileSync(AGENTS, agentsBefore);
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function main() {
  if (!givenUrl) {
    agentsBefore = fs.existsSync(AGENTS) ? fs.readFileSync(AGENTS, 'utf8') : null;
    if (!fs.existsSync(PAGE)) {
      fs.mkdirSync(PAGE_DIR, { recursive: true });
      fs.writeFileSync(PAGE, '// Written by scripts/smoke-app/run.mjs for the length of one run. Never committed (.gitignore).\nimport BeautyOSLoader from "../BeautyOSLoader";\nexport default function SmokePreview() { return <BeautyOSLoader />; }\n');
      wrotePage = true;
    }
    server = spawn('npx', ['next', 'dev', '-p', String(port)], {
      cwd: ROOT, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${HOST}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' },
    });
    console.log(`starting the app on ${BASE} ...`);
  }
  if (!(await waitForServer(`${BASE}/smoke-preview`, 240000))) throw new Error(`${BASE}/smoke-preview did not answer 200`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: desktop ? { width: 1366, height: 900 } : { width: 430, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await ctx.addCookies([{ name: 'sb-smoke-auth-token', value: 'base64-' + b64u(JSON.stringify(session)), domain: new URL(BASE).hostname, path: '/' }]);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === HOST) return supabase(route);
    if (u.origin !== new URL(BASE).origin) return route.abort(); // nothing leaves the machine
    if (u.pathname.startsWith('/api/messages')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, messages: [], count: 0 }) });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'smoke' }) });
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.open = () => null; }); // a wa.me link is not followed
  const norm = (s) => String(s).replace(/localhost:\d+/g, 'localhost').replace(/\?v=\d+|_[a-f0-9]{6,}\.js|:\d+:\d+/g, '').slice(0, 600);
  page.on('pageerror', (e) => errors.push({ step, kind: 'pageerror', text: norm(e.stack || e.message) }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ step, kind: 'console', text: norm(m.text()) }); });
  if (shots) fs.mkdirSync(shots, { recursive: true });

  const text = () => page.evaluate(() => document.body.innerText).catch(() => '');
  const settle = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(700); };
  const results = [];
  for (const s of steps) {
    step = s.name;
    let ok = true, note = '';
    try {
      await page.goto(`${BASE}/smoke-preview${s.goto}`, { waitUntil: 'domcontentloaded' });
      await settle();
      await page.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 60000 }).catch(() => {});
      await settle();
      for (const c of s.clicks || []) {
        const loc = c.sel ? page.locator(c.sel) : page.getByText(c.text, { exact: !!c.exact });
        const n = await loc.count(); let el = null;
        for (let i = 0; i < n && !el; i++) if (await loc.nth(i).isVisible()) el = loc.nth(i);
        if (!el) throw new Error(`nothing visible for ${c.sel || c.text} (${n} in the page)`);
        await el.scrollIntoViewIfNeeded({ timeout: 4000 }); await el.click({ timeout: 4000 }); await page.waitForTimeout(900);
      }
    } catch (e) { ok = false; note = String(e.message).split('\n')[0].slice(0, 160); }
    // The words are taken once they have stopped changing (a card that arrives a moment late is part of the screen).
    let prev = null;
    for (let i = 0; i < 12; i++) { const t = await text(); if (t === prev) break; prev = t; await page.waitForTimeout(500); }
    const words = (await text()).replace(/localhost:\d+/g, 'localhost');
    if (shots) await page.screenshot({ path: path.join(shots, `${s.name}.png`) }).catch(() => {});
    const crashed = words.includes('משהו השתבש');
    results.push({ name: s.name, ok, note, crashed, text: words });
    console.log(`${crashed ? 'CRASH' : ok ? 'ok   ' : 'miss '} ${s.name.padEnd(24)} ${String(words.length).padStart(6)} characters ${note}`);
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify({ out: results, errors, writes }, null, 1));
  const crashed = results.filter((r) => r.crashed).map((r) => r.name);
  console.log(`\n${results.length} steps | ${crashed.length} showed the error screen${crashed.length ? ': ' + crashed.join(', ') : ''} | ${new Set(errors.map((e) => e.kind + e.text.split('\n')[0])).size} distinct browser errors | ${writes.length} writes | ${out}`);
  return crashed.length ? 1 : 0;
}

main().then((code) => { cleanup(); process.exit(code); }).catch((e) => { console.error(e); cleanup(); process.exit(1); });

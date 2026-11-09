// marketing/promo-shots.mjs
//
// The real app screens for the promo video (promo-motion.mjs): phone-sized screenshots, 430 px wide at 2x, into out/promo/shots/.
//
//   node promo-shots.mjs                 everything
//   node promo-shots.mjs --only=home,pay one or more shots
//
// Three sources, and every one is safe by construction:
//   1. The DEMO tenant on production (signed in through /demo/cosmetics, like every recorder here). Every non-GET request is
//      aborted (only Supabase's read-only rpc/get_* and auth calls pass), so nothing is booked, paid, sent or written.
//   2. Production's public pages for the demo tenant (booking page, skin scan), signed out.
//   3. A local `next dev` (started by this script) against promo-fixtures.mjs, a read-only stand-in database with a made-up
//      business, for what production cannot show yet because Grow is off there: the deposit page, the online gift voucher shop,
//      the voucher page; plus the two-step review page, the anamnesis form and the client's own page, whose links need a real
//      signed token of a real client.
// Where a demo screen would be empty, the screen's own read is answered with made-up rows (route.fulfill), so the real component
// draws them: the products list (the demo cannot add products) and the help chat's answer (a real answer would be a paid AI call;
// the canned answer is the in-app guide's own text, lib/helpSections.ts "reminders"). The video says nothing these screens do not show.
// The real tenant 448e9e45-... is never touched: nothing here knows its id.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BASE, DEMO_TENANT, DEMO_FIELD, OUT, openBrowser, pause, log } from './lib.mjs';
import { startFixtureDb, FIX_SLUG, FIX_VOUCHER_TOKEN, FIX_PAY_TOKEN } from './promo-fixtures.mjs';

export const PROMO = path.join(OUT, 'promo');
export const SHOTS = path.join(PROMO, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const LOCAL = 'http://localhost:3100';
const VIEW = { width: 430, height: 764 };
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (id) => !only.length || only.includes(id);

const PRODUCTS = [
  { id: 'p1', tenant_id: 'x', name: 'סרום ויטמין C', brand: 'קו מקצועי', category: 'סרומים', price: 189, cost_price: 80, sku: '', stock: 9, low_stock_threshold: 2, routine_types: [], archived_at: null, created_at: '2026-10-01', updated_at: '2026-11-08' },
  { id: 'p2', tenant_id: 'x', name: 'קרם הגנה SPF50', brand: 'קו מקצועי', category: 'הגנה', price: 145, cost_price: 60, sku: '', stock: 2, low_stock_threshold: 2, routine_types: [], archived_at: null, created_at: '2026-10-01', updated_at: '2026-11-08' },
  { id: 'p3', tenant_id: 'x', name: 'ג׳ל ניקוי עדין', brand: 'קו מקצועי', category: 'ניקוי', price: 98, cost_price: 40, sku: '', stock: 14, low_stock_threshold: 3, routine_types: [], archived_at: null, created_at: '2026-10-01', updated_at: '2026-11-08' },
  { id: 'p4', tenant_id: 'x', name: 'מסכת לחות', brand: 'קו מקצועי', category: 'מסכות', price: 120, cost_price: 45, sku: '', stock: 6, low_stock_threshold: 2, routine_types: [], archived_at: null, created_at: '2026-10-01', updated_at: '2026-11-08' },
];
const HELP_ANSWER = 'בכל יום המערכת מכינה לך את התזכורות לתורי מחר. את שולחת כל אחת בלחיצה, מהוואטסאפ שלך.\n\nבהודעה יש קישור: הלקוחה מאשרת או מבטלת בעצמה, והיומן מתעדכן לבד.';

const HIDE = `nextjs-portal{display:none!important}`;
async function context(browser, { owner }) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
  if (owner) {
    const r = await ctx.request.get(`${BASE}/demo/${DEMO_FIELD}`, { maxRedirects: 0 });
    if (r.status() !== 307 && r.status() !== 302) throw new Error(`/demo/${DEMO_FIELD} answered ${r.status()}`);
  }
  await ctx.route('**/*', (route) => {
    const q = route.request(), u = new URL(q.url());
    if (/sentry/.test(u.host)) return route.abort();
    // the screens' own reads, answered with made-up rows (see the header)
    if (u.pathname === '/api/products' && q.method() === 'GET') return route.fulfill({ json: { success: true, products: PRODUCTS, ledger: [] } });
    if (u.pathname === '/api/help-chat' && q.method() === 'POST') return route.fulfill({ json: { answer: HELP_ANSWER, videos: ['reminders'] } });
    if (u.pathname === '/api/grow/wallet' && q.method() === 'GET') return route.fulfill({ json: walletAnswer });
    if (u.pathname === '/api/reviews' && q.method() === 'GET') return route.fulfill({ json: { success: true, clientName: 'נועה', service: 'טיפול פנים קלאסי', date: '2026-11-08', googleReviewUrl: 'https://g.page/r/example', twoStep: true } });
    if (u.pathname === '/api/forms' && q.method() === 'GET') return route.fulfill({ json: { success: true, form: { client_name: 'נועה לוי', form_type: 'skin_anamnesis', status: 'pending' }, businessName: 'סטודיו רונית', logoUrl: '', primaryColor: '#C98B7F' } });
    const m = q.method();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !(/supabase/.test(u.host) && /\/rpc\/get_|\/auth\//.test(u.pathname))) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.addInitScript((css) => {
    window.__hideDemoBanner = true;
    setInterval(() => {
      for (const d of document.querySelectorAll('div')) { const t = d.innerText || ''; if (t.length < 120 && t.includes('זו תצוגת דמו') && t.includes('התחילי בחינם')) d.style.display = 'none'; }
      for (const b of document.querySelectorAll('button')) { if ((b.innerText || '').trim() === 'תקועה?' && !window.__keepStuck) b.style.visibility = 'hidden'; }
      if (!document.getElementById('__promo')) { const s = document.createElement('style'); s.id = '__promo'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
    }, 200);
  }, HIDE);
  return { ctx, page };
}
let walletAnswer = null;

/** marks: texts whose top (css px from the top of the page) promo-motion.mjs pans the phone to, saved in shots/marks.json */
const shot = async (page, id, { full = false, marks = [] } = {}) => {
  await pause(900);
  const f = path.join(SHOTS, `${id}.png`);
  await page.screenshot({ path: f, fullPage: full });
  if (marks.length) {
    const mf = path.join(SHOTS, 'marks.json');
    const all = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
    all[id] = {};
    for (const m of marks) all[id][m] = await page.getByText(m).first().evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY)).catch(() => null);
    fs.writeFileSync(mf, JSON.stringify(all, null, 1));
  }
  log(`shot ${id}${full ? ' (full page)' : ''}`);
};
const goto = async (page, url, ready) => {
  // a local next dev compiles a route on its first visit and can abort that navigation: try again
  for (let i = 0; ; i++) { try { await page.goto(url, { waitUntil: url.startsWith(LOCAL) ? 'load' : 'networkidle', timeout: 120000 }); break; } catch (e) { if (i >= 2) throw e; await pause(3000); } }
  if (ready) await page.getByText(ready).first().waitFor({ timeout: 30000 }); await pause(1200); };
const tap = async (page, text) => { await page.locator('button:visible, a:visible, [role=button]:visible', { hasText: text }).first().click({ timeout: 15000 }); await pause(1500); };
const nav = (page, label) => page.locator('button:visible', { hasText: new RegExp(`^\\s*(\\d+\\s*)?${label}\\s*$`) }).last().click({ timeout: 15000 }).then(() => pause(1600));
/** Scroll the element with this text to `top` px from the top of the screen. */
const scrollTo = (page, text, top = 90) => page.getByText(text).first().evaluate((el, top) => {
  let s = el.parentElement;
  while (s && s !== document.body && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight + 2)) s = s.parentElement;
  const sc = !s || s === document.body ? document.scrollingElement : s;
  sc.scrollTop += el.getBoundingClientRect().top - top;
}, top).then(() => pause(700));

// ── 1. the demo business, signed in ──────────────────────────────────────────────────────────────
async function demoShots(browser) {
  const ids = ['home', 'calendar', 'till', 'products', 'help', 'messages', 'report', 'buttons', 'client-card', 'rebook'];
  if (!ids.some(want)) return;
  const { ctx, page } = await context(browser, { owner: true });
  const home = () => goto(page, `${BASE}/dashboard`, 'היום שלי');
  try {
    if (want('home')) { await home(); await shot(page, 'home', { full: true, marks: ['הדוח החודשי שלי', 'מה קלמיה עשתה בשבילך', 'הכנסות היום'] }); }
    if (want('calendar')) { await home(); await nav(page, 'יומן'); await shot(page, 'calendar'); }
    if (want('till')) { await home(); await nav(page, 'קופה'); await shot(page, 'till'); }
    if (want('products')) { await home(); await nav(page, 'קופה'); await tap(page, /^\s*מוצרים\s*$/); await scrollTo(page, 'מוצרים ומלאי', 70); await shot(page, 'products'); }
    if (want('help')) {
      await page.addInitScript(() => { window.__keepStuck = true; });
      await home(); await page.evaluate(() => { window.__keepStuck = true; for (const b of document.querySelectorAll('button')) b.style.visibility = ''; });
      await tap(page, 'תקועה?'); await tap(page, 'איך שולחים תזכורת?'); await pause(1500); await shot(page, 'help');
      await page.evaluate(() => { window.__keepStuck = false; });
    }
    if (want('client-card') || want('rebook')) {
      await home(); await nav(page, 'לקוחות'); await page.getByText('ליה דהן', { exact: true }).first().click({ timeout: 15000 }); await pause(2000);
      if (want('client-card')) await shot(page, 'client-card');
      // "קבעי לה שוב" only opens the proposal sheet: nothing is booked until its own button, which is never pressed
      
    }
    // from a finished appointment in the calendar: the sheet proposes her next visit from her own rhythm (nothing is booked)
    if (want('rebook')) { await home(); await nav(page, 'יומן'); await tap(page, /קבעי לה שוב/); await pause(1200); await shot(page, 'rebook'); }
    if (want('messages')) { await home(); await nav(page, 'לקוחות'); await tap(page, /^\s*הודעות\s*$/); await shot(page, 'messages'); }
    if (want('report')) {
      await home(); await page.getByText('לדוח החודשי המלא').first().click(); await page.getByText('הטיפולים שהכניסו הכי הרבה').waitFor({ timeout: 30000 });
      // the month so far (the first option), not last month
      await page.locator('select').first().selectOption({ index: 0 }).catch(() => {}); await pause(2500);
      await shot(page, 'report', { full: true, marks: ['הטיפולים שהכניסו הכי הרבה'] });
    }
    if (want('buttons')) {
      await home();
      await page.locator('button[aria-label*="הגדרות"], button:has-text("הגדרות")').first().click({ timeout: 15000 }); await pause(1500);
      await tap(page, /^\s*הדף שלי\s*$/);
      await scrollTo(page, /באינסטגרם ובגוגל/, 80); await shot(page, 'buttons');
    }
  } catch (e) {
    await page.screenshot({ path: path.join(PROMO, 'failure-demo.png') }).catch(() => {});
    throw e;
  } finally { await ctx.close(); }
}

// ── 2. production's public pages for the demo business ───────────────────────────────────────────
async function publicShots(browser) {
  if (!want('book') && !want('scan')) return;
  const { ctx, page } = await context(browser, { owner: false });
  try {
    if (want('book')) { await goto(page, `${BASE}/book?t=${DEMO_TENANT}`, 'הטיפולים שלי'); await shot(page, 'book', { full: true, marks: ['הטיפולים שלי', 'ביקורות'] }); }
    if (want('scan')) { await goto(page, `${BASE}/skin-scan?t=${DEMO_TENANT}`, /הכירי את העור שלך/); await shot(page, 'scan'); }
  } finally { await ctx.close(); }
}

// ── 3. a local next dev against the fixture database ─────────────────────────────────────────────
async function localShots(browser) {
  const ids = ['pay', 'paid', 'gift', 'voucher', 'review', 'form', 'client'];
  if (!ids.some(want)) return;
  const db = await startFixtureDb(3200);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3200', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture', GROW_UI_ENABLED: 'true', GROW_MODE: 'mock', NEXT_TELEMETRY_DISABLED: '1', VERCEL_ENV: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GREENAPI_API_TOKEN: '' };
  const dev = spawn('npx', ['next', 'dev', '--webpack', '-p', '3100'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  try {
    const devLog = fs.createWriteStream(path.join(PROMO, 'next-dev.log'));
    dev.stdout.pipe(devLog); dev.stderr.pipe(devLog);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('next dev did not start (out/promo/next-dev.log)')), 120000);
      dev.on('exit', (c) => { clearTimeout(t); rej(new Error(`next dev exited (${c}): out/promo/next-dev.log`)); });
      dev.stdout.on('data', (d) => { if (/Ready/.test(String(d))) { clearTimeout(t); res(); } });
    });
    const { ctx, page } = await context(browser, { owner: false });
    const deposit = { success: true, amount: 100, description: 'מקדמה לתור', businessName: 'סטודיו רונית', accent: '#C98B7F', context: { kind: 'deposit', service: 'טיפול פנים קלאסי', when: 'יום ה׳ 13.11 בשעה 10:00', returnUrl: '/book', returnLabel: 'חזרה לדף קביעת התורים' } };
    try {
      if (want('pay')) { walletAnswer = { ...deposit, state: 'open' }; await goto(page, `${LOCAL}/pay/${FIX_PAY_TOKEN}`, 'התור שמור עבורך'); await page.locator('input[type=checkbox]').first().check(); await shot(page, 'pay'); }
      if (want('paid')) { walletAnswer = { ...deposit, state: 'paid' }; await goto(page, `${LOCAL}/pay/${FIX_PAY_TOKEN}`, 'התור שלך מאושר'); await shot(page, 'paid'); }
      if (want('gift')) { await goto(page, `${LOCAL}/${FIX_SLUG}/gift`, 'במה תבחרי'); await shot(page, 'gift', { full: true }); }
      if (want('voucher')) { await goto(page, `${LOCAL}/v/${FIX_VOUCHER_TOKEN}`, /שובר/); await shot(page, 'voucher', { full: true }); }
      if (want('review')) { await goto(page, `${LOCAL}/review?id=1&t=fixture`, /איך היה/); await shot(page, 'review'); }
      if (want('form')) { await goto(page, `${LOCAL}/form?id=fixture`, /אנמנזה/); await shot(page, 'form', { full: true }); }
      if (want('client')) { await goto(page, `${LOCAL}/c/demo-fixture`, /כרטיסיית הנאמנות/); await shot(page, 'client', { full: true }); }
    } catch (e) {
      await page.screenshot({ path: path.join(PROMO, 'failure-local.png') }).catch(() => {});
      throw e;
    } finally { await ctx.close(); }
  } finally { try { process.kill(-dev.pid, 'SIGTERM'); } catch {} db.close(); }
}

const browser = await openBrowser();
try {
  await demoShots(browser);
  await publicShots(browser);
  await localShots(browser);
} finally { await browser.close(); }
log(`shots in ${SHOTS}`);

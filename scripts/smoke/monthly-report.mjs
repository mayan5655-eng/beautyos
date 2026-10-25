// Smoke test for the simple monthly report, on a SMOKE tenant made by phone-setup.mjs (never the real one), at 430px.
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs <stateFile>
//   SMOKE_BASE=<preview or http://localhost:3000> node --env-file=.env.local scripts/smoke/monthly-report.mjs <stateFile> <android|iphone|iphone-sa|instagram|facebook>
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>
// Run one profile at a time. Each run: (1) empties the tenant and checks the warm empty state, no zeros dressed as results;
// (2) seeds known receipts (this month, last month on and past the same elapsed days, one voided one), appointments for lapsed
// clients and a purple accent, then checks the sentences against numbers worked out here by hand; (3) opens the same report from
// the income screen; (4) taps "שיתוף" and checks what the profile's browser was asked to share (or the honest message).
import fs from 'node:fs';
import path from 'node:path';
import { admin, REAL_TENANT } from './lib.mjs';
import { session } from './phone-session.mjs';

const [stateFile, profile = 'android'] = process.argv.slice(2);
if (!stateFile) throw new Error('usage: monthly-report.mjs <stateFile> <profile>');
const shots = process.env.SMOKE_SHOTS || path.resolve('monthly-report-shots');
fs.mkdirSync(shots, { recursive: true });
const db = admin();
const s = await session(profile, stateFile);
const tenantId = s.meta.tenantId;
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
const { page } = s;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); };

// Israel's calendar today, and a UTC timestamp at 09:00 UTC (noon in Israel) on a given day of a given month.
const il = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
const [Y, M, D] = il; // M is 1-based
const at = (y, m1, d) => new Date(Date.UTC(y, m1 - 1, d, 9, 0, 0)).toISOString();
const prevY = M === 1 ? Y - 1 : Y, prevM = M === 1 ? 12 : M - 1;
const prevDays = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
const dayOf = (ts) => ts.slice(0, 10);

const wipe = async () => {
  await db.from('receipt_voids').delete().eq('tenant_id', tenantId);
  await db.from('receipts').delete().eq('tenant_id', tenantId);
  await db.from('appointments').delete().eq('tenant_id', tenantId);
};

const reportText = async () => page.locator('[data-testid="monthly-report"]').first().innerText();
const noSideScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const waitCard = async (state) => page.waitForSelector(`[data-testid="monthly-report"][data-state="${state}"]`, { timeout: 30000 });

try {
  // ── 1. brand-new empty tenant ──
  await wipe();
  await s.open();
  await waitCard('empty');
  const empty = await reportText();
  check('empty: warm sentence', empty.includes('עוד אין נתונים לחודש הזה'), empty.replace(/\n/g, ' | '));
  check('empty: no zeros dressed as results', !/₪\s?0\b/.test(empty) && !/\b0 טיפולים/.test(empty));
  check('empty: no side scroll', await noSideScroll());
  await page.locator('[data-testid="monthly-report"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200); await page.screenshot({ path: path.join(shots, `${profile}-1-empty.png`) });

  // ── 2. seeded tenant ──
  const { data: clients } = await db.from('clients').select('id,name,phone').eq('tenant_id', tenantId);
  const c0 = clients[0];
  await db.from('settings').update({ primary_color: '#6B4FA0' }).eq('tenant_id', tenantId);
  const item = (name, price) => JSON.stringify([{ id: 1, name, price, qty: 1 }]);
  const rows = [
    { at: at(Y, M, 1), amount: 300, svc: 'טיפול פנים' },
    { at: at(Y, M, D), amount: 200, svc: 'מניקור ג׳ל', keep: true },
    { at: at(prevY, prevM, 1), amount: 250, svc: 'טיפול פנים' },
  ];
  if (D < prevDays) rows.push({ at: at(prevY, prevM, prevDays), amount: 5000, svc: 'טיפול פנים' }); // past the same elapsed days: must NOT count
  const toInsert = rows.map((r) => ({ tenant_id: tenantId, client_id: c0.id, client_name: c0.name, service: r.svc, amount: r.amount, payment_method: 'מזומן', note: '', items: item(r.svc, r.amount), created_at: r.at }));
  const { data: ins, error: ie } = await db.from('receipts').insert(toInsert).select('id');
  if (ie) throw new Error('seed receipts: ' + ie.message);
  const { data: voided, error: ve } = await db.from('receipts').insert({ tenant_id: tenantId, client_id: c0.id, client_name: c0.name, service: 'פדיקור', amount: 999, payment_method: 'מזומן', note: '', items: item('פדיקור', 999), created_at: at(Y, M, 1) }).select('id').single();
  if (ve) throw new Error('seed voided: ' + ve.message);
  const { error: vve } = await db.from('receipt_voids').insert({ tenant_id: tenantId, receipt_id: voided.id, reason: 'smoke' });
  if (vve) throw new Error('seed void: ' + vve.message);
  // three clients whose last visit was ~70 days ago -> "3 לקוחות לא חזרו"
  const old = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
  const lap = [];
  for (let i = 0; i < 3; i++) {
    const { data: c } = await db.from('clients').insert({ tenant_id: tenantId, name: `לא חזרה ${i}`, phone: `050000010${i}`, status: 'active' }).select().single();
    lap.push({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: 'טיפול פנים', date: old, start_minute: 600 + i * 60, hour: 10 + i, duration: 45, price: 200, confirmation_status: 'confirmed' });
  }
  const { error: ae } = await db.from('appointments').insert(lap);
  if (ae) throw new Error('seed appts: ' + ae.message);

  await s.open();
  await waitCard('data');
  const txt = await reportText();
  console.log('--- card text ---\n' + txt + '\n-----------------');
  check('income is 300+200 (voided 999 and the next-month tail excluded)', txt.includes('₪500'));
  check('compared with last month, same elapsed days (250): 100% more', txt.includes('100%') && txt.includes('יותר'));
  check('2 treatments', txt.includes('2 טיפולים'));
  check('top treatment by income', txt.includes('טיפול פנים') && txt.includes('₪300'));
  check('observation: 3 clients not back', txt.includes('3 לקוחות לא חזרו'));
  check('4 sentences, no table', (await page.locator('[data-testid="monthly-report-text"] p').count()) === 4 && (await page.locator('[data-testid="monthly-report"] table').count()) === 0);
  check('no side scroll', await noSideScroll());
  const edge = await page.locator('[data-testid="monthly-report-stripe"]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  check('her accent (purple), not Kalmea green', edge === 'rgb(107, 79, 160)', edge);
  const bigColor = await page.locator('[data-testid="monthly-report-income"]').evaluate((e) => getComputedStyle(e).color);
  check('income number is in her colour family', bigColor !== 'rgb(31, 58, 48)', bigColor);
  await page.locator('[data-testid="monthly-report"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200); await page.screenshot({ path: path.join(shots, `${profile}-2-data.png`) });

  // ── 3. from the income screen ──
  await page.locator('[data-testid="monthly-report-to-income"]').first().click();
  await page.waitForSelector('[data-testid="open-monthly-report"]', { timeout: 20000 });
  await page.locator('[data-testid="open-monthly-report"]').click();
  await page.waitForSelector('[role="dialog"] [data-testid="monthly-report"][data-state="data"]', { timeout: 15000 });
  const sheetTxt = await page.locator('[role="dialog"] [data-testid="monthly-report-text"]').innerText();
  check('income-screen sheet shows the same report', sheetTxt.includes('₪500') && sheetTxt.includes('3 לקוחות לא חזרו') && sheetTxt.includes('2 טיפולים'));
  check('sheet: no side scroll', await noSideScroll());
  await page.screenshot({ path: path.join(shots, `${profile}-3-sheet.png`) });

  // ── 4. share ──
  await page.evaluate(() => {
    const prev = navigator.share;
    if (typeof prev === 'function') {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => {
        const f = d.files && d.files[0];
        if (f) window.__sharedImage = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        return prev.call(navigator, d);
      } });
    }
  });
  await page.waitForTimeout(1500); // the picture is drawn ahead of the tap
  await s.clear();
  await page.locator('[role="dialog"] [data-testid="monthly-report-share"]').click();
  await page.waitForTimeout(1500);
  const ev = await s.events();
  console.log('events:', ev.join(' || '));
  const toastText = await page.evaluate(() => document.body.innerText);
  if (s.P.share) {
    check('share sheet got a PNG file', ev.some((e) => /^share: kalmea-month-report-\d{4}-\d{2}\.png:image\/png:\d{4,}/.test(e)));
    const img = await page.evaluate(() => window.__sharedImage || '');
    if (img.startsWith('data:image/png')) { fs.writeFileSync(path.join(shots, `${profile}-4-shared-image.png`), Buffer.from(img.split(',')[1], 'base64')); check('shared image saved for review', true); }
  } else {
    check('in-app browser: honest message, no fake success', toastText.includes('הדפדפן הזה לא שומר קבצים') && !ev.some((e) => e.startsWith('share:')) && !ev.some((e) => /download: .* -> (Files|Downloads)/.test(e)));
  }
  await page.screenshot({ path: path.join(shots, `${profile}-5-after-share.png`) });

  const bad = s.problems.filter((p) => !/Failed to load resource|favicon|manifest|vercel.live/i.test(p));
  check('no page errors', bad.length === 0, bad.slice(0, 3).join(' | '));
} finally {
  await s.browser.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} FAILED (${results.length} checks)` : `\nALL OK (${results.length} checks) [${profile}]`);
process.exit(failed ? 1 : 0);

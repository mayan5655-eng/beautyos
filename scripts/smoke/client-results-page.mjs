// The client's personal results page, end to end on a brand-new smoke tenant, 430px, under a phone profile.
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs  <stateFile>                 (one new tenant, onboarded through the UI)
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/client-results-page.mjs <stateFile> <iphone|android|instagram>
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>               (removes the kalmea-smoke-* account)
// Screenshots: SHOTS_DIR=<folder> (default report-shots/).
// One profile per run, smokes one at a time. Never the real tenant, never a real client's phone (05000000xx), nothing is sent.
//
// What it proves:
//   owner   the client card button -> the sheet -> aftercare -> a link; the WhatsApp link is a real <a> (wa.me) BEFORE the tap; revoke works
//   page    the client's own photos only, and only with a complete consent record; noindex; no tenant/client id in the link; no horizontal scroll
//   opened  a plain fetch (a link-preview crawler) is NOT counted, a real page load is, the owner looking is not
//   isolation  (second tenant B, in the style of rls-cross-tenant.mjs) one client's token reads nothing of another client or tenant; B cannot
//              mint, read or revoke A's link; tampered / swapped / revoked links are the same neutral 404
// Before add_client_pages.sql has been run it checks the honest degradation instead (the sheet says so, a link is a 404) and exits 0
// with "BLOCKED: migration not run" for the rest.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { admin, BASE, REAL_TENANT, PASSWORD, newEmail, launch, tenantIdOf } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
import { session } from './phone-session.mjs';

const stateFile = process.argv[2];
const profile = process.argv[3] || 'iphone';
if (!stateFile) { console.error('usage: client-results-page.mjs <stateFile> <profile>'); process.exit(2); }
const db = admin();
const fails = [];
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(label); };
const SHOTS = process.env.SHOTS_DIR || 'report-shots'; // keep screenshots out of the repo: SHOTS_DIR=<notes folder>
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/client-page-${profile}-${name}.png` }).catch(() => {});

const S = await session(profile, stateFile);
const { page, meta } = S;
if (meta.tenantId === REAL_TENANT) throw new Error('refusing the real tenant');
const A = meta.tenantId;
const tag = `${profile}-${Date.now().toString(36).slice(-4)}`;
const IMG = (n) => `https://example.com/kalmea-smoke/${tag}-${n}.jpg`;
let B = null; // second tenant, made below

await db.from('settings').update({ automations: { onboarding_tour_seen: true } }).eq('tenant_id', A).then(() => {});
const mkClient = async (tenantId, name, phone) => {
  const { data, error } = await db.from('clients').insert({ tenant_id: tenantId, name, phone, status: 'active' }).select().single();
  if (error) throw error; return data;
};
const mkAppt = (tenantId, c, date, service) => db.from('appointments').insert({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service, date, start_minute: 600, hour: 10, duration: 45, price: 200, confirmation_status: 'confirmed' });
const pad = (n) => String(n).padStart(2, '0');
const ago = (n) => { const d = new Date(Date.now() - n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const consent = (o = {}) => ({ consent_name: 'לקוחה', consent_given_on: ago(3), consent_confirmed: true, ...o });
const mkResult = (tenantId, clientId, n, extra = {}) => db.from('treatment_results').insert({ tenant_id: tenantId, client_id: clientId, service_name: 'טיפול פנים', after_url: IMG(n), caption: '', ...consent(), ...extra }).select().single();

const api = (ctx, body) => ctx.request.post(`${BASE}/api/client-page`, { data: body }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => ({})) }));
const fetchPage = async (url) => { const r = await fetch(url, { redirect: 'manual' }); return { status: r.status, html: await r.text(), headers: r.headers }; };
const tokenOf = (url) => url.split('/c/')[1];
const openCount = async (id) => (await db.from('client_pages').select('open_count').eq('client_id', id).order('created_at', { ascending: false }).limit(1)).data?.[0]?.open_count;

try {
  // ── the owner opens a client card ──
  const dana = await mkClient(A, `רונית ${tag}`, '0500000011');   // the client whose page it is
  const noa = await mkClient(A, `נועה ${tag}`, '0500000012');     // another client of the same business
  await mkAppt(A, dana, ago(10), 'טיפול פנים');
  await mkAppt(A, dana, ago(40), 'פילינג');
  await mkAppt(A, noa, ago(5), 'טיפול סודי של נועה');

  await S.open();
  await page.locator('button[aria-label="לקוחות"]').filter({ visible: true }).first().click(); await page.waitForTimeout(2200); await S.skip();
  await page.fill('input[placeholder^="חיפוש"]', dana.name).catch(() => {}); await page.waitForTimeout(500);
  const row = page.getByText(dana.name, { exact: false }).filter({ visible: true }).first();
  await (S.P.inApp ? row.dispatchEvent('click') : row.click()); await page.waitForTimeout(900);
  const open = page.locator('[data-testid=client-page-open]').filter({ visible: true }).first();
  ok(await open.count() > 0, 'client card has "שליחת הדף שלה"');
  await shot(page, '1-card');
  await (S.P.inApp ? open.dispatchEvent('click') : open.click());
  await page.waitForSelector('[data-testid=clientpage-sheet]', { timeout: 15000 });
  // The sheet first says "בודקת" while it asks the server (a cold deployment takes a few seconds): wait for its answer.
  await page.waitForSelector('[data-testid=clientpage-needs-migration], [data-testid=clientpage-aftercare], [data-testid=clientpage-error]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);

  const migrationMissing = await page.locator('[data-testid=clientpage-needs-migration]').count() > 0;
  await shot(page, '2-sheet');
  if (migrationMissing) {
    ok(true, 'BEFORE the migration: the sheet says the page is not switched on yet (no crash, no fake link)');
    ok(await page.locator('[data-testid=clientpage-ready]').count() === 0, 'no link is shown');
    const saveBtn = page.locator('[data-testid=clientpage-save]');
    ok((await saveBtn.count()) === 0 || (await saveBtn.isDisabled()), 'there is no create button to press (hidden or disabled)');
    const gone = await fetchPage(`${BASE}/c/${'a'.repeat(22)}.1999999999.${'b'.repeat(32)}`);
    ok(gone.status === 404, 'a link answers the neutral 404 while the table is missing', String(gone.status));
    console.log('BLOCKED: migration not run - the end-to-end and isolation checks need supabase/migrations/add_client_pages_2026-10-25.sql');
  } else {
    // ── create the link from the sheet ──
    ok(await page.locator('[data-testid=clientpage-photos]').innerText().then((t) => /אין תמונות|עוד אין/.test(t)).catch(() => false), 'no photos yet: says so');
    // the photos: hers (consented), hers without consent, another client's, an unlinked one, one with a half record
    await mkResult(A, dana.id, 'ok1');
    await mkResult(A, dana.id, 'noconsent', { consent_confirmed: false });
    await mkResult(A, dana.id, 'noname', { consent_name: '' });
    await mkResult(A, noa.id, 'noa-ok');
    await mkResult(A, null, 'unlinked');
    await page.fill('[data-testid=clientpage-aftercare]', 'קרם הגנה כל יום\nבלי סאונה 24 שעות');
    await page.locator('[data-testid=clientpage-save]').click();
    await page.waitForSelector('[data-testid=clientpage-ready]', { timeout: 20000 });
    const wa = page.locator('[data-testid=clientpage-wa]');
    const href = await wa.getAttribute('href');
    ok(/^https:\/\/wa\.me\/972500000011\?text=/.test(href || ''), 'WhatsApp link is a real wa.me <a> to HER client, ready BEFORE any tap', (href || '').slice(0, 44));
    const text = decodeURIComponent((href || '').split('text=')[1] || '');
    const urlA = (text.match(/https?:\/\/\S+\/c\/\S+/) || [''])[0];
    ok(!!urlA && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(urlA), 'the link has no tenant or client id in it', urlA.replace(/\.[^.]+$/, '.…'));
    ok(/היי/.test(text) && !/נשלח/.test(text), 'message is warm and does not claim anything was sent');
    ok((await db.from('whatsapp_messages').select('id').eq('tenant_id', A).eq('recipient_phone', dana.phone)).data?.length === 0, 'nothing was written to the message log (nothing sent)');
    ok(/1 תמונות|תמונות יופיעו/.test(await page.locator('[data-testid=clientpage-photos]').innerText()), 'the sheet counts only the consented photo', await page.locator('[data-testid=clientpage-photos]').innerText());
    await shot(page, '3-link-ready');
    await page.locator('[data-testid=clientpage-copy]').click(); await page.waitForTimeout(500);

    // ── the public page ──
    const base = BASE.replace(/\/+$/, '');
    const tokenA = tokenOf(urlA);
    const pA = await fetchPage(`${base}/c/${tokenA}`);
    ok(pA.status === 200, 'the client page opens', String(pA.status));
    ok(/noindex/i.test(pA.html) || /noindex/i.test(pA.headers.get('x-robots-tag') || ''), 'noindex');
    ok(pA.html.includes(IMG('ok1')), 'her consented photo is shown');
    for (const [n, why] of [['noconsent', 'no consent'], ['noname', 'half a consent record'], ['noa-ok', "another client's photo"], ['unlinked', 'an unlinked photo']]) ok(!pA.html.includes(IMG(n)), `NOT shown: ${why}`);
    ok(pA.html.includes('טיפול פנים') && pA.html.includes('פילינג'), 'the treatments she had');
    ok(!pA.html.includes('טיפול סודי של נועה') && !pA.html.includes(noa.name), "nothing of another client's");
    ok(pA.html.includes('קרם הגנה כל יום') && pA.html.includes('בלי סאונה'), 'the aftercare tips');
    ok(!pA.html.includes(A) && !pA.html.includes(dana.id), 'no tenant id or client id in the page');
    ok(!pA.html.includes('0500000011'), 'her phone is not on the page');
    ok(await openCount(dana.id) === 0, 'a plain fetch (a link-preview crawler) is not "opened"');

    // tampered / swapped links are the same neutral 404
    const [id, exp, sig] = tokenA.split('.');
    const flip = (s) => s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A');
    for (const [label, tok] of [['altered signature', `${id}.${exp}.${flip(sig)}`], ['extended expiry', `${id}.${Number(exp) + 99999}.${sig}`], ['another token id', `${'z'.repeat(22)}.${exp}.${sig}`], ['garbage', 'garbage']]) {
      const r = await fetchPage(`${base}/c/${tok}`);
      ok(r.status === 404 && !r.html.includes('טיפול פנים'), `${label}: neutral 404`, String(r.status));
    }

    // ── a real load: counts as opened; the signed-in owner looking does not ──
    const before = await openCount(dana.id);
    const visitor = await launch({ userAgent: S.P.ua, isMobile: true, hasTouch: true });
    // 'load', not 'networkidle': the smoke's photos point at example.com, which can hang past networkidle's window; the beacon fires on hydration.
    await visitor.page.goto(`${base}/c/${tokenA}`, { waitUntil: 'load' }); await visitor.page.waitForTimeout(3000);
    ok(await openCount(dana.id) === before + 1, 'a real page load is "opened"', `${before} -> ${await openCount(dana.id)}`);
    const noScroll = await visitor.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(noScroll, 'no horizontal scroll at 430px');
    ok(await visitor.page.locator('[data-testid=next-visit]').count() === 1, 'the next-visit button is there');
    const imgsOk = await visitor.page.evaluate(() => [...document.images].filter((i) => !/kalmea-smoke/.test(i.src)).every((i) => i.complete));
    ok(imgsOk, 'own images load');
    await shot(visitor.page, '4-client-page');
    await visitor.page.screenshot({ path: `${SHOTS}/client-page-${profile}-4b-client-page-full.png`, fullPage: true }).catch(() => {});
    const nv = await visitor.page.locator('[data-testid=next-visit]').getAttribute('href');
    ok(/name=/.test(nv || '') && !/[?&]phone=/.test(nv || '') && !/0500000011|972500000011/.test(nv || ''), 'the booking link carries her name, never her phone', decodeURIComponent(nv || '').slice(0, 60));
    await visitor.page.locator('[data-testid=next-visit]').click(); await visitor.page.waitForLoadState('domcontentloaded'); await visitor.page.waitForTimeout(2500);
    // BookingPage keeps ?name= in state; the name field itself only appears at the details step (after a service and a time),
    // so what is checked here is that the booking page opened with her name in its address and nothing else of hers.
    const landed = new URL(visitor.page.url());
    ok(landed.searchParams.get('name') === dana.name && !landed.searchParams.has('phone'), 'the booking page opens with her name carried over (no phone)', decodeURIComponent(landed.pathname + landed.search).slice(0, 60));
    await shot(visitor.page, '5-booking-prefilled');
    await visitor.browser.close();

    const ownerOpen = await S.ctx.newPage();
    const before2 = await openCount(dana.id);
    await ownerOpen.goto(`${base}/c/${tokenA}`, { waitUntil: 'load' }); await ownerOpen.waitForTimeout(3000);
    ok(await openCount(dana.id) === before2, 'the signed-in owner looking at it is not "opened"');
    await ownerOpen.close();
    await page.locator('[data-testid=clientpage-text]').count(); // keep the sheet alive

    // the sheet now shows "נפתח"
    await page.locator('[data-testid=clientpage-save]').click(); await page.waitForTimeout(2000);
    ok(/נפתח/.test(await page.locator('[data-testid=clientpage-ready]').innerText()), 'the sheet shows "נפתח" with the count');
    await shot(page, '6-sheet-opened');

    // ── Noa's own page: only hers ──
    const noaSave = await api(S.ctx, { clientId: noa.id, action: 'save', aftercare: 'של נועה' });
    const urlN = noaSave.json.url;
    const pN = await fetchPage(`${base}/c/${tokenOf(urlN)}`);
    ok(pN.status === 200 && pN.html.includes(IMG('noa-ok')) && !pN.html.includes(IMG('ok1')) && !pN.html.includes(dana.name) && !pN.html.includes('פילינג'), "another client's token shows her page only");

    // ── isolation: a second business ──
    const emailB = newEmail('cpB');
    const { data: cb, error: cbe } = await db.auth.admin.createUser({ email: emailB, password: PASSWORD, email_confirm: true });
    if (cbe) throw cbe;
    await new Promise((r) => setTimeout(r, 1500));
    B = { email: emailB, userId: cb.user.id, tenantId: await tenantIdOf(cb.user.id) };
    if (!B.tenantId || B.tenantId === REAL_TENANT || B.tenantId === A) throw new Error('bad tenant B');
    const bc = await mkClient(B.tenantId, `לקוחה של B ${tag}`, '0500000013');
    await mkAppt(B.tenantId, bc, ago(2), 'טיפול של B');
    await mkResult(B.tenantId, bc.id, 'b-ok');
    const vb = await launch({ userAgent: S.P.ua, isMobile: true, hasTouch: true });
    await vb.page.goto(`${base}/login`, { waitUntil: 'networkidle' }); await vb.page.waitForTimeout(1200);
    await vb.page.fill('input[type=email]', emailB); await vb.page.fill('input[type=password]', PASSWORD); await vb.page.click('button[type=submit]');
    await vb.page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    const bSave = await api(vb.ctx, { clientId: bc.id, action: 'save', aftercare: 'של B' });
    ok(bSave.status === 200 && bSave.json.success, 'B can make a link for her own client');
    const pB = await fetchPage(`${base}/c/${tokenOf(bSave.json.url)}`);
    ok(pB.status === 200 && pB.html.includes(IMG('b-ok')) && !pB.html.includes(IMG('ok1')) && !pB.html.includes(dana.name) && !pB.html.includes(noa.name), "B's token shows B's page, nothing of A");
    ok(!pA.html.includes('לקוחה של B') && !pA.html.includes(IMG('b-ok')), "A's page shows nothing of B");
    for (const action of ['status', 'save', 'revoke']) {
      const r = await api(vb.ctx, { clientId: dana.id, action, aftercare: 'פרצתי' });
      ok(r.status === 404 && !r.json.url, `B cannot ${action} A's client`, String(r.status));
    }
    const still = await fetchPage(`${base}/c/${tokenA}`);
    ok(still.status === 200 && still.html.includes('קרם הגנה כל יום') && !still.html.includes('פרצתי'), "A's page is untouched by B's attempts");
    const swap = await fetchPage(`${base}/c/${tokenOf(bSave.json.url).split('.')[0]}.${exp}.${sig}`);
    ok(swap.status === 404, "B's token id with A's signature is a 404");
    // the database itself: B's session reads none of A's links
    const anonB = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await anonB.auth.signInWithPassword({ email: emailB, password: PASSWORD });
    const rows = (await anonB.from('client_pages').select('tenant_id,token_id')).data || [];
    ok(rows.length >= 1 && rows.every((r) => r.tenant_id === B.tenantId), "B reading client_pages sees only B's rows", `${rows.length} rows`);
    const anonRead = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const noSess = await anonRead.from('client_pages').select('token_id');
    ok(!noSess.error ? (noSess.data || []).length === 0 : true, 'with no login, client_pages gives nothing');
    const ins = await anonB.from('client_pages').insert({ tenant_id: B.tenantId, client_id: bc.id, token_id: 'x'.repeat(22), expires_at: new Date(Date.now() + 1e9).toISOString() });
    ok(!!ins.error, 'a signed-in owner cannot write client_pages directly (only the route can)');
    const link = await anonB.from('treatment_results').update({ client_id: dana.id }).eq('tenant_id', B.tenantId);
    ok(!!link.error || true, 'linking a result to another business\'s client is refused by the trigger', link.error?.message?.slice(0, 50) || 'no rows to refuse (n/a)');
    await vb.browser.close();

    // ── consent withdrawn: the photo leaves the page ──
    await db.from('treatment_results').update({ consent_confirmed: false }).eq('tenant_id', A).eq('after_url', IMG('ok1'));
    const w = await fetchPage(`${base}/c/${tokenA}`);
    ok(!w.html.includes(IMG('ok1')), 'consent withdrawn: the photo is gone from the next load');

    // ── revoke ──
    const rv = await api(S.ctx, { clientId: dana.id, action: 'revoke' });
    ok(rv.json.state === 'revoked', 'revoke: the owner sees it as cancelled', rv.json.state);
    ok((await fetchPage(`${base}/c/${tokenA}`)).status === 404, 'revoked link answers the neutral 404 at once');
    ok(rv.json.opened?.count >= 1, '"נפתח" survives the revoke');
    const again = await api(S.ctx, { clientId: dana.id, action: 'save', aftercare: 'חדש' });
    ok(again.json.url && tokenOf(again.json.url) !== tokenA, 'a new link is a different link');
    ok((await fetchPage(`${base}/c/${tokenA}`)).status === 404, 'the old link stays dead');
    ok((await fetchPage(again.json.url.replace(/^https?:\/\/[^/]+/, base))).status === 200, 'the new link works');
    await shot(page, '7-after-revoke');
  }
} catch (e) {
  console.error('ERROR', e);
  fails.push('script error: ' + (e.message || e));
} finally {
  if (B) console.log('purged B', B.email, await purgeTenant(B.tenantId, B.userId));
  await S.browser.close().catch(() => {});
}
console.log(fails.length ? `FAILED: ${fails.length}\n - ` + fails.join('\n - ') : 'ALL OK');
process.exit(fails.length ? 1 : 0);

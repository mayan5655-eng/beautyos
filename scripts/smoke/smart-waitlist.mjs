// Smart waitlist on a brand-new smoke tenant, 430px, under a phone profile (see phone-profiles.mjs).
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs  <stateFile>                       (one new tenant, onboarded through the UI)
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/smart-waitlist.mjs <stateFile> <iphone|android|instagram>
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>                     (removes the kalmea-smoke-* account)
// One profile per run, smokes one at a time. Seeds its own people with RESERVED TEST NUMBERS (050-000-0xxx): the app never hands those to a
// provider, they only reach the manual queue, so the proof that nothing was sent is in the message log (status pending_manual, never sent).
// Walks: her client-facing join form (days and hours) -> her switch in Settings -> she cancels in the app -> the offers (who got one, who did
// not, the message, the log, her one line) -> the client's offer page (take it / too late) -> and 10 simultaneous accepts of one slot.
// Never the real tenant. Exits 1 on any failure.
import fs from 'node:fs';
import { admin, BASE, REAL_TENANT } from './lib.mjs';
import { session } from './phone-session.mjs';
import { WINDOWS, offerQuietReason } from '../../lib/waitlistMatch.js';

const stateFile = process.argv[2];
const profile = process.argv[3] || 'iphone';
if (!stateFile) { console.error('usage: smart-waitlist.mjs <stateFile> <profile>'); process.exit(2); }
const db = admin();
const fails = [];
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(label); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 30000, step = 700) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }

const S = await session(profile, stateFile);
const { page, meta, ctx } = S;
if (meta.tenantId === REAL_TENANT) throw new Error('refusing the real tenant');
const tenantId = meta.tenantId;
fs.mkdirSync('report-shots', { recursive: true });
const shot = (p, name) => p.screenshot({ path: `report-shots/waitlist-${profile}-${name}.png` }).catch(() => {});
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ── the slot: today, about three hours from now, so the app's own cancel button on today's calendar is the path ──
const il = () => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
const nowIL = il();
const TODAY = `${nowIL.year}-${nowIL.month}-${nowIL.day}`;
const nowMin = Number(nowIL.hour) * 60 + Number(nowIL.minute);
let SLOT_DATE = TODAY; let SLOT = Math.ceil((nowMin + 190) / 30) * 30;
const ownerCancelInApp = SLOT <= 23 * 60 + 30;
if (!ownerCancelInApp) { const t = new Date(Date.now() + 86400000); SLOT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(t); SLOT = 10 * 60; }
const quietNow = offerQuietReason(new Date());
const wdOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const fitWin = WINDOWS.find((w) => w.from !== null && SLOT >= w.from && SLOT < w.to) || WINDOWS[0];
const missWin = WINDOWS.find((w) => w.from !== null && w.key !== fitWin.key) || WINDOWS[1];
console.log('profile', profile, 'tenant', tenantId, 'slot', SLOT_DATE, SLOT, 'quietNow', quietNow, 'window', fitWin.key, 'ownerCancelInApp', ownerCancelInApp);

const { data: svcRows } = await db.from('service_prices').select('name,duration').eq('tenant_id', tenantId).limit(1);
const SVC = svcRows?.[0]?.name || 'טיפול פנים';
const DUR = Number(svcRows?.[0]?.duration) || 45;
const tag = `${profile}-${Date.now().toString(36).slice(-4)}`;
const P = { cancel: '0500000030', ui: '0500000041', fit: '0500000042', nofit: '0500000043', optout: '0500000044' };

// ── clean the previous run's seeds (the same state file can be used again) ──
for (const t of ['slot_offers', 'waitlist', 'whatsapp_messages', 'owner_notifications', 'appointments']) await db.from(t).delete().eq('tenant_id', tenantId).then(() => {}, () => {});
await db.from('clients').delete().eq('tenant_id', tenantId).like('name', '%בדיקת המתנה%');
const settings = (await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle()).data || {};
await db.from('settings').update({ automations: { ...(settings.automations || {}), onboarding_tour_seen: true, waitlist_offers: false } }).eq('tenant_id', tenantId);

async function mkClient(name, phone, extra = {}) { const { data, error } = await db.from('clients').insert({ tenant_id: tenantId, name: `${name} בדיקת המתנה`, phone, status: 'active', ...extra }).select().single(); if (error) throw error; return data; }
async function mkAppt(c, date, minute) { const { data, error } = await db.from('appointments').insert({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: SVC, date, start_minute: minute, hour: Math.floor(minute / 60), duration: DUR, price: 200, confirmation_status: 'pending' }).select().single(); if (error) throw error; return data; }
async function mkWaiter(name, phone, extra = {}) { const { error } = await db.from('waitlist').insert({ tenant_id: tenantId, client_name: name, phone, service: SVC, status: 'waiting', notes: 'smoke', ...extra }); if (error) throw error; }
const offersFor = async (date, minute) => (await db.from('slot_offers').select('*').eq('tenant_id', tenantId).eq('slot_date', date).eq('slot_start_minute', minute).like('token', 'wl%')).data || [];
const msgsOf = async (type) => (await db.from('whatsapp_messages').select('*').eq('tenant_id', tenantId).eq('message_type', type)).data || [];
const notes = async () => (await db.from('owner_notifications').select('*').eq('tenant_id', tenantId).eq('kind', 'waitlist').order('created_at')).data || [];
const colsOk = !(await db.from('waitlist').select('pref_days').limit(1)).error;
console.log('waitlist window columns present:', colsOk);

// ── 1. her clients: the one who cancels, the people waiting ──
const cancelC = await mkClient('נועה', P.cancel);
const appt = await mkAppt(cancelC, SLOT_DATE, SLOT);
await mkClient('רות', P.optout, { marketing_consent: true, marketing_opted_out_at: new Date().toISOString() });
await mkWaiter('רות מוסרת בדיקת המתנה', P.optout);
// She asked for a different DAY (preferred_date exists today); with the migration she also has hours that miss the slot.
const otherDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 3 * 86400000));
await mkWaiter('מיכל רחוקה בדיקת המתנה', P.nofit, { preferred_date: otherDay, ...(colsOk ? { pref_days: [(wdOf(SLOT_DATE) + 1) % 7], pref_from_minute: missWin.from, pref_to_minute: missWin.to } : {}) });
await mkWaiter('הדס פנויה בדיקת המתנה', P.fit);

// ── 2. the client-facing join form, at 430px (days and hours) ──
const pub = await ctx.newPage();
await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(3500);
await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click(); await pub.waitForTimeout(1500);
const open = pub.locator('[data-testid="waitlist-open"]');
ok((await open.count()) === 1, 'the booking page offers "הצטרפי לרשימת ההמתנה" after a treatment is chosen');
await open.scrollIntoViewIfNeeded(); await open.click(); await pub.waitForTimeout(500);
ok((await overflow(pub)) <= 0, 'no sideways scroll on the join form');
await pub.fill('input[aria-label="שם"]', `שירה מצטרפת בדיקת המתנה`); await pub.fill('input[aria-label="טלפון נייד"]', P.ui);
await pub.locator(`[data-testid="wl-day-${wdOf(SLOT_DATE)}"]`).click(); await pub.locator(`[data-testid="wl-window-${fitWin.key}"]`).click();
const chipH = await pub.locator('[data-testid^="wl-day-"]').first().evaluate((e) => e.getBoundingClientRect().height);
ok(chipH >= 44, `day chips are thumb-sized (${Math.round(chipH)}px)`);
ok((await pub.locator('[data-testid^="wl-day-"][aria-pressed="true"]').count()) === 1 && (await pub.locator(`[data-testid="wl-window-${fitWin.key}"]`).getAttribute('aria-pressed')) === 'true', 'the chosen day and hours show as selected');
await pub.locator('[data-testid="waitlist-form"]').scrollIntoViewIfNeeded(); await shot(pub, '1-join-form');
await pub.locator('[data-testid="waitlist-form"] button.bk-btn').click();
await pub.waitForSelector('[data-testid="waitlist-done"]', { timeout: 20000 });
const doneText = await pub.locator('[data-testid="waitlist-done"]').innerText();
ok(/נרשמת לרשימת ההמתנה/.test(doneText), 'the form confirms she is on the list', doneText.slice(0, 60));
if (!colsOk) ok(/לא הצלחנו לשמור/.test(doneText), 'before the migration, the page says her days and hours were not saved (does not claim them)');
await shot(pub, '2-join-done'); await pub.close();
const wlRow = (await db.from('waitlist').select('*').eq('tenant_id', tenantId).eq('phone', P.ui.replace(/^0/, '0')).maybeSingle()).data;
ok(!!wlRow && wlRow.status === 'waiting', 'she is on the waiting list in the database');
if (colsOk) ok(Array.isArray(wlRow?.pref_days) && wlRow.pref_days.includes(wdOf(SLOT_DATE)) && wlRow.pref_from_minute === fitWin.from, 'her day and hours were saved');

// ── 3. her switch (Settings > הודעות), off by default ──
await S.open();
await page.locator('button[aria-label*="הגדרות"]').first().click(); await page.waitForTimeout(1200);
await page.locator('button', { hasText: /^הודעות$/ }).filter({ visible: true }).first().click(); await page.waitForTimeout(800);
const setting = page.locator('[data-testid="waitlist-offer-setting"]');
await setting.scrollIntoViewIfNeeded();
const sw = setting.locator('button[role="switch"]');
ok((await sw.getAttribute('aria-checked')) === 'false', 'the smart waitlist switch is OFF by default');
await shot(page, '3-switch-off');
await sw.click(); await page.waitForTimeout(400);
ok((await sw.getAttribute('aria-checked')) === 'true' && (await setting.locator('[data-testid="waitlist-cap"]').count()) === 1, 'turning it on shows the daily cap');
ok((await overflow(page)) <= 0, 'no sideways scroll in Settings');
await shot(page, '4-switch-on');
const saveBtn = page.locator('button:has-text("שמירה ✓")').filter({ visible: true }).first();
await saveBtn.click();
// The settings save can take a few seconds on a cold deployment: wait for the row, not for a fixed time.
const saved = await until(async () => { const a = (await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle()).data?.automations; return a?.waitlist_offers === true ? a : null; }, 20000);
ok(saved?.waitlist_offers === true, 'the switch was saved (settings.automations.waitlist_offers)');
await page.keyboard.press('Escape').catch(() => {});

// ── 4. she cancels the appointment ──
const base = { offers: (await offersFor(SLOT_DATE, SLOT)).length };
if (ownerCancelInApp) {
  await S.open();
  const visible = (sel) => page.locator(sel).filter({ visible: true });
  await visible('button[aria-label="יומן"]').first().click(); await page.waitForTimeout(1800);
  page.once('dialog', (dl) => dl.accept());
  await visible('button[aria-label="עוד פעולות"]').first().dispatchEvent('click'); await page.waitForTimeout(800);   // her appointment's menu; the floating mic can cover buttons on a phone-width screen
  await shot(page, '4b-appointment-menu');
  await page.locator('button:text-is("ביטול התור")').filter({ visible: true }).last().dispatchEvent('click'); await page.waitForTimeout(800);
  await page.locator('button:text-is("ביטול התור")').filter({ visible: true }).last().dispatchEvent('click');
  await page.waitForTimeout(1500); await shot(page, '5-cancelled');
} else {
  console.log('slot is tomorrow (late evening): cancelling through the app route as her session is not possible here; using the database + her API');
  { const { error } = await db.from('appointments').update({ confirmation_status: 'cancelled' }).eq('id', appt.id); if (error) throw error; }
  // What the app does after its undo window: her session calls the offer route for that appointment.
  const r = await page.evaluate(async (id) => { const res = await fetch('/api/waitlist/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: id }) }); return { http: res.status, body: await res.json().catch(() => null) }; }, appt.id);
  console.log('offer route ->', JSON.stringify(r));
}

if (quietNow) {
  await sleep(9000);
  ok((await offersFor(SLOT_DATE, SLOT)).length === base.offers, `quiet time (${quietNow}): no offer was made`);
  const n = await until(async () => (await notes()).find((x) => /שבת ובלילה/.test(x.body)), 15000);
  ok(!!n, 'she is told who is waiting and that nothing was sent at this hour', n?.body);
} else {
  const offers = await until(async () => { const o = await offersFor(SLOT_DATE, SLOT); return o.length >= 2 ? o : null; }, 40000); await sleep(2500);
  offers.splice(0, offers.length, ...(await offersFor(SLOT_DATE, SLOT)));
  ok(!!offers, 'two offers were made after the undo window', offers ? offers.map((o) => o.phone).join(',') : 'none');
  const phones = new Set((offers || []).map((o) => o.phone));
  ok(phones.has(P.ui) && phones.has(P.fit) && phones.size === 2, 'offered to the two who fit (the one who joined on the page, and the one with no preference)');
  ok(!phones.has(P.nofit), 'not offered to the one who asked for a different day (and, after the migration, other hours)');
  ok(!phones.has(P.optout), 'a client who asked to be removed never gets an offer');
  ok(!phones.has(P.cancel), 'the person who cancelled is not offered her own slot');
  const wm = await until(async () => { const m = await msgsOf('waitlist_offer'); return m.length >= offers.length ? m : null; }, 20000);
  ok(!!wm && wm.every((m) => m.status === 'pending_manual'), 'NOTHING WAS SENT: every offer is a test-number message that only reached the manual queue', wm ? wm.map((m) => m.status).join(',') : 'no log rows');
  const allMsgs = (await db.from('whatsapp_messages').select('status,message_type').eq('tenant_id', tenantId)).data || [];
  ok(!allMsgs.some((m) => m.status === 'sent'), 'no message of any kind has status "sent" for this tenant');
  const body = wm?.find((m) => m.recipient_phone === P.ui)?.message_body || '';
  ok(/התפנה תור/.test(body) && /\/claim\/wl[0-9a-f]{32}/.test(body) && /הסר/.test(body), 'the message: warm, the slot, her own link, how to opt out', body.slice(0, 70).replace(/\n/g, ' '));
  const n = await until(async () => (await notes()).find((x) => /הצעות לתור שהתפנה מחכות|הצעתי את התור/.test(x.title)), 20000);
  ok(!!n && /מחכות ב"הודעות מוכנות לשליחה"/.test(n.body) && !/שלחתי/.test(n.body), 'she gets one line, and it says the offers are WAITING (queued), not sent', n?.body);

  // ── 5. the client's offer page ──
  const tokUi = offers.find((o) => o.phone === P.ui).token; const tokFit = offers.find((o) => o.phone === P.fit).token;
  const cp = await ctx.newPage();
  await cp.goto(`${BASE}/claim/${tokUi}`, { waitUntil: 'domcontentloaded' });
  await cp.waitForSelector('button:has-text("אני רוצה את התור")', { timeout: 30000 });
  ok(/התפנה תור/.test(await cp.innerText('body')) && (await overflow(cp)) <= 0, 'the offer page shows the slot, no sideways scroll');
  await shot(cp, '6-offer-page');
  // the second person opens hers too, before the first taps
  const cp2 = await ctx.newPage(); await cp2.goto(`${BASE}/claim/${tokFit}`, { waitUntil: 'domcontentloaded' }); await cp2.waitForSelector('button:has-text("אני רוצה את התור")', { timeout: 30000 });
  await cp.locator('button:has-text("אני רוצה את התור")').click();
  await cp.waitForSelector('text=התור שלך', { timeout: 30000 }); await shot(cp, '7-won');
  const got = (await db.from('appointments').select('*').eq('tenant_id', tenantId).eq('date', SLOT_DATE).eq('start_minute', SLOT).neq('confirmation_status', 'cancelled')).data || [];
  ok(got.length === 1 && got[0].client_phone === P.ui, 'she got the appointment, exactly one for the slot');
  await cp2.locator('button:has-text("אני רוצה את התור")').click();
  await cp2.waitForSelector('text=התור נתפס', { timeout: 30000 });
  ok(/מצטערים|הקדימה/.test(await cp2.innerText('body')) && !/שגיאה|נכשל/.test(await cp2.innerText('body')), 'the second one is told kindly that it was taken'); await shot(cp2, '8-taken');
  await cp.close(); await cp2.close();
  const taken = await until(async () => (await msgsOf('waitlist_taken')).find((m) => m.recipient_phone === P.fit), 30000);
  ok(!!taken && /כבר נתפס/.test(taken.message_body) && taken.status === 'pending_manual', 'the other person also got the kind "it was taken" message (queued, test number)');
  const won = await until(async () => (await notes()).find((x) => /התמלא/.test(x.title)), 30000);
  ok(!!won && /תפסה את התור/.test(won.body), 'her one line: who took the slot', won?.body);
  const wlAfter = (await db.from('waitlist').select('status,phone').eq('tenant_id', tenantId)).data || [];
  ok(wlAfter.find((w) => w.phone === P.ui)?.status !== 'waiting', 'the winner is off the waiting list', wlAfter.find((w) => w.phone === P.ui)?.status);
  ok(wlAfter.find((w) => w.phone === P.fit)?.status === 'waiting', 'the other stays on the list');
  // her view of what happened
  await S.open(); await shot(page, '9-owner-home');
  await page.locator('button[aria-label*="התראות"], button[aria-label*="פעמון"]').first().click({ timeout: 4000 }).then(() => page.waitForTimeout(800)).then(() => shot(page, '10-owner-notifications')).catch(() => console.log('(no notifications button found for a screenshot)'));
}

// ── 6. ten simultaneous accepts of ONE slot ──
const CSLOT = (SLOT + 120) % 1440 || 600; const CDATE = SLOT_DATE;
await db.from('appointments').delete().eq('tenant_id', tenantId).eq('date', CDATE).eq('start_minute', CSLOT);
const exp = new Date(Date.now() + 3 * 3600000).toISOString();
const tokens = [];
for (let i = 0; i < 10; i++) {
  const token = 'wl' + Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  tokens.push(token);
  const { error } = await db.from('slot_offers').insert({ tenant_id: tenantId, slot_date: CDATE, slot_start_minute: CSLOT, slot_hour: Math.floor(CSLOT / 60), service: SVC, duration: DUR, client_name: `מתחרה ${i} בדיקת המתנה`, phone: `05000000${50 + i}`, token, status: 'sent', expires_at: exp });
  if (error) throw error;
}
const futureOk = CDATE > TODAY || CSLOT > nowMin + 130;
if (!futureOk) console.log('(the concurrency slot is too close to now for the claim route; moving it to tomorrow)');
const cDate = futureOk ? CDATE : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 86400000));
if (!futureOk) await db.from('slot_offers').update({ slot_date: cDate }).eq('tenant_id', tenantId).in('token', tokens);
const results = await Promise.all(tokens.map((t) => fetch(`${BASE}/api/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).then((r) => r.json()).catch((e) => ({ state: 'fetch-error:' + e.message }))));
const tally = results.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {});
console.log('10 simultaneous accepts ->', JSON.stringify(tally));
await sleep(2500);
const apptsAt = (await db.from('appointments').select('id,client_phone').eq('tenant_id', tenantId).eq('date', cDate).eq('start_minute', CSLOT).neq('confirmation_status', 'cancelled')).data || [];
const claimedRows = (await db.from('slot_offers').select('token').eq('tenant_id', tenantId).eq('slot_date', cDate).eq('slot_start_minute', CSLOT).eq('status', 'claimed')).data || [];
ok(apptsAt.length === 1, '10 simultaneous accepts of one slot -> exactly ONE appointment', `appointments=${apptsAt.length}`);
ok(tally.won === 1 && tally.taken === 9, 'one "won", nine "taken"', JSON.stringify(tally));
ok(claimedRows.length === 1, 'exactly one offer is marked claimed');

// the same person tapping 10 times at once
// Its own slot tomorrow at 17:00 (never in the past, whatever the hour) and a fully random token (a fixed-looking one collided with an earlier run's row).
const SOLO = 1020; /* 17:00, clear of the 10:00 slot, the 12:00 race slot and the 14:00 visit below */ const soloDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 86400000));
const soloTok = 'wl' + Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
await db.from('appointments').delete().eq('tenant_id', tenantId).eq('date', soloDate).eq('start_minute', SOLO);
{ const { error } = await db.from('slot_offers').insert({ tenant_id: tenantId, slot_date: soloDate, slot_start_minute: SOLO, slot_hour: Math.floor(SOLO / 60), service: SVC, duration: DUR, client_name: 'לוחצת בדיקת המתנה', phone: '0500000070', token: soloTok, status: 'sent', expires_at: exp }); if (error) throw error; }
const soloRes = await Promise.all(Array.from({ length: 10 }, () => fetch(`${BASE}/api/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: soloTok }) }).then((r) => r.json()).catch((e) => ({ state: 'fetch-error:' + e.message }))));
console.log('one person, 10 taps ->', JSON.stringify(soloRes.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {})));
await sleep(2000);
const soloAppts = (await db.from('appointments').select('id').eq('tenant_id', tenantId).eq('date', soloDate).eq('start_minute', SOLO).neq('confirmation_status', 'cancelled')).data || [];
ok(soloAppts.length === 1, 'one person tapping 10 times at once -> exactly ONE appointment', `appointments=${soloAppts.length} ${JSON.stringify(soloRes.map((r) => r.state || r.error))}`);

// ── 7. switch OFF: a cancellation offers nothing ──
await db.from('settings').update({ automations: { ...(saved || {}), waitlist_offers: false } }).eq('tenant_id', tenantId);
const A2 = await mkAppt(await mkClient('דנה נוספת', '0500000031'), soloDate, 840);
await mkWaiter('מחכה נוספת בדיקת המתנה', '0500000045');
const before = (await db.from('slot_offers').select('id').eq('tenant_id', tenantId).like('token', 'wl%')).data?.length || 0;
await db.from('appointments').update({ confirmation_status: 'cancelled' }).eq('id', A2.id);
const r = await fetch(`${BASE}/api/waitlist/offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: A2.id }) });
ok(r.status === 401, 'the owner route needs her session (an outsider cannot trigger it)', `HTTP ${r.status}`);
await sleep(2000);
ok(((await db.from('slot_offers').select('id').eq('tenant_id', tenantId).like('token', 'wl%')).data?.length || 0) === before, 'with the switch off, nothing is offered');

const probs = S.problems.filter((p) => !/favicon|manifest|ResizeObserver|vercel.live|Failed to load resource.*(401|404)/i.test(p));
ok(probs.length === 0, 'no console errors or 5xx during the owner walk', probs.slice(0, 3).join(' | '));
await S.browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);

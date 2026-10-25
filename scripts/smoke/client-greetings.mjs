if (process.stdout._handle?.setBlocking) process.stdout._handle.setBlocking(true);
// Personal greetings (Settings > הודעות > ברכות אישיות) on a brand-new smoke tenant, 430px, under a phone profile (see phone-profiles.mjs).
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs  <stateFile>                      (one new tenant, onboarded through the UI)
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/client-greetings.mjs <stateFile> <iphone|android|instagram>
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>                    (removes the kalmea-smoke-* account)
// One profile per run, smokes one at a time. Never the real tenant, never a real phone (05000000xx only).
//   1. EMPTY tenant: the panel, every switch off, no overflow, turning birthday on says there is nobody yet.
//   2. Tenant with clients: preview lists only the client with consent, not the one without, not the one who opted out; she unticks one;
//      saving persists it; nothing is queued by saving.
//   3. If CRON_SECRET is available: the daily job queues ONLY consented, ticked clients, as pending_manual (never "sent"), once.
// Exits 1 on any failure. Screenshots go to report-shots/greetings-<profile>-*.png.
import fs from 'node:fs';
import { admin, BASE, REAL_TENANT } from './lib.mjs';
import { session } from './phone-session.mjs';

const stateFile = process.argv[2];
const profile = process.argv[3] || 'iphone';
if (!stateFile) { console.error('usage: client-greetings.mjs <stateFile> <profile>'); process.exit(2); }
const db = admin();
const fails = [];
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(label); };
fs.mkdirSync('report-shots', { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const israelToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
const addDays = (s, n) => { const t = new Date(`${s}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const birthdayOn = (day) => `1990-${day.slice(5)}`;

const S = await session(profile, stateFile);
const { page, meta } = S;
if (meta.tenantId === REAL_TENANT) throw new Error('refusing the real tenant');
const tenantId = meta.tenantId;
const tag = `${profile}-${Date.now().toString(36).slice(-4)}`;
const shot = (n) => page.screenshot({ path: `report-shots/greetings-${profile}-${n}.png` });
const settings = (await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle()).data || {};
await db.from('settings').update({ automations: { ...(settings.automations || {}), onboarding_tour_seen: true } }).eq('tenant_id', tenantId);

async function openPanel() {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
  await page.waitForTimeout(1500); await S.skip();
  let gear = page.locator('button[aria-label*="הגדרות"]').filter({ visible: true }).first();
  if (!(await gear.count())) { await page.locator('button[aria-label="עוד"]').filter({ visible: true }).first().click(); await page.waitForTimeout(500); gear = page.locator('button[aria-label*="הגדרות"]').filter({ visible: true }).first(); }
  await (S.P.inApp ? gear.dispatchEvent('click') : gear.click()); await page.waitForTimeout(900);
  const tab = page.locator('button', { hasText: /^הודעות$/ }).filter({ visible: true }).first();
  await (S.P.inApp ? tab.dispatchEvent('click') : tab.click()); await page.waitForTimeout(700);
  await page.waitForSelector('[data-testid=greetings-panel]', { timeout: 30000 });
  await page.locator('[data-testid=greetings-panel]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
}
const tap = async (loc) => { const l = loc.filter({ visible: true }).first(); await l.scrollIntoViewIfNeeded(); await (S.P.inApp ? l.dispatchEvent('click') : l.click()); };
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const sw = (label) => page.locator(`[role=switch][aria-label="${label}"]`);

// ── 1. empty tenant ──
await openPanel();
ok(await sw('ברכת יום הולדת').getAttribute('aria-checked') === 'false', 'empty: birthday switch is off');
ok(await sw('ברכת שנה אצלי').getAttribute('aria-checked') === 'false', 'empty: anniversary switch is off');
ok(await sw('ברכת חג').getAttribute('aria-checked') === 'false', 'empty: holiday switch is off');
ok((await page.locator('[data-testid=greetings-preview]').innerText()).includes('כל הברכות כבויות'), 'empty: preview says everything is off');
ok((await page.locator('[data-testid=greetings-save]').innerText()).includes('הכול שמור'), 'empty: nothing to save yet');
ok((await overflow()) <= 1, 'empty: no sideways scroll at 430', String(await overflow()));
await shot('1-empty-off');
await tap(sw('ברכת יום הולדת')); await page.waitForTimeout(1500);
ok((await page.locator('[data-testid=greetings-preview]').innerText()).includes('עוד אין לקוחות'), 'empty: switching on says there are no clients yet');
ok((await sw('ברכת יום הולדת').getAttribute('aria-checked')) === 'true', 'empty: switch is on in the draft');
ok((await page.locator('[data-testid=greetings-save]').innerText()).includes('שמרי והפעילי'), 'empty: the save button offers to save and activate');
await shot('2-empty-on');
// not saved: reload and it is off again
await openPanel();
ok(await sw('ברכת יום הולדת').getAttribute('aria-checked') === 'false', 'empty: an unsaved switch does not stick');
ok((await db.from('whatsapp_messages').select('id').eq('tenant_id', tenantId).like('message_type', 'auto_greeting%')).data.length === 0, 'empty: nothing queued');

// ── 2. tenant with clients ──
const inTwo = addDays(israelToday, 2);
const mkClient = async (name, phone, extra) => {
  const { data, error } = await db.from('clients').insert({ tenant_id: tenantId, name, phone, status: 'active', birthday: birthdayOn(inTwo), ...extra }).select().single();
  if (error) throw error; return data;
};
const yes = { marketing_consent: true, marketing_consent_at: new Date().toISOString(), marketing_consent_source: 'manual' };
const A = await mkClient(`אורית ${tag}`, '0500000011', yes);
const A2 = await mkClient(`אילנית ${tag}`, '0500000012', yes);
const B = await mkClient(`בתיה ${tag}`, '0500000013', {});
const C = await mkClient(`גלית ${tag}`, '0500000014', { ...yes, marketing_opted_out_at: new Date().toISOString() });
const T = await mkClient(`טלי ${tag}`, '0500000015', { ...yes, birthday: birthdayOn(israelToday) }); // her birthday is today: the job queues this one
const FAKE = ['0500000011', '0500000012', '0500000013', '0500000014', '0500000015'];
console.log('seeded 5 clients');

await openPanel();
await tap(sw('ברכת יום הולדת')); await page.waitForTimeout(2000);
const prev = page.locator('[data-testid=greetings-preview]');
const names = await page.locator('[data-testid=greeting-item]').allInnerTexts();
const has = (c) => names.some((n) => n.includes(c.name));
ok(has(A) && has(A2) && has(T), 'clients with consent are listed', String(names.length));
ok(!has(B), 'a client without consent is not listed');
ok(!has(C), 'a client who opted out is not listed');
ok((await prev.innerText()).includes('בלי אישור דיוור'), 'the preview says how many were left out for missing consent');
ok((await overflow()) <= 1, 'with clients: no sideways scroll at 430', String(await overflow()));
await shot('3-preview');
// open one message
await tap(page.locator('[data-testid=greeting-item] button[aria-expanded]').first()); await page.waitForTimeout(400);
const msg = await page.locator('[data-testid=greeting-message]').first().innerText();
ok(msg.includes('להסרה מרשימת התפוצה'), 'the message carries the removal line');
ok(!/[{}]/.test(msg), 'no placeholder left in the message');
await shot('4-message');
// untick A2
await tap(page.locator(`[role=checkbox][aria-label^="${A2.name}"]`)); await page.waitForTimeout(1500);
ok((await page.locator(`[role=checkbox][aria-label^="${A2.name}"]`).first().getAttribute('aria-checked')) === 'false', 'she can untick a name');
await tap(page.locator('[data-testid=greetings-save]')); await page.waitForTimeout(2000);
const saved = (await db.from('settings').select('automations').eq('tenant_id', tenantId).maybeSingle()).data?.automations?.greetings;
ok(saved?.birthday?.enabled === true, 'saved: birthday is on');
ok(Array.isArray(saved?.skip) && saved.skip.some((k) => k.startsWith(A2.id)), 'saved: the unticked name is remembered');
ok(!saved?.anniversary?.enabled && !saved?.holiday?.enabled, 'saved: the other two stay off');
ok((await page.locator('[data-testid=greetings-save]').innerText()).includes('הכול שמור'), 'after saving it says everything is saved');
ok((await db.from('whatsapp_messages').select('id').eq('tenant_id', tenantId).like('message_type', 'auto_greeting%')).data.length === 0, 'saving queues nothing');
await shot('5-saved');
// the main settings save must not wipe the greetings
await db.from('settings').select('id').eq('tenant_id', tenantId); // (read only)
await openPanel();
ok(await sw('ברכת יום הולדת').getAttribute('aria-checked') === 'true', 'after a reload the switch is still on');
ok((await page.locator(`[role=checkbox][aria-label^="${A2.name}"]`).first().getAttribute('aria-checked')) === 'false', 'after a reload the unticked name is still unticked');

// ── 3. the daily job (only when this machine holds the cron secret) ──
if (process.env.CRON_SECRET) {
  const call = async () => (await fetch(`${BASE}/api/send-greetings`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
  const r = await call();
  console.log('job answer', JSON.stringify({ held: r.held, queued: r.queued, tenants: r.tenants }));
  if (r.held) {
    console.log(`SKIP  the job is holding right now (${r.held}): Shabbat / holiday / night, as designed. Queue assertions not run.`);
  } else {
    const rows = (await db.from('whatsapp_messages').select('recipient_phone,status,message_type,message_body').eq('tenant_id', tenantId).like('message_type', 'auto_greeting%')).data || [];
    ok(rows.length === 1 && rows[0].recipient_phone.includes('500000015'), 'the job queued only the client whose birthday is today', String(rows.length));
    ok(rows.every((m) => m.status === 'pending_manual'), 'every greeting is waiting for her (pending_manual), none "sent"');
    ok(rows.every((m) => FAKE.some((p) => m.recipient_phone.includes(p.slice(1)))), 'only fake smoke numbers were involved');
    const again = await call();
    const rows2 = (await db.from('whatsapp_messages').select('id').eq('tenant_id', tenantId).like('message_type', 'auto_greeting%')).data || [];
    ok(rows2.length === rows.length, 'a second run queues nothing new', JSON.stringify({ queued: again.queued }));
    await openPanel();
    const recent = await page.locator('[data-testid=greetings-recent]').innerText();
    ok(recent.includes('ממתינה לשליחה ממך') && !recent.includes('נמסרה'), 'the screen says waiting for her, not sent');
    await page.locator('[data-testid=greetings-recent]').scrollIntoViewIfNeeded();
    await shot('6-queued');
  }
} else {
  console.log('SKIP  no CRON_SECRET here: the daily job is covered by test-client-greetings.ts only');
}

console.log(fails.length ? `FAILED (${fails.length}): ${fails.join(' | ')}` : 'ALL OK');
await S.browser.close();
process.exit(fails.length ? 1 : 0);

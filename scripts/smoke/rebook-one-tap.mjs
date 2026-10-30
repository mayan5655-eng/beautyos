if (process.stdout._handle?.setBlocking) process.stdout._handle.setBlocking(true);
// "קבעי לה שוב" on a brand-new smoke tenant, 430px, under a phone profile (see phone-profiles.mjs).
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs  <stateFile>                      (one new tenant, onboarded through the UI)
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/rebook-one-tap.mjs <stateFile> <iphone|android|instagram>
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>                    (removes the kalmea-smoke-* account)
// One profile per run, smokes one at a time. Seeds its own clients and visits through the admin client (never the real tenant, never a
// real client's phone: 05000000xx), then walks the UI: client card -> proposal -> one tap -> appointment in the DB -> the message is
// OFFERED (a wa.me link in her own WhatsApp, or kept in the queue) and NOTHING is sent. Exits 1 on any failure.
import fs from 'node:fs';
import { admin, BASE, REAL_TENANT } from './lib.mjs';
import { session } from './phone-session.mjs';

const stateFile = process.argv[2];
const profile = process.argv[3] || 'iphone';
if (!stateFile) { console.error('usage: rebook-one-tap.mjs <stateFile> <profile>'); process.exit(2); }
const db = admin();
const fails = [];
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(label); };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const wd = (iso) => new Date(`${iso}T12:00:00`).getDay();
const today = new Date();
const TODAY = ymd(today);

const S = await session(profile, stateFile);
const { page, meta } = S;
if (meta.tenantId === REAL_TENANT) throw new Error('refusing the real tenant');
const tenantId = meta.tenantId;
const tag = `${profile}-${Date.now().toString(36).slice(-4)}`;

const settings = (await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle()).data || {};
const hoursFor = (d) => {
  const bh = settings.business_hours;
  if (bh && Object.prototype.hasOwnProperty.call(bh, String(d))) { const v = bh[String(d)]; return v ? { open: +v.open, close: +v.close } : null; }
  const days = String(settings.working_days ?? '0,1,2,3,4,5').split(',').map(Number);
  return days.includes(d) ? { open: +settings.working_hours_start || 9, close: +settings.working_hours_end || 18 } : null;
};
// The first-visit tour is not what this smoke tests (its card floats over everything): mark it seen, as she would after her first day.
await db.from('settings').update({ automations: { ...(settings.automations || {}), onboarding_tour_seen: true } }).eq('tenant_id', tenantId);
const closedDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !hoursFor(d));
console.log('profile', profile, 'tenant', tenantId, 'closed weekdays', closedDays.join(',') || 'none');

async function mkClient(name, phone) {
  const { data, error } = await db.from('clients').insert({ tenant_id: tenantId, name, phone, status: 'active' }).select().single();
  if (error) throw error; return data;
}
async function mkAppt(c, date, minute, duration, service = 'טיפול פנים') {
  const { error } = await db.from('appointments').insert({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service, date, start_minute: minute, hour: Math.floor(minute / 60), duration, price: 200, confirmation_status: 'pending' });
  if (error) throw error;
}
const apptsOf = async (c) => (await db.from('appointments').select('*').eq('tenant_id', tenantId).eq('client_id', c.id).order('date')).data || [];
const allBusy = async () => (await db.from('appointments').select('date,start_minute,hour,duration,confirmation_status').eq('tenant_id', tenantId)).data || [];
const msgs = async (c) => (await db.from('whatsapp_messages').select('status,message_type,message_body').eq('tenant_id', tenantId).eq('recipient_phone', c.phone)).data || [];

// The service she sells (from onboarding) and its length.
const { data: svcRows } = await db.from('service_prices').select('name,duration').eq('tenant_id', tenantId).limit(1);
const SVC = svcRows?.[0]?.name || 'טיפול פנים';
const DUR = Number(svcRows?.[0]?.duration) || 45;

// ── seed ──
// R: a regular, 3 weeks apart, last visit 3 days ago at 10:00 -> next one ~18 days out.
const R = await mkClient(`רינת ${tag}`, '0500000002');
for (const back of [66, 45, 24, 3]) await mkAppt(R, ymd(addDays(today, -back)), 600, DUR, SVC);
// E: a client with no history at all.
const E = await mkClient(`אילנה ${tag}`, '0500000003');
// F: finished appointment today at 11:00 (the calendar button).
const F = await mkClient(`פנינה ${tag}`, '0500000004');
await mkAppt(F, TODAY, 660, DUR, SVC);
// G: no phone -> no message to offer.
const G = await mkClient(`גילה ${tag}`, '');
await mkAppt(G, ymd(addDays(today, -2)), 600, DUR, SVC);

console.log('seeded'); await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500); await quickSkip(); await page.screenshot({ path: `report-shots/rebook-${profile}-0-open.png` }).catch(() => {}); console.log('opened');

// the first-visit tour card and friends: dismissed the way she would, without waiting 30s per try
async function quickSkip() { for (let i = 0; i < 4; i++) { const k = page.locator('button:has-text("דלגי"), button:has-text("אחר כך")').filter({ visible: true }).first(); if (!(await k.count())) break; await k.click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(300); } }
async function openClientCard(name) {
  await page.locator('button[aria-label="לקוחות"]').filter({ visible: true }).first().click(); await page.waitForTimeout(2200); await quickSkip();
  await page.fill('input[placeholder^="חיפוש"]', name).catch(() => {}); await page.waitForTimeout(500);
  // In Instagram / Facebook the install banner floats over the bottom of the list (z-index 60): tap through it with a DOM click, like a thumb that scrolled the row clear of it.
  const row = page.getByText(name, { exact: false }).filter({ visible: true }).first();
  if (S.P.inApp) await row.dispatchEvent('click'); else await row.click();
  await page.waitForTimeout(900);
}
const clickCard = async () => { const b = page.locator('[data-testid=rebook-client]').filter({ visible: true }).first(); await (S.P.inApp ? b.dispatchEvent('click') : b.click()); };
const closeSheets = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };

// independent checks of a booked slot against the DB, not against the proposal code
async function checkSlot(c, label) {
  const rows = (await apptsOf(c)).filter((a) => a.date > TODAY || (a.date === TODAY && a.confirmation_status === 'pending' && a.start_minute !== 660));
  const mine = rows[rows.length - 1];
  ok(!!mine, `${label}: an appointment was created`);
  if (!mine) return null;
  const h = hoursFor(wd(mine.date));
  ok(mine.date > TODAY, `${label}: in the future`, mine.date);
  ok(!!h, `${label}: on a working day`, `weekday ${wd(mine.date)}`);
  ok(h && mine.start_minute >= h.open * 60 && mine.start_minute + mine.duration <= h.close * 60, `${label}: inside that day's hours`, `${mine.start_minute}`);
  const others = (await allBusy()).filter((a) => a.date === mine.date && a.confirmation_status !== 'cancelled');
  const overlap = others.filter((a) => !(a.start_minute === mine.start_minute && a.duration === mine.duration) && mine.start_minute < (a.start_minute ?? a.hour * 60) + a.duration && (a.start_minute ?? a.hour * 60) < mine.start_minute + mine.duration);
  ok(overlap.length === 0, `${label}: overlaps nothing`);
  return mine;
}

// ── 1. regular client from the client card ──
console.log('card…'); await openClientCard(R.name); console.log('card open');
const btn = page.locator('[data-testid=rebook-client]').filter({ visible: true }).first();
ok(await btn.count() > 0, 'client card has "קבעי לה שוב"');
await page.screenshot({ path: `report-shots/rebook-${profile}-1-card.png` }).catch(() => {});
await (S.P.inApp ? btn.dispatchEvent('click') : btn.click()); await page.waitForSelector('[data-testid=rebook-proposal]', { timeout: 15000 });
const when = await page.locator('[data-testid=rebook-when]').innerText(); const why = await page.locator('[data-testid=rebook-why]').innerText();
if (S.P.inApp) { await page.waitForTimeout(1200); await page.locator('.tour-card button:has-text("דלגי")').click({ force: true, timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); const info = await page.evaluate(() => { const b = document.querySelector('[data-testid=rebook-confirm]').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { inSheet: !!e && !!e.closest('[data-testid=rebook-sheet]'), banner: (document.querySelector('[data-install-banner]')||{style:{}}).constructor.name + ' ' + (document.querySelector('[data-install-banner]') ? getComputedStyle(document.querySelector('[data-install-banner]')).display : 'absent'), html: e ? e.outerHTML.slice(0, 160) : '', at: e ? e.tagName + ' ' + String(e.className || e.getAttribute('aria-label') || '').slice(0, 60) : 'none', rect: [b.x, b.y, b.width, b.height].map(Math.round).join(',') }; }); ok(info.inSheet, 'in-app browser: the sheet confirm button is not covered by the open-in-Safari banner', JSON.stringify(info)); }
console.log('proposal:', when.replace(/\n/g, ' '), '|', why);
ok(/כל|שבועות|קצב/.test(why) && !/ברירת מחדל/.test(why), 'her rhythm is named, not a default', why);
await page.screenshot({ path: `report-shots/rebook-${profile}-2-proposal.png` }).catch(() => {});
S.clear && await S.clear();
await page.locator('[data-testid=rebook-confirm]').click(); await page.waitForSelector('[data-testid=rebook-booked]', { timeout: 20000 });
const bookedR = await checkSlot(R, 'regular client');
ok(bookedR && bookedR.start_minute === 600, 'same time of day as her usual 10:00 when free', bookedR && String(bookedR.start_minute));
const expectR = ymd(addDays(today, -3 + 21));
ok(bookedR && bookedR.date >= expectR, 'not before last visit + her 21-day rhythm (later only when that day is closed or full)', `${bookedR && bookedR.date} >= ${expectR}`);
await page.waitForSelector('[data-testid=rebook-wa]', { timeout: 15000 });
const href = await page.locator('[data-testid=rebook-wa]').getAttribute('href');
ok(/^https:\/\/wa\.me\/972500000002\?text=/.test(href || ''), 'WhatsApp link is a real wa.me link to HER client', (href || '').slice(0, 40));
const text = decodeURIComponent((href || '').split('text=')[1] || '');
ok(/שלום/.test(text) && /אשר|לאשר/.test(text) && /confirm\?id=/.test(text) && /action=cancel/.test(text), 'message has greeting, confirm and cancel links');
ok(!/נשלח|שלחתי לך הודעה/.test(text), 'message does not claim anything was sent');
ok((await msgs(R)).length === 0, 'preview writes nothing to the message log');
await page.screenshot({ path: `report-shots/rebook-${profile}-3-booked-message.png` }).catch(() => {});
const evs = S.events ? await S.events() : [];
ok(!evs.some((e) => /POST \/api\/(send|whatsapp|send-reminder)/.test(e)), 'no send call was made', evs.filter((e) => e.startsWith('api')).join(' ; ').slice(0, 200));
// the wa link: a real anchor, opens from the tap (no await in between)
const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null), page.locator('[data-testid=rebook-wa]').click()]);
ok(true, 'WhatsApp link tapped', pop ? 'new tab opened' : 'handled by the profile (in-app/standalone: same-tab or blocked)');
if (pop) await pop.close().catch(() => {});
await page.waitForTimeout(800);
ok((await msgs(R)).filter((m) => m.status === 'sent').length === 0, 'nothing marked sent in the message log after opening WhatsApp');
// queue it
const qResp = page.waitForResponse((r) => /rebook-message/.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
await page.locator('[data-testid=rebook-queue]').click(); const qr = await qResp; console.log('queue response:', qr ? qr.status() + ' ' + (await qr.text()).slice(0, 200) : 'none'); await page.waitForTimeout(800);
const qm = await msgs(R);
ok(qm.length === 1 && qm[0].status === 'pending_manual', 'kept in "הודעות מוכנות לשליחה" as pending_manual (not sent)', JSON.stringify(qm.map((m) => m.status)));
await page.screenshot({ path: `report-shots/rebook-${profile}-4-queued.png` }).catch(() => {});
await page.locator('[data-testid=rebook-done]').click(); await page.waitForTimeout(500);
await closeSheets();

// ── 2. a client with no history: default, labelled as one ──
await openClientCard(E.name);
await clickCard();
await page.waitForTimeout(800);
// no appointment to anchor on and no service to repeat -> she picks the treatment
const svcSel = page.locator('[data-testid=rebook-service]');
if (await svcSel.count()) { await svcSel.selectOption({ index: 1 }); await page.waitForTimeout(500); }
await page.waitForSelector('[data-testid=rebook-proposal]', { timeout: 15000 });
const whyE = await page.locator('[data-testid=rebook-why]').innerText();
ok(/ברירת מחדל/.test(whyE), 'no history: the default is named as a default', whyE);
await page.screenshot({ path: `report-shots/rebook-${profile}-5-nohistory.png` }).catch(() => {});
await page.locator('[data-testid=rebook-confirm]').click(); await page.waitForSelector('[data-testid=rebook-booked]', { timeout: 20000 });
await checkSlot(E, 'no-history client');
await page.locator('[data-testid=rebook-done]').click(); await page.waitForTimeout(500); await closeSheets();

// ── 3. a client without a phone: booked, nothing to send ──
await openClientCard(G.name);
await clickCard();
await page.waitForSelector('[data-testid=rebook-proposal]', { timeout: 15000 });
await page.locator('[data-testid=rebook-confirm]').click(); await page.waitForSelector('[data-testid=rebook-booked]', { timeout: 20000 });
ok(await page.locator('[data-testid=rebook-nophone]').count() === 1 && await page.locator('[data-testid=rebook-wa]').count() === 0, 'no phone: says so, offers no WhatsApp');
await page.locator('[data-testid=rebook-done]').click(); await page.waitForTimeout(500); await closeSheets();

// ── 4. the finished appointment, from the calendar ──
await page.locator('button[aria-label="יומן"]').filter({ visible: true }).first().click(); await page.waitForTimeout(1500);
const ab = page.locator('[data-testid=rebook-appt]').filter({ visible: true }).first();
ok(await ab.count() > 0, 'finished appointment has "קבעי לה שוב"');
if (await ab.count()) {
  await ab.click(); await page.waitForSelector('[data-testid=rebook-proposal]', { timeout: 15000 });
  await page.screenshot({ path: `report-shots/rebook-${profile}-6-appt.png` }).catch(() => {});
  await page.locator('[data-testid=rebook-confirm]').click(); await page.waitForSelector('[data-testid=rebook-booked]', { timeout: 20000 });
  const bF = await checkSlot(F, 'finished appointment');
  ok(bF && bF.start_minute === 660, 'same time of day as the visit just finished (11:00)', bF && String(bF.start_minute));
  await page.locator('[data-testid=rebook-done]').click(); await page.waitForTimeout(400);
}

// ── 5. no pending nudges to real people: nothing in the whole tenant is "sent" ──
const sent = (await db.from('whatsapp_messages').select('id').eq('tenant_id', tenantId).in('status', ['sent', 'delivered'])).data || [];
ok(sent.length === 0, 'tenant-wide: no WhatsApp message left as sent');
ok(S.problems.filter((p) => !/favicon|ResizeObserver|LockManager|Sentry/.test(p)).length === 0, 'no console or server errors', S.problems.slice(0, 3).join(' | '));

await S.browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);

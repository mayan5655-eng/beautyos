if (process.stdout._handle?.setBlocking) process.stdout._handle.setBlocking(true);
// "היום שלי" on the dashboard, 430px, under a phone profile (see phone-profiles.mjs).
//   node --env-file=.env.local scripts/smoke/phone-setup.mjs  <stateFile>                      (one new tenant, onboarded through the UI)
//   SMOKE_BASE=<preview> node --env-file=.env.local scripts/smoke/my-day-card.mjs <stateFile> <iphone|android|instagram> [nails]
//   nails: the tenant becomes a nails-only business (settings.business_fields = ['nails']) and every visit is a nails service.
//   node --env-file=.env.local scripts/smoke/phone-teardown.mjs <stateFile>                    (removes the kalmea-smoke-* account)
// One profile per run. Phase 1 empties the smoke tenant (admin client, smoke tenant only) and checks the brand-new dashboard is calm: no
// "היום שלי" card on top of the welcome card, first-day checklist still there. Phase 2 seeds a real morning (visits with a gap, a visit
// without payment, tomorrow's unconfirmed clients, unanswered leads, all on 05000000xx numbers) and walks the card: order, free time,
// one action per row, the reminder opens WhatsApp from the tap, the cashier opens on the right visit, the lead is a tel: link,
// and NOTHING is sent. Phase 3 turns the flag off and checks the old list is back. Exits 1 on any failure.
import fs from 'node:fs';
import { admin, BASE, REAL_TENANT } from './lib.mjs';
import { session } from './phone-session.mjs';

const stateFile = process.argv[2];
const profile = process.argv[3] || 'iphone';
const NAILS = process.argv[4] === 'nails';
const SERVICE = NAILS ? 'לק ג׳ל' : 'טיפול פנים';
if (!stateFile) { console.error('usage: my-day-card.mjs <stateFile> <profile>'); process.exit(2); }
const db = admin();
const fails = [];
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(label); };
fs.mkdirSync('report-shots', { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const realNow = new Date();
// Phase 2 needs three visits still ahead today (about four hours of day). Late in the evening the page's clock is pinned to 08:00
// today instead (Playwright clock), so the smoke runs the same at any hour.
const LATE = realNow.getHours() * 60 + realNow.getMinutes() > 17 * 60;
const now = LATE ? new Date(realNow.getFullYear(), realNow.getMonth(), realNow.getDate(), 8, 0) : realNow;
const TODAY = ymd(now), TOMORROW = ymd(addDays(now, 1));
const nowMin = now.getHours() * 60 + now.getMinutes();

const S = await session(profile, stateFile);
const { page, meta } = S;
if (meta.tenantId === REAL_TENANT) throw new Error('refusing the real tenant');
const tenantId = meta.tenantId;
if (LATE) { await page.clock.setFixedTime(now); console.log('late run: page clock pinned to', now.toString()); }
const tag = `${profile}${NAILS ? 'n' : ''}-${Date.now().toString(36).slice(-4)}`;

const settings0 = (await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle()).data || {};
const setAutomations = (patch) => db.from('settings').update({ automations: { ...(settings0.automations || {}), onboarding_tour_seen: true, ...patch } }).eq('tenant_id', tenantId);
await setAutomations({});
if (NAILS) { const { error } = await db.from('settings').update({ business_fields: ['nails'] }).eq('tenant_id', tenantId); if (error) throw error; }
console.log('business:', NAILS ? 'nails only' : 'as onboarded');

// every call the page makes that could send something
const sendCalls = [];
page.on('request', (r) => { const u = r.url(); if (r.method() !== 'GET' && /\/api\/(send|whatsapp|messages|reminder|green)/.test(u)) sendCalls.push(`${r.method()} ${new URL(u).pathname}`); });

async function wipe() {
  for (const t of ['receipts', 'appointments', 'leads', 'whatsapp_messages', 'clients']) {
    const { error } = await db.from(t).delete().eq('tenant_id', tenantId);
    if (error && !/does not exist|schema cache/.test(error.message)) console.log('wipe', t, error.message);
  }
}
async function openDash() {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await S.skip();
}
const noHScroll = async (label) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scroll at 430px`);

// ───────── Phase 1: brand-new empty tenant ─────────
await wipe();
await openDash();
ok(await page.locator('[data-testid=my-day-card]').count() === 0, 'empty tenant: no "היום שלי" card piled on the welcome card');
ok(await page.getByText('ברוכה הבאה').first().isVisible().catch(() => false), 'empty tenant: the warm welcome card is there');
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-1-empty.png`, fullPage: false }).catch(() => {});
await noHScroll('empty tenant');

// A tenant with a client but nothing today: the card is there, calm, no needs.
const mkClient = async (name, phone) => { const { data, error } = await db.from('clients').insert({ tenant_id: tenantId, name, phone, status: 'active' }).select().single(); if (error) throw error; return data; };
const mkAppt = async (c, date, minute, duration, extra = {}) => {
  const { data, error } = await db.from('appointments').insert({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: SERVICE, date, start_minute: minute, hour: Math.floor(minute / 60), duration, price: 200, confirmation_status: 'confirmed', ...extra }).select().single();
  if (error) throw error; return data;
};
const early = await mkClient(`אורנה ${tag}`, '0500000001');
await openDash();
ok(await page.locator('[data-testid=my-day-card]').count() === 1, 'a tenant with a client but no visits today: the card shows');
ok(/אין תורים היום/.test(await page.locator('[data-testid=my-day-headline]').innerText()), 'quiet day is said warmly', await page.locator('[data-testid=my-day-headline]').innerText());
ok(await page.locator('[data-testid^=my-day-need-]').count() === 0, 'quiet day: nothing is asked of her');
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-2-quiet.png` }).catch(() => {});
await noHScroll('quiet day');

// ───────── Phase 2: a real morning ─────────
// Three visits today with a free stretch between the first two; one visit that already ended, with no payment.
const base = Math.max(nowMin + 90, 9 * 60); // first upcoming visit
const v1 = await mkClient(`דנה ${tag}`, '0500000002');
const v2 = await mkClient(`לאה ${tag}`, '0500000003');
const v3 = await mkClient(`מיה ${tag}`, '0500000004');
const gapStart = base + 60, v2start = gapStart + 90; // 90 free minutes
const a1 = await mkAppt(v1, TODAY, base, 60);
const a2 = await mkAppt(v2, TODAY, v2start, 45, { confirmation_status: 'pending' });
const a3 = await mkAppt(v3, TODAY, v2start + 45 + 10, 30); // back to back, no gap line
// ended earlier (yesterday, so it is "ended" whatever time the smoke runs) and unpaid
const unpaid = await mkClient(`נירית ${tag}`, '0500000005');
const aUnpaid = await mkAppt(unpaid, ymd(addDays(now, -1)), 600, 60);
// tomorrow: one unconfirmed never reminded, one confirmed (must not appear), one without a phone (must not appear)
const t1 = await mkClient(`שרה ${tag}`, '0500000006');
const t2 = await mkClient(`רותי ${tag}`, '0500000007');
const t3 = await mkClient(`חנה ${tag}`, '');
const aT1 = await mkAppt(t1, TOMORROW, 11 * 60, 45, { confirmation_status: 'pending', confirmation_sent: false });
await mkAppt(t2, TOMORROW, 12 * 60, 45, { confirmation_status: 'confirmed' });
await mkAppt(t3, TOMORROW, 13 * 60, 45, { confirmation_status: 'pending' });
// leads: one unanswered with a number, one closed (must not appear)
const L1 = `לידה ${tag}`;
await db.from('leads').insert([
  { tenant_id: tenantId, name: L1, phone: '0500000008', status: 'new', source: 'אינסטגרם', service_interest: 'גבות', received_at: new Date(now.getTime() - 26 * 3600e3).toISOString() },
  { tenant_id: tenantId, name: `סגורה ${tag}`, phone: '0500000009', status: 'closed', source: 'אינסטגרם', received_at: new Date(now.getTime() - 26 * 3600e3).toISOString() },
]);

await openDash();
const card = page.locator('[data-testid=my-day-card]');
ok(await card.count() === 1, 'seeded: the card is on the dashboard');
const rows = page.locator('[data-testid=my-day-row]');
const rowTexts = await rows.allInnerTexts();
console.log(rowTexts.map((t) => t.replace(/\n+/g, ' | ')).join('\n'));
ok(rowTexts.length >= 3 && rowTexts[0].includes('דנה') && rowTexts[1].includes('לאה') && rowTexts[2].includes('מיה'), 'today\'s visits in time order, with names', String(rowTexts.length));
ok(rowTexts[0].includes(`${pad(Math.floor(base / 60))}:${pad(base % 60)}`), 'the first visit shows its time');
ok(rowTexts[0].includes(SERVICE), 'the service is shown', SERVICE);
if (NAILS) ok(!/טיפול פנים|קוסמטי/.test(await card.innerText()), 'nails-only: no cosmetics wording on the card');
ok(/שעה וחצי/.test(await card.innerText()) && /עד לאה/.test(await card.innerText()), 'the free 90 minutes before לאה is said in words');
ok(await page.locator('[data-testid=my-day-gap]').count() === 1, 'only one gap line (back-to-back visits get none)');
ok(/3 תורים היום/.test(await page.locator('[data-testid=my-day-headline]').innerText()), 'headline counts the visits', await page.locator('[data-testid=my-day-headline]').innerText());
ok((await rows.first().getAttribute('data-state')) === 'next' || (await rows.first().getAttribute('data-state')) === 'now', 'the coming visit is marked');

const needs = page.locator('[data-testid^=my-day-need-]');
const kinds = await needs.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('my-day-need-', '')));
console.log('needs:', kinds.join(','));
ok(kinds.join(',') === 'pay,remind,call', 'needs in order: payment, tomorrow\'s reminder, the lead (the confirmed and no-phone ones are left out)', kinds.join(','));
const btns = page.locator('[data-testid=my-day-action]');
ok(await btns.count() === kinds.length, 'exactly one action button per row');
const minH = await btns.evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)));
ok(minH >= 44, 'every action is at least 44px tall for a thumb', String(Math.round(minH)));
ok(await page.locator('[data-testid=my-day-need-call] a[href^="tel:"]').getAttribute('href') === 'tel:0500000008', 'the lead\'s action is a real tel: link');
const full = await card.innerText();
// "עוד לא נשלחה לה תזכורת" is honest; any other "sent" (or "did not pay") is a claim the card must not make.
ok(!/שילמ/.test(full) && !/נשלח/.test(full.replace(/לא נשלחה/g, '')), 'wording never says "did not pay" or "sent"');
await card.scrollIntoViewIfNeeded();
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-3-card.png` }).catch(() => {});
await card.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-3b-card-only.png` }).catch(() => {});
await noHScroll('seeded');
// banners sit above the bottom bar, the card is not hidden behind anything on top
const top = await page.evaluate(() => { const c = document.querySelector('[data-testid=my-day-card]').getBoundingClientRect(); const e = document.elementFromPoint(c.x + c.width / 2, Math.max(c.y + 10, 5)); return !!e && !!e.closest('[data-testid=my-day-card]'); });
ok(top, 'nothing floats over the top of the card');

// pay: opens the cashier on that visit
S.clear && await S.clear();
const payBtn = page.locator('[data-testid=my-day-need-pay] [data-testid=my-day-action]');
await (S.P.inApp ? payBtn.dispatchEvent('click') : payBtn.click());
await page.waitForTimeout(1200);
const cashierText = await page.locator('body').innerText();
ok(cashierText.includes(`נירית ${tag}`) && /קופה|תשלום/.test(cashierText), 'pay: the cashier opens on that client');
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-4-cashier.png` }).catch(() => {});
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
const closeX = page.locator('button[aria-label="סגירה"], button[aria-label="סגור"]').filter({ visible: true }).first();
if (await closeX.count()) await closeX.click({ force: true }).catch(() => {});
await openDash();

// remind: from inside the tap, WhatsApp opens with the written message; marked as prepared; nothing is sent by the server
const remBtn = page.locator('[data-testid=my-day-need-remind] [data-testid=my-day-action]');
ok(/תזכורת בוואטסאפ/.test(await remBtn.innerText()), 'remind: the label says what it does');
const [pop] = await Promise.all([
  page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
  (S.P.inApp ? remBtn.dispatchEvent('click') : remBtn.click()),
]);
await page.waitForTimeout(2500);
const evs = S.events ? await S.events() : [];
// The window is opened blank inside the tap and then pointed at WhatsApp (phone-profiles records that as popup.location).
const waEv = evs.find((e) => /^(window\.open|popup\.location)/.test(e) && /wa\.me|whatsapp/.test(e)) || '';
const opened = !!pop || !!waEv;
ok(opened && !/BLOCKED/.test(evs.filter((e) => e.startsWith('window.open')).join(' ')), 'remind: WhatsApp was opened from the tap', pop ? pop.url().slice(0, 60) : evs.filter((e) => !e.startsWith('api')).join(' ; ').slice(0, 200));
if (waEv) ok(/972500000006|0500000006/.test(waEv), "remind: aimed at HER client's number", waEv.slice(0, 90));
if (pop) { ok(/wa\.me\/972500000006/.test(pop.url()) || pop.url() === 'about:blank' || /whatsapp/.test(pop.url()), 'remind: aimed at HER client\'s number', pop.url().slice(0, 70)); await pop.close().catch(() => {}); }
const aT1now = (await db.from('appointments').select('confirmation_sent').eq('id', aT1.id).single()).data;
ok(aT1now?.confirmation_sent === true || !opened, 'remind: marked as prepared once WhatsApp opened');
ok((await db.from('whatsapp_messages').select('id').eq('tenant_id', tenantId).in('status', ['sent', 'delivered'])).data?.length === 0, 'nothing in the whole tenant is marked sent');
ok(sendCalls.filter((c) => /send|green/.test(c)).length === 0, 'the page made no server-side send call', sendCalls.join(' ; '));
await page.waitForTimeout(800);
ok(/הזכירי שוב/.test(await page.locator('[data-testid=my-day-need-remind]').first().innerText().catch(() => '')) || (await page.locator('[data-testid=my-day-need-remind]').count()) === 0, 'after the reminder the row says it was prepared');
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-5-after-remind.png` }).catch(() => {});

// ───────── Phase 3: the flag ─────────
await setAutomations({ feature_flags: { my_day: false } });
await openDash();
ok(await page.locator('[data-testid=my-day-card]').count() === 0, 'flag off: the card is gone');
ok(await page.getByText('אין תורים להיום').count() + (await page.getByText(`דנה ${tag}`).count()) > 0, 'flag off: the old today list is back');
await page.screenshot({ path: `report-shots/myday-${profile}${NAILS ? '-nails' : ''}-6-flag-off.png` }).catch(() => {});
await setAutomations({ feature_flags: {} });

ok(S.problems.filter((p) => !/favicon|ResizeObserver|LockManager|Sentry|vercel\.live/.test(p)).length === 0, 'no console or server errors', S.problems.slice(0, 3).join(' | '));
await S.browser.close();
console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);

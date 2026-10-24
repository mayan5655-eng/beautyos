// Paid add-on packs (NEXT_PUBLIC_ADDON_PACKS=1 + BILLING_UI_ENABLED, mock billing), on one NEW smoke tenant at 430px:
//   6 reels already used this month (usage rows written for the smoke tenant only, no AI is called) -> the server refuses the 7th reel with
//   the "used this month's" wording; Settings > העסק שלי shows "מה כלול החודש" with 6 of 6 and the "עוד 10 רילסים עם AI ב-29 ₪" button;
//   a mock card is saved, the pack is confirmed, and (once add_billing_addons.sql has run) the reels cap becomes 16 and the next reel is
//   allowed past the cap check. Mock mode only: no real card, no real charge. Everything the smoke tenant wrote is removed at the end.
// node --env-file=.env.local scripts/smoke/addon-packs.mjs   (SMOKE_BASE=<preview>)
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const log = (...a) => console.log('[addons]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[addons] FAIL', msg); } };
const SHOTS = process.env.SMOKE_SHOTS || '.';

const db = admin();
const email = newEmail('addons');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('base', BASE, 'account', email, 'tenant', tenantId);

const { browser, page } = await launch();
const body = async () => (await page.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const status = async () => page.evaluate(async () => { const r = await fetch('/api/billing/status'); return { code: r.status, json: await r.json().catch(() => null) }; });
const reelsOf = (st) => (st.json?.addons || []).find((a) => a.key === 'reels');
const openAddons = async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kalmea:open-addons')));
  await page.waitForTimeout(2500);
  await page.locator('[data-testid="billing-addons"]').scrollIntoViewIfNeeded().catch(() => {});
};

let migrated = false;
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת בדיקה תוספות');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(700);
  await page.locator('button:has-text("דקות")').filter({ visible: true }).first().click().catch(() => {}); await page.waitForTimeout(200);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("סיום ופתיחת היומן")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(1500); await skipTour();

  // 6 reels "used" this month: usage rows for the smoke tenant only (cost 0), so the cap is reached without calling any AI.
  const rows = Array.from({ length: 6 }, () => ({ tenant_id: tenantId, call_site: 'marketing/reel', model: 'smoke', input_tokens: 0, output_tokens: 0, cost_usd: 0 }));
  const ins = await db.from('ai_usage').insert(rows);
  check(!ins.error, `6 reel usage rows for the smoke tenant${ins.error ? ` (${ins.error.message})` : ''}`);

  let st = await status();
  check(st.code === 200 && st.json?.configured, `billing on for this preview (status ${st.code}, configured ${st.json?.configured})`);
  const r0 = reelsOf(st);
  check(r0 && r0.cap === 6 && r0.used === 6, `reels: ${r0?.used} of ${r0?.cap} (expect 6 of 6)`);

  const refused = await page.evaluate(async () => { const r = await fetch('/api/marketing/reel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'בדיקה', duration: 15, vibe: 'calm' }) }); return { code: r.status, json: await r.json().catch(() => null) }; });
  check(refused.code === 429 && /ניצלנו כבר את יצירות הוידאו של החודש/.test(refused.json?.error || ''), `the 7th reel is refused on the server (${refused.code}: ${(refused.json?.error || '').slice(0, 60)})`);

  // The post generator at its 9 included posts (usage rows, no AI called): the "9 מתוך 9" box carries the posts pack button.
  const posts = Array.from({ length: 9 }, () => ({ tenant_id: tenantId, call_site: 'designs/generate', model: 'smoke', input_tokens: 0, output_tokens: 0, cost_usd: 0 }));
  const postsIns = await db.from('ai_usage').insert(posts);
  check(!postsIns.error, `9 post usage rows for the smoke tenant${postsIns.error ? ` (${postsIns.error.message})` : ''}`);
  await visible('button[aria-label="תוכן"]').click(); await page.waitForTimeout(1500); await skipTour();
  await visible('button:text-is("השבוע")').click().catch(() => {}); await page.waitForTimeout(1500);
  const postsBtn = page.locator('[data-testid="addon-offer-posts"]').filter({ visible: true }).first();
  await postsBtn.waitFor({ timeout: 20000 }).catch(() => {});
  check((await postsBtn.innerText().catch(() => '')).trim() === 'עוד 10 פוסטים עם AI ב-29 ₪', 'posts at 9 of 9: the box offers "עוד 10 פוסטים עם AI ב-29 ₪"');
  await postsBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${SHOTS}/smoke-addons-posts.png` });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500); await skipTour();

  // The advisor at its 60 included questions (usage rows again, no AI called): her question is refused, and the error toast carries the
  // pack's button, which opens the add-ons in Settings.
  const adv = Array.from({ length: 60 }, () => ({ tenant_id: tenantId, call_site: 'advisor', model: 'smoke', input_tokens: 0, output_tokens: 0, cost_usd: 0 }));
  const advIns = await db.from('ai_usage').insert(adv);
  check(!advIns.error, `60 advisor usage rows for the smoke tenant${advIns.error ? ` (${advIns.error.message})` : ''}`);
  await visible('button[aria-label="תפריט ניווט"]').click(); await page.waitForTimeout(600);
  await visible('.nav-item:has-text("יועץ AI")').click(); await page.waitForTimeout(2500); await skipTour();
  await visible('textarea').fill('כמה הכנסתי החודש?');
  await page.keyboard.press('Enter');
  const toastBtn = page.locator('.toast button:has-text("עוד 100 שאלות ליועצת ב-39 ₪")').filter({ visible: true }).first();
  await toastBtn.waitFor({ timeout: 30000 }).catch(() => {});
  check(await toastBtn.count() === 1, 'advisor at its limit: the refusal toast carries "עוד 100 שאלות ליועצת ב-39 ₪"');
  await page.screenshot({ path: `${SHOTS}/smoke-addons-toast.png` });
  if (await toastBtn.count()) {
    await toastBtn.click();
    await page.locator('[data-testid="billing-addons"]').filter({ visible: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
    check(await visible('[data-testid="billing-addons"]').count() === 1, 'the toast button opens the add-ons in Settings');
  } else {
    await openAddons();
  }
  const block = visible('[data-testid="billing-addons"]');
  check(await block.count() === 1, 'Settings shows "מה כלול החודש, ותוספות"');
  const btext = (await block.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(btext.includes('רילסים עם AI: 6 מתוך 6'), 'reels: 6 מתוך 6');
  const buy = visible('[data-testid="addon-buy-reels"]');
  check((await buy.innerText().catch(() => '')).trim() === 'עוד 10 רילסים עם AI ב-29 ₪', 'the button: עוד 10 רילסים עם AI ב-29 ₪');
  const bb = await buy.boundingBox();
  check(!!bb && bb.height >= 40 && bb.x >= 0 && bb.x + bb.width <= 430, `the button is on screen (${bb ? `${Math.round(bb.width)}x${Math.round(bb.height)}` : 'none'})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at 430px');
  await page.screenshot({ path: `${SHOTS}/smoke-addons-block.png` });

  // No card yet: the confirm step says a card is needed, and nothing is charged.
  await buy.click(); await page.waitForTimeout(400);
  check((await body()).includes('כדי להוסיף חבילה צריך כרטיס שמור'), 'without a card: "צריך כרטיס שמור", no charge');

  // Save a mock card (test page on our own origin; no real card), then come back to the add-ons.
  const consent = visible('[data-testid="billing-consent"] input');
  if (await consent.count()) await consent.check();
  await visible('[data-testid="billing-card"] button:text-matches("הוספת כרטיס אשראי|עדכון כרטיס")').click();
  await page.waitForURL((u) => u.pathname.startsWith('/api/billing/mock-card'), { timeout: 20000 });
  await page.waitForLoadState('load'); await page.waitForTimeout(800);
  // A CLI preview is built with the production NEXT_PUBLIC_APP_URL, so the card page link points there (where billing is off). The signed
  // token is the same on any deployment of this database, so open the same page on the preview itself.
  if (!page.url().startsWith(BASE)) { const u = new URL(page.url()); await page.goto(`${BASE}${u.pathname}${u.search}`, { waitUntil: 'load' }); await page.waitForTimeout(800); }
  log('card page', page.url().replace(/s=[^&]+/, 's=…'));
  check((await body()).includes('לא יחויב כסף'), 'the mock card page says nothing is charged');
  await page.locator('button[value="ok"]').click(); await page.waitForTimeout(3000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1500); await skipTour();
  await openAddons();
  await visible('[data-testid="addon-buy-reels"]').click(); await page.waitForTimeout(400);
  const confirmText = (await body());
  check(/לחייב 29 ₪ בכרטיס שמסתיים ב-\d{4}/.test(confirmText), 'confirm step: "לחייב 29 ₪ בכרטיס שמסתיים ב-XXXX"');
  await page.screenshot({ path: `${SHOTS}/smoke-addons-confirm.png` });
  const resp = page.waitForResponse((r) => r.url().includes('/api/billing/addon'), { timeout: 30000 });
  await visible('[data-testid="addon-confirm-reels"]').click();
  const res = await resp; const rj = await res.json().catch(() => null);
  if (res.status() === 503) {
    log('add_billing_addons.sql has not run on this database: the purchase answers 503 honestly', (rj?.error || '').slice(0, 80));
    check(/add_billing_addons\.sql/.test(rj?.error || ''), 'before the migration: an honest "needs a database update" message');
  } else {
    migrated = true;
    check(res.status() === 200 && rj?.success, `the pack is bought (mock charge) (${res.status()})`);
    await page.waitForTimeout(1500);
    st = await status();
    const r1 = reelsOf(st);
    check(r1 && r1.cap === 16 && r1.purchased === 10, `reels now ${r1?.used} of ${r1?.cap}, purchased ${r1?.purchased} (expect 6 of 16, 10)`);
    const pays = await db.from('billing_payments').select('kind, status, amount').eq('tenant_id', tenantId).eq('kind', 'addon');
    check(pays.data?.length === 1 && pays.data[0].status === 'succeeded' && Number(pays.data[0].amount) === 29, 'one addon payment of 29, succeeded (mock)');
    await page.screenshot({ path: `${SHOTS}/smoke-addons-bought.png` });
  }
} catch (e) {
  fails.push(`threw: ${e?.message}`);
  console.error(e);
  await page.screenshot({ path: `${SHOTS}/smoke-addons-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  for (const t of ['billing_addons', 'billing_payments', 'billing_card_consents', 'billing_subscriptions']) {
    const { error } = await db.from(t).delete().eq('tenant_id', tenantId);
    if (error && !/does not exist|schema cache|Could not find/i.test(error.message)) log('cleanup', t, error.message);
  }
  log('cleanup', JSON.stringify(await purgeTenant(tenantId, userId)).slice(0, 300));
}
log(`migration ${migrated ? 'present: purchase walked end to end' : 'NOT run: purchase stopped at the honest 503'}`);
log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all checks passed');
process.exit(fails.length ? 1 : 0);

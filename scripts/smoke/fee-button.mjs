// Visual check of the fee question's buttons at phone widths (360 and 390): the full text of "כן, לגבות" and "לוותר" must be visible, not clipped.
// A SMOKE tenant only; the pending fee item is seeded with the service role (no real client, no charge). Clean up with `admin-tools.mjs purge-smoke`.
// node --env-file=.env.local scripts/smoke/fee-button.mjs [outDir]
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';

const out = process.argv[2] || '';
const db = admin();
const email = newEmail('feebtn');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const tenantId = await tenantIdOf(created.user.id);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');

const { browser, ctx, page } = await launch();
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
let bad = 0;
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת כפתורים (בדיקה)');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("לא עכשיו")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await db.from('cancellation_fee_items').insert({ tenant_id: tenantId, appointment_id: 'seed-1', client_id: 'seed-c', client_name: 'דנה כהן', service: 'טיפול פנים', kind: 'late_cancel', amount: 150, status: 'pending' });
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-testid="fee-question"]', { timeout: 30000 }); await page.waitForTimeout(800); await skipTour();
    for (const id of ['fee-charge', 'fee-waive']) {
      const m = await page.locator(`[data-testid="${id}"]`).first().evaluate((el) => { const cs = getComputedStyle(el); const r = document.createRange(); r.selectNodeContents(el); return { text: el.innerText, scrollW: el.scrollWidth, clientW: el.clientWidth, textW: r.getBoundingClientRect().width, textH: r.getBoundingClientRect().height, inner: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), w: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right }; });
      // the TEXT must fit inside the button's padding box on one line (a button squeezed below its text width clips the first letters)
      const clipped = m.scrollW > m.clientW + 1 || m.right > w + 1 || m.textW > m.inner + 1 || m.textH > 24;
      console.log(`[feebtn] ${w}px ${id}: "${m.text}" width ${Math.round(m.w)} text ${Math.round(m.textW)}/${Math.round(m.inner)} h ${Math.round(m.textH)} ${clipped ? 'CLIPPED' : 'ok'}`);
      if (clipped || !m.text) bad++;
    }
    if (out) await page.locator('[data-testid="fee-question"]').first().screenshot({ path: `${out}/fee-button-${w}.png` });
    if (out) { await page.evaluate(() => { document.querySelector('[data-testid="fee-question"]').style.zoom = '3'; }); await page.locator('[data-testid="fee-question"]').first().screenshot({ path: `${out}/fee-button-${w}-zoom.png` }); await page.evaluate(() => { document.querySelector('[data-testid="fee-question"]').style.zoom = ''; }); }
  }
} catch (e) { console.error('[feebtn] ERROR', e.message); bad++; }
finally { await browser.close(); }
console.log(bad ? `[feebtn] ${bad} problem(s)` : '[feebtn] all ok');
process.exit(bad ? 1 : 0);

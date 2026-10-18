// Grow cancellation fees and deposits in MOCK mode, in a real browser, on a NEW smoke tenant (never the real one).
//   Part A (always): with the policy off, or before add_grow_cancellation.sql has run, nothing changes: the policy card says so, the public
//     booking page books exactly as before, the fee routes and cancel/no-show detection stay silent.
//   Part B (only when the migration has been run): set a saved-card policy in settings -> the public page shows it with a required tick -> book ->
//     Grow's mock card page -> the owner cancels inside the window -> the one-tap question on the home screen -> YES -> payment, receipt on the client card,
//     in the cashier history and in the revenue report; WAIVE charges nothing; deposit: paid -> attend (deducted) / no-show (kept) / timely cancel (refund).
// node --env-file=.env.local scripts/smoke/grow-cancel.mjs
// The local server must run with GROW_UI_ENABLED=true GROW_MODE=mock VERCEL_ENV=development and the messaging keys blanked.
// Clean up afterwards with `admin-tools.mjs purge-smoke`.
import { launch, PASSWORD, BASE, admin, newEmail, tenantIdOf, REAL_TENANT } from './lib.mjs';

const log = (...a) => console.log('[cancel]', ...a);
const fails = [];
const check = (ok, msg) => { if (ok) log('ok  ', msg); else { fails.push(msg); console.error('[cancel] FAIL', msg); } };
const NOISE = [/Invalid Sentry Dsn/i, /get_public_services/];
const CLIENT = 'דנה ביטול';
const PHONE = '0500000088';

const db = admin();
const email = newEmail('cancel');
const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
await new Promise((r) => setTimeout(r, 1500));
const userId = created.user.id;
const tenantId = await tenantIdOf(userId);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
log('account', email, 'tenant', tenantId);

const { browser, ctx, page, problems } = await launch();
const body = async (p = page) => (await p.innerText('body')).replace(/\s+/g, ' ');
const visible = (sel, p = page) => p.locator(sel).filter({ visible: true }).first();
const skipTour = async () => { for (let i = 0; i < 6; i++) { const sk = visible('button:has-text("דלגי")'); if (await sk.count()) { await sk.click().catch(() => {}); await page.waitForTimeout(300); } else break; } };
const home = async () => { await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('button[aria-label="יומן"]', { timeout: 60000 }); await page.waitForTimeout(1800); await skipTour(); };
const openGrowSettings = async () => {
  await visible('button[aria-label="הגדרות"]').click(); await page.waitForTimeout(900);
  await page.locator('.sheet button:text-is("חיבורים"), [role=dialog] button:text-is("חיבורים")').filter({ visible: true }).first().click(); await page.waitForTimeout(1500);
  await page.locator('[data-testid="grow-card"]').scrollIntoViewIfNeeded();
};
const api = (path, init) => page.evaluate(async ([p, i]) => { const r = await fetch(p, i); return { code: r.status, json: await r.json().catch(() => null) }; }, [path, init || {}]);
const post = (path, b) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

// the public booking flow, as the audit e2e walks it; `tick` ticks the policy box when it is there
async function publicBook({ expectPolicy, tick }) {
  const pub = await ctx.newPage();
  const probs = [];
  pub.on('console', (m) => { if (m.type() === 'error' && !NOISE.some((n) => n.test(m.text() + (m.location()?.url || '')))) probs.push(m.text().slice(0, 200)); });
  pub.on('pageerror', (e) => probs.push('pageerror ' + e.message.slice(0, 200)));
  await pub.goto(`${BASE}/book?t=${tenantId}`, { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(3500);
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).nth(1).click(); await pub.waitForTimeout(1200);
  await pub.locator('.bk-chip[aria-label^="יום שני"]').first().click(); await pub.waitForTimeout(2000);
  await pub.getByText('10:00', { exact: true }).first().click(); await pub.waitForTimeout(600);
  await pub.locator('button:has-text("המשיכי")').first().click(); await pub.waitForTimeout(1200);
  await pub.fill('input[placeholder="שם מלא"]', CLIENT); await pub.fill('input[type=tel]', PHONE);
  await pub.locator('input[aria-label="אישור שמירת הפרטים"]').check();
  const policyBox = pub.locator('[data-testid="grow-policy"]');
  check((await policyBox.count()) === (expectPolicy ? 1 : 0), expectPolicy ? 'the public page shows the cancellation policy' : 'no policy block on the public page (booking as before)');
  if (expectPolicy) {
    check((await policyBox.innerText()).includes('מדיניות ביטולים'), 'the policy text is shown');
    await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click(); await pub.waitForTimeout(800);
    check((await body(pub)).includes('מדיניות הביטולים') && !(await body(pub)).includes('התור נקבע'), 'booking is refused until the policy is ticked');
    if (tick) await pub.locator('input[aria-label="אישור מדיניות הביטולים"]').check();
  }
  await pub.locator('button:has-text("קביעת תור")').filter({ visible: true }).last().click(); await pub.waitForTimeout(4000);
  check((await body(pub)).includes('התור נקבע'), 'the booking page confirms the appointment');
  for (const p of probs) { fails.push('public page: ' + p); console.error('[cancel] PUBLIC PAGE PROBLEM', p); }
  return pub;
}

try {
  // login + onboarding
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', PASSWORD); await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/onboarding'), { timeout: 60000 });
  await page.fill('input[placeholder="למשל: סטודיו רונית"]', 'קליניקת ביטולים (בדיקה)');
  await page.fill('input[placeholder="השם שלך"]', 'בודקת');
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(400);
  await page.fill('input[placeholder="0501234567"]', '0500000000');
  await page.click('button:has-text("עוסק פטור")');
  for (let i = 0; i < 2; i++) { await page.click('button:has-text("הבא")'); await page.waitForTimeout(400); }
  await page.click('button:has-text("קוסמטיקה וטיפוח פנים")'); await page.waitForTimeout(600);
  const svcRows = page.locator('button:has-text("דקות")').filter({ visible: true });
  for (let i = 0; i < 2; i++) { await svcRows.nth(i).click(); await page.waitForTimeout(200); }
  await page.click('button:has-text("הבא")'); await page.waitForTimeout(500);
  await page.click('button:has-text("לא עכשיו")');
  await page.waitForSelector('button[aria-label="יומן"]', { timeout: 90000 });
  await page.waitForTimeout(1500); await skipTour();
  log('onboarded');
  await db.from('grow_accounts').insert({ tenant_id: tenantId, user_id: 'TESTUSER1', enabled: true });

  // ── part A: policy off ──
  const pol = await api(`/api/grow/policy/public?t=${tenantId}`);
  check(pol.json?.mode === 'off', 'the public policy route says "off" (no policy yet)');
  const st = await api('/api/grow/policy');
  const migrated = st.json?.tableReady !== false;
  await openGrowSettings();
  await page.locator('[data-testid="cancel-policy-card"]').waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.locator('[data-testid="cancel-policy-card"]').count() === 1, 'the cancellation policy sits inside the Grow card when connected');
  if (!migrated) check((await page.locator('[data-testid="cancel-policy-card"]').innerText()).includes('עוד לא הופעלה'), 'before the migration the card says so, with no form that leads nowhere');
  await page.keyboard.press('Escape');
  check((await post('/api/grow/fees/detect', { appointmentId: 'nope', event: 'cancel' })).json?.status === 'no-policy', 'cancel / no-show detection is silent without a policy');
  check(((await api('/api/grow/fees')).json?.items || []).length === 0, 'no fee questions');
  let pub = await publicBook({ expectPolicy: false });
  await pub.close();
  const { data: a0 } = await db.from('appointments').select('id, client_id').eq('tenant_id', tenantId);
  check(a0?.length === 1, 'the booking works exactly as before with the policy off');

  if (!migrated) {
    log('PART B SKIPPED: add_grow_cancellation.sql has not been run, so the policy, consent, fee and deposit flows were not walked in the browser');
  } else {
    // ── part B: saved card ──
    await db.from('appointments').delete().eq('tenant_id', tenantId);
    await db.from('clients').delete().eq('tenant_id', tenantId);
    await home(); await openGrowSettings();
    await page.locator('[data-testid="policy-mode"]').selectOption('saved_card');
    await page.locator('[data-testid="policy-window"]').fill('24');
    await visible('[data-testid="cancel-policy-card"] button:has-text("נוסח ברירת מחדל")').click();
    await visible('[data-testid="cancel-policy-card"] button:has-text("שמירת המדיניות")').click(); await page.waitForTimeout(1800);
    const { data: saved } = await db.from('grow_cancel_policies').select('policy').eq('tenant_id', tenantId).maybeSingle();
    check(saved?.policy?.mode === 'saved_card' && saved.policy.windowHours === 24, 'the policy is saved (saved card, 24 hours)');
    await page.keyboard.press('Escape');

    pub = await publicBook({ expectPolicy: true, tick: true });
    check(await pub.locator('[data-testid="grow-step"]').count() === 1, 'the booking page offers the secure card step');
    await pub.locator('[data-testid="grow-step"] a').click();
    await pub.waitForURL((u) => u.pathname.startsWith('/api/grow/mock-token'), { timeout: 20000 });
    check((await body(pub)).includes('לא יחויב כסף'), 'the Grow card page (mock) says nobody is charged');
    await pub.locator('button[value="ok"]').click(); await pub.waitForTimeout(2500);
    await pub.close();
    const { data: appt } = await db.from('appointments').select('*').eq('tenant_id', tenantId).single();
    const { data: consent } = await db.from('appointment_policy_consents').select('*').eq('appointment_id', String(appt.id)).maybeSingle();
    check(consent?.mode === 'saved_card' && !!consent.consented_at && !!consent.snapshot?.policy_text && consent.status === 'card_saved', 'consent stored per appointment: text snapshot, mode, amounts, time; card saved');
    const { data: tok } = await db.from('grow_card_tokens').select('*').eq('appointment_id', String(appt.id));
    check(tok?.length === 1 && tok[0].card_last4 === '4242' && !!tok[0].token_ref, 'a token reference is stored, with the last four digits only');

    // the appointment is in 3 hours (inside the 24-hour window); she cancels it in the app
    const il = new Date(Date.now() + 3 * 3600000).toLocaleString('en-CA', { timeZone: 'Asia/Jerusalem', hour12: false }).replace(',', '');
    const [d, hhmm] = il.split(' ');
    const mins = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    await db.from('appointments').update({ date: d, start_minute: mins, hour: Math.floor(mins / 60), price: 200 }).eq('id', appt.id);
    await db.from('service_prices').update({ price: 200 }).eq('tenant_id', tenantId);
    await home();
    await visible('button[aria-label="יומן"]').click(); await page.waitForTimeout(1500);
    page.once('dialog', (dl) => dl.accept());
    const del = visible('button[aria-label="מחיקה"]');
    await del.click(); await page.waitForTimeout(800);
    const confirmBtn = page.locator('button:has-text("כן"), button:has-text("ביטול התור"), button:has-text("מחיקה")').filter({ visible: true }).last();
    if (await confirmBtn.count()) await confirmBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    let { data: items } = await db.from('cancellation_fee_items').select('*').eq('tenant_id', tenantId);
    check(items?.length === 1 && items[0].status === 'pending' && Number(items[0].amount) > 0, `a pending fee item was created (${items?.[0]?.amount})`);
    check(((await db.from('grow_payments').select('id').eq('tenant_id', tenantId)).data || []).length === 0, 'nothing is charged without her tap');
    await home();
    const q = visible('[data-testid="fee-question"]');
    check((await q.count()) === 1 && /לגבות ₪\d+ מ.* על ביטול מאוחר\?/.test(await q.innerText()), 'the home screen asks "לגבות ₪… על ביטול מאוחר?"');
    await visible('[data-testid="fee-charge"]').click(); await page.waitForTimeout(3000);
    ({ data: items } = await db.from('cancellation_fee_items').select('*').eq('tenant_id', tenantId));
    const { data: pays } = await db.from('grow_payments').select('*').eq('tenant_id', tenantId);
    const { data: rcs } = await db.from('receipts').select('*').eq('tenant_id', tenantId);
    check(items[0].status === 'charged' && pays?.length === 1 && pays[0].kind === 'fee' && pays[0].status === 'paid', 'YES charged the saved card: the payment is stored as a Grow payment');
    check(rcs?.length === 1 && rcs[0].payment_method === 'אשראי' && rcs[0].legal_provider === 'grow' && !!rcs[0].legal_doc_url, 'Grow issued the receipt (link stored), method card');
    await home();
    await visible('button[aria-label="לקוחות"]').click(); await page.waitForTimeout(1200);
    await page.getByText(CLIENT).filter({ visible: true }).first().click(); await page.waitForTimeout(1000);
    await visible('button:has-text("תשלומים")').click(); await page.waitForTimeout(800);
    check(await page.locator('[data-testid="grow-receipt-link"]').filter({ visible: true }).count() >= 1, 'the receipt shows on the client card');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await visible('button[aria-label="תשלום"]').click(); await page.waitForTimeout(1200);
    check(await page.locator('[data-testid="grow-receipt-link"]').filter({ visible: true }).count() >= 1, 'and in the cashier history');
    await visible('button:has-text("סיכום הכנסות")').click(); await page.waitForTimeout(1500);
    check(/מספר עסקאות 1/.test(await body()), 'and in the revenue report');

    log('NOTE: the waive, no-show and deposit paths are covered by test-grow-cancel.ts; they were not clicked through here');
  }

  const real = [...new Set(problems.filter((p) => !NOISE.some((n) => n.test(p))))];
  check(real.length === 0, 'no console errors, page errors or 5xx responses' + (real.length ? ': ' + real.slice(0, 6).join(' | ') : ''));
} catch (e) {
  fails.push('script error: ' + e.message); console.error('[cancel] ERROR', e.message);
  console.error('[cancel] page:', page.url(), (await body().catch(() => '')).slice(0, 400));
} finally {
  await browser.close();
}
console.log(fails.length ? `\n[cancel] ${fails.length} failure(s)` : '\n[cancel] all ok');
process.exit(fails.length ? 1 : 0);

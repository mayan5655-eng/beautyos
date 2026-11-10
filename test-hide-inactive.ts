// test-hide-inactive.ts
//
// The owner's rule (2026-11-09): nothing that is not active may be shown. Not a button, not a card, not a setting, not a line of
// help, not the help chat's knowledge, not a video link, not "coming soon", not copy promising it. For every flag-gated surface:
// with the flag OFF, nothing of it renders or appears in the text; with every flag ON, the text is exactly what it was before.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (f: string) => readFileSync(f, 'utf8');
let n = 0;
const ok = async (name: string, fn: () => unknown) => { await fn(); n++; console.log(`ok - ${name}`); };

const { HELP_SECTIONS, helpSectionsFor, tutorialIdsFor, TUTORIAL_TITLES, gateOn } = await import('./lib/helpSections.ts');
const { helpGatesFor } = await import('./lib/helpVisibility.ts');
const { deployFlagsFor } = await import('./lib/deployFlags.ts');
const { buildHelpPrompt, helpChatGates } = await import('./lib/ai/helpChat.ts');
const { tutorialFlagsOn } = await import('./lib/tutorialFlags.ts');

const text = (secs: { title: string; body: string[] }[]) => secs.map((s) => s.title + '\n' + s.body.join('\n')).join('\n');
const videos = (secs: { videos?: string[] }[]) => secs.flatMap((s) => s.videos || []);
const T = '00000000-0000-4000-8000-0000000000aa';

// Every platform and tab switch explicitly off, and no deployment switch on.
const ALL_OFF_SETTINGS = {
  business_fields: ['cosmetics'],
  automations: { feature_flags: {
    waitlist_offers: false, rebook_nudges: false, gift_vouchers: false, products: false, review_two_step: false, monthly_report_page: false,
    skin_scan: false, leads: false, advisor: false, packages: false, reel_templates: false,
  } },
};

await ok('the flag names used above are the real ones', () => {
  for (const [f, k] of [['lib/waitlistFlag.js', "'waitlist_offers'"], ['lib/reminders/rebookPlan.js', "'rebook_nudges'"], ['lib/giftVouchers.ts', "'gift_vouchers'"], ['lib/products.ts', "'products'"], ['lib/reviewRequests.ts', "'review_two_step'"], ['lib/monthlyFull.ts', "'monthly_report_page'"]]) {
    assert.ok(rd(f).includes(k), `${f} uses ${k}`);
  }
  const g = helpGatesFor(ALL_OFF_SETTINGS, {});
  for (const k of ['grow', 'referral', 'bizReferral', 'annual', 'autoSend', 'voucherOnline', 'bot', 'waitlist', 'rebook', 'vouchers', 'products', 'reviews', 'monthly', 'skinScan', 'leads', 'advisor', 'packages', 'reelTemplates'] as const) {
    assert.equal(g[k], false, `${k} is off`);
  }
});

await ok('help page: every flag off -> no section, line or video of a switched-off feature', () => {
  const secs = helpSectionsFor(['cosmetics'], helpGatesFor(ALL_OFF_SETTINGS, {}));
  const t = text(secs);
  for (const w of ['Grow', 'סליקת אשראי', 'חברה מביאה חברה', 'המנוי שלך', 'תשלום שנתי', 'בוט וואטסאפ', 'סריקת עור', 'סריקות עור', 'מכסת סריקות',
    'שוברי מתנה', 'מוצרים ומלאי', 'רשימת ההמתנה', 'תזכורת לקבוע את התור הבא', 'ביקורות בשני צעדים', 'מה הלקוחות אמרו', 'הדוח החודשי', 'תבניות רילס',
    '- **חבילות**', 'אוטומטית לרשימת', 'המספר המרכזי']) {
    assert.ok(!t.includes(w), `nothing about "${w}"`);
  }
  for (const key of ['grow', 'leads', 'advisor', 'vouchers-products', 'waitlist-rebook']) assert.ok(!secs.some((s) => s.key === key), `no ${key} section`);
  const v = videos(secs);
  for (const id of ['grow-connect', 'grow-till', 'pay-page', 'deposits', 'grow-refunds', 'referral', 'skin-scan', 'waitlist-rebook', 'gift-vouchers', 'products', 'reviews', 'monthly']) {
    assert.ok(!v.includes(id), `no ▶ link to ${id}`);
  }
  assert.ok(v.includes('till') && v.includes('booking'), 'the videos of active features stay');
  assert.ok(t.includes('### הסיכום השבועי'), 'the weekly summary (always on) keeps its heading');
  assert.ok(t.includes('שלושה כפתורים בראש הכרטיס'), 'the client card has three buttons without the scan');
});

await ok('help page: a brand-new tenant (nothing stored, deployment switches off) sees no Grow, referral, yearly plan or bot, and no automatic-send promise', () => {
  const secs = helpSectionsFor(['cosmetics'], helpGatesFor({ business_fields: ['cosmetics'] }, {}));
  const t = text(secs);
  for (const w of ['Grow', 'חברה מביאה חברה', 'המנוי שלך', 'בוט וואטסאפ', 'הצעה אוטומטית', 'מקבלת הצעה עם קישור', 'מקבלת תזכורת חמה', 'אם השליחה מהמספר המרכזי']) {
    assert.ok(!t.includes(w), `nothing about "${w}"`);
  }
  assert.ok(t.includes('הצעה לרשימת ההמתנה כשתור מתבטל') && t.includes('את שולחת בלחיצה'), 'the waitlist line says it is prepared for her to send');
  assert.ok(t.includes('סריקת עור AI') && t.includes('שוברי מתנה'), 'features that are on by default stay');
  const v = videos(secs);
  for (const id of ['grow-connect', 'grow-till', 'pay-page', 'deposits', 'grow-refunds', 'referral']) assert.ok(!v.includes(id), `no ▶ link to ${id} (the known leak)`);
  assert.ok(!t.includes('אונליין מהדף שלך'), 'no online voucher purchase without Grow');
});

await ok('help page: every flag ON -> the text and videos are exactly the original', () => {
  const on = helpGatesFor({ business_fields: ['cosmetics'], green_api_instance: '1101', automations: { feature_flags: { skin_scan: true } } }, { grow: true, billing: true, autoSend: true },
    { NEXT_PUBLIC_REFERRALS: '1', NEXT_PUBLIC_ANNUAL_PLAN: '1' });
  for (const [k, v] of Object.entries(on)) assert.equal(v, true, `${k} on`);
  assert.deepEqual(helpSectionsFor(['cosmetics'], on).map((s) => ({ ...s })), HELP_SECTIONS.map((s) => ({ ...s })));
  assert.deepEqual(tutorialIdsFor(['cosmetics'], on), Object.keys(TUTORIAL_TITLES));
  assert.equal(helpSectionsFor(['cosmetics']), HELP_SECTIONS, 'no gates given: the legacy, ungated text');
});

await ok('help page in the app: computed from her settings and the server switches, all off until they arrive', () => {
  const app = rd('app/beautyos.jsx');
  assert.ok(app.includes('helpSectionsFor(businessFieldsOf(settings), helpGatesFor(settings, deployFlags))'));
  assert.ok(app.includes('const deployFlags = useDeployFlags();'));
  const hook = rd('app/useDeployFlags.js');
  assert.match(hook, /const OFF = \{ grow: false, billing: false, autoSend: false \}/);
  assert.match(hook, /fetch\('\/api\/feature-visibility'/);
  const route = rd('app/api/feature-visibility/route.ts');
  assert.match(route, /isUtilityAutoSendEnabled/);
  assert.match(route, /deployFlagsFor\(String\(tenantId\)\)/);
  assert.deepEqual(deployFlagsFor(T, {}), { grow: false, billing: false });
  assert.deepEqual(deployFlagsFor(T, { GROW_UI_ENABLED: '1', BILLING_UI_ENABLED: 'true' }), { grow: true, billing: true });
  assert.equal(deployFlagsFor(T, { GROW_UI_ENABLED: '1', GROW_ALLOWED_TENANTS: 'someone-else' }).grow, false, 'Grow on for other businesses only: off for her');
});

await ok('AI help chat: a switched-off feature is not in the model\'s material, and its videos cannot be named', () => {
  const p = buildHelpPrompt(['cosmetics'], helpChatGates({ business_fields: ['cosmetics'], automations: ALL_OFF_SETTINGS.automations }, T, {}));
  for (const w of ['Grow', 'סליקת אשראי', 'חברה מביאה חברה', 'בוט וואטסאפ', 'סריקת עור', 'שוברי מתנה', 'רשימת ההמתנה', 'הצעה אוטומטית', 'grow-till:', 'referral:', 'skin-scan:']) {
    assert.ok(!p.includes(w), `prompt has no "${w}"`);
  }
  assert.ok(p.includes('אין במערכת שליחה אוטומטית של הודעות וואטסאפ'), 'and it still says automatic sending does not exist');
  assert.equal(helpChatGates(null, T, { GROW_UI_ENABLED: '1' }).autoSend, false, 'the chat never promises automatic sending');
  assert.equal(helpChatGates(null, T, { GROW_UI_ENABLED: '1' }).grow, true);
  assert.ok(gateOn(undefined, 'grow'));
});

await ok('/tutorials: with the switches off, no Grow or referral video and no online voucher purchase', () => {
  const on = tutorialFlagsOn({});
  assert.deepEqual(on, { grow: false, referral: false });
  const page = rd('app/tutorials/page.tsx');
  assert.match(page, /v\.id === "gift-vouchers" && !on\.grow \? \{ \.\.\.v, \.\.\.GIFT_VOUCHERS_NO_GROW \}/);
  const noGrow = page.slice(page.indexOf('const GIFT_VOUCHERS_NO_GROW'), page.indexOf('};', page.indexOf('const GIFT_VOUCHERS_NO_GROW')));
  assert.ok(!/בדף שלך|אונליין|Grow ומ|שולחת אותו בעצמה/.test(noGrow), 'the no-Grow voucher entry promises no online purchase');
  assert.match(page, /g\.videos\.filter\(\(v\) => tutorialOn\(v\.id, on\)\)/);
});

const { importApp, renderApp } = await import('./testkit/render.mjs' as string);
const Row = ({ label, desc }: { label: string; desc: string }) => `${label} ${desc}`;

await ok('settings: the waitlist switch, with automatic sending off, promises no automatic message', async () => {
  const mod = await importApp('app/WaitlistOfferSetting.jsx');
  const html = renderApp(mod.default, { autos: {}, setAutos: () => {}, pc: '#000', Row: (p: any) => `${p.label} ${p.desc}` });
  assert.ok(!html.includes('אוטומטית') && !html.includes('מקבלת הצעה אחת בוואטסאפ'), 'no automatic promise');
  assert.ok(html.includes(mod.WAITLIST_LABEL.manual));
  assert.ok(mod.WAITLIST_DESC.manual.includes('את שולחת כל הצעה בלחיצה'));
  assert.equal(mod.WAITLIST_LABEL.auto, 'הצעה אוטומטית לרשימת ההמתנה', 'with automatic sending on: the original label');
  assert.equal(renderApp(mod.default, { autos: { feature_flags: { waitlist_offers: false } }, setAutos: () => {}, pc: '#000', Row }), '', 'platform flag off: nothing');
});

await ok('home + calendar: the waitlist card and the suggestion card promise no automatic message while sending is by tap', async () => {
  const wa = await importApp('app/WaitlistActivity.jsx');
  for (const s of [wa.WAITLIST_ACTIVITY_ON.manual, wa.WAITLIST_ACTIVITY_OFF.manual]) assert.ok(!s.includes('אוטומטית'), s);
  const { automationSuggestions } = await import('./lib/automationSuggest.js');
  for (const i of automationSuggestions({ tenant_id: T, automations: {} }, {})) assert.ok(!(i.question + i.body).includes('אוטומטית'), i.question);
  const card = rd('app/AutomationSuggestCard.jsx');
  assert.match(card, /automationSuggestions\(settings, \{ services, origin, autoSend \}\)/);
});

await ok('gift vouchers: with Grow off, no online-sale switch and no word about Grow or paying online', async () => {
  const src = rd('app/GiftVoucherSettings.jsx');
  assert.match(src, /\{grow && \(<>\n\s*<label[^]*?מכירה אונליין בדף העסק/);
  const mod = await importApp('app/GiftVoucherSettings.jsx');
  assert.ok(!/Grow|אונליין/.test(mod.GV_ON_TEXT.noGrow));
  const mk = await importApp('app/GiftVoucherMarketingCard.jsx');
  const html = renderApp(mk.GiftVoucherMarketingBody, { settings: { tenant_id: T, automations: {} }, pc: '#000', pcTint: '#eee', slug: 's', online: false, origin: '' });
  assert.ok(!html.includes('Grow'), 'no "Grow is not connected yet" where she cannot connect it');
});

await ok('settings cards of switched-off features render nothing (Grow, billing, referral)', async () => {
  for (const f of ['app/GrowCard.jsx', 'app/BillingCard.jsx', 'app/BusinessReferralCard.jsx']) {
    const mod = await importApp(f);
    assert.equal(renderApp(mod.default, { pc: '#000', pcTint: '#eee', toast: () => {}, isDemo: false }), '', `${f}: nothing before the server says it is on`);
  }
});

await ok('no "not active yet / coming soon" text is reachable on the settings cards', () => {
  assert.match(rd('app/GrowCard.jsx'), /if \(!s \|\| s\.hidden \|\| s\.tableReady === false\) return null;/);
  const billing = rd('app/BillingCard.jsx');
  assert.match(billing, /if \(!s \|\| s\.hidden \|\| s\.tableReady === false\) return null;/);
  assert.ok(!billing.includes('כשיהיה זמין תוכלי להוסיף כרטיס'), 'no card promise while card payment is not configured');
  assert.match(billing, /\{an && an\.ready && \(/, 'the yearly plan block only once it is ready');
  assert.match(billing, /s\.configured \? 'כדי שלא תהיה הפסקה, אפשר להוסיף כרטיס כבר עכשיו/);
  assert.match(rd('app/BusinessReferralCard.jsx'), /if \(!on \|\| !s \|\| s\.hidden \|\| s\.ready === false\) return null;/);
  assert.match(rd('app/CancelPolicyCard.jsx'), /state\.tableReady === false\) return null;/);
  assert.ok(!rd('app/community/page.tsx').includes('בקרוב'), 'the community feed promises nothing');
});

await ok('no em dash in the new copy', () => {
  for (const f of ['lib/helpSections.ts', 'lib/helpVisibility.ts', 'app/WaitlistOfferSetting.jsx', 'app/WaitlistActivity.jsx', 'lib/automationSuggest.js', 'app/GiftVoucherSettings.jsx', 'app/tutorials/page.tsx']) {
    const src = rd(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!src.includes('—'), `no em dash in ${f}`);
  }
  assert.ok(!text(HELP_SECTIONS).includes('—'));
});

await ok('CLAUDE.md carries the standing rule', () => {
  assert.ok(rd('CLAUDE.md').includes('Never show anything in the product that is not active yet'));
});

console.log(`hide inactive: ${n} ok`);

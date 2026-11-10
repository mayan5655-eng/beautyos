// The "שדרוגים ✨" store (lib/upgradesStore.ts, app/UpgradesStore.jsx, app/api/billing/upgrades): what she buys from Kalmea in one tap.
// Covers: the copy (feminine, no em dash, Hebrew-first for RTL), the flags (nothing shows unless its switch is on), the meters, the
// 80% nudge, the safety of the purchase (a confirm sheet that names the price and the card, a requestId, the ledger guard against a
// second charge), and that every metered screen renders its own chip, which opens that screen's pack. Renders the real components
// (testkit/render.mjs); app/beautyos.jsx is too large to render alone, so its wiring is checked as source and says so.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importApp, renderApp, textOf, buttonsOf } from './testkit/render.mjs';
import { ADDON_PACKS, ADDON_PACK_KEYS, addonButtonHe, type AddonPackKey } from './lib/pricing.ts';
import {
  usageLevel, usagePct, usageLineHe, pageChipHe, confirmChargeHe, priceNoteHe, annualSavingHe, successHe, storeCards, packFor, homeNudgePack,
  upgradesFlagsOn, openUpgrades, UPGRADES_EVENT, packWhatHe, packTitleHe, newRequestId, type UpgradesData,
} from './lib/upgradesStore.ts';
import { OPEN_ADDONS_EVENT } from './lib/addonOffer.ts';
import { buyAddon, ADDON_OPEN_WINDOW_MS, type Deps, type PaymentRecord } from './lib/billing/service.ts';
import { RATE_POLICIES } from './lib/rateLimit.ts';
import { isFinalRefusal, requestVerdict, requestStateHe, LOST_ANSWER_HE } from './lib/upgradesStore.ts';
import { callerIsOwner } from './lib/billing/owner.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (f: string) => readFileSync(f, 'utf8');
const ON = { NEXT_PUBLIC_ADDON_PACKS: '1', NEXT_PUBLIC_ANNUAL_PLAN: '1', NEXT_PUBLIC_REFERRALS: '1' };
const OFF = {};

const usage = (key: AddonPackKey, used: number | null, cap: number | null = ADDON_PACKS[key].included, purchased = 0) => ({ key, used, cap, purchased, units: ADDON_PACKS[key].units, price: ADDON_PACKS[key].price });
const data = (over: Partial<UpgradesData> = {}): UpgradesData => ({
  success: true, billing: true, configured: true, mode: 'mock', demo: false, card: { last4: '4242' }, subStatus: 'active', nextChargeAt: '2026-12-01T08:00:00Z',
  packs: [usage('posts', 2), usage('reels', 3), usage('advisor', 10), usage('skinscan', 5)],
  annual: { ready: true, monthly: 349, yearly: 3490, billingPeriod: 'monthly', pendingPeriod: null },
  referrals: true, ...over,
});

// ── copy ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('meters: the line, the level and the bar', () => {
  assert.equal(usageLineHe(7, 10), 'השתמשת ב-7 מתוך 10 החודש');
  assert.equal(usageLevel(7, 10), 'quiet');
  assert.equal(usageLevel(8, 10), 'near', '80% is the nudge');
  assert.equal(usageLevel(10, 10), 'full');
  assert.equal(usageLevel(12, 10), 'full');
  assert.equal(usageLevel(null, 10), 'unknown', 'an unreadable count is never shown as zero');
  assert.equal(usagePct(3, 10), 30);
  assert.equal(usagePct(30, 10), 100);
  assert.equal(usagePct(null, 10), 0);
});

await ok('the chip: quiet below 80%, the stronger nudge from 80% and at the cap', () => {
  assert.equal(pageChipHe('reels', 'quiet'), 'רוצה עוד רילסים? לחצי כאן ✨');
  assert.equal(pageChipHe('posts', 'quiet'), 'רוצה עוד פוסטים? לחצי כאן ✨');
  assert.equal(pageChipHe('advisor', 'quiet'), 'רוצה עוד שאלות ליועצת? לחצי כאן ✨');
  assert.equal(pageChipHe('skinscan', 'quiet'), 'רוצה עוד סריקות עור? לחצי כאן ✨');
  assert.equal(pageChipHe('reels', 'near'), `כמעט נגמרו הרילסים של החודש. ${addonButtonHe(ADDON_PACKS.reels)}`);
  assert.equal(pageChipHe('reels', 'full'), `נגמרו הרילסים של החודש. ${addonButtonHe(ADDON_PACKS.reels)}`);
});

await ok('every line starts with a Hebrew letter (RTL), and none has an em dash', () => {
  const lines: string[] = [];
  for (const k of ADDON_PACK_KEYS) for (const l of ['quiet', 'near', 'full'] as const) lines.push(pageChipHe(k, l));
  for (const k of ADDON_PACK_KEYS) lines.push(packWhatHe(k), packTitleHe(k), successHe(k, 20), successHe(k, null));
  lines.push(usageLineHe(1, 2), priceNoteHe('exempt'), priceNoteHe('licensed'), annualSavingHe(349));
  for (const l of lines) {
    assert.ok(/^[֐-׿]/.test(l), `starts with Hebrew: ${l}`);
    assert.ok(!/[—–]/.test(l), `no em/en dash: ${l}`);
  }
  for (const f of ['lib/upgradesStore.ts', 'app/UpgradesStore.jsx', 'app/dashboard/admin/AddonPurchasesAdmin.tsx']) assert.ok(!/—/.test(read(f)), `${f} has no em dash`);
});

await ok('the confirm line names the price and the card; the price note follows Kalmea\'s tax status', () => {
  assert.equal(confirmChargeHe(39, '4242'), '39 ₪ יחויבו בכרטיס שמסתיים ב-4242');
  assert.equal(priceNoteHe('exempt'), 'מחיר סופי, בלי תוספות', 'an exempt dealer adds nothing on top');
  assert.equal(priceNoteHe('licensed'), 'כולל מע״מ');
  assert.equal(annualSavingHe(349), 'חוסכת 698 ₪ בשנה', 'two months free');
  assert.equal(annualSavingHe(499), 'חוסכת 998 ₪ בשנה');
  assert.equal(successHe('reels', 20), 'החבילה נוספה 🌸 עכשיו יש לך 20 רילסים החודש');
});

// ── flags ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('flags: every switch off means no store at all', () => {
  assert.equal(upgradesFlagsOn(OFF), false);
  assert.equal(upgradesFlagsOn({ NEXT_PUBLIC_REFERRALS: '1' }), true);
  assert.deepEqual(storeCards(data(), OFF), []);
});

await ok('cards: packs first (the one running out leads), then yearly, then the referral', () => {
  const d = data({ packs: [usage('posts', 1), usage('reels', 9), usage('advisor', 10), usage('skinscan', 0)] });
  const kinds = storeCards(d, ON).map((c) => (c.kind === 'pack' ? c.key : c.kind));
  assert.deepEqual(kinds, ['reels', 'posts', 'advisor', 'skinscan', 'annual', 'referral'], 'by share used: 9/10, 1/9, 10/100, 0/50');
});

await ok('cards: only what is on', () => {
  assert.deepEqual(storeCards(data(), { NEXT_PUBLIC_REFERRALS: '1' }).map((c) => c.kind), ['referral'], 'packs and yearly off');
  assert.deepEqual(storeCards(data({ billing: false, packs: [], annual: null }), ON).map((c) => c.kind), ['referral'], 'billing off: nothing to buy');
  assert.equal(storeCards(data({ annual: { ready: false, monthly: 349, yearly: 3490, billingPeriod: 'monthly', pendingPeriod: null } }), ON).some((c) => c.kind === 'annual'), false, 'yearly before its migration');
  assert.equal(storeCards(data({ annual: { ready: true, monthly: 349, yearly: 3490, billingPeriod: 'annual', pendingPeriod: null } }), ON).some((c) => c.kind === 'annual'), false, 'already yearly');
  const pending = storeCards(data({ annual: { ready: true, monthly: 349, yearly: 3490, billingPeriod: 'monthly', pendingPeriod: 'annual' } }), ON).find((c) => c.kind === 'annual');
  assert.ok(pending && pending.kind === 'annual' && pending.pending, 'a switch waiting for the renewal shows as done, with no button');
  assert.equal(storeCards(data({ referrals: false }), ON).some((c) => c.kind === 'referral'), false);
  assert.equal(packFor(data(), 'reels', { NEXT_PUBLIC_REFERRALS: '1' }), null, 'with packs off no screen gets a pack');
  assert.equal(storeCards(null, ON).length, 0);
});

await ok('only what can be bought right now: a deployment that cannot charge offers no pack and no yearly switch', () => {
  const kinds = storeCards(data({ configured: false }), ON).map((c) => c.kind);
  assert.deepEqual(kinds, ['referral']);
  assert.equal(packFor(data({ configured: false }), 'reels', ON), null);
  assert.deepEqual(storeCards(data({ configured: false, referrals: false }), ON), [], 'nothing purchasable: an empty store');
  const up = read('app/api/billing/upgrades/route.ts');
  assert.match(up, /if \(!out\.configured\) return NextResponse\.json\(out\)/);
  assert.match(up, /from\('referral_codes'\)[\s\S]*?out\.referrals = !rc\.error/, 'the referral card only once its tables exist');
  assert.doesNotMatch(read('app/UpgradesStore.jsx'), /עוד לא פעיל|נעדכן כש|בקרוב/, 'no "coming soon" anywhere in the store');
});

await ok('home: the card shows only when something is close to running out', () => {
  assert.equal(homeNudgePack(data(), ON), null, 'a quiet month: nothing on home');
  assert.equal(homeNudgePack(data({ packs: [usage('posts', 1), usage('reels', 8)] }), ON)?.key, 'reels');
  assert.equal(homeNudgePack(data({ packs: [usage('advisor', 100)] }), ON)?.key, 'advisor');
});

// ── opening the store ──────────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('openUpgrades opens the store at that pack; without the store mounted it falls back to the billing add-ons', () => {
  const seen: { type: string; detail: unknown }[] = [];
  const t = { __kalmeaUpgradesMounted: true, dispatchEvent: (e: Event) => { seen.push({ type: e.type, detail: (e as CustomEvent).detail }); return true; } };
  openUpgrades('reels', t);
  openUpgrades(undefined, t);
  assert.deepEqual(seen, [{ type: UPGRADES_EVENT, detail: { pack: 'reels' } }, { type: UPGRADES_EVENT, detail: {} }]);
  const fb: string[] = [];
  openUpgrades('posts', { dispatchEvent: (e: Event) => { fb.push(e.type); return true; } });
  assert.deepEqual(fb, [OPEN_ADDONS_EVENT]);
  assert.notEqual(newRequestId(), newRequestId());
  assert.match(newRequestId(), /^[A-Za-z0-9-]{8,64}$/, 'the route accepts the id the browser makes');
});

// ── a purchase can never become two charges ─────────────────────────────────────────────────────────────────────────────────────
const T = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-11-09T09:00:00Z');
function shop(findOpenAddon?: (t: string, p: string, since: string) => Promise<PaymentRecord | null>) {
  const charges: unknown[] = [];
  const payments: PaymentRecord[] = [];
  let id = 0;
  const repo: any = {
    getSub: async () => ({ id: 'sub1', tenant_id: T, price: 349, status: 'active', token_ref: 'tok_1', card_last4: '4242' }),
    getTenant: async () => ({ id: T, name: 'בדיקה', phone: '0500000000' }),
    insertPayment: async (r: any) => { const p = { ...r, id: `p${++id}`, created_at: NOW.toISOString() }; payments.push(p); return p; },
    updatePayment: async (pid: string, patch: any) => { Object.assign(payments.find((p) => p.id === pid)!, patch); },
    insertAddon: async () => {},
    ...(findOpenAddon ? { findOpenAddon } : {}),
  };
  const d: Deps = {
    repo,
    payments: { createCardSession: async () => ({ url: '' }), charge: async (i: unknown) => { charges.push(i); return { ok: true, providerPaymentId: 'pp1' }; } } as any,
    invoicing: { issueInvoice: async () => ({ ok: true, number: '1', url: 'https://example.test/doc' }) } as any,
    now: () => NOW,
    newIdentifier: () => 123456,
  };
  return { d, charges, payments };
}

await ok('an open charge of the same pack (a double tap on another instance) is answered "in progress", nothing is charged', async () => {
  let asked: string[] = [];
  const s = shop(async (t, p, since) => { asked = [t, p, since]; return { id: 'p0', status: 'pending' } as PaymentRecord; });
  const r = await buyAddon(s.d, T, ADDON_PACKS.reels);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'in-progress']);
  assert.equal(s.charges.length + s.payments.length, 0);
  assert.deepEqual(asked, [T, 'reels', new Date(NOW.getTime() - ADDON_OPEN_WINDOW_MS).toISOString()]);
});

await ok('the ledger check fails closed: a read error charges nothing', async () => {
  const s = shop(async () => { throw new Error('findOpenAddon: timeout'); });
  await assert.rejects(() => buyAddon(s.d, T, ADDON_PACKS.posts));
  assert.equal(s.charges.length, 0);
});

await ok('nothing open: one charge, as before', async () => {
  const s = shop(async () => null);
  const r = await buyAddon(s.d, T, ADDON_PACKS.posts);
  assert.equal(r.ok, true);
  assert.equal(s.charges.length, 1);
});

await ok('the routes: rate-limited, tenant from the session, a requestId replay, never the token reference', () => {
  const addon = read('app/api/billing/addon/route.ts');
  assert.match(addon, /checkTenantLimit\(c\.tenantId, 'billing-addon'\)/);
  assert.match(addon, /body\?\.requestId/);
  assert.match(addon, /running\.has\(lock\)/, 'a second request while one runs is "in progress"');
  assert.match(addon, /finally \{\s*running\.delete\(lock\)/, 'the lock is always released');
  assert.match(addon, /'in-progress':/);
  const up = read('app/api/billing/upgrades/route.ts');
  assert.match(up, /if \(!packsOn && !annualOn && !refOn\) return NextResponse\.json\(\{ success: false, hidden: true \}\)/, 'all off: reads nothing');
  assert.match(up, /checkTenantLimit\(tenantId, 'billing-upgrades'\)/);
  assert.match(up, /callerTenantId\(session\)/, 'the tenant comes from her session');
  assert.doesNotMatch(up, /token_ref|select\('\*'\)/, 'the card token is never read');
  assert.match(up, /sub\.status !== 'canceled'/, 'a cancelled subscription\'s card is not offered for a charge');
  for (const p of ['billing-addon', 'billing-upgrades'] as const) assert.ok(RATE_POLICIES[p], `${p} has a policy`);
  assert.match(read('lib/billing/repo.ts'), /async findOpenAddon[\s\S]*?if \(error\) fail\(error, 'findOpenAddon'\)/, 'the real repo fails closed too');
  // The billing card and the store read the same numbers.
  assert.match(read('app/api/billing/status/route.ts'), /addonUsageFor\(c\.tenantId\)/);
  assert.match(up, /addonUsageFor\(tenantId\)/);
});

// ── the real components ────────────────────────────────────────────────────────────────────────────────────────────────────────
const store = await importApp('app/UpgradesStore.jsx');
const { UpgradeChip, StoreBody, UpgradesEntry, UsageMeter, primeUpgrades } = store;
const withFlags = async (env: Record<string, string>, fn: () => void | Promise<void>) => {
  const keys = Object.keys(ON);
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { await fn(); } finally { for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; } }
};

await ok('the chip renders on each metered page\'s pack, quiet, and points at that pack', () => withFlags(ON, () => {
  primeUpgrades(data());
  for (const k of ADDON_PACK_KEYS) {
    const html = renderApp(UpgradeChip, { pack: k, meter: true });
    assert.match(html, new RegExp(`data-testid="upgrade-chip-${k}"`), `${k}: the chip renders`);
    assert.match(html, new RegExp(`data-pack="${k}"`), `${k}: it opens its own pack`);
    assert.match(html, /data-level="quiet"/);
    assert.ok(textOf(html).includes(pageChipHe(k, 'quiet')), `${k}: the quiet copy`);
    assert.ok(textOf(html).includes('השתמשת ב-'), `${k}: the meter`);
  }
}));

await ok('the chip turns into the stronger nudge at 80% and at the cap; a fresher count from the screen wins', () => withFlags(ON, () => {
  primeUpgrades(data({ packs: [usage('reels', 8), usage('posts', 9)] }));
  assert.ok(textOf(renderApp(UpgradeChip, { pack: 'reels' })).includes(pageChipHe('reels', 'near')));
  assert.ok(textOf(renderApp(UpgradeChip, { pack: 'posts' })).includes(pageChipHe('posts', 'full')), '9 of 9 posts');
  assert.ok(textOf(renderApp(UpgradeChip, { pack: 'posts', used: 1, cap: 9 })).includes(pageChipHe('posts', 'quiet')), 'the generator\'s own count wins');
}));

await ok('the chip is hidden with packs off, with billing off, and before the server answered', () => {
  primeUpgrades(data());
  return withFlags({ NEXT_PUBLIC_REFERRALS: '1' }, () => {
    assert.equal(renderApp(UpgradeChip, { pack: 'reels' }), '', 'packs off');
  }).then(() => withFlags(ON, () => {
    primeUpgrades(data({ billing: false, packs: [] }));
    assert.equal(renderApp(UpgradeChip, { pack: 'reels' }), '', 'billing off');
    primeUpgrades(null);
    assert.equal(renderApp(UpgradeChip, { pack: 'reels' }), '', 'no data yet: no button that could lead nowhere');
  }));
});

await ok('the store list: warm cards, each with what she gets, the price with the price note, and one button', () => withFlags(ON, () => {
  const d = data();
  const html = renderApp(StoreBody, { d, view: null });
  const t = textOf(html);
  for (const k of ADDON_PACK_KEYS) {
    assert.match(html, new RegExp(`data-testid="upgrade-card-${k}"`));
    assert.ok(t.includes(packWhatHe(k)) && t.includes(`${ADDON_PACKS[k].price} ₪`), `${k}: what and how much`);
  }
  assert.ok(t.includes(priceNoteHe()), 'the price note');
  assert.ok(t.includes('תשלום שנתי, חודשיים מתנה') && t.includes(annualSavingHe(349)), 'the yearly card shows the saving');
  assert.ok(t.includes('חברה מביאה חברה'), 'the referral card');
  const btns = buttonsOf(html);
  assert.ok(btns.includes('לעבור לשנתי ולחסוך') && btns.includes('להזמנת חברה'));
  for (const k of ADDON_PACK_KEYS) assert.ok(btns.includes(addonButtonHe(ADDON_PACKS[k])), `${k}: one button`);
}));

await ok('the confirm sheet: price, last four, one "confirm"; nothing charges from the list', () => withFlags(ON, () => {
  const d = data();
  const list = renderApp(StoreBody, { d, view: null });
  assert.doesNotMatch(list, /upgrade-pay-/, 'the list has no charging button at all');
  const html = renderApp(StoreBody, { d, view: { kind: 'pack', key: 'reels' } });
  const t = textOf(html);
  assert.match(html, /data-testid="upgrade-confirm-reels"/);
  assert.ok(t.includes('29 ₪ יחויבו בכרטיס שמסתיים ב-') && t.includes('4242'), t);
  assert.ok(t.includes('חיוב אחד, לחודש הזה בלבד'));
  assert.ok(t.includes('מצב בדיקה: לא נגבה כסף אמיתי'), 'mock mode says so');
  assert.deepEqual(buttonsOf(html), ['אישור וחיוב', 'ביטול']);
  const busy = renderApp(StoreBody, { d, view: { kind: 'pack', key: 'reels' }, busy: true });
  assert.match(busy, /<button[^>]*data-testid="upgrade-pay-reels"[^>]*disabled=""/, 'disabled while charging: a double tap does nothing');
  assert.ok(buttonsOf(busy).includes('מחייבת…'));
}));

await ok('no saved card: she is guided to save one; demo and an unconfigured deployment cannot charge', () => withFlags(ON, () => {
  const noCard = renderApp(StoreBody, { d: data({ card: null }), view: { kind: 'pack', key: 'posts' } });
  assert.match(noCard, /data-testid="upgrade-no-card"/);
  assert.deepEqual(buttonsOf(noCard), ['לשמירת כרטיס']);
  assert.doesNotMatch(noCard, /upgrade-pay-/);
  const demo = renderApp(StoreBody, { d: data({ demo: true }), view: { kind: 'pack', key: 'posts' } });
  assert.ok(textOf(demo).includes('בחשבון הדגמה לא מחייבים'));
  assert.doesNotMatch(demo, /upgrade-pay-/);
  const off = renderApp(StoreBody, { d: data({ configured: false }), view: { kind: 'pack', key: 'posts' } });
  assert.doesNotMatch(off, /upgrade-pay-/);
}));

await ok('success: the new amount shows at once; yearly needs the consent tick', () => withFlags(ON, () => {
  const d = data({ packs: [usage('reels', 10, 20, 10)] });
  const ok1 = textOf(renderApp(StoreBody, { d, view: { kind: 'success', key: 'reels' } }));
  assert.ok(ok1.includes('עכשיו יש לך 20 רילסים החודש') && ok1.includes('השתמשת ב-10 מתוך 20 החודש'), ok1);
  const an = renderApp(StoreBody, { d: data(), view: { kind: 'annual' }, consentOk: false });
  assert.match(an, /data-testid="upgrade-annual-consent"/);
  assert.match(an, /<button[^>]*data-testid="upgrade-annual-confirm"[^>]*disabled=""/, 'no tick, no switch');
  assert.ok(textOf(an).includes('עכשיו לא מחויב כלום'));
}));

await ok('entry points: Settings when the store has a card; home only when something runs out; nothing with every flag off', async () => {
  await withFlags(ON, () => {
    primeUpgrades(data());
    assert.ok(textOf(renderApp(UpgradesEntry, { variant: 'settings' })).includes('שדרוגים ✨'));
    assert.equal(renderApp(UpgradesEntry, { variant: 'home' }), '', 'a quiet month');
    primeUpgrades(data({ packs: [usage('reels', 9)] }));
    assert.match(renderApp(UpgradesEntry, { variant: 'home' }), /data-pack="reels"/);
    primeUpgrades(data({ billing: false, packs: [], annual: null, referrals: false }));
    assert.equal(renderApp(UpgradesEntry, { variant: 'settings' }), '', 'an empty store hides its entry');
  });
  await withFlags({}, () => {
    primeUpgrades(data());
    assert.equal(renderApp(UpgradesEntry, { variant: 'settings' }), '');
    assert.equal(renderApp(store.default, {}), '', 'the sheet itself renders nothing with every flag off');
  });
  assert.match(renderApp(UsageMeter, { used: 3, cap: 10 }), /aria-valuenow="30"/);
});

await ok('every flag off: no entry point, no chip on any page, no store, nothing fetched', () => withFlags({}, () => {
  primeUpgrades(data());
  for (const k of ADDON_PACK_KEYS) assert.equal(renderApp(UpgradeChip, { pack: k, meter: true }), '', `${k}: no chip`);
  assert.equal(renderApp(UpgradesEntry, { variant: 'settings' }), '');
  assert.equal(renderApp(UpgradesEntry, { variant: 'home' }), '');
  assert.equal(renderApp(store.default, {}), '');
  assert.equal(store.packAvailable('reels'), false, 'the cap-hit toast gets no pack button');
  assert.match(read('app/UpgradesStore.jsx'), /export async function loadUpgrades\(force = false\) \{\n  if \(!upgradesFlagsOn\(\)\) return null;/, 'and nothing is fetched');
}));

await ok('nothing purchasable (flags on, billing off): no entry point and no chip either', () => withFlags(ON, () => {
  primeUpgrades(data({ billing: false, packs: [], annual: null, referrals: false }));
  for (const k of ADDON_PACK_KEYS) assert.equal(renderApp(UpgradeChip, { pack: k }), '', `${k}: no chip`);
  assert.equal(renderApp(UpgradesEntry, { variant: 'settings' }), '');
  assert.equal(renderApp(UpgradesEntry, { variant: 'home' }), '');
  assert.equal(store.packAvailable('posts'), false);
}));

await ok('the post generator renders its chip, which opens the posts pack', async () => withFlags(ON, async () => {
  primeUpgrades(data());
  const Generate = (await importApp('app/design/Generate.jsx')).default;
  const html = renderApp(Generate, { settings: { business_name: 'בדיקה', business_fields: ['cosmetics'] }, readOnly: false, toast: () => {} });
  assert.match(html, /data-testid="upgrade-chip-posts"[^>]*data-pack="posts"|data-pack="posts"[^>]*data-testid="upgrade-chip-posts"/);
  const src = read('app/design/Generate.jsx');
  assert.match(src, /UPGRADES_CHANGED_EVENT, reload/, 'a bought pack counts in the generator at once');
  assert.match(src, /atCap && addonPacksEnabled\(\)/, 'the existing cap-hit offer stays');
}));

await ok('wiring (source, app/beautyos.jsx cannot render alone): the reels, advisor and skin scan screens, the store and its entries', () => {
  const src = read('app/beautyos.jsx');
  assert.match(src, /<UpgradeChip pack="reels" meter\/>/);
  assert.match(src, /<UpgradeChip pack="advisor" meter/);
  assert.equal((src.match(/<UpgradeChip pack="skinscan"/g) || []).length, 2, 'the scanner link card and the client\'s scans tab');
  assert.match(src, /<UpgradesStore toast=\{toast\}/);
  assert.match(src, /<UpgradesEntry variant="settings"\/>/);
  assert.match(src, /<UpgradesEntry variant="home"/);
  assert.match(src, /onClick: \(\) => openUpgrades\(pack\.key\)/, 'the cap-hit toast opens the same one-tap flow');
  assert.match(src, /data-testid="addon-offer-reels" onClick=\{\(\)=>openUpgrades\(/);
  assert.match(read('app/BillingCard.jsx'), /id="billing-card"/, 'no card: the store sends her to the existing card flow');
  assert.match(read('app/BusinessReferralCard.jsx'), /id="business-referral"/);
  const ui = read('app/UpgradesStore.jsx');
  assert.match(ui, /requestId: rid, retry/, 'one id per purchase intent, sent with every try');
  assert.match(ui, /if \(busy\) return;/);
  assert.doesNotMatch(ui, /--brand-|pcTint|herAccent/, 'Kalmea\'s own store wears Kalmea chrome, not her accent');
});

await ok('admin: this month\'s packs, only with packs on', () => {
  const a = read('app/dashboard/admin/BillingAdmin.tsx');
  assert.match(a, /addonPacksEnabled\(\) && <AddonPurchasesAdmin db=\{db\} \/>/);
  const p = read('app/dashboard/admin/AddonPurchasesAdmin.tsx');
  assert.match(p, /\.eq\('period_month', month\)/);
  assert.match(p, /'עסק', 'חבילה', 'סכום', 'מתי'/);
});


// ── Vercel review, 2026-11-09 ──────────────────────────────────────────────────────────────────────────────────────────────────
await ok('review 1: a forced read after a purchase is never answered by an older read still in flight', () => withFlags(ON, async () => {
  const { loadUpgrades, currentUpgrades } = store;
  primeUpgrades(null);
  const pending: ((v: unknown) => void)[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = () => new Promise((res) => pending.push(res));
  const answer = (cap: number) => ({ ok: true, json: async () => data({ packs: [usage('reels', 10, cap, cap - 10)] }) });
  try {
    const old = loadUpgrades();            // started before the purchase
    const fresh = loadUpgrades(true);      // the forced read after it
    assert.equal(pending.length, 2, 'the forced read starts its own request instead of reusing the old one');
    pending[1](answer(20));
    const got = await fresh;
    assert.equal(got.packs[0].cap, 20, 'the forced read returns its own, new answer');
    pending[0](answer(10));
    await old;
    assert.equal(currentUpgrades().packs[0].cap, 20, 'the older answer, arriving late, does not overwrite the newer one');
  } finally { (globalThis as any).fetch = realFetch; primeUpgrades(null); }
}));

await ok('review 2: the store renders above the client drawer, in a portal', () => {
  const ui = read('app/UpgradesStore.jsx');
  assert.match(ui, /createPortal\(/);
  assert.match(ui, /document\.body,/);
  const z = Number(/export const STORE_Z = (\d+)/.exec(ui)?.[1]);
  const app = read('app/beautyos.jsx');
  const drawer = Number(/zIndex:(\d+)\}\} data-overlay="client"/.exec(app)?.[1]);
  const more = Number(/zIndex:(\d+),background:"rgba\(48,24,72,0\.34\)"/.exec(app)?.[1]);
  assert.ok(drawer > 0 && z > drawer, `store ${z} above the client drawer ${drawer}`);
  assert.ok(more > 0 && z > more, `and above the "more" sheet ${more}`);
  assert.ok(z < 4000, 'below the confirm dialog and the toasts');
  assert.match(app, /onOpenCard=\{\(\)=>\{setSelectedClient\(null\);openAddonsRef/, 'sending her to save a card closes the client drawer first');
});

const ownerDb = (tenant: any, member: any, fail = false) => ({
  from: (t: string) => {
    const row = t === 'tenants' ? tenant : member;
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => (fail ? { data: null, error: { message: 'down' } } : { data: row, error: null }) };
    return q;
  },
});

await ok('security: only the owner moves money; a member, or an unreadable answer, cannot', async () => {
  assert.equal(await callerIsOwner(ownerDb({ owner_id: 'u1' }, null), 't', 'u1'), true);
  assert.equal(await callerIsOwner(ownerDb({ owner_id: 'u1' }, { role: 'owner' }), 't', 'u2'), false, 'owner_id decides when set');
  assert.equal(await callerIsOwner(ownerDb({ owner_id: null }, { role: 'member' }), 't', 'u2'), false);
  assert.equal(await callerIsOwner(ownerDb({ owner_id: null }, { role: 'owner' }), 't', 'u2'), true);
  assert.equal(await callerIsOwner(ownerDb({ owner_id: null }, { role: null }), 't', 'u2'), true, 'the original single-user signup');
  assert.equal(await callerIsOwner(ownerDb({ owner_id: null }, null), 't', 'u2'), false);
  assert.equal(await callerIsOwner(ownerDb(null, null, true), 't', 'u1'), false, 'fails closed');
  const addon = read('app/api/billing/addon/route.ts');
  assert.match(addon, /if \(!\(await callerIsOwner\(admin\(\), c\.tenantId, c\.userId\)\)\)/);
  assert.ok(addon.indexOf('callerIsOwner(admin()') < addon.indexOf('buyAddon({'), 'checked before any charge');
  assert.match(addon, /const ridKey = rid \? `\$\{c\.tenantId\}\|\$\{c\.userId\}\|\$\{rid\}`/, 'a replayed answer is only ever her own');
  assert.match(addon, /answered\.size > REPLAY_MAX/, 'the replay memory is bounded');
  assert.match(addon, /checkIpLimit\(req, 'billing-addon'\)/);
  assert.match(read('app/api/billing/period/route.ts'), /callerIsOwner\(admin\(\), c\.tenantId, c\.userId\)/, 'the yearly switch too');
  const up = read('app/api/billing/upgrades/route.ts');
  assert.match(up, /checkIpLimit\(request, 'billing-upgrades'\)/);
  assert.match(up, /if \(!\(await callerIsOwner\(db, tenantId, user\.id\)\)\) return NextResponse\.json\(\{ \.\.\.out, configured: false \}\)/, 'a member gets no card digits and nothing chargeable');
  assert.ok(up.indexOf('callerIsOwner(db') < up.indexOf("card_last4"), 'before the card is read');
  assert.match(up, /select\('id, price, status, next_charge_at, card_last4'\)/, 'only the last four, never the brand, token or anything else');
});


await ok('security: replacing the card, cancelling, and the billing details are owner-only', () => {
  for (const f of ['app/api/billing/card/route.ts', 'app/api/billing/cancel/route.ts']) {
    const src = read(f);
    assert.match(src, /if \(!\(await callerIsOwner\(admin\(\), c\.tenantId, c\.userId\)\)\) return NextResponse\.json\(\{ success: false, code: 'not-owner'/, f);
    const at = src.indexOf('callerIsOwner(admin()');
    assert.ok(at > 0 && at < src.indexOf('billing()') && (src.indexOf('cancelSubscription(') < 0 || at < src.lastIndexOf('cancelSubscription(')), `${f}: checked before anything happens`);
  }
  const st = read('app/api/billing/status/route.ts');
  assert.match(st, /const owner = await callerIsOwner\(admin\(\), c\.tenantId, c\.userId\);/);
  assert.match(st, /card_last4: null, card_brand: null \} : null, payments: \[\], addons: undefined, owner: false/, 'a member gets no card digits, no history, no packs');
  assert.equal((st.match(/forMember\(/g) || []).length, 2, 'both answers with data go through it');
  const card = read('app/BillingCard.jsx');
  assert.match(card, /s\.owner === false && <p data-testid="billing-member"/);
  assert.match(card, /!isDemo && s\.owner !== false && sub && sub\.status !== 'canceled'/, 'no cancel button for a member');
});


// ── purchase idempotency by request id (2026-11-10): the server is the authority ─────────────────────────────────────────────────
function ledger(opts: { tracked?: boolean; charge?: any; insertFailsOnceWith?: string } = {}) {
  const tracked = opts.tracked !== false;
  const payments: any[] = [];
  const charges: any[] = [];
  let id = 0;
  let failOnce = opts.insertFailsOnceWith || '';
  const repo: any = {
    getSub: async () => ({ id: 'sub1', tenant_id: T, price: 349, status: 'active', token_ref: 'tok_1', card_last4: '4242' }),
    getTenant: async () => ({ id: T, name: 'בדיקה', phone: '0500000000' }),
    insertPayment: async (r: any) => {
      await Promise.resolve();
      if (failOnce) { const m = failOnce; failOnce = ''; throw new Error(m); }
      if (!tracked && 'request_id' in r) throw new Error('column "request_id" of relation "billing_payments" does not exist');
      // The partial unique index (tenant_id, request_id) where request_id is not null.
      if (r.request_id && payments.some((p) => p.tenant_id === r.tenant_id && p.request_id === r.request_id)) throw new Error('duplicate key value violates unique constraint "billing_payments_tenant_request"');
      const p = { ...r, id: `p${++id}`, created_at: NOW.toISOString() }; payments.push(p); return p;
    },
    updatePayment: async (pid: string, patch: any) => { Object.assign(payments.find((p) => p.id === pid)!, patch); },
    insertAddon: async () => {},
    findOpenAddon: async () => null,
    findAddonByRequest: async (t: string, rid: string) => (tracked ? { supported: true, row: payments.find((p) => p.tenant_id === t && p.request_id === rid) || null } : { supported: false, row: null }),
    findRecentAddon: async (t: string, pack: string) => [...payments].reverse().find((p) => p.tenant_id === t && p.note === pack) || null,
  };
  const d: Deps = {
    repo,
    payments: { createCardSession: async () => ({ url: '' }), charge: async (i: unknown) => { charges.push(i); await Promise.resolve(); return opts.charge ?? { ok: true, providerPaymentId: `pp${charges.length}` }; } } as any,
    invoicing: { issueInvoice: async () => ({ ok: true, number: '1', url: 'https://example.test/doc' }) } as any,
    now: () => NOW,
    newIdentifier: (() => { let u = 1000; return () => ++u; })(),
  };
  return { d, payments, charges };
}

await ok('lost answer, then a retry with the same id: the first charge\'s outcome, never a second charge', async () => {
  const l = ledger();
  const first = await buyAddon(l.d, T, ADDON_PACKS.reels, { requestId: 'req-aaaaaaaa' });
  assert.equal(first.ok, true);                                     // the answer to this one is "lost" on the way back
  const again = await buyAddon(l.d, T, ADDON_PACKS.reels, { requestId: 'req-aaaaaaaa', retry: true });
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.replay, true, 'answered from the saved charge');
  assert.equal(l.charges.length, 1, 'one intent, one charge');
  assert.equal(l.payments.length, 1);
  assert.equal(l.payments[0].request_id, 'req-aaaaaaaa', 'the id is saved on the charge');
  const other = await buyAddon(l.d, T, ADDON_PACKS.reels, { requestId: 'req-bbbbbbbb' });
  assert.equal(other.ok, true);
  assert.equal(l.charges.length, 2, 'a NEW intent (a new id) is a new purchase');
});

await ok('double tap: the same id twice at the same moment is one charge (the unique index decides)', async () => {
  const l = ledger();
  const [a, b] = await Promise.all([
    buyAddon(l.d, T, ADDON_PACKS.posts, { requestId: 'req-cccccccc' }),
    buyAddon(l.d, T, ADDON_PACKS.posts, { requestId: 'req-cccccccc' }),
  ]);
  assert.equal(l.charges.length, 1, 'never two charges');
  assert.equal(l.payments.length, 1);
  assert.ok([a, b].some((r) => r.ok), 'one of them charged');
  assert.ok([a, b].every((r) => r.ok || (!r.ok && (r.reason === 'pending' || r.reason === 'in-progress'))), 'the other is answered from that row, not refused as "not charged"');
});

await ok('a retried id whose charge is still open, or was declined, gets that outcome', async () => {
  const pend = ledger({ charge: { ok: false, code: 'duplicate', error: 'seen' } });
  (pend.d.payments as any).lookup = async () => ({ ok: true, found: true, status: 'pending' });
  const r1 = await buyAddon(pend.d, T, ADDON_PACKS.advisor, { requestId: 'req-dddddddd' });
  assert.deepEqual([r1.ok, !r1.ok && r1.reason], [false, 'pending']);
  const r2 = await buyAddon(pend.d, T, ADDON_PACKS.advisor, { requestId: 'req-dddddddd', retry: true });
  assert.deepEqual([r2.ok, !r2.ok && r2.reason], [false, 'pending']);
  assert.equal(pend.charges.length, 1, 'still the one charge attempt');
  const dec = ledger({ charge: { ok: false, code: 'declined', error: 'refused' } });
  await buyAddon(dec.d, T, ADDON_PACKS.advisor, { requestId: 'req-eeeeeeee' });
  const r3 = await buyAddon(dec.d, T, ADDON_PACKS.advisor, { requestId: 'req-eeeeeeee', retry: true });
  assert.deepEqual([r3.ok, !r3.ok && r3.reason], [false, 'declined'], 'the provider\'s "no" for this id, said again');
  assert.equal(dec.charges.length, 1);
});

await ok('before the migration: the purchase still works, and a retry is matched to the recent charge, never charged again', async () => {
  const l = ledger({ tracked: false });
  const first = await buyAddon(l.d, T, ADDON_PACKS.reels, { requestId: 'req-ffffffff' });
  assert.equal(first.ok, true);
  assert.equal(l.payments[0].request_id, undefined, 'no column, no id written');
  const retry = await buyAddon(l.d, T, ADDON_PACKS.reels, { requestId: 'req-ffffffff', retry: true });
  assert.equal(retry.ok, true);
  assert.equal(l.charges.length, 1, 'the retry was answered by the recent charge of the same pack');
  // A deploy that runs between the read and the insert (the column vanished): the insert falls back without the id, once.
  const m = ledger({ insertFailsOnceWith: 'column "request_id" of relation "billing_payments" does not exist' });
  const r = await buyAddon(m.d, T, ADDON_PACKS.posts, { requestId: 'req-gggggggg' });
  assert.equal(r.ok, true);
  assert.equal(m.charges.length, 1);
});

await ok('the store\'s verdicts: "not charged" only when the server says so for that id', () => {
  assert.equal(requestVerdict({ state: 'succeeded' }), 'done');
  assert.equal(requestVerdict({ state: 'failed' }), 'declined');
  for (const st of ['pending', 'none', 'unreachable', 'untracked'] as const) assert.equal(requestVerdict({ state: st }), 'wait', st);
  assert.equal(requestVerdict({ state: 'untracked', recent: 'succeeded' }), 'done', 'pre-migration fallback: a recent success of that pack');
  assert.equal(requestVerdict({ state: 'untracked', recent: 'failed' }), 'wait', 'pre-migration: a recent failure may be an older attempt, not "not charged"');
  assert.equal(requestVerdict(null), 'wait');
  assert.match(requestStateHe({ state: 'failed' }), /לא חויבת/);
  for (const st of ['pending', 'none', 'unreachable', 'untracked'] as const) assert.doesNotMatch(requestStateHe({ state: st, recent: 'failed' }), /לא חויבת/, st);
  assert.doesNotMatch(LOST_ANSWER_HE, /לא חויבת/);
  assert.match(requestStateHe({ state: 'none' }), /^בודקות…/);
  for (const st of ['succeeded', 'failed', 'pending', 'none', 'unreachable'] as const) assert.ok(!/[—–]/.test(requestStateHe({ state: st })));
  assert.ok(isFinalRefusal(402, { success: false, reason: 'declined' }));
  assert.ok(!isFinalRefusal(500, { success: false }) && !isFinalRefusal(202, { success: false, reason: 'pending' }) && !isFinalRefusal(0, null));
});

await ok('one id per intent: kept across a lost answer, a retry and a reopened sheet; a new one only after a definitive outcome', () => {
  const { purchaseIntent, openIntent, settleIntent } = store;
  settleIntent('reels');
  assert.equal(openIntent('reels'), '');
  const a = purchaseIntent('reels');
  assert.equal(purchaseIntent('reels'), a, 'a retry sends the same id');
  assert.equal(openIntent('reels'), a, 'reopening the sheet finds it');
  assert.notEqual(purchaseIntent('posts'), a, 'each pack has its own intent');
  settleIntent('reels');
  assert.notEqual(purchaseIntent('reels'), a, 'after a definitive outcome, a new intent');
  settleIntent('reels'); settleIntent('posts');
});

await ok('reopen after a lost answer: the store asks the server about that id, by id only', async () => withFlags(ON, async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (u: string) => { seen.push(String(u)); return { ok: true, json: async () => ({ success: true, request: { state: 'pending' } }) }; };
  try {
    const a = await store.requestStatus('req-hhhhhhhh', 'reels');
    assert.deepEqual(a, { state: 'pending' });
    assert.deepEqual(seen, ['/api/billing/upgrades?request=req-hhhhhhhh&pack=reels']);
    (globalThis as any).fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await store.requestStatus('req-hhhhhhhh', 'reels'), { state: 'unreachable' }, 'a failed lookup is "could not check"');
    (globalThis as any).fetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
    assert.deepEqual(await store.requestStatus('req-hhhhhhhh', 'reels'), { state: 'unreachable' });
  } finally { (globalThis as any).fetch = realFetch; }
  const ui = read('app/UpgradesStore.jsx');
  const flow = ui.slice(ui.indexOf('const recheck = useCallback'), ui.indexOf('const switchAnnual'));
  assert.match(flow, /if \(isPack\) recheck\(pack\)/, 'reopening a pack checks its open intent first');
  assert.match(flow, /const retry = !!openIntent\(key\);\s*const rid = purchaseIntent\(key\);/);
  assert.match(flow, /a = await requestStatus\(rid, key\);/, 'verification is the lookup by id');
  assert.doesNotMatch(flow, /Date\.now\(\)|new Date\(|recentAddons|knownAddonIds|newRequestId/, 'no clock, no baseline, no window, no fresh id mid-intent');
  assert.match(flow, /if \(v === 'declined'\) settleIntent\(key\);/);
}));

await ok('the lookup route: owner only, her tenant only, rate-limited, the state and nothing else', () => {
  const up = read('app/api/billing/upgrades/route.ts');
  const fn = up.slice(up.indexOf('async function requestStatus'));
  assert.ok(up.indexOf("checkTenantLimit(tenantId, 'billing-upgrades')") < up.indexOf('return requestStatus('), 'rate-limited before the lookup');
  assert.match(fn, /callerIsOwner\(db, tenantId, userId\)/);
  assert.match(fn, /findAddonByRequest!\(tenantId, requestId\)/, 'scoped to her tenant');
  assert.match(fn, /request: \{ state: f\.row \? stateOf\(String\(f\.row\.status\)\) : 'none' \}/, 'only the state leaves the server');
  assert.match(fn, /REQUEST_ID\.test\(requestId\)/);
  assert.doesNotMatch(up, /recentAddons/, 'the store no longer needs a list of her charges');
  const repo = read('lib/billing/repo.ts');
  assert.match(repo, /async findAddonByRequest[\s\S]*?eq\('tenant_id', tenantId\)[\s\S]*?return \{ supported: false, row: null \}[\s\S]*?fail\(error, 'findAddonByRequest'\)/, 'missing column = not tracked; any other error throws');
  const addon = read('app/api/billing/addon/route.ts');
  assert.match(addon, /\{ requestId: rid \|\| null, retry: body\?\.retry === true \}/);
  assert.match(addon, /return status === 402 \? remember\(a\) : reply\(a\);/, 'a "pending" answer is never replayed from memory');
});

await ok('the migration: one nullable column, a partial unique index, a clean copy to run', () => {
  const sql = read('supabase/migrations/add_addon_request_id_2026-11-10.sql');
  assert.match(sql, /alter table public\.billing_payments add column if not exists request_id text;/);
  assert.match(sql, /create unique index if not exists billing_payments_tenant_request\s+on public\.billing_payments \(tenant_id, request_id\)\s+where request_id is not null;/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(drop|delete|update)\b/i, 'nothing is removed or changed');
});

primeUpgrades(null);
console.log(`upgrades store: passed ${n} failed 0`);

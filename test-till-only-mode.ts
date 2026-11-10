// test-till-only-mode.ts
//
// "מה מוצג לי במערכת" (lib/viewMode.ts): the till-only view preference.
//   1. Default unchanged: no value, junk, or "all" shows every screen exactly as before.
//   2. "קופה, ניקובים ודוחות בלבד" hides the diary, leads, messages, content, insights and advisor from the nav, the page and
//      messages Settings groups, and keeps home, till, clients, packages, income, help and settings.
//   3. The save route's payload filter keeps only the two literal values.
//   4. Switching back to "all" restores every screen.
//   5. The dashboard wires it in (source checks: the screen is one 14k-line component, not renderable in plain node).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  viewModeOf, isTillOnly, cleanViewMode, viewAllowsTab, viewAllowsSettingsGroup, bottomNavIds, moreNavIds,
  TILL_ONLY_HIDDEN_TABS, VIEW_MODE_LABELS,
} from './lib/viewMode.ts';
import { pickSettingsPayload, mergeStoredBags } from './lib/settingsColumns.ts';
import { HELP_SECTIONS } from './lib/helpSections.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; };

const ALL_TABS = ['dashboard', 'insights', 'calendar', 'clients', 'leads', 'cashier', 'tax', 'whatsapp', 'campaigns', 'community', 'packages', 'protocols', 'advisor', 'help'];
const MORE = ['insights', 'tax', 'packages', 'protocols', 'advisor', 'community', 'help'];
const GROUPS = ['business', 'page', 'booking', 'payments', 'messages', 'clients', 'connections', 'advanced'];
const till = { automations: { view_mode: 'till_only', loyalty: { enabled: true } } };

// ── 1. Default unchanged ─────────────────────────────────────────────────────
t('default is all, for every shape of settings', () => {
  for (const s of [null, undefined, {}, { automations: null }, { automations: [] }, { automations: 'x' }, { automations: {} },
    { automations: { view_mode: 'all' } }, { automations: { view_mode: 'TILL_ONLY' } }, { automations: { view_mode: true } },
    { automations: { view_mode: { mode: 'till_only' } } }]) {
    assert.equal(viewModeOf(s as never), 'all', JSON.stringify(s));
    assert.equal(isTillOnly(s as never), false);
    for (const id of ALL_TABS) assert.equal(viewAllowsTab(s as never, id), true, id);
    for (const g of GROUPS) assert.equal(viewAllowsSettingsGroup(s as never, g), true, g);
    assert.deepEqual(bottomNavIds(s as never), ['dashboard', 'calendar', 'clients', 'cashier', 'campaigns']);
    assert.deepEqual(moreNavIds(s as never, MORE), MORE);
  }
});

// ── 2. Till-only hides the listed entries, keeps the sales side ──────────────
t('till-only hides the diary, leads, messages, content, insights and advisor', () => {
  assert.equal(isTillOnly(till), true);
  for (const id of ['calendar', 'leads', 'whatsapp', 'campaigns', 'insights', 'advisor', 'community', 'protocols']) {
    assert.equal(viewAllowsTab(till, id), false, `${id} hidden`);
  }
  for (const id of ['dashboard', 'cashier', 'clients', 'tax', 'packages', 'help']) assert.equal(viewAllowsTab(till, id), true, `${id} kept`);
  assert.equal(viewAllowsSettingsGroup(till, 'page'), false);
  assert.equal(viewAllowsSettingsGroup(till, 'messages'), false);
  for (const g of ['business', 'booking', 'payments', 'clients', 'connections', 'advanced']) assert.equal(viewAllowsSettingsGroup(till, g), true, g);
});

t('till-only bottom bar and more sheet', () => {
  assert.deepEqual(bottomNavIds(till), ['dashboard', 'clients', 'cashier', 'tax']);
  for (const id of bottomNavIds(till)) assert.equal(viewAllowsTab(till, id), true);
  // tax is already on the bar; the hidden ones are gone.
  assert.deepEqual(moreNavIds(till, MORE), ['packages', 'help']);
});

t('labels are the two choices, Hebrew, no em dash', () => {
  assert.deepEqual(VIEW_MODE_LABELS, { all: 'הכל', till_only: 'קופה, ניקובים ודוחות בלבד' });
  assert.equal(TILL_ONLY_HIDDEN_TABS.includes('cashier' as never), false);
});

// ── 3. Strict validation on save ─────────────────────────────────────────────
t('cleanViewMode accepts exactly the two literals', () => {
  assert.equal(cleanViewMode('all'), 'all');
  assert.equal(cleanViewMode('till_only'), 'till_only');
  for (const junk of ['', 'Till_only', ' till_only', 'tillonly', 'none', 1, 0, true, null, undefined, {}, ['till_only']]) {
    assert.equal(cleanViewMode(junk), null, JSON.stringify(junk));
  }
});

t('the save payload keeps a valid value and drops junk by name', () => {
  for (const v of ['all', 'till_only']) {
    const { payload, dropped } = pickSettingsPayload({ automations: { view_mode: v, loyalty: { enabled: true } } });
    assert.deepEqual(payload.automations, { view_mode: v, loyalty: { enabled: true } });
    assert.equal(dropped.length, 0);
  }
  for (const junk of ['everything', 'TILL_ONLY', 7, true, null, { x: 1 }, ['all'], '<script>']) {
    const { payload, dropped } = pickSettingsPayload({ automations: { view_mode: junk, loyalty: { enabled: true } } });
    assert.deepEqual(payload.automations, { loyalty: { enabled: true } }, JSON.stringify(junk));
    assert.ok(dropped.includes('automations.view_mode'));
  }
});

t('a junk save never overwrites a stored valid choice', () => {
  const { payload } = pickSettingsPayload({ automations: { view_mode: 'nope' } });
  const merged = mergeStoredBags(payload, { automations: { view_mode: 'till_only' } });
  assert.equal(viewModeOf(merged as never), 'till_only');
});

// ── 4. Switching back restores everything ────────────────────────────────────
t('switching back to all restores every screen', () => {
  const { payload } = pickSettingsPayload({ automations: { view_mode: 'all' } });
  const merged = mergeStoredBags(payload, { automations: { view_mode: 'till_only', loyalty: { enabled: true } } }) as never;
  assert.equal(viewModeOf(merged), 'all');
  for (const id of ALL_TABS) assert.equal(viewAllowsTab(merged, id), true, id);
  for (const g of GROUPS) assert.equal(viewAllowsSettingsGroup(merged, g), true, g);
  assert.deepEqual(bottomNavIds(merged), ['dashboard', 'calendar', 'clients', 'cashier', 'campaigns']);
  // Nothing else in the bag was touched by the round trip.
  assert.deepEqual((merged as { automations: Record<string, unknown> }).automations.loyalty, { enabled: true });
});

// ── 5. The dashboard wires it in ─────────────────────────────────────────────
t('beautyos.jsx uses the view preference in every nav list and on the home screen', () => {
  const src = readFileSync('./app/beautyos.jsx', 'utf8');
  assert.match(src, /from "@\/lib\/viewMode"/);
  assert.match(src, /\{id:"tax",       label:"הכנסות"\},\n  \]\.filter\(item => isTabVisible\(settings, item\.id\) && bottomNavIds\(settings\)\.includes\(item\.id\)\)/, 'bottom bar');
  assert.match(src, /const MORE_NAV = moreNavIds\(settings,/);
  assert.match(src, /isTabVisible\(settings, item\.id\) && viewAllowsTab\(settings, item\.id\)/, 'side nav');
  assert.match(src, /isTabVisible\(settings, id\) && viewAllowsTab\(settings, id\)/, 'people segments');
  assert.match(src, /!isTabVisible\(settings, activeTab\) \|\| !viewAllowsTab\(settings, activeTab\)/, 'tab backstop');
  assert.match(src, /!viewAllowsSettingsGroup\(settings, settingsGroup\)\) setSettingsGroup\("business"\)/, 'settings backstop');
  assert.match(src, /\.map\(t=>\(viewAllowsSettingsGroup\(settings,t\.k\)&&/, 'settings group tabs');
  assert.match(src, /activeTab==="dashboard"&&tillOnly&&\(<div data-testid="till-only-home"/, 'till-only home');
  assert.match(src, /!tillOnly&&activeTab==="dashboard"&&\(<div className="today-stack"/, 'full home only when not till-only');
  assert.match(src, /handleOpenCashier\(null\)\} style=\{\{background:pcGrad[^}]*\}\}>✦ תשלום חדש/, 'sale without an appointment from home');
  assert.match(src, /\{!tillOnly&&\(\s*<aside className="sidebar-aside desktop-only"/, 'desktop diary panel hidden');
  assert.match(src, /\{!tillOnly&&<button data-tour="booking-link"/, 'booking link not promoted');
  assert.match(src, /data-testid="view-mode-setting"/);
  assert.match(src, /inG\("business"\)&&\(\s*<div data-testid="view-mode-setting"/, 'the switch lives in העסק שלי');
  assert.match(src, /quietKeys=\{fbShowing\|\|tillOnly\?\["day1","day10"\]:null\}/, 'booking-link nudges quiet');
  // Nothing is removed: the full home and the diary still render in "all".
  assert.match(src, /activeTab==="calendar"&&\(/);
});

t('the public booking page does not read the view preference (old links keep working)', () => {
  for (const f of ['app/book/page.tsx', 'app/[slug]/page.tsx']) {
    let src = '';
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    assert.doesNotMatch(src, /view_mode|viewMode/, f);
  }
});

t('help mentions it in one line', () => {
  const lines = HELP_SECTIONS.flatMap((s) => s.body).filter((l) => l.includes('קופה, ניקובים ודוחות בלבד'));
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /[—–]/);
});

console.log(`till-only mode: ${n} passed`);

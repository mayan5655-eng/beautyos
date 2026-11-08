// test-review-naming-flags.ts
//
// 2026-11-05 product review, quick wins 3-5:
//   - one name per screen: "פניות" for leads, "קופה" for the till, everywhere she navigates by it;
//   - the unfinished "פרוטוקולים" toggle is not offered in Settings, but a tenant who turned it on keeps it;
//   - the stale comments the review listed now say what the code does.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { settingsToggleTabs, isTabVisible, SWITCHABLE_TABS, SWITCHABLE_LABELS, SETTINGS_TOGGLE_ONLY_WHEN_ON } from './lib/featureFlags.ts';
import { HELP_SECTIONS } from './lib/helpSections.ts';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };

const app = readFileSync('app/beautyos.jsx', 'utf8');
const block = (start: string, end: string) => { const i = app.indexOf(start); const j = app.indexOf(end, i); assert.ok(i >= 0 && j > i, start); return app.slice(i, j); };

// ── Naming ─────────────────────────────────────────────────────────────────
const bottom = block('const BOTTOM_NAV = [', '];');
const side = block('const NAV_ITEMS = [', '];');
ok(bottom.includes('{id:"cashier",   label:"קופה"}'), 'bottom bar: קופה');
ok(side.includes('{id:"cashier",  label:"קופה"}'), 'sidebar: קופה');
ok(!/label:"תשלום"/.test(bottom + side), 'the till is never "תשלום" in a nav list');
ok(side.includes('{id:"leads",    label:"פניות"}'), 'sidebar: פניות');
ok(!/"לידים"/.test(bottom + side), 'leads is never "לידים" in a nav list');
ok(app.includes('[["clients","לקוחות"],["leads","פניות"],["whatsapp","הודעות"]]'), 'the people chips already said פניות');
ok(app.includes(`selector:'button[aria-label="קופה"]'`), 'the tour still finds the till button by its new label');
ok(app.includes('{ type: "lead",    label: "פניות",   icon: "✦" }'), 'search results group: פניות');
ok(!/primaryLabel:"פתחי לידים"/.test(app) && !/label:"פתחי לידים"/.test(app), 'no "פתחי לידים" button left');
ok(!/source:"לידים"/.test(app), 'the attention list names the screen פניות');
eq(SWITCHABLE_LABELS.leads, 'פניות', 'Settings toggle: פניות');
const helpText = JSON.stringify(HELP_SECTIONS);
ok(helpText.includes('בלשונית **קופה**') && !helpText.includes('בלשונית **תשלום**'), 'help names the till screen קופה');
// The smoke scripts click the bar by its label: none may still look for the old one.
for (const f of readdirSync('scripts/smoke').filter((f) => f.endsWith('.mjs'))) {
  ok(!readFileSync(`scripts/smoke/${f}`, 'utf8').includes('aria-label="תשלום"'), `smoke ${f} uses the new till label`);
}

// ── The protocols toggle ───────────────────────────────────────────────────
eq([...SETTINGS_TOGGLE_ONLY_WHEN_ON], ['protocols'], 'only protocols is held back');
ok(!settingsToggleTabs({}).includes('protocols'), 'a new tenant is not offered the protocols toggle');
ok(!settingsToggleTabs(null).includes('protocols'), 'no settings row: not offered');
ok(!settingsToggleTabs({ automations: { screens: { protocols: false } } }).includes('protocols'), 'explicitly off: not offered');
ok(settingsToggleTabs({ automations: { screens: { protocols: true } } }).includes('protocols'), 'a tenant who turned it on keeps the toggle, to turn it off');
ok(settingsToggleTabs({ automations: { feature_flags: { protocols: true } } }).includes('protocols'), 'also when it was turned on by SQL');
ok(isTabVisible({ automations: { screens: { protocols: true } } }, 'protocols'), 'and keeps the tab itself (hidden, not deleted)');
eq(settingsToggleTabs({}), SWITCHABLE_TABS.filter((t) => t !== 'protocols'), 'every other toggle is unchanged, in order');
ok(settingsToggleTabs({}).includes('community'), 'community keeps its toggle (not part of this change)');
ok(app.includes('{settingsToggleTabs(settings).map((id)=>{'), 'Settings lists toggles from the SAVED row, so one switched off does not vanish mid-edit');
ok(!/\{SWITCHABLE_TABS\.map\(/.test(app), 'the screen no longer lists every switchable tab');
ok(app.includes('{id:"protocols",label:"פרוטוקולים"}'), 'the protocols tab, its render and its data are untouched');

// ── Stale comments ─────────────────────────────────────────────────────────
ok(!/The three one-insert stubs \(community, packages, protocols\)/.test(app), 'beautyos.jsx no longer calls packages a stub');
ok(/packages stopped being a stub on 2026-09-22/.test(app), 'and says when it stopped being one');
const flags = readFileSync('lib/featureFlags.ts', 'utf8');
ok(!/until there is more than one cosmetician to talk to/.test(flags), 'featureFlags no longer describes community as a cosmetician network');
ok(/HER announcements feed\s*\/\/ to her own clients/.test(flags), 'it says what community is');
const notify = readFileSync('lib/ownerNotify.js', 'utf8');
ok(/"weekly_report"/.test(notify.slice(notify.indexOf('@param {"new_booking"'), notify.indexOf('p.kind'))), 'ownerNotify JSDoc lists weekly_report');
for (const kind of ['weekly_report', 'reminders_ready', 'waitlist', 'content_today', 'content_published']) {
  ok(notify.includes(`"${kind}"`), `JSDoc lists ${kind}, which a caller sends`);
}

console.log(`review naming and flags: passed ${passed} failed 0`);

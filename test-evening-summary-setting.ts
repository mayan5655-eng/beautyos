// test-evening-summary-setting.ts
//
// The "סיכום ערב" switch moved from the public branding bag to automations (lib/eveningSummarySetting.ts).
// Old value respected, new place written, never on a public page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eveningSummaryOn, withEveningSummary, moveEveningSummaryOnSave, stripPrivateBranding } from './lib/eveningSummarySetting.ts';
import { mergeStoredBags } from './lib/settingsColumns.ts';
import { publicSettingsRow } from './lib/branding.js';
import { fetchPublicPage, resetPublicPageMemo } from './lib/publicPage.js';
import { runEveningSummaries } from './lib/eveningRun.js';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };

// ── Reading: new place wins, old place still respected ─────────────────────
eq(eveningSummaryOn(null), false, 'no row: off');
eq(eveningSummaryOn({}), false, 'new tenant: off by default');
eq(eveningSummaryOn({ branding: { evening_summary: true } }), true, 'an old tenant who turned it on keeps it on');
eq(eveningSummaryOn({ branding: { evening_summary: 'yes' } }), false, 'only a real true counts');
eq(eveningSummaryOn({ automations: { evening_summary: true } }), true, 'the new place');
eq(eveningSummaryOn({ automations: { evening_summary: false }, branding: { evening_summary: true } }), false, 'she turned it off after the move: the new place wins');
eq(eveningSummaryOn({ automations: { evening_summary: true }, branding: { evening_summary: false } }), true, 'and the other way round');
eq(eveningSummaryOn({ automations: 'garbage', branding: { evening_summary: true } }), true, 'a malformed automations bag falls back');

// ── Writing: automations only ──────────────────────────────────────────────
const draft = { business_name: 'x', automations: { paused: false }, branding: { logo_url: 'a.png', evening_summary: true } };
const off = withEveningSummary(draft, false);
eq(off.automations, { paused: false, evening_summary: false }, 'the switch is written to automations');
eq(off.branding, { logo_url: 'a.png' }, 'and removed from the branding draft');
eq(draft.branding.evening_summary, true, 'the draft passed in is not mutated');
eq(withEveningSummary({ automations: null, branding: null } as any, true).automations, { evening_summary: true }, 'a brand-new tenant with no bags');

// ── The save: old value carried, old key removed, but only when both bags are written ─
eq(moveEveningSummaryOnSave({ automations: { paused: true }, branding: { evening_summary: true, x: 1 } }),
  { automations: { paused: true, evening_summary: true }, branding: { x: 1 } }, 'carried across, then removed');
eq(moveEveningSummaryOnSave({ automations: { evening_summary: false }, branding: { evening_summary: true } }),
  { automations: { evening_summary: false }, branding: {} }, 'an explicit new value is never overwritten by the old one');
eq(moveEveningSummaryOnSave({ branding: { evening_summary: true } }), { branding: { evening_summary: true } }, 'branding alone: left as it is, so the value is never lost');
eq(moveEveningSummaryOnSave({ automations: { a: 1 } }), { automations: { a: 1 } }, 'nothing to move');
const merged: any = mergeStoredBags(
  { automations: { evening_summary: true }, branding: { welcome_headline: 'new' } },
  { automations: { paused: false }, branding: { evening_summary: false, logo_url: 'a.png' } });
eq(merged.automations, { paused: false, evening_summary: true }, 'the route: her new value wins');
ok(!('evening_summary' in merged.branding), 'the route: the stored public copy is removed on that save');

// ── Never on a public page ─────────────────────────────────────────────────
eq(stripPrivateBranding({ evening_summary: true, logo_url: 'a' }), { logo_url: 'a' }, 'stripped');
const clean = { logo_url: 'a' };
ok(stripPrivateBranding(clean) === clean, 'a clean bag passes through untouched');
eq(stripPrivateBranding(null), null, 'null passes through');
eq(publicSettingsRow({ business_name: 'b', branding: { evening_summary: true, x: 1 } }), { business_name: 'b', branding: { x: 1 } }, 'the public settings row');
{
  resetPublicPageMemo();
  const client = { rpc: async () => ({ data: { tenant: { id: 't1', name: 'n' }, settings: { branding: { evening_summary: true, logo_url: 'l' } }, services: [] }, error: null }) };
  const r: any = await fetchPublicPage(client, 'slug');
  eq(r.settings.branding, { logo_url: 'l' }, 'the one-call public page reader strips it too');
}
const brandingSrc = readFileSync('lib/branding.js', 'utf8');
ok(/if \(Array\.isArray\(d\)\) return publicSettingsRow\(d\[0\] \|\| null\);/.test(brandingSrc) && /return publicSettingsRow\(d\);/.test(brandingSrc), 'fetchPublicSettings strips both RPC shapes');
ok(!/evening_summary/.test(readFileSync('app/BookingPage.jsx', 'utf8')), 'the booking page never mentions it');

// ── The cron reads both places ─────────────────────────────────────────────
{
  const rows = [
    { tenant_id: 'OLD', branding: { evening_summary: true }, automations: null },
    { tenant_id: 'NEW', branding: {}, automations: { evening_summary: true } },
    { tenant_id: 'OFF', branding: { evening_summary: true }, automations: { evening_summary: false } },
    { tenant_id: 'PAUSED', branding: {}, automations: { evening_summary: true, paused: true } },
  ];
  const notified: string[] = [];
  const page = (data: any[]) => ({ data, error: null, count: data.length });
  const db = {
    from: (table: string) => {
      const data = table === 'settings' ? rows : rows.map((r) => ({ id: 'a-' + r.tenant_id, tenant_id: r.tenant_id, name: 'דנה', service: 'x', date: '2026-11-06', start_minute: 600, duration: 60, confirmation_status: 'confirmed' }));
      const q: any = { select: () => q, eq: () => q, neq: () => q, order: () => q, range: async () => page(data), then: (f: any) => Promise.resolve(page(data)).then(f) };
      return q;
    },
  };
  await runEveningSummaries({
    db, date: '2026-11-06',
    deps: {
      notifyOwner: async ({ tenantId }: any) => { notified.push(tenantId); },
      buildEveningSummary: () => 'מחר',
      startMinute: (a: any) => a.start_minute, endMinute: (a: any) => a.start_minute + a.duration,
      isPersonal: () => false, isMissingColumnError: () => false,
    },
  });
  eq(notified.sort(), ['NEW', 'OLD'], 'old place respected, new place read, an explicit off wins, paused skipped');
}

// ── The Settings screen writes only the new place ──────────────────────────
const app = readFileSync('app/beautyos.jsx', 'utf8');
ok(app.includes('const on=eveningSummaryOn(editSettings);'), 'the toggle reads through the helper');
ok(app.includes('setEditSettings(prev=>withEveningSummary(prev,!on))'), 'the toggle writes through the helper');
ok(!/branding:\{\.\.\.pb,evening_summary/.test(app), 'the old write into branding is gone');

const sql = readFileSync('supabase/migrations/move_evening_summary_2026-11-05.sql', 'utf8');
ok(/STATUS: NOT RUN/.test(sql) && /OPTIONAL/.test(sql), 'the data move is a hand-run, optional file');

console.log(`evening summary setting: passed ${passed} failed 0`);

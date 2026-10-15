// Owner control screens (2026-10-16): the numbers, the gate, and the privacy line (tenant-level metadata only).
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  LAUNCH_PRICE_CUTOFF_ISO, OWNER_TENANT_COLUMNS, realTenants, israelDayStart, signupWindows, signupsBySource, newestSignups,
  trialsEndingSoon, planStatusCounts, launchPriceQualifiers, activityRows, dateHe, UNKNOWN_SOURCE_HE,
} from './lib/ownerControl.ts';
import type { OwnerTenant } from './lib/ownerControl.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const NOW = new Date('2026-10-16T09:00:00Z'); // 12:00 in Israel (UTC+3)
const t = (id: string, o: Partial<OwnerTenant> = {}): OwnerTenant => ({
  id, name: `עסק ${id}`, created_at: '2026-09-01T10:00:00Z', plan_status: 'trial', trial_started_at: null,
  trial_ends_at: '2026-11-30T10:00:00Z', signup_source: null, ...o,
});

// ── numbers ─────────────────────────────────────────────────────────────────
ok('demo tenants and the admin\'s own business are not signups', () => {
  const rows = [t('a'), t(DEMO_TENANT_IDS.cosmetics), t('own'), t('b')];
  assert.deepEqual(realTenants(rows, 'own').map((r) => r.id), ['a', 'b']);
});

ok('Israel day start: summer (UTC+3) and winter (UTC+2)', () => {
  assert.equal(new Date(israelDayStart(new Date('2026-10-16T09:00:00Z'))).toISOString(), '2026-10-15T21:00:00.000Z');
  assert.equal(new Date(israelDayStart(new Date('2026-12-10T09:00:00Z'))).toISOString(), '2026-12-09T22:00:00.000Z');
  // 22:30Z on the 15th is already the 16th in Israel
  assert.equal(new Date(israelDayStart(new Date('2026-10-15T22:30:00Z'))).toISOString(), '2026-10-15T21:00:00.000Z');
});

ok('signups: today / 7 days / 30 days / total', () => {
  const rows = [
    t('1', { created_at: '2026-10-16T05:00:00Z' }), // today (08:00 Israel)
    t('2', { created_at: '2026-10-15T20:00:00Z' }), // 23:00 Israel on the 15th: yesterday
    t('3', { created_at: '2026-10-12T10:00:00Z' }), // within 7 days
    t('4', { created_at: '2026-09-25T10:00:00Z' }), // within 30 days
    t('5', { created_at: '2026-08-01T10:00:00Z' }), // older
    t('6', { created_at: null }),
  ];
  assert.deepEqual(signupWindows(rows, NOW), { today: 1, last7: 3, last30: 4, total: 6 });
});

ok('by source: counts, "לא ידוע" for empty, sorted by total', () => {
  const rows = [
    t('1', { signup_source: 'instagram / bio', created_at: '2026-10-10T10:00:00Z' }),
    t('2', { signup_source: 'instagram / bio', created_at: '2026-08-10T10:00:00Z' }),
    t('3', { signup_source: 'friends', created_at: '2026-10-11T10:00:00Z' }),
    t('4', { signup_source: '  ' }), t('5', { signup_source: null }),
  ];
  const s = signupsBySource(rows, NOW);
  // equal totals: the one with more recent signups first
  assert.deepEqual(s.map((x) => [x.source, x.total]), [['instagram / bio', 2], [UNKNOWN_SOURCE_HE, 2], ['friends', 1]]);
  assert.equal(s.find((x) => x.source === 'instagram / bio')!.last30, 1);
});

ok('newest signups: newest first, name fallback, limited', () => {
  const rows = [t('1', { created_at: '2026-10-01T00:00:00Z', name: null }), t('2', { created_at: '2026-10-05T00:00:00Z' }), t('3', { created_at: '2026-10-03T00:00:00Z' })];
  const r = newestSignups(rows, 2);
  assert.deepEqual(r.map((x) => x.id), ['2', '3']);
  assert.equal(newestSignups(rows)[2].name, 'ללא שם');
});

ok('trials ending in 7 days: soonest first, days left rounded up, elapsed and far ones excluded, non-trials excluded', () => {
  const rows = [
    t('soon', { trial_ends_at: '2026-10-18T09:00:00Z' }),     // 2 days
    t('tomorrow', { trial_ends_at: '2026-10-16T21:00:00Z' }), // 12 h -> 1
    t('edge', { trial_ends_at: '2026-10-23T09:00:00Z' }),     // exactly 7 days: included
    t('far', { trial_ends_at: '2026-10-24T09:00:00Z' }),
    t('gone', { trial_ends_at: '2026-10-10T09:00:00Z' }),
    t('paying', { plan_status: 'active', trial_ends_at: '2026-10-17T09:00:00Z' }),
  ];
  const e = trialsEndingSoon(rows, NOW, 7);
  assert.deepEqual(e.map((x) => [x.id, x.daysLeft]), [['tomorrow', 1], ['soon', 2], ['edge', 7]]);
});

ok('plan status counts use the effective status (an elapsed trial is expired)', () => {
  const rows = [t('1'), t('2', { trial_ends_at: '2026-10-01T00:00:00Z' }), t('3', { plan_status: 'active' }), t('4', { plan_status: 'paused' }), t('5', { plan_status: null })];
  assert.deepEqual(planStatusCounts(rows, NOW), { trial: 1, active: 2, expired: 1, paused: 1 }); // null fails open to active
});

ok('349 qualifiers: on or before 2026-10-20T20:59:59Z, oldest first, boundary inclusive', () => {
  assert.equal(LAUNCH_PRICE_CUTOFF_ISO, '2026-10-20T20:59:59Z');
  const rows = [
    t('on', { created_at: '2026-10-20T20:59:59Z' }),
    t('after', { created_at: '2026-10-20T21:00:00Z' }),
    t('old', { created_at: '2026-09-01T00:00:00Z' }),
    t('none', { created_at: null }),
  ];
  assert.deepEqual(launchPriceQualifiers(rows, NOW).map((x) => x.id), ['old', 'on']);
});

ok('activity rows keep only the business name and one timestamp; demo and own are dropped; never-active last', () => {
  const raw = [
    { id: 'a', name: 'א', last_activity_at: '2026-10-10T00:00:00Z', client_count: 40, appointment_count: 90, ai_cost_usd_30d: 3 },
    { id: 'b', name: 'ב', last_activity_at: null },
    { id: 'c', name: 'ג', last_activity_at: '2026-10-14T00:00:00Z' },
    { id: DEMO_TENANT_IDS.nails, name: 'דמו', last_activity_at: '2026-10-15T00:00:00Z' },
    { id: 'own', name: 'שלי', last_activity_at: '2026-10-15T00:00:00Z' },
  ];
  const r = activityRows(raw, 'own');
  assert.deepEqual(r.map((x) => x.id), ['c', 'a', 'b']);
  for (const row of r) assert.deepEqual(Object.keys(row).sort(), ['id', 'lastActivityAt', 'name']);
  assert.equal(dateHe('2026-10-16T09:00:00Z'), '16.10.2026');
});

// ── the gate ─────────────────────────────────────────────────────────────────
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const ownerFiles = walk('app/dashboard/owner');
const pages = ['', '/signups', '/trials', '/activity'].map((p) => `app/dashboard/owner${p}/page.tsx`);

ok('all four routes exist, and the hub links to the three screens', () => {
  for (const p of pages) assert.ok(existsSync(p), p);
  const hub = rd('app/dashboard/owner/page.tsx');
  for (const h of ['/dashboard/owner/signups', '/dashboard/owner/trials', '/dashboard/owner/activity']) assert.ok(hub.includes(h), h);
  assert.match(hub, /\/dashboard\/admin/); // actions live on the existing admin page
});

ok('every route is gated before any data is read: platform admin or the same plain 404', () => {
  const loader = rd('app/dashboard/owner/loader.ts');
  assert.match(loader, /if \(!admin\.ok\) notFound\(\)/);
  assert.ok(loader.indexOf('requirePlatformAdmin()') < loader.indexOf('createAdminClient()', loader.indexOf('export async function requireOwner')));
  // the hub gates itself; the three screens go through loadTenants / loadActivity, which call requireOwner first
  assert.match(rd('app/dashboard/owner/page.tsx'), /await requireOwner\(\)/);
  assert.match(loader, /export async function loadTenants\(\)[\s\S]*?await requireOwner\(\)/);
  assert.match(loader, /export async function loadActivity\(\)[\s\S]*?await requireOwner\(\)/);
  for (const p of pages.slice(1)) {
    const s = rd(p);
    assert.match(s, /load(Tenants|Activity)\(\)/, p);
    assert.doesNotMatch(strip(s), /createAdminClient|createClient|\.from\(|\.rpc\(/, `${p} reads no data itself`);
    assert.match(s, /export const dynamic = 'force-dynamic'/, p);
  }
});

// ── privacy ──────────────────────────────────────────────────────────────────
ok('only tenant-level columns are selected, and the only tables and functions touched are the allowed ones', () => {
  assert.equal(OWNER_TENANT_COLUMNS, 'id, name, created_at, plan_status, trial_started_at, trial_ends_at, signup_source');
  const code = ownerFiles.map((f) => strip(rd(f))).join('\n') + '\n' + strip(rd('lib/ownerControl.ts'));
  const from = [...code.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(from)], ['tenants']);
  const rpc = [...code.matchAll(/\.rpc\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(rpc)], ['get_user_tenant_id', 'platform_tenant_metrics']);
  for (const word of ['clients', 'appointments', 'receipts', 'leads', 'messages', 'client_name', 'email', 'phone', 'select\\(\'\\*\'\\)', 'select\\("\\*"\\)']) {
    assert.doesNotMatch(code, new RegExp(`\\b${word}\\b`), word);
  }
});

ok('the metrics function is projected to name + timestamp at once; its counts and costs never leave the loader', () => {
  const lib = strip(rd('lib/ownerControl.ts'));
  assert.doesNotMatch(lib, /client_count|appointment_count|ai_cost|whatsapp_/);
  assert.doesNotMatch(strip(rd('app/dashboard/owner/activity/page.tsx')), /client_count|appointment_count/);
});

// ── the entry in the "more" sheet ────────────────────────────────────────────
ok('the entry is decided on the server and renders nothing for non-admins', () => {
  const e = rd('app/dashboard/owner/OwnerEntry.tsx');
  assert.match(e, /requirePlatformAdmin\(\)/);
  assert.match(e, /if \(!admin\.ok\) return null/);
  assert.match(e, /<Suspense fallback=\{null\}>/); // streamed: never delays the app for anyone
  assert.doesNotMatch(e, /'use client'|"use client"/);
});

ok('the app bundle only has an empty slot: no owner link, no "בקרה" label in the monolith or the loader', () => {
  const app = rd('app/beautyos.jsx');
  assert.match(app, /\{ownerEntry\}/);
  assert.doesNotMatch(app, /dashboard\/owner/);
  assert.doesNotMatch(app, /"בקרה"|'בקרה'|>בקרה</);
  const loader = rd('app/BeautyOSLoader.tsx');
  assert.doesNotMatch(loader, /dashboard\/owner/);
  assert.match(rd('app/page.tsx'), /if \(user\) return <BeautyOSLoader ownerEntry=\{<OwnerEntry \/>\} \/>;/);
  assert.match(rd('app/dashboard/page.tsx'), /ownerEntry=\{<OwnerEntry \/>\}/);
});

ok('screen C says the signal is not available rather than inventing one, and links to the Grow list', () => {
  const a = rd('app/dashboard/owner/activity/page.tsx');
  assert.match(a, /עוד לא זמין/);
  assert.match(a, /\/dashboard\/admin#grow-onboarding/);
  assert.match(rd('app/dashboard/admin/GrowOnboarding.tsx'), /id="grow-onboarding"/);
});

console.log(`${n} passed`);

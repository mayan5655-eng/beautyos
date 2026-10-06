// Her public page's data, in one call - and honest about every way that call can go.
//
// 2026-10-06: a first view took 1.5-2.1 s of server time because the page made three database calls in two
// serial stages and each call from the function costs 0.3-0.9 s. get_public_page returns all three at once.
// The rules that matter, run against fake clients:
//   * "no such business" (the call worked, nothing there) is different from a FAILED call - the second must
//     never read as the first, or a hiccup becomes a 404 a crawler keeps;
//   * until the migration is applied the page keeps working on the old reads, and does not pay a wasted
//     failing call on every view.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fetchPublicPage, resetPublicPageMemo } from './lib/publicPage.js';

const TENANT = { id: '11111111-1111-1111-1111-111111111111', name: 'סטודיו' };
const fake = (rpc: () => any) => { const calls: string[] = []; return { calls, client: { rpc: async (name: string, args: any) => { calls.push(`${name}:${args.p_slug}`); return rpc(); } } as any }; };
const warn = console.warn; const quiet = () => { console.warn = () => {}; return () => { console.warn = warn; }; };
resetPublicPageMemo();

// ── found: tenant, settings and services come back together ───────────────────────────────
{
  const { client, calls } = fake(() => ({ data: { tenant: TENANT, settings: { business_name: 'סטודיו', primary_color: '#C2557A' }, services: [{ id: 1, name: 'ניקוי' }] }, error: null }));
  const r: any = await fetchPublicPage(client, 'my-slug');
  assert.equal(r.kind, 'found');
  assert.deepEqual(r.tenant, TENANT);
  assert.equal(r.settings.primary_color, '#C2557A');
  assert.deepEqual(r.services, [{ id: 1, name: 'ניקוי' }]);
  assert.deepEqual(calls, ['get_public_page:my-slug'], 'ONE database call');
}
{ // a business with no settings row and no services yet is still found (a brand-new tenant)
  const r: any = await fetchPublicPage(fake(() => ({ data: { tenant: TENANT, settings: null, services: [] }, error: null })).client, 's');
  assert.equal(r.kind, 'found'); assert.equal(r.settings, null); assert.deepEqual(r.services, []);
}
{ // services missing from the payload become an empty list, not undefined
  const r: any = await fetchPublicPage(fake(() => ({ data: { tenant: TENANT }, error: null })).client, 's');
  assert.deepEqual(r.services, []); assert.equal(r.settings, null);
}

// ── none: the call WORKED and there is no such business ────────────────────────────────────
for (const data of [null, undefined, {}, { tenant: null }, { tenant: {} }, []]) {
  const r: any = await fetchPublicPage(fake(() => ({ data, error: null })).client, 'nope');
  assert.equal(r.kind, 'none', `${JSON.stringify(data)} -> no such business`);
}
assert.equal((await fetchPublicPage(fake(() => ({ data: null, error: null })).client, '') as any).kind, 'none', 'no slug: nothing to look up');

// ── a FAILED call is thrown - never "no such business" ─────────────────────────────────────
await assert.rejects(() => fetchPublicPage(fake(() => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })).client, 's'), /public page lookup failed.*timeout/, 'a timeout is an error');
await assert.rejects(() => fetchPublicPage(fake(() => ({ data: null, error: { code: '42501', message: 'permission denied for function get_public_page' } })).client, 's'), /permission denied/, 'so is a permission error');
await assert.rejects(() => fetchPublicPage({ rpc: async () => { throw new Error('network down'); } } as any, 's'), /network down/, 'and a thrown error');

// ── not installed yet: 'unavailable', and the miss is remembered ─────────────────────────────
{
  resetPublicPageMemo();
  let clock = 5_000_000; const now = () => clock;
  const restore = quiet();
  const missing = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_public_page(p_slug) in the schema cache' } });
  const a = fake(missing);
  assert.equal(((await fetchPublicPage(a.client, 's', { now })) as any).kind, 'unavailable', 'function missing: the page uses the old reads');
  assert.equal(a.calls.length, 1);
  const b = fake(missing);
  assert.equal(((await fetchPublicPage(b.client, 's', { now: () => clock + 60_000 })) as any).kind, 'unavailable');
  assert.equal(b.calls.length, 0, 'a minute later it does NOT ask again: no wasted failing call on every view');
  const c = fake(() => ({ data: { tenant: TENANT, settings: null, services: [] }, error: null }));
  assert.equal(((await fetchPublicPage(c.client, 's', { now: () => clock + 11 * 60_000 })) as any).kind, 'found', 'after ten minutes it asks again: a freshly installed function is picked up without a redeploy');
  restore();
  resetPublicPageMemo();
  const r = quiet();
  assert.equal(((await fetchPublicPage(fake(() => ({ data: null, error: { code: '42883', message: 'function get_public_page(text) does not exist' } })).client, 's')) as any).kind, 'unavailable', 'the Postgres code for a missing function means the same');
  r();
  resetPublicPageMemo();
}

// ── the page is wired to it, with the old reads as the fallback ────────────────────────────
const page = fs.readFileSync('app/[slug]/page.tsx', 'utf8');
assert.ok(page.includes("fetchPublicPage(publicClient(), slug)"), 'the page loads through get_public_page');
assert.ok(/page\.kind === 'found'\) return page\.settings/.test(page) && /page\.kind === 'found'\) return page\.services/.test(page), 'settings and services come from that one call');
assert.ok(page.includes("get_public_tenant_by_slug") && page.includes('fetchPublicSettings(publicClient(), tenantId)'), 'and the three separate reads remain for before the migration');
assert.ok(fs.existsSync('supabase/migrations/pending/public-page-one-call.sql'), 'the migration is handed over');

console.log('public page: ok');

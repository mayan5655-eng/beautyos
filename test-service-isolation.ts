// Her services are hers: the cashier, the checklist and her public page agree.
//
// 2026-10-06, on a brand-new empty tenant: 21 services in her cashier (other businesses'),
// "services ✓ done" in her checklist, "treatments being prepared" on her public page. The three
// disagreed because service_prices is readable across tenants and the dashboard trusted RLS to
// scope it. These tests run the real helpers against fake clients and fake rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownServices } from './lib/serviceScope.js';
import { fetchPublicServices } from './lib/publicServices.js';

const HERS = '11111111-1111-1111-1111-111111111111';
const THEIRS = '22222222-2222-2222-2222-222222222222';
const rows = [
  { id: 1, tenant_id: HERS, name: 'מסאז׳', price: 200 },
  { id: 2, tenant_id: THEIRS, name: 'ניקוי פנים עמוק', price: 300 },
  { id: 3, tenant_id: THEIRS, name: 'מניקור ג׳ל', price: 200 },
  { id: 4, tenant_id: null, name: 'legacy row with no tenant', price: 1 },
];

// ── the dashboard's view of "my services" ───────────────────────────────────────────────────
assert.deepEqual(ownServices(rows, HERS).map((r) => r.id), [1], 'only her own row survives the read');
assert.deepEqual(ownServices(rows, 'brand-new-tenant-with-none'), [], 'a new tenant has NO services - not three other businesses\' menus (the checklist counts this array)');
assert.deepEqual(ownServices(rows, null), [], 'no tenant id: nothing can be hers');
assert.deepEqual(ownServices(null, HERS), [], 'a failed read is handled upstream; a non-array never becomes services');
assert.equal(ownServices(rows, HERS).length > 0, true, 'and the checklist (services.length > 0) is true for her');
assert.equal(ownServices(rows, 'brand-new-tenant-with-none').length > 0, false, 'and false for the empty tenant, matching her public page');

// ── the public read: RPC first, honest fallback, never "no treatments" on a failed read ───────
const fake = ({ rpc, table }: { rpc: () => any; table?: (calls: string[]) => any }) => {
  const calls: string[] = [];
  const client: any = {
    rpc: async (name: string, args: any) => { calls.push(`rpc:${name}:${args.p_tenant_id}`); return rpc(); },
    from: (t: string) => {
      const q: any = {
        select: () => q,
        eq: (c: string, v: string) => { calls.push(`eq:${c}=${v}`); return q; },
        or: (f: string) => { calls.push(`or:${f}`); return Promise.resolve(table ? table(calls) : { data: [], error: null }); },
      };
      calls.push(`from:${t}`);
      return q;
    },
  };
  return { client, calls };
};
const warn = console.warn; const quiet = () => { console.warn = () => {}; return () => { console.warn = warn; }; };

{ // function installed: it is used, and the table is not touched
  const { client, calls } = fake({ rpc: () => ({ data: [{ id: 1, tenant_id: HERS }], error: null }) });
  const r = await fetchPublicServices(client, HERS);
  assert.deepEqual(r.data, [{ id: 1, tenant_id: HERS }]);
  assert.deepEqual(calls, [`rpc:get_public_services:${HERS}`], 'the RPC is the only call');
}
{ // function not installed yet (migration not run): falls back, scoped to THIS tenant and to active rows
  const restore = quiet();
  const { client, calls } = fake({
    rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_public_services' } }),
    table: () => ({ data: [{ id: 1, tenant_id: HERS }], error: null }),
  });
  const r = await fetchPublicServices(client, HERS);
  restore();
  assert.equal(r.error, null);
  assert.deepEqual(r.data, [{ id: 1, tenant_id: HERS }]);
  assert.ok(calls.includes('from:service_prices') && calls.includes(`eq:tenant_id=${HERS}`) && calls.some((c) => c.startsWith('or:active.is.null')), 'the fallback is scoped to the tenant and to active services');
}
{ // function postgres-style missing error code
  const restore = quiet();
  const { client } = fake({ rpc: () => ({ data: null, error: { code: '42883', message: 'function get_public_services(uuid) does not exist' } }) });
  const r = await fetchPublicServices(client, HERS);
  restore();
  assert.equal(r.error, null, '42883 also means "not installed": fall back, do not fail');
}
{ // any OTHER error is an error: a failed read must not look like an empty menu
  const { client, calls } = fake({ rpc: () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }) });
  const r = await fetchPublicServices(client, HERS);
  assert.equal(r.data, null, 'data is null, not []');
  assert.ok(r.error, 'and the error is returned');
  assert.deepEqual(calls, [`rpc:get_public_services:${HERS}`], 'no silent fallback on a real failure');
}
{ // a thrown error is also returned, not thrown at the page
  const client: any = { rpc: async () => { throw new Error('network down'); } };
  const r = await fetchPublicServices(client, HERS);
  assert.equal(r.data, null); assert.match(String(r.error?.message), /network down/);
}
assert.ok((await fetchPublicServices(fake({ rpc: () => ({ data: [], error: null }) }).client, '')).error, 'no tenant id: an error, never a query');
{ // an empty tenant: the RPC answers [] and that IS an empty menu (a real, trustworthy answer)
  const { client } = fake({ rpc: () => ({ data: [], error: null }) });
  const r = await fetchPublicServices(client, 'brand-new-tenant-with-none');
  assert.deepEqual(r.data, []); assert.equal(r.error, null);
}

// ── the unfiltered read cannot come back (a lint, kept because it is the exact bug) ─────────────
const app = fs.readFileSync('app/beautyos.jsx', 'utf8');
const unfiltered = [...app.matchAll(/from\("service_prices"\)\.select\("\*"\)(?!\s*\.eq\()/g)].length;
assert.equal(unfiltered, 1, 'exactly one unscoped service_prices read remains in the dashboard (the boot read), and its rows pass through ownServices');
assert.ok(/setServices\(ownServices\(sv\.data, myTenantId\)\)/.test(app), 'the boot read is passed through ownServices');
assert.ok(fs.existsSync('supabase/migrations/pending/service-prices-tenant-isolation.sql'), 'the migration that closes it at the source exists');

console.log('service isolation: ok');

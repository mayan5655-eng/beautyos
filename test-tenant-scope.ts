// The route handlers that read or change ONE row by id (designs/[id], marketing/delete-campaign) and the one that reads the Facebook token
// (marketing/campaigns) must not trust RLS alone: a member of tenant A asking for tenant B's design or campaign gets 404 (never B's data,
// never "forbidden" that confirms the id exists), and nothing of B's is changed - EVEN IF the database policy lets the row through.
// The handlers are the real ones, imported through testkit/aliasLoader.mjs, talking to an in-memory two-tenant database.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { ownRow } from './lib/tenantScope.js';

register('./testkit/aliasLoader.mjs', import.meta.url);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const DESIGN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DESIGN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ── the helper itself ──
assert.deepEqual(ownRow({ tenant_id: A, x: 1 }, A), { tenant_id: A, x: 1 });
assert.equal(ownRow({ tenant_id: B }, A), null, "someone else's row is not hers");
assert.equal(ownRow({ tenant_id: A }, null), null, 'no tenant, no rows');
assert.equal(ownRow(null, A), null);

// ── an in-memory PostgREST-ish database. `leaky` = the policy is broken and lets every tenant's rows through (what the handler must survive)
function makeDb({ tenant, tables, leaky = false, loggedIn = true }: { tenant: string | null; tables: Record<string, any[]>; leaky?: boolean; loggedIn?: boolean }) {
  const query = (table: string) => {
    const st = { filters: [] as [string, unknown][], op: 'select', patch: null as any };
    // `leaky` models a broken READ policy / an ignored filter on a read: a select hands back rows of every tenant. Writes (update, delete)
    // always honour the tenant filter - it is a hard condition of the statement, not a visibility rule.
    const rows = () => (tables[table] || []).filter((r) => st.filters.every(([c, v]) => (leaky && st.op === 'select' && c === 'tenant_id') || r[c] === v));
    const run = () => {
      const hit = rows();
      if (st.op === 'update') hit.forEach((r) => Object.assign(r, st.patch));
      if (st.op === 'delete') tables[table] = (tables[table] || []).filter((r) => !hit.includes(r));
      return hit;
    };
    const api: any = {
      select: () => api,
      eq: (c: string, v: unknown) => { st.filters.push([c, v]); return api; },
      in: () => api, order: () => api, limit: () => api,
      update: (p: any) => { st.op = 'update'; st.patch = p; return api; },
      delete: () => { st.op = 'delete'; return api; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => { const r = run()[0]; return { data: r ?? null, error: r ? null : { message: 'no rows' } }; },
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return api;
  };
  return {
    auth: { getUser: async () => ({ data: { user: loggedIn ? { id: 'u' } : null } }) },
    rpc: async (name: string) => (name === 'get_user_tenant_id' ? { data: tenant, error: null } : { data: null, error: null }),
    from: query,
  };
}
const use = (db: any) => { (globalThis as any).__TEST_SUPABASE__ = db; };
const designs = () => [
  { id: DESIGN_A, tenant_id: A, name: 'שלה', template_key: 'offer-feed', template_version: 2, category: 'offer', is_default: false },
  { id: DESIGN_B, tenant_id: B, name: 'של אחרת', template_key: 'offer-feed', template_version: 2, category: 'offer', is_default: false },
];

const designRoute: any = await import('./app/api/designs/[id]/route.ts');
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) => new Request('http://localhost/api/designs/x', { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } }) as any;
const show = async (label: string, res: Response) => { const j = await res.json(); console.log(`  ${label.padEnd(58)} -> HTTP ${res.status} ${JSON.stringify(j).slice(0, 90)}`); return j; };

// ── designs/[id] ──
for (const leaky of [false, true]) {
  const mode = leaky ? 'policy BROKEN (leaks across tenants)' : 'policy working';
  const tables = { designs: designs() };
  use(makeDb({ tenant: A, tables, leaky }));

  let res = await designRoute.GET(req('GET'), ctx(DESIGN_B));
  const g = await show(`A reads B's design [${mode}]`, res);
  assert.equal(res.status, 404, `GET B's design is 404 (${mode})`); assert.equal(g.design, undefined, "none of B's design leaks");

  res = await designRoute.PATCH(req('PATCH', { name: 'נחטף' }), ctx(DESIGN_B));
  await show(`A renames B's design [${mode}]`, res);
  assert.equal(res.status, 404, `PATCH B's design is 404 (${mode})`);
  assert.equal(tables.designs.find((d) => d.id === DESIGN_B)!.name, 'של אחרת', "B's design is untouched");

  res = await designRoute.DELETE(req('DELETE'), ctx(DESIGN_B));
  await show(`A deletes B's design [${mode}]`, res);
  assert.equal(res.status, 404, `DELETE B's design is 404 (${mode})`);
  assert.ok(tables.designs.some((d) => d.id === DESIGN_B), "B's design is still there");

  res = await designRoute.GET(req('GET'), ctx(DESIGN_A));
  const own = await show(`A reads her own design [${mode}]`, res);
  assert.equal(res.status, 200); assert.equal(own.design.id, DESIGN_A);
}

// her own design: change and delete still work
{
  const tables = { designs: designs() };
  use(makeDb({ tenant: A, tables }));
  let res = await designRoute.PATCH(req('PATCH', { name: 'שם חדש' }), ctx(DESIGN_A));
  await show('A renames her own design', res);
  assert.equal(res.status, 200); assert.equal(tables.designs.find((d) => d.id === DESIGN_A)!.name, 'שם חדש');
  res = await designRoute.DELETE(req('DELETE'), ctx(DESIGN_A));
  await show('A deletes her own design', res);
  assert.equal(res.status, 200); assert.ok(!tables.designs.some((d) => d.id === DESIGN_A));
  assert.ok(tables.designs.some((d) => d.id === DESIGN_B), "and B's design is still there");
}

// no tenant / not signed in
use(makeDb({ tenant: null, tables: { designs: designs() } }));
assert.equal((await designRoute.GET(req('GET'), ctx(DESIGN_A))).status, 403, 'a user with no tenant gets 403');
assert.equal((await designRoute.DELETE(req('DELETE'), ctx(DESIGN_A))).status, 403);
use(makeDb({ tenant: A, tables: { designs: designs() }, loggedIn: false }));
assert.equal((await designRoute.GET(req('GET'), ctx(DESIGN_A))).status, 401, 'not signed in is 401');

// ── marketing/delete-campaign ──
const CAMP_A = 'c0c0c0c0-0000-4000-8000-00000000000a', CAMP_B = 'c0c0c0c0-0000-4000-8000-00000000000b';
const campaignRoute: any = await import('./app/api/marketing/delete-campaign/route.ts');
const post = (campaignId: string) => new Request('http://localhost/api/marketing/delete-campaign', { method: 'POST', body: JSON.stringify({ campaignId }), headers: { 'content-type': 'application/json' } }) as any;
for (const leaky of [false, true]) {
  const mode = leaky ? 'policy BROKEN' : 'policy working';
  const tables = { campaigns: [{ id: CAMP_A, tenant_id: A }, { id: CAMP_B, tenant_id: B }], campaign_posts: [{ id: 'p1', campaign_id: CAMP_B, tenant_id: B }] };
  use(makeDb({ tenant: A, tables, leaky }));
  const res = await campaignRoute.POST(post(CAMP_B));
  await show(`A deletes B's campaign [${mode}]`, res);
  assert.equal(res.status, 404, `deleting B's campaign is 404, not a silent success (${mode})`);
  assert.ok(tables.campaigns.some((c) => c.id === CAMP_B) && tables.campaign_posts.length === 1, "B's campaign and its posts are untouched");
}
{
  const tables = { campaigns: [{ id: CAMP_A, tenant_id: A }, { id: CAMP_B, tenant_id: B }], campaign_posts: [] as any[] };
  use(makeDb({ tenant: A, tables }));
  const res = await campaignRoute.POST(post(CAMP_A));
  await show('A deletes her own campaign', res);
  assert.equal(res.status, 200); assert.ok(!tables.campaigns.some((c) => c.id === CAMP_A) && tables.campaigns.some((c) => c.id === CAMP_B));
}

// ── marketing/campaigns (the Facebook token): B's connected page is never A's, even if the policy leaks it ──
const fbRoute: any = await import('./app/api/marketing/campaigns/route.js');
for (const leaky of [false, true]) {
  const mode = leaky ? 'policy BROKEN' : 'policy working';
  const tables = { facebook_pages: [{ tenant_id: B, page_id: 'p-b', page_name: 'דף של אחרת', page_access_token_encrypted: 'SECRET-B', is_active: true }] };
  use(makeDb({ tenant: A, tables, leaky }));
  const res = await fbRoute.GET(new Request('http://localhost/api/marketing/campaigns') as any);
  const j = await show(`A asks for campaigns; only B has a page [${mode}]`, res);
  assert.ok(j.notConnected === true && !JSON.stringify(j).includes('SECRET-B') && !JSON.stringify(j).includes('דף של אחרת'), "A sees 'not connected', never B's page or token");
}
use(makeDb({ tenant: null, tables: { facebook_pages: [] } }));
assert.equal((await fbRoute.GET(new Request('http://localhost/api/marketing/campaigns') as any)).status, 403, 'no tenant: 403');

console.log('tenant scope: ok');

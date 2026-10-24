// The demo never closes: each nightly reset rolls its trial 30 days ahead, and the
// public booking gate never treats a demo tenant as blocked (2026-10-23 pass, A2:
// the demo rows' trial ended 2026-10-30 and nothing extended it).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tenantIsBlocked } from './lib/tenantActive.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

// An expired row would block a normal tenant...
const expired = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan_status: 'trial', trial_started_at: '2026-09-01T00:00:00Z', trial_ends_at: '2026-10-01T00:00:00Z' }, error: null }) }) }) }) };
assert.equal(await tenantIsBlocked(expired, '11111111-1111-1111-1111-111111111111'), true, 'a normal expired tenant is blocked');
// ...but never a demo one.
for (const id of Object.values(DEMO_TENANT_IDS)) assert.equal(await tenantIsBlocked(expired, id), false, `demo ${id} is never blocked`);

const seed = fs.readFileSync(new URL('./lib/demoSeed.ts', import.meta.url), 'utf8');
assert.match(seed, /from\('tenants'\)\s*\.update\(\{ trial_ends_at: new Date\(now\.getTime\(\) \+ 30 \* 86_400_000\)\.toISOString\(\) \}\)\s*\.eq\('id', tenantId\)/, 'the reset rolls the trial forward');

console.log('test-demo-trial-rolls: ok');

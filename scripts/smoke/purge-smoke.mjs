// Remove ONE leftover smoke account and its tenant by exact email (a walk that was interrupted leaves one behind).
//   node --env-file=.env.local scripts/smoke/purge-smoke.mjs kalmea-smoke-walk-android-xxxx@example.com
import { admin, tenantIdOf } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
const email = process.argv[2];
if (!/^kalmea-smoke-[a-z0-9-]+@example\.com$/.test(email || '')) { console.error('give one exact kalmea-smoke-*@example.com address'); process.exit(1); }
const db = admin();
for (let p = 1; p <= 5; p++) {
  const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
  const u = (data?.users || []).find((x) => x.email === email);
  if (u) { const t = await tenantIdOf(u.id).catch(() => null); const left = await purgeTenant(t, u.id); console.log('purged', email, t, left.length ? left : 'clean'); process.exit(0); }
  if (!data?.users?.length) break;
}
console.log('not found');

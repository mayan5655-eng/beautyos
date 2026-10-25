// Can a business owner with a long email sign up? Creates smoke accounts (confirmed, no email is sent) whose email has 20 to 60
// letters and digits before the @, through the same sign-up trigger a real signup fires, and checks each one got a business
// with a valid address (40 characters or fewer). Removes everything it creates.
// 2026-10-25 before fix_signup_long_email_slug_2026-10-25.sql: 31 passes, 32 and up fail with "Database error creating new user".
// 2026-10-25 after it: all pass.
//   node --env-file=.env.local scripts/smoke/signup-long-email.mjs
import { admin, PASSWORD, tenantIdOf } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
const svc = admin();
const stamp = Date.now().toString(36);
let failed = 0;
for (const alnum of [20, 31, 32, 40, 60]) {
  // kalmea-smoke- (11 letters) + padding + stamp; the hyphens and dots do not count towards the address
  const email = `kalmea-smoke-${'a'.repeat(alnum - 11 - stamp.length)}.${stamp}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) { failed++; console.log(alnum, 'FAIL', error.message); continue; }
  await new Promise((r) => setTimeout(r, 1200));
  const tid = await tenantIdOf(data.user.id);
  const { data: t } = tid ? await svc.from('tenants').select('slug').eq('id', tid).maybeSingle() : { data: null };
  const good = t?.slug && t.slug.length <= 40;
  if (!good) failed++;
  console.log(alnum, good ? 'OK' : 'BAD', email.length, 'chars', t?.slug, t?.slug?.length);
  const left = tid ? await purgeTenant(tid, data.user.id) : (await svc.auth.admin.deleteUser(data.user.id), []);
  if (left.length) console.log('  cleanup:', left.join('; '));
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);

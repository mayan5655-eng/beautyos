// How many new accounts can be created at the same moment? Creates smoke accounts (confirmed, no email is sent) in batches of 1, 3, 5, 5, 8
// at once and reports failures. Removes them at the end. 2026-10-24: 5 at once lost 1-3; 8 at once lost 5 ("Database error creating new user").
//   node --env-file=.env.local scripts/smoke/signup-concurrency.mjs
import { admin, newEmail, PASSWORD, tenantIdOf } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';
const svc = admin(); const made = [];
for (const conc of [1, 3, 5, 5, 8]) {
  const res = await Promise.all(Array.from({ length: conc }, async () => {
    const email = newEmail('conc');
    const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) return { ok: false, msg: error.message };
    made.push({ email, userId: data.user.id }); return { ok: true };
  }));
  console.log('at once', conc, '-> ok', res.filter((r) => r.ok).length, 'failed', res.filter((r) => !r.ok).length, res.find((r) => !r.ok)?.msg || '');
}
await new Promise((r) => setTimeout(r, 2500));
for (const m of made) { const t = await tenantIdOf(m.userId).catch(() => null); if (t) await purgeTenant(t, m.userId); else await svc.auth.admin.deleteUser(m.userId); }
console.log('removed', made.length);

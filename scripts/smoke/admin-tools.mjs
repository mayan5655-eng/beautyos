// Admin helpers for smoke accounts: create (confirmed, no email is sent), find, remove.
// node --env-file=.env.local scripts/smoke/admin-tools.mjs create <label> | remove-email <email> | list
import { admin, newEmail, PASSWORD, REAL_TENANT, tenantIdOf } from './lib.mjs';
const [cmd, arg] = process.argv.slice(2);
const db = admin();
if (cmd === 'create') {
  const email = newEmail(arg || 'x');
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: {} });
  if (error) { console.error('create failed:', error.message); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));
  console.log(JSON.stringify({ email, userId: data.user.id, tenantId: await tenantIdOf(data.user.id) }));
} else if (cmd === 'remove-email') {
  for (let p = 1; p <= 5; p++) {
    const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
    const u = (data?.users || []).find((x) => x.email === arg);
    if (u) { const t = await tenantIdOf(u.id).catch(() => null); const { error } = await db.auth.admin.deleteUser(u.id); console.log('deleted user', u.id, 'tenant', t, error?.message || 'ok'); process.exit(0); }
    if (!data?.users?.length) break;
  }
  console.log('not found');
} else if (cmd === 'list') {
  for (let p = 1; p <= 5; p++) {
    const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
    for (const u of data?.users || []) if (/^kalmea-smoke-|kalmea\.smoke\.test/.test(u.email || '')) console.log(u.email, u.id, u.created_at);
    if (!data?.users?.length) break;
  }
}

// ---- purge: remove a smoke tenant and its user completely (service role; refuses the real tenant) ----
export async function purgeTenant(tenantId, userId) {
  if (!tenantId || tenantId === REAL_TENANT) throw new Error('refusing');
  const tables = ['receipt_voids','receipts','appointments','forms','skin_scans','client_photos','treatment_results','reviews','auto_reminders_log','whatsapp_messages','waitlist','slot_offers','package_entries','packages','package_offerings','expenses','designs','leads','clients','service_prices','owner_notifications','owner_questions','push_subscriptions','advisor_messages','ai_usage','campaign_posts','campaigns','community_posts','ad_spend','support_messages','grow_payments','facebook_pages','settings','tenant_members'];
  const out = [];
  for (const t of tables) {
    const { error, count } = await db.from(t).delete({ count: 'exact' }).eq('tenant_id', tenantId);
    if (error && !/does not exist|schema cache|Could not find/i.test(error.message)) out.push(`${t}: ${error.message}`);
  }
  const r = await db.from('tenants').delete().eq('id', tenantId);
  if (r.error) out.push('tenants: ' + r.error.message);
  if (userId) { const d = await db.auth.admin.deleteUser(userId); if (d.error) out.push('user: ' + d.error.message); }
  return out;
}
if (cmd === 'purge') { const [tid, uid] = process.argv.slice(3); console.log(await purgeTenant(tid, uid)); }

// purge-smoke: remove EVERY kalmea-smoke-* account and its business (never the real tenant)
if (cmd === 'purge-smoke') {
  for (let p = 1; p <= 10; p++) {
    const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
    for (const u of data?.users || []) {
      if (!/^kalmea-smoke-/.test(u.email || '')) continue;
      const t = await tenantIdOf(u.id).catch(() => null);
      const left = t ? await purgeTenant(t, u.id) : [];
      if (!t) await db.auth.admin.deleteUser(u.id);
      console.log('removed', u.email, t, left.length ? left.join('; ') : 'ok');
    }
    if (!data?.users?.length) break;
  }
}

// Black-box tenant isolation check: a signed-in owner (A) tries to read, change and delete another business's (B) rows through the
// same public API the app uses (anon key + her own session). Both are NEW smoke tenants; nothing real is touched.
//   node --env-file=.env.local scripts/smoke/rls-cross-tenant.mjs      (removes both tenants at the end)
import { createClient } from '@supabase/supabase-js';
import { admin, newEmail, PASSWORD, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const svc = admin();
const mk = async (label) => {
  const email = newEmail(label);
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  await new Promise((r) => setTimeout(r, 1500));
  const tenantId = await tenantIdOf(data.user.id);
  if (!tenantId || tenantId === REAL_TENANT) throw new Error('bad tenant');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: le } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (le) throw le;
  return { email, userId: data.user.id, tenantId, client };
};
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const A = await mk('rlsA'); const B = await mk('rlsB');
try {
  // B's rows (made with the service role, as the app's signup/booking would)
  const { data: c } = await svc.from('clients').insert({ tenant_id: B.tenantId, name: 'לקוחה של B', phone: '0500000009', status: 'active' }).select().single();
  await svc.from('receipts').insert({ tenant_id: B.tenantId, client_id: c.id, client_name: c.name, service: 'x', amount: 1, payment_method: 'מזומן', note: '', items: '[]' });
  await svc.from('appointments').insert({ tenant_id: B.tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: 'x', date: '2030-01-01', start_minute: 600, hour: 10, duration: 30, price: 1 });
  await svc.from('leads').insert({ tenant_id: B.tenantId, name: 'ליד של B', phone: '0500000008', source: 'instagram', status: 'new' });

  const tables = ['clients', 'appointments', 'receipts', 'leads', 'settings', 'designs', 'forms', 'expenses', 'packages', 'package_offerings', 'reviews', 'client_photos', 'treatment_results', 'skin_scans', 'whatsapp_messages', 'waitlist', 'service_prices', 'receipt_voids', 'tenant_members', 'tenants', 'owner_notifications', 'advisor_messages', 'ai_usage', 'campaign_posts', 'community_posts', 'ad_spend', 'billing_subscriptions', 'billing_payments', 'grow_accounts', 'grow_payments', 'support_messages', 'push_subscriptions'];
  for (const t of tables) {
    const own = await A.client.from(t).select('*').limit(1000);
    if (own.error) { console.log('skip', t, '-', own.error.message.slice(0, 60)); continue; }
    const rows = own.data || [];
    const key = t === 'tenants' ? 'id' : 'tenant_id';
    const leak = rows.filter((r) => r[key] && r[key] !== A.tenantId);
    check(leak.length === 0, `A reading ${t} sees ${rows.length} rows, ${leak.length} from another business`);
    const byB = await A.client.from(t).select('*').eq(key, B.tenantId);
    check(!byB.error ? (byB.data || []).length === 0 : true, `A asking for B's ${t} directly gets nothing`);
  }
  // writes into B
  const ins = await A.client.from('clients').insert({ tenant_id: B.tenantId, name: 'הוזרקה', phone: '0500000007' });
  check(!!ins.error, 'A cannot insert a client into B' + (ins.error ? '' : ' (INSERT SUCCEEDED)'));
  const upd = await A.client.from('clients').update({ name: 'שונתה' }).eq('id', c.id).select();
  check(!upd.error ? (upd.data || []).length === 0 : true, 'A cannot update B\'s client');
  const del = await A.client.from('receipts').delete().eq('tenant_id', B.tenantId).select();
  check(!del.error ? (del.data || []).length === 0 : true, 'A cannot delete B\'s receipts');
  const still = await svc.from('clients').select('name').eq('id', c.id).single();
  check(still.data?.name === 'לקוחה של B', 'B\'s client is untouched');
  const tm = await A.client.from('tenant_members').insert({ tenant_id: B.tenantId, user_id: A.userId });
  check(!!tm.error, 'A cannot add herself to B as a member' + (tm.error ? '' : ' (INSERT SUCCEEDED)'));
  const st = await A.client.from('settings').update({ business_name: 'נחטף' }).eq('tenant_id', B.tenantId).select();
  check(!st.error ? (st.data || []).length === 0 : true, 'A cannot rename B\'s business');
  // RPCs the app calls
  const rpc = await A.client.rpc('get_user_tenant_id');
  check(rpc.data === A.tenantId, 'get_user_tenant_id answers A\'s own business');
} finally {
  for (const x of [A, B]) console.log('purged', x.email, await purgeTenant(x.tenantId, x.userId));
}
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL OK');
process.exit(fails.length ? 1 : 0);

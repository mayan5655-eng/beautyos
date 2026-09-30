// scripts/provision-demo-tenants.ts
//
// ONE-TIME, hand-run. Creates the two demo auth users, their tenants/
// tenant_members/settings rows, and does the first seed. After this,
// app/api/demo/reset/route.ts (nightly cron) keeps them populated - this
// script is never run again unless a demo tenant is deleted and rebuilt from
// scratch.
//
//   node --experimental-strip-types --env-file=.env.local scripts/provision-demo-tenants.ts
//
// Idempotent: safe to re-run. `auth.admin.createUser` on an existing email is
// treated as "already exists, look it up" rather than failing the whole run;
// every table write below is an upsert keyed on the demo tenant's fixed id.
//
// Needs a REAL SUPABASE_SERVICE_ROLE_KEY in .env.local - this writes
// auth.users directly and bypasses RLS on every table it touches.

import { createClient } from '@supabase/supabase-js';
import { DEMO_TENANT_IDS, DEMO_AUTH_EMAILS, type DemoField } from '../lib/demoTenants.ts';
import { buildSeedSettings } from '../lib/tenantTemplate.ts';
import { resetDemoTenant } from '../lib/demoSeed.ts';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY || /placeholder|SENSITIVE/i.test(KEY)) {
  console.error('Missing real Supabase credentials.');
  console.error('  node --experimental-strip-types --env-file=.env.local scripts/provision-demo-tenants.ts');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const BUSINESS_NAME: Record<DemoField, string> = {
  cosmetics: 'קליניקת דמו - קוסמטיקה',
  nails: 'סטודיו דמו - ציפורניים',
};
const PRIMARY_COLOR: Record<DemoField, string> = {
  cosmetics: '#8E5A7C',
  nails: '#C98BA6',
};

async function findOrCreateAuthUser(email: string): Promise<string> {
  // No admin.getUserByEmail in supabase-js; list + find is the documented
  // workaround for "does this email already have a user".
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    console.log(`  auth user exists: ${email} (${existing.id})`);
    return existing.id;
  }
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    // Never used to log in - entry is always via magic link
    // (app/demo/[field]/route.ts). Random so it is provably not guessable.
    password: `demo-${crypto.randomUUID()}-${crypto.randomUUID()}`,
  });
  if (createErr || !created.user) throw new Error(`createUser failed for ${email}: ${createErr?.message}`);
  console.log(`  auth user created: ${email} (${created.user.id})`);
  return created.user.id;
}

async function provisionOne(field: DemoField) {
  console.log(`\n== ${field} ==`);
  const tenantId = DEMO_TENANT_IDS[field];
  const email = DEMO_AUTH_EMAILS[field];

  const userId = await findOrCreateAuthUser(email);

  const { error: tenantErr } = await db.from('tenants').upsert(
    { id: tenantId, name: BUSINESS_NAME[field], is_demo: true, plan_status: 'active' },
    { onConflict: 'id' }
  );
  if (tenantErr) throw new Error(`tenants upsert failed: ${tenantErr.message}`);
  console.log(`  tenants row ready: ${tenantId}`);

  const { error: memberErr } = await db.from('tenant_members').upsert(
    { tenant_id: tenantId, user_id: userId, role: 'owner' },
    { onConflict: 'tenant_id,user_id' }
  );
  if (memberErr) throw new Error(`tenant_members upsert failed: ${memberErr.message}`);
  console.log('  tenant_members row ready');

  const { error: settingsErr } = await db.from('settings').upsert(
    {
      tenant_id: tenantId,
      business_name: BUSINESS_NAME[field],
      business_phone: '050-0000000',
      primary_color: PRIMARY_COLOR[field],
      business_fields: [field],
      ...buildSeedSettings(),
    },
    { onConflict: 'tenant_id' }
  );
  if (settingsErr) throw new Error(`settings upsert failed: ${settingsErr.message}`);
  console.log('  settings row ready');

  const seeded = await resetDemoTenant(db, field);
  if (!seeded.ok) throw new Error(`seed failed: ${seeded.error}`);
  console.log('  seeded: clients, appointments, receipts, reviews, waitlist, leads, designs');
}

async function main() {
  for (const field of ['cosmetics', 'nails'] as DemoField[]) {
    await provisionOne(field);
  }
  console.log('\nDone. Visit /demo/cosmetics and /demo/nails to confirm.');
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

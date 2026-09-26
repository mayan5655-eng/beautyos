// app/api/settings/save/route.ts
//
// The ONLY path that writes a tenant's settings row from the app.
//
// Mirrors /api/settings/whatsapp and /api/settings/lead-key: session-
// authenticated, tenant from get_user_tenant_id() on HER session and never
// from the body, and the write itself is narrowed to the columns in
// lib/settingsColumns.ts. Everything else in the body is dropped and logged.
//
// Before this route the browser did `update({...editSettings})` straight at
// the table - the whole row it had read, written back - so a tenant could
// set green_api_instance (the webhook's tenant lookup key), lead_api_key_hash
// and the platform's feature flags on her own row. The grant change in
// supabase/migrations/add_settings_write_guard.sql removes the browser's
// ability to write the table at all; this route is what replaces it.
//
// POST { settings: {...} }
//   -> { success: true, settings: <the row as stored> }
//
// Update first, keyed on the session tenant. A tenant with no row yet (the
// onboarding insert) gets one created with the same payload plus tenant_id.
// The onboarding retry-with-the-seed-stripped lives here now, for the same
// reason it existed there: migrations are applied by hand and can lag the
// code, and an insert naming one column that does not exist fails the whole
// row - on the signup path, for every new cosmetician.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { pickSettingsPayload, preserveProtectedAutomations } from '@/lib/settingsColumns';
import { SEEDED_SETTINGS_KEYS } from '@/lib/tenantTemplate';
import { isMissingColumnError } from '@/lib/pgError';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function resolveTenant() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: 'לא מחוברת', status: 401 as const, tenantId: null };

  const { data: tenantId, error } = await session.rpc('get_user_tenant_id');
  if (error || !tenantId) {
    console.error('[settings/save] tenant resolve failed:', error?.message);
    return { error: 'לא זוהה עסק', status: 400 as const, tenantId: null };
  }
  return { error: null, status: 200 as const, tenantId: tenantId as string };
}

// 200 KB is generous for a settings row (the FAQ and branding JSON are the
// bulk of it) and far below anything a browser would send by accident.
const MAX_BODY_BYTES = 200_000;

export async function POST(request: Request) {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });
  const tenantId = t.tenantId;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'ההגדרות גדולות מדי לשמירה' }, { status: 413 });
  }
  let body: { settings?: unknown } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const { payload, dropped } = pickSettingsPayload(body.settings);
  if (dropped.length) {
    // Expected on every save from the current UI: the browser still holds the
    // whole row (id, tenant_id, created_at, the token ciphertext) and sends it
    // back. Logged so a NEW dropped key - one the UI started editing without
    // being added to the list - is visible, not silently ignored.
    console.log(`[settings/save] tenant ${tenantId}: dropped ${dropped.join(', ')}`);
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'אין מה לשמור' }, { status: 400 });
  }

  const db = admin();

  // The stored automations, so the platform-owned keys survive the save even
  // though the client's copy of them is never trusted.
  const { data: existing, error: readErr } = await db
    .from('settings')
    .select('id, automations')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (readErr) {
    console.error('[settings/save] read failed:', readErr.message);
    return NextResponse.json({ success: false, error: 'שגיאה בקריאת ההגדרות' }, { status: 500 });
  }

  const toWrite = preserveProtectedAutomations(payload, existing?.automations);

  if (existing) {
    const { data, error } = await db
      .from('settings')
      .update(toWrite)
      .eq('tenant_id', tenantId)
      .select()
      .maybeSingle();
    if (error) {
      console.error('[settings/save] update failed:', error.code, error.message);
      return NextResponse.json({ success: false, error: 'לא הצלחנו לשמור את ההגדרות. מה ששמור כבר לא נפגע. נסי שוב בעוד רגע.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, settings: data });
  }

  // No row yet: onboarding. Insert, and on a column the database does not
  // have yet, retry with the seeded keys stripped - she gets her account with
  // what she typed, and the seed applies on its own once the migration lands.
  const insertRow = { ...toWrite, tenant_id: tenantId };
  let { data, error } = await db.from('settings').insert([insertRow]).select().maybeSingle();
  if (error && isMissingColumnError(error)) {
    console.warn('[settings/save] insert rejected a seeded column; retrying with the seed stripped:', error.message);
    const reduced: Record<string, unknown> = { ...insertRow };
    for (const key of SEEDED_SETTINGS_KEYS) delete reduced[key];
    ({ data, error } = await db.from('settings').insert([reduced]).select().maybeSingle());
  }
  if (error) {
    console.error('[settings/save] insert failed:', error.code, error.message);
    return NextResponse.json({ success: false, error: 'יצירת ההגדרות נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ success: true, settings: data, created: true });
}

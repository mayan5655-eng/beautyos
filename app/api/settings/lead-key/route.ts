// app/api/settings/lead-key/route.ts
//
// The ONLY path that creates or rotates a tenant's lead-intake API key.
// Mirrors /api/settings/whatsapp: session-authenticated, tenant from
// get_user_tenant_id() on HER session and never from the body, and the
// secret only ever travels OUTWARD ONCE - the plaintext key exists in the
// response that generated it and nowhere else. The database holds a SHA-256
// hash; there is nothing to leak and nothing to re-show.
//
// GET    -> { configured: boolean }  (never the key or the hash)
// POST   -> generates a new key, overwrites the hash, returns the plaintext
//           once. Rotating invalidates the previous key immediately.
// DELETE -> clears the hash; the endpoint stops accepting for this tenant.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    console.error('[settings/lead-key] tenant resolve failed:', error?.message);
    return { error: 'לא זוהה עסק', status: 400 as const, tenantId: null };
  }
  return { error: null, status: 200 as const, tenantId: tenantId as string };
}

/** Is a key configured? Never what it is - there is no "what it is". */
export async function GET() {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  const { data, error } = await admin()
    .from('settings')
    .select('lead_api_key_hash')
    .eq('tenant_id', t.tenantId)
    .maybeSingle();
  if (error) {
    console.error('[settings/lead-key] status read failed:', error.message);
    return NextResponse.json({ success: false, error: 'שגיאה בקריאה' }, { status: 500 });
  }
  return NextResponse.json({ success: true, configured: !!data?.lead_api_key_hash });
}

export async function POST() {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  // 32 random bytes, base64url: matches the intake route's KEY_RE and carries
  // no characters that need quoting in a header or a curl line.
  const key = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  const { error } = await admin()
    .from('settings')
    .update({ lead_api_key_hash: hash })
    .eq('tenant_id', t.tenantId);
  if (error) {
    console.error('[settings/lead-key] hash write failed:', error.code || '', error.message);
    return NextResponse.json({ success: false, error: 'שמירת המפתח נכשלה' }, { status: 500 });
  }

  console.log(`[settings/lead-key] key rotated for tenant ${t.tenantId}`);
  // The one and only time the plaintext exists outside the caller's hands.
  return NextResponse.json({ success: true, key });
}

export async function DELETE() {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  const { error } = await admin()
    .from('settings')
    .update({ lead_api_key_hash: null })
    .eq('tenant_id', t.tenantId);
  if (error) {
    console.error('[settings/lead-key] clear failed:', error.message);
    return NextResponse.json({ success: false, error: 'הניתוק נכשל' }, { status: 500 });
  }
  console.log(`[settings/lead-key] key cleared for tenant ${t.tenantId}`);
  return NextResponse.json({ success: true });
}

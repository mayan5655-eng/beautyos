// app/api/grow/_shared.ts
//
// SERVER ONLY. What every Grow route needs: the service-role client, the signed-in caller's tenant, and the
// "table not created yet" check, so each route stays short and none of them can forget the tenant lookup.
import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { callerTenantId } from '@/lib/tenantScope';

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
export const tableMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message || ''));
export const DEMO_NOTE = 'זו תצוגה - במערכת שלך זה נשמר באמת';

export async function caller() {
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 }) } as const;
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 403 }) } as const;
  return { session, tenantId } as const;
}

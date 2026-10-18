// app/api/billing/_shared.ts
//
// SERVER ONLY. What every billing route needs: the service-role client, the signed-in caller's tenant, the adapters, and the flag.
//
// NOTE: none of these routes calls requireActiveTenant (lib/planGuard.ts), on purpose. A business whose plan is on hold must still reach
// billing to add a card and pay, which is what unblocks her.
import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { callerTenantId } from '@/lib/tenantScope';
import { APP_URL } from '@/lib/appUrl';
import { billingUiEnabled, resolveBilling } from '@/lib/billing/adapter';
import { signCardSession } from '@/lib/billing/session';

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
export const tableMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message || ''));
export const billing = () => resolveBilling(process.env, APP_URL, signCardSession);

/** Every signed-in billing route answers 404 until BILLING_UI_ENABLED is switched on. */
export function uiOff() {
  return billingUiEnabled() ? null : NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
}

export async function caller() {
  const off = uiOff();
  if (off) return { error: off } as const;
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 }) } as const;
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 403 }) } as const;
  return { session, tenantId, email: user.email || '' } as const;
}

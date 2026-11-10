// app/api/feature-visibility/route.ts
//
// GET -> { success, grow, billing, autoSend }: the switches the browser cannot read for itself, for the signed-in business, so the
// app can HIDE what is not active (2026-11-09 owner rule) instead of explaining it: the help page, its "▶ סרטון" links, and the
// copy that would otherwise promise a message goes out by itself (app/useDeployFlags.js).
//   grow      the Grow screens are on for her business (GROW_UI_ENABLED, GROW_ALLOWED_TENANTS)
//   billing   the subscription screens are on (BILLING_UI_ENABLED)
//   autoSend  the central number sends WhatsApp messages by itself (platform_settings, lib/platformSettings.js; fails closed)
// Booleans only: no tenant data, no secrets. Any failure answers all false, which hides rather than promises.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { deployFlagsFor } from '@/lib/deployFlags';
import { isUtilityAutoSendEnabled } from '@/lib/platformSettings';

export const dynamic = 'force-dynamic';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const OFF = { success: true, grow: false, billing: false, autoSend: false };

export async function GET() {
  try {
    const session = await createSession();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ ...OFF, success: false, error: 'לא מחוברת' }, { status: 401 });
    const tenantId = await callerTenantId(session);
    if (!tenantId) return NextResponse.json(OFF);
    const autoSend = await isUtilityAutoSendEnabled(admin()).catch(() => false);
    return NextResponse.json({ success: true, ...deployFlagsFor(String(tenantId)), autoSend: autoSend === true });
  } catch (e) {
    console.error('[feature-visibility] failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json(OFF);
  }
}

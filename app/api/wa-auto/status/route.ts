// app/api/wa-auto/status/route.ts
//
// Tells HER settings screen whether the automatic WhatsApp reminders can be offered at all. Signed-in owners only: the
// tenant comes from her session (callerTenantId), never from the request, and is rate-limited per device and per
// business. The answer is about this deployment and her own business only: { available } and, when available, the
// default lead time and monthly ceiling. No other business's data, no ids, no credentials and no env values beyond that.
// No Meta call. A demo business and an anonymous caller both get { available: false } (the row renders nothing,
// lib/waCloud/autoVisible.js).

import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { callerTenantId } from '@/lib/tenantScope';
import { checkTenantLimit, checkIpLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { publicAutoStatus } from '@/lib/waCloud/autoConfig';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const ipLimited = checkIpLimit(request, 'wa-auto-status');
  if (ipLimited) return ipLimited;
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ available: false }, { status: 401, headers: NO_STORE });
  const tenantId = await callerTenantId(session);
  if (!tenantId) return NextResponse.json({ available: false }, { status: 403, headers: NO_STORE });
  const limited = checkTenantLimit(tenantId, 'wa-auto-status');
  if (limited) return limited;
  if (isDemoTenantId(tenantId)) return NextResponse.json({ available: false }, { headers: NO_STORE });
  return NextResponse.json(publicAutoStatus(), { headers: NO_STORE });
}

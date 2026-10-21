// app/api/phone/status/route.ts
//
// POST -> { gate: 'none' | 'prompt' | 'required', verified }. Asked by the app shell and onboarding for the signed-in
// account. POST, not GET, because the first call after a phone-first signup also claims the number she verified
// there (from the signed ticket in her account's metadata) - a write, so never cached or prefetched.
//
// Fails open: no session, an unreadable table or any error answers 'none'. This decides whether to ASK for a number;
// it must never be the reason she cannot reach her calendar.

import { NextResponse } from 'next/server';
import { phoneStore, sessionInfo } from '@/lib/phoneVerify/route';
import { phoneStatus } from '@/lib/phoneVerify/service';
import { isDemoTenantId } from '@/lib/demoTenants';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await sessionInfo();
  if (!session) return NextResponse.json({ gate: 'none', verified: false }, { status: 401 });
  const st = await phoneStatus({
    store: phoneStore(), user: session.user, tenantId: session.tenantId, isDemoTenant: isDemoTenantId(session.tenantId),
  });
  return NextResponse.json(st, { headers: { 'Cache-Control': 'no-store' } });
}

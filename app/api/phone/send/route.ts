// app/api/phone/send/route.ts
//
// POST { phone, purpose: 'signup' | 'verify' } -> sends a 6-digit code by SMS.
//
//   signup   before the account exists (the signup page). No session.
//   verify   a signed-in account adding its number (the login prompt). The account comes from the session, never the body.
//
// Every send costs money, so lib/phoneVerify/service.ts refuses first and sends last: a malformed or non-Israeli
// number, a number another account holds, a switched-off feature, or any rate limit (per number, per device, per
// account, platform-wide per day) is answered without an SMS.

import { NextResponse } from 'next/server';
import { ipHashOf, phoneStore, sessionInfo } from '@/lib/phoneVerify/route';
import { sendCode } from '@/lib/phoneVerify/service';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { phone?: unknown; purpose?: unknown };
  const purpose = body.purpose === 'verify' ? 'verify' : 'signup';
  const session = purpose === 'verify' ? await sessionInfo() : null;
  const res = await sendCode({
    store: phoneStore(), phone: body.phone, purpose,
    userId: session?.user.id ?? null, ipHash: ipHashOf(request),
  });
  return NextResponse.json(res.body, { status: res.status });
}

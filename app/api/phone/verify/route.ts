// app/api/phone/verify/route.ts
//
// POST { phone, code, purpose: 'signup' | 'verify' }
//
//   signup   a correct code answers { ticket }: a signed, 48-hour proof that she holds this number, which the signup
//            form stores in the new account (user_metadata.phone_e164 / phone_ticket). The number is claimed for her
//            on her first signed-in request (app/api/phone/status).
//   verify   a correct code claims the number for the signed-in account at once (claim_owner_phone in the database,
//            which refuses a number another account holds).
//
// Five wrong guesses per code, counted atomically in the database before comparing.

import { NextResponse } from 'next/server';
import { phoneStore, sessionInfo } from '@/lib/phoneVerify/route';
import { verifyCode } from '@/lib/phoneVerify/service';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { phone?: unknown; code?: unknown; purpose?: unknown };
  const purpose = body.purpose === 'verify' ? 'verify' : 'signup';
  const session = purpose === 'verify' ? await sessionInfo() : null;
  const res = await verifyCode({
    store: phoneStore(), phone: body.phone, code: body.code, purpose,
    userId: session?.user.id ?? null, tenantId: session?.tenantId ?? null,
  });
  return NextResponse.json(res.body, { status: res.status });
}

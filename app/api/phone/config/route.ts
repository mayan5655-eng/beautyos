// app/api/phone/config/route.ts
//
// GET -> { phoneRequired, mock }. Asked by the signup page before it shows its form: does a new signup verify her
// mobile first? False whenever the switch is off, SMS is not configured, or the switches cannot be read (the
// migration has not run) - the old two-field signup is always the fallback, never a dead end.

import { NextResponse } from 'next/server';
import { phoneStore } from '@/lib/phoneVerify/route';
import { signupConfig } from '@/lib/phoneVerify/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = await signupConfig(phoneStore());
  return NextResponse.json(cfg, { headers: { 'Cache-Control': 'no-store' } });
}

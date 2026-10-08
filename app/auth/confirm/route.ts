// app/auth/confirm/route.ts
// The confirmation link in the sign-up email: /auth/confirm?token_hash=...&type=email&next=/onboarding
//
// Why not /auth/callback (the PKCE code flow): a code can only be traded for a session in the browser that started the
// sign-up (the verifier lives in its cookie). A cosmetician signs up on her computer and opens the email on her phone, so
// that link failed. A token_hash is verified by the server alone, so the link opens in any browser on any device.

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/onboarding';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/onboarding'; // same-site paths only

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Expired, already used, or malformed: login explains it (her email may well be confirmed already).
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

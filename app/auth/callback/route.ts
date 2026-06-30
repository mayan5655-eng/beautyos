// app/auth/callback/route.ts
// Exchanges the `code` from a Supabase email link (magic link / signup
// confirmation / password recovery) for a real session, writing the session
// cookies. Without this, clicking the email link never creates a session.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Where to send the user after a successful exchange.
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or the exchange failed → back to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

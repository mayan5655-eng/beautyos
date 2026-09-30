// app/demo/[field]/route.ts
//
// The shareable demo link: /demo/cosmetics or /demo/nails. Mints a real
// session for the fixed demo auth user (lib/demoTenants.ts,
// scripts/provision-demo-tenants.ts) and writes it as cookies on THIS
// response, directly - no redirect through Supabase's own hosted verify
// endpoint.
//
// That redirect was the first design and it does not work: this project's
// Auth is configured for the implicit flow, so Supabase's verify endpoint
// redirects with the session in a URL FRAGMENT (#access_token=...), which a
// server never sees (fragments are never sent in an HTTP request) and which
// the existing /auth/callback route (built for the PKCE ?code= flow) cannot
// pick up either. Verified by hand: the redirect landed on the bare
// production root with the tokens inert in the fragment, no session ever
// created. supabase.auth.admin.generateLink() also returns hashed_token
// (email_otp's hashed form) precisely so a server can skip the hosted
// redirect and verify the OTP itself - that is what this does, on the same
// cookie-writing SSR client /auth/callback uses, so the session lands as
// real cookies on this exact response regardless of the project's flow type.
//
// Public on purpose: proxy.ts/lib/supabase/middleware.ts's PUBLIC_PREFIXES
// includes '/demo', and this route needs no session of its own to run - it
// CREATES one.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { DEMO_AUTH_EMAILS, type DemoField } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET(_request: Request, { params }: { params: Promise<{ field: string }> }) {
  const { field } = await params;
  if (field !== 'cosmetics' && field !== 'nails') {
    return NextResponse.redirect(`${APP_URL}/demo`);
  }
  const email = DEMO_AUTH_EMAILS[field as DemoField];

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hashedToken = data?.properties?.hashed_token;

  if (error || !hashedToken) {
    console.error('[demo] generateLink failed:', error?.message);
    return NextResponse.redirect(`${APP_URL}/demo?error=1`);
  }

  const session = await createSessionClient();
  const { error: verifyErr } = await session.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashedToken,
  });

  if (verifyErr) {
    console.error('[demo] verifyOtp failed:', verifyErr.message);
    return NextResponse.redirect(`${APP_URL}/demo?error=1`);
  }

  return NextResponse.redirect(`${APP_URL}/`);
}

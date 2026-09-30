// app/demo/[field]/route.ts
//
// The shareable demo link: /demo/cosmetics or /demo/nails. Mints a real
// magic-link session for the fixed demo auth user (lib/demoTenants.ts,
// scripts/provision-demo-tenants.ts) via the service-role admin API, and lets
// Supabase's own hosted verify endpoint carry it into the EXISTING
// /auth/callback exchange - no new auth surface, no forked UI. The visitor
// lands in the real app/beautyos.jsx dashboard with a genuine session,
// pointed at the demo tenant's fake, isolated data.
//
// Public on purpose: proxy.ts already treats any single top-level path
// segment as public, and this route needs no session of its own to run -
// it CREATES one.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEMO_AUTH_EMAILS, type DemoField } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';

const db = createClient(
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

  const { data, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent('/')}` },
  });

  if (error || !data?.properties?.action_link) {
    console.error('[demo] generateLink failed:', error?.message);
    return NextResponse.redirect(`${APP_URL}/demo?error=1`);
  }

  return NextResponse.redirect(data.properties.action_link);
}

// app/api/attribution/route.ts
//
// POST { attr: "<the kl_attr cookie value>" }  ->  writes tenants.signup_source for HER tenant, once.
//
// Called by the onboarding page the first time it runs for a new account, with the first-party cookie the
// landing page left (app/AttributionCapture.jsx, lib/attribution.js). Session-authenticated; the tenant comes
// from her session and never from the body; the cookie is re-parsed here and reduced to a short label, so
// nothing the browser sends is stored as given; and it only ever fills an EMPTY signup_source, so a second
// call (or a replay) cannot rewrite which ad brought her. The service role writes it because the column is
// not hers to edit.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { parseAttribution, signupSourceLabel } from '@/lib/attribution';

export async function POST(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'לא מחוברת' }, { status: 401 });
  const { data: tenantId } = await session.rpc('get_user_tenant_id');
  if (!tenantId) return NextResponse.json({ ok: false, error: 'לא זוהה עסק' }, { status: 400 });

  let body: { attr?: unknown } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const label = signupSourceLabel(parseAttribution(typeof body.attr === 'string' ? body.attr : ''));
  if (!label) return NextResponse.json({ ok: true, stored: false });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('tenants').update({ signup_source: label }).eq('id', tenantId).is('signup_source', null).select('id');
  if (error) {
    console.error('[attribution] write failed:', error.message);
    return NextResponse.json({ ok: false, error: 'לא נשמר' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: Array.isArray(data) && data.length > 0 });
}

// app/api/facebook/deauthorize/route.ts
//
// Meta's Deauthorize Callback: Meta POSTs a form with `signed_request` when a person removes Kalmea from her
// Facebook account. The signature is verified against FACEBOOK_APP_SECRET first; an unverifiable request is a
// 400 and changes nothing. A verified one switches off the Page connections that person made and wipes their
// stored tokens (lib/facebook/userData.ts). Answers 200 so Meta does not retry.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseSignedRequest } from '@/lib/facebook/signedRequest';
import { deauthorizeFacebookUser } from '@/lib/facebook/userData';
import { encryptToken } from '@/lib/facebook/encryption';

export async function POST(request: Request) {
  let signed: unknown = null;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) signed = ((await request.json()) as { signed_request?: unknown }).signed_request;
    else signed = (await request.formData()).get('signed_request');
  } catch { /* handled below */ }

  const payload = parseSignedRequest(signed, process.env.FACEBOOK_APP_SECRET);
  if (!payload) return NextResponse.json({ success: false, error: 'invalid signed_request' }, { status: 400 });

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await deauthorizeFacebookUser(db, payload.user_id, encryptToken('revoked'));
    console.log(`[facebook-deauthorize] matched=${r.matched} columnMissing=${r.columnMissing}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[facebook-deauthorize] failed:', (e as Error)?.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}

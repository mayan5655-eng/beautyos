// app/api/facebook/data-deletion/route.ts
//
// Meta's Data Deletion Request Callback. Meta POSTs `signed_request`; we verify it, delete what Kalmea holds
// about that Facebook user (the Page connections and tokens, lib/facebook/userData.ts) and answer with the JSON
// Meta requires: { url, confirmation_code }. The url is a public status page that verifies the code and says
// when the request was handled. Lead records belong to the business that ran the ad and are kept; the privacy
// page ("Data Deletion") explains how a person asks for those.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APP_URL } from '@/lib/appUrl';
import { parseSignedRequest, makeDeletionCode } from '@/lib/facebook/signedRequest';
import { deleteFacebookUserData } from '@/lib/facebook/userData';

export async function POST(request: Request) {
  let signed: unknown = null;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) signed = ((await request.json()) as { signed_request?: unknown }).signed_request;
    else signed = (await request.formData()).get('signed_request');
  } catch { /* handled below */ }

  const secret = process.env.FACEBOOK_APP_SECRET;
  const payload = parseSignedRequest(signed, secret);
  if (!payload || !secret) return NextResponse.json({ success: false, error: 'invalid signed_request' }, { status: 400 });

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await deleteFacebookUserData(db, payload.user_id);
    console.log(`[facebook-data-deletion] removed=${r.matched} columnMissing=${r.columnMissing}`);
    const code = makeDeletionCode(payload.user_id, secret);
    return NextResponse.json({ url: `${APP_URL}/data-deletion/status?code=${encodeURIComponent(code)}`, confirmation_code: code });
  } catch (e) {
    console.error('[facebook-data-deletion] failed:', (e as Error)?.message);
    // 500 so Meta retries: nothing was confirmed.
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}

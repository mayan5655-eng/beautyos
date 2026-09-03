// app/api/facebook/oauth/start/route.ts
// Initiates Facebook OAuth flow

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APP_URL, APP_URL_IS_CONFIGURED } from '../../../../../lib/appUrl';
import crypto from 'crypto';

// Service-role client for the state row. facebook_oauth_states has RLS with no
// policies (REVOKE ALL), which is correct: only these two OAuth routes may
// touch it, and they authenticate the user themselves before doing so.
function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// The full set the lead pipeline needs:
//   pages_show_list        - enumerate the user's pages (getUserPages)
//   pages_manage_metadata  - subscribe the page to the app's leadgen webhook
//   pages_read_engagement  - read page content the token is scoped to
//   leads_retrieval        - fetch lead field data from the Graph API
//
// These require App Review before a user WITHOUT a role on the app can grant
// them. While the app is in Development Mode they work for admins/developers/
// testers of the app - which is how the flow is tested end-to-end before
// review. (They were temporarily reduced to public_profile alone; that made
// the OAuth dance completable but the resulting tokens useless for leads.)
const FACEBOOK_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
  'leads_retrieval',
].join(',');

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to connect Facebook' },
        { status: 401 }
      );
    }

    const appId = process.env.FACEBOOK_APP_ID;
    // Shared resolver: the redirect_uri built here must match the one the
    // callback sends during the token exchange byte for byte, or Facebook
    // rejects it. Previously this had no fallback at all, so a missing env var
    // failed the whole integration with "not configured".
    const appUrl = APP_URL;

    if (!appId) {
      return NextResponse.json(
        { error: 'Facebook integration is not configured' },
        { status: 500 }
      );
    }

    const state = crypto.randomBytes(32).toString('hex');

    const redirectUri = `${appUrl}/api/facebook/oauth/callback`;
    const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    fbAuthUrl.searchParams.set('client_id', appId);
    fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
    fbAuthUrl.searchParams.set('state', state);
    fbAuthUrl.searchParams.set('scope', FACEBOOK_SCOPES);
    fbAuthUrl.searchParams.set('response_type', 'code');

    // Diagnostic: ?dryrun=1 returns the URL we would redirect to instead of
    // redirecting. This is the ONLY way to see what Meta actually receives -
    // the browser 302s straight to facebook.com and the dialog does not echo
    // its parameters back - and it settles in one look whether client_id is
    // the app being configured and whether redirect_uri points at localhost.
    // Requires the same login as the flow itself, so it leaks nothing a
    // connect click would not.
    if (request.nextUrl.searchParams.get('dryrun') === '1') {
      // Self-test the app credentials against Meta: a client_credentials
      // exchange succeeds only when FACEBOOK_APP_ID and FACEBOOK_APP_SECRET
      // belong to the same app. This answers "is the secret in this
      // deployment right?" without exposing a byte of it.
      let app_secret_valid: boolean | null = null;
      let app_secret_error: string | null = null;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appSecret) {
        app_secret_error = 'FACEBOOK_APP_SECRET is not set';
      } else {
        try {
          const probe = await fetch(
            'https://graph.facebook.com/oauth/access_token?' +
              new URLSearchParams({
                client_id: appId,
                client_secret: appSecret,
                grant_type: 'client_credentials',
              }).toString()
          );
          app_secret_valid = probe.ok;
          if (!probe.ok) {
            const body = await probe.text();
            // Meta's error body carries no secret material.
            app_secret_error = body.slice(0, 300);
          }
        } catch (probeError) {
          app_secret_error = probeError instanceof Error ? probeError.message : String(probeError);
        }
      }
      return NextResponse.json({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: FACEBOOK_SCOPES,
        app_url_from_env: APP_URL_IS_CONFIGURED,
        app_secret_valid,
        app_secret_error,
        full_url: fbAuthUrl.toString(),
      });
    }

    // Resolve the tenant the same way every other route does - the
    // get_user_tenant_id() RPC on the session client - and fail loudly if it
    // comes back null: a user with no tenant has nothing to connect a page TO,
    // and must not be sent to Meta's consent dialog at all.
    const { data: tenantId, error: tenantError } = await supabase.rpc(
      'get_user_tenant_id'
    );
    if (tenantError || !tenantId) {
      console.error('[fb-oauth] tenant resolution FAILED - refusing to redirect to Meta:', tenantError?.message || 'null tenant');
      return NextResponse.json(
        { error: 'Could not resolve your business account', detail: tenantError?.message || 'no tenant for this user' },
        { status: 500 }
      );
    }

    // Persist the state server-side BEFORE redirecting to Meta, and fail
    // loudly if that write fails - never send the user to the consent dialog
    // with nothing for the callback to verify against. The cookie set below
    // remains as the fast path, but a sameSite=lax cookie can be lost across
    // popup/browser-context round-trips; the row is the fallback that survives
    // that. Check error, not data: an insert returning no error IS the success.
    // (After the dryrun return above, so diagnostics do not litter state rows.)
    const { error: stateError } = await admin()
      .from('facebook_oauth_states')
      .insert({ state, user_id: user.id, tenant_id: tenantId });

    if (stateError) {
      console.error('[fb-oauth] state insert FAILED - refusing to redirect to Meta:', stateError.code || '', stateError.message);
      return NextResponse.json(
        { error: 'Failed to persist OAuth state', detail: stateError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.redirect(fbAuthUrl.toString());
    response.cookies.set('fb_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Facebook OAuth start error:', error);
    return NextResponse.json(
      { error: 'Failed to start Facebook authorization' },
      { status: 500 }
    );
  }
}
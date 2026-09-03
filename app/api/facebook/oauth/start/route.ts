// app/api/facebook/oauth/start/route.ts
// Initiates Facebook OAuth flow

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { APP_URL, APP_URL_IS_CONFIGURED } from '../../../../../lib/appUrl';
import crypto from 'crypto';

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
      return NextResponse.json({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: FACEBOOK_SCOPES,
        app_url_from_env: APP_URL_IS_CONFIGURED,
        full_url: fbAuthUrl.toString(),
      });
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
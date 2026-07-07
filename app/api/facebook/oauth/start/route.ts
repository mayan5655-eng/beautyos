// app/api/facebook/oauth/start/route.ts
// Initiates Facebook OAuth flow

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import crypto from 'crypto';

// TEMP: reduced to basic scopes that do NOT require App Review, so the OAuth
// flow can be tested end-to-end before the app is approved. Add the
// page-management scopes back after App Review:
//   'pages_show_list', 'pages_manage_metadata', 'pages_read_engagement',
//   'leads_retrieval', 'business_management'
const FACEBOOK_SCOPES = [
  'public_profile',
  'email',
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appId || !appUrl) {
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
// app/api/facebook/oauth/callback/route.ts
// Handles the OAuth callback from Facebook

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { FacebookClient } from '../../../../../lib/facebook/client';
import { encryptToken } from '../../../../../lib/facebook/encryption';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  if (errorParam) {
    console.error('Facebook OAuth error:', errorParam, errorReason);
    return NextResponse.redirect(
      `${appUrl}/onboarding?fb_error=${encodeURIComponent(errorReason || errorParam)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/onboarding?fb_error=missing_parameters`
    );
  }

  try {
    const cookieState = request.cookies.get('fb_oauth_state')?.value;

    if (!cookieState || cookieState !== state) {
      return NextResponse.redirect(
        `${appUrl}/onboarding?fb_error=invalid_state`
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        `${appUrl}/login?fb_error=not_authenticated`
      );
    }

    const { data: tenantData, error: tenantError } = await supabase.rpc(
      'get_user_tenant_id'
    );

    if (tenantError || !tenantData) {
      console.error('Failed to get tenant ID:', tenantError);
      return NextResponse.redirect(
        `${appUrl}/onboarding?fb_error=no_tenant`
      );
    }

    const tenantId = tenantData;

    const tokenResponse = await FacebookClient.exchangeCodeForToken(
      code,
      `${appUrl}/api/facebook/oauth/callback`
    );

    const longLivedToken = await FacebookClient.exchangeForLongLivedToken(
      tokenResponse.access_token
    );

    const fbClient = new FacebookClient(longLivedToken.access_token);
    const pages = await fbClient.getUserPages();

    if (!pages || pages.length === 0) {
      return NextResponse.redirect(
        `${appUrl}/onboarding?fb_error=no_pages`
      );
    }

    const encryptedUserToken = encryptToken(longLivedToken.access_token);

    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + (longLivedToken.expires_in || 5184000)
    );

    for (const page of pages) {
      const encryptedPageToken = encryptToken(page.access_token);

      const { error: upsertError } = await supabase
        .from('facebook_pages')
        .upsert(
          {
            tenant_id: tenantId,
            facebook_page_id: page.id,
            page_name: page.name,
            page_category: page.category,
            access_token_encrypted: encryptedPageToken,
            user_access_token_encrypted: encryptedUserToken,
            token_expires_at: expiresAt.toISOString(),
            is_active: false,
            connected_by: user.id,
            connected_at: new Date().toISOString(),
          },
          {
            onConflict: 'tenant_id,facebook_page_id',
          }
        );

      if (upsertError) {
        console.error('Failed to save page:', page.id, upsertError);
      }
    }

    const response = NextResponse.redirect(
      `${appUrl}/onboarding?fb_success=true&pages=${pages.length}`
    );
    response.cookies.delete('fb_oauth_state');

    return response;
  } catch (error) {
    console.error('Facebook OAuth callback error:', error);
    return NextResponse.redirect(
      `${appUrl}/onboarding?fb_error=callback_failed`
    );
  }
}
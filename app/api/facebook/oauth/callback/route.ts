// app/api/facebook/oauth/callback/route.ts
// Handles the OAuth callback from Facebook

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { FacebookClient } from '../../../../../lib/facebook/client';
import { encryptToken } from '../../../../../lib/facebook/encryption';
import { APP_URL } from '../../../../../lib/appUrl';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  // Was `|| ''`, which is worse than no fallback: every redirect below became a
  // bare path like "/dashboard?fb_error=...", and NextResponse.redirect needs an
  // absolute URL, so the error paths threw instead of redirecting. Line 67 also
  // feeds the token exchange, where this must match /oauth/start exactly - hence
  // the shared resolver rather than a second literal.
  const appUrl = APP_URL;

  if (errorParam) {
    console.error('Facebook OAuth error:', errorParam, errorReason);
    return NextResponse.redirect(
      `${appUrl}/dashboard?fb_error=${encodeURIComponent(errorReason || errorParam)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?fb_error=missing_parameters`
    );
  }

  try {
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

    // State verification, two layers. The cookie is the fast path; the
    // facebook_oauth_states row written by /oauth/start is the fallback for
    // round-trips where a sameSite=lax cookie does not survive (popups,
    // browser-context switches). The row must belong to THIS user and be
    // fresh; it is consumed (deleted) whichever path validated, so a state
    // can never be replayed.
    const cookieState = request.cookies.get('fb_oauth_state')?.value;
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let stateValid = !!cookieState && cookieState === state;
    if (!stateValid) {
      const { data: stateRow, error: stateReadError } = await svc
        .from('facebook_oauth_states')
        .select('user_id, created_at')
        .eq('state', state)
        .maybeSingle();
      if (stateReadError) {
        console.error('[fb-oauth] state row read FAILED:', stateReadError.message);
      }
      stateValid =
        !!stateRow &&
        stateRow.user_id === user.id &&
        Date.now() - new Date(stateRow.created_at).getTime() < 10 * 60 * 1000;
    }

    // Consume the row regardless of which layer validated (or neither).
    await svc.from('facebook_oauth_states').delete().eq('state', state);

    if (!stateValid) {
      console.error('[fb-oauth] state invalid: no matching cookie and no fresh row for this user');
      return NextResponse.redirect(
        `${appUrl}/dashboard?fb_error=invalid_state`
      );
    }

    const { data: tenantData, error: tenantError } = await supabase.rpc(
      'get_user_tenant_id'
    );

    if (tenantError || !tenantData) {
      console.error('Failed to get tenant ID:', tenantError);
      return NextResponse.redirect(
        `${appUrl}/dashboard?fb_error=no_tenant`
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
        `${appUrl}/dashboard?fb_error=no_pages`
      );
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + (longLivedToken.expires_in || 5184000)
    );

    let savedCount = 0;
    let upsertFailed = false;
    let subscribeFailed = false;

    for (const page of pages) {
      const encryptedPageToken = encryptToken(page.access_token);

      const { error: upsertError } = await supabase
        .from('facebook_pages')
        .upsert(
          {
            tenant_id: tenantId,
            page_id: page.id,
            page_name: page.name,
            page_category: page.category,
            instagram_business_id: page.instagram_business_account?.id ?? null,
            page_access_token_encrypted: encryptedPageToken,
            long_lived_token_expires_at: expiresAt.toISOString(),
            connected_by_user_id: user.id,
          },
          {
            onConflict: 'tenant_id,page_id',
          }
        );

      if (upsertError) {
        console.error('Failed to save page:', page.id, upsertError);
        upsertFailed = true;
      } else {
        savedCount++;

        // Subscribe the page to the app's leadgen webhook. Without this call
        // Meta never sends a single event - saving the token alone connects
        // nothing. This was the missing link that kept the webhook route from
        // ever receiving a real lead.
        try {
          const ok = await fbClient.subscribePageToWebhook(page.id, page.access_token);
          if (!ok) {
            console.error('Webhook subscribe returned success=false for page:', page.id);
            subscribeFailed = true;
          } else {
            console.log('Page subscribed to leadgen webhook:', page.id);
          }
        } catch (subscribeError) {
          // Typically a missing pages_manage_metadata grant. The page row is
          // saved either way; the redirect below surfaces the failure instead
          // of claiming a working connection.
          console.error('Webhook subscribe failed for page:', page.id, subscribeError);
          subscribeFailed = true;
        }
      }
    }

    // Surface failures instead of falsely reporting success.
    if (upsertFailed) {
      const response = NextResponse.redirect(
        `${appUrl}/dashboard?fb_error=save_failed`
      );
      response.cookies.delete('fb_oauth_state');
      return response;
    }

    // Saved but not subscribed is NOT success: leads will not arrive. Tell her.
    if (subscribeFailed) {
      const response = NextResponse.redirect(
        `${appUrl}/dashboard?fb_error=subscribe_failed`
      );
      response.cookies.delete('fb_oauth_state');
      return response;
    }

    const response = NextResponse.redirect(
      `${appUrl}/dashboard?fb_success=true&pages=${savedCount}`
    );
    response.cookies.delete('fb_oauth_state');

    return response;
  } catch (error) {
    console.error('Facebook OAuth callback error:', error);
    return NextResponse.redirect(
      `${appUrl}/dashboard?fb_error=callback_failed`
    );
  }
}
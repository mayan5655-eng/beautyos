// app/api/facebook/webhook/route.ts
// Receives real-time lead notifications from Facebook
// GET handler verifies the webhook subscription
// POST handler processes incoming leads
//
// Facebook calls this endpoint with no session cookie, so there is no
// authenticated role and RLS denies every write. All DB access therefore uses
// the service-role client, the same pattern as app/api/claim/route.ts. The
// HMAC signature check is the only guard and runs before any DB access.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FacebookClient, parseLeadFields, extractStandardFields } from '../../../../lib/facebook/client';
import { decryptToken } from '../../../../lib/facebook/encryption';
import crypto from 'crypto';
import { scoreLead } from '../../../../lib/ai/scoreLeads';

// Service-role client (bypasses RLS). Only ever constructed after the HMAC
// signature has been verified.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// One row per webhook change, success or failure. This is the audit trail the
// dashboard reads (/dashboard/leads/webhook-events), so it must be written on
// EVERY path - the failure modes most likely in practice (page not registered,
// token expired, Graph fetch failed) previously left no row at all, which is
// how a lead vanishes with nothing to look at. Logging must never break lead
// processing, hence its own try/catch.
async function logEvent(
  supabase: ReturnType<typeof admin>,
  event: {
    tenant_id: string | null;
    facebook_page_id: string;
    leadgen_id: string | null;
    payload: unknown;
    processed: boolean;
    error_message: string | null;
  }
) {
  try {
    const { error } = await supabase.from('facebook_webhook_events').insert({
      event_type: 'leadgen',
      ...event,
    });
    if (error) {
      console.error('[fb-webhook] event insert: FAILED', event.leadgen_id || '', error.code || '', error.message);
    } else {
      console.log('[fb-webhook] event insert: OK', event.leadgen_id || '', event.processed ? '' : `error: ${event.error_message}`);
    }
  } catch (e) {
    console.error('[fb-webhook] event insert: THREW', event.leadgen_id || '', e);
  }
}

interface WebhookChange {
  field: string;
  value: {
    leadgen_id: string;
    page_id: string;
    form_id: string;
    adgroup_id?: string;
    ad_id?: string;
    created_time: number;
  };
}

interface WebhookEntry {
  id: string;
  time: number;
  changes: WebhookChange[];
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

function verifyFacebookSignature(
  body: string,
  signature: string | null
): boolean {
  if (!signature) return false;

  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) {
    console.error('FACEBOOK_APP_SECRET is not configured');
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('FACEBOOK_WEBHOOK_VERIFY_TOKEN is not configured');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('Facebook webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('Facebook webhook verification failed');
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyFacebookSignature(rawBody, signature)) {
      // Guard: this is the only authentication on this endpoint.
      console.warn('[fb-webhook] signature valid: NO - rejecting request');
      return new NextResponse('Unauthorized', { status: 401 });
    }
    console.log('[fb-webhook] signature valid: YES');

    const payload = JSON.parse(rawBody) as WebhookPayload;

    if (payload.object !== 'page') {
      console.log('[fb-webhook] ignoring payload object:', payload.object);
      return new NextResponse('OK', { status: 200 });
    }

    // Signature verified above, so it is safe to take the service-role client.
    const supabase = admin();

    for (const entry of payload.entry) {
      const pageId = entry.id;

      const { data: pageData, error: pageError } = await supabase
        .from('facebook_pages')
        .select('tenant_id, page_access_token_encrypted, is_active')
        .eq('page_id', pageId)
        .single();

      // Only leadgen changes matter anywhere below; filter once so the failure
      // paths can log exactly the changes that carried a lead.
      const leadgenChanges = entry.changes.filter((c) => c.field === 'leadgen');
      if (leadgenChanges.length === 0) continue;

      if (pageError || !pageData) {
        console.error('[fb-webhook] tenant matched: NO - page not found:', pageId, pageError?.message || '');
        // tenant_id null: there is no tenant to attribute this to, and that is
        // the point - a lead arrived for a page nobody registered.
        for (const change of leadgenChanges) {
          await logEvent(supabase, {
            tenant_id: null,
            facebook_page_id: pageId,
            leadgen_id: change.value.leadgen_id,
            payload: change.value,
            processed: false,
            error_message: `page not registered in facebook_pages${pageError ? `: ${pageError.message}` : ''}`,
          });
        }
        continue;
      }

      if (!pageData.is_active) {
        console.log('[fb-webhook] tenant matched: YES but page inactive, skipping:', pageId);
        for (const change of leadgenChanges) {
          await logEvent(supabase, {
            tenant_id: pageData.tenant_id,
            facebook_page_id: pageId,
            leadgen_id: change.value.leadgen_id,
            payload: change.value,
            processed: false,
            error_message: 'page is marked inactive (facebook_pages.is_active = false)',
          });
        }
        continue;
      }

      console.log('[fb-webhook] tenant matched: YES page', pageId, '-> tenant', pageData.tenant_id);

      let pageAccessToken: string;
      try {
        pageAccessToken = decryptToken(pageData.page_access_token_encrypted);
      } catch (decryptError) {
        console.error('Failed to decrypt token for page:', pageId, decryptError);
        for (const change of leadgenChanges) {
          await logEvent(supabase, {
            tenant_id: pageData.tenant_id,
            facebook_page_id: pageId,
            leadgen_id: change.value.leadgen_id,
            payload: change.value,
            processed: false,
            error_message: 'failed to decrypt page access token - reconnect Facebook from the dashboard',
          });
        }
        continue;
      }

      const fbClient = new FacebookClient(pageAccessToken);

      for (const change of leadgenChanges) {
        const leadgenId = change.value.leadgen_id;

        try {
          const lead = await fbClient.getLeadDetails(leadgenId, pageAccessToken);

          const parsedFields = parseLeadFields(lead.field_data);
          const { name, email, phone } = extractStandardFields(parsedFields);

          // Run AI scoring on the lead
          const aiScore = await scoreLead({
            fullName: name,
            phone: phone,
            email: email,
            customFields: parsedFields,
            source: 'facebook_lead_ad',
            campaignName: change.value.ad_id || undefined,
            // VERIFIED tenant: resolved from the facebook_pages row for the
            // page id on the webhook, not from anything the sender controls.
          }, pageData.tenant_id);

          // Save the lead - using YOUR actual column names
          const { error: insertError } = await supabase
            .from('leads')
            .upsert(
              {
                tenant_id: pageData.tenant_id,
                source: 'facebook',
                external_id: leadgenId,
                name: name,
                email: email,
                phone: phone,
                raw_form_data: parsedFields,
                facebook_page_id: pageId,
                external_form_id: change.value.form_id,
                external_ad_id: change.value.ad_id || null,
                status: 'new',
                ai_score: aiScore.score,
                ai_category: aiScore.category,
                ai_reasoning: aiScore.reasoning,
                ai_tags: aiScore.tags,
                ai_suggested_action: aiScore.suggestedAction,
                received_at: new Date(change.value.created_time * 1000).toISOString(),
              },
              {
                onConflict: 'tenant_id,source,external_id',
              }
            );

          if (insertError) {
            console.error('[fb-webhook] lead insert: FAILED', leadgenId, insertError.code || '', insertError.message);
          } else {
            console.log('[fb-webhook] lead insert: OK', leadgenId, 'tenant', pageData.tenant_id, 'score', aiScore.score);
          }

          await logEvent(supabase, {
            tenant_id: pageData.tenant_id,
            facebook_page_id: pageId,
            leadgen_id: leadgenId,
            payload: change.value,
            processed: !insertError,
            error_message: insertError
              ? `lead insert failed: ${insertError.code || ''} ${insertError.message}`.trim()
              : null,
          });
        } catch (leadError) {
          // Most commonly the Graph API fetch: expired/insufficient token, or
          // missing leads_retrieval permission. Without this row, that failure
          // was invisible outside the hosting logs.
          console.error('Failed to process lead:', leadgenId, leadError);
          await logEvent(supabase, {
            tenant_id: pageData.tenant_id,
            facebook_page_id: pageId,
            leadgen_id: leadgenId,
            payload: change.value,
            processed: false,
            error_message: `failed to fetch/process lead: ${leadError instanceof Error ? leadError.message : String(leadError)}`.slice(0, 1000),
          });
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
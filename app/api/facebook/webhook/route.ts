// app/api/facebook/webhook/route.ts
// Receives real-time lead notifications from Facebook
// GET handler verifies the webhook subscription
// POST handler processes incoming leads

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { FacebookClient, parseLeadFields, extractStandardFields } from '../../../../lib/facebook/client';
import { decryptToken } from '../../../../lib/facebook/encryption';
import crypto from 'crypto';
import { scoreLead } from '../../../../lib/ai/scoreLeads';

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
      console.warn('Facebook webhook signature verification failed');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const payload = JSON.parse(rawBody) as WebhookPayload;

    if (payload.object !== 'page') {
      return new NextResponse('OK', { status: 200 });
    }

    const supabase = await createClient();

    for (const entry of payload.entry) {
      const pageId = entry.id;

      const { data: pageData, error: pageError } = await supabase
        .from('facebook_pages')
        .select('tenant_id, access_token_encrypted, is_active')
        .eq('facebook_page_id', pageId)
        .single();

      if (pageError || !pageData) {
        console.error('Page not found in database:', pageId);
        continue;
      }

      if (!pageData.is_active) {
        console.log('Page is not active, skipping:', pageId);
        continue;
      }

      let pageAccessToken: string;
      try {
        pageAccessToken = decryptToken(pageData.access_token_encrypted);
      } catch (decryptError) {
        console.error('Failed to decrypt token for page:', pageId, decryptError);
        continue;
      }

      const fbClient = new FacebookClient(pageAccessToken);

      for (const change of entry.changes) {
        if (change.field !== 'leadgen') continue;

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
          });

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
            console.error('Failed to save lead:', leadgenId, insertError);
          } else {
            console.log('Lead saved successfully:', leadgenId, 'Score:', aiScore.score);
          }

          await supabase.from('facebook_webhook_events').insert({
            tenant_id: pageData.tenant_id,
            event_type: 'leadgen',
            facebook_page_id: pageId,
            leadgen_id: leadgenId,
            payload: change.value,
            processed: !insertError,
          });
        } catch (leadError) {
          console.error('Failed to process lead:', leadgenId, leadError);
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
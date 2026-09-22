// app/api/creatives/test-image/route.ts
//
// Stage 1 of the creatives work: ONE test image per request, so quality,
// time and cost can be judged before anything is wired into the UI.
//
// Protected five ways, in this order: a session; the caller is a platform
// admin (this is a spend-money test surface, not a feature); the tenant's
// plan is active; a rate limit per IP and per tenant; the monthly cap for
// this call site. Only then does it spend.
//
// What it does: composes the prompt through lib/ai/imagePrompt (the
// Creative Director contract), generates one image server-side, uploads the
// PNG to the tenant's folder in the public bucket, meters the cost into
// ai_usage, and returns the URL with the numbers this stage is measuring.
// The key never leaves lib/ai/openaiImages.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/adminGuard';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { getCallCapStatus } from '@/lib/ai/callCaps';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
import { composeImagePrompt, FORMAT_SIZES, type ImageFormat, type NegativeSpace } from '@/lib/ai/imagePrompt';
import { generateImage, IMAGE_QUALITIES, OpenAIImageError, type ImageQuality } from '@/lib/ai/openaiImages';

export const runtime = 'nodejs';
// A high-quality image can take up to two minutes at the model's own admission.
export const maxDuration = 120;

const CALL_SITE = 'creatives/test-image';

const admin = () =>
  createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function POST(request: NextRequest) {
  const ipLimited = checkIpLimit(request, 'creatives');
  if (ipLimited) return ipLimited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });

  const adminCheck = await requirePlatformAdmin();
  if (!adminCheck.ok) return NextResponse.json({ success: false, error: 'לא מורשית' }, { status: 403 });

  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;

  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });

  const tenantLimited = checkTenantLimit(tenantId, 'creatives');
  if (tenantLimited) return tenantLimited;

  const cap = await getCallCapStatus(tenantId, CALL_SITE);
  if (cap.exceeded) {
    return NextResponse.json(
      { success: false, error: `הגעת לתקרת תמונות הבדיקה החודשית (${cap.used}/${cap.cap}).`, cap },
      { status: 429 }
    );
  }

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty body is fine */ }

  const subject = String(body.subject || '').trim();
  if (!subject) return NextResponse.json({ success: false, error: 'חסר subject' }, { status: 400 });

  const format = (Object.keys(FORMAT_SIZES) as ImageFormat[]).includes(body.format as ImageFormat) ? (body.format as ImageFormat) : 'feed45';
  const quality = (IMAGE_QUALITIES as readonly string[]).includes(String(body.quality)) ? (body.quality as ImageQuality) : undefined;
  const negativeSpace = (['top', 'bottom', 'none'] as NegativeSpace[]).includes(body.negativeSpace as NegativeSpace) ? (body.negativeSpace as NegativeSpace) : 'bottom';

  // A first taste of the brand kit: her accent colour, from her own settings.
  const { data: st } = await supabase
    .from('settings')
    .select('business_name, primary_color, branding')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const branding = (st?.branding && typeof st.branding === 'object' ? st.branding : {}) as Record<string, unknown>;

  const prompt = composeImagePrompt({
    request: subject,
    service: typeof body.service === 'string' ? body.service : null,
    offer: typeof body.offer === 'string' ? body.offer : null,
    brandKit: {
      businessName: st?.business_name || null,
      primaryColor: st?.primary_color || null,
      secondaryColor: typeof branding.secondary_color === 'string' ? branding.secondary_color : null,
      visualStyle: typeof body.style === 'string' ? body.style : null,
      avoid: typeof body.avoid === 'string' ? body.avoid : null,
    },
    direction: {
      concept: typeof body.concept === 'string' ? body.concept : null,
      composition: typeof body.composition === 'string' ? body.composition : null,
      negativeSpace,
    },
    format,
    variation: typeof body.variation === 'number' && body.variation > 0 ? { index: body.variation } : null,
  });

  let image;
  try {
    image = await generateImage({ prompt, format, quality, tenantId, callSite: CALL_SITE });
  } catch (e) {
    const status = e instanceof OpenAIImageError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `יצירת התמונה נכשלה: ${message}` }, { status: status >= 400 && status < 600 ? status : 500 });
  }

  // Stored in her folder of the public bucket, next to her branding assets.
  const path = `${tenantId}/creatives/test_${Date.now()}.png`;
  const storage = admin().storage.from(PUBLIC_BUCKET);
  const { error: upErr } = await storage.upload(path, image.png, { contentType: 'image/png' });
  if (upErr) {
    return NextResponse.json(
      { success: false, error: `התמונה נוצרה אבל השמירה נכשלה: ${upErr.message}`, model: image.model, size: image.size, quality: image.quality, ms: image.ms, costUsd: image.costUsd },
      { status: 500 }
    );
  }
  const url = storage.getPublicUrl(path).data?.publicUrl || '';

  console.log(`[creatives/test-image] TENANT FILTER: tenant_id = ${tenantId} | ${image.model} ${image.size} ${image.quality} | ${image.ms}ms | usd=${image.costUsd ?? 'unknown'}`);

  return NextResponse.json({
    success: true,
    url,
    path,
    model: image.model,
    size: image.size,
    quality: image.quality,
    format,
    ms: image.ms,
    usage: image.usage,
    costUsd: image.costUsd,
    capUsed: cap.used + 1,
    capLimit: cap.cap,
    prompt,
  });
}

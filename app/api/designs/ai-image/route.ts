// app/api/designs/ai-image/route.ts
//
// One AI picture for one of her designs, from a Creative Direction. POST
// { designId, direction, variation? } -> the picture is generated server-side
// (lib/ai/openaiImages, the only OpenAI caller), stored in her folder of the
// public bucket, metered into ai_usage, and its URL returned. The route does
// not touch the design row: the fill form puts the URL into the slot and
// saves through /api/designs like any other picture she picked.
//
// "Another variation" = same direction, same brand, same offer, same
// composition strategy, a different picture: the variation index changes
// the prompt's last instruction, nothing else.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { getCallCapStatus } from '@/lib/ai/callCaps';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
import { generateImage, OpenAIImageError } from '@/lib/ai/openaiImages';
import { imagePromptForDirection, type Direction } from '@/lib/ai/creativeDirector';
import type { ImageFormat } from '@/lib/ai/imagePrompt';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CALL_SITE = 'creatives/image';
const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const admin = () =>
  createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export async function POST(request: NextRequest) {
  const ipLimited = checkIpLimit(request, 'creatives');
  if (ipLimited) return ipLimited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
  const tenantLimited = checkTenantLimit(tenantId, 'creatives');
  if (tenantLimited) return tenantLimited;

  const cap = await getCallCapStatus(tenantId, CALL_SITE);
  if (cap.exceeded) return NextResponse.json({ success: false, error: `הגעת לתקרת תמונות ה-AI החודשית (${cap.used}/${cap.cap}).` }, { status: 429 });

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  if (!isUuid(body.designId)) return NextResponse.json({ success: false, error: 'מזהה עיצוב לא תקין' }, { status: 400 });
  const d = body.direction && typeof body.direction === 'object' ? (body.direction as Record<string, unknown>) : null;
  const direction: Direction | null = d && clean(d.imageSubject, 800) ? {
    name: clean(d.name, 40), concept: clean(d.concept, 240), composition: clean(d.composition, 400),
    negativeSpace: d.negativeSpace === 'top' ? 'top' : 'bottom',
    palette: (Array.isArray(d.palette) ? d.palette : []).filter((h): h is string => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h)).slice(0, 3),
    imageSubject: clean(d.imageSubject, 800),
  } : null;
  if (!direction) return NextResponse.json({ success: false, error: 'חסר כיוון קריאייטיבי' }, { status: 400 });
  const variation = Number.isInteger(body.variation) && (body.variation as number) > 0 ? Math.min(20, body.variation as number) : 0;

  // The design is hers (RLS) and says which format the picture must be.
  const { data: design } = await supabase.from('designs').select('id, format, values').eq('id', body.designId as string).maybeSingle();
  if (!design) return NextResponse.json({ success: false, error: 'העיצוב לא נמצא' }, { status: 404 });
  const format: ImageFormat = design.format === 'story' ? 'story' : design.format === 'square' ? 'square' : 'feed45';

  const { data: st } = await supabase.from('settings').select('business_name, primary_color, branding').eq('tenant_id', tenantId).maybeSingle();
  const branding = (st?.branding && typeof st.branding === 'object' ? st.branding : {}) as Record<string, unknown>;
  const values = (design.values && typeof design.values === 'object' ? design.values : {}) as Record<string, unknown>;

  const prompt = imagePromptForDirection(direction, {
    request: direction.imageSubject,
    service: clean(values.headline, 60) || null,
    offer: clean(values.price, 20) || null,
    businessName: st?.business_name || null,
    primaryColor: st?.primary_color || null,
    secondaryColor: typeof branding.secondary_color === 'string' ? branding.secondary_color : null,
    visualStyle: typeof branding.brand_tone === 'string' ? branding.brand_tone : null,
    format,
    variation,
  });

  let image;
  try {
    image = await generateImage({ prompt, format, tenantId, callSite: CALL_SITE });
  } catch (e) {
    const status = e instanceof OpenAIImageError ? e.status : 500;
    console.error('[designs/ai-image] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: 'יצירת התמונה נכשלה הפעם. אפשר לנסות שוב או לבחור תמונה מהגלריה.' }, { status: status >= 400 && status < 600 ? status : 500 });
  }

  const path = `${tenantId}/designs/ai_${design.id}_${Date.now()}.png`;
  const storage = admin().storage.from(PUBLIC_BUCKET);
  const { error: upErr } = await storage.upload(path, image.png, { contentType: 'image/png' });
  if (upErr) return NextResponse.json({ success: false, error: `התמונה נוצרה אבל השמירה נכשלה: ${upErr.message}` }, { status: 500 });
  const url = storage.getPublicUrl(path).data?.publicUrl || '';

  console.log(`[designs/ai-image] TENANT FILTER: tenant_id = ${tenantId} | ${image.model} ${image.size} ${image.quality} | ${image.ms}ms | usd=${image.costUsd ?? 'unknown'}`);
  return NextResponse.json({ success: true, url, path, model: image.model, size: image.size, quality: image.quality, ms: image.ms, costUsd: image.costUsd, variation, capUsed: cap.used + 1, capLimit: cap.cap });
}

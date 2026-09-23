// app/api/designs/generate/route.ts
//
// Free-form generation, capped. She types what she wants; she gets two or
// three finished posts, each already a design row she can open and edit.
//
//   GET  -> { success, used, cap, remaining }      "3 מתוך 9 החודש", shown before she generates
//   POST { brief, format? } -> { success, options: [design...], copy, used, cap }
//
// One generation = one Claude call (lib/ai/postGenerator: which templates,
// which words, which picture) + one OpenAI picture per option, in parallel.
// The Claude call is what the cap counts; the pictures are metered under
// their own call site and cost. A picture that fails leaves its slot empty -
// the option still comes back, she picks a photo from her gallery. Nothing
// counts when Claude fails.
//
// Templates are never gated by this route: at the cap, POST refuses and the
// gallery is untouched.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile';
import { AiCapExceededError } from '@/lib/ai/callCaps';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
import { generateImage } from '@/lib/ai/openaiImages';
import { composeImagePrompt, type ImageFormat } from '@/lib/ai/imagePrompt';
import { DIRECTOR_AVOID } from '@/lib/ai/creativeDirector';
import { latestTemplates, getTemplate } from '@/lib/design/templates';
import { sanitizeImages } from '@/lib/design/design';
import { candidateTemplates, aiSlotOf, planPost, generationAllowance, GENERATE_IMAGE_CALL_SITE } from '@/lib/ai/postGenerator';

export const runtime = 'nodejs';
export const maxDuration = 120;

const admin = () =>
  createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Ctx = { tenantId: string; settings: Record<string, unknown> | null };
const isResponse = (v: unknown): v is Response => v instanceof Response;

/** Session, plan, tenant, and the settings row (with the per-tenant cap when the column exists). */
async function context(request: NextRequest): Promise<Ctx | Response> {
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
  // The cap column arrives with add_ai_generation_cap.sql; before it is applied, the select falls back.
  let settings: Record<string, unknown> | null = null;
  const withCap = await supabase.from('settings').select('business_name, business_phone, primary_color, branding, ai_generation_cap').eq('tenant_id', tenantId).maybeSingle();
  if (withCap.error) {
    const { data } = await supabase.from('settings').select('business_name, business_phone, primary_color, branding').eq('tenant_id', tenantId).maybeSingle();
    settings = data as Record<string, unknown> | null;
  } else settings = withCap.data as Record<string, unknown> | null;
  return { tenantId, settings };
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if (isResponse(ctx)) return ctx;
  const a = await generationAllowance(ctx.tenantId, ctx.settings?.ai_generation_cap);
  return NextResponse.json({ success: true, used: a.used, cap: a.cap, remaining: a.remaining });
}

export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if (isResponse(ctx)) return ctx;
  const { tenantId, settings } = ctx;

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  const brief = String(body.brief || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (brief.length < 3) return NextResponse.json({ success: false, error: 'כתבי מה תרצי לפרסם, למשל: מבצע לטיפול פנים לפני החג' }, { status: 400 });
  const format: 'feed45' | 'story' = body.format === 'story' ? 'story' : 'feed45';

  const allowance = await generationAllowance(tenantId, settings?.ai_generation_cap);
  if (allowance.exceeded) {
    return NextResponse.json({ success: false, error: `ניצלת את ${allowance.cap} היצירות של החודש. התבניות פתוחות תמיד, בלי הגבלה.`, used: allowance.used, cap: allowance.cap }, { status: 429 });
  }

  const branding = (settings?.branding && typeof settings.branding === 'object' ? settings.branding : {}) as Record<string, unknown>;
  const hasReviews = Array.isArray(branding.reviews) && branding.reviews.length > 0;
  const candidates = candidateTemplates(latestTemplates(), format, hasReviews);
  if (!candidates.length) return NextResponse.json({ success: false, error: 'אין תבניות מתאימות לפורמט הזה עדיין' }, { status: 400 });

  const supabase = await createClient();
  let plan;
  try {
    const profile = await loadBusinessProfile(supabase, tenantId);
    plan = await planPost(profile, brief, candidates, tenantId);
  } catch (e) {
    if (e instanceof AiCapExceededError) return NextResponse.json({ success: false, error: `ניצלת את ${e.cap} היצירות של החודש. התבניות פתוחות תמיד.`, used: e.used, cap: e.cap }, { status: 429 });
    console.error('[designs/generate] plan failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: 'ה-AI לא הצליח לבנות את הפוסט הפעם. נסי לנסח אחרת, או בחרי תבנית מהגלריה.' }, { status: 502 });
  }

  // One picture per option, all at once; a failure leaves the slot empty.
  const storage = admin().storage.from(PUBLIC_BUCKET);
  const stamp = Date.now();
  const pictures = await Promise.all(plan.options.map(async (o, i) => {
    const template = getTemplate(o.templateKey, o.templateVersion);
    const slot = template ? aiSlotOf(template) : null;
    if (!template || !slot || !o.imageSubject) return null;
    try {
      const prompt = composeImagePrompt({
        request: o.imageSubject,
        service: o.values.headline || null,
        offer: o.values.price || null,
        brandKit: { businessName: (settings?.business_name as string) || null, primaryColor: (settings?.primary_color as string) || null, secondaryColor: typeof branding.secondary_color === 'string' ? branding.secondary_color : null, visualStyle: typeof branding.brand_tone === 'string' ? branding.brand_tone : null, avoid: DIRECTOR_AVOID },
        direction: { concept: slot.aiHint || null, negativeSpace: 'bottom', palette: null },
        format: format as ImageFormat,
      });
      const image = await generateImage({ prompt, format: format as ImageFormat, tenantId, callSite: GENERATE_IMAGE_CALL_SITE });
      const path = `${tenantId}/designs/gen_${stamp}_${i}.png`;
      const { error } = await storage.upload(path, image.png, { contentType: 'image/png' });
      if (error) throw new Error(error.message);
      console.log(`[designs/generate] TENANT FILTER: tenant_id = ${tenantId} | option ${i} | ${image.model} ${image.size} | ${image.ms}ms | usd=${image.costUsd ?? 'unknown'}`);
      return { slot: slot.key, url: storage.getPublicUrl(path).data?.publicUrl || '' };
    } catch (e) {
      console.error(`[designs/generate] picture ${i} failed:`, e instanceof Error ? e.message : e);
      return null;
    }
  }));

  // Each option becomes her design, exactly as if she had filled the template herself.
  const designs = [];
  for (let i = 0; i < plan.options.length; i++) {
    const o = plan.options[i];
    const template = getTemplate(o.templateKey, o.templateVersion);
    if (!template) continue;
    const pic = pictures[i];
    const { data, error } = await supabase
      .from('designs')
      .insert({
        tenant_id: tenantId,
        template_key: template.key,
        template_version: template.version,
        category: template.category,
        format: template.format,
        name: `${brief.slice(0, 32)}${brief.length > 32 ? '…' : ''} · ${i + 1}`,
        values: o.values,
        images: pic ? sanitizeImages(template, { [pic.slot]: pic.url }) : {},
        overrides: {},
        status: 'draft',
      })
      .select('id, template_key, template_version, category, format, name, values, images, overrides, preview_path, export_path, is_default, parent_id, status, created_at, updated_at')
      .single();
    if (error) { console.error('[designs/generate] insert failed:', error.message); continue; }
    designs.push({ ...data, angle: o.angle, pictureFailed: !!o.imageSubject && !pic });
  }
  if (!designs.length) return NextResponse.json({ success: false, error: 'הפוסטים נבנו אבל השמירה נכשלה. נסי שוב.' }, { status: 500 });

  return NextResponse.json({ success: true, options: designs, copy: plan.copy, used: allowance.used + 1, cap: allowance.cap });
}

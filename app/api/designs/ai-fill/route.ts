// app/api/designs/ai-fill/route.ts
//
// AI as one way to fill a template. POST { templateKey, templateVersion?,
// brief } -> the Creative Director's values for that template, the post
// copy, and three creative directions. Nothing is written: the fill form
// applies the values like typed text and saves them through /api/designs.
//
// Guards, in order: session, active plan, tenant, rate limit, monthly cap
// (inside trackedCreate). The Anthropic key never leaves lib/ai.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile';
import { AiCapExceededError } from '@/lib/ai/callCaps';
import { getTemplate } from '@/lib/design/templates';
import { directFill } from '@/lib/ai/creativeDirector';

export const maxDuration = 60;

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

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }
  const brief = String(body.brief || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (brief.length < 3) return NextResponse.json({ success: false, error: 'כתבי מה הפוסט צריך להגיד, למשל: טיפול פנים קלאסי במבצע 249 ₪' }, { status: 400 });
  const template = getTemplate(String(body.templateKey || ''), typeof body.templateVersion === 'number' ? body.templateVersion : null);
  if (!template) return NextResponse.json({ success: false, error: 'תבנית לא מוכרת' }, { status: 400 });

  try {
    const profile = await loadBusinessProfile(supabase, tenantId);
    const out = await directFill(profile, template, brief, tenantId);
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    if (e instanceof AiCapExceededError) {
      return NextResponse.json({ success: false, error: `סיימת את מילויי ה-AI של החודש (${e.used} מתוך ${e.cap}). הם מתחדשים בתחילת החודש הבא, ובינתיים אפשר למלא את הטקסטים ידנית.` }, { status: 429 });
    }
    console.error('[designs/ai-fill] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: 'ה-AI לא הצליח למלא את התבנית הפעם. נסי שוב, או מלאי ידנית.' }, { status: 502 });
  }
}

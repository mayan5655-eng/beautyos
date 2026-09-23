// app/api/designs/route.ts
//
// Her designs: list them, create one from a template, duplicate one.
// Session client throughout, so RLS on public.designs does the isolation and
// the trial gate blocks writes for an expired plan. No renderer here: a
// design is data (template key + version, values, images, overrides).
//
//   GET  /api/designs?category=offer&status=draft   -> { success, designs }
//   POST /api/designs { templateKey, templateVersion?, name?, values?, images? }
//   POST /api/designs { duplicateOf: '<id>', name? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { getTemplate } from '@/lib/design/templates';
import { getReel } from '@/lib/design/reels';
import { sanitizeImages, sanitizeValues, sanitizeOverrides } from '@/lib/design/design';
import { CATEGORY_LABELS } from '@/lib/design/contract';

const NAME_MAX = 60;
const cleanName = (v: unknown, fallback: string) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || fallback;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  let q = supabase
    .from('designs')
    .select('id, template_key, template_version, category, format, name, values, images, overrides, copy, preview_path, export_path, is_default, parent_id, status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (category && category in CATEGORY_LABELS) q = q.eq('category', category);
  if (status === 'draft' || status === 'final' || status === 'archived') q = q.eq('status', status);
  else q = q.neq('status', 'archived');

  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, designs: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });

  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;

  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }

  // Duplicate: a copy of one of hers, pointing at the same template version.
  if (typeof body.duplicateOf === 'string') {
    const { data: src, error: srcErr } = await supabase.from('designs').select('*').eq('id', body.duplicateOf).maybeSingle();
    if (srcErr) return NextResponse.json({ success: false, error: srcErr.message }, { status: 500 });
    if (!src) return NextResponse.json({ success: false, error: 'העיצוב לא נמצא' }, { status: 404 });
    const { data, error } = await supabase
      .from('designs')
      .insert({
        tenant_id: tenantId,
        template_key: src.template_key,
        template_version: src.template_version,
        category: src.category,
        format: src.format,
        name: cleanName(body.name, `${src.name || 'עיצוב'} (עותק)`),
        values: src.values,
        images: src.images,
        overrides: src.overrides,
        parent_id: src.id,
        status: 'draft',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, design: data });
  }

  const key = String(body.templateKey || ''), version = typeof body.templateVersion === 'number' ? body.templateVersion : null;
  const template = getTemplate(key, version) || getReel(key, version);
  if (!template) return NextResponse.json({ success: false, error: 'תבנית לא מוכרת' }, { status: 400 });

  const { data, error } = await supabase
    .from('designs')
    .insert({
      tenant_id: tenantId,
      template_key: template.key,
      template_version: template.version,
      category: template.category,
      format: template.format,
      name: cleanName(body.name, template.name),
      values: sanitizeValues(template, body.values),
      images: sanitizeImages(template, body.images),
      overrides: sanitizeOverrides(body.overrides),
      status: 'draft',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, design: data });
}

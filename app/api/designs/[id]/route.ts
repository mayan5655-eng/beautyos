// app/api/designs/[id]/route.ts
//
// One design: read it, save her edits, make it her default for the
// category, archive or delete it. The template it points at is resolved
// from the library at the stored version, never re-pointed at a newer one.
//
//   GET    /api/designs/:id
//   PATCH  /api/designs/:id { name?, values?, images?, overrides?, status?, is_default?, preview_path?, export_path? }
//   DELETE /api/designs/:id

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { getTemplate } from '@/lib/design/templates';
import { sanitizeImages, sanitizeValues, sanitizeOverrides } from '@/lib/design/design';

type Ctx = { params: Promise<{ id: string }> };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const isPath = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}\/(designs|creatives)\/[A-Za-z0-9._-]{1,120}$/i.test(s);

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ success: false, error: 'מזהה לא תקין' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });

  const { data, error } = await supabase.from('designs').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, error: 'העיצוב לא נמצא' }, { status: 404 });
  const template = getTemplate(data.template_key, data.template_version);
  return NextResponse.json({ success: true, design: data, template });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ success: false, error: 'מזהה לא תקין' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;

  const { data: current, error: curErr } = await supabase.from('designs').select('id, tenant_id, template_key, template_version, category').eq('id', id).maybeSingle();
  if (curErr) return NextResponse.json({ success: false, error: curErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ success: false, error: 'העיצוב לא נמצא' }, { status: 404 });
  const template = getTemplate(current.template_key, current.template_version);
  if (!template) return NextResponse.json({ success: false, error: 'התבנית של העיצוב הזה כבר לא קיימת' }, { status: 409 });

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) || {}; } catch { /* empty */ }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') patch.name = body.name.replace(/\s+/g, ' ').trim().slice(0, 60) || template.name;
  if (body.values !== undefined) patch.values = sanitizeValues(template, body.values);
  if (body.images !== undefined) patch.images = sanitizeImages(template, body.images);
  if (body.overrides !== undefined) patch.overrides = sanitizeOverrides(body.overrides);
  if (body.status === 'draft' || body.status === 'final' || body.status === 'archived') patch.status = body.status;
  if (isPath(body.preview_path)) patch.preview_path = body.preview_path;
  if (isPath(body.export_path)) patch.export_path = body.export_path;

  if (body.is_default === true) {
    // One default per category: clear the others first (the unique index
    // would refuse the second otherwise).
    const { error: clearErr } = await supabase.from('designs').update({ is_default: false }).eq('tenant_id', current.tenant_id).eq('category', current.category).eq('is_default', true);
    if (clearErr) return NextResponse.json({ success: false, error: clearErr.message }, { status: 500 });
    patch.is_default = true;
  } else if (body.is_default === false) {
    patch.is_default = false;
  }

  const { data, error } = await supabase.from('designs').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, design: data });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ success: false, error: 'מזהה לא תקין' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;

  const { error } = await supabase.from('designs').delete().eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

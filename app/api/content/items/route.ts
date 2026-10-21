// app/api/content/items/route.ts
//
// One post in her content plan (lib/content/pack.ts), on HER session (RLS: her rows only):
//
//   POST  { planned_for, texts: { instagram?: { caption, hashtags? }, facebook?: { caption } } }
//                                                                     her OWN post (calendar "+"): no template; the plan of
//                                                                     that week is created if there is none (manual). She
//                                                                     uploads its picture next and sends it as media_path.
//   PATCH { id, media_path }                                          the picture of the post (her private folder only)
//   { id, status: 'approved' | 'planned' | 'posted' | 'skipped' }      approve ("מאשרת"), undo, mark posted, skip
//   { id, planned_for: ISO }                                          move it to another day or time (future only)
//   { id, platform, caption, hashtags? }                              edit one platform's text (kept: edited = true)
//   { id, platform, copied: true }                                    she copied that text (shown as "הועתק")
//
// Approving, with automatic publishing switched on for her (content_publish_meta flag, a Page with publishing permission
// and publishing turned on, and the picture rendered from her card as media_path), queues one publish job per platform
// for the post's time (lib/content/publisher.ts). Undo / skip cancels the queued jobs; moving the time moves them.
// Without that, approving keeps the stage-1 behaviour: the morning reminder, and she posts from the copy buttons.
// The queue table is server-only, so those three steps use the service role, AFTER her own session proved (RLS) that
// the post is hers.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit } from '@/lib/rateLimit';
import { CAPTION_LIMITS, PLATFORMS, slotLabelHe, weekStartOf, type Platform } from '@/lib/content/pack';
import { isMissingContentTable, CONTENT_NOT_AVAILABLE_HE } from '@/lib/content/db';
import { contentPublishVisible } from '@/lib/featureFlags';
import { isMissingColumnError } from '@/lib/pgError';
import { enqueueApproved, cancelJobs, rescheduleJobs } from '@/lib/content/publisher';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';

const admin = () =>
  createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
// The picture of a post, in her private folder: drawn from the card (JPEG for Instagram) or her own upload.
const MEDIA_PATH = /^[0-9a-f-]{36}\/content\/[0-9a-f-]{36}_\d+\.(png|jpe?g)$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['planned', 'approved', 'posted', 'skipped'] as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function PATCH(request: NextRequest) {
  const limited = checkIpLimit(request, 'creatives');
  if (limited) return limited;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ success: false, error: 'לא מחוברת' }, 401);
  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  if (!UUID.test(id)) return json({ success: false, error: 'פוסט לא מזוהה' }, 400);

  // RLS returns nothing for another business's row, so "not found" covers both.
  let cur = await supabase.from('content_items').select('id, tenant_id, status, planned_for, media_path').eq('id', id).maybeSingle();
  if (cur.error && isMissingColumnError(cur.error)) cur = await supabase.from('content_items').select('id, tenant_id, status, planned_for').eq('id', id).maybeSingle() as typeof cur;
  if (cur.error) {
    if (isMissingContentTable(cur.error)) return json({ success: false, error: CONTENT_NOT_AVAILABLE_HE }, 409);
    return json({ success: false, error: 'לא הצלחנו לקרוא את הפוסט' }, 500);
  }
  if (!cur.data) return json({ success: false, error: 'הפוסט לא נמצא' }, 404);
  const now = new Date().toISOString();

  // ── one platform's text ──────────────────────────────────────────────────
  if (typeof b.platform === 'string') {
    const platform = b.platform as Platform;
    if (!(PLATFORMS as readonly string[]).includes(platform)) return json({ success: false, error: 'רשת לא מוכרת' }, 400);
    if (b.copied === true) {
      const { error } = await supabase.from('content_item_platforms').update({ copied_at: now, updated_at: now }).eq('item_id', id).eq('platform', platform);
      if (error) return json({ success: false, error: 'השמירה נכשלה' }, 500);
      return json({ success: true });
    }
    const caption = typeof b.caption === 'string' ? b.caption.replace(/\r\n/g, '\n').trim() : '';
    if (!caption) return json({ success: false, error: 'הטקסט ריק' }, 400);
    if (caption.length > CAPTION_LIMITS[platform].chars) return json({ success: false, error: `הטקסט ארוך מדי ל${platform === 'instagram' ? 'אינסטגרם' : 'פייסבוק'} (עד ${CAPTION_LIMITS[platform].chars} תווים)` }, 400);
    const hashtags = (Array.isArray(b.hashtags) ? b.hashtags : [])
      .map((h) => String(h || '').replace(/\s+/g, ''))
      .filter(Boolean)
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .filter((h) => /^#[^\s#]{1,50}$/.test(h))
      .slice(0, CAPTION_LIMITS[platform].hashtags);
    const { data, error } = await supabase.from('content_item_platforms')
      .update({ caption, hashtags, edited: true, updated_at: now })
      .eq('item_id', id).eq('platform', platform)
      .select('caption, hashtags, edited').maybeSingle();
    if (error || !data) return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
    return json({ success: true, platform, text: data });
  }

  // ── time ─────────────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = { updated_at: now };
  if (typeof b.planned_for === 'string') {
    const t = Date.parse(b.planned_for);
    if (!Number.isFinite(t)) return json({ success: false, error: 'תאריך לא תקין' }, 400);
    if (t < Date.now() - 60_000) return json({ success: false, error: 'אי אפשר לתזמן לזמן שכבר עבר' }, 400);
    if (t > Date.now() + 60 * 86_400_000) return json({ success: false, error: 'אפשר לתזמן עד חודשיים קדימה' }, 400);
    patch.planned_for = new Date(t).toISOString();
    patch.reminder_sent_at = null;
  }

  // ── state ────────────────────────────────────────────────────────────────
  if (b.status !== undefined) {
    const status = b.status as (typeof STATUSES)[number];
    if (!STATUSES.includes(status)) return json({ success: false, error: 'מצב לא מוכר' }, 400);
    patch.status = status;
    patch.approved_at = status === 'approved' ? now : status === 'planned' ? null : undefined;
    patch.posted_at = status === 'posted' ? now : status === 'planned' || status === 'approved' ? null : undefined;
    for (const k of ['approved_at', 'posted_at']) if (patch[k] === undefined) delete patch[k];
    if (status === 'posted') {
      await supabase.from('content_item_platforms').update({ posted_marked_at: now, updated_at: now }).eq('item_id', id);
    }
  }
  // The picture to publish: drawn from the card or uploaded by her, stored in HER folder (never another tenant's).
  // Sent with the approval, or on its own; an approval without one keeps the picture the post already has.
  let mediaPath: string | null = ((cur.data as { media_path?: string | null }).media_path) || null;
  if (typeof b.media_path === 'string' && b.media_path) {
    if (!MEDIA_PATH.test(b.media_path) || !b.media_path.startsWith(`${cur.data.tenant_id}/content/${id}_`)) return json({ success: false, error: 'תמונה לא תקינה' }, 400);
    mediaPath = b.media_path;
    patch.media_path = mediaPath;
  }
  if (Object.keys(patch).length === 1) return json({ success: false, error: 'אין מה לעדכן' }, 400);

  let { data, error } = await supabase.from('content_items').update(patch).eq('id', id)
    .select('id, status, planned_for, approved_at, posted_at').maybeSingle();
  if (error && 'media_path' in patch && isMissingColumnError(error)) {
    // add_publish_jobs.sql not run yet: approve without the picture column (publishing is not available anyway).
    delete patch.media_path;
    mediaPath = null;
    ({ data, error } = await supabase.from('content_items').update(patch).eq('id', id).select('id, status, planned_for, approved_at, posted_at').maybeSingle());
  }
  if (error || !data) {
    console.error('[content/items] update failed:', error?.message);
    return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
  }
  // ── the publishing queue (stage 2): only behind her flag; any failure here leaves the approval itself intact ──
  let publish: { queued: string[]; reason: string | null } | null = null;
  try {
    const flags = (await supabase.from('settings').select('automations').eq('tenant_id', cur.data.tenant_id).maybeSingle()).data;
    if (contentPublishVisible(flags as never)) {
      const db = admin();
      if (patch.status === 'approved') {
        publish = await enqueueApproved(db, { tenantId: cur.data.tenant_id, itemId: id, plannedFor: data.planned_for, approvedAt: String(data.approved_at), mediaPath });
      } else if (patch.status === 'planned' || patch.status === 'skipped' || patch.status === 'posted') {
        await cancelJobs(db, id, patch.status === 'posted' ? 'marked posted by hand' : `status ${patch.status}`);
      } else if (patch.planned_for) {
        await rescheduleJobs(db, id, String(patch.planned_for));
      }
    }
  } catch (e) {
    console.error('[content/items] publish queue step failed:', e instanceof Error ? e.message : 'unknown');
  }
  return json({ success: true, item: { ...data, label: slotLabelHe(new Date(data.planned_for)) }, publish });
}

const PLATFORM_KEYS = ['instagram', 'facebook'] as const;

export async function POST(request: NextRequest) {
  const limited = checkIpLimit(request, 'creatives');
  if (limited) return limited;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ success: false, error: 'לא מחוברת' }, 401);
  const guard = await requireActiveTenant(supabase);
  if (!guard.ok) return guard.response;
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
  if (!tenantId) return json({ success: false, error: 'לא זוהה עסק' }, 400);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const t = Date.parse(String(b.planned_for || ''));
  if (!Number.isFinite(t)) return json({ success: false, error: 'צריך לבחור יום ושעה' }, 400);
  if (t < Date.now() - 60_000) return json({ success: false, error: 'אי אפשר לתזמן לזמן שכבר עבר' }, 400);
  if (t > Date.now() + 60 * 86_400_000) return json({ success: false, error: 'אפשר לתזמן עד חודשיים קדימה' }, 400);
  const texts = (b.texts && typeof b.texts === 'object' ? b.texts : {}) as Record<string, { caption?: unknown; hashtags?: unknown }>;
  const rows: Array<{ platform: Platform; caption: string; hashtags: string[] }> = [];
  for (const platform of PLATFORM_KEYS) {
    const tx = texts[platform];
    const caption = typeof tx?.caption === 'string' ? tx.caption.replace(/\r\n/g, '\n').trim() : '';
    if (!caption) continue;
    if (caption.length > CAPTION_LIMITS[platform].chars) return json({ success: false, error: `הטקסט ארוך מדי ל${platform === 'instagram' ? 'אינסטגרם' : 'פייסבוק'}` }, 400);
    const hashtags = (Array.isArray(tx?.hashtags) ? tx!.hashtags as unknown[] : [])
      .map((h) => String(h || '').replace(/\s+/g, '')).filter(Boolean)
      .map((h) => (h.startsWith('#') ? h : `#${h}`)).filter((h) => /^#[^\s#]{1,50}$/.test(h))
      .slice(0, CAPTION_LIMITS[platform].hashtags);
    rows.push({ platform, caption, hashtags });
  }
  if (!rows.length) return json({ success: false, error: 'צריך לכתוב טקסט לפחות לרשת אחת' }, 400);

  // The week's plan (week_start = its Sunday, Israel): reused when it exists, created as a manual one otherwise.
  const when = new Date(t);
  const weekStart = weekStartOf(when);
  let planId: string | null = null;
  const existing = await supabase.from('content_plans').select('id').eq('tenant_id', tenantId).eq('week_start', weekStart).maybeSingle();
  if (existing.error) {
    if (isMissingContentTable(existing.error)) return json({ success: false, error: CONTENT_NOT_AVAILABLE_HE }, 409);
    return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
  }
  planId = (existing.data?.id as string | undefined) || null;
  if (!planId) {
    const ins = await supabase.from('content_plans').insert({ tenant_id: tenantId, week_start: weekStart, status: 'active', generated_by: 'manual', source: {} }).select('id').single();
    if (ins.error || !ins.data) {
      // Two creates in the same second: the other one made the plan.
      const again = await supabase.from('content_plans').select('id').eq('tenant_id', tenantId).eq('week_start', weekStart).maybeSingle();
      planId = (again.data?.id as string | undefined) || null;
      if (!planId) return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
    } else planId = ins.data.id as string;
  }

  const topic = rows[0].caption.split('\n')[0].slice(0, 80);
  const item = await supabase.from('content_items').insert({
    tenant_id: tenantId, plan_id: planId, kind: 'post', topic, reason: 'פוסט שלך', template_key: null, values: {},
    planned_for: when.toISOString(), status: 'planned',
  }).select('id, planned_for, status').single();
  if (item.error || !item.data) {
    console.error('[content/items] create failed:', item.error?.message);
    return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
  }
  const pl = await supabase.from('content_item_platforms').insert(rows.map((r) => ({ item_id: item.data.id, tenant_id: tenantId, platform: r.platform, caption: r.caption, hashtags: r.hashtags, edited: true })));
  if (pl.error) console.error('[content/items] create texts failed:', pl.error.message);
  return json({ success: true, item: { ...item.data, label: slotLabelHe(when) } });
}

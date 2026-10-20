// app/api/content/items/route.ts
//
// One post in her content plan (lib/content/pack.ts). PATCH only, on HER session (RLS: her rows only):
//
//   { id, status: 'approved' | 'planned' | 'posted' | 'skipped' }      approve ("מאשרת"), undo, mark posted, skip
//   { id, planned_for: ISO }                                          move it to another day or time (future only)
//   { id, platform, caption, hashtags? }                              edit one platform's text (kept: edited = true)
//   { id, platform, copied: true }                                    she copied that text (shown as "הועתק")
//
// Approving does not publish anything today. Stage 2 (Meta) will queue approved posts; until then the morning
// reminder tells her it is the day, and she posts from the copy / open buttons.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit } from '@/lib/rateLimit';
import { CAPTION_LIMITS, PLATFORMS, slotLabelHe, type Platform } from '@/lib/content/pack';
import { isMissingContentTable, CONTENT_NOT_AVAILABLE_HE } from '@/lib/content/db';

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
  const cur = await supabase.from('content_items').select('id, status, planned_for').eq('id', id).maybeSingle();
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
  if (Object.keys(patch).length === 1) return json({ success: false, error: 'אין מה לעדכן' }, 400);

  const { data, error } = await supabase.from('content_items').update(patch).eq('id', id)
    .select('id, status, planned_for, approved_at, posted_at').maybeSingle();
  if (error || !data) {
    console.error('[content/items] update failed:', error?.message);
    return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
  }
  return json({ success: true, item: { ...data, label: slotLabelHe(new Date(data.planned_for)) } });
}

// app/api/content/plan/route.ts
//
// Her weekly content plan (lib/content/pack.ts, docs/specs/content-publishing.md stage 1). Behind the content_plan flag.
//
//   GET                                   -> { success, enabled, available, preferences, plan | null, cap }
//   POST { action: 'generate' }           -> builds the plan for the next posting days: suggestPosts() picks, ONE Claude
//                                            call writes Instagram + Facebook captions; saved as content_items rows
//   POST { action: 'preferences', ... }   -> which days, what hour, how many a week, reminders
//
// Everything runs on HER session (RLS: her rows only). Writes and the AI call need an active plan (requireActiveTenant).
// Until add_content_plan.sql has run, GET says available:false and nothing else is touched.
// Nothing here publishes anywhere: stage 2 (Meta) reads approved items through its own job table.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { contentPlanVisible } from '@/lib/featureFlags';
import { businessFieldsOf } from '@/lib/businessFields';
import { holidayTemplates } from '@/lib/design/holidayTemplates';
import { suggestPosts } from '@/lib/design/suggestions';
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile';
import { getCallCapStatus, AiCapExceededError, AiCapUnavailableError, AiProviderUnavailableError, DemoBlockedError } from '@/lib/ai/callCaps';
import { UngroundedClaimsError } from '@/lib/ai/claimsGuard';
import { capRefusalHe } from '@/lib/ai/capMessages';
import { isMissingColumnError } from '@/lib/pgError';
import { isDemoTenantId } from '@/lib/demoTenants';
import { isMissingContentTable as isMissingTable, CONTENT_NOT_AVAILABLE_HE as NOT_AVAILABLE_HE } from '@/lib/content/db';
import {
  PACK_CALL_SITE, cleanPreferences, upcomingSlots, pickSuggestions, planCaptions, weekStartOf, slotLabelHe, israelDay,
  type Preferences,
} from '@/lib/content/pack';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Supa = Awaited<ReturnType<typeof createClient>>;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

async function session(request: NextRequest) {
  const limited = checkIpLimit(request, 'creatives');
  if (limited) return { error: limited } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ success: false, error: 'לא מחוברת' }, 401) } as const;
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');
  if (!tenantId) return { error: json({ success: false, error: 'לא זוהה עסק' }, 400) } as const;
  // settings.feature_flags is its own column on some databases, absent on others: degrade to automations alone.
  let settings: Record<string, unknown> | null = null;
  const withFlags = await supabase.from('settings').select('automations, branding, business_fields, feature_flags').eq('tenant_id', tenantId).maybeSingle();
  if (withFlags.error && isMissingColumnError(withFlags.error)) {
    const r = await supabase.from('settings').select('automations, branding, business_fields').eq('tenant_id', tenantId).maybeSingle();
    settings = (r.data as Record<string, unknown> | null) || null;
  } else settings = (withFlags.data as Record<string, unknown> | null) || null;
  return { supabase, tenantId: String(tenantId), settings } as const;
}

async function readPreferences(supabase: Supa, tenantId: string): Promise<{ prefs: Preferences; missing: boolean }> {
  const { data, error } = await supabase.from('content_preferences').select('posting_days, post_hour, items_per_week, platforms, reminders').eq('tenant_id', tenantId).maybeSingle();
  if (error) return { prefs: cleanPreferences(null), missing: isMissingTable(error) };
  return { prefs: cleanPreferences(data as Partial<Preferences> | null), missing: false };
}

type ItemRow = { id: string; plan_id: string; topic: string; reason: string; template_key: string | null; values: Record<string, string> | null; planned_for: string; status: string; approved_at: string | null; posted_at: string | null; design_id: string | null };
type PlatformRow = { item_id: string; platform: string; caption: string; hashtags: string[] | null; edited: boolean; copied_at: string | null; posted_marked_at: string | null };

/** The newest plan with its items (oldest slot first) and each item's captions by platform. */
async function readPlan(supabase: Supa, tenantId: string) {
  const plan = await supabase.from('content_plans').select('id, week_start, created_at').eq('tenant_id', tenantId).order('week_start', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (plan.error) return { error: plan.error } as const;
  if (!plan.data) return { plan: null } as const;
  const items = await supabase.from('content_items').select('id, plan_id, topic, reason, template_key, values, planned_for, status, approved_at, posted_at, design_id').eq('plan_id', plan.data.id).neq('status', 'skipped').order('planned_for', { ascending: true });
  if (items.error) return { error: items.error } as const;
  const ids = (items.data || []).map((i) => i.id);
  const plats = ids.length ? await supabase.from('content_item_platforms').select('item_id, platform, caption, hashtags, edited, copied_at, posted_marked_at').in('item_id', ids) : { data: [], error: null };
  if (plats.error) return { error: plats.error } as const;
  const byItem = new Map<string, Record<string, Omit<PlatformRow, 'item_id' | 'platform'>>>();
  for (const p of (plats.data || []) as PlatformRow[]) {
    const m = byItem.get(p.item_id) || {};
    m[p.platform] = { caption: p.caption, hashtags: p.hashtags || [], edited: p.edited, copied_at: p.copied_at, posted_marked_at: p.posted_marked_at };
    byItem.set(p.item_id, m);
  }
  return {
    plan: {
      id: plan.data.id, week_start: plan.data.week_start,
      items: ((items.data || []) as ItemRow[]).map((i) => ({ ...i, values: i.values || {}, label: slotLabelHe(new Date(i.planned_for)), platforms: byItem.get(i.id) || {} })),
    },
  } as const;
}

export async function GET(request: NextRequest) {
  const s = await session(request);
  if ('error' in s) return s.error;
  if (!contentPlanVisible(s.settings)) return json({ success: true, enabled: false });
  const { prefs, missing } = await readPreferences(s.supabase, s.tenantId);
  if (missing) return json({ success: true, enabled: true, available: false, error: NOT_AVAILABLE_HE });
  const r = await readPlan(s.supabase, s.tenantId);
  if ('error' in r && r.error) {
    if (isMissingTable(r.error)) return json({ success: true, enabled: true, available: false, error: NOT_AVAILABLE_HE });
    console.error('[content/plan] read failed:', r.error.message);
    return json({ success: false, error: 'לא הצלחנו לטעון את לוח התוכן' }, 500);
  }
  const cap = await getCallCapStatus(s.tenantId, PACK_CALL_SITE);
  return json({ success: true, enabled: true, available: true, preferences: prefs, plan: 'plan' in r ? r.plan : null, cap: { used: cap.used, cap: cap.cap } });
}

export async function POST(request: NextRequest) {
  const s = await session(request);
  if ('error' in s) return s.error;
  if (!contentPlanVisible(s.settings)) return json({ success: false, error: 'לוח התוכן לא פעיל בחשבון' }, 404);
  const guard = await requireActiveTenant(s.supabase);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'preferences') {
    const prefs = cleanPreferences(body as Partial<Preferences>);
    const { error } = await s.supabase.from('content_preferences').upsert({ tenant_id: s.tenantId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
    if (error) {
      if (isMissingTable(error)) return json({ success: false, error: NOT_AVAILABLE_HE }, 409);
      console.error('[content/plan] preferences save failed:', error.message);
      return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
    }
    return json({ success: true, preferences: prefs });
  }

  if (body.action !== 'generate') return json({ success: false, error: 'פעולה לא מוכרת' }, 400);
  if (isDemoTenantId(s.tenantId)) return json({ success: false, error: 'בדמו אי אפשר ליצור תוכנית חדשה. בחשבון שלך זה עובד.' }, 403);
  const tenantLimited = checkTenantLimit(s.tenantId, 'creatives');
  if (tenantLimited) return tenantLimited;

  const { prefs, missing } = await readPreferences(s.supabase, s.tenantId);
  if (missing) return json({ success: false, error: NOT_AVAILABLE_HE }, 409);

  const cap = await getCallCapStatus(s.tenantId, PACK_CALL_SITE);
  if (cap.exceeded) return json({ success: false, error: capRefusalHe(cap.unknown ? 'unreadable' : 'calls', PACK_CALL_SITE) }, cap.unknown ? 503 : 429);

  const now = new Date();
  const slots = upcomingSlots(prefs, now);
  if (!slots.length) return json({ success: false, error: 'לא נבחרו ימי פרסום בשבוע הקרוב. אפשר לבחור ימים בהגדרות הלוח.' }, 400);
  const weekStart = weekStartOf(slots[0]);

  // A plan for this week that already has an approved or published post is hers: never replaced behind her back.
  const existing = await s.supabase.from('content_plans').select('id').eq('tenant_id', s.tenantId).eq('week_start', weekStart).maybeSingle();
  if (existing.error) {
    if (isMissingTable(existing.error)) return json({ success: false, error: NOT_AVAILABLE_HE }, 409);
    return json({ success: false, error: 'לא הצלחנו לבדוק את התוכנית הקיימת' }, 500);
  }
  if (existing.data) {
    const kept = await s.supabase.from('content_items').select('id', { count: 'exact', head: true }).eq('plan_id', existing.data.id).in('status', ['approved', 'posted']);
    if ((kept.count || 0) > 0) return json({ success: false, error: 'לשבוע הזה כבר יש פוסטים שאישרת. אפשר לערוך אותם בלוח, או לדלג על פוסט ולבקש חדש בשבוע הבא.' }, 409);
  }

  // What the app knows, read on her session: her services, the coming week's appointments, her designs, her reviews.
  const fields = businessFieldsOf(s.settings);
  const until = israelDay(new Date(now.getTime() + 8 * 86_400_000));
  const [svc, appts, designs] = await Promise.all([
    s.supabase.from('service_prices').select('name, field, description, duration').eq('tenant_id', s.tenantId),
    s.supabase.from('appointments').select('date, confirmation_status').eq('tenant_id', s.tenantId).gte('date', israelDay(now)).lte('date', until),
    s.supabase.from('designs').select('template_key, values, created_at').eq('tenant_id', s.tenantId).limit(200),
  ]);
  const services = svc.error && isMissingColumnError(svc.error)
    ? (await s.supabase.from('service_prices').select('name, duration').eq('tenant_id', s.tenantId)).data
    : svc.data;
  const branding = s.settings?.branding && typeof s.settings.branding === 'object' ? (s.settings.branding as Record<string, unknown>) : {};
  const suggestions = suggestPosts({
    today: now,
    services: (services || []) as never,
    appointments: ((appts.data || []) as Array<{ date: string; confirmation_status: string | null }>).map((a) => ({ date: a.date, status: a.confirmation_status })),
    designs: (designs.data || []) as never,
    reviews: Array.isArray(branding.reviews) ? branding.reviews : [],
    holidayTemplates: holidayTemplates(fields),
    fields,
  }, Math.max(prefs.items_per_week, 3));
  const picked = pickSuggestions(suggestions, slots.length);
  if (!picked.length) return json({ success: false, error: 'לא מצאנו נושאים לשבוע הזה. אפשר להוסיף טיפולים בהגדרות, ואז לנסות שוב.' }, 400);

  let captions: Awaited<ReturnType<typeof planCaptions>>;
  try {
    const profile = await loadBusinessProfile(s.supabase, s.tenantId);
    captions = await planCaptions(profile, picked.map((p, i) => ({ key: p.key, reason: p.reason, day: slotLabelHe(slots[i]) })), s.tenantId);
  } catch (e) {
    if (e instanceof DemoBlockedError) return json({ success: false, error: e.message }, 403);
    if (e instanceof AiCapExceededError || e instanceof AiCapUnavailableError) return json({ success: false, error: e.message }, e instanceof AiCapUnavailableError ? 503 : 429);
    if (e instanceof AiProviderUnavailableError) return json({ success: false, error: e.message }, 503);
    if (e instanceof UngroundedClaimsError) return json({ success: false, error: e.message }, 422);
    console.error('[content/plan] captions failed:', e instanceof Error ? e.message : 'unknown');
    return json({ success: false, error: 'ה-AI לא הצליח לכתוב את הטקסטים הפעם. אפשר לנסות שוב בעוד רגע.' }, 502);
  }

  // Save: the plan row (reused for the same week), earlier unapproved drafts of it set aside (skipped, not deleted).
  let planId = existing.data?.id as string | undefined;
  if (planId) {
    await s.supabase.from('content_items').update({ status: 'skipped', updated_at: now.toISOString() }).eq('plan_id', planId).eq('status', 'planned');
  } else {
    const ins = await s.supabase.from('content_plans').insert({ tenant_id: s.tenantId, week_start: weekStart, status: 'active', generated_by: 'ai', source: { keys: picked.map((p) => p.key) } }).select('id').single();
    if (ins.error || !ins.data) {
      console.error('[content/plan] plan insert failed:', ins.error?.message);
      return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
    }
    planId = ins.data.id as string;
  }

  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const c = captions[p.key];
    const item = await s.supabase.from('content_items').insert({
      tenant_id: s.tenantId, plan_id: planId, kind: 'post', topic: c.topic || p.reason.slice(0, 120), reason: p.reason.slice(0, 300),
      template_key: p.templateKey, values: p.values || {}, occasion_key: p.upcoming?.holiday?.key || null,
      planned_for: slots[i].toISOString(), status: 'planned',
    }).select('id').single();
    if (item.error || !item.data) { console.error('[content/plan] item insert failed:', item.error?.message); continue; }
    const rows = [
      { item_id: item.data.id, tenant_id: s.tenantId, platform: 'instagram', caption: c.instagram.caption, hashtags: c.instagram.hashtags },
      { item_id: item.data.id, tenant_id: s.tenantId, platform: 'facebook', caption: c.facebook.caption, hashtags: [] as string[] },
    ].filter((r) => prefs.platforms.includes(r.platform));
    const pl = await s.supabase.from('content_item_platforms').insert(rows);
    if (pl.error) console.error('[content/plan] captions insert failed:', pl.error.message);
  }

  const r = await readPlan(s.supabase, s.tenantId);
  return json({ success: true, plan: 'plan' in r ? r.plan : null });
}

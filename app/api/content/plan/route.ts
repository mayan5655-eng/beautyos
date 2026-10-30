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
import { contentPlanVisible, contentPublishVisible } from '@/lib/featureFlags';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { publishAbility, PUBLISH_ERROR_HE, type PublishErrorClass } from '@/lib/content/metaPublish';
import { businessFieldsOf } from '@/lib/businessFields';
import { holidayTemplates } from '@/lib/design/holidayTemplates';
import { suggestPosts } from '@/lib/design/suggestions';
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile';
import { getCallCapStatus, AiCapExceededError, AiCapUnavailableError, AiProviderUnavailableError, DemoBlockedError } from '@/lib/ai/callCaps';
import { UngroundedClaimsError } from '@/lib/ai/claimsGuard';
import { capRefusalHe } from '@/lib/ai/capMessages';
import { isMissingColumnError } from '@/lib/pgError';
import { isDemoTenantId } from '@/lib/demoTenants';
import { PRIVATE_BUCKET } from '@/lib/clientImages';
import { isMissingContentTable as isMissingTable, CONTENT_NOT_AVAILABLE_HE as NOT_AVAILABLE_HE } from '@/lib/content/db';
import {
  PACK_CALL_SITE, cleanPreferences, upcomingSlots, pickSuggestions, planCaptions, weekStartOf, slotLabelHe, israelDay,
  type Preferences,
} from '@/lib/content/pack';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Supa = Awaited<ReturnType<typeof createClient>>;
// The publishing pieces (facebook_pages, publish_jobs) are server-only tables: read with the service role, always scoped
// to the tenant her own session resolved (get_user_tenant_id), never to anything from the request.
const admin = () =>
  createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Her Pages and what each can be published to; null when the publishing columns are not there yet (SQL not run). */
async function readPublishPages(tenantId: string) {
  const { data, error } = await admin().from('facebook_pages')
    .select('page_id, page_name, instagram_business_id, granted_scopes, publish_enabled, is_active')
    .eq('tenant_id', tenantId).eq('is_active', true);
  if (error) return null;
  return ((data || []) as Array<{ page_id: string; page_name: string | null; instagram_business_id: string | null; granted_scopes: string | null; publish_enabled: boolean | null }>)
    .map((p) => ({ page_id: p.page_id, page_name: p.page_name || 'העמוד שלך', has_instagram: !!p.instagram_business_id, publish_enabled: !!p.publish_enabled, can: publishAbility(p) }));
}

/** Each post's publish jobs (state, platform, link, the reason in Hebrew when it failed). */
async function readJobs(tenantId: string, itemIds: string[]) {
  if (!itemIds.length) return {} as Record<string, unknown[]>;
  const { data, error } = await admin().from('publish_jobs').select('item_id, platform, state, run_at, external_url, error_class')
    .eq('tenant_id', tenantId).in('item_id', itemIds).neq('state', 'cancelled').order('created_at', { ascending: false });
  if (error) return {} as Record<string, unknown[]>;
  const out: Record<string, unknown[]> = {};
  for (const j of (data || []) as Array<{ item_id: string; platform: string; state: string; run_at: string; external_url: string | null; error_class: string | null }>) {
    const list = (out[j.item_id] ||= []) as Array<{ platform: string }>;
    if (list.some((x) => x.platform === j.platform)) continue; // the newest per platform
    list.push({ platform: j.platform, state: j.state, run_at: j.run_at, external_url: j.external_url, error: j.error_class ? PUBLISH_ERROR_HE[j.error_class as PublishErrorClass] || PUBLISH_ERROR_HE.unknown : null } as never);
  }
  return out;
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

async function session(request: NextRequest) {
  // Reading the plan costs nothing, so only the writes share the AI-image brake: every open of the content tab reads, and phones on one
  // mobile-data address share an IP, so counting reads gave some of them "too many images" without anyone making one (2026-10-24 review).
  const limited = request.method === 'GET' ? null : checkIpLimit(request, 'creatives');
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

type ItemRow = { id: string; plan_id: string; topic: string; reason: string; template_key: string | null; values: Record<string, string> | null; planned_for: string; status: string; approved_at: string | null; posted_at: string | null; design_id: string | null; media_path?: string | null };
type PlatformRow = { item_id: string; platform: string; caption: string; hashtags: string[] | null; edited: boolean; copied_at: string | null; posted_marked_at: string | null };

const ITEM_COLS = 'id, plan_id, topic, reason, template_key, values, planned_for, status, approved_at, posted_at, design_id';
const DAY_MS = 86_400_000;

/** The calendar's window: ?from=YYYY-MM-DD&to=YYYY-MM-DD (at most ~3 months), else a week back to six weeks ahead. */
function rangeOf(url: URL, now = new Date()): { from: string; to: string } {
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : null);
  let from = ok(url.searchParams.get('from'));
  let to = ok(url.searchParams.get('to'));
  if (!from || !to || Date.parse(to) < Date.parse(from) || Date.parse(to) - Date.parse(from) > 100 * DAY_MS) {
    from = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
    to = new Date(now.getTime() + 42 * DAY_MS).toISOString().slice(0, 10);
  }
  return { from, to };
}

/** Every post in the window (any plan, her own uploads included), oldest first, with its texts by platform. */
async function readPlan(supabase: Supa, tenantId: string, range: { from: string; to: string }) {
  const q = (cols: string) => supabase.from('content_items').select(cols).eq('tenant_id', tenantId).neq('status', 'skipped')
    .gte('planned_for', `${range.from}T00:00:00Z`).lt('planned_for', new Date(Date.parse(`${range.to}T00:00:00Z`) + DAY_MS + 3 * 3600_000).toISOString())
    .order('planned_for', { ascending: true }).limit(500);
  let items = await q(`${ITEM_COLS}, media_path`);
  // media_path arrives with add_publish_jobs.sql: degrade to the plan columns alone.
  if (items.error && isMissingColumnError(items.error)) items = await q(ITEM_COLS);
  if (items.error) return { error: items.error } as const;
  const rows = (items.data || []) as unknown as ItemRow[];
  const ids = rows.map((i) => i.id);
  const plats = ids.length ? await supabase.from('content_item_platforms').select('item_id, platform, caption, hashtags, edited, copied_at, posted_marked_at').in('item_id', ids) : { data: [], error: null };
  if (plats.error) return { error: plats.error } as const;
  const byItem = new Map<string, Record<string, Omit<PlatformRow, 'item_id' | 'platform'>>>();
  for (const p of (plats.data || []) as PlatformRow[]) {
    const m = byItem.get(p.item_id) || {};
    m[p.platform] = { caption: p.caption, hashtags: p.hashtags || [], edited: p.edited, copied_at: p.copied_at, posted_marked_at: p.posted_marked_at };
    byItem.set(p.item_id, m);
  }
  // Her own pictures live in her private folder: a short-lived link to show them, signed by the server.
  const urls = new Map<string, string>();
  const withMedia = rows.filter((r) => r.media_path && r.media_path.startsWith(`${tenantId}/`));
  if (withMedia.length) {
    const { data } = await admin().storage.from(PRIVATE_BUCKET).createSignedUrls(withMedia.map((r) => r.media_path as string), 3600);
    for (const d of (data || []) as Array<{ path: string | null; signedUrl: string | null }>) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return {
    plan: {
      range,
      items: rows.map((i) => ({ ...i, values: i.values || {}, label: slotLabelHe(new Date(i.planned_for)), platforms: byItem.get(i.id) || {}, media_url: i.media_path ? urls.get(i.media_path) || null : null })),
    },
  } as const;
}

export async function GET(request: NextRequest) {
  const s = await session(request);
  if ('error' in s) return s.error;
  if (!contentPlanVisible(s.settings)) return json({ success: true, enabled: false });
  const { prefs, missing } = await readPreferences(s.supabase, s.tenantId);
  if (missing) return json({ success: true, enabled: true, available: false, error: NOT_AVAILABLE_HE });
  const r = await readPlan(s.supabase, s.tenantId, rangeOf(new URL(request.url)));
  if ('error' in r && r.error) {
    if (isMissingTable(r.error)) return json({ success: true, enabled: true, available: false, error: NOT_AVAILABLE_HE });
    console.error('[content/plan] read failed:', r.error.message);
    return json({ success: false, error: 'לא הצלחנו לטעון את לוח התוכן' }, 500);
  }
  const cap = await getCallCapStatus(s.tenantId, PACK_CALL_SITE);
  let plan = 'plan' in r ? r.plan : null;
  let publish: unknown = { enabled: false };
  if (contentPublishVisible(s.settings)) {
    const pages = await readPublishPages(s.tenantId);
    publish = { enabled: true, available: pages !== null, pages: pages || [] };
    if (plan && pages !== null) {
      const jobs = await readJobs(s.tenantId, plan.items.map((i) => i.id));
      plan = { ...plan, items: plan.items.map((i) => ({ ...i, jobs: jobs[i.id] || [] })) };
    }
  }
  return json({ success: true, enabled: true, available: true, preferences: prefs, plan, publish, cap: { used: cap.used, cap: cap.cap } });
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

  if (body.action === 'publish-page') {
    if (!contentPublishVisible(s.settings)) return json({ success: false, error: 'פרסום אוטומטי לא פעיל בחשבון' }, 404);
    const pageId = typeof body.pageId === 'string' && /^\d{3,30}$/.test(body.pageId) ? body.pageId : '';
    if (!pageId) return json({ success: false, error: 'עמוד לא מזוהה' }, 400);
    const enabled = body.enabled === true;
    // Only her own Page (tenant from her session), and only turned ON when it actually has a publishing permission.
    const pages = await readPublishPages(s.tenantId);
    if (pages === null) return json({ success: false, error: 'פרסום אוטומטי עוד לא הופעל בחשבון (חסרה הרצת SQL: kalmea-sql-content-publish).' }, 409);
    const page = pages.find((p) => p.page_id === pageId);
    if (!page) return json({ success: false, error: 'העמוד לא נמצא בחשבון שלך' }, 404);
    if (enabled && !page.can.facebook && !page.can.instagram) return json({ success: false, error: 'לעמוד הזה אין עדיין הרשאת פרסום. צריך לחבר מחדש עם "לחבר פרסום אוטומטי".' }, 409);
    const { error } = await admin().from('facebook_pages').update({ publish_enabled: enabled }).eq('tenant_id', s.tenantId).eq('page_id', pageId);
    if (error) return json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, 500);
    return json({ success: true, pages: await readPublishPages(s.tenantId) });
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

  const r = await readPlan(s.supabase, s.tenantId, rangeOf(new URL(request.url)));
  return json({ success: true, plan: 'plan' in r ? r.plan : null });
}

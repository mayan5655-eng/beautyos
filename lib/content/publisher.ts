// lib/content/publisher.ts
//
// SERVER ONLY (service role). Stage 2 of docs/specs/content-publishing.md: the queue behind "approved -> published".
//
//   enqueueApproved()  she approved a post: one publish_jobs row per platform her Page can be published to, run_at = the
//                      post's time. Only when publishing is switched on for her (flag + Page + permission + picture).
//   cancelJobs()       she undid the approval or skipped the post: queued jobs become cancelled (never deleted).
//   rescheduleJobs()   she moved the post: queued jobs follow.
//   runDue()           the cron (every 5 minutes): claims due jobs one by one with a conditional update (two overlapping
//                      runs can never publish the same job twice), checks the business is active, publishes through
//                      lib/content/metaPublish.ts, records the result, and tells her (owner notification) either way.
//
// "Published" is written only after Meta returned a post id. A retryable failure (rate limit, Meta down) goes back to
// the queue up to MAX_ATTEMPTS; anything else fails with a Hebrew reason and one action. Every step is logged in
// publish_events. Dependencies are injected so the test runs it against an in-memory database and a fake Meta.

import {
  PublishError, PUBLISH_ERROR_HE, publishFacebookPhoto, instagramContainer, instagramPublish, igCaption, publishAbility,
  type PublishErrorClass,
} from './metaPublish.ts';

export const MAX_ATTEMPTS = 3;
export const CLAIM_MINUTES = 4;
export const DUE_BATCH = 20;

/** The narrow slice of supabase-js the publisher uses (so a fake can stand in). */
export type Db = { from: (table: string) => any; storage?: any };

export type Deps = {
  db: Db;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  decrypt: (sealed: string) => string;
  signUrl: (path: string) => Promise<string | null>;
  notify: (o: { tenantId: string; title: string; body: string }) => Promise<void>;
  isBlocked: (tenantId: string) => Promise<boolean>;
  isDemo: (tenantId: string) => boolean;
  /** For a platform-side outage that exhausted its retries. */
  alert?: (message: string) => Promise<void>;
  /** Instagram container polling pause (0 in tests). */
  waitMs?: number;
};

const iso = (d: Date) => d.toISOString();

async function logEvent(db: Db, job: { id: string; tenant_id: string }, event: string, detail: Record<string, unknown> | null = null) {
  try { await db.from('publish_events').insert({ job_id: job.id, tenant_id: job.tenant_id, event, detail }); } catch { /* the log never blocks a publish */ }
}

// ── queue ──────────────────────────────────────────────────────────────────

export type PageRow = { page_id: string; page_access_token_encrypted?: string; instagram_business_id: string | null; granted_scopes: string | null; publish_enabled: boolean | null; is_active: boolean | null };

/** Her Page to publish to: the active one she switched publishing on for (the first, when she connected several). */
export async function publishPage(db: Db, tenantId: string): Promise<PageRow | null> {
  const { data, error } = await db.from('facebook_pages')
    .select('page_id, page_access_token_encrypted, instagram_business_id, granted_scopes, publish_enabled, is_active')
    .eq('tenant_id', tenantId).eq('is_active', true).eq('publish_enabled', true).limit(1);
  if (error || !Array.isArray(data) || !data.length) return null;
  return data[0] as PageRow;
}

export type EnqueueResult = { queued: Array<'instagram' | 'facebook'>; reason: null | 'no-page' | 'no-permission' | 'no-media' | 'no-platforms' };

export async function enqueueApproved(db: Db, o: { tenantId: string; itemId: string; plannedFor: string; approvedAt: string; mediaPath: string | null }): Promise<EnqueueResult> {
  const page = await publishPage(db, o.tenantId);
  if (!page) return { queued: [], reason: 'no-page' };
  const ability = publishAbility(page);
  if (!ability.facebook && !ability.instagram) return { queued: [], reason: 'no-permission' };
  if (!o.mediaPath) return { queued: [], reason: 'no-media' };
  const { data: plats } = await db.from('content_item_platforms').select('id, platform').eq('item_id', o.itemId);
  const wanted = ((plats || []) as Array<{ id: string; platform: string }>).filter((p) => (p.platform === 'facebook' && ability.facebook) || (p.platform === 'instagram' && ability.instagram));
  if (!wanted.length) return { queued: [], reason: 'no-platforms' };
  const queued: Array<'instagram' | 'facebook'> = [];
  for (const p of wanted) {
    const { error } = await db.from('publish_jobs').insert({
      tenant_id: o.tenantId, item_id: o.itemId, item_platform_id: p.id, platform: p.platform, page_id: page.page_id,
      run_at: o.plannedFor, state: 'queued', idempotency_key: `${p.id}:${o.approvedAt}`,
    });
    if (!error || /duplicate|23505/i.test(`${error.code} ${error.message}`)) queued.push(p.platform as 'instagram' | 'facebook');
  }
  return { queued, reason: null };
}

export async function cancelJobs(db: Db, itemId: string, why: string): Promise<void> {
  await db.from('publish_jobs').update({ state: 'cancelled', error_text: why.slice(0, 500), updated_at: iso(new Date()) }).eq('item_id', itemId).in('state', ['queued', 'paused']);
}

export async function rescheduleJobs(db: Db, itemId: string, runAt: string): Promise<void> {
  await db.from('publish_jobs').update({ run_at: runAt, updated_at: iso(new Date()) }).eq('item_id', itemId).in('state', ['queued', 'paused']);
}

// ── the runner ─────────────────────────────────────────────────────────────

type Job = { id: string; tenant_id: string; item_id: string; item_platform_id: string | null; platform: 'instagram' | 'facebook'; page_id: string; state: string; attempts: number; container_id: string | null };

export type RunReport = { due: number; published: number; retried: number; failed: number; skipped: number };

const PLATFORM_HE = { instagram: 'באינסטגרם', facebook: 'בפייסבוק' } as const;

export async function runDue(deps: Deps): Promise<RunReport> {
  const { db } = deps;
  const now = (deps.now || (() => new Date()))();
  const report: RunReport = { due: 0, published: 0, retried: 0, failed: 0, skipped: 0 };

  // Due: queued and time has come, or claimed by a run that died (its lock expired).
  const [queued, stale] = await Promise.all([
    db.from('publish_jobs').select('id').eq('state', 'queued').lte('run_at', iso(now)).order('run_at', { ascending: true }).limit(DUE_BATCH),
    db.from('publish_jobs').select('id').in('state', ['claimed', 'container_created']).lt('locked_until', iso(now)).limit(DUE_BATCH),
  ]);
  const ids = [...new Set([...(queued.data || []), ...(stale.data || [])].map((r: { id: string }) => r.id))];
  report.due = ids.length;

  for (const id of ids) {
    // The claim: only one run can move a job out of a claimable state.
    const lock = iso(new Date(now.getTime() + CLAIM_MINUTES * 60_000));
    const claimed = await db.from('publish_jobs')
      .update({ state: 'claimed', locked_until: lock, updated_at: iso(now) })
      .eq('id', id).or(`state.eq.queued,and(state.in.(claimed,container_created),locked_until.lt.${iso(now)})`)
      .select('id, tenant_id, item_id, item_platform_id, platform, page_id, state, attempts, container_id').maybeSingle();
    const job = claimed.data as Job | null;
    if (!job) continue;
    try {
      const outcome = await publishOne(deps, job, now);
      report[outcome]++;
    } catch (e) {
      console.error('[content/publish] job crashed:', e instanceof Error ? e.message : 'unknown');
      await db.from('publish_jobs').update({ state: 'queued', locked_until: null, updated_at: iso(now) }).eq('id', job.id);
      report.retried++;
    }
  }
  return report;
}

async function publishOne(deps: Deps, job: Job, now: Date): Promise<'published' | 'retried' | 'failed' | 'skipped'> {
  const { db } = deps;
  const set = (patch: Record<string, unknown>) => db.from('publish_jobs').update({ ...patch, updated_at: iso(new Date()) }).eq('id', job.id);
  const attempt = (job.attempts || 0) + 1;
  await set({ attempts: attempt });
  await logEvent(db, job, 'claimed', { attempt });

  if (deps.isDemo(job.tenant_id)) { await set({ state: 'cancelled', error_text: 'demo' }); return 'skipped'; }
  if (await deps.isBlocked(job.tenant_id)) {
    // On hold: paused, not lost. When she renews, the board asks what to keep (spec section 2.3).
    await set({ state: 'paused', locked_until: null, error_text: 'plan on hold' });
    await logEvent(db, job, 'paused', { reason: 'plan on hold' });
    return 'skipped';
  }

  const item = (await db.from('content_items').select('id, status, media_path').eq('id', job.item_id).maybeSingle()).data as { status: string; media_path: string | null } | null;
  if (!item || item.status !== 'approved') {
    await set({ state: 'cancelled', locked_until: null, error_text: 'no longer approved' });
    return 'skipped';
  }
  const text = job.item_platform_id
    ? (await db.from('content_item_platforms').select('caption, hashtags').eq('id', job.item_platform_id).maybeSingle()).data as { caption: string; hashtags: string[] | null } | null
    : null;
  const page = (await db.from('facebook_pages').select('page_id, page_access_token_encrypted, instagram_business_id, granted_scopes, publish_enabled, is_active').eq('tenant_id', job.tenant_id).eq('page_id', job.page_id).maybeSingle()).data as PageRow | null;

  const fail = async (cls: PublishErrorClass, detail: string) => {
    const retry = (cls === 'rate_limited' || cls === 'platform_down') && attempt < MAX_ATTEMPTS;
    if (retry) {
      await set({ state: job.container_id ? 'container_created' : 'queued', locked_until: null, run_at: iso(new Date(now.getTime() + attempt * 5 * 60_000)), error_class: cls, error_text: detail.slice(0, 500) });
      await logEvent(db, job, 'retry', { class: cls, attempt });
      return 'retried' as const;
    }
    await set({ state: 'failed', locked_until: null, error_class: cls, error_text: detail.slice(0, 500) });
    await logEvent(db, job, 'failed', { class: cls });
    await deps.notify({ tenantId: job.tenant_id, title: `הפוסט לא פורסם ${PLATFORM_HE[job.platform]}`, body: PUBLISH_ERROR_HE[cls] });
    if (cls === 'platform_down' && deps.alert) await deps.alert(`content publish: Meta down after ${attempt} attempts (job ${job.id})`);
    return 'failed' as const;
  };

  if (!page || !page.is_active || !page.publish_enabled || !page.page_access_token_encrypted) return fail('permission_missing', 'page not connected for publishing');
  const ability = publishAbility(page);
  if (!ability[job.platform]) return fail('permission_missing', `no ${job.platform} publish permission`);
  if (!text?.caption) return fail('unknown', 'no caption');
  if (!item.media_path) return fail('media_rejected', 'no picture');
  const imageUrl = await deps.signUrl(item.media_path);
  if (!imageUrl) return fail('media_rejected', 'picture not readable');

  let token: string;
  try { token = deps.decrypt(page.page_access_token_encrypted); } catch { return fail('token_expired', 'token unreadable'); }

  try {
    let result: { externalId: string; externalUrl: string };
    if (job.platform === 'facebook') {
      result = await publishFacebookPhoto({ pageId: page.page_id, pageToken: token, imageUrl, caption: text.caption, fetchImpl: deps.fetchImpl });
    } else {
      const containerId = await instagramContainer({
        igUserId: page.instagram_business_id!, pageToken: token, imageUrl, caption: igCaption(text.caption, text.hashtags || []),
        existingContainerId: job.container_id, fetchImpl: deps.fetchImpl, waitMs: deps.waitMs,
      });
      if (containerId !== job.container_id) {
        // Stored BEFORE media_publish: a crash after this point resumes with the same container, never a second one.
        await set({ state: 'container_created', container_id: containerId });
        job.container_id = containerId;
        await logEvent(db, job, 'container_created', null);
      }
      result = await instagramPublish({ igUserId: page.instagram_business_id!, pageToken: token, containerId, fetchImpl: deps.fetchImpl });
    }
    await set({ state: 'published', locked_until: null, external_id: result.externalId, external_url: result.externalUrl, error_class: null, error_text: null });
    await logEvent(db, job, 'published', { url: result.externalUrl });
    if (job.item_platform_id) {
      await db.from('content_item_platforms').update({ external_url: result.externalUrl, posted_marked_at: iso(new Date()), updated_at: iso(new Date()) }).eq('id', job.item_platform_id);
    }
    // The post is "posted" once none of its jobs is still on the way.
    const open = await db.from('publish_jobs').select('id', { count: 'exact', head: true }).eq('item_id', job.item_id).in('state', ['queued', 'claimed', 'container_created', 'paused']);
    if (!open.error && (open.count || 0) === 0) {
      await db.from('content_items').update({ status: 'posted', posted_at: iso(new Date()), updated_at: iso(new Date()) }).eq('id', job.item_id).eq('status', 'approved');
    }
    await deps.notify({ tenantId: job.tenant_id, title: `הפוסט פורסם ${PLATFORM_HE[job.platform]}`, body: result.externalUrl });
    return 'published';
  } catch (e) {
    const pe = e instanceof PublishError ? e : new PublishError('unknown', e instanceof Error ? e.message : 'unknown');
    return fail(pe.errorClass, pe.message);
  }
}

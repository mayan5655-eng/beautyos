// lib/content/metaPublish.ts
//
// Publishing one approved post to Meta (docs/specs/content-publishing.md, stage 2, section 4.2), with fetch injected so
// the test runs without a network. Images only for now (a feed post with her picture); reels come with stage 4's media.
//
//   Facebook Page   POST /{page-id}/photos  { url, caption, published: true }             -> { post_id | id }
//   Instagram       POST /{ig-user-id}/media { image_url, caption }                         -> { id: container }
//                   GET  /{container}?fields=status_code   until FINISHED (images are usually immediate)
//                   POST /{ig-user-id}/media_publish { creation_id }                          -> { id: media }
//                   GET  /{media}?fields=permalink                                             -> the post link
// Both use the PAGE access token (the Instagram account is the one linked to her Page: the Facebook Login route,
// decision 2). The picture is a short-lived signed URL Meta fetches while publishing.
//
// Instagram is two steps on purpose: the container id is handed back to the caller BEFORE media_publish, so a crash
// between the two never creates a second container (the caller stores it and resumes with it).
//
// Errors are classified so the publisher knows whether to retry and what to tell her (PUBLISH_ERROR_HE).

import { FB_BASE_URL } from '../facebook/client.ts';

export type PublishErrorClass = 'token_expired' | 'permission_missing' | 'media_rejected' | 'rate_limited' | 'platform_down' | 'unknown';

export class PublishError extends Error {
  readonly errorClass: PublishErrorClass;
  readonly retryable: boolean;
  readonly code: number | null;
  constructor(errorClass: PublishErrorClass, message: string, code: number | null = null) {
    super(message);
    this.errorClass = errorClass;
    this.code = code;
    this.retryable = errorClass === 'rate_limited' || errorClass === 'platform_down';
  }
}

/** What she reads when a post could not go out, with the one thing to do. */
export const PUBLISH_ERROR_HE: Record<PublishErrorClass, string> = {
  token_expired: 'החיבור לפייסבוק פג תוקף. צריך לחבר מחדש בהגדרות > חיבורים, ואז לאשר את הפוסט שוב.',
  permission_missing: 'לקלמיה אין הרשאה לפרסם בעמוד הזה. צריך לחבר מחדש ולאשר את הרשאת הפרסום.',
  media_rejected: 'Meta לא קיבלה את התמונה. אפשר לפתוח את התמונה, לשמור אותה מחדש ולאשר שוב.',
  rate_limited: 'Meta ביקשה להמתין. ננסה שוב בעוד כמה דקות.',
  platform_down: 'Meta לא זמינה כרגע. ננסה שוב בעוד כמה דקות.',
  unknown: 'הפרסום לא הצליח. אפשר לפרסם ידנית עם הטקסט המוכן, או לנסות שוב מאוחר יותר.',
};

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string };

/** Graph error -> class. Codes from Meta's error reference: 190 token, 10/200-299 permission, 4/17/32/613 rate, 1/2 platform. */
export function classifyGraphError(status: number, e: GraphError | null | undefined): PublishError {
  const code = typeof e?.code === 'number' ? e.code : null;
  const msg = String(e?.message || `http ${status}`).slice(0, 300);
  if (code === 190 || code === 102 || code === 463 || code === 467) return new PublishError('token_expired', msg, code);
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return new PublishError('permission_missing', msg, code);
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001 || code === 9) return new PublishError('rate_limited', msg, code);
  if (code === 9004 || code === 36003 || code === 2207026 || code === 324 || /image|media|aspect|url/i.test(msg) && status === 400) return new PublishError('media_rejected', msg, code);
  if (code === 1 || code === 2 || status >= 500) return new PublishError('platform_down', msg, code);
  return new PublishError('unknown', msg, code);
}

type Fetch = typeof fetch;

async function graph(fetchImpl: Fetch, method: 'GET' | 'POST', path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  let res: Response;
  try {
    res = method === 'GET'
      ? await fetchImpl(`${FB_BASE_URL}/${path}?${body.toString()}`, { method: 'GET', signal: AbortSignal.timeout(20_000) })
      : await fetchImpl(`${FB_BASE_URL}/${path}`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new PublishError('platform_down', 'Meta unreachable');
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.error) throw classifyGraphError(res.status, (json?.error || null) as GraphError | null);
  return json;
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** Instagram caption: her text plus her hashtags, within Instagram's limit. */
export function igCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.filter(Boolean).join(' ');
  return (tags ? `${caption.trim()}\n\n${tags}` : caption.trim()).slice(0, 2200);
}

export async function publishFacebookPhoto(o: { pageId: string; pageToken: string; imageUrl: string; caption: string; fetchImpl?: Fetch }): Promise<{ externalId: string; externalUrl: string }> {
  const f = o.fetchImpl || fetch;
  const r = await graph(f, 'POST', `${encodeURIComponent(o.pageId)}/photos`, { url: o.imageUrl, caption: o.caption, published: 'true', access_token: o.pageToken });
  const id = str(r.post_id) || str(r.id);
  if (!id) throw new PublishError('unknown', 'no post id from Facebook');
  return { externalId: id, externalUrl: `https://www.facebook.com/${id}` };
}

/** Step 1: create (or reuse) the Instagram container and wait until Meta finished processing it. */
export async function instagramContainer(o: { igUserId: string; pageToken: string; imageUrl: string; caption: string; existingContainerId?: string | null; fetchImpl?: Fetch; waitMs?: number }): Promise<string> {
  const f = o.fetchImpl || fetch;
  let id = o.existingContainerId || '';
  if (!id) {
    const r = await graph(f, 'POST', `${encodeURIComponent(o.igUserId)}/media`, { image_url: o.imageUrl, caption: o.caption, access_token: o.pageToken });
    id = str(r.id);
    if (!id) throw new PublishError('unknown', 'no container id from Instagram');
  }
  const wait = o.waitMs ?? 2000;
  for (let i = 0; i < 5; i++) {
    const s = await graph(f, 'GET', encodeURIComponent(id), { fields: 'status_code', access_token: o.pageToken });
    const code = str(s.status_code);
    if (code === 'FINISHED' || code === 'PUBLISHED') return id;
    if (code === 'ERROR' || code === 'EXPIRED') throw new PublishError('media_rejected', `container ${code}`);
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }
  throw new PublishError('platform_down', 'container still processing');
}

/** Step 2: publish a finished container; returns the media id and its permalink when Meta gives one. */
export async function instagramPublish(o: { igUserId: string; pageToken: string; containerId: string; fetchImpl?: Fetch }): Promise<{ externalId: string; externalUrl: string }> {
  const f = o.fetchImpl || fetch;
  const r = await graph(f, 'POST', `${encodeURIComponent(o.igUserId)}/media_publish`, { creation_id: o.containerId, access_token: o.pageToken });
  const id = str(r.id);
  if (!id) throw new PublishError('unknown', 'no media id from Instagram');
  let url = '';
  try {
    const p = await graph(f, 'GET', encodeURIComponent(id), { fields: 'permalink', access_token: o.pageToken });
    url = str(p.permalink);
  } catch { /* the post is published either way; the link is a nicety */ }
  return { externalId: id, externalUrl: url || 'https://www.instagram.com/' };
}

/** Which of the two platforms a connected Page can be published to, from what she granted. */
export function publishAbility(page: { granted_scopes?: string | null; instagram_business_id?: string | null; publish_enabled?: boolean | null } | null | undefined, scopes = REQUIRED_SCOPES): { facebook: boolean; instagram: boolean } {
  if (!page) return { facebook: false, instagram: false };
  const granted = new Set(String(page.granted_scopes || '').split(',').map((s) => s.trim()).filter(Boolean));
  const has = (list: string[]) => list.every((s) => granted.has(s));
  return {
    facebook: has(scopes.facebook),
    instagram: !!page.instagram_business_id && has(scopes.instagram),
  };
}

/**
 * The permissions each platform needs on the Facebook Login route. The Instagram names are UNVERIFIED (Meta renamed the
 * Instagram-Login ones in 2025); FACEBOOK_PUBLISH_SCOPES can override the requested list without a code change once the
 * App Dashboard confirms them (spec decision 2).
 */
export const REQUIRED_SCOPES = {
  facebook: ['pages_manage_posts'],
  instagram: ['instagram_basic', 'instagram_content_publish'],
};

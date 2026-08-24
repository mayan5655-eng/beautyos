// lib/rateLimit.ts
//
// Abuse caps for the unauthenticated endpoints.
//
// Three routes accept a `tenantId` straight out of the request body and run on
// the service-role key, which bypasses RLS:
//
//   /api/book-appointment  - writes appointments into any tenant
//   /api/skin-scan/send    - writes a lead AND sends WhatsApp on that tenant's
//                            paid Green API quota
//   /api/skin-scan/lead    - writes a lead into any tenant
//
// None of them can be authenticated: real clients use them anonymously, from a
// link in an Instagram bio. So the exposure is not "who is calling" but "how
// often", and that is what this file bounds. Without it, one script can fill a
// beta user's calendar with junk appointments and burn her WhatsApp credit
// before she notices.
//
// TWO KEYS, BOTH NEEDED:
//   per-IP     stops one caller hammering one salon.
//   per-tenant stops a distributed caller, and is also the cap that actually
//              protects her WhatsApp balance - that bill is per tenant, not per
//              attacker.
//
// ── What this is NOT ─────────────────────────────────────────────────────────
// Deliberately in-memory and dependency-free, per the brief. On Vercel each
// serverless instance has its own memory, so the real ceiling is
// `limit x number of warm instances`, not `limit`. That is a genuine weakening
// under a distributed flood and it is stated here rather than hidden: this
// stops the casual script and the accidental retry loop, which is the actual
// beta threat, and it costs nothing - no Redis, no extra table, no round trip
// on the happy path.
//
// The upgrade path when it is needed is a `rate_limits` table with an atomic
// increment RPC, keyed the same way. The policy table below is the part worth
// keeping; only the counter underneath it would change.

export type RateRule = { limit: number; windowMs: number };

type Bucket = { count: number; resetAt: number };

const MINUTE = 60_000;

/**
 * Every limit and every user-facing sentence, in one reviewable place.
 *
 * The numbers are set against what a REAL client does, not against a round
 * number. A woman booking an appointment submits once; she submits again only
 * if her slot was taken while she was choosing. A woman using the skin scanner
 * sends her report once - the page already blocks a second send. Anything well
 * past that is not a customer.
 */
export const RATE_POLICIES = {
  'book-appointment': {
    // 8 in 10 minutes from one device: room to lose the slot race several times
    // over and still succeed, nowhere near enough to fill a day.
    perIp: { limit: 8, windowMs: 10 * MINUTE },
    // A solo cosmetician has roughly 8-10 bookable slots in a day. Twelve public
    // bookings into one business inside ten minutes is not a busy afternoon.
    perTenant: { limit: 12, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי בקשות מהמכשיר הזה. אפשר לנסות שוב ${m}, או להתקשר לעסק ולקבוע טלפונית.`,
    tenantMessage: (m: string) =>
      `יומן ההזמנות של העסק עמוס כרגע בבקשות. אפשר לנסות שוב ${m}, או ליצור קשר עם העסק ישירות.`,
  },

  // The expensive one: every accepted call sends two WhatsApp messages on the
  // tenant's paid quota. Tightest limits of the three.
  'skin-scan-send': {
    perIp: { limit: 3, windowMs: 10 * MINUTE },
    perTenant: { limit: 10, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי דוחות מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `סורק העור עמוס כרגע. אפשר לנסות שוב ${m}.`,
  },

  // Analysing an uploaded CSV of leads. Each call costs one Claude request,
  // so this is capped tighter than the read-only endpoints - but it is an
  // authenticated action a cosmetician takes deliberately, a handful of times
  // while she gets the column mapping right, so it must not fight her.
  'leads-import': {
    perIp: { limit: 20, windowMs: 10 * MINUTE },
    perTenant: { limit: 30, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נותחו יותר מדי קבצים מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `נותחו יותר מדי קבצים כרגע. אפשר לנסות שוב ${m}.`,
  },

  // Asking for help. She is already stuck, so the cap is only here to stop a
  // stuck-and-hammering loop, never to be the thing that blocks her.
  support: {
    perIp: { limit: 10, windowMs: 10 * MINUTE },
    perTenant: { limit: 20, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו כבר כמה הודעות. אפשר לשלוח שוב ${m}, או לכתוב לנו ישירות בוואטסאפ.`,
    tenantMessage: (m: string) =>
      `נשלחו כבר כמה הודעות. אפשר לשלוח שוב ${m}, או לכתוב לנו ישירות בוואטסאפ.`,
  },

  // Opening a consent form. A read, and the client is standing in the clinic
  // waiting to sign, so it must not be the limit anyone trips. Loose, like
  // 'availability', for the same reason: making this fail is worse than not
  // capping it.
  'form-fetch': {
    perIp: { limit: 40, windowMs: 10 * MINUTE },
    perTenant: { limit: 200, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי בקשות מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `המערכת עמוסה כרגע. אפשר לנסות שוב ${m}.`,
  },

  // Signing one. A write, and a legal record, so tighter than the read - but
  // still well above what one person filling in one form could ever need.
  'form-sign': {
    perIp: { limit: 10, windowMs: 10 * MINUTE },
    perTenant: { limit: 60, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי בקשות מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `המערכת עמוסה כרגע. אפשר לנסות שוב ${m}.`,
  },

  // A read, and one the booking page cannot work without: /book calls it on
  // every load to find out which slots are already taken. So this is the
  // LOOSEST policy of all, on purpose.
  //
  // Getting this wrong is worse than not having it. If a real visitor trips
  // this limit she loses the availability data, and the page then has to admit
  // it cannot tell her what is free - which is the exact failure this endpoint
  // was added to remove. The cap is here to stop somebody scraping a
  // cosmetician's whole diary in a loop, not to police browsing.
  //
  // 60 per IP per 10 minutes is roughly a page load every ten seconds, sustained.
  // 400 per tenant covers every visitor a beta business could plausibly have at
  // once, several times over.
  availability: {
    perIp: { limit: 60, windowMs: 10 * MINUTE },
    perTenant: { limit: 400, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי בקשות מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `יומן העסק עמוס כרגע בבקשות. אפשר לנסות שוב ${m}.`,
  },

  // The cheap one: a single upsert, and it is fired automatically (keepalive) as
  // the scanner page navigates to /book. It must not be the limit a real visitor
  // trips, so it is the loosest.
  'skin-scan-lead': {
    perIp: { limit: 10, windowMs: 10 * MINUTE },
    perTenant: { limit: 40, windowMs: 10 * MINUTE },
    ipMessage: (m: string) =>
      `נשלחו יותר מדי בקשות מהמכשיר הזה. אפשר לנסות שוב ${m}.`,
    tenantMessage: (m: string) =>
      `הסורק עמוס כרגע בבקשות. אפשר לנסות שוב ${m}.`,
  },
} as const;

export type PolicyName = keyof typeof RATE_POLICIES;

// ── The counter ──────────────────────────────────────────────────────────────
//
// Fixed window rather than a sliding log: one integer and one timestamp per
// key instead of an array of timestamps. A fixed window lets through up to 2x
// the limit across a window boundary, which at these numbers is irrelevant -
// 16 booking attempts instead of 8 is still not an attack that achieves
// anything.

const buckets = new Map<string, Bucket>();

// Bounded so that a caller rotating IPs cannot grow the map until the instance
// runs out of memory. 20k keys is a few MB and far more than a beta can
// legitimately produce.
const MAX_KEYS = 20_000;

function sweep(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size <= MAX_KEYS) return;
  // Still over after dropping everything expired: evict the entries closest to
  // expiring. Map preserves insertion order, so this is approximate - and
  // approximate is fine, because evicting a live bucket only ever grants
  // someone a fresh allowance, it never blocks a legitimate caller.
  const excess = buckets.size - MAX_KEYS;
  let i = 0;
  for (const k of buckets.keys()) {
    if (i++ >= excess) break;
    buckets.delete(k);
  }
}

let checksSinceSweep = 0;

/**
 * Count one hit against `key` and say whether it is allowed.
 *
 * Exported for the rare caller that needs a bespoke key; the routes use
 * checkIpLimit / checkTenantLimit below instead.
 */
export function hit(key: string, rule: RateRule): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();

  // Sweeping is O(n), so it does not run on every request. Every 500 checks, or
  // whenever the map has grown past its ceiling, is often enough to keep memory
  // flat without putting a scan in front of a normal booking.
  if (++checksSinceSweep >= 500 || buckets.size > MAX_KEYS) {
    checksSinceSweep = 0;
    sweep(now);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Caller IP, as far as it can be known behind Vercel's proxy.
 *
 * `request.ip` was removed in Next 15, so this reads the forwarding headers.
 * x-forwarded-for is a chain and the FIRST entry is the original client;
 * Vercel appends rather than replaces, so taking [0] is correct here. A caller
 * cannot forge it into someone else's bucket in a way that helps them - the
 * worst they achieve is limiting a stranger, and the per-tenant cap still
 * holds regardless.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || h.get('x-vercel-forwarded-for')?.trim() || 'unknown';
}

/** "בעוד 4 דקות" / "בעוד דקה" / "בעוד כמה שניות" - for the Hebrew messages. */
function retryPhrase(retryAfterSec: number): string {
  if (retryAfterSec <= 45) return 'בעוד כמה שניות';
  const mins = Math.ceil(retryAfterSec / 60);
  if (mins === 1) return 'בעוד דקה';
  if (mins === 2) return 'בעוד שתי דקות';
  return `בעוד ${mins} דקות`;
}

/**
 * The 429 itself.
 *
 * Shape matters: both public pages render `result.error` verbatim
 * (app/book/page.jsx, app/skin-scan/page.jsx), so keeping the existing
 * { success:false, error } envelope is what turns this from a bare status code
 * into a sentence a client can act on. A 429 with no body would show her the
 * generic "אירעה שגיאה. נסי שוב." and she would retry immediately, forever.
 */
function limited(message: string, retryAfterSec: number): Response {
  return Response.json(
    { success: false, error: message, rateLimited: true },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'Cache-Control': 'no-store',
      },
    },
  );
}

/**
 * Per-IP gate. Call this FIRST in a route, before reading the body, so a flood
 * is refused without parsing anything.
 *
 * Returns a ready-to-return Response when the caller is over the limit, or
 * null when the request may proceed.
 */
export function checkIpLimit(request: Request, policy: PolicyName): Response | null {
  const p = RATE_POLICIES[policy];
  const verdict = hit(`${policy}:ip:${clientIp(request)}`, p.perIp);
  if (verdict.ok) return null;
  return limited(p.ipMessage(retryPhrase(verdict.retryAfterSec)), verdict.retryAfterSec);
}

/**
 * Per-tenant gate. Call this once tenantId has been read from the body and
 * validated - it is the cap that protects the tenant's WhatsApp balance and
 * her calendar from a caller who is rotating IPs.
 *
 * A missing tenantId is not rate limited here: every one of these routes
 * already refuses that request with a 400, and inventing a shared "no tenant"
 * bucket would only let one bad caller exhaust it for everybody.
 */
export function checkTenantLimit(tenantId: string | null | undefined, policy: PolicyName): Response | null {
  if (!tenantId) return null;
  const p = RATE_POLICIES[policy];
  const verdict = hit(`${policy}:tenant:${tenantId}`, p.perTenant);
  if (verdict.ok) return null;
  return limited(p.tenantMessage(retryPhrase(verdict.retryAfterSec)), verdict.retryAfterSec);
}

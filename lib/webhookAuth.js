// lib/webhookAuth.js
//
// The gate on the inbound WhatsApp webhook.
//
// ── What it closes ─────────────────────────────────────────────────────────
// app/api/whatsapp-webhook used to authenticate nothing. It trusted the
// instance id, the sender's phone and the message text from the JSON body.
// Anyone who posted a payload naming a tenant's instance id got a Claude-
// written reply sent from the platform's WhatsApp number to any phone they
// named, billed to that tenant. An open relay on the product's most exposed
// asset - the one number every automated message leaves from, and the one
// the product cannot afford to lose to a ban.
//
// ── How GreenAPI presents the secret ───────────────────────────────────────
// GreenAPI lets an instance carry a "webhook URL token", which it sends on
// every delivery as `Authorization: Bearer <token>`. It also delivers to
// whatever URL is configured, so a token in the query string works on any
// provider and survives a console that has no token field. Both are accepted:
//
//   Authorization: Bearer <secret>      the GreenAPI webhookUrlToken setting
//   Authorization: <secret>             the same, if a console strips "Bearer"
//   ?token=<secret> on the webhook URL  belt and braces
//
// ── Fail closed ────────────────────────────────────────────────────────────
// No GREENAPI_WEBHOOK_SECRET in the environment means NOTHING is accepted, and
// the log says why once per process. This is the opposite of the spend
// controls, which fail open, because this is a security boundary: a missing
// secret must never silently reopen the relay. The cost of that choice is that
// the bot is silent until the variable is set in Vercel and the token is set
// on the GreenAPI instance. That is one deliberate outage, announced in the
// log, against an open door nobody would notice.
//
// Comparison is constant-time on equal-length inputs; a length mismatch is
// refused without comparing, which leaks only the length of a 43-character
// random string.

import { timingSafeEqual } from "node:crypto";

export const WEBHOOK_SECRET_ENV = "GREENAPI_WEBHOOK_SECRET";

let warnedMissing = false;

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Every place the secret may be presented, in the order checked.
 * @param {Request} request
 * @returns {string[]}
 */
function presentedSecrets(request) {
  const out = [];
  const auth = request.headers?.get?.("authorization") || "";
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    out.push(m ? m[1].trim() : auth.trim());
  }
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("token");
    if (q) out.push(q);
  } catch {
    /* no URL on the request - nothing to read */
  }
  return out;
}

/**
 * True only when the request carries the configured secret.
 * @param {Request} request
 * @param {{ env?: Record<string, string | undefined>, log?: { error: Function } }} [opts]
 *   injected for tests; production reads process.env and console.
 * @returns {boolean}
 */
export function isAuthorizedWebhook(request, opts = {}) {
  const env = opts.env || process.env;
  const log = opts.log || console;
  const secret = String(env[WEBHOOK_SECRET_ENV] || "").trim();
  if (!secret) {
    if (!warnedMissing) {
      warnedMissing = true;
      log.error(
        `[whatsapp-webhook] ${WEBHOOK_SECRET_ENV} is not set: every inbound webhook is REFUSED ` +
          `until it is. Set it in Vercel and as the webhook URL token on the GreenAPI instance.`
      );
    }
    return false;
  }
  return presentedSecrets(request).some((candidate) => safeEqual(candidate, secret));
}

/** For tests: forget that the missing-secret warning was already printed. */
export function _resetWarning() {
  warnedMissing = false;
}

/** The 401 every unauthorised delivery gets. Same body for every reason. */
export function webhookUnauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

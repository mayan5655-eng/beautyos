// lib/cronAuth.js
// Shared authorization guard for the Vercel Cron endpoints that fan WhatsApp
// out to EVERY tenant (send-reminders, send-smart-reminders, the evening
// summary, the receipt retry, invariants, the demo reset). Without this the
// routes are publicly triggerable and anyone hitting the URL fires a mass send
// across all businesses.
//
// A request is authorized ONLY if it presents the shared secret:
//   • `Authorization: Bearer <CRON_SECRET>` - Vercel Cron injects exactly this
//     header on every invocation when the CRON_SECRET env var is set on the
//     project (it is, in production); or, as a convenience for running a job by
//     hand, `x-cron-secret: <CRON_SECRET>`.
//
// What this file used to do, and must not do again: it also accepted any
// request carrying an `x-vercel-cron` header, on the belief that Vercel strips
// that header from inbound external traffic. It does not. On 2026-10-05 an
// unauthenticated request with `x-vercel-cron: 1` - and `x-vercel-cron: 0` -
// was answered 200 by production. A header anyone can type proves nothing about
// who sent the request; only knowing the secret does. See test-cron-auth.js.
//
// Fail-closed: if CRON_SECRET is unset or empty, NOTHING is authorized.
import { timingSafeEqual } from "node:crypto";

// Constant-time comparison, so the secret cannot be recovered a byte at a time
// from response timing. Different lengths are simply not equal.
function sameSecret(presented, secret) {
  const a = Buffer.from(String(presented));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorizedCron(request) {
  const headers = request && request.headers;
  if (!headers || typeof headers.get !== "function") return false;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ") && sameSecret(authHeader.slice(7), secret)) return true;

  const custom = headers.get("x-cron-secret");
  if (custom && sameSecret(custom, secret)) return true;

  return false;
}

export function cronUnauthorized() {
  return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

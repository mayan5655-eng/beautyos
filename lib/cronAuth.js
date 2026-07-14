// lib/cronAuth.js
// Shared authorization guard for the Vercel Cron endpoints that fan WhatsApp
// out to EVERY tenant (send-reminders, send-smart-reminders). Without this,
// the routes are publicly triggerable and anyone hitting the URL fires a mass
// send across all businesses.
//
// A request is authorized if EITHER:
//   • it presents the shared secret as `Authorization: Bearer <CRON_SECRET>`
//     (Vercel Cron injects exactly this header when the CRON_SECRET env var is
//     set on the project), or, as a convenience, `x-cron-secret: <CRON_SECRET>`;
//   • OR it carries Vercel's own `x-vercel-cron` header, which Vercel sets only
//     on its internal cron invocations and strips from inbound external requests.
//
// Fail-closed: if CRON_SECRET is unset, only the Vercel cron header is accepted,
// so an external caller is never authorized by a missing/empty secret.
export function isAuthorizedCron(request) {
  const headers = request && request.headers;
  if (!headers) return false;

  // Vercel's internal cron marker (present only on platform-issued cron calls).
  if (headers.get("x-vercel-cron")) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = headers.get("authorization") || "";
  if (authHeader === `Bearer ${secret}`) return true;
  if (headers.get("x-cron-secret") === secret) return true;

  return false;
}

// Standard 401 for an unauthorized cron trigger.
export function cronUnauthorized() {
  return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

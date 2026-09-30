// lib/greenApi/health.ts
//
// Is the platform's shared GreenAPI instance actually logged in to WhatsApp
// right now? Separate from lib/whatsapp.js's resolveCredentials(), which only
// checks that the two env vars exist. GreenAPI's own /sendMessage endpoint
// returns 200 and a real idMessage even when the underlying WhatsApp session
// is logged out (stateInstance = notAuthorized) - "the API accepted it" has
// never meant "a person is going to see it". This is the one check that asks
// GreenAPI itself, not our own database agreeing with itself.
//
// Confirmed by hand 2026-10-01: instance 7107629829 read notAuthorized while
// 12 consecutive nightly alerts sat logged "sent" and none arrived. This is
// what would have caught that the same day, not twelve days later - see
// app/dashboard/admin/page.tsx (the loud banner) and
// app/api/invariants/route.js (the nightly check).

const DEFAULT_API_URL = "https://api.green-api.com";

export type InstanceState =
  | { ok: true; authorized: boolean; stateInstance: string }
  | { ok: false; error: string };

/** GreenAPI's own answer to "is this WhatsApp session logged in". */
export async function checkInstanceState(): Promise<InstanceState> {
  const idInstance = process.env.GREENAPI_ID_INSTANCE;
  const apiToken = process.env.GREENAPI_API_TOKEN;
  if (!idInstance || !apiToken) {
    return { ok: false, error: "GreenAPI credentials are not configured" };
  }
  const apiUrl = process.env.GREENAPI_API_URL || DEFAULT_API_URL;
  const url = `${apiUrl}/waInstance${idInstance}/getStateInstance/${apiToken}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = JSON.parse(text);
    const stateInstance = String(data?.stateInstance || "unknown");
    return { ok: true, authorized: stateInstance === "authorized", stateInstance };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

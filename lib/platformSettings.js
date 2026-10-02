// lib/platformSettings.js
//
// One platform-wide row (supabase/migrations/pending/whatsapp-manual-mode.sql),
// read by sendWhatsApp() to decide whether utility WhatsApp types may send
// automatically through the central number, and written by the admin panel's
// toggle. Deliberately NOT an env var: she needs to flip this the moment the
// SIM is authorized, or instantly back off if it gets restricted, without
// waiting on a redeploy.
//
// Fails CLOSED (returns false - manual) on any error, including the table not
// existing yet: this migration is handed over, not run by this session, and
// "the switch is missing" must default to the safe side, not the automatic
// one. Compare lib/outboundCap.js, which fails OPEN for a cost control - this
// is a ban-risk control, and the two are not the same kind of failure.

let cached = null;
let cachedAt = 0;
const TTL_MS = 15_000; // one send burst shouldn't mean one query per message

export async function isUtilityAutoSendEnabled(db) {
  const now = Date.now();
  if (cached !== null && now - cachedAt < TTL_MS) return cached;
  try {
    const { data, error } = await db
      .from("platform_settings")
      .select("whatsapp_auto_utility_enabled")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) {
      console.error("[platformSettings] read failed, defaulting to manual:", error?.message || "no row");
      cached = false;
    } else {
      cached = data.whatsapp_auto_utility_enabled === true;
    }
  } catch (e) {
    console.error("[platformSettings] read threw, defaulting to manual:", e?.message || String(e));
    cached = false;
  }
  cachedAt = now;
  return cached;
}

// Called by the admin toggle's own write. Only clears THIS process's cache -
// serverless functions don't share memory across instances, so the real
// propagation bound is the 15s TTL above, not this call. Worth having anyway
// for any instance that does happen to serve both requests.
export function invalidatePlatformSettingsCache() {
  cached = null;
  cachedAt = 0;
}

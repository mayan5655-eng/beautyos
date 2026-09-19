// lib/settingsColumns.ts
//
// The one list of settings columns a tenant may write, and the function that
// reduces any client payload to exactly those.
//
// ── Why a list ──────────────────────────────────────────────────────────────
// The settings save used to be `update({...editSettings})`: the whole row the
// browser had read, minus four keys, written back. Whatever else was on the
// row went with it. That let any signed-up tenant write, on her OWN row:
//
//   green_api_instance    the key the WhatsApp webhook uses to map an inbound
//                         message to a tenant - write another tenant's id here
//                         and the lookup, which took the first row it found,
//                         could route the other tenant's conversations to her
//   lead_api_key_hash     bypassing /api/settings/lead-key, the "only path"
//   automations.feature_flags   self-enabling the hidden stub tabs
//
// and anything a future migration adds, whether or not it should be hers.
//
// The fix is a server route (app/api/settings/save) that accepts only the
// keys below, and an SQL grant change that stops the browser writing the
// table at all (supabase/migrations/add_settings_write_guard.sql). This file
// is what both agree on. A column not here cannot be written by a tenant,
// full stop; adding one is a deliberate edit to this list.
//
// ── What is NOT here, and why ──────────────────────────────────────────────
//   id, created_at, tenant_id      identity - the server stamps tenant_id
//   green_api_instance, _url, _id  per-tenant instances are dead by decision
//                                  (lib/whatsapp.js); legacy rows keep theirs,
//                                  nothing new writes them, only SQL can
//   green_api_token,
//   green_api_token_encrypted      written only by /api/settings/whatsapp
//   lead_api_key_hash              written only by /api/settings/lead-key
//   automations.feature_flags      platform-controlled (lib/featureFlags.ts);
//                                  preserved across saves by the route, never
//                                  taken from the client
//   facebook_*                     legacy columns nothing writes

export const SETTINGS_EDITABLE_COLUMNS = [
  // Identity she shows clients
  'business_name',
  'therapist_name',
  'business_phone',
  'primary_color',
  'branding',
  'review_url',
  // Hours: the per-day map and the legacy trio derived from it
  'business_hours',
  'working_days',
  'working_hours_start',
  'working_hours_end',
  // Tax
  'business_tax_status',
  // Automation toggles
  'bot_active',
  'bot_mode',
  'gap_fill_enabled',
  'send_receipt_auto',
  'reminders_enabled',
  'review_requests_enabled',
  'winback_enabled',
  'package_reminders_enabled',
  // Structured config
  'automations',
  'faq',
] as const;

export type SettingsEditableColumn = (typeof SETTINGS_EDITABLE_COLUMNS)[number];

const EDITABLE = new Set<string>(SETTINGS_EDITABLE_COLUMNS);

// Keys inside `automations` that belong to the platform, not the tenant.
export const AUTOMATIONS_PROTECTED_KEYS = ['feature_flags'] as const;

export type PickedSettings = {
  /** Exactly the editable columns that were present in the input. */
  payload: Record<string, unknown>;
  /** Every input key that was refused, for the log. Never for the client. */
  dropped: string[];
};

/**
 * Reduce a client payload to the writable columns.
 *
 * - Unknown and protected top-level keys are dropped and named in `dropped`.
 * - `bot_active` is normalised the way the old save did: anything but a
 *   literal false / "false" is true.
 * - `automations`, if present and an object, loses its protected keys. The
 *   route re-attaches the stored ones so a save never erases a flag set by
 *   SQL; this function only guarantees the CLIENT's value is not the source.
 * - A non-object `automations` (a string, null) is dropped rather than
 *   written: the readers all guard on typeof === 'object', and a null here
 *   would erase lead templates, the pause switch and the quiet stamps at once.
 */
export function pickSettingsPayload(input: unknown): PickedSettings {
  const payload: Record<string, unknown> = {};
  const dropped: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { payload, dropped: ['(not an object)'] };
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!EDITABLE.has(key)) {
      dropped.push(key);
      continue;
    }
    if (key === 'automations') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        dropped.push('automations (not an object)');
        continue;
      }
      const autos: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const k of AUTOMATIONS_PROTECTED_KEYS) {
        if (k in autos) {
          delete autos[k];
          dropped.push(`automations.${k}`);
        }
      }
      payload.automations = autos;
      continue;
    }
    if (key === 'bot_active') {
      payload.bot_active = !(value === false || value === 'false');
      continue;
    }
    payload[key] = value;
  }
  return { payload, dropped };
}

/**
 * Carry the platform-owned automation keys from the stored row onto a payload
 * about to be written, so a save can never drop them. Pure; the route calls
 * it with the row it just read.
 */
export function preserveProtectedAutomations(
  payload: Record<string, unknown>,
  stored: unknown
): Record<string, unknown> {
  if (!('automations' in payload)) return payload;
  const storedAutos =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const next = { ...(payload.automations as Record<string, unknown>) };
  for (const k of AUTOMATIONS_PROTECTED_KEYS) {
    if (k in storedAutos) next[k] = storedAutos[k];
  }
  return { ...payload, automations: next };
}

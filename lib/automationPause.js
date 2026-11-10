// lib/automationPause.js
//
// Her master switch for every automation (Settings: "השהיית אוטומציות", automations.paused). One definition, used by the
// daily reminders, the smart reminders and the automatic WhatsApp messages (lib/waCloud/auto.ts), so no sender can
// read it differently.
//
// Fails OPEN on purpose: only a literal true pauses, so a missing column or malformed JSONB can never silently stop a
// paying tenant's messages.

/** @param {{ automations?: unknown } | null | undefined} settingsRow */
export function automationsPaused(settingsRow) {
  const a = settingsRow && typeof settingsRow === 'object' ? settingsRow.automations : null;
  return !!(a && typeof a === 'object' && !Array.isArray(a) && /** @type {{ paused?: unknown }} */ (a).paused === true);
}

/**
 * Her appointment-reminder switch (settings.reminders_enabled), read exactly as the daily reminders read it: only a
 * literal false turns reminders off; a missing column or value leaves them on. Reminders only: booking confirmations
 * have no flag of their own. Used by the daily reminders and the automatic WhatsApp reminders (autoRun + the auto gate).
 * @param {{ reminders_enabled?: unknown } | null | undefined} settingsRow
 */
export function remindersEnabled(settingsRow) {
  return !(settingsRow && typeof settingsRow === 'object' && /** @type {{ reminders_enabled?: unknown }} */ (settingsRow).reminders_enabled === false);
}

// lib/waCloud/autoVisible.js
//
// Browser-safe, no imports. Decides whether her settings show ANYTHING about automatic WhatsApp reminders.
// Owner's rule: nothing that is not active is shown. So only an explicit { available: true } from /api/wa-auto/status
// (which answers true only when WA_AUTO_ENABLED=true, live mode and every credential are set) renders the row.
// Unconfigured, dry run, kill switch on, still loading, a failed fetch, junk: nothing renders, no teaser of any kind.

/** @param {unknown} status */
export function autoSettingVisible(status) {
  return !!status && typeof status === "object" && /** @type {{ available?: unknown }} */ (status).available === true;
}

/** The lead-time choices she can pick from (hours before the visit). Mirrors LEAD_HOUR_CHOICES in autoConfig.ts. */
export const LEAD_CHOICES = [24, 48];

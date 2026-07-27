// lib/skinFollowup.js
// Turns a client's EXISTING skin-scan trend (from lib/skinHistory) into a short,
// non-alarming, editable WhatsApp follow-up SUGGESTION. It only proposes — it
// never sends, never persists, and never exposes scores or scan detail in the
// message. Pure/dependency-free CommonJS so it can be unit-tested offline and
// reused by the automation route.
//
// This is guidance, not a medical diagnosis: messages only invite the client to
// consider a follow-up, framed around "recent progress", never a finding.

import { analyzeClientSkinHistory } from "./skinHistory";

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// Hebrew (clinic default language) message templates per trigger. Short,
// friendly, non-alarming, and free of any score/concern detail.
export function buildMessage(reason, name /*, lang */) {
  const n = firstName(name);
  const hi = n ? `היי ${n}, ` : "היי, ";
  switch (reason) {
    case "regressing":
      return `${hi}לפי ההתקדמות האחרונה בעור, ייתכן שזה זמן טוב להערכת המשך. שאבדוק עבורך תורים פנויים?`;
    case "no_progress":
      return `${hi}נראה שההתקדמות בעור התייצבה לאחרונה. אשמח לקבוע הערכת המשך כדי לחדד את התוכנית — שאבדוק תורים פנויים?`;
    case "due_reassessment":
      return `${hi}עבר זמן מהבדיקה האחרונה של העור — אולי כדאי הערכת המשך. שאבדוק עבורך תורים פנויים?`;
    case "maintenance_due":
      return `${hi}מזמן לא נפגשנו לטיפול תחזוקה. שאבדוק עבורך תורים פנויים להמשך?`;
    default:
      return `${hi}אשמח לקבוע לך הערכת המשך. שאבדוק תורים פנויים?`;
  }
}

// Human-readable trigger reason shown to the cosmetician (NOT sent to the client).
const REASON_TEXT = {
  regressing: "מגמת נסיגה בעור בין הסריקות האחרונות",
  no_progress: "ללא שיפור משמעותי (פלטו) בסריקות האחרונות",
  due_reassessment: "עבר הזמן המוגדר מאז הסריקה האחרונה",
  maintenance_due: "עבר זמן רב מהביקור האחרון — ייתכן שמתאים טיפול תחזוקה",
};

// Choose at most one trigger, highest-priority first. Uses only stored signals.
export function pickReason(analysis, lastVisitDaysAgo, opts = {}) {
  const maintenanceDays = opts.maintenanceDays != null ? opts.maintenanceDays : 60;
  if (analysis.count >= 2 && analysis.trend === "regressing") return "regressing";
  if (analysis.plateaued) return "no_progress";
  if (analysis.dueForReassessment) return "due_reassessment";
  if (lastVisitDaysAgo != null && lastVisitDaysAgo >= maintenanceDays) return "maintenance_due";
  return null;
}

/**
 * Build the follow-up approval queue for one tenant.
 * @param {Object} data
 * @param {Array}  data.clients            [{id, name, phone}]
 * @param {Array}  data.scans              all tenant scans [{client_id, score, skin_type, created_at}]
 * @param {Object} [data.lastVisitByClient] map clientId -> whole days since last visit
 * @param {Object} [opts] { todayStr, reassessDays, improveThreshold, maintenanceDays, lang }
 * @returns {Array<{clientId,name,hasPhone,reason,reasonText,message}>}
 */
export function buildSkinFollowupSuggestions({ clients, scans, lastVisitByClient }, opts = {}) {
  const byClient = new Map();
  for (const s of scans || []) {
    if (!s || s.client_id == null) continue;
    const k = String(s.client_id);
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k).push(s);
  }

  const suggestions = [];
  for (const c of clients || []) {
    const k = String(c.id);
    const arr = byClient.get(k);
    if (!arr || !arr.length) continue; // only clients who actually have scan history
    const analysis = analyzeClientSkinHistory(arr, opts);
    const lastVisitDaysAgo =
      lastVisitByClient && lastVisitByClient[k] != null ? lastVisitByClient[k] : null;
    const reason = pickReason(analysis, lastVisitDaysAgo, opts);
    if (!reason) continue;
    suggestions.push({
      clientId: k,
      name: c.name || null,
      hasPhone: !!(c.phone && String(c.phone).trim()),
      reason,
      reasonText: REASON_TEXT[reason] || reason,
      message: buildMessage(reason, c.name, opts.lang),
      // Intentionally NO score / concern detail — privacy by default.
    });
  }
  return suggestions;
}

export { REASON_TEXT };

// lib/skinHistory.js
// The shared "skin intelligence" layer: turns the EXISTING per-client skin_scans
// history (client_id, score, skin_type, created_at, report) into trends the rest
// of BloomOS can reason over — the Advisor, reminders, marketing, WhatsApp.
//
// It only READS data that skin scanning already stores; it never writes, never
// overwrites history, and produces AGGREGATE guidance (not a medical diagnosis).
// Dependency-free CommonJS on purpose so it can be unit-tested offline and
// imported by any server route.

// Whole days between two date-ish strings ("YYYY-MM-DD" or ISO). Null if unparseable.
function daysBetween(fromStr, toStr) {
  const a = new Date(String(fromStr || "").slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(String(toStr || "").slice(0, 10) + "T00:00:00Z").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function sortByDateAsc(scans) {
  return (scans || [])
    .filter((s) => s && s.created_at != null && s.score != null && Number.isFinite(Number(s.score)))
    .slice()
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
}

/**
 * Analyze ONE client's scan history into a compact trend summary.
 * @param {Array} scans  Rows for a single client: {score, skin_type, created_at}.
 * @param {Object} [opts] { todayStr, reassessDays=30, improveThreshold=5 }
 */
function analyzeClientSkinHistory(scans, opts = {}) {
  const reassessDays = opts.reassessDays != null ? opts.reassessDays : 30;
  const thr = opts.improveThreshold != null ? opts.improveThreshold : 5;
  const sorted = sortByDateAsc(scans);
  const count = sorted.length;
  if (count === 0) return { count: 0, trend: "none" };

  const latest = sorted[count - 1];
  const first = sorted[0];
  const prev = count >= 2 ? sorted[count - 2] : null;
  const latestScore = Number(latest.score);
  const delta = prev ? latestScore - Number(prev.score) : null;
  const totalDelta = latestScore - Number(first.score);

  let trend = "insufficient"; // <2 scans → not enough to compare
  if (delta != null) {
    if (delta >= thr) trend = "improving";
    else if (delta <= -thr) trend = "regressing";
    else trend = "stable";
  }

  const daysSinceLast = opts.todayStr ? daysBetween(latest.created_at, opts.todayStr) : null;
  const dueForReassessment = daysSinceLast != null && daysSinceLast >= reassessDays;

  // "Stopped improving": ≥3 scans where the last two step-changes are both small.
  let plateaued = false;
  if (count >= 3) {
    const d1 = Number(sorted[count - 1].score) - Number(sorted[count - 2].score);
    const d2 = Number(sorted[count - 2].score) - Number(sorted[count - 3].score);
    plateaued = Math.abs(d1) < thr && Math.abs(d2) < thr;
  }

  return {
    count,
    latestScore,
    delta,
    totalDelta,
    trend,
    latestDate: String(latest.created_at).slice(0, 10),
    daysSinceLast,
    dueForReassessment,
    plateaued,
    skinType: latest.skin_type || null,
  };
}

/**
 * Roll up a tenant's scans into cohort COUNTS for the Advisor / marketing.
 * Aggregate only — no per-client PII or scan detail leaves this function.
 * @param {Array} scans  All tenant scans: {client_id, score, skin_type, created_at}.
 * @param {Object} [opts] passed through to analyzeClientSkinHistory.
 */
function summarizeTenantSkinTrends(scans, opts = {}) {
  const byClient = new Map();
  for (const s of scans || []) {
    if (!s || s.client_id == null) continue;
    const k = String(s.client_id);
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k).push(s);
  }
  let clientsWithScans = 0, regressing = 0, improving = 0, plateaued = 0, dueForReassessment = 0;
  for (const arr of byClient.values()) {
    const a = analyzeClientSkinHistory(arr, opts);
    if (a.count === 0) continue;
    clientsWithScans++;
    if (a.trend === "regressing") regressing++;
    if (a.trend === "improving") improving++;
    if (a.plateaued) plateaued++;
    if (a.dueForReassessment) dueForReassessment++;
  }
  return {
    totalScans: (scans || []).length,
    clientsWithScans,
    regressing,
    improving,
    plateaued,
    dueForReassessment,
  };
}

module.exports = { analyzeClientSkinHistory, summarizeTenantSkinTrends, daysBetween };

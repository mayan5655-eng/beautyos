// lib/results.js
//
// Pure helpers for treatment results (the client photos on the public page).
// The consent rule lives in the database (supabase/migrations/add_treatment_results.sql);
// consentComplete() is the SAME rule for the form, so the button can say why it
// is disabled instead of the save failing.

const UNGROUPED = "תוצאות נוספות";

/** Consent is complete when who, when and the confirmation are all present. */
export function consentComplete(d) {
  if (!d) return false;
  const name = String(d.consentName || "").trim();
  const on = String(d.consentGivenOn || "").trim();
  return !!(name && /^\d{4}-\d{2}-\d{2}$/.test(on) && d.consentConfirmed === true);
}

/** What is still missing before a result can be published, in her words. */
export function publishBlockers(d) {
  const out = [];
  if (!String(d?.afterUrl || "").trim()) out.push("תמונת אחרי");
  if (!String(d?.serviceName || "").trim()) out.push("הטיפול");
  if (!String(d?.consentName || "").trim()) out.push("שם הלקוחה");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d?.consentGivenOn || "").trim())) out.push("מתי הסכימה");
  if (d?.consentConfirmed !== true) out.push("הסכמת הלקוחה");
  return out;
}

/** Rows from get_public_results, cleaned. A result with no after photo is not one. */
export function cleanPublicResults(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r.after_url === "string" && r.after_url.trim())
    .map((r) => ({
      id: String(r.id || ""),
      serviceId: r.service_id ? String(r.service_id) : "",
      serviceName: String(r.service_name || "").trim(),
      before: typeof r.before_url === "string" && r.before_url.trim() ? r.before_url.trim() : "",
      after: r.after_url.trim(),
      caption: String(r.caption || "").trim(),
      sessions: Number.isInteger(r.sessions) && r.sessions > 0 ? r.sessions : null,
    }));
}

/** Does this result belong to this service? By id when it has one, else by name. */
export function resultMatchesService(result, service) {
  if (!result || !service) return false;
  if (result.serviceId && service.id != null) return result.serviceId === String(service.id);
  const a = result.serviceName.trim();
  return !!a && a === String(service.name || "").trim();
}

export function resultsForService(results, service) {
  return (results || []).filter((r) => resultMatchesService(r, service));
}

/**
 * Groups for the results section: one per treatment, in the order the menu
 * lists them, then any result whose treatment is no longer on the menu, then
 * the unnamed ones. Each group carries an anchor key the service cards link to.
 */
export function groupResults(results, services) {
  const groups = [];
  const used = new Set();
  for (const s of services || []) {
    const items = (results || []).filter((r) => resultMatchesService(r, s));
    if (!items.length) continue;
    items.forEach((r) => used.add(r.id || r));
    groups.push({ key: "svc-" + String(s.id ?? s.name), name: String(s.name || ""), items });
  }
  const rest = (results || []).filter((r) => !used.has(r.id || r));
  const byName = new Map();
  for (const r of rest) {
    const n = r.serviceName || UNGROUPED;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  }
  for (const [name, items] of byName) groups.push({ key: "name-" + name, name, items });
  return groups;
}

/** The anchor key a service card should link to, or null when it has no results. */
export function groupKeyForService(groups, service) {
  const g = (groups || []).find((x) => x.key === "svc-" + String(service?.id ?? service?.name));
  return g ? g.key : null;
}

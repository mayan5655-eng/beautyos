// lib/leads.js
// Shared "skin-scanner lead" upsert, used by the public scanner endpoints:
//   • /api/skin-scan/send  — when she asks for the report on WhatsApp
//   • /api/skin-scan/lead  — when she proceeds from the scanner to Book
// De-duplicates by (tenant_id, phone) so re-scans / booking clicks update ONE
// lead instead of piling up, and never downgrades a status the owner already
// advanced (e.g. "closed") back to "new".
//
// MUST be called with a SERVICE-ROLE Supabase client — the leads table is
// RLS-protected and the scanner callers are anonymous.
export async function upsertScanLead(supabase, { tenantId, name, phone, report }) {
  if (!tenantId || !phone) return;
  const r = report || {};
  const leadCore = {
    tenant_id: tenantId,
    name: name || "לקוחה מסורק העור",
    phone,
    source: "סורק העור",
    service_interest: r.matched_service || r.clinical_treatment || "",
    // Keep the rich scan context for the lead detail view.
    raw_form_data: {
      source: "skin_scanner",
      phone,
      score: r.score,
      skin_type: r.skin_type,
      recommended_treatment: r.clinical_treatment || "",
    },
  };
  const { data: existing } = await supabase
    .from("leads")
    .select("id, status, name")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .limit(1);
  if (existing && existing.length > 0) {
    const keepStatus = existing[0].status && existing[0].status !== "new" ? existing[0].status : "new";
    // Her lead keeps the name she (or the person) already has: a scan must not rename someone.
    const keepName = existing[0].name && existing[0].name !== "לקוחה מסורק העור" ? existing[0].name : leadCore.name;
    await supabase.from("leads").update({ ...leadCore, name: keepName, status: keepStatus }).eq("id", existing[0].id);
  } else {
    await supabase.from("leads").insert({ ...leadCore, status: "new", received_at: new Date().toISOString() });
  }
}

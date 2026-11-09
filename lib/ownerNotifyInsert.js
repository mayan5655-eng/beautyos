// lib/ownerNotifyInsert.js
//
// SERVER ONLY. The owner_notifications insert behind lib/ownerNotify.js, split out so the dedupe rule is testable with a fake db.
//
// onceForAppointment (private-note notifications, kind visit_feedback): add_visit_feedback_2026-11-09.sql puts a unique index on
// (tenant_id, appointment_id, kind), so a second notification for the same visit is refused with 23505. A refusal is trusted as
// "already told" ONLY when this tenant's own row for that appointment and kind is really there. Anything else (a row that does
// not belong to this tenant, a failed lookup) never silences a genuine alert: the caller still sends the push.

/** @returns {Promise<{ row: { id: string } | null, duplicate: boolean, error: any }>} */
export async function insertOwnerNotification(db, { tenantId, kind, title, body, appointmentId }, { onceForAppointment = false } = {}) {
  const { data: row, error } = await db
    .from("owner_notifications")
    .insert({ tenant_id: tenantId, kind, title, body, appointment_id: appointmentId || null })
    .select("id")
    .maybeSingle();
  if (!error) return { row: row || null, duplicate: false, error: null };
  if (onceForAppointment && error.code === "23505" && appointmentId) {
    const mine = await db.from("owner_notifications").select("id")
      .eq("tenant_id", tenantId).eq("appointment_id", appointmentId).eq("kind", kind).limit(1);
    if (!mine.error && (mine.data || []).length > 0) return { row: mine.data[0], duplicate: true, error: null };
    console.warn("[ownerNotify] a duplicate was reported but this business has no such notification; alerting anyway");
  }
  return { row: null, duplicate: false, error };
}

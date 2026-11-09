// lib/visitFeedbackWrite.js
//
// SERVER ONLY. The write behind POST /api/reviews/feedback: one row per visit in public.visit_feedback, and ONE private note.
// Split out of the route so the race can be tested with a fake database (test-reviews-monthly-report.ts).
//
// ── Why every write returns its rows ───────────────────────────────────────────────────────────────────────────────────
// Two submissions of the same link can arrive together. Both read "no note yet", then both write. The database decides who
// wins: the unique index on appointment_id lets one insert through, and `.is("body", null)` lets one update set the note
// (Postgres re-checks the condition after the row lock, so the second update matches zero rows, WITHOUT an error). So the
// result of a write is the rows it actually changed, never the snapshot read before it. Only the request whose own write
// stored its own words is told `noteCommitted`, and only that one notifies the owner. The loser answers `already`.

/**
 * @returns {Promise<{ status: 'saved' | 'already' | 'error', noteCommitted?: boolean, error?: { message?: string, code?: string }, missingTable?: boolean }>}
 */
export async function saveVisitFeedback(admin, appt, mood, text, { isMissingTable = () => false, nowIso = new Date().toISOString() } = {}) {
  const prev = await admin.from("visit_feedback").select("id, mood, body").eq("appointment_id", appt.id).maybeSingle();
  if (prev.error) return { status: "error", error: prev.error, missingTable: isMissingTable(prev.error) };
  // ONE note per visit: once she has written, the link cannot rewrite it or send another notification.
  if (prev.data?.body) return { status: "already" };

  // The conditional update: never over a note, and it says which rows it changed.
  const guardedUpdate = () => {
    const patch = { mood, updated_at: nowIso };
    if (text) patch.body = text;
    return admin.from("visit_feedback").update(patch).eq("appointment_id", appt.id).eq("tenant_id", appt.tenant_id).is("body", null).select("id, body");
  };
  const committed = (rows) => !!text && (rows || []).some((r) => r && r.body === text);

  if (prev.data) {
    const u = await guardedUpdate();
    if (u.error) return { status: "error", error: u.error };
    if (!(u.data || []).length) return { status: "already" }; // a note landed in between: theirs stands
    return { status: "saved", noteCommitted: committed(u.data) };
  }

  const ins = await admin.from("visit_feedback").insert({
    tenant_id: appt.tenant_id, appointment_id: appt.id, client_id: appt.client_id || null,
    client_name: appt.name || "", mood, body: text || null,
  }).select("id, body");
  if (!ins.error) return { status: "saved", noteCommitted: committed(ins.data) };
  if (ins.error.code !== "23505") return { status: "error", error: ins.error };
  // Two taps at the same moment: the other insert won. Update theirs, unless it already carries a note.
  const u = await guardedUpdate();
  if (u.error) return { status: "error", error: u.error };
  if (!(u.data || []).length) return { status: "already" };
  return { status: "saved", noteCommitted: committed(u.data) };
}

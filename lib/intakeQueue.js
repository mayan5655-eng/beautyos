// lib/intakeQueue.js
//
// SERVER ONLY. The writes behind the intake gate (lib/intakeGate.ts): the client's pending form row, and the "send the form"
// line in HER manual send queue. `db` and `send` are passed in, so test-intake-gate.ts drives this with fakes.
//
// `send` is lib/whatsapp.js sendWhatsApp, always called with type "intake_form": not a utility type there, so it is
// ALWAYS queued as pending_manual (never sent by the system), and a demo tenant is refused before anything is written.

import { formLink, intakeFormMessage, INTAKE_MESSAGE_TYPE } from "./intakeGate.ts";

/**
 * The form this client should sign for a gated service: an already SIGNED one of that type means nothing is needed, an
 * open (pending) one is reused, otherwise one is created for her. Never throws.
 * @returns {Promise<{ state: 'signed' } | { state: 'pending', formId: string, created: boolean } | { state: 'error' }>}
 */
export async function ensureIntakeForm({ db, tenantId, clientId, clientName, formType }) {
  try {
    if (!tenantId || !clientId || !formType) return { state: "error" };
    const { data: rows, error } = await db.from("forms").select("id, status, form_type")
      .eq("tenant_id", tenantId).eq("client_id", clientId).eq("form_type", formType);
    if (error) return { state: "error" };
    if ((rows || []).some((f) => f.status === "signed")) return { state: "signed" };
    const open = (rows || []).find((f) => f.status !== "signed");
    if (open) return { state: "pending", formId: String(open.id), created: false };
    const { data: made, error: insErr } = await db.from("forms")
      .insert({ tenant_id: tenantId, client_id: clientId, client_name: clientName || null, form_type: formType, status: "pending" })
      .select("id").single();
    if (insErr || !made) return { state: "error" };
    return { state: "pending", formId: String(made.id), created: true };
  } catch {
    return { state: "error" };
  }
}

/**
 * One "send the form" line in her manual queue for this form, once: a line for the same form link already waiting (or
 * already sent by her) is not added again. Never throws.
 * @returns {Promise<'queued'|'already'|'no_phone'|'blocked'|'error'>}
 */
export async function queueIntakeMessage({ db, send, tenantId, phone, name, businessName, service, when, formId, baseUrl }) {
  try {
    if (!phone) return "no_phone";
    const url = formLink(baseUrl, formId);
    const { data: prior, error } = await db.from("whatsapp_messages").select("id, status")
      .eq("tenant_id", tenantId).eq("message_type", INTAKE_MESSAGE_TYPE).ilike("message_body", `%${formId}%`).limit(5);
    if (!error && (prior || []).some((m) => m.status !== "failed" && m.status !== "dismissed")) return "already";
    const res = await send(phone, intakeFormMessage({ name, businessName, service, when, url }), { name, type: INTAKE_MESSAGE_TYPE, tenantId });
    if (res && res.queued) return "queued";
    if (res && res.demoBlocked) return "blocked";
    return "error";
  } catch {
    return "error";
  }
}

/** Has this client been here before this date? Any earlier appointment that was not cancelled. Unreadable = "yes" (no badge). */
export async function hadEarlierVisit({ db, tenantId, clientId, beforeDate, excludeId }) {
  try {
    if (!clientId) return false;
    let q = db.from("appointments").select("id").eq("tenant_id", tenantId).eq("client_id", clientId)
      .lt("date", beforeDate).neq("confirmation_status", "cancelled").limit(2);
    const { data, error } = await q;
    if (error) return true;
    return (data || []).some((a) => String(a.id) !== String(excludeId || ""));
  } catch {
    return true;
  }
}

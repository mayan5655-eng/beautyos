// lib/booking.ts
// The single, DB-guarded appointment-insert used by every "book a specific
// whole-hour slot" path — today the WhatsApp slot-claim flow (app/api/claim),
// and next the booking concierge. Having ONE write path means the double-booking
// guarantee and the row shape can never drift between callers.
//
// The partial unique index `uniq_appt_slot_active` enforces "at most one ACTIVE
// appointment per (tenant_id, date, hour)". A 23505 unique-violation therefore
// means the slot was taken by a parallel booking (manual, online, or another
// claimant) between our availability check and our insert — reported as `taken`
// so the caller can tell the client the slot was just filled.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SlotBooking {
  tenant_id: string;
  date: string; // "YYYY-MM-DD"
  hour: number; // whole hour (schema stores whole hours)
  service?: string | null;
  duration?: number | null;
  client_id?: string | null;
  name?: string | null;
  client_phone?: string | null;
  confirmation_status?: string; // default "confirmed"
  confirmation_sent?: boolean; // default true
}

export type BookResult =
  | { ok: true }
  | { ok: false; taken: true }
  | { ok: false; error: unknown };

// Insert an appointment for a specific whole-hour slot. Behaviour is identical to
// the original claim insert (no .select()); a unique-violation surfaces as
// `taken` rather than a generic error.
export async function bookAppointmentSlot(
  admin: SupabaseClient,
  b: SlotBooking
): Promise<BookResult> {
  const { error } = await admin.from("appointments").insert({
    tenant_id: b.tenant_id,
    date: b.date,
    hour: b.hour,
    service: b.service ?? null,
    duration: b.duration ?? null,
    client_id: b.client_id ?? null,
    name: b.name ?? null,
    client_phone: b.client_phone ?? null,
    confirmation_status: b.confirmation_status ?? "confirmed",
    confirmation_sent: b.confirmation_sent ?? true,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, taken: true };
    return { ok: false, error };
  }
  return { ok: true };
}

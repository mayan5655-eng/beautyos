// lib/booking.ts
// The single, DB-guarded appointment-insert used by every "book a specific
// whole-hour slot" path — today the WhatsApp slot-claim flow (app/api/claim),
// and next the booking concierge. Having ONE write path means the double-booking
// guarantee and the row shape can never drift between callers.
//
// Two database guarantees back this up, and a violation of either means the
// slot was taken by a parallel booking (manual, online, or another claimant)
// between our availability check and our insert — reported as `taken` so the
// caller can tell the client the slot was just filled:
//
//   uniq_appt_slot_active   (23505) — at most one ACTIVE appointment per
//                                     (tenant_id, date, start_minute).
//   appointments_no_overlap (23P01) — no ACTIVE appointment may overlap
//                                     another's [start, start+duration) range.
//                                     See supabase/migrations/add_appointment_no_overlap.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { startFields } from "./apptTime.ts";

export interface SlotBooking {
  tenant_id: string;
  date: string; // "YYYY-MM-DD"
  /**
   * Start time as minutes from midnight (14:30 = 870).
   *
   * Explicitly NOT "hour or minutes, whichever it looks like": 23 would be
   * ambiguous between 23:00 and 00:23, and guessing wrong in the one shared
   * booking path is how a client ends up with an appointment at the wrong time.
   * Callers convert with lib/apptTime.
   */
  startMinute: number;
  service?: string | null;
  duration?: number | null;
  client_id?: string | null;
  name?: string | null;
  client_phone?: string | null;
  price?: number | null;
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
    // Both written during the transition: start_minute is the new truth, hour
    // keeps an older deployment reading the row correctly.
    ...startFields(b.startMinute),
    service: b.service ?? null,
    // Real numbers, not nulls: a NOT NULL on either column must not be able
    // to kill a claim, and a zero-duration row is exempt from the overlap
    // constraint - exactly where a double booking could hide.
    duration: Number(b.duration) > 0 ? Number(b.duration) : 60,
    price: Number.isFinite(Number(b.price)) ? Number(b.price) : 0,
    client_id: b.client_id ?? null,
    name: b.name ?? null,
    client_phone: b.client_phone ?? null,
    confirmation_status: b.confirmation_status ?? "confirmed",
    confirmation_sent: b.confirmation_sent ?? true,
  });

  if (error) {
    // 23505 = uniq_appt_slot_active (same start minute).
    // 23P01 = appointments_no_overlap (an overlapping range). Both mean the
    // same thing to a caller: the slot went while we were deciding.
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "23P01") return { ok: false, taken: true };
    return { ok: false, error };
  }
  return { ok: true };
}

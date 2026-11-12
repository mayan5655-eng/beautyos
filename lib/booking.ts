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
//                                     another's [start, start+duration+buffer)
//                                     range (the buffer from
//                                     add_service_buffer_2026-11-05.sql).
//                                     See supabase/migrations/add_appointment_no_overlap.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { startFields } from "./apptTime.ts";
import { apptBufferField, writeWithApptBuffer } from "./apptBuffer.ts";

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
  /**
   * Minutes kept free after this treatment (lib/serviceBuffer.ts), stored as appointments.buffer_minutes so
   * appointments_no_overlap refuses a booking that eats it, or that this one would eat (lib/apptBuffer.ts). Missing = 0.
   */
  buffer_minutes?: number | null;
  /**
   * The team calendar (lib/team.ts): the staff member this slot is booked with, already checked by the caller (lib/teamGuard.ts).
   * Written only when set: NULL (the owner) is the column's default, so a booking for the owner never names the column and works
   * before add_team_calendar_2026-11-12.sql runs.
   */
  staff_id?: string | null;
}

export type BookResult =
  | { ok: true; id: string | null }
  | { ok: false; taken: true }
  | { ok: false; error: unknown };

// Insert an appointment for a specific slot. Returns the new row's id so the
// caller can build the confirmation's cancel link; a unique-violation
// surfaces as `taken` rather than a generic error.
export async function bookAppointmentSlot(
  admin: SupabaseClient,
  b: SlotBooking
): Promise<BookResult> {
  const { data, error } = await writeWithApptBuffer({
    tenant_id: b.tenant_id,
    date: b.date,
    // Both written during the transition: start_minute is the new truth, hour
    // keeps an older deployment reading the row correctly.
    ...startFields(b.startMinute),
    // NOT NULL columns with no default (name, service, hour, duration) must
    // never receive null from this path - an offer row can legitimately lack
    // a name or service, and the claim must book anyway, not 23502.
    service: b.service || "תור",
    // Real numbers, not nulls: a NOT NULL on either column must not be able
    // to kill a claim, and a zero-duration row is exempt from the overlap
    // constraint - exactly where a double booking could hide.
    duration: Number(b.duration) > 0 ? Number(b.duration) : 60,
    price: Number.isFinite(Number(b.price)) ? Number(b.price) : 0,
    client_id: b.client_id ?? null,
    name: b.name || "לקוחה",
    client_phone: b.client_phone ?? null,
    confirmation_status: b.confirmation_status ?? "confirmed",
    confirmation_sent: b.confirmation_sent ?? true,
    // Retried once without this one column before add_service_buffer_2026-11-05.sql runs.
    ...apptBufferField(b.buffer_minutes),
    ...(b.staff_id ? { staff_id: b.staff_id } : {}),
  }, (row) => admin.from("appointments").insert(row).select("id").maybeSingle());

  if (error) {
    // 23505 = uniq_appt_slot_active (same start minute).
    // 23P01 = appointments_no_overlap (an overlapping range). Both mean the
    // same thing to a caller: the slot went while we were deciding.
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "23P01") return { ok: false, taken: true };
    return { ok: false, error };
  }
  return { ok: true, id: (data as { id?: string } | null)?.id ?? null };
}

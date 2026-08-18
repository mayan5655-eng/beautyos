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
import { startFields } from "./apptTime";

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

// app/api/claim/route.ts
// Backs the public slot-claim page (app/claim/[token]). The client here is NOT a
// logged-in user, and slot_offers has no anonymous RLS policy on purpose, so all
// access uses the service-role key and is keyed only by the secret token — the
// same trust model as app/api/confirm/route.ts.
//
// GET  /api/claim?token=...  -> details + this recipient's current outcome
// POST /api/claim { token }  -> race-safe claim ("first valid click wins")

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bookAppointmentSlot } from "@/lib/booking";
import { startMinute, fmtTime } from "@/lib/apptTime";

// Service-role client (bypasses RLS; every query is constrained by the token).
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Map an offer row to the outcome for THIS recipient. Because each recipient
// claims their own row by token, and a partial unique index allows only one
// 'claimed' row per (tenant, date, hour), the token's own status is decisive:
//   claimed             -> this person won
//   superseded/cancelled-> someone else took it
//   sent + expired      -> the offer window closed
//   sent + live         -> still available to claim
function stateOf(offer: { status: string; expires_at: string }): string {
  if (offer.status === "claimed") return "won";
  if (offer.status === "superseded" || offer.status === "cancelled") return "taken";
  const expired = new Date(offer.expires_at).getTime() <= Date.now();
  if (offer.status === "sent" && expired) return "expired";
  if (offer.status === "expired") return "expired";
  if (offer.status === "sent") return "available";
  return "taken";
}

// Look up the offer + the tenant's business name for display.
async function loadOffer(supabase: ReturnType<typeof admin>, token: string) {
  const { data: offer } = await supabase
    .from("slot_offers")
    .select("tenant_id, slot_date, slot_hour, slot_start_minute, service, client_name, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!offer) return null;

  const { data: settings } = await supabase
    .from("settings")
    .select("business_name")
    .eq("tenant_id", offer.tenant_id)
    .maybeSingle();

  return { offer, businessName: settings?.business_name || "העסק" };
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ state: "invalid" });

  const supabase = admin();
  const loaded = await loadOffer(supabase, token);
  if (!loaded) return NextResponse.json({ state: "invalid" });

  const { offer, businessName } = loaded;
  return NextResponse.json({
    state: stateOf(offer),
    service: offer.service,
    slotDate: offer.slot_date,
    slotHour: offer.slot_hour,   // kept for older clients
    slotTime: fmtTime(startMinute({ start_minute: offer.slot_start_minute, hour: offer.slot_hour })),
    clientName: offer.client_name,
    businessName,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ state: "invalid" });

  const supabase = admin();
  const nowIso = new Date().toISOString();

  // Race-safe claim: only a still-'sent', not-yet-expired row flips to 'claimed'.
  // If two recipients of the SAME slot click together, both pass this WHERE (they
  // are different rows), but the partial unique index uniq_slot_offer_claimed lets
  // only one COMMIT — the loser gets a 23505 unique violation, i.e. "taken".
  const { data: claimed, error: claimErr } = await supabase
    .from("slot_offers")
    .update({ status: "claimed", claimed_at: nowIso })
    .eq("token", token)
    .eq("status", "sent")
    .gt("expires_at", nowIso)
    .select("tenant_id, slot_date, slot_hour, slot_start_minute, service, duration, client_id, client_name, phone")
    .maybeSingle();

  // Lost the race (another sibling committed 'claimed' for this slot first).
  if (claimErr && (claimErr as { code?: string }).code === "23505") {
    await supabase.from("slot_offers")
      .update({ status: "superseded" })
      .eq("token", token).eq("status", "sent");
    return NextResponse.json({ state: "taken" });
  }
  if (claimErr) {
    return NextResponse.json({ state: "error" }, { status: 500 });
  }

  // WHERE matched nothing -> this row was already taken or expired. Re-read to
  // tell the client which.
  if (!claimed) {
    const loaded = await loadOffer(supabase, token);
    return NextResponse.json({ state: loaded ? stateOf(loaded.offer) : "invalid" });
  }

  // Won. Book the appointment for this client via the shared, DB-guarded booking
  // path (also used by the concierge). The partial unique index
  // uniq_appt_slot_active guards against a parallel manual/online booking of the
  // same slot; if that fires, the slot was really taken -> undo our claim.
  // slot_start_minute is the truth; slot_hour*60 covers offers written before
  // the migration or by an older deployment.
  const claimedStart = startMinute({
    start_minute: claimed.slot_start_minute,
    hour: claimed.slot_hour,
  });
  if (claimedStart === null) {
    return NextResponse.json({ state: "error" }, { status: 500 });
  }

  // The price comes from HER menu at claim time - slot_offers does not carry
  // one, and the client controls nothing here. Best-effort: an unfindable
  // service books at 0 rather than failing the claim.
  let claimPrice = 0;
  if (claimed.service) {
    const { data: svc } = await supabase
      .from("service_prices")
      .select("price")
      .eq("tenant_id", claimed.tenant_id)
      .eq("name", claimed.service)
      .maybeSingle();
    if (svc && Number.isFinite(Number(svc.price))) claimPrice = Number(svc.price);
  }

  const booked = await bookAppointmentSlot(supabase, {
    tenant_id: claimed.tenant_id,
    date: claimed.slot_date,
    startMinute: claimedStart,
    service: claimed.service,
    duration: claimed.duration,
    client_id: claimed.client_id,
    name: claimed.client_name,
    client_phone: claimed.phone,
    price: claimPrice,
  });

  if (!booked.ok) {
    if ("taken" in booked) {
      await supabase.from("slot_offers")
        .update({ status: "superseded" })
        .eq("token", token);
      return NextResponse.json({ state: "taken" });
    }
    // A non-race failure - a missing column, a NOT NULL, a constraint. This
    // was previously returned as a generic error with no trace: the exact
    // silent shape that hid a mismatched table for days.
    console.error("[claim] booking insert FAILED:", JSON.stringify("error" in booked ? booked.error : booked));
    return NextResponse.json({ state: "error" }, { status: 500 });
  }

  // Retire the other recipients' offers for this slot (best effort).
  // Keyed on the exact start rather than the hour: once slots can be half past,
  // two different offers can share an hour, and retiring by hour would cancel a
  // 14:30 offer because someone claimed 14:00.
  await supabase.from("slot_offers")
    .update({ status: "superseded" })
    .eq("tenant_id", claimed.tenant_id)
    .eq("slot_date", claimed.slot_date)
    .eq("slot_start_minute", claimedStart)
    .eq("status", "sent");

  return NextResponse.json({
    state: "won",
    service: claimed.service,
    slotDate: claimed.slot_date,
    slotHour: claimed.slot_hour,      // kept for older clients
    slotTime: fmtTime(claimedStart),  // "14:30"
    clientName: claimed.client_name,
  });
}

// lib/greenApi/deliveryStatus.ts
//
// GreenAPI's own status vocabulary, from its outgoingMessageStatus webhook,
// mapped onto our delivery_status column. Kept as a pure function (no
// database, no fetch) so the mapping itself is provable - see
// test-greenapi-delivery-status.ts. The actual row update lives in
// app/api/whatsapp-webhook/route.js, which was the one place already
// receiving this webhook and discarding it unread.
//
// GreenAPI's own "sent" here means "their server has it, not yet delivered
// to the device" - a narrower thing than our own status='sent', which
// already means "GreenAPI's API call succeeded". Deliberately mapped to
// null (not recorded): recording it as anything would read like new
// information when it is a restatement of what we already knew the moment
// we sent it.

export type DeliveryStatus = "delivered" | "read" | "undelivered";

const FAILURE_STATUSES = new Set(["failed", "notdelivered", "noaccount", "blocked"]);

/** null = nothing worth recording (e.g. GreenAPI's own "sent" echo, or a
 *  status word we don't recognise yet - logged by the caller, not guessed at). */
export function mapGreenApiDeliveryStatus(greenApiStatus: unknown): DeliveryStatus | null {
  const s = String(greenApiStatus || "").trim().toLowerCase();
  if (s === "delivered") return "delivered";
  if (s === "read") return "read";
  if (FAILURE_STATUSES.has(s)) return "undelivered";
  return null;
}

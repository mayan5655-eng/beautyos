// app/api/send-receipt/route.js
// Sends a receipt summary to the client via WhatsApp (GreenAPI).
// Reuses the exact mechanism used for booking confirmations (lib/whatsapp.js).
// Multi-tenant: the business name is looked up per-tenant from settings, and
// every sent message is logged with the tenant_id (inside sendWhatsApp).
//
// SECURITY: tenant comes from the AUTHENTICATED session (get_user_tenant_id),
// never the request body. This route runs on the service-role key, which
// bypasses RLS entirely, so a body-supplied tenantId would have let any logged
// in user send WhatsApp from another business's GreenAPI instance, under that
// business's name, logged against that business's tenant_id. Mirrors the
// pattern in app/api/slots/offer/route.js. The client still posts a `tenantId`
// field; it is deliberately ignored.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";
import { requireActiveTenant } from "../../../lib/planGuard";
import { sendWhatsApp } from "../../../lib/whatsapp";
import { greet, lines, hebrewDate } from "../../../lib/messages.js";
import { docNameHe, PAYMENT_NOTICE_HE } from "../../../lib/legalReceipts/policy.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Identify the caller and resolve THEIR tenant. Anything the body claims
    // about which business this is, is ignored.
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json(
        { success: false, error: "לא זוהה עסק" },
        { status: 400 }
      );
    }

    // Plan gate: an expired or paused tenant cannot send real messages. Placed
    // before any sending work, so nothing goes out and no GreenAPI call is made.
    // Fails open, so it can never lock out a paying user.
    const guard = await requireActiveTenant(session);
    if (!guard.ok) return guard.response;

    const { client_name, client_phone, amount, payment_method, date, tip, payments_text, receipt_id } =
      await request.json().catch(() => ({}));

    // Only send when there is a phone number.
    if (!client_phone) {
      return Response.json(
        { success: false, error: "אין ללקוחה מספר טלפון" },
        { status: 400 }
      );
    }

    // A receipt is a utility message - the same class as a booking confirmation
    // and a reminder - and goes out from the platform number like they do
    // (lib/whatsapp.js). This route used to gate on isWhatsAppConnected, which
    // asked for a tenant-owned instance after per-tenant instances were retired,
    // so it refused every call and the "send to client" button never worked.

    // Business name from THIS tenant's settings (never trust the client).
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name")
      .eq("tenant_id", tenantId)
      .limit(1);
    const businessName =
      (settingsRows && settingsRows[0]?.business_name) || "העסק";

    // WHAT THIS IS. A payment record is an "אישור תשלום" (payment confirmation), never a "קבלה":
    // a receipt is a tax document that only a registered provider may issue. When the payment
    // has a provider document (she connected Morning), the message says what it is and links
    // the provider's PDF. Read from the database by the receipt id, never from the request:
    // the request could name any link.
    let legal = null;
    if (receipt_id) {
      const { data: rec } = await supabase
        .from("receipts")
        .select("legal_status, legal_doc_type, legal_doc_number, legal_doc_url")
        .eq("id", receipt_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (rec && rec.legal_status === "issued" && rec.legal_doc_url) legal = rec;
    }
    const title = legal
      ? `${docNameHe(legal.legal_doc_type)}${legal.legal_doc_number ? " מספר " + legal.legal_doc_number : ""} מ${businessName}`
      : `${PAYMENT_NOTICE_HE} מ${businessName}`;

    const msg = lines(
      greet(client_name),
      title,
      "",
      `סכום: ₪${amount}`,
      `תשלום: ${payment_method || "מזומן"}${payments_text ? ` (${String(payments_text).slice(0, 120)})` : ""}`,
      Number(tip) > 0 ? `טיפ: ₪${Number(tip)}` : null,
      date ? hebrewDate(date) : null,
      "",
      legal ? "המסמך:" : null,
      legal ? legal.legal_doc_url : null,
      legal ? "" : "(אישור תשלום, לא מסמך מס)",
      "",
      "תודה, ונתראה בקרוב."
    );

    const result = await sendWhatsApp(client_phone, msg, {
      name: client_name,
      type: "receipt",
      tenantId,
    });

    if (!result.ok) {
      return Response.json(
        { success: false, error: "WhatsApp send failed" },
        { status: 502 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// app/api/send-receipt/route.js
// Sends a receipt summary to the client via WhatsApp (GreenAPI).
// Reuses the exact mechanism used for booking confirmations (lib/whatsapp.js).
// Multi-tenant: the business name is looked up per-tenant from settings, and
// every sent message is logged with the tenant_id (inside sendWhatsApp).

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { tenantId, client_name, client_phone, amount, payment_method, date } =
      await request.json();

    // Tenant must be explicit — we never fall back to a default business, so a
    // receipt can't be sent under someone else's account.
    if (!tenantId) {
      return Response.json(
        { success: false, error: "חסר מזהה עסק" },
        { status: 400 }
      );
    }

    // Only send when there is a phone number.
    if (!client_phone) {
      return Response.json(
        { success: false, error: "אין ללקוחה מספר טלפון" },
        { status: 400 }
      );
    }

    // Business name from THIS tenant's settings (never trust the client).
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name")
      .eq("tenant_id", tenantId)
      .limit(1);
    const businessName =
      (settingsRows && settingsRows[0]?.business_name) || "העסק";

    const msg =
      `שלום ${client_name || "לקוחה"}! ✦\n` +
      `קבלה מ${businessName}\n\n` +
      `💰 סכום: ₪${amount}\n` +
      `💳 אמצעי תשלום: ${payment_method || "מזומן"}\n` +
      `📅 תאריך: ${date || ""}\n\n` +
      `תודה ונתראה בקרוב! 😊`;

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

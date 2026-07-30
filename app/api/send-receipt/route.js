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
import { sendWhatsApp, isWhatsAppConnected } from "../../../lib/whatsapp";

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

    const { client_name, client_phone, amount, payment_method, date } =
      await request.json().catch(() => ({}));

    // Only send when there is a phone number.
    if (!client_phone) {
      return Response.json(
        { success: false, error: "אין ללקוחה מספר טלפון" },
        { status: 400 }
      );
    }

    // If neither this tenant's own GreenAPI instance nor the global env fallback
    // is configured, it's a "not connected" state — report it explicitly
    // (notConnected) so the UI can guide her to connect WhatsApp and fall back to
    // the direct wa.me link, instead of a vague "send failed". 200 so the client
    // reads the flag from the body.
    if (!(await isWhatsAppConnected(tenantId))) {
      return Response.json(
        { success: false, notConnected: true, error: "וואטסאפ לא מחובר" },
        { status: 200 }
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

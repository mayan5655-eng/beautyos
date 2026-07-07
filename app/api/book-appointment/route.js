// app/api/book-appointment/route.js
// Handles public self-booking: saves the appointment,
// notifies the business owner AND confirms to the client (WhatsApp)
// Multi-tenant: tenant is resolved from the `tenantId` sent by the /book page
// (which reads it from the ?t= URL param). Owner phone + business name are
// looked up per-tenant from settings.

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { name, phone, service, date, hour, duration, price, color, tenantId } =
      await request.json();

    // Basic validation
    if (!name || !phone || !service || !date || hour === undefined) {
      return Response.json(
        { success: false, error: "חסרים פרטים" },
        { status: 400 }
      );
    }

    // Tenant must be explicit. We never fall back to a default business -
    // a booking with no tenant must fail rather than land in someone else's
    // account. The /book page passes ?t=<tenantId> through to here.
    if (!tenantId) {
      return Response.json(
        { success: false, error: "קישור ההזמנה אינו תקין (חסר מזהה עסק)" },
        { status: 400 }
      );
    }
    const activeTenantId = tenantId;

    // 1. Save the appointment to Supabase
    const { data: appt, error } = await supabase
      .from("appointments")
      .insert({
        tenant_id: activeTenantId,
        name: name,
        client_phone: phone,
        service: service,
        date: date,
        hour: hour,
        duration: duration || 60,
        price: price || 0,
        color: color || "#E91E63",
        self_booked: true,
        confirmation_status: "confirmed",
        confirmation_sent: true,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    // 2. Get THIS tenant's business name + owner phone from settings
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("business_name, business_phone")
      .eq("tenant_id", activeTenantId)
      .limit(1);
    const settingsRow =
      settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;
    const businessName = settingsRow?.business_name || "העסק";
    const ownerPhone = settingsRow?.business_phone || "";

    // 3. Send confirmation to the CLIENT
    try {
      const clientMsg =
        `שלום ${name}! 💗\n` +
        `התור שלך נקבע בהצלחה ב${businessName} ✨\n\n` +
        `✨ טיפול: ${service}\n` +
        `📅 תאריך: ${date}\n` +
        `🕐 שעה: ${hour}:00\n\n` +
        `נשמח לראותך! 😊`;
      await sendWhatsApp(phone, clientMsg, { name: name, type: "booking_confirm", tenantId: activeTenantId });
    } catch (waErr) {
      console.log("Client WhatsApp failed:", waErr.message);
    }

    // 4. Send alert to the BUSINESS OWNER (only if she has a phone set)
    if (ownerPhone) {
      try {
        const ownerMsg =
          `🔔 נקבע תור חדש!\n\n` +
          `👤 ${name}\n` +
          `📞 ${phone}\n` +
          `✨ ${service}\n` +
          `📅 ${date} בשעה ${hour}:00\n\n` +
          `(נקבע דרך דף ההזמנות)`;
        await sendWhatsApp(ownerPhone, ownerMsg, { name: "בעלת העסק", type: "owner_alert", tenantId: activeTenantId });
      } catch (waErr) {
        console.log("Owner WhatsApp failed:", waErr.message);
      }
    }

    return Response.json({ success: true, appointmentId: appt.id });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// app/api/book-appointment/route.js
// Handles public self-booking: saves the appointment,
// notifies the business owner AND confirms to the client (WhatsApp)

import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../../../lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The business owner's phone (receives "new booking" alerts)
const OWNER_PHONE = "0542845655";

// The business/tenant ID (which salon this booking belongs to)
const TENANT_ID = "448e9e45-2251-4572-b665-886c5bc7a4c8";

export async function POST(request) {
  try {
    const { name, phone, service, date, hour, duration, price, color } =
      await request.json();

    // Basic validation
    if (!name || !phone || !service || !date || hour === undefined) {
      return Response.json(
        { success: false, error: "חסרים פרטים" },
        { status: 400 }
      );
    }

    // 1. Save the appointment to Supabase
    const { data: appt, error } = await supabase
      .from("appointments")
      .insert({
        tenant_id: TENANT_ID,
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

    // 2. Get business name for nicer messages
    const { data: settingsRows } = await supabase.from("settings").select("business_name");
    const businessName =
      settingsRows && settingsRows.length > 0 ? settingsRows[0].business_name : "BeautyOS";

    // 3. Send confirmation to the CLIENT
    try {
      const clientMsg =
        `שלום ${name}! 💗\n` +
        `התור שלך נקבע בהצלחה ב${businessName} ✨\n\n` +
        `✨ טיפול: ${service}\n` +
        `📅 תאריך: ${date}\n` +
        `🕐 שעה: ${hour}:00\n\n` +
        `נשמח לראותך! 😊`;
      await sendWhatsApp(phone, clientMsg, { name: name, type: "booking_confirm" });
    } catch (waErr) {
      console.log("Client WhatsApp failed:", waErr.message);
    }

    // 4. Send alert to the BUSINESS OWNER
    try {
      const ownerMsg =
        `🔔 נקבע תור חדש!\n\n` +
        `👤 ${name}\n` +
        `📞 ${phone}\n` +
        `✨ ${service}\n` +
        `📅 ${date} בשעה ${hour}:00\n\n` +
        `(נקבע דרך דף ההזמנות)`;
      await sendWhatsApp(OWNER_PHONE, ownerMsg, { name: "בעלת העסק", type: "owner_alert" });
    } catch (waErr) {
      console.log("Owner WhatsApp failed:", waErr.message);
    }

    return Response.json({ success: true, appointmentId: appt.id });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

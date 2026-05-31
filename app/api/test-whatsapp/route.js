// app/api/test-whatsapp/route.js
// Test endpoint for sending a WhatsApp message

import { sendWhatsApp } from "../../../lib/whatsapp";

export async function POST(request) {
  try {
    // Get phone and message from the request
    const { phone, message } = await request.json();

    // Basic validation
    if (!phone || !message) {
      return Response.json(
        { success: false, error: "Missing phone or message" },
        { status: 400 }
      );
    }

    // Send the WhatsApp message
    const result = await sendWhatsApp(phone, message);

    // Return the result
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
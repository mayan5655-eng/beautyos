// app/api/messages/route.js
// Returns all WhatsApp messages from the log

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, messages: data });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
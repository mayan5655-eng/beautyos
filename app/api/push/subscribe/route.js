// app/api/push/subscribe/route.js
// Stores/removes a browser's push subscription for the logged-in tenant.
// lib/ownerNotify.js reads push_subscriptions by tenant_id to send a push
// alongside every owner_notifications row it writes.
//
// SECURITY: tenant comes from the AUTHENTICATED session, never the body -
// same pattern as every other route that writes tenant-scoped data here.

import { createClient as createServerClient } from "../../../../lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    const { data: tenantId } = await session.rpc("get_user_tenant_id");
    if (!tenantId) return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });

    const { subscription } = await request.json().catch(() => ({}));
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return Response.json({ success: false, error: "מנוי לא תקין" }, { status: 400 });
    }

    const { error } = await admin
      .from("push_subscriptions")
      .upsert({ tenant_id: tenantId, endpoint, p256dh, auth }, { onConflict: "endpoint" });
    if (error) {
      return Response.json({ success: false, error: "השמירה נכשלה - ודאי שמיגרציית whatsapp-manual-mode.sql רצה" }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });

    const { endpoint } = await request.json().catch(() => ({}));
    if (!endpoint) return Response.json({ success: false, error: "חסר endpoint" }, { status: 400 });

    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// app/api/whatsapp-central-status/route.ts
// Lets a logged-in tenant's Settings page ask one question: "is the central
// WhatsApp number currently on?" - so the owner-alert WhatsApp-copy toggle
// can say plainly, next to itself, when turning it on wouldn't do anything
// yet. Reads the same platform_settings row the admin panel's toggle writes
// (lib/platformSettings.js) - no tenant-specific data, no secrets, just the
// one boolean.
//
// Any authenticated tenant may call this; it is not platform-admin-gated
// like app/api/admin/whatsapp-mode, because every tenant legitimately needs
// to know this about her own Settings page, not just the platform operator.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../lib/supabase/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

  const { data, error } = await admin
    .from("platform_settings")
    .select("whatsapp_auto_utility_enabled")
    .eq("id", true)
    .maybeSingle();

  // Table missing (migration not run) or any other read error both mean
  // the same thing to a tenant: treat it as not connected, never throw.
  const connected = !error && data?.whatsapp_auto_utility_enabled === true;
  return NextResponse.json({ connected });
}

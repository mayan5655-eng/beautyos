// app/api/waitlist/join/route.js
//
// "No time that suits you? Join the waiting list" on her public booking page.
// Until now only the owner could add someone to the waitlist, so a client who
// found the week full simply left. Now she leaves her name, phone, the
// treatment and (optionally) a preferred date, and lands on the same waitlist
// the gap-fill offer reads first (app/api/slots/offer) when a slot frees up.
//
// PUBLIC and unauthenticated, like book-appointment, so it is strict:
//   - tenant from the body, but it must be a real, unblocked tenant with this
//     ACTIVE service on its menu (the page's list is not trusted);
//   - an Israeli mobile, validated the same way as a booking;
//   - rate limits per IP, per phone and per tenant (lib/rateLimit.ts);
//   - one waiting entry per phone and treatment: a second tap says "you're
//     already on the list" instead of adding a duplicate.
// Sends no WhatsApp. The owner gets an in-app note + push (lib/ownerNotify.js);
// the client is contacted only when a slot frees and the owner approves the offer.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { normalizeIsraeliMobile, PHONE_ERROR_HE } from "../../../../lib/phone";
import { checkIpLimit, checkTenantLimit, checkPhoneLimit } from "../../../../lib/rateLimit";
import { tenantIsBlocked } from "../../../../lib/tenantActive";
import { notifyOwner } from "../../../../lib/ownerNotify";
import { ACTIVE_OR_NULL } from "../../../../lib/serviceActive";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STUCK = "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע או לשלוח הודעה לעסק";
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(request) {
  try {
    const ipLimited = checkIpLimit(request, "waitlist-join");
    if (ipLimited) return ipLimited;

    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId || "");
    const name = clean(body.name, 80);
    const service = clean(body.service, 120);
    const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.preferredDate || "")) ? body.preferredDate : null;
    const note = clean(body.note, 200);

    if (!UUID.test(tenantId)) return Response.json({ success: false, error: "הקישור אינו תקין" }, { status: 400 });
    if (!name || !service) return Response.json({ success: false, error: "חסרים שם וטיפול" }, { status: 400 });
    const phoneCheck = normalizeIsraeliMobile(body.phone);
    if (!phoneCheck.ok) return Response.json({ success: false, error: PHONE_ERROR_HE[phoneCheck.reason] }, { status: 400 });

    const phoneLimited = checkPhoneLimit(phoneCheck.e164, "waitlist-join");
    if (phoneLimited) return phoneLimited;
    const tenantLimited = checkTenantLimit(tenantId, "waitlist-join");
    if (tenantLimited) return tenantLimited;

    const [svc, blocked, existing, settingsRow] = await Promise.all([
      admin.from("service_prices").select("name").eq("tenant_id", tenantId).eq("name", service).or(ACTIVE_OR_NULL).limit(1),
      tenantIsBlocked(admin, tenantId),
      admin.from("waitlist").select("id, phone").eq("tenant_id", tenantId).eq("service", service).eq("status", "waiting"),
      admin.from("settings").select("business_phone, automations").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (svc.error) { console.error("[waitlist/join] service read failed:", svc.error.message); return Response.json({ success: false, error: STUCK }, { status: 500 }); }
    if (!svc.data || !svc.data.length) return Response.json({ success: false, error: "הטיפול הזה לא זמין כרגע להרשמה" }, { status: 400 });
    if (blocked) return Response.json({ success: false, error: "אי אפשר להירשם כרגע. אפשר לשלוח הודעה לעסק." }, { status: 403 });

    const digits = (p) => String(p || "").replace(/\D/g, "").replace(/^972/, "0");
    const mine = digits(phoneCheck.e164);
    if ((existing.data || []).some((w) => digits(w.phone) === mine)) {
      return Response.json({ success: true, already: true });
    }

    // The client card, when this phone is already hers. Gap-fill reaches a waitlist entry by its phone either way.
    // By her phone, in the forms it may be stored in, instead of scanning (only) the first 1,000 clients.
    const variants = [...new Set([mine, phoneCheck.e164, `972${mine.slice(1)}`, `+972${mine.slice(1)}`])];
    const { data: clientRows } = await admin.from("clients").select("id, phone").eq("tenant_id", tenantId).in("phone", variants).limit(1);
    const client = (clientRows || [])[0] || null;

    const notes = ["נרשמה דרך דף ההזמנה", note].filter(Boolean).join(" · ");
    const { error } = await admin.from("waitlist").insert({
      tenant_id: tenantId,
      client_id: client ? client.id : null,
      client_name: name,
      phone: mine,
      service,
      preferred_date: preferredDate,
      notes,
      status: "waiting",
    });
    // 23505: a double tap raced the duplicate check above; the unique index (add_audit_fixes_2026-10-20.sql) kept one row.
    if (error && error.code === "23505") return Response.json({ success: true, already: true });
    if (error) { console.error("[waitlist/join] insert failed:", error.code || "", error.message); return Response.json({ success: false, error: STUCK }, { status: 500 }); }

    const when = preferredDate ? ` (מעדיפה ${preferredDate.split("-").reverse().join("/")})` : "";
    after(() => notifyOwner({
      tenantId, kind: "waitlist", title: "נרשמה לרשימת ההמתנה",
      body: `${name} ביקשה תור ל${service}${when}. כשיתפנה תור, היא תהיה הראשונה בהצעה.`,
      settingsRow: settingsRow?.data || null,
    }).catch((e) => console.error("[waitlist/join] owner notify failed:", e?.message || String(e))));

    return Response.json({ success: true });
  } catch (err) {
    console.error("[waitlist/join] failed:", err?.message || String(err));
    return Response.json({ success: false, error: STUCK }, { status: 500 });
  }
}

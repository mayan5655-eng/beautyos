// app/api/clients/lapsed/send/route.js
//
// POST /api/clients/lapsed/send   { clientIds: string[], message: string }
//
// Sends HER message to the lapsed clients SHE picked, then marks them so the
// automation will not message them about the same absence.
//
// ── This is a MARKETING send ───────────────────────────────────────────────
// Same rule as leads/send-bulk, and it is enforced in the same place:
// lib/whatsapp.js refuses to send for a tenant who has not connected her own
// GreenAPI instance, rather than falling back to the platform's number. A
// cosmetician's client must never receive marketing from a number that is not
// her business's.
//
// The one thing done differently from send-bulk: the connection is checked ONCE
// UP FRONT with isWhatsAppConnected, before any sending starts. send-bulk finds
// out per-message, which for a batch means N logged failures and a report full
// of "נכשל" when the real answer is a single sentence - "WhatsApp is not
// connected". Same rule, said once instead of N times.
//
// ── Batched, not one blast ─────────────────────────────────────────────────
// Chunks of CHUNK with a pause between them. This is a marketing message to
// dozens of people from one number, which is exactly the shape WhatsApp scores
// as spam. The pause is not politeness - a number that gets flagged takes her
// whole business's messaging with it.
//
// ── Marking ────────────────────────────────────────────────────────────────
// A successful send writes the winback row from lib/reminders/smartReminders,
// keyed on the client's LAST VISIT DATE. That is the same key the cron checks,
// so the automation goes quiet for this absence - and only this absence. If the
// client returns and lapses again later, the date moves, the key changes, and
// she becomes eligible again. Only successes are marked: a message that failed
// to send must not suppress the automated one.

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../../../lib/supabase/server";
import { requireActiveTenant } from "../../../../../lib/planGuard";
import { sendWhatsApp, isWhatsAppConnected } from "../../../../../lib/whatsapp";
import {
  computeLastVisits,
  winbackLogRow,
} from "../../../../../lib/reminders/smartReminders";

export const maxDuration = 300;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Recipients per chunk, and the pause between chunks. */
const CHUNK = 20;
const PAUSE_MS = 1500;
/** How many sends one request may perform. A click should not reach 2,000 people. */
const MAX_RECIPIENTS = 200;
const MAX_MESSAGE = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ success: false, error: "לא מחובר" }, { status: 401 });
    }
    const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
    if (!tenantId) {
      return Response.json({ success: false, error: "לא זוהה עסק" }, { status: 400 });
    }

    // Plan gate, same as send-bulk. Fails open so it cannot lock out a payer.
    const guard = await requireActiveTenant(supabase);
    if (!guard.ok) return guard.response;

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const clientIds = Array.isArray(body.clientIds)
      ? [...new Set(body.clientIds.filter((id) => typeof id === "string" && id))]
      : [];

    if (!message) {
      return Response.json({ success: false, error: "נא לכתוב הודעה" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE) {
      return Response.json({ success: false, error: "ההודעה ארוכה מדי" }, { status: 400 });
    }
    if (clientIds.length === 0) {
      return Response.json({ success: false, error: "לא נבחרו לקוחות" }, { status: 400 });
    }
    if (clientIds.length > MAX_RECIPIENTS) {
      return Response.json(
        { success: false, error: `אפשר לשלוח עד ${MAX_RECIPIENTS} לקוחות בפעם אחת. כדאי לשלוח בקבוצות.` },
        { status: 400 }
      );
    }

    // Her own instance, or nothing - checked once, before any work.
    if (!(await isWhatsAppConnected(tenantId))) {
      console.log(`[clients/lapsed/send] TENANT FILTER: tenant_id = ${tenantId} — refused, WhatsApp not connected`);
      return Response.json(
        {
          success: false,
          notConnected: true,
          error:
            "וואטסאפ לא מחובר לעסק שלך, ולכן אי אפשר לשלוח. " +
            "ההודעות האלה נשלחות מהמספר שלך בלבד — אפשר לחבר אותו בהגדרות > וואטסאפ.",
        },
        { status: 400 }
      );
    }

    console.log(`[clients/lapsed/send] TENANT FILTER: tenant_id = ${tenantId} (marketing send, ${clientIds.length} selected)`);

    // Re-read from the database, filtered by HER tenant. The ids from the
    // browser only ever narrow this - they can never reach another tenant's
    // client, even if the body is forged.
    const { data: clients, error: cErr } = await admin
      .from("clients")
      .select("id, name, phone")
      .eq("tenant_id", tenantId)
      .in("id", clientIds);
    if (cErr) {
      return Response.json({ success: false, error: "לא הצלחנו לטעון את הלקוחות" }, { status: 500 });
    }

    // Last visit per client, computed the same way the cron computes it, so the
    // suppression key we write is the one the cron will look for.
    const { data: appts, error: aErr } = await admin
      .from("appointments")
      .select("client_id, date, confirmation_status")
      .eq("tenant_id", tenantId);
    if (aErr) {
      return Response.json({ success: false, error: "לא הצלחנו לטעון את היסטוריית התורים" }, { status: 500 });
    }
    const lastVisits = computeLastVisits(appts);

    const recipients = (clients || []).filter((c) => c.phone);
    const skippedNoPhone = (clients || []).length - recipients.length;

    let sent = 0;
    let failed = 0;
    const results = [];
    const toMark = [];
    const chunks = [];

    for (let i = 0; i < recipients.length; i += CHUNK) {
      chunks.push(recipients.slice(i, i + CHUNK));
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      let chunkSent = 0;
      let chunkFailed = 0;
      console.log(
        `[clients/lapsed/send] TENANT FILTER: tenant_id = ${tenantId} | ` +
        `chunk ${ci + 1}/${chunks.length} | ${chunk.length} recipient(s)`
      );

      for (const client of chunk) {
        const res = await sendWhatsApp(client.phone, message, {
          name: client.name,
          type: "lapsed_manual",
          tenantId,
        });
        if (res && res.ok) {
          sent++; chunkSent++;
          // Only a real send suppresses the automation.
          toMark.push(winbackLogRow(tenantId, client.id, lastVisits[client.id]));
          results.push({ name: client.name || null, status: "נשלח" });
        } else {
          failed++; chunkFailed++;
          results.push({ name: client.name || null, status: "נכשל" });
        }
      }

      chunks[ci] = { chunk: ci + 1, attempted: chunk.length, sent: chunkSent, failed: chunkFailed };
      // Pause between chunks, but never after the last one.
      if (ci < chunks.length - 1) await sleep(PAUSE_MS);
    }

    // Mark suppressions. Never fail the response over this - the messages have
    // already gone out - but do log loudly, because a failure here means the
    // automation may message someone she just messaged herself.
    let marked = 0;
    if (toMark.length > 0) {
      const { error: mErr } = await admin.from("auto_reminders_log").insert(toMark);
      if (mErr) {
        console.error(
          `[clients/lapsed/send] SUPPRESSION WRITE FAILED for tenant ${tenantId}: ${mErr.message} — ` +
          `${toMark.length} client(s) may receive the automated winback as well.`
        );
      } else {
        marked = toMark.length;
      }
    }

    return Response.json({
      success: true,
      sent,
      failed,
      skipped_no_phone: skippedNoPhone,
      marked,
      chunkSize: CHUNK,
      chunks,
      results,
    });
  } catch (err) {
    console.error("[clients/lapsed/send] threw:", err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// app/api/wa-cloud/webhook/route.ts
//
// Meta's WhatsApp Business Platform (Cloud API) webhook for the central Kalmea business number. Separate from
// app/api/whatsapp-webhook (GreenAPI), which is untouched.
//
//   GET   the subscription handshake: echoes hub.challenge when hub.verify_token matches WA_CLOUD_VERIFY_TOKEN.
//   POST  message and status notifications. The X-Hub-Signature-256 header is checked against the RAW body with the
//         app secret BEFORE anything else - before JSON parsing and before a database client exists. A bad or missing
//         signature is a 401 and touches nothing.
//
// What a signed POST does:
//   * statuses (sent / delivered / read / failed, with Meta's pricing block): written to wa_cloud_messages (the cost
//     log: billable, category) and to whatsapp_messages.delivery_status through the provider-id column, the same
//     column and words the GreenAPI webhook uses - so "sent" and "arrived" stay two different things.
//   * an inbound "הסר" / "stop" (lib/marketingConsent.isOptOutReply): the sender is opted out of marketing in every
//     business that messaged that number through this route in the last 90 days (clients and leads by phone, plus the
//     hashed marketing_suppressions record that outlives a deleted card), and gets one acknowledgement. Reminders and
//     confirmations keep coming - the same promise the GreenAPI opt-out makes.
//   * any other inbound text: acknowledged to Meta and ignored. The central number has no bot; the client's
//     conversation is with her cosmetician, on the cosmetician's own WhatsApp.
//
// Always 200 for a signed delivery, even when part of it failed: Meta retries a non-200 for days, and a retry loop
// would repeat the opt-out acknowledgement. Failures are logged.

import { createClient } from '@supabase/supabase-js';
import { waCloudAppSecret } from '@/lib/waCloud/config';
import { verifySignature, verifySubscription, parseWebhook, mapCloudDeliveryStatus, type StatusUpdate, type InboundText } from '@/lib/waCloud/webhook';
import { recipientHash, LOG_TABLE } from '@/lib/waCloud/send';
import { resolveWaCloudAdapter } from '@/lib/waCloud/adapter';
import { isOptOutReply, optOutFields } from '@/lib/marketingConsent';
import { phoneVariants, suppressionHash } from '@/lib/clientData';
import { normalizeIsraeliMobile } from '@/lib/phone';
import { hit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const OPT_OUT_ACK = 'הוסרת מרשימת ההודעות. מעכשיו לא יישלחו אלייך הודעות שיווק. תזכורות לתורים ימשיכו להגיע.';
const OPT_OUT_LOOKBACK_DAYS = 90;

// Only after the signature has passed.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type Admin = ReturnType<typeof admin>;

export async function GET(request: Request) {
  const challenge = verifySubscription(new URL(request.url).searchParams, process.env.WA_CLOUD_VERIFY_TOKEN);
  if (challenge === null) return new Response('forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), waCloudAppSecret())) {
    console.warn('[wa-cloud-webhook] refused: missing or invalid X-Hub-Signature-256');
    return new Response('invalid signature', { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ ok: true, ignored: 'not json' }); }
  const { inbound, statuses } = parseWebhook(body);
  if (inbound.length === 0 && statuses.length === 0) return Response.json({ ok: true, ignored: 'nothing to record' });

  const db = admin();
  for (const s of statuses) {
    try { await recordStatus(db, s); } catch (e) { console.error('[wa-cloud-webhook] status failed:', (e as Error)?.message); }
  }
  for (const m of inbound) {
    try { await handleInbound(db, m); } catch (e) { console.error('[wa-cloud-webhook] inbound failed:', (e as Error)?.message); }
  }
  return Response.json({ ok: true });
}

async function recordStatus(db: Admin, s: StatusUpdate) {
  const at = new Date().toISOString();
  const patch: Record<string, unknown> = { delivery_status: s.status, delivery_updated_at: at };
  if (s.billable !== null) patch.billable = s.billable;
  if (s.pricingCategory) patch.pricing_category = s.pricingCategory;
  if (s.pricingModel) patch.pricing_model = s.pricingModel;
  if (s.error) patch.error_detail = s.error.slice(0, 500);
  const { error } = await db.from(LOG_TABLE).update(patch).eq('wa_message_id', s.id);
  if (error) console.error(`[wa-cloud-webhook] cost log update failed for ${s.id}:`, error.message);

  const mapped = mapCloudDeliveryStatus(s.status);
  if (!mapped) return;
  const msgPatch: Record<string, unknown> = { delivery_status: mapped };
  if (mapped === 'delivered') msgPatch.delivered_at = at;
  if (mapped === 'read') msgPatch.read_at = at;
  if (mapped === 'undelivered') msgPatch.undelivered_at = at;
  const { error: mErr } = await db.from('whatsapp_messages').update(msgPatch).eq('green_api_id', s.id);
  if (mErr) console.error(`[wa-cloud-webhook] message log update failed for ${s.id}:`, mErr.message);
}

async function handleInbound(db: Admin, m: InboundText) {
  if (!isOptOutReply(m.text)) return;
  const burst = hit(`wa-cloud-optout:${m.from}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!burst.ok) return;

  const since = new Date(Date.now() - OPT_OUT_LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: rows, error } = await db.from(LOG_TABLE).select('tenant_id').eq('recipient_hash', recipientHash(m.from)).gte('created_at', since).limit(200);
  if (error) console.error('[wa-cloud-webhook] opt-out lookup failed:', error.message);
  const tenants = [...new Set((rows || []).map((r: { tenant_id: string }) => r.tenant_id).filter(Boolean))];

  const variants = phoneVariants(m.from);
  const e164 = normalizeIsraeliMobile(m.from);
  let fresh = 0;
  let cardsSeen = 0;
  for (const tenantId of tenants) {
    if (variants.length) {
      const { data: cards } = await db.from('clients').select('id, marketing_opted_out_at').eq('tenant_id', tenantId).in('phone', variants);
      cardsSeen += (cards || []).length;
      const toMark = (cards || []).filter((c: { marketing_opted_out_at: string | null }) => !c.marketing_opted_out_at).map((c: { id: string }) => c.id);
      if (toMark.length) {
        const { error: cErr } = await db.from('clients').update(optOutFields()).in('id', toMark).eq('tenant_id', tenantId);
        if (cErr) console.error('[wa-cloud-webhook] client opt-out not recorded:', cErr.message); else fresh += toMark.length;
      }
      const { error: lErr } = await db.from('leads').update(optOutFields()).eq('tenant_id', tenantId).in('phone', variants);
      if (lErr && !/marketing_opted_out_at|schema cache|does not exist/i.test(lErr.message || '')) console.error('[wa-cloud-webhook] lead opt-out not recorded:', lErr.message);
    }
    if (e164.ok) {
      const { error: sErr } = await db.from('marketing_suppressions').upsert({ tenant_id: tenantId, phone_hash: suppressionHash(tenantId, e164.e164) });
      if (sErr && !/marketing_suppressions|does not exist|PGRST205/i.test(`${sErr.code} ${sErr.message}`)) console.error('[wa-cloud-webhook] suppression not recorded:', sErr.message);
    }
  }

  // One acknowledgement, inside the 24-hour window her message just opened (free-form text is allowed there).
  // Not again for someone who was already removed everywhere.
  if (cardsSeen === 0 || fresh > 0) {
    const res = await resolveWaCloudAdapter().sendText(m.from, OPT_OUT_ACK);
    if (!res.ok) console.error('[wa-cloud-webhook] opt-out acknowledgement failed:', res.error);
  }
}

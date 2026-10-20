// lib/waCloud/send.ts
//
// SERVER ONLY. The Cloud route's decision for ONE message, called from sendWhatsApp() (lib/whatsapp.js) after its own
// demo, phone, manual/automatic and public-cap checks have passed. sendWhatsApp() stays the single chokepoint; this
// only answers "should this go through Meta, and did it?".
//
// Outcomes:
//   { route: 'greenapi' }              the Cloud route is off, or this type has no template, or the caller gave no
//                                      template parameters: sendWhatsApp carries on exactly as before.
//   { route: 'greenapi', shadow }      MOCK mode: everything below was decided and logged (would it be quiet hours?
//                                      over the cap? what would it cost?) but nothing went to Meta; GreenAPI sends as
//                                      it always has. Lets her watch the Cloud route's verdicts on real traffic first.
//   { route: 'cloud', ok: true, ... }  LIVE, Meta accepted it (a wamid). Accepted is not delivered: the webhook says
//                                      later whether it arrived.
//   { route: 'cloud', ok: false, ... } LIVE, refused here (quiet hours, daily cap, cap unreadable, bad parameters) or
//                                      by Meta. sendWhatsApp puts it in her manual queue - never silently dropped, and
//                                      never quietly re-sent through GreenAPI behind her back.
//
// Every decision is a row in wa_cloud_messages (supabase/migrations/add_wa_cloud.sql): that table is the cost log the
// admin panel reads, and the count the per-business daily cap is enforced from. FAILS CLOSED in live mode when the
// count cannot be read: an unreadable table means the cost log is not being written either, and Cloud messages cost
// money. (Compare lib/outboundCap.js, which fails open - there nothing is billed per message.)

import { createHash } from 'node:crypto';
import { waCloudEnabled, waCloudMode, tenantDailyCap, utilityCostUsd, type WaCloudEnv } from './config.ts';
import { templateForType, buildTemplate } from './templates.ts';
import { allowedNow, israelDayStartIso } from './policy.ts';
import { resolveWaCloudAdapter, type WaCloudAdapter } from './adapter.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export const LOG_TABLE = 'wa_cloud_messages';

export type CloudVerdict =
  | { route: 'greenapi'; shadow?: { status: string; reason: string | null } }
  | { route: 'cloud'; ok: true; messageId: string; preview: string }
  | { route: 'cloud'; ok: false; reason: string; detail: string };

/** A phone's key in the log: hashed, so the cost log never holds a client's number, yet an inbound "הסר" can be matched. */
export function recipientHash(digits: string): string {
  return createHash('sha256').update(`wa-cloud:${String(digits).replace(/\D/g, '')}`).digest('hex');
}

/** Template sends counted against today's cap (Israel day), in the given mode. null = could not read. */
export async function sendsToday(db: Db, tenantId: string, mode: 'live' | 'mock', now: Date): Promise<number | null> {
  try {
    const { count, error } = await db
      .from(LOG_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('mode', mode)
      .eq('status', 'accepted')
      .gte('created_at', israelDayStartIso(now));
    if (error) return null;
    return Number(count) || 0;
  } catch {
    return null;
  }
}

async function log(db: Db, row: Record<string, unknown>) {
  try {
    const { error } = await db.from(LOG_TABLE).insert(row);
    if (error) console.error('[waCloud] cost log insert failed:', error.message);
  } catch (e) {
    console.error('[waCloud] cost log insert threw:', (e as Error)?.message || String(e));
  }
}

export async function routeThroughCloud(p: {
  db: Db;
  tenantId: string | null | undefined;
  type: string;
  digits: string;
  params: unknown[] | undefined;
  now?: Date;
  env?: WaCloudEnv;
  adapter?: WaCloudAdapter;
}): Promise<CloudVerdict> {
  const env = p.env || process.env;
  if (!waCloudEnabled(env)) return { route: 'greenapi' };
  const tpl = templateForType(p.type);
  // No template for this type, or the caller did not pass its parameters (an older call site): unchanged behaviour.
  if (!tpl || !Array.isArray(p.params) || !p.tenantId) return { route: 'greenapi' };

  const now = p.now || new Date();
  const mode = waCloudMode(env);
  const base = {
    tenant_id: p.tenantId,
    message_type: p.type,
    template_name: tpl.name,
    category: tpl.category,
    mode,
    recipient_hash: recipientHash(p.digits),
    recipient_last4: String(p.digits).slice(-4),
  };

  const refuse = async (reason: string, detail: string): Promise<CloudVerdict> => {
    await log(p.db, { ...base, status: 'refused', reason, error_detail: detail.slice(0, 500) });
    if (mode === 'mock') return { route: 'greenapi', shadow: { status: 'refused', reason } };
    return { route: 'cloud', ok: false, reason, detail };
  };

  const built = buildTemplate(tpl.key, p.params);
  if (!built.ok) return refuse('bad_params', built.error);

  if (!allowedNow(tpl.quietHoursExempt, now)) return refuse('quiet_hours', 'no Cloud sends 21:00-08:00 Israel time');

  const cap = tenantDailyCap(env);
  const count = await sendsToday(p.db, p.tenantId, mode, now);
  if (count === null) return refuse('cap_unreadable', `${LOG_TABLE} could not be read (has add_wa_cloud.sql run?)`);
  if (count >= cap) return refuse('tenant_capped', `daily Cloud cap reached (${count}/${cap})`);

  const adapter = p.adapter || resolveWaCloudAdapter(env);
  const res = await adapter.sendTemplate(p.digits, built.payload);
  const cost = utilityCostUsd(env);

  if (!res.ok) {
    await log(p.db, { ...base, status: 'failed', reason: 'meta_error', error_detail: `${res.httpStatus || ''} ${res.code || ''} ${res.error}`.trim().slice(0, 500) });
    if (mode === 'mock') return { route: 'greenapi', shadow: { status: 'failed', reason: 'meta_error' } };
    return { route: 'cloud', ok: false, reason: 'meta_error', detail: res.error };
  }

  await log(p.db, { ...base, status: 'accepted', wa_message_id: res.messageId, cost_estimate_usd: cost });
  if (mode === 'mock') return { route: 'greenapi', shadow: { status: 'accepted', reason: null } };
  return { route: 'cloud', ok: true, messageId: res.messageId, preview: built.preview };
}

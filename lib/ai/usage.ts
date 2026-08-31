// lib/ai/usage.js
//
// The ONE place an Anthropic call is made and recorded. Every AI call site in
// the product goes through trackedCreate.
//
// ── Why a wrapper and not a logUsage() you call afterwards ─────────────────
// A logger called after the fact is ten places that can each forget, and the
// failure is invisible: the feature works, the money is spent, the row is
// simply missing. Wrapping the call makes it structurally awkward to spend
// without recording. If you are adding an eleventh call site and reaching for
// anthropic.messages.create directly, that is the thing this file exists to
// stop.
//
// ── Logging must never break the feature ──────────────────────────────────
// Everything after the API call is wrapped so that a metering failure returns
// the message anyway. She gets her answer; we lose a row and say so loudly in
// the logs. The reverse - a working meter and a broken advisor - would be an
// absurd trade.
//
// ── Why the insert is AWAITED and not fire-and-forget ─────────────────────
// Fire-and-forget is the obvious implementation and it silently loses data on
// Vercel: the function can freeze the moment the response is returned, and an
// un-awaited promise dies with it. You would get partial metering and no error,
// which is worse than none, because you would trust it. The proper primitive is
// waitUntil from @vercel/functions, which is not a dependency here. So the
// insert is awaited inside a catch-all: ~20-40 ms against an AI call that takes
// one to five seconds is noise, and it actually lands.

import { createClient } from '@supabase/supabase-js';
import { getCallCapStatus, AiCapExceededError } from './callCaps';
import type Anthropic from '@anthropic-ai/sdk';

/** How far to trust the tenant id on a usage row. */
export type Attribution = 'verified' | 'claimed';

export interface TrackOptions {
  /** null when the call could not be attributed to a business. */
  tenantId?: string | null;
  /** Which feature spent the money. Required - an unattributed row must still say what it was. */
  callSite: string;
  attribution?: Attribution;
  /** Injected in tests so nothing touches a real database. */
  db?: { from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } } | null;
}

/**
 * USD per MILLION tokens, per model id.
 *
 * Both the alias and the dated snapshot are listed for Haiku because the
 * codebase uses both spellings for the same model, and a missing key here is
 * not a crash - it is a silently unpriced row.
 *
 * Verified against platform.claude.com/docs/en/about-claude/pricing.
 * No call site uses prompt caching or streaming, so cache-write / cache-read
 * multipliers do not apply; if one ever does, this table needs those rates too
 * and computeCost needs the cache token fields.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':           { input: 1, output: 5 },
  'claude-haiku-4-5-20251001':  { input: 1, output: 5 },
  'claude-sonnet-4-5':          { input: 3, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-5':            { input: 2, output: 10 },
  'claude-opus-5':              { input: 5, output: 25 },
};

/**
 * Cost in USD, or null when the model has no rate.
 *
 * NULL rather than 0 on purpose. A 0 reads as "this call was free" and hides
 * real spend forever; null reads as "we do not know what this cost", which is
 * the truth, and verify query (e) in the migration surfaces it.
 */
export function computeCost(
  model: string | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): number | null {
  const rate = model ? MODEL_RATES[model] : undefined;
  if (!rate) return null;
  const cost = (Number(inputTokens) || 0) / 1e6 * rate.input
             + (Number(outputTokens) || 0) / 1e6 * rate.output;
  // 6 dp matches numeric(12,6) in the table; a Haiku call can be well under a
  // hundredth of a cent and must not round to zero.
  return Math.round(cost * 1e6) / 1e6;
}

/** Pull the token counts out of a response, tolerating a missing usage block. */
export function extractUsage(message: { usage?: { input_tokens?: number; output_tokens?: number } } | null | undefined): { inputTokens: number; outputTokens: number } {
  const u = (message && message.usage) || {};
  return {
    inputTokens: Number(u.input_tokens) || 0,
    outputTokens: Number(u.output_tokens) || 0,
  };
}

let cachedClient: ReturnType<typeof createClient> | null = null;
function admin() {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cachedClient;
}

/**
 * Record one call. Never throws.
 *
 * @param {object}  o
 * @param {string?} o.tenantId    null when it could not be attributed
 * @param {string}  o.callSite    which feature spent the money
 * @param {string}  o.model
 * @param {object}  o.usage       { inputTokens, outputTokens }
 * @param {'verified'|'claimed'} o.attribution  how far to trust tenantId
 * @param {object?} o.db          injectable for tests
 */
export async function recordUsage({
  tenantId = null,
  callSite,
  model,
  usage,
  attribution = 'verified',
  db = null,
}: TrackOptions & {
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}): Promise<{ ok: boolean; error?: string; costUsd?: number | null }> {
  try {
    const inputTokens = Number(usage?.inputTokens) || 0;
    const outputTokens = Number(usage?.outputTokens) || 0;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    if (costUsd === null) {
      // Loud: an unpriced model is money leaving with no number attached.
      console.error(
        `[ai-usage] NO RATE for model "${model}" (call_site=${callSite}). ` +
        `Tokens recorded, cost_usd left null. Add it to MODEL_RATES in lib/ai/usage.js.`
      );
    }

    console.log(
      `[ai-usage] TENANT FILTER: tenant_id = ${tenantId ?? 'NULL (unattributed)'} | ` +
      `${callSite} | ${model} | in=${inputTokens} out=${outputTokens} | ` +
      `usd=${costUsd === null ? 'unknown' : costUsd.toFixed(6)} | ${attribution}`
    );

    // The injected test double and the real supabase client agree on exactly
    // the shape used here - .from(t).insert(row) -> { error } - so narrow to
    // that rather than reaching for `any`.
    const client = (db || admin()) as {
      from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await client.from('ai_usage').insert({
      tenant_id: tenantId || null,
      call_site: callSite,
      attribution,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    });
    if (error) {
      console.error(`[ai-usage] insert failed (${callSite}): ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, costUsd };
  } catch (e) {
    // Swallow everything. A metering failure must never surface to a user who
    // asked the advisor a question.
    console.error(`[ai-usage] threw (${callSite}): ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: 'threw' };
  }
}

/**
 * Make an Anthropic call and meter it.
 *
 * Drop-in for `client.messages.create(params)` - same arguments, same return
 * value - plus a second argument saying who is spending and on what.
 *
 *   const message = await trackedCreate(anthropic, params, {
 *     tenantId, callSite: 'marketing/reel',
 *   });
 *
 * If the API call itself throws, that propagates: a failed AI call is the
 * caller's problem and there is nothing to meter. Only the metering is
 * swallowed.
 */
export async function trackedCreate(
  client: Pick<Anthropic, 'messages'>,
  params: Anthropic.MessageCreateParamsNonStreaming,
  { tenantId = null, callSite, attribution = 'verified', db = null }: TrackOptions
): Promise<Anthropic.Message> {
  // Ceiling check BEFORE the call, so a refusal costs nothing. Fails open on
  // a read failure - see lib/ai/callCaps.ts for why a spend control fails open
  // where a security boundary would fail closed.
  const cap = await getCallCapStatus(tenantId, callSite);
  if (cap.exceeded) {
    console.error(
      `[ai-cap] REFUSED ${callSite} for tenant ${tenantId}: ` +
      `${cap.used}/${cap.cap} calls used this month.`
    );
    throw new AiCapExceededError(callSite, cap.used, cap.cap as number);
  }

  const message = (await client.messages.create(params)) as Anthropic.Message;
  await recordUsage({
    tenantId,
    callSite,
    model: params?.model,
    usage: extractUsage(message),
    attribution,
    db,
  });
  return message;
}

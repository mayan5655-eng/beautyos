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
import { checkAiAllowance, AiCapExceededError, AiCapUnavailableError, DemoBlockedError } from './callCaps.ts';
import { capNoticeHe } from './capMessages.ts';
import { isDemoTenantId } from '../demoTenants.ts';
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
  /** Test hooks for the ceiling check: an injected client, clock and alert, and no spend cache. */
  capClient?: { from: (t: string) => any };
  capNow?: Date;
  capAlert?: (a: any) => Promise<void>;
  capNoCache?: boolean;
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
  // The current Opus and Sonnet (platform.claude.com model table, cached 2026-09-25).
  'claude-opus-5-5':            { input: 4, output: 20 },
  'claude-sonnet-5-5':          { input: 2, output: 10 },
  // OpenAI image models (lib/ai/openaiImages.ts). Billed per token like text:
  // text input $5/M, image output $30/M (model card, Sept 2026). A high
  // 1024x1280 image is roughly 4,000 output tokens, about 13 cents.
  'gpt-image-2.5-sunburst':            { input: 5, output: 30 },
  'gpt-image-2.5-sunburst-2026-09-08': { input: 5, output: 30 },
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
    // A response with no usage block (both counts zero) is a real call whose cost
    // we could not see. Recording $0.000000 would hide it from every report and
    // from the dollar ceiling; recording NULL says "unpriced" and the ceiling
    // assumes a price (lib/ai/callCaps.ts UNPRICED_ROW_USD).
    const costUsd = inputTokens === 0 && outputTokens === 0 ? null : computeCost(model, inputTokens, outputTokens);

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
/**
 * Everything that must be true BEFORE any AI call is allowed to spend money -
 * shared by trackedCreate and trackedStream so a stream can never be a looser
 * way in than a plain call. Throws DemoBlockedError / AiCapExceededError /
 * AiCapUnavailableError; returns the allowance (which carries the near-limit
 * heads-up) when the call may go ahead.
 */
async function guardSpend(
  tenantId: string | null,
  callSite: string,
  hooks: { capClient?: { from: (t: string) => any }; capNow?: Date; capAlert?: (a: any) => Promise<void>; capNoCache?: boolean }
) {
  const { capClient, capNow, capAlert, capNoCache } = hooks;
  // Checked before the cap and before the call: a demo tenant (lib/demoTenants.ts)
  // must never spend real money, full stop, regardless of what the cap math
  // below would have allowed.
  if (isDemoTenantId(tenantId)) {
    console.log(`[ai-usage] BLOCKED ${callSite} for demo tenant ${tenantId}`);
    throw new DemoBlockedError(callSite);
  }

  // Ceiling check BEFORE the call, so a refusal costs nothing. Fails CLOSED: a
  // counter that cannot be read refuses the call and tells the operator - see
  // lib/ai/callCaps.ts. Checks the feature's call cap AND the tenant's dollar
  // ceiling for the month.
  const allowance = await checkAiAllowance(tenantId, callSite, { client: capClient, now: capNow, alert: capAlert, noCache: capNoCache });
  if (!allowance.allowed) {
    console.error(
      `[ai-cap] REFUSED ${callSite} for tenant ${tenantId}: reason=${allowance.reason} ` +
      `calls=${allowance.callsUsed}/${allowance.callsCap ?? '-'} spent=$${allowance.spentUsd === null ? '?' : allowance.spentUsd.toFixed(2)}/$${allowance.usdCap}`
    );
    if (allowance.reason === 'unreadable') throw new AiCapUnavailableError(callSite);
    throw new AiCapExceededError(callSite, allowance.callsUsed, allowance.callsCap ?? 0, allowance.reason === 'dollars' ? 'dollars' : 'calls');
  }

  return allowance;
}

export async function trackedCreate(
  client: Pick<Anthropic, 'messages'>,
  params: Anthropic.MessageCreateParamsNonStreaming,
  { tenantId = null, callSite, attribution = 'verified', db = null, capClient, capNow, capAlert, capNoCache }: TrackOptions
): Promise<Anthropic.Message> {
  const allowance = await guardSpend(tenantId, callSite, { capClient, capNow, capAlert, capNoCache });

  const message = (await client.messages.create(params)) as Anthropic.Message;
  // Near the limit: the warm heads-up rides on the message object (not
  // enumerable, so it never leaks into a serialised response by accident) for
  // the route to pass to her - "נשארו 3 ... הן מתחדשות בראשון לחודש".
  const notice = capNoticeHe(allowance);
  if (notice) Object.defineProperty(message, 'capNotice', { value: notice, enumerable: false });
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

/**
 * trackedCreate, streamed: for an answer a person is WAITING on (the advisor),
 * so text appears as it is written instead of after 15 seconds of nothing.
 *
 * Same rules as trackedCreate - the same guard runs BEFORE a stream is opened, so
 * a refusal throws here, before any response has started, and a route can still
 * answer with ordinary JSON. After that:
 *
 *   const s = await trackedStream(anthropic, params, { tenantId, callSite });
 *   for await (const text of s.deltas) send(text);   // text only - thinking is not forwarded
 *   s.message();                                      // the final message, after the loop
 *
 * Usage is only known at the end, so the row is written when the stream
 * finishes - and ALSO if the consumer stops early (the tab was closed): the
 * model has already been paid for, so the generator waits for the final message
 * and records it. An error before completion is thrown to the caller and writes
 * no row (nothing was delivered), like a failed trackedCreate. A metering failure
 * never breaks the answer.
 */
export async function trackedStream(
  client: Pick<Anthropic, 'messages'>,
  params: Anthropic.MessageCreateParamsNonStreaming,
  { tenantId = null, callSite, attribution = 'verified', db = null, capClient, capNow, capAlert, capNoCache }: TrackOptions
): Promise<{ deltas: AsyncGenerator<string, void, unknown>; message: () => Anthropic.Message | null; capNotice: string | null }> {
  const allowance = await guardSpend(tenantId, callSite, { capClient, capNow, capAlert, capNoCache });
  const stream = client.messages.stream(params as Anthropic.MessageStreamParams);
  let final: Anthropic.Message | null = null;
  let failed = false;

  async function* deltas(): AsyncGenerator<string, void, unknown> {
    try {
      for await (const ev of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
      }
    } catch (e) {
      failed = true;
      throw e;
    } finally {
      // Normal end AND early stop (consumer returned): collect what the model
      // produced so the spend is recorded. Skipped when the stream itself failed.
      if (!failed) {
        try { final = await stream.finalMessage(); } catch { /* nothing to meter */ }
        if (final) {
          await recordUsage({ tenantId, callSite, model: params?.model, usage: extractUsage(final), attribution, db });
        }
      }
    }
  }

  return { deltas: deltas(), message: () => final, capNotice: capNoticeHe(allowance) };
}

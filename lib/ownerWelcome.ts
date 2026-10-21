// lib/ownerWelcome.ts
//
// SERVER ONLY. One welcome WhatsApp to a NEW Kalmea business owner (the cosmetician herself, never her clients), with
// the link to the tutorial videos. Sent once, at the moment her settings row is first created (onboarding finished,
// app/api/settings/save/route.ts), after the response has gone, so nothing here can slow or break her signup.
//
// Channel: Meta's WhatsApp Cloud API (lib/waCloud), as the approved template `kalmea_owner_welcome`. Not GreenAPI: a
// first message with a link, from the central number, to a number that never wrote to it, is exactly the pattern that
// gets an unofficial number restricted - and that number carries every business's reminders.
//
// OWNER_WELCOME_WA (env), default OFF:
//   off   (or unset, or anything else) nothing at all happens, not even a database read.
//   mock  everything is decided and recorded (the once-only marker, the cost log row with mode 'mock') and NOTHING is
//         sent: the mock adapter has no network. For a preview check, set per deployment.
//   live  sent through Meta. Also needs WA Cloud's live credentials (lib/waCloud/config.ts) and
//         OWNER_WELCOME_TUTORIALS_URL (an https link to the videos); without either it refuses and records why.
//
// Once only, in the database: owner_welcome_messages (supabase/migrations/add_owner_welcome.sql) has the tenant id as
// its primary key and the phone's hash as a unique key, and the row is inserted BEFORE anything is sent. A second save,
// a retry or a race loses the insert and sends nothing; a second account on the same number gets nothing either. A
// failed send is recorded and never retried automatically. If the table cannot be written (migration not run), nothing
// is sent - fails closed, because a send without the marker could repeat.
//
// Never sent: demo tenants, test-looking business names (13 digits, as the test runs create), and in live mode the
// reserved fake numbers 050-0000000..050-0000099 that the SMS mock uses.

import { createHash } from 'node:crypto';
import { isDemoTenantId } from './demoTenants.ts';
import { looksLikeTestName } from './ownerContact.ts';
import { normalizeIsraeliMobile } from './phone.ts';
import { KALMEA_SUPPORT_WHATSAPP_DISPLAY } from './support.ts';
import { sanitizeParam } from './waCloud/templates.ts';
import { waCloudStatus, utilityCostUsd, type WaCloudEnv } from './waCloud/config.ts';
import { mockAdapter, liveAdapter, type WaCloudAdapter } from './waCloud/adapter.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export const MARKER_TABLE = 'owner_welcome_messages';
export const COST_LOG_TABLE = 'wa_cloud_messages';
export const MESSAGE_TYPE = 'owner_welcome';

/** Shown in mock mode until the videos have a link. Never sent: live mode refuses without OWNER_WELCOME_TUTORIALS_URL. */
export const TUTORIALS_PLACEHOLDER = 'https://kalmea.app/tutorials';

// The template submitted to Meta (docs/WA_TEMPLATES.md carries the same text; test-owner-welcome.ts checks they agree).
// Submitted as UTILITY: it is about the account she just opened and how to set it up, with nothing promotional. Meta
// decides the category at review; if it comes back MARKETING, see the cost note in docs/WA_TEMPLATES.md.
// {{2}} is the link, as a variable, so the video page can change without a new review.
export const WELCOME_TEMPLATE = {
  name: 'kalmea_owner_welcome',
  language: 'he' as const,
  category: 'UTILITY' as const,
  params: ['business name', 'tutorial videos link'],
  body:
    'היי, ברוכה הבאה לקלמיה! 🌸\n' +
    'החשבון של {{1}} מוכן.\n\n' +
    'הכנו לך סרטוני הדרכה קצרים, צעד אחרי צעד: איך מגדירים את העסק ואיך מקבלים תורים אונליין.\n' +
    '{{2}}\n\n' +
    `שאלה? אנחנו כאן בוואטסאפ ${KALMEA_SUPPORT_WHATSAPP_DISPLAY}\n` +
    'צוות קלמיה',
  example: ['סטודיו נועה', 'https://kalmea.app/tutorials'],
};

export type WelcomeMode = 'off' | 'mock' | 'live';

export function welcomeMode(env: WaCloudEnv = process.env): WelcomeMode {
  const v = String(env.OWNER_WELCOME_WA ?? '').trim().toLowerCase();
  return v === 'live' ? 'live' : v === 'mock' ? 'mock' : 'off';
}

/** The videos link, when it is a real https link. null = not delivered yet. */
export function tutorialsUrl(env: WaCloudEnv = process.env): string | null {
  const v = String(env.OWNER_WELCOME_TUTORIALS_URL ?? '').trim();
  return /^https:\/\/[^\s]+$/.test(v) ? v : null;
}

/** 050-0000000 .. 050-0000099: the fake numbers the SMS mock accepts (lib/phoneVerify/sms.ts). Never a real person. */
export function isReservedTestNumber(e164: string): boolean {
  return /^9725000000\d\d$/.test(e164);
}

export function phoneHash(e164: string): string {
  return createHash('sha256').update(`owner-welcome:${e164}`).digest('hex');
}

export function buildWelcome(businessName: unknown, link: string) {
  const name = sanitizeParam(businessName).slice(0, 60) || 'העסק שלך';
  const params = [name, sanitizeParam(link)];
  const preview = WELCOME_TEMPLATE.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? '');
  return {
    params,
    preview,
    payload: {
      name: WELCOME_TEMPLATE.name,
      language: { code: WELCOME_TEMPLATE.language },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    },
  };
}

/**
 * Her mobile: the one she verified by SMS (owner_phones, when phone verification is on), else the phone she typed in
 * onboarding when it is an Israeli mobile. null = nothing to send to.
 */
export async function resolveOwnerMobile(db: Db, o: { tenantId: string; userId?: string | null; businessPhone?: unknown }):
  Promise<{ e164: string; source: 'verified' | 'onboarding' } | null> {
  try {
    let q = db.from('owner_phones').select('phone_e164');
    q = o.userId ? q.eq('user_id', o.userId) : q.eq('tenant_id', o.tenantId);
    const { data, error } = await q.limit(1);
    const row = !error && Array.isArray(data) ? data[0] : null;
    if (row?.phone_e164) {
      const p = normalizeIsraeliMobile(String(row.phone_e164));
      if (p.ok) return { e164: p.e164, source: 'verified' };
    }
  } catch { /* table missing or unreadable: fall through to the onboarding phone */ }
  const p = normalizeIsraeliMobile(String(o.businessPhone ?? ''));
  return p.ok ? { e164: p.e164, source: 'onboarding' } : null;
}

export type WelcomeResult =
  | { status: 'skipped'; reason: 'off' | 'no-tenant' | 'demo' | 'test-name' | 'no-phone' | 'test-number' | 'duplicate' | 'marker-unavailable' }
  | { status: 'refused'; reason: 'not-configured' | 'no-tutorials-link'; detail: string }
  | { status: 'mock'; preview: string; messageId: string }
  | { status: 'accepted'; messageId: string }
  | { status: 'failed'; error: string };

async function safe(p: PromiseLike<{ error: { message: string } | null }>, what: string) {
  try {
    const { error } = await p;
    if (error) console.error(`[ownerWelcome] ${what} failed:`, error.message);
  } catch (e) {
    console.error(`[ownerWelcome] ${what} threw:`, (e as Error)?.message || String(e));
  }
}

export async function sendOwnerWelcome(o: {
  db: Db;
  tenantId: string;
  userId?: string | null;
  businessName: unknown;
  businessPhone?: unknown;
  env?: WaCloudEnv;
  adapter?: WaCloudAdapter;
}): Promise<WelcomeResult> {
  const env = o.env || process.env;
  const mode = welcomeMode(env);
  if (mode === 'off') return { status: 'skipped', reason: 'off' };
  const { db, tenantId } = o;
  if (!tenantId) return { status: 'skipped', reason: 'no-tenant' };
  if (isDemoTenantId(tenantId)) return { status: 'skipped', reason: 'demo' };
  if (looksLikeTestName(o.businessName)) return { status: 'skipped', reason: 'test-name' };

  const phone = await resolveOwnerMobile(db, o);
  if (!phone) return { status: 'skipped', reason: 'no-phone' };
  if (mode === 'live' && isReservedTestNumber(phone.e164)) return { status: 'skipped', reason: 'test-number' };

  // The once-only claim, before anything else is decided or sent. Losing it (23505) = already done for this business
  // or this number. Any other error = the table is not there: send nothing.
  const hash = phoneHash(phone.e164);
  const marker = { tenant_id: tenantId, phone_hash: hash, phone_last4: phone.e164.slice(-4), phone_source: phone.source, mode, status: 'claimed' };
  try {
    const { error } = await db.from(MARKER_TABLE).insert(marker);
    if (error) {
      if (error.code === '23505') return { status: 'skipped', reason: 'duplicate' };
      console.error('[ownerWelcome] marker insert failed, sending nothing:', error.code, error.message);
      return { status: 'skipped', reason: 'marker-unavailable' };
    }
  } catch (e) {
    console.error('[ownerWelcome] marker insert threw, sending nothing:', (e as Error)?.message || String(e));
    return { status: 'skipped', reason: 'marker-unavailable' };
  }
  const mark = (patch: Record<string, unknown>) =>
    safe(db.from(MARKER_TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId), 'marker update');

  const link = tutorialsUrl(env);
  if (mode === 'live') {
    const st = waCloudStatus(env);
    if (!st.liveReady) {
      const detail = `WA Cloud not configured: ${st.missing.join(', ')}`;
      await mark({ status: 'refused', error_detail: detail });
      return { status: 'refused', reason: 'not-configured', detail };
    }
    if (!link) {
      const detail = 'OWNER_WELCOME_TUTORIALS_URL is not set';
      await mark({ status: 'refused', error_detail: detail });
      return { status: 'refused', reason: 'no-tutorials-link', detail };
    }
  }

  const built = buildWelcome(o.businessName, link || TUTORIALS_PLACEHOLDER);
  const adapter = o.adapter || (mode === 'live' ? liveAdapter(env) : mockAdapter());
  const res = await adapter.sendTemplate(phone.e164, built.payload);
  const costRow = {
    tenant_id: tenantId,
    message_type: MESSAGE_TYPE,
    template_name: WELCOME_TEMPLATE.name,
    category: WELCOME_TEMPLATE.category,
    mode,
    recipient_hash: createHash('sha256').update(`wa-cloud:${phone.e164}`).digest('hex'), // same key as lib/waCloud/send.ts
    recipient_last4: phone.e164.slice(-4),
  };

  if (!res.ok) {
    await mark({ status: 'failed', error_detail: res.error.slice(0, 500) });
    await safe(db.from(COST_LOG_TABLE).insert({ ...costRow, status: 'failed', reason: 'meta_error', error_detail: res.error.slice(0, 500) }), 'cost log');
    return { status: 'failed', error: res.error };
  }
  // Accepted = Meta queued it. Delivery arrives on /api/wa-cloud/webhook against the same wamid in wa_cloud_messages.
  await mark({ status: mode === 'live' ? 'accepted' : 'mock', wa_message_id: res.messageId, message_preview: built.preview });
  await safe(db.from(COST_LOG_TABLE).insert({ ...costRow, status: 'accepted', wa_message_id: res.messageId, cost_estimate_usd: utilityCostUsd(env) }), 'cost log');
  return mode === 'live' ? { status: 'accepted', messageId: res.messageId } : { status: 'mock', preview: built.preview, messageId: res.messageId };
}

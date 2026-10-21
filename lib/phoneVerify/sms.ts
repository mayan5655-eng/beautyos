// lib/phoneVerify/sms.ts
//
// SERVER ONLY. Sends the verification SMS. Nothing else in the product sends SMS.
//
// ── Modes (SMS_MODE) ─────────────────────────────────────────────────────────
//   off   (the default)  nothing is sent and phone verification stays dormant everywhere: the signup form is the old
//                        one and nobody is asked for a number. Turning the switches on in the admin panel does nothing
//                        until a real sender is configured, on purpose - a code that cannot arrive must never block a
//                        signup.
//   mock                 nothing is sent; the code is SMS_MOCK_CODE (default 123456). Only for the reserved fake
//                        numbers 050-00000xx, so a preview - which runs on the PRODUCTION database - can never mark a
//                        real person's number as verified. Refused on the production deployment, and on any Vercel
//                        deployment unless SMS_MOCK_ALLOWED=true (same rule as GROW_MOCK_ALLOWED).
//   live                 real SMS through SMS_PROVIDER, which costs money per message. See the provider notes below.
//
// ── Providers (SMS_PROVIDER, live only) ────────────────────────────────────────
//   019      019 SMS (019sms.co.il), Israeli. POST https://019sms.co.il/api with a Bearer API token created in their
//            web app (Settings -> API Token Management). Needs SMS_019_TOKEN, SMS_019_USERNAME and SMS_019_SOURCE (the
//            sender name: up to 11 English letters/digits, approved by 019 first, or their error 515). status 0 = queued.
//            Their test endpoint (https://019sms.co.il/api/test) validates a request without sending: SMS_019_TEST=true.
//   twilio   Twilio Programmable SMS. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (an approved alphanumeric
//            sender or a number). About $0.26 per SMS to an Israeli mobile on Twilio's list price - several times a
//            local provider.

export type SmsMode = 'off' | 'mock' | 'live';
export type SmsProvider = '019' | 'twilio';
type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined) => /^(1|true|on|yes)$/i.test((v || '').trim());

/** 0500000000 - 0500000099: numbers no Israeli carrier issues to a person, the only ones mock mode accepts. */
export const MOCK_NUMBER = /^9725000000\d{2}$/;

export function smsMode(env: Env = process.env): SmsMode {
  const m = (env.SMS_MODE || '').trim().toLowerCase();
  return m === 'live' || m === 'mock' ? m : 'off';
}

export function smsProvider(env: Env = process.env): SmsProvider | null {
  const p = (env.SMS_PROVIDER || '').trim().toLowerCase();
  return p === '019' || p === 'twilio' ? p : null;
}

function liveMissing(env: Env): string[] {
  const p = smsProvider(env);
  if (!p) return ['SMS_PROVIDER'];
  const need = p === '019' ? ['SMS_019_TOKEN', 'SMS_019_USERNAME', 'SMS_019_SOURCE'] : ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'];
  return need.filter((k) => !(env[k] || '').trim());
}

export type SmsStatus = { ready: boolean; mode: SmsMode; provider: SmsProvider | null; reason?: string };

/** Can a code actually reach her? Everything else in phone verification keys off this. */
export function smsStatus(env: Env = process.env): SmsStatus {
  const mode = smsMode(env);
  if (mode === 'off') return { ready: false, mode, provider: null, reason: 'SMS_MODE is off' };
  if (mode === 'live') {
    const missing = liveMissing(env);
    return missing.length
      ? { ready: false, mode, provider: smsProvider(env), reason: `missing ${missing.join(', ')}` }
      : { ready: true, mode, provider: smsProvider(env) };
  }
  if ((env.VERCEL_ENV || '') === 'production') return { ready: false, mode, provider: null, reason: 'mock is not allowed on production' };
  if (env.VERCEL_ENV && !truthy(env.SMS_MOCK_ALLOWED)) return { ready: false, mode, provider: null, reason: 'mock needs SMS_MOCK_ALLOWED=true on a Vercel deployment' };
  return { ready: true, mode, provider: null };
}

/** The code mock mode stores and expects. */
export function mockCode(env: Env = process.env): string {
  const c = (env.SMS_MOCK_CODE || '').replace(/\D/g, '');
  return c.length === 6 ? c : '123456';
}

export type SendResult =
  | { ok: true; status: 'sent' | 'mock'; provider: string; ref?: string }
  | { ok: false; provider: string; error: string };

/** 972521234567 -> 0521234567, the shape 019 documents. */
const local = (e164: string) => '0' + e164.slice(3);

/**
 * Send one SMS. Never throws: a failure is a value the caller turns into Hebrew. `fetchImpl` is injected by tests;
 * nothing in the test suite reaches a provider.
 */
export async function sendSms(to: string, text: string, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const st = smsStatus(env);
  if (!st.ready) return { ok: false, provider: st.mode, error: st.reason || 'not ready' };
  if (st.mode === 'mock') {
    if (!MOCK_NUMBER.test(to)) return { ok: false, provider: 'mock', error: 'mock mode only sends to 050-00000xx' };
    return { ok: true, status: 'mock', provider: 'mock' };
  }
  try {
    if (st.provider === '019') {
      const url = truthy(env.SMS_019_TEST) ? 'https://019sms.co.il/api/test' : 'https://019sms.co.il/api';
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SMS_019_TOKEN}` },
        body: JSON.stringify({
          sms: {
            user: { username: env.SMS_019_USERNAME },
            source: env.SMS_019_SOURCE,
            destinations: { phone: [{ _: local(to) }] },
            message: text,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as { status?: number | string; message?: string; shipment_id?: string } | null;
      if (res.ok && body && Number(body.status) === 0) return { ok: true, status: 'sent', provider: '019', ref: body.shipment_id ? String(body.shipment_id) : undefined };
      return { ok: false, provider: '019', error: `019 status ${body?.status ?? res.status}: ${String(body?.message || '').slice(0, 120)}` };
    }
    // twilio
    const sid = env.TWILIO_ACCOUNT_SID as string;
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      },
      body: new URLSearchParams({ To: '+' + to, From: env.TWILIO_FROM as string, Body: text }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { sid?: string; message?: string; code?: number } | null;
    if (res.ok && body?.sid) return { ok: true, status: 'sent', provider: 'twilio', ref: body.sid };
    return { ok: false, provider: 'twilio', error: `twilio ${res.status} ${body?.code ?? ''}: ${String(body?.message || '').slice(0, 120)}` };
  } catch (e) {
    return { ok: false, provider: st.provider || 'live', error: e instanceof Error ? e.message : String(e) };
  }
}

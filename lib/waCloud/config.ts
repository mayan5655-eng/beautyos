// lib/waCloud/config.ts
//
// SERVER ONLY. What the official WhatsApp Business Platform (Meta Cloud API) integration reads from the environment.
// Nothing here talks to Meta; it only reads env, so it is safe from anywhere on the server and from tests.
//
//   WA_CLOUD_ENABLED          'true' turns the Cloud route on inside sendWhatsApp(). Anything else (the default) = OFF:
//                             every send behaves exactly as before (GreenAPI central number / manual wa.me queue).
//   WA_CLOUD_MODE             'live' = really call graph.facebook.com. Anything else (the default) = 'mock': a SHADOW run
//                             that records what the Cloud route would have done (template, quiet-hours and cap verdicts,
//                             estimated cost) and then lets the existing GreenAPI path send as it always has. Mock never
//                             claims a client received anything.
//   WA_CLOUD_PHONE_NUMBER_ID  the business number's Phone Number ID in WhatsApp Manager (not the phone number itself)
//   WA_CLOUD_ACCESS_TOKEN     a System User permanent token with whatsapp_business_messaging
//   WA_CLOUD_APP_SECRET       the Meta app's App Secret, for X-Hub-Signature-256. Falls back to FACEBOOK_APP_SECRET (same
//                             Meta app, 950953347958539).
//   WA_CLOUD_VERIFY_TOKEN     any long random string, typed into the webhook setup in the Meta app
//   WA_CLOUD_API_VERSION      Graph API version, default below
//   WA_CLOUD_TENANT_DAILY_CAP template sends per business per Israel calendar day, default below
//   WA_CLOUD_UTILITY_COST_USD estimated price of one billable utility template to an Israeli number (Meta rate card)

export type WaCloudEnv = Record<string, string | undefined>;

export const DEFAULT_API_VERSION = 'v21.0';
export const DEFAULT_TENANT_DAILY_CAP = 150;
// Estimate only, for the cost log: Meta's rate card for utility templates to Israel (+972), per delivered message.
// The real number arrives on every status webhook (pricing.billable / pricing.category) and is what the admin shows
// as "billable"; this is only the multiplier for the estimate column. Update it from Meta's current rate card.
export const DEFAULT_UTILITY_COST_USD = 0.0053;

const s = (v: string | undefined) => String(v ?? '').trim();

export function waCloudEnabled(env: WaCloudEnv = process.env): boolean {
  return s(env.WA_CLOUD_ENABLED).toLowerCase() === 'true';
}

export function waCloudMode(env: WaCloudEnv = process.env): 'live' | 'mock' {
  return s(env.WA_CLOUD_MODE).toLowerCase() === 'live' ? 'live' : 'mock';
}

export function waCloudAppSecret(env: WaCloudEnv = process.env): string {
  return s(env.WA_CLOUD_APP_SECRET) || s(env.FACEBOOK_APP_SECRET);
}

export function tenantDailyCap(env: WaCloudEnv = process.env): number {
  const n = Number(env.WA_CLOUD_TENANT_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TENANT_DAILY_CAP;
}

export function utilityCostUsd(env: WaCloudEnv = process.env): number {
  const n = Number(env.WA_CLOUD_UTILITY_COST_USD);
  return Number.isFinite(n) && n >= 0 && s(env.WA_CLOUD_UTILITY_COST_USD) !== '' ? n : DEFAULT_UTILITY_COST_USD;
}

export type WaCloudStatus = {
  enabled: boolean;
  mode: 'live' | 'mock';
  /** Live mode can actually send: every credential is present. */
  liveReady: boolean;
  /** Names of missing variables, for the operator only. */
  missing: string[];
  apiVersion: string;
};

export function waCloudStatus(env: WaCloudEnv = process.env): WaCloudStatus {
  const missing: string[] = [];
  if (!s(env.WA_CLOUD_PHONE_NUMBER_ID)) missing.push('WA_CLOUD_PHONE_NUMBER_ID');
  if (!s(env.WA_CLOUD_ACCESS_TOKEN)) missing.push('WA_CLOUD_ACCESS_TOKEN');
  if (!waCloudAppSecret(env)) missing.push('WA_CLOUD_APP_SECRET');
  if (!s(env.WA_CLOUD_VERIFY_TOKEN)) missing.push('WA_CLOUD_VERIFY_TOKEN');
  return {
    enabled: waCloudEnabled(env),
    mode: waCloudMode(env),
    liveReady: missing.length === 0,
    missing,
    apiVersion: s(env.WA_CLOUD_API_VERSION) || DEFAULT_API_VERSION,
  };
}

export function waCloudCredentials(env: WaCloudEnv = process.env): { phoneNumberId: string; accessToken: string; apiVersion: string } | null {
  const st = waCloudStatus(env);
  if (!s(env.WA_CLOUD_PHONE_NUMBER_ID) || !s(env.WA_CLOUD_ACCESS_TOKEN)) return null;
  return { phoneNumberId: s(env.WA_CLOUD_PHONE_NUMBER_ID), accessToken: s(env.WA_CLOUD_ACCESS_TOKEN), apiVersion: st.apiVersion };
}

// lib/waCloud/autoConfig.ts
//
// The switches of the AUTOMATIC reminders and booking confirmations (lib/waCloud/auto.ts), read from the environment.
// Pure: no network, no database. Safe from the server, from tests, and from a route that answers the settings screen.
//
//   WA_AUTO_ENABLED               THE KILL SWITCH. 'true' = the feature may run. Anything else (the default, unset) = the
//                                 feature does not exist: no Meta call, no database read, nothing in her settings, and
//                                 every message goes exactly as before (her send queue / the central number).
//   WA_CLOUD_MODE                 shared with the Cloud route (config.ts). 'live' = really send. Anything else = a dry run:
//                                 the decisions are logged as mock rows and nothing reaches a client.
//   WA_CLOUD_PHONE_NUMBER_ID, WA_CLOUD_ACCESS_TOKEN, WA_CLOUD_APP_SECRET, WA_CLOUD_VERIFY_TOKEN
//                                 shared too. Live needs all four (the webhook is what turns a button tap into a
//                                 confirmed appointment, so it must be verifiable before anything is sent).
//   WA_AUTO_REMINDER_LEAD_HOURS   how long before the visit the reminder goes, by default (24). A business can choose
//                                 24 or 48 in her settings.
//   WA_AUTO_SPEND_ALERT_USD       a moneyAlert each time the month's estimated spend for ALL businesses crosses a multiple
//                                 of this (default 25).
//   The ceilings (per business per day / per month, all businesses per day) are the Cloud ones: config.ts, caps.ts.
//
// "Active" (the feature really sends, and her settings show the switch) = WA_AUTO_ENABLED=true AND live AND all four
// credentials. Nothing short of that shows anything to a business (owner's rule: nothing that is not active is shown).

import { waCloudMode, waCloudStatus, tenantMonthlyCap, type WaCloudEnv } from './config.ts';

export const DEFAULT_LEAD_HOURS = 24;
export const LEAD_HOUR_CHOICES = [24, 48] as const;
export const DEFAULT_SPEND_ALERT_USD = 25;

const s = (v: string | undefined) => String(v ?? '').trim();

export type AutoConfig = {
  /** WA_AUTO_ENABLED=true. False = dormant: nothing at all runs. */
  enabled: boolean;
  mode: 'live' | 'mock';
  /** enabled, live and every credential present: messages really go to clients. */
  active: boolean;
  /** enabled but not active: decisions are logged as mock rows, nothing is sent. */
  dryRun: boolean;
  missing: string[];
  leadHours: number;
  spendAlertUsd: number;
};

export function autoConfig(env: WaCloudEnv = process.env): AutoConfig {
  const enabled = s(env.WA_AUTO_ENABLED).toLowerCase() === 'true';
  const st = waCloudStatus(env);
  const mode = waCloudMode(env);
  const active = enabled && mode === 'live' && st.liveReady;
  const lead = Number(env.WA_AUTO_REMINDER_LEAD_HOURS);
  const alert = Number(env.WA_AUTO_SPEND_ALERT_USD);
  return {
    enabled,
    mode,
    active,
    dryRun: enabled && !active,
    missing: st.missing,
    leadHours: Number.isFinite(lead) && lead >= 2 && lead <= 72 ? Math.floor(lead) : DEFAULT_LEAD_HOURS,
    spendAlertUsd: Number.isFinite(alert) && alert > 0 ? alert : DEFAULT_SPEND_ALERT_USD,
  };
}

type Autos = Record<string, unknown> | null | undefined;
const autosOf = (settingsRow: { automations?: unknown } | null | undefined): Record<string, unknown> => {
  const a = settingsRow?.automations;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
};

/** She turned it on herself. Only a literal true: a missing or malformed value is OFF. */
export function tenantOptedIn(settingsRow: { automations?: unknown } | null | undefined): boolean {
  return autosOf(settingsRow).wa_auto_messages === true;
}

/** Her chosen lead time, or the platform default. */
export function tenantLeadHours(settingsRow: { automations?: unknown } | null | undefined, cfg: AutoConfig): number {
  const v = Number((autosOf(settingsRow) as Autos)?.wa_auto_lead_hours);
  return (LEAD_HOUR_CHOICES as readonly number[]).includes(v) ? v : cfg.leadHours;
}

/** Will the automatic path really handle this business's messages? (The daily cron leaves them to it when true.) */
export function autoHandlesTenant(settingsRow: { automations?: unknown } | null | undefined, env: WaCloudEnv = process.env): boolean {
  return autoConfig(env).active && tenantOptedIn(settingsRow);
}

/** What the settings screen is told. Only `available: true` lets anything render, and only when the feature really sends. */
export function publicAutoStatus(env: WaCloudEnv = process.env): { available: boolean; leadHours?: number; monthlyCap?: number } {
  const cfg = autoConfig(env);
  if (!cfg.active) return { available: false };
  return { available: true, leadHours: cfg.leadHours, monthlyCap: tenantMonthlyCap(env) };
}

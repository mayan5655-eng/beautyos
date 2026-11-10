// lib/landingClaims.ts
//
// SERVER ONLY. What the public landing page (app/LandingPage.jsx) may claim about features that sit behind a deployment switch.
// The page is rendered per request on the server, so it reads the same environment the routes do: a claim appears the moment the
// feature is really on for EVERY business, and disappears the moment it is switched off. Nothing here is per business.
//
//   deposits       a booking deposit and a cancellation policy the client agrees to (lib/cancellationPolicy.ts). Needs Grow on for
//                  everyone (GROW_UI_ENABLED with no GROW_ALLOWED_TENANTS narrowing), live mode against GROW_ENV=production, and
//                  a configured payment page.
//                  Each business still connects her own Grow account, which the page says next to the claim.
//   depositBit     the deposit opens on the wallet page (card, Bit, Apple Pay, Google Pay: lib/grow/wallet.ts depositsOnWallet),
//                  so "בכרטיס או בביט" is true. Without it the deposit is Grow's card page only.
//
// Not here: the pre-visit intake gate (lib/intakeGate.ts) is a database feature with no deployment switch. Its migration
// (add_reschedule_intake_2026-11-09.sql) was verified in production on 2026-11-10, so the page states it plainly.

import { growUiEnabled, growMode } from './grow/adapter.ts';
import { growPlatformStatus } from './grow/config.ts';
import { depositsOnWallet } from './grow/wallet.ts';

type Env = Record<string, string | undefined>;

export type LandingClaims = { deposits: boolean; depositBit: boolean };

export function landingClaims(env: Env = process.env): LandingClaims {
  // tenantId null: true only when Grow is on with no allow-list, i.e. for every business, not a chosen few.
  // Production only: live mode against Grow's sandbox (GROW_ENV unset or 'sandbox') takes no real money, so it is not a claim.
  // Same reading as lib/grow/config.ts growPlatformStatus.
  const deposits = growUiEnabled(env, null) && growMode(env) === 'live' && growPlatformStatus(env).env === 'production' && growPlatformStatus(env).configured;
  return { deposits, depositBit: deposits && depositsOnWallet(env) };
}

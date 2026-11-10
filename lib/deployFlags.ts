// lib/deployFlags.ts
//
// SERVER ONLY. The deployment switches the browser cannot read (they are not NEXT_PUBLIC_), for one business:
//   grow      GROW_UI_ENABLED, narrowed by GROW_ALLOWED_TENANTS (lib/grow/adapter.ts growUiEnabled)
//   billing   BILLING_UI_ENABLED (lib/billing/adapter.ts billingUiEnabled)
// Automatic WhatsApp sending is a database switch, not an env one (lib/platformSettings.js); /api/feature-visibility adds it.
import { growUiEnabled } from './grow/adapter.ts';

type Env = Record<string, string | undefined>;

/** Same rule as lib/billing/adapter.ts billingUiEnabled, without pulling the billing adapters into every caller. */
export const billingUiOn = (env: Env = process.env): boolean => /^(1|true|on|yes)$/i.test((env.BILLING_UI_ENABLED || '').trim());

export function deployFlagsFor(tenantId: string | null, env: Env = process.env): { grow: boolean; billing: boolean } {
  return { grow: growUiEnabled(env, tenantId), billing: billingUiOn(env) };
}

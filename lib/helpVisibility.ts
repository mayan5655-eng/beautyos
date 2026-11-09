// lib/helpVisibility.ts
//
// Which parts of the help (lib/helpSections.ts HelpGate) are switched on for HER business (2026-11-09 owner rule: nothing that
// is not active may be shown, and that includes help text, the help chat's knowledge and the "▶ סרטון" links).
//
// Browser-safe: it reads only her settings row and the NEXT_PUBLIC_ switches. The server-only switches (Grow, billing, automatic
// WhatsApp sending) arrive as `deploy`: in the browser from /api/feature-visibility (app/useDeployFlags.js), on the server from
// lib/deployFlags.ts. A missing `deploy` value means OFF, so before the answer arrives nothing gated is shown.
import type { HelpOn } from './helpSections.ts';
import { isTabVisible, skinScanVisible, reelTemplatesVisible } from './featureFlags.ts';
import { referralsEnabled } from './referral.ts';
import { annualPlanEnabled } from './pricing.ts';
import { waitlistOffersVisible } from './waitlistFlag.js';
import { rebookVisible } from './reminders/rebookPlan.js';
import { giftVouchersVisible } from './giftVouchers.ts';
import { productsAllowed } from './products.ts';
import { reviewTwoStepOn } from './reviewRequests.ts';
import { monthlyPageOn } from './monthlyFull.ts';

export type DeployFlags = { grow?: boolean; billing?: boolean; autoSend?: boolean };
type Env = Record<string, string | undefined>;
type SettingsRow = Record<string, unknown> | null | undefined;

const nextPublic = (): Env => ({ NEXT_PUBLIC_REFERRALS: process.env.NEXT_PUBLIC_REFERRALS, NEXT_PUBLIC_ANNUAL_PLAN: process.env.NEXT_PUBLIC_ANNUAL_PLAN });

export function helpGatesFor(settings: SettingsRow, deploy: DeployFlags = {}, env: Env = nextPublic()): HelpOn {
  const s = (settings || {}) as never;
  const grow = deploy.grow === true;
  const bizReferral = referralsEnabled(env);
  const annual = annualPlanEnabled(env) && deploy.billing === true;
  const vouchers = giftVouchersVisible(s);
  return {
    grow,
    referral: bizReferral || annual,
    bizReferral,
    annual,
    autoSend: deploy.autoSend === true,
    voucherOnline: vouchers && grow,
    bot: !!String((settings as { green_api_instance?: unknown } | null)?.green_api_instance ?? '').trim(),
    waitlist: waitlistOffersVisible(s),
    rebook: rebookVisible(s),
    vouchers,
    products: productsAllowed(s),
    reviews: reviewTwoStepOn(s),
    monthly: monthlyPageOn(s),
    skinScan: skinScanVisible(s),
    leads: isTabVisible(s, 'leads'),
    advisor: isTabVisible(s, 'advisor'),
    packages: isTabVisible(s, 'packages'),
    reelTemplates: reelTemplatesVisible(s),
  };
}

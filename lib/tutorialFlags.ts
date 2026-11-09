// lib/tutorialFlags.ts
//
// Which of the deployment-switched tutorials may be shown (2026-11-09). Some videos on /tutorials show a feature that the deployment
// switches on as a whole: card clearing through Grow (GROW_UI_ENABLED, lib/grow/adapter.ts) and the business referral with the annual
// plan (NEXT_PUBLIC_REFERRALS, NEXT_PUBLIC_ANNUAL_PLAN). While a switch is off, its videos are HIDDEN, NOT DELETED: the files and the
// entries stay, and they come back with the switch. Read on the server only (the tutorials page and the help chat's prompt).
//
// GROW_ALLOWED_TENANTS is not applied here: /tutorials has no session, so with Grow on for some businesses only, the Grow videos show.
// /tutorials is rendered at build time, so a change to GROW_UI_ENABLED shows there after the next deploy (as the NEXT_PUBLIC_ ones do).
import { growUiEnabled } from './grow/adapter.ts';
import { referralsEnabled } from './referral.ts';
import { annualPlanEnabled } from './pricing.ts';
import type { TutorialFlag } from './helpSections.ts';

type Env = Record<string, string | undefined>;

export function tutorialFlagsOn(env: Env = process.env): Record<TutorialFlag, boolean> {
  return {
    grow: growUiEnabled(env),
    referral: referralsEnabled(env) || annualPlanEnabled(env),
  };
}

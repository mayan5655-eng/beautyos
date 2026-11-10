// lib/billing/service.ts
//
// The subscription logic for Kalmea's own billing, with every outside dependency injected (the database as a small repo, the two provider
// adapters, the clock), so the whole life cycle is exercised in tests without a network or a database.
//
// It builds ON the existing trial and gate, it does not replace them. The gate stays tenants.plan_status (lib/planState.ts,
// trial-state.sql): 'trial' | 'active' | 'expired' | 'paused'. This file only ever moves a tenant between those:
//   a successful charge        -> 'active'  (unblocks at once)
//   grace period over / ended  -> 'expired' (the system closes behind app/PlanBlockedScreen.jsx; nothing is ever deleted)
//   'paused' is an arrangement made by hand and is never touched here.
//
// Life cycle of a subscription (billing_subscriptions.status):
//   trialing   card saved during the trial; the first charge happens when the trial ends (looked at one day ahead, so the cron run before
//              the end charges her and she is never blocked for a few hours between the end of the trial and the next run)
//   active     paid; next_charge_at is when the next month is due
//   past_due   a charge failed. Retries on days 1, 3 and 5 after the first failure; the tenant keeps working. After GRACE_DAYS (7) she is
//              blocked through the existing gate. A successful payment unblocks immediately.
//   canceled   she cancelled: no more charges, she keeps what she paid for (ends_at), then the gate closes. Adding a card again resumes it.
//
// Money never touches Kalmea's database beyond amounts and provider references: no card number is ever stored, only a token reference.
//
// Two growth features, each behind its own flag and OFF by default (2026-11-08). With both off this file behaves exactly as before:
//   ANNUAL PLAN (NEXT_PUBLIC_ANNUAL_PLAN=1, lib/pricing.ts): billing_subscriptions.billing_period 'monthly' | 'annual'. An annual
//     period is ONE charge of annualPriceOf(sub.price) that pays 12 calendar months (addMonths(start, 12)); its payment row carries
//     period_months 12. She asks to switch (app/api/billing/period) and the switch waits in pending_period until her next renewal:
//     it is applied only when a trialing / active subscription comes due, never as an extra charge and never in the middle of a period
//     or of past-due retries. One success per period is the same unique index (subscription_id, period_start): a yearly period has one
//     start date. A monthly charge is also refused while a paid annual period still covers its date (coveredByAnnual).
//     With the flag off a pending switch is never applied; a subscription already annual keeps the year she agreed to.
//   REFERRAL FREE MONTHS (NEXT_PUBLIC_REFERRALS=1, lib/referral.ts): when a due charge comes up and she has an available free month,
//     the month is claimed (one compare-and-set update, plus a unique index of one month per subscription and period) and the charge
//     is skipped: no payment row, no invoice, her paid period moves one calendar month forward. The month is granted in succeed()
//     when a referred business's FIRST paid subscription charge goes through. Any referral error is logged and never stops a charge.
import type { PaymentsAdapter, InvoicingAdapter } from './adapter.ts';
import { CURRENCY } from './adapter.ts';
import { subscriptionDoc } from '../kalmeaBusiness.ts';
import { newUniqueIdentifier, groupIdentifierOf } from '../grow/tokenFlow.ts';
import { PLAN_PRICES, defaultPlanPrice, annualPriceOf, annualPlanEnabled, type AddonPack } from '../pricing.ts';
import { referralsEnabled, REFERRAL_HOLD_DAYS, REFERRAL_MAX_PER_YEAR, type ReferralRow, type CreditCandidate } from '../referral.ts';
import { isDemoTenantId } from '../demoTenants.ts';
import { LAUNCH_PRICE_CUTOFF_ISO } from '../ownerControl.ts';
import { periodMonth } from '../addonQuota.ts';
import { moneyAlert } from '../moneyAlert.js';

/** From lib/pricing.ts, the one place prices live. */
export const REGULAR_PRICE: number = PLAN_PRICES.regular;
export const RETRY_OFFSETS_DAYS = [1, 3, 5] as const;
export const GRACE_DAYS = 7;
export const TRIAL_LOOKAHEAD_HOURS = 24;
/** The trial banner invites her to add a card from this many days before the trial ends. */
export const INVITE_DAYS = 5;

const DAY = 24 * 60 * 60 * 1000;

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingPeriod = 'monthly' | 'annual';

export type Subscription = {
  id: string;
  tenant_id: string;
  price: number;
  status: SubStatus;
  next_charge_at: string | null;
  token_ref: string | null;
  card_last4: string | null;
  card_brand: string | null;
  failed_attempts: number;
  past_due_since: string | null;
  last_attempt_at: string | null;
  canceled_at: string | null;
  ends_at: string | null;
  /** add_referrals_annual_2026-11-08.sql. Absent before it runs = monthly. */
  billing_period?: BillingPeriod | null;
  /** A switch she asked for, applied at her next renewal (null = none). */
  pending_period?: BillingPeriod | null;
};

export type TenantRow = { id: string; name: string | null; plan_status: string | null; trial_ends_at: string | null; plan_price: number | string | null;
  /** Her signup date, which decides the launch price once LAUNCH_PRICE_CUTOFF_ISO is set. */
  created_at?: string | null;
  /** Her mobile, the payer Grow requires on every token charge (lib/grow/ops.ts chargeToken refuses without one). The same source as
   *  the card page (app/api/billing/card): settings.automations.owner_phone, else settings.business_phone. */
  phone?: string | null };

export type PaymentRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  kind: 'subscription' | 'manual' | 'addon';
  /** pending: saved before the provider was called. unknown: the provider's answer never settled (looked up again before any new charge). */
  status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  /** Grow's transactionUniqueIdentifier for this charge (null on manual payments and on rows from before it existed). */
  unique_identifier?: number | null;
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  attempt: number;
  provider: string;
  provider_payment_id: string | null;
  error: string | null;
  invoice_status: 'issued' | 'pending' | 'failed' | 'none';
  invoice_number: string | null;
  invoice_url: string | null;
  note: string | null;
  created_at: string;
  /** 12 on an annual charge (add_referrals_annual_2026-11-08.sql); absent / 1 on every monthly one. */
  period_months?: number | null;
  /** The purchase intent's id on an add-on charge (add_addon_request_id_2026-11-10.sql); absent before that migration. */
  request_id?: string | null;
};

export type BillingRepo = {
  getSub(tenantId: string): Promise<Subscription | null>;
  listSubs(): Promise<Subscription[]>;
  insertSub(row: Omit<Subscription, 'id'>): Promise<Subscription>;
  updateSub(id: string, patch: Partial<Subscription>): Promise<void>;
  /** Take the right to try this subscription now: true for exactly one of two concurrent runs. */
  claimAttempt(id: string, previous: string | null, now: string): Promise<boolean>;
  hasSucceeded(subId: string, periodStart: string): Promise<boolean>;
  /** The newest pending / unknown subscription charge of this period, if any. Optional: an older repo has none. */
  /** periodStart null: an open attempt of ANY period. */
  findOpenAttempt?(subId: string, periodStart: string | null): Promise<PaymentRecord | null>;
  insertPayment(row: Omit<PaymentRecord, 'id' | 'created_at'>): Promise<PaymentRecord>;
  updatePayment(id: string, patch: Partial<PaymentRecord>): Promise<void>;
  pendingInvoices(): Promise<PaymentRecord[]>;
  getTenant(tenantId: string): Promise<TenantRow | null>;
  setPlanStatus(tenantId: string, status: 'active' | 'expired'): Promise<void>;
  /** Credits an add-on pack after its charge succeeded (add_billing_addons.sql). Optional: absent = packs cannot be bought. */
  insertAddon?(row: { tenant_id: string; pack: string; units: number; usd_allowance: number; price: number; period_month: string; payment_id: string }): Promise<void>;
  /** The newest pending / unknown add-on charge of this pack created since `sinceIso`, if any. Optional: absent = no check. */
  findOpenAddon?(tenantId: string, packKey: string, sinceIso: string): Promise<PaymentRecord | null>;
  /** The add-on charge saved with this request id. `supported` false before add_addon_request_id_2026-11-10.sql (no column). Throws on any other error. */
  findAddonByRequest?(tenantId: string, requestId: string): Promise<{ supported: boolean; row: PaymentRecord | null }>;
  /** The newest add-on charge of this pack (any status) since `sinceIso`: the pre-migration match for a retried purchase. */
  findRecentAddon?(tenantId: string, packKey: string, sinceIso: string): Promise<PaymentRecord | null>;
  /** A succeeded ANNUAL subscription charge whose year covers this date (period_start <= date < period_end). Optional. */
  coveredByAnnual?(subId: string, periodStart: string): Promise<boolean>;
};

/** The referral tables (lib/billing/referralRepo.ts). Every method degrades to "nothing" before the migration runs. */
export type ReferralRepo = {
  /** The referral that brought this business, if any. */
  referralFor(referredTenantId: string): Promise<ReferralRow | null>;
  /** Succeeded subscription charges of this business with real money (kind 'subscription', amount > 0). */
  countPaidCharges(tenantId: string): Promise<number>;
  /** The referrer's months granted since a time (not voided). */
  countReferrerRewardsSince(referrerTenantId: string, sinceIso: string): Promise<number>;
  /** Inserts one month. false when that side of that referral already has one (the unique index answered). */
  insertReward(row: { referral_id: string; tenant_id: string; role: 'referrer' | 'referred'; trigger_payment_id: string; available_at: string }): Promise<boolean>;
  markRewarded(referralId: string, atIso: string): Promise<void>;
  /** Unused, unvoided months whose hold is over, oldest first, with the referral's status and the earning payment's status. */
  availableCredits(tenantId: string, nowIso: string): Promise<CreditCandidate[]>;
  /** Compare-and-set: true for exactly one caller, and only if no other month already covers this subscription and period. */
  claimCredit(rewardId: string, subId: string, periodStart: string, periodEnd: string, nowIso: string): Promise<boolean>;
  /** A month was already used for this subscription and period (a run that stopped between the claim and moving the date). */
  creditForPeriod(subId: string, periodStart: string): Promise<boolean>;
  voidReward(rewardId: string, reason: string, nowIso: string): Promise<void>;
};

export type BillingFlags = { referrals: boolean; annual: boolean };

export type Deps = {
  repo: BillingRepo; payments: PaymentsAdapter; invoicing: InvoicingAdapter; now?: () => Date; /** Draws a charge identifier (tests pin it). */ newIdentifier?: () => number;
  /** The referral tables; absent = no referral rewards at all. */
  referrals?: ReferralRepo;
  /** The two feature switches; default from the environment (both off unless exactly "1"). */
  flags?: Partial<BillingFlags>;
};

export function billingFlags(d: Pick<Deps, 'flags'>): BillingFlags {
  return { referrals: d.flags?.referrals ?? referralsEnabled(), annual: d.flags?.annual ?? annualPlanEnabled() };
}

const clock = (d: Deps) => (d.now || (() => new Date()))();
const iso = (d: Date) => d.toISOString();
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);

/** Calendar month arithmetic in UTC that clamps (31 Jan + 1 month = 28/29 Feb), so a month is never skipped. */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/** Her agreed price (tenants.plan_price) when one was set, else the launch price while it is open for her (lib/pricing.ts). */
export const priceOf = (tenant: Pick<TenantRow, 'plan_price' | 'created_at'> | null): number => {
  const p = Number(tenant?.plan_price);
  return Number.isFinite(p) && p > 0 ? p : defaultPlanPrice(tenant?.created_at, LAUNCH_PRICE_CUTOFF_ISO);
};

/**
 * The period the NEXT charge attempt of this subscription is for. A pending switch (annual flag on) applies to the next attempt, which
 * is never before the end of what she already paid: her renewal, or the retry of a period she has not paid. It becomes her plan at that
 * attempt (whatever its outcome), so the retries after a failed renewal are for the same period and amount; she may switch back while
 * past due, and the next retry follows. Without the flag (or before the migration) everything is monthly, except a subscription that is
 * already annual: she keeps the year she agreed to.
 */
export function chargePeriodOf(sub: Pick<Subscription, 'status' | 'billing_period' | 'pending_period'>, flags: Pick<BillingFlags, 'annual'>): BillingPeriod {
  const current: BillingPeriod = sub.billing_period === 'annual' ? 'annual' : 'monthly';
  if (!flags.annual || sub.status === 'canceled') return current;
  if (sub.pending_period === 'annual' || sub.pending_period === 'monthly') return sub.pending_period;
  return current;
}

export const periodMonthsOf = (p: BillingPeriod) => (p === 'annual' ? 12 : 1);

/** What one charge of this period costs: her monthly price, or ten of them for a year (lib/pricing.ts). */
export const chargeAmountOf = (monthly: number, p: BillingPeriod) => (p === 'annual' ? annualPriceOf(monthly) : monthly);

/** When the grace period ends for a past-due subscription (null when it is not past due). */
export function graceEndsAt(sub: Subscription): Date | null {
  const since = ms(sub.past_due_since);
  return Number.isFinite(since) ? new Date(since + GRACE_DAYS * DAY) : null;
}

/** When the next retry may run for a past-due subscription (null when the retries are used up). */
export function nextRetryAt(sub: Subscription): Date | null {
  const since = ms(sub.past_due_since);
  if (sub.status !== 'past_due' || !Number.isFinite(since)) return null;
  const offset = RETRY_OFFSETS_DAYS[sub.failed_attempts - 1];
  return offset === undefined ? null : new Date(since + offset * DAY);
}

async function makeActive(d: Deps, tenantId: string) {
  const t = await d.repo.getTenant(tenantId);
  // 'paused' is an arrangement, never overridden; 'active' needs nothing.
  if (t && (t.plan_status === 'expired' || t.plan_status === 'trial')) await d.repo.setPlanStatus(tenantId, 'active');
}

async function blockTenant(d: Deps, tenantId: string) {
  const t = await d.repo.getTenant(tenantId);
  if (t && (t.plan_status === 'active' || t.plan_status === 'trial')) await d.repo.setPlanStatus(tenantId, 'expired');
}

// ── one charge ───────────────────────────────────────────────────────────────

export type Outcome = 'charged' | 'failed' | 'skipped' | 'no-card' | 'credited';

/** The lookup of an in-flight charge failed: the charge was NOT started (fail closed). */
export class OpenAttemptLookupError extends Error {
  constructor(message: string) { super(`open-attempt lookup failed, nothing charged: ${message}`); this.name = 'OpenAttemptLookupError'; }
}

async function attempt(d: Deps, sub: Subscription, tenant: TenantRow | null, periodStart: Date, now: Date): Promise<Outcome> {
  const flags = billingFlags(d);
  const periodKey = iso(periodStart).slice(0, 10);
  if (await d.repo.hasSucceeded(sub.id, periodKey)) return 'skipped';
  // A paid year still covers this date: nothing is due (only asked when a year can exist at all).
  if ((flags.annual || sub.billing_period === 'annual') && d.repo.coveredByAnnual && (await d.repo.coveredByAnnual(sub.id, periodKey))) return 'skipped';
  // A charge for this period whose answer we never got (Grow did not reply, or answered "identifier already used"): ask Grow about THAT
  // identifier before anything else. Paid -> it counts; failed or never seen -> the next attempt may run; still unknown -> nothing is charged
  // again until it is settled, because a second identifier would be a second real charge.
  // FAIL CLOSED: if this lookup errors we cannot know whether a charge is already in flight, so nothing is charged. The error goes up
  // to the caller (runDue counts it as a failed run for this business and alerts; saveCard's routes answer an error), never 'cleared'.
  let open: PaymentRecord | null = null;
  try {
    open = d.repo.findOpenAttempt ? ((await d.repo.findOpenAttempt(sub.id, periodKey)) || (await d.repo.findOpenAttempt(sub.id, null))) : null;
  } catch (e) {
    console.error('[billing] open-attempt lookup failed for tenant', sub.tenant_id, (e as Error)?.message);
    await moneyAlert('billing:open-attempt', 'could not check for a charge in flight; nothing charged this run, the next run retries', { tenantId: sub.tenant_id }, { key: `${sub.id}:${periodKey}`, severity: 'warning' }).catch(() => {});
    throw new OpenAttemptLookupError((e as Error)?.message || 'lookup failed');
  }
  if (open) {
    const settled = await settleOpen(d, sub, tenant, open, periodStart, now);
    if (settled !== 'cleared') return settled;
  }
  if (!(await d.repo.claimAttempt(sub.id, sub.last_attempt_at, iso(now)))) return 'skipped';

  // A free month she earned (lib/referral.ts) is used instead of this charge. Only after the claim above, so of two runs at the same
  // moment exactly one gets here; the month itself is claimed with its own compare-and-set.
  // FAIL CLOSED (PR #27 review): any error here, a read of her months or of a month already claimed for this period, or a failure
  // after a claim, means NO charge for her this run. A read error is never "nothing there": a month may already cover this period
  // (claimed by a run that stopped before moving the date), and charging then would be a free month and a real charge. The run
  // skips her, raises a money alert, and the next run retries. (Before the migration the tables are missing, which the repo answers
  // as "no months" on purpose: no month can exist then.)
  if (flags.referrals && d.referrals) {
    let freed = false;
    try {
      freed = await applyFreeMonth(d, sub, periodStart, periodKey, now);
    } catch (e) {
      const claimed = e instanceof MonthClaimedError;
      console.error(`[billing] free month ${claimed ? 'claimed but the period did not move' : 'check failed'} for tenant`, sub.tenant_id, (e as Error)?.message);
      await moneyAlert('billing:referral', claimed ? 'free month claimed, period not moved yet; nothing charged, the next run finishes it' : 'free month check failed; nothing charged this run, the next run retries', { tenantId: sub.tenant_id }, { key: `${sub.id}:${periodKey}`, severity: 'warning' }).catch(() => {});
      return 'skipped';
    }
    if (freed) return 'credited';
  }

  const period = chargePeriodOf(sub, flags);
  const months = periodMonthsOf(period);
  const amount = chargeAmountOf(sub.price, period);
  const periodEnd = addMonths(periodStart, months);
  const attemptNo = sub.failed_attempts + 1;
  // period_months is written only on a yearly charge, so a monthly row is the same row as before the migration.
  const base = { tenant_id: sub.tenant_id, subscription_id: sub.id, kind: 'subscription' as const, amount, currency: CURRENCY, period_start: periodKey, period_end: iso(periodEnd).slice(0, 10), attempt: attemptNo, provider: 'card', note: null, ...(months === 12 ? { period_months: 12 } : {}) };
  // A pending switch this attempt applies becomes her plan now, so the retries of this period are for the same period. Written only
  // when there is a switch: a plain monthly attempt writes exactly what it wrote before the migration.
  if (flags.annual && sub.status !== 'canceled' && sub.pending_period) await d.repo.updateSub(sub.id, { billing_period: period, pending_period: null });

  if (!sub.token_ref) {
    await d.repo.insertPayment({ ...base, status: 'failed', provider_payment_id: null, error: 'no card on file', invoice_status: 'none', invoice_number: null, invoice_url: null });
    await d.repo.updateSub(sub.id, { status: 'past_due', failed_attempts: attemptNo, past_due_since: sub.past_due_since || iso(now), last_attempt_at: iso(now) });
    return 'no-card';
  }

  // The ledger row FIRST, with the identifier this charge will carry. A collision on the unique index draws another BEFORE Grow is called.
  let pay: PaymentRecord | null = null;
  let uid = 0;
  for (let tries = 0; tries < 5 && !pay; tries++) {
    uid = (d.newIdentifier || newUniqueIdentifier)();
    try {
      pay = await d.repo.insertPayment({ ...base, status: 'pending', provider_payment_id: null, error: null, invoice_status: 'none', invoice_number: null, invoice_url: null, unique_identifier: uid });
    } catch (e) {
      if (!/unique|duplicate|23505/i.test(String((e as Error)?.message))) throw e;
    }
  }
  if (!pay) throw new Error('could not draw a free charge identifier');

  const res = await d.payments.charge({
    tokenRef: sub.token_ref, amount, currency: CURRENCY, description: period === 'annual' ? 'מנוי שנתי לקלמיה' : 'מנוי קלמיה', idempotencyKey: `${sub.id}:${periodKey}`,
    uniqueIdentifier: uid, groupIdentifier: groupIdentifierOf(sub.id), fullName: tenant?.name || undefined,
    // Found 2026-10-21: without the payer's phone every live charge was refused by chargeToken before reaching Grow, so a good card
    // failed four times and the business was blocked after the grace days.
    phone: tenant?.phone || undefined,
  }).catch((e) => ({ ok: false as const, code: 'unreachable' as const, error: String(e?.message || e) }));

  if (res.ok) return succeed(d, sub, tenant, pay, res.providerPaymentId, periodEnd, now, res.invoiceNumber, res.invoiceUrl);

  if (res.code === 'duplicate' || (res.code === 'unreachable' && d.payments.lookup)) {
    // Grow saw this identifier already, or we lost its reply: the money may have moved. Look it up; never charge a new identifier blindly.
    const r = d.payments.lookup ? await d.payments.lookup(sub.token_ref, uid).catch(() => null) : null;
    if (r && r.ok && r.found && r.status === 'paid') return succeed(d, sub, tenant, pay, r.providerPaymentId || `uid:${uid}`, periodEnd, now);
    if (!(r && r.ok && (r.status === 'failed' || !r.found))) {
      await d.repo.updatePayment(pay.id, { status: 'unknown', error: `${res.code}: waiting for the provider` });
      await d.repo.updateSub(sub.id, { last_attempt_at: iso(now) });
      console.warn('[billing] charge outcome unknown for tenant', sub.tenant_id, 'identifier', uid); await moneyAlert('billing:unknown', 'subscription charge outcome unknown; check Grow', { tenantId: sub.tenant_id, identifier: uid }, { key: String(uid), severity: 'warning' });
      await keepWorkingInGrace(d, tenant, sub.tenant_id);
      return 'skipped';
    }
  }

  await d.repo.updatePayment(pay.id, { status: 'failed', error: String(res.error).slice(0, 200) });
  await d.repo.updateSub(sub.id, { status: 'past_due', failed_attempts: attemptNo, past_due_since: sub.past_due_since || iso(now), last_attempt_at: iso(now) });
  console.warn('[billing] charge failed for tenant', sub.tenant_id, 'attempt', attemptNo, res.code);
  await keepWorkingInGrace(d, tenant, sub.tenant_id);
  return 'failed';
}

/**
 * A business that saved a card during her trial, whose first charge failed (or is not settled yet), keeps working through the grace
 * days like any paying business (the header above, and the billing card's own words). Left on 'trial', the elapsed-trial rule closed
 * her the moment the trial ended, with the past-due notice hidden behind the closed screen (2026-11-02 audit). blockTenant() still
 * closes her once the grace days pass.
 */
async function keepWorkingInGrace(d: Deps, tenant: TenantRow | null, tenantId: string) {
  if (tenant?.plan_status === 'trial') await d.repo.setPlanStatus(tenantId, 'active');
}

async function succeed(d: Deps, sub: Subscription, tenant: TenantRow | null, pay: PaymentRecord, providerPaymentId: string, periodEnd: Date, now: Date, invoiceNumber?: string, invoiceUrl?: string, periodPatch: Partial<Subscription> = {}): Promise<Outcome> {
  // The provider issued its own document with the charge (Grow): keep it, and skip our invoicing call.
  const hasDoc = !!invoiceUrl && /^https:\/\//i.test(invoiceUrl);
  await d.repo.updatePayment(pay.id, { status: 'succeeded', provider_payment_id: providerPaymentId, error: null, ...(hasDoc ? { invoice_status: 'issued', invoice_number: invoiceNumber || null, invoice_url: invoiceUrl } : { invoice_status: 'pending' }) });
  await d.repo.updateSub(sub.id, { status: 'active', failed_attempts: 0, past_due_since: null, next_charge_at: iso(periodEnd), last_attempt_at: iso(now), canceled_at: null, ends_at: null, ...periodPatch });
  await makeActive(d, sub.tenant_id);
  if (!hasDoc) await issueInvoice(d, { ...pay, status: 'succeeded', provider_payment_id: providerPaymentId }, tenant);
  // A referred business's first paid charge earns both sides a free month. Never allowed to fail the charge that already succeeded.
  if (billingFlags(d).referrals && d.referrals) {
    await grantReferralMonths(d, sub.tenant_id, pay, now).catch(async (e) => {
      console.error('[billing] referral reward failed for tenant', sub.tenant_id, (e as Error)?.message);
      await moneyAlert('billing:referral', 'referral reward could not be granted after a successful charge', { tenantId: sub.tenant_id, paymentId: pay.id }, { key: String(pay.id), severity: 'warning' }).catch(() => {});
    });
  }
  return 'charged';
}

// ── referral free months ─────────────────────────────────────────────────────

/**
 * The referred business's charge `pay` just succeeded. If it is her FIRST paid subscription charge and she joined through an eligible
 * referral, both sides get one month, held for REFERRAL_HOLD_DAYS. Idempotent by the database: one month per side per referral, ever
 * (unique (referral_id, role)), so a retried or concurrent call can never grant twice. The referrer's cap is counted first; under a
 * race of two of her friends paying at the same second she can end one over the cap, never more (documented, accepted).
 */
export async function grantReferralMonths(d: Deps, tenantId: string, pay: Pick<PaymentRecord, 'id' | 'kind' | 'amount' | 'status'>, now: Date): Promise<'granted' | 'none'> {
  const r = d.referrals;
  if (!r || pay.kind !== 'subscription' || !(Number(pay.amount) > 0)) return 'none';
  const ref = await r.referralFor(tenantId);
  if (!ref || ref.status !== 'joined') return 'none';
  if (ref.referrer_tenant_id === tenantId || ref.referred_tenant_id !== tenantId) return 'none';
  if (isDemoTenantId(ref.referrer_tenant_id) || isDemoTenantId(tenantId)) return 'none';
  // Her FIRST paid charge only: this one must be the only one.
  if ((await r.countPaidCharges(tenantId)) !== 1) return 'none';
  const availableAt = iso(new Date(now.getTime() + REFERRAL_HOLD_DAYS * DAY));
  const mine = await r.insertReward({ referral_id: ref.id, tenant_id: tenantId, role: 'referred', trigger_payment_id: pay.id, available_at: availableAt });
  const given = await r.countReferrerRewardsSince(ref.referrer_tenant_id, iso(new Date(now.getTime() - 365 * DAY)));
  const hers = given < REFERRAL_MAX_PER_YEAR
    ? await r.insertReward({ referral_id: ref.id, tenant_id: ref.referrer_tenant_id, role: 'referrer', trigger_payment_id: pay.id, available_at: availableAt })
    : false;
  await r.markRewarded(ref.id, iso(now));
  return mine || hers ? 'granted' : 'none';
}

/**
 * Uses one free month for the charge due at periodStart, if she has one that still stands. true = the charge is skipped and her period
 * moved one calendar month forward (whatever her plan). A month whose earning charge is no longer 'succeeded' (refunded, voided) or whose
 * referral was voided is voided here, never used.
 */
class MonthClaimedError extends Error {}

async function applyFreeMonth(d: Deps, sub: Subscription, periodStart: Date, periodKey: string, now: Date): Promise<boolean> {
  const r = d.referrals!;
  const end = addMonths(periodStart, 1);
  const advance = async () => {
    try {
      await d.repo.updateSub(sub.id, { status: 'active', failed_attempts: 0, past_due_since: null, next_charge_at: iso(end), last_attempt_at: iso(now), canceled_at: null, ends_at: null });
      await makeActive(d, sub.tenant_id);
    } catch (e) {
      throw new MonthClaimedError(String((e as Error)?.message || e));
    }
  };
  // A month already taken for exactly this period (the run stopped before the date moved): finish moving it, never take a second one.
  if (await r.creditForPeriod(sub.id, periodKey)) { await advance(); return true; }
  for (const c of await r.availableCredits(sub.tenant_id, iso(now))) {
    if (c.referral_status === 'voided' || c.payment_status !== 'succeeded') {
      await r.voidReward(c.id, c.referral_status === 'voided' ? 'referral voided' : 'the charge that earned it no longer stands', iso(now));
      continue;
    }
    if (await r.claimCredit(c.id, sub.id, periodKey, iso(end).slice(0, 10), iso(now))) { await advance(); return true; }
    // Lost the claim: another run took this month, or another month already covers this period.
    if (await r.creditForPeriod(sub.id, periodKey)) { await advance(); return true; }
  }
  return false;
}

/** An earlier attempt for this period with no settled answer. 'cleared' lets a new attempt run. */
async function settleOpen(d: Deps, sub: Subscription, tenant: TenantRow | null, open: PaymentRecord, periodStart: Date, now: Date): Promise<Outcome | 'cleared'> {
  const uid = Number(open.unique_identifier);
  if (!sub.token_ref || !d.payments.lookup || !Number.isFinite(uid)) return 'skipped';
  const r = await d.payments.lookup(sub.token_ref, uid).catch(() => null);
  // The open charge keeps the period it was made for: a yearly one pays twelve months and its year is her plan. It never touches
  // pending_period (PR #27 review): the switch that made it yearly was already consumed when the charge was made (attempt()), so any
  // pending switch now is one she asked for AFTER it (say, back to monthly) and must wait for her next renewal.
  const yearly = Number(open.period_months) === 12;
  if (r && r.ok && r.found && r.status === 'paid') return succeed(d, sub, tenant, open, r.providerPaymentId || `uid:${uid}`, addMonths(periodStart, yearly ? 12 : 1), now, undefined, undefined, yearly ? { billing_period: 'annual' } : {});
  if (r && r.ok && (r.status === 'failed' || !r.found)) {
    await d.repo.updatePayment(open.id, { status: 'failed', error: 'settled: the provider has no successful charge' });
    return 'cleared';
  }
  return 'skipped';
}

async function issueInvoice(d: Deps, pay: PaymentRecord, tenant: TenantRow | null) {
  try {
    const doc = subscriptionDoc(pay.amount);
    const description = pay.kind === 'addon' ? 'תוספת לקלמיה' : 'מנוי קלמיה';
    const inv = await d.invoicing.issueInvoice({ docType: doc.docType, vatAmount: doc.vatAmount, tenantId: pay.tenant_id, businessName: tenant?.name || '', amount: pay.amount, currency: pay.currency, description, providerPaymentId: pay.provider_payment_id || pay.id });
    if (inv.ok) await d.repo.updatePayment(pay.id, { invoice_status: 'issued', invoice_number: inv.number, invoice_url: inv.url });
    else { console.warn('[billing] invoice not issued for payment', pay.id, inv.error); await d.repo.updatePayment(pay.id, { invoice_status: 'pending' }); }
  } catch (e) {
    // The charge stands; the invoice is retried by the next daily run.
    console.warn('[billing] invoice threw for payment', pay.id, (e as Error)?.message);
    await d.repo.updatePayment(pay.id, { invoice_status: 'pending' }).catch(() => {});
  }
}

// ── add-on packs ─────────────────────────────────────────────────────────────

export type BuyAddonResult =
  | { ok: true; payment: PaymentRecord; replay?: boolean }
  | { ok: false; reason: 'no-card' | 'declined' | 'pending' | 'not-configured' | 'unavailable' | 'in-progress'; error: string };

/** How long an open (pending / unknown) charge of the same pack blocks a new one: a double tap, a second tab, a retry. */
export const ADDON_OPEN_WINDOW_MS = 3 * 60 * 1000;
/** Before add_addon_request_id_2026-11-10.sql: a RETRIED request is matched to a charge of the same pack this recent. */
export const ADDON_RETRY_WINDOW_MS = 15 * 60 * 1000;

/** What a saved add-on charge means for the purchase that made it: the same answer every time it is asked again. */
export function addonOutcomeOf(row: PaymentRecord): BuyAddonResult {
  if (row.status === 'succeeded') return { ok: true, payment: row, replay: true };
  if (row.status === 'failed') return { ok: false, reason: 'declined', error: String(row.error || 'declined').slice(0, 200) };
  return { ok: false, reason: 'pending', error: 'waiting for the provider' };
}

const requestIndexClash = (e: unknown) => /billing_payments_tenant_request|request_id/i.test(String((e as Error)?.message)) && /unique|duplicate|23505/i.test(String((e as Error)?.message));
const requestColumnMissing = (e: unknown) => /request_id/i.test(String((e as Error)?.message)) && /does not exist|schema cache|42703|PGRST204/i.test(String((e as Error)?.message));

/**
 * She buys one add-on pack (lib/pricing.ts ADDON_PACKS) for THIS month: one charge to the card saved for her subscription, then the units are
 * credited (billing_addons), which the AI quota reads on the server. The same ledger discipline as the monthly charge: the payment row and its
 * unique identifier are saved BEFORE the provider is called, a lost or duplicate answer is looked up and never re-charged with a new
 * identifier, and the units are credited only for a charge the provider confirmed. An unsettled charge ('pending') credits nothing; the
 * operator settles it from the provider's records.
 */
export async function buyAddon(d: Deps, tenantId: string, pack: AddonPack, opts: { requestId?: string | null; retry?: boolean } = {}): Promise<BuyAddonResult> {
  if (!d.repo.insertAddon) return { ok: false, reason: 'unavailable', error: 'add-on packs are not set up' };
  const now = clock(d);
  // IDEMPOTENT BY REQUEST ID (2026-11-10): one purchase intent is one charge. The same id again (a double tap, a retry after a lost
  // answer, the sheet reopened) gets the outcome of the charge already saved with it, and nothing is charged again. A read error throws.
  const rid = opts.requestId || null;
  let tracked = false;
  if (rid && d.repo.findAddonByRequest) {
    const f = await d.repo.findAddonByRequest(tenantId, rid);
    tracked = f.supported;
    if (f.row) return addonOutcomeOf(f.row);
  }
  // Before the migration (no request_id column): a RETRY of an unresolved purchase is matched to the newest charge of the same pack in the
  // last 15 minutes, whatever its status, rather than risking a second charge for one intent.
  if (rid && !tracked && opts.retry && d.repo.findRecentAddon) {
    const recent = await d.repo.findRecentAddon(tenantId, pack.key, new Date(now.getTime() - ADDON_RETRY_WINDOW_MS).toISOString());
    if (recent) return addonOutcomeOf(recent);
  }
  const sub = await d.repo.getSub(tenantId);
  if (!sub || !sub.token_ref || sub.status === 'canceled') return { ok: false, reason: 'no-card', error: 'no saved card' };
  // A second request for the same pack while the first is still open (a double tap that reached another server instance, a second tab)
  // never draws a second charge: it is answered "in progress". A read failure throws (fail closed), so nothing is charged on a guess.
  if (d.repo.findOpenAddon) {
    const open = await d.repo.findOpenAddon(tenantId, pack.key, new Date(now.getTime() - ADDON_OPEN_WINDOW_MS).toISOString());
    if (open) return { ok: false, reason: 'in-progress', error: 'a charge for this pack is still open' };
  }
  const tenant = await d.repo.getTenant(tenantId);
  const month = periodMonth(now);
  const description = `תוספת לקלמיה: +${pack.units} ${pack.unitHe}`;
  const base = { tenant_id: tenantId, subscription_id: sub.id, kind: 'addon' as const, amount: pack.price, currency: CURRENCY, period_start: month, period_end: null, attempt: 1, provider: 'card', note: pack.key };

  let pay: PaymentRecord | null = null;
  let uid = 0;
  let withId = tracked && !!rid;
  for (let tries = 0; tries < 5 && !pay; tries++) {
    uid = (d.newIdentifier || newUniqueIdentifier)();
    try {
      pay = await d.repo.insertPayment({ ...base, ...(withId ? { request_id: rid } : {}), status: 'pending', provider_payment_id: null, error: null, invoice_status: 'none', invoice_number: null, invoice_url: null, unique_identifier: uid });
    } catch (e) {
      // The same request id reached another server at the same moment and saved its row first: answer with that row, never charge.
      if (withId && requestIndexClash(e) && d.repo.findAddonByRequest) {
        const f = await d.repo.findAddonByRequest(tenantId, rid!);
        if (f.row) return addonOutcomeOf(f.row);
        return { ok: false, reason: 'in-progress', error: 'the same request is being charged' };
      }
      if (withId && requestColumnMissing(e)) { withId = false; tries--; continue; }
      if (!/unique|duplicate|23505/i.test(String((e as Error)?.message))) throw e;
    }
  }
  if (!pay) throw new Error('could not draw a free charge identifier');
  const row = pay;

  const credit = async (providerPaymentId: string, invoiceNumber?: string, invoiceUrl?: string): Promise<BuyAddonResult> => {
    const hasDoc = !!invoiceUrl && /^https:\/\//i.test(invoiceUrl);
    await d.repo.updatePayment(row.id, { status: 'succeeded', provider_payment_id: providerPaymentId, error: null, ...(hasDoc ? { invoice_status: 'issued', invoice_number: invoiceNumber || null, invoice_url: invoiceUrl } : { invoice_status: 'pending' }) });
    await d.repo.insertAddon!({ tenant_id: tenantId, pack: pack.key, units: pack.units, usd_allowance: pack.usdPerPack, price: pack.price, period_month: month, payment_id: row.id });
    const done = { ...row, status: 'succeeded' as const, provider_payment_id: providerPaymentId };
    if (!hasDoc) await issueInvoice(d, done, tenant);
    return { ok: true, payment: done };
  };

  const res = await d.payments.charge({
    tokenRef: sub.token_ref, amount: pack.price, currency: CURRENCY, description, idempotencyKey: `addon:${row.id}`,
    uniqueIdentifier: uid, groupIdentifier: groupIdentifierOf(sub.id), fullName: tenant?.name || undefined, phone: tenant?.phone || undefined,
  }).catch((e) => ({ ok: false as const, code: 'unreachable' as const, error: String(e?.message || e) }));

  if (res.ok) return credit(res.providerPaymentId, res.invoiceNumber, res.invoiceUrl);

  if (res.code === 'duplicate' || (res.code === 'unreachable' && d.payments.lookup)) {
    // The money may have moved: look it up by the same identifier; never charge a new one blindly.
    const r = d.payments.lookup ? await d.payments.lookup(sub.token_ref, uid).catch(() => null) : null;
    if (r && r.ok && r.found && r.status === 'paid') return credit(r.providerPaymentId || `uid:${uid}`);
    if (!(r && r.ok && (r.status === 'failed' || !r.found))) {
      await d.repo.updatePayment(row.id, { status: 'unknown', error: `${res.code}: waiting for the provider` });
      console.warn('[billing] add-on charge outcome unknown for tenant', tenantId, 'identifier', uid); await moneyAlert('billing:unknown', 'add-on charge outcome unknown; check Grow', { tenantId, identifier: uid }, { key: String(uid), severity: 'warning' });
      return { ok: false, reason: 'pending', error: 'waiting for the provider' };
    }
  }

  await d.repo.updatePayment(row.id, { status: 'failed', error: String(res.error).slice(0, 200) });
  return { ok: false, reason: res.code === 'not-configured' ? 'not-configured' : 'declined', error: String(res.error).slice(0, 200) };
}

// ── saving a card ────────────────────────────────────────────────────────────

export type SaveCardResult = { subscription: Subscription; charged: Outcome | null };

/**
 * A card was saved on the provider's hosted page. Creates the subscription on first use, otherwise replaces the token. Charges at once only
 * when she is blocked or past due (she is paying to get back in); during a trial the first charge waits for the trial's end, and a business
 * that is already active (for example paying by hand) is not charged again.
 */
export async function saveCard(d: Deps, tenantId: string, card: { tokenRef: string; last4?: string; brand?: string }): Promise<SaveCardResult> {
  const now = clock(d);
  const tenant = await d.repo.getTenant(tenantId);
  let sub = await d.repo.getSub(tenantId);
  const cardFields = { token_ref: card.tokenRef, card_last4: card.last4 || null, card_brand: card.brand || null };

  if (!sub) {
    const trialEnd = tenant?.plan_status === 'trial' && tenant.trial_ends_at && ms(tenant.trial_ends_at) > now.getTime() ? iso(new Date(tenant.trial_ends_at)) : null;
    const blocked = tenant?.plan_status === 'expired';
    sub = await d.repo.insertSub({
      tenant_id: tenantId, price: priceOf(tenant),
      status: trialEnd ? 'trialing' : 'active',
      // trialing: the trial's end; blocked: due now; already active: a month from now (nothing is charged for the month she already has)
      next_charge_at: trialEnd || (blocked ? iso(now) : iso(addMonths(now, 1))),
      ...cardFields, failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null,
    });
    if (blocked) return { subscription: sub, charged: await attempt(d, sub, tenant, now, now) };
    return { subscription: await d.repo.getSub(tenantId) as Subscription, charged: null };
  }

  await d.repo.updateSub(sub.id, { ...cardFields });
  sub = { ...sub, ...cardFields };

  // Cancelled but still inside what she paid for: adding a card resumes it.
  if (sub.status === 'canceled' && sub.ends_at && ms(sub.ends_at) > now.getTime()) {
    const status: SubStatus = tenant?.plan_status === 'trial' ? 'trialing' : 'active';
    await d.repo.updateSub(sub.id, { status, canceled_at: null, ends_at: null });
    return { subscription: { ...sub, status, canceled_at: null, ends_at: null }, charged: null };
  }

  // Past due, cancelled and over, or blocked: she is paying to get back in. The new month starts now.
  const owes = sub.status === 'past_due' || sub.status === 'canceled' || tenant?.plan_status === 'expired';
  if (owes) {
    const fresh = { ...sub, failed_attempts: sub.status === 'past_due' ? sub.failed_attempts : 0 };
    const out = await attempt(d, fresh, tenant, now, now);
    return { subscription: (await d.repo.getSub(tenantId)) as Subscription, charged: out };
  }
  return { subscription: sub, charged: null };
}

// ── monthly / annual switch ──────────────────────────────────────────────────

export type PeriodSwitchResult =
  | { ok: true; billingPeriod: BillingPeriod; pendingPeriod: BillingPeriod | null; effectiveAt: string | null }
  | { ok: false; reason: 'off' | 'no-subscription' | 'canceled' };

/**
 * She asks for monthly or yearly. Nothing is charged here and nothing changes in the period she already paid for: the choice is saved as
 * pending_period and the daily run applies it at her next renewal (chargePeriodOf). Asking for the plan she already has clears a pending
 * switch. No proration and no refund: a switch is never an immediate charge.
 */
export async function requestPeriodSwitch(d: Deps, tenantId: string, period: BillingPeriod): Promise<PeriodSwitchResult> {
  if (!billingFlags(d).annual) return { ok: false, reason: 'off' };
  const sub = await d.repo.getSub(tenantId);
  if (!sub) return { ok: false, reason: 'no-subscription' };
  if (sub.status === 'canceled') return { ok: false, reason: 'canceled' };
  const current: BillingPeriod = sub.billing_period === 'annual' ? 'annual' : 'monthly';
  const pending = period === current ? null : period;
  await d.repo.updateSub(sub.id, { pending_period: pending });
  return { ok: true, billingPeriod: current, pendingPeriod: pending, effectiveAt: sub.next_charge_at };
}

// ── the daily run ────────────────────────────────────────────────────────────

export type RunSummary = { checked: number; charged: number; failed: number; blocked: number; invoices: number; skipped: number; notStarted?: number; /** Due charges a free month covered (only present when there were any). */ credited?: number };

export async function runDue(d: Deps, opts: { budgetMs?: number } = {}): Promise<RunSummary> {
  const now = clock(d);
  const sum: RunSummary = { checked: 0, charged: 0, failed: 0, blocked: 0, invoices: 0, skipped: 0 };
  // A time budget (real time, not the injected clock): charges are serial at a few seconds each, so a day with many trials ending
  // used to run until Vercel killed the function mid-list, with no summary. Past the budget no NEW business is started; the rest
  // are counted and charged on the next run (each charge is keyed by its period, so a late one is never doubled).
  const started = Date.now();
  const subs = await d.repo.listSubs();

  for (const [idx, sub] of subs.entries()) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) { sum.notStarted = subs.length - idx; break; }
    sum.checked++;
    try {
      const tenant = await d.repo.getTenant(sub.tenant_id);
      if (!tenant) { sum.skipped++; continue; }

      if (sub.status === 'canceled') {
        if (sub.ends_at && ms(sub.ends_at) <= now.getTime() && (tenant.plan_status === 'active' || tenant.plan_status === 'trial')) { await blockTenant(d, sub.tenant_id); sum.blocked++; }
        continue;
      }

      if (sub.status === 'past_due') {
        const grace = graceEndsAt(sub);
        if (grace && grace.getTime() <= now.getTime() && (tenant.plan_status === 'active' || tenant.plan_status === 'trial')) { await blockTenant(d, sub.tenant_id); sum.blocked++; }
        const retry = nextRetryAt(sub);
        if (retry && retry.getTime() <= now.getTime() && sub.token_ref) {
          // A retry for the period that failed: its key is the month that was due, so a charge that did go through is never repeated.
          const out = await attempt(d, sub, tenant, new Date(ms(sub.next_charge_at) || now.getTime()), now);
          if (out === 'charged') sum.charged++; else if (out === 'failed') sum.failed++; else if (out === 'credited') sum.credited = (sum.credited || 0) + 1; else sum.skipped++;
        }
        continue;
      }

      // trialing / active
      const due = ms(sub.next_charge_at);
      const horizon = now.getTime() + (sub.status === 'trialing' ? TRIAL_LOOKAHEAD_HOURS * 3600 * 1000 : 0);
      if (!Number.isFinite(due) || due > horizon) continue;
      const out = await attempt(d, sub, tenant, new Date(due), now);
      if (out === 'charged') sum.charged++; else if (out === 'failed' || out === 'no-card') sum.failed++; else if (out === 'credited') sum.credited = (sum.credited || 0) + 1; else sum.skipped++;
    } catch (e) {
      console.error('[billing] run failed for tenant', sub.tenant_id, (e as Error)?.message); await moneyAlert('billing:run', 'daily billing failed for a business', { tenantId: sub.tenant_id }, { key: String(sub.tenant_id) });
    }
  }

  // Invoices that could not be issued right after a charge.
  for (const pay of await d.repo.pendingInvoices()) {
    const tenant = await d.repo.getTenant(pay.tenant_id);
    await issueInvoice(d, pay, tenant);
    sum.invoices++;
  }
  return sum;
}

// ── cancel, and the owner's manual payment ───────────────────────────────────

export async function cancelSubscription(d: Deps, tenantId: string): Promise<{ ok: boolean; endsAt: string | null }> {
  const now = clock(d);
  const sub = await d.repo.getSub(tenantId);
  if (!sub || sub.status === 'canceled') return { ok: !!sub, endsAt: sub?.ends_at ?? null };
  // She keeps what she paid for: a trial runs to its end, an active month to its end, a past-due one to the end of its grace period.
  const endsAt = sub.status === 'past_due' ? (graceEndsAt(sub) || now) : new Date(Math.max(ms(sub.next_charge_at) || now.getTime(), now.getTime()));
  await d.repo.updateSub(sub.id, { status: 'canceled', canceled_at: iso(now), ends_at: iso(endsAt) });
  return { ok: true, endsAt: iso(endsAt) };
}

/**
 * The owner records that a business paid her directly: a manual payment is written, the paid period is extended by one month and the
 * tenant is unblocked. Creates the subscription (without a card) when there is none.
 */
export async function markPaidManually(d: Deps, tenantId: string, opts: { amount?: number; note?: string } = {}): Promise<{ subscription: Subscription; payment: PaymentRecord }> {
  const now = clock(d);
  const tenant = await d.repo.getTenant(tenantId);
  let sub = await d.repo.getSub(tenantId);
  if (!sub) {
    sub = await d.repo.insertSub({ tenant_id: tenantId, price: priceOf(tenant), status: 'active', next_charge_at: iso(now), token_ref: null, card_last4: null, card_brand: null, failed_attempts: 0, past_due_since: null, last_attempt_at: null, canceled_at: null, ends_at: null });
  }
  // The new month starts from the later of now and the end of what is already paid, so paying early never loses days.
  const paidThrough = sub.status === 'active' || sub.status === 'trialing' ? ms(sub.next_charge_at) : NaN;
  const start = new Date(Math.max(now.getTime(), Number.isFinite(paidThrough) ? paidThrough : 0));
  const end = addMonths(start, 1);
  const amount = Number.isFinite(opts.amount) && (opts.amount as number) > 0 ? (opts.amount as number) : sub.price;
  const payment = await d.repo.insertPayment({
    tenant_id: tenantId, subscription_id: sub.id, kind: 'manual', status: 'succeeded', amount, currency: CURRENCY,
    period_start: iso(start).slice(0, 10), period_end: iso(end).slice(0, 10), attempt: 0, provider: 'manual', provider_payment_id: null, error: null,
    invoice_status: 'none', invoice_number: null, invoice_url: null, note: (opts.note || 'שולם ישירות').slice(0, 200),
  });
  await d.repo.updateSub(sub.id, { status: 'active', next_charge_at: iso(end), failed_attempts: 0, past_due_since: null, canceled_at: null, ends_at: null });
  await makeActive(d, tenantId);
  return { subscription: { ...sub, status: 'active', next_charge_at: iso(end), failed_attempts: 0, past_due_since: null, canceled_at: null, ends_at: null }, payment };
}

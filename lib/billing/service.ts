// lib/billing/service.ts
//
// The subscription logic for Kalmea's own billing, with every outside dependency injected (the database as a small repo, the two provider
// adapters, the clock), so the whole life cycle is exercised in tests without a network or a database.
//
// It builds ON the existing trial and gate, it does not replace them. The gate stays tenants.plan_status (lib/planState.ts,
// trial-state.sql): 'trial' | 'active' | 'expired' | 'paused'. This file only ever moves a tenant between those:
//   a successful charge        -> 'active'  (unblocks at once)
//   grace period over / ended  -> 'expired' (the existing read-only gate; nothing is ever deleted)
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
import type { PaymentsAdapter, InvoicingAdapter } from './adapter.ts';
import { CURRENCY } from './adapter.ts';
import { subscriptionDoc } from '../kalmeaBusiness.ts';
import { newUniqueIdentifier, groupIdentifierOf } from '../grow/tokenFlow.ts';

export const REGULAR_PRICE = 499;
export const RETRY_OFFSETS_DAYS = [1, 3, 5] as const;
export const GRACE_DAYS = 7;
export const TRIAL_LOOKAHEAD_HOURS = 24;
/** The trial banner invites her to add a card from this many days before the trial ends. */
export const INVITE_DAYS = 5;

const DAY = 24 * 60 * 60 * 1000;

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

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
};

export type TenantRow = { id: string; name: string | null; plan_status: string | null; trial_ends_at: string | null; plan_price: number | string | null;
  /** Her mobile, the payer Grow requires on every token charge (lib/grow/ops.ts chargeToken refuses without one). The same source as
   *  the card page (app/api/billing/card): settings.automations.owner_phone, else settings.business_phone. */
  phone?: string | null };

export type PaymentRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  kind: 'subscription' | 'manual';
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
};

export type Deps = { repo: BillingRepo; payments: PaymentsAdapter; invoicing: InvoicingAdapter; now?: () => Date; /** Draws a charge identifier (tests pin it). */ newIdentifier?: () => number };

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

export const priceOf = (tenant: TenantRow | null): number => {
  const p = Number(tenant?.plan_price);
  return Number.isFinite(p) && p > 0 ? p : REGULAR_PRICE;
};

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

export type Outcome = 'charged' | 'failed' | 'skipped' | 'no-card';

async function attempt(d: Deps, sub: Subscription, tenant: TenantRow | null, periodStart: Date, now: Date): Promise<Outcome> {
  const periodKey = iso(periodStart).slice(0, 10);
  if (await d.repo.hasSucceeded(sub.id, periodKey)) return 'skipped';
  // A charge for this period whose answer we never got (Grow did not reply, or answered "identifier already used"): ask Grow about THAT
  // identifier before anything else. Paid -> it counts; failed or never seen -> the next attempt may run; still unknown -> nothing is charged
  // again until it is settled, because a second identifier would be a second real charge.
  const open = d.repo.findOpenAttempt ? ((await d.repo.findOpenAttempt(sub.id, periodKey)) || (await d.repo.findOpenAttempt(sub.id, null))) : null;
  if (open) {
    const settled = await settleOpen(d, sub, tenant, open, periodStart, now);
    if (settled !== 'cleared') return settled;
  }
  if (!(await d.repo.claimAttempt(sub.id, sub.last_attempt_at, iso(now)))) return 'skipped';
  const periodEnd = addMonths(periodStart, 1);
  const attemptNo = sub.failed_attempts + 1;
  const base = { tenant_id: sub.tenant_id, subscription_id: sub.id, kind: 'subscription' as const, amount: sub.price, currency: CURRENCY, period_start: periodKey, period_end: iso(periodEnd).slice(0, 10), attempt: attemptNo, provider: 'card', note: null };

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
    tokenRef: sub.token_ref, amount: sub.price, currency: CURRENCY, description: 'מנוי קלמיה', idempotencyKey: `${sub.id}:${periodKey}`,
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
      console.warn('[billing] charge outcome unknown for tenant', sub.tenant_id, 'identifier', uid);
      return 'skipped';
    }
  }

  await d.repo.updatePayment(pay.id, { status: 'failed', error: String(res.error).slice(0, 200) });
  await d.repo.updateSub(sub.id, { status: 'past_due', failed_attempts: attemptNo, past_due_since: sub.past_due_since || iso(now), last_attempt_at: iso(now) });
  console.warn('[billing] charge failed for tenant', sub.tenant_id, 'attempt', attemptNo, res.code);
  return 'failed';
}

async function succeed(d: Deps, sub: Subscription, tenant: TenantRow | null, pay: PaymentRecord, providerPaymentId: string, periodEnd: Date, now: Date, invoiceNumber?: string, invoiceUrl?: string): Promise<Outcome> {
  // The provider issued its own document with the charge (Grow): keep it, and skip our invoicing call.
  const hasDoc = !!invoiceUrl && /^https:\/\//i.test(invoiceUrl);
  await d.repo.updatePayment(pay.id, { status: 'succeeded', provider_payment_id: providerPaymentId, error: null, ...(hasDoc ? { invoice_status: 'issued', invoice_number: invoiceNumber || null, invoice_url: invoiceUrl } : { invoice_status: 'pending' }) });
  await d.repo.updateSub(sub.id, { status: 'active', failed_attempts: 0, past_due_since: null, next_charge_at: iso(periodEnd), last_attempt_at: iso(now), canceled_at: null, ends_at: null });
  await makeActive(d, sub.tenant_id);
  if (!hasDoc) await issueInvoice(d, { ...pay, status: 'succeeded', provider_payment_id: providerPaymentId }, tenant);
  return 'charged';
}

/** An earlier attempt for this period with no settled answer. 'cleared' lets a new attempt run. */
async function settleOpen(d: Deps, sub: Subscription, tenant: TenantRow | null, open: PaymentRecord, periodStart: Date, now: Date): Promise<Outcome | 'cleared'> {
  const uid = Number(open.unique_identifier);
  if (!sub.token_ref || !d.payments.lookup || !Number.isFinite(uid)) return 'skipped';
  const r = await d.payments.lookup(sub.token_ref, uid).catch(() => null);
  if (r && r.ok && r.found && r.status === 'paid') return succeed(d, sub, tenant, open, r.providerPaymentId || `uid:${uid}`, addMonths(periodStart, 1), now);
  if (r && r.ok && (r.status === 'failed' || !r.found)) {
    await d.repo.updatePayment(open.id, { status: 'failed', error: 'settled: the provider has no successful charge' });
    return 'cleared';
  }
  return 'skipped';
}

async function issueInvoice(d: Deps, pay: PaymentRecord, tenant: TenantRow | null) {
  try {
    const doc = subscriptionDoc(pay.amount);
    const inv = await d.invoicing.issueInvoice({ docType: doc.docType, vatAmount: doc.vatAmount, tenantId: pay.tenant_id, businessName: tenant?.name || '', amount: pay.amount, currency: pay.currency, description: 'מנוי קלמיה', providerPaymentId: pay.provider_payment_id || pay.id });
    if (inv.ok) await d.repo.updatePayment(pay.id, { invoice_status: 'issued', invoice_number: inv.number, invoice_url: inv.url });
    else { console.warn('[billing] invoice not issued for payment', pay.id, inv.error); await d.repo.updatePayment(pay.id, { invoice_status: 'pending' }); }
  } catch (e) {
    // The charge stands; the invoice is retried by the next daily run.
    console.warn('[billing] invoice threw for payment', pay.id, (e as Error)?.message);
    await d.repo.updatePayment(pay.id, { invoice_status: 'pending' }).catch(() => {});
  }
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

// ── the daily run ────────────────────────────────────────────────────────────

export type RunSummary = { checked: number; charged: number; failed: number; blocked: number; invoices: number; skipped: number };

export async function runDue(d: Deps): Promise<RunSummary> {
  const now = clock(d);
  const sum: RunSummary = { checked: 0, charged: 0, failed: 0, blocked: 0, invoices: 0, skipped: 0 };

  for (const sub of await d.repo.listSubs()) {
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
          if (out === 'charged') sum.charged++; else if (out === 'failed') sum.failed++; else sum.skipped++;
        }
        continue;
      }

      // trialing / active
      const due = ms(sub.next_charge_at);
      const horizon = now.getTime() + (sub.status === 'trialing' ? TRIAL_LOOKAHEAD_HOURS * 3600 * 1000 : 0);
      if (!Number.isFinite(due) || due > horizon) continue;
      const out = await attempt(d, sub, tenant, new Date(due), now);
      if (out === 'charged') sum.charged++; else if (out === 'failed' || out === 'no-card') sum.failed++; else sum.skipped++;
    } catch (e) {
      console.error('[billing] run failed for tenant', sub.tenant_id, (e as Error)?.message);
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

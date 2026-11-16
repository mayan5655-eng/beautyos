// lib/planState.ts
// Single source of truth for READING a tenant's trial / subscription state in
// the app layer. Pure and dependency-free, so the same derivation feeds the
// trial banner (Phase 2), the access gate screen (Phase 3) and the admin panel
// (Phase 4) instead of each one re-implementing the date maths.
//
// This mirrors public.tenant_effective_status() / public.is_tenant_active() in
// trial-state.sql. The duplication is deliberate and the split of duties is:
//   * SQL   ENFORCES  (restrictive RLS policies -- cannot be bypassed).
//   * TS    PRESENTS  (what she sees, and how loudly).
// Both must agree on the two rules below, so if you change one, change both:
//   1. A 'trial' whose trial_ends_at is in the past counts as 'expired'.
//   2. Anything unreadable or unrecognised FAILS OPEN, i.e. counts as active.
//
// On failing open: this is a billing gate, not a security boundary. Tenant
// isolation is enforced separately by the tenant_id RLS policies. Refusing to
// block on incomplete information costs a few free days; wrongly blocking costs
// a paying user access to her own calendar in the middle of her workday.

/** Length of a new tenant's trial. Matches the DEFAULT in trial-state.sql. */
export const TRIAL_LENGTH_DAYS = 30

/** At or below this many days remaining, the banner turns prominent. */
export const TRIAL_URGENT_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type PlanStatus = 'trial' | 'active' | 'expired' | 'paused'

/**
 * How loudly the UI should speak about the plan:
 *   none    - say nothing at all (a paying tenant must not be nagged)
 *   gentle  - a quiet line, most of the trial
 *   urgent  - prominent, the final TRIAL_URGENT_DAYS days
 *   blocked - access is on hold; the gate screen replaces the dashboard
 */
export type PlanTone = 'none' | 'gentle' | 'urgent' | 'blocked'

/** The plan-state columns as they arrive from the `tenants` row. */
export interface TenantPlanRow {
  plan_status?: string | null
  trial_started_at?: string | null
  trial_ends_at?: string | null
  plan_price?: number | string | null
  signup_source?: string | null
}

export interface PlanState {
  /** Effective status: an elapsed trial reports 'expired' even if stored as 'trial'. */
  status: PlanStatus
  /** Exactly what is stored in the column, before the elapsed-trial rule. */
  rawStatus: PlanStatus
  /** True only for a definitively 'expired' or 'paused' tenant. */
  isBlocked: boolean
  /** True while she is on a trial that has not run out. */
  isTrial: boolean
  /** Whole days left, rounded up, clamped at 0. null when not on a dated trial. */
  daysRemaining: number | null
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  /** Locked-in agreed price, in shekels. Informational only. */
  planPrice: number | null
  signupSource: string | null
  tone: PlanTone
}

/** Unrecognised or missing values fail OPEN, i.e. become 'active'. */
function normalizeStatus(value: string | null | undefined): PlanStatus {
  return value === 'trial' || value === 'active' || value === 'expired' || value === 'paused'
    ? value
    : 'active'
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Derive everything the UI needs from a tenants row.
 *
 * @param row A tenants row, or null/undefined when it could not be read. A
 *            missing row yields an unblocked 'active' state, by design.
 * @param now Injectable clock, so the phases can be unit-tested at any date.
 */
export function planState(
  row: TenantPlanRow | null | undefined,
  now: Date = new Date()
): PlanState {
  const rawStatus = normalizeStatus(row?.plan_status)
  const trialStartedAt = toDate(row?.trial_started_at)
  const trialEndsAt = toDate(row?.trial_ends_at)

  // Rule 1: an elapsed trial is expired, without needing a cron sweep. A trial
  // with NO end date cannot be judged elapsed, so it stays a trial (fail open).
  const elapsed =
    rawStatus === 'trial' && trialEndsAt !== null && trialEndsAt.getTime() < now.getTime()
  const status: PlanStatus = elapsed ? 'expired' : rawStatus

  const daysRemaining =
    rawStatus === 'trial' && trialEndsAt !== null
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY))
      : null

  const isBlocked = status === 'expired' || status === 'paused'
  const isTrial = status === 'trial'

  let tone: PlanTone = 'none'
  if (isBlocked) {
    tone = 'blocked'
  } else if (isTrial && daysRemaining !== null) {
    // With no day count there is no honest banner to show, so stay silent.
    tone = daysRemaining <= TRIAL_URGENT_DAYS ? 'urgent' : 'gentle'
  }

  return {
    status,
    rawStatus,
    isBlocked,
    isTrial,
    daysRemaining,
    trialStartedAt,
    trialEndsAt,
    planPrice: toNumber(row?.plan_price),
    signupSource: row?.signup_source ?? null,
    tone,
  }
}

// ── Her clients' grace period after the trial ends (2026-11-12) ─────────────
// When the trial ends without payment her dashboard closes, but her PUBLIC booking page keeps taking bookings for a few
// more days, so a client who found her today is not turned away and a campaign wave does not lock her out of her own
// clients on the same morning. Only a trial that ran out gets it: a paused account, or one stopped by hand long after its
// trial, gets none. The appointments booked in that time wait in her calendar for when she renews.
// NEXT_PUBLIC_BOOKING_GRACE_DAYS: 0 turns it off; missing or malformed = 7; capped at 14. Read on the server (the booking
// routes) and in the browser (her closed screen says until when), so it is a NEXT_PUBLIC_ variable.

export const PUBLIC_GRACE_DAYS_DEFAULT = 7
export const PUBLIC_GRACE_DAYS_MAX = 14

export function publicGraceDays(raw: string | undefined | null = process.env.NEXT_PUBLIC_BOOKING_GRACE_DAYS): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return PUBLIC_GRACE_DAYS_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return PUBLIC_GRACE_DAYS_DEFAULT
  return Math.min(PUBLIC_GRACE_DAYS_MAX, Math.max(0, Math.round(n)))
}

/** When her public page stops taking new bookings, or null when there is no grace for her (not expired, paused, no end date, grace off). */
export function publicGraceEndsAt(state: Pick<PlanState, 'status' | 'trialEndsAt'>, graceDays: number = publicGraceDays()): Date | null {
  if (state.status !== 'expired' || !state.trialEndsAt || !(graceDays > 0)) return null
  return new Date(state.trialEndsAt.getTime() + graceDays * MS_PER_DAY)
}

/** Is her plan closed but her public booking page still open (inside the grace period)? */
export function inPublicGrace(state: Pick<PlanState, 'status' | 'trialEndsAt'>, now: Date = new Date(), graceDays: number = publicGraceDays()): boolean {
  const end = publicGraceEndsAt(state, graceDays)
  return end !== null && now.getTime() < end.getTime()
}

/** Is her PUBLIC page closed to new bookings? Blocked and past any grace. Fails open like planState itself. */
export function publicBookingClosedFor(row: TenantPlanRow | null | undefined, now: Date = new Date(), graceDays: number = publicGraceDays()): boolean {
  const s = planState(row, now)
  return s.isBlocked && !inPublicGrace(s, now, graceDays)
}

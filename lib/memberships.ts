// lib/memberships.ts
//
// Client memberships ("מנויים ללקוחות"): she sells her client a monthly membership ("מניקור קבוע: 2 טיפולים בחודש ב-₪260"), charged
// every month on the client's saved card through HER OWN Grow account, with treatment credits the till redeems instead of charging.
// Behind NEXT_PUBLIC_CLIENT_MEMBERSHIPS (lib/membershipFlag.ts), and usable only while Grow is connected and the saved-card credentials
// are configured (membershipsReady). Every outside dependency is injected (the database as a repo, the Grow operations, the clock, the
// owner notification), so the whole life cycle runs in tests with no network and no database (test-client-memberships.ts).
//
// Nothing here is a second payments system. It is built from what the cancellation fees already proved with Grow:
//   card      Grow's hosted save-only page (lib/grow/ops.ts createTokenSession, chargeType 3: NO charge), the token arrives in the
//             webhook callback, is stored sealed in grow_card_tokens for this business and this client, and approveTransaction is sent.
//   charge    lib/grow/tokenCharge.ts chargeSavedCard: ownership checked from the database, the numeric transactionUniqueIdentifier
//             saved in grow_token_charges BEFORE Grow is called and never reused, 1010 and network failures looked up, never retried.
//   record    a grow_payments row (origin 'membership') and a receipt with legal_provider grow, exactly like a cancellation fee, so the
//             charge is in her cashier history and her revenue reports. Grow issues the legal document.
//
// The life cycle:
//   awaiting_consent  she created the enrollment from the client card; the client has not ticked the consent yet.
//   awaiting_card     the client ticked (the exact words are frozen on the row) and Grow's card page is open.
//   active            the card is saved; the first month is charged right away, then once per month on the anchor day.
//   past_due          a charge failed: retried 1, 3 and 5 days after the first failure (RETRY_OFFSETS_DAYS).
//   paused            she paused it, or the retries ran out, or the card is finally refused (a Grow final card error). No charges.
//   attention         Grow's answer was ambiguous (1010 or a network failure that a lookup could not settle). Nothing is charged
//                     again until she has looked in Grow and taps "retry" herself.
//   cancelled         by her or by the client (the client only after the plan's minimum months). The paid month runs to its end.
//
// Idempotency: one row per membership and period (membership_periods unique on membership_id + period_start). A second run, a second
// cron, a retry after a crash: the insert is refused and the existing row decides (paid: nothing; failed: one compare-and-set claim of
// the next attempt; charging or unknown: nothing). No client message is ever sent from here: she is told in the app, nobody else.

import { chargeSavedCard } from './grow/tokenCharge.ts';
import type { LedgerRepo, SavedCard } from './grow/tokenCharge.ts';
import type { GrowOps } from './grow/ops.ts';
import type { GrowRepo } from './grow/service.ts';
import type { CardTokenNotification } from './grow/tokenFlow.ts';
import { growText } from './grow/payload.ts';

// ── constants ────────────────────────────────────────────────────────────────

export const MEMBERSHIP_CONSENT_VERSION = 'membership-v1';
/** Days after the FIRST failure of a period on which it is tried again (the same rhythm as her own Kalmea subscription). */
export const RETRY_OFFSETS_DAYS = [1, 3, 5] as const;
/** The first attempt plus the three retries: after that the membership is paused and she is told. */
export const MAX_ATTEMPTS = 1 + RETRY_OFFSETS_DAYS.length;
/** A period still "charging" after this long was cut off mid-charge (the function died): Grow is not asked again on a guess. */
export const STALE_CHARGING_MS = 60 * 60 * 1000;
/** The ref that stands where an appointment id stands in the card ledger (grow_card_tokens / grow_token_charges / Grow's cField1). */
export const MEMBERSHIP_REF_PREFIX = 'mbr-';
export const membershipRef = (membershipId: string) => `${MEMBERSHIP_REF_PREFIX}${membershipId}`;
export const isMembershipRef = (ref: unknown) => String(ref || '').startsWith(MEMBERSHIP_REF_PREFIX) || /^mbr[0-9a-f]{32}$/i.test(String(ref || ''));
export const PLAN_LIMITS = { nameMax: 60, priceMax: 20000, creditsMax: 31, minMonthsMax: 24, servicesMax: 20 } as const;

// ── types ────────────────────────────────────────────────────────────────────

export type PlanFields = { name: string; price: number; credits: number; rollover: boolean; min_months: number; services: string[] };
export type Plan = PlanFields & { id: string; tenant_id: string; active: boolean; created_at?: string };
/** What the client agreed to, frozen on the membership when it is created: a later change of the plan never rewrites it. */
export type PlanSnapshot = PlanFields;

export type MembershipStatus = 'awaiting_consent' | 'awaiting_card' | 'active' | 'past_due' | 'paused' | 'attention' | 'cancelled';
export const LIVE_STATUSES: MembershipStatus[] = ['awaiting_consent', 'awaiting_card', 'active', 'past_due', 'paused', 'attention'];
export const BILLING_STATUSES: MembershipStatus[] = ['active', 'past_due'];

export type Membership = {
  id: string;
  tenant_id: string;
  client_id: string;
  client_name: string | null;
  client_phone: string | null;
  plan_id: string | null;
  plan: PlanSnapshot;
  status: MembershipStatus;
  pause_reason: string | null;
  consent_text: string | null;
  consent_version: string | null;
  consented_at: string | null;
  token_id: string | null;
  process_id: string | null;
  link_id: string;
  started_on: string | null;
  anchor_day: number | null;
  next_charge_on: string | null;
  next_retry_on: string | null;
  failed_attempts: number;
  cancelled_at: string | null;
  cancelled_by: string | null;
  /** The charge lock (chargeMembership): set by the one run that may charge now, cleared when it is done. Stale after STALE_CHARGING_MS. */
  charge_lock_at?: string | null;
  created_at?: string;
};

export type PeriodStatus = 'charging' | 'paid' | 'failed' | 'unknown';
export type Period = {
  id: string;
  tenant_id: string;
  membership_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  credits: number;
  status: PeriodStatus;
  attempts: number;
  first_failed_on: string | null;
  grow_payment_id: string | null;
  receipt_id: string | null;
  error: string | null;
  paid_at: string | null;
  updated_at?: string;
};

/**
 * One credit of one paid month. 'used' at the till (receipt_id) or by a paid Grow link (grow_payment_id). 'reserved' while a discounted
 * Grow link is payable: the credit is held so it cannot be used twice, and becomes 'used' when Grow's verified callback says the link
 * was paid (consumeReservation), however late. 'released' when the link expired or failed: the credit is free again.
 */
export type RedemptionStatus = 'reserved' | 'used' | 'released';
export type Redemption = {
  id: string; tenant_id: string; membership_id: string; period_id: string; client_id: string | null; seq: number; receipt_id: string | null; service: string | null;
  status?: RedemptionStatus; grow_payment_id?: string | null; reserved_until?: string | null; created_at?: string;
};
/** A Grow link stays payable LINK_LIFETIME_HOURS (24, lib/grow/wallet.ts): its credit is held a little longer than that. */
export const RESERVATION_HOURS = 25;
/** Between holding the credit and Grow answering with the link: a hold that never got its link frees itself after this. */
export const RESERVATION_OPEN_MINUTES = 15;

export type StoredToken = { id: string; tenant_id: string; client_id: string | null; token_ref: string; token_encrypted?: boolean };

export type MembershipRepo = LedgerRepo & {
  getAccount(tenantId: string): Promise<{ user_id: string; enabled: boolean } | null>;
  businessName(tenantId: string): Promise<string>;
  listPlans(tenantId: string): Promise<Plan[]>;
  getPlan(tenantId: string, planId: string): Promise<Plan | null>;
  insertPlan(row: Omit<Plan, 'id' | 'created_at'>): Promise<Plan>;
  updatePlan(tenantId: string, planId: string, patch: Partial<Plan>): Promise<Plan | null>;
  getClient(tenantId: string, clientId: string): Promise<{ id: string; name: string | null; phone: string | null } | null>;
  insertMembership(row: Omit<Membership, 'id' | 'created_at'>): Promise<Membership>;
  getMembership(tenantId: string, membershipId: string): Promise<Membership | null>;
  findMembershipByLink(linkId: string): Promise<Membership | null>;
  findMembershipByProcess(processId: string): Promise<Membership | null>;
  listMemberships(tenantId: string, f?: { clientId?: string; statuses?: MembershipStatus[] }): Promise<Membership[]>;
  /** Compare-and-set: changes the row only while its status is one of `from` (when given). Null when nothing changed. */
  updateMembership(tenantId: string, membershipId: string, patch: Partial<Membership>, from?: MembershipStatus[]): Promise<Membership | null>;
  /** Across businesses, for the daily run: active ones due on or before `today`, past-due ones whose retry is due. */
  listDue(today: string): Promise<Membership[]>;
  /** Periods still "charging" whose last change is before `beforeIso` (cut off mid-charge). */
  listStaleCharging(beforeIso: string): Promise<Period[]>;
  /** Null when the membership already has a row for that period start (the unique index). */
  insertPeriod(row: Omit<Period, 'id' | 'updated_at'>): Promise<Period | null>;
  getPeriodByStart(tenantId: string, membershipId: string, periodStart: string): Promise<Period | null>;
  /** Compare-and-set on status (and attempts when given). Null when the row moved meanwhile. */
  transitionPeriod(tenantId: string, periodId: string, from: PeriodStatus[], patch: Partial<Period>, expectAttempts?: number): Promise<Period | null>;
  listPeriods(tenantId: string, membershipIds: string[]): Promise<Period[]>;
  listRedemptions(tenantId: string, membershipIds: string[]): Promise<Redemption[]>;
  /** 'seq': that credit number of that period is taken (another device). 'receipt': this receipt already used a credit. */
  insertRedemption(row: Omit<Redemption, 'id' | 'created_at'>): Promise<{ row: Redemption | null; conflict: 'seq' | 'receipt' | null }>;
  findRedemptionByReceipt(tenantId: string, receiptId: string): Promise<Redemption | null>;
  findRedemptionByPayment(tenantId: string, paymentId: string): Promise<Redemption | null>;
  /** Compare-and-set on status. Null when it moved meanwhile (or a unique index refused the new period/seq). */
  updateRedemption(tenantId: string, redemptionId: string, from: RedemptionStatus[], patch: Partial<Redemption>): Promise<Redemption | null>;
  /** reserved -> released for holds whose time ran out (one membership, or every business for the daily run). Returns how many. */
  releaseExpiredReservations(nowIso: string, scope?: { tenantId: string; membershipId: string }): Promise<number>;
  /** Across businesses, for the daily run: holds that carry a Grow payment, to settle by that payment's state. */
  listOpenReservations(): Promise<Redemption[]>;
  /** The Grow payment's own state (status and receipt), tenant-scoped. */
  paymentState(tenantId: string, paymentId: string): Promise<{ status: string; receipt_id: string | null } | null>;
  /**
   * The charge lock: sets charge_lock_at=now ONLY while the row still has exactly the state this run read (status, next_charge_on,
   * next_retry_on, failed_attempts) and no fresh lock is held. Null when anything moved: the run skips.
   */
  claimCharge(tenantId: string, read: Membership, nowIso: string, staleBeforeIso: string): Promise<Membership | null>;
  insertToken(row: { tenant_id: string; client_id: string; appointment_id: string; token_ref: string; token_encrypted: boolean; card_last4: string | null; card_brand: string | null }): Promise<{ id: string }>;
  getToken(tenantId: string, tokenId: string): Promise<StoredToken | null>;
};

export type OwnerNotice = { tenantId: string; title: string; body: string };

export type MembershipDeps = {
  repo: MembershipRepo;
  grow: GrowRepo;
  ops: GrowOps;
  /** Seals a card token before it is stored and opens it before it is charged (AES-256-GCM, like every other token). */
  seal?: { encrypt(plain: string): string; decrypt(sealed: string): string };
  /** Where Grow posts the token (our /api/grow/webhook). */
  notifyUrl?: string;
  /** A random secret: the grow_payments notify token and the link id of a new membership. */
  newToken: () => string;
  /** Test hook: the identifier generator for token charges. */
  newChargeId?: () => number;
  /** In the app (and push) to HER only. Never a message to a client. */
  notify?: (n: OwnerNotice) => Promise<void>;
  now?: () => Date;
};

const clock = (d: { now?: () => Date }) => (d.now || (() => new Date()))();
const round2 = (n: number) => Math.round(n * 100) / 100;
const tell = async (d: MembershipDeps, n: OwnerNotice) => { try { await d.notify?.(n); } catch (e) { console.warn('[memberships] owner notice failed:', (e as Error)?.message); } };

// ── dates (Israel calendar days, YYYY-MM-DD) ─────────────────────────────────

export const israelDay = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const parse = (ymd: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null; };
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

export function addDays(ymd: string, n: number): string {
  const p = parse(ymd);
  if (!p) return ymd;
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The next period start, one month on, kept on her anchor day (the 31st becomes the 28th/29th/30th, then the 31st again). */
export function nextPeriodStart(ymd: string, anchorDay?: number | null): string {
  const p = parse(ymd);
  if (!p) return ymd;
  const y = p.mo === 12 ? p.y + 1 : p.y;
  const mo = p.mo === 12 ? 1 : p.mo + 1;
  const want = Math.max(1, Math.min(31, Number(anchorDay) || p.d));
  return `${y}-${pad(mo)}-${pad(Math.min(want, daysIn(y, mo)))}`;
}

/** DD/MM/YYYY for her and for the client. */
export const dayHe = (ymd: string | null | undefined) => { const p = parse(String(ymd || '')); return p ? `${pad(p.d)}/${pad(p.mo)}/${p.y}` : ''; };

// ── plans ────────────────────────────────────────────────────────────────────

export function sanitizePlan(raw: unknown): { ok: true; plan: PlanFields } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = String(r.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'צריך לתת למנוי שם' };
  if (name.length > PLAN_LIMITS.nameMax) return { ok: false, error: `שם המנוי ארוך מדי (עד ${PLAN_LIMITS.nameMax} תווים)` };
  const price = round2(Number(r.price));
  if (!Number.isFinite(price) || price < 1) return { ok: false, error: 'המחיר החודשי צריך להיות לפחות ₪1' };
  if (price > PLAN_LIMITS.priceMax) return { ok: false, error: 'המחיר החודשי גבוה מדי' };
  const credits = Math.floor(Number(r.credits));
  if (!Number.isFinite(credits) || credits < 1 || credits > PLAN_LIMITS.creditsMax) return { ok: false, error: `מספר הטיפולים בחודש צריך להיות בין 1 ל-${PLAN_LIMITS.creditsMax}` };
  const minRaw = r.min_months === '' || r.min_months == null ? 0 : Math.floor(Number(r.min_months));
  if (!Number.isFinite(minRaw) || minRaw < 0 || minRaw > PLAN_LIMITS.minMonthsMax) return { ok: false, error: `התחייבות מינימלית: בין 0 ל-${PLAN_LIMITS.minMonthsMax} חודשים` };
  const list = Array.isArray(r.services) ? r.services : [];
  const services = [...new Set(list.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter((s) => s && s.length <= 80))].slice(0, PLAN_LIMITS.servicesMax);
  return { ok: true, plan: { name, price, credits, rollover: r.rollover === true || r.rollover === 'true' || r.rollover === 1, min_months: minRaw, services } };
}

export const snapshotOf = (p: PlanFields): PlanSnapshot => ({ name: p.name, price: round2(Number(p.price)), credits: Number(p.credits), rollover: !!p.rollover, min_months: Number(p.min_months) || 0, services: [...(p.services || [])] });

const treatmentsHe = (n: number) => (n === 1 ? 'טיפול אחד' : `${n} טיפולים`);
const monthsHe = (n: number) => (n === 1 ? 'חודש אחד' : `${n} חודשים`);

/** One line for her lists: "2 טיפולים בחודש ב-₪260". */
export const planLineHe = (p: Pick<PlanFields, 'price' | 'credits'>) => `${treatmentsHe(Number(p.credits))} בחודש ב-₪${round2(Number(p.price))}`;

/**
 * The exact words the client ticks. Frozen on the membership with the version and the moment she agreed (consent_text), like the
 * cancellation-policy consents: what she saw is what can be shown later. Warm, feminine, no dashes, and never the word for a legal receipt.
 */
export function consentTextHe(p: PlanSnapshot, businessName: string): string {
  const biz = String(businessName || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'העסק';
  const services = p.services.length ? ` (${p.services.join(', ')})` : '';
  const rollover = p.rollover
    ? 'טיפול שלא ניצלתי עובר לחודש הבא בלבד.'
    : 'טיפול שלא ניצלתי באותו חודש לא עובר לחודש הבא.';
  const term = p.min_months > 0
    ? `ההתחייבות היא ל-${monthsHe(p.min_months)} לפחות, ואחריהם אפשר לבטל בכל רגע מהקישור הזה.`
    : 'אפשר לבטל בכל רגע מהקישור הזה.';
  return `אני מאשרת הצטרפות למנוי "${p.name}" אצל ${biz}: ${treatmentsHe(p.credits)} בחודש${services}, בחיוב של ₪${round2(p.price)} בכל חודש בכרטיס האשראי שאשמור עכשיו, דרך חברת הסליקה Grow. החיוב הראשון יתבצע מיד עם שמירת הכרטיס, והבאים בכל חודש באותו תאריך, עד שהמנוי יבוטל. ${rollover} ${term} אחרי ביטול המנוי ממשיך עד סוף החודש ששולם. אני מאשרת לשמור את פרטי האשראי שלי עבור החיובים האלה.`;
}

// ── availability ─────────────────────────────────────────────────────────────

/**
 * Whether memberships exist for this business at all: the code switch, the Grow screens, her Grow account connected and switched on,
 * and the saved-card flows configured on this deployment (live: tokenCredentials(); mock: only where mock Grow is allowed, never on
 * production). Anything missing: nothing is shown, not a card, not a hint.
 */
export function membershipsReady(i: { flag: boolean; growUi: boolean; tokenFlows: boolean; account: { enabled: boolean } | null; demo?: boolean }): boolean {
  return i.flag && i.growUi && i.tokenFlows && !i.demo && !!i.account && i.account.enabled === true;
}

// ── enrollment ───────────────────────────────────────────────────────────────

export type EnrollResult = { ok: true; membership: Membership } | { ok: false; code: 'no-plan' | 'no-client' | 'exists' | 'not-connected'; error: string; membership?: Membership };

/** From the client card, "צירוף למנוי": an enrollment waiting for the client's own tick. Nothing is charged and nothing is sent. */
export async function createEnrollment(d: MembershipDeps, i: { tenantId: string; clientId: string; planId: string }): Promise<EnrollResult> {
  const [plan, client, account] = await Promise.all([d.repo.getPlan(i.tenantId, i.planId), d.repo.getClient(i.tenantId, i.clientId), d.repo.getAccount(i.tenantId)]);
  if (!account || !account.enabled) return { ok: false, code: 'not-connected', error: 'כדי לצרף למנוי צריך שחיבור ה-Grow יהיה פעיל' };
  if (!plan || !plan.active || plan.tenant_id !== i.tenantId) return { ok: false, code: 'no-plan', error: 'המנוי הזה לא נמצא או שהוא כבוי' };
  if (!client) return { ok: false, code: 'no-client', error: 'הלקוחה לא נמצאה' };
  const live = await d.repo.listMemberships(i.tenantId, { clientId: String(client.id), statuses: LIVE_STATUSES });
  if (live.length) return { ok: false, code: 'exists', error: 'ללקוחה כבר יש מנוי פעיל או ממתין', membership: live[0] };
  const membership = await d.repo.insertMembership({
    tenant_id: i.tenantId, client_id: String(client.id), client_name: client.name || null, client_phone: client.phone || null, plan_id: plan.id, plan: snapshotOf(plan),
    status: 'awaiting_consent', pause_reason: null, consent_text: null, consent_version: null, consented_at: null, token_id: null, process_id: null,
    link_id: d.newToken(), started_on: null, anchor_day: null, next_charge_on: null, next_retry_on: null, failed_attempts: 0, cancelled_at: null, cancelled_by: null,
  });
  return { ok: true, membership };
}

export type StartResult = { ok: true; url: string } | { ok: false; code: 'gone' | 'consent' | 'changed' | 'not-connected' | 'step-failed'; error: string };

/**
 * The client, on her link, ticked the consent and pressed "save the card". The words are compared with the ones this membership shows
 * (computed from its frozen snapshot), then frozen on the row ONCE (a second press never rewrites them), and Grow's save-only card page
 * opens. Nothing is charged here.
 */
export async function startCardPage(d: MembershipDeps, i: { linkId: string; agree: boolean; consentText: string; returnUrl: string }): Promise<StartResult> {
  const m = await d.repo.findMembershipByLink(i.linkId);
  if (!m || (m.status !== 'awaiting_consent' && m.status !== 'awaiting_card')) return { ok: false, code: 'gone', error: 'הקישור הזה כבר לא פעיל' };
  if (i.agree !== true) return { ok: false, code: 'consent', error: 'כדי להמשיך צריך לאשר את תנאי המנוי' };
  const shown = m.consent_text || consentTextHe(m.plan, await d.repo.businessName(m.tenant_id));
  if (String(i.consentText || '').trim() !== shown) return { ok: false, code: 'changed', error: 'התנאים בדף התעדכנו. רענני את הדף וקראי אותם שוב.' };
  const account = await d.repo.getAccount(m.tenant_id);
  if (!account || !account.enabled) return { ok: false, code: 'not-connected', error: 'ההצטרפות לא זמינה כרגע. אפשר לפנות לבעלת העסק.' };
  let cur = m;
  if (!m.consented_at) {
    const frozen = await d.repo.updateMembership(m.tenant_id, m.id, { consent_text: shown, consent_version: MEMBERSHIP_CONSENT_VERSION, consented_at: clock(d).toISOString(), status: 'awaiting_card' }, ['awaiting_consent']);
    cur = frozen || (await d.repo.getMembership(m.tenant_id, m.id)) || m;
  }
  const r = await d.ops.createTokenSession({
    tenantId: m.tenant_id, userId: account.user_id, appointmentId: membershipRef(m.id), returnUrl: i.returnUrl, mode: 'save_only',
    fullName: m.client_name || '', phone: String(m.client_phone || ''), notifyUrl: d.notifyUrl,
  });
  if (!r.ok) return { ok: false, code: 'step-failed', error: 'לא הצלחנו לפתוח את הדף המאובטח. נסי שוב בעוד רגע.' };
  // A later press opens a NEW Grow page (Grow's page lasts minutes): the process id moves to it, so its callback finds this membership.
  await d.repo.updateMembership(m.tenant_id, cur.id, { process_id: r.processId || null, status: 'awaiting_card' }, ['awaiting_consent', 'awaiting_card']);
  return { ok: true, url: r.url };
}

export type TokenResult = { status: 'saved' | 'already-saved' | 'unknown-process' | 'mismatch' | 'failed'; membership?: Membership };

/**
 * Grow's callback after the client typed the card on the save-only page (the token's first transaction). Trusted only when the process
 * id is one this code opened for a membership AND the tenant and ref we echoed (cField2 / cField1) are that membership's. The token is
 * sealed and bound to that business and that client (from OUR row, never from the request), then approveTransaction is sent.
 */
export async function onMembershipCardToken(d: MembershipDeps, n: CardTokenNotification, approve?: () => Promise<void>): Promise<TokenResult> {
  const m = n.processId ? await d.repo.findMembershipByProcess(n.processId) : null;
  if (!m) return { status: 'unknown-process' };
  const tenantRef = m.tenant_id.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  const ref = growText(membershipRef(m.id).replace(/-/g, ''), 60);
  if ((n.tenantRef && n.tenantRef !== tenantRef) || (n.appointmentRef && n.appointmentRef !== ref)) return { status: 'mismatch' };
  if (m.token_id) { if (approve) await approve().catch(() => {}); return { status: 'already-saved', membership: m }; }
  if (m.status !== 'awaiting_card' || !m.consented_at) return { status: 'failed' };
  const saved = await saveMembershipCard(d, m, { tokenRef: n.cardToken, last4: n.last4, brand: n.brand });
  if (!saved) return { status: 'failed' };
  if (approve) await approve().catch((e) => console.warn('[memberships] approveTransaction failed:', (e as Error)?.message));
  return { status: 'saved', membership: saved };
}

/** Stores the sealed card and makes the membership active, due today. Shared by the Grow callback and the mock card page. */
export async function saveMembershipCard(d: MembershipDeps, m: Membership, c: { tokenRef: string; last4?: string; brand?: string }): Promise<Membership | null> {
  if (!c.tokenRef || !m.consented_at) return null;
  const sealed = d.seal ? d.seal.encrypt(c.tokenRef) : c.tokenRef;
  const token = await d.repo.insertToken({ tenant_id: m.tenant_id, client_id: m.client_id, appointment_id: membershipRef(m.id), token_ref: sealed, token_encrypted: !!d.seal, card_last4: c.last4 || null, card_brand: c.brand || null });
  const today = israelDay(clock(d));
  const p = parse(today);
  const active = await d.repo.updateMembership(m.tenant_id, m.id, { token_id: token.id, status: 'active', started_on: today, anchor_day: p ? p.d : null, next_charge_on: today, next_retry_on: null, failed_attempts: 0 }, ['awaiting_card']);
  if (!active) return null;
  await tell(d, { tenantId: m.tenant_id, title: 'מנוי חדש ✦', body: `${m.client_name || 'לקוחה'} הצטרפה למנוי "${m.plan.name}" ושמרה כרטיס. החודש הראשון מחויב עכשיו.` });
  return active;
}

// ── the monthly charge ───────────────────────────────────────────────────────

export type ChargeOutcome =
  | { outcome: 'paid'; periodId: string; receiptId: string | null }
  | { outcome: 'failed'; periodId: string; retryOn: string | null; paused: boolean }
  | { outcome: 'unknown'; periodId: string }
  | { outcome: 'skipped' | 'not-due' | 'in-progress' | 'already-paid' | 'not-connected' };

/** Opens a stored token. Null when it cannot be opened (sealed but no key): nothing is charged then. */
function openCard(d: MembershipDeps, t: StoredToken): SavedCard | null {
  try {
    const token = t.token_encrypted ? (d.seal ? d.seal.decrypt(t.token_ref) : '') : t.token_ref;
    return token ? { id: t.id, tenant_id: t.tenant_id, client_id: t.client_id, token } : null;
  } catch {
    return null;
  }
}

/**
 * Charges ONE membership for the period that is due, at most once. Safe to call from the daily run, right after the card is saved, and
 * from her "retry" tap at the same moment: the period row is the lock.
 */
export async function chargeMembership(d: MembershipDeps, m0: Membership): Promise<ChargeOutcome> {
  const today = israelDay(clock(d));
  const m = (await d.repo.getMembership(m0.tenant_id, m0.id)) || m0;
  if (!BILLING_STATUSES.includes(m.status) || !m.token_id || !m.next_charge_on) return { outcome: 'skipped' };
  if (m.next_charge_on > today) return { outcome: 'not-due' };
  if (m.status === 'past_due' && (!m.next_retry_on || m.next_retry_on > today)) return { outcome: 'not-due' };
  const account = await d.repo.getAccount(m.tenant_id);
  // Grow switched off on her side: no attempt is made and none is counted. It is charged once Grow is back.
  if (!account || !account.enabled) return { outcome: 'not-connected' };

  // THE CLAIM (Vercel review on PR #64): a run whose read is stale (a delayed cron, a second run, her retry tap) must never charge. The
  // lock is taken only if the row still says exactly what was read above, so a retry date moved by another run, a pause after a final
  // card refusal, or a charge in flight elsewhere all make it fail, and nothing is charged. Released by every way out below.
  const nowD = clock(d);
  const claimed = await d.repo.claimCharge(m.tenant_id, m, nowD.toISOString(), new Date(nowD.getTime() - STALE_CHARGING_MS).toISOString());
  if (!claimed) return { outcome: 'in-progress' };
  try {
    return await chargeClaimed(d, claimed, account, today);
  } finally {
    await d.repo.updateMembership(m.tenant_id, m.id, { charge_lock_at: null }).catch((e) => console.error('[memberships] could not release the charge lock of', m.id, (e as Error)?.message));
  }
}

async function chargeClaimed(d: MembershipDeps, m: Membership, account: { user_id: string }, today: string): Promise<ChargeOutcome> {
  const start = m.next_charge_on as string;
  const end = nextPeriodStart(start, m.anchor_day);
  let period = await d.repo.insertPeriod({
    tenant_id: m.tenant_id, membership_id: m.id, period_start: start, period_end: end, amount: m.plan.price, credits: m.plan.credits,
    status: 'charging', attempts: 1, first_failed_on: null, grow_payment_id: null, receipt_id: null, error: null, paid_at: null,
  });
  if (!period) {
    const existing = await d.repo.getPeriodByStart(m.tenant_id, m.id, start);
    if (!existing) return { outcome: 'in-progress' };
    if (existing.status === 'paid') {
      // Paid, but the membership was not moved on (cut off right after): move it on, never charge again.
      await d.repo.updateMembership(m.tenant_id, m.id, { status: 'active', next_charge_on: existing.period_end, next_retry_on: null, failed_attempts: 0 }, BILLING_STATUSES);
      return { outcome: 'already-paid' };
    }
    if (existing.status !== 'failed') return { outcome: 'in-progress' };
    period = await d.repo.transitionPeriod(m.tenant_id, existing.id, ['failed'], { status: 'charging', attempts: existing.attempts + 1, error: null }, existing.attempts);
    if (!period) return { outcome: 'in-progress' };
  }
  const p = period;
  const name = m.client_name || 'לקוחה';
  const description = growText(`מנוי ${m.plan.name}`, 100);

  const failed = async (error: string, final: boolean): Promise<ChargeOutcome> => {
    const firstFailed = p.first_failed_on || today;
    const pause = final || p.attempts >= MAX_ATTEMPTS;
    const retryOn = pause ? null : addDays(firstFailed, RETRY_OFFSETS_DAYS[Math.min(p.attempts, RETRY_OFFSETS_DAYS.length) - 1]);
    await d.repo.transitionPeriod(m.tenant_id, p.id, ['charging'], { status: 'failed', first_failed_on: firstFailed, error: error.slice(0, 160) });
    await d.repo.updateMembership(m.tenant_id, m.id, pause
      ? { status: 'paused', pause_reason: final ? 'card_refused' : 'payment_failed', next_retry_on: null, failed_attempts: p.attempts }
      : { status: 'past_due', next_retry_on: retryOn, failed_attempts: p.attempts }, BILLING_STATUSES);
    await tell(d, pause
      ? { tenantId: m.tenant_id, title: 'מנוי הושהה: החיוב לא עבר', body: `החיוב החודשי של ${name} (מנוי "${m.plan.name}", ₪${m.plan.price}) לא עבר ${final ? 'והכרטיס סורב סופית' : `גם אחרי ${MAX_ATTEMPTS} ניסיונות`}. המנוי הושהה ולא נחייב שוב עד שתחליטי. כדאי לדבר איתה על כרטיס אחר.` }
      : { tenantId: m.tenant_id, title: 'חיוב מנוי לא עבר', body: `החיוב החודשי של ${name} (מנוי "${m.plan.name}", ₪${m.plan.price}) לא עבר. ננסה שוב ב-${dayHe(retryOn)}. לא שלחנו לה שום הודעה.` });
    return { outcome: 'failed', periodId: p.id, retryOn, paused: pause };
  };

  const stored = m.token_id ? await d.repo.getToken(m.tenant_id, m.token_id) : null;
  const card = stored ? openCard(d, stored) : null;
  if (!card) return failed('no usable saved card', true);

  const payment = await d.grow.insertPayment({
    tenant_id: m.tenant_id, status: 'created', amount: m.plan.price, kind: 'charge', origin: 'membership', description,
    client_id: m.client_id, client_name: m.client_name, appointment_id: null, notify_token: d.newToken(),
  });
  const r = await chargeSavedCard({ ops: d.ops, ledger: d.repo, newId: d.newChargeId }, {
    tenantId: m.tenant_id, clientId: m.client_id, appointmentId: membershipRef(m.id), card, userId: account.user_id, amount: m.plan.price,
    description, purpose: 'membership', feeItemId: p.id, fullName: name, phone: String(m.client_phone || ''),
  });

  if (!r.ok) {
    await d.grow.updatePayment(payment.id, { status: 'failed', error: (r.code === 'unknown' ? 'check-grow' : r.error).slice(0, 120) });
    if (r.code === 'unknown') {
      // Grow may or may not have taken the money: nothing is charged again until she looked in Grow and asked for it herself.
      await d.repo.transitionPeriod(m.tenant_id, p.id, ['charging'], { status: 'unknown', error: 'check-grow' });
      await d.repo.updateMembership(m.tenant_id, m.id, { status: 'attention', next_retry_on: null }, BILLING_STATUSES);
      await tell(d, { tenantId: m.tenant_id, title: 'מנוי: צריך לבדוק ב-Grow', body: `לא הצלחנו לוודא אם החיוב של ${name} (₪${m.plan.price}) עבר. בדקי ב-Grow לפני ניסיון נוסף, כדי שלא תחויב פעמיים. עד אז לא נחייב אותה.` });
      return { outcome: 'unknown', periodId: p.id };
    }
    return failed(r.error || r.code, r.code === 'wrong-owner' || r.final === true);
  }

  const nowIso = clock(d).toISOString();
  await d.grow.markPaid(payment.id, { status: 'paid', paid_at: nowIso, transaction_id: r.transactionId, asmachta: r.asmachta || null, updated_at: nowIso });
  let receiptId: string | null = null;
  try {
    const receipt = await d.grow.insertReceipt({
      tenant_id: m.tenant_id, client_id: m.client_id, client_name: name, appointment_id: null, service: `מנוי: ${m.plan.name}`, amount: m.plan.price,
      payment_method: 'אשראי', note: `חיוב חודשי של המנוי (${dayHe(p.period_start)} עד ${dayHe(addDays(p.period_end, -1))}) בכרטיס שמור דרך Grow, אסמכתא ${r.asmachta || r.transactionId}`,
      items: '[]', discount: 0, tip: 0, legal_provider: 'grow', grow_payment_id: payment.id,
    });
    receiptId = receipt.id;
    await d.grow.updatePayment(payment.id, { receipt_id: receipt.id });
    if (r.invoiceUrl) { await d.grow.updatePayment(payment.id, { invoice_url: r.invoiceUrl }); await d.grow.setReceiptDocument(receipt.id, r.invoiceUrl, r.invoiceNumber); }
  } catch (e) {
    // The money was taken and is on the payment row; only the confirmation row failed. The period still counts as paid.
    console.error('[memberships] payment confirmation row failed for payment', payment.id, (e as Error)?.message);
  }
  await d.repo.transitionPeriod(m.tenant_id, p.id, ['charging'], { status: 'paid', paid_at: nowIso, grow_payment_id: payment.id, receipt_id: receiptId, error: null });
  await d.repo.updateMembership(m.tenant_id, m.id, { status: 'active', pause_reason: null, next_charge_on: p.period_end, next_retry_on: null, failed_attempts: 0 }, BILLING_STATUSES);
  if (p.attempts > 1) await tell(d, { tenantId: m.tenant_id, title: 'חיוב מנוי עבר ✓', body: `החיוב של ${name} (מנוי "${m.plan.name}") עבר בניסיון החוזר.` });
  return { outcome: 'paid', periodId: p.id, receiptId };
}

export type RunSummary = { due: number; paid: number; failed: number; paused: number; unknown: number; skipped: number; stale: number; errors: number };

/**
 * The daily run: periods cut off mid-charge become "check in Grow", then every due membership is charged once. `forEach` runs the
 * per-business work (lib/cronFanout in the route), so one slow business never holds up the rest.
 */
export async function runDueMemberships(
  d: MembershipDeps,
  o: { skipTenant?: (tenantId: string) => boolean; forEach?: <T>(items: T[], key: (t: T) => string, work: (t: T) => Promise<void>) => Promise<void> } = {},
): Promise<RunSummary> {
  const s: RunSummary = { due: 0, paid: 0, failed: 0, paused: 0, unknown: 0, skipped: 0, stale: 0, errors: 0 };
  const now = clock(d);
  for (const p of await d.repo.listStaleCharging(new Date(now.getTime() - STALE_CHARGING_MS).toISOString())) {
    if (o.skipTenant?.(p.tenant_id)) continue;
    const moved = await d.repo.transitionPeriod(p.tenant_id, p.id, ['charging'], { status: 'unknown', error: 'cut-off' });
    if (!moved) continue;
    s.stale++;
    const m = await d.repo.getMembership(p.tenant_id, p.membership_id);
    if (m) {
      await d.repo.updateMembership(m.tenant_id, m.id, { status: 'attention', next_retry_on: null }, BILLING_STATUSES);
      await tell(d, { tenantId: m.tenant_id, title: 'מנוי: צריך לבדוק ב-Grow', body: `החיוב החודשי של ${m.client_name || 'לקוחה'} נקטע באמצע. בדקי ב-Grow אם עבר לפני ניסיון נוסף. עד אז לא נחייב אותה.` });
    }
  }
  try { await settleReservations(d, o.skipTenant); } catch (e) { s.errors++; console.error('[memberships] settling held credits failed:', (e as Error)?.message); }
  const due = (await d.repo.listDue(israelDay(now))).filter((m) => !o.skipTenant?.(m.tenant_id));
  s.due = due.length;
  const byTenant = new Map<string, Membership[]>();
  for (const m of due) byTenant.set(m.tenant_id, [...(byTenant.get(m.tenant_id) || []), m]);
  const work = async (list: Membership[]) => {
    for (const m of list) {
      try {
        const r = await chargeMembership(d, m);
        if (r.outcome === 'paid') s.paid++;
        else if (r.outcome === 'failed') { s.failed++; if (r.paused) s.paused++; }
        else if (r.outcome === 'unknown') s.unknown++;
        else s.skipped++;
      } catch (e) {
        s.errors++;
        console.error('[memberships] charge threw for membership', m.id, (e as Error)?.message);
      }
    }
  };
  const groups = [...byTenant.values()];
  if (o.forEach) await o.forEach(groups, (g) => g[0].tenant_id, work);
  else for (const g of groups) await work(g);
  return s;
}

// ── credits ──────────────────────────────────────────────────────────────────

export type CreditRow = { periodId: string; left: number; credits: number; until: string; carried: boolean };
export type Credits = { available: number; currentCredits: number; currentLeft: number; carried: number; rows: CreditRow[]; labelHe: string };

/**
 * What she may still redeem today. Each PAID period grants its credits for that period; with rollover, what was not used stays for one
 * more period only (and not after the membership was cancelled). Paused or cancelled: what was already paid for stays usable to its end.
 */
/** Whether a redemption takes its credit: used, or a hold still in time (with no clock given, every hold counts: the safe side). */
export const holdsCredit = (r: Redemption, nowIso?: string) => r.status === 'released' ? false : r.status === 'reserved' ? (!nowIso || !r.reserved_until || r.reserved_until > nowIso) : true;

export function creditsOf(m: Membership, periods: Period[], redemptions: Redemption[], today: string, nowIso?: string): Credits {
  const used = new Map<string, number>();
  for (const r of redemptions) if (r.membership_id === m.id && holdsCredit(r, nowIso)) used.set(r.period_id, (used.get(r.period_id) || 0) + 1);
  const rows: CreditRow[] = [];
  for (const p of periods) {
    if (p.membership_id !== m.id || p.status !== 'paid') continue;
    const carry = m.plan.rollover && m.status !== 'cancelled';
    const until = carry ? nextPeriodStart(p.period_end, m.anchor_day) : p.period_end;
    if (!(p.period_start <= today && today < until)) continue;
    const left = Math.max(0, Number(p.credits) - (used.get(p.id) || 0));
    rows.push({ periodId: p.id, left, credits: Number(p.credits), until, carried: today >= p.period_end });
  }
  rows.sort((a, b) => (a.until < b.until ? -1 : a.until > b.until ? 1 : 0));
  const current = rows.filter((r) => !r.carried);
  const currentCredits = current.reduce((t, r) => t + r.credits, 0);
  const currentLeft = current.reduce((t, r) => t + r.left, 0);
  const carried = rows.filter((r) => r.carried).reduce((t, r) => t + r.left, 0);
  const available = currentLeft + carried;
  const labelHe = !rows.length
    ? 'אין טיפולים זמינים במנוי כרגע'
    : carried > 0
      ? `נשארו ${available}: ${currentLeft} מתוך ${currentCredits} החודש ועוד ${carried} מהחודש הקודם`
      : `נשארו ${currentLeft} מתוך ${currentCredits}`;
  return { available, currentCredits, currentLeft, carried, rows, labelHe };
}

/** Whether a treatment on the receipt is one this plan covers (no list = any treatment). */
export const planCovers = (p: Pick<PlanFields, 'services'>, service: string) => !p.services.length || p.services.includes(String(service || '').trim());

export type RedeemResult = { ok: true; redemption: Redemption; already: boolean; credits: Credits } | { ok: false; code: 'gone' | 'none-left' | 'not-covered' | 'busy'; error: string };

/**
 * Takes the next free credit (oldest-expiring month first) as a new row: 'used' for a receipt, or 'reserved' for a Grow link. Expired
 * holds are freed first. One credit number per month (unique period_id + seq among rows that are not released), so two devices at once
 * cannot both take the last credit: the second insert is refused and reads again.
 */
async function takeCredit(d: MembershipDeps, m: Membership, row: Pick<Redemption, 'status' | 'receipt_id' | 'grow_payment_id' | 'reserved_until' | 'service'>): Promise<RedeemResult> {
  const nowIso = clock(d).toISOString();
  const today = israelDay(clock(d));
  await d.repo.releaseExpiredReservations(nowIso, { tenantId: m.tenant_id, membershipId: m.id });
  const read = async () => {
    const [periods, reds] = await Promise.all([d.repo.listPeriods(m.tenant_id, [m.id]), d.repo.listRedemptions(m.tenant_id, [m.id])]);
    return { periods, reds, credits: creditsOf(m, periods, reds, today, nowIso) };
  };
  for (let tries = 0; tries < 4; tries++) {
    const { reds, credits } = await read();
    const free = credits.rows.find((r) => r.left > 0);
    if (!free) return { ok: false, code: 'none-left', error: 'לא נשארו טיפולים במנוי לתקופה הזו' };
    const seq = reds.filter((r) => r.period_id === free.periodId && r.status !== 'released').reduce((mx, r) => Math.max(mx, Number(r.seq)), 0) + 1;
    if (seq > free.credits) continue;
    const ins = await d.repo.insertRedemption({ tenant_id: m.tenant_id, membership_id: m.id, period_id: free.periodId, client_id: m.client_id, seq, ...row });
    if (ins.row) return { ok: true, redemption: ins.row, already: false, credits: (await read()).credits };
    if (ins.conflict === 'receipt' && row.receipt_id) {
      const again = await d.repo.findRedemptionByReceipt(m.tenant_id, row.receipt_id);
      if (again) return { ok: true, redemption: again, already: true, credits: (await read()).credits };
    }
  }
  return { ok: false, code: 'busy', error: 'לא הצלחנו לנכות מהמנוי, נסי שוב' };
}

/**
 * The till used one credit for this receipt (cash, Bit, a split: anything she recorded herself). Once per receipt. A receipt that a paid
 * Grow link made (growPaymentId) uses the credit that link held, never a second one: the browser's onPaid and Grow's callback are the
 * same redemption, once.
 */
export async function redeemCredit(d: MembershipDeps, i: { tenantId: string; membershipId: string; clientId: string; receiptId: string; service: string; growPaymentId?: string | null }): Promise<RedeemResult> {
  const m = await d.repo.getMembership(i.tenantId, i.membershipId);
  if (!m || String(m.client_id) !== String(i.clientId)) return { ok: false, code: 'gone', error: 'המנוי לא נמצא ללקוחה הזו' };
  if (i.growPaymentId) {
    const held = await d.repo.findRedemptionByPayment(i.tenantId, i.growPaymentId);
    if (held && held.membership_id === m.id) {
      const c = await consumeReservation(d, { tenantId: i.tenantId, paymentId: i.growPaymentId, receiptId: i.receiptId });
      const r = await d.repo.findRedemptionByPayment(i.tenantId, i.growPaymentId);
      const [periods, reds] = await Promise.all([d.repo.listPeriods(i.tenantId, [m.id]), d.repo.listRedemptions(i.tenantId, [m.id])]);
      const credits = creditsOf(m, periods, reds, israelDay(clock(d)), clock(d).toISOString());
      if (r && (c === 'used' || c === 'already')) return { ok: true, redemption: r, already: c === 'already', credits };
      return { ok: false, code: 'none-left', error: 'לא נשארו טיפולים במנוי לתקופה הזו' };
    }
  }
  if (!planCovers(m.plan, i.service)) return { ok: false, code: 'not-covered', error: 'הטיפול הזה לא כלול במנוי שלה' };
  const prior = await d.repo.findRedemptionByReceipt(i.tenantId, i.receiptId);
  if (prior) {
    const [periods, reds] = await Promise.all([d.repo.listPeriods(i.tenantId, [m.id]), d.repo.listRedemptions(i.tenantId, [m.id])]);
    return { ok: true, redemption: prior, already: true, credits: creditsOf(m, periods, reds, israelDay(clock(d)), clock(d).toISOString()) };
  }
  return takeCredit(d, m, { status: 'used', receipt_id: String(i.receiptId), grow_payment_id: null, reserved_until: null, service: String(i.service || '').slice(0, 120) || null });
}

// ── a discounted Grow link: hold the credit, use it when Grow says paid ──────

/**
 * The till asked for a Grow link whose amount already has one treatment taken off by the membership (Vercel review on PR #64: before,
 * only the browser's onPaid used the credit, so a link paid after the till stopped polling left it free to use again). Called by the
 * charge route BEFORE the link is opened: the credit is held (validated: her membership, this client, a treatment the plan covers, a
 * credit left), and a second discounted link or a till payment at the same time cannot take it.
 */
export async function reserveCredit(d: MembershipDeps, i: { tenantId: string; membershipId: string; clientId: string; service: string }): Promise<RedeemResult> {
  const m = await d.repo.getMembership(i.tenantId, i.membershipId);
  if (!m || String(m.client_id) !== String(i.clientId)) return { ok: false, code: 'gone', error: 'המנוי לא נמצא ללקוחה הזו' };
  if (!planCovers(m.plan, i.service)) return { ok: false, code: 'not-covered', error: 'הטיפול הזה לא כלול במנוי שלה' };
  const until = new Date(clock(d).getTime() + RESERVATION_OPEN_MINUTES * 60_000).toISOString();
  return takeCredit(d, m, { status: 'reserved', receipt_id: null, grow_payment_id: null, reserved_until: until, service: String(i.service || '').slice(0, 120) || null });
}

/** The link exists: the hold is tied to its Grow payment and lasts as long as the link can be paid. */
export async function attachReservation(d: MembershipDeps, i: { tenantId: string; reservationId: string; paymentId: string }): Promise<boolean> {
  const until = new Date(clock(d).getTime() + RESERVATION_HOURS * 3_600_000).toISOString();
  return !!(await d.repo.updateRedemption(i.tenantId, i.reservationId, ['reserved'], { grow_payment_id: i.paymentId, reserved_until: until }));
}

/** The link could not be opened, or it failed: the credit is free again. */
export async function releaseReservation(d: MembershipDeps, i: { tenantId: string; reservationId: string }): Promise<boolean> {
  return !!(await d.repo.updateRedemption(i.tenantId, i.reservationId, ['reserved'], { status: 'released' }));
}

export type ConsumeOutcome = 'none' | 'used' | 'already' | 'overdrawn';

/**
 * Grow's verified callback says this payment was paid (lib/grow/service.ts afterPaid, and the daily run as a safety net): its held credit
 * becomes used, keyed by the payment, so a retried callback, the browser's onPaid and the daily run are one redemption, once. A link paid
 * AFTER its hold ran out takes a credit again if one is left; if none is, she is told in the app (the client paid a discounted price).
 */
export async function consumeReservation(d: MembershipDeps, i: { tenantId: string; paymentId: string; receiptId?: string | null }): Promise<ConsumeOutcome> {
  const r = await d.repo.findRedemptionByPayment(i.tenantId, i.paymentId);
  if (!r) return 'none';
  if (r.status === 'used' || r.status === undefined) {
    if (!r.receipt_id && i.receiptId) await d.repo.updateRedemption(i.tenantId, r.id, ['used'], { receipt_id: i.receiptId }).catch(() => null);
    return 'already';
  }
  const patch = { status: 'used' as const, reserved_until: null, ...(i.receiptId ? { receipt_id: i.receiptId } : {}) };
  if (r.status === 'reserved') {
    if (await d.repo.updateRedemption(i.tenantId, r.id, ['reserved'], patch)) return 'used';
    const again = await d.repo.findRedemptionByPayment(i.tenantId, i.paymentId);
    return again && again.status === 'used' ? 'already' : consumeReleased(d, i, again);
  }
  return consumeReleased(d, i, r);
}

async function consumeReleased(d: MembershipDeps, i: { tenantId: string; paymentId: string; receiptId?: string | null }, r: Redemption | null): Promise<ConsumeOutcome> {
  if (!r) return 'none';
  const m = await d.repo.getMembership(i.tenantId, r.membership_id);
  if (m) {
    const nowIso = clock(d).toISOString();
    for (let tries = 0; tries < 4; tries++) {
      const [periods, reds] = await Promise.all([d.repo.listPeriods(i.tenantId, [m.id]), d.repo.listRedemptions(i.tenantId, [m.id])]);
      const free = creditsOf(m, periods, reds, israelDay(clock(d)), nowIso).rows.find((x) => x.left > 0);
      if (!free) break;
      const seq = reds.filter((x) => x.period_id === free.periodId && x.status !== 'released').reduce((mx, x) => Math.max(mx, Number(x.seq)), 0) + 1;
      if (seq > free.credits) continue;
      if (await d.repo.updateRedemption(i.tenantId, r.id, ['released'], { status: 'used', period_id: free.periodId, seq, reserved_until: null, ...(i.receiptId ? { receipt_id: i.receiptId } : {}) })) return 'used';
      const again = await d.repo.findRedemptionByPayment(i.tenantId, i.paymentId);
      if (again && again.status === 'used') return 'already';
    }
  }
  await tell(d, { tenantId: i.tenantId, title: 'מנוי: תשלום מאוחר', body: `${m?.client_name || 'לקוחה'} שילמה קישור עם הנחת מנוי אחרי שפג תוקפו, ולא נשאר טיפול במנוי לנכות. כדאי לבדוק בכרטיס שלה.` });
  return 'overdrawn';
}

/**
 * The daily run's pass over held credits: a hold whose time ran out is freed; a hold whose Grow payment was paid (its callback missed)
 * is used; one whose payment failed or was cancelled is freed.
 */
export async function settleReservations(d: MembershipDeps, skipTenant?: (tenantId: string) => boolean): Promise<{ used: number; released: number }> {
  const out = { used: 0, released: 0 };
  for (const r of await d.repo.listOpenReservations()) {
    if (skipTenant?.(r.tenant_id) || !r.grow_payment_id) continue;
    const p = await d.repo.paymentState(r.tenant_id, r.grow_payment_id);
    if (p && p.status === 'paid') { if ((await consumeReservation(d, { tenantId: r.tenant_id, paymentId: r.grow_payment_id, receiptId: p.receipt_id })) === 'used') out.used++; }
    else if (p && (p.status === 'failed' || p.status === 'cancelled')) { if (await releaseReservation(d, { tenantId: r.tenant_id, reservationId: r.id })) out.released++; }
  }
  out.released += await d.repo.releaseExpiredReservations(clock(d).toISOString());
  return out;
}

// ── her actions and the client's ─────────────────────────────────────────────

export type ActionResult = { ok: true; membership: Membership; charge?: ChargeOutcome } | { ok: false; code: 'gone' | 'state' | 'min-term'; error: string; until?: string };

/** How many months were paid (the minimum term counts these). */
export const paidMonths = (periods: Period[], membershipId: string) => periods.filter((p) => p.membership_id === membershipId && p.status === 'paid').length;

/**
 * Whether the client may cancel by herself: only once the plan's minimum months were PAID (counted, never a calendar date: Vercel review
 * on PR #64, a client could cancel on the morning of the last committed charge, before the daily run, and skip it). Null when she may
 * cancel now; otherwise the day of the last committed charge, for display only ("אפשר לבטל אחרי החיוב של ...").
 */
export function clientCancelFrom(m: Membership, periods: Period[]): string | null {
  const min = Number(m.plan.min_months) || 0;
  if (min <= 0) return null;
  if (paidMonths(periods, m.id) >= min) return null;
  if (!m.started_on) return null; // no card saved yet: nothing binds her
  let d = m.started_on;
  for (let k = 0; k < min - 1; k++) d = nextPeriodStart(d, m.anchor_day);
  return d;
}

/** pause / resume / cancel / retry, from her dashboard or the client card. Tenant-scoped; every change is compare-and-set. */
export async function ownerAction(d: MembershipDeps, i: { tenantId: string; membershipId: string; action: 'pause' | 'resume' | 'cancel' | 'retry' }): Promise<ActionResult> {
  const m = await d.repo.getMembership(i.tenantId, i.membershipId);
  if (!m) return { ok: false, code: 'gone', error: 'המנוי לא נמצא' };
  const today = israelDay(clock(d));
  const done = (x: Membership | null, charge?: ChargeOutcome): ActionResult => (x ? { ok: true, membership: x, charge } : { ok: false, code: 'state', error: 'המנוי השתנה בינתיים, רענני ונסי שוב' });

  if (i.action === 'cancel') {
    if (m.status === 'cancelled') return { ok: true, membership: m };
    return done(await d.repo.updateMembership(i.tenantId, m.id, { status: 'cancelled', cancelled_at: clock(d).toISOString(), cancelled_by: 'owner', next_retry_on: null }, LIVE_STATUSES));
  }
  if (i.action === 'pause') {
    if (!['active', 'past_due', 'attention'].includes(m.status)) return { ok: false, code: 'state', error: 'אפשר להשהות רק מנוי פעיל' };
    return done(await d.repo.updateMembership(i.tenantId, m.id, { status: 'paused', pause_reason: 'owner', next_retry_on: null }, ['active', 'past_due', 'attention']));
  }
  if (i.action === 'resume' || i.action === 'retry') {
    if (i.action === 'resume' && m.status !== 'paused') return { ok: false, code: 'state', error: 'המנוי לא מושהה' };
    if (i.action === 'retry' && !['attention', 'past_due', 'paused'].includes(m.status)) return { ok: false, code: 'state', error: 'אין חיוב שממתין לניסיון חוזר' };
    if (!m.token_id || !m.next_charge_on) return { ok: false, code: 'state', error: 'אין כרטיס שמור למנוי הזה' };
    const open = await d.repo.getPeriodByStart(i.tenantId, m.id, m.next_charge_on);
    // "Check in Grow" ends only by her tap here: she looked, nothing was taken, so the period may be tried again with a NEW identifier.
    if (open && open.status === 'unknown') await d.repo.transitionPeriod(i.tenantId, open.id, ['unknown'], { status: 'failed', error: 'checked by the owner' });
    // A pause she chose that outlived its month starts a fresh month today; a period that failed keeps its date and is tried again now.
    const restart = i.action === 'resume' && (!open || open.status === 'paid') && m.next_charge_on < today;
    const p = parse(today);
    const moved = await d.repo.updateMembership(i.tenantId, m.id, {
      status: 'active', pause_reason: null, next_retry_on: null, failed_attempts: 0,
      ...(restart ? { next_charge_on: today, anchor_day: p ? p.d : m.anchor_day } : {}),
    }, ['paused', 'attention', 'past_due']);
    if (!moved) return done(null);
    const charge = moved.next_charge_on && moved.next_charge_on <= today ? await chargeMembership(d, moved) : undefined;
    return done((await d.repo.getMembership(i.tenantId, m.id)) || moved, charge);
  }
  return { ok: false, code: 'state', error: 'פעולה לא מוכרת' };
}

/** The client cancels from her link, per the plan's terms. She is not charged again; the paid month runs to its end. Her owner is told. */
export async function clientCancel(d: MembershipDeps, i: { linkId: string }): Promise<ActionResult> {
  const m = await d.repo.findMembershipByLink(i.linkId);
  if (!m || m.status === 'cancelled') return { ok: false, code: 'gone', error: 'המנוי כבר לא פעיל' };
  const periods = await d.repo.listPeriods(m.tenant_id, [m.id]);
  // The paid count only ever grows, so a count read here can only refuse too early, never let a committed month be skipped.
  const from = clientCancelFrom(m, periods);
  if (from) return { ok: false, code: 'min-term', error: `לפי תנאי המנוי אפשר לבטל אחרי החיוב של ${dayHe(from)}`, until: from };
  const x = await d.repo.updateMembership(m.tenant_id, m.id, { status: 'cancelled', cancelled_at: clock(d).toISOString(), cancelled_by: 'client', next_retry_on: null }, LIVE_STATUSES);
  if (!x) return { ok: false, code: 'state', error: 'משהו השתנה בינתיים, רענני ונסי שוב' };
  await tell(d, { tenantId: m.tenant_id, title: 'מנוי בוטל', body: `${m.client_name || 'לקוחה'} ביטלה את המנוי "${m.plan.name}". לא נחייב אותה יותר, והטיפולים ששולמו נשארים לה עד סוף החודש.` });
  return { ok: true, membership: x };
}

// ── her dashboard ────────────────────────────────────────────────────────────

export const STATUS_HE: Record<MembershipStatus, string> = {
  awaiting_consent: 'ממתין לאישור הלקוחה',
  awaiting_card: 'ממתין לשמירת כרטיס',
  active: 'פעיל',
  past_due: 'חיוב לא עבר, ננסה שוב',
  paused: 'מושהה',
  attention: 'צריך לבדוק ב-Grow',
  cancelled: 'בוטל',
};

export type Dashboard = { active: number; mrr: number; pastDue: number; paused: number; attention: number; waiting: number; failedCharges: number; collectedThisMonth: number };

/** Active members, monthly recurring revenue (what the billing ones charge per month) and the charges that need her. */
export function dashboardOf(ms: Membership[], periods: Period[], today: string): Dashboard {
  const billing = ms.filter((m) => BILLING_STATUSES.includes(m.status));
  const month = today.slice(0, 7);
  return {
    active: ms.filter((m) => m.status === 'active').length,
    mrr: round2(billing.reduce((t, m) => t + Number(m.plan.price || 0), 0)),
    pastDue: ms.filter((m) => m.status === 'past_due').length,
    paused: ms.filter((m) => m.status === 'paused').length,
    attention: ms.filter((m) => m.status === 'attention').length,
    waiting: ms.filter((m) => m.status === 'awaiting_consent' || m.status === 'awaiting_card').length,
    failedCharges: periods.filter((p) => p.status === 'failed' || p.status === 'unknown').filter((p) => ms.some((m) => m.id === p.membership_id && m.status !== 'cancelled')).length,
    collectedThisMonth: round2(periods.filter((p) => p.status === 'paid' && String(p.paid_at || '').slice(0, 7) === month).reduce((t, p) => t + Number(p.amount || 0), 0)),
  };
}

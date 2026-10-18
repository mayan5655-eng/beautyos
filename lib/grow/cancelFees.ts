// lib/grow/cancelFees.ts
//
// Cancellation fees and deposits on top of the Grow card payments, with every outside dependency injected (the database as a small repo, the
// Grow operations, the clock), so the whole life cycle is exercised in tests without a network or a database.
//
//   consent      at booking the client sees the policy and ticks a required box. What she agreed to is frozen per appointment (the text, the
//                mode, the amounts, when): a later change of policy never rewrites it.
//   saved_card   the client saves a card on Grow's hosted page (a token, NO charge). A late cancel or a no-show creates a PENDING fee item;
//                nothing is charged until the cosmetician taps "charge". Then the token is charged on HER Grow account, Grow issues the receipt,
//                and the payment is stored like any other Grow payment (client card, cashier history, revenue reports).
//   deposit      the client pays a deposit on Grow's page. Attended: the cashier deducts it. Late cancel or no-show: she keeps it.
//                Timely cancel (or one she makes herself): refunded through Grow or kept as client credit, per her setting.
//
// Money never passes through Kalmea; card numbers never touch it. Only Grow's token references are stored.
import type { SupabaseClient } from '@supabase/supabase-js';
import { classify, feeQuestionHe, snapshotOf, DEPOSIT_HOLD_MINUTES } from '../cancellationPolicy.ts';
import type { CancelPolicy, ConsentSnapshot, Event, Verdict } from '../cancellationPolicy.ts';
import { minutesUntilSlot } from '../bookingPolicy.ts';
import { createCharge } from './service.ts';
import type { GrowRepo } from './service.ts';
import type { GrowOps } from './ops.ts';

export type Account = { user_id: string; enabled: boolean };

export type ConsentRow = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  client_id: string | null;
  client_name: string | null;
  mode: 'saved_card' | 'deposit';
  consented_at: string;
  token_id: string | null;
  status: 'awaiting_card' | 'card_saved' | 'awaiting_deposit' | 'deposit_paid' | 'step_failed' | 'hold_expired';
  /** Deposit mode: the booking is held as pending until this moment; unpaid by then it is released. Null otherwise and once paid. */
  hold_expires_at: string | null;
  snapshot: ConsentSnapshot;
  deposit_applied_receipt_id: string | null;
};

export type TokenRow = { id: string; tenant_id: string; client_id: string | null; appointment_id: string; token_ref: string; card_last4: string | null; card_brand: string | null };

export type FeeKind = 'late_cancel' | 'no_show' | 'deposit_return';
export type FeeStatus = 'pending' | 'charging' | 'charged' | 'waived' | 'retained' | 'refunded' | 'credited' | 'refund_failed' | 'voided';
export type FeeItem = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  client_id: string | null;
  client_name: string | null;
  service: string | null;
  kind: FeeKind;
  amount: number;
  status: FeeStatus;
  grow_payment_id: string | null;
  receipt_id: string | null;
  error: string | null;
  created_at: string;
};

export type ApptRow = { id: string; tenant_id: string; client_id: string | null; client_phone?: string | null; name: string | null; service: string | null; date: string; start_minute: number | null; hour: number | null; price: number | string | null; confirmation_status: string | null };

export type PaymentRow = { id: string; tenant_id: string; status: string; amount: number; transaction_id: string | null; receipt_id: string | null; appointment_id: string | null };

export type CancelRepo = {
  getAccount(tenantId: string): Promise<Account | null>;
  getPolicy(tenantId: string): Promise<CancelPolicy | null>;
  savePolicy(tenantId: string, policy: CancelPolicy): Promise<void>;
  getAppointment(tenantId: string, appointmentId: string): Promise<ApptRow | null>;
  getConsent(tenantId: string, appointmentId: string): Promise<ConsentRow | null>;
  insertConsent(row: Omit<ConsentRow, 'id' | 'deposit_applied_receipt_id'>): Promise<ConsentRow>;
  updateConsent(id: string, patch: Partial<ConsentRow>): Promise<void>;
  /** Deposit holds that ran out: consents still awaiting the deposit whose hold_expires_at is before `nowIso`. */
  listExpiredHolds(nowIso: string, tenantId?: string): Promise<ConsentRow[]>;
  /** pending -> cancelled (by the system) if the appointment is still pending; true when it was released. */
  releaseAppointment(tenantId: string, appointmentId: string): Promise<boolean>;
  /** Hold a booking the cosmetician made herself: confirmed or pending -> pending (never un-cancels). True when it is pending after the call. */
  holdAppointment(tenantId: string, appointmentId: string): Promise<boolean>;
  /** pending -> confirmed; true when it is confirmed after the call (already confirmed counts). */
  confirmAppointment(tenantId: string, appointmentId: string): Promise<boolean>;
  /** A released booking whose deposit arrived late: confirm it again if its slot is still free. */
  restoreAppointment(tenantId: string, appointmentId: string): Promise<'restored' | 'slot-taken' | 'missing'>;
  insertToken(row: Omit<TokenRow, 'id'>): Promise<TokenRow>;
  getToken(id: string): Promise<TokenRow | null>;
  /** Insert unless this appointment already has an item of this kind: returns null when it exists (detection is idempotent). */
  insertFeeIfAbsent(row: Omit<FeeItem, 'id' | 'created_at' | 'grow_payment_id' | 'receipt_id' | 'error'>): Promise<FeeItem | null>;
  getFee(tenantId: string, feeId: string): Promise<FeeItem | null>;
  /** Move an item from one status to another only if it is still in `from`; null when it is not (two taps, or a second device). */
  transitionFee(tenantId: string, feeId: string, from: FeeStatus[], patch: Partial<FeeItem> & { status: FeeStatus }): Promise<FeeItem | null>;
  listFees(tenantId: string, filter: { status?: FeeStatus[]; appointmentId?: string; clientId?: string }): Promise<FeeItem[]>;
  /** The deposit payment of an appointment (kind 'deposit'), whatever its status. */
  getDepositPayment(tenantId: string, appointmentId: string): Promise<PaymentRow | null>;
  getPayment(tenantId: string, paymentId: string): Promise<PaymentRow | null>;
  markRefunded(paymentId: string, refundRef: string): Promise<void>;
  voidReceipt(tenantId: string, receiptId: string, reason: string): Promise<void>;
  addCredit(row: { tenant_id: string; client_id: string; amount: number; appointment_id: string | null; source: string }): Promise<void>;
  creditBalance(tenantId: string, clientId: string): Promise<number>;
  /** Mark credit as used, oldest first, up to `amount`; returns how much was really used. */
  useCredit(tenantId: string, clientId: string, amount: number, receiptId: string | null): Promise<number>;
};

export type Deps = {
  repo: CancelRepo;
  grow: GrowRepo;
  ops: GrowOps;
  /** Everything createCharge needs (platform credentials, fetch, public origin, token generator): used for the deposit payment page. */
  chargeDeps: Parameters<typeof createCharge>[1];
  now?: () => Date;
};

const clock = (d: Deps) => (d.now || (() => new Date()))();
const round2 = (n: number) => Math.round(n * 100) / 100;
const startOf = (a: ApptRow): number | null => (a.start_minute != null ? Number(a.start_minute) : a.hour != null ? Number(a.hour) * 60 : null);
const priceOf = (a: ApptRow) => { const p = Number(a.price); return Number.isFinite(p) && p > 0 ? p : 0; };

/** The policy that applies to NEW bookings now: set to something other than off, and the business has Grow connected and switched on. */
export async function activePolicy(d: Deps, tenantId: string): Promise<CancelPolicy | null> {
  const [policy, account] = await Promise.all([d.repo.getPolicy(tenantId), d.repo.getAccount(tenantId)]);
  if (!policy || policy.mode === 'off') return null;
  if (!account || account.enabled !== true) return null;
  return policy;
}

// ── booking ──────────────────────────────────────────────────────────────────

export type BookingStep = { kind: 'saved_card' | 'deposit'; url: string | null; error?: string };

/**
 * Called by the public booking route AFTER the appointment exists. Stores what she agreed to, then opens the Grow page for the next step. The
 * booking stands whatever happens here: a failed Grow page leaves a consent marked step_failed, which the cosmetician can see.
 */
export async function recordConsentAndStart(
  d: Deps,
  i: { tenantId: string; appointmentId: string; clientId: string | null; clientName: string; phone: string; servicePrice: number; serviceName: string; policy: CancelPolicy; returnUrl: string; via?: 'booking_page' | 'owner' },
): Promise<{ consent: ConsentRow; step: BookingStep }> {
  const snapshot = snapshotOf(i.policy, i.servicePrice, i.via || 'booking_page');
  if (!snapshot) throw new Error('policy is off');
  const account = await d.repo.getAccount(i.tenantId);
  const nowD = clock(d);
  // Deposit mode with a real deposit: the booking is held as pending for 30 minutes (its slot stays blocked) and released if the deposit is not paid.
  const holds = snapshot.mode === 'deposit' && snapshot.deposit_amount > 0;
  let consent = await d.repo.insertConsent({
    tenant_id: i.tenantId, appointment_id: i.appointmentId, client_id: i.clientId, client_name: i.clientName,
    mode: snapshot.mode, consented_at: nowD.toISOString(), token_id: null,
    status: snapshot.mode === 'deposit' ? 'awaiting_deposit' : 'awaiting_card',
    hold_expires_at: holds ? new Date(nowD.getTime() + DEPOSIT_HOLD_MINUTES * 60000).toISOString() : null, snapshot,
  });

  const fail = async (kind: BookingStep['kind'], error: string): Promise<{ consent: ConsentRow; step: BookingStep }> => {
    await d.repo.updateConsent(consent.id, { status: 'step_failed' });
    consent = { ...consent, status: 'step_failed' };
    return { consent, step: { kind, url: null, error } };
  };
  if (!account || !account.enabled) return fail(snapshot.mode, 'not connected');

  if (snapshot.mode === 'saved_card') {
    const r = await d.ops.createTokenSession({ tenantId: i.tenantId, userId: account.user_id, appointmentId: i.appointmentId, returnUrl: i.returnUrl });
    return r.ok ? { consent, step: { kind: 'saved_card', url: r.url } } : fail('saved_card', r.error);
  }

  if (!(snapshot.deposit_amount > 0)) return fail('deposit', 'deposit amount is zero');
  const charge = await createCharge(
    { tenantId: i.tenantId, userId: account.user_id, amount: snapshot.deposit_amount, description: `מקדמה ל${i.serviceName || 'טיפול'}`, clientName: i.clientName, phone: i.phone, clientId: i.clientId, appointmentId: i.appointmentId, kind: 'deposit', returnUrl: i.returnUrl },
    d.chargeDeps,
  );
  return charge.ok ? { consent, step: { kind: 'deposit', url: charge.url } } : fail('deposit', charge.message);
}

export type OwnerDepositResult =
  | { ok: true; url: string; amount: number; minutes: number; clientName: string; phone: string }
  | { ok: false; code: 'not-deposit' | 'no-appointment' | 'exists' | 'no-phone' | 'zero' | 'step-failed'; error: string };

/**
 * A booking the cosmetician made herself in the calendar, with "request deposit" on: the same 30-minute pending hold as a public booking, and the
 * Grow payment link for her to send the client (a wa.me link in the app). The agreement is recorded as asked by the owner (snapshot.via = 'owner'),
 * so every refund, keep and credit rule applies exactly as for a deposit taken on the booking page.
 */
export async function requestDepositForAppointment(d: Deps, i: { tenantId: string; appointmentId: string; returnUrl: string }): Promise<OwnerDepositResult> {
  const policy = await activePolicy(d, i.tenantId);
  if (!policy || policy.mode !== 'deposit') return { ok: false, code: 'not-deposit', error: 'מצב המקדמה לא פעיל' };
  const appt = await d.repo.getAppointment(i.tenantId, i.appointmentId);
  if (!appt) return { ok: false, code: 'no-appointment', error: 'התור לא נמצא' };
  if (await d.repo.getConsent(i.tenantId, i.appointmentId)) return { ok: false, code: 'exists', error: 'כבר נשלחה בקשת מקדמה לתור הזה' };
  const phone = String(appt.client_phone || '').trim();
  if (!phone) return { ok: false, code: 'no-phone', error: 'צריך מספר נייד של הלקוחה כדי לשלוח לה את קישור התשלום' };
  const price = priceOf(appt);
  const r = await recordConsentAndStart(d, { tenantId: i.tenantId, appointmentId: i.appointmentId, clientId: appt.client_id, clientName: appt.name || '', phone, servicePrice: price, serviceName: appt.service || '', policy, returnUrl: i.returnUrl, via: 'owner' });
  if (!r.step.url) return { ok: false, code: r.consent.snapshot.deposit_amount > 0 ? 'step-failed' : 'zero', error: 'לא הצלחנו לפתוח דף תשלום, נסי שוב' };
  await d.repo.holdAppointment(i.tenantId, i.appointmentId);
  return { ok: true, url: r.step.url, amount: r.consent.snapshot.deposit_amount, minutes: DEPOSIT_HOLD_MINUTES, clientName: appt.name || '', phone };
}

/** A card was saved on Grow's hosted page. Stores the token reference and links it to the booking. Idempotent for the same token. */
export async function saveToken(d: Deps, i: { tenantId: string; appointmentId: string; tokenRef: string; last4?: string; brand?: string }): Promise<{ ok: boolean }> {
  const consent = await d.repo.getConsent(i.tenantId, i.appointmentId);
  if (!consent || consent.mode !== 'saved_card') return { ok: false };
  if (consent.token_id) return { ok: true };
  const token = await d.repo.insertToken({ tenant_id: i.tenantId, client_id: consent.client_id, appointment_id: i.appointmentId, token_ref: i.tokenRef, card_last4: i.last4 || null, card_brand: i.brand || null });
  await d.repo.updateConsent(consent.id, { token_id: token.id, status: 'card_saved' });
  return { ok: true };
}

// ── detection ────────────────────────────────────────────────────────────────

export type DetectEvent = Event | 'restore';
export type DetectResult =
  | { status: 'no-policy' | 'no-card' | 'no-deposit' | 'timely' | 'zero' | 'exists' | 'not-cancelled' }
  | { status: 'pending'; item: FeeItem }
  | { status: 'retained' | 'refunded' | 'credited' | 'refund_failed'; item: FeeItem }
  | { status: 'restored'; voided: number };

/**
 * An appointment was cancelled (by the client's link or by her) or marked no-show. Decides, from what the client AGREED TO (the stored snapshot,
 * not today's policy), whether a fee is owed. A fee never becomes a charge here: it becomes a pending item that waits for her tap.
 * `restore` (she undid the cancel or the no-show) voids what is still waiting.
 */
export async function detect(d: Deps, i: { tenantId: string; appointmentId: string; event: DetectEvent; actor: 'client' | 'owner' }): Promise<DetectResult> {
  if (i.event === 'restore') {
    const open = await d.repo.listFees(i.tenantId, { appointmentId: i.appointmentId, status: ['pending'] });
    let n = 0;
    for (const f of open) if (await d.repo.transitionFee(i.tenantId, f.id, ['pending'], { status: 'voided' })) n++;
    return { status: 'restored', voided: n };
  }

  const consent = await d.repo.getConsent(i.tenantId, i.appointmentId);
  if (!consent) return { status: 'no-policy' };
  const appt = await d.repo.getAppointment(i.tenantId, i.appointmentId);
  if (!appt) return { status: 'no-policy' };
  if (i.event === 'cancel' && appt.confirmation_status !== 'cancelled') return { status: 'not-cancelled' };

  const snap = consent.snapshot;
  const start = startOf(appt);
  const minutes = start === null ? null : minutesUntilSlot(appt.date, start, clock(d));
  let verdict: Verdict = classify(i.event, minutes, snap.window_hours);
  // A deposit is her client's money: when SHE cancels, it goes back whatever the window says.
  if (snap.mode === 'deposit' && i.event === 'cancel' && i.actor === 'owner') verdict = 'timely';

  const base = { tenant_id: i.tenantId, appointment_id: i.appointmentId, client_id: appt.client_id, client_name: appt.name, service: appt.service };

  if (snap.mode === 'saved_card') {
    if (verdict === 'timely') return { status: 'timely' };
    if (!consent.token_id) return { status: 'no-card' };
    const amount = verdict === 'no_show' ? snap.noshow_fee_amount : snap.late_fee_amount;
    if (!(amount > 0)) return { status: 'zero' };
    const item = await d.repo.insertFeeIfAbsent({ ...base, kind: verdict === 'no_show' ? 'no_show' : 'late_cancel', amount, status: 'pending' });
    return item ? { status: 'pending', item } : { status: 'exists' };
  }

  // deposit
  const dep = await d.repo.getDepositPayment(i.tenantId, i.appointmentId);
  if (!dep || dep.status !== 'paid') return { status: 'no-deposit' };
  const amount = round2(Number(dep.amount));
  if (verdict !== 'timely') {
    const item = await d.repo.insertFeeIfAbsent({ ...base, kind: verdict === 'no_show' ? 'no_show' : 'late_cancel', amount, status: 'retained' });
    return item ? { status: 'retained', item } : { status: 'exists' };
  }
  return returnDeposit(d, i.tenantId, consent, dep, base, amount);
}

async function returnDeposit(d: Deps, tenantId: string, consent: ConsentRow, dep: PaymentRow, base: Omit<FeeItem, 'id' | 'created_at' | 'grow_payment_id' | 'receipt_id' | 'error' | 'kind' | 'amount' | 'status'>, amount: number): Promise<DetectResult> {
  const item = await d.repo.insertFeeIfAbsent({ ...base, kind: 'deposit_return', amount, status: 'refund_failed' });
  if (!item) return { status: 'exists' };

  if (consent.snapshot.timely_cancel === 'credit' && base.client_id) {
    await d.repo.addCredit({ tenant_id: tenantId, client_id: base.client_id, amount, appointment_id: base.appointment_id, source: 'deposit_timely_cancel' });
    const done = await d.repo.transitionFee(tenantId, item.id, ['refund_failed'], { status: 'credited', grow_payment_id: dep.id });
    return { status: 'credited', item: done || item };
  }
  return doRefund(d, tenantId, item, dep);
}

async function doRefund(d: Deps, tenantId: string, item: FeeItem, dep: PaymentRow): Promise<DetectResult> {
  const account = await d.repo.getAccount(tenantId);
  if (!account || !dep.transaction_id) {
    await d.repo.transitionFee(tenantId, item.id, ['refund_failed'], { status: 'refund_failed', error: 'no Grow transaction to refund' });
    return { status: 'refund_failed', item: { ...item, error: 'no Grow transaction to refund' } };
  }
  const r = await d.ops.refund({ userId: account.user_id, transactionId: dep.transaction_id, amount: Number(dep.amount), idempotencyKey: `refund:${item.id}` });
  if (!r.ok) {
    await d.repo.transitionFee(tenantId, item.id, ['refund_failed'], { status: 'refund_failed', error: r.error.slice(0, 160) });
    console.warn('[grow] deposit refund failed for payment', dep.id, r.code);
    return { status: 'refund_failed', item: { ...item, error: r.error } };
  }
  await d.repo.markRefunded(dep.id, r.refundId);
  // The deposit receipt no longer stands: the money went back, so it leaves her takings through the normal void.
  if (dep.receipt_id) await d.repo.voidReceipt(tenantId, dep.receipt_id, 'מקדמה הוחזרה ללקוחה (ביטול בזמן)').catch((e) => console.warn('[grow] void of the refunded deposit receipt failed:', (e as Error)?.message));
  const done = await d.repo.transitionFee(tenantId, item.id, ['refund_failed'], { status: 'refunded', grow_payment_id: dep.id });
  return { status: 'refunded', item: done || item };
}

/** Retry a refund that failed (the cosmetician taps "try again"). */
export async function retryRefund(d: Deps, tenantId: string, feeId: string): Promise<{ ok: boolean; error?: string }> {
  const item = await d.repo.getFee(tenantId, feeId);
  if (!item || item.kind !== 'deposit_return' || item.status !== 'refund_failed') return { ok: false, error: 'nothing to retry' };
  const dep = await d.repo.getDepositPayment(tenantId, item.appointment_id);
  if (!dep) return { ok: false, error: 'no deposit' };
  const r = await doRefund(d, tenantId, item, dep);
  return r.status === 'refunded' ? { ok: true } : { ok: false, error: 'refund failed' };
}

// ── her tap ──────────────────────────────────────────────────────────────────

export type DecideResult =
  | { ok: true; status: 'charged' | 'waived'; receiptId?: string | null }
  | { ok: false; code: 'gone' | 'no-card' | 'declined' | 'not-connected'; error: string };

export async function decide(d: Deps, i: { tenantId: string; feeId: string; decision: 'charge' | 'waive' }): Promise<DecideResult> {
  const item = await d.repo.getFee(i.tenantId, i.feeId);
  if (!item || item.status !== 'pending') return { ok: false, code: 'gone', error: 'הבקשה כבר טופלה' };

  if (i.decision === 'waive') {
    const done = await d.repo.transitionFee(i.tenantId, i.feeId, ['pending'], { status: 'waived' });
    return done ? { ok: true, status: 'waived' } : { ok: false, code: 'gone', error: 'הבקשה כבר טופלה' };
  }

  // The claim: exactly one tap can charge. A second one, or the same tap from another device, finds it already 'charging'.
  const claimed = await d.repo.transitionFee(i.tenantId, i.feeId, ['pending'], { status: 'charging' });
  if (!claimed) return { ok: false, code: 'gone', error: 'הבקשה כבר טופלה' };
  const back = async (error: string) => { await d.repo.transitionFee(i.tenantId, i.feeId, ['charging'], { status: 'pending', error: error.slice(0, 160) }); };

  const [account, consent] = await Promise.all([d.repo.getAccount(i.tenantId), d.repo.getConsent(i.tenantId, item.appointment_id)]);
  if (!account || !account.enabled) { await back('not connected'); return { ok: false, code: 'not-connected', error: 'כדי לחייב צריך שחיבור ה-Grow יהיה פעיל' }; }
  const token = consent?.token_id ? await d.repo.getToken(consent.token_id) : null;
  if (!token) { await back('no saved card'); return { ok: false, code: 'no-card', error: 'אין כרטיס שמור ללקוחה הזו' }; }

  const label = item.kind === 'no_show' ? 'אי הגעה' : 'ביטול מאוחר';
  const payment = await d.grow.insertPayment({
    tenant_id: i.tenantId, status: 'created', amount: item.amount, kind: 'fee', description: `${label}${item.service ? ` - ${item.service}` : ''}`.slice(0, 100),
    client_id: item.client_id, client_name: item.client_name, appointment_id: item.appointment_id, notify_token: d.chargeDeps.newToken(),
  });

  const r = await d.ops.chargeToken({ userId: account.user_id, tokenRef: token.token_ref, amount: item.amount, description: `${label}${item.service ? ` - ${item.service}` : ''}`.slice(0, 100), idempotencyKey: `fee:${item.id}` });
  if (!r.ok) {
    await d.grow.updatePayment(payment.id, { status: 'failed', error: r.error.slice(0, 120) });
    await back(r.error);
    console.warn('[grow] fee charge refused for item', item.id, r.code);
    return { ok: false, code: 'declined', error: 'החיוב לא עבר. הכרטיס סורב או שיש תקלה, אפשר לנסות שוב או לוותר.' };
  }

  const now = clock(d).toISOString();
  await d.grow.markPaid(payment.id, { status: 'paid', paid_at: now, transaction_id: r.transactionId, asmachta: r.asmachta || null, updated_at: now });
  let receiptId: string | null = null;
  try {
    const receipt = await d.grow.insertReceipt({
      tenant_id: i.tenantId, client_id: item.client_id, client_name: item.client_name || 'לקוחה', appointment_id: item.appointment_id,
      service: `${label}${item.service ? ` - ${item.service}` : ''}`, amount: item.amount, payment_method: 'אשראי',
      note: `חיוב ${label} בכרטיס שמור דרך Grow (אסמכתא ${r.asmachta || r.transactionId})`, items: '[]', discount: 0, tip: 0, legal_provider: 'grow',
    });
    receiptId = receipt.id;
    await d.grow.updatePayment(payment.id, { receipt_id: receipt.id });
    if (r.invoiceUrl) { await d.grow.updatePayment(payment.id, { invoice_url: r.invoiceUrl }); await d.grow.setReceiptDocument(receipt.id, r.invoiceUrl, r.invoiceNumber); }
  } catch (e) {
    // The money was taken and is recorded on the payment; only the receipt row failed. The item still ends as charged, with the error visible.
    console.error('[grow] fee receipt creation failed for payment', payment.id, (e as Error)?.message);
  }
  await d.repo.transitionFee(i.tenantId, i.feeId, ['charging'], { status: 'charged', grow_payment_id: payment.id, receipt_id: receiptId, error: null });
  return { ok: true, status: 'charged', receiptId };
}

// ── deposit holds ────────────────────────────────────────────────────────────

/**
 * Releases the bookings whose 30-minute deposit hold ran out: the appointment is cancelled (by the system), so its slot is free again, the unpaid
 * payment page is closed, and the consent is marked. A deposit that was paid in the meantime confirms the booking instead. Safe to run often
 * and from several places at once (the cron, the booking route and the availability route all call it); each release is a conditional update.
 */
export async function releaseExpiredHolds(d: Deps, tenantId?: string): Promise<{ released: number; confirmed: number }> {
  const out = { released: 0, confirmed: 0 };
  const expired = await d.repo.listExpiredHolds(clock(d).toISOString(), tenantId);
  for (const c of expired) {
    const dep = await d.repo.getDepositPayment(c.tenant_id, c.appointment_id);
    if (dep && dep.status === 'paid') {
      // Paid just before the hold ran out: the callback may not have been processed yet. Confirm now.
      await d.repo.confirmAppointment(c.tenant_id, c.appointment_id);
      await d.repo.updateConsent(c.id, { status: 'deposit_paid', hold_expires_at: null });
      out.confirmed++;
      continue;
    }
    const released = await d.repo.releaseAppointment(c.tenant_id, c.appointment_id);
    if (released) out.released++;
    // Whatever happened to the appointment (she may have cancelled it herself), the hold is over and the unpaid page must not take money later.
    if (dep && dep.status === 'created') await d.grow.updatePayment(dep.id, { status: 'cancelled', error: 'deposit hold expired', updated_at: clock(d).toISOString() });
    await d.repo.updateConsent(c.id, { status: 'hold_expired', hold_expires_at: null });
  }
  return out;
}

export type DepositPaidResult =
  | { outcome: 'confirmed' | 'restored'; appointmentId: string }
  | { outcome: 'refunded' | 'refund_failed'; appointmentId: string }
  | { outcome: 'none' };

/**
 * A deposit payment came back paid (the Grow callback). A paid deposit CONFIRMS the booking. If the hold had already run out and the slot is still
 * free, the booking is restored. If the slot was taken in the meantime the client's deposit is returned automatically, so she is never left
 * paying for a slot that is not hers.
 */
export async function onDepositPaid(d: Deps, i: { tenantId: string; appointmentId: string | null; paymentId: string }): Promise<DepositPaidResult> {
  if (!i.appointmentId) return { outcome: 'none' };
  const consent = await d.repo.getConsent(i.tenantId, i.appointmentId);
  if (!consent || consent.mode !== 'deposit') return { outcome: 'none' };

  if (consent.status === 'hold_expired') {
    const r = await d.repo.restoreAppointment(i.tenantId, i.appointmentId);
    if (r === 'restored') {
      await d.repo.updateConsent(consent.id, { status: 'deposit_paid', hold_expires_at: null });
      return { outcome: 'restored', appointmentId: i.appointmentId };
    }
    if (r === 'slot-taken') {
      const dep = await d.repo.getPayment(i.tenantId, i.paymentId);
      const appt = await d.repo.getAppointment(i.tenantId, i.appointmentId);
      if (!dep) return { outcome: 'none' };
      const item = await d.repo.insertFeeIfAbsent({ tenant_id: i.tenantId, appointment_id: i.appointmentId, client_id: consent.client_id, client_name: consent.client_name, service: appt?.service ?? null, kind: 'deposit_return', amount: round2(Number(dep.amount)), status: 'refund_failed' });
      if (!item) return { outcome: 'none' };
      const res = await doRefund(d, i.tenantId, item, dep);
      return { outcome: res.status === 'refunded' ? 'refunded' : 'refund_failed', appointmentId: i.appointmentId };
    }
    return { outcome: 'none' };
  }

  await d.repo.confirmAppointment(i.tenantId, i.appointmentId);
  await d.repo.updateConsent(consent.id, { status: 'deposit_paid', hold_expires_at: null });
  return { outcome: 'confirmed', appointmentId: i.appointmentId };
}

// ── cashier: deposit and credit ──────────────────────────────────────────────

/** What the cashier should deduct for this appointment: the deposit she already received, if it was not used yet. */
export async function depositForCashier(d: Deps, tenantId: string, appointmentId: string): Promise<{ amount: number; paymentId: string } | null> {
  const consent = await d.repo.getConsent(tenantId, appointmentId);
  if (!consent || consent.mode !== 'deposit' || consent.deposit_applied_receipt_id) return null;
  const dep = await d.repo.getDepositPayment(tenantId, appointmentId);
  if (!dep || dep.status !== 'paid') return null;
  return { amount: round2(Number(dep.amount)), paymentId: dep.id };
}

/** The receipt that used the deposit: remembered, so it is deducted once. Anything above the visit's total becomes client credit. */
export async function applyDeposit(d: Deps, i: { tenantId: string; appointmentId: string; receiptId: string; used: number }): Promise<void> {
  const consent = await d.repo.getConsent(i.tenantId, i.appointmentId);
  if (!consent || consent.deposit_applied_receipt_id) return;
  await d.repo.updateConsent(consent.id, { deposit_applied_receipt_id: i.receiptId });
  const dep = await d.repo.getDepositPayment(i.tenantId, i.appointmentId);
  const left = dep ? round2(Number(dep.amount) - i.used) : 0;
  if (left > 0 && consent.client_id) await d.repo.addCredit({ tenant_id: i.tenantId, client_id: consent.client_id, amount: left, appointment_id: i.appointmentId, source: 'deposit_leftover' });
}

export const feeQuestion = (f: Pick<FeeItem, 'kind' | 'amount' | 'client_name'>) => (f.kind === 'deposit_return' ? '' : feeQuestionHe(f.kind, f.amount, f.client_name || ''));

// ── the real database ────────────────────────────────────────────────────────

const isNum = (v: unknown) => Number(v);
const fee = (r: Record<string, unknown>): FeeItem => ({ ...(r as unknown as FeeItem), amount: isNum(r.amount) });
const consentOf = (r: Record<string, unknown>): ConsentRow => r as unknown as ConsentRow;
const fail = (e: { message?: string } | null, what: string): never => { throw new Error(`${what}: ${e?.message || 'failed'}`); };

export function supabaseCancelRepo(db: SupabaseClient, sanitize: (raw: unknown) => CancelPolicy): CancelRepo {
  return {
    async getAccount(tenantId) {
      const { data, error } = await db.from('grow_accounts').select('user_id, enabled').eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getAccount');
      return (data || null) as Account | null;
    },
    async getPolicy(tenantId) {
      const { data, error } = await db.from('grow_cancel_policies').select('policy').eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getPolicy');
      return data ? sanitize(data.policy) : null;
    },
    async savePolicy(tenantId, policy) {
      const { error } = await db.from('grow_cancel_policies').upsert({ tenant_id: tenantId, policy, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
      if (error) fail(error, 'savePolicy');
    },
    async getAppointment(tenantId, appointmentId) {
      const { data, error } = await db.from('appointments').select('id, tenant_id, client_id, client_phone, name, service, date, start_minute, hour, price, confirmation_status').eq('id', appointmentId).eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getAppointment');
      return (data || null) as ApptRow | null;
    },
    async getConsent(tenantId, appointmentId) {
      const { data, error } = await db.from('appointment_policy_consents').select('*').eq('tenant_id', tenantId).eq('appointment_id', appointmentId).maybeSingle();
      if (error) fail(error, 'getConsent');
      return data ? consentOf(data) : null;
    },
    async insertConsent(row) {
      const { data, error } = await db.from('appointment_policy_consents').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertConsent');
      return consentOf(data as Record<string, unknown>);
    },
    async updateConsent(id, patch) {
      const { error } = await db.from('appointment_policy_consents').update(patch).eq('id', id);
      if (error) fail(error, 'updateConsent');
    },
    async listExpiredHolds(nowIso, tenantId) {
      let q = db.from('appointment_policy_consents').select('*').eq('status', 'awaiting_deposit').lt('hold_expires_at', nowIso).limit(200);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) fail(error, 'listExpiredHolds');
      return (data || []).map(consentOf);
    },
    async releaseAppointment(tenantId, appointmentId) {
      const patch = { confirmation_status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: 'system_hold' };
      let res = await db.from('appointments').update(patch).eq('id', appointmentId).eq('tenant_id', tenantId).eq('confirmation_status', 'pending').select('id');
      if (res.error && /cancelled_at|cancelled_by|schema cache|does not exist/i.test(res.error.message || '')) {
        // The audit columns come from a hand-run migration: release without them rather than keep the slot blocked.
        res = await db.from('appointments').update({ confirmation_status: 'cancelled' }).eq('id', appointmentId).eq('tenant_id', tenantId).eq('confirmation_status', 'pending').select('id');
      }
      if (res.error) fail(res.error, 'releaseAppointment');
      return !!(res.data && res.data.length);
    },
    async holdAppointment(tenantId, appointmentId) {
      const { data, error } = await db.from('appointments').update({ confirmation_status: 'pending' }).eq('id', appointmentId).eq('tenant_id', tenantId).neq('confirmation_status', 'cancelled').select('id');
      if (error) fail(error, 'holdAppointment');
      return !!(data && data.length);
    },
    async confirmAppointment(tenantId, appointmentId) {
      const { data, error } = await db.from('appointments').update({ confirmation_status: 'confirmed' }).eq('id', appointmentId).eq('tenant_id', tenantId).in('confirmation_status', ['pending', 'confirmed']).select('id');
      if (error) fail(error, 'confirmAppointment');
      return !!(data && data.length);
    },
    async restoreAppointment(tenantId, appointmentId) {
      const { data: a, error } = await db.from('appointments').select('id, date, start_minute, hour, duration, confirmation_status').eq('id', appointmentId).eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'restoreAppointment');
      if (!a) return 'missing';
      if (a.confirmation_status !== 'cancelled') return 'restored';
      const start = a.start_minute != null ? Number(a.start_minute) : Number(a.hour) * 60;
      const end = start + (Number(a.duration) || 60);
      const { data: others, error: e2 } = await db.from('appointments').select('id, start_minute, hour, duration').eq('tenant_id', tenantId).eq('date', a.date).neq('confirmation_status', 'cancelled').neq('id', appointmentId);
      if (e2) fail(e2, 'restoreAppointment');
      const clash = (others || []).some((o) => { const s = o.start_minute != null ? Number(o.start_minute) : Number(o.hour) * 60; return s < end && start < s + (Number(o.duration) || 60); });
      if (clash) return 'slot-taken';
      const { error: e3 } = await db.from('appointments').update({ confirmation_status: 'confirmed' }).eq('id', appointmentId).eq('tenant_id', tenantId).eq('confirmation_status', 'cancelled');
      if (e3) fail(e3, 'restoreAppointment');
      return 'restored';
    },
    async insertToken(row) {
      const { data, error } = await db.from('grow_card_tokens').insert(row).select('*').single();
      if (error || !data) fail(error, 'insertToken');
      return data as unknown as TokenRow;
    },
    async getToken(id) {
      const { data, error } = await db.from('grow_card_tokens').select('*').eq('id', id).maybeSingle();
      if (error) fail(error, 'getToken');
      return (data || null) as TokenRow | null;
    },
    async insertFeeIfAbsent(row) {
      const { data, error } = await db.from('cancellation_fee_items').insert(row).select('*').single();
      if (error) { if (error.code === '23505') return null; fail(error, 'insertFee'); }
      return data ? fee(data as Record<string, unknown>) : null;
    },
    async getFee(tenantId, feeId) {
      const { data, error } = await db.from('cancellation_fee_items').select('*').eq('id', feeId).eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getFee');
      return data ? fee(data as Record<string, unknown>) : null;
    },
    async transitionFee(tenantId, feeId, from, patch) {
      const { data, error } = await db.from('cancellation_fee_items').update({ ...patch, decided_at: new Date().toISOString() }).eq('id', feeId).eq('tenant_id', tenantId).in('status', from).select('*');
      if (error) fail(error, 'transitionFee');
      return data && data[0] ? fee(data[0] as Record<string, unknown>) : null;
    },
    async listFees(tenantId, f) {
      let q = db.from('cancellation_fee_items').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
      if (f.status) q = q.in('status', f.status);
      if (f.appointmentId) q = q.eq('appointment_id', f.appointmentId);
      if (f.clientId) q = q.eq('client_id', f.clientId);
      const { data, error } = await q;
      if (error) fail(error, 'listFees');
      return (data || []).map((r) => fee(r as Record<string, unknown>));
    },
    async getDepositPayment(tenantId, appointmentId) {
      const { data, error } = await db.from('grow_payments').select('id, tenant_id, status, amount, transaction_id, receipt_id, appointment_id').eq('tenant_id', tenantId).eq('appointment_id', appointmentId).eq('kind', 'deposit').order('created_at', { ascending: false }).limit(1);
      if (error) fail(error, 'getDepositPayment');
      return data && data[0] ? ({ ...data[0], amount: isNum(data[0].amount) } as PaymentRow) : null;
    },
    async getPayment(tenantId, paymentId) {
      const { data, error } = await db.from('grow_payments').select('id, tenant_id, status, amount, transaction_id, receipt_id, appointment_id').eq('id', paymentId).eq('tenant_id', tenantId).maybeSingle();
      if (error) fail(error, 'getPayment');
      return data ? ({ ...data, amount: isNum(data.amount) } as PaymentRow) : null;
    },
    async markRefunded(paymentId, refundRef) {
      const { error } = await db.from('grow_payments').update({ status: 'refunded', refund_ref: refundRef, refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', paymentId);
      if (error) fail(error, 'markRefunded');
    },
    async voidReceipt(tenantId, receiptId, reason) {
      const { error } = await db.from('receipt_voids').insert({ receipt_id: receiptId, tenant_id: tenantId, reason });
      if (error) fail(error, 'voidReceipt');
    },
    async addCredit(row) {
      const { error } = await db.from('client_credits').insert(row);
      if (error) fail(error, 'addCredit');
    },
    async creditBalance(tenantId, clientId) {
      const { data, error } = await db.from('client_credits').select('amount').eq('tenant_id', tenantId).eq('client_id', clientId).is('used_at', null);
      if (error) fail(error, 'creditBalance');
      return round2((data || []).reduce((s, r) => s + Number(r.amount), 0));
    },
    async useCredit(tenantId, clientId, amount, receiptId) {
      const { data, error } = await db.from('client_credits').select('id, amount').eq('tenant_id', tenantId).eq('client_id', clientId).is('used_at', null).order('created_at', { ascending: true });
      if (error) fail(error, 'useCredit');
      let left = amount, used = 0;
      for (const c of data || []) {
        if (left <= 0) break;
        const a = Number(c.amount);
        const now = new Date().toISOString();
        if (a > left) {
          // Only part of this credit is needed: the rest stays available as a smaller credit, the used part is recorded on its own.
          const { error: e1 } = await db.from('client_credits').update({ amount: round2(a - left) }).eq('id', c.id).is('used_at', null);
          if (e1) fail(e1, 'useCredit');
          const { error: e2 } = await db.from('client_credits').insert({ tenant_id: tenantId, client_id: clientId, amount: round2(left), source: 'split_used', used_at: now, used_receipt_id: receiptId });
          if (e2) fail(e2, 'useCredit');
          used += left; left = 0;
        } else {
          const { error: e3 } = await db.from('client_credits').update({ used_at: now, used_receipt_id: receiptId }).eq('id', c.id).is('used_at', null);
          if (e3) fail(e3, 'useCredit');
          used += a; left -= a;
        }
      }
      return round2(used);
    },
  };
}

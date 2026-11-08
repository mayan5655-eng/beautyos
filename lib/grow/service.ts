// lib/grow/service.ts
//
// The Grow charge flow, with every outside dependency injected (the database as a small repo, fetch, the clock
// and the secret generator) so the whole thing - including "a callback arrives twice" and "the amount does not
// match" - is exercised in tests without a network or a database.
//
// Flow, and where each guarantee lives:
//   createCharge      her cashier asks for a card payment. A grow_payments row is written FIRST (status
//                     'created', with a random notify secret), then Grow is asked for a payment page for HER
//                     userId. Nothing is charged by this call: Grow only returns a page the client pays on.
//   applyNotification Grow's server-to-server callback. Trusted only when the secret in the URL matches a row,
//                     the process id matches and the amount matches what we created. The row flips to 'paid'
//                     through ONE conditional update, so a duplicate callback cannot create a second receipt.
//                     The Kalmea receipt (payment confirmation) is created from that row.
//   applyInvoice      Grow's invoice webhook: stores the legal-document link on the payment and its receipt.
//
// Money never passes through Kalmea: the payment page belongs to her Grow account.

import { isPayMethod, methodProblem, pageCodeFor, pageCodeForTypeId } from './methods.ts';
import type { PayMethod, PageCodes } from './methods.ts';
import { buildProcessFields, parseProcessResponse, readNotification, notificationMatches, findInvoiceUrl, findInvoiceNumber, findCustomField, callbackKeyShape, tenantRefOf, growPhone, parseChargeAmount, growText, withGrowResult } from './payload.ts';
import type { Notification } from './payload.ts';
import { walletLink, paymentMethodLabel } from './wallet.ts';
import { moneyAlert } from '../moneyAlert.js';
import { loyaltyMarker, parseLoyaltyIntent } from '../loyalty.js';

export type GrowPayment = {
  id: string;
  tenant_id: string;
  status: 'created' | 'paid' | 'failed' | 'cancelled';
  amount: number | string;
  process_id: string | null;
  receipt_id: string | null;
  /** When the row last changed: for a paid row without a receipt, how long ago the first callback marked it paid. */
  updated_at?: string | null;
  client_id: string | null;
  client_name: string | null;
  appointment_id: string | null;
  description: string | null;
  notify_token: string;
  /** Selected by the repo; the wallet page needs them (the phone Grow's form wants, the age of the link). */
  payer_phone?: string | null;
  /** Grow's transaction on a paid row (selected by the repo): a second, different one on the same payment means a double payment. */
  transaction_id?: string | null;
  /** Grow's document link, when its invoice callback already arrived (selected by the repo). */
  invoice_url?: string | null;
  created_at?: string | null;
};

export type GrowRepo = {
  insertPayment(row: Record<string, unknown>): Promise<GrowPayment>;
  updatePayment(id: string, patch: Record<string, unknown>): Promise<void>;
  /** Flip created -> paid atomically; null when it was not 'created' any more (a duplicate callback). */
  markPaid(id: string, patch: Record<string, unknown>): Promise<GrowPayment | null>;
  findByToken(token: string): Promise<GrowPayment | null>;
  /** The one payment with this Grow process id; null when there is none or the id is ambiguous. Used by the platform webhook, whose URL carries no per-payment secret. */
  findByProcessId?(processId: string): Promise<GrowPayment | null>;
  insertReceipt(row: Record<string, unknown>): Promise<{ id: string }>;
  setReceiptDocument(receiptId: string, url: string, number?: string): Promise<void>;
  /**
   * The loyalty reward stored with this payment (grow_payments.loyalty_redemption), or null: none, or the column is not there yet
   * (add_loyalty_2026-11-05.sql has not run). Read on its own, NOT in the repo's SELECT: a missing column there would fail every callback.
   */
  loyaltyIntentOf?(paymentId: string): Promise<unknown>;
  /**
   * One loyalty_redemptions row. 'already': the unique index on receipt_id says this receipt's reward is recorded (a retried callback,
   * or the till's own onPaid write got there first): that IS success. 'missing': the table is not there yet.
   */
  insertLoyaltyRedemption?(row: LoyaltyRedemptionRow): Promise<'inserted' | 'already' | 'missing'>;
};

export type LoyaltyRedemptionRow = { tenant_id: string; client_id: string; receipt_id: string; reward: string; every: number; stamps_used: number };
/** What the charge route stores on the payment when she applied the loyalty reward to this visit (validated there). */
export type LoyaltyIntent = { client_id: string; reward: string; stamps_used: number };

export type Creds = { apiKey: string; pageCode: string; apiBase: string; pageCodes?: PageCodes };

export type ChargeInput = {
  tenantId: string;
  userId: string;
  amount: unknown;
  description: string;
  clientName: string;
  phone: unknown;
  clientId?: string | null;
  appointmentId?: string | null;
  email?: string;
  /** 'deposit' for a booking deposit; omitted for an ordinary cashier charge (the column then keeps its default). */
  kind?: string;
  /** Where Grow's page sends the client afterwards, when it is not the dashboard (a client paying a deposit has no dashboard). */
  returnUrl?: string;
  /** The client ticked the card-save consent: the page charges AND saves the card (charge and save). */
  saveCard?: boolean;
  /** card (default) | bit | apple_pay | google_pay: picks Grow's page code (lib/grow/methods.ts). */
  method?: PayMethod;
  /** The wallet checkout (lib/grow/wallet.ts): the link is a Kalmea page that opens Grow's wallet when the client loads it; Grow is not asked yet. */
  wallet?: boolean;
  /** The loyalty reward applied to this visit at the till, validated by the charge route (its client_id is clientId, checked as hers). */
  loyalty?: LoyaltyIntent | null;
};

type Deps = {
  repo: GrowRepo; creds: Creds; fetchImpl?: typeof fetch; appUrl: string; newToken: () => string; now?: () => Date;
  /** Runs once, right after a payment flips to paid (a booking deposit confirms its booking here). A failure is logged and never undoes the payment. */
  afterPaid?: (p: GrowPayment, raw?: Record<string, unknown>) => Promise<void>;
};

export type ChargeResult =
  | { ok: true; paymentId: string; url: string }
  | { ok: false; code: 'bad-amount' | 'bad-phone' | 'grow-refused' | 'grow-unreachable'; message: string; paymentId?: string };

export async function createCharge(i: ChargeInput, d: Deps): Promise<ChargeResult> {
  const amount = parseChargeAmount(i.amount);
  if (amount === null) return { ok: false, code: 'bad-amount', message: 'הסכום לחיוב לא תקין' };
  const phone = growPhone(i.phone);
  if (!phone) return { ok: false, code: 'bad-phone', message: 'צריך מספר נייד תקין של הלקוחה כדי לשלוח לה את דף התשלום' };
  const method: PayMethod = isPayMethod(i.method) ? i.method : 'card';
  const methodErr = i.wallet ? '' : methodProblem(method, amount);
  if (methodErr) return { ok: false, code: 'bad-amount', message: methodErr };

  const payment = await d.repo.insertPayment({
    tenant_id: i.tenantId,
    status: 'created',
    amount,
    description: growText(i.description, 100),
    client_id: i.clientId ?? null,
    client_name: growText(i.clientName, 60),
    appointment_id: i.appointmentId ?? null,
    payer_phone: phone,
    notify_token: d.newToken(),
    ...(i.kind ? { kind: i.kind } : {}),
    // The reward is consumed by the server when this payment is paid (createReceiptFor), not by her browser. Only for the payment's own
    // client: an intent naming anyone else is never stored.
    ...(i.loyalty && i.clientId && i.loyalty.client_id === i.clientId ? { loyalty_redemption: i.loyalty } : {}),
  });

  const base = d.appUrl.replace(/\/+$/, '');
  if (i.wallet) return { ok: true, paymentId: payment.id, url: walletLink(base, payment.notify_token) };
  const fields = buildProcessFields({
    userId: i.userId,
    pageCode: pageCodeFor(method, d.creds.pageCodes || {}, d.creds.pageCode),
    sum: amount,
    description: i.description,
    fullName: i.clientName,
    phone,
    email: i.email,
    // The page she returns to says which way it went (the booking page shows "paid" or "not completed" instead of a blank new booking).
    successUrl: i.returnUrl ? withGrowResult(i.returnUrl, 'paid') : `${base}/dashboard?grow=paid`,
    cancelUrl: i.returnUrl ? withGrowResult(i.returnUrl, 'cancelled') : `${base}/dashboard?grow=cancelled`,
    notifyUrl: `${base}/api/grow/notify?t=${payment.notify_token}`,
    invoiceNotifyUrl: `${base}/api/grow/invoice?t=${payment.notify_token}`,
    paymentRef: payment.id,
    tenantRef: i.tenantId,
    saveCardToken: i.saveCard === true,
  });
  const form = new FormData();
  form.append('apiKey', d.creds.apiKey);   // a body field: Grow refuses a header (error 701)
  for (const [k, v] of fields) form.append(k, v);

  let json: unknown = null;
  try {
    const res = await (d.fetchImpl || fetch)(`${d.creds.apiBase}/createPaymentProcess`, {
      method: 'POST',
      body: form,
    });
    json = await res.json().catch(() => null);
    if (!res.ok) {
      await d.repo.updatePayment(payment.id, { status: 'failed', error: `http ${res.status}` });
      return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה דף תשלום. נסי שוב בעוד רגע.', paymentId: payment.id };
    }
  } catch {
    await d.repo.updatePayment(payment.id, { status: 'failed', error: 'unreachable' });
    return { ok: false, code: 'grow-unreachable', message: 'לא הצלחנו להגיע ל-Grow. לא חויבה אף לקוחה, אפשר לנסות שוב.', paymentId: payment.id };
  }

  const parsed = parseProcessResponse(json);
  if (!parsed.ok) {
    await d.repo.updatePayment(payment.id, { status: 'failed', error: growText(parsed.reason, 120) });
    return { ok: false, code: 'grow-refused', message: 'Grow לא פתחה דף תשלום. בדקי שהחיבור שלך ל-Grow פעיל.', paymentId: payment.id };
  }
  await d.repo.updatePayment(payment.id, { process_id: parsed.processId });
  return { ok: true, paymentId: payment.id, url: parsed.url };
}

export type NotifyResult =
  | { status: 'unknown-token' | 'ignored' | 'mismatch' | 'not-paid' | 'already' }
  | { status: 'paid'; paymentId: string; receiptId: string | null };

/**
 * The loyalty reward stored with a payment, re-validated (the column is jsonb and could hold anything): the same client as the
 * payment, stamps_used 1..100. Null when there is none, when the repo cannot read it, or when the column is not there yet.
 *
 * BEFORE add_loyalty_2026-11-05.sql runs there is no column to keep the intent in (charge creation drops it, lib/grow/repo.ts), and no
 * loyalty_redemptions table either. The server then has no way to know a reward was applied, so the receipt is written as before
 * (no 🎁 mark) and the till's onPaid stays the only record, exactly today's behaviour. The intent is deliberately NOT smuggled into
 * another column (description goes to Grow's page and the receipt; error drives other states).
 */
async function loyaltyIntentFor(p: GrowPayment, d: Deps): Promise<LoyaltyIntent | null> {
  if (!d.repo.loyaltyIntentOf || !p.client_id) return null;
  let raw: unknown = null;
  try { raw = await d.repo.loyaltyIntentOf(p.id); } catch (e) {
    console.error('[grow] could not read the loyalty reward of payment', p.id, (e as Error)?.message);
    await moneyAlert('grow:loyalty', 'could not read the loyalty reward stored on a paid Grow payment: check the client card before giving it again', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  if (String((raw as Record<string, unknown>).client_id ?? '') !== String(p.client_id)) return null;
  const v = parseLoyaltyIntent(raw);
  return v ? { client_id: String(p.client_id), ...v } : null;
}

async function createReceiptFor(p: GrowPayment, n: Notification, d: Deps): Promise<string | null> {
  const loyalty = await loyaltyIntentFor(p, d);
  try {
    const r = await d.repo.insertReceipt({
      tenant_id: p.tenant_id,
      client_id: p.client_id,
      client_name: p.client_name || 'לקוחה',
      // A booking deposit is money received BEFORE the visit: its receipt is deliberately not tied to the appointment, so the calendar does not
      // show the visit as paid. The cashier deducts the deposit from the visit's own receipt (lib/grow/cancelFees.ts).
      appointment_id: /^מקדמה/.test(p.description || '') ? null : p.appointment_id,
      service: p.description || 'טיפול',
      amount: Number(p.amount),
      payment_method: paymentMethodLabel(n.echo.transactionTypeId),
      note: [`שולם דרך Grow, ${paymentMethodLabel(n.echo.transactionTypeId)} (אסמכתא ${n.asmachta || n.transactionId})`, loyalty ? `🎁 מתנת כרטיסיית נאמנות: ${loyalty.reward}` : ''].filter(Boolean).join(' · '),
      // A reward visit carries the till's 🎁 mark (lib/loyalty.js loyaltyMarker), so the card counts it as the reward on its own, even
      // with the ledger unread. Its id names the payment: one payment, one mark, however many callbacks arrive (a retry that loses the
      // insert race is handed the first receipt back, mark and all).
      items: loyalty ? JSON.stringify([loyaltyMarker({ id: `loyalty-${p.id}`, reward: loyalty.reward, stampsUsed: loyalty.stamps_used })]) : '[]',
      discount: 0,
      tip: 0,
      legal_provider: 'grow',
      // Lets the database refuse a second receipt for the same card charge (receipts_grow_payment_uniq, a hand-run migration).
      grow_payment_id: p.id,
    });
    // The ledger row BEFORE receipt_id goes on the payment: the till's onPaid fires only once it sees receipt_id, so its own write of the
    // same redemption then always meets the unique index (receipt_id) and is the same reward, once.
    if (loyalty) await recordRedemption(p, r.id, loyalty, d);
    await d.repo.updatePayment(p.id, { receipt_id: r.id });
    // Grow's invoice callback can land BEFORE this one; it then stored the link on the payment only (there was no receipt yet), and Grow
    // does not send it again. Read it back now so the receipt shows Grow's document (2026-11-02 audit).
    try {
      const fresh = await d.repo.findByToken(p.notify_token);
      const url = fresh?.invoice_url || p.invoice_url;
      if (url) await d.repo.setReceiptDocument(r.id, String(url));
    } catch { /* the receipt stands; the link is still on the payment */ }
    return r.id;
  } catch (e) {
    console.error('[grow] receipt creation failed for payment', p.id, (e as Error)?.message); await moneyAlert('grow:receipt', 'paid Grow payment has no Kalmea receipt', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
    return null;
  }
}

/** The loyalty_redemptions row of a reward paid through Grow. Never fails the receipt: the 🎁 mark on it already stops the reward being reused. */
async function recordRedemption(p: GrowPayment, receiptId: string, l: LoyaltyIntent, d: Deps): Promise<void> {
  if (!d.repo.insertLoyaltyRedemption) return;
  try {
    const res = await d.repo.insertLoyaltyRedemption({ tenant_id: p.tenant_id, client_id: l.client_id, receipt_id: receiptId, reward: l.reward, every: l.stamps_used, stamps_used: l.stamps_used });
    if (res === 'missing') console.warn('[grow] loyalty_redemptions is missing (add_loyalty_2026-11-05.sql); the receipt of payment', p.id, 'carries the reward mark');
  } catch (e) {
    console.error('[grow] loyalty redemption write failed for payment', p.id, (e as Error)?.message);
    await moneyAlert('grow:loyalty', 'a loyalty reward paid through Grow has no ledger row (the receipt carries its mark)', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
  }
}

export async function applyNotification(raw: Record<string, unknown>, token: string, d: Deps, approve?: (n: Notification, p: GrowPayment) => Promise<void>): Promise<NotifyResult> {
  if (!token || token.length < 16) return { status: 'unknown-token' };
  const p = await d.repo.findByToken(token);
  if (!p) return { status: 'unknown-token' };
  return applyToPayment(p, raw, d, approve, true);
}

/**
 * The platform webhook has no per-payment secret in its URL: the payment is found by Grow's process id instead, and the
 * same process-id and amount match below still has to pass. Ambiguous or unknown ids are ignored.
 */
export async function applyNotificationByProcess(raw: Record<string, unknown>, d: Deps, approve?: (n: Notification, p: GrowPayment) => Promise<void>): Promise<NotifyResult> {
  const n = readNotification(raw);
  if (!n || !d.repo.findByProcessId) return { status: 'ignored' };
  const p = await d.repo.findByProcessId(n.processId);
  if (!p) return { status: 'unknown-token' };
  return applyToPayment(p, raw, d, approve);
}

/**
 * viaSecret: the callback reached this payment's own notify URL, whose secret only Grow and we know (applyNotification).
 *
 * 2026-10-21: the wallet page opens a NEW Grow process each time the client taps "pay" (lib/grow/wallet.ts), and only the last
 * process id is stored. A client who tapped, switched to Bit, came back and tapped again, then completed the FIRST one, was
 * answered "mismatch": the money was in her Grow account, the payment stayed open, no receipt, and the link could be paid again.
 * Through the secret URL, a callback that names THIS payment (cField1 = payment id) for THIS amount is accepted even when its
 * process id is an earlier one. The platform webhook (no secret) still requires the stored process id.
 */
async function applyToPayment(p: GrowPayment, raw: Record<string, unknown>, d: Deps, approve?: (n: Notification, p: GrowPayment) => Promise<void>, viaSecret = false): Promise<NotifyResult> {
  const n = readNotification(raw);
  if (!n) return { status: 'ignored' };
  const exact = !!p.process_id && notificationMatches(n, { processId: p.process_id, amount: Number(p.amount) });
  // cField1 is sent with the dashes removed (payload.ts buildProcessFields), so the id is compared the same way (2026-11-02 audit).
  const earlierTap = viaSecret && !exact && !!n.processId && n.paymentRef === String(p.id).replace(/-/g, '')
    && notificationMatches(n, { processId: n.processId, amount: Number(p.amount) });
  if (!exact && !earlierTap) return { status: 'mismatch' };
  if (earlierTap) console.warn('[grow] payment', p.id, 'paid through an earlier process of the same payment; accepted via its secret URL');
  // The tenant id we sent in cField2 must be this payment's tenant. Absent on payments created before cField2 existed:
  // then the process id, the amount and the secret are the checks, as before.
  if (n.tenantRef && n.tenantRef !== tenantRefOf(p.tenant_id)) return { status: 'mismatch' };
  if (!n.paid) return { status: 'not-paid' };

  const now = (d.now || (() => new Date()))().toISOString();
  const flipped = await d.repo.markPaid(p.id, {
    status: 'paid', paid_at: now, transaction_id: n.transactionId, transaction_token: n.transactionToken || null, asmachta: n.asmachta || null, updated_at: now,
    ...(earlierTap ? { process_id: n.processId } : {}),
  });
  if (!flipped) {
    // Duplicate callback. If the first one died between "paid" and "receipt", finish that job now.
    // Only when that first callback has had two minutes to finish: Grow delivers to two URLs at nearly the same moment,
    // and a second callback landing while the first is still writing the receipt must not write another one.
    const ageMs = p.updated_at ? (d.now || (() => new Date()))().getTime() - Date.parse(p.updated_at) : Infinity;
    if (p.status === 'paid' && !p.receipt_id && !(ageMs < 120_000)) {
      const rid = await createReceiptFor(p, n, d);
      return { status: 'paid', paymentId: p.id, receiptId: rid };
    }
    if (p.status === 'paid' && p.transaction_id && n.transactionId && String(p.transaction_id) !== String(n.transactionId)) {
      console.error('[grow] payment', p.id, 'received a SECOND transaction', n.transactionId, '- the client may have paid twice; check Grow and refund one'); await moneyAlert('grow:double-payment', 'a payment received a second Grow transaction: the client may have paid twice', { paymentId: p.id, tenantId: p.tenant_id }, { key: String(p.id) });
      // Said where she looks, not only in a server log: her Grow card shows "שולם פעמיים" on this payment (2026-11-02 audit).
      try { await d.repo.updatePayment(p.id, { error: `second_tx:${String(n.transactionId).slice(0, 40)}` }); } catch { /* the log line above stays */ }
    }
    return { status: 'already' };
  }
  const receiptId = await createReceiptFor(flipped, n, d);
  if (d.afterPaid) { try { await d.afterPaid(flipped, raw); } catch (e) { console.error('[grow] afterPaid failed for payment', flipped.id, (e as Error)?.message); await moneyAlert('grow:after-paid', 'follow-up after a paid Grow payment failed (booking confirm / credit)', { paymentId: flipped.id, tenantId: flipped.tenant_id }, { key: String(flipped.id) }); } }
  if (approve) { try { await approve(n, flipped); } catch (e) { console.error('[grow] approveTransaction failed:', (e as Error)?.message); await moneyAlert('grow:approve', 'approveTransaction call failed', { paymentId: flipped.id }, { key: String(flipped.id) }); } }
  return { status: 'paid', paymentId: flipped.id, receiptId };
}

/** TODO(grow-docs) helper: an invoice callback we could not fully read logs its field names (no values) once per call. */
function logInvoiceShape(raw: unknown, why: 'no-url' | 'no-number'): void {
  console.warn('[grow] invoice callback', why, '- field names:', callbackKeyShape(raw).join(','));
}

export async function applyInvoice(raw: unknown, token: string, d: Deps): Promise<{ status: 'stored' | 'unknown-token' | 'no-url' | 'mismatch' }> {
  if (!token || token.length < 16) return { status: 'unknown-token' };
  const p = await d.repo.findByToken(token);
  if (!p) return { status: 'unknown-token' };
  const ref = tenantRefOf(findCustomField(raw, 'cField2'));
  if (ref && ref !== tenantRefOf(p.tenant_id)) return { status: 'mismatch' };
  const url = findInvoiceUrl(raw);
  if (!url || !findInvoiceNumber(raw)) logInvoiceShape(raw, url ? 'no-number' : 'no-url');
  if (!url) return { status: 'no-url' };
  await d.repo.updatePayment(p.id, { invoice_url: url, updated_at: (d.now || (() => new Date()))().toISOString() });
  if (p.receipt_id) await d.repo.setReceiptDocument(p.receipt_id, url, findInvoiceNumber(raw) || undefined);
  return { status: 'stored' };
}

/** The Grow process id wherever an invoice notification carries it (processId or process_id, up to a few levels deep). */
export function findProcessId(raw: unknown): string {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): string => {
    if (depth > 4 || !v || typeof v !== 'object' || seen.has(v)) return '';
    seen.add(v);
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if ((k === 'processId' || k === 'process_id') && x != null && typeof x !== 'object') return String(x);
    }
    for (const x of Object.values(v as Record<string, unknown>)) { const r = walk(x, depth + 1); if (r) return r; }
    return '';
  };
  return walk(raw, 0);
}

/** Invoice notification on the platform webhook: correlated by the process id inside it. */
export async function applyInvoiceByProcess(raw: unknown, d: Deps): Promise<{ status: 'stored' | 'unmatched' | 'no-url' | 'mismatch' }> {
  const pid = findProcessId(raw);
  if (!pid || !d.repo.findByProcessId) return { status: 'unmatched' };
  const p = await d.repo.findByProcessId(pid);
  if (!p) return { status: 'unmatched' };
  const ref = tenantRefOf(findCustomField(raw, 'cField2'));
  if (ref && ref !== tenantRefOf(p.tenant_id)) return { status: 'mismatch' };
  const url = findInvoiceUrl(raw);
  if (!url || !findInvoiceNumber(raw)) logInvoiceShape(raw, url ? 'no-number' : 'no-url');
  if (!url) return { status: 'no-url' };
  await d.repo.updatePayment(p.id, { invoice_url: url, updated_at: (d.now || (() => new Date()))().toISOString() });
  if (p.receipt_id) await d.repo.setReceiptDocument(p.receipt_id, url, findInvoiceNumber(raw) || undefined);
  return { status: 'stored' };
}

/** approveTransaction: acknowledges the callback. Fields are echoed back exactly as Grow sent them. */
export async function approveTransaction(n: Notification, creds: Creds, fetchImpl: typeof fetch = fetch): Promise<void> {
  const form = new FormData();
  form.append('apiKey', creds.apiKey);   // a body field: Grow refuses a header (error 701)
  // The page the client paid on: a Bit or Apple Pay payment is approved with ITS page code (lib/grow/methods.ts).
  form.append('pageCode', pageCodeForTypeId(n.echo.transactionTypeId, creds.pageCodes || {}, creds.pageCode));
  for (const [k, v] of Object.entries(n.echo)) form.append(k, v);
  const res = await fetchImpl(`${creds.apiBase}/approveTransaction`, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
  // Grow answers 200 with status 0 when it refuses (a wrong page code, for one): say so in the logs, without the payload.
  const j = (await res.json().catch(() => null)) as { status?: unknown; err?: { id?: unknown; message?: unknown } | unknown } | null;
  if (j && String(j.status) !== '1') {
    const err = (j.err && typeof j.err === 'object' ? j.err : {}) as { id?: unknown; message?: unknown };
    console.error('[grow] approveTransaction refused for transaction', n.transactionId, '-', String(err.id ?? ''), String(err.message ?? '').slice(0, 120)); await moneyAlert('grow:approve', 'Grow refused approveTransaction', { transactionId: n.transactionId, code: String(err.id ?? '') }, { key: String(n.transactionId) });
  }
}

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

import { buildProcessFields, parseProcessResponse, readNotification, notificationMatches, findInvoiceUrl, findInvoiceNumber, findCustomField, tenantRefOf, growPhone, parseChargeAmount, growText } from './payload.ts';
import type { Notification } from './payload.ts';

export type GrowPayment = {
  id: string;
  tenant_id: string;
  status: 'created' | 'paid' | 'failed' | 'cancelled';
  amount: number | string;
  process_id: string | null;
  receipt_id: string | null;
  client_id: string | null;
  client_name: string | null;
  appointment_id: string | null;
  description: string | null;
  notify_token: string;
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
};

export type Creds = { apiKey: string; pageCode: string; apiBase: string };

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
};

type Deps = { repo: GrowRepo; creds: Creds; fetchImpl?: typeof fetch; appUrl: string; newToken: () => string; now?: () => Date };

export type ChargeResult =
  | { ok: true; paymentId: string; url: string }
  | { ok: false; code: 'bad-amount' | 'bad-phone' | 'grow-refused' | 'grow-unreachable'; message: string; paymentId?: string };

export async function createCharge(i: ChargeInput, d: Deps): Promise<ChargeResult> {
  const amount = parseChargeAmount(i.amount);
  if (amount === null) return { ok: false, code: 'bad-amount', message: 'הסכום לחיוב לא תקין' };
  const phone = growPhone(i.phone);
  if (!phone) return { ok: false, code: 'bad-phone', message: 'צריך מספר נייד תקין של הלקוחה כדי לשלוח לה את דף התשלום' };

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
  });

  const base = d.appUrl.replace(/\/+$/, '');
  const fields = buildProcessFields({
    userId: i.userId,
    pageCode: d.creds.pageCode,
    sum: amount,
    description: i.description,
    fullName: i.clientName,
    phone,
    email: i.email,
    successUrl: i.returnUrl || `${base}/dashboard?grow=paid`,
    cancelUrl: i.returnUrl || `${base}/dashboard?grow=cancelled`,
    notifyUrl: `${base}/api/grow/notify?t=${payment.notify_token}`,
    invoiceNotifyUrl: `${base}/api/grow/invoice?t=${payment.notify_token}`,
    paymentRef: payment.id,
    tenantRef: i.tenantId,
  });
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);

  let json: unknown = null;
  try {
    const res = await (d.fetchImpl || fetch)(`${d.creds.apiBase}/createPaymentProcess`, {
      method: 'POST',
      headers: { 'x-api-key': d.creds.apiKey },
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

async function createReceiptFor(p: GrowPayment, n: Notification, d: Deps): Promise<string | null> {
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
      payment_method: 'אשראי',
      note: `שולם בכרטיס אשראי דרך Grow (אסמכתא ${n.asmachta || n.transactionId})`,
      items: '[]',
      discount: 0,
      tip: 0,
      legal_provider: 'grow',
    });
    await d.repo.updatePayment(p.id, { receipt_id: r.id });
    return r.id;
  } catch (e) {
    console.error('[grow] receipt creation failed for payment', p.id, (e as Error)?.message);
    return null;
  }
}

export async function applyNotification(raw: Record<string, unknown>, token: string, d: Deps, approve?: (n: Notification) => Promise<void>): Promise<NotifyResult> {
  if (!token || token.length < 16) return { status: 'unknown-token' };
  const p = await d.repo.findByToken(token);
  if (!p) return { status: 'unknown-token' };
  return applyToPayment(p, raw, d, approve);
}

/**
 * The platform webhook has no per-payment secret in its URL: the payment is found by Grow's process id instead, and the
 * same process-id and amount match below still has to pass. Ambiguous or unknown ids are ignored.
 */
export async function applyNotificationByProcess(raw: Record<string, unknown>, d: Deps, approve?: (n: Notification) => Promise<void>): Promise<NotifyResult> {
  const n = readNotification(raw);
  if (!n || !d.repo.findByProcessId) return { status: 'ignored' };
  const p = await d.repo.findByProcessId(n.processId);
  if (!p) return { status: 'unknown-token' };
  return applyToPayment(p, raw, d, approve);
}

async function applyToPayment(p: GrowPayment, raw: Record<string, unknown>, d: Deps, approve?: (n: Notification) => Promise<void>): Promise<NotifyResult> {
  const n = readNotification(raw);
  if (!n) return { status: 'ignored' };
  if (!p.process_id || !notificationMatches(n, { processId: p.process_id, amount: Number(p.amount) })) return { status: 'mismatch' };
  // The tenant id we sent in cField2 must be this payment's tenant. Absent on payments created before cField2 existed:
  // then the process id, the amount and the secret are the checks, as before.
  if (n.tenantRef && n.tenantRef !== tenantRefOf(p.tenant_id)) return { status: 'mismatch' };
  if (!n.paid) return { status: 'not-paid' };

  const now = (d.now || (() => new Date()))().toISOString();
  const flipped = await d.repo.markPaid(p.id, {
    status: 'paid', paid_at: now, transaction_id: n.transactionId, asmachta: n.asmachta || null, updated_at: now,
  });
  if (!flipped) {
    // Duplicate callback. If the first one died between "paid" and "receipt", finish that job now.
    if (p.status === 'paid' && !p.receipt_id) {
      const rid = await createReceiptFor(p, n, d);
      return { status: 'paid', paymentId: p.id, receiptId: rid };
    }
    return { status: 'already' };
  }
  const receiptId = await createReceiptFor(flipped, n, d);
  if (approve) { try { await approve(n); } catch (e) { console.error('[grow] approveTransaction failed:', (e as Error)?.message); } }
  return { status: 'paid', paymentId: flipped.id, receiptId };
}

export async function applyInvoice(raw: unknown, token: string, d: Deps): Promise<{ status: 'stored' | 'unknown-token' | 'no-url' | 'mismatch' }> {
  if (!token || token.length < 16) return { status: 'unknown-token' };
  const p = await d.repo.findByToken(token);
  if (!p) return { status: 'unknown-token' };
  const ref = tenantRefOf(findCustomField(raw, 'cField2'));
  if (ref && ref !== tenantRefOf(p.tenant_id)) return { status: 'mismatch' };
  const url = findInvoiceUrl(raw);
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
  if (!url) return { status: 'no-url' };
  await d.repo.updatePayment(p.id, { invoice_url: url, updated_at: (d.now || (() => new Date()))().toISOString() });
  if (p.receipt_id) await d.repo.setReceiptDocument(p.receipt_id, url, findInvoiceNumber(raw) || undefined);
  return { status: 'stored' };
}

/** approveTransaction: acknowledges the callback. Fields are echoed back exactly as Grow sent them. */
export async function approveTransaction(n: Notification, creds: Creds, fetchImpl: typeof fetch = fetch): Promise<void> {
  const form = new FormData();
  form.append('pageCode', creds.pageCode);
  for (const [k, v] of Object.entries(n.echo)) form.append(k, v);
  await fetchImpl(`${creds.apiBase}/approveTransaction`, { method: 'POST', headers: { 'x-api-key': creds.apiKey }, body: form });
}

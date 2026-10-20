// lib/grow/tokenCharge.ts
//
// Charging a SAVED card (a Grow token) safely. Every guarantee below is a rule Grow or the business depends on:
//
//   1. Ownership, checked on the server from the database, never from the browser: the token must belong to THIS business AND to the same
//      client as the appointment. A mismatch never reaches Grow.
//   2. transactionUniqueIdentifier: a numeric id generated here, saved in the ledger (grow_token_charges) BEFORE Grow is called, and never
//      reused, not even after a refusal: every attempt, retries included, gets a fresh one.
//   3. Error 1010 (Grow has already seen this identifier) is NOT retried. The transaction is looked up with that ONE identifier and the real
//      result is recorded: paid, failed, or "unknown" (a person must look in Grow before anything is charged again).
//   4. A network failure is ambiguous (Grow may have charged). It is looked up the same way; if that cannot settle it, the row is "unknown".
//      Nothing charges twice on a guess.
//   5. Grow sends no webhook and expects no approveTransaction for a later charge of a token: the answer here is the API response.
//
// Everything outside is injected (Grow operations, the ledger), so all of it is exercised in tests without a network or a database.
import { newUniqueIdentifier, groupIdentifierOf } from './tokenFlow.ts';
import type { GrowOps } from './ops.ts';

export type LedgerStatus = 'initiated' | 'succeeded' | 'failed' | 'unknown';

export type LedgerRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  appointment_id: string;
  token_id: string;
  unique_identifier: number;
  group_identifier: number | null;
  amount: number;
  purpose: string;
  fee_item_id?: string | null;
  status: LedgerStatus;
  grow_error_id: number | null;
  error: string | null;
  transaction_id: string | null;
  transaction_token: string | null;
  asmachta: string | null;
  looked_up: boolean;
};

export type LedgerRepo = {
  /** Inserts the row; null when unique_identifier is already taken (the caller draws another number). */
  insertCharge(row: Omit<LedgerRow, 'id' | 'status' | 'grow_error_id' | 'error' | 'transaction_id' | 'transaction_token' | 'asmachta' | 'looked_up'>): Promise<LedgerRow | null>;
  updateCharge(id: string, patch: Partial<LedgerRow>): Promise<void>;
};

/** The saved card as the server read it from the database: the token is already decrypted. */
export type SavedCard = { id: string; tenant_id: string; client_id: string | null; token: string; revoked_at?: string | null };

export type ChargeSavedInput = {
  tenantId: string;
  /** The appointment's client id as stored in the database (NOT from the request). */
  clientId: string | null;
  appointmentId: string;
  card: SavedCard;
  /** The Grow business the money goes to (the cosmetician's own userId). */
  userId: string;
  amount: number;
  description: string;
  purpose: string;
  feeItemId?: string | null;
  fullName: string;
  phone: string;
};

export type ChargeSavedResult =
  | { ok: true; chargeId: string; transactionId: string; transactionToken: string | null; asmachta: string | null; invoiceUrl?: string; invoiceNumber?: string; recovered: boolean }
  | { ok: false; code: 'wrong-owner' | 'declined' | 'unknown' | 'unreachable'; error: string; chargeId?: string; final?: boolean };

const MAX_ID_DRAWS = 8;

export async function chargeSavedCard(d: { ops: GrowOps; ledger: LedgerRepo; newId?: () => number }, i: ChargeSavedInput): Promise<ChargeSavedResult> {
  // 1. ownership
  if (!i.card || i.card.revoked_at) return { ok: false, code: 'wrong-owner', error: 'card not usable' };
  if (i.card.tenant_id !== i.tenantId || !i.card.client_id || !i.clientId || String(i.card.client_id) !== String(i.clientId)) {
    console.warn('[grow-token] refused: the saved card does not belong to this business and client');
    return { ok: false, code: 'wrong-owner', error: 'card does not belong to this client' };
  }

  // 2. the identifier is saved BEFORE the call
  const draw = d.newId || (() => newUniqueIdentifier());
  let row: LedgerRow | null = null;
  for (let n = 0; n < MAX_ID_DRAWS && !row; n++) {
    row = await d.ledger.insertCharge({
      tenant_id: i.tenantId, client_id: String(i.clientId), appointment_id: i.appointmentId, token_id: i.card.id,
      unique_identifier: draw(), group_identifier: groupIdentifierOf(i.appointmentId), amount: i.amount, purpose: i.purpose, fee_item_id: i.feeItemId ?? null,
    });
  }
  if (!row) return { ok: false, code: 'unreachable', error: 'could not reserve an identifier' };
  const rec = row;

  const settle = async (r: { status: 'paid' | 'failed'; transactionId?: string; transactionToken?: string; asmachta?: string }, recovered: boolean): Promise<ChargeSavedResult> => {
    if (r.status === 'paid' && r.transactionId) {
      await d.ledger.updateCharge(rec.id, { status: 'succeeded', transaction_id: r.transactionId, transaction_token: r.transactionToken || null, asmachta: r.asmachta || null, looked_up: recovered });
      return { ok: true, chargeId: rec.id, transactionId: r.transactionId, transactionToken: r.transactionToken || null, asmachta: r.asmachta || null, recovered };
    }
    await d.ledger.updateCharge(rec.id, { status: 'failed', error: 'declined', looked_up: recovered });
    return { ok: false, code: 'declined', error: 'declined', chargeId: rec.id };
  };
  // Asks Grow what happened to THIS identifier (one identifier only). Never charges.
  const lookup = async (): Promise<ChargeSavedResult | null> => {
    const l = await d.ops.lookupToken({ userId: i.userId, tokenRef: i.card.token, uniqueIdentifier: rec.unique_identifier });
    if (l.ok && l.found && (l.status === 'paid' || l.status === 'failed')) return settle({ status: l.status, transactionId: l.transactionId, transactionToken: l.transactionToken, asmachta: l.asmachta }, true);
    return null;
  };

  // 3. the charge
  const r = await d.ops.chargeToken({
    userId: i.userId, tokenRef: i.card.token, amount: i.amount, description: i.description,
    uniqueIdentifier: rec.unique_identifier, groupIdentifier: rec.group_identifier ?? undefined, fullName: i.fullName, phone: i.phone,
  });
  if (r.ok) {
    await d.ledger.updateCharge(rec.id, { status: 'succeeded', transaction_id: r.transactionId, transaction_token: r.transactionToken || null, asmachta: r.asmachta || null });
    return { ok: true, chargeId: rec.id, transactionId: r.transactionId, transactionToken: r.transactionToken || null, asmachta: r.asmachta || null, invoiceUrl: r.invoiceUrl, invoiceNumber: r.invoiceNumber, recovered: false };
  }

  // 4. 1010 and a network failure are both "did Grow take it?": ask, never retry
  if (r.code === 'duplicate' || r.code === 'unreachable' || r.code === 'not-confirmed') {
    const settled = await lookup().catch(() => null);
    if (settled) return settled;
    await d.ledger.updateCharge(rec.id, { status: 'unknown', grow_error_id: r.errId ?? null, error: r.error.slice(0, 160), looked_up: true });
    console.warn('[grow-token] charge', rec.id, 'is unknown after', r.code, '- not retried; look in Grow');
    return { ok: false, code: 'unknown', error: r.error, chargeId: rec.id };
  }

  // 5. a clear refusal: recorded, and the identifier stays spent
  await d.ledger.updateCharge(rec.id, { status: 'failed', grow_error_id: r.errId ?? null, error: r.error.slice(0, 160) });
  return { ok: false, code: 'declined', error: r.error, chargeId: rec.id, final: r.final };
}

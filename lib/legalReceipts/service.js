// lib/legalReceipts/service.js
//
// The server side of legal receipts: her connected account, issuing a document
// for a payment, issuing a credit document for a void, and the daily retry.
// Everything takes its database and its provider as parameters, so the whole flow
// is provable with fakes (test-legal-receipts.ts).
//
// THE RULES THIS FILE HOLDS TO
//  1. A payment is never blocked by the provider. The record is written first, by the
//     till, exactly as before; a document is attempted afterwards, and any failure
//     leaves the record intact with a visible state.
//  2. A legal document is never issued twice. A row is LOCKED (status -> 'pending')
//     before the call. After a failure we can trust ('failed': the provider said no),
//     the daily job may retry. After one we cannot ('unknown': timeout, dropped
//     connection, 5xx) NOTHING retries by itself; she checks her Morning account and
//     retries by hand, knowing what she is doing.
//  3. We never invent a document number. The number and link are whatever the
//     provider returned.
//  4. Credentials live encrypted, server-side only (the accounts table has no client
//     access), and are never returned or logged.

import { encryptToken, decryptToken } from "../facebook/encryption.ts";
import { buildDocument, buildCredit } from "./spec.js";
import {
  PROVIDER_MORNING, docTypeFor, needsLegalDoc, classifyFailure, statusAfterFailure,
  shouldAutoRetry, MAX_AUTO_ATTEMPTS,
} from "./policy.js";

const TABLE_MISSING = /does not exist|schema cache|42P01|PGRST205|42703|PGRST204/i;
const isMissing = (e) => !!e && TABLE_MISSING.test(`${e.code || ""} ${e.message || ""}`);

const HE = {
  auth: "החיבור למורנינג לא תקין. אפשר לחבר מחדש בהגדרות.",
  ambiguous: "לא קיבלנו תשובה ברורה ממורנינג, ולא בטוחות שהמסמך הונפק.",
  definite: (m) => "מורנינג לא קיבלה את המסמך" + (m ? `: ${m}` : "."),
};
const humanError = (kind, message) => (kind === "auth" ? HE.auth : kind === "ambiguous" ? HE.ambiguous : HE.definite(message));

// ---- the connected account ------------------------------------------------------------

export async function getAccount(db, tenantId) {
  const { data, error } = await db.from("legal_receipt_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) return { account: null, migrationMissing: isMissing(error), error: error.message };
  return { account: data || null };
}

/** What the browser may know: never the keys. */
export function publicStatus(account, config) {
  return {
    connected: !!account,
    provider: account ? account.provider : null,
    environment: config.environment,
    businessName: account ? account.business_name || "" : "",
    needsReconnect: !!(account && account.needs_reconnect),
    lastError: account ? account.last_error || null : null,
  };
}

const clean = (s, n = 300) => String(s ?? "").trim().slice(0, n);

export async function connectAccount({ db, tenantId, keyId, secret, adapter, now = new Date() }) {
  const id = clean(keyId), sec = clean(secret, 500);
  if (!id || !sec) return { ok: false, error: "צריך להזין גם מזהה מפתח וגם סוד." };
  const v = await adapter.verify({ keyId: id, secret: sec });
  if (!v.ok) {
    const sandbox = adapter.config.environment === "sandbox";
    return {
      ok: false,
      error: v.kind === "auth"
        ? (sandbox ? "המפתח לא התקבל. המערכת עדיין במצב בדיקות (sandbox) ומקבלת רק מפתחות של חשבון בדיקות." : "המפתח לא התקבל. כדאי לוודא שהעתקת את המזהה והסוד במלואם.")
        : "לא הצלחנו להתחבר למורנינג עכשיו. אפשר לנסות שוב בעוד רגע.",
    };
  }
  const row = {
    tenant_id: tenantId,
    provider: PROVIDER_MORNING,
    credentials_encrypted: encryptToken(JSON.stringify({ keyId: id, secret: sec })),
    environment: adapter.config.environment,
    business_name: v.businessName || null,
    needs_reconnect: false,
    last_error: null,
    last_verified_at: now.toISOString(),
    connected_at: now.toISOString(),
  };
  const { error } = await db.from("legal_receipt_accounts").upsert(row, { onConflict: "tenant_id" });
  if (error) {
    return { ok: false, migrationMissing: isMissing(error), error: isMissing(error) ? "צריך להריץ את המיגרציה של מסמכי המס (add_legal_receipts.sql)." : "לא הצלחנו לשמור את החיבור. אפשר לנסות שוב בעוד רגע." };
  }
  return { ok: true, businessName: v.businessName || "", environment: adapter.config.environment };
}

export async function disconnectAccount({ db, tenantId }) {
  const { error } = await db.from("legal_receipt_accounts").delete().eq("tenant_id", tenantId);
  return { ok: !error };
}

function credsOf(account) {
  try { return JSON.parse(decryptToken(account.credentials_encrypted)); } catch { return null; }
}

async function flagAccount(db, tenantId, patch) {
  try { await db.from("legal_receipt_accounts").update(patch).eq("tenant_id", tenantId); } catch { /* best effort */ }
}

async function context(db, tenantId, receipt) {
  const [{ data: st }, cl] = await Promise.all([
    db.from("settings").select("business_tax_status").eq("tenant_id", tenantId).maybeSingle(),
    receipt.client_id ? db.from("clients").select("name, phone, email").eq("id", receipt.client_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { taxStatus: (st && st.business_tax_status) || "exempt", client: (cl && cl.data) || null };
}

// ---- issuing a document for a payment ------------------------------------------------------

/**
 * @param {{ db: any, tenantId: string, receiptId: string, adapter: any, now?: Date, confirmUnknown?: boolean }} p
 * confirmUnknown: she checked her Morning account and confirmed the document does NOT exist.
 */
export async function issueForReceipt({ db, tenantId, receiptId, adapter, now = new Date(), confirmUnknown = false }) {
  const { account, migrationMissing } = await getAccount(db, tenantId);
  if (migrationMissing) return { status: "none", skipped: "migration_missing" };
  if (!account) return { status: "none", skipped: "not_connected" };

  const { data: receipt, error: rErr } = await db.from("receipts").select("*").eq("id", receiptId).eq("tenant_id", tenantId).maybeSingle();
  if (rErr) return { status: "none", skipped: isMissing(rErr) ? "migration_missing" : "read_failed" };
  if (!receipt) return { status: "none", skipped: "not_found" };
  if (receipt.legal_status === "issued") return { status: "issued", receipt, already: true };
  if (!needsLegalDoc(receipt)) return { status: "none", skipped: "no_payment", receipt };

  const creds = credsOf(account);
  if (!creds) return { status: receipt.legal_status || "none", skipped: "credentials_unreadable", receipt };

  // LOCK: only one caller may move a row into 'pending'. 'unknown' needs her explicit go-ahead.
  const allowed = confirmUnknown ? ["none", "failed", "unknown"] : ["none", "failed"];
  const q = db.from("receipts")
    .update({ legal_status: "pending", legal_provider: PROVIDER_MORNING, legal_attempts: (Number(receipt.legal_attempts) || 0) + 1, legal_attempted_at: now.toISOString(), legal_error: null })
    .eq("id", receiptId).eq("tenant_id", tenantId);
  const { data: locked, error: lErr } = await q.in("legal_status", allowed).select("*");
  if (lErr) return { status: receipt.legal_status || "none", skipped: isMissing(lErr) ? "migration_missing" : "lock_failed" };
  // A row from before the migration has legal_status NULL: treat it as 'none'.
  let row = locked && locked[0];
  if (!row && (receipt.legal_status === null || receipt.legal_status === undefined)) {
    const r2 = await db.from("receipts")
      .update({ legal_status: "pending", legal_provider: PROVIDER_MORNING, legal_attempts: 1, legal_attempted_at: now.toISOString(), legal_error: null })
      .eq("id", receiptId).eq("tenant_id", tenantId).is("legal_status", null).select("*");
    row = r2.data && r2.data[0];
  }
  if (!row) {
    // Someone else holds the lock (or the row is one we will not retry unasked). Report what it is NOW, not what we read a moment ago.
    const { data: cur } = await db.from("receipts").select("legal_status").eq("id", receiptId).eq("tenant_id", tenantId).maybeSingle();
    return { status: (cur && cur.legal_status) || receipt.legal_status, skipped: "in_flight_or_unconfirmed", receipt };
  }

  const { taxStatus, client } = await context(db, tenantId, row);
  const doc = buildDocument({ receipt: row, taxStatus, client });
  const res = await adapter.createDocument(creds, doc);

  if (res.ok) {
    const patch = {
      legal_status: "issued", legal_doc_id: res.docId, legal_doc_number: res.number, legal_doc_url: res.url,
      legal_doc_type: docTypeFor(taxStatus).key, legal_issued_at: now.toISOString(), legal_error: null,
    };
    const { data: done } = await db.from("receipts").update(patch).eq("id", receiptId).eq("tenant_id", tenantId).select("*");
    if (!done || !done[0]) {
      // The provider issued it but we could not write it down. That document EXISTS: say so, do not retry.
      console.error(`[legal-receipts] ISSUED but not recorded: tenant=${tenantId} receipt=${receiptId} doc=${res.docId} number=${res.number}`);
      return { status: "unknown", skipped: "issued_but_not_recorded", docId: res.docId, number: res.number };
    }
    return { status: "issued", receipt: done[0], number: res.number, url: res.url };
  }

  const status = statusAfterFailure(res.kind);
  const error = humanError(res.kind, res.message);
  const { data: failed } = await db.from("receipts").update({ legal_status: status, legal_error: error }).eq("id", receiptId).eq("tenant_id", tenantId).select("*");
  if (res.kind === "auth") await flagAccount(db, tenantId, { needs_reconnect: true, last_error: error });
  console.error(`[legal-receipts] issue failed: tenant=${tenantId} receipt=${receiptId} kind=${res.kind} http=${res.httpStatus || "-"} ${res.message || ""}`);
  return { status, error, kind: res.kind, receipt: (failed && failed[0]) || null };
}

// ---- a void becomes a credit document ----------------------------------------------------------

/**
 * @param {{ db: any, tenantId: string, voidId: string, adapter: any, now?: Date, confirmUnknown?: boolean }} p
 */
export async function creditForVoid({ db, tenantId, voidId, adapter, now = new Date(), confirmUnknown = false }) {
  const { account, migrationMissing } = await getAccount(db, tenantId);
  if (migrationMissing) return { status: "none", skipped: "migration_missing" };
  if (!account) return { status: "none", skipped: "not_connected" };

  const { data: v, error: vErr } = await db.from("receipt_voids").select("*").eq("id", voidId).eq("tenant_id", tenantId).maybeSingle();
  if (vErr) return { status: "none", skipped: isMissing(vErr) ? "migration_missing" : "read_failed" };
  if (!v) return { status: "none", skipped: "not_found" };
  if (v.credit_status === "issued") return { status: "issued", void: v, already: true };

  const { data: receipt } = await db.from("receipts").select("*").eq("id", v.receipt_id).eq("tenant_id", tenantId).maybeSingle();
  if (!receipt) return { status: "none", skipped: "receipt_not_found" };
  // A record with no provider document has nothing legal to credit: the void stays internal.
  if (receipt.legal_status !== "issued" || !receipt.legal_doc_id) return { status: "none", skipped: "no_legal_document" };

  const creds = credsOf(account);
  if (!creds) return { status: v.credit_status || "none", skipped: "credentials_unreadable" };

  const allowed = confirmUnknown ? ["pending_request", "none", "failed", "unknown"] : ["pending_request", "none", "failed"];
  const { data: locked, error: lErr } = await db.from("receipt_voids")
    .update({ credit_status: "pending", credit_attempts: (Number(v.credit_attempts) || 0) + 1, credit_attempted_at: now.toISOString(), credit_error: null })
    .eq("id", voidId).eq("tenant_id", tenantId).in("credit_status", allowed).select("*");
  if (lErr) return { status: v.credit_status || "none", skipped: isMissing(lErr) ? "migration_missing" : "lock_failed" };
  const row = locked && locked[0];
  if (!row) {
    const { data: cur } = await db.from("receipt_voids").select("credit_status").eq("id", voidId).eq("tenant_id", tenantId).maybeSingle();
    return { status: (cur && cur.credit_status) || v.credit_status, skipped: "in_flight_or_unconfirmed" };
  }

  const { taxStatus, client } = await context(db, tenantId, receipt);
  const doc = buildCredit({ receipt, originalDocId: receipt.legal_doc_id, taxStatus, client, reason: v.reason });
  const res = await adapter.createDocument(creds, doc);

  if (res.ok) {
    const { data: done } = await db.from("receipt_voids")
      .update({ credit_status: "issued", credit_doc_id: res.docId, credit_doc_number: res.number, credit_doc_url: res.url, credit_issued_at: now.toISOString(), credit_error: null })
      .eq("id", voidId).eq("tenant_id", tenantId).select("*");
    if (!done || !done[0]) {
      console.error(`[legal-receipts] CREDIT ISSUED but not recorded: tenant=${tenantId} void=${voidId} doc=${res.docId}`);
      return { status: "unknown", skipped: "issued_but_not_recorded", docId: res.docId, number: res.number };
    }
    return { status: "issued", void: done[0], number: res.number, url: res.url };
  }
  const status = statusAfterFailure(res.kind);
  const error = humanError(res.kind, res.message);
  const { data: failed } = await db.from("receipt_voids").update({ credit_status: status, credit_error: error }).eq("id", voidId).eq("tenant_id", tenantId).select("*");
  if (res.kind === "auth") await flagAccount(db, tenantId, { needs_reconnect: true, last_error: error });
  console.error(`[legal-receipts] credit failed: tenant=${tenantId} void=${voidId} kind=${res.kind} http=${res.httpStatus || "-"} ${res.message || ""}`);
  return { status, error, kind: res.kind, void: (failed && failed[0]) || null };
}

// ---- the daily retry -------------------------------------------------------------------------------------

/** Retry what the provider definitely refused (never what we are unsure about). */
export async function retryDue({ db, adapter, now = new Date(), limit = 100 }) {
  const out = { receipts: 0, credits: 0, tried: 0, issued: 0 };
  const { data: rs, error } = await db.from("receipts").select("id, tenant_id, legal_attempts, legal_attempted_at").eq("legal_status", "failed").lt("legal_attempts", MAX_AUTO_ATTEMPTS).limit(limit);
  if (error) return { ...out, error: error.message };
  for (const r of rs || []) {
    const age = (now.getTime() - new Date(r.legal_attempted_at || 0).getTime()) / 60000;
    if (!shouldAutoRetry({ status: "failed", attempts: r.legal_attempts, ageMinutes: age })) continue;
    out.receipts++; out.tried++;
    const res = await issueForReceipt({ db, tenantId: r.tenant_id, receiptId: r.id, adapter, now });
    if (res.status === "issued") out.issued++;
  }
  const { data: vs } = await db.from("receipt_voids").select("id, tenant_id, credit_attempts, credit_attempted_at").in("credit_status", ["failed", "pending_request"]).lt("credit_attempts", MAX_AUTO_ATTEMPTS).limit(limit);
  for (const v of vs || []) {
    const age = (now.getTime() - new Date(v.credit_attempted_at || 0).getTime()) / 60000;
    // 'pending_request' has never been attempted (the browser asked and the call did not go through).
    if (!(age >= 30 || !v.credit_attempted_at)) continue;
    out.credits++; out.tried++;
    const res = await creditForVoid({ db, tenantId: v.tenant_id, voidId: v.id, adapter, now });
    if (res.status === "issued") out.issued++;
  }
  return out;
}

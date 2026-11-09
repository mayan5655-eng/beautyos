// lib/grow/walletDiagServer.ts
//
// The server half of the payment page's diagnostics (lib/grow/walletDiag.js says why they exist).
//   recordWalletDiag    a report from /pay/<token> that Grow's wallet did not open. Token-bound: the token must open a known payment, or
//                       nothing is written. Rate-limited per payment (the route adds per IP). Written to ops_events at WARNING through
//                       moneyAlert (no push), with the payment's id and tenant id, never the token, a phone or a name.
//   walletSessionReport what createPaymentProcess answered for the wallet (success flag, authCode yes/no, url yes/no, Grow's error),
//                       for the same table, so the owner can read it with one SQL query.
import { cleanDiagBody } from './walletDiag.js';

type Payment = { id: string; tenant_id: string };
export type AlertFn = (source: string, message: string, details: Record<string, unknown>, opts: { severity: 'warning'; key: string }) => Promise<unknown>;

export type DiagDeps = {
  findByToken(token: string): Promise<Payment | null>;
  /** true when this key went over its cap (lib/rateLimit.ts hit with the 'wallet-diag' policy). */
  limited(key: string): boolean;
  alert: AlertFn;
};

export async function recordWalletDiag(body: unknown, d: DiagDeps): Promise<{ status: number; json: Record<string, unknown> }> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const token = typeof b.t === 'string' ? b.t : '';
  if (!/^[0-9a-f]{48}$/i.test(token)) return { status: 404, json: { success: false } };
  const p = await d.findByToken(token).catch(() => null);
  if (!p) return { status: 404, json: { success: false } };
  if (d.limited(p.id)) return { status: 429, json: { success: false } };
  const c = cleanDiagBody(b);
  const details = { payment_id: p.id, tenant_id: p.tenant_id, ...c };
  await d.alert('grow:wallet-client', `Wallet did not complete on the payment page (${c.event}${c.message ? `: ${c.message}` : ''}, ${c.ua})`, details, {
    severity: 'warning',
    key: `${p.id}:${c.event}:${c.code}:${c.message}`.slice(0, 200),
  });
  return { status: 200, json: { success: true } };
}

export type SessionReport = {
  paymentId: string;
  tenantId: string;
  httpStatus: number | null;
  ok: boolean;
  growStatus: string;
  hasAuthCode: boolean;
  hasUrl: boolean;
  hasProcessId: boolean;
  errCode: string;
  errMessage: string;
  reason?: string;
};

const short = (v: unknown, n: number) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);

/** What Grow answered, reduced to flags and Grow's own error id and text. Never the authCode, the url, or any field of the client. */
export function sessionReportOf(json: unknown, httpStatus: number | null, p: Payment, reason = ''): SessionReport {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
  const err = o.err;
  const errObj = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  const errCode = short(errObj.id ?? errObj.code ?? (typeof err === 'number' ? err : ''), 20);
  const errMessage = short(typeof err === 'string' ? err : errObj.message ?? '', 200);
  const hasAuthCode = typeof data.authCode === 'string' && !!data.authCode;
  const hasProcessId = data.processId != null && String(data.processId) !== '';
  return {
    paymentId: p.id,
    tenantId: p.tenant_id,
    httpStatus,
    ok: String(o.status) === '1' && hasAuthCode && hasProcessId,
    growStatus: short(o.status, 10),
    hasAuthCode,
    hasUrl: typeof data.url === 'string' && !!data.url,
    hasProcessId,
    errCode,
    errMessage,
    ...(reason ? { reason } : {}),
  };
}

/** Writes a session report as a warning row (one per payment, outcome and hour: moneyAlert throttles by key). */
export async function reportWalletSession(r: SessionReport, alert: AlertFn): Promise<void> {
  const what = r.ok ? `ok, authCode yes, url ${r.hasUrl ? 'yes' : 'no'}` : `refused (${r.reason || 'grow'}${r.errCode ? ` ${r.errCode}` : ''}${r.errMessage ? `: ${r.errMessage}` : ''})`;
  const details: Record<string, unknown> = {
    payment_id: r.paymentId, tenant_id: r.tenantId, http_status: r.httpStatus, success: r.ok, grow_status: r.growStatus,
    has_auth_code: r.hasAuthCode, has_url: r.hasUrl, has_process_id: r.hasProcessId, grow_err_code: r.errCode, grow_err_message: r.errMessage,
    ...(r.reason ? { reason: r.reason } : {}),
  };
  await alert('grow:wallet-session', `Wallet createPaymentProcess: ${what}`, details, { severity: 'warning', key: `${r.paymentId}:${r.ok ? 'ok' : 'fail'}:${r.errCode}` });
}

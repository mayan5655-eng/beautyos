// lib/legalReceipts/morning.js
//
// The Morning (Green Invoice) adapter: authenticate with her API key, create a
// document in HER account. Plain fetch, no SDK.
//
// ENVIRONMENT. Defaults to Morning's SANDBOX. Production is opt-in and deliberate:
// set MORNING_ENV=production only after scripts/morning-sandbox-check.mjs has run
// clean, because a wrong mapping in production is a wrong legal document in a real
// business's books. In sandbox a real account's keys simply fail to authenticate,
// which the connect screen says plainly. URLs can be overridden (MORNING_API_BASE,
// MORNING_TOKEN_URL, MORNING_AUTH=legacy) if Morning moves them.
//
// AUTH. OAuth 2.0 client-credentials against Morning's IdP: POST JSON
//   { grant_type: 'client_credentials', client_id: <API key id>, client_secret: <API key secret> }
// answers { accessToken, expiresAt }; resource calls carry `Authorization: Bearer <accessToken>`.
// (Morning's older token endpoint, POST /v1/account/token {id, secret}, is kept behind
// MORNING_AUTH=legacy.) Both are from Morning's own client library, not yet run by us.
//
// A call's outcome is reported as ok, or as a failure classified by
// lib/legalReceipts/policy.classifyFailure: 'auth' | 'definite' | 'ambiguous'. Only
// 'ambiguous' (timeout, dropped connection, 5xx) can mean "the document exists": the
// caller must not retry that one blindly.

import { classifyFailure } from "./policy.js";

const TIMEOUT_MS = 20000;
const SAFETY_MS = 60000;

/** @param {Record<string, string | undefined>} [env] */
export function morningConfig(env = process.env) {
  const production = String(env.MORNING_ENV || "").toLowerCase() === "production";
  return {
    environment: production ? "production" : "sandbox",
    apiBase: env.MORNING_API_BASE || (production ? "https://api.greeninvoice.co.il/api" : "https://sandbox.d.greeninvoice.co.il/api"),
    tokenUrl: env.MORNING_TOKEN_URL || (production ? "https://api.morning.co/idp/v1/oauth/token" : "https://api.sandbox.morning.dev/idp/v1/oauth/token"),
    legacyAuth: String(env.MORNING_AUTH || "").toLowerCase() === "legacy",
  };
}

const short = (s, n = 200) => String(s ?? "").slice(0, n);

function messageOf(json, text) {
  const m = json && (json.errorMessage || json.message || json.error_description || json.error);
  return short(typeof m === "string" ? m : text, 240);
}

/**
 * @param {{ fetchImpl?: typeof fetch, config?: ReturnType<typeof morningConfig> }} [opts]
 */
export function createMorning({ fetchImpl = globalThis.fetch, config = morningConfig() } = {}) {
  const tokens = new Map(); // keyId -> { token, expiresAt }

  async function call(url, init) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctl.signal });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { httpStatus: res.status, ok: res.ok, json, text };
    } catch (e) {
      return { networkError: true, message: e && e.name === "AbortError" ? "timeout" : short(e && e.message) };
    } finally {
      clearTimeout(t);
    }
  }

  /** @param {{ keyId: string, secret: string }} creds @returns {Promise<any>} */
  async function token({ keyId, secret }) {
    const cached = tokens.get(keyId);
    if (cached && cached.expiresAt - SAFETY_MS > Date.now()) return { ok: true, token: cached.token };

    const r = config.legacyAuth
      ? await call(`${config.apiBase}/v1/account/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: keyId, secret }) })
      : await call(config.tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: keyId, client_secret: secret }) });
    if (r.networkError) return { ok: false, kind: "ambiguous", message: r.message };
    const tok = r.json && (r.json.accessToken || r.json.token);
    if (!r.ok || !tok) {
      // A token request creates nothing, so ANY failure here is safe to report as definite.
      const kind = r.httpStatus >= 500 ? "ambiguous" : (r.httpStatus === 400 || r.httpStatus === 401 || r.httpStatus === 403 ? "auth" : "definite");
      return { ok: false, kind, httpStatus: r.httpStatus, message: messageOf(r.json, r.text) };
    }
    const exp = r.json.expiresAt ? Number(r.json.expiresAt) * (Number(r.json.expiresAt) < 1e12 ? 1000 : 1) : Date.now() + 3600 * 1000;
    tokens.set(keyId, { token: tok, expiresAt: exp });
    return { ok: true, token: tok };
  }

  const authed = (tok) => ({ "Content-Type": "application/json", Authorization: "Bearer " + tok });

  return {
    config,

    /** Do these keys work? Creates nothing. @param {{ keyId: string, secret: string }} creds @returns {Promise<any>} */
    async verify(creds) {
      const t = await token(creds);
      if (!t.ok) return t;
      const r = await call(`${config.apiBase}/v1/users/me`, { method: "GET", headers: authed(t.token) });
      if (r.networkError) return { ok: false, kind: "ambiguous", message: r.message };
      if (!r.ok) return { ok: false, kind: classifyFailure(r) === "auth" ? "auth" : "definite", httpStatus: r.httpStatus, message: messageOf(r.json, r.text) };
      const j = r.json || {};
      return { ok: true, businessName: short(j.name || j.businessName || (j.business && j.business.name) || "", 120) };
    },

    /** Create one document. Never throws. @param {{ keyId: string, secret: string }} creds @param {any} body @returns {Promise<any>} */
    async createDocument(creds, body) {
      const t = await token(creds);
      if (!t.ok) return { ok: false, kind: t.kind === "ambiguous" ? "definite" : t.kind, httpStatus: t.httpStatus, message: t.message }; // nothing was created yet
      const r = await call(`${config.apiBase}/v1/documents`, { method: "POST", headers: authed(t.token), body: JSON.stringify(body) });
      if (r.networkError) return { ok: false, kind: "ambiguous", message: r.message };
      if (r.httpStatus === 401) tokens.delete(creds.keyId);
      if (!r.ok) return { ok: false, kind: classifyFailure(r), httpStatus: r.httpStatus, message: messageOf(r.json, r.text), raw: short(r.text, 400) };

      const j = r.json || {};
      const id = j.id ?? j.documentId;
      if (!id) return { ok: false, kind: "ambiguous", httpStatus: r.httpStatus, message: "answer had no document id", raw: short(r.text, 400) };
      const url = typeof j.url === "string" ? j.url : (j.url && (j.url.origin || j.url.he || j.url.en)) || null;
      return { ok: true, docId: String(id), number: j.number != null ? String(j.number) : null, url, raw: short(r.text, 400) };
    },
  };
}

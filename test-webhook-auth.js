// test-webhook-auth.js
//
// Proves lib/webhookAuth.js: the inbound WhatsApp webhook accepts only a
// request carrying the configured secret, in the three places GreenAPI or a
// URL can present it, and refuses everything when no secret is configured.
// Plain node, no network.

import { isAuthorizedWebhook, webhookUnauthorized, _resetWarning, WEBHOOK_SECRET_ENV } from './lib/webhookAuth.js';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const SECRET = 'k9Xb-3fQ_sT7pLmZ2vR8wHnC1dY4gU6aE0iO5jN';
const env = { [WEBHOOK_SECRET_ENV]: SECRET };
const quiet = { error() {} };
const req = (url, headers = {}) => new Request(url, { method: 'POST', headers });

// ── Accepted forms ─────────────────────────────────────────────────────────
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: `Bearer ${SECRET}` }), { env }), true, 'Bearer header');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: `bearer ${SECRET}` }), { env }), true, 'bearer, lower case');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: SECRET }), { env }), true, 'bare header value');
eq(isAuthorizedWebhook(req(`http://x/api/whatsapp-webhook?token=${SECRET}`), { env }), true, 'token in the query string');
eq(isAuthorizedWebhook(req(`http://x/api/whatsapp-webhook?token=${SECRET}`, { authorization: 'Bearer wrong' }), { env }), true, 'a right query token beats a wrong header');

// ── Refused ────────────────────────────────────────────────────────────────
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook'), { env }), false, 'nothing presented');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: 'Bearer ' + SECRET.slice(0, -1) + '0' }), { env }), false, 'one character off');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: 'Bearer ' + SECRET.slice(0, -1) }), { env }), false, 'one character short');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: 'Bearer ' + SECRET + 'x' }), { env }), false, 'one character long');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook?token='), { env }), false, 'empty query token');
eq(isAuthorizedWebhook(req('http://x/api/whatsapp-webhook', { authorization: 'Bearer' }), { env }), false, 'Bearer with nothing after it');

// ── Fail closed when the secret is not configured ──────────────────────────
{
  const logged = [];
  const log = { error: (...a) => logged.push(a.join(' ')) };
  _resetWarning();
  eq(isAuthorizedWebhook(req('http://x/', { authorization: `Bearer ${SECRET}` }), { env: {}, log }), false, 'unset secret refuses even a matching header');
  eq(isAuthorizedWebhook(req('http://x/', { authorization: 'Bearer anything' }), { env: {}, log }), false, 'unset secret refuses everything');
  eq(isAuthorizedWebhook(req('http://x/'), { env: { [WEBHOOK_SECRET_ENV]: '   ' }, log }), false, 'whitespace-only secret counts as unset');
  eq(logged.length, 1, 'the missing-secret warning prints once per process, not per request');
  eq(logged[0].includes(WEBHOOK_SECRET_ENV), true, 'and names the variable');
  eq(logged[0].includes(SECRET), false, 'and never prints a secret');
}

// ── The refusal response ───────────────────────────────────────────────────
{
  const res = webhookUnauthorized();
  eq(res.status, 401, '401');
}

// ── An empty configured secret never matches an empty presented one ────────
eq(isAuthorizedWebhook(req('http://x/?token='), { env: { [WEBHOOK_SECRET_ENV]: '' }, log: quiet }), false, 'empty equals empty is still refused');

console.log(`test-webhook-auth: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

// test-link-tokens.ts
//
// Proves the expiring link tokens: lib/signedToken.ts and the three signers
// built on it. A cancel link in a forwarded message used to work forever;
// now it dies three days after the visit, a review link a month after it is
// sent, and the un-dated tokens already out in WhatsApp threads keep
// working until the legacy window closes - against every key they might
// have been signed with, so setting the dedicated secret does not break
// them. Plain node; the runner supplies placeholder secrets.

import { createHmac } from 'node:crypto';
import { signWithExpiry, verifyWithExpiry, expiryAfterDate, LEGACY_ACCEPTED_UNTIL } from './lib/signedToken.ts';
import { signConfirm, verifyConfirm, confirmLinks, confirmExpiry, CONFIRM_GRACE_DAYS, CONFIRM_DEFAULT_TTL_MS } from './lib/confirmToken.ts';
import { signReview, verifyReview, reviewLink, REVIEW_TTL_MS } from './lib/reviewToken.ts';
import { signScanLink, verifyScanLink } from './lib/scanToken.ts';
import { signingSecret, legacySecrets, linkSecretsConfigured, _resetLinkSecretWarnings } from './lib/linkSecret.ts';

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 21, 10, 0, 0); // 2026-09-21T10:00Z, inside the legacy window
const legacyHmac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('base64url').slice(0, 32);

// ── The construction ───────────────────────────────────────────────────────
{
  const tok = signWithExpiry('k1', 'appt-1:cancel', NOW + DAY);
  eq(/^\d+\.[A-Za-z0-9_-]{32}$/.test(tok), true, 'token is <exp>.<32-char sig>');
  eq(verifyWithExpiry(tok, 'appt-1:cancel', 'k1', ['k1'], NOW), true, 'round trip');
  eq(verifyWithExpiry(tok, 'appt-1:cancel', 'k1', ['k1'], NOW + DAY + 1000), false, 'dead after expiry');
  eq(verifyWithExpiry(tok, 'appt-1:confirm', 'k1', ['k1'], NOW), false, 'wrong action');
  eq(verifyWithExpiry(tok, 'appt-2:cancel', 'k1', ['k1'], NOW), false, 'wrong appointment');
  eq(verifyWithExpiry(tok, 'appt-1:cancel', 'k2', ['k2'], NOW), false, 'wrong key');
  const [exp, sig] = tok.split('.');
  eq(verifyWithExpiry(`${Number(exp) + 100000}.${sig}`, 'appt-1:cancel', 'k1', ['k1'], NOW), false, 'exp edited forward: signature no longer matches');
  eq(verifyWithExpiry(`${exp}.${sig.slice(0, -1)}x`, 'appt-1:cancel', 'k1', ['k1'], NOW), false, 'sig edited');
  eq(verifyWithExpiry(`${exp}.`, 'appt-1:cancel', 'k1', ['k1'], NOW), false, 'empty sig');
  eq(verifyWithExpiry(`abc.${sig}`, 'appt-1:cancel', 'k1', ['k1'], NOW), false, 'non-numeric exp');
  eq(verifyWithExpiry('', 'appt-1:cancel', 'k1', ['k1'], NOW), false, 'empty token');
  eq(verifyWithExpiry(tok, '', 'k1', ['k1'], NOW), false, 'empty message');
  let threw = false;
  try { signWithExpiry('k1', 'm', NaN); } catch { threw = true; }
  eq(threw, true, 'a bad expiry refuses to sign');
}

// ── Legacy tokens: the window and the key chain ────────────────────────────
{
  const legacy = legacyHmac('old-service-key', 'appt-1:cancel');
  eq(verifyWithExpiry(legacy, 'appt-1:cancel', 'new-dedicated', ['new-dedicated', 'old-service-key'], NOW), true, 'legacy token signed under the fallback key verifies after the dedicated secret is set');
  eq(verifyWithExpiry(legacy, 'appt-1:cancel', 'new-dedicated', ['new-dedicated'], NOW), false, 'but not if that key is no longer in the chain');
  eq(verifyWithExpiry(legacy, 'appt-1:cancel', 'old-service-key', ['old-service-key'], LEGACY_ACCEPTED_UNTIL), false, 'refused the moment the window closes');
  eq(verifyWithExpiry(legacy, 'appt-1:cancel', 'old-service-key', ['old-service-key'], LEGACY_ACCEPTED_UNTIL - 1000), true, 'accepted a second before');
  eq(LEGACY_ACCEPTED_UNTIL > NOW + 90 * DAY, true, 'the window outlives the 60-day booking horizon with room');
}

// ── Expiry from an appointment date ────────────────────────────────────────
{
  const fb = NOW + 90 * DAY;
  const e = expiryAfterDate('2026-10-05', 3, fb);
  eq(e, Date.UTC(2026, 9, 6) + 3 * DAY, 'end of the day plus three days');
  eq(expiryAfterDate('', 3, fb), fb, 'no date: the fallback');
  eq(expiryAfterDate('05/10/2026', 3, fb), fb, 'unparseable date: the fallback');
  eq(confirmExpiry('2026-10-05', NOW), Date.UTC(2026, 9, 6) + CONFIRM_GRACE_DAYS * DAY, 'confirmExpiry uses the grace constant');
  eq(confirmExpiry(null, NOW), NOW + CONFIRM_DEFAULT_TTL_MS, 'confirmExpiry falls back to 90 days from now');
}

// ── The confirm signer ─────────────────────────────────────────────────────
{
  const id = 'a1b2c3d4-0000-4000-8000-000000000001';
  const links = confirmLinks('https://x', id, { date: '2026-10-05', nowMs: NOW });
  const tConfirm = new URL(links.confirmUrl).searchParams.get('t') || '';
  const tCancel = new URL(links.cancelUrl).searchParams.get('t') || '';
  eq(tConfirm.includes('.'), true, 'confirm link carries a dated token');
  eq(verifyConfirm(id, 'confirm', tConfirm, NOW), true, 'confirm link verifies');
  eq(verifyConfirm(id, 'cancel', tCancel, NOW), true, 'cancel link verifies');
  eq(verifyConfirm(id, 'cancel', tConfirm, NOW), false, 'a confirm token cannot cancel');
  eq(verifyConfirm(id, 'confirm', tCancel, NOW), false, 'a cancel token cannot confirm');
  const dayAfterGrace = Date.UTC(2026, 9, 6) + CONFIRM_GRACE_DAYS * DAY + 1000;
  eq(verifyConfirm(id, 'cancel', tCancel, dayAfterGrace), false, 'the cancel link is dead three days after the visit');
  eq(verifyConfirm(id, 'cancel', tCancel, Date.UTC(2026, 9, 6) + CONFIRM_GRACE_DAYS * DAY - 1000), true, 'and alive just before');
  eq(verifyConfirm(id, 'delete', tCancel, NOW), false, 'unknown action refused');
  eq(verifyConfirm('', 'cancel', tCancel, NOW), false, 'no id refused');
  // A legacy confirm token from a message sent before this change.
  const legacy = legacyHmac(signingSecret('CONFIRM_LINK_SECRET'), `${id}:cancel`);
  eq(verifyConfirm(id, 'cancel', legacy, NOW), true, 'legacy cancel token still works inside the window');
  eq(verifyConfirm(id, 'cancel', legacy, LEGACY_ACCEPTED_UNTIL + DAY), false, 'and not after it');
  eq(signConfirm(id, 'cancel', NOW + DAY) !== signConfirm(id, 'cancel', NOW + 2 * DAY), true, 'different expiry, different signature');
}

// ── The review signer ──────────────────────────────────────────────────────
{
  const id = 'a1b2c3d4-0000-4000-8000-000000000002';
  const url = reviewLink('https://x', id, NOW);
  const t = new URL(url).searchParams.get('t') || '';
  eq(verifyReview(id, t, NOW), true, 'review link verifies');
  eq(verifyReview(id, t, NOW + REVIEW_TTL_MS + 1000), false, 'dead after 30 days');
  eq(verifyReview(id, t, NOW + REVIEW_TTL_MS - 1000), true, 'alive just before');
  eq(verifyReview('a1b2c3d4-0000-4000-8000-000000000003', t, NOW), false, 'another appointment refused');
  eq(verifyConfirm(id, 'cancel', t, NOW), false, 'a review token cannot cancel');
  eq(verifyConfirm(id, 'confirm', signReview(id, NOW + DAY), NOW), false, 'nor confirm');
  const legacy = legacyHmac(signingSecret('REVIEW_LINK_SECRET'), `${id}:review`);
  eq(verifyReview(id, legacy, NOW), true, 'legacy review token inside the window');
}

// ── The scan signer: no expiry by design, but every key in the chain ──────
{
  const tid = 'a1b2c3d4-0000-4000-8000-000000000009';
  const s = signScanLink(tid);
  eq(verifyScanLink(tid, s), true, 'scan link verifies');
  eq(verifyScanLink('a1b2c3d4-0000-4000-8000-000000000010', s), false, 'another tenant refused');
  eq(verifyScanLink(tid, s + 'x'), false, 'tampered refused');
  eq(verifyScanLink(tid, ''), false, 'empty refused');
  eq(s.includes('.'), false, 'scan tokens stay un-dated: printed QR codes must not expire');
}

// ── The secret chain ───────────────────────────────────────────────────────
{
  const logged: string[] = [];
  const log = { error: (...a: unknown[]) => logged.push(a.join(' ')) };
  _resetLinkSecretWarnings();
  eq(signingSecret('X_SECRET', { X_SECRET: 'ded', SUPABASE_SERVICE_ROLE_KEY: 'svc' }, log), 'ded', 'dedicated wins');
  eq(logged.length, 0, 'no warning when dedicated is set');
  eq(signingSecret('X_SECRET', { SUPABASE_SERVICE_ROLE_KEY: 'svc' }, log), 'svc', 'falls back to the service key');
  eq(logged.length, 1, 'warns once');
  signingSecret('X_SECRET', { SUPABASE_SERVICE_ROLE_KEY: 'svc' }, log);
  eq(logged.length, 1, 'and only once per process');
  eq(logged[0].includes('X_SECRET'), true, 'naming the variable');
  eq(logged[0].includes('svc'), false, 'never printing a secret');
  let threw = false;
  try { signingSecret('X_SECRET', {}, log); } catch { threw = true; }
  eq(threw, true, 'neither key: throws');
  eq(legacySecrets('X_SECRET', { X_SECRET: 'ded', SUPABASE_SERVICE_ROLE_KEY: 'svc' }), ['ded', 'svc'], 'legacy chain, dedicated first');
  eq(legacySecrets('X_SECRET', { X_SECRET: 'same', SUPABASE_SERVICE_ROLE_KEY: 'same' }), ['same'], 'deduplicated');
  eq(legacySecrets('X_SECRET', {}), [], 'empty when nothing is set');
  eq(linkSecretsConfigured({ CONFIRM_LINK_SECRET: 'a', REVIEW_LINK_SECRET: 'b' }), { ok: true, missing: [] }, 'configured');
  eq(linkSecretsConfigured({ CONFIRM_LINK_SECRET: 'a' }), { ok: false, missing: ['REVIEW_LINK_SECRET'] }, 'names what is missing');
}

console.log(`test-link-tokens: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

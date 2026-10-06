// The public skin scanner can no longer be used to spend AI money or send chosen text.
//
// Found 2026-10-06 (audit), all three on the anonymous routes:
//   * POST /api/skin-scan with NO tenantId skipped the signature, the tenant limit, the monthly
//     quota and the dollar ceiling and went straight to a Claude vision call;
//   * POST /api/skin-scan/send took the phone AND the report from the body, so anyone could have the
//     Kalmea WhatsApp number send text of their choosing, labelled with any business's name;
//   * POST /api/skin-scan/lead wrote - and overwrote - leads in any business's CRM, unsigned.
// These tests run the real rules (lib/skinScanGuard.ts) and the real signing (lib/scanToken.ts).
import assert from 'node:assert/strict';

process.env.SCAN_LINK_SECRET = 'test-scan-secret-not-used-anywhere-else';
const {
  checkScanPayload, admitScan, checkSendPayload, checkLeadPayload,
  SCAN_MAX_IMAGE_CHARS, SCAN_MIN_IMAGE_CHARS, INVALID_LINK_HE,
} = await import('./lib/skinScanGuard.ts');
const { signScanLink, verifyScanLink, signScanReport, verifyScanReport, canonicalJson, REPORT_TOKEN_TTL_MS } = await import('./lib/scanToken.ts');

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const img = (n: number) => 'A'.repeat(n);
const GOOD_IMG = img(SCAN_MIN_IMAGE_CHARS + 10);

// ── the scan request: shape and size, before anything costs money ──────────────────────────────
assert.deepEqual(checkScanPayload({ image: GOOD_IMG, mediaType: 'image/jpeg', tenantId: T1 }), { ok: true });
for (const tenantId of [undefined, null, '', 'not-a-uuid', 123, '11111111-1111-1111-1111-11111111111']) {
  const v: any = checkScanPayload({ image: GOOD_IMG, tenantId });
  assert.equal(v.ok, false, `no valid tenant (${JSON.stringify(tenantId)}): refused`);
  assert.equal(v.status, 400); assert.equal(v.reason, 'no_tenant');
}
assert.equal((checkScanPayload({ image: '', tenantId: T1 }) as any).reason, 'no_image');
assert.equal((checkScanPayload({ image: undefined, tenantId: T1 }) as any).reason, 'no_image');
assert.equal((checkScanPayload({ image: { evil: true }, tenantId: T1 }) as any).reason, 'no_image', 'an object is not an image');
assert.equal((checkScanPayload({ image: img(SCAN_MIN_IMAGE_CHARS - 1), tenantId: T1 }) as any).reason, 'image_too_small');
{
  const v: any = checkScanPayload({ image: img(SCAN_MAX_IMAGE_CHARS + 1), tenantId: T1 });
  assert.equal(v.status, 413); assert.equal(v.reason, 'image_too_large', 'over the size limit: 413, never sent to the model');
}
assert.equal(checkScanPayload({ image: img(SCAN_MAX_IMAGE_CHARS), tenantId: T1 }).ok, true, 'exactly at the limit is allowed');
assert.equal((checkScanPayload({ image: '<script>alert(1)</script>' + img(SCAN_MIN_IMAGE_CHARS), tenantId: T1 }) as any).reason, 'image_not_base64');
for (const t of ['image/gif', 'application/pdf', 'text/html', 'image/svg+xml']) assert.equal((checkScanPayload({ image: GOOD_IMG, mediaType: t, tenantId: T1 }) as any).reason, 'media_type', `${t} refused`);
for (const t of ['image/jpeg', 'image/png', 'image/webp', undefined]) assert.equal(checkScanPayload({ image: GOOD_IMG, mediaType: t, tenantId: T1 }).ok, true, `${t} allowed`);

// ── who may scan: a signed link, or her own session for THAT tenant. Naming a tenant is not enough ──
assert.equal(admitScan({ tenantId: T1, signatureValid: true }).ok, true, 'a client holding her signed link');
assert.equal(admitScan({ tenantId: T1, signatureValid: false, sessionTenantId: T1 }).ok, true, 'her own signed-in session (the scanner in her app)');
for (const [label, a] of Object.entries({
  'no tenant at all': { tenantId: undefined, signatureValid: false },
  'a valid signature but no tenant': { tenantId: null, signatureValid: true },
  'unsigned, no session': { tenantId: T1, signatureValid: false },
  'unsigned, ANOTHER tenant\'s session': { tenantId: T1, signatureValid: false, sessionTenantId: T2 },
  'unsigned, session without a tenant': { tenantId: T1, signatureValid: false, sessionTenantId: null },
})) {
  const v: any = admitScan(a as any);
  assert.equal(v.ok, false, `${label}: refused`);
  assert.ok([400, 403].includes(v.status));
  assert.equal(v.error, INVALID_LINK_HE, 'and the visitor is told to ask for a fresh link, not blamed');
}

// ── the link signature itself ───────────────────────────────────────────────────────────────────
assert.equal(verifyScanLink(T1, signScanLink(T1)), true);
assert.equal(verifyScanLink(T2, signScanLink(T1)), false, 'a signature for one business does not open another');
assert.equal(verifyScanLink(T1, undefined), false); assert.equal(verifyScanLink(T1, ''), false); assert.equal(verifyScanLink(T1, 'x'.repeat(32)), false);

// ── the signed report: what /send is allowed to message ─────────────────────────────────────────
const report = { valid: true, score: 71, skin_type: 'מעורב', clinical_treatment: 'פילינג', nested: { b: 2, a: [3, 1] } };
const token = signScanReport(T1, report);
assert.equal(verifyScanReport(T1, report, token), true, 'the exact report verifies');
assert.equal(verifyScanReport(T1, { ...report, nested: { a: [3, 1], b: 2 } }, token), true, 'key order does not matter (canonical JSON)');
assert.equal(canonicalJson({ b: 1, a: { d: 1, c: 2 } }), canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
assert.equal(verifyScanReport(T1, { ...report, score: 99 }, token), false, 'ONE changed value fails');
assert.equal(verifyScanReport(T1, { ...report, clinical_treatment: 'כתבו לי בוואטסאפ http://evil.example' }, token), false, 'chosen text cannot ride on a real token');
assert.equal(verifyScanReport(T2, report, token), false, 'a report signed for one tenant is not another\'s');
assert.equal(verifyScanReport(T1, report, undefined), false); assert.equal(verifyScanReport(T1, report, ''), false); assert.equal(verifyScanReport(T1, report, 'garbage'), false);
assert.equal(verifyScanReport(T1, report, token + 'x'), false, 'a longer token fails');
assert.equal(verifyScanReport(T1, null, token), false, 'no report: no');
{
  const iat = Date.now();
  const old = signScanReport(T1, report, iat - REPORT_TOKEN_TTL_MS - 1000);
  assert.equal(verifyScanReport(T1, report, old, iat), false, 'a token older than its lifetime is dead');
  const fresh = signScanReport(T1, report, iat - REPORT_TOKEN_TTL_MS + 60_000);
  assert.equal(verifyScanReport(T1, report, fresh, iat), true, 'and one inside it is fine');
  const future = signScanReport(T1, report, iat + 60 * 60 * 1000);
  assert.equal(verifyScanReport(T1, report, future, iat), false, 'a token from the future is refused');
}
assert.equal(verifyScanReport(T1, report, signScanLink(T1)), false, 'a link signature cannot be replayed as a report token (purposes are separate)');

// ── /send: the phone must be a mobile, the report must be one we signed ─────────────────────────
const send = (over: Record<string, unknown> = {}) => checkSendPayload({ report, clientPhone: '050-123-4567', tenantId: T1, reportToken: token, ...over }, verifyScanReport);
{
  const v: any = send();
  assert.equal(v.ok, true); assert.equal(v.phone, '972501234567', 'the number is normalised once, here, and that is what is messaged');
}
assert.equal((send({ reportToken: undefined }) as any).reason, 'report_not_signed', 'the exact attack: a report we did not sign');
assert.equal((send({ report: { ...report, clinical_treatment: 'chosen text' } }) as any).reason, 'report_not_signed');
assert.equal((send({ tenantId: T2 }) as any).reason, 'report_not_signed', 'cannot send business A\'s report as business B');
assert.equal((send({ tenantId: undefined }) as any).reason, 'no_tenant');
assert.equal((send({ report: undefined }) as any).reason, 'no_report'); assert.equal((send({ report: [] }) as any).reason, 'no_report'); assert.equal((send({ report: 'text' }) as any).reason, 'no_report');
for (const p of ['', undefined, 'abc', '0212345678', '+1 415 555 0100', '12345']) assert.equal((send({ clientPhone: p }) as any).reason, 'bad_phone', `${JSON.stringify(p)} is not an Israeli mobile`);
assert.equal((send({ clientPhone: '+972 50 123 4567' }) as any).phone, '972501234567', 'international form accepted');

// ── /lead: signed link, a mobile, and only a whitelist of the report ────────────────────────────
const lead = (over: Record<string, unknown> = {}) => checkLeadPayload({ tenantId: T1, signature: signScanLink(T1), phone: '0501234567', name: ' דנה ', report: { matched_service: 'פילינג', score: 80, skin_type: 'שמן', extra: 'dropped' }, ...over }, verifyScanLink);
{
  const v: any = lead();
  assert.equal(v.ok, true); assert.equal(v.lead.phone, '972501234567'); assert.equal(v.lead.name, 'דנה');
  assert.deepEqual(Object.keys(v.lead.report).sort(), ['clinical_treatment', 'matched_service', 'score', 'skin_type'], 'only the whitelisted fields survive');
}
assert.equal((lead({ signature: undefined }) as any).reason, 'not_signed', 'the exact attack: an unsigned lead');
assert.equal((lead({ signature: signScanLink(T2) }) as any).reason, 'not_signed', 'another business\'s signature');
assert.equal((lead({ phone: '123' }) as any).reason, 'bad_phone');
assert.equal((lead({ tenantId: 'nope' }) as any).reason, 'no_tenant');
{
  const v: any = lead({ name: 'x'.repeat(500) + '\u0000\u0007', report: { matched_service: 'y'.repeat(1000), score: 9999 } });
  assert.equal(v.lead.name.length <= 60, true, 'a name is bounded'); assert.ok(!/[\u0000-\u001f]/.test(v.lead.name), 'and has no control characters');
  assert.equal(v.lead.report.matched_service.length <= 80, true); assert.equal(v.lead.report.score, 100, 'a score is a number from 0 to 100');
  assert.equal(lead({ report: { score: 'abc' } }).ok && (lead({ report: { score: 'abc' } }) as any).lead.report.score, null);
}

console.log('skin scan guard: ok');

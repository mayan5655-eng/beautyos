import assert from 'node:assert/strict';

// A real key format, but a throwaway: this only lets encryptToken run.
process.env.TOKEN_ENCRYPTION_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

const policy = await import('./lib/legalReceipts/policy.js');
const spec = await import('./lib/legalReceipts/spec.js');
const { createMorning, morningConfig } = await import('./lib/legalReceipts/morning.js');
const svc = await import('./lib/legalReceipts/service.js');

// ============================== policy ==============================
assert.deepEqual(policy.docTypeFor('exempt'), { key: 'receipt', code: 400, labelHe: 'קבלה' }, 'exempt dealer: a receipt');
assert.equal(policy.docTypeFor('licensed').code, 320, 'authorized dealer: tax invoice-receipt');
assert.equal(policy.docTypeFor('company').code, 320);
assert.equal(policy.docTypeFor(undefined).code, 400, "unset is 'exempt', as everywhere else in the app");
assert.equal(policy.needsLegalDoc({ amount: 200, payment_method: 'מזומן' }), true);
assert.equal(policy.needsLegalDoc({ amount: 0, payment_method: 'חבילה' }), false, 'a package-covered visit has no document');
assert.equal(policy.needsLegalDoc({ amount: 150, payment_method: 'חבילה' }), false);
assert.equal(policy.needsLegalDoc({ amount: 0, payment_method: 'מזומן' }), false);
assert.equal(policy.needsLegalDoc({}), false);

// The label: "קבלה" ONLY when a provider document really exists.
assert.equal(policy.docLabelHe({ legal_status: 'none' }), 'אישור תשלום');
assert.equal(policy.docLabelHe({}), 'אישור תשלום');
assert.equal(policy.docLabelHe({ legal_status: 'pending' }), 'אישור תשלום');
assert.equal(policy.docLabelHe({ legal_status: 'failed' }), 'אישור תשלום');
assert.equal(policy.docLabelHe({ legal_status: 'unknown' }), 'אישור תשלום');
assert.equal(policy.docLabelHe({ legal_status: 'issued', legal_doc_type: 'receipt' }), 'קבלה');
assert.equal(policy.docLabelHe({ legal_status: 'issued', legal_doc_type: 'tax_invoice_receipt' }), 'חשבונית מס קבלה');
assert.equal(policy.legalStateHe({ legal_status: 'issued', legal_doc_type: 'receipt', legal_doc_number: '1042' }), 'קבלה מספר 1042');
assert.equal(policy.legalStateHe({ legal_status: 'pending' }), 'ממתין להנפקת מסמך');
assert.equal(policy.legalStateHe({ legal_status: 'none' }), '');
assert.ok(/לא בטוחות/.test(policy.legalStateHe({ legal_status: 'unknown' })));
assert.equal(policy.creditStateHe({ credit_status: 'issued', credit_doc_number: '7' }), 'מסמך זיכוי מספר 7');

// How a failed call is read: only silence can mean the document exists.
assert.equal(policy.classifyFailure({ networkError: true }), 'ambiguous');
assert.equal(policy.classifyFailure({ httpStatus: 500 }), 'ambiguous');
assert.equal(policy.classifyFailure({ httpStatus: 503 }), 'ambiguous');
assert.equal(policy.classifyFailure({ httpStatus: 408 }), 'ambiguous');
assert.equal(policy.classifyFailure({ httpStatus: 401 }), 'auth');
assert.equal(policy.classifyFailure({ httpStatus: 403 }), 'auth');
assert.equal(policy.classifyFailure({ httpStatus: 400 }), 'definite');
assert.equal(policy.classifyFailure({ httpStatus: 422 }), 'definite');
assert.equal(policy.classifyFailure({ httpStatus: 429 }), 'definite');
assert.equal(policy.statusAfterFailure('ambiguous'), 'unknown');
assert.equal(policy.statusAfterFailure('definite'), 'failed');
assert.equal(policy.statusAfterFailure('auth'), 'failed');
// Auto retry: only a definite failure, only after a wait, only a few times.
assert.equal(policy.shouldAutoRetry({ status: 'failed', attempts: 1, ageMinutes: 31 }), true);
assert.equal(policy.shouldAutoRetry({ status: 'failed', attempts: 1, ageMinutes: 10 }), false, 'not immediately');
assert.equal(policy.shouldAutoRetry({ status: 'failed', attempts: 5, ageMinutes: 999 }), false, 'gives up');
assert.equal(policy.shouldAutoRetry({ status: 'unknown', attempts: 1, ageMinutes: 999 }), false, 'NEVER a row we are unsure about');
assert.equal(policy.shouldAutoRetry({ status: 'pending', attempts: 1, ageMinutes: 999 }), false);
assert.equal(policy.shouldAutoRetry({ status: 'issued', attempts: 1, ageMinutes: 999 }), false);

// ============================== spec ==============================
const receipt = { id: 'r1', client_id: 'c1', client_name: 'דנה', service: 'פילינג', amount: 250, discount: 50, payment_method: 'אשראי', items: JSON.stringify([{ name: 'פילינג', price: 200, qty: 1 }, { name: 'קרם', price: 100, qty: 1 }]) };
const d = spec.buildDocument({ receipt, taxStatus: 'exempt', client: { name: 'דנה כהן', email: 'd@x.co', phone: '0501234567' }, date: '2026-09-30' });
assert.equal(d.type, 400); assert.equal(d.lang, 'he'); assert.equal(d.currency, 'ILS'); assert.equal(d.date, '2026-09-30');
assert.equal(d.remarks, 'BOS:r1', 'our own reference, to find it again');
assert.equal(d.client.add, false, "we do not pollute her client list");
assert.deepEqual(d.client.emails, ['d@x.co']);
assert.deepEqual(d.income.map((r: any) => [r.description, r.price]), [['פילינג', 200], ['קרם', 100], ['הנחה', -50]], 'the discount is a visible negative line');
assert.equal(d.income.reduce((s: number, r: any) => s + r.price * r.quantity, 0), 250, 'rows add up to what was paid');
assert.deepEqual(d.payment, [{ date: '2026-09-30', price: 250, currency: 'ILS', type: 3, dealType: 1, cardType: 0 }]);
assert.equal(d.income[0].vatType, 0, 'exempt: no VAT on the rows');
const dl = spec.buildDocument({ receipt, taxStatus: 'licensed', date: '2026-09-30' });
assert.equal(dl.type, 320); assert.equal(dl.income[0].vatType, 1, 'authorized dealer: her prices include VAT');
// split payment: each line, tip never in the document
const split = spec.buildDocument({ receipt: { ...receipt, tip: 30, payment_method: 'מפוצל', payments: [{ method: 'ביט', amount: 150 }, { method: 'מזומן', amount: 100 }] }, taxStatus: 'exempt', date: '2026-09-30' });
assert.deepEqual(split.payment.map((p: any) => [p.type, p.price]), [[10, 150], [1, 100]]);
assert.equal(split.payment.reduce((s: number, p: any) => s + p.price, 0), 250, 'the tip is not part of the document');
assert.equal(spec.paymentFor('העברה', 10, 'd').type, 4);
assert.equal(spec.paymentFor('פייבוקס', 10, 'd').type, 10);
assert.equal(spec.paymentFor('משהו', 10, 'd').type, 11);
// rows that do not add up -> one honest line, never a wrong document
const odd = spec.incomeRows({ ...receipt, items: JSON.stringify([{ name: 'x', price: 10, qty: 1 }]), discount: 0 }, 'exempt');
assert.deepEqual(odd.map((r: any) => [r.description, r.price]), [['פילינג', 250]]);
assert.equal(spec.incomeRows({ amount: 99, service: 'טיפול', items: null }, 'exempt')[0].price, 99, 'no items: one line');
// the credit
const c = spec.buildCredit({ receipt, originalDocId: 'doc-1', taxStatus: 'exempt', date: '2026-09-30', reason: 'סכום שגוי' });
assert.equal(c.type, 330); assert.deepEqual(c.linkedDocumentIds, ['doc-1']); assert.equal(c.linkType, 'cancel');
assert.equal(c.remarks, 'BOS:r1:credit');
assert.deepEqual(c.income.map((r: any) => r.price), [-200, -100, 50], 'every row negated');
assert.equal(c.payment[0].price, -250);
assert.ok(c.description.includes('סכום שגוי'));
assert.equal(spec.israelDate(new Date('2026-09-30T21:30:00Z')), '2026-10-01', 'Israel date, not UTC');

// ============================== the Morning adapter (fake fetch) ==============================
assert.equal(morningConfig({}).environment, 'sandbox', 'sandbox unless production is chosen on purpose');
assert.equal(morningConfig({ MORNING_ENV: 'production' }).environment, 'production');
assert.ok(/sandbox/.test(morningConfig({}).apiBase));
assert.ok(!/sandbox/.test(morningConfig({ MORNING_ENV: 'production' }).apiBase));
assert.equal(morningConfig({ MORNING_API_BASE: 'https://x/api' }).apiBase, 'https://x/api', 'overridable');

const mkFetch = (script: (url: string, init: any) => any) => {
  const calls: any[] = [];
  const f = async (url: string, init: any) => {
    calls.push({ url, init });
    const r = await script(url, init);
    if (r instanceof Error) throw r;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})) };
  };
  return { f: f as any, calls };
};
{
  const cfg = morningConfig({});
  const { f, calls } = mkFetch((url) =>
    url === cfg.tokenUrl ? { status: 200, body: { accessToken: 'TKN', expiresAt: Math.floor(Date.now() / 1000) + 3600 } }
    : url.endsWith('/v1/users/me') ? { status: 200, body: { name: 'קליניקה של דנה' } }
    : url.endsWith('/v1/documents') ? { status: 201, body: { id: 'doc-9', number: 1042, url: { origin: 'https://pdf/9', he: 'https://pdf/9he' } } }
    : { status: 404 });
  const m = createMorning({ fetchImpl: f, config: cfg });
  const creds = { keyId: 'KID', secret: 'SEC' };
  const v = await m.verify(creds);
  assert.deepEqual([v.ok, v.businessName], [true, 'קליניקה של דנה']);
  assert.deepEqual(JSON.parse(calls[0].init.body), { grant_type: 'client_credentials', client_id: 'KID', client_secret: 'SEC' }, 'OAuth client-credentials request');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer TKN');
  const made = await m.createDocument(creds, { type: 400 });
  assert.deepEqual([made.ok, made.docId, made.number, made.url], [true, 'doc-9', '1042', 'https://pdf/9']);
  assert.equal(calls.filter((x: any) => x.url === cfg.tokenUrl).length, 1, 'the token is cached, not re-requested');
  assert.equal(calls[calls.length - 1].init.method, 'POST'); assert.equal(JSON.parse(calls[calls.length - 1].init.body).type, 400);
}
{
  const cfg = morningConfig({});
  const mk = (docStatus: any) => createMorning({ config: cfg, fetchImpl: mkFetch((url) => url === cfg.tokenUrl ? { status: 200, body: { accessToken: 'T', expiresAt: Date.now() + 3.6e6 } } : docStatus).f });
  const creds = { keyId: 'K', secret: 'S' };
  let r = await mk({ status: 400, body: { errorMessage: 'missing client name' } }).createDocument(creds, {});
  assert.deepEqual([r.ok, r.kind, r.message], [false, 'definite', 'missing client name']);
  r = await mk({ status: 500, body: 'oops' }).createDocument(creds, {});
  assert.deepEqual([r.ok, r.kind], [false, 'ambiguous']);
  r = await mk({ status: 401 }).createDocument(creds, {});
  assert.equal(r.kind, 'auth');
  r = await mk(new Error('socket hang up')).createDocument(creds, {});
  assert.equal(r.kind, 'ambiguous', 'a dropped connection MAY have created it');
  r = await mk({ status: 200, body: { nothing: true } }).createDocument(creds, {});
  assert.equal(r.kind, 'ambiguous', 'a 200 with no id is not proof of anything');
  // a token failure created nothing, so it is never "ambiguous"
  const noTok = createMorning({ config: cfg, fetchImpl: mkFetch(() => ({ status: 401, body: { error: 'invalid_client' } })).f });
  r = await noTok.createDocument(creds, {});
  assert.equal(r.kind, 'auth');
  const netTok = createMorning({ config: cfg, fetchImpl: mkFetch(() => new Error('ECONNRESET')).f });
  r = await netTok.createDocument(creds, {});
  assert.equal(r.kind, 'definite', 'no token = nothing could have been created');
}

// ============================== the service, with an in-memory database ==============================
function makeDb(seed: Record<string, any[]>, opts: { failUpdateWhen?: (patch: any) => boolean } = {}) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  class Q {
    table: any[]; name: string; filters: ((r: any) => boolean)[] = []; op = 'select'; patch: any = null; single = false; lim: number | null = null; returning = false; conflict = '';
    constructor(name: string) { this.name = name; this.table = tables[name] ??= []; }
    select() { this.returning = true; return this; }
    eq(c: string, v: any) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
    in(c: string, a: any[]) { this.filters.push((r) => a.includes(r[c])); return this; }
    is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    lt(c: string, v: number) { this.filters.push((r) => r[c] != null && Number(r[c]) < v); return this; }
    limit(n: number) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    update(p: any) { this.op = 'update'; this.patch = p; return this; }
    upsert(row: any, o: any) { this.op = 'upsert'; this.patch = row; this.conflict = o?.onConflict || ''; return this; }
    delete() { this.op = 'delete'; return this; }
    then(res: any, rej?: any) { try { return res(this.exec()); } catch (e) { return rej ? rej(e) : Promise.reject(e); } }
    exec() {
      const hit = () => this.table.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'select') { let d = hit(); if (this.lim != null) d = d.slice(0, this.lim); return { data: this.single ? (d[0] ? { ...d[0] } : null) : d.map((r) => ({ ...r })), error: null }; }
      if (this.op === 'update') {
        if (opts.failUpdateWhen && opts.failUpdateWhen(this.patch)) return { data: null, error: { message: 'simulated write failure' } };
        const m = hit(); m.forEach((r) => Object.assign(r, this.patch));
        return { data: this.returning ? (this.single ? (m[0] ? { ...m[0] } : null) : m.map((r) => ({ ...r }))) : null, error: null };
      }
      if (this.op === 'upsert') { const i = this.table.findIndex((r) => r[this.conflict] === this.patch[this.conflict]); if (i >= 0) Object.assign(this.table[i], this.patch); else this.table.push({ ...this.patch }); return { data: null, error: null }; }
      if (this.op === 'delete') { const m = new Set(hit()); tables[this.name] = this.table.filter((r) => !m.has(r)); return { data: null, error: null }; }
      return { data: null, error: null };
    }
  }
  return { from: (n: string) => new Q(n), tables };
}
const TENANT = 't1';
const baseReceipt = (o: any = {}) => ({ id: 'r1', tenant_id: TENANT, client_id: 'c1', client_name: 'דנה', service: 'פילינג', amount: 250, discount: 50, payment_method: 'אשראי', items: JSON.stringify([{ name: 'פילינג', price: 200, qty: 1 }, { name: 'קרם', price: 100, qty: 1 }]), legal_status: 'none', legal_attempts: 0, ...o });
const seed = (o: any = {}) => ({
  receipts: [baseReceipt(o.receipt)],
  receipt_voids: o.voids || [],
  settings: [{ tenant_id: TENANT, business_tax_status: o.tax || 'exempt' }],
  clients: [{ id: 'c1', name: 'דנה כהן', phone: '0501234567' }],
  legal_receipt_accounts: o.noAccount ? [] : [{ tenant_id: TENANT, provider: 'morning', credentials_encrypted: '', environment: 'sandbox', needs_reconnect: false }],
});
const fakeAdapter = (script: (doc: any, n: number) => any) => {
  const calls: any[] = [];
  return { calls, config: { environment: 'sandbox' }, async verify() { return { ok: true, businessName: 'B' }; }, async createDocument(_c: any, doc: any) { calls.push(doc); return script(doc, calls.length); } };
};
const OK = (n = '1042') => ({ ok: true, docId: 'doc-' + n, number: n, url: 'https://pdf/' + n });

// ---- connect: keys verified first, stored encrypted, never returned ----
{
  const db: any = makeDb({ legal_receipt_accounts: [] });
  const bad = { config: { environment: 'sandbox' }, verify: async () => ({ ok: false, kind: 'auth' }) };
  let r: any = await svc.connectAccount({ db, tenantId: TENANT, keyId: 'K', secret: 'S', adapter: bad as any });
  assert.equal(r.ok, false); assert.ok(/sandbox/.test(r.error), 'in sandbox it says why real keys are refused');
  assert.equal(db.tables.legal_receipt_accounts.length, 0, 'wrong keys are not stored');
  assert.equal((await svc.connectAccount({ db, tenantId: TENANT, keyId: '', secret: 'S', adapter: bad as any })).ok, false);
  const good = { config: { environment: 'sandbox' }, verify: async () => ({ ok: true, businessName: 'קליניקה' }) };
  r = await svc.connectAccount({ db, tenantId: TENANT, keyId: 'MYKEYID', secret: 'MYSECRETVALUE', adapter: good as any });
  assert.deepEqual([r.ok, r.businessName], [true, 'קליניקה']);
  const stored = db.tables.legal_receipt_accounts[0];
  assert.ok(!JSON.stringify(stored).includes('MYSECRETVALUE') && !JSON.stringify(stored).includes('MYKEYID'), 'the secret is stored ENCRYPTED');
  const pub: any = svc.publicStatus(stored, { environment: 'sandbox' });
  assert.deepEqual(Object.keys(pub).sort(), ['businessName', 'connected', 'environment', 'lastError', 'needsReconnect', 'provider']);
  assert.ok(!JSON.stringify(pub).includes('crypt'), 'nothing secret leaves');
  assert.equal(svc.publicStatus(null, { environment: 'sandbox' }).connected, false);
  await svc.disconnectAccount({ db, tenantId: TENANT });
  assert.equal(db.tables.legal_receipt_accounts.length, 0);
}

// The account row needs real (encrypted) credentials for the issue tests.
const { encryptToken } = await import('./lib/facebook/encryption.ts');
const withCreds = (s: any) => { s.legal_receipt_accounts.forEach((a: any) => { a.credentials_encrypted = encryptToken(JSON.stringify({ keyId: 'K', secret: 'S' })); }); return s; };

// ---- optional per clinic: no account, nothing happens ----
{
  const db: any = makeDb(withCreds(seed({ noAccount: true }))); const ad = fakeAdapter(() => OK());
  const r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.deepEqual([r.status, r.skipped], ['none', 'not_connected']); assert.equal(ad.calls.length, 0);
  assert.equal(db.tables.receipts[0].legal_status, 'none', 'the record is untouched');
}

// ---- a normal issue ----
{
  const db: any = makeDb(withCreds(seed())); const ad = fakeAdapter(() => OK('1042'));
  const r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any, now: new Date('2026-09-30T09:00:00Z') });
  assert.equal(r.status, 'issued'); assert.equal(r.number, '1042');
  assert.equal(ad.calls.length, 1); assert.equal(ad.calls[0].type, 400); assert.equal(ad.calls[0].client.name, 'דנה כהן', "her client's real name from the client card");
  const row = db.tables.receipts[0];
  assert.deepEqual([row.legal_status, row.legal_doc_id, row.legal_doc_number, row.legal_doc_type, row.legal_doc_url, row.legal_provider], ['issued', 'doc-1042', '1042', 'receipt', 'https://pdf/1042', 'morning']);
  assert.equal(row.legal_attempts, 1);
  // again: idempotent, NOT a second legal document
  const again: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.deepEqual([again.status, again.already], ['issued', true]); assert.equal(ad.calls.length, 1, 'never issued twice');
}
// authorized dealer -> tax invoice-receipt
{
  const db: any = makeDb(withCreds(seed({ tax: 'licensed' }))); const ad = fakeAdapter(() => OK());
  await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.equal(ad.calls[0].type, 320); assert.equal(db.tables.receipts[0].legal_doc_type, 'tax_invoice_receipt');
}
// nothing to document
for (const rc of [{ amount: 0, payment_method: 'חבילה' }, { amount: 0 }]) {
  const db: any = makeDb(withCreds(seed({ receipt: rc }))); const ad = fakeAdapter(() => OK());
  const r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.deepEqual([r.status, r.skipped, ad.calls.length], ['none', 'no_payment', 0]);
}
// another clinic's receipt is invisible
{
  const db: any = makeDb(withCreds(seed())); const ad = fakeAdapter(() => OK());
  const r: any = await svc.issueForReceipt({ db, tenantId: 'someone-else', receiptId: 'r1', adapter: ad as any });
  assert.equal(r.skipped, 'not_connected'); assert.equal(ad.calls.length, 0);
}

// ---- the provider says no: a definite failure, the payment stays, the daily job retries ----
{
  const db: any = makeDb(withCreds(seed())); let n = 0;
  const ad = fakeAdapter(() => (++n === 1 ? { ok: false, kind: 'definite', httpStatus: 400, message: 'bad client' } : OK('2001')));
  const t0 = new Date('2026-09-30T09:00:00Z');
  let r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any, now: t0 });
  assert.deepEqual([r.status, r.kind], ['failed', 'definite']);
  assert.ok(/מורנינג לא קיבלה/.test(r.error) && /bad client/.test(r.error), 'a human sentence that says what was refused');
  assert.equal(db.tables.receipts[0].amount, 250, 'the payment itself is untouched');
  assert.equal(db.tables.receipts[0].legal_attempts, 1);
  // too soon
  let d: any = await svc.retryDue({ db, adapter: ad as any, now: new Date(t0.getTime() + 10 * 60000) });
  assert.equal(d.tried, 0); assert.equal(ad.calls.length, 1);
  // after 30 minutes
  d = await svc.retryDue({ db, adapter: ad as any, now: new Date(t0.getTime() + 31 * 60000) });
  assert.deepEqual([d.tried, d.issued], [1, 1]);
  assert.equal(db.tables.receipts[0].legal_status, 'issued');
}
// gives up after five tries
{
  const db: any = makeDb(withCreds(seed({ receipt: { legal_status: 'failed', legal_attempts: 5, legal_attempted_at: '2026-01-01T00:00:00Z' } }))); const ad = fakeAdapter(() => OK());
  const d: any = await svc.retryDue({ db, adapter: ad as any, now: new Date('2026-09-30T09:00:00Z') });
  assert.equal(d.tried, 0); assert.equal(ad.calls.length, 0);
}

// ---- silence: the document MAY exist, so nothing retries by itself ----
{
  const db: any = makeDb(withCreds(seed())); const ad = fakeAdapter(() => ({ ok: false, kind: 'ambiguous', message: 'timeout' }));
  const t0 = new Date('2026-09-30T09:00:00Z');
  let r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any, now: t0 });
  assert.deepEqual([r.status, r.kind], ['unknown', 'ambiguous']);
  assert.ok(/לא בטוחות/.test(r.error));
  const d: any = await svc.retryDue({ db, adapter: ad as any, now: new Date(t0.getTime() + 999 * 60000) });
  assert.equal(d.tried, 0, 'the daily job never touches an unsure row');
  r = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.deepEqual([r.status, r.skipped], ['unknown', 'in_flight_or_unconfirmed']); assert.equal(ad.calls.length, 1, 'and neither does a plain retry');
  // only her explicit "I checked, it is not there" retries it
  const ad2 = fakeAdapter(() => OK('3003'));
  r = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad2 as any, confirmUnknown: true });
  assert.equal(r.status, 'issued'); assert.equal(ad2.calls.length, 1);
}

// ---- wrong or revoked keys ----
{
  const db: any = makeDb(withCreds(seed())); const ad = fakeAdapter(() => ({ ok: false, kind: 'auth', httpStatus: 401, message: 'nope' }));
  const r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.equal(r.status, 'failed');
  assert.ok(/לחבר מחדש/.test(r.error), 'tells her to reconnect');
  assert.equal(db.tables.legal_receipt_accounts[0].needs_reconnect, true);
}

// ---- two callers at once: one document ----
{
  const db: any = makeDb(withCreds(seed())); const ad = fakeAdapter(async () => { await new Promise((r) => setTimeout(r, 20)); return OK('5005'); });
  const [a, b]: any[] = await Promise.all([
    svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any }),
    svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any }),
  ]);
  assert.equal(ad.calls.length, 1, 'the row lock lets exactly one call through');
  assert.deepEqual([a.status, b.status].sort(), ['issued', 'pending']);
}

// ---- the provider issued it but we could not write it down: say so, never retry ----
{
  const db: any = makeDb(withCreds(seed()), { failUpdateWhen: (p) => p.legal_status === 'issued' }); const ad = fakeAdapter(() => OK('6006'));
  const r: any = await svc.issueForReceipt({ db, tenantId: TENANT, receiptId: 'r1', adapter: ad as any });
  assert.deepEqual([r.status, r.skipped, r.number], ['unknown', 'issued_but_not_recorded', '6006']);
  const d: any = await svc.retryDue({ db, adapter: ad as any, now: new Date('2027-01-01T00:00:00Z') });
  assert.equal(d.tried, 0); assert.equal(ad.calls.length, 1);
}

// ---- a void becomes a credit document ----
{
  const s = seed({ receipt: { legal_status: 'issued', legal_doc_id: 'doc-1042', legal_doc_number: '1042', legal_doc_type: 'receipt' }, voids: [{ id: 'v1', tenant_id: TENANT, receipt_id: 'r1', reason: 'סכום שגוי', credit_status: 'pending_request', credit_attempts: 0 }] });
  const db: any = makeDb(withCreds(s)); const ad = fakeAdapter(() => OK('C-77'));
  const r: any = await svc.creditForVoid({ db, tenantId: TENANT, voidId: 'v1', adapter: ad as any, now: new Date('2026-09-30T10:00:00Z') });
  assert.equal(r.status, 'issued');
  assert.equal(ad.calls[0].type, 330); assert.deepEqual(ad.calls[0].linkedDocumentIds, ['doc-1042']); assert.equal(ad.calls[0].linkType, 'cancel');
  assert.ok(ad.calls[0].description.includes('סכום שגוי'));
  const v = db.tables.receipt_voids[0];
  assert.deepEqual([v.credit_status, v.credit_doc_number, v.credit_doc_url], ['issued', 'C-77', 'https://pdf/C-77']);
  assert.equal((await svc.creditForVoid({ db, tenantId: TENANT, voidId: 'v1', adapter: ad as any })).already, true); assert.equal(ad.calls.length, 1, 'a credit is issued once');
}
// nothing legal to credit: the void stays internal
{
  const s = seed({ receipt: { legal_status: 'none' }, voids: [{ id: 'v1', tenant_id: TENANT, receipt_id: 'r1', reason: 'x', credit_status: 'none' }] });
  const db: any = makeDb(withCreds(s)); const ad = fakeAdapter(() => OK());
  const r: any = await svc.creditForVoid({ db, tenantId: TENANT, voidId: 'v1', adapter: ad as any });
  assert.deepEqual([r.status, r.skipped, ad.calls.length], ['none', 'no_legal_document', 0]);
}
// a credit that fails stays visible, is retried when the provider said no, and never when unsure
{
  const s = () => seed({ receipt: { legal_status: 'issued', legal_doc_id: 'doc-1', legal_doc_type: 'receipt' }, voids: [{ id: 'v1', tenant_id: TENANT, receipt_id: 'r1', reason: 'x', credit_status: 'pending_request', credit_attempts: 0 }] });
  const t0 = new Date('2026-09-30T09:00:00Z');
  let db: any = makeDb(withCreds(s())); let n = 0;
  let ad = fakeAdapter(() => (++n === 1 ? { ok: false, kind: 'definite', httpStatus: 422, message: 'cannot credit' } : OK('C-1')));
  let r: any = await svc.creditForVoid({ db, tenantId: TENANT, voidId: 'v1', adapter: ad as any, now: t0 });
  assert.equal(r.status, 'failed'); assert.equal(db.tables.receipt_voids[0].credit_status, 'failed');
  const d: any = await svc.retryDue({ db, adapter: ad as any, now: new Date(t0.getTime() + 40 * 60000) });
  assert.equal(d.issued, 1); assert.equal(db.tables.receipt_voids[0].credit_status, 'issued');
  // a request that never went out (the browser recorded it, then the network dropped) is picked up
  db = makeDb(withCreds(s())); ad = fakeAdapter(() => OK('C-2'));
  const d2: any = await svc.retryDue({ db, adapter: ad as any, now: t0 });
  assert.equal(d2.credits, 1); assert.equal(db.tables.receipt_voids[0].credit_status, 'issued');
  // unsure -> hands off
  db = makeDb(withCreds(s())); ad = fakeAdapter(() => ({ ok: false, kind: 'ambiguous' }));
  await svc.creditForVoid({ db, tenantId: TENANT, voidId: 'v1', adapter: ad as any, now: t0 });
  assert.equal(db.tables.receipt_voids[0].credit_status, 'unknown');
  const d3: any = await svc.retryDue({ db, adapter: ad as any, now: new Date(t0.getTime() + 9999 * 60000) });
  assert.equal(d3.tried, 0);
}
console.log('legal receipts: ok');

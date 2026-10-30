// The client's personal results page: the link (signed, revocable, expiring), the consent filter for photos, and what the
// loader will and will not return. The database is a small in-memory fake: the point is the rules around it.
import assert from 'node:assert/strict';
import { signConfirm } from './lib/confirmToken.ts';
import { signWithExpiry } from './lib/signedToken.ts';
import {
  newTokenId, pageExpiry, buildPageToken, parsePageToken, clientPageUrl, rowConsented, consentedResultsFor, treatmentsFrom,
  bookingPath, bookingHref, aftercareLines, cleanAftercare, pageStatus, firstName, CLIENT_PAGE_TTL_MS,
} from './lib/clientPage.ts';
import { loadPublicClientPage, recordOpen } from './lib/clientPageData.ts';
import { clientPageMessage } from './lib/clientPageMessage.js';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

// ── token ──────────────────────────────────────────────────────────────────
{
  const id = newTokenId();
  assert.match(id, /^[A-Za-z0-9_-]{22}$/, '128 random bits, url-safe');
  assert.notEqual(id, newTokenId(), 'never repeats');
  const exp = pageExpiry(NOW);
  assert.equal(exp - NOW < CLIENT_PAGE_TTL_MS + 1000 && exp - NOW > CLIENT_PAGE_TTL_MS - 1000, true);
  const t = buildPageToken(id, exp);
  assert.deepEqual(parsePageToken(t, NOW), { tokenId: id }, 'a fresh token verifies');
  assert.equal(buildPageToken(id, exp), t, 'rebuildable from the stored id and expiry (nothing else to remember)');

  const [a, e, s] = t.split('.');
  assert.equal(parsePageToken(`${a}.${e}.${s.slice(0, -1)}${s.endsWith('A') ? 'B' : 'A'}`, NOW), null, 'altered signature');
  assert.equal(parsePageToken(`${newTokenId()}.${e}.${s}`, NOW), null, 'signature of another link');
  assert.equal(parsePageToken(`${a}.${Number(e) + 1000}.${s}`, NOW), null, 'extended expiry');
  assert.equal(parsePageToken(t, exp + 1000), null, 'expired');
  assert.equal(parsePageToken(`${a}.${e}`, NOW), null, 'two parts');
  assert.equal(parsePageToken(`${a}.${e}.${s}.x`, NOW), null, 'four parts');
  assert.equal(parsePageToken('', NOW), null);
  assert.equal(parsePageToken(null, NOW), null);
  assert.equal(parsePageToken('x'.repeat(500), NOW), null);
  assert.equal(parsePageToken(`short.${e}.${s}`, NOW), null, 'token id shape');
  assert.equal(parsePageToken('../../etc/passwd', NOW), null);
  // a signature minted for another purpose over the same id never works here
  const confirmSig = signConfirm(id, 'confirm', exp);
  assert.equal(parsePageToken(`${id}.${confirmSig}`, NOW), null, 'confirm-link signature is not a page token');
  assert.equal(parsePageToken(`${id}.${signWithExpiry('another-secret', `clientpage:${id}`, exp)}`, NOW), null, 'other secret');
  assert.ok(!t.includes('-0000-') && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(t), 'no uuid (tenant or client id) in the link');
  assert.equal(clientPageUrl('https://kalmea.app/', t), `https://kalmea.app/c/${t}`);
}

// ── consent ────────────────────────────────────────────────────────────────
const good = (o: Record<string, unknown> = {}) => ({
  id: 'r1', client_id: 'c1', service_name: 'פנים', before_url: 'https://x/b.jpg', after_url: 'https://x/a.jpg', caption: 'יפה', sessions: 3,
  consent_name: 'רונית כהן', consent_given_on: '2026-10-01', consent_confirmed: true, consent_confirmed_at: '2026-10-01T10:00:00Z', ...o,
});
{
  assert.equal(rowConsented(good()), true);
  assert.equal(rowConsented(good({ consent_confirmed: false })), false, 'not ticked');
  assert.equal(rowConsented(good({ consent_name: '  ' })), false, 'no name');
  assert.equal(rowConsented(good({ consent_given_on: null })), false, 'no date');
  assert.equal(rowConsented(good({ consent_given_on: 'yesterday' })), false, 'bad date');
  assert.equal(rowConsented(good({ consent_confirmed_at: null })), false, 'never stamped by the server');
  assert.equal(rowConsented(null), false);

  const rows = [
    good(),
    good({ id: 'r2', client_id: 'c2' }),                      // another client's
    good({ id: 'r3', client_id: null }),                      // linked to nobody
    good({ id: 'r4', consent_confirmed: false }),             // no consent
    good({ id: 'r5', consent_confirmed_at: null }),           // half a record
    good({ id: 'r6', after_url: ' ' }),                       // no after photo
    good({ id: 'r7', before_url: null, caption: '', sessions: null, published: false }), // consented, unpublished: shown (hers)
  ];
  const out = consentedResultsFor('c1', rows as never);
  assert.deepEqual(out.map((r) => r.id), ['r1', 'r7']);
  assert.equal(out[0].before, 'https://x/b.jpg');
  assert.equal(out[1].before, '');
  assert.equal(JSON.stringify(out).includes('רונית'), false, 'no consent name leaves the filter');
  assert.equal(JSON.stringify(out).includes('2026-10-01'), false, 'no consent date leaves the filter');
  assert.deepEqual(consentedResultsFor('', rows as never), []);
  assert.deepEqual(consentedResultsFor('c9', rows as never), [], 'a client with no photos of her own gets none');
  assert.deepEqual(consentedResultsFor('c1', null), []);
}

// ── treatments, booking link, text ─────────────────────────────────────────
{
  const t = treatmentsFrom([
    { service: 'פנים', date: '2026-10-12' }, { service: 'פנים', date: '2026-08-01' }, { service: 'פילינג', date: '2026-09-02' },
    { service: 'עתידי', date: '2026-11-01' },                                          // not yet
    { service: 'בוטל', date: '2026-10-01', confirmation_status: 'cancelled' },
    { service: 'לא הגיעה', date: '2026-10-02', confirmation_status: 'no_show' },
    { service: 'פגישה פרטית', date: '2026-10-03', kind: 'personal' },
    { service: '', date: '2026-10-03' }, { service: 'x', date: 'bad' },
  ], '2026-10-25');
  assert.deepEqual(t, [{ service: 'פנים', count: 2, lastDate: '2026-10-12' }, { service: 'פילינג', count: 1, lastDate: '2026-09-02' }]);
  assert.equal(treatmentsFrom(null, '2026-10-25').length, 0);

  assert.equal(bookingPath('my-studio', 'tid'), '/my-studio');
  assert.equal(bookingPath('', 'tid'), '/book?t=tid');
  const h = bookingHref('/my-studio', 'רונית כהן', 'פנים');
  assert.ok(h.startsWith('/my-studio?name=') && h.includes('service='));
  assert.ok(bookingHref('/book?t=tid', 'רונית', '').includes('&name='));
  assert.equal(bookingHref('/x', '', ''), '/x');
  assert.ok(!/phone|טלפון/i.test(h), 'her phone is never put in a link');
  assert.equal(firstName(' רונית   כהן '), 'רונית');

  assert.deepEqual(aftercareLines('· לשתות מים\n- קרם הגנה\n\n✦ בלי סאונה'), ['לשתות מים', 'קרם הגנה', 'בלי סאונה']);
  assert.equal(cleanAftercare('x'.repeat(5000)).length, 1500);

  assert.equal(pageStatus(null), 'none');
  assert.equal(pageStatus({ revoked_at: '2026-10-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z' }, NOW), 'revoked');
  assert.equal(pageStatus({ revoked_at: null, expires_at: '2026-10-01T00:00:00Z' }, NOW), 'expired');
  assert.equal(pageStatus({ revoked_at: null, expires_at: '2027-01-01T00:00:00Z' }, NOW), 'active');

  const m = clientPageMessage({ name: 'רונית כהן', businessName: 'סטודיו', url: 'https://kalmea.app/c/abc', hasPhotos: true });
  assert.ok(m.startsWith('היי רונית! 🌸') && m.includes('https://kalmea.app/c/abc') && m.trim().endsWith('סטודיו'));
  assert.ok(!clientPageMessage({ url: 'u' }).includes('undefined'));
}

// ── the loader, against a fake database ────────────────────────────────────
function fakeDb(tables: Record<string, any[]>, log: string[] = []) {
  return {
    from(name: string) {
      const q: any = { filters: [] as Array<[string, any, string]>, upd: null as any };
      const rows = () => (tables[name] || []).filter((r) => q.filters.every(([c, v, op]: [string, any, string]) => (op === 'eq' ? r[c] === v : String(r[c] || '') <= v)));
      const done = (single: boolean) => {
        log.push(name);
        if (q.upd) { rows().forEach((r) => Object.assign(r, q.upd)); return { data: null, error: null }; }
        return single ? { data: rows()[0] ?? null, error: null } : { data: rows(), error: null };
      };
      const chain: any = {
        select: () => chain, order: () => chain, limit: () => chain,
        eq: (c: string, v: any) => (q.filters.push([c, v, 'eq']), chain),
        lte: (c: string, v: any) => (q.filters.push([c, v, 'lte']), chain),
        update: (u: any) => ((q.upd = u), chain),
        maybeSingle: async () => done(true),
        then: (res: any, rej: any) => Promise.resolve(done(false)).then(res, rej),
      };
      return chain;
    },
  };
}

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const world = () => ({
  client_pages: [
    { id: 'p1', tenant_id: TENANT_A, client_id: 'c1', token_id: 'T1'.padEnd(22, 'a'), aftercare: 'קרם הגנה\nמים', expires_at: new Date(NOW + 50 * 86_400_000).toISOString(), revoked_at: null, first_opened_at: null, open_count: 0 },
    { id: 'p2', tenant_id: TENANT_A, client_id: 'c2', token_id: 'T2'.padEnd(22, 'a'), aftercare: '', expires_at: new Date(NOW + 50 * 86_400_000).toISOString(), revoked_at: null },
    { id: 'p3', tenant_id: TENANT_B, client_id: 'c3', token_id: 'T3'.padEnd(22, 'a'), aftercare: 'של B', expires_at: new Date(NOW + 50 * 86_400_000).toISOString(), revoked_at: null },
    { id: 'p4', tenant_id: TENANT_A, client_id: 'c1', token_id: 'T4'.padEnd(22, 'a'), aftercare: '', expires_at: new Date(NOW + 50 * 86_400_000).toISOString(), revoked_at: '2026-10-20T00:00:00Z' },
    { id: 'p5', tenant_id: TENANT_A, client_id: 'c1', token_id: 'T5'.padEnd(22, 'a'), aftercare: '', expires_at: new Date(NOW - 1000).toISOString(), revoked_at: null },
  ],
  clients: [
    { id: 'c1', tenant_id: TENANT_A, name: 'רונית כהן' }, { id: 'c2', tenant_id: TENANT_A, name: 'דנה לוי' }, { id: 'c3', tenant_id: TENANT_B, name: 'לקוחה של B' },
  ],
  settings: [
    { tenant_id: TENANT_A, business_name: 'סטודיו A', branding: { logo_url: 'https://x/logo.png' }, primary_color: '#5B8A8A' },
    { tenant_id: TENANT_B, business_name: 'סטודיו B', branding: {}, primary_color: '#AA3355' },
  ],
  tenants: [{ id: TENANT_A, slug: 'studio-a' }, { id: TENANT_B, slug: 'studio-b' }],
  appointments: [
    { tenant_id: TENANT_A, client_id: 'c1', service: 'פנים', date: '2026-10-12', confirmation_status: 'confirmed' },
    { tenant_id: TENANT_A, client_id: 'c2', service: 'סודי של דנה', date: '2026-10-11', confirmation_status: 'confirmed' },
    { tenant_id: TENANT_B, client_id: 'c3', service: 'של B', date: '2026-10-10', confirmation_status: 'confirmed' },
  ],
  treatment_results: [
    { id: 'r1', tenant_id: TENANT_A, client_id: 'c1', service_name: 'פנים', after_url: 'https://x/c1.jpg', before_url: null, caption: '', sessions: null, consent_name: 'רונית', consent_given_on: '2026-10-01', consent_confirmed: true, consent_confirmed_at: '2026-10-01T00:00:00Z' },
    { id: 'r2', tenant_id: TENANT_A, client_id: 'c1', service_name: 'בלי הסכמה', after_url: 'https://x/nope.jpg', consent_name: '', consent_given_on: null, consent_confirmed: false, consent_confirmed_at: null },
    { id: 'r3', tenant_id: TENANT_A, client_id: 'c2', service_name: 'של דנה', after_url: 'https://x/c2.jpg', consent_name: 'דנה', consent_given_on: '2026-10-01', consent_confirmed: true, consent_confirmed_at: '2026-10-01T00:00:00Z' },
    { id: 'r4', tenant_id: TENANT_B, client_id: 'c3', service_name: 'של B', after_url: 'https://x/c3.jpg', consent_name: 'ב', consent_given_on: '2026-10-01', consent_confirmed: true, consent_confirmed_at: '2026-10-01T00:00:00Z' },
  ],
});
const tokenFor = (w: ReturnType<typeof world>, pid: string) => {
  const p = w.client_pages.find((x) => x.id === pid)!;
  return buildPageToken(p.token_id, new Date(p.expires_at).getTime() > NOW ? new Date(p.expires_at).getTime() : NOW + 1000);
};

await (async () => {
  const now = new Date(NOW);
  const w = world();
  const log: string[] = [];

  const bad = await loadPublicClientPage(fakeDb(w, log), 'garbage', now);
  assert.equal(bad.kind, 'gone');
  assert.equal(log.length, 0, 'a token that does not verify never reaches the database');

  const ok = await loadPublicClientPage(fakeDb(w), tokenFor(w, 'p1'), now);
  assert.equal(ok.kind, 'ok');
  if (ok.kind !== 'ok') return;
  const page = ok.page;
  assert.equal(page.clientName, 'רונית כהן');
  assert.equal(page.businessName, 'סטודיו A');
  assert.equal(page.logoUrl, 'https://x/logo.png');
  assert.deepEqual(page.results.map((r) => r.id), ['r1'], 'only her consented photo');
  assert.deepEqual(page.treatments.map((t) => t.service), ['פנים']);
  assert.deepEqual(page.aftercare, ['קרם הגנה', 'מים']);
  assert.ok(page.bookPath === '/studio-a' && page.bookHref.startsWith('/studio-a?name='));
  const dump = JSON.stringify(page);
  for (const secret of ['דנה', 'של B', 'סטודיו B', TENANT_A, TENANT_B, 'c2', 'c3', 'nope.jpg']) assert.equal(dump.includes(secret), false, `page leaks: ${secret}`);

  // another client of the same business sees only her own world
  const two = await loadPublicClientPage(fakeDb(w), tokenFor(w, 'p2'), now);
  assert.equal(two.kind === 'ok' && two.page.results.map((r) => r.id).join(), 'r3');
  assert.equal(two.kind === 'ok' && JSON.stringify(two.page).includes('רונית'), false);
  // another business
  const other = await loadPublicClientPage(fakeDb(w), tokenFor(w, 'p3'), now);
  assert.equal(other.kind === 'ok' && other.page.businessName, 'סטודיו B');
  assert.equal(other.kind === 'ok' && JSON.stringify(other.page).includes('רונית'), false);

  // revoked, expired, unknown, signature of a row that is not there
  assert.equal((await loadPublicClientPage(fakeDb(w), tokenFor(w, 'p4'), now)).kind, 'gone', 'revoked');
  assert.equal((await loadPublicClientPage(fakeDb(w), buildPageToken('T5'.padEnd(22, 'a'), NOW + 1000), now)).kind, 'gone', 'row expired');
  assert.equal((await loadPublicClientPage(fakeDb(w), buildPageToken(newTokenId(), pageExpiry(NOW)), now)).kind, 'gone', 'signed but unknown');
  const w2 = world(); w2.clients = w2.clients.filter((c) => c.id !== 'c1');
  assert.equal((await loadPublicClientPage(fakeDb(w2), tokenFor(w2, 'p1'), now)).kind, 'gone', 'client erased');

  // a photo whose consent is withdrawn disappears from the next load
  const w3 = world(); w3.treatment_results[0].consent_confirmed = false;
  const noPhotos = await loadPublicClientPage(fakeDb(w3), tokenFor(w3, 'p1'), now);
  assert.equal(noPhotos.kind === 'ok' && noPhotos.page.results.length, 0);

  // opened: counted once per call, for a live link only
  const w4 = world();
  assert.equal(await recordOpen(fakeDb(w4), tokenFor(w4, 'p1'), now), true);
  assert.equal(await recordOpen(fakeDb(w4), tokenFor(w4, 'p1'), now), true);
  assert.equal(w4.client_pages[0].open_count, 2);
  assert.ok(w4.client_pages[0].first_opened_at);
  assert.equal(await recordOpen(fakeDb(w4), tokenFor(w4, 'p4'), now), false, 'revoked: not counted');
  assert.equal(await recordOpen(fakeDb(w4), 'garbage', now), false);
})();

console.log('client page: ok');

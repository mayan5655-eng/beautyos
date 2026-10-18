// Owner signup alert + contact links (2026-10-17): no personal data in the alert, no duplicates, the contact links only for platform admins
// and never for demo / test-looking / the owner's own business, and nothing ever sent to a signup.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildContactLink, buildSignupContact, contactEligible, contactMessageHe, looksLikeTestName, CONTACT_MAIL_SUBJECT_HE } from './lib/ownerContact.ts';
import { notifyOwnerOfSignup, safeBusinessName, signupAlertMessage, SIGNUP_ALERT_SOURCE, MAX_WHATSAPP_PER_HOUR } from './lib/ownerSignupAlert.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// ── contact links ───────────────────────────────────────────────────────────
await ok('a valid Israeli mobile gives a wa.me link with a short prefilled Hebrew opening that names the business', () => {
  const l = buildContactLink({ businessName: 'סטודיו נועה', phone: '052-123-4567', email: 'x@example.com' })!;
  assert.equal(l.kind, 'whatsapp');
  assert.match(l.href, /^https:\/\/wa\.me\/972521234567\?text=/);
  const text = decodeURIComponent(l.href.split('?text=')[1]);
  assert.equal(text, contactMessageHe('סטודיו נועה'));
  assert.match(text, /^היי/);
  assert.ok(text.includes('סטודיו נועה'));
  assert.ok(text.length < 140);
  assert.doesNotMatch(l.href, /@/); // the phone wins: the email is not in the link
});

await ok('no usable mobile (landline, foreign, junk, empty) falls back to a mailto link to the account email', () => {
  for (const phone of ['03-1234567', '+442071234567', 'abc', '', null, undefined]) {
    const l = buildContactLink({ businessName: 'עסק', phone, email: 'owner@example.com' })!;
    assert.equal(l.kind, 'email', String(phone));
    assert.match(l.href, /^mailto:owner@example\.com\?subject=/);
    assert.ok(l.href.includes(encodeURIComponent(CONTACT_MAIL_SUBJECT_HE)));
  }
});

await ok('neither a valid phone nor a valid email: no button', () => {
  assert.equal(buildContactLink({ businessName: 'עסק', phone: '03-1234567', email: 'not-an-email' }), null);
  assert.equal(buildContactLink({ businessName: 'עסק' }), null);
  assert.equal(buildContactLink({ businessName: 'עסק', email: 'a b@c.d' }), null);
});

await ok('hidden for demo businesses, test-looking names (13 digits) and the owner\'s own business', () => {
  const OWN = '448e9e45-2251-4572-b665-886c5bc7a4c8';
  assert.equal(contactEligible({ id: 'ten-1', name: 'סטודיו נועה' }, OWN), true);
  assert.equal(contactEligible({ id: DEMO_TENANT_IDS.cosmetics, name: 'קליניקת דמו' }, OWN), false);
  assert.equal(contactEligible({ id: DEMO_TENANT_IDS.nails, name: 'דמו' }, null), false);
  assert.equal(contactEligible({ id: OWN, name: 'העסק שלי' }, OWN), false);
  assert.equal(contactEligible({ id: 'ten-2', name: 'עסק בדיקה 1791063027140' }, OWN), false);
  assert.equal(contactEligible({ id: 'ten-3', name: '' }, OWN), true);
  assert.equal(looksLikeTestName('עסק 123456789012'), false); // 12 digits is a real name with a number in it
  assert.equal(looksLikeTestName('עסק 1234567890123'), true);
});

// ── the alert text ─────────────────────────────────────────────────────────
await ok('the alert text has the business name, the source label and the time, and nothing that looks like an email or a phone', () => {
  const at = new Date('2026-10-17T09:05:00Z');
  const m = signupAlertMessage({ businessName: 'סטודיו נועה', source: 'instagram / bio', at });
  assert.ok(m.includes('סטודיו נועה') && m.includes('instagram / bio'));
  assert.match(m, /17\.10\.2026/);
  assert.match(m, /12:05/); // Israel time
  for (const hostile of ['נועה maya@gmail.com', 'סטודיו 052-123-4567', 'עסק +972 52 123 4567', 'a@b.co 0521234567 x']) {
    const msg = signupAlertMessage({ businessName: hostile, source: 'x@y.com', at });
    assert.doesNotMatch(msg, /@/, hostile);
    assert.doesNotMatch(msg, /\d{7,}/, hostile);
    assert.doesNotMatch(msg, /\d{3}[-\s]\d{3}/, hostile);
  }
  assert.equal(safeBusinessName('   '), 'ללא שם');
  assert.ok(safeBusinessName('x'.repeat(200)).length <= 60);
  assert.match(signupAlertMessage({ businessName: 'עסק', source: null, at }), /לא ידוע/);
});

// ── the alert flow, with a fake database ───────────────────────────────────────
type Event = { source: string; details: { tenant_id: string }; whatsapp_delivery: string; created_at: string };
function fakeDb(opts: { events?: Event[]; signupSource?: string | null } = {}) {
  const events = opts.events || [];
  const q = (table: string) => {
    const st: { contains?: { tenant_id: string }; head?: boolean; neqDelivery?: string; since?: string } = {};
    const api: any = {
      select(_c: string, o?: { head?: boolean }) { st.head = !!o?.head; return api; },
      eq() { return api; },
      neq(_c: string, v: string) { st.neqDelivery = v; return api; },
      gte(_c: string, v: string) { st.since = v; return api; },
      contains(_c: string, v: { tenant_id: string }) { st.contains = v; return api; },
      limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: { signup_source: opts.signupSource ?? null }, error: null }); },
      then(res: (v: unknown) => unknown) {
        if (table === 'ops_events' && st.contains) return Promise.resolve({ data: events.filter((e) => e.details.tenant_id === st.contains!.tenant_id), error: null }).then(res);
        if (table === 'ops_events' && st.head) {
          const c = events.filter((e) => e.whatsapp_delivery !== st.neqDelivery && e.created_at >= (st.since || '')).length;
          return Promise.resolve({ data: null, count: c, error: null }).then(res);
        }
        return Promise.resolve({ data: [], error: null }).then(res);
      },
    };
    return api;
  };
  return { from: (t: string) => q(t), events };
}
function harness(opts: { events?: Event[]; signupSource?: string | null } = {}) {
  const db = fakeDb(opts);
  const raised: any[] = [];
  const raise = async (a: any) => {
    raised.push(a);
    db.events.push({ source: a.source, details: a.details, whatsapp_delivery: a.to ? 'handed_to_greenapi' : 'no_operator_number', created_at: new Date().toISOString() });
  };
  return { db, raised, raise };
}
const NOW = new Date('2026-10-17T09:05:00Z');

await ok('a new business raises ONE alert through the operator alert path: info, the tenant id only in details, text without personal data', async () => {
  const h = harness({ signupSource: 'whatsapp / personal' });
  const r = await notifyOwnerOfSignup({ db: h.db, tenantId: 'ten-1', businessName: 'סטודיו נועה', to: '972500000000', send: () => 0, raise: h.raise, now: () => NOW });
  assert.deepEqual(r, { status: 'raised', whatsapp: true });
  assert.equal(h.raised.length, 1);
  const a = h.raised[0];
  assert.equal(a.source, SIGNUP_ALERT_SOURCE);
  assert.equal(a.severity, 'info');
  assert.deepEqual(a.details, { tenant_id: 'ten-1' });
  assert.ok(a.message.includes('סטודיו נועה') && a.message.includes('whatsapp / personal'));
  assert.doesNotMatch(a.message, /@|\d{7,}/);
  assert.equal(a.to, '972500000000');
});

await ok('the same business is never alerted twice, even if onboarding saves again', async () => {
  const h = harness();
  const run = () => notifyOwnerOfSignup({ db: h.db, tenantId: 'ten-1', businessName: 'עסק', to: '972500000000', send: () => 0, raise: h.raise, now: () => NOW });
  assert.equal((await run()).status, 'raised');
  assert.deepEqual(await run(), { status: 'skipped', reason: 'duplicate' });
  assert.deepEqual(await run(), { status: 'skipped', reason: 'duplicate' });
  assert.equal(h.raised.length, 1);
  const other = await notifyOwnerOfSignup({ db: h.db, tenantId: 'ten-2', businessName: 'עסק אחר', to: '972500000000', send: () => 0, raise: h.raise, now: () => NOW });
  assert.equal(other.status, 'raised'); // a different business is its own alert
});

await ok('no operator number: only the log, nothing is sent', async () => {
  const h = harness();
  for (const to of ['', '   ', undefined]) {
    const hh = harness();
    const r = await notifyOwnerOfSignup({ db: hh.db, tenantId: 'ten-9', businessName: 'עסק', to, raise: hh.raise, now: () => NOW });
    assert.deepEqual(r, { status: 'raised', whatsapp: false });
    assert.equal(hh.raised[0].to, undefined);
    assert.equal(hh.raised[0].send, undefined);
  }
  assert.equal(h.raised.length, 0);
});

await ok('past the hourly cap the alert is still logged but no longer rings the phone', async () => {
  const events: Event[] = Array.from({ length: MAX_WHATSAPP_PER_HOUR }, (_, i) => ({ source: SIGNUP_ALERT_SOURCE, details: { tenant_id: `old-${i}` }, whatsapp_delivery: 'handed_to_greenapi', created_at: '2026-10-17T08:50:00.000Z' }));
  const h = harness({ events });
  const r = await notifyOwnerOfSignup({ db: h.db, tenantId: 'ten-new', businessName: 'עסק', to: '972500000000', send: () => 0, raise: h.raise, now: () => NOW });
  assert.deepEqual(r, { status: 'raised', whatsapp: false });
  assert.equal(h.raised[0].to, undefined);
});

await ok('demo businesses, the owner\'s own business and test-looking names raise nothing', async () => {
  const h = harness();
  const base = { db: h.db, to: '972500000000', send: () => 0, raise: h.raise, now: () => NOW };
  assert.equal((await notifyOwnerOfSignup({ ...base, tenantId: DEMO_TENANT_IDS.cosmetics, businessName: 'דמו' })).status, 'skipped');
  assert.equal((await notifyOwnerOfSignup({ ...base, tenantId: 'own', businessName: 'שלי', ownerTenantId: 'own' })).status, 'skipped');
  assert.equal((await notifyOwnerOfSignup({ ...base, tenantId: 'ten-t', businessName: 'עסק בדיקה 1791063027140' })).status, 'skipped');
  assert.equal((await notifyOwnerOfSignup({ ...base, tenantId: '', businessName: 'עסק' })).status, 'skipped');
  assert.equal(h.raised.length, 0);
});

// ── where it is wired, and the privacy lines ─────────────────────────────────────
await ok('the alert is raised only when the settings row is CREATED (the onboarding insert), after the response, failure-safe', () => {
  const r = rd('app/api/settings/save/route.ts');
  const createdAt = r.indexOf('created: true');
  const alertAt = r.indexOf('notifyOwnerOfSignup({');
  const updateReturn = r.indexOf('return NextResponse.json({ success: true, settings: data });');
  assert.ok(alertAt > updateReturn && alertAt < createdAt, 'only on the insert path');
  assert.match(r, /after\(async \(\) => \{\s*try \{[\s\S]*notifyOwnerOfSignup[\s\S]*\} catch \(e\)/);
  assert.equal((r.match(/notifyOwnerOfSignup\(/g) || []).length, 1);
  assert.doesNotMatch(r.slice(alertAt - 200, alertAt + 400), /email|phone/i);
});

await ok('the alert module sends only through the existing operator path and never contacts the signup', () => {
  const a = strip(rd('lib/ownerSignupAlert.ts'));
  assert.match(a, /import\('\.\/opsAlert\.js'\)/);
  assert.doesNotMatch(a, /business_phone|recipient|auth\.admin|getUserById|mailto|wa\.me|\.insert\(|\.update\(/);
  assert.doesNotMatch(a, /console\.(log|error|warn)/); // nothing of the business is logged by this module itself
});

await ok('signup details: local phone format, a valid email only, and the WhatsApp-first link', () => {
  const both = buildSignupContact({ businessName: 'סטודיו', phone: '+972 54 123 4567', email: 'dana@example.com' });
  assert.equal(both.phone, '054-123-4567');
  assert.equal(both.email, 'dana@example.com');
  assert.equal(both.link?.kind, 'whatsapp');
  const landline = buildSignupContact({ businessName: 'סטודיו', phone: '03-1234567', email: 'dana@example.com' });
  assert.equal(landline.phone, '03-123-4567', 'a landline is still shown');
  assert.equal(landline.link?.kind, 'email', 'but the link falls back to email');
  const none = buildSignupContact({ businessName: 'סטודיו', phone: 'לא ידוע', email: 'not-an-email' });
  assert.deepEqual(none, { phone: null, email: null, link: null });
});

await ok('contact details are built only on the server, only after the admin check, only for the 20 newest, and never logged', () => {
  const loader = strip(rd('app/dashboard/owner/loader.ts'));
  assert.match(loader, /export async function loadSignupsPage[\s\S]*await requireOwner\(\)[\s\S]*loadSignupContacts\(db, newest, ownTenantId\)/);
  assert.match(loader, /newestSignups\(rows, 20\)/);
  const c = strip(rd('app/dashboard/owner/signups/contacts.ts'));
  assert.match(c, /contactEligible\(/);
  assert.match(c, /business_phone/);
  assert.match(c, /auth\.admin\.getUserById/);
  assert.doesNotMatch(c, /console\.log|sendWhatsApp|fetch\(|\.insert\(|\.update\(|\.delete\(|upsert/);
  for (const line of c.split('\n').filter((l) => /console\./.test(l))) assert.doesNotMatch(line, /phone|email|data\b|\$\{/, line); // only fixed text or an error message
  // only the loader imports it
  const importers = walk('app').concat(walk('lib')).filter((f) => /\.(tsx?|jsx?)$/.test(f) && /signups\/contacts['"]/.test(rd(f)));
  assert.deepEqual(importers.map((f) => f.replace(/\\/g, '/')), ['app/dashboard/owner/loader.ts']);
});

// 2026-10-18: the owner asked to SEE each new business's phone and email with copy buttons, not only a contact button. They are
// still read only on the server behind the admin check; the page renders them for her and reads nothing itself.
await ok('the page shows details and the button only where they exist, reads nothing itself, and non-admins get the same 404 as before', () => {
  const p = rd('app/dashboard/owner/signups/page.tsx');
  assert.match(p, /c\?\.link && \(/);
  assert.match(p, /href=\{c\.link\.href\}/);
  assert.match(p, /<CopyButton text=\{c\.phone\}/);
  assert.match(p, /<CopyButton text=\{c\.email\}/);
  assert.doesNotMatch(strip(p), /getUserById|business_phone|\.from\(|auth\.admin/);
  assert.doesNotMatch(p, /'use client'|"use client"/);
  // the copy button is the only client piece, and it is handed text: it imports nothing that reads contact data
  const btn = rd('app/dashboard/owner/signups/CopyButton.tsx');
  assert.doesNotMatch(btn, /import .*(ownerContact|contacts|supabase|loader)/);
  assert.match(strip(rd('app/dashboard/owner/loader.ts')), /if \(!admin\.ok\) notFound\(\)/);
  // no contact data module is reachable from any client bundle or public route
  const clientish = walk('app').filter((f) => /\.(tsx|jsx)$/.test(f) && /['"]use client['"]/.test(rd(f)));
  for (const f of clientish) assert.doesNotMatch(rd(f), /ownerContact|ownerSignupAlert|signups\/contacts/, f);
  for (const f of walk('app/api').filter((x) => /route\.(ts|js)$/.test(x))) {
    if (f.replace(/\\/g, '/') === 'app/api/settings/save/route.ts') continue;
    assert.doesNotMatch(rd(f), /ownerContact|signups\/contacts/, f);
  }
});

await ok('nothing is sent automatically to a signup: the only outputs are links the owner taps', () => {
  const c = strip(rd('lib/ownerContact.ts'));
  assert.doesNotMatch(c, /fetch\(|sendWhatsApp|nodemailer|resend|window\.open|location/i);
  assert.match(c, /https:\/\/wa\.me\//);
  assert.match(c, /mailto:/);
});

console.log(`${n} passed`);

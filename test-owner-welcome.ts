// The welcome WhatsApp to a new business owner (lib/ownerWelcome.ts), with no network and no database: off by default and
// silent, the once-only marker (claimed before sending, a duplicate sends nothing, an unwritable table sends nothing),
// the phone choice (verified first, then the onboarding phone), demo / test names / reserved test numbers never sent,
// live refused without credentials or the videos link, the template's Meta rules, and that the docs carry the same text.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  sendOwnerWelcome, welcomeMode, welcomeImageUrl, tutorialsUrl, isReservedTestNumber, buildWelcome, WELCOME_TEMPLATE, MARKER_TABLE, COST_LOG_TABLE,
} from './lib/ownerWelcome.ts';
import { mockAdapter, type WaCloudAdapter } from './lib/waCloud/adapter.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const T = '00000000-0000-0000-0000-0000000000b1';
const LIVE = { OWNER_WELCOME_IMAGE_URL: 'https://kalmea.app/media/kalmea-welcome-whatsapp.png', OWNER_WELCOME_WA: 'live', OWNER_WELCOME_TUTORIALS_URL: 'https://kalmea.app/tutorials', WA_CLOUD_PHONE_NUMBER_ID: '1', WA_CLOUD_ACCESS_TOKEN: 't', WA_CLOUD_APP_SECRET: 's', WA_CLOUD_VERIFY_TOKEN: 'v' };

// A stand-in for the Supabase builder: owner_phones answers `verified`, the marker table enforces its two unique keys.
function fakeDb(o: { verified?: string | null; markerError?: { code: string; message: string } | null; markers?: Record<string, unknown>[] } = {}) {
  const markers = o.markers || [];
  const costs: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  let reads = 0;
  const from = (table: string) => {
    reads++;
    const q: any = {
      select: () => q, eq: () => q, limit: async () => ({ data: o.verified ? [{ phone_e164: o.verified }] : [], error: null }),
      insert: async (row: Record<string, unknown>) => {
        if (table === COST_LOG_TABLE) { costs.push(row); return { error: null }; }
        if (o.markerError) return { error: o.markerError };
        if (markers.some((m) => m.tenant_id === row.tenant_id || m.phone_hash === row.phone_hash)) return { error: { code: '23505', message: 'duplicate key' } };
        markers.push(row);
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    };
    return q;
  };
  return { db: { from }, markers, costs, updates, reads: () => reads };
}

await ok('off by default: no env, a typo, or "true" all mean off, and off touches nothing', async () => {
  assert.equal(welcomeMode({}), 'off');
  assert.equal(welcomeMode({ OWNER_WELCOME_WA: 'true' }), 'off');
  assert.equal(welcomeMode({ OWNER_WELCOME_WA: ' Mock ' }), 'mock');
  assert.equal(welcomeMode({ OWNER_WELCOME_WA: 'live' }), 'live');
  const f = fakeDb();
  const a = mockAdapter();
  const r = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'סטודיו נועה', businessPhone: '0541234567', env: {}, adapter: a });
  assert.deepEqual(r, { status: 'skipped', reason: 'off' });
  assert.equal(f.reads(), 0, 'no database read when off');
  assert.equal(a.sent.length, 0);
});

await ok('mock: marker claimed, a mock id, the Hebrew preview, a mock cost row, and nothing on the network', async () => {
  const f = fakeDb();
  const a = mockAdapter();
  const r = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'סטודיו נועה', businessPhone: '054-123-4567', env: { OWNER_WELCOME_WA: 'mock' }, adapter: a });
  assert.equal(r.status, 'mock');
  if (r.status !== 'mock') return;
  assert.ok(r.messageId.startsWith('mock.'));
  assert.ok(r.preview.includes('החשבון של סטודיו נועה מוכן,'));
  assert.ok(r.preview.includes('https://kalmea.app/tutorials'));
  assert.equal(f.markers.length, 1);
  assert.equal(f.markers[0].status, 'claimed');
  assert.equal(f.markers[0].phone_source, 'onboarding');
  assert.equal(f.markers[0].phone_last4, '4567');
  assert.ok(!JSON.stringify(f.markers[0]).includes('541234567'), 'no full number stored');
  assert.equal(f.updates.at(-1)?.status, 'mock');
  assert.equal(f.costs.length, 1);
  assert.equal(f.costs[0].mode, 'mock');
  assert.equal(f.costs[0].message_type, 'owner_welcome');
  assert.equal(a.sent[0].to, '972541234567');
});

await ok('once only: the same business again, or another business on the same number, sends nothing', async () => {
  const f = fakeDb();
  const a = mockAdapter();
  const env = { OWNER_WELCOME_WA: 'mock' };
  await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env, adapter: a });
  const again = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env, adapter: a });
  assert.deepEqual(again, { status: 'skipped', reason: 'duplicate' });
  const other = await sendOwnerWelcome({ db: f.db, tenantId: '00000000-0000-0000-0000-0000000000b2', businessName: 'ב', businessPhone: '0541234567', env, adapter: a });
  assert.deepEqual(other, { status: 'skipped', reason: 'duplicate' });
  assert.equal(a.sent.length, 1);
});

await ok('fails closed: when the marker table cannot be written (migration not run), nothing is sent', async () => {
  const f = fakeDb({ markerError: { code: '42P01', message: 'relation "owner_welcome_messages" does not exist' } });
  const a = mockAdapter();
  const r = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env: LIVE, adapter: a });
  assert.deepEqual(r, { status: 'skipped', reason: 'marker-unavailable' });
  assert.equal(a.sent.length, 0);
});

await ok('the verified mobile wins over the onboarding phone; a landline or nothing means no send', async () => {
  const f = fakeDb({ verified: '972529998877' });
  const a = mockAdapter();
  await sendOwnerWelcome({ db: f.db, tenantId: T, userId: 'u1', businessName: 'א', businessPhone: '0541234567', env: { OWNER_WELCOME_WA: 'mock' }, adapter: a });
  assert.equal(a.sent[0].to, '972529998877');
  assert.equal(f.markers[0].phone_source, 'verified');
  for (const phone of ['03-1234567', '', null]) {
    const g = fakeDb();
    const r = await sendOwnerWelcome({ db: g.db, tenantId: T, businessName: 'א', businessPhone: phone, env: { OWNER_WELCOME_WA: 'mock' }, adapter: mockAdapter() });
    assert.deepEqual(r, { status: 'skipped', reason: 'no-phone' });
    assert.equal(g.markers.length, 0);
  }
});

await ok('never: a demo tenant, a test-looking name, or (live) a reserved fake number', async () => {
  const a = mockAdapter();
  const env = LIVE;
  assert.deepEqual(await sendOwnerWelcome({ db: fakeDb().db, tenantId: DEMO_TENANT_IDS.cosmetics, businessName: 'א', businessPhone: '0541234567', env, adapter: a }), { status: 'skipped', reason: 'demo' });
  assert.deepEqual(await sendOwnerWelcome({ db: fakeDb().db, tenantId: T, businessName: 'בדיקה 1791063027140', businessPhone: '0541234567', env, adapter: a }), { status: 'skipped', reason: 'test-name' });
  assert.deepEqual(await sendOwnerWelcome({ db: fakeDb().db, tenantId: T, businessName: 'א', businessPhone: '050-0000011', env, adapter: a }), { status: 'skipped', reason: 'test-number' });
  assert.equal(a.sent.length, 0);
  assert.ok(isReservedTestNumber('972500000099') && !isReservedTestNumber('972500000100') && !isReservedTestNumber('972541234567'));
});

await ok('live: refused (and recorded) without WA Cloud credentials or without the videos link', async () => {
  const a = mockAdapter();
  const f = fakeDb();
  const r1 = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env: { OWNER_WELCOME_WA: 'live', OWNER_WELCOME_TUTORIALS_URL: 'https://x.y' }, adapter: a });
  assert.equal(r1.status, 'refused');
  assert.equal(f.updates.at(-1)?.status, 'refused');
  const r2 = await sendOwnerWelcome({ db: fakeDb().db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env: { ...LIVE, OWNER_WELCOME_TUTORIALS_URL: 'kalmea.app/tutorials' }, adapter: a });
  assert.equal(r2.status, 'refused');
  if (r2.status === 'refused') assert.equal(r2.reason, 'no-tutorials-link');
  assert.equal(a.sent.length, 0);
  assert.equal(tutorialsUrl({ OWNER_WELCOME_TUTORIALS_URL: ' https://kalmea.app/t ' }), 'https://kalmea.app/t');
});

await ok('live: accepted with the template payload; a Meta error is recorded as failed and not retried', async () => {
  const a = mockAdapter();
  const f = fakeDb();
  const r = await sendOwnerWelcome({ db: f.db, tenantId: T, businessName: 'סטודיו נועה', businessPhone: '0541234567', env: LIVE, adapter: a });
  assert.equal(r.status, 'accepted');
  assert.deepEqual(a.sent[0].body, {
    name: 'kalmea_owner_welcome', language: { code: 'he' },
    components: [
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://kalmea.app/media/kalmea-welcome-whatsapp.png' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'סטודיו נועה' }, { type: 'text', text: 'https://kalmea.app/tutorials' }] },
    ],
  });
  assert.equal(f.costs[0].category, 'MARKETING');
  assert.equal(f.costs[0].cost_estimate_usd, 0.0353);
  assert.equal(f.costs[0].mode, 'live');
  const failing: WaCloudAdapter = { mode: 'live', sendTemplate: async () => ({ ok: false, mode: 'live', error: 'template not approved' }), sendText: async () => ({ ok: false, mode: 'live', error: 'x' }) };
  const g = fakeDb();
  const bad = await sendOwnerWelcome({ db: g.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env: LIVE, adapter: failing });
  assert.deepEqual(bad, { status: 'failed', error: 'template not approved' });
  assert.equal(g.updates.at(-1)?.status, 'failed');
  const retry = await sendOwnerWelcome({ db: g.db, tenantId: T, businessName: 'א', businessPhone: '0541234567', env: LIVE, adapter: a });
  assert.deepEqual(retry, { status: 'skipped', reason: 'duplicate' });
});

await ok('template obeys Meta rules, has the hook and the image, and the docs carry it exactly', () => {
  const t = WELCOME_TEMPLATE;
  assert.match(t.name, /^[a-z0-9_]+$/);
  assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*[.!?]?\s*$/.test(t.body), 'no variable at the start or end');
  assert.deepEqual([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])), [1, 2]);
  assert.equal(t.example.length, t.params.length);
  assert.ok(!/מבצע|הנחה|קופון|חינם/.test(t.body), 'no offers: the hook is the only pitch');
  assert.ok(t.body.includes('ברוכה הבאה') && t.body.includes('זו לא עוד מערכת לקביעת תורים'));
  assert.equal(t.category, 'MARKETING', 'the hook makes it marketing; never submitted as utility');
  assert.ok(existsSync('public/media/kalmea-welcome-whatsapp.png'), 'the header image is in the repo');
  assert.ok(welcomeImageUrl({ OWNER_WELCOME_IMAGE_URL: 'http://not-https' }).endsWith('/media/kalmea-welcome-whatsapp.png'));
  const doc = readFileSync('docs/WA_TEMPLATES.md', 'utf8').replace(/\r\n/g, '\n');
  assert.ok(doc.includes(t.name) && doc.includes(t.body), 'docs/WA_TEMPLATES.md identical');
  const b = buildWelcome('שם\nעם שורה', 'https://kalmea.app/tutorials');
  assert.equal(b.params[0], 'שם עם שורה', 'no newline in a parameter');
  assert.equal(buildWelcome('', 'https://a.b').params[0], 'העסק שלך');
});

await ok('the signup route calls it after the response, only on the first settings insert', () => {
  const src = readFileSync('app/api/settings/save/route.ts', 'utf8');
  const insertAt = src.indexOf("from('settings').insert");
  const callAt = src.indexOf('sendOwnerWelcome({');
  assert.ok(insertAt > 0 && callAt > insertAt, 'after the insert, not on updates');
  assert.ok(src.lastIndexOf('after(async', callAt) > insertAt, 'inside after()');
  assert.equal(MARKER_TABLE, 'owner_welcome_messages');
});

console.log(`\n${n} owner-welcome checks passed`);

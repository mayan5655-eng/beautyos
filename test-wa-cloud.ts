// WhatsApp Business Platform (Meta Cloud API), with no network and no database: the flag and mode defaults, the
// Hebrew templates (Meta's rules, and that docs/WA_TEMPLATES.md says exactly what the code sends), quiet hours in
// Israel time across DST, the per-business daily cap, the live adapter's request shape, and the webhook's signature
// check - which must run before any database access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { waCloudEnabled, waCloudMode, waCloudStatus, tenantDailyCap, utilityCostUsd, waCloudAppSecret } from './lib/waCloud/config.ts';
import { WA_TEMPLATES, buildTemplate, paramCount, sanitizeParam, templateForType } from './lib/waCloud/templates.ts';
import { isQuietHours, allowedNow, israelDayStartIso } from './lib/waCloud/policy.ts';
import { mockAdapter, liveAdapter } from './lib/waCloud/adapter.ts';
import { routeThroughCloud, recipientHash } from './lib/waCloud/send.ts';
import { verifySignature, verifySubscription, parseWebhook, mapCloudDeliveryStatus } from './lib/waCloud/webhook.ts';
import { isOptOutReply } from './lib/marketingConsent.js';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const T = '00000000-0000-0000-0000-0000000000a1';
const LIVE = { WA_CLOUD_ENABLED: 'true', WA_CLOUD_MODE: 'live', WA_CLOUD_PHONE_NUMBER_ID: '123', WA_CLOUD_ACCESS_TOKEN: 'tok' };
const MOCK = { WA_CLOUD_ENABLED: 'true', WA_CLOUD_MODE: 'mock' };
const DAY = new Date('2026-10-18T09:00:00Z');   // 12:00 in Israel (IDT, UTC+3)
const NIGHT = new Date('2026-10-18T19:30:00Z'); // 22:30 in Israel
const reminderParams = ['רונית', 'סטודיו נועה', 'טיפול פנים', 'יום ב׳ 19.10, 10:00-11:00', 'https://kalmea.app/c/1', 'https://kalmea.app/x/1'];
const confirmParams = ['רונית', 'סטודיו נועה', 'טיפול פנים', 'יום ב׳ 19.10, 10:00-11:00', 'https://kalmea.app/x/1'];

// A tiny stand-in for the Supabase query builder: records inserts, answers the count query.
function fakeDb(opts: { count?: number; countError?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const from = (_table: string) => {
    const q: any = {
      select: () => q, eq: () => q, gte: () => q, in: () => q, order: () => q, limit: () => q,
      insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; },
      then: (res: (v: unknown) => unknown) => res(opts.countError ? { count: null, error: { message: 'relation "wa_cloud_messages" does not exist' } } : { count: opts.count ?? 0, error: null }),
    };
    return q;
  };
  return { db: { from }, inserts };
}

// ── config ───────────────────────────────────────────────────────────────────
await ok('default: OFF and mock, whatever is unset or junk', () => {
  assert.equal(waCloudEnabled({}), false);
  assert.equal(waCloudEnabled({ WA_CLOUD_ENABLED: '1' }), false);
  assert.equal(waCloudEnabled({ WA_CLOUD_ENABLED: 'TRUE' }), true);
  assert.equal(waCloudMode({}), 'mock');
  assert.equal(waCloudMode({ WA_CLOUD_MODE: 'production' }), 'mock');
  assert.equal(waCloudMode({ WA_CLOUD_MODE: 'live' }), 'live');
  assert.equal(tenantDailyCap({}), 150);
  assert.equal(tenantDailyCap({ WA_CLOUD_TENANT_DAILY_CAP: '-3' }), 150);
  assert.equal(utilityCostUsd({ WA_CLOUD_UTILITY_COST_USD: '0.01' }), 0.01);
  assert.equal(waCloudAppSecret({ FACEBOOK_APP_SECRET: 'fb' }), '', 'a different Meta app: never the Facebook leads app secret');
  assert.equal(waCloudAppSecret({ WA_CLOUD_APP_SECRET: 'wa', FACEBOOK_APP_SECRET: 'fb' }), 'wa');
  assert.deepEqual(waCloudStatus({}).missing, ['WA_CLOUD_PHONE_NUMBER_ID', 'WA_CLOUD_ACCESS_TOKEN', 'WA_CLOUD_APP_SECRET', 'WA_CLOUD_VERIFY_TOKEN']);
});

// ── templates ────────────────────────────────────────────────────────────────
await ok("every template obeys Meta's rules: name, no variable at either end, each {{n}} once and in order, utility", () => {
  const keys = Object.keys(WA_TEMPLATES);
  assert.deepEqual(keys.sort(), ['booking_confirm', 'cancellation_fee', 'deposit_request', 'receipt', 'reminder']);
  for (const t of Object.values(WA_TEMPLATES)) {
    assert.match(t.name, /^[a-z0-9_]{1,512}$/, t.name);
    assert.equal(t.category, 'UTILITY');
    assert.equal(t.language, 'he');
    assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*[.!?]?\s*$/.test(t.body), `${t.name}: no variable at the start or end`);
    const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(used, used.map((_, i) => i + 1), `${t.name}: {{1}}..{{n}} once each, in order`);
    assert.equal(paramCount(t.body), t.params.length, `${t.name}: params documented`);
    assert.equal(t.example.length, t.params.length, `${t.name}: an example per parameter`);
    assert.ok(!/קבלה/.test(t.body), `${t.name}: never says "קבלה" for a payment confirmation`);
    assert.ok(!/מבצע|הנחה|קופון|חוזרת אלינו/.test(t.body), `${t.name}: nothing promotional in a utility template`);
  }
  assert.equal(WA_TEMPLATES.booking_confirm.quietHoursExempt, true);
  assert.equal(Object.values(WA_TEMPLATES).filter((t) => t.quietHoursExempt).length, 1, 'only the booking confirmation is exempt');
});

await ok('docs/WA_TEMPLATES.md carries every template name and body exactly as the code sends it', () => {
  const doc = read('docs/WA_TEMPLATES.md');
  for (const t of Object.values(WA_TEMPLATES)) {
    assert.ok(doc.includes(t.name), `${t.name} documented`);
    assert.ok(doc.includes(t.body), `${t.name} body identical in the docs`);
  }
});

await ok('buildTemplate: the Graph payload, the preview text, and refusals for a wrong count or an empty value', () => {
  const b = buildTemplate('reminder', reminderParams);
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.deepEqual(b.payload, {
    name: 'kalmea_appointment_reminder', language: { code: 'he' },
    components: [{ type: 'body', parameters: reminderParams.map((text) => ({ type: 'text', text })) }],
  });
  assert.ok(b.preview.startsWith('שלום רונית, תזכורת לתור שלך בסטודיו נועה מחר.'));
  assert.ok(!buildTemplate('reminder', reminderParams.slice(1)).ok);
  assert.ok(!buildTemplate('reminder', [...reminderParams.slice(0, 5), '  ']).ok);
  assert.equal(sanitizeParam('a\nb\t c      d'), 'a b c d');
  assert.equal(templateForType('marketing'), null);
  assert.equal(templateForType('reminder')?.name, 'kalmea_appointment_reminder');
});

// ── quiet hours ──────────────────────────────────────────────────────────────
await ok('quiet hours 21:00-08:00 Israel time, summer and winter', () => {
  assert.equal(isQuietHours(new Date('2026-10-18T17:59:00Z')), false, '20:59 IDT');
  assert.equal(isQuietHours(new Date('2026-10-18T18:00:00Z')), true, '21:00 IDT');
  assert.equal(isQuietHours(new Date('2026-10-19T04:59:00Z')), true, '07:59 IDT');
  assert.equal(isQuietHours(new Date('2026-10-19T05:00:00Z')), false, '08:00 IDT');
  assert.equal(isQuietHours(new Date('2026-12-01T18:30:00Z')), false, '20:30 IST (winter, UTC+2)');
  assert.equal(isQuietHours(new Date('2026-12-01T19:00:00Z')), true, '21:00 IST');
  assert.equal(allowedNow(true, NIGHT), true);
  assert.equal(allowedNow(false, NIGHT), false);
});

await ok('the daily cap counts from Israel midnight, not UTC midnight', () => {
  assert.equal(israelDayStartIso(new Date('2026-10-18T22:30:00Z')), '2026-10-18T21:00:00.000Z'); // 01:30 IDT on the 19th
  assert.equal(israelDayStartIso(new Date('2026-12-01T10:00:00Z')), '2026-11-30T22:00:00.000Z');
});

// ── the routing decision ─────────────────────────────────────────────────────
await ok('OFF (the default), no template, or no parameters: GreenAPI exactly as before, nothing logged', async () => {
  for (const [env, type, params] of [[{}, 'reminder', reminderParams], [MOCK, 'win_back', reminderParams], [MOCK, 'reminder', undefined]] as const) {
    const { db, inserts } = fakeDb();
    const v = await routeThroughCloud({ db, tenantId: T, type, digits: '972501234567', params: params as unknown[] | undefined, now: DAY, env, adapter: mockAdapter() });
    assert.deepEqual(v, { route: 'greenapi' });
    assert.equal(inserts.length, 0);
  }
});

await ok('mock: logs the verdict and estimated cost, sends nothing to Meta, and hands the send back to GreenAPI', async () => {
  const { db, inserts } = fakeDb();
  const v = await routeThroughCloud({ db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: MOCK });
  assert.deepEqual(v, { route: 'greenapi', shadow: { status: 'accepted', reason: null } });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].mode, 'mock');
  assert.equal(inserts[0].status, 'accepted');
  assert.match(String(inserts[0].wa_message_id), /^mock\./);
  assert.equal(inserts[0].recipient_hash, recipientHash('972501234567'));
  assert.equal(inserts[0].recipient_last4, '4567');
  assert.ok(!JSON.stringify(inserts[0]).includes('972501234567'), 'the cost log never holds the number');
});

await ok('live: accepted by Meta -> sent through the Cloud route, with the wamid and the text the client reads', async () => {
  const { db, inserts } = fakeDb({ count: 3 });
  const adapter = mockAdapter();
  const v = await routeThroughCloud({ db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: LIVE, adapter });
  assert.equal(v.route, 'cloud');
  assert.ok(v.route === 'cloud' && v.ok && v.preview.includes('לאישור: https://kalmea.app/c/1'));
  assert.equal(adapter.sent.length, 1);
  assert.equal(inserts[0].status, 'accepted');
  assert.equal(inserts[0].cost_estimate_usd, 0.0053);
});

await ok('live: quiet hours refuse a reminder at 22:30, but a booking confirmation goes', async () => {
  const a = fakeDb();
  const r = await routeThroughCloud({ db: a.db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: NIGHT, env: LIVE, adapter: mockAdapter() });
  assert.deepEqual(r.route === 'cloud' && !r.ok && r.reason, 'quiet_hours');
  assert.equal(a.inserts[0].status, 'refused');
  const b = fakeDb();
  const c = await routeThroughCloud({ db: b.db, tenantId: T, type: 'booking_confirm', digits: '972501234567', params: confirmParams, now: NIGHT, env: LIVE, adapter: mockAdapter() });
  assert.ok(c.route === 'cloud' && c.ok);
});

await ok('live: the per-business daily cap refuses at the ceiling, and an unreadable log refuses (fails closed)', async () => {
  const capped = await routeThroughCloud({ db: fakeDb({ count: 5 }).db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: { ...LIVE, WA_CLOUD_TENANT_DAILY_CAP: '5' }, adapter: mockAdapter() });
  assert.ok(capped.route === 'cloud' && !capped.ok && capped.reason === 'tenant_capped');
  const under = await routeThroughCloud({ db: fakeDb({ count: 4 }).db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: { ...LIVE, WA_CLOUD_TENANT_DAILY_CAP: '5' }, adapter: mockAdapter() });
  assert.ok(under.route === 'cloud' && under.ok);
  const adapter = mockAdapter();
  const blind = await routeThroughCloud({ db: fakeDb({ countError: true }).db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: LIVE, adapter });
  assert.ok(blind.route === 'cloud' && !blind.ok && blind.reason === 'cap_unreadable');
  assert.equal(adapter.sent.length, 0, 'nothing reached Meta');
});

await ok('live: bad parameters and a Meta error are refusals for the manual queue, never a silent drop', async () => {
  const bad = await routeThroughCloud({ db: fakeDb().db, tenantId: T, type: 'reminder', digits: '972501234567', params: ['רק אחד'], now: DAY, env: LIVE, adapter: mockAdapter() });
  assert.ok(bad.route === 'cloud' && !bad.ok && bad.reason === 'bad_params');
  const failing = { mode: 'live' as const, sendTemplate: async () => ({ ok: false as const, mode: 'live' as const, error: 'template not approved', code: 132001 }), sendText: async () => ({ ok: false as const, mode: 'live' as const, error: 'x' }) };
  const { db, inserts } = fakeDb();
  const v = await routeThroughCloud({ db, tenantId: T, type: 'reminder', digits: '972501234567', params: reminderParams, now: DAY, env: LIVE, adapter: failing });
  assert.ok(v.route === 'cloud' && !v.ok && v.reason === 'meta_error');
  assert.equal(inserts[0].status, 'failed');
});

// ── live adapter ─────────────────────────────────────────────────────────────
await ok('live adapter: POSTs the Graph messages endpoint with the bearer token; no id = failure', async () => {
  const calls: { url: string; init: any }[] = [];
  const fetchOk = async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }) }; };
  const a = liveAdapter({ WA_CLOUD_PHONE_NUMBER_ID: '555', WA_CLOUD_ACCESS_TOKEN: 'secret-token' }, fetchOk);
  const r = await a.sendTemplate('972501234567', { name: 'x' });
  assert.deepEqual(r, { ok: true, messageId: 'wamid.ABC', mode: 'live', delivered: false });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/555/messages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '972501234567', type: 'template', template: { name: 'x' } });
  const fetchErr = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Invalid parameter', code: 100 } }) });
  const e = await liveAdapter({ WA_CLOUD_PHONE_NUMBER_ID: '555', WA_CLOUD_ACCESS_TOKEN: 't' }, fetchErr).sendText('9725', 'hi');
  assert.ok(!e.ok && e.code === 100 && e.httpStatus === 400);
  const unconfigured = await liveAdapter({}, fetchOk).sendText('9725', 'hi');
  assert.ok(!unconfigured.ok);
  assert.equal(calls.length, 1, 'no request without credentials');
});

// ── webhook ──────────────────────────────────────────────────────────────────
await ok('X-Hub-Signature-256: only the exact HMAC of the raw body with the app secret passes', () => {
  const raw = '{"object":"whatsapp_business_account","entry":[]}';
  const sig = 'sha256=' + createHmac('sha256', 'app-secret').update(raw).digest('hex');
  assert.equal(verifySignature(raw, sig, 'app-secret'), true);
  assert.equal(verifySignature(raw + ' ', sig, 'app-secret'), false, 'a changed body fails');
  assert.equal(verifySignature(raw, sig, 'other'), false);
  assert.equal(verifySignature(raw, null, 'app-secret'), false);
  assert.equal(verifySignature(raw, sig, ''), false, 'no secret configured: nothing is accepted');
  assert.equal(verifySignature(raw, 'sha256=zz', 'app-secret'), false);
});

await ok('GET handshake echoes the challenge only for the right verify token', () => {
  const p = (t: string) => new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': t, 'hub.challenge': '42' });
  assert.equal(verifySubscription(p('vt'), 'vt'), '42');
  assert.equal(verifySubscription(p('nope'), 'vt'), null);
  assert.equal(verifySubscription(p(''), ''), null);
});

await ok('parses inbound texts and statuses with pricing; maps statuses to the message log words', () => {
  const body = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ wa_id: '972501234567', profile: { name: 'רונית' } }],
      messages: [{ from: '972501234567', id: 'wamid.IN', type: 'text', text: { body: 'הסר' } }],
      statuses: [{ id: 'wamid.OUT', status: 'delivered', recipient_id: '972501234567', pricing: { billable: true, category: 'utility', pricing_model: 'PMP' } },
                 { id: 'wamid.BAD', status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
    } }] }],
  };
  const r = parseWebhook(body);
  assert.deepEqual(r.inbound, [{ from: '972501234567', text: 'הסר', id: 'wamid.IN', name: 'רונית' }]);
  assert.equal(r.statuses[0].billable, true);
  assert.equal(r.statuses[0].pricingCategory, 'utility');
  assert.equal(r.statuses[1].error, '131026 Message undeliverable');
  assert.deepEqual(parseWebhook({ object: 'page', entry: [] }), { inbound: [], statuses: [] });
  assert.equal(mapCloudDeliveryStatus('delivered'), 'delivered');
  assert.equal(mapCloudDeliveryStatus('failed'), 'undelivered');
  assert.equal(mapCloudDeliveryStatus('sent'), null, '"sent" is not "arrived"');
  assert.ok(isOptOutReply('הסר') && isOptOutReply('stop') && isOptOutReply('STOP') && !isOptOutReply('אל תסירו את התור'));
});

// ── wiring (source pins) ─────────────────────────────────────────────────────
await ok('the webhook checks the signature before parsing and before any database client exists', () => {
  const src = read('app/api/wa-cloud/webhook/route.ts');
  const post = src.slice(src.indexOf('export async function POST'));
  const sig = post.indexOf('verifySignature(');
  assert.ok(sig > 0);
  assert.ok(sig < post.indexOf('JSON.parse') && sig < post.indexOf('admin()'), 'signature first');
  assert.ok(/status: 401/.test(post.slice(0, post.indexOf('JSON.parse'))));
});

await ok('sendWhatsApp: the Cloud branch runs only behind WA_CLOUD_ENABLED with template parameters; GreenAPI path still there', () => {
  const src = read('lib/whatsapp.js');
  assert.ok(/waCloudEnabled\(\) && Array\.isArray\(options\.cloudParams\) && waCloudMode\(\) === "live"/.test(src));
  assert.ok(src.indexOf('isUtilityAutoSendEnabled') < src.indexOf('routeThroughCloud({'), 'the admin manual/automatic switch still decides first');
  assert.ok(src.includes('/sendMessage/${cred.apiToken}'), 'GreenAPI send untouched');
  assert.ok(src.includes('fallbackToQueue(`cloud_${cloud.reason}`'), 'a Cloud refusal goes to her manual queue');
  for (const f of ['lib/bookingNotify.js', 'lib/reminders/dailyReminders.js', 'app/api/send-receipt/route.js']) assert.ok(read(f).includes('cloudParams'), `${f} passes template parameters`);
});

await ok('the new table is in the trial gate, the migration only adds, the browser roles get nothing, env defaults are off/mock', () => {
  assert.ok(read('trial-gate-policies.sql').includes("'wa_cloud_messages'"));
  const mig = read('supabase/migrations/add_wa_cloud.sql');
  assert.ok(!/drop table|truncate|delete from/i.test(mig.replace(/^--.*$/gm, '')));
  assert.ok(/revoke all on public\.wa_cloud_messages from anon, authenticated/.test(mig) && /enable row level security/.test(mig));
  assert.ok(/targets text\[\] := array\['wa_cloud_messages'\]/.test(mig) && /_require_active_insert/.test(mig));
  assert.ok(!/recipient_phone|\bphone\s+text/.test(mig), 'no phone number column in the cost log');
  const env = read('.env.example');
  assert.ok(/^WA_CLOUD_ENABLED=false$/m.test(env) && /^WA_CLOUD_MODE=mock$/m.test(env) && /^WA_CLOUD_ACCESS_TOKEN=$/m.test(env));
  assert.ok(read('lib/referencedTables.js').includes("'wa_cloud_messages'"));
  assert.ok(read('app/dashboard/admin/page.tsx').includes('<WaCloudCosts db={db} />'));
  const go = read('docs/GO_LIVE_WHATSAPP.md');
  assert.ok(go.includes('1464769648086912') && go.includes('050-7321978') && go.includes('X-Hub-Signature-256'));
});

console.log(`\n${n} passed 0 failed`);

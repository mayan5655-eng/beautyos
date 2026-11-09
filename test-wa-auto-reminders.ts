// test-wa-auto-reminders.ts
//
// The automatic WhatsApp reminders and booking confirmations (lib/waCloud/auto*.ts), with no network and no database:
// an in-memory stand-in for Supabase, a fake clock, and a stub adapter that records what would have gone to Meta.
//
//   * dormant by default: no env -> nothing is read, nothing is sent, and the settings row renders NOTHING
//   * the two templates obey Meta's rules and docs/WA_TEMPLATES.md says exactly what the code sends
//   * signed button payloads, and the tap must come from the number the message went to
//   * timing: about 24 hours before, never in quiet hours or on Shabbat, a night booking waits for 08:00
//   * cost safety: idempotency, the three ceilings, fail closed without the migration, the spend alert
//   * opt-out: the button, "הסר", and the existing consent records
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { autoConfig, publicAutoStatus, tenantOptedIn, tenantLeadHours, autoHandlesTenant } from './lib/waCloud/autoConfig.ts';
import { autoSettingVisible } from './lib/waCloud/autoVisible.js';
import { WA_AUTO_TEMPLATES, buildAutoTemplate, buttonPayload, parseButtonPayload } from './lib/waCloud/autoTemplates.ts';
import { reminderPlan, reminderSendAt, restHold, autoAllowedNow } from './lib/waCloud/autoPlan.ts';
import { israelLocalToUtcMs, israelMonthStartIso } from './lib/waCloud/policy.ts';
import { sendAutoMessage, idempotencyKey, checkSpendAlert, isAutoOptedOut } from './lib/waCloud/auto.ts';
import { runAutoMessages } from './lib/waCloud/autoRun.ts';
import { handleAutoButton, answerText } from './lib/waCloud/autoButtons.ts';
import { autoParams, reminderQueueText } from './lib/waCloud/autoContent.ts';
import { routeThroughCloud, recipientHash } from './lib/waCloud/send.ts';
import { parseWebhook } from './lib/waCloud/webhook.ts';
import { mockAdapter, type WaCloudAdapter } from './lib/waCloud/adapter.ts';
import { runDailyReminders, STATUS_AUTO } from './lib/reminders/dailyReminders.js';
import { confirmLinks } from './lib/confirmToken.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';

// No test here may reach a network. A stray real call fails loudly instead.
globalThis.fetch = (async () => { throw new Error('network is not allowed in this test'); }) as typeof fetch;

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const T = '00000000-0000-4000-8000-0000000000a1';      // a test business (never the real tenant)
const T2 = '00000000-0000-4000-8000-0000000000a2';     // a business that did not opt in
const APPT = '11111111-1111-4111-8111-111111111111';
const APPT2 = '11111111-1111-4111-8111-111111111112';
const PHONE = '0501234567';
const DIGITS = '972501234567';
const SECRET = 'test-confirm-secret';
const LIVE = {
  WA_AUTO_ENABLED: 'true', WA_CLOUD_MODE: 'live', WA_CLOUD_PHONE_NUMBER_ID: '123', WA_CLOUD_ACCESS_TOKEN: 'tok',
  WA_CLOUD_APP_SECRET: 'appsecret', WA_CLOUD_VERIFY_TOKEN: 'verify', CONFIRM_LINK_SECRET: SECRET,
};
const DRY = { WA_AUTO_ENABLED: 'true', WA_CLOUD_MODE: 'mock', CONFIRM_LINK_SECRET: SECRET };
// Tuesday 2026-11-10, 12:00 in Israel (IST, UTC+2).
const NOW = new Date('2026-11-10T10:00:00Z');
const NIGHT = new Date('2026-11-10T21:30:00Z');   // 23:30 Israel
const MORNING = new Date('2026-11-11T06:15:00Z'); // 08:15 Israel
const ON = { automations: { wa_auto_messages: true } };
const params = ['רונית', 'סטודיו נועה', 'טיפול פנים · שעה', 'יום ד׳, 11 בנובמבר, 11:30-12:30'];
const noYomTov = () => false;

// ── an in-memory Supabase ────────────────────────────────────────────────────
type Row = Record<string, any>;
function memDb(init: Record<string, Row[]> = {}, opts: { missing?: string[]; clock?: () => Date } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(init)) tables[k] = v.map((r) => ({ ...r }));
  const PK: Record<string, string[]> = { wa_auto_claims: ['idempotency_key'], wa_auto_optouts: ['tenant_id', 'recipient_hash'] };
  let seq = 0;
  const calls: string[] = [];
  const now = () => (opts.clock ? opts.clock() : NOW).toISOString();
  const from = (t: string) => {
    calls.push(t);
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null;
    let head = false; let wantCount = false; let single = false; let returning = false;
    let lim = Infinity; let rng: [number, number] | null = null;
    const exec = () => {
      if (opts.missing?.includes(t)) return { data: null, count: null, error: { code: '42P01', message: `relation "public.${t}" does not exist` } };
      const rows = (tables[t] ||= []);
      const match = rows.filter((r) => filters.every((f) => f(r)));
      const keyOf = (r: Row) => (PK[t] || []).map((k) => r[k]).join('|');
      if (op === 'insert') {
        for (const r0 of [].concat(payload)) {
          const r = { id: `row-${++seq}`, created_at: now(), ...(r0 as Row) };
          if (PK[t] && rows.some((x) => keyOf(x) === keyOf(r))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          rows.push(r);
        }
        return { data: null, error: null };
      }
      if (op === 'upsert') {
        for (const r0 of [].concat(payload)) {
          const r = { created_at: now(), ...(r0 as Row) };
          const i = PK[t] ? rows.findIndex((x) => keyOf(x) === keyOf(r)) : -1;
          if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r);
        }
        return { data: null, error: null };
      }
      if (op === 'update') { for (const r of match) Object.assign(r, payload); return { data: returning ? match.map((r) => ({ ...r })) : null, error: null }; }
      if (op === 'delete') { tables[t] = rows.filter((r) => !match.includes(r)); return { data: null, error: null }; }
      let data = match.map((r) => ({ ...r }));
      if (rng) data = data.slice(rng[0], rng[1] + 1);
      data = data.slice(0, lim);
      return { data: head ? null : single ? (data[0] ?? null) : data, count: wantCount ? match.length : null, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (op === 'select') { head = !!o?.head; wantCount = !!o?.count; } else returning = true; return q; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
      gte: (k: string, v: string) => { filters.push((r) => String(r[k] ?? '') >= String(v)); return q; },
      order: () => q, limit: (x: number) => { lim = x; return q; }, range: (a: number, b: number) => { rng = [a, b]; return q; },
      maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
      insert: (r: unknown) => { op = 'insert'; payload = r; return q; },
      update: (p: unknown) => { op = 'update'; payload = p; return q; },
      upsert: (r: unknown) => { op = 'upsert'; payload = r; return q; },
      delete: () => { op = 'delete'; return q; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve().then(exec).then(res, rej),
    };
    return q;
  };
  return { db: { from }, tables, calls };
}
const neverDb = { from: () => { throw new Error('the database must not be touched'); } };

function stub(fail = false): WaCloudAdapter & { sent: { to: string; kind: string; body: any }[] } {
  const sent: { to: string; kind: string; body: any }[] = [];
  let i = 0;
  return {
    mode: 'live', sent,
    async sendTemplate(to, body) { sent.push({ to, kind: 'template', body }); return fail ? { ok: false, mode: 'live', error: 'boom', httpStatus: 400, code: 131000 } : { ok: true, mode: 'live', messageId: `wamid.${++i}`, delivered: false }; },
    async sendText(to, body) { sent.push({ to, kind: 'text', body }); return { ok: true, mode: 'live', messageId: `wamid.t${++i}`, delivered: false }; },
  };
}
const alerts: { source: string; message: string }[] = [];
const alert = async (source: string, message: string) => { alerts.push({ source, message }); };
const baseInput = (db: unknown, extra: Record<string, unknown> = {}) => ({
  db: db as any, tenantId: T, kind: 'reminder' as const, appointmentId: APPT, phone: PHONE, name: 'רונית', params,
  settingsRow: ON, now: NOW, env: LIVE, alert, isYomTov: noYomTov, ...extra,
});

// ── dormant ──────────────────────────────────────────────────────────────────
await ok('dormant by default: no env -> not enabled, not active, nothing offered', () => {
  const c = autoConfig({});
  assert.equal(c.enabled, false); assert.equal(c.active, false); assert.equal(c.dryRun, false);
  assert.deepEqual(publicAutoStatus({}), { available: false });
  assert.deepEqual(publicAutoStatus({ WA_AUTO_ENABLED: 'true' }), { available: false }, 'enabled but mock: still nothing shown');
  assert.deepEqual(publicAutoStatus({ ...LIVE, WA_AUTO_ENABLED: 'false' }), { available: false }, 'kill switch off with every credential: nothing');
  assert.deepEqual(publicAutoStatus({ ...LIVE, WA_CLOUD_ACCESS_TOKEN: '' }), { available: false }, 'a missing credential: nothing');
  assert.equal(publicAutoStatus(LIVE).available, true);
  assert.equal(autoHandlesTenant(ON, {}), false);
  assert.equal(autoHandlesTenant(ON, LIVE), true);
  assert.equal(autoHandlesTenant({ automations: { wa_auto_messages: 'true' } }, LIVE), false, 'only a literal true');
});

await ok('dormant: sendAutoMessage and the hourly run return before touching the database or Meta', async () => {
  const a = stub();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(neverDb), env: {}, adapter: a }), { outcome: 'dormant' });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(neverDb), env: { ...LIVE, WA_AUTO_ENABLED: '' }, adapter: a }), { outcome: 'dormant' });
  const r = await runAutoMessages({ db: neverDb, env: {}, deps: { queue: async () => { throw new Error('no'); }, confirmLinks, baseUrl: 'https://x', adapter: a } });
  assert.equal(r.dormant, true);
  assert.equal(a.sent.length, 0);
});

await ok('the settings row renders only for { available: true }', () => {
  for (const s of [null, undefined, {}, { available: false }, { available: 'true' }, 'available', [], { available: 1 }]) assert.equal(autoSettingVisible(s), false, JSON.stringify(s));
  assert.equal(autoSettingVisible({ available: true }), true);
});

await ok('unconfigured: the settings component really renders NOTHING (compiled and server-rendered)', async () => {
  const ts = (await import('typescript')).default;
  const req = createRequire(import.meta.url);
  const src = read('app/WaAutoMessagesSetting.jsx');
  let js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace('"@/lib/waCloud/autoVisible.js"', JSON.stringify(pathToFileURL(join(process.cwd(), 'lib/waCloud/autoVisible.js')).href))
    .replace(/"react\/jsx-runtime"/g, JSON.stringify(pathToFileURL(req.resolve('react/jsx-runtime')).href))
    .replace(/from "react"/g, `from ${JSON.stringify(pathToFileURL(req.resolve('react')).href)}`);
  const dir = mkdtempSync(join(tmpdir(), 'wa-auto-'));
  const file = join(dir, 'WaAutoMessagesSetting.mjs');
  writeFileSync(file, js);
  const Comp = (await import(pathToFileURL(file).href)).default;
  const React = req('react');
  const { renderToStaticMarkup } = req('react-dom/server');
  const Row = () => React.createElement('div', null, 'ROW');
  // On the server (and on the first client paint) the status is not known yet: nothing, not even a placeholder.
  const html = renderToStaticMarkup(React.createElement(Comp, { autos: { wa_auto_messages: true }, setAutos: () => {}, pc: '#000', Row }));
  assert.equal(html, '');
  // And it reads availability from the status route, nothing else.
  assert.ok(/if \(!autoSettingVisible\(status\)\) return null;/.test(src));
  assert.ok(/useState\(null\)/.test(src));
  assert.ok(!/בקרוב|coming soon/i.test(src), 'no "coming soon" copy');
  assert.ok(read('app/beautyos.jsx').includes('<WaAutoMessagesSetting autos={autos} setAutos={setAutos} pc={pc} Row={AutoToggleRow} />'));
  assert.ok(read('app/api/wa-auto/status/route.ts').includes('publicAutoStatus()'));
});

// ── templates ────────────────────────────────────────────────────────────────
await ok("the two templates obey Meta's rules and the copy rules", () => {
  for (const t of Object.values(WA_AUTO_TEMPLATES)) {
    assert.match(t.name, /^[a-z0-9_]{1,512}$/);
    assert.equal(t.category, 'UTILITY'); assert.equal(t.language, 'he');
    assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*[.!?]?\s*$/.test(t.body), `${t.name}: no variable at either end`);
    const used = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(used, used.map((_, i) => i + 1));
    assert.equal(used.length, t.params.length); assert.equal(t.example.length, t.params.length);
    assert.ok(t.body.length <= 1024 && t.footer.length <= 60);
    assert.ok(t.buttons.length >= 2 && t.buttons.length <= 10);
    for (const b of t.buttons) assert.ok(b.text.length <= 25, `${b.text}: a quick reply label is at most 25 characters`);
    assert.ok(t.buttons.some((b) => b.action === 'optout'), `${t.name}: an opt-out button`);
    for (const s of [t.body, t.footer, ...t.buttons.map((b) => b.text)]) {
      assert.ok(!s.includes('—'), 'no em dash');
      assert.ok(!/מבצע|הנחה|קופון|חוזרת אלינו/.test(s), 'nothing promotional');
    }
  }
  assert.deepEqual(WA_AUTO_TEMPLATES.reminder.buttons.map((b) => b.text), ['מאשרת הגעה', 'צריכה לבטל', 'לא לשלוח לי הודעות']);
  assert.deepEqual(WA_AUTO_TEMPLATES.booking_confirm.buttons.map((b) => b.text), ['צריכה לבטל', 'לא לשלוח לי הודעות']);
});

await ok('docs/WA_TEMPLATES.md carries each name, body, footer and button exactly, plus the Hebrew steps and env order', () => {
  const doc = read('docs/WA_TEMPLATES.md');
  for (const t of Object.values(WA_AUTO_TEMPLATES)) {
    assert.ok(doc.includes(t.name) && doc.includes(t.body) && doc.includes(t.footer), t.name);
    for (const b of t.buttons) assert.ok(doc.includes(`\`${b.text}\``), b.text);
  }
  for (const v of ['WA_CLOUD_PHONE_NUMBER_ID', 'WA_CLOUD_ACCESS_TOKEN', 'WA_CLOUD_APP_SECRET', 'WA_CLOUD_VERIFY_TOKEN', 'WA_CLOUD_TENANT_MONTHLY_CAP', 'WA_CLOUD_GLOBAL_DAILY_CAP', 'WA_AUTO_SPEND_ALERT_USD', 'WA_AUTO_ENABLED', 'add_wa_auto_messages.sql']) assert.ok(doc.includes(v), v);
  assert.ok(doc.indexOf('`WA_CLOUD_MODE` | `live`') < doc.indexOf('`WA_AUTO_ENABLED` | `true`'), 'the kill switch is set last');
  assert.ok(doc.includes('מתג החירום'));
  assert.ok(!/EAA[A-Za-z0-9]{20,}/.test(doc), 'no real token in the docs');
});

// ── payloads ─────────────────────────────────────────────────────────────────
await ok('button payloads are signed, short, and bound to one appointment and one action', () => {
  const env = { CONFIRM_LINK_SECRET: SECRET };
  for (const a of ['confirm', 'cancel', 'optout'] as const) {
    const p = buttonPayload(a, APPT, env);
    assert.ok(p.length <= 128);
    assert.deepEqual(parseButtonPayload(p, env), { action: a, appointmentId: APPT });
  }
  const p = buttonPayload('confirm', APPT, env);
  assert.equal(parseButtonPayload(p.replace('|c|', '|x|'), env), null, 'a confirm cannot be edited into a cancel');
  assert.equal(parseButtonPayload(p.replace(APPT, APPT2), env), null, 'nor pointed at another appointment');
  assert.equal(parseButtonPayload(p, { CONFIRM_LINK_SECRET: 'other' }), null, 'another secret');
  for (const junk of ['', 'מאשרת הגעה', null, 42, 'ka1|c|x|y']) assert.equal(parseButtonPayload(junk, env), null);
});

await ok('buildAutoTemplate: body parameters plus one quick-reply payload per button, in index order', () => {
  const b = buildAutoTemplate('reminder', params, APPT, LIVE);
  assert.ok(b.ok); if (!b.ok) return;
  const comps = b.payload.components as any[];
  assert.equal(b.payload.name, 'kalmea_auto_reminder');
  assert.deepEqual(comps[0], { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) });
  assert.deepEqual(comps.slice(1).map((c) => [c.sub_type, c.index, parseButtonPayload(c.parameters[0].payload, LIVE)?.action]), [['quick_reply', '0', 'confirm'], ['quick_reply', '1', 'cancel'], ['quick_reply', '2', 'optout']]);
  assert.ok(b.preview.startsWith('שלום רונית, תזכורת לתור שלך בסטודיו נועה.'));
  assert.ok(!buildAutoTemplate('reminder', params.slice(1), APPT, LIVE).ok);
  assert.ok(!buildAutoTemplate('reminder', params, 'not-a-uuid', LIVE).ok);
});

await ok('parseWebhook keeps the payload of a button tap', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [
    { from: DIGITS, id: 'wamid.in1', type: 'button', button: { text: 'מאשרת הגעה', payload: 'ka1|c|abc|def' } },
    { from: DIGITS, id: 'wamid.in2', type: 'text', text: { body: 'הסר' } },
  ] } }] }] };
  const { inbound } = parseWebhook(body);
  assert.equal(inbound[0].payload, 'ka1|c|abc|def');
  assert.equal(inbound[0].text, 'מאשרת הגעה');
  assert.equal('payload' in inbound[1], false);
});

// ── timing ───────────────────────────────────────────────────────────────────
await ok('Israel wall clock to UTC across DST, and the month start', () => {
  assert.equal(new Date(israelLocalToUtcMs('2026-11-11', 690)).toISOString(), '2026-11-11T09:30:00.000Z');
  assert.equal(new Date(israelLocalToUtcMs('2026-07-01', 600)).toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(israelMonthStartIso(NOW), '2026-10-31T22:00:00.000Z');
  assert.equal(israelMonthStartIso(new Date('2026-10-15T12:00:00Z')), '2026-09-30T21:00:00.000Z');
});

await ok('the reminder goes about lead hours before, moved out of quiet hours, never under two hours before', () => {
  const start = israelLocalToUtcMs('2026-11-11', 690);
  assert.equal(reminderSendAt(start, 24), start - 24 * 3600_000);
  // 22:30 visit: 22:30 the evening before is quiet, so 20:00 that evening.
  assert.equal(new Date(reminderSendAt(israelLocalToUtcMs('2026-11-12', 22 * 60 + 30), 24)).toISOString(), '2026-11-11T18:00:00.000Z');
  // 07:00 visit: 07:00 the morning before is quiet, so 08:00.
  assert.equal(new Date(reminderSendAt(israelLocalToUtcMs('2026-11-12', 7 * 60), 24)).toISOString(), '2026-11-11T06:00:00.000Z');
  assert.equal(reminderPlan({ date: '2026-11-11', startMinute: 690, leadHours: 24, now: NOW, isYomTov: noYomTov }), 'due');
  assert.equal(reminderPlan({ date: '2026-11-11', startMinute: 750, leadHours: 24, now: NOW, isYomTov: noYomTov }), 'not_yet');
  assert.equal(reminderPlan({ date: '2026-11-10', startMinute: 13 * 60, leadHours: 24, now: NOW, isYomTov: noYomTov }), 'too_late');
  assert.equal(reminderPlan({ date: '2026-11-11', startMinute: 690, leadHours: 24, now: NIGHT, isYomTov: noYomTov }), 'held', '12 hours ahead, due, but 23:30 is quiet');
  assert.equal(reminderPlan({ date: '2026-11-12', startMinute: 600, leadHours: 48, now: NOW, isYomTov: noYomTov }), 'due');
  assert.equal(reminderPlan({ date: '2026-11-11', startMinute: null, leadHours: 24, now: NOW }), 'bad_time');
  assert.equal(tenantLeadHours({ automations: { wa_auto_lead_hours: 48 } }, autoConfig(LIVE)), 48);
  assert.equal(tenantLeadHours({ automations: { wa_auto_lead_hours: 5 } }, autoConfig(LIVE)), 24);
});

await ok('never on Shabbat, yom tov, or their eve after 15:00', () => {
  assert.equal(restHold(new Date('2026-11-14T10:00:00Z')), true, 'Saturday noon');
  assert.equal(restHold(new Date('2026-11-14T18:30:00Z')), false, 'Saturday 20:30');
  assert.equal(restHold(new Date('2026-11-13T14:00:00Z')), true, 'Friday 16:00');
  assert.equal(restHold(new Date('2026-11-13T10:00:00Z')), false, 'Friday 12:00');
  assert.equal(restHold(NOW, (d) => d === '2026-11-10'), true, 'a yom tov');
  assert.equal(autoAllowedNow(NOW, noYomTov), true);
  assert.equal(autoAllowedNow(NIGHT, noYomTov), false);
});

// ── one message ──────────────────────────────────────────────────────────────
await ok('live, opted in: sent once through the stub, logged with its cost, claimed; a second call is a duplicate', async () => {
  const { db, tables } = memDb();
  const a = stub();
  const out = await sendAutoMessage({ ...baseInput(db), adapter: a });
  assert.equal(out.outcome, 'sent');
  assert.equal(a.sent.length, 1); assert.equal(a.sent[0].to, DIGITS);
  const log = tables.wa_cloud_messages[0];
  assert.equal(log.status, 'accepted'); assert.equal(log.mode, 'live'); assert.equal(log.cost_estimate_usd, 0.0053);
  assert.equal(log.appointment_id, APPT); assert.equal(log.origin, 'auto'); assert.equal(log.recipient_hash, recipientHash(DIGITS));
  assert.ok(!JSON.stringify(log).includes(DIGITS), 'no phone number in the cost log');
  assert.equal(tables.wa_auto_claims[0].idempotency_key, idempotencyKey('live', 'reminder', APPT));
  assert.equal(tables.wa_auto_claims[0].status, 'sent');
  assert.equal(tables.whatsapp_messages[0].status, 'sent'); assert.equal(tables.whatsapp_messages[0].green_api_id, 'wamid.1');
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), adapter: a }), { outcome: 'duplicate' });
  assert.equal(a.sent.length, 1, 'Meta was called once');
});

await ok('not opted in, or a demo business: nothing is sent', async () => {
  const a = stub();
  const { db } = memDb();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), settingsRow: { automations: {} }, adapter: a }), { outcome: 'not_opted_in' });
  const { db: db2 } = memDb({ settings: [{ tenant_id: T, automations: { wa_auto_messages: false } }] });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db2), settingsRow: undefined, adapter: a }), { outcome: 'not_opted_in' }, 'read from settings');
  for (const demo of Object.values(DEMO_TENANT_IDS)) {
    assert.deepEqual(await sendAutoMessage({ ...baseInput(neverDb), tenantId: demo, adapter: a }), { outcome: 'dormant' }, 'a demo business never sends');
  }
  assert.equal(a.sent.length, 0);
});

await ok('dry run (enabled, mock): decisions logged as mock rows, nothing reaches Meta, the caller carries on', async () => {
  const { db, tables } = memDb();
  const out = await sendAutoMessage({ ...baseInput(db), env: DRY });
  assert.deepEqual(out, { outcome: 'dry_run', status: 'accepted', reason: null });
  assert.equal(tables.wa_cloud_messages[0].mode, 'mock');
  assert.equal(tables.wa_auto_claims[0].idempotency_key, idempotencyKey('mock', 'reminder', APPT), 'a mock claim never blocks a later live send');
  assert.equal(tables.whatsapp_messages, undefined, 'no "sent" row for a message nobody got');
});

await ok('opt-out: a recorded opt-out, a "הסר" on her card, or a suppression: no automatic message, her queue instead', async () => {
  const a = stub();
  const one = memDb({ wa_auto_optouts: [{ tenant_id: T, recipient_hash: recipientHash(DIGITS), source: 'button' }] });
  assert.equal((await sendAutoMessage({ ...baseInput(one.db), adapter: a })).outcome, 'fallback');
  assert.equal(one.tables.wa_auto_claims[0].status, 'fallback', 'claimed, so the hourly run queues it once');
  const two = memDb({ clients: [{ id: 'c1', tenant_id: T, phone: PHONE, marketing_opted_out_at: '2026-10-01T00:00:00Z' }] });
  const r2 = await sendAutoMessage({ ...baseInput(two.db), clientId: 'c1', adapter: a });
  assert.ok(r2.outcome === 'fallback' && r2.reason === 'client_opted_out');
  const three = memDb({ clients: [{ id: 'c2', tenant_id: T, phone: PHONE, marketing_opted_out_at: null }] });
  assert.equal(await isAutoOptedOut(three.db, T, DIGITS, 'c2'), false);
  assert.equal(await isAutoOptedOut(memDb({}, { missing: ['wa_auto_optouts'] }).db, T, DIGITS), null, 'unreadable = do not send');
  assert.equal(a.sent.length, 0);
});

await ok('quiet hours: a reminder is held (nothing claimed); a night booking is deferred and goes at 08:00', async () => {
  const { db, tables } = memDb();
  const a = stub();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), now: NIGHT, adapter: a }), { outcome: 'held' });
  assert.equal((tables.wa_auto_claims || []).length, 0);
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), kind: 'booking_confirm', appointmentId: APPT2, now: NIGHT, adapter: a }), { outcome: 'deferred' });
  assert.equal(tables.wa_auto_claims[0].status, 'deferred');
  assert.equal(a.sent.length, 0, 'nothing at 23:30');
});

await ok('the ceilings: monthly per business, daily for everyone, unreadable log; each refusal goes to her queue', async () => {
  const live = (tenant: string, i: number) => ({ tenant_id: tenant, mode: 'live', status: 'accepted', created_at: `2026-11-0${1 + (i % 5)}T09:00:00.000Z` });
  alerts.length = 0;
  const m = memDb({ wa_cloud_messages: Array.from({ length: 3 }, (_, i) => live(T, i)) });
  const r1 = await sendAutoMessage({ ...baseInput(m.db), env: { ...LIVE, WA_CLOUD_TENANT_MONTHLY_CAP: '3' }, adapter: stub() });
  assert.ok(r1.outcome === 'fallback' && r1.reason === 'tenant_monthly_capped');
  assert.ok(alerts.some((x) => x.source === 'wa-auto:cap'), 'a money alert');
  const today = Array.from({ length: 2 }, () => ({ tenant_id: T2, mode: 'live', status: 'accepted', created_at: '2026-11-10T08:00:00.000Z' }));
  const g = memDb({ wa_cloud_messages: today });
  const r2 = await sendAutoMessage({ ...baseInput(g.db), env: { ...LIVE, WA_CLOUD_GLOBAL_DAILY_CAP: '2' }, adapter: stub() });
  assert.ok(r2.outcome === 'fallback' && r2.reason === 'global_daily_capped');
  const u = memDb({}, { missing: ['wa_cloud_messages'] });
  const r3 = await sendAutoMessage({ ...baseInput(u.db), adapter: stub() });
  assert.ok(r3.outcome === 'fallback' && r3.reason === 'cap_unreadable');
  // The ordinary Cloud route obeys the same two new ceilings.
  const c = await routeThroughCloud({ db: m.db, tenantId: T, type: 'reminder', digits: DIGITS, params: ['a', 'b', 'c', 'd', 'e', 'f'], now: NOW, env: { WA_CLOUD_ENABLED: 'true', WA_CLOUD_MODE: 'live', WA_CLOUD_PHONE_NUMBER_ID: '1', WA_CLOUD_ACCESS_TOKEN: 't', WA_CLOUD_TENANT_MONTHLY_CAP: '3' }, adapter: mockAdapter() });
  assert.ok(c.route === 'cloud' && !c.ok && c.reason === 'tenant_monthly_capped');
});

await ok('without the migration: refused before any send, and the hourly run stops (no hourly re-queueing)', async () => {
  const a = stub();
  const { db } = memDb({}, { missing: ['wa_auto_claims', 'wa_auto_optouts'] });
  const out = await sendAutoMessage({ ...baseInput(db), adapter: a });
  assert.ok(out.outcome === 'fallback' && out.reason === 'migration_missing');
  alerts.length = 0;
  let queued = 0;
  const r = await runAutoMessages({ db, env: LIVE, now: NOW, deps: { queue: async () => { queued++; }, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(r.migrationMissing, true); assert.equal(queued, 0); assert.equal(a.sent.length, 0);
  assert.ok(alerts.some((x) => x.source === 'wa-auto:migration'));
});

await ok("Meta's error: her queue, once; the claim keeps the next run from queueing it again", async () => {
  const { db, tables } = memDb();
  const out = await sendAutoMessage({ ...baseInput(db), adapter: stub(true) });
  assert.ok(out.outcome === 'fallback' && out.reason === 'meta_error');
  assert.equal(tables.wa_cloud_messages[0].status, 'failed');
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), adapter: stub() }), { outcome: 'duplicate' });
});

await ok('the spend alert fires once per crossing of the threshold', async () => {
  const cfg = autoConfig({ ...LIVE, WA_AUTO_SPEND_ALERT_USD: '0.01' });
  alerts.length = 0;
  const one = memDb({ wa_cloud_messages: [{ tenant_id: T, mode: 'live', status: 'accepted', created_at: '2026-11-05T00:00:00.000Z' }] });
  assert.equal((await checkSpendAlert(one.db, { now: NOW, env: LIVE, cfg, alert })).crossed, false, '$0.0053');
  one.tables.wa_cloud_messages.push({ tenant_id: T2, mode: 'live', status: 'accepted', created_at: '2026-11-06T00:00:00.000Z' });
  assert.equal((await checkSpendAlert(one.db, { now: NOW, env: LIVE, cfg, alert })).crossed, true, '$0.0106 passed $0.01');
  one.tables.wa_cloud_messages.push({ tenant_id: T2, mode: 'live', status: 'accepted', created_at: '2026-11-07T00:00:00.000Z' });
  assert.equal((await checkSpendAlert(one.db, { now: NOW, env: LIVE, cfg, alert })).crossed, false, '$0.0159: same step');
  assert.equal(alerts.filter((x) => x.source === 'wa-auto:spend').length, 1);
});

// ── the hourly run ───────────────────────────────────────────────────────────
const apptRow = (id: string, tenant: string, extra: Row = {}) => ({ id, tenant_id: tenant, name: 'רונית', service: 'טיפול פנים', date: '2026-11-11', start_minute: 690, hour: 11, duration: 60, client_phone: PHONE, client_id: null, confirmation_status: 'pending', kind: 'appointment', ...extra });
const settingsRows = () => [
  { tenant_id: T, business_name: 'סטודיו נועה', branding: {}, automations: { wa_auto_messages: true } },
  { tenant_id: T2, business_name: 'עסק אחר', branding: {}, automations: {} },
];

await ok('the hourly run: the due reminder of an opted-in business goes; not-yet, cancelled, personal and other businesses do not', async () => {
  const { db } = memDb({
    settings: settingsRows(),
    appointments: [
      apptRow(APPT, T),
      apptRow('22222222-2222-4222-8222-222222222222', T, { start_minute: 900, hour: 15 }),
      apptRow('33333333-3333-4333-8333-333333333333', T, { confirmation_status: 'cancelled' }),
      apptRow('44444444-4444-4444-8444-444444444444', T, { kind: 'personal' }),
      apptRow('55555555-5555-4555-8555-555555555555', T2),
    ],
  });
  const a = stub();
  const r = await runAutoMessages({ db, env: LIVE, now: NOW, deps: { queue: async () => {}, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(r.tenants, 1); assert.equal(r.sent, 1); assert.equal(a.sent.length, 1);
  const b = a.sent[0].body;
  assert.equal(b.name, 'kalmea_auto_reminder');
  assert.equal(parseButtonPayload(b.components[1].parameters[0].payload, LIVE)?.appointmentId, APPT);
  const again = await runAutoMessages({ db, env: LIVE, now: new Date(NOW.getTime() + 3600_000), deps: { queue: async () => {}, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(again.sent, 0); assert.equal(a.sent.length, 1, 'the next hour does not send it again');
});

await ok('the hourly run: a refused reminder waits in her queue (forceManual) once, with the confirm links', async () => {
  const { db } = memDb({ settings: settingsRows(), appointments: [apptRow(APPT, T)], wa_auto_optouts: [{ tenant_id: T, recipient_hash: recipientHash(DIGITS), source: 'reply' }] });
  const queued: { phone: string; text: string; opts: any }[] = [];
  const deps = { queue: async (phone: string, text: string, opts: any) => { queued.push({ phone, text, opts }); }, confirmLinks, baseUrl: 'https://kalmea.app', adapter: stub(), alert, isYomTov: noYomTov };
  const r = await runAutoMessages({ db, env: LIVE, now: NOW, deps });
  assert.equal(r.queued, 1); assert.deepEqual(r.queuedByTenant, { [T]: 1 });
  assert.equal(queued[0].opts.forceManual, true); assert.equal(queued[0].opts.type, 'reminder');
  assert.ok(queued[0].text.includes('https://kalmea.app/confirm?id=' + APPT + '&action=confirm'));
  await runAutoMessages({ db, env: LIVE, now: new Date(NOW.getTime() + 3600_000), deps });
  assert.equal(queued.length, 1, 'not queued a second time');
});

await ok('the hourly run: a night booking goes at 08:00 and is marked sent; a booking inside the reminder window gets no reminder on top', async () => {
  const tomorrowLate = apptRow(APPT, T, { date: '2026-11-11', start_minute: 17 * 60, hour: 17 });
  const { db, tables } = memDb({ settings: settingsRows(), appointments: [tomorrowLate] }, { clock: () => NIGHT });
  const a = stub();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), kind: 'booking_confirm', now: NIGHT, adapter: a }), { outcome: 'deferred' });
  const r = await runAutoMessages({ db, env: LIVE, now: MORNING, deps: { queue: async () => {}, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(r.deferredSent, 1);
  assert.equal(a.sent.length, 1); assert.equal(a.sent[0].body.name, 'kalmea_auto_booking');
  assert.equal(tables.appointments[0].confirmation_sent, true);
  // 17:00 tomorrow, 24h lead: the reminder was due from 17:00 yesterday, before she booked at 23:30. No second message.
  assert.equal(r.sent, 0); assert.equal(r.skipped >= 1, true);
});

// ── buttons ──────────────────────────────────────────────────────────────────
await ok('a button tap: from the number the message went to, it runs the confirm handler and answers in its words', async () => {
  const { db, tables } = memDb({ wa_cloud_messages: [{ tenant_id: T, appointment_id: APPT, recipient_hash: recipientHash(DIGITS), status: 'accepted', mode: 'live' }], settings: [{ tenant_id: T, business_name: 'סטודיו נועה' }] });
  const calls: [string, string][] = [];
  const applyAction = async (id: string, action: 'confirm' | 'cancel') => { calls.push([id, action]); return { success: true, message: 'נתראה ביום ד׳ 🌸' }; };
  const a = stub();
  const r = await handleAutoButton({ db, from: DIGITS, payload: buttonPayload('confirm', APPT, LIVE), applyAction, adapter: a, env: LIVE });
  assert.ok(r.handled && r.outcome === 'applied' && r.reply === 'נתראה ביום ד׳ 🌸');
  assert.deepEqual(calls, [[APPT, 'confirm']]);
  assert.equal(a.sent[0].kind, 'text');
  // Another phone (a forwarded message): nothing changes, nothing is sent.
  const other = await handleAutoButton({ db, from: '972509999999', payload: buttonPayload('cancel', APPT, LIVE), applyAction, adapter: a, env: LIVE });
  assert.ok(other.handled && other.outcome === 'unknown_sender');
  assert.equal(calls.length, 1); assert.equal(a.sent.length, 1);
  // A forged payload is not ours at all.
  assert.deepEqual(await handleAutoButton({ db, from: DIGITS, payload: 'ka1|x|' + APPT + '|00000000000000000000', applyAction, adapter: a, env: LIVE }), { handled: false });
  // The opt-out button.
  const o = await handleAutoButton({ db, from: DIGITS, payload: buttonPayload('optout', APPT, LIVE), applyAction, adapter: a, env: LIVE });
  assert.ok(o.handled && o.outcome === 'opted_out' && String(o.reply).includes('סטודיו נועה'));
  assert.equal(tables.wa_auto_optouts[0].recipient_hash, recipientHash(DIGITS));
  assert.equal(await isAutoOptedOut(db, T, DIGITS), true);
  // A refused cancel (inside her window) answers with the handler's own refusal.
  assert.equal(answerText('cancel', { success: false, error: 'אפשר לבטל רק ישירות מול העסק' }), 'אפשר לבטל רק ישירות מול העסק');
  assert.ok(answerText('cancel', { success: true, message: 'התור בוטל', bookUrl: 'https://kalmea.app/b/x' }).includes('https://kalmea.app/b/x'));
  // Kill switch off after the message went: her tap still counts, and nothing is sent back.
  const killed = await handleAutoButton({ db, from: DIGITS, payload: buttonPayload('confirm', APPT, LIVE), applyAction, adapter: a, env: { ...LIVE, WA_AUTO_ENABLED: '' } });
  assert.ok(killed.handled && killed.reply === null);
  assert.equal(calls.length, 2); assert.equal(a.sent.length, 2);
});

// ── the daily cron and the wiring ────────────────────────────────────────────
await ok('the daily reminder run leaves an automatic business to the hourly run, and is unchanged without the hook', async () => {
  const mk = () => memDb({ settings: settingsRows(), appointments: [apptRow(APPT, T), apptRow(APPT2, T2)] });
  const deps = { startMinute: (a: any) => a.start_minute, isPersonal: () => false, confirmLinks, isDemoTenantId: () => false, isMissingColumnError: () => false };
  const sent: string[] = [];
  const send = async (_p: string, _m: string, o: any) => { sent.push(o.tenantId); return { ok: true }; };
  const r = await runDailyReminders({ db: mk().db, send, tomorrow: '2026-11-11', baseUrl: 'https://x', deps: { ...deps, autoHandles: (_t: string, s: any) => tenantOptedIn(s) } });
  assert.deepEqual(sent, [T2]);
  assert.equal(r.results.find((x: any) => x.tenantId === T).status, STATUS_AUTO);
  sent.length = 0;
  await runDailyReminders({ db: mk().db, send, tomorrow: '2026-11-11', baseUrl: 'https://x', deps });
  assert.deepEqual(sent.sort(), [T, T2].sort());
});

await ok('wiring: booking confirmation, crons, webhook reuse of the confirm handler, migration, env defaults', () => {
  const bn = read('lib/bookingNotify.js');
  assert.ok(/if \(!autoConfig\(\)\.enabled \|\| !p\.appointmentId \|\| !p\.tenantId\) return \{ handled: false \};/.test(bn), 'returns at the first line when off');
  assert.ok(bn.indexOf('await autoBookingConfirm(p, settingsRow)') < bn.indexOf('await sendWhatsApp(p.phone, clientMsg'));
  assert.ok(bn.includes('...(auto.queue ? { forceManual: true } : {})'), 'a refusal goes to her manual queue');
  const sr = read('app/api/send-reminders/route.js');
  assert.ok(sr.includes('autoConfig().active && (await autoMigrationReady(supabase))') && sr.includes('autoHandles: autoReady ?'));
  const crons = JSON.parse(read('vercel.json')).crons as { path: string; schedule: string }[];
  assert.ok(crons.some((c) => c.path === '/api/wa-auto/run' && /^\d+ \* \* \* \*$/.test(c.schedule)), 'hourly');
  const run = read('app/api/wa-auto/run/route.ts');
  assert.ok(run.indexOf('isAuthorizedCron(request)') < run.indexOf('createClient('), 'cron auth before anything');
  assert.ok(run.indexOf("if (!autoConfig().enabled) return Response.json({ success: true, dormant: true });") < run.indexOf('createClient('), 'dormant before a client exists');
  const wh = read('app/api/wa-cloud/webhook/route.ts');
  assert.ok(wh.includes("import { POST as confirmPost } from '@/app/api/confirm/route';"), 'the button reuses the confirm handler itself');
  assert.ok(wh.indexOf('verifySignature(raw') < wh.indexOf('handleAutoButton({'), 'signature first');
  const mig = read('supabase/migrations/add_wa_auto_messages.sql');
  assert.ok(!/drop table|truncate|delete from|drop column/i.test(mig.replace(/^--.*$/gm, '')), 'only adds');
  assert.ok(/revoke all on public\.wa_auto_claims from anon, authenticated/.test(mig) && /revoke all on public\.wa_auto_optouts from anon, authenticated/.test(mig));
  assert.ok(/idempotency_key\s+text primary key/.test(mig) && /primary key \(tenant_id, recipient_hash\)/.test(mig));
  assert.ok(!/recipient_phone|\bphone\s+text/.test(mig), 'no phone number stored');
  const env = read('.env.example');
  assert.ok(/^WA_AUTO_ENABLED=false$/m.test(env) && /^WA_CLOUD_TENANT_MONTHLY_CAP=400$/m.test(env) && /^WA_CLOUD_GLOBAL_DAILY_CAP=2000$/m.test(env));
  assert.ok(read('scripts/run-tests.mjs').includes("WA_AUTO_ENABLED: ''"));
  const refs = read('lib/referencedTables.js');
  assert.ok(refs.includes("'wa_auto_claims'") && refs.includes("'wa_auto_optouts'"));
  assert.ok(read('app/dashboard/admin/WaCloudCosts.tsx').includes('מתחילת החודש'), 'month-to-date in the admin costs');
  const all = [read('lib/waCloud/auto.ts'), read('lib/waCloud/autoRun.ts'), read('test-wa-auto-reminders.ts'), mig, read('docs/WA_TEMPLATES.md')].join('\n');
  assert.ok(!all.includes(['448e9e45', '2251', '4572', 'b665', '886c5bc7a4c8'].join('-')), 'never the real tenant');
});

await ok('the queue text reads like her own reminder, with both links', () => {
  const t = reminderQueueText(apptRow(APPT, T), { business_name: 'סטודיו נועה', branding: { address: 'הרצל 1' } }, { confirmUrl: 'https://c', cancelUrl: 'https://x' });
  assert.ok(t.includes('תזכורת לתור שלך בסטודיו נועה.') && t.includes('לאישור: https://c') && t.includes('https://x') && t.includes('הרצל 1'));
  assert.deepEqual(autoParams(apptRow(APPT, T), { business_name: '' }).slice(0, 3), ['רונית', 'העסק', 'טיפול פנים · שעה']);
});

console.log(`\n${n} passed 0 failed`);

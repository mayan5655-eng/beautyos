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
import { confirmLinks, verifyConfirm } from './lib/confirmToken.ts';
import { DEMO_TENANT_IDS } from './lib/demoTenants.ts';
import { invalidatePlatformSettingsCache } from './lib/platformSettings.js';
import { automationsPaused } from './lib/automationPause.js';
import { autoGate, AUTO_RECIPIENT_TYPES } from './lib/waCloud/auto.ts';

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
  // The platform's automatic-send switch is ON unless a test says otherwise (lib/platformSettings.js caches it for 15s
  // per process, so every new database starts from a fresh read).
  invalidatePlatformSettingsCache();
  if (!('platform_settings' in init)) tables.platform_settings = [{ id: true, whatsapp_auto_utility_enabled: true }];
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
const FAR = Date.parse('2026-11-14T22:00:00Z');
const BIND = { appointmentId: APPT, tenantId: T, recipient: DIGITS, expiresAtMs: FAR };
await ok('button payloads: HMAC over action, appointment, tenant, recipient and expiry; nothing edits or replays', () => {
  const env = { CONFIRM_LINK_SECRET: SECRET };
  const at = NOW.getTime();
  for (const a of ['confirm', 'cancel', 'optout'] as const) {
    const p = buttonPayload(a, BIND, env);
    assert.ok(p.length <= 128, `${p.length} characters`);
    assert.ok(!p.includes(DIGITS) && !p.includes(DIGITS.slice(-7)), 'the number is not in the payload');
    assert.deepEqual(parseButtonPayload(p, DIGITS, env, at), { action: a, appointmentId: APPT, tenantId: T, expiresAtMs: FAR });
  }
  const p = buttonPayload('confirm', BIND, env);
  const hex = (u: string) => u.replace(/-/g, '');
  assert.equal(parseButtonPayload(p.replace('k2|c|', 'k2|x|'), DIGITS, env, at), null, 'a confirm cannot be edited into a cancel');
  assert.equal(parseButtonPayload(p.replace(hex(APPT), hex(APPT2)), DIGITS, env, at), null, 'nor pointed at another appointment');
  assert.equal(parseButtonPayload(p.replace(hex(T), hex(T2)), DIGITS, env, at), null, 'nor at another business');
  const parts = p.split('|');
  const later = [...parts.slice(0, 4), (parseInt(parts[4], 36) + 86400 * 365).toString(36), parts[5]].join('|');
  assert.equal(parseButtonPayload(later, DIGITS, env, at), null, 'nor given a later expiry');
  assert.equal(parseButtonPayload(p, '972509999999', env, at), null, 'nor tapped from another number');
  assert.equal(parseButtonPayload(p, DIGITS, env, FAR + 1), null, 'nor used after it expired');
  assert.equal(parseButtonPayload(p, DIGITS, { CONFIRM_LINK_SECRET: 'other' }, at), null, 'another secret');
  const legacy = `ka1|c|${APPT}|00000000000000000000`;
  for (const junk of ['', 'מאשרת הגעה', null, 42, legacy, p + 'x', 'k2|c|' + 'a'.repeat(300)]) assert.equal(parseButtonPayload(junk, DIGITS, env, at), null, String(junk).slice(0, 20));
  assert.throws(() => buttonPayload('confirm', { ...BIND, tenantId: 'x' }, env));
  assert.throws(() => buttonPayload('confirm', { ...BIND, recipient: '' }, env));
  // Its signature is not a confirm-link token for the same appointment (a separate label in the HMAC input).
  assert.equal(verifyConfirm(APPT, 'confirm', parts[5]), false);
});

await ok('buildAutoTemplate: body parameters plus one quick-reply payload per button, in index order', () => {
  const b = buildAutoTemplate('reminder', params, BIND, LIVE);
  assert.ok(b.ok); if (!b.ok) return;
  const comps = b.payload.components as any[];
  assert.equal(b.payload.name, 'kalmea_auto_reminder');
  assert.deepEqual(comps[0], { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) });
  assert.deepEqual(comps.slice(1).map((c) => [c.sub_type, c.index, parseButtonPayload(c.parameters[0].payload, DIGITS, LIVE, NOW.getTime())?.action]), [['quick_reply', '0', 'confirm'], ['quick_reply', '1', 'cancel'], ['quick_reply', '2', 'optout']]);
  assert.ok(b.preview.startsWith('שלום רונית, תזכורת לתור שלך בסטודיו נועה.'));
  assert.ok(!buildAutoTemplate('reminder', params.slice(1), BIND, LIVE).ok);
  assert.ok(!buildAutoTemplate('reminder', params, { ...BIND, appointmentId: 'not-a-uuid' }, LIVE).ok);
  assert.ok(!buildAutoTemplate('reminder', params, { ...BIND, tenantId: 'not-a-uuid' }, LIVE).ok);
  assert.ok(!buildAutoTemplate('reminder', params, { ...BIND, recipient: '12' }, LIVE).ok);
});

await ok('parseWebhook keeps the payload of a button tap', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [
    { from: DIGITS, id: 'wamid.in1', type: 'button', button: { text: 'מאשרת הגעה', payload: 'ka1|c|abc|def' } },
    { from: DIGITS, id: 'wamid.in2', type: 'text', text: { body: 'הסר' } },
    { from: '+972 50-123', id: 'wamid.in3', type: 'text', text: { body: 'הסר' } },
    { from: 'attacker', id: 'wamid.in4', type: 'text', text: { body: 'הסר' } },
  ] } }] }] };
  const { inbound } = parseWebhook(body);
  assert.equal(inbound[0].payload, 'ka1|c|abc|def');
  assert.equal(inbound[0].text, 'מאשרת הגעה');
  assert.equal('payload' in inbound[1], false);
  assert.equal(inbound.length, 2, 'a sender that is not a wa_id is dropped');
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
  assert.equal((tables.whatsapp_messages || []).length, 0, 'no "sent" row for a message nobody got');
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
  assert.equal(parseButtonPayload(b.components[1].parameters[0].payload, DIGITS, LIVE, NOW.getTime())?.appointmentId, APPT);
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

await ok('a booking at 23:00 for a visit 10 days away gets its confirmation at 08:00 (not limited to the reminder lookahead)', async () => {
  const at23 = new Date('2026-11-10T21:00:00Z'); // 23:00 Israel
  const far = apptRow(APPT, T, { date: '2026-11-20', start_minute: 600, hour: 10 });
  const { db, tables } = memDb({ settings: settingsRows(), appointments: [far] }, { clock: () => at23 });
  const a = stub();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), kind: 'booking_confirm', apptDate: far.date, now: at23, adapter: a }), { outcome: 'deferred' });
  const r = await runAutoMessages({ db, env: LIVE, now: MORNING, deps: { queue: async () => {}, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(r.deferredSent, 1); assert.equal(r.skipped, 0);
  assert.equal(a.sent.length, 1); assert.equal(a.sent[0].body.name, 'kalmea_auto_booking');
  assert.equal(tables.wa_auto_claims[0].status, 'sent');
  assert.equal(tables.appointments[0].confirmation_sent, true);
  // Its buttons live until three days after the visit, not the reminder window.
  const parsed = parseButtonPayload(a.sent[0].body.components[1].parameters[0].payload, DIGITS, LIVE, Date.parse('2026-11-21T12:00:00Z'));
  assert.equal(parsed?.appointmentId, APPT);
});

await ok('a deferred confirmation is skipped only when cancelled or past; a business that turned it off gets it in her queue', async () => {
  const at23 = new Date('2026-11-10T21:00:00Z');
  const A3 = '33333333-3333-4333-8333-333333333333';
  const rows = [
    apptRow(APPT, T, { date: '2026-11-25', start_minute: 600 }),
    apptRow(APPT2, T, { date: '2026-11-25', start_minute: 600, confirmation_status: 'cancelled' }),
    apptRow(A3, T2, { date: '2026-11-25', start_minute: 600 }),
  ];
  const { db, tables } = memDb({ settings: settingsRows(), appointments: rows }, { clock: () => at23 });
  const a = stub();
  for (const [id, tenant] of [[APPT, T], [APPT2, T], [A3, T2]]) {
    const out = await sendAutoMessage({ ...baseInput(db), tenantId: tenant, appointmentId: id, kind: 'booking_confirm', apptDate: '2026-11-25', now: at23, settingsRow: ON, adapter: a });
    assert.deepEqual(out, { outcome: 'deferred' });
  }
  // T2 never opted in in settings (as if she turned it off overnight); APPT2 was cancelled overnight.
  const queued: any[] = [];
  const r = await runAutoMessages({ db, env: LIVE, now: MORNING, deps: { queue: async (ph: string, text: string, opts: any) => { queued.push({ ph, text, opts }); }, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  const st = Object.fromEntries(tables.wa_auto_claims.map((c: any) => [c.appointment_id, c.status]));
  assert.equal(st[APPT], 'sent');
  assert.equal(st[APPT2], 'skipped');
  assert.equal(st[A3], 'fallback');
  assert.equal(r.deferredSent, 1); assert.equal(r.skipped, 1);
  assert.equal(queued.length, 1); assert.equal(queued[0].opts.tenantId, T2); assert.equal(queued[0].opts.forceManual, true);
  // Past: a deferred confirmation whose visit already happened.
  const past = memDb({ settings: settingsRows(), appointments: [apptRow(APPT, T, { date: '2026-11-11', start_minute: 7 * 60 })] }, { clock: () => at23 });
  await sendAutoMessage({ ...baseInput(past.db), kind: 'booking_confirm', apptDate: '2026-11-11', now: at23, adapter: a });
  await runAutoMessages({ db: past.db, env: LIVE, now: new Date('2026-11-11T06:15:00Z'), deps: { queue: async () => {}, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov } });
  assert.equal(past.tables.wa_auto_claims[0].status, 'skipped');
});

// ── buttons ──────────────────────────────────────────────────────────────────
await ok('a button tap: bound to the sender, the business and the appointment; runs the confirm handler, answers in its words', async () => {
  const log = { tenant_id: T, appointment_id: APPT, recipient_hash: recipientHash(DIGITS), status: 'accepted', mode: 'live' };
  const { db, tables } = memDb({ wa_cloud_messages: [log], appointments: [apptRow(APPT, T)], settings: [{ tenant_id: T, business_name: 'סטודיו נועה' }] });
  const calls: [string, string][] = [];
  const applyAction = async (id: string, action: 'confirm' | 'cancel') => { calls.push([id, action]); return { success: true, message: 'נתראה ביום ד׳ 🌸' }; };
  const a = stub();
  const at = NOW.getTime();
  const tap = (action: 'confirm' | 'cancel' | 'optout', o: Record<string, unknown> = {}) =>
    handleAutoButton({ db, from: DIGITS, payload: buttonPayload(action, BIND, LIVE), applyAction, adapter: a, env: LIVE, nowMs: at, ...o });
  const r = await tap('confirm');
  assert.ok(r.handled && r.outcome === 'applied' && r.reply === 'נתראה ביום ד׳ 🌸');
  assert.deepEqual(calls, [[APPT, 'confirm']]);
  assert.equal(a.sent[0].kind, 'text');
  // The same payload from another phone (forwarded, or a spoofed sender): not even recognised as ours. Nothing read.
  assert.deepEqual(await handleAutoButton({ db: neverDb as any, from: '972509999999', payload: buttonPayload('cancel', BIND, LIVE), applyAction, adapter: a, env: LIVE, nowMs: at }), { handled: false });
  // Expired: nothing.
  assert.deepEqual(await tap('cancel', { nowMs: FAR + 1 }), { handled: false });
  // Signed for this number but the business never sent it (or not live): ignored.
  const noLog = memDb({ wa_cloud_messages: [{ ...log, mode: 'mock' }], appointments: [apptRow(APPT, T)] });
  const ig = await handleAutoButton({ db: noLog.db, from: DIGITS, payload: buttonPayload('cancel', BIND, LIVE), applyAction, adapter: a, env: LIVE, nowMs: at });
  assert.ok(ig.handled && ig.outcome === 'unknown_sender');
  // The appointment is no longer this business's: ignored.
  const moved = memDb({ wa_cloud_messages: [log], appointments: [apptRow(APPT, T2)] });
  const mv = await handleAutoButton({ db: moved.db, from: DIGITS, payload: buttonPayload('cancel', BIND, LIVE), applyAction, adapter: a, env: LIVE, nowMs: at });
  assert.ok(mv.handled && mv.outcome === 'unknown_sender');
  assert.equal(calls.length, 1); assert.equal(a.sent.length, 1);
  // A forged payload is not ours at all.
  assert.deepEqual(await handleAutoButton({ db, from: DIGITS, payload: `k2|x|${APPT.replace(/-/g, '')}|${T.replace(/-/g, '')}|zzzzzz|${'A'.repeat(22)}`, applyAction, adapter: a, env: LIVE, nowMs: at }), { handled: false });
  // The opt-out button: recorded for the SENDER's own number in this business.
  const o = await tap('optout');
  assert.ok(o.handled && o.outcome === 'opted_out' && String(o.reply).includes('סטודיו נועה'));
  assert.equal(tables.wa_auto_optouts[0].recipient_hash, recipientHash(DIGITS));
  assert.equal(tables.wa_auto_optouts[0].tenant_id, T);
  assert.equal(await isAutoOptedOut(db, T, DIGITS), true);
  // A refused cancel (inside her window) answers with the handler's own refusal.
  assert.equal(answerText('cancel', { success: false, error: 'אפשר לבטל רק ישירות מול העסק' }), 'אפשר לבטל רק ישירות מול העסק');
  assert.ok(answerText('cancel', { success: true, message: 'התור בוטל', bookUrl: 'https://kalmea.app/b/x' }).includes('https://kalmea.app/b/x'));
  // Kill switch off after the message went: her tap still counts, and nothing is sent back.
  const killed = await tap('confirm', { env: { ...LIVE, WA_AUTO_ENABLED: '' } });
  assert.ok(killed.handled && killed.reply === null);
  assert.equal(calls.length, 2); assert.equal(a.sent.length, 2);
});

await ok('security wiring: cron secret, signed session status, webhook signature first, a short internal token, no leaks', () => {
  const run = read('app/api/wa-auto/run/route.ts');
  assert.ok(/if \(!isAuthorizedCron\(request\)\) return cronUnauthorized\(\);/.test(run), 'the shared CRON_SECRET guard, as every cron');
  assert.ok(!/error: msg/.test(run) && run.includes("error: 'run aborted'"), 'no database text in the response');
  assert.ok(!/\.\.\.run\b/.test(run) && run.includes('const { queuedByTenant, ...counts } = run;'), 'no tenant ids in the response');
  const st = read('app/api/wa-auto/status/route.ts');
  assert.ok(st.indexOf('auth.getUser()') < st.indexOf('publicAutoStatus()') && st.includes('callerTenantId(session)'), 'signed-in, tenant from the session');
  assert.ok(st.includes("checkIpLimit(request, 'wa-auto-status')") && st.includes("checkTenantLimit(tenantId, 'wa-auto-status')"), 'rate-limited');
  assert.ok(!/searchParams|request\.json|tenant_id/.test(st), 'nothing from the request picks a tenant');
  assert.deepEqual(Object.keys(publicAutoStatus(LIVE)).sort(), ['available', 'leadHours', 'monthlyCap']);
  assert.ok(!JSON.stringify(publicAutoStatus(LIVE)).includes('tok'), 'no credential');
  const wh = read('app/api/wa-cloud/webhook/route.ts');
  const post = wh.slice(wh.indexOf('export async function POST'));
  assert.ok(post.indexOf("verifySignature(raw, request.headers.get('x-hub-signature-256'), waCloudAppSecret())") < post.indexOf('admin()'), 'Meta signature before any database');
  assert.ok(/timingSafeEqual/.test(read('lib/waCloud/webhook.ts')));
  assert.ok(wh.includes('signConfirm(appointmentId, action, Date.now() + INTERNAL_TOKEN_TTL_MS)') && wh.includes('const INTERNAL_TOKEN_TTL_MS = 2 * 60_000;'), 'a two-minute token');
  assert.ok(!/export (async )?function applyLinkAction/.test(wh), 'the minting function is not exported');
  assert.equal((wh.match(/applyLinkAction/g) || []).length, 2, 'defined once, used once (inside handleAutoButton)');
  assert.ok(!/console\.\w+\([^)]*token/i.test(wh + read('lib/waCloud/autoButtons.ts')), 'no token in a log line');
  assert.ok(wh.includes('wa-auto-button-id:${m.id}') && wh.includes('wa-auto-button:${m.from}') && wh.includes('wa-cloud-optout:${m.from}'), 'dedupe and rate limits');
  assert.ok(wh.includes("recordAutoOptOut(db, tenantId, m.from, 'reply')"), '"הסר" opts out only the verified sender');
  assert.ok(/\[A-Za-z0-9_\.-\]\{1,128\}/.test(wh) && wh.includes("'X-Content-Type-Options': 'nosniff'"), 'the GET challenge is not reflected freely');
});

// ── the shared gate (PR #53 security review): recipient ceiling, platform switch, her pause ──────────────────────
const tid = (i: number) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
const aid = (i: number) => `22222222-2222-4222-8222-2222222222${String(i).padStart(2, '0')}`;
const optedSettings = (ids: string[], extra: Row = {}) => ids.map((t) => ({ tenant_id: t, business_name: 'עסק ' + t.slice(-2), branding: {}, automations: { wa_auto_messages: true, ...extra } }));
const runDeps = (a: WaCloudAdapter, queued: any[] = []) => ({ queue: async (phone: string, text: string, opts: any) => { queued.push({ phone, text, opts }); }, confirmLinks, baseUrl: 'https://x', adapter: a, alert, isYomTov: noYomTov });

await ok('recipient ceiling: distinct bookings in distinct businesses to one number stop at 4 a day, then her manual queue', async () => {
  const { db, tables } = memDb();
  const a = stub();
  const outs = [];
  for (let i = 1; i <= 6; i++) {
    outs.push(await sendAutoMessage({ ...baseInput(db), tenantId: tid(i), appointmentId: aid(i), kind: 'booking_confirm', apptDate: '2026-11-20', adapter: a }));
  }
  assert.deepEqual(outs.map((o) => o.outcome), ['sent', 'sent', 'sent', 'sent', 'fallback', 'fallback']);
  assert.ok(outs[4].outcome === 'fallback' && outs[4].reason === 'recipient_capped');
  assert.equal(a.sent.length, 4, 'Meta was called four times, not six');
  const claims = Object.fromEntries(tables.wa_auto_claims.map((c: any) => [c.appointment_id, c.status]));
  assert.equal(claims[aid(5)], 'fallback'); assert.equal(claims[aid(6)], 'fallback');
  // A refusal is recorded, so the same message is not refused (and queued) again.
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), tenantId: tid(5), appointmentId: aid(5), kind: 'booking_confirm', adapter: a }), { outcome: 'duplicate' });
  // Another number is not affected.
  assert.equal((await sendAutoMessage({ ...baseInput(db), tenantId: tid(7), appointmentId: aid(7), phone: '0527654321', kind: 'booking_confirm', adapter: a })).outcome, 'sent');
  // The ceiling counts what sendWhatsApp counts too: GreenAPI booking confirmations to the same number, any business.
  const mixed = memDb({ whatsapp_messages: Array.from({ length: 4 }, (_, i) => ({ tenant_id: tid(20 + i), recipient_phone: '+972501234567', message_type: 'booking_confirm', status: 'sent', created_at: '2026-11-10T07:00:00.000Z' })) });
  const r = await sendAutoMessage({ ...baseInput(mixed.db), kind: 'booking_confirm', adapter: a });
  assert.ok(r.outcome === 'fallback' && r.reason === 'recipient_capped');
  // And the ceiling's env is the same one (WHATSAPP_PUBLIC_RECIPIENT_CAP).
  const one = memDb({ whatsapp_messages: [{ tenant_id: tid(30), recipient_phone: PHONE, message_type: 'booking_confirm', status: 'sent', created_at: '2026-11-10T07:00:00.000Z' }] });
  const r1 = await sendAutoMessage({ ...baseInput(one.db), kind: 'booking_confirm', env: { ...LIVE, WHATSAPP_PUBLIC_RECIPIENT_CAP: '1' }, adapter: a });
  assert.ok(r1.outcome === 'fallback' && r1.reason === 'recipient_capped');
});

await ok('recipient ceiling: hourly reminders across hourly windows count and are limited, and go to her queue', async () => {
  const earlier = Array.from({ length: 3 }, (_, i) => ({ tenant_id: tid(40 + i), recipient_phone: PHONE, message_type: 'booking_confirm', status: 'sent', created_at: '2026-11-10T09:00:00.000Z' }));
  const A = apptRow(aid(41), tid(1), { date: '2026-11-11', start_minute: 690 });              // due at 12:00
  const B = apptRow(aid(42), tid(2), { date: '2026-11-11', start_minute: 750, hour: 12 });    // due at 13:00
  const C = apptRow(aid(43), tid(3), { date: '2026-11-11', start_minute: 810, hour: 13 });    // due at 14:00
  let clockNow = NOW;
  const { db, tables } = memDb({ settings: optedSettings([tid(1), tid(2), tid(3)]), appointments: [A, B, C], whatsapp_messages: earlier }, { clock: () => clockNow });
  const a = stub();
  const queued: any[] = [];
  const r1 = await runAutoMessages({ db, env: LIVE, now: NOW, deps: runDeps(a, queued) });
  assert.equal(r1.sent, 1, 'hour 1: the 4th message of the day goes');
  clockNow = new Date(NOW.getTime() + 3600_000);
  const r2 = await runAutoMessages({ db, env: LIVE, now: clockNow, deps: runDeps(a, queued) });
  assert.equal(r2.sent, 0); assert.equal(r2.queued, 1, 'hour 2: the reminder counted, so the 5th waits in her queue');
  clockNow = new Date(NOW.getTime() + 2 * 3600_000);
  const r3 = await runAutoMessages({ db, env: LIVE, now: clockNow, deps: runDeps(a, queued) });
  assert.equal(r3.sent, 0); assert.equal(r3.queued, 1, 'hour 3: still limited');
  assert.equal(a.sent.length, 1);
  assert.ok(queued.every((q) => q.opts.forceManual === true && q.opts.type === 'reminder'), 'her manual queue, not another automatic channel');
  assert.equal(tables.wa_auto_claims.find((c: any) => c.appointment_id === aid(42))!.status, 'fallback');
  // Hour 4: the same reminders are not queued a second time.
  await runAutoMessages({ db, env: LIVE, now: new Date(NOW.getTime() + 3 * 3600_000), deps: runDeps(a, queued) });
  assert.equal(queued.length, 2);
  assert.ok(AUTO_RECIPIENT_TYPES.includes('reminder') && AUTO_RECIPIENT_TYPES.includes('booking_confirm'));
});

await ok('recipient ceiling and the business public-send ceiling also stop a deferred confirmation at 08:00', async () => {
  let clockNow = NIGHT;
  const appt = apptRow(APPT, T, { date: '2026-11-20', start_minute: 600 });
  const { db, tables } = memDb({ settings: settingsRows(), appointments: [appt] }, { clock: () => clockNow });
  const a = stub();
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), kind: 'booking_confirm', apptDate: appt.date, now: NIGHT, adapter: a }), { outcome: 'deferred' });
  // Overnight, four other businesses' confirmations reached the same number (the morning is inside the same 24 hours).
  for (let i = 0; i < 4; i++) tables.whatsapp_messages.push({ tenant_id: tid(50 + i), recipient_phone: PHONE, message_type: 'booking_confirm', status: 'sent', created_at: '2026-11-11T05:00:00.000Z' });
  clockNow = MORNING;
  const queued: any[] = [];
  const r = await runAutoMessages({ db, env: LIVE, now: MORNING, deps: runDeps(a, queued) });
  assert.equal(r.deferredSent, 0); assert.equal(a.sent.length, 0);
  assert.equal(queued.length, 1); assert.equal(queued[0].opts.forceManual, true);
  assert.equal(tables.wa_auto_claims[0].status, 'fallback');
  // The per-business public-send day (WHATSAPP_PUBLIC_DAILY_CAP) applies to the automatic confirmation too.
  const pub = memDb({ whatsapp_messages: [{ tenant_id: T, recipient_phone: '0529999999', message_type: 'booking_confirm', status: 'sent', created_at: '2026-11-10T08:00:00.000Z' }] });
  const pr = await sendAutoMessage({ ...baseInput(pub.db), kind: 'booking_confirm', env: { ...LIVE, WHATSAPP_PUBLIC_DAILY_CAP: '1' }, adapter: a });
  assert.ok(pr.outcome === 'fallback' && pr.reason === 'public_capped');
  assert.equal(a.sent.length, 0);
});

await ok('platform switch off or unreadable: no automatic send for a confirmation, a reminder or a deferred one; her queue instead', async () => {
  const a = stub();
  for (const variant of ['off', 'unreadable', 'no row'] as const) {
    const init: Record<string, Row[]> = { settings: settingsRows(), appointments: [apptRow(APPT, T)] };
    if (variant === 'off') init.platform_settings = [{ id: true, whatsapp_auto_utility_enabled: false }];
    if (variant === 'no row') init.platform_settings = [];
    const { db, tables } = memDb(init, { missing: variant === 'unreadable' ? ['platform_settings'] : [] });
    const c = await sendAutoMessage({ ...baseInput(db), appointmentId: APPT2, kind: 'booking_confirm', adapter: a });
    assert.ok(c.outcome === 'fallback' && c.reason === 'platform_manual', `${variant}: confirmation`);
    const queued: any[] = [];
    const r = await runAutoMessages({ db, env: LIVE, now: NOW, deps: runDeps(a, queued) });
    assert.equal(r.sent, 0); assert.equal(queued.length, 1, `${variant}: the reminder waits in her queue`);
    assert.equal(queued[0].opts.forceManual, true);
    assert.equal(tables.wa_auto_claims.find((x: any) => x.appointment_id === APPT)!.status, 'fallback');
  }
  // Deferred at night while the switch was on, switched off by the morning.
  let clockNow = NIGHT;
  const appt = apptRow(APPT, T, { date: '2026-11-20', start_minute: 600 });
  const d = memDb({ settings: settingsRows(), appointments: [appt] }, { clock: () => clockNow });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(d.db), kind: 'booking_confirm', apptDate: appt.date, now: NIGHT, adapter: a }), { outcome: 'deferred' });
  d.tables.platform_settings[0].whatsapp_auto_utility_enabled = false;
  invalidatePlatformSettingsCache();
  clockNow = MORNING;
  const queued: any[] = [];
  const r = await runAutoMessages({ db: d.db, env: LIVE, now: MORNING, deps: runDeps(a, queued) });
  assert.equal(r.deferredSent, 0); assert.equal(queued.length, 1); assert.equal(d.tables.wa_auto_claims[0].status, 'fallback');
  assert.equal(a.sent.length, 0, 'Meta was never called');
});

await ok('her pause: wa_auto_messages on + paused on means no automatic reminder, confirmation or deferred message', async () => {
  const PAUSED = { automations: { wa_auto_messages: true, paused: true } };
  assert.equal(automationsPaused(PAUSED), true);
  for (const junk of [null, {}, { automations: null }, { automations: { paused: 'true' } }, { automations: [true] }]) assert.equal(automationsPaused(junk as any), false, 'fails open');
  const a = stub();
  const { db, tables } = memDb({ settings: [{ tenant_id: T, business_name: 'סטודיו נועה', branding: {}, automations: PAUSED.automations }], appointments: [apptRow(APPT, T)] });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), settingsRow: PAUSED, adapter: a }), { outcome: 'paused' }, 'a reminder');
  assert.deepEqual(await sendAutoMessage({ ...baseInput(db), appointmentId: APPT2, kind: 'booking_confirm', settingsRow: PAUSED, adapter: a }), { outcome: 'paused' }, 'a confirmation');
  assert.equal(tables.wa_auto_claims.find((c: any) => c.appointment_id === APPT)!.status, 'skipped');
  // Read from her settings row when the caller does not hold it.
  const fresh = memDb({ settings: [{ tenant_id: T, automations: PAUSED.automations }] });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(fresh.db), settingsRow: undefined, adapter: a }), { outcome: 'paused' });
  // The hourly run: a paused business is not selected at all, and nothing is queued for its reminders either.
  const run = memDb({ settings: [{ tenant_id: T, business_name: 'x', branding: {}, automations: PAUSED.automations }], appointments: [apptRow(APPT, T)] });
  const queued: any[] = [];
  const r = await runAutoMessages({ db: run.db, env: LIVE, now: NOW, deps: runDeps(a, queued) });
  assert.equal(r.tenants, 0); assert.equal(r.sent, 0); assert.equal(queued.length, 0);
  // Deferred at night, paused by the morning: not sent automatically; her manual queue (the confirmation is still owed).
  let clockNow = NIGHT;
  const appt = apptRow(APPT, T, { date: '2026-11-20', start_minute: 600 });
  const d = memDb({ settings: settingsRows(), appointments: [appt] }, { clock: () => clockNow });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(d.db), kind: 'booking_confirm', apptDate: appt.date, now: NIGHT, adapter: a }), { outcome: 'deferred' });
  d.tables.settings[0].automations = { wa_auto_messages: true, paused: true };
  clockNow = MORNING;
  const dq: any[] = [];
  const dr = await runAutoMessages({ db: d.db, env: LIVE, now: MORNING, deps: runDeps(a, dq) });
  assert.equal(dr.deferredSent, 0); assert.equal(dq.length, 1); assert.equal(dq[0].opts.forceManual, true);
  // The gate itself refuses a deferred send for a paused business, whoever calls it.
  const g = memDb({ wa_auto_claims: [{ idempotency_key: idempotencyKey('live', 'booking_confirm', APPT), tenant_id: T, appointment_id: APPT, kind: 'booking_confirm', mode: 'live', status: 'claimed' }] });
  assert.deepEqual(await sendAutoMessage({ ...baseInput(g.db), kind: 'booking_confirm', settingsRow: PAUSED, fromDeferred: true, now: MORNING, adapter: a }), { outcome: 'paused' });
  assert.equal(g.tables.wa_auto_claims[0].status, 'skipped');
  assert.equal(a.sent.length, 0, 'Meta was never called');
});

await ok('the gate is in the one shared sender, before deferral and dispatch; callers map its refusals to her manual queue', async () => {
  const src = read('lib/waCloud/auto.ts');
  const body = src.slice(src.indexOf('export async function sendAutoMessage'));
  const gate = body.indexOf('await autoGate(db,');
  assert.ok(gate > 0 && gate < body.indexOf("status: allowed ? 'claimed' : 'deferred'") && gate < body.indexOf('adapter.sendTemplate('), 'before the deferral claim and before Meta');
  assert.ok(src.includes("from '../outboundCap.js'") && src.includes("from '../platformSettings.js'") && src.includes("from '../automationPause.js'"), 'reused, not reimplemented');
  assert.equal((read('lib/waCloud/autoRun.ts').match(/sendAutoMessage\(\{/g) || []).length, 2, 'the hourly run sends only through it');
  assert.ok(!/adapter\.sendTemplate|sendTemplate\(/.test(read('lib/waCloud/autoRun.ts') + read('lib/bookingNotify.js')), 'no caller dispatches on its own');
  const bn = read('lib/bookingNotify.js');
  assert.ok(bn.includes('if (out.outcome === "fallback" || out.outcome === "paused") return { handled: false, queue: true };'));
  assert.ok(/her manual queue instead[\s\S]{0,120}return \{ handled: false, queue: true \};/.test(bn), 'an exception is her queue, not the unguarded path');
  assert.ok(read('lib/reminders/dailyReminders.js').includes('automationsPaused(settingsByTenant[t])') && read('lib/reminders/smartReminders.js').includes('automationsPaused(settingsByTenant[tenantId])'), 'one pause helper');
  // Direct: a gate with nothing to refuse passes.
  const { db } = memDb();
  assert.equal(await autoGate(db, { tenantId: T, kind: 'reminder', digits: DIGITS, settingsRow: ON, mode: 'live', now: NOW, env: LIVE }), null);
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

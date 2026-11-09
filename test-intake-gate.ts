// test-intake-gate.ts
//
// The pre-visit intake gate (lib/intakeGate.ts, lib/intakeQueue.js): off by default, a form link on the booking
// confirmation, "send the form" in HER manual queue (never sent by the system), and calendar badges only on gated services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveIntake, intakeToStore, intakeColumnReady, intakeBadges, intakeFormMessage, formLink, cleanFormType,
  intakeFormChoices, INTAKE_MESSAGE_TYPE, INTAKE_CONFIRM_HE, patchTestConfirmHe, intakeFromBusinessHe,
} from './lib/intakeGate.ts';
import { ensureIntakeForm, queueIntakeMessage, hadEarlierVisit } from './lib/intakeQueue.js';

let passed = 0, failed = 0;
const pending: Array<Promise<void>> = [];
const ok = (name: string, fn: () => void | Promise<void>) => {
  pending.push(Promise.resolve().then(fn).then(() => { passed++; }, (e) => { failed++; console.error('FAIL', name, '\n ', e instanceof Error ? e.message : e); }));
};
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

/** A tiny supabase-js stand-in: tables of rows, eq / in / lt / neq / ilike filters, insert, select, single. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const log: Array<{ table: string; op: string; row?: unknown }> = [];
  let nextId = 1;
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let op = 'select';
    let row: Record<string, unknown> | null = null;
    const q: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: () => q,
      insert: (r: Record<string, unknown>) => { op = 'insert'; row = { id: `new-${nextId++}`, ...r }; return q; },
      eq: (k: string, v: unknown) => { filters.push((r) => String(r[k]) === String(v)); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => String(r[k]) !== String(v)); return q; },
      lt: (k: string, v: unknown) => { filters.push((r) => String(r[k]) < String(v)); return q; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.map(String).includes(String(r[k]))); return q; },
      ilike: (k: string, pat: string) => { const needle = pat.replace(/%/g, ''); filters.push((r) => String(r[k] || '').includes(needle)); return q; },
      limit: () => q,
      result() {
        if (op === 'insert') { (tables[table] ||= []).push(row!); log.push({ table, op, row }); return { data: row, error: null }; }
        return { data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null };
      },
      single: () => Promise.resolve(q.result()),
      maybeSingle: () => Promise.resolve(q.result()),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(q.result()).then(res, rej),
    };
    return q;
  };
  return { from, log, tables };
}

ok('off by default: no column, null, garbage, or a false flag is no gate', () => {
  assert.equal(resolveIntake({}), null);
  assert.equal(resolveIntake({ intake: null }), null);
  assert.equal(resolveIntake({ intake: 'nonsense' }), null);
  assert.equal(resolveIntake({ intake: { form: 'yes', patch_test: 1 } }), null, 'only a literal true');
  assert.equal(resolveIntake(null), null);
  assert.deepEqual(resolveIntake({ intake: { form: true } }), { form: true, formType: 'general', patchTest: false });
  assert.deepEqual(resolveIntake({ intake: { form: true, form_type: 'laser', patch_test: true } }), { form: true, formType: 'laser', patchTest: true });
  assert.equal(cleanFormType('../etc'), 'general', 'an unknown template falls back');
});

ok('stored shape: both off stores nothing', () => {
  assert.equal(intakeToStore({ form: false, patchTest: false }), null);
  assert.deepEqual(intakeToStore({ form: true, formType: 'peel', patchTest: false }), { form: true, form_type: 'peel', patch_test: false });
  assert.ok(intakeFormChoices().some((c) => c.key === 'general' && c.title));
});

ok('the setting is shown only once the column exists', () => {
  assert.equal(intakeColumnReady([]), false);
  assert.equal(intakeColumnReady([{ name: 'a', price: 1 }]), false);
  assert.equal(intakeColumnReady([{ name: 'a', intake: null }]), true);
  const toggle = read('./app/ServiceIntakeToggle.jsx');
  assert.ok(toggle.includes('if (!ready) return null;'), 'hidden, not disabled, before the migration');
  assert.ok(!/אוטומטית|יישלח אוטומטית/.test(toggle), 'no "sent automatically" promise');
});

ok('badges: nothing without a gate; form missing / done; patch test only for a first visit', () => {
  assert.deepEqual(intakeBadges({ intake: null, signedFormTypes: [], firstVisit: true }), []);
  const gate = { form: true, formType: 'general', patchTest: true };
  assert.deepEqual(intakeBadges({ intake: gate, signedFormTypes: [], firstVisit: true }).map((b) => b.label), ['חסר טופס', 'בדיקת רגישות נדרשת']);
  assert.deepEqual(intakeBadges({ intake: gate, signedFormTypes: ['general'], firstVisit: false }).map((b) => b.label), ['טופס מולא']);
  assert.deepEqual(intakeBadges({ intake: gate, signedFormTypes: ['laser'], firstVisit: false }).map((b) => b.label), ['חסר טופס'], 'a different form does not count');
  assert.deepEqual(intakeBadges({ intake: { form: false, formType: 'general', patchTest: true }, signedFormTypes: [], firstVisit: false }), []);
});

ok('message: her voice, the link, no em dash, no automatic promise', () => {
  const m = intakeFormMessage({ name: 'רונית כהן', businessName: 'סטודיו רונה', service: 'פילינג', when: 'ביום שלישי, 10 בנובמבר', url: formLink('https://kalmea.app/', 'f-1') });
  assert.match(m, /^היי רונית 🌸/);
  assert.ok(m.includes('https://kalmea.app/form?id=f-1'));
  assert.ok(m.includes('לקראת הפילינג ביום שלישי, 10 בנובמבר'));
  assert.match(patchTestConfirmHe('רונה'), /^אם זה הטיפול הראשון שלך/, 'conditional: the page does not know her history');
  assert.match(intakeFromBusinessHe('רונה'), /אם עוד לא מילאת אותו, רונה תשלח לך קישור/);
  for (const t of [m, INTAKE_CONFIRM_HE, patchTestConfirmHe('רונה'), intakeFromBusinessHe('רונה')]) {
    assert.ok(!t.includes('—'), 'no em dash');
    assert.ok(!/אוטומטית/.test(t));
  }
});

ok('the queue type is never a utility type: it always waits for her', () => {
  const wa = read('./lib/whatsapp.js');
  const line = wa.split('\n').find((l) => l.startsWith('const UTILITY_TYPES'))!;
  assert.ok(line && !line.includes(INTAKE_MESSAGE_TYPE), 'intake_form is not auto-sent');
});

ok('ensureIntakeForm: signed means nothing to do, pending is reused, otherwise one is created for this tenant', async () => {
  const db = fakeDb({ forms: [
    { id: 'f-signed', tenant_id: 'T', client_id: 'C1', form_type: 'general', status: 'signed' },
    { id: 'f-open', tenant_id: 'T', client_id: 'C2', form_type: 'general', status: 'pending' },
    { id: 'f-other', tenant_id: 'OTHER', client_id: 'C3', form_type: 'general', status: 'signed' },
  ] });
  assert.deepEqual(await ensureIntakeForm({ db, tenantId: 'T', clientId: 'C1', clientName: 'א', formType: 'general' }), { state: 'signed' });
  assert.deepEqual(await ensureIntakeForm({ db, tenantId: 'T', clientId: 'C2', clientName: 'ב', formType: 'general' }), { state: 'pending', formId: 'f-open', created: false });
  const made = await ensureIntakeForm({ db, tenantId: 'T', clientId: 'C3', clientName: 'ג', formType: 'general' });
  assert.equal(made.state, 'pending', 'another tenant\'s signed form does not count');
  assert.equal((made as { created: boolean }).created, true);
  const ins = db.log.find((l) => l.op === 'insert')!.row as Record<string, unknown>;
  assert.equal(ins.tenant_id, 'T');
  assert.equal(ins.status, 'pending');
  assert.equal((await ensureIntakeForm({ db, tenantId: 'T', clientId: null, clientName: '', formType: 'general' })).state, 'error');
});

ok('queueIntakeMessage: queued once per form, as intake_form, never twice', async () => {
  const db = fakeDb({ whatsapp_messages: [] });
  const sent: Array<{ phone: string; msg: string; opts: Record<string, unknown> }> = [];
  const send = async (phone: string, msg: string, opts: Record<string, unknown>) => {
    sent.push({ phone, msg, opts });
    db.tables.whatsapp_messages.push({ tenant_id: opts.tenantId, message_type: opts.type, message_body: msg, status: 'pending_manual' });
    return { ok: false, queued: true };
  };
  const args = { db, send, tenantId: 'T', phone: '972501234567', name: 'רונית', businessName: 'רונה', service: 'פילינג', when: 'מחר', formId: 'f-9', baseUrl: 'https://x' };
  assert.equal(await queueIntakeMessage(args), 'queued');
  assert.equal(await queueIntakeMessage(args), 'already');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].opts.type, 'intake_form');
  assert.ok(sent[0].msg.includes('https://x/form?id=f-9'));
  assert.equal(await queueIntakeMessage({ ...args, phone: '' }), 'no_phone');
  const demo = await queueIntakeMessage({ ...args, formId: 'f-10', send: async () => ({ ok: false, demoBlocked: true }) });
  assert.equal(demo, 'blocked');
});

ok('hadEarlierVisit: any earlier non-cancelled appointment of hers', async () => {
  const db = fakeDb({ appointments: [
    { id: 'a1', tenant_id: 'T', client_id: 'C', date: '2026-10-01', confirmation_status: 'cancelled' },
    { id: 'a2', tenant_id: 'T', client_id: 'C', date: '2026-11-20', confirmation_status: 'confirmed' },
  ] });
  assert.equal(await hadEarlierVisit({ db, tenantId: 'T', clientId: 'C', beforeDate: '2026-11-20', excludeId: 'a2' }), false);
  db.tables.appointments.push({ id: 'a0', tenant_id: 'T', client_id: 'C', date: '2026-09-01', confirmation_status: 'completed' });
  assert.equal(await hadEarlierVisit({ db, tenantId: 'T', clientId: 'C', beforeDate: '2026-11-20', excludeId: 'a2' }), true);
});

ok('wiring: booking route, booking page, calendar card, services editor', () => {
  const route = read('./app/api/book-appointment/route.js');
  assert.ok(route.includes('const intake = resolveIntake(svcRow);'), 'only a gated service');
  assert.ok(route.indexOf('const intake = resolveIntake(svcRow);') > route.indexOf('writeWithApptBuffer({'), 'after the booking is saved');
  assert.ok(route.includes('if (!heldForDeposit) {'), 'a held deposit is not queued');
  assert.ok(route.includes('intake: intakeOut,'));
  // The public answer never depends on whose number was typed (security review, PR #52).
  assert.ok(route.includes('if (createdClient && f.created === true) formPath ='), 'the link only for a card and form this booking created');
  assert.ok(route.includes('const formFromBusiness = intake.form && !formPath;'));
  assert.ok(route.includes('const patchTest = intake.patchTest === true;'), 'patch line not computed from her history');
  assert.ok(!route.includes('hadEarlierVisit('), 'no history lookup on the public route');
  const page = read('./app/BookingPage.jsx');
  assert.ok(page.includes('data-testid="intake-form-link"'));
  assert.ok(page.includes('data-testid="intake-from-business"'));
  assert.ok(page.includes('result.intake.formUrl.startsWith("/form?id=")'), 'same-site link only');
  assert.ok(page.includes('from "@/lib/intakeCopy"') && !page.includes('from "@/lib/intakeGate"'), 'the public page does not bundle every form template');
  const app = read('./app/beautyos.jsx');
  assert.ok(app.includes('<IntakeBadge appointmentId={appt.id}/>') && app.includes('<IntakeBadge appointmentId={a.id}/>'));
  assert.ok(app.includes('<ServiceIntakeToggle ready={intakeColumnReady(services)}'));
  assert.ok(app.includes('"rebook_days", "intake"];'), 'saved with the service, an optional column');
  assert.ok(app.includes('<IntakeQueueSync onQueued={refreshWaQueue}/>'));
  const api = read('./app/api/intake/route.ts');
  assert.ok(api.includes("return NextResponse.json({ success: true, ready: false, items: [] });"), 'before the migration: nothing');
  assert.ok(api.includes(".filter((i) => i.badges.length > 0)"), 'badges only on gated services');
  assert.ok(api.includes("if (isDemoTenantId(c.tenantId))"), 'demo sends nothing');
  const migration = read('./supabase/migrations/add_reschedule_intake_2026-11-09.sql');
  assert.ok(migration.includes('add column if not exists intake jsonb'));
  assert.ok(migration.includes('add column if not exists reschedule_count smallint not null default 0'));
});

await Promise.all(pending);
console.log(`test-intake-gate: passed ${passed} failed ${failed}`);
if (failed) process.exit(1);

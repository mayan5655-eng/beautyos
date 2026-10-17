// Client data export and erasure (lib/clientData.ts + the two routes): scoped to one business, honest about what it did, and the
// accounting records stay without her identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportClientData, exportToCsv, eraseClientData, phoneVariants, ANONYMOUS_NAME_HE } from './lib/clientData.ts';

type Row = Record<string, unknown>;
// A small in-memory database with just the calls clientData makes.
function fakeDb(tables: Record<string, Row[]>, opts: { missing?: string[]; failDelete?: string[]; files?: Record<string, string[]> } = {}) {
  const removed: string[] = [];
  const db = {
    tables,
    removed,
    from(table: string) {
      const missing = opts.missing?.includes(table);
      const filters: Array<(r: Row) => boolean> = [];
      let mode: 'select' | 'delete' | 'update' = 'select';
      let patch: Row = {};
      const api: any = {
        select() { return api; },
        delete() { mode = 'delete'; return api; },
        update(p: Row) { mode = 'update'; patch = p; return api; },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api; },
        in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return api; },
        async maybeSingle() { const r = await run(); return { data: (r.data as Row[])?.[0] ?? null, error: r.error }; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      async function run(): Promise<{ data: Row[] | null; error: { code: string } | null }> {
        if (missing) return { data: null, error: { code: '42P01' } };
        const all = tables[table] || [];
        const hit = all.filter((r) => filters.every((f) => f(r)));
        if (mode === 'delete') {
          if (opts.failDelete?.includes(table)) return { data: null, error: { code: '23503' } };
          tables[table] = all.filter((r) => !hit.includes(r));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        if (mode === 'update') { for (const r of hit) Object.assign(r, patch); return { data: hit.map((r) => ({ id: r.id })), error: null }; }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      return api;
    },
    storage: {
      from: () => ({
        async list(folder: string) { return { data: (opts.files?.[folder] || []).map((name) => ({ name })), error: null }; },
        async remove(paths: string[]) { removed.push(...paths); return { error: null }; },
      }),
    },
  };
  return db;
}

const T = 't1', OTHER = 't2';
const seed = () => ({
  clients: [
    { id: 'c1', tenant_id: T, name: 'דנה', phone: '0501234567', notes: 'אלרגית ללק' },
    { id: 'c2', tenant_id: T, name: 'רחל', phone: '0507654321' },
    { id: 'c1', tenant_id: OTHER, name: 'אחרת', phone: '0521111111' }, // same id in another business: must never be touched
  ],
  appointments: [
    { id: 'a1', tenant_id: T, client_id: 'c1', name: 'דנה', client_phone: '0501234567', note: 'רגישה', date: '2026-10-01' },
    { id: 'a2', tenant_id: T, client_id: 'c2', name: 'רחל', client_phone: '0507654321', date: '2026-10-02' },
    { id: 'a3', tenant_id: OTHER, client_id: 'c1', name: 'אחרת', date: '2026-10-03' },
  ],
  receipts: [
    { id: 'r1', tenant_id: T, client_id: 'c1', client_name: 'דנה', amount: 250, created_at: '2026-10-01' },
    { id: 'r2', tenant_id: T, client_id: 'c2', client_name: 'רחל', amount: 100, created_at: '2026-10-02' },
  ],
  receipt_voids: [{ id: 'v1', tenant_id: T, receipt_id: 'r1', reason: 'טעות' }],
  forms: [
    { id: 'f1', tenant_id: T, client_id: 'c1', form_type: 'general', answers: { x: 1 }, sign_token: 'SECRET-TOKEN' },
    { id: 'f2', tenant_id: T, client_id: 'c2', form_type: 'general' },
  ],
  skin_scans: [{ id: 's1', tenant_id: T, client_id: 'c1', score: 80 }],
  client_photos: [{ id: 'p1', tenant_id: T, client_id: 'c1', path: `${T}/clients/c1/a.jpg` }],
  packages: [{ id: 'k1', tenant_id: T, client_id: 'c1', client_name: 'דנה', total_sessions: 5 }],
  reviews: [], treatment_results: [], auto_reminders_log: [{ id: 'l1', tenant_id: T, client_id: 'c1' }],
  whatsapp_messages: [
    { id: 'm1', tenant_id: T, phone: '972501234567', body: 'שלום' },
    { id: 'm2', tenant_id: T, phone: '972507654321', body: 'היי רחל' },
    { id: 'm3', tenant_id: OTHER, phone: '972501234567', body: 'אצל עסק אחר' },
  ],
  waitlist: [{ id: 'w1', tenant_id: T, phone: '0501234567', client_name: 'דנה' }],
}) as Record<string, Row[]>;

// phone shapes
assert.deepEqual(phoneVariants('050-123-4567').sort(), ['+972501234567', '0501234567', '050-123-4567', '972501234567'].sort());
assert.deepEqual(phoneVariants('abc'), []);

// ── export ──
{
  const db = fakeDb(seed());
  const r = await exportClientData(db as never, T, 'c1');
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal((r.data.client as Row).name, 'דנה');
    assert.equal(r.data.sections.appointments.length, 1, 'only her appointment, not the other client\'s and not the other business\'s');
    assert.equal(r.data.sections.payments.length, 1);
    assert.equal(r.data.sections.payment_cancellations.length, 1, 'a voided payment of hers is included');
    assert.equal(r.data.sections.whatsapp_messages.length, 1, 'her messages (matched by phone) but not another business\'s message to the same number');
    assert.equal(r.data.sections.whatsapp_messages[0].body, 'שלום');
    assert.equal(r.data.sections.waitlist.length, 1);
    assert.equal(r.data.sections.forms.length, 1);
    assert.ok(!('sign_token' in r.data.sections.forms[0]), 'secret-like fields are never exported');
    assert.ok(!JSON.stringify(r.data).includes('SECRET-TOKEN'));
    assert.ok(!JSON.stringify(r.data).includes('אחרת'), 'nothing from another business');
    const csv = exportToCsv(r.data);
    assert.ok(csv.startsWith('﻿'), 'Excel reads Hebrew correctly');
    assert.ok(csv.includes('תורים (1)') && csv.includes('תשלומים (1)') && csv.includes('250'));
  }
  const missing = await exportClientData(db as never, T, 'nope');
  assert.ok(!missing.ok && missing.status === 404);
  const wrongBusiness = await exportClientData(db as never, 't3', 'c1');
  assert.ok(!wrongBusiness.ok && wrongBusiness.status === 404, 'a business cannot read a client that is not hers');
}
// formulas in a name are neutralised in the CSV
{
  const db = fakeDb({ clients: [{ id: 'c9', tenant_id: T, name: '=HYPERLINK("http://x")', phone: '' }] });
  const r = await exportClientData(db as never, T, 'c9');
  assert.ok(r.ok && exportToCsv(r.data).includes(`"'=HYPERLINK(""http://x"")"`));
}

// ── erase ──
{
  const data = seed();
  const db = fakeDb(data, { files: { [`${T}/clients/c1`]: ['a.jpg', 'b.jpg'] } });
  const r = await eraseClientData(db as never, T, 'c1');
  assert.ok(r.ok, JSON.stringify(r.steps));
  assert.ok(!data.clients.some((c) => c.id === 'c1' && c.tenant_id === T), 'her card is gone');
  assert.ok(data.clients.some((c) => c.id === 'c1' && c.tenant_id === OTHER), 'the other business\'s client with the same id is untouched');
  assert.ok(data.clients.some((c) => c.id === 'c2'), 'other clients untouched');
  assert.equal(data.forms.filter((f) => f.client_id === 'c1').length, 0);
  assert.equal(data.forms.filter((f) => f.client_id === 'c2').length, 1);
  assert.equal(data.skin_scans.length, 0);
  assert.equal(data.client_photos.length, 0);
  assert.equal(data.auto_reminders_log.length, 0);
  assert.deepEqual(data.whatsapp_messages.map((m) => m.id).sort(), ['m2', 'm3'], 'her messages are gone; another client\'s and another business\'s stay');
  assert.equal(data.waitlist.length, 0);
  assert.deepEqual(db.removed.sort(), [`${T}/clients/c1/a.jpg`, `${T}/clients/c1/b.jpg`], 'her files only, from her own folder');
  // the books stay, without her
  const a1 = data.appointments.find((a) => a.id === 'a1')!;
  assert.equal(a1.name, ANONYMOUS_NAME_HE); assert.equal(a1.client_phone, null); assert.equal(a1.note, null); assert.equal(a1.client_id, null); assert.equal(a1.date, '2026-10-01');
  const r1 = data.receipts.find((x) => x.id === 'r1')!;
  assert.equal(r1.amount, 250, 'the amount is kept'); assert.equal(r1.client_name, ANONYMOUS_NAME_HE); assert.equal(r1.client_id, null);
  assert.equal(data.receipts.find((x) => x.id === 'r2')!.client_name, 'רחל');
  assert.equal(data.packages[0].client_name, ANONYMOUS_NAME_HE);
  assert.equal(data.appointments.find((a) => a.id === 'a3')!.name, 'אחרת', 'another business\'s appointment untouched');
  // doing it again is harmless and honest
  const again = await eraseClientData(db as never, T, 'c1');
  assert.ok(!again.ok && again.error === 'not found');
}
// a step that fails keeps the card, so it can be run again
{
  const data = seed();
  const r = await eraseClientData(fakeDb(data, { failDelete: ['forms'] }) as never, T, 'c1');
  assert.ok(!r.ok);
  assert.ok(data.clients.some((c) => c.id === 'c1' && c.tenant_id === T), 'the card is kept when a step failed');
  assert.ok(r.steps.some((s) => s.table === 'forms' && s.action === 'failed'));
}
// a table this install does not have is skipped, not a failure
{
  const data = seed();
  const r = await eraseClientData(fakeDb(data, { missing: ['treatment_results', 'packages'] }) as never, T, 'c1');
  assert.ok(r.ok);
  assert.ok(r.steps.filter((s) => s.action === 'skipped').length >= 2);
}
// unknown client: nothing changes
{
  const data = seed(); const before = JSON.stringify(data);
  const r = await eraseClientData(fakeDb(data) as never, T, 'zzz');
  assert.ok(!r.ok && JSON.stringify(data) === before);
}

// ── the routes ──
const exp = fs.readFileSync('app/api/clients/export/route.ts', 'utf8');
const era = fs.readFileSync('app/api/clients/erase/route.ts', 'utf8');
for (const [name, src] of [['export', exp], ['erase', era]] as const) {
  assert.ok(src.includes("rpc('get_user_tenant_id')"), `${name}: the business comes from the session`);
  assert.ok(!/body\??\.(tenantId|tenant_id)/.test(src), `${name}: never from the request body`);
  assert.ok(src.includes('export async function POST') && !/export async function GET/.test(src), `${name}: POST only`);
  assert.ok(src.includes('checkTenantLimit'), `${name}: rate limited`);
}
assert.ok(era.includes('requireActiveTenant') && era.includes('isDemoTenantId') && era.includes('confirmName'), 'erase: plan guard, no demo, typed confirmation');
assert.ok(!exp.includes('requireActiveTenant'), 'export is a read, so it stays open for a business on hold');
assert.ok(fs.readFileSync('app/beautyos.jsx', 'utf8').includes('<ClientPrivacyPanel'), 'the client card offers both');

console.log('client data: ok');

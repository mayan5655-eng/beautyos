// Client data export and erasure (lib/clientData.ts + the two routes): scoped to one business, honest about what it did, and the
// accounting records stay without her identity. The fake database uses the REAL column names (whatsapp_messages.recipient_phone, not
// `phone`): a fake with the wrong column once let an erase that did nothing pass these tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportClientData, exportToCsv, eraseClientData, phoneVariants, isTableMissing, isColumnMissing, ANONYMOUS_NAME_HE } from './lib/clientData.ts';

type Row = Record<string, unknown>;
// Columns each table really has; a query on any other column answers 42703 like Postgres.
const COLUMNS: Record<string, string[]> = {
  clients: ['id', 'tenant_id', 'name', 'phone', 'notes', 'allergies'],
  appointments: ['id', 'tenant_id', 'client_id', 'name', 'client_phone', 'note', 'date'],
  receipts: ['id', 'tenant_id', 'client_id', 'client_name', 'amount', 'note', 'created_at'],
  receipt_voids: ['id', 'tenant_id', 'receipt_id', 'reason'],
  forms: ['id', 'tenant_id', 'client_id', 'form_type', 'answers', 'sign_token'],
  skin_scans: ['id', 'tenant_id', 'client_id', 'score'],
  client_photos: ['id', 'tenant_id', 'client_id', 'path'],
  packages: ['id', 'tenant_id', 'client_id', 'client_name', 'total_sessions'],
  reviews: ['id', 'tenant_id', 'client_id'],
  auto_reminders_log: ['id', 'tenant_id', 'client_id'],
  leads: ['id', 'tenant_id', 'client_id', 'name', 'phone', 'email'],
  slot_offers: ['id', 'tenant_id', 'client_id', 'phone'],
  owner_notifications: ['id', 'tenant_id', 'appointment_id', 'body'],
  whatsapp_messages: ['id', 'tenant_id', 'recipient_phone', 'recipient_name', 'message_body'],
  waitlist: ['id', 'tenant_id', 'phone', 'client_name'],
  grow_payments: ['id', 'tenant_id', 'client_id', 'client_name'],
};
function fakeDb(tables: Record<string, Row[]>, opts: { missingTables?: string[]; failDelete?: string[]; files?: Record<string, Array<{ name: string; id: string | null }>>; wrongColumn?: Record<string, string> } = {}) {
  const removed: string[] = [];
  const db = {
    tables, removed,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const cols: string[] = [];
      let mode: 'select' | 'delete' | 'update' = 'select';
      let patch: Row = {};
      const use = (c: string) => { cols.push(c); };
      const api: any = {
        select() { return api; },
        delete() { mode = 'delete'; return api; },
        update(p: Row) { mode = 'update'; patch = p; Object.keys(p).forEach(use); return api; },
        eq(c: string, v: unknown) { use(c); filters.push((r) => r[c] === v); return api; },
        neq(c: string, v: unknown) { use(c); filters.push((r) => r[c] !== v); return api; },
        is(c: string, v: unknown) { use(c); filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return api; },
        in(c: string, vs: unknown[]) { use(c); filters.push((r) => vs.includes(r[c])); return api; },
        or(expr: string) {
          // "message_body.ilike.%050...%,message_body.ilike.%+972...%"
          const parts = expr.split(',').map((p) => p.match(/^(\w+)\.ilike\.%(.*)%$/)).filter(Boolean) as RegExpMatchArray[];
          parts.forEach((m) => use(m[1]));
          filters.push((r) => parts.some((m) => String(r[m[1]] ?? '').includes(m[2])));
          return api;
        },
        async maybeSingle() { const r = await run(); return { data: (r.data as Row[])?.[0] ?? null, error: r.error }; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
      };
      async function run(): Promise<{ data: Row[] | null; error: { code: string; message?: string } | null }> {
        if (opts.missingTables?.includes(table)) return { data: null, error: { code: '42P01' } };
        const known = COLUMNS[table] || [];
        if (opts.wrongColumn?.[table]) cols.push(opts.wrongColumn[table]);
        const bad = cols.find((c) => !known.includes(c));
        if (bad) return { data: null, error: { code: '42703', message: `column ${bad} does not exist` } };
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
        async list(folder: string, o: { limit: number; offset: number }) { const all = opts.files?.[folder] || []; return { data: all.slice(o.offset, o.offset + o.limit), error: null }; },
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
    { id: 'a4', tenant_id: T, client_id: null, name: 'דנה', client_phone: '050-123-4567', date: '2026-09-01' }, // an old online booking with no link to her card
  ],
  receipts: [
    { id: 'r1', tenant_id: T, client_id: 'c1', client_name: 'דנה', amount: 250, note: 'שולם במזומן, דנה', created_at: '2026-10-01' },
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
  reviews: [], auto_reminders_log: [{ id: 'l1', tenant_id: T, client_id: 'c1' }],
  leads: [
    { id: 'ld1', tenant_id: T, client_id: 'c1', name: 'דנה', phone: '0501234567', email: 'dana@example.com' },
    { id: 'ld2', tenant_id: T, client_id: null, name: 'דנה (פנייה ישנה)', phone: '972501234567' },
    { id: 'ld3', tenant_id: T, client_id: null, name: 'אחרת', phone: '0529999999' },
  ],
  slot_offers: [{ id: 'so1', tenant_id: T, client_id: 'c1', phone: '0501234567' }],
  owner_notifications: [
    { id: 'n1', tenant_id: T, appointment_id: 'a1', body: 'דנה · 0501234567' },
    { id: 'n2', tenant_id: T, appointment_id: 'a2', body: 'רחל' },
  ],
  whatsapp_messages: [
    { id: 'm1', tenant_id: T, recipient_phone: '972501234567', recipient_name: 'דנה', message_body: 'שלום דנה' },
    { id: 'm2', tenant_id: T, recipient_phone: '972507654321', recipient_name: 'רחל', message_body: 'היי רחל' },
    { id: 'm3', tenant_id: OTHER, recipient_phone: '972501234567', message_body: 'אצל עסק אחר' },
    { id: 'm4', tenant_id: T, recipient_phone: '972500000000', recipient_name: 'הבעלים', message_body: 'תור חדש · דנה · 0501234567' }, // the owner's copy: addressed to HER
  ],
  waitlist: [{ id: 'w1', tenant_id: T, phone: '0501234567', client_name: 'דנה' }],
  grow_payments: [{ id: 'g1', tenant_id: T, client_id: 'c1', client_name: 'דנה' }],
}) as Record<string, Row[]>;

// phone shapes and error classification
assert.deepEqual(phoneVariants('050-123-4567').sort(), ['+972501234567', '0501234567', '050-123-4567', '050-1234567', '972501234567'].sort());
assert.deepEqual(phoneVariants('abc'), []);
assert.ok(phoneVariants('0501234567').includes('050-1234567'), 'the dashed form the old bookings stored');
assert.ok(isTableMissing({ code: '42P01' }) && isTableMissing({ code: 'PGRST205' }) && !isTableMissing({ code: '42703' }), 'only a missing TABLE is skippable');
assert.ok(isColumnMissing({ code: '42703' }) && isColumnMissing({ code: 'PGRST204' }) && !isColumnMissing({ code: '42P01' }), 'a missing COLUMN is its own, serious, case');

// ── export ──
{
  const db = fakeDb(seed());
  const r = await exportClientData(db as never, T, 'c1');
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal((r.data.client as Row).name, 'דנה');
    assert.equal(r.data.sections.appointments.length, 1);
    assert.equal(r.data.sections.payments.length, 1);
    assert.equal(r.data.sections.payment_cancellations.length, 1);
    assert.equal(r.data.sections.whatsapp_messages.length, 1, 'her messages (matched on recipient_phone), not another business\'s message to the same number');
    assert.equal(r.data.sections.whatsapp_messages[0].message_body, 'שלום דנה');
    assert.equal(r.data.sections.messages_to_owner_about_her.length, 1, 'the owner\'s copies that quote her phone are included');
    assert.equal(r.data.sections.owner_notifications.length, 1, 'the owner notification about her booking');
    assert.equal(r.data.sections.leads.length, 1, 'her converted lead');
    assert.equal(r.data.sections.leads_by_phone.length, 2, 'leads by phone, in any shape');
    assert.equal(r.data.sections.slot_offers.length, 1);
    assert.equal(r.data.sections.waitlist.length, 1);
    assert.ok(!('sign_token' in r.data.sections.forms[0]) && !JSON.stringify(r.data).includes('SECRET-TOKEN'), 'secret-like fields are never exported');
    assert.ok(!JSON.stringify(r.data).includes('אחרת'), 'nothing from another business');
    assert.ok(r.data.notes.some((n) => n.startsWith('treatment_results')), 'it says plainly that published results are not included');
    const csv = exportToCsv(r.data);
    assert.ok(csv.startsWith('﻿') && csv.includes('תורים (1)') && csv.includes('תשלומים (1)') && csv.includes('250'));
  }
  const missing = await exportClientData(db as never, T, 'nope');
  assert.ok(!missing.ok && missing.status === 404);
  const wrongBusiness = await exportClientData(db as never, 't3', 'c1');
  assert.ok(!wrongBusiness.ok && wrongBusiness.status === 404, 'a business cannot read a client that is not hers');
}
{
  const db = fakeDb({ clients: [{ id: 'c9', tenant_id: T, name: '=HYPERLINK("http://x")', phone: '' }] });
  const r = await exportClientData(db as never, T, 'c9');
  assert.ok(r.ok && exportToCsv(r.data).includes(`"'=HYPERLINK(""http://x"")"`), 'formulas in a name are neutralised in the CSV');
}

// ── erase ──
{
  const data = seed();
  const files = { [`${T}/clients/c1`]: [{ name: 'a.jpg', id: 'x1' }, { name: 'scans', id: null }], [`${T}/clients/c1/scans`]: [{ name: 's1.jpg', id: 'x2' }] };
  const db = fakeDb(data, { files });
  const r = await eraseClientData(db as never, T, 'c1');
  assert.ok(r.ok, JSON.stringify(r.steps));
  assert.ok(!data.clients.some((c) => c.id === 'c1' && c.tenant_id === T), 'her card is gone');
  assert.ok(data.clients.some((c) => c.id === 'c1' && c.tenant_id === OTHER), 'the other business\'s client with the same id is untouched');
  assert.ok(data.clients.some((c) => c.id === 'c2'));
  assert.equal(data.forms.filter((f) => f.client_id === 'c1').length, 0);
  assert.equal(data.forms.filter((f) => f.client_id === 'c2').length, 1);
  assert.equal(data.skin_scans.length, 0); assert.equal(data.client_photos.length, 0); assert.equal(data.auto_reminders_log.length, 0);
  assert.deepEqual(data.whatsapp_messages.map((m) => m.id).sort(), ['m2', 'm3'], 'her messages AND the owner\'s copy quoting her are gone; another client\'s and another business\'s stay');
  assert.equal(data.waitlist.length, 0);
  assert.deepEqual(data.leads.map((l) => l.id), ['ld3'], 'her lead (linked and by phone) is gone; an unrelated lead stays');
  assert.equal(data.slot_offers.length, 0);
  assert.deepEqual(data.owner_notifications.map((n) => n.id), ['n2'], 'the owner notifications about her bookings are gone');
  assert.deepEqual(db.removed.sort(), [`${T}/clients/c1/a.jpg`, `${T}/clients/c1/scans/s1.jpg`], 'her files, including those in a sub-folder, and nothing else');
  const a1 = data.appointments.find((a) => a.id === 'a1')!;
  assert.equal(a1.name, ANONYMOUS_NAME_HE); assert.equal(a1.client_phone, null); assert.equal(a1.note, null); assert.equal(a1.client_id, null); assert.equal(a1.date, '2026-10-01');
  const a4 = data.appointments.find((a) => a.id === 'a4')!;
  assert.equal(a4.name, ANONYMOUS_NAME_HE); assert.equal(a4.client_phone, null, 'an old booking that was never linked to her card is anonymised by phone');
  const r1 = data.receipts.find((x) => x.id === 'r1')!;
  assert.equal(r1.amount, 250, 'the amount is kept'); assert.equal(r1.client_name, ANONYMOUS_NAME_HE); assert.equal(r1.client_id, null); assert.equal(r1.note, null, 'the free-text note can carry her name');
  assert.equal(data.receipts.find((x) => x.id === 'r2')!.client_name, 'רחל');
  assert.equal(data.packages[0].client_name, ANONYMOUS_NAME_HE);
  assert.equal(data.grow_payments[0].client_name, ANONYMOUS_NAME_HE, 'card payments through Grow lose her name too');
  assert.equal(data.appointments.find((a) => a.id === 'a3')!.name, 'אחרת', 'another business\'s appointment untouched');
  assert.ok(r.steps.some((s) => s.table === 'treatment_results' && s.action === 'skipped'), 'published results are reported as NOT covered');
  const again = await eraseClientData(db as never, T, 'c1');
  assert.ok(!again.ok && again.error === 'not found');
}
// a COLUMN that does not exist is a failure, not a skip: the card must survive (this is what hid the message-log bug)
{
  const data = seed();
  const r = await eraseClientData(fakeDb(data, { wrongColumn: { whatsapp_messages: 'phone' } }) as never, T, 'c1');
  assert.ok(!r.ok, 'a wrong column must not be reported as success');
  assert.ok(data.clients.some((c) => c.id === 'c1' && c.tenant_id === T), 'the card is kept');
  assert.ok(r.steps.some((s) => s.action === 'failed' && s.note === 'column missing'));
}
// a step that fails keeps the card, so it can be run again
{
  const data = seed();
  const r = await eraseClientData(fakeDb(data, { failDelete: ['forms'] }) as never, T, 'c1');
  assert.ok(!r.ok && data.clients.some((c) => c.id === 'c1' && c.tenant_id === T));
  assert.ok(r.steps.some((s) => s.table === 'forms' && s.action === 'failed'));
}
// a TABLE this install does not have is skipped, not a failure
{
  const data = seed();
  const r = await eraseClientData(fakeDb(data, { missingTables: ['slot_offers', 'auto_reminders_log', 'waitlist'] }) as never, T, 'c1');
  assert.ok(r.ok, JSON.stringify(r.steps));
  assert.ok(r.steps.filter((s) => s.action === 'skipped' && /table not on this install/.test(s.note || '')).length >= 3);
}
// two cards with the same phone: the phone-based deletes do not run, so the other card's messages survive
{
  const data = seed();
  data.clients.push({ id: 'c3', tenant_id: T, name: 'דנה (כפולה)', phone: '972501234567' });
  const r = await eraseClientData(fakeDb(data) as never, T, 'c1');
  assert.ok(r.ok);
  assert.ok(data.whatsapp_messages.some((m) => m.id === 'm1'), 'a phone two cards share is not erased by phone');
  assert.ok(r.steps.some((s) => s.table === 'phone-based tables' && s.action === 'skipped'));
}
// more files than one page, and unknown client
{
  const many = Array.from({ length: 250 }, (_, i) => ({ name: `f${i}.jpg`, id: `id${i}` }));
  const db = fakeDb(seed(), { files: { [`${T}/clients/c1`]: many } });
  assert.ok((await eraseClientData(db as never, T, 'c1')).ok);
  assert.equal(db.removed.length, 250, 'every file is removed, not just the first page');
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
assert.ok(era.includes('isDemoTenantId') && era.includes('confirmName'), 'erase: no demo, typed confirmation');
assert.ok(!era.includes('requireActiveTenant'), 'erase stays available to a business whose trial ended: honouring a deletion request is a legal duty');
assert.ok(!exp.includes('requireActiveTenant'), 'export is a read, so it stays open for a business on hold');
assert.ok(fs.readFileSync('app/beautyos.jsx', 'utf8').includes('<ClientPrivacyPanel'), 'the client card offers both');

console.log('client data: ok');

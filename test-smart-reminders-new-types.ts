// The two newer smart-reminder passes through the REAL engine (lib/reminders/smartReminders.js):
//   rebook            - opt-in only, never to a booked client, consent required
//   package_expiring  - two weeks before a package with sessions left runs out
// In-memory database and a stub sender, as in test-smart-reminders.js. Nothing here reaches anyone.
import assert from 'node:assert/strict';
import { runSmartReminders } from './lib/reminders/smartReminders.js';

function makeDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ? [...tables[table]] : [];
      const chain: any = {
        select() { return chain; },
        order() { return chain; },
        eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return chain; },
        in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return chain; },
        range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length }); },
        insert(row: any) { (tables[table] = tables[table] || []).push(row); return Promise.resolve({ error: null }); },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); },
      };
      return chain;
    },
  };
}

const now = new Date('2026-10-19T09:00:00Z');
const client = (id: string, tenant: string, extra = {}) => ({ id, name: `לקוחה ${id}`, phone: `9725400000${id.length}${id.charCodeAt(0)}`, tenant_id: tenant, birthday: null, marketing_consent: true, ...extra });

function world(rebookEnabled: boolean) {
  return {
    settings: [
      { tenant_id: 'T', business_name: 'סטודיו', business_fields: ['nails'], automations: rebookEnabled ? { rebook_enabled: true } : {} },
    ],
    clients: [client('a', 'T'), client('b', 'T'), client('c', 'T', { marketing_consent: false }), client('p', 'T')],
    appointments: [
      // a: one visit 25 days ago, nothing booked -> due (nails default 21 + 2..14)
      { id: 'a1', client_id: 'a', tenant_id: 'T', date: '2026-09-24', service: 'לק ג׳ל', confirmation_status: 'confirmed' },
      // b: same, but booked for next week -> never
      { id: 'b1', client_id: 'b', tenant_id: 'T', date: '2026-09-24', service: 'לק ג׳ל', confirmation_status: 'confirmed' },
      { id: 'b2', client_id: 'b', tenant_id: 'T', date: '2026-10-26', service: 'לק ג׳ל', confirmation_status: 'confirmed' },
      // c: due by date, but no marketing consent -> never
      { id: 'c1', client_id: 'c', tenant_id: 'T', date: '2026-09-24', service: 'לק ג׳ל', confirmation_status: 'confirmed' },
      // p: visited yesterday
      { id: 'p1', client_id: 'p', tenant_id: 'T', date: '2026-10-18', service: 'פילינג', confirmation_status: 'confirmed' },
    ],
    packages: [
      // p: 2 of 5 used, expires in 10 days -> package_expiring
      { id: 'pk1', client_id: 'p', tenant_id: 'T', service: 'פילינג', total_sessions: 5, used_sessions: 2, active: true, expires_at: '2026-10-29T21:59:59Z' },
      // p: expires in 40 days -> not yet
      { id: 'pk2', client_id: 'p', tenant_id: 'T', service: 'פילינג', total_sessions: 5, used_sessions: 1, active: true, expires_at: '2026-11-28T21:59:59Z' },
    ],
    auto_reminders_log: [] as any[],
  };
}

function sender() {
  const calls: any[] = [];
  return { calls, send: async (phone: string, message: string, opts: any) => { calls.push({ phone, message, ...opts }); return { ok: false, queued: true }; } };
}

// Off by default: no rebook message at all.
{
  const s = sender();
  await runSmartReminders({ db: makeDb(world(false)), send: s.send, now } as any);
  assert.equal(s.calls.filter((c) => c.type === 'auto_rebook').length, 0);
}

// On: only client a; the package reminder goes to p once.
{
  const w = world(true);
  const s = sender();
  await runSmartReminders({ db: makeDb(w), send: s.send, now } as any);
  const rebook = s.calls.filter((c) => c.type === 'auto_rebook');
  assert.deepEqual(rebook.map((c) => c.name), ['לקוחה a']);
  assert.ok(rebook[0].message.includes('/book?t=T'), 'carries her booking link');
  assert.ok(rebook[0].message.includes('יותר מ-3 שבועות'), rebook[0].message);
  const exp = s.calls.filter((c) => c.type === 'auto_package_expiring');
  assert.equal(exp.length, 1);
  assert.ok(exp[0].message.includes('3 טיפולים'), exp[0].message);

  // A second run the same day sends neither again (logged, even though only queued).
  const s2 = sender();
  await runSmartReminders({ db: makeDb(w), send: s2.send, now } as any);
  assert.equal(s2.calls.filter((c) => c.type === 'auto_rebook' || c.type === 'auto_package_expiring').length, 0);
}
console.log('smart reminders, rebook + package expiring: ok');

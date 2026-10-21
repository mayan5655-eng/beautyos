// The WhatsApp bot's memory (lib/waConversation.js): what it reads, how the turns become a message list the API
// accepts, and that a missing table never costs her the reply.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBotMessages, loadRecentTurns, recordInbound, HISTORY_MAX_TURNS, INBOUND_BODY_MAX } from './lib/waConversation.js';
import { REFERENCED_TABLES, REFERENCED_COLUMNS } from './lib/referencedTables.js';

let n = 0;
const ok = async (label: string, fn: () => unknown) => { await fn(); n++; void label; };

// A fake supabase: records every filter, answers per table.
function fakeDb(answers: Record<string, { data?: unknown[]; error?: { message: string } }>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    calls, inserts,
    from(table: string) {
      const call = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(call);
      const q: any = {};
      for (const op of ['select', 'eq', 'in', 'gte', 'order', 'limit']) q[op] = (...a: unknown[]) => { call.ops.push([op, a]); return q; };
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answers[table] ?? { data: [] }).then(res, rej);
      q.insert = async (row: Record<string, unknown>) => { inserts.push({ table, row }); return answers[table]?.error ? { error: answers[table].error } : { error: null }; };
      return q;
    },
  };
}

await ok('turns: joined per side, opens with the client, ends with the current message', () => {
  const m = buildBotMessages([
    { role: 'assistant', text: 'תזכורת: התור שלך מחר', at: '1' },
    { role: 'user', text: 'היי', at: '2' },
    { role: 'user', text: 'יש מקום ביום חמישי?', at: '3' },
    { role: 'assistant', text: 'יש ב-16:00 או ב-18:00', at: '4' },
  ], 'הודעת הלקוחה: כן, ב-4 מתאים');
  assert.deepEqual(m, [
    { role: 'user', content: 'היי\nיש מקום ביום חמישי?' },
    { role: 'assistant', content: 'יש ב-16:00 או ב-18:00' },
    { role: 'user', content: 'הודעת הלקוחה: כן, ב-4 מתאים' },
  ]);
});

await ok('no history: the single message, exactly as before', () => {
  assert.deepEqual(buildBotMessages([], 'x'), [{ role: 'user', content: 'x' }]);
});

await ok('an unanswered client message joins the current one (never two user turns, never a prefill)', () => {
  const m = buildBotMessages([{ role: 'user', text: 'שאלה קודמת', at: '1' }], 'עכשיו');
  assert.deepEqual(m, [{ role: 'user', content: 'שאלה קודמת\nעכשיו' }]);
  assert.equal(m[m.length - 1].role, 'user');
});

await ok('reads are scoped to the tenant AND her phone, only sent messages, newest window', async () => {
  const db = fakeDb({
    whatsapp_inbound: { data: [{ body: 'יש מקום מחר?', created_at: '2026-10-21T10:00:00Z' }] },
    whatsapp_messages: { data: [{ message_body: 'כן, ב-16:00', created_at: '2026-10-21T10:01:00Z' }] },
  });
  const turns = await loadRecentTurns(db, { tenantId: 't1', variants: ['0501234567', '972501234567'], now: Date.parse('2026-10-21T12:00:00Z') });
  assert.deepEqual(turns.map((t: any) => [t.role, t.text]), [['user', 'יש מקום מחר?'], ['assistant', 'כן, ב-16:00']]);
  for (const c of db.calls) {
    assert.ok(c.ops.some(([op, a]) => op === 'eq' && a[0] === 'tenant_id' && a[1] === 't1'), `${c.table} filtered by tenant`);
    assert.ok(c.ops.some(([op]) => op === 'in'), `${c.table} filtered by her phone`);
    assert.ok(c.ops.some(([op, a]) => op === 'gte' && a[0] === 'created_at'), `${c.table} limited to the window`);
    assert.ok(c.ops.some(([op, a]) => op === 'limit' && Number(a[0]) <= HISTORY_MAX_TURNS));
  }
  const out = db.calls.find((c) => c.table === 'whatsapp_messages')!;
  assert.ok(out.ops.some(([op, a]) => op === 'eq' && a[0] === 'status' && a[1] === 'sent'), 'a draft still in the manual queue is not part of the conversation');
});

await ok('no tenant or no phone: no read at all', async () => {
  const db = fakeDb({});
  assert.deepEqual(await loadRecentTurns(db, { tenantId: null, variants: ['050'] }), []);
  assert.deepEqual(await loadRecentTurns(db, { tenantId: 't1', variants: [] }), []);
  assert.equal(db.calls.length, 0);
});

await ok('the table not created yet: no history, no throw (the bot still answers the one message)', async () => {
  const db = fakeDb({ whatsapp_inbound: { error: { message: 'relation "public.whatsapp_inbound" does not exist' } }, whatsapp_messages: { data: [{ message_body: 'שלום', created_at: '2026-10-21T10:00:00Z' }] } });
  const turns = await loadRecentTurns(db, { tenantId: 't1', variants: ['050'] });
  assert.deepEqual(turns.map((t: any) => t.role), ['assistant']);
  await recordInbound(db, { tenantId: 't1', phone: '050', body: 'x' });
});

await ok('recordInbound: tenant-scoped row, body capped, nothing without a tenant', async () => {
  const db = fakeDb({});
  await recordInbound(db, { tenantId: 't1', phone: '0501234567', body: 'א'.repeat(INBOUND_BODY_MAX + 50) });
  await recordInbound(db, { tenantId: null, phone: '050', body: 'x' });
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].table, 'whatsapp_inbound');
  assert.equal(db.inserts[0].row.tenant_id, 't1');
  assert.equal(String(db.inserts[0].row.body).length, INBOUND_BODY_MAX);
});

await ok('the migration: server only, gated, adds only; registered for the nightly check', () => {
  const mig = fs.readFileSync('supabase/migrations/add_whatsapp_inbound.sql', 'utf8');
  const sql = mig.replace(/^\s*--.*$/gm, '');
  assert.ok(!/drop table|truncate|delete from/i.test(sql));
  assert.ok(/enable row level security/.test(sql) && /revoke all on public\.whatsapp_inbound from anon, authenticated/.test(sql));
  assert.ok(/targets text\[\] := array\['whatsapp_inbound'\]/.test(sql) && /_require_active_insert/.test(sql));
  assert.ok(/tenant_id\s+uuid not null references public\.tenants\(id\) on delete cascade/.test(sql));
  assert.ok(/retention/i.test(mig), 'a retention note: it holds client message text');
  assert.ok(fs.readFileSync('trial-gate-policies.sql', 'utf8').includes("'whatsapp_inbound'"));
  assert.ok(REFERENCED_TABLES.includes('whatsapp_inbound'));
  assert.deepEqual((REFERENCED_COLUMNS as Record<string, string[]>).whatsapp_inbound, ['tenant_id', 'phone', 'body', 'source']);
});

await ok('the webhook reads the history before keeping the message, and only on the bot path', () => {
  const src = fs.readFileSync('app/api/whatsapp-webhook/route.js', 'utf8');
  const load = src.indexOf('await loadRecentTurns('), keep = src.indexOf('await recordInbound('), reply = src.indexOf('await generateReply(');
  const botOff = src.indexOf('botOff: true');
  assert.ok(botOff > 0 && botOff < load && load < keep && keep < reply);
  assert.ok(/messages:\s*buildBotMessages\(history,/.test(src));
});

console.log(`wa conversation: ${n} ok`);

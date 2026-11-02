// The ten-roles audit of 2026-11-02: each fix pinned by the failure it prevents.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = async (name: string, fn: () => unknown | Promise<unknown>) => { await fn(); n++; console.log('ok -', name); };
const src = (p: string) => readFileSync(p, 'utf8');

// ── security ─────────────────────────────────────────────────────────────────

await ok('the per-payment Grow callbacks accept only Grow addresses: the ?t= token is also in the client\'s /pay link', () => {
  for (const f of ['app/api/grow/notify/route.ts', 'app/api/grow/invoice/route.ts']) {
    const s = src(f);
    const post = s.indexOf('export async function POST');
    const gate = s.indexOf('ipCheckEnforced() && !ipAllowed(ip)', post);
    const work = Math.min(...['applyNotification(', 'applyInvoice('].map((k) => s.indexOf(k, post)).filter((i) => i > 0));
    assert.ok(gate > post && gate < work, `${f}: the address check runs before anything is read or written`);
    assert.ok(s.includes("status: 403"), `${f}: refused with 403`);
  }
});

await ok('a legal document reads the client only within the receipt\'s own business', () => {
  assert.match(src('lib/legalReceipts/service.js'), /from\("clients"\)\.select\("name, phone, email"\)\.eq\("tenant_id", tenantId\)\.eq\("id", receipt\.client_id\)/);
});

await ok('a card charge refuses a client or appointment id of another business', () => {
  const s = src('app/api/grow/charge/route.ts');
  assert.match(s, /from\('clients'\)\.select\('id'\)\.eq\('tenant_id', c\.tenantId\)\.eq\('id', clientId\)/);
  assert.match(s, /from\('appointments'\)\.select\('id'\)\.eq\('tenant_id', c\.tenantId\)\.eq\('id', appointmentId\)/);
  assert.ok(s.indexOf("'הלקוחה או התור לא נמצאו'") < s.indexOf('createCharge('), 'checked before the payment is created');
});

await ok('the waitlist answers the same whether the phone was already waiting (no "is this number on the list" oracle), and shows the privacy notice', () => {
  const route = src('app/api/waitlist/join/route.js');
  assert.ok(!/already:\s*true/.test(route), 'no "already" answer');
  assert.match(src('app/WaitlistJoin.jsx'), /href="\/privacy"/);
});

await ok('the receipts same-business trigger is written as a file (never run from here)', () => {
  const sql = src('supabase/migrations/receipts_client_same_tenant_2026-11-02.sql');
  assert.match(sql, /create trigger receipts_client_same_tenant/);
  assert.match(sql, /before insert or update of client_id on public\.receipts/);
});

// ── reminders ────────────────────────────────────────────────────────────────

await ok('a queued reminder never says "מחר" by itself: it may go out on the day; the browser copies pick the day word from the date', () => {
  const cron = src('lib/reminders/dailyReminders.js');
  assert.ok(!/תזכורת לתור שלך ב\$\{businessName\} מחר/.test(cron), 'no fixed "מחר" in the queued text');
  const app = src('app/beautyos.jsx');
  assert.ok(!/תזכורת לתור שלך ב\$\{businessName\} מחר/.test(app), 'no fixed "מחר" in the browser copies');
  assert.equal((app.match(/msgHebrewDate\(/g) || []).length >= 2, true, 'a Hebrew date, never "2026-11-03"');
});

await ok('the day word is computed from the date', async () => {
  const app = src('app/beautyos.jsx');
  const body = app.slice(app.indexOf('function dayWordFor'), app.indexOf('function dayWordFor') + 400);
  assert.match(body, /diff === 0 \? " היום" : diff === 1 \? " מחר" : ""/);
});

await ok('queuedByTenant counts what each business must send herself', async () => {
  const { queuedByTenant } = await import('./lib/reminders/dailyReminders.js');
  const m = queuedByTenant([
    { tenantId: 'a', status: 'ממתין לשליחה ידנית' }, { tenantId: 'a', status: 'ממתין לשליחה ידנית' },
    { tenantId: 'b', status: 'נשלח' }, { tenantId: 'c', status: 'כבר נשלח' }, { tenantId: 'd', status: 'ממתין לשליחה ידנית' },
  ]);
  assert.deepEqual([...m.entries()], [['a', 2], ['d', 1]]);
  const route = src('app/api/send-reminders/route.js');
  assert.match(route, /kind: "reminders_ready"/);
  assert.ok(route.indexOf('queuedByTenant(run.results)') > route.indexOf('runDailyReminders('), 'after the run');
});

await ok('one reminder per appointment and day, whichever button sent it: claim taken, other queued copies dismissed', async () => {
  const { markReminderHandled } = await import('./lib/reminders/handled.js');
  const calls: Record<string, unknown>[] = [];
  const chain = (rec: Record<string, unknown>) => {
    const c: Record<string, unknown> = {};
    for (const k of ['update', 'eq', 'neq', 'like']) c[k] = (...a: unknown[]) => { (rec[k] as unknown[] | undefined) ? (rec[k] as unknown[]).push(a) : (rec[k] = [a]); return c; };
    c.select = async () => ({ data: [{ id: 'm1' }], error: null });
    return c;
  };
  const db = {
    from(t: string) {
      const rec: Record<string, unknown> = { table: t }; calls.push(rec);
      if (t === 'reminder_claims') return { insert: async (row: unknown) => { rec.insert = row; return { error: null }; } };
      return chain(rec);
    },
  };
  const r = await markReminderHandled(db, { tenantId: 'T', appointmentId: 'A-1', date: '2026-11-03', keepMessageId: 'NEW' });
  assert.deepEqual(r, { claim: 'claimed', closed: 1 });
  assert.deepEqual(calls[0].insert, { appointment_id: 'A-1', kind: 'day_before:2026-11-03' }, 'the same claim key the cron takes');
  const upd = calls[1] as Record<string, unknown[][]>;
  assert.deepEqual(upd.update[0][0], { status: 'dismissed' }, 'dismissed, not "sent": that copy itself never went');
  assert.deepEqual(upd.eq, [['tenant_id', 'T'], ['status', 'pending_manual'], ['message_type', 'reminder']]);
  assert.deepEqual(upd.like[0], ['message_body', '%/confirm?id=A-1&action=confirm%']);
  assert.deepEqual(upd.neq[0], ['id', 'NEW'], 'the copy she is opening right now stays');
  const cron = src('lib/reminders/dailyReminders.js');
  assert.match(cron, /const claimKind = `day_before:\$\{appt\.date\}`/, 'the cron claims the same key');
});

await ok('both manual reminder paths tell the server; cancelled and no-show bookings get no reminder from the dashboard', () => {
  assert.match(src('app/api/send-reminder-manual/route.js'), /markReminderHandled\(supabase/);
  const app = src('app/beautyos.jsx');
  assert.match(app, /fetch\("\/api\/reminders\/handled"/);
  assert.equal((app.match(/a\.confirmation_status!=="cancelled"&&a\.confirmation_status!==NO_SHOW/g) || []).length, 3);
});

await ok('reminder copy says they wait for her, unless the central number really sends', () => {
  const app = src('app/beautyos.jsx');
  assert.ok(!app.includes('כל הודעה כאן יצאה מהתור'), 'the queue never says its messages went out');
  assert.match(app, /ההודעות כאן עוד לא נשלחו/);
});

console.log(`audit 2026-11-02: ${n} ok`);

// The owner's go-ahead on the morning report (2026-10-21): each recommendation pinned.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyNotification } from './lib/grow/service.ts';
import type { GrowPayment, GrowRepo } from './lib/grow/service.ts';
type Deps = Parameters<typeof applyNotification>[2];

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// ── א: a wallet payment paid through an EARLIER "pay" tap is recorded ─────────
const TOKEN = 'x'.repeat(24);
function walletWorld(p: Partial<GrowPayment> = {}) {
  const row: GrowPayment = {
    id: 'pay-1', tenant_id: 't1', status: 'created', amount: 250, process_id: 'PROC-B', receipt_id: null, client_id: null, client_name: 'דנה',
    appointment_id: null, description: 'טיפול', notify_token: TOKEN, ...p,
  };
  const log: string[] = [];
  const repo = {
    async insertPayment() { throw new Error('n/a'); },
    async updatePayment(_id: string, patch: Record<string, unknown>) { Object.assign(row, patch); },
    async findByToken(t: string) { return t === TOKEN ? { ...row } : null; },
    async markPaid(_id: string, patch: Record<string, unknown>) {
      if (row.status !== 'created') return null;
      Object.assign(row, patch); log.push(`paid:${patch.process_id ?? row.process_id}`); return { ...row };
    },
    async insertReceipt() { log.push('receipt'); return { id: 'r1' }; },
  } as unknown as GrowRepo;
  const deps = { repo, creds: { apiKey: '', pageCode: '', apiBase: '' }, appUrl: 'https://k', newToken: () => 'n' } as unknown as Deps;
  return { row, log, deps };
}
const cb = (processId: string, extra: Record<string, unknown> = {}) => ({
  data: { processId, transactionId: 'TX-' + processId, sum: '250.00', statusCode: '2', customFields: { cField1: 'pay-1' }, ...extra },
});

await ok('a callback for an earlier process of the SAME payment, through its secret URL, is recorded (not "mismatch")', async () => {
  const w = walletWorld();
  const r = await applyNotification(cb('PROC-A'), TOKEN, w.deps);
  assert.equal(r.status, 'paid');
  assert.equal(w.row.status, 'paid');
  assert.equal(w.row.process_id, 'PROC-A', 'the process that actually paid is stored');
  assert.ok(w.log.includes('receipt'));
});

await ok('an earlier process is still refused when it names another payment or another amount', async () => {
  const w1 = walletWorld();
  assert.equal((await applyNotification(cb('PROC-A', { customFields: { cField1: 'pay-OTHER' } }), TOKEN, w1.deps)).status, 'mismatch');
  const w2 = walletWorld();
  assert.equal((await applyNotification(cb('PROC-A', { sum: '1.00' }), TOKEN, w2.deps)).status, 'mismatch');
  assert.equal(w1.row.status, 'created'); assert.equal(w2.row.status, 'created');
});

await ok('the platform webhook (no secret) still requires the stored process id', () => {
  const s = rd('lib/grow/service.ts');
  assert.match(s, /return applyToPayment\(p, raw, d, approve, true\);/);
  assert.match(s, /const earlierTap = viaSecret && !exact/);
  const byProcess = s.slice(s.indexOf('export async function applyNotificationByProcess'), s.indexOf('async function applyToPayment'));
  assert.match(byProcess, /return applyToPayment\(p, raw, d, approve\);/);
});

// ── ג: the reminders check the WhatsApp session first ────────────────────────
await ok('reminders go to the manual queue when GreenAPI says the session is not logged in, and the operator is told', () => {
  const r = rd('app/api/send-reminders/route.js');
  assert.match(r, /const state = await checkInstanceState\(\);/);
  assert.match(r, /const sessionDown = state\.ok && !state\.authorized;/);
  assert.match(r, /forceManual: true/);
  assert.ok(r.indexOf('const sessionDown') < r.indexOf('const run = await runDailyReminders'));
  assert.match(r, /push: opsPush\(supabase\)/);
  const w = rd('lib/whatsapp.js');
  assert.match(w, /options\.forceManual === true \|\| isReservedTestNumber\(phone\) \|\| !isUtilityType/);
  assert.match(w, /"session_down"/);
});

// ── ו: a blocked business takes no new public bookings ───────────────────────
await ok('the public booking route refuses a blocked business, like the waitlist', () => {
  const b = rd('app/api/book-appointment/route.js');
  assert.match(b, /if \(await tenantIsBlocked\(supabase, activeTenantId\)\) \{/);
  assert.match(b, /code: "business_paused"/);
  assert.ok(b.indexOf('tenantIsBlocked(supabase, activeTenantId)') < b.indexOf('.insert('), 'refused before anything is written');
});

// ── ח: the weekly report's week is 7 days ─────────────────────────────────────
await ok('weekly report: this week is today and the 6 days before; the previous week is the 7 before that', () => {
  const r = rd('app/api/send-weekly-report/route.js');
  assert.match(r, /const weekStart = dayKey\(new Date\(now\.getTime\(\) - 6 \* 864e5\)\);/);
  assert.match(r, /const prevStart = dayKey\(new Date\(now\.getTime\(\) - 13 \* 864e5\)\);/);
});

// ── ד: the AI reply bot is off unless she turned it on ───────────────────────
await ok('the WhatsApp bot replies only when bot_active is explicitly on; new businesses start with it off', () => {
  assert.match(rd('app/api/whatsapp-webhook/route.js'), /if \(s\.bot_active !== true && s\.bot_active !== "true"\) return false;/);
  assert.match(rd('lib/tenantTemplate.ts'), /bot_active: false,/);
  assert.match(rd('app/beautyos.jsx'), /const botOn=editSettings\.bot_active===true\|\|editSettings\.bot_active==="true";/);
});

// ── ב: the till says when no legal document will come ────────────────────────
await ok('a payment recorded with no business type says the legal document will NOT be issued', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /const legalBlocked=legalAccount\?\.connected&&needsLegalDoc\(data\[0\]\)&&!settings\.business_tax_status;/);
  assert.match(a, /לא יופק מסמך חוקי: חסר סוג העסק בהגדרות/);
});

// ── י: small first-day fixes ──────────────────────────────────────────────────
await ok('the tour\'s booking-link step opens the settings group the button lives in', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /requiresSettings:true, settingsTab:"import",/);
  assert.match(a, /openSettings\(nextStep\.settingsTab \|\| "general"\)/);
});

await ok('onboarding refuses an emptied opening or closing hour instead of filling it silently', () => {
  assert.match(rd('app/onboarding/page.tsx'), /!\(Number\(data\.working_hours_start\) > 0\) \|\| !\(Number\(data\.working_hours_end\) > 0\)/);
});

console.log(`${n} passed`);

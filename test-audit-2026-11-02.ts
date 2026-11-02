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

console.log(`audit 2026-11-02: ${n} ok`);

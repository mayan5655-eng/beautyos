// A small capacity check on the database/auth side: N NEW smoke businesses at once, each signing in and doing what a working day does
// (adding clients, appointments and receipts, then loading them back). Measures latency and errors; removes every business at the end.
// It does NOT test Vercel (pages, API routes) and it does not send any message. Stops early when errors pile up.
//   node --env-file=.env.local scripts/smoke/capacity.mjs <N=10> [rowsEach=20]
import { createClient } from '@supabase/supabase-js';
import { admin, newEmail, PASSWORD, tenantIdOf, REAL_TENANT } from './lib.mjs';
import { purgeTenant } from './admin-tools.mjs';

const N = Number(process.argv[2] || 10), ROWS = Number(process.argv[3] || 20);
const svc = admin();
const lat = []; let errors = 0; const errTexts = new Map();
const timed = async (label, fn) => {
  const t = performance.now();
  try { const r = await fn(); if (r?.error) throw new Error(r.error.message); lat.push({ label, ms: performance.now() - t }); return r; }
  catch (e) { errors++; const k = label + ': ' + String(e.message).slice(0, 80); errTexts.set(k, (errTexts.get(k) || 0) + 1); return null; }
};
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

const made = [];
// signup (admin API: confirmed, no email), a few at a time so the setup itself is not the test
for (let i = 0; i < N; i += 5) {
  await Promise.all(Array.from({ length: Math.min(5, N - i) }, async () => {
    const email = newEmail('cap');
    const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) { errors++; errTexts.set('createUser: ' + error.message.slice(0, 80), 1); return; }
    made.push({ email, userId: data.user.id });
  }));
}
await new Promise((r) => setTimeout(r, 2500));
for (const m of made) { m.tenantId = await tenantIdOf(m.userId).catch(() => null); if (m.tenantId === REAL_TENANT) throw new Error('refusing'); }
console.log(`${made.length} businesses ready; running the working day at once`);

const t0 = performance.now();
await Promise.all(made.map(async (m) => {
  if (!m.tenantId) { errors++; return; }
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await timed('signIn', () => c.auth.signInWithPassword({ email: m.email, password: PASSWORD }));
  await timed('load settings', () => c.from('settings').select('*').eq('tenant_id', m.tenantId).maybeSingle());
  const ids = [];
  for (let i = 0; i < ROWS; i++) {
    const r = await timed('insert client', () => c.from('clients').insert({ tenant_id: m.tenantId, name: `לקוחה ${i}`, phone: `050${String(7000000 + i)}`, status: 'active' }).select().single());
    if (r?.data) ids.push(r.data);
  }
  await Promise.all(ids.map((cl, i) => timed('insert appointment', () => c.from('appointments').insert({ tenant_id: m.tenantId, client_id: cl.id, name: cl.name, client_phone: cl.phone, service: 'טיפול', date: '2030-02-' + String(1 + (i % 27)).padStart(2, '0'), start_minute: 480 + (i % 8) * 60, hour: 8 + (i % 8), duration: 45, price: 100 }))));
  await Promise.all(ids.map((cl) => timed('insert receipt', () => c.from('receipts').insert({ tenant_id: m.tenantId, client_id: cl.id, client_name: cl.name, service: 'טיפול', amount: 100, payment_method: 'מזומן', note: '', items: '[]' }))));
  for (const tbl of ['clients', 'appointments', 'receipts']) await timed('load ' + tbl, () => c.from(tbl).select('*').eq('tenant_id', m.tenantId).limit(1000));
}));
const wall = (performance.now() - t0) / 1000;
const by = {}; for (const l of lat) (by[l.label] ||= []).push(l.ms);
console.log(`wall ${wall.toFixed(1)}s, ${lat.length} ok calls, ${errors} errors`);
for (const [k, v] of Object.entries(by)) console.log(k.padEnd(18), `n=${String(v.length).padStart(4)}  p50=${pct(v, 0.5).toFixed(0)}ms  p95=${pct(v, 0.95).toFixed(0)}ms  max=${Math.max(...v).toFixed(0)}ms`);
for (const [k, n] of errTexts) console.log('ERROR x' + n, k);
for (const m of made) { if (m.tenantId) { const left = await purgeTenant(m.tenantId, m.userId); if (left.length) console.log('purge notes', m.email, left); } }
console.log('removed', made.length, 'businesses');

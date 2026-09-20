// test-outbound-cap.js
//
// Proves lib/outboundCap.js against a fake database and a fake sender: what
// counts, when a send is refused, that the operator hears once, and that a
// broken count never blocks a real message. Plain node, no network.

import {
  enforcePublicCap,
  publicSendsInWindow,
  dailyCap,
  isPublicType,
  formatCapAlert,
  PUBLIC_TYPES,
  ALERT_TYPE,
  DEFAULT_DAILY_CAP,
  WINDOW_MS,
} from './lib/outboundCap.js';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}
const quiet = { warn() {}, error() {} };

// A fake supabase: enough of the chain for the two count queries, driven by
// an in-memory table so the filters are real, not stubbed.
function makeDb(rows, { fail = false } = {}) {
  return {
    from() {
      let filtered = [...rows];
      const chain = {
        select() { return chain; },
        eq(col, val) { filtered = filtered.filter((r) => r[col] === val); return chain; },
        in(col, vals) { filtered = filtered.filter((r) => vals.includes(r[col])); return chain; },
        gte(col, val) { filtered = filtered.filter((r) => r[col] >= val); return chain; },
        then(res) {
          return Promise.resolve(fail ? { count: null, error: { message: 'boom' } } : { count: filtered.length, error: null }).then(res);
        },
      };
      return chain;
    },
  };
}
function makeSender() {
  const calls = [];
  return { calls, send: async (phone, text, opts) => { calls.push({ phone, text, opts }); return { ok: true }; } };
}

const NOW = Date.parse('2026-09-21T10:00:00Z');
const T = 'tenant-a';
const row = (over) => ({ tenant_id: T, status: 'sent', message_type: 'booking_confirm', created_at: new Date(NOW - 60_000).toISOString(), ...over });

// ── What counts ────────────────────────────────────────────────────────────
{
  const rows = [
    row(),
    row({ message_type: 'skin_report' }),
    row({ message_type: 'ai_agent_reply' }),
    row({ status: 'failed' }),                                   // not sent
    row({ message_type: 'reminder' }),                           // not public
    row({ tenant_id: 'tenant-b' }),                              // not this tenant
    row({ created_at: new Date(NOW - WINDOW_MS - 1000).toISOString() }), // outside the window
  ];
  eq(await publicSendsInWindow(makeDb(rows), T, NOW), 3, 'counts sent public rows for this tenant inside 24h, nothing else');
  eq(await publicSendsInWindow(makeDb(rows, { fail: true }), T, NOW), null, 'a read error is null, not zero');
}

// ── The types ──────────────────────────────────────────────────────────────
for (const t of ['booking_confirm', 'owner_alert', 'skin_report', 'skin_lead_alert', 'ai_agent_reply']) eq(isPublicType(t), true, `${t} is public`);
for (const t of ['reminder', 'receipt', 'auto_winback', 'lead_bulk', 'reminder_failure', ALERT_TYPE, '', undefined]) eq(isPublicType(t), false, `${String(t)} is not public`);
eq(PUBLIC_TYPES.has(ALERT_TYPE), false, 'the alert itself is never a public type, so it cannot recurse');

// ── The cap ────────────────────────────────────────────────────────────────
eq(dailyCap({}), DEFAULT_DAILY_CAP, 'default cap');
eq(dailyCap({ WHATSAPP_PUBLIC_DAILY_CAP: '40' }), 40, 'env cap');
eq(dailyCap({ WHATSAPP_PUBLIC_DAILY_CAP: '0' }), DEFAULT_DAILY_CAP, 'zero falls back');
eq(dailyCap({ WHATSAPP_PUBLIC_DAILY_CAP: 'lots' }), DEFAULT_DAILY_CAP, 'junk falls back');

// ── Under the cap: allowed, nobody alerted ─────────────────────────────────
{
  const s = makeSender();
  const v = await enforcePublicCap({ db: makeDb([row(), row()]), tenantId: T, type: 'booking_confirm', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v, { allowed: true, count: 2, cap: 3, alerted: false }, 'two of three: allowed');
  eq(s.calls.length, 0, 'no alert');
}

// ── At the cap: refused, operator told once ────────────────────────────────
{
  const rows = [row(), row(), row()];
  const s = makeSender();
  const v = await enforcePublicCap({ db: makeDb(rows), tenantId: T, type: 'skin_report', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v.allowed, false, 'three of three: refused');
  eq(v.alerted, true, 'operator alerted');
  eq(s.calls.length, 1, 'exactly one alert send');
  eq(s.calls[0].phone, '0509999999', 'to the operator number');
  eq(s.calls[0].opts.type, ALERT_TYPE, 'typed as the alert');
  eq(s.calls[0].opts.tenantId, T, 'logged under the tenant, which is what makes the once-per-window check work');
  eq(s.calls[0].text.includes('3'), true, 'the alert carries the count');

  // The alert row now exists: a second refusal in the window sends no second alert.
  rows.push({ tenant_id: T, status: 'sent', message_type: ALERT_TYPE, created_at: new Date(NOW).toISOString() });
  const v2 = await enforcePublicCap({ db: makeDb(rows), tenantId: T, type: 'ai_agent_reply', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW + 1000, log: quiet });
  eq(v2.allowed, false, 'still refused');
  eq(v2.alerted, false, 'not alerted again');
  eq(s.calls.length, 1, 'still one alert');
}

// ── Non-public types are never counted or refused ──────────────────────────
{
  const s = makeSender();
  const v = await enforcePublicCap({ db: makeDb([row(), row(), row()]), tenantId: T, type: 'reminder', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v, { allowed: true, count: null, cap: 3, alerted: false }, 'a reminder passes without even counting');
}
{
  const v = await enforcePublicCap({ db: makeDb([row(), row(), row()]), tenantId: null, type: 'booking_confirm', send: async () => ({ ok: true }), cap: 3, now: NOW, log: quiet });
  eq(v.allowed, true, 'no tenant: nothing to cap against');
}

// ── Fails open ─────────────────────────────────────────────────────────────
{
  const s = makeSender();
  const v = await enforcePublicCap({ db: makeDb([], { fail: true }), tenantId: T, type: 'booking_confirm', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v.allowed, true, 'unreadable count: allowed');
  eq(s.calls.length, 0, 'and no alert');
  const throwing = { from() { throw new Error('down'); } };
  const v2 = await enforcePublicCap({ db: throwing, tenantId: T, type: 'booking_confirm', send: s.send, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v2.allowed, true, 'a throwing db: allowed');
}

// ── A broken alert never turns a refusal into a throw ──────────────────────
{
  const v = await enforcePublicCap({ db: makeDb([row(), row(), row()]), tenantId: T, type: 'booking_confirm', send: async () => { throw new Error('GreenAPI down'); }, operatorPhone: '0509999999', cap: 3, now: NOW, log: quiet });
  eq(v.allowed, false, 'still refused');
  eq(v.alerted, false, 'alert recorded as not sent');
}

// ── No operator number: refuse quietly ─────────────────────────────────────
{
  const s = makeSender();
  const v = await enforcePublicCap({ db: makeDb([row(), row(), row()]), tenantId: T, type: 'booking_confirm', send: s.send, operatorPhone: '', cap: 3, now: NOW, log: quiet });
  eq(v.allowed, false, 'refused');
  eq(s.calls.length, 0, 'no alert to nowhere');
}

// ── The alert text ─────────────────────────────────────────────────────────
{
  const text = formatCapAlert({ tenantId: '448e9e45-2251-4572-b665-886c5bc7a4c8', count: 120, cap: 120 });
  eq(text.includes('448e9e45'), true, 'names the tenant by its short id');
  eq(text.includes('448e9e45-2251'), false, 'and not the whole id');
  eq(text.includes('WHATSAPP_PUBLIC_DAILY_CAP'), true, 'tells the operator which knob');
}

console.log(`test-outbound-cap: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

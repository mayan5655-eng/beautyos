// test-ops-alert.js
//
// An alert to the OPERATOR has to actually be sent.
//
// The crons tell Kalmea's operator when they miss tenants (send-reminders,
// send-owner-evening, send-smart-reminders, the receipt retry) and the nightly
// invariants job has always done the same. All of them call sendWhatsApp with
// type "invariants" - which was neither a utility type nor "cap_alert", the one
// exemption. sendWhatsApp's rule is that every non-utility type is MANUAL-ONLY:
// it writes a pending_manual row and sends nothing. So each of those alerts
// became a queued row with no tenant, invisible to every dashboard (RLS scopes
// the queue to a tenant), and the person they were written for never heard a
// word. A monitoring message that cannot arrive is the quiet lie this suite
// exists to prevent.
//
// This drives the REAL sendWhatsApp with a stubbed fetch (the GreenAPI call) and
// asserts what leaves the process. No network, no WhatsApp.
process.env.GREENAPI_ID_INSTANCE = '1100000000';
process.env.GREENAPI_API_TOKEN = 'test-token';
process.env.GREENAPI_API_URL = 'https://greenapi.test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder';

const greenApiCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://greenapi.test')) {
    greenApiCalls.push({ url: u, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ idMessage: 'X1' }), { status: 200 });
  }
  // Supabase logging / platform settings: unreachable here, and the code must cope.
  return new Response(JSON.stringify({ message: 'no db in this test' }), { status: 500, headers: { 'content-type': 'application/json' } });
};

const { sendWhatsApp } = await import('./lib/whatsapp.js');

let passed = 0, failed = 0;
const ok = (label, cond, extra = '') => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label} ${extra}`); } };

const OPERATOR = '972501234567';

for (const type of ['invariants', 'cap_alert']) {
  greenApiCalls.length = 0;
  const res = await sendWhatsApp(OPERATOR, 'cron missed 3 tenants', { name: 'Kalmea', type });
  ok(`an operator alert of type "${type}" is sent through GreenAPI`, greenApiCalls.length === 1 && res.ok === true, JSON.stringify(res));
  ok(`...to the operator's number`, greenApiCalls[0]?.body.chatId === `${OPERATOR}@c.us`);
}

// The exemption must stay narrow: a client-facing message of a non-utility type
// is still manual-only, and so is a reminder while the admin toggle is off (the
// stubbed platform_settings read fails, which defaults to manual).
for (const type of ['general', 'marketing', 'reminder']) {
  greenApiCalls.length = 0;
  const res = await sendWhatsApp('972509998877', 'hello', { name: 'Client', type, tenantId: 'tenant-1' });
  ok(`"${type}" to a client is still NOT auto-sent`, greenApiCalls.length === 0 && res.queued === true, JSON.stringify(res));
}

globalThis.fetch = realFetch;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

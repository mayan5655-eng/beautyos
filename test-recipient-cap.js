// test-recipient-cap.js
//
// The platform WhatsApp number may not be used to message one stranger over and over.
//
// The tenant cap (lib/outboundCap.js, test-outbound-cap.js) bounds what ONE business's public page
// can make the number send. It did not bound what one PHONE receives: book under many tenants, or
// scan many times, naming the same victim - each tenant under its own cap, the victim under none.
// Found 2026-10-06. Runs the real counting against a fake database whose filters are real.

import {
  enforceRecipientCap, recipientSendsInWindow, recipientCap, isRecipientCappedType, phoneVariants,
  RECIPIENT_TYPES, DEFAULT_RECIPIENT_CAP, WINDOW_MS,
} from './lib/outboundCap.js';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++; else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}
const quiet = { warn() {}, error() {} };

function makeDb(rows, { fail = false } = {}) {
  return {
    from() {
      let filtered = [...rows];
      const chain = {
        select() { return chain; },
        eq(col, val) { filtered = filtered.filter((r) => r[col] === val); return chain; },
        in(col, vals) { filtered = filtered.filter((r) => vals.includes(r[col])); return chain; },
        gte(col, val) { filtered = filtered.filter((r) => r[col] >= val); return chain; },
        then(res) { return Promise.resolve(fail ? { count: null, error: { message: 'boom' } } : { count: filtered.length, error: null }).then(res); },
      };
      return chain;
    },
  };
}
const NOW = Date.parse('2026-10-06T10:00:00Z');
const VICTIM = '972501234567';
const row = (over) => ({ tenant_id: 'tenant-a', recipient_phone: VICTIM, status: 'sent', message_type: 'booking_confirm', created_at: new Date(NOW - 60_000).toISOString(), ...over });

// which types
eq([...RECIPIENT_TYPES].sort(), ['booking_confirm', 'skin_report'], 'only the two types that go to a phone the CALLER chose');
for (const t of ['owner_alert', 'skin_lead_alert', 'reminder', 'receipt', 'ai_agent_reply', 'cap_alert', '', undefined]) eq(isRecipientCappedType(t), false, `${t} is not recipient-limited (the owner's own alerts and the cosigned reminders must never be blocked by a stranger)`);

// phone variants: whatsapp_messages stores the string as the caller gave it
eq(phoneVariants('972501234567').sort(), ['+972501234567', '0501234567', '972501234567'].sort(), 'one mobile, three ways it is stored');
eq(phoneVariants(''), [], 'no phone, no variants');

// counting: ACROSS tenants, sent only, these types only, inside 24h
{
  const rows = [
    row(), row({ tenant_id: 'tenant-b' }), row({ tenant_id: 'tenant-c', message_type: 'skin_report' }),
    row({ recipient_phone: '0501234567' }),                                  // same phone, local form
    row({ status: 'failed' }), row({ status: 'pending_manual' }),            // not sent
    row({ message_type: 'owner_alert' }), row({ message_type: 'reminder' }), // other types
    row({ recipient_phone: '972509999999' }),                                // someone else
    row({ created_at: new Date(NOW - WINDOW_MS - 1000).toISOString() }),     // outside the window
  ];
  eq(await recipientSendsInWindow(makeDb(rows), VICTIM, NOW), 4, 'four sends to ONE phone across three tenants and two spellings; nothing else counts');
  eq(await recipientSendsInWindow(makeDb(rows, { fail: true }), VICTIM, NOW), null, 'a read error is null, not zero');
  eq(await recipientSendsInWindow(makeDb(rows), '', NOW), 0, 'no phone: nothing to count');
}

// the verdict
const sends = (n) => Array.from({ length: n }, (_, i) => row({ tenant_id: `tenant-${i}` }));
eq(DEFAULT_RECIPIENT_CAP, 4, 'the default is four a day: a real client rebooking is well under it');
eq((await enforceRecipientCap({ db: makeDb(sends(3)), digits: VICTIM, type: 'booking_confirm', now: NOW, log: quiet })).allowed, true, 'three so far: the fourth goes out');
{
  const v = await enforceRecipientCap({ db: makeDb(sends(4)), digits: VICTIM, type: 'booking_confirm', now: NOW, log: quiet });
  eq([v.allowed, v.count, v.cap], [false, 4, 4], 'four already went to this phone today: the fifth is refused');
}
eq((await enforceRecipientCap({ db: makeDb(sends(40)), digits: VICTIM, type: 'skin_report', now: NOW, log: quiet })).allowed, false, 'a skin report counts the same way');
eq((await enforceRecipientCap({ db: makeDb(sends(40)), digits: VICTIM, type: 'owner_alert', now: NOW, log: quiet })).allowed, true, 'the owner alert to the business\'s own number is never limited by this');
eq((await enforceRecipientCap({ db: makeDb(sends(40)), digits: VICTIM, type: 'reminder', now: NOW, log: quiet })).allowed, true, 'and a reminder is untouched');
eq((await enforceRecipientCap({ db: makeDb(sends(40)), digits: '972508888888', type: 'booking_confirm', now: NOW, log: quiet })).allowed, true, 'a DIFFERENT phone is unaffected by the victim\'s count');
eq((await enforceRecipientCap({ db: makeDb(sends(40), { fail: true }), digits: VICTIM, type: 'booking_confirm', now: NOW, log: quiet })).allowed, true, 'unreadable count fails OPEN: a database wobble must not stop a real confirmation');
eq((await enforceRecipientCap({ db: { from() { throw new Error('down'); } }, digits: VICTIM, type: 'booking_confirm', now: NOW, log: quiet })).allowed, true, 'a thrown error fails open too');
eq((await enforceRecipientCap({ db: makeDb(sends(5)), digits: VICTIM, type: 'booking_confirm', cap: 10, now: NOW, log: quiet })).allowed, true, 'the cap is tunable');

// the env knob
eq(recipientCap({}), 4, 'unset -> default'); eq(recipientCap({ WHATSAPP_PUBLIC_RECIPIENT_CAP: '7' }), 7, 'set -> used');
eq(recipientCap({ WHATSAPP_PUBLIC_RECIPIENT_CAP: 'junk' }), 4, 'junk -> default'); eq(recipientCap({ WHATSAPP_PUBLIC_RECIPIENT_CAP: '0' }), 4, 'zero -> default');

if (failed) { console.error(`\nrecipient cap: ${failed} FAILED, ${passed} passed`); process.exit(1); }
console.log(`recipient cap: ok (${passed} assertions)`);

// "לקוחות שמזמן לא הגיעו": first-name greeting, rows without a phone left out and counted, and the rules that were
// already there and must stay (90 days, her own tenant, consent, nothing sent automatically).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstNameOf, personaliseWinback, splitByPhone } from './lib/winback.ts';
import { computeLastVisits } from './lib/reminders/smartReminders.js';
import { canMarket, MARKETING_FOOTER, withMarketingFooter } from './lib/marketingConsent.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('first name: first word, no punctuation, no emoji, nothing for an empty name', () => {
  assert.equal(firstNameOf('מיכל כהן'), 'מיכל');
  assert.equal(firstNameOf('  דנה  '), 'דנה');
  assert.equal(firstNameOf('נועה-שרה לוי'), 'נועה-שרה');
  assert.equal(firstNameOf('רונית 💗 אברהם'), 'רונית');
  assert.equal(firstNameOf('ג׳ני כהן'), 'ג׳ני');
  assert.equal(firstNameOf(''), '');
  assert.equal(firstNameOf(null), '');
  assert.equal(firstNameOf('💗'), '');
});

ok('the greeting uses the first name only; a rewritten opening and a missing name are left alone', () => {
  const m = 'שלום!\nמזמן לא ראינו אותך';
  assert.equal(personaliseWinback(m, 'מיכל כהן'), 'שלום מיכל!\nמזמן לא ראינו אותך');
  assert.equal(personaliseWinback(m, ''), m);
  const custom = 'היי יקרה, מתגעגעים';
  assert.equal(personaliseWinback(custom, 'מיכל כהן'), custom);
  assert.equal(personaliseWinback('שלום! שלום!', 'דנה'), 'שלום דנה! שלום!'); // only the opening
});

ok('rows without a phone are left out and counted; the rest keep their order', () => {
  const rows = [
    { id: 'a', phone: '0501234567', hasPhone: true },
    { id: 'b', phone: null, hasPhone: false },
    { id: 'c', phone: '  ', hasPhone: true },
    { id: 'd', phone: '0527654321', hasPhone: true },
  ];
  const r = splitByPhone(rows);
  assert.deepEqual(r.reachable.map((x) => x.id), ['a', 'd']);
  assert.equal(r.noPhone, 2);
  assert.deepEqual(splitByPhone([]), { reachable: [], noPhone: 0 });
});

ok('a client with a future appointment is not lapsed: the last visit is the future date', () => {
  const today = '2026-10-16';
  const appts = [
    { client_id: 'old', date: '2026-06-01', confirmation_status: 'confirmed' },
    { client_id: 'booked', date: '2026-06-01', confirmation_status: 'confirmed' },
    { client_id: 'booked', date: '2026-11-03', confirmation_status: 'confirmed' },
    { client_id: 'cancelledFuture', date: '2026-06-01', confirmation_status: 'confirmed' },
    { client_id: 'cancelledFuture', date: '2026-11-03', confirmation_status: 'cancelled' },
  ];
  const last = computeLastVisits(appts) as Record<string, string>;
  const days = (d: string) => Math.floor((Date.parse(today) - Date.parse(d)) / 86400000);
  assert.ok(days(last.old) >= 90);
  assert.ok(days(last.booked) < 90, 'future appointment -> days is negative -> never listed');
  assert.ok(days(last.cancelledFuture) >= 90, 'a cancelled future appointment does not count');
});

ok('consent and opt-out still decide who may be messaged', () => {
  assert.equal(canMarket({ marketing_consent: true }), true);
  assert.equal(canMarket({ marketing_consent: true, marketing_opted_out_at: '2026-09-01' }), false);
  assert.equal(canMarket({}), false);
  assert.ok(withMarketingFooter('שלום!').includes(MARKETING_FOOTER));
});

ok('the API: her own tenant from the session, 90 days by default, consent, read only', () => {
  const r = rd('app/api/clients/lapsed/route.js');
  assert.match(r, /rpc\("get_user_tenant_id"\)/);
  assert.match(r, /const DEFAULT_DAYS = 90;/);
  assert.match(r, /canMarket\(client\)/);
  assert.match(r, /\.eq\("tenant_id", tenantId\)/);
  assert.doesNotMatch(r, /sendWhatsApp|\.insert\(|\.update\(|\.delete\(/);
});

ok('the screen: wa.me links only, first-name helper, no local full-name greeting, marketing footer on every link', () => {
  const m = rd('app/LapsedClientsModal.jsx');
  assert.match(m, /from '@\/lib\/winback'/);
  assert.match(m, /personaliseWinback\(message\.trim\(\), c\.name\)/);
  assert.doesNotMatch(m, /function personalise\(/);
  assert.match(m, /https:\/\/wa\.me\/\$\{digits\}\?text=\$\{encodeURIComponent\(withMarketingFooter\(text\)\)\}/);
  // the only requests are the list read and the "she tapped" mark: nothing that sends
  const urls = [...m.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)].map((x) => x[1].split('?')[0]);
  assert.deepEqual(urls.sort(), ['/api/clients/lapsed', '/api/clients/lapsed/mark']);
  assert.match(m, /splitByPhone\(/);
});

ok('nothing in the lib helper sends, fetches or reads a clock', () => {
  const s = rd('lib/winback.ts');
  assert.doesNotMatch(s, /fetch\(|sendWhatsApp|Date\.now|new Date/);
});

console.log(`${n} passed`);

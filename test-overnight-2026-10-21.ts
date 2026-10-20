// The overnight improvement pass (2026-10-21): each fix pinned to the failure it closes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillPhonesFromClients } from './lib/reminders/dailyReminders.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// ── reminders for appointments she booked in the app ─────────────────────────
await ok('an in-app appointment (client_id, no client_phone) takes the phone from her client card, same tenant only', async () => {
  const rows: Array<Record<string, unknown>> = [
    { id: 'a1', tenant_id: 't1', client_id: 'c1', client_phone: null },
    { id: 'a2', tenant_id: 't1', client_id: 'c2', client_phone: '' },
    { id: 'a3', tenant_id: 't1', client_id: 'c3', client_phone: '0501112222' },
    { id: 'a4', tenant_id: 't1', client_id: 'cX', client_phone: null }, // client of ANOTHER tenant: never borrowed
    { id: 'a5', tenant_id: 't1', client_id: null, client_phone: null },
  ];
  const asked: string[][] = [];
  const db = { from: (t: string) => ({ select: () => ({ in: async (_c: string, ids: string[]) => {
    assert.equal(t, 'clients'); asked.push(ids);
    return { data: [
      { id: 'c1', tenant_id: 't1', phone: '0523334444' },
      { id: 'c2', tenant_id: 't1', phone: '' },
      { id: 'cX', tenant_id: 't2', phone: '0549999999' },
    ], error: null };
  } }) }) };
  const filled = await fillPhonesFromClients(db, rows);
  assert.equal(filled, 1);
  assert.equal(rows[0].client_phone, '0523334444');
  assert.equal(rows[1].client_phone, '', 'a card with no phone leaves it empty (still reported as no phone)');
  assert.equal(rows[2].client_phone, '0501112222', 'the appointment\'s own phone wins');
  assert.equal(rows[3].client_phone, null, 'another business\'s client is never used');
  assert.deepEqual(asked, [['c1', 'c2', 'cX']]);
});

await ok('a failed client read changes nothing and never throws (the old "no phone" skip, not a wrong number)', async () => {
  const rows: Array<Record<string, unknown>> = [{ id: 'a1', tenant_id: 't1', client_id: 'c1', client_phone: null }];
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'down' } }) }) }) };
  assert.equal(await fillPhonesFromClients(db, rows), 0);
  assert.equal(rows[0].client_phone, null);
  const throws = { from: () => { throw new Error('boom'); } };
  assert.equal(await fillPhonesFromClients(throws, rows), 0);
});

await ok('the reminder cron reads client_id and fills phones before deciding who has none', () => {
  const r = rd('lib/reminders/dailyReminders.js');
  assert.match(r, /client_phone, client_id, tenant_id/);
  assert.ok(r.indexOf('await fillPhonesFromClients(db, rows)') < r.indexOf('STATUS_NO_PHONE)); continue;'));
});

// ── editing an appointment never moves it ───────────────────────────────────
await ok('an existing appointment off the picker grid keeps its own time, shown as "השעה הנוכחית"', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /const apptKeepOwnTime = !!editingAppointmentId && Number\.isFinite\(apptRequestedStart\) && !apptSlotOptions\.includes\(apptRequestedStart\);/);
  assert.match(a, /apptSlotOptions\.includes\(apptRequestedStart\) \|\| apptKeepOwnTime \? apptRequestedStart/);
  assert.match(a, /\(השעה הנוכחית\)/);
  // zero rows back is not "updated"
  assert.match(a, /if\(!data\?\.length\)\{toast\("התור לא נמצא, אולי נמחק במכשיר אחר/);
});

await ok('the app\'s "tomorrow" is one calendar day, not 24 hours', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /const tomorrow = formatDate\(new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\)\+1, 12\)\);/);
  assert.doesNotMatch(a, /const tomorrow = formatDate\(new Date\(now\.getTime\(\)\+86400000\)\)/);
  // the spring-forward night in Israel (2027-03-26 is a Friday): Thursday 23:30 -> Friday
  const thu = new Date(2027, 2, 25, 23, 30);
  const t = new Date(thu.getFullYear(), thu.getMonth(), thu.getDate() + 1, 12);
  assert.equal(t.getDate(), 26);
});

// ── refunds ────────────────────────────────────────────────────────────────
await ok('a refund is claimed on the server before Grow is called, released on refusal, and voids the receipt', () => {
  const r = rd('app/api/grow/refund/route.ts');
  const claim = r.indexOf(".eq('status', 'paid').or(`error.is.null,error.neq.${REFUND_CLAIM}`)");
  const call = r.indexOf('createLiveOps(grow.wallet).refund(');
  assert.ok(claim > 0 && call > claim, 'claim first, then Grow');
  assert.match(r, /if \(!claim\.data\?\.length\) return NextResponse\.json\(\{ success: false, error: 'ההחזר של התשלום הזה כבר בתהליך/);
  assert.match(r, /\.eq\('error', REFUND_CLAIM\)/, 'a refusal releases only its own claim');
  assert.match(r, /from\('receipt_voids'\)\.insert\(\{ receipt_id: p\.receipt_id, tenant_id: c\.tenantId/);
  assert.doesNotMatch(r, /\.delete\(/);
});

// ── a new business's first day ────────────────────────────────────────────────
await ok('the booking page never shows the "העסק שלי" placeholder to a client', () => {
  const b = rd('app/BookingPage.jsx');
  assert.doesNotMatch(b, /settings\?\.business_name \|\| "העסק שלי"/);
  assert.match(b, /s !== "העסק שלי"/);
  assert.match(b, /\|\| "קביעת תור";/);
});

await ok('unticking a field drops the treatments she picked from it', () => {
  const o = rd('app/onboarding/page.tsx');
  assert.match(o, /setPickedServices\(\(prev\) => prev\.filter\(\(p\) => !p\.field \|\| \(fields as string\[\]\)\.includes\(p\.field\)\)\);/);
});

await ok('a half-typed colour stays a draft; only a full #RRGGBB reaches the button and her branding', () => {
  const o = rd('app/onboarding/page.tsx');
  assert.match(o, /if \(\/\^#\[0-9a-f\]\{6\}\$\/i\.test\(v\)\) \{ setColorDraft\(null\); setData\(\{ \.\.\.data, primary_color: v \}\); \}/);
});

await ok('login blames the password only for a real credentials refusal', () => {
  const l = rd('app/login/page.tsx');
  assert.match(l, /invalid login credentials/i);
  assert.match(l, /אין חיבור לאינטרנט כרגע/);
  assert.match(l, /היו יותר מדי ניסיונות/);
});

await ok('"קבלה" is not used for a payment confirmation in the fee flow and the service tooltip', () => {
  assert.doesNotMatch(rd('app/FeeQuestions.jsx'), /החיוב עבר והקבלה נרשמה/);
  assert.doesNotMatch(rd('app/beautyos.jsx'), /בשום תור, קבלה, חבילה/);
});

console.log(`${n} passed`);

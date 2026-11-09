// Smart waitlist: who a freed slot is offered to, when it is NOT offered, and what she is told. Offline: a fake database and a fake
// sender; nothing real is ever sent. (The 10-at-once accept test runs against a real database: scripts/smoke/smart-waitlist.mjs.)
import assert from 'node:assert/strict';
import { entryFitsSlot, offerQuietReason, weekdayOf, phoneKey } from './lib/waitlistMatch.js';
import { offerFreedSlot, afterWaitlistWin, waitlistSettings, offerMessage, takenMessage, classifySend } from './lib/waitlistOffers.js';
import { isReservedTestNumber } from './lib/phone.ts';

// ── fit ──
// 2026-10-26 is a Monday.
assert.equal(weekdayOf('2026-10-26'), 1);
const slot = { date: '2026-10-26', startMinute: 10 * 60, service: 'לק ג׳ל' };
assert.ok(entryFitsSlot({ service: 'לק ג׳ל' }, slot), 'no window = any day, any time');
assert.ok(!entryFitsSlot({ service: 'פדיקור' }, slot), 'other treatment');
assert.ok(entryFitsSlot({ service: 'לק ג׳ל', pref_days: [1, 3] }, slot));
assert.ok(!entryFitsSlot({ service: 'לק ג׳ל', pref_days: [0, 2] }, slot), 'Monday not chosen');
assert.ok(entryFitsSlot({ service: 'לק ג׳ל', pref_from_minute: 420, pref_to_minute: 720 }, slot), 'morning window holds 10:00');
assert.ok(!entryFitsSlot({ service: 'לק ג׳ל', pref_from_minute: 960, pref_to_minute: 1320 }, slot), 'evening window does not');
assert.ok(!entryFitsSlot({ service: 'לק ג׳ל', pref_from_minute: 420, pref_to_minute: 600 }, slot), 'window end is exclusive');
assert.ok(entryFitsSlot({ service: 'לק ג׳ל', preferred_date: '2026-10-26' }, slot));
assert.ok(!entryFitsSlot({ service: 'לק ג׳ל', preferred_date: '2026-10-27' }, slot), 'a chosen date must be that date');
assert.equal(phoneKey('050-123-4567'), phoneKey('+972501234567'));

// ── quiet (Israel is UTC+2 from 25 Oct 2026) ──
assert.equal(offerQuietReason(new Date('2026-10-24T09:00:00Z')), 'shabbat', 'Saturday noon');
assert.equal(offerQuietReason(new Date('2026-10-26T01:00:00Z')), 'night', 'Monday 03:00');
assert.equal(offerQuietReason(new Date('2026-10-26T08:00:00Z')), null, 'Monday 10:00');
assert.equal(offerQuietReason(new Date('2026-10-26T19:30:00Z')), 'night', 'Monday 21:30');
assert.equal(offerQuietReason(new Date('2026-10-26T06:30:00Z')), null, 'Monday 08:30');
assert.equal(offerQuietReason(new Date('2026-10-26T05:30:00Z')), 'night', 'Monday 07:30');

// ── test numbers ──
assert.ok(isReservedTestNumber('0500000002') && isReservedTestNumber('+972500000042') && isReservedTestNumber('050-000-0099'));
assert.ok(!isReservedTestNumber('0501234567') && !isReservedTestNumber('0521234567') && !isReservedTestNumber(''));

// ── a tiny database ──
function makeDb(tables: Record<string, any[]>, failOn: string[] = []) {
  const log: string[] = [];
  const db: any = {
    tables, log,
    from(name: string) {
      let rows = [...(tables[name] || (tables[name] = []))];
      let mode = 'select', patch: any = null, wantCount = false, head = false;
      const f: any = {
        select(_c?: string, o?: any) { if (o?.count) wantCount = true; if (o?.head) head = true; return f; },
        eq(c: string, v: any) { rows = rows.filter((r) => r[c] === v); return f; },
        neq(c: string, v: any) { rows = rows.filter((r) => r[c] !== v); return f; },
        in(c: string, vs: any[]) { rows = rows.filter((r) => vs.includes(r[c])); return f; },
        gte(c: string, v: any) { rows = rows.filter((r) => r[c] >= v); return f; },
        like(c: string, p: string) { const re = new RegExp('^' + p.replace(/%/g, '.*') + '$'); rows = rows.filter((r) => re.test(String(r[c] ?? ''))); return f; },
        update(p: any) { mode = 'update'; patch = p; return f; },
        insert(r: any) { mode = 'insert'; patch = r; return f; },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        then(res: any, rej: any) {
          log.push(`${mode} ${name}`);
          if (failOn.includes(name)) return Promise.resolve({ data: null, error: { message: 'down' } }).then(res, rej);
          if (mode === 'insert') { tables[name].push({ id: `${name}-${tables[name].length + 1}`, created_at: new Date().toISOString(), ...patch }); return Promise.resolve({ error: null }).then(res, rej); }
          if (mode === 'update') { for (const r of rows) Object.assign(r, patch); return Promise.resolve({ error: null }).then(res, rej); }
          return Promise.resolve({ data: head ? null : rows, count: wantCount ? rows.length : null, error: null }).then(res, rej);
        },
      };
      return f;
    },
  };
  return db;
}

const T = 'tenant-1';
const NOW = new Date('2026-10-26T06:00:00Z'); // Monday 08:00 Israel
const appt = { id: 'a1', date: '2026-10-26', start_minute: 14 * 60, hour: 14, duration: 45, service: 'לק ג׳ל', client_id: 'c-cancel' };
const waiter = (id: string, name: string, phone: string, extra: any = {}) => ({ id, tenant_id: T, status: 'waiting', client_name: name, phone, service: 'לק ג׳ל', created_at: `2026-10-0${id}T10:00:00Z`, ...extra });

function world(over: any = {}) {
  return makeDb({
    settings: [{ tenant_id: T, business_name: 'סטודיו נועה', automations: { waitlist_offers: true }, ...over.settings }],
    appointments: [{ tenant_id: T, date: '2026-10-26', start_minute: 14 * 60, duration: 45, confirmation_status: 'cancelled' }, ...(over.appts || [])],
    waitlist: over.waitlist || [
      waiter('1', 'דנה', '0500000011'),
      waiter('2', 'מיכל', '0500000012', { pref_days: [2] }),                              // Tuesday only: no fit on a Monday
      waiter('3', 'רות', '0500000013'),                                                    // opted out below
      waiter('4', 'שירה', '0500000014', { pref_from_minute: 780, pref_to_minute: 1080 }), // 13:00-18:00 fits 14:00
      waiter('5', 'נעה', '0500000015', { client_id: 'c-cancel' }),                         // the one who cancelled
      waiter('6', 'ליאת', '0500000016', { pref_to_minute: 720 }),                          // mornings only: no fit
    ],
    clients: over.clients || [{ tenant_id: T, id: 'c-rut', phone: '0500000013', marketing_opted_out_at: '2026-10-01T00:00:00Z' }, { tenant_id: T, id: 'c-cancel', phone: '0500000015' }],
    slot_offers: over.slot_offers || [],
    whatsapp_messages: over.messages || [],
  });
}

function harness(db: any, sendResult: any = { ok: true }) {
  const sent: any[] = []; const notes: any[] = [];
  let n = 0;
  return {
    sent, notes,
    args: {
      db, tenantId: T, appt, baseUrl: 'https://kalmea.example', now: NOW,
      send: async (phone: string, text: string, o: any) => { sent.push({ phone, text, o }); return sendResult; },
      notify: async (x: any) => { notes.push(x); },
      newToken: () => `wl${String(++n).padStart(32, '0')}`,
    } as any,
  };
}

// Off by default: nothing is read, nothing is sent.
{
  const db = world({ settings: { automations: {} } }); const h = harness(db);
  const r = await offerFreedSlot(h.args);
  assert.equal(r.status, 'off'); assert.equal(h.sent.length, 0); assert.ok(!db.log.some((l: string) => l.includes('waitlist')), 'the waiting list is not even read');
}
assert.deepEqual(waitlistSettings({}), { enabled: false, paused: false, quiet: false, cap: 6 });
assert.equal(waitlistSettings({ waitlist_offers: 'true' }).enabled, false, 'only a literal true turns it on');
assert.equal(waitlistSettings({ waitlist_daily_cap: 10 }).cap, 10);
assert.equal(waitlistSettings({ waitlist_daily_cap: 999 }).cap, 6);

// The master pause and a break.
for (const [auto, want] of [[{ waitlist_offers: true, paused: true }, 'paused'], [{ waitlist_offers: true, quiet: true }, 'break']] as const) {
  const h = harness(world({ settings: { automations: auto } })); const r = await offerFreedSlot(h.args);
  assert.equal(r.status, want); assert.equal(h.sent.length, 0);
}

// The normal run: offers to דנה and שירה only, in the order they joined.
{
  const db = world(); const h = harness(db);
  const r: any = await offerFreedSlot(h.args);
  assert.equal(r.status, 'offered'); assert.equal(r.offered, 2);
  assert.deepEqual(h.sent.map((s) => s.phone), ['0500000011', '0500000014']);
  assert.equal(r.skipped.opted_out, 1); assert.equal(r.skipped.cancelled_client, 1); assert.equal(r.skipped.no_fit, 2);
  for (const s of h.sent) {
    assert.equal(s.o.type, 'waitlist_offer'); assert.equal(s.o.tenantId, T);
    assert.match(s.text, /https:\/\/kalmea\.example\/claim\/wl0+[12]/); assert.match(s.text, /הסר/); assert.match(s.text, /סטודיו נועה/); assert.match(s.text, /26\/10/); assert.match(s.text, /14:00/);
  }
  const rows = db.tables.slot_offers; assert.equal(rows.length, 2);
  assert.ok(rows.every((o: any) => o.status === 'sent' && o.token.startsWith('wl') && o.slot_start_minute === 840 && o.service === 'לק ג׳ל'));
  assert.ok(new Date(rows[0].expires_at).getTime() - NOW.getTime() <= 240 * 60000, 'link lives at most 4 hours');
  assert.equal(h.notes.length, 1); assert.match(h.notes[0].body, /שלחתי הצעה ל-2/); assert.doesNotMatch(h.notes[0].body, /מחכ/);
  // Run again for the same slot: nobody is offered it twice.
  const again = harness(db); const r2: any = await offerFreedSlot(again.args);
  assert.equal(r2.status, 'no_match'); assert.equal(again.sent.length, 0); assert.equal(r2.skipped.already_offered, 2);
}

// Queued (central number off) is never called sent.
{
  const h = harness(world(), { ok: false, queued: true }); const r: any = await offerFreedSlot(h.args);
  assert.equal(r.status, 'offered'); assert.equal(r.counts.queued, 2); assert.equal(r.counts.sent, 0);
  assert.match(h.notes[0].body, /מחכות ב"הודעות מוכנות לשליחה"/); assert.doesNotMatch(h.notes[0].body, /שלחתי/); assert.match(h.notes[0].title, /מחכות/);
}

// A demo / blocked / failed send leaves no live link behind.
for (const res of [{ ok: false, demoBlocked: true }, { ok: false, error: 'x' }]) {
  const db = world(); const h = harness(db, res); const r = await offerFreedSlot(h.args);
  assert.equal(r.status, 'nothing_offered'); assert.equal(h.notes.length, 0, 'no "I offered it" line for an offer nobody got');
  assert.ok(db.tables.slot_offers.every((o: any) => o.status === 'cancelled'));
}

// Shabbat and night: not sent, she is told who is waiting.
for (const when of ['2026-10-24T09:00:00Z', '2026-10-26T19:30:00Z']) {
  const h = harness(world()); const r = await offerFreedSlot({ ...h.args, now: new Date(when), appt: { ...appt, date: '2026-10-28' } });
  assert.equal(r.status, 'quiet_hours'); assert.equal(h.sent.length, 0); assert.equal(h.notes.length, 1); assert.match(h.notes[0].body, /בשבת ובלילה/);
}

// The daily cap: counted from the log of the last 24 hours.
{
  const msgs = Array.from({ length: 6 }, (_, i) => ({ tenant_id: T, message_type: 'waitlist_offer', created_at: '2026-10-26T01:00:00Z', id: `m${i}` }));
  const h = harness(world({ messages: msgs })); const r = await offerFreedSlot(h.args);
  assert.equal(r.status, 'daily_cap'); assert.equal(h.sent.length, 0); assert.match(h.notes[0].body, /התקרה/);
  const h2 = harness(world({ messages: msgs.slice(0, 5) })); const r2 = await offerFreedSlot(h2.args);
  assert.equal(r2.offered, 1, 'one offer of room left'); assert.equal(h2.sent.length, 1);
  const old = msgs.map((m) => ({ ...m, created_at: '2026-10-24T01:00:00Z' }));
  assert.equal((await offerFreedSlot(harness(world({ messages: old })).args)).status, 'offered', 'yesterday does not count');
}

// Too soon, taken again, unreadable things: nothing goes out.
{
  const soon = harness(world()); assert.equal((await offerFreedSlot({ ...soon.args, now: new Date('2026-10-26T10:30:00Z') })).status, 'too_soon');
  const taken = harness(world({ appts: [{ tenant_id: T, date: '2026-10-26', start_minute: 14 * 60 + 15, duration: 30, confirmation_status: 'pending' }] }));
  assert.equal((await offerFreedSlot(taken.args)).status, 'slot_taken'); assert.equal(taken.sent.length, 0);
  const db = world(); const realFrom = db.from.bind(db); db.from = (n: string) => (n === 'clients' ? makeDb({}, ['clients']).from('clients') : realFrom(n));
  const noClients = harness(db); assert.equal((await offerFreedSlot(noClients.args)).status, 'clients_unreadable', 'cannot prove nobody opted out -> sends nothing');
  assert.equal(noClients.sent.length, 0);
  const other = harness(world()); assert.equal((await offerFreedSlot({ ...other.args, appt: { ...appt, service: 'פדיקור' } })).status, 'no_match');
  assert.equal((await offerFreedSlot({ ...other.args, appt: { ...appt, kind: 'personal' } })).status, 'personal_block');
  assert.equal((await offerFreedSlot({ ...other.args, tenantId: '' })).status, 'bad_input');
  assert.equal((await offerFreedSlot({ ...other.args, db: { from() { throw new Error('boom'); } } })).status, 'error', 'a database that throws is a reason, not an exception');
}

// ── after someone accepts ──
{
  const db = world(); const h = harness(db); await offerFreedSlot(h.args);
  const [first, second] = db.tables.slot_offers;
  first.status = 'claimed'; first.claimed_at = NOW.toISOString(); second.status = 'superseded';
  const w = harness(db, { ok: true });
  const r: any = await afterWaitlistWin({ db, send: w.args.send, notify: w.args.notify, tenantId: T, token: first.token, claimed: { slot_date: '2026-10-26', slot_start_minute: 840, slot_hour: 14, service: 'לק ג׳ל', client_name: 'דנה', phone: '0500000011' } });
  assert.equal(r.status, 'won'); assert.equal(r.losers, 1);
  assert.deepEqual(w.sent.map((s) => s.phone), ['0500000014']);
  assert.equal(w.sent[0].o.type, 'waitlist_taken'); assert.match(w.sent[0].text, /כבר נתפס/); assert.doesNotMatch(w.sent[0].text, /הסר/);
  assert.equal(db.tables.waitlist.find((x: any) => x.id === '1').status, 'booked', 'the winner leaves the list');
  assert.equal(db.tables.waitlist.find((x: any) => x.id === '4').status, 'waiting', 'the others stay on it');
  assert.equal(w.notes.length, 1); assert.match(w.notes[0].body, /דנה תפסה את התור/); assert.match(w.notes[0].body, /1 אחרת קיבלה הודעה עדינה/);
  // an offer from the "offer it?" card (no prefix) is not ours
  const o: any = await afterWaitlistWin({ db, send: w.args.send, notify: w.args.notify, tenantId: T, token: 'abcdef', claimed: {} });
  assert.equal(o.status, 'not_waitlist');
}

// ── wording ──
assert.match(offerMessage({ name: 'דנה', clinic: 'נועה', service: 'לק', date: '2026-10-26', minute: 840, url: 'u' }), /^שלום דנה! 🌸/);
assert.match(takenMessage({ name: '', clinic: 'נועה', service: 'לק', date: '2026-10-26', minute: 840 }), /^שלום 🌸/);
assert.equal(classifySend({ ok: true }), 'sent'); assert.equal(classifySend({ queued: true }), 'queued'); assert.equal(classifySend({ demoBlocked: true }), 'blocked'); assert.equal(classifySend(null), 'failed');

// ── a reserved test number only ever reaches the manual queue; no provider is called ──
{
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: any) => { calls.push(String(u)); throw new Error('no network in tests'); }) as any;
  try {
    const { sendWhatsApp } = await import('./lib/whatsapp.js');
    const r: any = await sendWhatsApp('0500000011', 'שלום', { type: 'waitlist_offer', tenantId: T, name: 'דנה' });
    assert.equal(r.queued, true); assert.equal(r.reason, 'test_number'); assert.equal(r.ok, false);
    assert.ok(!calls.some((u) => /green-api|graph\.facebook/.test(u)), 'no provider was called');
  } finally { globalThis.fetch = realFetch; }
}

console.log('smart waitlist: ok');

// Smart waitlist + rebook nudges (2026-11-09). Offline: fake databases and fake senders; nothing real is ever sent.
//   waitlist: OFF by default (opt-in: her switch true), never while the platform flag is false; compatible (shorter) treatments; "any treatment" entries;
//             the toast she sees after cancelling; the "what happened" history; a deposit hold that ran out is offered too.
//   rebook:   opt-in the same way; per-service "return after N days" (with name-based suggestions), no future booking, once per visit, a cooldown,
//             consent; the daily engine and the "who gets a reminder today" list agree.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { waitlistOffersOn, waitlistOffersVisible, waitlistOfferToast } from './lib/waitlistFlag.js';
import { offerFreedSlot, afterWaitlistWin, compatibleServices } from './lib/waitlistOffers.js';
import { entryFitsSlot, chooseRecipients } from './lib/waitlistMatch.js';
import { waitlistActivity } from './lib/waitlistActivity.js';
import { releaseExpiredHolds } from './lib/grow/cancelFees.ts';
import {
  rebookOn, rebookVisible, cleanRebookDays, typedRebookDays, suggestedRebookDays, intervalFor, rebookDue, rebookToday, parseRebookRef, rebookRef, rebookText, COOLDOWN_DAYS,
} from './lib/reminders/rebookPlan.js';
import { runSmartReminders } from './lib/reminders/smartReminders.js';
import { canMarket } from './lib/marketingConsent.js';
import { automationSuggestions } from './lib/automationSuggest.js';
import { offerMessage } from './lib/waitlistText.js';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8');

// ── the switch ──────────────────────────────────────────────────────────────
await ok('waitlist offers: off by default, on only by her literal true, never with the platform flag off', () => {
  assert.equal(waitlistOffersOn({}), false);
  assert.equal(waitlistOffersOn(null), false);
  assert.equal(waitlistOffersOn({ automations: { waitlist_offers: 'true' } }), false, 'only a literal true');
  assert.equal(waitlistOffersOn({ automations: { waitlist_offers: true } }), true);
  assert.equal(waitlistOffersOn({ automations: { waitlist_offers: true, feature_flags: { waitlist_offers: false } } }), false);
  assert.equal(waitlistOffersOn({ automations: { waitlist_offers: true }, feature_flags: { waitlist_offers: false } }), false, 'the dedicated column too');
  assert.equal(waitlistOffersVisible({ automations: { waitlist_offers: false } }), true, 'her off still shows the switch');
  assert.equal(waitlistOffersVisible({ automations: { feature_flags: { waitlist_offers: false } } }), false);
});

// ── a tiny database (same shape as test-waitlist-offers.ts) ────────────────
function makeDb(tables: Record<string, any[]>) {
  const db: any = {
    tables,
    from(name: string) {
      let rows = [...(tables[name] || (tables[name] = []))];
      let mode = 'select', patch: any = null, wantCount = false, head = false;
      const f: any = {
        select(_c?: string, o?: any) { if (o?.count) wantCount = true; if (o?.head) head = true; return f; },
        eq(c: string, v: any) { rows = rows.filter((r) => r[c] === v); return f; },
        neq(c: string, v: any) { rows = rows.filter((r) => r[c] !== v); return f; },
        in(c: string, vs: any[]) { rows = rows.filter((r) => vs.includes(r[c])); return f; },
        gte(c: string, v: any) { rows = rows.filter((r) => r[c] >= v); return f; },
        order() { return f; },
        like(c: string, p: string) { const re = new RegExp('^' + p.replace(/%/g, '.*') + '$'); rows = rows.filter((r) => re.test(String(r[c] ?? ''))); return f; },
        range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length }); },
        update(p: any) { mode = 'update'; patch = p; return f; },
        insert(r: any) {
          if (name === 'auto_reminders_log') { tables[name].push(r); return Promise.resolve({ error: null }); }
          mode = 'insert'; patch = r; return f;
        },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        then(res: any, rej: any) {
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

const T = 'tenant-wl';
const NOW = new Date('2026-10-26T06:00:00Z'); // Monday 08:00 Israel
// A 60-minute facial at 14:00 is cancelled.
const appt = { id: 'a1', date: '2026-10-26', start_minute: 14 * 60, duration: 60, service: 'טיפול פנים', client_id: 'c-cancel' };
const waiter = (id: string, name: string, phone: string, service: string | null, extra: any = {}) => ({ id, tenant_id: T, status: 'waiting', client_name: name, phone, service, created_at: `2026-10-0${id}T10:00:00Z`, ...extra });
function wlWorld(over: any = {}) {
  return makeDb({
    settings: [{ tenant_id: T, business_name: 'סטודיו נועה', automations: over.automations ?? { waitlist_offers: true } }],
    appointments: [{ tenant_id: T, date: '2026-10-26', start_minute: 14 * 60, duration: 60, confirmation_status: 'cancelled' }],
    service_prices: [
      { tenant_id: T, name: 'טיפול פנים', duration: 60, active: true },
      { tenant_id: T, name: 'עיצוב גבות', duration: 30, buffer_minutes: 10, active: true },  // 40 <= 60: compatible
      { tenant_id: T, name: 'פילינג עמוק', duration: 90, active: true },                     // too long
      { tenant_id: T, name: 'שפם', duration: 15, active: false },                              // archived
    ],
    waitlist: over.waitlist ?? [
      waiter('1', 'רוני לוי', '0500000021', 'עיצוב גבות'),   // compatible, joined first
      waiter('2', 'דנה', '0500000022', 'טיפול פנים'),          // exact, joined later: offered first
      waiter('3', 'מאיה', '0500000023', 'פילינג עמוק'),        // does not fit
      waiter('4', 'שני', '0500000024', 'שפם'),                 // archived service: not compatible
      waiter('5', 'ליה', '0500000025', null),                  // any treatment: offered the freed one
    ],
    clients: [],
    slot_offers: [],
    whatsapp_messages: [],
  });
}
function harness(db: any, sendResult: any = { ok: true }) {
  const sent: any[] = []; const notes: any[] = [];
  let k = 0;
  return {
    sent, notes,
    args: {
      db, tenantId: T, appt, baseUrl: 'https://kalmea.example', now: NOW,
      send: async (phone: string, text: string, o: any) => { sent.push({ phone, text, o }); return sendResult; },
      notify: async (x: any) => { notes.push(x); },
      newToken: () => `wl${String(++k).padStart(32, '0')}`,
    } as any,
  };
}

await ok('compatible treatments: shorter ones that fit with their buffer, active only', () => {
  const m = compatibleServices([
    { name: 'א', duration: 30, buffer_minutes: 10 }, { name: 'ב', duration: 66 }, { name: 'ג', duration: 20, active: false }, { name: 'טיפול', duration: 30 }, { name: 'ד', duration: 50, buffer_minutes: 15 },
  ], { service: 'טיפול', duration: 60, buffer: 5 });
  assert.deepEqual([...m.keys()], ['א', 'ד'], 'ד is 65 <= 60 + 5');
  const slot = { date: '2026-10-26', startMinute: 600, service: 'טיפול', compatible: m };
  assert.ok(entryFitsSlot({ service: 'א' }, slot));
  assert.ok(!entryFitsSlot({ service: 'ב' }, slot));
  const { chosen } = chooseRecipients([
    { id: 'x', phone: '0500000031', service: 'א', created_at: '2026-01-01' },
    { id: 'y', phone: '0500000032', service: 'טיפול', created_at: '2026-02-01' },
  ], { slot });
  assert.deepEqual(chosen.map((c: any) => c.id), ['y', 'x'], 'exact treatment first, then compatible');
});

await ok('with her switch on, a freed slot is offered, exact first, compatible ones with their own treatment', async () => {
  const db = wlWorld(); const h = harness(db);
  const r: any = await offerFreedSlot(h.args);
  assert.equal(r.status, 'offered');
  assert.deepEqual(h.sent.map((s) => s.phone), ['0500000022', '0500000021', '0500000025']);
  const rows = db.tables.slot_offers;
  assert.equal(rows.find((o: any) => o.phone === '0500000022').service, 'טיפול פנים');
  const brows = rows.find((o: any) => o.phone === '0500000021');
  assert.equal(brows.service, 'עיצוב גבות'); assert.equal(brows.duration, 30, 'books her own treatment, with its own duration');
  assert.match(h.sent[1].text, /לעיצוב גבות/);
  assert.equal(rows.find((o: any) => o.phone === '0500000025').service, 'טיפול פנים', '"any treatment" gets the freed one');
  assert.deepEqual(r.names, ['דנה', 'רוני', 'ליה'], 'first names, for the line she reads');
  assert.match(h.notes[0].body, /שלחתי הצעה ל-3 מרשימת ההמתנה \(דנה, רוני, ליה\)/);
  assert.ok(!h.sent.some((s) => s.phone === '0500000023' || s.phone === '0500000024'));
});

await ok('never switched on, switched off, or the platform flag off: nothing read, nothing sent', async () => {
  for (const automations of [{}, { waitlist_offers: false }, { waitlist_offers: true, feature_flags: { waitlist_offers: false } }]) {
    const h = harness(wlWorld({ automations }));
    assert.equal((await offerFreedSlot(h.args)).status, 'off'); assert.equal(h.sent.length, 0);
  }
});

await ok('the losers are told about THEIR treatment', async () => {
  const db = wlWorld(); const h = harness(db); await offerFreedSlot(h.args);
  const offers = db.tables.slot_offers;
  const win = offers.find((o: any) => o.phone === '0500000022');
  win.status = 'claimed'; win.claimed_at = NOW.toISOString();
  for (const o of offers) if (o !== win) o.status = 'superseded';
  const w = harness(db);
  const r: any = await afterWaitlistWin({ db, send: w.args.send, notify: w.args.notify, tenantId: T, token: win.token, claimed: { slot_date: '2026-10-26', slot_start_minute: 840, service: 'טיפול פנים', client_name: 'דנה', phone: '0500000022' } });
  assert.equal(r.status, 'won');
  const toRoni = w.sent.find((s) => s.phone === '0500000021');
  assert.match(toRoni.text, /התור לעיצוב גבות/);
});

await ok('the toast after she cancels never says sent for a queued offer', () => {
  assert.match(waitlistOfferToast({ status: 'offered', counts: { sent: 2, queued: 0 }, names: ['דנה', 'שירה'] })!.text, /^הצענו את התור שהתפנה לדנה ולשירה/);
  const q = waitlistOfferToast({ status: 'offered', counts: { sent: 0, queued: 1 }, names: ['דנה'] })!;
  assert.match(q.text, /מחכה ב"הודעות מוכנות לשליחה"/); assert.doesNotMatch(q.text, /הצענו/); assert.equal(q.kind, 'info');
  assert.match(waitlistOfferToast({ status: 'quiet_hours' })!.text, /בבוקר/);
  for (const status of ['off', 'no_match', 'slot_taken', 'nothing_offered']) assert.equal(waitlistOfferToast({ status }), null);
  for (const t of [waitlistOfferToast({ status: 'offered', counts: { sent: 1 }, names: [] })!.text, waitlistOfferToast({ status: 'daily_cap' })!.text]) assert.ok(!t.includes('—'), 'no em dash in copy');
});

await ok('what happened: grouped per slot, the winner named, failed sends left out', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const items = waitlistActivity([
    { token: 'wl1', slot_date: '2026-10-26', slot_start_minute: 840, service: 'טיפול פנים', client_name: 'דנה כהן', status: 'claimed', claimed_at: 'x', created_at: '2026-10-26T06:00:00Z' },
    { token: 'wl2', slot_date: '2026-10-26', slot_start_minute: 840, service: 'טיפול פנים', client_name: 'שירה', status: 'superseded', created_at: '2026-10-26T06:00:00Z' },
    { token: 'wl3', slot_date: '2026-10-27', slot_start_minute: 600, service: 'גבות', client_name: 'ליה', status: 'sent', expires_at: '2026-10-26T14:00:00Z', created_at: '2026-10-26T07:00:00Z' },
    { token: 'wl4', slot_date: '2026-10-28', slot_start_minute: 600, service: 'גבות', client_name: 'נעה', status: 'cancelled', created_at: '2026-10-26T08:00:00Z' },
    { token: 'abc', slot_date: '2026-10-29', slot_start_minute: 600, client_name: 'gap fill card', status: 'sent', created_at: '2026-10-26T09:00:00Z' },
  ], now);
  assert.equal(items.length, 2, 'the failed send and the non-waitlist offer are not listed');
  assert.equal(items[0].outcome, 'open'); assert.match(items[0].line, /^הצענו את התור ב-27\/10 בשעה 10:00 \(גבות\) לליה\. עוד לא נתפס/);
  assert.equal(items[1].outcome, 'won'); assert.match(items[1].line, /לדנה ולשירה\. דנה תפסה אותו והוא ביומן\./);
});

// ── a deposit hold that ran out is a freed slot ─────────────────────────────
await ok('releaseExpiredHolds tells the hook about each released appointment, and nothing else', async () => {
  const consents = [
    { id: 'k1', tenant_id: T, appointment_id: 'ap1', status: 'awaiting_deposit' },
    { id: 'k2', tenant_id: T, appointment_id: 'ap2', status: 'awaiting_deposit' },  // paid meanwhile -> confirmed, not released
    { id: 'k3', tenant_id: T, appointment_id: 'ap3', status: 'awaiting_deposit' },  // already cancelled by her -> not released here
  ];
  const told: string[] = [];
  const d: any = {
    now: () => NOW,
    repo: {
      listExpiredHolds: async () => consents,
      getDepositPayment: async (_t: string, id: string) => (id === 'ap2' ? { id: 'p2', status: 'paid' } : { id: `p-${id}`, status: 'created' }),
      releaseAppointment: async (_t: string, id: string) => id === 'ap1',
      confirmAppointment: async () => true,
      updateConsent: async () => {},
    },
    grow: { updatePayment: async () => {} },
  };
  const r = await releaseExpiredHolds(d, undefined, (t: string, id: string) => { told.push(`${t}:${id}`); throw new Error('the hook may fail'); });
  assert.deepEqual(r, { released: 1, confirmed: 1, errors: 0 }, 'a failing hook changes nothing');
  assert.deepEqual(told, [`${T}:ap1`]);
  assert.deepEqual(await releaseExpiredHolds({ ...d, repo: { ...d.repo, listExpiredHolds: async () => [] } }), { released: 0, confirmed: 0, errors: 0 }, 'no hook: as before');
});

await ok('every way a slot frees reaches the offer', () => {
  assert.match(read('app/api/confirm/route.ts'), /runWaitlistOffer\(\{ tenantId: appt\.tenant_id, appt/);
  assert.match(read('app/api/grow/release-holds/route.ts'), /releaseExpiredHolds\(deps, undefined, offerFreedHold\)/);
  assert.match(read('app/api/availability/route.ts'), /releaseExpiredHolds\(deps, tenantId, offerFreedHold\)/);
  assert.match(read('app/api/book-appointment/route.js'), /releaseExpiredHolds\(policyDeps, activeTenantId, offerFreedHold\)/);
  const app = read('app/beautyos.jsx');
  assert.match(app, /if \(waitlistOffersOn\(settings\) && appt\.kind !== "personal"\)/, 'her own cancel, when she turned it on');
  assert.match(app, /waitlistOfferToast\(j\)/, 'and she is told what happened');
  assert.ok(!/automations\?\.waitlist_offers === true/.test(app), 'no opt-in check left behind');
  assert.match(read('lib/cancelNotify.js'), /autoOffer: waitlistOffersOn\(settingsRow\)/);
  assert.match(read('lib/waitlistRuntime.js'), /if \(appt\.confirmation_status !== "cancelled"\) return \{ status: "not_cancelled"/, 'a hook offers only a really cancelled appointment');
  assert.ok(!/from "@\/lib\/waitlistOffers/.test(read('app/WaitlistOfferSetting.jsx')), 'the browser never imports the server module');
});

// ── rebook: the per-service number ──────────────────────────────────────────
await ok('rebook: off by default, on only by her literal true, never with the platform flag off', () => {
  assert.equal(rebookOn({}), false);
  assert.equal(rebookOn({ automations: { rebook_enabled: 'true' } }), false);
  assert.equal(rebookOn({ automations: { rebook_enabled: false } }), false);
  assert.equal(rebookOn({ automations: { rebook_enabled: true } }), true);
  assert.equal(rebookOn({ automations: { rebook_enabled: true, feature_flags: { rebook_nudges: false } } }), false);
  assert.equal(rebookVisible({ automations: { rebook_enabled: false } }), true);
  assert.equal(rebookVisible({ feature_flags: { rebook_nudges: false } }), false);
});

await ok('rebook days: stored values and suggestions by treatment', () => {
  assert.equal(cleanRebookDays(''), null); assert.equal(cleanRebookDays(null), null); assert.equal(cleanRebookDays('x'), null);
  assert.equal(cleanRebookDays(0), 0); assert.equal(cleanRebookDays(-3), 0); assert.equal(cleanRebookDays(3), 7); assert.equal(cleanRebookDays(999), 365); assert.equal(cleanRebookDays('28'), 28);
  assert.equal(suggestedRebookDays('לק ג׳ל'), 21);
  assert.equal(suggestedRebookDays("בניית ציפורניים ג'ל"), 21);
  assert.equal(suggestedRebookDays('פדיקור רפואי'), 28);
  assert.equal(suggestedRebookDays('עיצוב גבות'), 28);
  assert.equal(suggestedRebookDays('הרמת ריסים'), 42);
  assert.equal(suggestedRebookDays('טיפול פנים קלאסי'), 35);
  assert.equal(suggestedRebookDays('שעווה רגליים'), 28, 'legs (רגליים) is not gel');
  assert.equal(suggestedRebookDays('הסרת שיער בלייזר'), 42);
  assert.equal(suggestedRebookDays('מיקרובליידינג'), 0, 'not a repeat treatment');
  assert.equal(suggestedRebookDays('ייעוץ'), null);
  assert.equal(suggestedRebookDays('משהו', 'nails'), 21);
  assert.deepEqual(intervalFor({ row: { name: 'לק ג׳ל', rebook_days: 18 }, visitDates: [], businessDefault: 35 }), { days: 18, source: 'service' });
  assert.deepEqual(intervalFor({ row: { name: 'לק ג׳ל', rebook_days: 0 }, visitDates: [], businessDefault: 35 }), { days: null, source: 'off' });
  assert.deepEqual(intervalFor({ row: { name: 'לק ג׳ל' }, visitDates: ['2026-01-01', '2026-01-26', '2026-02-20'], businessDefault: 35 }), { days: 25, source: 'rhythm' });
  assert.deepEqual(intervalFor({ row: { name: 'לק ג׳ל' }, visitDates: ['2026-01-01'], businessDefault: 35 }), { days: 21, source: 'suggested' });
  assert.deepEqual(intervalFor({ row: { name: 'ייעוץ' }, visitDates: ['2026-01-01'], businessDefault: 35 }), { days: 35, source: 'default' });
  assert.deepEqual(parseRebookRef(rebookRef('2026-10-01', '2026-10-22', 'לק ג׳ל')), { visit: '2026-10-01', nudged: '2026-10-22', service: 'לק ג׳ל' });
  assert.deepEqual(parseRebookRef('2026-10-01'), { visit: '2026-10-01', nudged: null, service: null }, 'the older whole-client key');
  assert.equal(parseRebookRef('garbage'), null);
});

const RT = 'tenant-rb';
const TODAY = '2026-11-09';
const ap = (client: string, date: string, service: string, extra: any = {}) => ({ id: `${client}-${date}`, client_id: client, tenant_id: RT, date, service, confirmation_status: 'confirmed', ...extra });
const menu = [
  { tenant_id: RT, name: 'לק ג׳ל', duration: 60, active: true, rebook_days: 20 },   // her own number
  { tenant_id: RT, name: 'טיפול פנים', duration: 60, active: true },                 // automatic: suggestion 35
  { tenant_id: RT, name: 'מיקרובליידינג', duration: 120, active: true },             // suggestion 0: never
  { tenant_id: RT, name: 'פדיקור', duration: 45, active: true, rebook_days: 0 },     // she said never
  { tenant_id: RT, name: 'ישן', duration: 30, active: false, rebook_days: 14 },      // archived
];
const rbAppts = [
  ap('a', '2026-10-20', 'לק ג׳ל'),                                   // 20 days, her number 20 -> due (no grace for her own number)
  ap('b', '2026-10-21', 'לק ג׳ל'),                                   // 19 days -> not yet
  ap('c', '2026-10-01', 'טיפול פנים'),                               // 39 days, suggestion 35 + 2 grace -> due
  ap('d', '2026-10-20', 'לק ג׳ל'), ap('d', '2026-11-20', 'לק ג׳ל'),  // booked -> never
  ap('e', '2026-10-20', 'לק ג׳ל'), ap('e', '2026-11-20', 'לק ג׳ל', { confirmation_status: 'cancelled' }), // a cancelled future one does not count
  ap('f', '2026-09-01', 'מיקרובליידינג'),                            // never a nudge
  ap('g', '2026-10-01', 'פדיקור'),                                    // she said never
  ap('h', '2026-10-20', 'ישן'),                                       // archived service
  ap('i', '2026-10-20', 'לק ג׳ל'), ap('i', '2026-10-30', 'טיפול פנים'), // gel due by its own visit, even though the last visit was a facial
  ap('j', '2026-08-01', 'לק ג׳ל'),                                   // 100 days: past the window, left to win-back
];

await ok('rebook due, per service', () => {
  const due = rebookDue({ appointments: rbAppts, today: TODAY, servicesFor: () => menu, defaultDaysFor: () => 35 });
  const by = Object.fromEntries(due.map((d: any) => [d.clientId, d]));
  assert.deepEqual(Object.keys(by).sort(), ['a', 'c', 'e', 'i']);
  assert.equal(by.a.source, 'service'); assert.equal(by.a.interval, 20); assert.equal(by.a.referenceId, `2026-10-20|${TODAY}|לק ג׳ל`);
  assert.equal(by.c.source, 'suggested'); assert.equal(by.c.interval, 35);
  assert.equal(by.i.service, 'לק ג׳ל', 'the last visit OF THAT SERVICE');
});

await ok('rebook: once per visit, a cooldown after any nudge, and the older key still counts', () => {
  const base = { appointments: rbAppts, today: TODAY, servicesFor: () => menu, defaultDaysFor: () => 35 };
  const ids = (logRows: any[]) => rebookDue({ ...base, logRows }).map((d: any) => d.clientId).sort();
  // a was nudged for this very visit 5 days ago (cooldown) ; c had an old whole-client nudge for its last visit.
  assert.deepEqual(ids([
    { tenant_id: RT, client_id: 'a', reference_id: `2026-10-20|2026-11-04|לק ג׳ל` },
    { tenant_id: RT, client_id: 'c', reference_id: '2026-10-01' },
  ]), ['e', 'i']);
  // A nudge longer ago than the cooldown, for an EARLIER visit, does not block this one.
  const old = `2026-09-01|2026-09-${String(30 - COOLDOWN_DAYS + 9).padStart(2, '0')}|לק ג׳ל`;
  assert.ok(ids([{ tenant_id: RT, client_id: 'a', reference_id: old }]).includes('a'));
  // Another business's log row is not hers.
  assert.ok(ids([{ tenant_id: 'other', client_id: 'a', reference_id: `2026-10-20|2026-11-08|לק ג׳ל` }]).includes('a'));
});

await ok('the nudge text: her voice, her link, the opt-out line, no em dash', () => {
  const t = rebookText({ name: 'רונית', businessName: 'סטודיו נועה', service: 'לק ג׳ל', daysSince: 21, url: 'https://kalmea.example/book?t=x' });
  assert.match(t, /רונית/); assert.match(t, /3 שבועות/); assert.match(t, /סטודיו נועה \(לק ג׳ל\)/); assert.match(t, /הגיע הזמן לטיפול הבא/);
  assert.match(t, /https:\/\/kalmea\.example\/book\?t=x/); assert.match(t, /הסר/); assert.ok(!t.includes('—'));
});

// ── the engine and the list agree ───────────────────────────────────────────
function rbWorld(automations: any = { rebook_enabled: true }) {
  const client = (id: string, extra: any = {}) => ({ id, tenant_id: RT, name: `לקוחה ${id}`, phone: `05000001${id.charCodeAt(0)}`, marketing_consent: true, ...extra });
  return {
    settings: [{ tenant_id: RT, business_name: 'סטודיו', business_fields: ['nails'], automations }],
    clients: [client('a'), client('b'), client('c', { marketing_consent: false }), client('d'), client('e', { phone: null }), client('f'), client('g'), client('h'), client('i', { marketing_opted_out_at: '2026-10-01T00:00:00Z' }), client('j')],
    appointments: rbAppts,
    packages: [] as any[],
    service_prices: menu,
    auto_reminders_log: [] as any[],
  };
}
const sender = () => { const calls: any[] = []; return { calls, send: async (phone: string, message: string, o: any) => { calls.push({ phone, message, ...o }); return { ok: false, queued: true }; } }; };
const now = new Date('2026-11-09T10:00:00Z');

await ok('the daily engine: per service, consent, logged with the new key, then the cooldown', async () => {
  const w = rbWorld();
  const s = sender();
  await runSmartReminders({ db: makeDb(w as any), send: s.send, now } as any);
  const rb = s.calls.filter((c) => c.type === 'auto_rebook');
  assert.deepEqual(rb.map((c) => c.name).sort(), ['לקוחה a'], 'c has no consent, e no phone, i opted out');
  assert.match(rb[0].message, /\/book\?t=tenant-rb/); assert.match(rb[0].message, /הסר/);
  const logged = w.auto_reminders_log.filter((r: any) => r.reminder_type === 'rebook');
  assert.deepEqual(logged.map((r: any) => r.reference_id), [`2026-10-20|2026-11-09|לק ג׳ל`]);
  // Tomorrow: a is inside the cooldown and is not nudged again; b reaches her 20 days and is.
  const s2 = sender();
  await runSmartReminders({ db: makeDb(w as any), send: s2.send, now: new Date('2026-11-10T10:00:00Z') } as any);
  assert.deepEqual(s2.calls.filter((c) => c.type === 'auto_rebook').map((c) => c.name), ['לקוחה b']);
  // Never switched on, or switched off: nothing at all.
  for (const automations of [{}, { rebook_enabled: false }]) {
    const s3 = sender();
    await runSmartReminders({ db: makeDb(rbWorld(automations) as any), send: s3.send, now } as any);
    assert.equal(s3.calls.filter((c) => c.type === 'auto_rebook').length, 0);
  }
});

await ok('"who gets a reminder today" is the same list, with the reasons', () => {
  const w = rbWorld();
  const plan = rebookToday({ settings: w.settings[0], clients: w.clients, appointments: w.appointments, services: menu, logRows: [], today: TODAY, canMarket, defaultDays: 21 });
  assert.equal(plan.on, true);
  assert.deepEqual(plan.ready.map((x: any) => x.name), ['לקוחה a']);
  assert.deepEqual(plan.skipped.map((x: any) => `${x.name}:${x.reason}`).sort(), ['לקוחה c:no_consent', 'לקוחה e:no_phone', 'לקוחה i:no_consent']);
  const after = rebookToday({ settings: w.settings[0], clients: w.clients, appointments: w.appointments, services: menu, logRows: [{ tenant_id: RT, client_id: 'a', reference_id: `2026-10-20|${TODAY}|לק ג׳ל` }], today: TODAY, canMarket, defaultDays: 21 });
  assert.deepEqual(after.ready.map((x: any) => x.name), []); assert.deepEqual(after.sentToday.map((x: any) => x.name), ['לקוחה a']);
  assert.equal(rebookToday({ settings: { automations: { rebook_enabled: false } }, clients: [], appointments: [], services: [], logRows: [], today: TODAY, canMarket, defaultDays: 21 }).on, false);
});

await ok('settings, services and the migration', () => {
  const app = read('app/beautyos.jsx');
  assert.match(app, /<RebookSetting autos=\{autos\} setAutos=\{setAutos\}/);
  assert.ok(!/label="תזכורת לקבוע את התור הבא" on=\{autos\.rebook_enabled===true\}/.test(app), 'the old opt-in row is replaced, not duplicated');
  assert.match(app, /"buffer_minutes", "rebook_days"\]/, 'saved with the service');
  assert.match(app, /OPTIONAL_SERVICE_COLS = \["field", "requires_deposit", "buffer_minutes", "rebook_days"\]/, 'and dropped, not failed, before the migration');
  assert.match(app, /data-testid="service-rebook"/);
  assert.match(app, /disabled=\{!rebookColumnReady\}/, 'the field waits for the migration');
  const setting = read('app/RebookSetting.jsx');
  assert.match(setting, /\/api\/rebook\/today/); assert.match(setting, /rebook_nudges === false\) return null/);
  const route = read('app/api/rebook/today/route.js');
  assert.match(route, /get_user_tenant_id/); assert.ok(!/searchParams/.test(route), 'the tenant never comes from the request');
  assert.ok(!/phone:/.test(route.slice(route.indexOf('const pick'))), 'no phone numbers in the list');
  const mig = 'supabase/migrations/add_service_rebook_days_2026-11-09.sql';
  assert.ok(existsSync(mig));
  const sql = read(mig);
  assert.match(sql, /add column if not exists rebook_days smallint/); assert.match(sql, /rebook_days between 7 and 365/);
  assert.ok(!/\bdrop (table|column)\b/i.test(sql), 'nothing dropped');
  for (const f of ['app/RebookSetting.jsx', 'app/WaitlistActivity.jsx', 'app/WaitlistOfferSetting.jsx', 'lib/waitlistFlag.js', 'lib/waitlistActivity.js', 'lib/reminders/rebookPlan.js']) {
    const src = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!src.includes('—'), `no em dash in ${f}`);
  }
});

await ok('the suggestion card: only for a switch never stored, with the exact message, dismissible', () => {
  const settings = { tenant_id: 'tid', business_name: 'סטודיו נועה', automations: {} };
  const now = new Date('2026-11-09T10:00:00Z');
  const items = automationSuggestions(settings, { services: [{ name: 'עיצוב גבות', active: true }], origin: 'https://app.example', now });
  assert.deepEqual(items.map((i: any) => i.switchKey), ['waitlist_offers', 'rebook_enabled']);
  assert.equal(items[0].question, 'להציע אוטומטית תורים שהתפנו לרשימת ההמתנה?');
  assert.equal(items[1].question, 'לשלוח ללקוחות תזכורת כשמגיע הזמן לטיפול הבא?');
  // The preview IS the message the feature sends.
  assert.equal(items[0].preview, offerMessage({ name: 'רונית', clinic: 'סטודיו נועה', service: 'עיצוב גבות', date: '2026-11-12', minute: 840, url: 'https://app.example/claim/…' }));
  assert.equal(items[1].preview, rebookText({ name: 'רונית', businessName: 'סטודיו נועה', service: 'עיצוב גבות', daysSince: 21, url: 'https://app.example/book?t=tid' }));
  const keys = (automations: any, extra: any = {}) => automationSuggestions({ ...extra, automations }, { now }).map((i: any) => i.key);
  assert.deepEqual(keys({ waitlist_offers: true }), ['rebook'], 'already on: not asked');
  assert.deepEqual(keys({ waitlist_offers: false, rebook_enabled: false }), [], 'she turned them off in Settings: not asked again');
  assert.deepEqual(keys({ automation_suggest_dismissed: { waitlist: true } }), ['rebook'], 'לא עכשיו hides it for good');
  assert.deepEqual(keys({ feature_flags: { waitlist_offers: false, rebook_nudges: false } }), [], 'platform flag off: no card');
  for (const i of items) { assert.ok(!(i.question + i.body + i.preview).includes('—'), 'no em dash'); }
  const app = read('app/beautyos.jsx');
  assert.match(app, /<AutomationSuggestCard settings=\{settings\}/);
  assert.match(app, /saveAutomationsKey\(key, true\)/, 'one tap stores her switch as true');
  assert.match(read('app/AutomationSuggestCard.jsx'), /להפעיל/);
});

// ── PR #39 review ───────────────────────────────────────────────────────────
await ok('review 1: typing "21" into the empty field stays 21; the range applies on blur and on save', () => {
  // Keystroke by keystroke, as the input reports it.
  let field: number | null = null;
  for (const typed of ['2', '21']) field = typedRebookDays(typed);
  assert.equal(field, 21, 'the first digit is not clamped to 7');
  assert.equal(typedRebookDays(''), null); assert.equal(typedRebookDays('4x5'), 45); assert.equal(typedRebookDays('12345'), 123);
  assert.equal(cleanRebookDays(typedRebookDays('3')), 7, 'on blur / save: below the minimum becomes 7');
  assert.equal(cleanRebookDays(typedRebookDays('900')), 365);
  const app = read('app/beautyos.jsx');
  assert.match(app, /onChange=\{e=>patchDraftService\(idx,\{rebook_days:typedRebookDays\(e\.target\.value\)\}\)\}/, 'no clamp per keystroke');
  assert.match(app, /onBlur=\{e=>\{const v=cleanRebookDays\(e\.target\.value\)/, 'clamped on blur');
  assert.match(app, /rebook_days: cleanRebookDays\(s\.rebook_days\)/, 'and on save, even without a blur');
});

await ok('review 2: a service menu that cannot be read stops the rebook nudges (fail closed)', async () => {
  const w: any = rbWorld();
  w.service_prices = [...menu, { tenant_id: RT, name: 'לק ג׳ל', duration: 60, active: true, rebook_days: 0 }].filter((r) => r.name !== 'לק ג׳ל' || r.rebook_days === 0);
  // With the menu readable, gel is "never" (0): nobody gets a gel nudge.
  const s0 = sender();
  await runSmartReminders({ db: makeDb(w), send: s0.send, now } as any);
  assert.equal(s0.calls.filter((c) => c.type === 'auto_rebook' && /לק ג׳ל/.test(c.message)).length, 0);
  // The menu read fails: the run must NOT fall back to automatic days (which would nudge gel). No rebook nudge at all.
  for (const failure of [{ data: null, error: { message: 'down' }, count: null }, null]) {
    const db = makeDb(rbWorld() as any); const real = db.from.bind(db);
    db.from = (t: string) => {
      if (t !== 'service_prices') return real(t);
      const q: any = real(t);
      // null = a read that does not finish: a page shorter than the count it claims.
      q.range = () => Promise.resolve(failure || { data: [{ id: 'x1', tenant_id: RT, name: 'x', duration: 30 }], error: null, count: 5 });
      return q;
    };
    const s = sender();
    const { stats } = await runSmartReminders({ db, send: s.send, now } as any) as any;
    assert.equal(s.calls.filter((c) => c.type === 'auto_rebook').length, 0, 'no nudge from a menu we could not read');
    assert.ok(stats.incomplete.includes('service_prices'), 'and the run says so (the route raises its ops alert)');
  }
  const route = read('app/api/rebook/today/route.js');
  assert.match(route, /sv\.error \|\| !cl\.complete/); assert.match(route, /!sv\.complete\)/);
  assert.ok(!/sv\.error \? \[\]/.test(route), 'the today list no longer falls back either');
});

await ok('review 3: a compatible treatment with no buffer of its own uses the business default', () => {
  const menu3 = [{ name: 'קצר', duration: 50, buffer_minutes: null }, { name: 'אפס', duration: 55, buffer_minutes: 0 }];
  assert.deepEqual([...compatibleServices(menu3, { service: 'X', duration: 60 }).keys()], ['קצר', 'אפס'], 'no default: both fit');
  assert.deepEqual([...compatibleServices(menu3, { service: 'X', duration: 60, businessDefault: 15 }).keys()], ['אפס'], '50 + 15 > 60; her own 0 stays 0');
  assert.match(read('lib/waitlistOffers.js'), /businessDefault: businessBufferDefault\(settingsRow\?\.branding\)/);
});

// ── security audit of the routes this branch added or changed ──────────────
await ok('security: session first, tenant from the session, rate limited, no phone numbers to the browser', () => {
  for (const f of ['app/api/waitlist/activity/route.js', 'app/api/rebook/today/route.js', 'app/api/waitlist/offer/route.js']) {
    const src = read(f);
    const body = src.slice(src.indexOf('export async function'));
    const auth = body.indexOf('auth.getUser()');
    const tenant = body.indexOf('get_user_tenant_id');
    const firstAdmin = body.search(/admin\.from\(|readAllRows\(admin|runWaitlistOffer\(/);
    assert.ok(auth > 0 && tenant > auth && firstAdmin > tenant, `${f}: auth and tenant before any service-role query`);
    assert.ok(body.indexOf('checkTenantLimit(tenantId') > tenant && body.indexOf('checkTenantLimit(tenantId') < firstAdmin, `${f}: rate limited before the work`);
    assert.ok(!/searchParams|body\.tenant|tenant_id:\s*body/.test(src), `${f}: the tenant never comes from the request`);
    // every service-role query names the session tenant (or, for the offer, the appointment it read under it)
    for (const m of body.matchAll(/admin\.from\("(\w+)"\)[^;]*/g)) assert.match(m[0], /tenant/, `${f}: ${m[1]} is tenant scoped`);
  }
  assert.match(read('app/api/waitlist/offer/route.js'), /requireActiveTenant\(supabase\)/, 'the write keeps the plan guard');
  const offer = read('app/api/waitlist/offer/route.js');
  assert.match(offer, /return Response\.json\(\{ success: true, status: r\.status, offered: r\.offered \|\| 0, counts: r\.counts \|\| null, names:/, 'only the toast fields leave');
  assert.ok(!/\.\.\.r \}/.test(offer));
  assert.ok(!/phone/.test(read('app/api/waitlist/activity/route.js').match(/\.select\("([^"]+)"\)/g)!.join(' ')), 'activity never reads phones');
  const today = read('app/api/rebook/today/route.js');
  assert.ok(!/phone/.test(today.slice(today.indexOf('const pick'))), 'today list: no phones');
  // first names only in the history lines
  const items = waitlistActivity([{ token: 'wl1', slot_date: '2026-10-26', slot_start_minute: 600, client_name: 'דנה כהן', phone: '0500000000', status: 'sent', expires_at: '2099-01-01', created_at: 'x' }]);
  assert.ok(!/כהן|0500000000/.test(JSON.stringify(items)));
  // the hold-release hook acts only on a hold the database really released (a conditional update): a public caller of
  // availability cannot make it offer the same slot twice, and it re-reads the appointment by id AND tenant
  const rt = read('lib/waitlistRuntime.js');
  assert.match(rt, /\.eq\("id", appointmentId\)\.eq\("tenant_id", tenantId\)/);
  // the platform flag cannot be set from the browser
  assert.match(read('lib/settingsColumns.ts'), /AUTOMATIONS_PROTECTED_KEYS = \['feature_flags'/);
});

console.log(`waitlist + rebook: ${n} ok`);

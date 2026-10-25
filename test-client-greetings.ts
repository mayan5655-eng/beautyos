// Personal greetings (birthday / "שנה אצלי" / holiday): who is eligible, when it may go, how often, and that nothing real is ever called.
import assert from 'node:assert/strict';
import {
  normalizeGreetings, greetingsOwnBirthday, planGreetings, selectDue, sendWindow, buildGreeting, nextOpenDay, anniversaryIn,
  skipKey, logKey, GREETING_TYPES, DEFAULT_DAILY_CAP, MAX_DAILY_CAP, DEFAULT_TEXTS,
} from './lib/greetings/greetings.js';
import { firstVisitsOf, queueGreetingsForTenant, planForTenant } from './lib/greetings/run.js';
import { holidaysBetween, isYomTov } from './lib/greetings/calendar.ts';
import { MARKETING_FOOTER } from './lib/marketingConsent.js';
import { makeCapDb } from './testkit/capDb.js';

const T = 'tenant-fake-1';
// Tuesday 27 Oct 2026, 11:00 in Israel (UTC+2 after the clocks went back on the 25th).
const NOW = new Date('2026-10-27T09:00:00Z');
const TODAY = '2026-10-27';

const yes = { marketing_consent: true, marketing_consent_at: '2026-01-01T00:00:00Z', marketing_opted_out_at: null };
const mk = (id: string, extra: Record<string, unknown> = {}) => ({ id, tenant_id: T, name: `לקוחה ${id}`, phone: '0501234567', status: 'active', birthday: '', ...yes, ...extra });
const on = (extra: Record<string, unknown> = {}) => normalizeGreetings({ birthday: { enabled: true }, anniversary: { enabled: true }, holiday: { enabled: true }, ...extra });
const plan = (o: Record<string, unknown>) => planGreetings({ today: TODAY, from: TODAY, to: '2026-11-02', businessName: 'סטודיו נועה', isYomTov, holidays: [], ...o } as never);

// ── the config: everything OFF unless she switched it on ──
{
  const off = normalizeGreetings(undefined);
  assert.deepEqual(['birthday', 'anniversary', 'holiday'].map((k) => (off as any)[k].enabled), [false, false, false], 'default: all off');
  assert.deepEqual(normalizeGreetings({ birthday: { enabled: 'true' } }).birthday.enabled, false, 'only a literal true turns it on');
  assert.equal(normalizeGreetings('junk').birthday.enabled, false);
  assert.equal(normalizeGreetings({ daily_cap: 9999 }).daily_cap, MAX_DAILY_CAP);
  assert.equal(normalizeGreetings({ daily_cap: 0 }).daily_cap, DEFAULT_DAILY_CAP);
  assert.deepEqual(normalizeGreetings({ holiday: { enabled: true, holidays: ['pesach', 'nonsense'] } }).holiday.holidays, ['pesach']);
  assert.equal(normalizeGreetings({ birthday: { text: 'א'.repeat(900), gift: 'ב'.repeat(300) } }).birthday.text.length, 400);
  assert.equal(normalizeGreetings({ birthday: { gift: 'ב'.repeat(300) } }).birthday.gift.length, 80);
  assert.equal(greetingsOwnBirthday({}), false);
  assert.equal(greetingsOwnBirthday({ greetings: { birthday: { enabled: true } } }), true);
  assert.equal(greetingsOwnBirthday({ greetings: { birthday: { enabled: false } } }), false);
}

// ── eligibility: consent, opt-out, phone, archived ──
{
  const cfg = on();
  const clients = [
    mk('ok', { birthday: '1990-10-28' }),
    mk('noconsent', { birthday: '1990-10-28', marketing_consent: false }),
    mk('optedout', { birthday: '1990-10-28', marketing_opted_out_at: '2026-06-01T00:00:00Z' }),
    mk('nofield', { birthday: '1990-10-28', marketing_consent: undefined }),
    mk('nophone', { birthday: '1990-10-28', phone: '' }),
    mk('archived', { birthday: '1990-10-28', status: 'archived' }),
  ];
  const r = plan({ clients, config: cfg });
  assert.deepEqual(r.items.map((i: any) => i.clientId), ['ok'], 'only the client with consent on file and no opt-out');
  const reasons = Object.fromEntries(r.held.map((h: any) => [h.clientId, h.reason]));
  assert.equal(reasons.noconsent, 'no_consent');
  assert.equal(reasons.optedout, 'no_consent');
  assert.equal(reasons.nofield, 'no_consent', 'a row without the consent field fails closed');
  assert.equal(reasons.nophone, 'no_phone');
  assert.ok(!('archived' in reasons), 'archived cards are simply left out');
  assert.ok(r.items[0].message.includes(MARKETING_FOOTER), 'every greeting carries the removal line');
}

// ── nothing happens while a switch is off ──
{
  const clients = [mk('a', { birthday: '1990-10-28' })];
  assert.equal(plan({ clients, config: normalizeGreetings({}) }).items.length, 0, 'all off = nobody');
  assert.equal(plan({ clients, config: normalizeGreetings({ anniversary: { enabled: true } }) }).items.length, 0, 'only the switched-on occasion');
}

// ── once per client per occasion per year ──
{
  const cfg = on();
  const clients = [mk('a', { birthday: '1990-10-27' })];
  const first = plan({ clients, config: cfg });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].ref, '2026');
  const sent = new Set([logKey('a', GREETING_TYPES.birthday, '2026')]);
  const again = plan({ clients, config: cfg, sent });
  assert.equal(again.items.length, 0, 'queued once this year: never again');
  assert.equal(again.held[0].reason, 'already_sent');
  assert.equal(plan({ clients, config: cfg, sent: new Set([logKey('a', GREETING_TYPES.birthday, '2025')]) }).items.length, 1, 'last year does not block this year');
  assert.equal(plan({ clients, config: cfg, sent: new Set([logKey('a', 'birthday', '2026')]) }).items.length, 0, 'the older automatic birthday message of the same year counts too');
}

// ── birthday: day, Feb 29, Shabbat, catch-up window ──
{
  const cfg = on();
  const c = [mk('b', { birthday: '1990-10-29' })];
  const r = plan({ clients: c, config: cfg });
  assert.equal(r.items[0].sendOn, '2026-10-29', 'goes on her day');
  assert.equal(selectDue({ items: r.items, today: TODAY }).selected.length, 0, 'not due before her day');
  assert.equal(selectDue({ items: r.items, today: '2026-10-29' }).selected.length, 1);

  assert.equal(anniversaryIn('2000-02-29', 2027), '2027-02-28', 'Feb 29 falls on Feb 28 in a normal year');
  assert.equal(anniversaryIn('2000-02-29', 2028), '2028-02-29');

  // 31 Oct 2026 is a Saturday: the greeting waits for Sunday instead of going on Shabbat.
  const sat = plan({ clients: [mk('s', { birthday: '1990-10-31' })], config: cfg, to: '2026-11-03' });
  assert.equal(sat.items[0].sendOn, '2026-11-01', 'a Shabbat birthday goes on Sunday');
  assert.equal(nextOpenDay('2026-10-31'), '2026-11-01');

  // two days late (cap, Shabbat) still goes; a week late does not.
  const late = plan({ clients: [mk('l', { birthday: '1990-10-25' })], config: cfg });
  assert.equal(late.items[0]?.sendOn, TODAY, 'two days late: still goes, today');
  assert.equal(plan({ clients: [mk('l', { birthday: '1990-10-20' })], config: cfg }).items.length, 0, 'a week late: too late, skipped');
  // early January sees the late-December birthday of the old year
  const jan = planGreetings({ clients: [mk('j', { birthday: '1990-12-31' })], config: cfg, today: '2027-01-01', from: '2027-01-01', to: '2027-01-07', businessName: 'x', isYomTov });
  assert.equal(jan.items[0]?.ref, '2026');
}

// ── "שנה אצלי" ──
{
  const cfg = on();
  const clients = [mk('n1'), mk('n2'), mk('n3')];
  const appts = [
    { client_id: 'n1', date: '2025-10-28', confirmation_status: 'confirmed' },
    { client_id: 'n1', date: '2026-03-01', confirmation_status: 'confirmed' },
    { client_id: 'n2', date: '2026-10-20', confirmation_status: 'confirmed' }, // first visit this very year: not an anniversary
    { client_id: 'n3', date: '2025-10-28', confirmation_status: 'cancelled' }, // never came
    { client_id: 'n3', date: '2027-01-01', confirmation_status: 'confirmed' }, // future
  ];
  const fv = firstVisitsOf(appts, TODAY);
  assert.deepEqual(fv, { n1: '2025-10-28', n2: '2026-10-20' });
  const r = plan({ clients, config: cfg, firstVisit: fv });
  assert.deepEqual(r.items.map((i: any) => [i.clientId, i.occasion, i.ref]), [['n1', 'anniversary', '2026']]);
  assert.ok(r.items[0].message.includes('שנה'));
}

// ── holiday: two days before, never after the eve, only chosen holidays, not on a yom tov ──
{
  const hol = holidaysBetween(NOW, 200);
  assert.ok(hol.find((h) => h.key === 'hanukkah' && h.date === '2026-12-05'));
  const clients = [mk('h')];
  const cfg = on({ holiday: { enabled: true, holidays: ['hanukkah'] } });
  // Hanukkah starts on a Saturday: the greeting goes Thursday 3 Dec (two days before), not on Shabbat.
  const r = planGreetings({ clients, config: cfg, holidays: hol, today: '2026-12-03', from: '2026-12-03', to: '2026-12-09', businessName: 'סטודיו נועה', isYomTov });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].sendOn, '2026-12-03');
  assert.equal(r.items[0].ref, 'hanukkah-2026');
  assert.ok(r.items[0].message.includes('חנוכה'), 'the holiday greeting names the holiday');
  // not before its day, not on the holiday itself
  assert.equal(planGreetings({ clients, config: cfg, holidays: hol, today: '2026-12-01', from: '2026-12-01', to: '2026-12-01', businessName: 'x', isYomTov }).items.length, 0);
  assert.equal(planGreetings({ clients, config: cfg, holidays: hol, today: '2026-12-05', from: '2026-12-05', to: '2026-12-05', businessName: 'x', isYomTov }).items.length, 0, 'on the holiday it is too late');
  // a holiday she did not pick sends nothing
  assert.equal(planGreetings({ clients, config: on({ holiday: { enabled: true, holidays: ['pesach'] } }), holidays: hol, today: '2026-12-03', from: '2026-12-03', to: '2026-12-09', businessName: 'x', isYomTov }).items.length, 0);
  // once per holiday per year
  const done = new Set([logKey('h', GREETING_TYPES.holiday, 'hanukkah-2026')]);
  assert.equal(planGreetings({ clients, config: cfg, holidays: hol, today: '2026-12-03', from: '2026-12-03', to: '2026-12-09', businessName: 'x', isYomTov, sent: done }).items.length, 0);
}

// ── one greeting per client per day, birthday first ──
{
  const c = [mk('two', { birthday: '1990-12-03' })];
  const hol = [{ key: 'hanukkah', name: 'חנוכה', date: '2026-12-05' }];
  const r = planGreetings({ clients: c, config: on({ holiday: { enabled: true, holidays: ['hanukkah'] } }), holidays: hol, today: '2026-12-03', from: '2026-12-03', to: '2026-12-03', businessName: 'x', isYomTov });
  assert.deepEqual(r.items.map((i: any) => i.occasion), ['birthday']);
  assert.ok(r.held.some((h: any) => h.reason === 'one_a_day'));
}

// ── she unticked a name in the preview ──
{
  const cfg = on({ skip: [skipKey('a', 'birthday', '2026')] });
  const clients = [mk('a', { birthday: '1990-10-27' }), mk('b', { birthday: '1990-10-27' })];
  const r = plan({ clients, config: cfg });
  assert.equal(r.items.length, 2, 'the preview still lists her, unticked');
  assert.equal(r.items.find((i: any) => i.clientId === 'a').skipped, true);
  assert.deepEqual(selectDue({ items: r.items, today: TODAY }).selected.map((i: any) => i.clientId), ['b'], 'an unticked name is never queued');
}

// ── daily cap ──
{
  const clients = Array.from({ length: 30 }, (_, i) => mk(`c${i}`, { birthday: '1990-10-27' }));
  const r = plan({ clients, config: on() });
  const s = selectDue({ items: r.items, today: TODAY, alreadyToday: 0, cap: 10 });
  assert.equal(s.selected.length, 10);
  assert.equal(s.deferred.length, 20, 'the rest wait for tomorrow');
  assert.equal(selectDue({ items: r.items, today: TODAY, alreadyToday: 10, cap: 10 }).selected.length, 0, 'what was already queued today counts');
}

// ── Shabbat, holidays, night ──
{
  const il = (iso: string) => new Date(iso);
  assert.equal(sendWindow(NOW, { isYomTov }).ok, true, 'Tuesday 11:00');
  assert.equal(sendWindow(il('2026-10-31T10:00:00Z'), { isYomTov }).reason, 'shabbat', 'Saturday noon');
  assert.equal(sendWindow(il('2026-10-31T18:30:00Z'), { isYomTov }).ok, true, 'Saturday night 20:30');
  assert.equal(sendWindow(il('2026-10-27T01:00:00Z'), { isYomTov }).reason, 'night', '03:00');
  assert.equal(sendWindow(il('2026-10-27T19:30:00Z'), { isYomTov }).reason, 'night', '21:30');
  assert.equal(sendWindow(il('2027-04-22T09:00:00Z'), { isYomTov }).reason, 'holiday', 'first day of Pesach');
  assert.equal(sendWindow(il('2026-09-13T09:00:00Z'), { isYomTov }).reason, 'holiday', 'second day of Rosh Hashana');
  assert.equal(isYomTov('2026-09-14'), false);
}

// ── the message: her words, her gift, no leftovers ──
{
  const cfg = normalizeGreetings({ birthday: { enabled: true, text: 'היי {name}, מזל טוב מ{clinic}!', gift: 'לק במתנה' } });
  const m = buildGreeting({ occasion: 'birthday', cfg, name: 'רונית כהן', businessName: 'סטודיו נועה' });
  assert.ok(m.startsWith('היי רונית, מזל טוב מסטודיו נועה!'));
  assert.ok(m.includes('מתנה קטנה ממני: לק במתנה'));
  assert.ok(m.endsWith(MARKETING_FOOTER));
  for (const occ of ['birthday', 'anniversary', 'holiday']) {
    for (const bn of ['', 'העסק שלי', 'סטודיו נועה']) {
      for (const nm of ['', 'maya.cohen', 'דנה']) {
        const t = buildGreeting({ occasion: occ, cfg: normalizeGreetings({}), name: nm, businessName: bn, holidayKey: 'pesach' });
        assert.ok(!/[{}]/.test(t), `no placeholder left: ${occ}/${bn}/${nm}`);
        assert.ok(!/\sמ[.,!]|ל[.,!]\s/.test(t) && !/ {2}/.test(t), `no dangling clause: ${JSON.stringify(t)}`);
      }
    }
  }
  const fb = buildGreeting({ occasion: 'birthday', cfg: normalizeGreetings({}), name: 'דנה', businessName: 'x', birthdayFallbackGift: '10% הנחה' });
  assert.ok(fb.includes('10% הנחה'), 'falls back to her existing birthday gift line');
  assert.ok(!buildGreeting({ occasion: 'anniversary', cfg: normalizeGreetings({}), name: 'דנה', businessName: 'x', birthdayFallbackGift: '10% הנחה' }).includes('10%'), 'the birthday gift never leaks into other greetings');
  assert.ok(!/נשלח/.test(DEFAULT_TEXTS.birthday + DEFAULT_TEXTS.anniversary + DEFAULT_TEXTS.holiday), 'default copy promises nothing about sending');
}

// ── the job, end to end on a fake database and a fake sender ──
const holidaysFor = holidaysBetween;
const makeDb = (extraClients: any[] = [], automations: any = { greetings: { birthday: { enabled: true } } }) => makeCapDb({
  settings: [{ id: 's1', tenant_id: T, business_name: 'סטודיו נועה', automations }],
  clients: [mk('p1', { birthday: '1990-10-27' }), mk('p2', { birthday: '1990-10-27', marketing_consent: false }), ...extraClients],
  appointments: [],
  auto_reminders_log: [],
  whatsapp_messages: [],
});
{
  const db = makeDb();
  const calls: any[] = [];
  const send = async (phone: string, message: string, opts: any) => { calls.push({ phone, message, opts }); return { ok: false, queued: true }; };
  const r = await queueGreetingsForTenant({ db, send, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(r.queued, 1);
  assert.equal(r.sent, 0, 'queued is never reported as sent');
  assert.equal(calls.length, 1, 'only the client with consent');
  assert.equal(calls[0].opts.type, 'auto_greeting_birthday');
  assert.equal(calls[0].opts.tenantId, T);
  assert.equal(db.tables.auto_reminders_log.length, 1, 'logged so it never repeats');
  assert.deepEqual(db.tables.auto_reminders_log[0], { tenant_id: T, client_id: 'p1', reminder_type: 'greeting_birthday', reference_id: '2026' });
  // a second run the same day queues nothing
  const again = await queueGreetingsForTenant({ db, send, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(again.queued, 0);
  assert.equal(calls.length, 1, 'no duplicate');
  // she unticked her
  const db2 = makeDb([], { greetings: { birthday: { enabled: true }, skip: [skipKey('p1', 'birthday', '2026')] } });
  const none = await queueGreetingsForTenant({ db: db2, send, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(none.queued, 0);
  assert.equal(calls.length, 1);
}
{
  // off by default
  const db = makeDb([], {});
  let n = 0;
  const r = await queueGreetingsForTenant({ db, send: async () => { n++; return { ok: false, queued: true }; }, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(r.held, 'off');
  assert.equal(n, 0, 'switched off: nothing is called');
  // Shabbat and night: nothing is called, and the plan is never even read
  for (const [iso, why] of [['2026-10-31T10:00:00Z', 'shabbat'], ['2026-10-27T01:00:00Z', 'night']] as const) {
    const held = await queueGreetingsForTenant({ db: makeDb(), send: async () => { n++; return { ok: true }; }, tenantId: T, now: new Date(iso), holidaysFor, isYomTov });
    assert.equal(held.held, why);
  }
  assert.equal(n, 0);
  // a failed send is reported as failed, not queued, and not logged (it may try again within the catch-up days)
  const db3 = makeDb();
  const f = await queueGreetingsForTenant({ db: db3, send: async () => ({ ok: false, error: 'boom' }), tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(f.failed, 1);
  assert.equal(f.queued, 0);
  assert.equal(db3.tables.auto_reminders_log.length, 0);
  // the daily cap counts what is already in her queue
  const db4 = makeDb(Array.from({ length: 5 }, (_, i) => mk(`q${i}`, { birthday: '1990-10-27' })), { greetings: { birthday: { enabled: true }, daily_cap: 3 } });
  const sent: string[] = [];
  const capped = await queueGreetingsForTenant({ db: db4, send: async (p: string, _m: string, o: any) => { sent.push(o.name); return { ok: false, queued: true }; }, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(capped.queued, 3);
  assert.equal(capped.deferred, 3);
  // a preview is read-only
  const before = JSON.stringify(db4.tables);
  await planForTenant({ db: db4, tenantId: T, now: NOW, holidaysFor, isYomTov });
  assert.equal(JSON.stringify(db4.tables), before, 'planning writes nothing');
}

// ── OUTBOUND IS BLOCKED: the real sender, fake numbers, no network ──
{
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => { calls.push(String(url)); throw new Error('no network in tests'); }) as never;
  try {
    const { sendWhatsApp } = await import('./lib/whatsapp.js');
    for (const t of Object.values(GREETING_TYPES)) {
      const res: any = await sendWhatsApp('0501234567', 'בדיקה', { name: 'בדיקה', type: `auto_${t}`, tenantId: T });
      assert.equal(res.queued, true, `${t} is only ever queued for her`);
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'manual_type');
    }
    assert.ok(!calls.some((u) => /green-api|graph\.facebook|api\.whatsapp/i.test(u)), `nothing real was called: ${JSON.stringify(calls)}`);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(process.env.GREENAPI_ID_INSTANCE || '', '', 'the test environment holds no live WhatsApp credentials');
}

console.log('client greetings: ok');

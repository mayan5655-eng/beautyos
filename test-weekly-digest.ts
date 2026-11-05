// "הסיכום השבועי שלך" (lib/weeklyDigest.ts): Israeli week boundaries, the comparisons, empty weeks, which actions are chosen,
// when the cron may send (Shabbat and yom tov), no dashes in any sentence, and the route's delivery rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  digestWeeks, addDays, weekNumbers, compare, freeMinutesByDay, overdueClientCount, birthdaysIn, pickActions, positiveLine,
  buildDigest, digestCronSlot, revenueLine, DIGEST_GO, MAX_ACTIONS, type DigestInput,
} from './lib/weeklyDigest.ts';

const rd = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const DASH = /[–—‒―]|\s-\s/;

// Sunday 8 November 2026, 17:00 in Israel (winter, UTC+2).
const SUN = new Date('2026-11-08T15:00:00Z');

ok('weeks are Israeli Sunday to Saturday; "last" is the week that is fully over', () => {
  const w = digestWeeks(SUN);
  assert.equal(w.today, '2026-11-08');
  assert.deepEqual(w.last, { from: '2026-11-01', to: '2026-11-07' });
  assert.deepEqual(w.prev, { from: '2026-10-25', to: '2026-10-31' });
  assert.deepEqual(w.coming, { from: '2026-11-09', to: '2026-11-15' });
  // Opened midweek: the same last week.
  assert.deepEqual(digestWeeks(new Date('2026-11-11T09:00:00Z')).last, w.last);
  // 23:30 UTC on Saturday is already Sunday in Israel: the week has turned.
  assert.deepEqual(digestWeeks(new Date('2026-11-07T23:30:00Z')).last, w.last);
  assert.deepEqual(digestWeeks(new Date('2026-11-07T21:30:00Z')).last, w.prev);
  // Across a month and a year.
  assert.deepEqual(digestWeeks(new Date('2027-01-03T12:00:00Z')).last, { from: '2026-12-27', to: '2027-01-02' });
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

ok('rows are cut by the Israeli day, not UTC midnight', () => {
  const w = digestWeeks(SUN);
  const receipts = [
    { id: 1, amount: 100, created_at: '2026-10-31T22:30:00Z' },  // 00:30 Sunday 1 Nov in Israel: last week
    { id: 2, amount: 50, created_at: '2026-10-31T21:30:00Z' },   // 23:30 Saturday 31 Oct: the week before
    { id: 3, amount: 70, created_at: '2026-11-07T21:59:00Z' },   // 23:59 Saturday: last week
    { id: 4, amount: 999, created_at: '2026-11-07T22:00:00Z' },  // 00:00 Sunday 8 Nov: neither
    { id: 5, amount: 10, created_at: '2026-11-03 10:00:00' },    // a zoneless database timestamp is UTC
  ];
  const appts = [
    { date: '2026-11-02', confirmation_status: 'confirmed' },
    { date: '2026-11-03', confirmation_status: 'cancelled' },
    { date: '2026-11-04', confirmation_status: 'no_show' },
    { date: '2026-11-05', kind: 'personal' },
    { date: '2026-11-06', confirmation_status: 'pending' },
    { date: '2026-10-28', confirmation_status: 'confirmed' },
  ];
  const clients = [{ id: 'a', created_at: '2026-10-31T23:00:00Z' }, { id: 'b', created_at: '2026-10-30T10:00:00Z' }];
  assert.deepEqual(weekNumbers(w.last, { receipts, appointments: appts, clients }), { revenue: 180, visits: 2, newClients: 1, noShows: 1 });
  assert.deepEqual(weekNumbers(w.prev, { receipts, appointments: appts, clients }), { revenue: 50, visits: 1, newClients: 1, noShows: 0 });
});

ok('comparisons: percent against the week before, under 5% is "the same", no week before has no percent', () => {
  assert.deepEqual(compare(1000, 800), { cur: 1000, prev: 800, pct: 25, dir: 'up' });
  assert.deepEqual(compare(800, 1000), { cur: 800, prev: 1000, pct: 20, dir: 'down' });
  assert.equal(compare(1020, 1000).dir, 'same');
  assert.deepEqual(compare(500, 0), { cur: 500, prev: 0, pct: null, dir: 'up' });
  assert.deepEqual(compare(0, 0), { cur: 0, prev: 0, pct: null, dir: 'same' });
  assert.match(revenueLine(compare(1000, 800)), /^הכנסות: ₪1,000, עלייה של 25% לעומת השבוע שלפניו$/);
  assert.match(revenueLine(compare(0, 0)), /עוד לא נרשמו תשלומים/);
});

const settings = {
  business_hours: { 0: { open: 9, close: 17 }, 1: { open: 9, close: 17 }, 2: { open: 9, close: 17 }, 3: { open: 9, close: 17 }, 4: { open: 9, close: 17 }, 5: { open: 9, close: 13 }, 6: null },
  branding: { lunch_break: { on: true, start_minute: 13 * 60, minutes: 30 } },
  automations: {},
};

ok('free hours: open hours less lunch and the diary; Saturday, closed days and yom tov are not free', () => {
  const w = digestWeeks(SUN);
  const appts = [
    { date: '2026-11-09', start_minute: 9 * 60, duration: 120 },
    { date: '2026-11-09', start_minute: 10 * 60, duration: 60 },            // overlaps the one before: counted once
    { date: '2026-11-09', start_minute: 16 * 60 + 30, duration: 90 },       // runs past closing: clipped
    { date: '2026-11-09', start_minute: 12 * 60, duration: 60, confirmation_status: 'cancelled' }, // frees nothing
  ];
  const free = freeMinutesByDay(w.coming, settings, appts, (d) => d === '2026-11-10');
  const by = Object.fromEntries(free.map((f) => [f.day, f.minutes]));
  assert.equal(by['2026-11-09'], 480 - 30 - 120 - 30);  // Monday
  assert.equal(by['2026-11-10'], undefined, 'yom tov');
  assert.equal(by['2026-11-14'], undefined, 'Saturday');
  assert.equal(by['2026-11-13'], 240, 'Friday 9 to 13, lunch starts at closing');
  assert.equal(free.length, 5, 'seven days less Saturday and the yom tov');
});

ok('overdue clients: the win-back rule; a booked or never seen client is not overdue', () => {
  const now = SUN;
  const clients = [{ id: 'old' }, { id: 'booked' }, { id: 'new' }, { id: 'recent' }];
  const appts = [
    { client_id: 'old', date: '2026-07-01' },
    { client_id: 'booked', date: '2026-06-01' }, { client_id: 'booked', date: '2026-11-12' },
    { client_id: 'recent', date: '2026-10-01' },
  ];
  assert.equal(overdueClientCount(clients, appts, now, {}), 1);
  assert.equal(overdueClientCount(clients, appts, now, { timing: { winback_days: 30 } }), 2, 'her own period');
});

ok('birthdays in the coming week, by month and day', () => {
  const w = digestWeeks(SUN);
  const got = birthdaysIn(w.coming, [{ id: 1, name: 'רונית לוי', birthday: '1990-11-12' }, { id: 2, birthday: '1985-11-08' }, { id: 3, birthday: '' }, { id: 4, birthday: '2000-11-15' }]);
  assert.deepEqual(got.map((c) => c.id), [1, 4]);
});

const signals = { pendingMessages: 2, newLeads: 3, overdueClients: 12, freeMinutes: [{ day: '2026-11-10', minutes: 300 }, { day: '2026-11-11', minutes: 240 }], birthdays: [{ name: 'רונית לוי' }, { name: 'דנה' }] };

ok('actions: at most three, most time sensitive first, each a known one-tap link', () => {
  const a = pickActions(signals);
  assert.equal(a.length, MAX_ACTIONS);
  assert.deepEqual(a.map((x) => x.key), ['queue', 'leads', 'winback']);
  for (const x of a) {
    assert.ok((DIGEST_GO as readonly string[]).includes(x.key));
    assert.equal(x.href, `/dashboard?go=${x.key}`);
  }
  assert.match(a[2].detail, /השעות הפנויות/, 'overdue clients are offered the empty hours when there are some');
});

ok('actions: unknown counts are left out, never shown as zero; thresholds hold', () => {
  const a = pickActions({ ...signals, pendingMessages: null, newLeads: null });
  assert.deepEqual(a.map((x) => x.key), ['winback', 'week', 'birthdays']);
  assert.equal(a[1].title, 'שעות פנויות ביומן השבוע: 9');
  assert.equal(a[1].detail, 'הכי פנוי ביום שלישי');
  assert.equal(a[2].detail, 'רונית ודנה. ברכה קטנה עושה הרבה');
  assert.deepEqual(pickActions({ pendingMessages: 0, newLeads: 0, overdueClients: 0, freeMinutes: [{ day: '2026-11-10', minutes: 90 }], birthdays: [] }), [], 'under two free hours is not an action');
  assert.equal(pickActions({ ...signals, pendingMessages: 1, newLeads: 1 })[0].title, 'הודעה אחת מוכנה ומחכה לשליחה');
});

ok('the positive line: best day, else top treatment, else the visits', () => {
  const w = digestWeeks(SUN);
  const r = [
    { amount: 300, created_at: '2026-11-03T10:00:00Z', service: 'פדיקור' },
    { amount: 900, created_at: '2026-11-05T10:00:00Z', service: 'טיפול פנים' },
  ];
  assert.equal(positiveLine(w.last, r, [], 2), 'היום החזק שלך היה יום חמישי, עם ₪900 🌸');
  assert.equal(positiveLine(w.last, [r[1]], [], 1), 'הטיפול שהכניס הכי הרבה השבוע: טיפול פנים 🌸');
  assert.equal(positiveLine(w.last, [], [{ date: '2026-11-02' }, { date: '2026-11-02' }, { date: '2026-11-03' }], 3), 'היום הכי מלא שלך היה יום שני 🌸');
  assert.equal(positiveLine(w.last, [], [], 0), null);
});

const empty: DigestInput = { now: SUN, receipts: [], appointments: [], clients: [], pendingMessages: 0, newLeads: 0, settings: { automations: {}, business_hours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } } };

ok('an empty business gets no digest; a quiet week with something waiting still does', () => {
  assert.equal(buildDigest(empty), null);
  // A brand new business on the default hours (no business_hours at all): the empty diary is not an action.
  assert.equal(buildDigest({ ...empty, settings: { automations: {} } }), null);
  assert.equal(buildDigest({ ...empty, pendingMessages: null, newLeads: null }), null);
  const d = buildDigest({ ...empty, newLeads: 2 });
  assert.ok(d);
  assert.deepEqual(d!.actions.map((a) => a.key), ['leads']);
  assert.match(d!.body, /הכנסות: עוד לא נרשמו תשלומים/);
});

ok('a full digest reads well, and nothing in it has a dash', () => {
  const d = buildDigest({
    now: SUN,
    receipts: [
      { id: 1, amount: 1200, created_at: '2026-11-03T10:00:00Z', service: 'טיפול פנים' },
      { id: 2, amount: 400, created_at: '2026-11-05T10:00:00Z', service: 'מניקור' },
      { id: 3, amount: 1000, created_at: '2026-10-27T10:00:00Z', service: 'מניקור' },
    ],
    appointments: [
      { client_id: 'a', date: '2026-11-03', confirmation_status: 'confirmed' },
      { client_id: 'b', date: '2026-11-05', confirmation_status: 'no_show' },
      { client_id: 'c', date: '2026-10-27', confirmation_status: 'confirmed' },
      { client_id: 'z', date: '2026-05-01', confirmation_status: 'confirmed' },
    ],
    clients: [{ id: 'a', created_at: '2026-11-02T10:00:00Z', name: 'נועה', birthday: '1992-11-10' }, { id: 'b' }, { id: 'c' }, { id: 'z' }],
    pendingMessages: 1, newLeads: 0, settings,
  })!;
  assert.equal(d.title, 'הסיכום השבועי שלך');
  assert.equal(d.numbers.revenue.pct, 60);
  assert.deepEqual(d.lines, [
    'הכנסות: ₪1,600, עלייה של 60% לעומת השבוע שלפניו',
    'ביקורים: 1 (בשבוע שלפניו 1)',
    'לקוחות חדשות: 1 (בשבוע שלפניו 0)',
    'לא הגיעו לתור: 1 (בשבוע שלפניו 0)',
  ]);
  assert.equal(d.actions.length, 3);
  assert.equal(d.positive, 'היום החזק שלך היה יום שלישי, עם ₪1,200 🌸');
  assert.equal(d.body, 'הכנסות: ₪1,600, עלייה של 60% לעומת השבוע שלפניו. ביקורים: 1, לקוחות חדשות: 1, לא הגיעו לתור: 1. '
    + `מה כדאי לעשות השבוע: ${d.actions.map((a) => a.short).join(', ')}. היום החזק שלך היה יום שלישי, עם ₪1,200 🌸`);
  assert.ok(!d.body.includes('\n'), 'one paragraph: the in-app list shows no line breaks');
  assert.ok(d.body.length < 320, 'short enough for a push');
  for (const s of [d.body, ...d.lines, d.positive || '', ...d.actions.flatMap((a) => [a.title, a.short, a.detail, a.cta])]) assert.ok(!DASH.test(s), `dash in: ${s}`);
  for (const s of [d.body, ...d.lines, ...d.actions.map((a) => a.title)]) assert.ok(!/^\d/.test(s), `Hebrew first, not a digit: ${s}`);
});

// ── when it may go out ───────────────────────────────────────────────────────────────────────────────────────────────────
const at = (iso: string, yt: string[] = []) => digestCronSlot(new Date(iso), { isYomTov: (d) => yt.includes(d) });

ok('an ordinary Sunday: only the regular afternoon entry runs', () => {
  assert.equal(at('2026-11-08T15:00:00Z').run, true);               // 17:00 Israel, winter
  assert.equal(at('2027-06-06T15:00:00Z').run, true);               // 18:00 Israel, summer
  for (const iso of ['2026-11-08T10:00:00Z', '2026-11-08T17:00:00Z', '2026-11-08T18:00:00Z', '2027-06-06T17:00:00Z', '2027-06-06T18:00:00Z', '2026-11-09T17:00:00Z', '2026-11-10T18:00:00Z']) {
    assert.equal(at(iso).run, false, iso);
  }
});

ok('never on Shabbat, even by hand', () => {
  assert.equal(digestCronSlot(new Date('2026-11-07T12:00:00Z'), { retry: true }).run, false);
  assert.equal(digestCronSlot(new Date('2026-11-07T19:00:00Z'), { retry: true }).run, true, 'Saturday night after 20:00, by hand');
});

ok('Sunday is yom tov: held, then sent at 20:00 on the night it ends', () => {
  assert.deepEqual(at('2026-11-08T15:00:00Z', ['2026-11-08']), { run: false, reason: 'yomtov' });
  assert.equal(at('2026-11-08T17:00:00Z', ['2026-11-08']).run, false, '19:00 in winter is still yom tov');
  assert.equal(at('2026-11-08T18:00:00Z', ['2026-11-08']).run, true, '20:00 in winter');
  assert.equal(at('2027-06-06T17:00:00Z', ['2027-06-06']).run, true, '20:00 in summer');
  assert.equal(at('2027-06-06T18:00:00Z', ['2027-06-06']).run, false, '21:00 in summer: already went');
  // Two days of yom tov, Sunday and Monday: Monday night.
  const two = ['2026-11-08', '2026-11-09'];
  assert.equal(at('2026-11-08T18:00:00Z', two).run, false);
  assert.equal(at('2026-11-09T18:00:00Z', two).run, true);
});

ok('Sunday is an eve: the early entry runs, the afternoon one does not', () => {
  const eve = ['2026-11-09'];
  assert.equal(at('2026-11-08T10:00:00Z', eve).run, true);
  assert.equal(at('2026-11-08T15:00:00Z', eve).run, false);
  assert.equal(at('2026-11-09T18:00:00Z', eve).run, false, 'not again on the night the yom tov ends: Sunday was not a rest day');
});

ok('vercel.json has the three entries digestCronSlot chooses from', () => {
  const crons = JSON.parse(rd('vercel.json')).crons as Array<{ path: string; schedule: string }>;
  const has = (s: string) => crons.some((c) => c.path === '/api/send-weekly-report' && c.schedule === s);
  assert.ok(has('0 15 * * 0') && has('0 10 * * 0') && has('0 17,18 * * 0,1,2'));
});

ok('the route: slot first, opt-in kept, in-app and push only, no WhatsApp, the classic report kept behind a flag', () => {
  const r = rd('app/api/send-weekly-report/route.js');
  assert.ok(r.indexOf('digestCronSlot(') < r.indexOf('readAllRows(supabase, "settings"'), 'the Shabbat rule runs before any read');
  assert.match(r, /a\.weekly_report === true && a\.paused !== true/);
  assert.match(r, /whatsapp: false/);
  assert.match(r, /url: "\/dashboard\/digest"/);
  assert.match(r, /WEEKLY_DIGEST_OFF === "1"/);
  assert.match(r, /if \(await alreadySent\(row\.tenant_id, now\)\) return "duplicate";/);
  assert.ok(!/sendWhatsApp/.test(r));
  const o = rd('lib/ownerNotify.js');
  assert.match(o, /if \(whatsapp === false\) return;/);
  assert.ok(o.indexOf('if (whatsapp === false) return;') < o.indexOf('sendWhatsApp(ownerPhone'), 'returns before the WhatsApp copy');
  assert.match(rd('public/sw.js'), /data\.url\.startsWith\("\/"\)/, 'the push opens a same-site path');
});

ok('the screen and the deep links', () => {
  const api = rd('app/api/weekly-digest/route.ts');
  assert.match(api, /rpc\('get_user_tenant_id'\)/, 'tenant from her session');
  assert.ok(!/searchParams/.test(api), 'never a tenant from the request');
  const app = rd('app/beautyos.jsx');
  for (const go of DIGEST_GO) assert.ok(app.includes(`go === "${go}"`) || new RegExp(`\\b${go}: "`).test(app), `?go=${go} is handled`);
  assert.match(app, /n\.kind==="weekly_report"\)\{router\.push\("\/dashboard\/digest"\)/);
  const screen = rd('app/dashboard/digest/DigestScreen.tsx');
  assert.ok(!/[–—]/.test(screen) && !/[–—]/.test(rd('lib/weeklyDigest.ts')), 'no long dashes in the screen or the copy');
});

console.log(`\n${n} weekly digest checks passed`);

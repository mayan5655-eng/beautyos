// "פרסומת" on promotional messages, and yom tov closed on the public booking page (competitor audit follow-up, 2026-11-16).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withAdLabel, withMarketingFooter, MARKETING_FOOTER, AD_LABEL } from './lib/marketingConsent.js';
import { closedForHoliday, opensOnHolidays } from './lib/holidayClosure.ts';
import { isYomTov } from './lib/greetings/calendar.ts';
import { moveSlotProblem } from './lib/reschedule.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const raw = (f: string) => fs.readFileSync(f, { encoding: 'utf8', raw: true } as never) as unknown as string;

ok('spam law: a message with the removal footer opens with "פרסומת", once', () => {
  assert.equal(AD_LABEL, 'פרסומת');
  const promo = `שלום דנה! מזמן לא ראינו אותך\n\n${MARKETING_FOOTER}`;
  assert.equal(withAdLabel(promo), `פרסומת\n${promo}`);
  assert.equal(withAdLabel(withAdLabel(promo)), `פרסומת\n${promo}`, 'idempotent');
  assert.ok(withMarketingFooter('הטבה ליום הולדת').startsWith('פרסומת\n'));
  assert.ok(withMarketingFooter('הטבה ליום הולדת').endsWith(MARKETING_FOOTER));
  assert.equal(withAdLabel('תזכורת: התור שלך מחר ב-10:00'), 'תזכורת: התור שלך מחר ב-10:00', 'a reminder is not touched');
  assert.equal(withAdLabel(null as never), '');
});

ok('spam law: applied where messages leave (server sender and the app\'s wa.me links)', () => {
  const wa = raw('lib/whatsapp.js');
  assert.ok(/export async function sendWhatsApp\(phone, message, options = \{\}\) \{[\s\S]{0,200}message = withAdLabel\(message\);/.test(wa), 'first thing in sendWhatsApp, before it is logged or queued');
  const app = raw('app/beautyos.jsx');
  assert.ok(app.includes('encodeURIComponent(withAdLabel(msg))'), 'waMsg (single and group sends)');
  assert.ok(app.includes('encodeURIComponent(withAdLabel(`שלום'), 'the gap-fill compose links');
});

ok('yom tov: the calendar knows the days', () => {
  assert.equal(isYomTov('2027-10-11'), true, 'Yom Kippur 5788');
  assert.equal(isYomTov('2026-09-12'), true, 'Rosh Hashana 5787, day 1');
  assert.equal(isYomTov('2026-09-13'), true, 'Rosh Hashana 5787, day 2');
  assert.equal(isYomTov('2026-11-16'), false);
});

ok('yom tov: closed to self-booking by default; open when she says so', () => {
  assert.equal(opensOnHolidays(null), false);
  assert.equal(closedForHoliday({}, '2027-10-11'), true);
  assert.equal(closedForHoliday({ booking_rules: { open_on_holidays: true } }, '2027-10-11'), false);
  assert.equal(closedForHoliday({ booking_rules: { open_on_holidays: 'yes' } }, '2027-10-11'), true, 'only a real true opens it');
  assert.equal(closedForHoliday({}, '2027-10-12'), false, 'the day after is an ordinary day');
});

ok('yom tov: the client\'s move flow refuses it, and is unchanged without branding', () => {
  const q = {
    hours: { business_hours: null, working_hours_start: 9, working_hours_end: 18, working_days: [0, 1, 2, 3, 4, 5] },
    rules: { minLeadMinutes: 0, maxDaysAhead: 60, depositAmount: 0, depositNote: '', cancelWindowHours: 0 },
    duration: 60, buffer: 0, lunch: null, busyByDate: {}, now: new Date('2027-10-01T08:00:00Z'),
  } as never as Parameters<typeof moveSlotProblem>[0];
  assert.equal(moveSlotProblem({ ...q, branding: {}, date: '2027-10-11', start: 600 }), 'closed', 'Yom Kippur (a Monday)');
  assert.equal(moveSlotProblem({ ...q, branding: { booking_rules: { open_on_holidays: true } }, date: '2027-10-11', start: 600 }), null);
  assert.equal(moveSlotProblem({ ...q, branding: {}, date: '2027-10-12', start: 600 }), null, 'the next day is open');
});

ok('yom tov: the booking route, the page and the move route all use the same rule', () => {
  const route = raw('app/api/book-appointment/route.js');
  const at = route.indexOf('closedForHoliday(settingsRow?.branding, String(date))');
  assert.ok(at > 0 && at < route.search(/if \(!teamMode\) \{\r?\n\s+\/\/ Midday/), 'before the one-person and the team checks');
  assert.ok(raw('app/BookingPage.jsx').includes('closedForHoliday(settings?.branding, formatDate(d)) ? null'));
  assert.ok(raw('app/api/confirm/reschedule/route.ts').includes('branding: settings.branding ?? null'));
  const app = raw('app/beautyos.jsx');
  assert.ok(app.includes('data-testid="open-on-holidays"') && app.includes('setRule({open_on_holidays:e.target.checked})'), 'her switch in Settings');
});

console.log(`spam label + holidays: ${n} ok`);

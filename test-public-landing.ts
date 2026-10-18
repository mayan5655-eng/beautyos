// test-public-landing.ts
//
// The public landing page's rules (lib/publicLanding.ts): open/closed in Israel time whatever the server's
// zone, phone formats (local on screen, international in links), and that every optional field reads as
// null - so its section hides - unless the tenant entered a real value.
import assert from 'node:assert/strict';
import {
  openStatus, openStatusLabel, hasRealHours, todayHours, israelClock, fmtHour,
  displayPhone, telHref, waHref, googleInfo, instagramHandle, planMessage, wazeHref,
} from './lib/publicLanding.ts';

// Sun-Thu 09-19, Fri 09-14, Sat closed.
const HOURS = { business_hours: { 0: { open: 9, close: 19 }, 1: { open: 9, close: 19 }, 2: { open: 9, close: 19 }, 3: { open: 9, close: 19 }, 4: { open: 9, close: 19 }, 5: { open: 9, close: 14 }, 6: null } } as any;

// 2026-10-18 is a Sunday. Israel is UTC+3 until 2026-10-25.
const at = (iso: string) => new Date(iso);

{ // clock reads Israel, not UTC
  const c = israelClock(at('2026-10-18T22:30:00Z')); // 01:30 Monday in Israel
  assert.deepEqual(c, { dow: 1, minutes: 90 });
}
{ // open now
  const st = openStatus(HOURS, at('2026-10-18T10:00:00Z')); // 13:00 Sunday
  assert.deepEqual(st, { open: true, closesAt: '19:00' });
  assert.equal(openStatusLabel(st!), 'פתוח עכשיו · עד 19:00');
}
{ // before opening today
  const st = openStatus(HOURS, at('2026-10-18T04:00:00Z')); // 07:00 Sunday
  assert.equal(openStatusLabel(st!), 'סגור כרגע · נפתח היום ב-09:00');
}
{ // after closing: tomorrow
  const st = openStatus(HOURS, at('2026-10-18T17:30:00Z')); // 20:30 Sunday
  assert.equal(openStatusLabel(st!), 'סגור כרגע · נפתח מחר ב-09:00');
}
{ // Friday after 14:00 -> Sunday (Saturday closed)
  const st = openStatus(HOURS, at('2026-10-23T12:00:00Z')); // 15:00 Friday
  assert.equal(openStatusLabel(st!), 'סגור כרגע · נפתח ביום ראשון ב-09:00');
}
{ // no hours entered: no badge, no hours, even though the booking engine has defaults
  assert.equal(hasRealHours({}), false);
  assert.equal(hasRealHours(null), false);
  assert.equal(hasRealHours({ business_hours: {} } as any), false);
  assert.equal(openStatus({}, at('2026-10-18T10:00:00Z')), null);
  assert.equal(todayHours({}, at('2026-10-18T10:00:00Z')), null);
  // every day explicitly closed: no "opens at"
  assert.equal(openStatus({ business_hours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } } as any, at('2026-10-18T10:00:00Z')), null);
}
assert.equal(fmtHour(18.5), '18:30');

// Phones
assert.equal(displayPhone('0541234567'), '054-123-4567');
assert.equal(displayPhone('+972 54 123 4567'), '054-123-4567');
assert.equal(displayPhone('972541234567'), '054-123-4567');
assert.equal(displayPhone('03-1234567'), '03-123-4567');
assert.equal(displayPhone(''), null);
assert.equal(displayPhone('לא ידוע'), null);
assert.equal(telHref('054-123-4567'), 'tel:+972541234567');
assert.equal(waHref('054-123-4567'), 'https://wa.me/972541234567');
assert.ok(waHref('0541234567', 'היי')!.startsWith('https://wa.me/972541234567?text='));
assert.equal(waHref(''), null);

// Google: only a real rating makes a card
assert.equal(googleInfo({}), null);
assert.equal(googleInfo({ google_rating: '' }), null);
assert.equal(googleInfo({ google_rating: '0' }), null);
assert.equal(googleInfo({ google_rating: '7' }), null);
assert.equal(googleInfo({ google_reviews_count: '120' }), null, 'a count without a rating is not a card');
assert.deepEqual(googleInfo({ google_rating: '4,9', google_reviews_count: '120', google_place_url: 'https://maps.app.goo.gl/abc' }),
  { rating: 4.9, count: 120, url: 'https://maps.app.goo.gl/abc' });
assert.equal(googleInfo({ google_rating: 5, google_place_url: 'https://evil.example/google.com' })!.url, null, 'only Google links');
assert.equal(googleInfo({ google_rating: 5, google_reviews_count: '-3' })!.count, null);

// Instagram
assert.equal(instagramHandle('@dana.beauty'), 'dana.beauty');
assert.equal(instagramHandle('https://www.instagram.com/dana.beauty/?hl=he'), 'dana.beauty');
assert.equal(instagramHandle('https://facebook.com/x'), null);
assert.equal(instagramHandle('דנה'), null);
assert.equal(instagramHandle(''), null);

// WhatsApp message
assert.equal(planMessage('סטודיו דנה', []), 'היי סטודיו דנה! 🌸\nאשמח לקבוע תור.\nמתי יש לך מקום?');
assert.equal(planMessage('סטודיו דנה', ['מניקור ג\'ל'], 'נוד'), 'היי סטודיו דנה! 🌸\nאשמח לקבוע תור למניקור ג\'ל.\nצבע לק שאהבתי: נוד\nמתי יש לך מקום?');
assert.ok(planMessage('', ['א', 'ב']).includes('• א\n• ב'));

assert.equal(wazeHref('הרצל 1, תל אביב'), 'https://waze.com/ul?q=' + encodeURIComponent('הרצל 1, תל אביב') + '&navigate=yes');

console.log('public landing: all assertions passed');

// Her calendar-feed link: a forged or altered token never parses, and the feed is valid ICS.
import assert from 'node:assert/strict';
import { feedToken, parseFeedToken, newFeedNonce, feedUrls } from './lib/calendarFeed.ts';
import { buildIcsFeed } from './lib/calendarInvite.ts';

const tid = '448e9e45-0000-4000-8000-000000000001';
const nonce = newFeedNonce();
assert.match(nonce, /^[0-9a-f]{24}$/);
const tok = feedToken(tid, nonce, 's1');
assert.deepEqual(parseFeedToken(tok, 's1'), { tenantId: tid, nonce });
assert.deepEqual(parseFeedToken(`${tok}.ics`, 's1'), { tenantId: tid, nonce });
assert.equal(parseFeedToken(tok, 's2'), null, 'another key');
assert.equal(parseFeedToken(tok.replace(nonce, newFeedNonce()), 's1'), null, 'swapped nonce');
assert.equal(parseFeedToken(tok.replace(tid, '448e9e45-0000-4000-8000-000000000002'), 's1'), null, 'another tenant');
assert.equal(parseFeedToken('garbage', 's1'), null);

const u = feedUrls('https://kalmea.app/', tok);
assert.ok(u.https.startsWith('https://kalmea.app/api/calendar-feed/') && u.https.endsWith('.ics'));
assert.ok(u.webcal.startsWith('webcal://kalmea.app/'));
assert.ok(u.google.includes(encodeURIComponent(u.webcal)));

const ics = buildIcsFeed([
  { uid: 'a1', date: '2026-12-15', startMinute: 600, duration: 60, title: 'רונית · לק ג׳ל' },
  { uid: 'a2', date: '2026-07-01', startMinute: 540, duration: 30, title: 'זמן חסום' },
], 'סטודיו · Kalmea', new Date('2026-10-19T00:00:00Z'));
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
assert.ok(ics.includes('UID:a1@kalmea'));
assert.ok(ics.includes('DTSTART:20261215T080000Z'));
assert.ok(ics.includes('DTSTART:20260701T060000Z'));
assert.ok(!ics.includes('VALARM'), 'no alarms in the diary feed');
console.log('calendar feed: ok');

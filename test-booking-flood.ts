// Public booking has no login, so "how often" is the only lever. The route (app/api/book-appointment) caps a caller over ten minutes
// AND over an hour, caps one PHONE NUMBER over an hour, answers a block in Hebrew (never a raw error), and writes the FIRST block of
// each window to ops_events (one row per attack, not one per refused request; phone masked).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkIpLimit, checkPhoneLimit, maskPhone, RATE_POLICIES, type BlockEvent } from './lib/rateLimit.ts';

const req = (ip: string) => new Request('http://localhost/api/book-appointment', { method: 'POST', headers: { 'x-forwarded-for': ip } });
const hebrew = (s: string) => /[֐-׿]/.test(s);

// ── per phone number: 5 an hour, the 6th is refused in Hebrew, other numbers are untouched ──
const events: BlockEvent[] = [];
const phone = '972501110001';
for (let i = 1; i <= 5; i++) assert.equal(checkPhoneLimit(phone, 'book-appointment-hourly', (e) => events.push(e)), null, `attempt ${i} of 5 passes`);
const blocked = checkPhoneLimit(phone, 'book-appointment-hourly', (e) => events.push(e));
assert.ok(blocked, 'the 6th attempt in the hour is refused');
assert.equal(blocked!.status, 429);
const body = await blocked!.json();
assert.equal(body.success, false); assert.equal(body.rateLimited, true);
assert.ok(hebrew(body.error) && /הטלפון הזה/.test(body.error) && /להתקשר לעסק/.test(body.error), `Hebrew message that gives her a way forward, got: ${body.error}`);
assert.ok(!/error|exception|undefined|\bat\b/i.test(body.error), 'not a raw error');
assert.ok(Number(blocked!.headers.get('Retry-After')) > 0, 'Retry-After is set');
assert.equal(checkPhoneLimit('972501110002', 'book-appointment-hourly'), null, 'a different number is not blocked');
assert.equal(checkPhoneLimit(null, 'book-appointment-hourly'), null, 'no phone, no phone limit (the route validates the phone first)');

// ── logging: ONE event for the window, however many refused requests follow ──
for (let i = 0; i < 4; i++) checkPhoneLimit(phone, 'book-appointment-hourly', (e) => events.push(e));
assert.equal(events.length, 5, 'five refusals were reported to the listener');
assert.equal(events.filter((e) => e.first).length, 1, 'exactly one of them is marked first - that is the one the route writes to ops_events');
assert.ok(events[0].first && events[0].scope === 'phone' && events[0].policy === 'book-appointment-hourly');

// ── per IP, over an hour: 12 pass, the 13th is refused ──
const ipEvents: BlockEvent[] = [];
for (let i = 1; i <= 12; i++) assert.equal(checkIpLimit(req('203.0.113.7'), 'book-appointment-hourly'), null, `request ${i} of 12 passes`);
const ipBlocked = checkIpLimit(req('203.0.113.7'), 'book-appointment-hourly', (e) => ipEvents.push(e));
assert.ok(ipBlocked && ipBlocked.status === 429, 'the 13th request in the hour from one address is refused');
assert.ok(hebrew((await ipBlocked!.json()).error), 'Hebrew');
assert.equal(ipEvents[0].scope, 'ip'); assert.equal(ipEvents[0].key, '203.0.113.7'); assert.ok(ipEvents[0].first);
assert.equal(checkIpLimit(req('203.0.113.8'), 'book-appointment-hourly'), null, 'another address is untouched');

// ── a normal booking after a flood from somewhere else still works ──
assert.equal(checkIpLimit(req('198.51.100.5'), 'book-appointment'), null);
assert.equal(checkPhoneLimit('972521234567', 'book-appointment-hourly'), null);

// ── the privacy of the log ──
assert.equal(maskPhone('972501110001'), '*********001'); assert.ok(!maskPhone('972501110001').includes('50111'));
assert.equal(maskPhone(''), '***');

// ── the numbers are small and the hourly policy exists ──
assert.equal(RATE_POLICIES['book-appointment-hourly'].perTenant.limit, 5);
assert.equal(RATE_POLICIES['book-appointment-hourly'].perIp.limit, 12);

// ── the route really uses them (it is a .js file with extensionless imports, so it is read, not imported) ──
const route = readFileSync(new URL('./app/api/book-appointment/route.js', import.meta.url), 'utf8');
assert.match(route, /checkPhoneLimit\(phoneCheck\.e164, "book-appointment-hourly"/, 'the route limits by phone');
assert.match(route, /checkIpLimit\(request, "book-appointment-hourly"/, 'the route limits by IP over an hour');
assert.match(route, /raiseOpsAlert\(/, 'a block is written to ops_events');
assert.match(route, /after\(\(\) =>\s*raiseOpsAlert/, '...after the response, never on its critical path');
assert.match(route, /if \(!e\.first\) return;/, '...once per window');
assert.ok(route.indexOf('checkPhoneLimit(') < route.indexOf('.from("service_prices")'), 'the phone cap runs BEFORE any database read');

console.log('booking flood: ok');

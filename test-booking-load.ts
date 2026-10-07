// The public booking page's first screen must not wait for the slowest call. Measured 2026-10-07 (cold, unthrottled): the page showed its
// services at ~2.8-3.4 s, because loadData awaited EVERY call together - including /api/availability (~1.4 s) - and then awaited the
// optional announcements feed (/api/community, another 0.5-1.0 s) before it let the page appear. Now availability is started with the rest
// but awaited on its own, the feed is not awaited at all, and the day and time pickers wait for availability instead of showing every
// slot as free (the bug /api/availability exists to prevent). BookingPage.jsx is a client component, so this reads the source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app/BookingPage.jsx', import.meta.url), 'utf8');
const loadData = src.slice(src.indexOf('const loadData = async'), src.indexOf('// The tenant\'s accent is set ONCE'));
assert.ok(loadData.length > 500, 'found loadData');

// 1. availability is not part of the Promise.all the page waits for
const all = loadData.match(/Promise\.all\(\[([\s\S]*?)\]\);/);
assert.ok(all, 'the first-screen Promise.all is still there');
assert.ok(!/api\/availability/.test(all![1]), 'availability is NOT awaited together with branding / services / reviews / results');
assert.ok(/fetchPublicSettings/.test(all![1]) && /fetchPublicServices/.test(all![1]) && /get_public_reviews/.test(all![1]) && /get_public_results/.test(all![1]), 'the first screen still waits for what it shows');
// ...but it IS started before them, so it runs in parallel and is not delayed
assert.ok(loadData.indexOf('const availabilityP = fetch(`/api/availability') < loadData.indexOf('Promise.all(['), 'availability starts first, in parallel');

// 2. the optional feed is never awaited
assert.ok(!/await fetch\(`\/api\/community/.test(loadData), 'the announcements feed is not awaited');
assert.ok(/fetch\(`\/api\/community[\s\S]*?\.catch\(/.test(loadData), 'and its failure is swallowed (it is optional)');

// 3. the page is shown BEFORE availability is awaited
assert.ok(loadData.indexOf('setLoading(false);') < loadData.indexOf('await availabilityP'), 'setLoading(false) comes before the wait for availability');

// 4. an unchecked grid is never shown: pending until availability answered, on success AND on failure
assert.ok(/useState\(true\)/.test(src.slice(src.indexOf('availabilityPending'), src.indexOf('availabilityPending') + 120)), 'availabilityPending starts true');
const settle = loadData.slice(loadData.indexOf('await availabilityP'));
assert.ok(/setAvailabilityError\(true\)/.test(settle) && settle.indexOf('setAvailabilityPending(false)') > settle.indexOf('setAvailabilityError(true)'), 'pending is cleared after the error branch too');
assert.ok(/availabilityPending \? \(/.test(src), 'the day strip is replaced by a "checking" line while pending');
assert.ok(/selectedDate && !availabilityPending/.test(src), 'and so are the time slots');
assert.ok(/בודקת אילו ימים ושעות פנויים/.test(src), 'in Hebrew, feminine');

// 5. what must not change: the availability result handling and the honest failure notice
assert.ok(/ap && ap\.success && Array\.isArray\(ap\.busy\)/.test(loadData), 'only a server-confirmed availability counts');
assert.ok(/לא הצלחנו לבדוק כרגע אילו שעות כבר תפוסות/.test(src), 'the failure notice is still there');

console.log('booking load: ok');

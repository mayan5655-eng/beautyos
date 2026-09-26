import assert from 'node:assert/strict';
import { buildCancellationMessage, countMatchingWaiting } from './lib/cancelMessage.js';

const base = { name: 'דנה', service: 'פילינג', date: '2026-09-29', startMinute: 14 * 60, duration: 60 };

const none = buildCancellationMessage({ ...base, waiting: 0 });
assert.ok(none.startsWith('דנה ביטלה את התור של'), none);
assert.ok(none.includes('14:00–15:00') && none.includes('(פילינג)'));
assert.ok(none.includes('השעה חזרה ליומן.'));
assert.ok(!/ברשימת ההמתנה/.test(none), 'no waiting list line when nobody is waiting');

const one = buildCancellationMessage({ ...base, waiting: 1 });
assert.ok(one.includes('יש אחת ברשימת ההמתנה שמתאימה'));
const two = buildCancellationMessage({ ...base, waiting: 2 });
assert.ok(two.includes('יש 2 ברשימת ההמתנה שמתאימות'));

// It must not claim it sent anything to the waiting list, and must not scold.
for (const m of [one, two]) {
  assert.ok(/בלי שתאשרי/.test(m), 'says it will not send without her approval');
  assert.ok(!/הצעתי|שלחתי/.test(m), 'never claims an action it did not take');
  assert.ok(!/מאוחר|ברגע האחרון|בהתראה קצרה/.test(m), 'no scolding');
}
assert.ok(!/[–—]/.test(one.replace('14:00–15:00', '')), 'no dashes in the prose');

// Waiting list matching: same service, or one who did not say which.
const wl = [{ service: 'פילינג', status: 'waiting' }, { service: 'אקנה', status: 'waiting' }, { service: '', status: 'waiting' }, { service: 'פילינג', status: 'done' }];
assert.equal(countMatchingWaiting(wl, 'פילינג'), 2);
assert.equal(countMatchingWaiting([], 'פילינג'), 0);
console.log('cancel notify: ok');

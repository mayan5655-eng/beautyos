import assert from 'node:assert/strict';
import * as c from './lib/errorCopy.js';

for (const [k, v] of Object.entries(c)) {
  if (typeof v !== 'string') continue;
  assert.ok(!/[\u2013\u2014]/.test(v), k + ': no em/en dashes');
  assert.ok(!/נסי לצאת ולהיכנס/.test(v), k + ': never tells her to log out and in');
  assert.ok(!/שגיאה/.test(v), k + ': the word "error" is software talking');
}
assert.ok(/לא אצלך/.test(c.STUCK_HE), 'says whose fault it is');
assert.ok(/שמורים/.test(c.STUCK_HE) && /שמור/.test(c.SAVE_FAILED_HE), 'says what is safe');
assert.ok(/לא הצלחנו לשמור/.test(c.SAVE_FAILED_HE), 'a failed save says it did not save');
assert.equal(c.couldNotHe('לקבוע את התור'), 'לא הצלחנו לקבוע את התור. נסי שוב בעוד רגע.');
console.log('error copy: ok');

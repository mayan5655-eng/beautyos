// The birthday discount is hers: default unchanged until she edits it, cleared means none, and the automatic
// message never carries a discount she did not type.
import assert from 'node:assert/strict';
import { birthdayOfferOf, explicitBirthdayOffer, birthdayMessage, DEFAULT_BIRTHDAY_OFFER } from './lib/birthdayOffer.js';

assert.equal(birthdayOfferOf(null), DEFAULT_BIRTHDAY_OFFER);
assert.equal(birthdayOfferOf({}), DEFAULT_BIRTHDAY_OFFER);
assert.equal(birthdayOfferOf({ birthday_offer: '' }), '');
assert.equal(birthdayOfferOf({ birthday_offer: '  מניקור   מתנה ' }), 'מניקור מתנה');
assert.equal(birthdayOfferOf({ birthday_offer: 'א'.repeat(200) }).length, 80);
assert.equal(explicitBirthdayOffer({}), '');
assert.equal(explicitBirthdayOffer({ birthday_offer: '10% הנחה' }), '10% הנחה');

assert.ok(birthdayMessage('רונית', 'סטודיו', {}).includes('15% הנחה'));
const none = birthdayMessage('רונית', 'סטודיו', { birthday_offer: '' });
assert.ok(!none.includes('הנחה') && !none.includes('לרגל'), 'no dangling offer line');
assert.ok(!birthdayMessage('רונית', 'העסק שלי', {}).includes('העסק שלי'), 'placeholder name dropped');
console.log('birthday offer: ok');

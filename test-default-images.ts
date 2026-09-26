import assert from 'node:assert/strict';
import { defaultKeyForService, serviceImage, defaultImageUrl } from './lib/defaultImages.js';

const k = defaultKeyForService;
assert.equal(k('טיפולי פנים'), 'facial-classic');
assert.equal(k('טיפול פנים קלאסי'), 'facial-classic');
assert.equal(k('פילינג'), 'peel-green', 'a plain peeling gets the gentle picture');
assert.equal(k('פילינג גרין'), 'peel-green');
assert.equal(k('פילינג עמוק'), 'peel-deep');
assert.equal(k('הסרת שיער בלייזר'), 'laser-hair');
assert.equal(k('טיפול באקנה'), 'acne');
assert.equal(k('אנטי אייג\'ינג'), 'anti-aging');
assert.equal(k('טיפול בפיגמנטציה'), 'pigmentation');
assert.equal(k('טיפול פלזמה'), 'plasma-pen');
assert.equal(k('פוטותרפיה LED'), 'led');
assert.equal(k('ניקוי עמוק'), 'deep-cleansing');
assert.equal(k('עיסוי שוודי'), 'neutral', 'unknown falls back to neutral');
assert.equal(k(''), 'neutral');
assert.equal(k(null), 'neutral');

const svc = { id: 's1', name: 'טיפול באקנה' };
assert.deepEqual(serviceImage(svc, {}), { url: defaultImageUrl('acne'), isDefault: true });
assert.deepEqual(serviceImage(svc, { s1: 'https://cdn/mine.jpg' }), { url: 'https://cdn/mine.jpg', isDefault: false }, 'hers always wins');
assert.equal(serviceImage(svc, { s1: '   ' }).isDefault, true, 'blank is not a photo');
assert.equal(serviceImage(svc, null).isDefault, true);
console.log('default images: ok');

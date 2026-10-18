// Her page's schema.org data: only what she entered, nails vs beauty, and safe inside <script>.
import assert from 'node:assert/strict';
import { localBusinessJsonLd, jsonLdString } from './lib/localBusinessJsonLd.ts';

const full = localBusinessJsonLd({
  brand: { businessName: 'סטודיו רונית', whatsapp: '050-123-4567', address: 'הרצל 1, חולון', instagram: '@ronit.nails', businessDescription: 'ציפורניים בחולון' },
  settings: { business_fields: ['nails'], business_hours: { 0: { open: 9, close: 18.5 }, 1: null, 2: null, 3: null, 4: null, 5: { open: 8, close: 13 }, 6: null } } as any,
  services: [{ name: 'לק ג׳ל', price: 120 }, { name: 'בניה', price: '' }, { name: '' }],
  url: 'https://kalmea.app/ronit',
  image: 'https://kalmea.app/og/ronit',
})!;
assert.equal(full['@type'], 'NailSalon');
assert.equal(full.telephone, '+972501234567');
assert.deepEqual(full.sameAs, ['https://www.instagram.com/ronit.nails']);
const hours = full.openingHoursSpecification as any[];
assert.equal(hours.length, 2);
assert.equal(hours[0].closes, '18:30');
assert.equal(hours[1].dayOfWeek, 'https://schema.org/Friday');
const offers = full.makesOffer as any[];
assert.equal(offers.length, 2, 'nameless service dropped');
assert.equal(offers[0].price, 120);
assert.equal(offers[1].price, undefined, 'no invented price');
assert.equal(full.aggregateRating, undefined);

// Nothing entered: no invented hours, no phone, beauty salon by default.
const bare = localBusinessJsonLd({ brand: {}, settings: null, services: [], url: 'https://kalmea.app/x', fallbackName: 'דנה' })!;
assert.equal(bare['@type'], 'BeautySalon');
assert.equal(bare.openingHoursSpecification, undefined);
assert.equal(bare.telephone, undefined);
assert.equal(localBusinessJsonLd({ brand: {}, settings: null, services: [], url: 'u' }), null);

assert.ok(!jsonLdString({ name: '</script><script>x' }).includes('</script>'));
console.log('local business json-ld: ok');

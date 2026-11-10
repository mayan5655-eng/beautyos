// What the landing page may claim (lib/landingClaims.ts) and the testimonials slot (lib/testimonials.ts).
import assert from 'node:assert/strict';
import { landingClaims } from './lib/landingClaims.ts';
import { TESTIMONIALS, visibleTestimonials } from './lib/testimonials.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const LIVE_CARD = { GROW_UI_ENABLED: 'true', GROW_MODE: 'live', GROW_ENV: 'production', GROW_API_KEY: 'k', GROW_PAGE_CODE: 'card' };
const LIVE_WALLET = { GROW_UI_ENABLED: 'true', GROW_MODE: 'live', GROW_ENV: 'production', GROW_API_KEY: 'k', GROW_WALLET_PAGE_CODE: 'w' };

ok('nothing set: no deposit claim', () => {
  assert.deepEqual(landingClaims({}), { deposits: false, depositBit: false });
});

ok('Grow switched off: no deposit claim even with everything configured', () => {
  assert.deepEqual(landingClaims({ ...LIVE_WALLET, GROW_UI_ENABLED: 'false' }), { deposits: false, depositBit: false });
});

ok('Grow on for a chosen few (allow-list): not a claim for every business', () => {
  assert.deepEqual(landingClaims({ ...LIVE_WALLET, GROW_ALLOWED_TENANTS: 'a,b' }), { deposits: false, depositBit: false });
});

ok('Grow on in mock mode: no real deposit, no claim', () => {
  assert.equal(landingClaims({ ...LIVE_WALLET, GROW_MODE: '' }).deposits, false);
});

ok('Grow on, live, but no payment page configured: no claim', () => {
  assert.equal(landingClaims({ GROW_UI_ENABLED: 'true', GROW_MODE: 'live', GROW_ENV: 'production', GROW_API_KEY: 'k' }).deposits, false);
});

ok('live with the card page: deposits, card only (no Bit)', () => {
  assert.deepEqual(landingClaims(LIVE_CARD), { deposits: true, depositBit: false });
});

ok('live with the wallet page only: deposits open on the wallet, so Bit is true', () => {
  assert.deepEqual(landingClaims(LIVE_WALLET), { deposits: true, depositBit: true });
});

ok('testimonials: empty now, so the slot renders nothing', () => {
  assert.equal(TESTIMONIALS.length, 0, 'no invented testimonials (owner, 2026-10-30)');
  assert.deepEqual(visibleTestimonials(), []);
});

ok('testimonials: only complete entries are shown, trimmed', () => {
  const list = visibleTestimonials([
    { quote: '  מילים שלה  ', name: ' רונית ', role: ' קוסמטיקאית ' },
    { quote: '', name: 'דנה', role: '' },
    { quote: 'בלי שם', name: '  ', role: '' },
  ]);
  assert.deepEqual(list, [{ quote: 'מילים שלה', name: 'רונית', role: 'קוסמטיקאית' }]);
});

console.log(`${n} passed`);

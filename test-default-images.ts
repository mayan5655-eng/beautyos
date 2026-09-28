import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultKeyForService, serviceImage, defaultImageUrl, defaultHeroKey, defaultAboutKey, guessFieldFromName, DEFAULT_IMAGE_KEYS } from './lib/defaultImages.js';

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
assert.equal(k('עיצוב גבות'), 'brows');
assert.equal(k('עיצוב גבות בחוט'), 'brows');
assert.equal(k('הרמת גבות'), 'brows');
assert.equal(k('עיסוי שוודי'), 'neutral', 'unknown falls back to neutral');
assert.equal(k(''), 'neutral');
assert.equal(k(null), 'neutral');

const svc = { id: 's1', name: 'טיפול באקנה' };
assert.deepEqual(serviceImage(svc, {}), { url: defaultImageUrl('acne'), isDefault: true });
assert.deepEqual(serviceImage(svc, { s1: 'https://cdn/mine.jpg' }), { url: 'https://cdn/mine.jpg', isDefault: false }, 'hers always wins');
assert.equal(serviceImage(svc, { s1: '   ' }).isDefault, true, 'blank is not a photo');
assert.equal(serviceImage(svc, null).isDefault, true);

// ── Field-aware (business_fields) ───────────────────────────────────────────
assert.equal(k('בניית ציפורניים', 'nails'), 'nails-extensions');
assert.equal(k('מילוי', 'nails'), 'nails-extensions');
assert.equal(k('פדיקור רגליים מלא', 'nails'), 'nails-pedicure');
assert.equal(k('פדיקור לק ג\'ל', 'nails'), 'nails-pedicure', 'פדיקור must win over the broader לק pattern below it');
assert.equal(k('שיוף ולק לרגליים', 'nails'), 'nails-pedicure');
assert.equal(k('נייל ארט (לציפורן)', 'nails'), 'nails-nail-art');
assert.equal(k('מניקור (שיוף, הסרת עור, לק)', 'nails'), 'nails-manicure');
assert.equal(k('שיוף ולק לידיים', 'nails'), 'nails-manicure');
assert.equal(k('הסרת לק ג\'ל', 'nails'), 'nails-manicure');
assert.equal(k('תיקון ציפורן שבורה', 'nails'), 'nails-manicure', 'no foot-specific keyword in the name, so it falls to the generic nails picture — same limitation waxing already has in the cosmetics table');
assert.equal(k('עיסוי גב', 'nails'), 'nails-neutral', 'a name matching nothing in the nails table at all falls back to the NAILS neutral, not the cosmetics one');
// A known field never crosses over into the other field's vocabulary, even
// when a name would otherwise match there.
assert.equal(k('טיפול פנים קלאסי', 'nails'), 'nails-neutral');
assert.equal(k('מניקור ג\'ל', 'cosmetics'), 'neutral');
// No field at all (a legacy row, or a hand-typed service): guess across
// every field, cosmetics first.
assert.equal(k('טיפול באקנה'), 'acne');
assert.equal(k('בניית ציפורניים'), 'nails-extensions');
assert.equal(k('עיסוי שוודי'), 'neutral', 'unmatched with no field falls back to the generic neutral');

const nailsSvc = { id: 'n1', name: 'פדיקור ספא', field: 'nails' };
assert.deepEqual(serviceImage(nailsSvc, {}), { url: defaultImageUrl('nails-pedicure'), isDefault: true });
assert.deepEqual(serviceImage(nailsSvc, { n1: 'https://cdn/hers.jpg' }), { url: 'https://cdn/hers.jpg', isDefault: false }, 'hers wins here too');

// ── The public page's one hero/about photo: whole-tenant, not per-service ──
assert.equal(defaultHeroKey(['nails']), 'nails-hero', 'nails-only gets the nails hero');
assert.equal(defaultAboutKey(['nails']), 'nails-about');
assert.equal(defaultHeroKey(['cosmetics']), 'hero');
assert.equal(defaultHeroKey(['cosmetics', 'nails']), 'hero', 'both fields: cosmetics wins the one shared photo, same precedent as FIELD_GUESS_ORDER');
assert.equal(defaultHeroKey([]), 'hero', 'no fields at all: the safe default');
assert.equal(defaultHeroKey(undefined), 'hero');

// Every key this module claims to have a picture for actually has one on
// disk, committed - a key with no file would 404 silently on the public page.
for (const key of DEFAULT_IMAGE_KEYS) {
  assert.ok(fs.existsSync(`public/defaults/${key}.jpg`), `public/defaults/${key}.jpg exists`);
}

// ── guessFieldFromName: scripts/backfill-service-fields.mjs's classifier ───
// The full real catalogues from lib/tenantTemplate.ts, both directions.
for (const name of ['טיפול פנים קלאסי', 'ניקוי עמוק', 'טיפול באקנה', 'הסרת שיער בלייזר', 'עיצוב גבות', 'פלזמה', 'אנטי אייג\'ינג']) {
  assert.equal(guessFieldFromName(name), 'cosmetics', `"${name}" -> cosmetics`);
}
for (const name of ['מניקור ג\'ל', 'פדיקור רגליים מלא', 'בניית ציפורניים', 'נייל ארט', 'הסרת לק ג\'ל', 'פראפין']) {
  assert.equal(guessFieldFromName(name), 'nails', `"${name}" -> nails`);
}
// Names matching neither vocabulary: null, never a guess.
assert.equal(guessFieldFromName('עיסוי שוודי'), null, 'a generic name is left for a person, not guessed at');
assert.equal(guessFieldFromName(''), null);
assert.equal(guessFieldFromName(null), null);

console.log('default images: ok');

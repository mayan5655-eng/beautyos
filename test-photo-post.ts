// The short "photo -> ready post + story" path (lib/design/photoPost.js): which template a bare photo goes into, when the
// photo may be used (explicit client yes, fails closed), and what she may type over the headline.
import assert from 'node:assert/strict';
import { PHOTO_FEED_KEYS, photoCandidates, pickPhotoKeys, startIndex, photoUse, photoFileProblem, headlineInput, photoInputs, photoCaption } from './lib/design/photoPost.js';
import { getTemplate } from './lib/design/templates/index.ts';
import { fillTemplate } from './lib/design/mapBranding.ts';
import { defaultCaption } from './lib/design/defaultCaption.js';

// every listed key is a real, photo-first template with a story twin, one picture slot, and only a headline required
for (const [field, keys] of Object.entries(PHOTO_FEED_KEYS)) {
  assert.ok(keys.length >= 3, `${field}: enough designs to step through`);
  for (const key of keys) {
    const feed = getTemplate(key), story = getTemplate(key.replace(/-feed$/, '-story'));
    assert.ok(feed && story, `${key} and its story exist`);
    assert.equal(feed.format, 'feed45'); assert.equal(story.format, 'story');
    assert.ok((feed.fields as string[]).includes(field), `${key} belongs to ${field}`);
    for (const t of [feed, story]) {
      assert.equal(t.slots.length, 1, `${t.key}: one picture`);
      assert.equal(t.slots[0].key, 'photo');
      assert.ok(!t.slots[0].consent, `${t.key}: the photo slot is not the client-library slot`);
      const img = t.layers.find((l: any) => l.type === 'image') as any;
      assert.ok(img.box.w === 100 && img.box.h === 100, `${t.key}: full-bleed photo`);
      const req = t.variables.filter((v: any) => v.required).map((v: any) => v.key);
      assert.deepEqual(req, ['headline'], `${t.key}: only the headline is required, and it has a default`);
      assert.ok(t.variables.find((v: any) => v.key === 'headline')!.default);
    }
  }
}

// choosing: field-aware, wraps, interleaves for a dual-field tenant, never empty
assert.deepEqual(photoCandidates(['nails']), PHOTO_FEED_KEYS.nails);
assert.deepEqual(photoCandidates(['cosmetics']), PHOTO_FEED_KEYS.cosmetics);
assert.deepEqual(photoCandidates([]), PHOTO_FEED_KEYS.cosmetics, 'no field = cosmetics, like businessFieldsOf');
assert.deepEqual(photoCandidates(undefined), PHOTO_FEED_KEYS.cosmetics);
const both = photoCandidates(['cosmetics', 'nails']);
assert.equal(both.length, 6);
assert.ok(both[0].startsWith('nail-') && !both[1].startsWith('nail-'));
assert.deepEqual(pickPhotoKeys(['nails'], 0), { feed: 'nail-new-shade-feed', story: 'nail-new-shade-story' });
assert.equal(pickPhotoKeys(['nails'], 3).feed, 'nail-new-shade-feed', 'wraps around');
assert.equal(pickPhotoKeys(['nails'], -1).feed, 'nail-event-feed', 'negative wraps too');
assert.equal(pickPhotoKeys(['cosmetics'], 1.5).feed, 'pampering-feed', 'a non-integer falls back to the first');
assert.equal(startIndex(new Date(2026, 0, 1)), 1);
assert.equal(startIndex(new Date(2026, 9, 25)), 298);

// the photo may be used only after an explicit yes (fails closed), and never in read-only
assert.equal(photoUse({ hasPhoto: true, agreed: true, readOnly: false }).ok, true);
assert.equal(photoUse({ hasPhoto: true, agreed: false, readOnly: false }).ok, false);
assert.equal(photoUse({ hasPhoto: true, agreed: undefined, readOnly: false }).ok, false);
assert.equal(photoUse({ hasPhoto: true, agreed: 'yes' as any, readOnly: false }).ok, false, 'only a real true counts');
assert.equal(photoUse({ hasPhoto: false, agreed: true, readOnly: false }).ok, false);
assert.equal(photoUse({ hasPhoto: true, agreed: true, readOnly: true }).ok, false);
assert.match(photoUse({ hasPhoto: true, agreed: false, readOnly: false }).why, /אישרה/);

// files
assert.equal(photoFileProblem({ type: 'image/jpeg', size: 4_000_000 }), null);
assert.equal(photoFileProblem({ type: 'image/heic', size: 4_000_000 }), null, 'iPhone HEIC is an image');
assert.ok(photoFileProblem({ type: 'application/pdf', size: 10 }));
assert.ok(photoFileProblem({ type: 'image/png', size: 26 * 1024 * 1024 }));
assert.ok(photoFileProblem(null));

// the headline she types
assert.equal(headlineInput('  שלום   עולם '), 'שלום עולם');
assert.equal(headlineInput('א'.repeat(80), 40).length, 40);
assert.equal(headlineInput(undefined), '');
const pamp = getTemplate('pampering-feed')!;
assert.deepEqual(photoInputs('', pamp), {}, 'empty keeps the default');
assert.deepEqual(photoInputs('טיפול פנים מפנק', pamp), {}, 'the same as the default changes nothing');
assert.deepEqual(photoInputs('עור זוהר', pamp), { headline: 'עור זוהר' });

// the caption: from the card's words and her business line, nothing about the client; an edit wins verbatim
const settings = { business_name: 'סטודיו נועה', business_phone: '0501234567', primary_color: '#7A4E8C' };
const fill = fillTemplate(pamp, { settings, inputs: photoInputs('עור זוהר', pamp) });
const cap = photoCaption(defaultCaption, pamp, fill.values, settings, undefined);
assert.ok(cap.includes('עור זוהר') && cap.includes('סטודיו נועה') && cap.includes('0501234567'));
assert.equal(photoCaption(defaultCaption, pamp, fill.values, settings, 'שלי'), 'שלי');
assert.equal(photoCaption(defaultCaption, pamp, fill.values, settings, ''), '', 'she may empty it');
// her brand, never Kalmea's: the fill uses her primary colour
assert.equal(fill.colors.primary.toLowerCase(), '#7a4e8c');

console.log('test-photo-post: ok');

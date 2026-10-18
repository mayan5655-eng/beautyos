// The help page for a nail technician: facial-only text is gone, everything else is there; cosmetics (and mixed) get the original untouched.
import assert from 'node:assert/strict';
import { HELP_SECTIONS, helpSectionsFor } from './lib/helpSections.ts';

const all = (secs: typeof HELP_SECTIONS) => secs.map((s) => s.title + '\n' + s.body.join('\n')).join('\n');

// cosmetics, mixed, unknown and empty: the original, same object, nothing rewritten
assert.equal(helpSectionsFor(['cosmetics']), HELP_SECTIONS);
assert.equal(helpSectionsFor(['cosmetics', 'nails']), HELP_SECTIONS, 'a business with both fields keeps the full text');
assert.equal(helpSectionsFor([]), HELP_SECTIONS);
assert.equal(helpSectionsFor(undefined), HELP_SECTIONS);
assert.equal(helpSectionsFor(['hair']), HELP_SECTIONS, 'a field that is not nails never loses text');

const original = all(HELP_SECTIONS);
for (const word of ['סוג עור', 'סריקות עור', 'סריקת עור', 'פלזמה', 'לייזר', 'פילינג', 'בוטוקס', 'קליניקה']) {
  assert.ok(original.includes(word), `the original mentions ${word} (so the test below means something)`);
}

const nails = helpSectionsFor(['nails']);
const text = all(nails);
for (const word of ['סוג עור', 'סריקות עור', 'סריקת עור', 'פלזמה', 'לייזר', 'פילינג', 'בוטוקס', 'קליניקה', 'מצלמת פנים']) {
  assert.ok(!text.includes(word), `a nail technician's help does not mention ${word}`);
}
// the same sections in the same order, with the nail forms named where the facial ones were
assert.deepEqual(nails.map((s) => s.key), HELP_SECTIONS.map((s) => s.key));
assert.ok(text.includes('ציפורניים'), 'it names the nail forms');
assert.ok(text.includes('שלושה כפתורים בראש הכרטיס'), 'the client card has three buttons without the scan');
assert.ok(text.includes('וסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות)'), 'the filter line stays, without skin type');
// not a single line was lost beyond the facial ones
const lines = (secs: typeof HELP_SECTIONS) => secs.reduce((n, s) => n + s.body.length, 0);
assert.equal(lines(HELP_SECTIONS) - lines(nails), 6, 'exactly the 6 facial-only lines are dropped (skin tab, scan heading, scan how-to, scan booking line, scan quota, the injectables warning)');
// the text itself was not edited for cosmetics
assert.ok(original.includes('סריקת עור AI'), 'cosmetics help is unchanged');
console.log('help sections: ok');

// "מה מפרסמים השבוע": pure suggestions from what the app knows.
import assert from 'node:assert/strict';
import { suggestPosts, quietDay, unpostedService } from './lib/design/suggestions.ts';
import { getTemplate } from './lib/design/templates/index.ts';

const day = (s: string) => new Date(`${s}T10:00:00+03:00`);
const today = day('2026-08-31'); // a Monday, 12 days before Rosh Hashana 5787
const busy = ['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-02', '2026-09-02', '2026-09-03', '2026-09-03', '2026-09-03', '2026-09-06', '2026-09-06'];

// The quiet day: Thursday 3.9 has three, Tuesday 1.9 has three, Wednesday two, Sunday two... the emptiest working day.
const q = quietDay({ today, appointments: busy.map((date) => ({ date })) });
assert.ok(q && (q.date === '2026-09-04' || q.date === '2026-09-07'), 'a working day with nothing booked');
assert.equal(q!.count, 0);
assert.equal(quietDay({ today, appointments: [] }), null, 'an empty calendar has nothing to fill');
assert.equal(quietDay({ today, appointments: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-06', '2026-09-07'].map((date) => ({ date })) }), null, 'a uniformly booked week has no quiet day');
assert.equal(quietDay({ today, appointments: [{ date: '2026-09-01' }], workingDays: [2] })?.date, undefined, 'one working day, booked: nothing');

// A service she never posted about.
assert.equal(unpostedService({ services: [{ name: 'פילינג' }, { name: 'לייזר' }], designs: [{ values: { headline: 'מבצע פילינג לחורף' } }] }), 'לייזר');
assert.equal(unpostedService({ services: [], designs: [] }), null);

const s = suggestPosts({
  today, appointments: busy.map((date) => ({ date })), services: [{ name: 'לייזר' }], reviews: [{ name: 'דנה' }], designs: [],
  holidayTemplates: { rosh_hashana: 'rosh-hashana-feed' },
});
assert.equal(s[0].key, 'occasion:rosh_hashana', 'occasions first');
assert.equal(s[0].templateKey, 'rosh-hashana-feed');
assert.match(s[0].reason, /ראש השנה בעוד 12 ימים/);
assert.ok(s.some((x) => x.key.startsWith('quiet:') && x.templateKey === 'slot-opened-feed' && /יום/.test(x.values.subline)), 'the quiet day as a slot-opened post');
assert.ok(s.some((x) => x.key === 'service:לייזר' && x.values.headline === 'לייזר'));
assert.ok(s.some((x) => x.key === 'review'));
assert.ok(s.some((x) => x.key === 'tip'));
assert.ok(s.length <= 5);
for (const x of s) assert.ok(getTemplate(x.templateKey), `${x.templateKey} exists`);

// Nothing known: still the week's tip, never an empty screen.
const bare = suggestPosts({ today: day('2026-11-02') });
assert.equal(bare.length, 1);
assert.equal(bare[0].key, 'tip');
assert.ok(['tip-feed', 'routine-feed', 'info-feed', 'myths-feed', 'faq-feed', 'skin-health-feed'].includes(bare[0].templateKey), 'default fields (none passed) is cosmetics, unchanged from before business_fields existed');

// ── business_fields: unposted-service and the weekly tip, per field ────────
const NAILS_TIP_KEYS = ['nail-tip-gel-last-feed', 'nail-tip-dont-feed', 'nail-faq-feed', 'nail-myths-feed'];
// 2.11.2026 sits inside autumn's window (lib/design/holidays.ts's span), so a
// nails-active call also gets the seasonal design-idea nudge alongside the
// plain tip — both are real, independent suggestions, not a conflict.
const nailsBare = suggestPosts({ today: day('2026-11-02'), fields: ['nails'] });
assert.equal(nailsBare.length, 2);
assert.ok(nailsBare.some((x) => x.key === 'tip' && NAILS_TIP_KEYS.includes(x.templateKey)), 'a single field still keys the plain "tip", not "tip:nails"');
assert.ok(nailsBare.some((x) => x.key === 'design-idea:autumn' && x.templateKey === 'nail-autumn-palette-feed'), 'the seasonal design-idea nudge (see designIdeaSuggestion), distinct from a plain occasion post');

const dual = suggestPosts({ today: day('2026-11-02'), fields: ['cosmetics', 'nails'] });
assert.ok(dual.some((x) => x.key === 'tip' && ['tip-feed', 'routine-feed', 'info-feed', 'myths-feed', 'faq-feed', 'skin-health-feed'].includes(x.templateKey)), 'the first field keeps the plain key');
assert.ok(dual.some((x) => x.key === 'tip:nails' && NAILS_TIP_KEYS.includes(x.templateKey)), 'a second active field adds its own, field-qualified');
assert.ok(dual.some((x) => x.key === 'design-idea:autumn'), 'the design-idea nudge fires once regardless of how many fields are active (it is nails-specific, not per-field)');

// A never-posted nails service points at the nails fallback template, not the cosmetics one.
const nailsService = suggestPosts({
  today, appointments: [], services: [{ name: 'מניקור ג׳ל', field: 'nails' }], designs: [], fields: ['nails'],
});
assert.ok(nailsService.some((x) => x.key === 'service:מניקור ג׳ל' && x.templateKey === 'nail-design-showcase-feed' && x.values.headline === 'מניקור ג׳ל'));
// A service with no field at all still falls back to the cosmetics template, same as always.
assert.equal(unpostedService({ services: [{ name: 'עיצוב גבות' }], designs: [] }), 'עיצוב גבות');
for (const x of [...nailsBare, ...dual, ...nailsService]) assert.ok(getTemplate(x.templateKey), `${x.templateKey} exists`);

console.log('design suggestions: ok');

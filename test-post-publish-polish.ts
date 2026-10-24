// The post-publishing polish of 2026-10-24, after a customer could not get a post onto her phone:
//   1. the template's sample photo is an explicit choice (it showed in the preview and was missing from the file)
//   2. "did you post it?" after sharing a content-plan post
//   3. a ready caption on a design she never wrote one for
//   4. every save/share outcome counted, for the admin panel
//   5. "שמירה ושיתוף" straight from the cards in "My designs"
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultCaption } from './lib/design/defaultCaption.js';
import { cleanShareEvent, SHARE_OUTCOMES } from './lib/design/shareEvent.js';
import { getTemplate, TEMPLATES } from './lib/design/templates/index.ts';
import { fillTemplate } from './lib/design/mapBranding.ts';
import { REFERENCED_TABLES } from './lib/referencedTables.js';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const settings = { business_name: 'סטודיו רונית', business_phone: '0501234567' };

// ── 3. default caption ──
const tpl = { variables: [
  { key: 'kicker', kind: 'text', source: 'static' },
  { key: 'headline', kind: 'text', source: 'user' },
  { key: 'subline', kind: 'text', source: 'user' },
  { key: 'price', kind: 'price', source: 'user' },
  { key: 'price_note', kind: 'text', source: 'static' },
  { key: 'label_before', kind: 'text', source: 'static' },
  { key: 'cta', kind: 'cta', source: 'user' },
  { key: 'business_name', kind: 'text', source: 'business_name' },
  { key: 'contact', kind: 'text', source: 'contact' },
] };
const cap = defaultCaption(tpl, { kicker: 'מבצע', headline: 'פילינג  לקיץ', subline: '', price: '249₪', price_note: 'לזמן מוגבל', label_before: 'לפני', cta: 'לקביעת תור', business_name: 'x', contact: '050' }, settings);
assert.equal(cap, 'מבצע\nפילינג לקיץ\n249₪\nלזמן מוגבל\n\n✨ סטודיו רונית\nלקביעת תור: 0501234567');
assert.equal(defaultCaption(tpl, { headline: 'שלום' }, {}), 'שלום', 'no business details: just the card text');
assert.equal(defaultCaption({ variables: [] }, {}, null), '');
const review = { variables: [
  { key: 'quote_mark', kind: 'text', source: 'static' },
  { key: 'review_text', kind: 'text', source: 'review_text' },
  { key: 'stars', kind: 'stars', source: 'review_rating' },
  { key: 'review_name', kind: 'text', source: 'review_name' },
] };
assert.equal(defaultCaption(review, { quote_mark: '״', review_text: 'מדהימה', stars: '★★★★★', review_name: 'דנה' }, {}), '"מדהימה"\n- דנה');
// every real template yields a non-empty caption from its own defaults (a brand-new tenant's first design)
let checked = 0;
for (const t of TEMPLATES as any[]) {
  if (!t?.variables) continue;
  const f = fillTemplate(t, { settings, inputs: {} });
  const c = defaultCaption(t, f.values, settings);
  assert.ok(c.length > 0 && c.length <= 2200, `${t.key}: a caption between 1 and 2200 characters`);
  checked++;
}
assert.ok(checked > 20, `checked ${checked} templates`);
assert.ok(getTemplate);

// ── 4. share events ──
assert.deepEqual(cleanShareEvent({ kind: 'image', outcome: 'shared', canShare: true, source: 'plan' }), { kind: 'image', outcome: 'shared', can_share: true, source: 'plan' });
assert.deepEqual(cleanShareEvent({ kind: 'video', outcome: 'download', source: 'evil' }), { kind: 'video', outcome: 'download', can_share: null, source: null });
assert.equal(cleanShareEvent({ kind: 'image', outcome: 'drop table' }), null);
assert.equal(cleanShareEvent({ kind: 'pdf', outcome: 'shared' }), null);
assert.equal(cleanShareEvent(null), null);
const sql = read('supabase/migrations/add_share_events.sql');
for (const o of SHARE_OUTCOMES) assert.ok(sql.includes(`'${o}'`), `the table accepts outcome ${o}`);
assert.match(sql, /enable row level security/);
assert.ok(REFERENCED_TABLES.includes('share_events'), 'share_events is in the referenced tables');
const route = read('app/api/designs/share-event/route.ts');
assert.match(route, /auth\.getUser\(\)/, 'the event route needs a session');
assert.match(route, /cleanShareEvent\(/, 'and validates the body');
assert.match(read('app/dashboard/admin/page.tsx'), /<ShareEvents db=\{db\} \/>/, 'the admin panel shows the counts');

const panel = read('app/design/SaveShare.jsx');
for (const o of ['opened', 'shared', 'download', 'posted']) assert.ok(panel.includes(`'${o}'`), `the panel logs ${o}`);
assert.match(panel, /keepalive: true/, 'events survive the page going to Instagram');

// ── 2. did you post it ──
assert.match(panel, /פרסמת את הפוסט\?/);
assert.match(read('app/design/ContentPlan.jsx'), /onPosted=\{item\.status !== 'posted'/, 'only for a post not marked yet');

// ── 1. sample photo by choice ──
const editor = read('app/design/DesignEditor.jsx');
assert.match(editor, /להכניס לפוסט את תמונת הדוגמה\?/, 'export asks before using the sample photo');
assert.match(editor, /להשתמש בתמונה הזו/, 'and the preview offers it');
assert.match(editor, /window\.location\.origin/, 'stored as a full https URL, which sanitizeImages accepts');

// ── 5. share from My designs ──
const studio = read('app/design/DesignStudio.jsx');
assert.match(studio, /data-testid="mine-share"/);
assert.match(studio, /source="mine"/);
assert.match(studio, /להכניס לפוסט את תמונת הדוגמה?/, 'a card asks about the sample photo too');

console.log('post publish polish: ok');

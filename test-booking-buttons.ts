// "כפתור קביעת תור באינסטגרם ובגוגל" (lib/bookingButtons.ts, app/BookingButtonsCard.jsx): the four guides, their tagged links
// (which lib/bookingSource.ts must read back), the ticks in settings.automations, the copy rules, and where the card lives.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOKING_PLATFORMS, platformLink, doneMap, withDone, platformSourcesValid, BOOKING_BUTTONS_KEY } from './lib/bookingButtons.ts';
import { readSourceParams, SOURCE_CHANNELS } from './lib/bookingSource.ts';
import { TUTORIAL_TITLES } from './lib/helpSections.ts';

const rd = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('four platforms, 3 to 5 steps each', () => {
  assert.deepEqual(BOOKING_PLATFORMS.map((p) => p.key), ['instagram', 'google', 'facebook', 'whatsapp']);
  for (const p of BOOKING_PLATFORMS) assert.ok(p.steps.length >= 3 && p.steps.length <= 5, `${p.key}: ${p.steps.length} steps`);
});

ok('each link is tagged with its own channel, and the booking page reads it back', () => {
  assert.ok(platformSourcesValid());
  for (const p of BOOKING_PLATFORMS) {
    assert.ok((SOURCE_CHANNELS as readonly string[]).includes(p.src));
    assert.equal(p.src, p.key, 'src=instagram, google, facebook, whatsapp');
    for (const base of ['https://kalmea.app/lily-nails', 'https://kalmea.app/book?t=3f2a1b4c-0000-4000-8000-00000000abcd']) {
      const link = platformLink(base, p);
      const u = new URL(link);
      assert.equal(u.searchParams.get('src'), p.src);
      assert.equal(readSourceParams(u.search).src, p.src);
      if (base.includes('?t=')) assert.equal(u.searchParams.get('t'), '3f2a1b4c-0000-4000-8000-00000000abcd', 'the tenant id survives');
    }
  }
});

ok('ticks: stored under automations.booking_buttons, unreadable values are "not done", untick removes', () => {
  assert.equal(BOOKING_BUTTONS_KEY, 'booking_buttons');
  assert.deepEqual(doneMap(null), {});
  assert.deepEqual(doneMap({ booking_buttons: 'x' }), {});
  assert.deepEqual(doneMap({ booking_buttons: { instagram: '2026-11-05', google: true, tiktok: '2026-01-01', facebook: 3 } }), { instagram: '2026-11-05', google: 'yes' });
  const a = { booking_buttons: { instagram: '2026-11-01' } };
  assert.deepEqual(withDone(a, 'google', true, new Date('2026-11-05T10:00:00Z')), { instagram: '2026-11-01', google: '2026-11-05' });
  assert.deepEqual(withDone(a, 'instagram', false), {});
});

ok('honest copy: links, not integrations; no dashes; feminine', () => {
  const all = BOOKING_PLATFORMS.flatMap((p) => [p.name, p.where, p.note || '', ...p.steps]);
  for (const s of all) {
    assert.ok(!/[‒-―]/.test(s), `long dash in: ${s}`);
    assert.ok(!/\s-\s/.test(s), `spaced hyphen in: ${s}`);
  }
  assert.ok(!/(חיבור אוטומטי|אינטגרציה|API|מחובר לקלמיה|סנכרון)/.test(all.join(' ')), 'the steps never claim a connection');
  const card = rd('app/BookingButtonsCard.jsx');
  assert.match(card, /לא חיבור אוטומטי/);
  assert.match(card, /סימנתי שעשיתי/);
  assert.ok(!/[–—]/.test(card), 'no long dash in the card');
  assert.ok(/שהעתקת/.test(all.join(' ')) && !/שהעתקתה|העתק /.test(all.join(' ')), 'feminine second person');
  assert.match(BOOKING_PLATFORMS[0].note || '', /חברות שותפות/, 'Instagram: the Book button needs a partner, said plainly');
});

ok('the matching tutorial video is linked', () => {
  // 2026-11-09: the card has its own video now (it used to point to the general "my page" one).
  assert.ok(TUTORIAL_TITLES['booking-button']);
  assert.match(rd('app/BookingButtonsCard.jsx'), /tutorialHref\('booking-button'\)/);
});

ok('the card lives in Settings > הדף שלי, copies through copyPublicLink, and saves through the settings save route', () => {
  const app = rd('app/beautyos.jsx');
  const page = app.indexOf('{inG("page")&&(()=>{');
  const card = app.indexOf('<BookingButtonsCard');
  assert.ok(page > 0 && card > page, 'inside the הדף שלי group');
  assert.match(app, /onCopy=\{\(src,msg\)=>copyPublicLink\("book",src,msg\)\}/);
  assert.match(app, /onSaveDone=\{\(next\)=>saveAutomationsKey\("booking_buttons",next\)\}/);
  const save = app.slice(app.indexOf('const saveAutomationsKey'), app.indexOf('const saveAutomationsKey') + 1200);
  assert.match(save, /fetch\("\/api\/settings\/save"/);
  assert.match(save, /toast\("הסימון לא נשמר/, 'a failed save is said, never a silent success');
  assert.match(save, /setEditSettings\(put\)/, 'the open Settings panel carries the same value');
});

console.log(`\n${n} booking buttons checks passed`);

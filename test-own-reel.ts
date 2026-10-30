// "רילס מהצילומים שלי" (lib/design/ownReel.js): what a file may be, the timeline, one line of words per scene, the
// closing card's lines, and the consent rule (explicit yes, fails closed).
import assert from 'node:assert/strict';
import {
  MAX_ITEMS, PHOTO_MS, VIDEO_MAX_MS, VIDEO_MIN_MS, END_MS, MEDIA_BUDGET_MS, CAPTION_MAX,
  mediaKind, ownMediaProblem, roomFor, planOwnReel, captionLine, defaultCaptions, defaultHeadline, canBeforeAfter,
  endCardLines, ownReelUse, ownReelCaption,
} from './lib/design/ownReel.js';

// files: by type, and by name when an iPhone hands over an empty type
assert.equal(mediaKind({ type: 'image/jpeg', name: 'a.jpg' }), 'photo');
assert.equal(mediaKind({ type: 'video/quicktime', name: 'IMG_1.MOV' }), 'video');
assert.equal(mediaKind({ type: '', name: 'IMG_2.HEIC' }), 'photo');
assert.equal(mediaKind({ type: '', name: 'IMG_3.MOV' }), 'video');
assert.equal(mediaKind({ type: 'application/pdf', name: 'x.pdf' }), null);
assert.equal(ownMediaProblem(null), 'לא נבחר קובץ');
assert.match(ownMediaProblem({ type: 'application/pdf', name: 'x.pdf', size: 10 })!, /רק תמונות או סרטונים/);
assert.match(ownMediaProblem({ type: 'image/jpeg', name: 'a.jpg', size: 30 * 1024 * 1024 })!, /25MB/);
assert.match(ownMediaProblem({ type: 'video/mp4', name: 'a.mp4', size: 300 * 1024 * 1024 })!, /200MB/);
assert.equal(ownMediaProblem({ type: 'video/mp4', name: 'a.mp4', size: 50 * 1024 * 1024 }), null);

// room: never more than MAX_ITEMS, and she is told when some were left out
assert.deepEqual(roomFor(0, 3), { take: 3, note: '' });
assert.equal(roomFor(4, 5).take, MAX_ITEMS - 4);
assert.match(roomFor(4, 5).note, new RegExp(`עד ${MAX_ITEMS}`));
assert.equal(roomFor(MAX_ITEMS, 1).take, 0);

// timeline: photos hold, clips play up to the cap, the closing card ends it, scenes follow each other with no gap
{
  const p = planOwnReel([{ kind: 'photo' }, { kind: 'video', durationMs: 4200 }, { kind: 'video', durationMs: 20000 }, { kind: 'photo' }]);
  assert.deepEqual(p.scenes.map((s) => s.kind), ['photo', 'video', 'video', 'photo', 'end']);
  assert.deepEqual(p.scenes.map((s) => s.ms), [PHOTO_MS, 4200, VIDEO_MAX_MS, PHOTO_MS, END_MS]);
  for (let i = 1; i < p.scenes.length; i++) assert.equal(p.scenes[i].startMs, p.scenes[i - 1].startMs + p.scenes[i - 1].ms);
  assert.equal(p.totalMs, p.scenes.at(-1)!.startMs + END_MS);
  assert.equal(p.scenes[1].item, 1);
}
// six long clips: shortened together to fit the budget, never below the floor
{
  const p = planOwnReel(Array.from({ length: 6 }, () => ({ kind: 'video', durationMs: 60000 })));
  const media = p.scenes.filter((s) => s.kind !== 'end').reduce((n, s) => n + s.ms, 0);
  assert.ok(media <= MEDIA_BUDGET_MS + 6, `media ${media} within budget`);
  assert.ok(p.scenes.filter((s) => s.kind === 'video').every((s) => s.ms >= VIDEO_MIN_MS));
  assert.ok(p.totalMs <= 30000 + 6);
}
// a very short clip keeps its own length; an unknown length gets the cap; more than six are cut
assert.equal(planOwnReel([{ kind: 'video', durationMs: 800 }]).scenes[0].ms, 800);
assert.equal(planOwnReel([{ kind: 'video' }]).scenes[0].ms, VIDEO_MAX_MS);
assert.equal(planOwnReel(Array.from({ length: 9 }, () => ({ kind: 'photo' }))).scenes.length, MAX_ITEMS + 1);
assert.deepEqual(planOwnReel([]).scenes.map((s) => s.kind), ['end']);

// words: one line, spaces collapsed, ₪ glued to its number, cut to the limit
assert.equal(captionLine('  שורה\nשנייה  '), 'שורה שנייה');
assert.equal(captionLine('רק 120 ₪ היום'), 'רק 120₪ היום');
assert.equal(Array.from(captionLine('א'.repeat(80))).length, CAPTION_MAX);
assert.equal(captionLine(undefined as any), '');

// default words: before/after marks first and last; otherwise her field's lines, never empty
assert.deepEqual(defaultCaptions(3, { beforeAfter: true }), ['לפני', '', 'אחרי']);
assert.deepEqual(defaultCaptions(2, { beforeAfter: true }), ['לפני', 'אחרי']);
assert.equal(defaultCaptions(1, { beforeAfter: true })[0] !== 'לפני', true, 'one picture is not a before/after');
assert.ok(defaultCaptions(6, { fields: ['cosmetics'] }).every(Boolean));
assert.notDeepEqual(defaultCaptions(3, { fields: ['nails'] }), defaultCaptions(3, { fields: ['cosmetics'] }));
assert.ok(defaultCaptions(4, { fields: ['nails'] }).every((s) => !/\d/.test(s[0])), 'no line starts with a digit');
assert.equal(canBeforeAfter(1), false); assert.equal(canBeforeAfter(2), true);
assert.ok(defaultHeadline(['nails']) && defaultHeadline(['cosmetics']));

// closing card: one line per detail, phone and handle each alone, nothing she hid or does not have
{
  const all = endCardLines({ businessName: 'סטודיו רונית', phone: '050-123 4567', instagram: '@ronit.nails' });
  assert.deepEqual(all.map((l) => l.role), ['name', 'cta', 'phone', 'handle']);
  assert.equal(all[2].text, '0501234567');
  assert.equal(all[1].text, 'לקביעת תור');
  assert.deepEqual(endCardLines({ businessName: 'סטודיו', phone: '050-123 4567', instagram: '@x', showPhone: false }).map((l) => l.role), ['name', 'cta', 'handle']);
  assert.equal(endCardLines({ businessName: 'סטודיו', instagram: '@x' })[1].text, 'עקבי אחריי');
  assert.deepEqual(endCardLines({ businessName: 'סטודיו' }).map((l) => l.role), ['name']);
  assert.deepEqual(endCardLines({ businessName: '', phone: '12', instagram: 'not a handle' }), []);
}

// consent: fails closed
assert.equal(ownReelUse({ count: 2, agreed: false, readOnly: false }).ok, false);
assert.equal(ownReelUse({ count: 2, agreed: undefined as any, readOnly: false }).ok, false);
assert.equal(ownReelUse({ count: 0, agreed: true, readOnly: false }).ok, false);
assert.equal(ownReelUse({ count: 2, agreed: true, readOnly: true }).ok, false);
assert.deepEqual(ownReelUse({ count: 2, agreed: true, readOnly: false }), { ok: true, why: '' });

// post text: her edit wins; the default carries her business and contact, never anything about a client
assert.equal(ownReelCaption({ edited: 'שלי' }), 'שלי');
{
  const t = ownReelCaption({ headline: 'מהטיפולים שלי', businessName: 'סטודיו רונית', phone: '050-1234567', instagram: '@ronit' });
  assert.ok(t.includes('סטודיו רונית') && t.includes('0501234567') && t.includes('@ronit'));
  assert.equal(ownReelCaption({ headline: '', businessName: '' }), '');
}

console.log('own reel: ok');

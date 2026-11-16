// "הקבוצות שלי" (2026-11-16): her Facebook groups saved once, opened from every finished post with the text copied.
// Meta has no group-posting API, so this pins the link cleaning, the "posted this week" logic, and that the UI
// stays hidden until the SQL runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeGroupUrl, cleanGroupInput, postedThisWeek, sortGroups, weekStart } from './lib/design/facebookGroups.js';

// links she might paste
const G = 'https://www.facebook.com/groups/123456789/';
assert.equal(normalizeGroupUrl('https://www.facebook.com/groups/123456789'), G);
assert.equal(normalizeGroupUrl('facebook.com/groups/123456789/?ref=share&mibextid=abc'), G);
assert.equal(normalizeGroupUrl('https://m.facebook.com/groups/123456789/permalink/555/'), G);
assert.equal(normalizeGroupUrl('  הצטרפי לקבוצה https://web.facebook.com/groups/123456789 תודה'), G);
assert.equal(normalizeGroupUrl('https://www.facebook.com/groups/beauty.tlv'), 'https://www.facebook.com/groups/beauty.tlv/');
assert.equal(normalizeGroupUrl('https://www.facebook.com/share/g/1AbC-xyz/'), 'https://www.facebook.com/share/g/1AbC-xyz/');
assert.equal(normalizeGroupUrl('https://www.facebook.com/kalmea'), null, 'a page is not a group');
assert.equal(normalizeGroupUrl('https://evilfacebook.com/groups/1'), null);
assert.equal(normalizeGroupUrl('https://facebook.com.evil.io/groups/1'), null);
assert.equal(normalizeGroupUrl('javascript:alert(1)//facebook.com/groups/1'), 'https://www.facebook.com/groups/1/', 'only the clean https link survives');
assert.equal(normalizeGroupUrl(''), null);
assert.equal(normalizeGroupUrl(undefined), null);

// input
assert.deepEqual(cleanGroupInput({ name: '  קוסמטיקאיות   בצפון ', url: 'fb.com/groups/42', rule: '' }), { name: 'קוסמטיקאיות בצפון', url: 'https://www.facebook.com/groups/42/', rule: null });
assert.ok('error' in cleanGroupInput({ name: 'x', url: 'https://instagram.com/x' }));
assert.ok('error' in cleanGroupInput({ name: '   ', url: G }));
assert.equal((cleanGroupInput({ name: 'a'.repeat(200), url: G, rule: 'b'.repeat(400) }) as { name: string; rule: string }).name.length, 80);
assert.ok('error' in cleanGroupInput(null));

// this week = since Sunday 00:00
const wed = new Date(2026, 10, 18, 12, 0); // Wednesday
assert.equal(weekStart(wed).getDay(), 0);
assert.equal(postedThisWeek(new Date(2026, 10, 16, 9, 0).toISOString(), wed), true, 'Monday counts');
assert.equal(postedThisWeek(new Date(2026, 10, 14, 22, 0).toISOString(), wed), false, 'last Saturday does not');
assert.equal(postedThisWeek(null, wed), false);
assert.equal(postedThisWeek('nonsense', wed), false);

// the ones still to post in come first
const sorted = sortGroups([
  { name: 'ב', last_posted_at: new Date(2026, 10, 17).toISOString() },
  { name: 'ג', last_posted_at: null },
  { name: 'א', last_posted_at: null },
], wed).map((g) => g.name);
assert.deepEqual(sorted, ['א', 'ג', 'ב']);

// wiring: the panel and the "where to post" card both show it; it hides itself until the table exists
const panel = fs.readFileSync('app/design/SaveShare.jsx', 'utf8');
assert.match(panel, /<FacebookGroups mode="share"/);
const week = fs.readFileSync('app/design/WeekView.jsx', 'utf8');
assert.match(week, /<FacebookGroups mode="manage"/);
const ui = fs.readFileSync('app/design/FacebookGroups.jsx', 'utf8');
assert.match(ui, /if \(state\.loading \|\| !state\.available\) return null/, 'nothing shows before the SQL runs');
assert.ok(ui.indexOf('window.open(g.url') < ui.indexOf('clipboard?.writeText(caption)'), 'open first, copy after (Safari tap rule)');
const api = fs.readFileSync('app/api/facebook-groups/route.ts', 'utf8');
assert.match(api, /available: false/);
for (const verb of ['update', 'delete']) assert.match(api, new RegExp(`\\.${verb}\\([^)]*\\)[\\s\\S]{0,80}\\.eq\\('tenant_id', c\\.tenantId\\)`), `${verb} is pinned to her tenant`);

console.log('test-facebook-groups: ok');

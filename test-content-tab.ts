// The "תוכן" tab: posts and templates first, AI in ONE marked block.
//
// Decided 2026-10-06. Templates and her designs need no AI at all; under a tab labelled "תוכן AI" a
// cosmetician wary of AI would not open the most useful feature in the product, and on a day the AI
// provider is down she would think the whole tab was broken. So every action that uses AI sits in a single
// block labelled "עם AI", and nothing outside that block calls an AI route.
//
// Rewritten 2026-10-06 (Stage 3). The first version of this file searched the component's SOURCE for strings
// ("the block contains part=\"ai\""), which stays green when the component renders something else. This one
// RENDERS the real DesignStudio and WeekView (testkit/render.mjs) and reads what she would see: the buttons
// inside the marked block against the buttons outside it. Only the navigation in app/beautyos.jsx - a 5,000
// line file that cannot be rendered in isolation - is still checked as source, and says so.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importApp, renderApp, between, textOf, buttonsOf } from './testkit/render.mjs';

const settings = { business_name: 'סטודיו בדיקה', primary_color: '#C2557A', branding: {}, business_fields: ['cosmetics'] };
const studio = (await importApp('app/design/DesignStudio.jsx')).default;
const week = (await importApp('app/design/WeekView.jsx')).default;
const props = { settings, readOnly: false, toast: () => {}, appointments: [], services: [] };

// What she can press that asks the AI for something. If a new AI button is added, it must be added here AND
// live inside the block; the second half of the test (nothing outside matches) is what protects the promise.
const AI_BUTTONS = ['תני לי רעיונות', 'הציעי לי קבוצות', 'צרי לי פוסט', 'לכתוב תסריט'];

// ── the studio as she sees it first ────────────────────────────────────────────────────────────────
const html = renderApp(studio, { ...props, onOpenScript: () => {} });
const blk = between(html, 'data-ai-block');
assert.ok(blk, 'the studio renders a marked AI block');
const inside = buttonsOf(blk!.html);
const outside = buttonsOf(blk!.before + blk!.after);

for (const label of AI_BUTTONS) {
  assert.ok(inside.some((b) => b.includes(label)), `"${label}" is rendered, inside the AI block (buttons there: ${inside.join(' | ')})`);
  assert.ok(!outside.some((b) => b.includes(label)), `"${label}" is NOT rendered anywhere outside the AI block`);
}
assert.ok(inside.length >= AI_BUTTONS.length, 'the block holds the AI cards and the shooting script');

const blockText = textOf(blk!.html);
assert.ok(blockText.includes('עם AI'), 'the block says what it is');
assert.ok(blockText.includes('פתוחים תמיד') && blockText.includes('לא זמין'), 'and says the rest stays open when the AI is unavailable - the honest line');
assert.ok(!textOf(blk!.before + blk!.after).includes('תוכן AI'), 'nothing she sees calls the area "תוכן AI"');

// the part that needs no AI is really there, outside the block, and usable
assert.ok(outside.length > 0, 'there are controls outside the block (templates, ready posts)');
assert.ok(outside.some((b) => b.includes('תבניות')), 'the templates tab is outside the block');

// ── the shooting script entry exists only when the studio can open it ──────────────────────────────
const noScript = between(renderApp(studio, props), 'data-ai-block');
assert.ok(noScript, 'the block still renders without the script entry');
assert.ok(!buttonsOf(noScript!.html).some((b) => b.includes('לכתוב תסריט')), 'no dead "write a script" button when nothing is wired to it');

// ── a read-only (expired) account cannot press the AI actions ──────────────────────────────────────
const ro = between(renderApp(studio, { ...props, readOnly: true, onOpenScript: () => {} }), 'data-ai-block')!.html;
const disabledScript = /<button[^>]*disabled[^>]*>[^<]*לכתוב תסריט/.test(ro);
assert.ok(disabledScript, 'read-only: the script button is disabled, not a button that fails when pressed');

// ── WeekView splits cleanly: the posts part has no AI, the ai part has no posts ─────────────────────
const wProps = { settings, appointments: [], services: [], designs: [], readOnly: false, toast: () => {}, onCreate: () => {}, onReel: () => {} };
const postsOnly = renderApp(week, { ...wProps, part: 'posts' });
const aiOnly = renderApp(week, { ...wProps, part: 'ai' });
const both = renderApp(week, wProps);
for (const label of ['תני לי רעיונות', 'הציעי לי קבוצות']) {
  assert.ok(!buttonsOf(postsOnly).some((b) => b.includes(label)), `part="posts" renders no "${label}"`);
  assert.ok(buttonsOf(aiOnly).some((b) => b.includes(label)), `part="ai" renders "${label}"`);
  assert.ok(buttonsOf(both).some((b) => b.includes(label)), `with no part, both render (the old behaviour) - "${label}" is there`);
}
assert.ok(textOf(postsOnly).length > 0 && textOf(postsOnly) !== textOf(aiOnly), 'the two parts are different things');
assert.ok(textOf(both).length > Math.max(textOf(postsOnly).length, textOf(aiOnly).length) - 1, 'and together they are the whole');

// ── navigation (SOURCE check - beautyos.jsx cannot be rendered on its own) ─────────────────────────
const app = fs.readFileSync('app/beautyos.jsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.ok(app.includes('>פוסטים ותבניות</button>'), '[source] the sub-tab is called "פוסטים ותבניות"');
assert.ok(!app.includes('תוכן AI'), '[source] nothing in the app calls the area "תוכן AI"');
assert.ok(/useState\("posts"\)/.test(app), '[source] posts and templates are the default sub-view');
assert.ok(app.indexOf('>פוסטים ותבניות</button>') < app.indexOf('>קמפיינים בפייסבוק</button>'), '[source] posts come first, Facebook campaigns second');
assert.ok(/onOpenScript=\{\(\)=>setAiPostsView\("reels"\)\}/.test(app), '[source] the studio can open the shooting script');

console.log('content tab: ok');

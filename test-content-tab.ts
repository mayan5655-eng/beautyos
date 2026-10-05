// The "תוכן" tab: posts and templates first, AI in ONE marked block.
//
// Decided 2026-10-06. Templates and her designs need no AI at all; under a tab labelled "תוכן AI" a
// cosmetician wary of AI would not open the most useful feature in the product, and on a day the AI
// provider is down she would think the whole tab was broken. So:
//   * the sub-tab is "פוסטים ותבניות" and it is the DEFAULT (a cosmetician who has not connected
//     Facebook must not land on a screen of zeros);
//   * every action that uses AI - ideas, groups, "create me a post", the shooting script - sits in a
//     single block labelled "עם AI", and the copy says the rest stays open when the AI is down;
//   * nothing outside that block calls an AI route.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const app = code('app/beautyos.jsx');
const studio = code('app/design/DesignStudio.jsx');
const week = code('app/design/WeekView.jsx');

// ── names and default ───────────────────────────────────────────────────────
assert.ok(app.includes('>פוסטים ותבניות</button>'), 'the sub-tab is called "פוסטים ותבניות"');
assert.ok(!app.includes('תוכן AI'), 'nothing in the app calls the area "תוכן AI" any more');
assert.ok(/useState\("posts"\)/.test(app), 'posts and templates are the default sub-view');
const iPosts = app.indexOf('>פוסטים ותבניות</button>'), iCamp = app.indexOf('>קמפיינים בפייסבוק</button>');
assert.ok(iPosts > 0 && iCamp > iPosts, 'posts come first, Facebook campaigns second');
assert.ok(/setMarketingView\("campaigns"\); setActiveTab\("campaigns"\)/.test(app), 'the "create a campaign" shortcut still lands on the Facebook view, not on the new default');
assert.ok(!/setAiPostsView\("studio"\)\} className="primary-btn" style=\{\{padding:"8px 20px"[^}]*fontWeight:600\}\}>סטודיו/.test(app), 'the "סטודיו | תסריט לצילום" switch is gone: the script is an AI action');
assert.ok(/onOpenScript=\{\(\)=>setAiPostsView\("reels"\)\}/.test(app), 'the studio can open the shooting script');
assert.ok(app.includes('← חזרה לפוסטים ותבניות'), 'and there is a way back from it');

// ── the AI block holds all of the AI, and only that ───────────────────────────
const blockStart = studio.indexOf('data-ai-block');
assert.ok(blockStart > 0, 'the studio has a marked AI block');
const blockEnd = studio.indexOf('</div>\n          {error', blockStart) > 0 ? studio.indexOf('</div>\n          {error', blockStart) : studio.indexOf('{error &&', blockStart);
const block = studio.slice(blockStart, blockEnd);
assert.ok(block.includes('עם AI'), 'the block says so');
assert.ok(/פתוחים תמיד/.test(block) && /לא זמין/.test(block), 'and says the rest stays open when the AI is unavailable - the honest line');
assert.ok(block.includes('part="ai"'), 'the two AI cards (what to film, where to post) are inside it');
assert.ok(block.includes('<Generate'), 'the "create me a post" card is inside it');
assert.ok(block.includes('onOpenScript') && block.includes('תסריט לצילום'), 'and so is the shooting script entry');
const outside = studio.slice(0, blockStart) + studio.slice(blockEnd);
assert.ok(!/<Generate/.test(outside), 'Generate is not used anywhere outside the block');
assert.ok(!/part="ai"/.test(outside), 'nor are the AI cards');
assert.ok(outside.includes('part="posts"'), 'the ready posts sit above, outside it');

// ── WeekView really splits ───────────────────────────────────────────────────
assert.ok(/part !== 'ai'/.test(week) && /part !== 'posts'/.test(week), 'WeekView renders only the part it is asked for');
assert.ok(/\{showPosts && <div className="glass-card"/.test(week), 'the ready posts are the posts part');
assert.ok(/\{showAi && <div style=\{\{ display: 'grid'/.test(week), 'the AI cards are the ai part');
const postsPart = week.slice(week.indexOf('{showPosts &&'), week.indexOf('{showAi &&'));
assert.ok(!/loadShoot|loadGroups|\/api\/marketing/.test(postsPart), 'the ready-posts part calls no AI route');
assert.ok(/'\/api\/marketing\/shooting-list'/.test(week) && /'\/api\/marketing\/groups'/.test(week), '(the AI calls it does have are the two cards, in the ai part)');

console.log('content tab: ok');

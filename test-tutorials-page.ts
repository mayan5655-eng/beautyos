// /tutorials: the page the WhatsApp welcome message links to (OWNER_WELCOME_TUTORIALS_URL). Pins that every video it
// plays is in public/tutorials/, that the address cannot be taken by a business, and that the welcome video's last card
// sends her to the support line (replies to the WhatsApp Cloud number the welcome goes out from are not read by anyone).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESERVED_SLUGS, slugError } from './lib/slug.ts';

const raw = (f: string) => fs.readFileSync(f, 'utf8');
const page = raw('app/tutorials/page.tsx');

// Grouped by topic (2026-11-04): each topic's heading, then its videos in order.
const topics = [...page.matchAll(/key: "([a-z]+)",\s*title: "([^"]+)",\s*videos: \[([\s\S]*?)\],\s*\}/g)]
  .map((m) => ({ title: m[2], ids: [...m[3].matchAll(/\{ id: "([a-z-]+)"/g)].map((v) => v[1]) }));
assert.deepEqual(topics, [
  { title: 'להתחיל', ids: ['welcome', 'tour', 'home'] },
  { title: 'יומן ותורים', ids: ['booking', 'appointment-actions', 'reminders'] },
  { title: 'לקוחות', ids: ['clients'] },
  { title: 'תשלומים וקבלות', ids: ['till', 'morning'] },
  { title: 'AI בעסק', ids: ['ai'] },
  { title: 'הדף שלי והגדרות', ids: ['my-page', 'services-hours'] },
], 'twelve videos in six topics, the welcome explainer first, the AI topic before the settings');
const ids = [...page.matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, 12, 'every video on the page is in a topic');
assert.equal(new Set(ids).size, ids.length, 'no video twice');
for (const id of ids) {
  assert.ok(fs.existsSync(`public/tutorials/kalmea-${id}.mp4`), `public/tutorials/kalmea-${id}.mp4 exists`);
  assert.ok(fs.existsSync(`public/tutorials/kalmea-${id}.jpg`), `and its poster`);
}
assert.ok(/<h2[^>]*>\{g\.title\}<\/h2>/.test(page), 'each topic has its own heading');
// The lead and the description once said "ארבעה סרטונים" when there were five: a count in the copy goes stale with every new video.
assert.ok(!/(ארבעה|חמישה|שישה|אחד עשר) סרטונים/.test(page), 'no video count in the copy');
assert.ok(/<PublicAnalytics \/>/.test(page), 'the page view is still counted');
// The topic videos are drawn and end on the flower card: no AI figure (owner, 2026-10-30), and automatic WhatsApp sending is not
// shown while it is hidden in the app (waCentralConnected).
const topicsScript = raw('marketing/topics-motion.mjs');
assert.ok(topicsScript.includes('050-7321978'), 'the topic videos end on the support line');
assert.ok(!/PRESENTER|endCard\(/.test(topicsScript), 'no AI presenter in the topic videos');
assert.ok(!/יוצאות אוטומטית|נשלחת אוטומטית|שליחה אוטומטית/.test(topicsScript.replace(/^\s*\/\/.*$/gm, '')), 'no automatic sending shown');
// The AI video (2026-11-04): no figure stands for the AI (owner, 2026-11-01), the advisor's answer is marked as an example, the
// limits are said plainly, and nothing behind a flag that is off by default is shown (the weekly content plan, publishing to
// Instagram and Facebook: lib/featureFlags.ts).
assert.ok(topicsScript.includes("ai: videoAi"), 'the AI video is built by the topic script');
assert.ok(topicsScript.includes('תשובה לדוגמה'), 'the advisor answer in the video is labelled as an example');
assert.ok(topicsScript.includes('את תמיד מאשרת לפני שמפרסמים'), 'the video says she approves before anything is published');
assert.ok(topicsScript.includes('מתחדשות בראשון לחודש'), 'and that the AI allowance renews on the first of the month (lib/ai/capMessages.ts)');
const aiPart = topicsScript.slice(topicsScript.indexOf('// 7. ai:'), topicsScript.indexOf('// ── build, check, render'));
assert.ok(!/תוכנית תוכן|לוח תוכן|פרסום אוטומטי|דמות|רובוט/.test(aiPart.replace(/^\s*\/\/.*$/gm, '')), 'no content plan, auto-publishing or AI figure in the AI video');
assert.ok(!/[\u2013\u2014]/.test(aiPart), 'no en or em dash in the AI video');
assert.ok(/preload="none"/.test(page), 'nothing is downloaded before she presses play');
assert.ok(/playsInline/.test(page), 'plays inside the page on iPhone, not full screen on load');
assert.ok(/robots: \{ index: false/.test(page), 'not indexed (it is a link for signups, not a landing page)');
assert.ok(/supportWhatsAppUrl/.test(page), 'the question line uses the one support number (lib/support.ts)');

assert.ok(RESERVED_SLUGS.has('tutorials'), 'a business cannot take the address "tutorials" in the app');
assert.notEqual(slugError('tutorials'), '', 'and is told why');
assert.ok(/'tutorials'/.test(raw('supabase/migrations/add_reserved_slug_tutorials.sql')), 'nor in the database (migration file)');

for (const f of ['marketing/tutorials.mjs', 'marketing/welcome-motion.mjs']) {
  const script = raw(f);
  assert.ok(script.includes('050-7321978'), `${f}: the welcome video ends on the support line`);
  assert.ok(!script.includes('עני להודעה'), `${f}: not on "reply to this message", which nobody reads`);
}
// version 3 shows card payments, the cancellation charge and automatic messages as features: the script must keep saying that
// it goes on /tutorials only once those are switched on (owner's condition, 2026-10-21)
assert.ok(raw('marketing/welcome-motion.mjs').includes('Do not put this version on /tutorials until'), 'the welcome script records its go-live condition');
// the voiced tutorials end on the support line too
assert.ok(raw('marketing/motion-lib.mjs').includes('050-7321978'), 'the motion end card shows the support line');

console.log('tutorials page: all checks passed');

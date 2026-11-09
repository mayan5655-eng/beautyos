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
// 2026-11-09 (features frozen): every feature has a video, in the order she meets them: getting started, the calendar, clients, the
// till and payments (card clearing included), marketing and growth, reports.
assert.deepEqual(topics, [
  { title: 'להתחיל', ids: ['welcome', 'tour', 'home', 'services-hours', 'my-page', 'help-chat'] },
  { title: 'יומן ותורים', ids: ['booking', 'appointment-actions', 'reminders', 'waitlist-rebook'] },
  { title: 'לקוחות', ids: ['clients', 'forms', 'skin-scan', 'loyalty', 'client-page'] },
  { title: 'קופה ותשלומים', ids: ['till', 'grow-connect', 'grow-till', 'pay-page', 'deposits', 'grow-refunds', 'gift-vouchers', 'products', 'morning'] },
  { title: 'שיווק וצמיחה', ids: ['ai', 'reviews', 'booking-button', 'referral'] },
  { title: 'דוחות', ids: ['monthly'] },
], 'twenty-nine videos in six topics, the welcome explainer first, reports last');
const ids = [...page.matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, 29, 'every video on the page is in a topic');
// Every video's title is the one the in-app help and the help chat use (lib/helpSections.ts), and every one of those is on the page.
{
  const { TUTORIAL_TITLES, TUTORIAL_FLAG, tutorialOn } = await import('./lib/helpSections.ts');
  assert.deepEqual([...ids].sort(), Object.keys(TUTORIAL_TITLES).sort(), 'the page and the help list the same videos');
  // Grow and the referral are switched on per deployment: their videos are hidden while the switch is off, never deleted.
  for (const id of ['grow-connect', 'grow-till', 'pay-page', 'deposits', 'grow-refunds']) assert.equal(TUTORIAL_FLAG[id], 'grow', `${id} follows the Grow switch`);
  assert.equal(TUTORIAL_FLAG.referral, 'referral');
  assert.equal(tutorialOn('grow-till', { grow: false, referral: true }), false, 'Grow off: no Grow video');
  assert.equal(tutorialOn('grow-till', { grow: true }), true, 'Grow on: shown');
  assert.equal(tutorialOn('till', { grow: false, referral: false }), true, 'a video with no switch always shows');
  assert.equal(tutorialOn('referral'), true, 'no switches given (the browser): shown');
  const { tutorialFlagsOn } = await import('./lib/tutorialFlags.ts');
  assert.deepEqual(tutorialFlagsOn({}), { grow: false, referral: false }, 'nothing set: both off');
  assert.deepEqual(tutorialFlagsOn({ GROW_UI_ENABLED: '1', NEXT_PUBLIC_ANNUAL_PLAN: '1' }), { grow: true, referral: true });
  assert.ok(/tutorialOn\(v\.id, on\)/.test(page) && /tutorialFlagsOn\(\)/.test(page), 'the page filters by the switches');
}
// The steps under a video: three short lines, warm, with no dash (owner's copy rule) and no digit at the start of a line.
{
  const steps = [...page.matchAll(/steps: \[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.ok(steps.length >= 25, `most videos have steps (${steps.length})`);
  for (const st of steps) {
    assert.equal(st.length, 3, `three steps: ${st[0]}`);
    for (const line of st) {
      assert.ok(!/[\u2013\u2014]/.test(line), `no dash: ${line}`);
      assert.ok(line.length <= 60, `short: ${line}`);
    }
  }
  assert.ok(/<ol style=\{stepsStyle\}/.test(page), 'the steps render as a numbered list');
}
assert.ok(!/[\u2013\u2014]/.test(page.slice(page.indexOf('const TOPICS'), page.indexOf('export default'))), 'no en or em dash in the tutorial copy');
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
const aiPart = topicsScript.slice(topicsScript.indexOf('// 7. ai:'), topicsScript.indexOf('// 8. skin:'));
assert.ok(aiPart.length > 1000, 'the AI section is found');
assert.ok(!/תוכנית תוכן|לוח תוכן|פרסום אוטומטי|דמות|רובוט/.test(aiPart.replace(/^\s*\/\/.*$/gm, '')), 'no content plan, auto-publishing or AI figure in the AI video');
assert.ok(!/[\u2013\u2014]/.test(aiPart), 'no en or em dash in the AI video');
// The skin scan video (2026-11-04): no person, face or figure (the client's photo is an abstract oval), the report is marked as
// an example, it says the scan is not a diagnosis, the report the client asks for on WhatsApp is shown as waiting ("הבקשה
// התקבלה", never as delivered), the monthly ceiling is said plainly, and the follow-up suggestions (off by default) are not shown.
assert.ok(topicsScript.includes('skin: videoSkin'), 'the skin scan video is built by the topic script');
assert.ok(/PUBLISHED_AS = \{ skin: 'skin-scan' \}/.test(topicsScript), 'and published under the id /tutorials uses');
const skinPart = topicsScript.slice(topicsScript.indexOf('// 8. skin:'), topicsScript.indexOf('// ── build, check, render'));
const skinCode = skinPart.replace(/^\s*\/\/.*$/gm, '');
assert.ok(skinPart.length > 1000, 'the skin section is found');
assert.ok(skinCode.includes('דוח לדוגמה'), 'the report in the video is labelled as an example');
assert.ok(skinCode.includes('לא אבחון'), 'the video says the scan is not a diagnosis');
assert.ok(skinCode.includes('המיקום משוער'), 'the zone map says the position is an estimate');
assert.ok(skinCode.includes('הבקשה התקבלה') && !skinCode.includes('הדוח בדרך לוואטסאפ שלך'), 'the WhatsApp report is shown as queued, not as delivered');
assert.ok(skinCode.includes('הסורק מלא לחודש הזה'), 'the monthly ceiling is shown');
assert.ok(!/<img[^>]+(presenter|face|avatar)/i.test(skinCode) && !/PRESENTER/.test(skinPart), 'no photo of a person in the skin video');
assert.ok(!/הצעות מעקב|באישור/.test(skinCode), 'no skin follow-up suggestions (off by default)');
assert.ok(!/[–—]/.test(skinPart), 'no en or em dash in the skin video');
// Section 9 (2026-11-09): the videos of the features added since, drawn like the others.
{
  const more = topicsScript.slice(topicsScript.indexOf('// 9. the features added since'), topicsScript.indexOf('// 7. ai:'));
  const code = more.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(more.length > 5000, 'section 9 is found');
  for (const id of ['grow-connect', 'grow-till', 'pay-page', 'deposits', 'grow-refunds', 'gift-vouchers', 'loyalty', 'products', 'waitlist-rebook', 'reviews', 'monthly', 'referral', 'forms', 'help-chat', 'booking-button', 'client-page']) {
    assert.ok(new RegExp(`'?${id}'?: video`).test(code), `${id} is built by the topic script`);
  }
  assert.ok(!/[\u2013\u2014]/.test(more), 'no en or em dash in section 9');
  // Honest about money and messages: nothing paid is shown before it is paid, and a deposit hold is said in minutes.
  assert.ok(code.includes('אל תלחצי ״רשמי תשלום״'), 'the till video says not to record a Grow payment twice');
  assert.ok(code.includes('התור שמור עבורך ל-30 דקות'), 'the deposit hold is shown');
  assert.ok(code.includes('תשובה לדוגמה'), 'the help chat answer is labelled as an example');
  assert.ok(code.includes('כבוי כברירת מחדל'), 'the waitlist and rebook automations are said to be off by default');
  assert.ok(!/<img[^>]+(presenter|face|avatar)/i.test(code), 'no photo of a person');
}
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

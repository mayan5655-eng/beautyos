// "3 צעדים לתור הראשון" (2026-11 activation pass): the done rules, when the card hides for good, and the rule that the
// 3-step card and the 8-step "הגדרת המערכת" checklist are never both on the Today screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  firstBookingCardEnabled, firstBookingSteps, firstBookingRecord, firstBookingView, firstBookingProgress,
  showSetupOnToday, firstLinkMessage, firstBookingStorageKey, FIRST_BOOKING_KEY,
} from './lib/firstBooking.js';
import { TUTORIAL_TITLES, tutorialHref } from './lib/helpSections.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const done = (steps: { key: string; done: boolean }[]) => Object.fromEntries(steps.map((s) => [s.key, s.done]));

ok('a brand-new business: nothing done, the card is active, 0 מתוך 3', () => {
  const steps = firstBookingSteps({});
  assert.deepEqual(done(steps), { services: false, clients: false, link: false });
  assert.equal(firstBookingView({ steps, record: {} }), 'active');
  assert.equal(firstBookingProgress(steps).line, '0 מתוך 3');
});

ok('step 1 needs an ACTIVE treatment: a switched-off one does not count', () => {
  assert.equal(done(firstBookingSteps({ services: [{ active: false }] })).services, false);
  assert.equal(done(firstBookingSteps({ services: [{ active: false }, { active: true }] })).services, true);
  assert.equal(done(firstBookingSteps({ services: [{}] })).services, true, 'no active column means active, like activeServices');
});

ok('step 2 needs one client; step 3 is the copy/share tick, the account stamp, or any appointment', () => {
  assert.equal(done(firstBookingSteps({ clients: [{ id: 1 }] })).clients, true);
  assert.equal(done(firstBookingSteps({ linkShared: true })).link, true);
  assert.equal(done(firstBookingSteps({ linkSharedAt: '2026-11-04T10:00:00Z' })).link, true);
  assert.equal(done(firstBookingSteps({ appointments: [{ id: 1 }] })).link, true);
  assert.equal(done(firstBookingSteps({ clients: [{ id: 1 }] })).link, false, 'a client added by hand is not a sent link');
  assert.equal(firstBookingProgress(firstBookingSteps({ services: [{}], clients: [{}] })).line, '2 מתוך 3');
});

ok('all three done after she saw the card: the completion line once, then hidden for good', () => {
  const steps = firstBookingSteps({ services: [{}], clients: [{}], linkShared: true });
  assert.equal(firstBookingView({ steps, record: { shown_at: 'x' } }), 'celebrate');
  assert.equal(firstBookingView({ steps, record: { shown_at: 'x', done_at: 'y' } }), 'hidden');
  // once done_at is written it stays hidden even if she later removes every client
  assert.equal(firstBookingView({ steps: firstBookingSteps({}), record: { shown_at: 'x', done_at: 'y' } }), 'hidden');
});

ok('an established business never sees it: all done or already booking, and never shown', () => {
  const all = firstBookingSteps({ services: [{}], clients: [{}], appointments: [{}] });
  assert.equal(firstBookingView({ steps: all, record: {} }), 'hidden', 'no completion line for a card she never saw');
  const noClients = firstBookingSteps({ services: [{}], appointments: [{}] });
  assert.equal(firstBookingView({ steps: noClients, record: {}, appointments: [{}] }), 'hidden');
  assert.equal(firstBookingView({ steps: noClients, record: { shown_at: 'x' }, appointments: [{}] }), 'active', 'but a card she already has stays');
});

ok('either her account or this phone marking done_at is enough', () => {
  assert.deepEqual(firstBookingRecord({ [FIRST_BOOKING_KEY]: { done_at: 'a' } }, null), { shown_at: null, done_at: 'a' });
  assert.deepEqual(firstBookingRecord({}, { shown_at: 's', done_at: 'b' }), { shown_at: 's', done_at: 'b' });
  assert.deepEqual(firstBookingRecord(null, undefined), { shown_at: null, done_at: null });
  assert.equal(firstBookingStorageKey('t1'), 'kl_first3_t1');
});

ok('the flag: on by default, off only by automations.feature_flags.first_booking_card === false', () => {
  assert.equal(firstBookingCardEnabled(undefined), true);
  assert.equal(firstBookingCardEnabled({ feature_flags: { first_booking_card: true } }), true);
  assert.equal(firstBookingCardEnabled({ feature_flags: { first_booking_card: false } }), false);
  assert.equal(firstBookingView({ enabled: false, steps: firstBookingSteps({}), record: {} }), 'off');
});

ok('not two checklists: the 8-step card is on Today only when the 3-step card is not', () => {
  assert.equal(showSetupOnToday('active', 3, 8), false);
  assert.equal(showSetupOnToday('celebrate', 3, 8), false);
  assert.equal(showSetupOnToday('hidden', 5, 8), true);
  assert.equal(showSetupOnToday('off', 5, 8), true);
  assert.equal(showSetupOnToday('hidden', 8, 8), false, 'a finished checklist leaves Today, as before');
  const a = rd('app/beautyos.jsx');
  assert.match(a, /const setupOnToday = fbView !== "pending" && showSetupOnToday\(fbView, setupDone, setupTotal\);/);
  assert.match(a, /\{setupOnToday && \(\n <div className="glass-card card-boxed card-boxed-accent" style=\{\{order:7/);
  assert.doesNotMatch(a, /\{setupDone < setupTotal && \(/, 'the dashboard checklist no longer decides on its own');
  // neither card is decided before the whole history and this phone's record are in (no flash of the wrong one)
  assert.match(a, /\(!settings\?\.tenant_id \|\| firstLocal === null \|\| !historyReady\) \? "pending"/);
  // the old welcome cards step aside too (they are the flag-off path)
  assert.equal((a.match(/\{!fbShowing&&historyReady&&deferred\.leads==="ok"&&clients\.length===0/g) || []).length, 2);
  // the 8-step list itself is kept, whole, behind the header button and in Settings
  assert.match(a, /\{ key:"link",     done: linkShared\|\|!!settings\?\.automations\?\.link_shared_at\|\|appointments\.length>0,/);
});

ok('the card is wired to the real screens', () => {
  const a = rd('app/beautyos.jsx');
  assert.match(a, /onAddServices=\{\(\)=>openSettings\("services","newService"\)\}/);
  assert.match(a, /onImportClients=\{\(\)=>openImportFor\("clients"\)\}/, 'the import opens the clients import directly, not the hub');
  assert.match(a, /onCopyLink=\{\(\)=>copyPublicLink\("book"\)\}/);
  assert.match(a, /onShareWhatsApp=\{shareBookingWhatsApp\}/);
  // the WhatsApp share has the same no-treatment guard as the copy, and ticks the step on the account too
  assert.match(a, /const shareBookingWhatsApp = \(\) => \{[\s\S]{0,400}if \(activeServices\.length === 0\) \{/);
  assert.match(a, /const rememberLinkShared = \(\) => \{[\s\S]{0,300}persistTourPatch\(\{ link_shared_at:/);
  assert.match(a, /persistTourPatch\(\{ \[FIRST_BOOKING_KEY\]: \{ shown_at: fbRecord\.shown_at \|\| at, done_at: at \} \}\)/);
  // the day-1 and day-10 "send your link" nudges do not repeat the card
  assert.match(a, /quietKeys=\{fbShowing\?\["day1","day10"\]:null\}/);
  assert.match(rd('app/TrialNudge.jsx'), /if \(Array\.isArray\(quietKeys\) && quietKeys\.includes\(nudge\.key\)\) return null;/);
});

ok('the video link points at a real tutorial', () => {
  const c = rd('app/FirstBookingCard.jsx');
  assert.match(c, /href=\{tutorialHref\("clients"\)\}/);
  assert.equal(tutorialHref('clients'), '/tutorials#t-clients');
  assert.equal(TUTORIAL_TITLES.clients, 'הוספת לקוחות');
  assert.ok(c.includes('▶ סרטון: הוספת לקוחות'));
});

ok('copy: the three step titles, feminine, no em or en dashes', () => {
  const c = rd('app/FirstBookingCard.jsx');
  for (const t of ['3 צעדים לתור הראשון', 'הוסיפי את הטיפולים שלך', 'הכניסי את הלקוחות שלך', 'שלחי את הקישור שלך ללקוחה אחת']) assert.ok(c.includes(t), t);
  const hebrew = c.split('\n').filter((l) => /[֐-׿]/.test(l) && !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(hebrew, /[–—]/);
  assert.doesNotMatch(firstLinkMessage('https://x', 'סטודיו'), /[–—]/);
  assert.match(firstLinkMessage('https://kalmea.app/noa?src=whatsapp', 'סטודיו נועה'), /בסטודיו נועה כאן, בכמה לחיצות:\nhttps:\/\/kalmea\.app\/noa\?src=whatsapp$/);
  assert.doesNotMatch(firstLinkMessage('u', 'העסק שלי'), /בהעסק שלי/, 'the signup placeholder name is never put in her message');
});

// RENDERED: the real card, for each state she can be in.
const { importApp, renderApp } = await import('./testkit/render.mjs');
const Card = (await importApp('app/FirstBookingCard.jsx')).default;
const noop = () => {};
const handlers = { onAddServices: noop, onImportClients: noop, onNewClient: noop, onShareWhatsApp: noop, onCopyLink: noop, onClose: noop };
const render = (view: string, steps: unknown) => renderApp(Card, { view, steps, name: 'נועה', ...handlers });

ok('rendered: brand new shows 0 מתוך 3, every step undone, the next one (services) with the dark button', () => {
  const html = render('active', firstBookingSteps({}));
  assert.ok(html.includes('3 צעדים לתור הראשון') && html.includes('0 מתוך 3') && html.includes('ברוכה הבאה, נועה'));
  assert.equal((html.match(/data-done="0"/g) || []).length, 3);
  for (const id of ['fb-services', 'fb-import', 'fb-new-client', 'fb-video', 'fb-whatsapp', 'fb-copy']) assert.ok(html.includes(`data-testid="${id}"`), id);
});

ok('rendered: after services and clients, 2 מתוך 3, only the link step has actions', () => {
  const html = render('active', firstBookingSteps({ services: [{}, {}], clients: [{}] }));
  assert.ok(html.includes('2 מתוך 3') && html.includes('2 טיפולים ברשימה') && html.includes('לקוחה אחת ברשימה'));
  assert.ok(!html.includes('data-testid="fb-services"') && !html.includes('data-testid="fb-import"'));
  assert.ok(html.includes('data-testid="fb-whatsapp"'));
});

ok('rendered: celebrate is one short line with a close button; hidden, off and pending render nothing', () => {
  const html = render('celebrate', firstBookingSteps({ services: [{}], clients: [{}], linkShared: true }));
  assert.ok(html.includes('הכל מוכן לתור הראשון') && html.includes('aria-label="סגירה"') && !html.includes('3 צעדים'));
  for (const v of ['hidden', 'off', 'pending']) assert.equal(render(v, firstBookingSteps({})), '', v);
});

console.log(`${n} passed`);

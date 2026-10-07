// The first-run tour follows her instead of staying on step 1 over every screen, and never gets stuck invisible on its Settings step.
// (Found 2026-10-07 on a brand-new account: "היום שלך 1/6" sat over Clients and Payments until she pressed דלגי; and a tour saved on the
// Settings step came back with no card and no way to dismiss it.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tourOnNavigate, tourResumeStep, tourStrandedOutsideSettings } from './lib/tourFlow.js';

// the real steps, read from the app: the tour and its tests cannot drift apart
const src = readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('const TOUR_STEPS = ['), src.indexOf('];', src.indexOf('const TOUR_STEPS = [')));
const STEPS = block.split(/\{\s*id:"/).slice(1).map((chunk) => ({
  id: chunk.slice(0, chunk.indexOf('"')),
  tab: /\btab:"([^"]+)"/.exec(chunk)?.[1],
  requiresSettings: /requiresSettings:true/.test(chunk),
}));
const byId = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
assert.deepEqual(STEPS.map((s) => s.id), ['dashboard', 'calendar', 'clients', 'cashier', 'content', 'booking-link'], 'the six steps');
assert.deepEqual(STEPS.slice(0, 5).map((s) => s.tab), ['dashboard', 'calendar', 'clients', 'cashier', 'campaigns'], 'each of the first five describes a screen');
assert.equal(STEPS[5].requiresSettings, true); assert.equal(STEPS[5].tab, undefined, 'the booking-link step lives inside Settings');
// the screen ids are the nav's own
for (const t of ['dashboard', 'calendar', 'clients', 'cashier', 'campaigns']) assert.ok(new RegExp(`\\{id:"${t}",\\s*label:`).test(src), `${t} is a real nav tab`);

const nav = (stepIndex: number, prevTab: string, tab: string, showSettings = false) => tourOnNavigate({ steps: STEPS, stepIndex, prevTab, tab, showSettings });

// the bug: on step 1 she goes to Clients. It used to stay "1/6"; now it follows her to the Clients step.
assert.deepEqual(nav(0, 'dashboard', 'clients'), { type: 'jump', step: byId.clients });
assert.deepEqual(nav(0, 'dashboard', 'campaigns'), { type: 'jump', step: byId.content });
assert.deepEqual(nav(0, 'dashboard', 'calendar'), { type: 'jump', step: byId.calendar });
// she follows the tour: the card for the Calendar step stays on the Calendar screen
assert.deepEqual(nav(byId.calendar, 'dashboard', 'calendar'), { type: 'stay' });
// she goes where the tour has no step (the "more" screens): the tour ends, it does not hang over them
for (const tab of ['insights', 'tax', 'leads', 'packages', 'help', 'community']) assert.deepEqual(nav(0, 'dashboard', tab), { type: 'end' }, `${tab} ends the tour`);
// no navigation, no tour: nothing happens
assert.deepEqual(nav(0, 'dashboard', 'dashboard'), { type: 'stay' });
assert.deepEqual(tourOnNavigate({ steps: STEPS, stepIndex: null, prevTab: 'dashboard', tab: 'clients', showSettings: false }), { type: 'stay' });
// Settings open: the sheet is the screen, nothing moves
assert.deepEqual(nav(2, 'clients', 'calendar', true), { type: 'stay' });
// the Settings step: leaving the screen with Settings closed ends the tour; with Settings open it stays
assert.deepEqual(nav(byId['booking-link'], 'dashboard', 'clients', false), { type: 'end' });
assert.deepEqual(nav(byId['booking-link'], 'dashboard', 'clients', true), { type: 'stay' });

// a full walk: every nav tap lands on the matching step, one after another, never a stale one
let step = 0, prev = 'dashboard';
for (const tab of ['calendar', 'clients', 'cashier', 'campaigns']) {
  const m = nav(step, prev, tab); assert.equal(m.type, 'jump'); step = (m as { step: number }).step; prev = tab;
  assert.equal(STEPS[step].tab, tab, `on ${tab} the card is the ${tab} one`);
}

// resuming from what was saved: never on a step whose card cannot be drawn (the Settings one) - the invisible, undismissable tour
assert.equal(tourResumeStep(undefined, STEPS), 0); assert.equal(tourResumeStep(0, STEPS), 0); assert.equal(tourResumeStep(3, STEPS), 3);
assert.equal(tourResumeStep(5, STEPS), 4, 'saved on the Settings step: resume on the step before it');
assert.equal(tourResumeStep(6, STEPS), null, 'past the last step: over'); assert.equal(tourResumeStep(99, STEPS), null);
assert.equal(tourResumeStep(-3, STEPS), 0); assert.equal(tourResumeStep('2' as unknown as number, STEPS), 0, 'junk falls back to the start');

// closing Settings while on its step: nothing is left to point at
assert.equal(tourStrandedOutsideSettings({ steps: STEPS, stepIndex: 5, showSettings: false }), true);
assert.equal(tourStrandedOutsideSettings({ steps: STEPS, stepIndex: 5, showSettings: true }), false);
assert.equal(tourStrandedOutsideSettings({ steps: STEPS, stepIndex: 2, showSettings: false }), false);
assert.equal(tourStrandedOutsideSettings({ steps: STEPS, stepIndex: null, showSettings: false }), false);

// wired in the app
assert.ok(/tourOnNavigate\(\{ steps: TOUR_STEPS/.test(src) && /tourResumeStep\(autos\.onboarding_tour_step, TOUR_STEPS\)/.test(src) && /tourStrandedOutsideSettings\(\{ steps: TOUR_STEPS/.test(src), 'the app uses all three');

console.log('tour flow: ok');

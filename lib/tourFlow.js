// lib/tourFlow.js
//
// What the first-run tour does when she moves around, as pure functions (app/beautyos.jsx calls them; test-tour-flow.ts tests them).
//
// Found 2026-10-07 on a brand-new account: the tour card did not follow her. It sat on step 1 ("היום שלך 1/6") over Clients, Payments and
// every other screen until she pressed "דלגי", describing a screen she had already left. And a tour saved at step 6 (its target lives
// inside Settings) came back on the next visit with nothing to show and no way to dismiss it: the step was active, its card never drawn.
//
// The rules now: the tour is a nudge, not a gate.
//   - Going to the screen a step describes jumps the tour to that step.
//   - Going to a screen the tour has no step for (She is exploring on her own) ends it, for good.
//   - A tour saved on the Settings step resumes on the step before it, whose card can be drawn.
//   - If Settings is closed while the tour is on the Settings step, the tour ends (there is nothing left to point at).

/**
 * She changed screen. `steps[i].tab` names the screen step i describes (steps inside Settings have none).
 * @returns {{type:'stay'} | {type:'jump', step:number} | {type:'end'}}
 */
export function tourOnNavigate({ steps, stepIndex, prevTab, tab, showSettings }) {
  if (stepIndex == null || prevTab === tab) return { type: 'stay' };
  const cur = steps[stepIndex];
  if (!cur) return { type: 'stay' };
  if (cur.requiresSettings) return showSettings ? { type: 'stay' } : { type: 'end' };
  if (showSettings) return { type: 'stay' };
  const idx = steps.findIndex((s) => s.tab === tab);
  if (idx === stepIndex) return { type: 'stay' };
  return idx >= 0 ? { type: 'jump', step: idx } : { type: 'end' };
}

/** The step to resume at from what was saved, or null when the tour is over. Never a step whose card cannot be drawn yet. */
export function tourResumeStep(saved, steps) {
  let i = Number.isInteger(saved) ? saved : 0;
  if (i < 0) i = 0;
  if (i >= steps.length) return null;
  while (i > 0 && steps[i].requiresSettings) i--; // its target is inside Settings, which is closed when the app loads
  return i;
}

/** The tour is on a step that lives inside Settings, and Settings is closed: nothing is left to point at. */
export function tourStrandedOutsideSettings({ steps, stepIndex, showSettings }) {
  return stepIndex != null && !showSettings && !!steps[stepIndex]?.requiresSettings;
}

// ── The tour and "3 צעדים לתור הראשון" (2026-11 activation follow-up) ──
// On day 1 the 6-step tour opened over the 3-step card, so a new business met two guides at once and the tour pointed at Calendar,
// Payments and Content before she had a single treatment. Now:
//   - The tour waits while the card is on screen (or still being decided): it starts only once the card is 'off' (her account
//     switched it off: the old behaviour, exactly) or 'hidden' (finished, or a business that never needed it).
//   - A business that came through the card already did what the tour's clients and booking-link steps teach, so she gets the
//     short tour: היום, תשלומים, then the calendar, which ends on "קביעת תור" (the same finish: it opens a new appointment).
//     The full 6 steps stay for everyone else; nothing is removed.

/** May the tour start now, given what the 3-step card is doing ('off' | 'hidden' | 'pending' | 'active' | 'celebrate')? */
export function tourMayStart(firstBookingView) {
  return firstBookingView === 'off' || firstBookingView === 'hidden';
}

export const SHORT_TOUR_IDS = ['dashboard', 'cashier', 'calendar'];

/** The short tour, built from the full one (so the copy and selectors cannot drift). The last step carries the finish button. */
export function shortTourSteps(steps) {
  const picked = SHORT_TOUR_IDS.map((id) => steps.find((s) => s.id === id)).filter(Boolean);
  return picked.map((s, i) => (i === picked.length - 1 ? { ...s, cta: 'קביעת תור ✦' } : s));
}

/** Which tour she gets: the short one when she has used the 3-step card (it was shown to her, or finished), else the full one. */
export function tourStepsFor(steps, firstBookingRecord) {
  const rec = firstBookingRecord || {};
  return rec.shown_at || rec.done_at ? shortTourSteps(steps) : steps;
}

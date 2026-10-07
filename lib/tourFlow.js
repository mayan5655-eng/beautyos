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

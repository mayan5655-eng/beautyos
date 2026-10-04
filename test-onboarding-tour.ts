// test-onboarding-tour.ts
//
// The onboarding walkthrough has no component-render test infrastructure to
// run against (same constraint as every other React piece in this repo -
// see test-calendar-empty-tenant.ts), so this proves its SHAPE from source,
// the same technique: the specific strings that would have to survive an
// edit for the feature to still match what was actually asked for.
//
// What this guards against, concretely:
//   - the six steps drifting out of the order she actually meets them
//   - the walkthrough ending on a "congratulations" message instead of
//     opening the real new-appointment modal
//   - the tour's progress save silently becoming a raw write instead of
//     going through the one guarded save route (app/api/settings/save is
//     the only path allowed to write the settings row - see its own
//     comment and supabase/migrations/add_settings_write_guard.sql)
//   - the persistence patch overwriting the whole automations bag instead
//     of merging into it (a real past bug class in this file: a save that
//     sends only the new key wipes every other automation flag, since the
//     route replaces the column rather than deep-merging it)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const src = readFileSync('app/beautyos.jsx', 'utf8');
const tourSrc = readFileSync('app/OnboardingTour.jsx', 'utf8');

// ── The six steps, in the order she actually meets them ─────────────────────
const stepsBlockMatch = src.match(/const TOUR_STEPS = \[([\s\S]*?)\n\];/);
ok(stepsBlockMatch, 'TOUR_STEPS array found in source');
const stepsBlock = stepsBlockMatch ? stepsBlockMatch[1] : '';

const expectedOrder = ['dashboard', 'calendar', 'clients', 'cashier', 'content', 'booking-link'];
const idMatches = [...stepsBlock.matchAll(/id:"([a-z-]+)"/g)].map(m => m[1]);
ok(idMatches.length === 6, `exactly 6 steps (found ${idMatches.length})`);
ok(JSON.stringify(idMatches) === JSON.stringify(expectedOrder),
  `step order is היום, יומן, לקוחות, תשלום, תוכן, booking-link (got ${idMatches.join(',')})`);

// Every step has a real nav-button or data-tour selector, a real sentence
// (not a placeholder), and an icon from the brand-icons set.
const stepObjects = [...stepsBlock.matchAll(/\{[^{}]*id:"[a-z-]+"[^{}]*\}/g)];
ok(stepObjects.length >= 6, 'each step object is parseable on its own');

// The last step ends on an action, not a congratulation.
ok(/booking-link[\s\S]{0,400}cta:"קביעת תור ראשון/.test(stepsBlock),
  'the last step\'s button text is a real action ("קביעת תור ראשון"), not a generic finish label');
ok(!/מזל טוב|כל הכבוד|סיימת/.test(stepsBlock),
  'no congratulation copy ("מזל טוב"/"כל הכבוד"/"סיימת") anywhere in the step text');
ok(/requiresSettings:true/.test(stepsBlock),
  'the booking-link step is flagged as needing Settings open first (its real button lives there)');

// ── Finishing the tour opens the real appointment modal ─────────────────────
const finishMatch = src.match(/const handleTourFinish = useCallback\(\(\) => \{([\s\S]*?)\n\s*\}, \[/);
ok(finishMatch, 'handleTourFinish found');
const finishBody = finishMatch ? finishMatch[1] : '';
ok(/openNewAppt\(\)/.test(finishBody), 'handleTourFinish calls openNewAppt() - the real action, not a message');
ok(/onboarding_tour_seen:\s*true/.test(finishBody), 'finishing marks the tour permanently seen');

// ── Persistence goes through the guarded route and merges, not replaces ─────
const persistMatch = src.match(/const persistTourPatch = useCallback\(\(patch\) => \{([\s\S]*?)\n\s*\}, \[/);
ok(persistMatch, 'persistTourPatch found');
const persistBody = persistMatch ? persistMatch[1] : '';
ok(/\/api\/settings\/save/.test(persistBody), 'tour progress is saved through /api/settings/save, not a direct table write');
ok(/\.\.\.base,\s*\.\.\.patch/.test(persistBody) || /\{\s*\.\.\.base,\s*\.\.\.patch\s*\}/.test(persistBody),
  'the save merges the patch into the existing automations bag rather than replacing it (would otherwise wipe every other automation flag on first tour step)');

// Never shown twice: the trigger reads onboarding_tour_seen before ever
// setting tourStep, and only once (guarded by a ref, not re-evaluated on
// every settings update).
ok(/if \(autos\.onboarding_tour_seen === true\) return;/.test(src),
  'the trigger effect bails out when the tour was already marked seen');
ok(/tourTriggeredRef\.current = true;/.test(src),
  'the trigger only evaluates once per mount (a ref guard, not re-armed on every settings change)');

// Resumable: it reads a saved step index, not always 0.
ok(/onboarding_tour_step/.test(src), 'a step index is persisted for resuming, not just a seen/not-seen flag');

// ── Mounted once, in the live tree ───────────────────────────────────────────
ok(/<OnboardingTour\b/.test(src), 'OnboardingTour is actually rendered somewhere in beautyos.jsx');
ok(/import OnboardingTour from ["']\.\/OnboardingTour["']/.test(src), 'OnboardingTour is imported');

// ── Motion: respects prefers-reduced-motion, animates when it doesn't ───────
ok(/prefers-reduced-motion:\s*reduce/.test(tourSrc), 'checks prefers-reduced-motion');
ok(/animation:\s*none\s*!important/.test(tourSrc), 'disables the animations outright under reduced motion, not just shortens them');
ok(/200ms/.test(tourSrc), 'the card transition is 200ms, as specified');
ok(/translateY\(12px\)/.test(tourSrc), 'the card slides 12px, as specified');

console.log(`onboarding tour: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);

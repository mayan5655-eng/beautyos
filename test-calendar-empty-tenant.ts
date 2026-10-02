// test-calendar-empty-tenant.ts
//
// Proves the fix for a live, confirmed audit finding: opening the Calendar
// tab on a brand-new tenant (appointments.length === 0) threw
// `ReferenceError: openNewAppt is not defined` and crashed to the app's
// error boundary - 100% reproducible, on every single new signup's first
// visit to her calendar, invisible on any tenant that already has a
// booking (which is why it reached production).
//
// Root cause: openNewAppt was declared with `const` inside a closure that
// only exists while the DASHBOARD tab renders. The Calendar tab's own
// empty-state button referenced the same bare name from a completely
// different scope - never reachable there at all.
//
// This suite has no React renderer and no component-test infrastructure
// (every test-*.{js,ts} here is plain Node logic, by design - see
// scripts/run-tests.mjs), so proving "this specific ReferenceError cannot
// happen" means proving the SHAPE that caused it is gone from the source,
// the same technique test-referenced-tables.js already uses for a
// different invariant. Three things, together, are what make this a real
// regression guard rather than a string match:
//   1. Exactly one declaration of openNewAppt exists (not re-duplicated
//      into some other tab's own closure, which would just move the bug).
//   2. That declaration appears BEFORE either activeTab==="dashboard" or
//      activeTab==="calendar" in source order - i.e. outside both, at the
//      shared component scope they can both reach.
//   3. The Calendar tab's own reference to it still exists (so this also
//      catches the button quietly being deleted instead of fixed).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const src = readFileSync('app/beautyos.jsx', 'utf8');

const declPattern = /const openNewAppt\s*=/g;
const declarations = [...src.matchAll(declPattern)];
ok(declarations.length === 1, `exactly one openNewAppt declaration (found ${declarations.length}) - a second one means it was re-duplicated into a scoped closure again`);

const declIndex = declarations[0]?.index ?? -1;
const dashboardTabIndex = src.indexOf('activeTab==="dashboard"');
const calendarTabIndex = src.indexOf('activeTab==="calendar"');

ok(declIndex !== -1 && dashboardTabIndex !== -1 && calendarTabIndex !== -1, 'all three markers found in source');
ok(declIndex < dashboardTabIndex, 'openNewAppt is declared BEFORE the dashboard tab block - i.e. outside it, at shared scope');
ok(declIndex < calendarTabIndex, 'openNewAppt is declared BEFORE the calendar tab block - i.e. outside it too, reachable from both');

// The Calendar empty-state's own reference must still exist - this is the
// exact call site that threw. If it's gone, something else changed instead
// of being fixed.
ok(/\{label:"קביעת תור",onClick:openNewAppt\}/.test(src), "the Calendar empty-state's reference to openNewAppt is still present");

console.log(`calendar empty-tenant: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);

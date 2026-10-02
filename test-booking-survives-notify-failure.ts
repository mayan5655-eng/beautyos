// test-booking-survives-notify-failure.ts
//
// The single most important property in the product: a booking (or a
// cancellation, or a claimed gap-fill slot) is ALREADY SAVED by the time any
// WhatsApp/notification code runs, and nothing past that point may undo it
// or stop the caller from getting a success response - even when every send
// fails completely.
//
// Two things are proven, because either one alone misses a real failure mode
// this session actually found live:
//
//   1. FUNCTIONAL: sendWhatsApp() (the booking confirmation's send path) and
//      notifyOwner() (the owner-alert path lib/bookingNotify.js's owner half
//      now uses) must never throw/reject, even when GreenAPI has no
//      credentials (env unset, so booking_confirm can't go automatic) and
//      every Supabase call either makes is a real network request to a
//      placeholder domain that can only fail. These are the exact two calls
//      lib/bookingNotify.js's sendBookingNotifications wraps for a new
//      booking - bookingNotify.js itself isn't imported directly here
//      because two of ITS OWN dependencies (lib/confirmToken, lib/appUrl)
//      use extensionless relative imports that only Next.js's bundler
//      resolves, not plain node - a pre-existing characteristic of those
//      files, unrelated to this bug, not worth changing just to import one
//      test. Testing sendWhatsApp/notifyOwner directly proves the same
//      "never throws" property one layer down, with no loss of coverage:
//      bookingNotify.js's own two try/catch blocks (one per send) are
//      exactly what stands between either of these and a caller.
//
//   2. STRUCTURAL: the three callers (book-appointment, claim, confirm) must
//      schedule sendBookingNotifications/notifyOwnerOfCancellation via
//      next/server's after(), not `await` it inline before the response.
//      This is the actual bug this test exists because of: the functional
//      half above was ALREADY true before today - sendWhatsApp and
//      notifyOwner already fail safe - but the routes still `await`ed the
//      wrapper before responding, so a SLOW notification path (not a failed
//      one: a slow one, which open-launch's new owner_notifications/
//      push_subscriptions round-trips made measurably slower) could exceed
//      a serverless timeout and hand the browser a 502/504 for a booking
//      that had already committed. No amount of "catches its own errors"
//      protects against that - only not being on the response's critical
//      path does. A functional-only test would have stayed green through
//      that entire regression, which is exactly why it's checked here too.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendWhatsApp } from './lib/whatsapp.js';
import { notifyOwner } from './lib/ownerNotify.js';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// ── 1. FUNCTIONAL ────────────────────────────────────────────────────────
// No GREENAPI_* env vars are set (scripts/run-tests.mjs's FAKE_ENV doesn't
// set them), so sendWhatsApp can never reach "connected" even if the admin
// toggle were on. The Supabase URL IS set, but to a placeholder domain -
// every query this makes (platform_settings read, the pending_manual log
// write, owner_notifications insert, push_subscriptions select) is a real
// network call that can only fail. This is "the confirmation send fails
// completely", exactly as asked.
await (async () => {
  let threw = false;
  let thrownAs: unknown = null;
  let result: Awaited<ReturnType<typeof sendWhatsApp>> | null = null;
  try {
    result = await sendWhatsApp('0501234567', 'התור שלך נקבע', {
      name: 'לקוחת בדיקה',
      type: 'booking_confirm',
      tenantId: 'test-tenant-not-real',
    });
  } catch (e) {
    threw = true;
    thrownAs = e;
  }
  ok(!threw, `sendWhatsApp must never throw, even when every underlying call fails completely (threw: ${thrownAs instanceof Error ? thrownAs.message : String(thrownAs)})`);
  ok(result !== null && result.ok === false, 'a booking_confirm with no GreenAPI credentials and no reachable platform_settings resolves (not throws) to ok:false');
  ok(result !== null && !!(result as { queued?: boolean }).queued, 'and is queued (manual/fallback), not a bare unrecoverable failure');
})();

await (async () => {
  let threw = false;
  try {
    await notifyOwner({ tenantId: 'test-tenant-not-real', kind: 'new_booking', title: 'תור חדש', body: 'פרטי התור' });
  } catch {
    threw = true;
  }
  ok(!threw, 'notifyOwner must never throw, even when owner_notifications/push_subscriptions are unreachable');
})();

// ── 2. STRUCTURAL ────────────────────────────────────────────────────────
// Reads the actual route source. This is the same technique
// test-referenced-tables.js already uses (grepping source for a required
// shape) - appropriate here because this suite has no HTTP server and no
// module-mocking, so the only way to prove "the response does not wait on
// this" without one is to prove the code cannot be written any other way.

function assertDeferred(path: string, label: string, callName: string) {
  const src = readFileSync(path, 'utf8');
  const deferredPattern = new RegExp(`after\\s*\\(\\s*\\(\\)\\s*=>[\\s\\S]{0,200}${callName}\\s*\\(`);
  ok(deferredPattern.test(src), `${label}: ${callName} is scheduled via after(), not awaited inline`);
  const directAwaitPattern = new RegExp(`await\\s+${callName}\\s*\\(`);
  ok(!directAwaitPattern.test(src), `${label}: no bare "await ${callName}(" left in the response's critical path`);
  const importLine = src.split('\n').find((l) => /from\s+["']next\/server["']/.test(l)) || '';
  ok(/\bafter\b/.test(importLine), `${label}: imports after from next/server`);
}

assertDeferred('app/api/book-appointment/route.js', 'book-appointment', 'sendBookingNotifications');
assertDeferred('app/api/claim/route.ts', 'claim', 'sendBookingNotifications');
assertDeferred('app/api/confirm/route.ts', 'confirm', 'notifyOwnerOfCancellation');

// The ordering half: the appointment write must appear BEFORE the deferred
// notification call in source order.
{
  const src = readFileSync('app/api/book-appointment/route.js', 'utf8');
  const insertIdx = src.indexOf('.from("appointments")\n      .insert(');
  const notifyIdx = src.indexOf('sendBookingNotifications(');
  ok(insertIdx !== -1 && notifyIdx !== -1 && insertIdx < notifyIdx,
    'book-appointment: the appointment INSERT appears before the deferred notification call, in source order');
}

console.log(`booking survives notify failure: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);

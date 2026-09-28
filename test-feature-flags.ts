// lib/featureFlags.ts: per-tenant nav visibility, and the one non-tab flag
// (skin-scan) that shares its storage and its "explicit beats derived" rule.
import assert from 'node:assert/strict';
import { isTabVisible, visibleTabIds, tenantFlags, skinScanVisible, NEVER_HIDDEN, STUB_TABS, SWITCHABLE_TABS } from './lib/featureFlags.ts';

// ── isTabVisible: unchanged behaviour, still field-blind ───────────────────
assert.equal(isTabVisible(null, 'campaigns'), true, 'NEVER_HIDDEN wins over everything, even no settings at all');
assert.equal(isTabVisible(null, 'insights'), true);
assert.equal(isTabVisible(null, 'protocols'), false, 'a stub tab: hidden until explicitly opted in, for every tenant');
assert.equal(isTabVisible({ automations: { screens: { protocols: true } } }, 'protocols'), true);
assert.equal(isTabVisible({ automations: { screens: { protocols: false } } }, 'protocols'), false);
assert.equal(isTabVisible(null, 'community'), false, 'the other stub tab');
assert.equal(isTabVisible(null, 'advisor'), true, 'a switchable, not a stub: on unless explicitly turned off');
assert.equal(isTabVisible({ automations: { screens: { advisor: false } } }, 'advisor'), false);
assert.equal(isTabVisible(null, 'dashboard'), true, 'not gated by this mechanism at all');
assert.deepEqual(visibleTabIds(null, ['dashboard', 'protocols', 'community']), ['dashboard']);

// tenantFlags: dedicated column beats automations.feature_flags beats automations.screens.
assert.deepEqual(
  tenantFlags({ automations: { screens: { a: 1 }, feature_flags: { a: 2, b: 2 } }, feature_flags: { a: 3 } }),
  { a: 3, b: 2 }
);

// ── skinScanVisible: the one non-tab flag ───────────────────────────────────
// No explicit flag: derived from business_fields. Cosmetics active (alone or
// with nails) keeps today's behaviour - on, unchanged from before
// business_fields existed. Nails-only turns it off by default.
assert.equal(skinScanVisible(null), true, 'no settings at all: businessFieldsOf defaults to cosmetics, so on');
assert.equal(skinScanVisible({ business_fields: ['cosmetics'] }), true);
assert.equal(skinScanVisible({ business_fields: ['cosmetics', 'nails'] }), true);
assert.equal(skinScanVisible({ business_fields: ['nails'] }), false, 'nails-only: off by default');
// An explicit flag, in either direction, always wins over the derived default.
assert.equal(skinScanVisible({ business_fields: ['nails'], automations: { screens: { skin_scan: true } } }), true, 'explicitly turned back on for a nails tenant');
assert.equal(skinScanVisible({ business_fields: ['cosmetics'], automations: { screens: { skin_scan: false } } }), false, 'explicitly turned off for a cosmetics tenant');
// A non-boolean stored value is not "explicit" - falls through to the derived default.
assert.equal(skinScanVisible({ business_fields: ['nails'], automations: { screens: { skin_scan: 'yes' } } }), false);

// Sanity on the lists themselves, so a future edit that removes a tab from
// one list but not the other is caught here instead of in production.
assert.ok(STUB_TABS.every((id) => (SWITCHABLE_TABS as readonly string[]).includes(id)), 'every stub also has a Settings toggle');
assert.ok(!NEVER_HIDDEN.some((id) => (SWITCHABLE_TABS as readonly string[]).includes(id)), 'never-hidden and switchable never overlap');

console.log('feature flags: ok');

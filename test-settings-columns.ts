// test-settings-columns.ts
//
// Proves lib/settingsColumns.ts: the settings save keeps exactly the columns
// a tenant may write, drops everything else by name, never lets the client
// set the platform's feature flags, and never erases them either. Plain node.

import {
  SETTINGS_EDITABLE_COLUMNS,
  pickSettingsPayload,
  preserveProtectedAutomations,
  mergeStoredBags,
} from './lib/settingsColumns.ts';

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── The protected columns are refused, by name ─────────────────────────────
{
  const { payload, dropped } = pickSettingsPayload({
    business_name: 'קליניקת שירה',
    green_api_instance: '1101999999',          // the webhook's tenant key
    green_api_token_encrypted: 'ciphertext',
    lead_api_key_hash: 'deadbeef',
    tenant_id: 'someone-else',
    id: 42,
    created_at: '2020-01-01',
    facebook_page_id: 'x',
    some_future_column: 'y',
  });
  eq(payload, { business_name: 'קליניקת שירה' }, 'only the editable column survives');
  eq(dropped.sort(), ['created_at', 'facebook_page_id', 'green_api_instance', 'green_api_token_encrypted', 'id', 'lead_api_key_hash', 'some_future_column', 'tenant_id'].sort(), 'every refused key is named');
}

// ── Every editable column passes through untouched ─────────────────────────
{
  const input: Record<string, unknown> = {};
  for (const c of SETTINGS_EDITABLE_COLUMNS) input[c] = c === 'automations' ? { paused: true } : `v:${c}`;
  input.bot_active = true;
  const { payload, dropped } = pickSettingsPayload(input);
  eq(dropped, [], 'nothing dropped');
  eq(Object.keys(payload).length, SETTINGS_EDITABLE_COLUMNS.length, 'every editable column kept');
  eq(payload.business_hours, 'v:business_hours', 'a value passes through as given');
}

// ── bot_active is normalised the way the old save did ──────────────────────
eq(pickSettingsPayload({ bot_active: false }).payload.bot_active, false, 'false stays false');
eq(pickSettingsPayload({ bot_active: 'false' }).payload.bot_active, false, '"false" becomes false');
eq(pickSettingsPayload({ bot_active: true }).payload.bot_active, true, 'true stays true');
eq(pickSettingsPayload({ bot_active: undefined }).payload.bot_active, true, 'anything else is true');
eq(pickSettingsPayload({ bot_active: 'yes' }).payload.bot_active, true, 'a string is true');

// ── The client never sets feature flags ────────────────────────────────────
{
  const { payload, dropped } = pickSettingsPayload({
    automations: { paused: false, feature_flags: { packages: true }, lead_templates: { new: 'hi' } },
  });
  eq(payload.automations, { paused: false, lead_templates: { new: 'hi' } }, 'feature_flags stripped, the rest kept');
  eq(dropped, ['automations.feature_flags'], 'and named');
}
eq(pickSettingsPayload({ automations: null }).payload, {}, 'null automations is not written');
eq(pickSettingsPayload({ automations: 'x' }).dropped, ['automations (not an object)'], 'a string automations is refused by name');
eq(pickSettingsPayload({ automations: [1] }).payload, {}, 'an array automations is not written');

// ── ...and a save never erases the stored ones ─────────────────────────────
{
  const picked = pickSettingsPayload({ automations: { paused: true, feature_flags: { packages: true } } }).payload;
  const written = preserveProtectedAutomations(picked, { feature_flags: { community: true }, paused: false });
  eq(written.automations, { paused: true, feature_flags: { community: true } }, 'stored flags win over the client, other keys from the client');
  const noStored = preserveProtectedAutomations(picked, { paused: false });
  eq(noStored.automations, { paused: true }, 'no stored flags: none written');
  const noAutos = preserveProtectedAutomations({ business_name: 'x' }, { feature_flags: { a: 1 } });
  eq(noAutos, { business_name: 'x' }, 'a payload without automations is untouched');
  const nullStored = preserveProtectedAutomations(picked, null);
  eq(nullStored.automations, { paused: true }, 'a null stored row is tolerated');
}

// ── A save merges into the stored bags (it used to replace them) ────────────
{
  const stored = {
    automations: { paused: false, onboarding_tour_seen: true, onboarding_tour_step: 7, lead_templates: { new: 'hi' }, owner_phone: '0501' },
    branding: { logo_url: 'a.png', evening_summary: true, welcome_headline: 'old' },
  };
  // a draft taken before the tour ended, and that never saw the lead template she saved from the leads screen
  const draft = {
    automations: { paused: true, onboarding_tour_seen: false, onboarding_tour_step: 2 },
    branding: { welcome_headline: 'new' },
    business_name: 'x',
  };
  const out: any = mergeStoredBags(draft, stored);
  eq(out.automations.paused, true, 'what she changed wins');
  eq(out.automations.onboarding_tour_seen, true, 'the tour flag cannot be brought back by an older draft');
  eq(out.automations.onboarding_tour_step, 7, 'the tour step is the stored one');
  eq(out.automations.lead_templates, { new: 'hi' }, 'a key written elsewhere survives');
  eq(out.automations.owner_phone, '0501', 'another stored key survives');
  eq(out.branding, { logo_url: 'a.png', evening_summary: true, welcome_headline: 'new' }, 'branding merges, her edit wins');
  eq(out.business_name, 'x', 'other columns pass through');
  // clearing sticks because the screen sends an explicit empty value
  eq((mergeStoredBags({ branding: { logo_url: '' } }, stored) as any).branding.logo_url, '', 'an explicit clear is kept');
  // no stored row, or nothing to merge: the payload is returned as it is
  eq(mergeStoredBags({ automations: { paused: true } }, null), { automations: { paused: true } }, 'no stored row');
  eq(mergeStoredBags({ business_name: 'x' }, stored), { business_name: 'x' }, 'bags not sent are not invented');
}

// ── Garbage in ─────────────────────────────────────────────────────────────
eq(pickSettingsPayload(null).payload, {}, 'null input writes nothing');
eq(pickSettingsPayload('str').dropped, ['(not an object)'], 'a string input is refused');
eq(pickSettingsPayload([1, 2]).payload, {}, 'an array input writes nothing');
eq(pickSettingsPayload({}).payload, {}, 'an empty object writes nothing');

console.log(`test-settings-columns: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

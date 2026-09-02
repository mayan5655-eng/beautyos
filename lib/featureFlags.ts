// lib/featureFlags.ts
//
// Per-tenant visibility for features that exist but are not ready to be seen.
//
// The three tabs below are one-insert stubs: `packages`, `treatment_protocols`
// and `community` each have exactly one write path. They look finished in the
// nav and feel abandoned on contact, and a half-built feature costs more trust
// than an absent one - a cosmetician evaluating this in ten minutes cannot tell
// what the product is FOR when nine of the thirteen tabs are things she did not
// ask for.
//
// HIDDEN, NOT DELETED. Every tab's state, loader, render block and table is
// untouched; only the two nav lists are filtered. Flipping one flag brings a
// tab back with its data intact, which is the whole point of doing it this way
// rather than ripping the code out and rewriting it later.
//
// Explicitly NOT hidden: `campaigns` and `insights`. An earlier draft of the
// review proposed hiding campaigns too and was wrong - ad and campaign
// management is the reason this product exists and is what separates it from
// Fresha, which does bookings but not a clinic's marketing. Hiding the
// differentiator to look simpler would have made it look like everything else.
// See the corrections log in REVIEW.md.
//
// ── Where the flag lives ────────────────────────────────────────────────────
// Two sources, checked in order, so this works today and stays clean later:
//
//   settings.automations.feature_flags   the one that works NOW. `automations`
//                                        is an existing jsonb column on the
//                                        settings row and is already a general
//                                        per-tenant config bag (lead_templates
//                                        lives there). Needs no migration,
//                                        which matters because there is
//                                        currently no way to apply DDL to this
//                                        project from the repo.
//
//   settings.feature_flags               a dedicated jsonb column, if one is
//                                        ever added. Wins over the above so a
//                                        migration can move the flags without
//                                        a second code change.
//
// Absent, malformed or non-object flags mean "hidden" for a stub tab, because
// the safe default for a half-built feature is not to show it.

/** Tabs that are hidden unless a tenant explicitly opts back in. */
export const STUB_TABS = ['packages', 'protocols', 'community'] as const;

/** Tabs that must never be hidden by this mechanism. Guarded, not documented. */
export const NEVER_HIDDEN = ['campaigns', 'insights'] as const;

type Flags = Record<string, unknown>;

type SettingsLike = {
  feature_flags?: unknown;
  automations?: unknown;
} | null | undefined;

const asObject = (v: unknown): Flags =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Flags) : {};

/**
 * The tenant's flags, merged. A dedicated column overrides the automations bag
 * key by key, so a partial migration cannot lose a flag that only exists in one
 * of the two places.
 */
export function tenantFlags(settings: SettingsLike): Flags {
  const automations = asObject(settings?.automations);
  return {
    ...asObject(automations.feature_flags),
    ...asObject(settings?.feature_flags),
  };
}

/**
 * Should this tab appear in the navigation?
 *
 * Only the stub tabs can ever be false. Anything else - including a tab added
 * after this file was written - is visible, so a new feature is never hidden by
 * forgetting to register it. That is the opposite default from PLAN_FEATURES in
 * beautyos.jsx, and deliberately so: that map gates paid access, where the safe
 * default is to withhold; this one gates polish, where the safe default is to
 * show.
 */
export function isTabVisible(settings: SettingsLike, tabId: string): boolean {
  if ((NEVER_HIDDEN as readonly string[]).includes(tabId)) return true;
  if (!(STUB_TABS as readonly string[]).includes(tabId)) return true;
  return tenantFlags(settings)[tabId] === true;
}

/** Filter a list of tab ids. Order is preserved. */
export function visibleTabIds(settings: SettingsLike, ids: readonly string[]): string[] {
  return ids.filter((id) => isTabVisible(settings, id));
}

/**
 * Turning one back on for a tenant, until there is a settings screen for it:
 *
 *   update public.settings
 *      set automations = coalesce(automations, '{}'::jsonb)
 *          || jsonb_build_object(
 *               'feature_flags',
 *               coalesce(automations->'feature_flags', '{}'::jsonb)
 *                 || '{"packages": true}'::jsonb
 *             )
 *    where tenant_id = '<tenant-id>';   -- always filter, and check it is the right one
 *
 * Set the value back to false, or drop the key, to hide it again.
 */

// lib/viewMode.ts
//
// "מה מוצג לי במערכת": a per-business VIEW preference (Settings -> העסק שלי). Some cosmeticians only want the sales side:
// the till and checkout (sale without an appointment included), the loyalty punch card, and "how much I earned". For them,
// "קופה, ניקובים ודוחות בלבד" hides the diary, the booking-page promotion, content and marketing, the waitlist and the
// reminders/messages setup screens, from the nav and from the home screen.
//
// A VIEW PREFERENCE ONLY. Nothing is deleted, nothing is switched off on the server: her public booking page keeps working
// (old links never break), automations keep their own switches, every loader and table is untouched. Switching back to
// "הכל" restores every screen exactly as it was.
//
// Stored as settings.automations.view_mode, one of the two literal values below. Absent or anything else reads as 'all', so
// the default is unchanged for every existing business. lib/settingsColumns.ts pickSettingsPayload drops any other value on
// save (cleanViewMode), so junk can never be stored through the settings route.

export const VIEW_MODE_KEY = 'view_mode';
export const VIEW_MODES = ['all', 'till_only'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** The two choices as she sees them, in order. */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  all: 'הכל',
  till_only: 'קופה, ניקובים ודוחות בלבד',
};

type SettingsLike = { automations?: unknown } | null | undefined;

/** Strict: exactly one of the two literals, or null. */
export function cleanViewMode(value: unknown): ViewMode | null {
  return value === 'all' || value === 'till_only' ? value : null;
}

export function viewModeOf(settings: SettingsLike): ViewMode {
  const a = settings?.automations;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return 'all';
  return cleanViewMode((a as Record<string, unknown>)[VIEW_MODE_KEY]) ?? 'all';
}

export const isTillOnly = (settings: SettingsLike): boolean => viewModeOf(settings) === 'till_only';

/**
 * Screens hidden in till-only. Kept: היום (simplified), קופה, לקוחות, חבילות (sold and drawn at the till), סיכום הכנסות,
 * עזרה, and Settings/billing. Hidden: the diary, leads, messages, content, insights (bookings analytics), the AI advisor
 * and the two opt-in stubs.
 */
export const TILL_ONLY_HIDDEN_TABS = ['calendar', 'leads', 'whatsapp', 'campaigns', 'insights', 'advisor', 'community', 'protocols'] as const;

/** Settings groups hidden in till-only: her public page and the reminders/messages setup. */
export const TILL_ONLY_HIDDEN_SETTINGS_GROUPS = ['page', 'messages'] as const;

/** Does the view preference allow this tab? (The feature flags in lib/featureFlags.ts are checked separately.) */
export function viewAllowsTab(settings: SettingsLike, tabId: string): boolean {
  return !(isTillOnly(settings) && (TILL_ONLY_HIDDEN_TABS as readonly string[]).includes(tabId));
}

export function viewAllowsSettingsGroup(settings: SettingsLike, group: string): boolean {
  return !(isTillOnly(settings) && (TILL_ONLY_HIDDEN_SETTINGS_GROUPS as readonly string[]).includes(group));
}

/** The phone's bottom bar. Till-only puts סיכום הכנסות in the places the diary and content leave free. */
export function bottomNavIds(settings: SettingsLike): string[] {
  return isTillOnly(settings)
    ? ['dashboard', 'clients', 'cashier', 'tax']
    : ['dashboard', 'calendar', 'clients', 'cashier', 'campaigns'];
}

/** The "עוד" sheet. In till-only, סיכום הכנסות already sits on the bar, so it is not repeated here. */
export function moreNavIds(settings: SettingsLike, ids: readonly string[]): string[] {
  const onBar = new Set(bottomNavIds(settings));
  return ids.filter((id) => viewAllowsTab(settings, id) && !(isTillOnly(settings) && onBar.has(id)));
}

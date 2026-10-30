// lib/screenLink.ts
//
// A link of its own for every screen of the system. All the screens live in app/beautyos.jsx at one address, so refresh
// always landed on היום and a screen could not be sent to anyone. The address now says which screen is open:
//   /dashboard?tab=calendar, /dashboard?tab=whatsapp&view=log, /dashboard?tab=settings&section=booking
// היום has no parameter, so a plain /dashboard stays what it was. Other parameters on the address are left alone.

const TABS = ['dashboard', 'insights', 'calendar', 'clients', 'leads', 'cashier', 'tax', 'whatsapp', 'campaigns', 'community', 'packages', 'protocols', 'advisor', 'help'] as const;
const SECTIONS = ['business', 'page', 'booking', 'messages', 'clients', 'connections', 'advanced'] as const;
// The default of each screen has no view: whatsapp opens on send, campaigns on the posts and the studio.
const VIEWS: Record<string, readonly string[]> = { whatsapp: ['log'], campaigns: ['campaigns', 'reels'] };

/** tab is null while Settings is open: it is a panel over whichever screen was open, and section is its group. */
export type Screen = { tab: string | null; section: string | null; view: string | null };

export function screenFromSearch(search: string): Screen {
  const p = new URLSearchParams(search);
  const tab = p.get('tab') ?? '';
  if (tab === 'settings') {
    const section = p.get('section') ?? '';
    return { tab: null, section: (SECTIONS as readonly string[]).includes(section) ? section : SECTIONS[0], view: null };
  }
  if (!(TABS as readonly string[]).includes(tab)) return { tab: 'dashboard', section: null, view: null };
  const view = p.get('view') ?? '';
  return { tab, section: null, view: VIEWS[tab]?.includes(view) ? view : null };
}

export function searchForScreen(search: string, screen: Screen): string {
  const p = new URLSearchParams(search);
  for (const key of ['tab', 'section', 'view']) p.delete(key);
  if (screen.section) { p.set('tab', 'settings'); p.set('section', screen.section); }
  else if (screen.tab && screen.tab !== 'dashboard') {
    p.set('tab', screen.tab);
    if (screen.view) p.set('view', screen.view);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export function sameScreen(a: Screen, b: Screen): boolean {
  if (a.section || b.section) return a.section === b.section;
  return a.tab === b.tab && (a.view ?? null) === (b.view ?? null);
}

/** The view a screen is on, from the three switches in beautyos.jsx that hold it. */
export function viewOf(tab: string, s: { waView: string; marketingView: string; aiPostsView: string }): string | null {
  if (tab === 'whatsapp') return s.waView === 'log' ? 'log' : null;
  if (tab === 'campaigns') {
    if (s.marketingView === 'campaigns') return 'campaigns';
    return s.aiPostsView === 'reels' ? 'reels' : null;
  }
  return null;
}

/** Where a signed-out visitor goes so that a screen's link still opens that screen after signing in. Null when the address is not a screen's link. */
export function loginPathForScreen(pathname: string, search: string): string | null {
  if (pathname !== '/' && pathname !== '/dashboard') return null;
  if (!new URLSearchParams(search).has('tab')) return null;
  return `/login?next=${encodeURIComponent(`/dashboard${search}`)}`;
}

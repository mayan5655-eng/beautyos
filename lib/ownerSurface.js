// lib/ownerSurface.js
//
// Which pages are HER screens (the cosmetician's own app) and which are her clients'. The "open in Safari" and "add to home screen" banners
// are about the owner's app; the public pages (booking, forms, pay, review, a business page at /<name>) belong to her clients, who
// have no use for either. Found in the 2026-10-24 phone review: the "install Kalmea to your home screen" card sat on top of the
// booking page for every iPhone client, and the in-app-browser banner skipped "/" - which is where a signed-in owner's whole app lives -
// so the screen that needs it most never showed it.
export const OWNER_PATHS = ['/dashboard', '/login', '/signup', '/onboarding', '/reset-password'];

/** The browser carries a Kalmea sign-in (Supabase's auth cookie), i.e. "/" is the app and not the public landing page. */
export const hasSession = (cookieString) => /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(String(cookieString || ''));

/** Her app's screens have the bottom tab bar; login, signup and onboarding do not. */
export const hasBottomNav = (pathname) => { const p = String(pathname || ''); return p === '/' || p === '/dashboard' || p.startsWith('/dashboard/'); };

export function isOwnerSurface(pathname, cookieString = '') {
  const p = String(pathname || '');
  if (OWNER_PATHS.some((o) => p === o || p.startsWith(`${o}/`))) return true;
  return p === '/' && hasSession(cookieString);
}

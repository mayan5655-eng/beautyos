// lib/homeRoute.ts
// Which view the root route "/" serves. Pure, so the rule is tested (test-home-route.ts).
//
//   - A valid session gets the app at "/" itself, rendered on the server: no redirect hop and no landing page first.
//     (The app already lives at "/" ; /dashboard is the same app behind a heavier static import, so redirecting there
//     would only add a hop and a bigger bundle.)
//   - "/?landing=1" shows the public landing page even when she is logged in, so she can check what visitors see.
//   - A logged-out visitor gets the landing page, exactly as before.

/** True only for the explicit preview switch. Any other value of `landing` is ignored. */
export function wantsLandingPreview(searchParams: Record<string, string | string[] | undefined> | undefined | null): boolean {
  const v = searchParams?.landing
  return (Array.isArray(v) ? v[0] : v) === '1'
}

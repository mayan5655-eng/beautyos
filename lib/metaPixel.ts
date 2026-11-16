// lib/metaPixel.ts
//
// Meta Pixel for KALMEA'S OWN marketing: did an ad (Instagram, Facebook) bring a signup?
//
// Where it may run, and nowhere else: the Kalmea landing page (kalmea.app root, app/page.tsx -> app/LandingPage.jsx)
// and the signup page (app/signup). Never inside the app, and never on a business's public pages (her booking page,
// /pay, /confirm, intake, gift vouchers, reviews, /[slug]): those visitors are the cosmeticians' clients, not ours,
// and they are not tracked. test-meta-pixel.ts holds that line.
//
// Off unless NEXT_PUBLIC_META_PIXEL_ID is set to a numeric id: with it empty no script loads, no fbq exists, and the
// CSP never names Meta. Events: PageView on those two pages, CompleteRegistration once after the server accepted a
// signup. No personal data: no advanced matching (init takes the id only), automatic event detection is off
// (autoConfig false, so Meta does not read buttons or forms), and no event carries parameters.

export const META_PIXEL_SCRIPT_ORIGIN = 'https://connect.facebook.net';
export const META_PIXEL_SCRIPT_SRC = `${META_PIXEL_SCRIPT_ORIGIN}/en_US/fbevents.js`;
export const META_PIXEL_BEACON_ORIGIN = 'https://www.facebook.com';

/** The only paths whose response may allow the pixel in its CSP (next.config.ts). */
export const META_PIXEL_PATHS = ['/', '/signup'] as const;

/** The pixel id, or null when it is not set (or not a plain numeric id, so a typo cannot inject anything). */
export function metaPixelId(env?: Record<string, string | undefined>): string | null {
  // The literal process.env.NEXT_PUBLIC_META_PIXEL_ID is what Next inlines into the browser bundle; process.env[...] is not.
  const v = String((env ? env.NEXT_PUBLIC_META_PIXEL_ID : process.env.NEXT_PUBLIC_META_PIXEL_ID) ?? '').trim();
  return /^\d{6,20}$/.test(v) ? v : null;
}

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string };
type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

/**
 * The standard fbq stub (it queues calls until fbevents.js loads), created once, with automatic event detection off
 * and init by id only (no advanced matching). Returns the fbq function, or null outside a browser / without an id.
 */
export function ensureFbq(id: string | null, w: PixelWindow | undefined = typeof window === 'undefined' ? undefined : (window as PixelWindow)): Fbq | null {
  if (!id || !w) return null;
  if (!w.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue!.push(args);
    } as Fbq;
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    w.fbq = n;
    n('set', 'autoConfig', false, id);
    n('init', id);
  }
  return w.fbq;
}

// Consent (2026-11-16): the pixel sets Meta's _fbp cookie, so nothing from Meta loads, and no event is queued, until the
// visitor taps "אישור" on the bar app/MetaPixel.tsx shows. The choice lives in this browser only (localStorage); "no" is
// remembered too, so the bar does not nag. /privacy has a button that clears it (app/privacy/AdConsentReset.tsx).
export const AD_CONSENT_KEY = 'kl_ad_consent';
export type AdConsent = 'yes' | 'no' | null;

export function readAdConsent(): AdConsent {
  try {
    const v = localStorage.getItem(AD_CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch { return null; }
}

export function saveAdConsent(v: AdConsent): void {
  try {
    if (v) localStorage.setItem(AD_CONSENT_KEY, v);
    else localStorage.removeItem(AD_CONSENT_KEY);
  } catch { /* blocked storage: the choice lasts for this page only */ }
}

/** PageView, for the landing and signup pages only (app/MetaPixel.tsx), and only after consent. */
export function trackPageView(id: string | null = metaPixelId(), w?: PixelWindow): boolean {
  try {
    const fbq = ensureFbq(id, w);
    if (!fbq) return false;
    fbq('track', 'PageView');
    return true;
  } catch { return false; }
}

/** CompleteRegistration, once per page life, with no parameters: called by app/signup only after signUp succeeded. */
let registered = false;
export function trackCompleteRegistration(id: string | null = metaPixelId(), w?: PixelWindow): boolean {
  if (registered) return false;
  if (readAdConsent() !== 'yes') return false;
  try {
    const fbq = ensureFbq(id, w);
    if (!fbq) return false;
    fbq('track', 'CompleteRegistration');
    registered = true;
    return true;
  } catch { return false; }
}

/** Test hook only. */
export function _resetMetaPixelForTests() { registered = false; }

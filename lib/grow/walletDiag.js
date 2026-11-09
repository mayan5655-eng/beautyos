// lib/grow/walletDiag.js
//
// BROWSER AND SERVER, plain JavaScript (like walletClient.js): what the payment page /pay/<token> decides when Grow's wallet does not
// open, and the diagnostics it sends home about it. Pure functions only, so test-wallet-inapp.ts runs the exact code the page runs.
//
// Why this exists (2026-11-09, production): the owner opened a ₪1 link from WhatsApp on her iPhone, ticked the terms, tapped pay, and
// no Grow window appeared; the page said "not completed" with no reason. Clients ALWAYS open these links from WhatsApp, Instagram or
// Facebook, whose in-app browsers are web views that Grow's wallet script may not run in. So:
//   1. every failure is reported (no PII, no secrets) so the cause is visible in ops_events;
//   2. when Grow gave a hosted payment page for the same process, the client goes there instead (same process: the callback and
//      approveTransaction are unchanged);
//   3. otherwise she is asked, briefly and warmly, to open the same link in her phone's own browser.

/** Coarse browser class from a user agent. Never the user agent itself: it is a fingerprint. */
export function uaClass(ua) {
  const s = String(ua || '');
  if (/WhatsApp/i.test(s)) return 'whatsapp';
  if (/Instagram/i.test(s)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|\bFBSN\b|MessengerForiOS|\[FB/i.test(s)) return 'facebook';
  const ios = /iPhone|iPad|iPod/i.test(s);
  if (ios) {
    if (/CriOS|FxiOS|EdgiOS|GSA\/|OPiOS/.test(s)) return 'ios-other';
    // No "Safari/" token: an app's own web view (WhatsApp Business on iOS may not name itself), not a browser.
    return /Safari\//.test(s) ? 'ios-safari' : 'ios-webview';
  }
  if (/Android/i.test(s)) {
    // "; wv)" marks an Android web view (an in-app browser we cannot name).
    if (/;\s*wv\)/.test(s)) return 'android-webview';
    return /Chrome\//.test(s) && !/SamsungBrowser|EdgA|OPR\//.test(s) ? 'android-chrome' : 'android-other';
  }
  return 'other';
}

/** In-app browsers of the apps clients open these links from. */
export const IN_APP = new Set(['whatsapp', 'instagram', 'facebook', 'android-webview', 'ios-webview']);
export const isInApp = (cls) => IN_APP.has(cls);

/** 'ios' | 'android' | 'other', for the open-in-browser instructions. */
export function osOf(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  if (/Android/i.test(s)) return 'android';
  return 'other';
}

/** Grow's own hosted payment page for this process. Grow's hosts only, https only: never redirect a client anywhere else. */
export function safeHostedUrl(url) {
  const u = String(url || '').trim();
  return /^https:\/\/([a-z0-9-]+\.)*(meshulam\.co\.il|grow\.link|grow\.business)(\/|$)/i.test(u) && u.length <= 2000 ? u : '';
}

/**
 * What the page does now.
 *   when 'before'  she tapped pay and the server opened the process: an in-app browser with a hosted url goes there straight away.
 *   when 'failed'  the wallet did not open (script did not load, init threw, failure / timeout before it opened, nothing drawn).
 *   opened         the wallet was on screen: a failure then is the client's (a decline), shown as text, never a redirect.
 * -> { action: 'sdk' } | { action: 'hosted', url } | { action: 'browser', os } | { action: 'message' }
 */
/** @param {{ when: 'before' | 'failed', cls: string, hostedUrl?: unknown, opened?: boolean, os?: string }} o */
export function fallbackDecision({ when, cls, hostedUrl, opened = false, os = 'other' }) {
  const url = safeHostedUrl(hostedUrl);
  if (when === 'before') return isInApp(cls) && url ? { action: 'hosted', url } : { action: 'sdk' };
  if (opened) return { action: 'message' };
  if (url) return { action: 'hosted', url };
  // Not in an in-app browser and no hosted page: there is nowhere better to send her; say what Grow said.
  if (!isInApp(cls) && cls !== 'ios-other' && cls !== 'android-other') return { action: 'message' };
  return { action: 'browser', os };
}

/** Chrome on Android opens this and leaves the in-app browser. */
export function androidIntentUrl(href) {
  const m = /^(https?):\/\/(.+)$/.exec(String(href || ''));
  if (!m) return '';
  return `intent://${m[2]}#Intent;scheme=${m[1]};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

const clip = (v, n) => {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
  // No PII: anything that looks like an email, a phone or a card number is masked before it leaves the page.
  return s.replace(/[^\s@]+@[^\s@]+/g, '[email]').replace(/\+?\d[\d\s-]{6,}\d/g, '[number]').replace(/\s+/g, ' ').trim().slice(0, n);
};

/** The readable text of a Grow SDK failure payload, '' when it carried none. */
export function sdkFailureText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return clip(raw, 200);
  if (typeof raw !== 'object') return '';
  const pick = (o) => (o && typeof o === 'object' ? o.message || o.msg || o.error_message || o.errorMessage || o.description || (typeof o.error === 'string' ? o.error : '') || (typeof o.err === 'string' ? o.err : '') : '');
  return clip(pick(raw) || pick(raw.data) || pick(raw.error) || pick(raw.err), 200);
}

export const DIAG_EVENTS = ['onFailure', 'onError', 'onTimeout', 'sdk-load', 'init-throw', 'no-open', 'hosted-redirect', 'browser-prompt'];

/**
 * The diagnostics body the page posts to /api/grow/wallet/diag. Only these fields; every string clipped and scrubbed. The token is the
 * page's own (it binds the report to one payment); the server stores the payment's id, never the token.
 */
/** @param {{ token: string, event: string, raw?: any, sdkLoaded?: boolean, sdkEnv?: string, ua?: string, phase?: string }} o */
export function buildDiagPayload({ token, event, raw, sdkLoaded, sdkEnv, ua, phase }) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = r.data && typeof r.data === 'object' ? r.data : {};
  return {
    t: String(token || '').slice(0, 128),
    event: DIAG_EVENTS.includes(event) ? event : 'other',
    message: sdkFailureText(raw),
    code: clip(r.code ?? r.errorCode ?? r.error_code ?? d.code ?? '', 40),
    status: clip(r.status ?? r.statusCode ?? d.status ?? '', 40),
    sdkLoaded: sdkLoaded === true,
    sdkEnv: sdkEnv === 'PRODUCTION' ? 'PRODUCTION' : sdkEnv === 'DEV' ? 'DEV' : '',
    ua: uaClass(ua),
    phase: clip(phase || '', 20),
  };
}

/** The server's own re-check of a posted body: unknown fields dropped, the same clipping applied again (never trust the page). */
export function cleanDiagBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const UA = ['whatsapp', 'instagram', 'facebook', 'android-webview', 'ios-webview', 'ios-safari', 'ios-other', 'android-chrome', 'android-other', 'other'];
  return {
    event: DIAG_EVENTS.includes(b.event) ? b.event : 'other',
    message: clip(b.message, 200),
    code: clip(b.code, 40),
    status: clip(b.status, 40),
    sdkLoaded: b.sdkLoaded === true,
    sdkEnv: b.sdkEnv === 'PRODUCTION' || b.sdkEnv === 'DEV' ? b.sdkEnv : '',
    ua: UA.includes(b.ua) ? b.ua : 'other',
    phase: clip(b.phase, 20),
  };
}

// lib/deliverFile.js
//
// Getting a file she asked for (the payments CSV, the skin-scan QR, a client's data export) onto her phone.
//
// Found 2026-10-24 in the phone review: all three were `<a download href="blob:...">` clicks followed by a toast that said the file
// had downloaded. On the phones she uses that is not true:
//   * home-screen app (iPhone standalone) and Instagram / Facebook in-app browsers: the click does nothing at all;
//   * iPhone Safari: the file lands in the Files app, where she never looks.
// The honest path on a phone is the share sheet (Save to Files, Mail, WhatsApp, her accountant), called from her own tap. Where even
// that is missing, say so and point her to a real browser, instead of claiming "downloaded".
import { canShareFile, inAppBrowser, isIos, isTouchDevice, shareOutcome } from './design/sharePost.js';

/**
 * What to do with a file in this browser.
 *   'share'    - hand it to the share sheet (needs a fresh tap: `tapIsLive`)
 *   'download' - a normal download works here (computers, Android Chrome)
 *   'blocked'  - nothing will save it here; tell her to open Kalmea in Safari / Chrome
 */
export function deliveryPlan({ ua, maxTouchPoints = 0, standalone = false, canShare = false, tapIsLive = true }) {
  const inApp = !!inAppBrowser(ua);
  const ios = isIos(ua, maxTouchPoints);
  const phone = isTouchDevice(ua, maxTouchPoints);
  if (canShare && tapIsLive && phone) return 'share';
  if (inApp) return 'blocked';
  if (ios && standalone) return 'blocked';
  return 'download';
}

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/**
 * Deliver `blob` as `filename`. Call it first thing in the tap handler (before any await) so the share sheet is allowed.
 * Resolves to 'shared' | 'downloaded' | 'cancelled' | 'blocked'. Never throws.
 */
export async function deliverFile(blob, filename, env = {}) {
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: blob.type || 'application/octet-stream' }) : null;
  const standalone = !!(nav && nav.standalone) || !!(win && win.matchMedia && win.matchMedia('(display-mode: standalone)').matches);
  const plan = deliveryPlan({
    ua: nav ? nav.userAgent : '', maxTouchPoints: nav ? nav.maxTouchPoints : 0, standalone,
    canShare: canShareFile(nav, file), tapIsLive: !(nav && nav.userActivation) || nav.userActivation.isActive,
  });
  if (plan === 'share') {
    try { await nav.share({ files: [file] }); return 'shared'; } catch (e) {
      const o = shareOutcome(e);
      if (o === 'cancelled') return 'cancelled';
      // refused (needs another tap) or failed: a normal download is the next best thing where one works
      if (inAppBrowser(nav.userAgent) || (isIos(nav.userAgent, nav.maxTouchPoints) && standalone)) return 'blocked';
    }
  }
  if (plan === 'blocked') return 'blocked';
  try { triggerDownload(blob, filename); return 'downloaded'; } catch { return 'blocked'; }
}

/** Her sentence for each outcome; '' when nothing needs saying. */
export function deliveryToast(outcome, { what = 'הקובץ', downloaded = 'הקובץ ירד' } = {}) {
  if (outcome === 'downloaded') return { text: downloaded, kind: 'success' };
  if (outcome === 'shared') return { text: `${what} מוכן. בחרי איפה לשמור אותו`, kind: 'success' };
  if (outcome === 'blocked') return { text: 'הדפדפן הזה לא שומר קבצים. פתחי את kalmea.app בספארי או בכרום ונסי שוב', kind: 'error' };
  return null;
}

/** A data: URL to a Blob, synchronously (a fetch() would use up the tap that the share sheet needs). */
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}

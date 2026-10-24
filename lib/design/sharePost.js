// lib/design/sharePost.js
//
// Getting a finished post (PNG) or reel (video) from the browser onto HER phone.
//
// Found 2026-10-24 (a paying customer: "I can't download the post and can't share it to Instagram"): the only way out
// of the studio was `<a download href="blob:...">` clicked after the render had finished. On a phone that fails in
// exactly the places she uses Kalmea from:
//   * iPhone, Kalmea added to the home screen (manifest display: standalone): a blob download either does nothing or
//     opens a full-screen preview with no way back into the app.
//   * iPhone Safari: the file goes to the Files app ("Downloads"), not to Photos, so Instagram's picker never sees it.
//   * Instagram / Facebook / WhatsApp in-app browsers: blob downloads are dropped silently.
// And there was no share button at all - the copy even told her "download the PNG and upload it to Instagram".
//
// So the studio now ends every export in a "ready" panel: a real share-sheet button (navigator.share with the file,
// called from her own tap so the browser allows it), the picture itself to long-press and "Save to Photos" when the
// browser cannot share files, and the old download for computers. The pure decisions live here so they are tested.

/** Instagram, Facebook, Messenger, WhatsApp, TikTok, LINE... - the in-app browsers that drop downloads. */
export function inAppBrowser(ua) {
  const s = String(ua || '');
  if (/Instagram/i.test(s)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(s)) return 'facebook';
  if (/WhatsApp/i.test(s)) return 'whatsapp';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(s)) return 'tiktok';
  if (/\bLine\//i.test(s)) return 'line';
  return null;
}

export function isIos(ua, maxTouchPoints = 0) {
  const s = String(ua || '');
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1);
}

/** A phone or tablet, where "download" is the wrong default and the share sheet is the right one. */
export function isTouchDevice(ua, maxTouchPoints = 0) {
  return isIos(ua, maxTouchPoints) || /Android|Mobile/i.test(String(ua || ''));
}

/**
 * Can this browser hand THIS file to the phone's share sheet? Needs navigator.share and canShare({ files }) saying
 * yes for it: iOS says no for .webm, desktop Firefox has no file sharing at all.
 */
export function canShareFile(nav, file) {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !file) return false;
  try { return !!nav.canShare({ files: [file] }); } catch { return false; }
}

/**
 * What a rejected navigator.share means for her:
 *  'cancelled' - she closed the sheet; nothing to say.
 *  'gesture'   - the browser wanted a fresh tap (the activation ran out); a second tap on the button works.
 *  'failed'    - anything else; fall back to the picture / download.
 */
export function shareOutcome(err) {
  const name = err && typeof err === 'object' ? err.name : '';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'NotAllowedError') return 'gesture';
  return 'failed';
}

/**
 * A file name every share target accepts: Latin letters, digits and dashes only. Some Android targets and older
 * iOS versions drop a shared file whose name has Hebrew in it; the name she sees in the app is unaffected.
 */
export function shareFileName(kind, ext, at = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const safeExt = String(ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  return `kalmea-${kind === 'video' ? 'reel' : 'post'}-${stamp}.${safeExt}`;
}

/** The plain MIME type of a blob, without codecs, for a File (some share targets reject 'video/mp4;codecs=...'). */
export function plainMime(type, fallback) {
  const t = String(type || '').split(';')[0].trim().toLowerCase();
  return t || fallback;
}

/**
 * A link that leaves the in-app browser for the phone's real one, or null when there is no such trick.
 * Android: an intent: URL hands the page to Chrome. iPhone: the x-safari-https:// scheme (iOS 17+) opens it in Safari;
 * older iPhones ignore it, so the caller always offers "copy the link" next to it.
 */
export function openInBrowserHref(ua, url) {
  const s = String(url || '');
  if (!/^https:\/\//i.test(s)) return null;
  if (isIos(ua)) return `x-safari-${s}`;
  if (/Android/i.test(String(ua || ''))) {
    const rest = s.replace(/^https:\/\//i, '');
    return `intent://${rest}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(s)};end`;
  }
  return null;
}

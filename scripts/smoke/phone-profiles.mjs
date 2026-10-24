// Phone profiles for the smoke walks, with Safari's real rules modelled where Chromium differs.
//   android      Pixel + Chrome: the baseline phone
//   iphone       iPhone Safari: no beforeinstallprompt, a clipboard write uses up the tap (a share right after is refused),
//                window.open after an await is blocked, a blob <a download> does not land anywhere useful
//   iphone-sa    the same, opened from the home screen (standalone: navigator.standalone, display-mode)
//   instagram / facebook   the in-app browsers: no downloads, popups blocked, no install
// Chromium cannot open a share sheet or a real popup, so navigator.share / window.open / <a download> / fetch are wrapped to RECORD
// what the page asked for. The record is window.__ev (read by the walk). Playwright WebKit on Windows has neither navigator.share
// nor WebCodecs, so these are Chromium with Safari's rules, not an iPhone.
export const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/he_IL;FBOP/5]',
};

export const PROFILES = {
  android: { ua: UA.android, ios: false, standalone: false, inApp: false, share: true },
  iphone: { ua: UA.iphone, ios: true, standalone: false, inApp: false, share: true },
  'iphone-sa': { ua: UA.iphone, ios: true, standalone: true, inApp: false, share: true },
  instagram: { ua: UA.instagram, ios: true, standalone: false, inApp: true, share: false },
  facebook: { ua: UA.facebook, ios: true, standalone: false, inApp: true, share: false },
};

/** Init script: models the profile and records what the page asks the browser to do. */
export const initScript = (p) => `
(() => {
  const P = ${JSON.stringify(p)};
  window.__ev = [];
  const rec = (kind, info) => { try { window.__ev.push({ kind, info: String(info == null ? '' : info).slice(0, 200), t: performance.now() }); } catch {} };
  window.__tap = 0;
  addEventListener('pointerdown', () => { window.__tap = performance.now(); }, true);
  // dismissible hints the walk is not testing
  if (!P.keepHints) { try { localStorage.setItem('bloomos-ios-install-dismissed', '1'); } catch {} }
  if (P.standalone) {
    try { Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }); } catch {}
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q) ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) : mm(q);
  }
  // no beforeinstallprompt on Safari / in-app browsers: swallow it if Chromium fires it
  if (P.ios) addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true);
  // window.open: recorded; blocked after an await (no live tap), blocked always in-app and standalone-with-no-target
  const wo = window.open.bind(window);
  window.open = (u, t, f) => {
    const sinceTap = performance.now() - (window.__tap || -1e9);
    const live = sinceTap < 1000 && (navigator.userActivation ? navigator.userActivation.isActive : true);
    const blocked = P.ios && !live;
    rec('window.open', (blocked ? 'BLOCKED ' : '') + (u || '(blank)') + ' ' + (f || ''));
    if (blocked) return null;
    return { closed: false, close() {}, location: { set href(v) { rec('popup.location', v); } }, set opener(v) {} };
  };
  // blob <a download>: iPhone Safari saves it to Files (hard to find), standalone / in-app do nothing
  const ac = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download')) {
      const where = P.inApp ? 'NOTHING (in-app browser)' : P.standalone && P.ios ? 'NOTHING (standalone)' : P.ios ? 'Files app (blob)' : 'Downloads';
      rec('download', this.getAttribute('download') + ' -> ' + where + ' ' + String(this.href).slice(0, 30));
      return;
    }
    return ac.apply(this, arguments);
  };
  // clipboard: a write uses up the tap on Safari; no clipboard at all in some in-app browsers
  if (P.inApp) { try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); } catch {} }
  else if (navigator.clipboard) {
    const w = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { window.__clipAt = performance.now(); rec('clipboard', t); return w(t).catch(() => {}); };
  }
  // share
  const canShare = P.share;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare ? (d) => !!(d && d.files && d.files.length) : undefined });
  Object.defineProperty(navigator, 'share', { configurable: true, value: canShare ? async (d) => {
    if (P.ios && window.__clipAt && performance.now() - window.__clipAt < 100) { rec('share', 'REFUSED NotAllowedError (clipboard used the tap)'); throw new DOMException('not allowed', 'NotAllowedError'); }
    rec('share', (d.files ? d.files.map((f) => f.name + ':' + f.type + ':' + f.size).join(',') : '') + ' ' + (d.url || '') + ' ' + (d.text || '').slice(0, 40));
  } : undefined });
  // network: what each tap asks the server for
  const f = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    const url = String(u && u.url ? u.url : u); const m = (o && o.method) || (u && u.method) || 'GET';
    const own = url.startsWith('/') || url.startsWith(location.origin);
    const r = await f(u, o);
    if (own && !/_next|\\.(png|jpe?g|svg|woff2?|css|js)(\\?|$)/.test(url) && !/\\/api\\/(version|push)/.test(url)) rec('api', m + ' ' + url.replace(location.origin, '').slice(0, 90) + ' -> ' + r.status);
    return r;
  };
  // localStorage that throws (Safari private mode used to)
  if (P.noStorage) { try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); } catch {} }
})();`;

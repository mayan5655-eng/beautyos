// Getting a finished post onto her phone (2026-10-24: a customer could neither download a post nor share it to
// Instagram - the only way out was a blob download, which iPhones, the home-screen app and in-app browsers drop).
// This pins the decisions behind the save/share panel; the panel itself is checked on a 430px preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canShareFile, inAppBrowser, isIos, isTouchDevice, shareOutcome, shareFileName, plainMime } from './lib/design/sharePost.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';
const FB = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

// in-app browsers
assert.equal(inAppBrowser(IG), 'instagram');
assert.equal(inAppBrowser(FB), 'facebook');
assert.equal(inAppBrowser(IPHONE), null);
assert.equal(inAppBrowser(ANDROID), null);
assert.equal(inAppBrowser(undefined), null);

// phones and the iPad that calls itself a Mac
assert.equal(isIos(IPHONE), true);
assert.equal(isIos(IPAD, 5), true);
assert.equal(isIos(IPAD, 0), false, 'a real Mac has no touch points');
assert.equal(isTouchDevice(ANDROID), true);
assert.equal(isTouchDevice(DESKTOP), false);

// canShare: only when the browser says yes for this file; never throws
const png = { name: 'kalmea-post.png', type: 'image/png' };
assert.equal(canShareFile({ share() {}, canShare: () => true }, png), true);
assert.equal(canShareFile({ share() {}, canShare: () => false }, png), false, 'iOS answers no for .webm');
assert.equal(canShareFile({ share() {} }, png), false, 'share without canShare: files are not supported');
assert.equal(canShareFile({ canShare: () => true }, png), false);
assert.equal(canShareFile({ share() {}, canShare: () => { throw new TypeError('bad'); } }, png), false);
assert.equal(canShareFile(undefined, png), false);
assert.equal(canShareFile({ share() {}, canShare: () => true }, null), false);

// what a rejected share means
assert.equal(shareOutcome({ name: 'AbortError' }), 'cancelled');
assert.equal(shareOutcome({ name: 'NotAllowedError' }), 'gesture');
assert.equal(shareOutcome(new TypeError('x')), 'failed');
assert.equal(shareOutcome(undefined), 'failed');

// share file names: Latin only, right extension
const at = new Date(2026, 9, 24, 9, 5);
assert.equal(shareFileName('image', 'png', at), 'kalmea-post-20261024-0905.png');
assert.equal(shareFileName('video', 'mp4', at), 'kalmea-reel-20261024-0905.mp4');
assert.equal(shareFileName('image', 'פנג', at), 'kalmea-post-20261024-0905.png');
assert.match(shareFileName('image', 'jpg'), /^[a-z0-9.-]+$/);

assert.equal(plainMime('video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'), 'video/mp4');
assert.equal(plainMime('', 'image/png'), 'image/png');

// the studio no longer ends an export in a bare blob download
const editor = fs.readFileSync('app/design/DesignEditor.jsx', 'utf8');
assert.match(editor, /<SaveShare /, 'the post editor opens the save/share panel');
assert.doesNotMatch(editor, /onExport=\{\(blob\) => downloadBlob/, 'the advanced editor export goes to the panel too');
const reel = fs.readFileSync('app/design/ReelRender.jsx', 'utf8');
assert.match(reel, /<SaveShare /, 'the reel opens the save/share panel');
const panel = fs.readFileSync('app/design/SaveShare.jsx', 'utf8');
// navigator.share must be called straight from the tap, with nothing awaited before it
assert.doesNotMatch(panel, /await[^\n]*\n[^\n]*navigator\.share/, 'nothing is awaited before navigator.share');
assert.match(panel, /readAsDataURL/, 'the long-press picture is a data: image');
// iPhone, 2026-10-24: a clipboard write in the same tap makes Safari refuse navigator.share. The share handler
// calls navigator.share and nothing that touches the clipboard.
const shareFn = panel.slice(panel.indexOf('const share = () => {'), panel.indexOf('const download = () => {'));
assert.ok(shareFn.includes('navigator.share('), 'the share handler shares');
assert.doesNotMatch(shareFn, /clipboard|copyCaption\(/, 'and never copies in the same tap');
const dlFn = panel.slice(panel.indexOf('const download = () => {'), panel.indexOf('const copyLink'));
assert.doesNotMatch(dlFn, /clipboard|copyCaption\(/, 'the download does not copy either');
assert.match(panel, /data-testid="save-share-copy"/, 'the caption has its own copy button');
const enc = fs.readFileSync('app/design/reelEncoder.js', 'utf8');
assert.match(enc, /withStall\(video\.add/, 'a hung encoder fails instead of spinning forever');

console.log('post share: ok');

// Leaving an in-app browser (2026-10-24): Safari on iPhone, Chrome on Android, nothing elsewhere.
{
  const { openInBrowserHref, inAppBrowser: iab } = await import('./lib/design/sharePost.js');
  const url = 'https://kalmea.app/dashboard';
  assert.equal(openInBrowserHref(IG, url), 'x-safari-https://kalmea.app/dashboard');
  assert.match(openInBrowserHref(FB, url)!, /^intent:\/\/kalmea\.app\/dashboard#Intent;scheme=https;package=com\.android\.chrome;/);
  assert.equal(openInBrowserHref(DESKTOP, url), null);
  assert.equal(openInBrowserHref(IG, 'javascript:alert(1)'), null, 'only https links');
  assert.equal(iab(IG), 'instagram');
  const banner = fs.readFileSync('app/in-app-browser-banner.tsx', 'utf8');
  assert.match(banner, /isOwnerSurface\(pathname/, 'only on her own screens (lib/ownerSurface.js), never the public booking page');
  assert.match(fs.readFileSync('lib/ownerSurface.js', 'utf8'), /OWNER_PATHS = \['\/dashboard'/);
  for (const f of ['app/ios-install-banner.tsx', 'app/install-prompt-banner.tsx']) assert.match(fs.readFileSync(f, 'utf8'), /isOwnerSurface\(pathname/, f + ': install hint only on her own screens');
  assert.match(fs.readFileSync('app/layout.tsx', 'utf8'), /<InAppBrowserBanner \/>/);
  assert.match(fs.readFileSync('app/ios-install-banner.tsx', 'utf8'), /!inAppBrowser\(ua\)/, 'no "Add to Home Screen" hint where it does not exist');
}

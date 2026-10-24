// The phone review (2026-10-24): the payments CSV, the skin-scan QR and the client data export were blob downloads with a "downloaded"
// toast. On the home-screen app and in Instagram/Facebook they did nothing. This pins what each browser is told to do.
import assert from 'node:assert/strict';
import { deliveryPlan, deliveryToast, dataUrlToBlob } from './lib/deliverFile.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

// a phone that can share files shares, from a live tap
assert.equal(deliveryPlan({ ua: IPHONE, canShare: true }), 'share');
assert.equal(deliveryPlan({ ua: ANDROID, canShare: true }), 'share');
assert.equal(deliveryPlan({ ua: IPHONE, canShare: true, standalone: true }), 'share', 'the home-screen app shares too');
// a computer downloads even when it could share
assert.equal(deliveryPlan({ ua: DESKTOP, canShare: true }), 'download');
assert.equal(deliveryPlan({ ua: DESKTOP }), 'download');
// where nothing can save a file she is told, not lied to
assert.equal(deliveryPlan({ ua: IG }), 'blocked');
assert.equal(deliveryPlan({ ua: IPHONE, standalone: true }), 'blocked');
// an old tap (after an await) cannot open the share sheet: Safari still downloads, the home-screen app cannot
assert.equal(deliveryPlan({ ua: IPHONE, canShare: true, tapIsLive: false }), 'download');
assert.equal(deliveryPlan({ ua: IPHONE, canShare: true, tapIsLive: false, standalone: true }), 'blocked');
assert.equal(deliveryPlan({ ua: ANDROID }), 'download');

// the toast never says "downloaded" for a blocked file
assert.match(deliveryToast('blocked')!.text, /ספארי או בכרום/);
assert.equal(deliveryToast('blocked')!.kind, 'error');
assert.equal(deliveryToast('downloaded', { downloaded: 'הקובץ ירד' })!.text, 'הקובץ ירד');
assert.equal(deliveryToast('cancelled'), null);

// a data: URL becomes a Blob without a fetch (a fetch would use up the tap)
const b = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')!;
assert.equal(b.type, 'image/png');
assert.equal(b.size, 8);
assert.equal(dataUrlToBlob('not a data url'), null);
console.log('deliver-file: ok');

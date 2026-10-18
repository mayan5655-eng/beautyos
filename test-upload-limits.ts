// test-upload-limits.ts
//
// A photo from her phone must go up, and a photo that cannot go up must say why. Every upload is resized in the
// browser first, so the limit on the PICKED file only stops files a phone cannot decode; what protects storage is a
// check on what is actually sent (size, and the formats the public bucket accepts).
// Found 2026-10-18: a 3 MB limit on the original refused an ordinary phone camera photo; client-card photos went up
// unresized under the phone's own file name; a failed before/after upload was ignored and its row saved anyway.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, COULD_NOT_SHRINK_HE, notUploadable } from './lib/imageResize.ts';

assert.ok(MAX_SOURCE_BYTES >= 20 * 1024 * 1024, 'a phone camera photo is accepted');
assert.ok(MAX_UPLOAD_BYTES <= 5 * 1024 * 1024, 'what reaches storage stays small');

const blob = (bytes: number, type: string) => new Blob([new Uint8Array(bytes)], { type });
assert.equal(notUploadable(blob(300_000, 'image/jpeg')), null);
assert.equal(notUploadable(blob(300_000, 'image/webp')), null);
assert.equal(notUploadable(blob(MAX_UPLOAD_BYTES + 1, 'image/jpeg')), COULD_NOT_SHRINK_HE, 'still huge after resizing');
assert.equal(notUploadable(blob(2_000_000, 'image/heic')), COULD_NOT_SHRINK_HE, 'a HEIC the phone could not convert');
assert.equal(notUploadable(blob(2_000, 'image/svg+xml')), COULD_NOT_SHRINK_HE, 'svg only where allowed');
assert.equal(notUploadable(blob(2_000, 'image/svg+xml'), { allowSvg: true }), null, 'a logo may be an svg');

const read = (f: string) => fs.readFileSync(f, 'utf8');
for (const f of ['app/beautyos.jsx', 'app/ResultsManager.jsx', 'app/design/images.js']) {
  const s = read(f);
  assert.doesNotMatch(s, /(3|12)\s*\*\s*1024\s*\*\s*1024/, `${f}: no small limit on the picked photo`);
  assert.match(s, /notUploadable\(/, `${f}: the resized blob is checked before upload`);
}
const b = read('app/beautyos.jsx');
assert.equal((b.match(/if\(up\.skipped\) return;/g) || []).length, 3, 'clinic, service and gallery uploads stop on a skipped file');
assert.match(b, /if \(main\.skipped \|\| !main\.url\) return;/);
// client-card photos: resized, and never named after the phone's file
assert.doesNotMatch(b, /\$\{file\.name\}/, 'no storage key built from the picked file name');
assert.match(b, /const blob=await resizeImage\(file,IMAGE_PRESETS\.gallery\);/);
// before/after: every upload checked, nothing saved after a failure
assert.match(b, /const putOne = async \(file, side\)/);
assert.match(b, /if \(upErr\) \{ handleDbError\(upErr, "upload client photo"\); return null; \}/);
assert.match(b, /if \(beforeFile\) \{ beforeUrl = await putOne\(beforeFile, "before"\); if \(!beforeUrl\) return; \}/);
console.log('upload limits: all assertions passed');

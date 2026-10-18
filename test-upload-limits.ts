// test-upload-limits.ts
//
// A photo from her phone must go up. Every upload is resized in the browser first, so the limit on the PICKED file
// only stops files a phone cannot decode; the limit that protects storage is on what is actually sent.
// Found 2026-10-18: a 3 MB limit on the original refused an ordinary phone camera photo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES } from './lib/imageResize.ts';

assert.ok(MAX_SOURCE_BYTES >= 20 * 1024 * 1024, 'a 12 MP phone photo (up to ~10 MB, more as HEIC-to-JPEG) is accepted');
assert.ok(MAX_UPLOAD_BYTES <= 5 * 1024 * 1024, 'what reaches storage stays small');

for (const f of ['app/beautyos.jsx', 'app/ResultsManager.jsx']) {
  const s = fs.readFileSync(f, 'utf8');
  assert.doesNotMatch(s, /3\s*\*\s*1024\s*\*\s*1024/, `${f}: no 3 MB limit on the picked photo any more`);
  assert.match(s, /MAX_UPLOAD_BYTES/, `${f}: the resized blob is checked before upload`);
}
const b = fs.readFileSync('app/beautyos.jsx', 'utf8');
// a skipped upload never reports success or stores an empty URL
assert.equal((b.match(/if\(up\.skipped\) return;/g) || []).length, 3, 'clinic, service and gallery uploads stop on a skipped file');
assert.match(b, /if \(main\.skipped \|\| !main\.url\) return;/);
console.log('upload limits: all assertions passed');

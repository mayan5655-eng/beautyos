// test-update-banner.ts
//
// An installed app resumes from memory, so a phone can run old code for hours after a fix is live (2026-10-18). The
// banner tells her; these pins keep it honest: same id on both sides, never cached, never reloads on its own.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rd = (f: string) => fs.readFileSync(f, 'utf8');

const cfg = rd('next.config.ts');
assert.match(cfg, /NEXT_PUBLIC_BUILD_ID: process\.env\.VERCEL_GIT_COMMIT_SHA/, 'the bundle carries the commit it was built from');
assert.match(rd('lib/buildId.ts'), /process\.env\.NEXT_PUBLIC_BUILD_ID \|\| 'dev'/);

const route = rd('app/api/version/route.ts');
assert.match(route, /import \{ BUILD_ID \} from '@\/lib\/buildId'/, 'the server answers with the same constant');
assert.match(route, /'Cache-Control': 'no-store'/, 'never cached, or the check would compare against a stale answer');

const b = rd('app/UpdateBanner.tsx');
assert.match(b, /if \(BUILD_ID === 'dev'\) return;/, 'silent locally');
assert.match(b, /visibilitychange/, 'checks when the app comes back to the foreground');
assert.match(b, /cache: 'no-store'/);
assert.equal((b.match(/location\.reload\(\)/g) || []).length, 1, 'reloads only from the button');
assert.match(b, /onClick=\{\(\) => window\.location\.reload\(\)\}/);

assert.match(rd('app/layout.tsx'), /<UpdateBanner \/>/, 'on every page');
console.log('update banner: all assertions passed');

// The owner-only banners (install to home screen, open in Safari) must not sit on her clients' pages, and must reach the app at "/".
import assert from 'node:assert/strict';
import { isOwnerSurface, hasSession } from './lib/ownerSurface.js';

const signedIn = 'a=1; sb-abcdef-auth-token=base64-xyz; b=2';
const chunked = 'sb-abcdef-auth-token.0=aaa; sb-abcdef-auth-token.1=bbb';
assert.equal(hasSession(signedIn), true);
assert.equal(hasSession(chunked), true);
assert.equal(hasSession('foo=bar'), false);
assert.equal(hasSession('sb-abcdef-auth-token-code-verifier=x'), false);
assert.equal(hasSession(''), false);

// the app itself
assert.equal(isOwnerSurface('/', signedIn), true, 'a signed-in "/" is the owner app');
assert.equal(isOwnerSurface('/', ''), false, 'a signed-out "/" is the public landing page');
for (const p of ['/dashboard', '/dashboard/owner', '/login', '/signup', '/onboarding', '/reset-password']) assert.equal(isOwnerSurface(p), true, p);
// her clients' pages, even for a browser that happens to be signed in as her
for (const p of ['/book', '/clinic-bdika', '/form', '/pay/abc', '/review', '/cancel', '/confirm', '/skin-scan', '/community', '/privacy', '/accessibility']) assert.equal(isOwnerSurface(p, signedIn), false, p);
console.log('owner-surface: ok');

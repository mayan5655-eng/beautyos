// Every page a CLIENT opens from a link must load with no session; the dashboard must not.
//
// 2026-10-06: /claim/<token> (the gap-fill WhatsApp offer: "a slot opened, want it?") was not in the middleware's public
// list. A client without a session who tapped it got 307 -> /login, so the feature that exists to fill a cancelled slot sent
// the client to a login page. Found while taking before-screenshots for the public-pages pass. This asks the REAL middleware
// (updateSession) about each path with no cookies and reads the answer, instead of reading the list.
import assert from 'node:assert/strict';
import { importApp } from './testkit/render.mjs';

const { updateSession } = await importApp('lib/supabase/middleware.ts'); // registers the loader first
const { NextRequest } = await import('next/server');
const where = async (p: string) => (await updateSession(new NextRequest('https://kalmea.app' + p))).headers.get('location') || '';

const PUBLIC = [
  '/', '/login', '/signup', '/privacy', '/terms',
  '/some-business-slug',                       // her public booking page
  '/book?t=11111111-2222-3333-4444-555555555555',
  '/confirm?id=1&t=x&action=cancel',           // confirm / cancel
  '/review?id=1&t=x',
  '/claim/abc123',                             // the gap-fill offer
  '/skin-scan?t=11111111-2222-3333-4444-555555555555',
  '/community?t=11111111-2222-3333-4444-555555555555',
  '/form?t=x',
  '/logo/abc', '/og/abc', '/demo/cosmetics',
];
for (const p of PUBLIC) assert.equal(await where(p), '', `${p} loads with no session`);

const PRIVATE = ['/dashboard', '/dashboard/anything', '/claimant/x', '/no-such/deep/path'];
for (const p of PRIVATE) assert.match(await where(p), /\/login$/, `${p} still needs a session`);

console.log('public access: ok');

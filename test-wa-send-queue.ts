// The manual WhatsApp send queue reaches her.
//
// whatsapp_messages has no SELECT/UPDATE policy for `authenticated`. The dashboard
// used to read the queue straight from the browser: 200 with [] every time, so
// "הודעות מוכנות לשליחה" never appeared and each queued booking confirmation
// died there (live, 2026-10-23, fresh tenant). Marking one sent was the same
// browser update and touched 0 rows without an error. Both now go through
// /api/messages, which scopes by the session's tenant with the service key.
// And the booking page no longer promises a WhatsApp confirmation the central
// number cannot send while it is off.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const dash = read('./app/beautyos.jsx');
const route = read('./app/api/messages/route.js');
const booking = read('./app/BookingPage.jsx');

// No browser read or write of the table, anywhere in the dashboard.
assert.ok(!/\.from\(\s*["']whatsapp_messages["']\s*\)/.test(dash), 'beautyos.jsx must not touch whatsapp_messages from the browser (RLS returns nothing)');
assert.ok(dash.includes('fetch("/api/messages?status=pending_manual"'), 'the queue loads through /api/messages');
assert.ok(/fetch\("\/api\/messages",\{method:"PATCH"/.test(dash), 'marking a message sent goes through PATCH /api/messages');

// The route: tenant from the session, never the body; a queue read with its count; a scoped update.
assert.match(route, /export async function GET\(request\)/);
assert.match(route, /export async function PATCH\(request\)/);
assert.match(route, /rpc\("get_user_tenant_id"\)/, 'tenant comes from the session');
assert.ok(!/tenantId\s*}\s*=\s*await request\.json/.test(route) && !/body\.tenant/.test(route), 'tenant is never read from the request');
const patch = route.slice(route.indexOf('export async function PATCH'));
assert.match(patch, /\.eq\("tenant_id", tenantId\)/, 'update is scoped to her tenant');
assert.match(patch, /\.eq\("status", "pending_manual"\)/, 'only a waiting message can be marked sent');
assert.match(patch, /status: 404/, 'nothing changed is a 404, not a quiet success');
assert.match(route, /status !== "pending_manual"/, 'GET accepts only the one queue status');

// The booking page's promise.
assert.ok(!booking.includes('יגיע אלייך אישור בוואטסאפ'), 'no WhatsApp-confirmation promise on the booking page');

console.log('test-wa-send-queue: ok');

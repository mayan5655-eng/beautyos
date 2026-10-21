// Owner decision 2026-10-21: when the 30-day trial ends without payment (plan_status expired, or paused) the system
// CLOSES. No read-only mode: the dashboard is replaced by the renewal screen, no calendar or client row is put into
// state, her public page takes no new bookings, and nothing is deleted. Reminders for appointments already booked keep
// going (the reminder senders are not gated, and this pins that they stay that way).
// Source checks, in the style of test-dead-controls.ts: the wiring is what broke before, not the maths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const app = read('./app/beautyos.jsx');

// ── the dashboard: loadAll stops before any data reaches state, and the shell is replaced ──
const stop = app.indexOf('if (planState(tn?.data || null).isBlocked && !isDemoTenantId(myTenantId))');
assert.ok(stop > 0, 'loadAll checks the plan right after reading the tenants row');
for (const setter of ['setAppointments(a.data || [])', 'setClients(c.data || [])', 'setReceipts(r.data || [])', 'setSettings(myRow)', '      loadHistory();']) {
  const at = app.indexOf(setter, app.indexOf('const loadAll = async'));
  assert.ok(at > stop, `${setter} runs only after the closed check, so a closed business loads none of it`);
}
const gate = app.indexOf('if(planInfo.isBlocked && !isDemoTenantId(planRow?.id)) return (');
assert.ok(gate > app.indexOf('if(loadError) return ('), 'the closed screen comes after the loading and error screens');
assert.ok(gate < app.indexOf('<BillingNotices plan={planInfo}'), 'and before the shell, so no tab, menu or calendar renders');
assert.ok(/<PlanBlockedScreen[\s\S]{0,200}plan=\{planInfo\}/.test(app.slice(gate, gate + 600)), 'it renders PlanBlockedScreen');

const screen = read('./app/PlanBlockedScreen.jsx');
assert.ok(/BillingCard/.test(screen), 'a closed business can still pay (billing stays reachable)');
assert.ok(/supportWhatsAppUrl\(\)/.test(screen), 'and can reach us on WhatsApp');
assert.ok(/\{cta\}/.test(screen), 'the upgrade-button slot is there');
assert.ok(!/appointments|clients=/.test(screen), 'the screen takes no calendar or client data at all');

// ── her public page: closed to NEW bookings, server-side, before the form ──
const slug = read('./app/[slug]/page.tsx');
assert.ok(/publicBookingClosed\(tenant\.id\)/.test(slug) && /if \(closed\) \{\s*return <BookingClosed/.test(slug), '/[slug] shows the closed page');
const book = read('./app/book/page.jsx');
assert.ok(/if \(await publicBookingClosed\(t\)\) return <BookingClosed/.test(book), '/book?t= shows the same closed page');
assert.ok(/tenantIsBlocked\(supabase, activeTenantId\)/.test(read('./app/api/book-appointment/route.js')), 'the booking API still refuses a closed business');
assert.ok(/tenantIsBlocked\(admin, tenantId\)/.test(read('./app/api/waitlist/join/route.js')), 'and so does the waitlist');
assert.ok(/tenantIsBlocked\(supabase, tenantId\)/.test(read('./app/api/skin-scan/route.js')), 'her public skin scanner closes too, before any AI spend');
const closedPage = read('./app/BookingClosed.tsx');
assert.ok(!/--brand-|Kalmea|קלמיה|מנוי/.test(closedPage.replace(/^\/\/.*$/gm, '')), 'the closed page is in her brand and says nothing about billing');

const gateLib = read('./lib/publicBookingGate.ts');
assert.ok(/catch \{\s*return false/.test(gateLib) && /if \(!url \|\| !key \|\| !tenantId\) return false/.test(gateLib), 'the public gate fails OPEN');

// ── reminders for appointments already booked keep going ──
for (const p of ['./app/api/send-reminders/route.js', './app/api/send-smart-reminders/route.js']) {
  let src = '';
  try { src = read(p); } catch { continue; }
  assert.ok(!/tenantIsBlocked|requireActiveTenant|isBlocked/.test(src), `${p} is not plan-gated: booked clients keep their reminders`);
}

console.log('trial-ends-closed: all checks passed');

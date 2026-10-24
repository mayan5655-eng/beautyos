// A business-side cancel tells the client, and the client card shows a cancelled visit as cancelled.
// (2026-10-23 pass, D2 + E1.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cancelNoticeText } from './lib/cancelNotice.js';
import { WA_TYPE_LABELS } from './lib/waStatusLabel.js';

const msg = cancelNoticeText({ clientName: 'רונית', service: 'ניקוי פנים עמוק', date: '2026-10-25', time: '10:00', businessName: 'סטודיו נועה', therapistName: 'נועה' });
assert.ok(msg.startsWith('שלום רונית!'), msg);
assert.ok(msg.includes('לצערי אני צריכה לבטל את התור שלך בסטודיו נועה.'));
assert.ok(msg.includes('ניקוי פנים עמוק · יום ראשון, 25 באוקטובר · 10:00'), msg);
assert.ok(msg.includes('מתי נוח לך?') && msg.trim().endsWith('נועה 🌸'));
assert.ok(!/2026-10-25/.test(msg), 'no ISO date in her client message');
assert.ok(cancelNoticeText({ clientName: '', service: 'x', date: '', time: '', businessName: '', therapistName: '' }).startsWith('שלום!'));

const route = fs.readFileSync(new URL('./app/api/cancel-notice/route.js', import.meta.url), 'utf8');
assert.match(route, /rpc\("get_user_tenant_id"\)/, 'tenant from the session');
assert.match(route, /\.eq\("tenant_id", tenantId\)/, 'reads scoped to her tenant');
assert.match(route, /cancelled_by === "client"/, 'a client-side cancel is not answered with "I cancelled"');
assert.match(route, /requireActiveTenant/, 'a closed account sends nothing');
assert.match(route, /type: "cancel_notice"/);
assert.ok(!/export function/.test(route), 'a route file exports only handlers');

const wa = fs.readFileSync(new URL('./lib/whatsapp.js', import.meta.url), 'utf8');
assert.match(wa.match(/const UTILITY_TYPES = new Set\(\[([^\]]*)\]\)/)![1], /"cancel_notice"/, 'transactional: goes out automatically when the central number is on');
assert.equal((WA_TYPE_LABELS as Record<string, string>).cancel_notice, 'ביטול תור');

const dash = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
assert.ok(dash.includes('fetch("/api/cancel-notice"'), 'the calendar cancel prepares the message');
assert.ok(/if \(restored\) return;\s*try \{\s*const r = await fetch\("\/api\/cancel-notice"/.test(dash), 'never for an undone cancel');
assert.ok(dash.includes('data-testid={cancelled?"history-cancelled":undefined}'), 'the card marks a cancelled visit');
assert.ok(dash.includes('c.phone&&!cancelled&&a.date>=today&&<button'), 'no reminder button on a cancelled or past visit');
assert.ok(dash.includes('countHe(appts.filter(a=>a.confirmation_status!=="cancelled").length,"תור אחד","תורים")'), 'the row counts live appointments');

console.log('test-cancel-notice: ok');

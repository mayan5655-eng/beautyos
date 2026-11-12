// 2026-11-03 UX review: the fixes, pinned. Pure helpers are run; screen wiring is read from the source like the other audits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { apptStatus, apptStatusWord } from './lib/apptStatus.js';
import { NO_SHOW } from './lib/reliability.ts';
import { toastDurationMs, TOAST_ACTION_MS, UNDO_SETTLE_MS } from './lib/toastDuration.js';
import { newApptStart } from './lib/businessHours.ts';
import { waDigits, publicWhatsapp, publicContactFor } from './lib/publicContact.ts';

const src = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = src('./app/beautyos.jsx');
let n = 0;
const ok = async (name: string, fn: () => unknown) => { await fn(); n++; console.log(`ok - ${name}`); };

await ok('11: one set of status words', () => {
  assert.equal(apptStatusWord({ confirmation_status: 'confirmed' }), 'אישרה');
  assert.equal(apptStatusWord({ confirmation_status: 'pending' }), 'ממתינה לאישור');
  assert.equal(apptStatusWord({}), 'ממתינה לאישור');
  assert.equal(apptStatusWord({ confirmation_status: 'cancelled' }), 'בוטל');
  assert.equal(apptStatusWord({ confirmation_status: NO_SHOW }), 'לא הגיעה', 'same value as lib/reliability NO_SHOW');
  assert.equal(apptStatus({ confirmation_status: 'confirmed' }, { personal: true }).label, 'אישי');
  // used by Today, the agenda and My Day; the old per-screen words are gone
  assert.match(app, /const st=\{l:apptStatus\(a,\{personal:isPersonal\(a\)\}\)\.label\};/);
  assert.match(app, /const s0=apptStatus\(appt,\{personal:isPersonal\(appt\)\}\)/);
  assert.ok(!app.includes('{l:"ממתין לאישור"') && !app.includes('{l:"אושר"}') && !app.includes('{l:"ממתין"}'));
  assert.match(src('./app/MyDayCard.jsx'), /apptStatusWord\(r\.appt\)/);
});

await ok('10: toasts last long enough, and an undo never outlives what it protects', () => {
  assert.equal(toastDurationMs('קצר'), 3500);
  assert.equal(toastDurationMs('א'.repeat(100)), 7000);
  assert.equal(toastDurationMs('א'.repeat(100), true), 8000);
  assert.equal(toastDurationMs('', true), TOAST_ACTION_MS);
  assert.ok(UNDO_SETTLE_MS > TOAST_ACTION_MS);
  assert.match(app, /toastDurationMs\(msg, !!action\)/);
  assert.ok(!/\}, 65\d\d\);/.test(app), 'the cancel follow-ups wait for UNDO_SETTLE_MS, not the old 6.5s');
  assert.equal((app.match(/UNDO_SETTLE_MS/g) || []).length >= 5, true);
  assert.match(app, /@media \(max-width:680px\)\{[\s\S]{0,400}\.toast-stack\{top:auto!important;bottom:calc\(74px \+ env\(safe-area-inset-bottom, 0px\) \+ 14px\)!important\}/);
  assert.match(app, /\.toast-stack \.toast\{font-size:var\(--t-md\)!important\}/);
});

await ok('6: a new appointment today opens on the next half hour inside her hours', () => {
  const s = { working_hours_start: 9, working_hours_end: 19 } as never; // Sun..Fri open
  const at = (h: number, m: number) => new Date(2026, 10, 3, h, m); // Tue 3.11.2026
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.deepEqual([day(newApptStart(s, at(10, 10), 60).date), newApptStart(s, at(10, 10), 60).minute], ['2026-11-3', 630]);
  assert.equal(newApptStart(s, at(10, 30), 60).minute, 630, 'on the half hour stays');
  assert.equal(newApptStart(s, at(7, 5), 60).minute, 540, 'before opening: the opening');
  const late = newApptStart(s, at(18, 20), 60); // 18:30 + 60 > 19:00
  assert.equal(day(late.date), '2026-11-4'); assert.equal(late.minute, 540, 'nothing fits today: the next open day at opening');
  assert.equal(newApptStart(s, at(18, 20), 30).minute, 1110, 'a 30 minute visit still fits at 18:30');
  const sat = newApptStart(s, new Date(2026, 10, 7, 11, 0), 60); // Saturday, closed
  assert.equal(day(sat.date), '2026-11-8'); assert.equal(sat.minute, 540);
  assert.match(app, /const when = newApptStart\(settings, new Date\(\), svc\?\.duration \|\| 60\);/);
  assert.match(app, /const base=\[30,45,60,90,120\];const svcDur=/);
});

await ok('9: the public pages get her booking link and WhatsApp only after their own check', async () => {
  assert.equal(waDigits('050-123 4567'), '972501234567');
  assert.equal(waDigits('972501234567'), '972501234567');
  assert.equal(waDigits(''), '');
  assert.equal(publicWhatsapp({ business_phone: '0501234567', branding: { whatsapp_number: '0527654321' } }), '972527654321');
  const db = (slug: string | null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: slug ? { slug } : null }) }) }) }) });
  assert.deepEqual(await publicContactFor(db('dana'), 'T1', { business_phone: '0501234567' }), { bookUrl: '/dana', whatsapp: '972501234567' });
  assert.deepEqual(await publicContactFor(db(null), 'T1', null), { bookUrl: '/book?t=T1', whatsapp: '' });
  const throwing = { from: () => { throw new Error('down'); } };
  assert.deepEqual(await publicContactFor(throwing, 'T1', null), { bookUrl: '/book?t=T1', whatsapp: '' });

  const route = src('./app/api/confirm/route.ts');
  assert.ok(!route.includes('התור אושר בהצלחה') && !route.includes('התור בוטל בהצלחה'));
  assert.ok(route.indexOf('if (!verifyConfirm(') < route.indexOf('publicContactFor(supabase'), 'contact only after the signature check');
  const peek = route.slice(route.indexOf('if (body.peek === true)'), route.indexOf('// Idempotent'));
  // The peek carries her public contact only alongside a refusal (2026-11-09: the cancel page shows the refusal up front).
  assert.ok(peek.includes("...(action === 'cancel' && refusal ? { refusal:") && (peek.match(/contact/g) || []).length === 1, 'contact only with a refusal');
  assert.ok(!/const reject = \(\) =>[^;]*contact/.test(route), 'the 404 carries nothing');
  const page = src('./app/confirm/page.jsx');
  assert.match(page, /data-testid="confirm-next"/);
  assert.match(page, /קביעת מועד אחר/);
  assert.match(page, /data\.bookUrl\.startsWith\('\/'\)/, 'only a path on this site');
  const claimRoute = src('./app/api/claim/route.ts');
  assert.ok(claimRoute.indexOf('if (!offer) return null;') < claimRoute.indexOf('publicContactFor('), 'claim: only once the token matched an offer');
  const claim = src('./app/claim/[token]/page.tsx');
  assert.match(claim, /data-testid="claim-next"/);
  assert.ok(!claim.includes('—'));
});

await ok('7, 8: booking page back buttons, scroll, a taken slot, and the address with Waze', () => {
  const b = src('./app/BookingPage.jsx');
  assert.ok(b.includes('>→ חזרה לעמוד העסק</button>') && b.includes('>→ חזרה</button>'));
  assert.ok(!b.includes('← חזרה'));
  assert.equal((b.match(/letterSpacing: "0\.3px", minHeight: 44, padding: "0 4px" \}\}>→ חזרה/g) || []).length, 2);
  assert.match(b, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(b, /\}, \[step\]\);/);
  assert.match(b, /result\.code === "slot_taken"[\s\S]{0,300}setSelectedStart\(null\);[\s\S]{0,200}setStep\(2\);[\s\S]{0,120}refetchAvailability\(\);/);
  assert.match(b, /data-testid="slot-taken"/);
  // 3 for one practitioner, plus 1 for the team calendar's per-staff check (lib/team.ts pickStaff, test-team-calendar.ts).
  assert.equal((src('./app/api/book-appointment/route.js').match(/code: "slot_taken"/g) || []).length, 4);
  assert.match(b, /https:\/\/waze\.com\/ul\?q=\$\{encodeURIComponent\(addr\)\}&navigate=yes/);
  assert.match(b, /\{addr && \(\s*<div data-testid="booking-address"/);
});

await ok('1: messages center reminders', () => {
  const center = app.slice(app.indexOf('activeTab==="whatsapp"&&(()=>{'), app.indexOf('{/* Log of everything already sent'));
  assert.match(center, /return \{clientId:a\.client_id,name:a\.name,phone:cl\?\.phone,appt:a\};/);
  assert.match(center, /onClick=\{\(\)=>t\.appt\?handleSendConfirmation\(t\.appt\):waSendOne\(/, 'a reminder row goes through the confirm/cancel-link path');
  assert.match(center, /g\.key==="reminders"\?\(\s*<button data-testid="wa-reminders-next" onClick=\{\(\)=>sendNextReminder\(withPhone\)\}/);
  assert.match(center, /data-testid="wa-queue-entry" onClick=\{\(\)=>\{refreshWaQueue\(\);setShowWaQueue\(true\);\}\}/);
  assert.match(center, /הודעות מוכנות לשליחה \(\{whatsappPending\.length\}\)/);
  const confirmPath = app.slice(app.indexOf('const sendConfirmationNow = async'), app.indexOf('const handleSendAllConfirmations'));
  assert.ok(confirmPath.includes('fetchConfirmLinks(appt.id)') && confirmPath.includes('/api/reminders/handled'), 'that path has the links and the dedupe');
  const group = app.slice(app.indexOf('const waSendGroup = (items) => {'), app.indexOf('const openEditClient'));
  assert.ok(!group.includes('toast(`נפתחו ${targets.length} הודעות`)'), 'no claim that all N opened');
  assert.match(group, /if\(!waSendOne\(t\.clientId,t\.phone,t\.message\)\)break;/);
  assert.match(app, /what:"תזכורות לתורי מחר"[^\n]*run:\(\)=>\{if\(whatsappPending\.length>0\)\{refreshWaQueue\(\);setShowWaQueue\(true\);\}else setActiveTab\("whatsapp"\);\}/);
});

await ok('2, 3: My Day has a new-appointment pill and rows that open the appointment', () => {
  const card = src('./app/MyDayCard.jsx');
  assert.match(card, /onNewAppt && model\.rows\.length > 0 && \(/);
  assert.match(card, /data-testid="my-day-new-pill"/);
  assert.match(card, /data-testid="my-day-row-open" onClick=\{onOpen \? \(\) => onOpen\(r\.appt\) : undefined\}/);
  assert.match(card, /minHeight: 44, width: "100%"/);
  assert.match(app, /onNewAppt=\{openNewAppt\} onOpen=\{handleApptClick\}\/>\}/);
  assert.match(app, /data-testid="today-row-open"/);
});

await ok('4, 5: the edit sheet has the agenda actions; paid visits say so; the till lists only live visits', () => {
  const sheet = app.slice(app.indexOf('data-testid="appt-edit-actions"'), app.indexOf('data-testid="appt-edit-actions"') + 1800);
  for (const s of ['handleOpenCashier(cur)', 'sendReminderToClient(cur)', 'setSelectedClient(cl)', 'handleDelete(cur)', '₪ לתשלום', 'תזכורת', 'כרטיס לקוחה', 'ביטול התור']) assert.ok(sheet.includes(s), s);
  assert.match(sheet, /closeApptModal\(\);handleOpenCashier\(cur\);/, 'the sheet closes first');
  assert.match(app, /data-testid="client-drawer-pay"/);
  assert.match(app, /const receiptForAppt = \(a\) => \(a \? liveRcpts\.find\(r => String\(r\.appointment_id\) === String\(a\.id\)\)/);
  assert.match(app, /data-testid="agenda-paid"/);
  assert.match(app, /data-testid="agenda-open-receipt" onClick=\{stop\(\(\)=>setShowReceipt\(paidRcpt\)\)\}/);
  assert.match(app, /\{todayAppts\.filter\(a=>a\.confirmation_status!=="cancelled"&&a\.confirmation_status!==NO_SHOW\)\.map\(a=>\{\s*const client=/);
});

await ok('12: tap targets', () => {
  assert.match(src('./app/RebookNextSheet.jsx'), /style=\{\{ minWidth: 44, minHeight: 44, borderRadius: 'var\(--r-xs\)'/);
  assert.match(app, /aria-label=\{`בקשת תשלום ב\$\{pm\.key\}/);
  assert.match(app, /<button type="button" key=\{c\.id\} onClick=\{\(\)=>\{setCashierClient\(c\);setCashierSearch\(c\.name\);\}\} className="client-row" style=\{\{display:"block",width:"100%",minHeight:44/);
  assert.match(app, /<span style=\{\{display:"block",fontSize:"var\(--t-md\)",fontWeight:600,color:"var\(--ink\)"\}\}>\{c\.name\}<\/span>/);
});

await ok('copy: no em or en dashes in the new strings', () => {
  for (const s of ['נפתח וואטסאפ ל-', 'ננסה לפתוח', 'לבאה בתור', 'הודעות מוכנות לשליחה (', 'ניווט ב-Waze', 'קביעת מועד אחר', 'השעה התפנתה']) {
    const files = [app, src('./app/BookingPage.jsx'), src('./app/api/confirm/route.ts'), src('./app/confirm/page.jsx')];
    const line = files.flatMap((f) => f.split('\n')).find((l) => l.includes(s));
    assert.ok(line, `found: ${s}`);
    const strings = line!.match(/(["'`])(?:(?!\1).)*\1/g) || [];
    for (const str of strings) if (str.includes(s)) assert.ok(!/[—–]/.test(str), `${s}: ${str}`);
  }
});

console.log(`test-ux-review-2026-11-03: ${n} passed`);

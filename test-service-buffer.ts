// test-service-buffer.ts
//
// Buffer time after a treatment (lib/serviceBuffer.ts), and that every slot path applies the SAME rule:
// /api/availability (offering), the booking page, /api/book-appointment (refusing), the in-app checks and the
// rebook proposal (lib/rebookNext.js). Edges: exactly at the buffer, back-to-back, a buffer crossing closing time,
// a buffer running into lunch, personal blocks, and the "migration not run yet" state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cleanBufferMinutes, businessBufferDefault, serviceBufferMinutes, bufferLookup, bufferedRange, clashesWithBuffer,
  MAX_BUFFER_MINUTES, BUFFER_OPTIONS, SERVICE_BUFFER_PENDING_HE, SERVICE_BUFFER_LABEL_HE,
} from './lib/serviceBuffer.ts';
import { slotsBetween } from './lib/apptTime.ts';
import { freeStartsOn, proposeNextVisit } from './lib/rebookNext.js';

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); passed++; };

// ── Cleaning stored values ─────────────────────────────────────────────────
eq(cleanBufferMinutes(null), null, 'null is "no value"');
eq(cleanBufferMinutes(undefined), null, 'missing is "no value" (the column before the migration)');
eq(cleanBufferMinutes(''), null, 'an emptied field is "no value"');
eq(cleanBufferMinutes('abc'), null, 'garbage is "no value"');
eq(cleanBufferMinutes(0), 0, 'an explicit 0 is kept: it overrides a business default');
eq(cleanBufferMinutes('15'), 15, 'a string number is read');
eq(cleanBufferMinutes(14.6), 15, 'rounded');
eq(cleanBufferMinutes(-5), 0, 'never negative');
eq(cleanBufferMinutes(999), MAX_BUFFER_MINUTES, 'capped');
ok(BUFFER_OPTIONS[0] === 0, 'the Settings choices start at "none"');

// ── Business default and per-service values ────────────────────────────────
eq(businessBufferDefault(null), 0, 'no branding: 0');
eq(businessBufferDefault({}), 0, 'no booking rules: 0');
eq(businessBufferDefault({ booking_rules: { buffer_minutes: 10 } }), 10, 'the business default');
eq(businessBufferDefault({ booking_rules: { buffer_minutes: 'x' } }), 0, 'malformed default: 0');
eq(serviceBufferMinutes({ name: 'a' }, 10), 10, 'a service without its own value uses the default (migration not run)');
eq(serviceBufferMinutes({ name: 'a', buffer_minutes: null }, 10), 10, 'null uses the default');
eq(serviceBufferMinutes({ name: 'a', buffer_minutes: 0 }, 10), 0, 'an explicit 0 wins over the default');
eq(serviceBufferMinutes({ name: 'a', buffer_minutes: 20 }, 10), 20, 'its own value wins');
eq(serviceBufferMinutes(null, 0), 0, 'no service, no default: 0');

const of = bufferLookup([{ name: 'ריסים', buffer_minutes: 15 }, { name: 'לק ג׳ל', buffer_minutes: null }, { name: 'גבות', buffer_minutes: 0 }], 5);
eq(of({ service: 'ריסים' }), 15, 'lookup by service name');
eq(of({ service: ' ריסים ' }), 15, 'names are trimmed');
eq(of({ service: 'לק ג׳ל' }), 5, 'null on the row: the default');
eq(of({ service: 'גבות' }), 0, '0 on the row: none');
eq(of({ service: 'שירות שנמחק' }), 5, 'a service no longer on the menu: the default');
eq(of({ service: 'ריסים', kind: 'personal' }), 0, 'a personal block never carries a buffer');
eq(of(null), 0, 'nothing: 0');
eq(bufferLookup(null, 0)({ service: 'x' }), 0, 'no services at all, no default: 0 (a brand-new tenant)');
eq(bufferLookup([{ name: 'ריסים', buffer_minutes: 0, active: false } as any, { name: 'ריסים', buffer_minutes: 30, active: true } as any], 0)({ service: 'ריסים' }), 30, 'an archived service never hides the active one of the same name');

// ── The clash rule ─────────────────────────────────────────────────────────
// Existing 10:00-11:00 with a 15-minute buffer is busy until 11:15.
const busy = [bufferedRange(600, 660, 15)];
eq(busy[0], [600, 675], 'busy range includes the buffer');
ok(clashesWithBuffer(660, 60, 0, busy), 'right at the end of the treatment: inside the buffer, taken');
ok(clashesWithBuffer(670, 60, 0, busy), 'one minute before the buffer ends: taken');
ok(!clashesWithBuffer(675, 60, 0, busy), 'exactly when the buffer ends: free (half-open)');
// The new treatment brings its own buffer: 09:00 for 45 minutes plus 15 runs to 10:00, touching the next start.
ok(!clashesWithBuffer(540, 45, 15, busy), 'ends plus own buffer exactly at the next start: free');
ok(clashesWithBuffer(540, 50, 15, busy), 'own buffer one minute into the next appointment: taken');
// Back-to-back with no buffers anywhere is still allowed, exactly as before this feature.
ok(!clashesWithBuffer(660, 60, 0, [bufferedRange(600, 660, 0)]), 'back-to-back without buffers: free (unchanged behaviour)');
ok(clashesWithBuffer(630, 60, 0, [bufferedRange(600, 660, 0)]), 'a real overlap is still taken');

// ── Closing time: the treatment must fit, the buffer may run past it ───────
// Open 9-18, a 60-minute service with a 30-minute buffer: 17:00 is still offered.
const slots = slotsBetween(9, 18, 30, 60);
ok(slots.includes(17 * 60), 'the last slot of the day survives a buffer that crosses closing time');
ok(!clashesWithBuffer(17 * 60, 60, 30, []), 'nothing after it, nothing to clash with');
ok(!slots.includes(17 * 60 + 30), 'but the treatment itself still has to end by closing');

// ── lib/rebookNext.js: the same rule for the "קבעי לה שוב" proposal ────────
const hoursFor = (wd: number) => (wd === 6 ? null : { open: 9, close: 18 });
const day = '2026-11-10'; // a Tuesday
const appt = { date: day, start: 600, end: 660 + 15 }; // 10:00-11:00 + 15 buffer, as the sheet builds it
const starts = freeStartsOn({ date: day, duration: 60, hoursFor, busy: [appt], bufferAfter: 0 });
ok(!starts.includes(660), 'freeStartsOn: 11:00 is inside the previous buffer');
ok(starts.includes(690), 'freeStartsOn: 11:30 is free');
const startsOwn = freeStartsOn({ date: day, duration: 60, hoursFor, busy: [appt], bufferAfter: 15 });
ok(!startsOwn.includes(540), 'freeStartsOn: 09:00 + 60 + own 15 runs into 10:00');
ok(startsOwn.includes(17 * 60), 'freeStartsOn: own buffer may cross closing');
const noBuffer = freeStartsOn({ date: day, duration: 60, hoursFor, busy: [{ date: day, start: 600, end: 660 }] });
ok(noBuffer.includes(540) && noBuffer.includes(660), 'freeStartsOn without buffers: back-to-back, unchanged');
// Lunch 13:00-13:30: a 12:00 treatment with a 15-minute buffer would eat the break.
const lunch = { startMinute: 13 * 60, minutes: 30 };
ok(!freeStartsOn({ date: day, duration: 60, hoursFor, busy: [], lunch, bufferAfter: 15 }).includes(12 * 60), 'own buffer does not run into her break');
ok(freeStartsOn({ date: day, duration: 60, hoursFor, busy: [], lunch, bufferAfter: 0 }).includes(12 * 60), 'without a buffer 12:00 still fits before lunch');
const prop = proposeNextVisit({
  afterDate: '2026-10-13', anchorMinute: 660, duration: 60, intervalDays: 28, today: '2026-11-05', hoursFor,
  busy: [appt], bufferAfter: 0,
});
ok(prop && !(prop.date === day && prop.minute === 660), 'proposeNextVisit never proposes a start inside a buffer');
// Same time first (its own rule): 11:00 is free the next day, so that wins over 11:30 on the target day.
ok(prop && prop.date === '2026-11-11' && prop.minute === 660 && prop.sameTime === true, 'it keeps her usual time on the next free day: ' + JSON.stringify(prop));
const propNoBuffer = proposeNextVisit({
  afterDate: '2026-10-13', anchorMinute: 660, duration: 60, intervalDays: 28, today: '2026-11-05', hoursFor,
  busy: [{ date: day, start: 600, end: 660 }],
});
ok(propNoBuffer && propNoBuffer.date === day && propNoBuffer.minute === 660, 'without the buffer the target day at 11:00 was free (unchanged)');

// ── Every path uses it (source checks: these are client/server files that need a browser or a database) ──
const read = (p: string) => readFileSync(p, 'utf8');
const avail = read('app/api/availability/route.ts');
ok(avail.includes("const SAFE_FIELDS = 'date, start_minute, hour, duration';"), 'availability: the public column list is unchanged');
ok(/date: a\.date, start_minute: a\.start_minute, hour: a\.hour, duration: a\.duration,\s*buffer:/.test(avail), 'availability: the service name is stripped, only times and a buffer leave');
ok(avail.includes('buffers: { default: bufferDefault, byService }'), 'availability: sends the buffers the page needs');
ok(avail.includes('if (s.active === false) continue;'), 'availability: an archived service name never leaves');
const page = read('app/BookingPage.jsx');
ok(page.includes('overlaps(m, m + svcDuration + svcBuffer, bs, be)'), 'booking page: day strip applies the buffer');
ok(page.includes('overlaps(start, start + svcDuration + svcBuffer, bs, be)'), 'booking page: time grid applies the buffer');
ok(page.includes('e + (cleanBufferMinutes(a.buffer) ?? 0)'), 'booking page: busy ranges end after their buffer');
const route = read('app/api/book-appointment/route.js');
ok(route.includes('clashesWith(newStart, svcDuration, live) || clashesWithBuffer(newStart, svcDuration, svcBuffer, buffered)'), 'book-appointment: refuses a start inside a buffer');
ok(route.includes('overlapsLunch(resolveLunch(settingsRow?.branding), newStart, svcDuration + svcBuffer)'), 'book-appointment: own buffer cannot eat her break');
ok(/bookedEnd = newStart \+ svcDuration;/.test(route), 'book-appointment: closing time is checked on the treatment alone');
const app = read('app/beautyos.jsx');
ok(app.includes('const slotIsTaken = (m)=>{ const s=m, e=s+Number(newAppt.duration||0)+newApptBuffer;'), 'in-app picker: own buffer');
ok(app.includes('e+(apptBuffersApply?apptBufferOf(a):0)'), 'in-app picker: busy until the end plus the buffer');
ok(app.includes('const newEnd = newStart + Number(newAppt.duration||0) + newApptBuffer;'), 'handleSave: same rule as the picker');
ok(app.includes('const be = rawEnd + apptBufferOf(a);'), 'isFreeAt (till strip, rebook insert): busy until the end plus the buffer');
ok(app.includes('"buffer_minutes"]'), 'the service save writes buffer_minutes');
ok(app.includes('const { field, requires_deposit, buffer_minutes, ...reduced } = patch;'), 'a missing column degrades the update');
ok(app.includes('SERVICE_BUFFER_PENDING_HE'), 'and she is told the buffer waits for the update');
ok(app.includes('bufferOf={apptBufferOf}'), 'the rebook sheet gets the buffers');

// ── The migration file ─────────────────────────────────────────────────────
const sql = read('supabase/migrations/add_service_buffer_2026-11-05.sql');
ok(/add column if not exists buffer_minutes integer;/.test(sql), 'migration: nullable integer, idempotent');
ok(!/not null/i.test(sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')), 'migration: nullable (null = business default)');
ok(/STATUS: NOT RUN/.test(sql), 'migration: marked as not run');

// ── Copy ───────────────────────────────────────────────────────────────────
for (const t of [SERVICE_BUFFER_PENDING_HE, SERVICE_BUFFER_LABEL_HE]) ok(!/[–—]/.test(t), 'no en or em dashes: ' + t);
eq(SERVICE_BUFFER_LABEL_HE, 'זמן הפסקה אחרי הטיפול (דקות)', 'the label she asked for');

console.log(`service buffer: passed ${passed} failed 0`);

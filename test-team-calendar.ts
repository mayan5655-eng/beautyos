// test-team-calendar.ts
//
// The team calendar ("יומן צוות", lib/team.ts, behind NEXT_PUBLIC_TEAM_CALENDAR):
//   1. flag off: nothing renders, /api/team is a 404, the booking route and the availability route never even read the staff table
//   2. per-staff conflicts: two people can each have a client at 10:00, one person cannot be double booked (the code and the SQL)
//   3. per-staff availability: her own hours, her own appointments, the owner's break is the owner's
//   4. "לא משנה לי": whoever is free, the one with the fewest clients that day first
//   5. tenant isolation: a staff id from another business, or someone who left, is refused
//   6. one practitioner: nothing changes (team off with one active person, the page asks nothing, the route takes the old path)
//   7. before the migration: a missing table or column is "one practitioner", never an error
//   8. the report per person adds up to the month's total; nothing is ever sent to a staff member
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamCalendarEnabled } from './lib/teamFlag.ts';
import {
  normalizeStaff, sanitizeStaffInput, cleanHours, cleanServices, activeStaff, teamOn, eligibleFor, performs, staffDayHours, staffIdForWrite,
  belongsTo, staffOfAppt, sameStaff, staffSlotState, pickStaff, publicTeam, staffBusyRanges, publicEligible, publicSlotFree, teamDayWindow,
  ANY_STAFF, MAX_ACTIVE_STAFF, formDayHours, type Staff, type TeamAppt, type SlotQuery,
} from './lib/team.ts';
import { readTeam, readTeamSafe, ensureOwner, saveStaff, setStaffActive, staffTableMissing } from './lib/teamRepo.ts';
import { teamMonthReport } from './lib/teamReport.ts';
import { publicBusyRanges } from './lib/busyIntervals.ts';
import { REFERENCED_TABLES, REFERENCED_COLUMNS } from './lib/referencedTables.js';
import { RATE_POLICIES } from './lib/rateLimit.ts';

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const NOA = 'aaaaaaaa-0000-4000-8000-000000000002';
const DANA = 'aaaaaaaa-0000-4000-8000-000000000003';
const LEFT = 'aaaaaaaa-0000-4000-8000-000000000004';
const OTHER_BIZ = 'bbbbbbbb-0000-4000-8000-000000000009';

const mk = (o: Partial<Staff> & { id: string; name: string }): Staff => normalizeStaff({ color: '#7FA88E', active: true, is_owner: false, sort_order: 1, ...o })!;
const owner = mk({ id: OWNER, name: 'מאיה', is_owner: true, sort_order: 0 });
const noa = mk({ id: NOA, name: 'נועה', sort_order: 1 });
const dana = mk({ id: DANA, name: 'דנה', sort_order: 2, services: ['לק ג׳ל'], hours: { 1: { open: 12, close: 20 }, 2: null } as never });
const left = mk({ id: LEFT, name: 'שירן', active: false, sort_order: 3 });
const TEAM = [owner, noa, dana, left];

// 2026-11-16 is a Monday (weekday 1), 2026-11-17 a Tuesday.
const MON = '2026-11-16', TUE = '2026-11-17';
const SETTINGS = { business_hours: { 0: { open: 9, close: 18 }, 1: { open: 9, close: 18 }, 2: { open: 9, close: 18 }, 3: { open: 9, close: 18 }, 4: { open: 9, close: 18 }, 5: { open: 9, close: 13 }, 6: null } };
const q = (over: Partial<SlotQuery> = {}): SlotQuery => ({ settings: SETTINGS as never, date: MON, start: 600, duration: 60, buffer: 0, appointments: [], bufferOf: () => 0, lunch: null, ...over });
const appt = (o: Partial<TeamAppt>): TeamAppt => ({ date: MON, start_minute: 600, duration: 60, confirmation_status: 'confirmed', ...o });

// ── 1. the flag ─────────────────────────────────────────────────────────────
await ok('flag: on only for 1 or true; the test runner and .env.example keep it empty', () => {
  for (const v of ['', undefined, '0', 'false', 'off', 'yes']) assert.equal(teamCalendarEnabled({ NEXT_PUBLIC_TEAM_CALENDAR: v }), false, String(v));
  for (const v of ['1', 'true', ' TRUE ']) assert.equal(teamCalendarEnabled({ NEXT_PUBLIC_TEAM_CALENDAR: v }), true, v);
  assert.equal(teamCalendarEnabled(), false, 'the runner sets it empty');
  assert.match(read('scripts/run-tests.mjs'), /NEXT_PUBLIC_TEAM_CALENDAR: ''/);
  assert.match(read('.env.example'), /^NEXT_PUBLIC_TEAM_CALENDAR=$/m);
});

await ok('flag off: /api/team is a 404 for every method, before any session or database work', () => {
  const src = read('app/api/team/route.ts');
  const gets = src.split('export async function ').slice(1);
  assert.equal(gets.length, 2);
  for (const fn of gets) assert.match(fn, /^\w+\(request: Request\) \{\n  if \(!teamCalendarEnabled\(\)\) return notFound\(\);/, fn.slice(0, 40));
  assert.match(src, /status: 404/);
});

await ok('flag off: nothing renders (settings card, hook, calendar, report) and the public routes never read staff', () => {
  const card = read('app/TeamSettings.jsx');
  assert.match(card, /if \(!team\.enabled \|\| !team\.available\) return null;/, 'the card renders nothing without the flag or before the migration');
  const hook = read('app/useTeam.js');
  assert.match(hook, /const enabled = teamCalendarEnabled\(\) && !skip;/);
  assert.match(hook, /if \(!enabled\) return;\n    try \{\n      const r = await fetch\("\/api\/team"/, 'the hook never asks the server with the flag off');
  const app = read('app/beautyos.jsx');
  assert.match(app, /const teamCal = team\.on === true;/);
  assert.match(app, /\{teamCal&&\(\n <div data-testid="staff-filter"/, 'the filter only in team mode');
  assert.match(app, /\{teamCal&&\(\(\)=>\{\n                const opts=teamActiveStaff/, 'the picker only in team mode');
  assert.match(app, /\{inG\("booking"\)&&team\.enabled&&\(<TeamSettings /, 'the settings card only with the flag');
  assert.match(app, /\{teamCal&&historyReady&&<TeamReport /, 'the report only in team mode');
  assert.match(app, /const apptStaffWrite = \(\) => \(teamCal \? \{ staff_id: staffIdForWrite\(.*\) \} : \{\}\);/, 'no staff_id is written without the team');
  const book = read('app/api/book-appointment/route.js');
  assert.match(book, /let team = \[\];\n    if \(teamCalendarEnabled\(\)\) \{\n      const t = await readTeamSafe\(supabase, activeTenantId\);/);
  const avail = read('app/api/availability/route.ts');
  assert.match(avail, /let team: Staff\[\] = \[\];\n    if \(teamCalendarEnabled\(\)\) \{/);
  assert.match(avail, /if \(!team\.length\) return Response\.json\(\{ success: true, busy, defaultBuffer: bufferDefault \}\);/, 'the old answer, byte for byte');
  const page = read('app/BookingPage.jsx');
  assert.match(page, /const askWho = teamForSvc\.length >= 2;/);
  assert.match(page, /\.\.\.\(team \? \{ staffId: pickedStaff \? pickedStaff\.id : ANY_STAFF \} : \{\}\),/, 'no staffId is sent for one practitioner');
});

// ── the model ───────────────────────────────────────────────────────────────
await ok('staff rows and her input are cleaned; nothing bad survives', () => {
  assert.equal(normalizeStaff({ id: '', name: 'x' }), null);
  assert.equal(normalizeStaff({ id: NOA, name: '   ' }), null);
  assert.equal(normalizeStaff({ id: NOA, name: 'נועה', color: 'red' })!.color, '#E9A9A1');
  assert.deepEqual(cleanHours({ 0: { open: 9, close: 18 }, 1: null, 2: { open: 18, close: 9 }, 3: { open: 9.5, close: 12 }, 9: { open: 1, close: 2 } }), { 0: { open: 9, close: 18 }, 1: null });
  assert.equal(cleanHours({}), null);
  assert.equal(cleanServices([]), null, 'an empty list means all, never nothing');
  assert.deepEqual(cleanServices([' גבות ', 'גבות', 'לק']), ['גבות', 'לק']);
  assert.deepEqual(sanitizeStaffInput({ name: '' }), { ok: false, error: 'חסר שם' });
  assert.equal(sanitizeStaffInput({ name: 'א'.repeat(41) }).ok, false);
  const s = sanitizeStaffInput({ name: ' נועה\u0000 ', color: '#123456', hours: { 1: { open: 10, close: 14 } }, services: ['גבות'] });
  assert.deepEqual(s, { ok: true, value: { name: 'נועה', color: '#123456', hours: { 1: { open: 10, close: 14 } }, services: ['גבות'] } });
});

await ok('the team is on only with two or more ACTIVE people; the owner first', () => {
  assert.equal(teamOn([]), false);
  assert.equal(teamOn([owner]), false, 'one person: nothing changes');
  assert.equal(teamOn([owner, left]), false, 'someone who left does not count');
  assert.equal(teamOn([owner, noa]), true);
  assert.deepEqual(activeStaff(TEAM).map((s) => s.id), [OWNER, NOA, DANA]);
  assert.deepEqual(eligibleFor(TEAM, 'גבות').map((s) => s.id), [OWNER, NOA], 'Dana only does gel');
  assert.deepEqual(eligibleFor(TEAM, 'לק ג׳ל').map((s) => s.id), [OWNER, NOA, DANA]);
  assert.equal(performs(left, 'גבות'), true);
});

await ok('NULL means the owner: old appointments are hers, her own writes are NULL', () => {
  assert.equal(staffIdForWrite(owner), null);
  assert.equal(staffIdForWrite(noa), NOA);
  assert.equal(staffIdForWrite(null), null);
  assert.equal(belongsTo({ staff_id: null }, owner), true);
  assert.equal(belongsTo({}, owner), true, 'a row from before the column existed');
  assert.equal(belongsTo({ staff_id: OWNER }, owner), true);
  assert.equal(belongsTo({ staff_id: null }, noa), false);
  assert.equal(belongsTo({ staff_id: NOA }, noa), true);
  assert.equal(staffOfAppt({ staff_id: null }, TEAM)!.id, OWNER);
  assert.equal(staffOfAppt({ staff_id: LEFT }, TEAM)!.name, 'שירן', 'someone who left keeps her name on her appointments');
  assert.equal(sameStaff({ staff_id: null }, OWNER, TEAM), true);
  assert.equal(sameStaff({ staff_id: NOA }, OWNER, TEAM), false);
  assert.equal(sameStaff({ staff_id: NOA }, NOA, TEAM), true);
});

// ── 2. per-staff conflicts ─────────────────────────────────────────────────
await ok('per-staff conflicts: two people at 10:00 is fine, the same person twice is not', () => {
  const day = [appt({ staff_id: null })]; // the owner at 10:00
  assert.equal(staffSlotState(owner, q({ appointments: day })), 'taken');
  assert.equal(staffSlotState(noa, q({ appointments: day })), 'ok', 'Noa is free while the owner works');
  const both = [...day, appt({ staff_id: NOA, start_minute: 630, duration: 30 })];
  assert.equal(staffSlotState(noa, q({ appointments: both })), 'taken', 'Noa already has 10:30');
  assert.equal(staffSlotState(noa, q({ appointments: both, start: 660 })), 'ok', 'back to back is not a clash');
  // her buffer and the booking's own buffer, per person
  assert.equal(staffSlotState(noa, q({ appointments: both, start: 660, bufferOf: () => 15 })), 'taken', 'inside Noa’s buffer');
  assert.equal(staffSlotState(owner, q({ appointments: both, start: 660, bufferOf: () => 15 })), 'taken', 'the owner’s own buffer, until 11:15');
  assert.equal(staffSlotState(noa, q({ appointments: both, start: 675, bufferOf: () => 15 })), 'ok', 'after Noa’s buffer');
});
await ok('per-staff conflicts: the owner calendar checks the same person only', () => {
  const app = read('app/beautyos.jsx');
  assert.match(app, /a\.id!==editingAppointmentId && \(!teamCal \|\| sameStaff\(a, apptStaff, team\.staff\)\)\)/, 'the picker’s busy times');
  assert.equal((app.match(/if\(teamCal && !sameStaff\(a, apptStaff, team\.staff\)\) return false;/g) || []).length, 2, 'the save check and the series check');
});
await ok('per-staff conflicts: the database guarantees become per person, existing rows checked as before', () => {
  const sql = read('supabase/migrations/add_team_calendar_2026-11-12.sql');
  assert.match(sql, /create unique index if not exists uniq_appt_slot_active\n  on public\.appointments \(tenant_id, \(coalesce\(staff_id, '00000000-0000-0000-0000-000000000000'::uuid\)\), date, start_minute\)\n  where confirmation_status <> 'cancelled';/);
  assert.match(sql, /tenant_id with =,\n      \(coalesce\(staff_id, '00000000-0000-0000-0000-000000000000'::uuid\)\) with =,\n      date with =,/);
  assert.match(sql, /int4range\(start_minute, start_minute \+ duration \+ coalesce\(buffer_minutes, 0\)\)/, 'the buffer stays part of it');
  assert.match(sql, /where \(coalesce\(confirmation_status, ''\) <> 'cancelled'\);/);
  // The owner is ONE value in those keys: her row's id is stored as NULL.
  assert.match(sql, /if s\.is_owner then\n    new\.staff_id := null;/);
});

// An in-memory model of the two constraints, keyed exactly like the SQL.
await ok('per-staff conflicts: the constraint model refuses the same person twice and allows two people', () => {
  const zero = '00000000-0000-0000-0000-000000000000';
  const rows: TeamAppt[] = [];
  const insert = (a: TeamAppt & { tenant_id: string }) => {
    const key = (r: TeamAppt & { tenant_id?: string }) => `${r.tenant_id}|${r.staff_id ?? zero}|${r.date}`;
    const s = Number(a.start_minute), e = s + Number(a.duration);
    for (const r of rows as Array<TeamAppt & { tenant_id: string }>) {
      if (key(r) !== key(a) || r.confirmation_status === 'cancelled') continue;
      if (s < Number(r.start_minute) + Number(r.duration) && Number(r.start_minute) < e) return '23P01';
    }
    rows.push(a); return 'ok';
  };
  assert.equal(insert({ ...appt({ staff_id: null }), tenant_id: T1 }), 'ok');
  assert.equal(insert({ ...appt({ staff_id: NOA }), tenant_id: T1 }), 'ok', 'Noa at the same 10:00');
  assert.equal(insert({ ...appt({ staff_id: NOA, start_minute: 630 }), tenant_id: T1 }), '23P01', 'Noa twice');
  assert.equal(insert({ ...appt({ staff_id: null, start_minute: 630 }), tenant_id: T1 }), '23P01', 'the owner twice');
  assert.equal(insert({ ...appt({ staff_id: null }), tenant_id: T2 }), 'ok', 'another business');
});

// ── 3. per-staff availability ──────────────────────────────────────────────
await ok('per-staff availability: her own hours replace the business hours, day by day', () => {
  assert.deepEqual(staffDayHours(dana, SETTINGS as never, 1), { open: 12, close: 20 }, 'Dana works Monday 12 to 20');
  assert.equal(staffDayHours(dana, SETTINGS as never, 2), null, 'and not on Tuesday');
  assert.deepEqual(staffDayHours(dana, SETTINGS as never, 3), { open: 9, close: 18 }, 'other days: the business hours');
  assert.deepEqual(staffDayHours(noa, SETTINGS as never, 5), { open: 9, close: 13 });
  assert.equal(staffSlotState(dana, q({ start: 600 })), 'outside', '10:00 is before Dana starts');
  assert.equal(staffSlotState(dana, q({ start: 1140 })), 'ok', '19:00 is after the business closes but inside Dana’s hours');
  assert.equal(staffSlotState(dana, q({ date: TUE })), 'closed');
  assert.equal(staffSlotState(owner, q({ start: 1140 })), 'outside');
});
await ok('per-staff availability: the owner’s break blocks the owner only', () => {
  const lunch = { startMinute: 780, minutes: 30 };
  assert.equal(staffSlotState(owner, q({ start: 750, lunch })), 'taken');
  assert.equal(staffSlotState(noa, q({ start: 750, lunch })), 'ok');
});
await ok('per-staff availability: the public answer is per person, merged, with nothing extra', () => {
  const rows = [appt({ staff_id: null, service: 'גבות' }), appt({ staff_id: NOA, start_minute: 720, service: 'לק' })];
  const lunchRow = [{ date: MON, start_minute: 780, duration: 30 }];
  const busy = staffBusyRanges(rows, TEAM, () => 10, lunchRow);
  assert.deepEqual(Object.keys(busy).sort(), [OWNER, NOA, DANA].sort(), 'nobody who left');
  assert.deepEqual(busy[OWNER], [{ date: MON, start: 600, end: 670 }, { date: MON, start: 780, end: 810 }]);
  assert.deepEqual(busy[NOA], [{ date: MON, start: 720, end: 790 }]);
  assert.deepEqual(busy[DANA], []);
  for (const list of Object.values(busy)) for (const r of list) assert.deepEqual(Object.keys(r).sort(), ['date', 'end', 'start'], 'only { date, start, end } leaves');
  const team = publicTeam(TEAM, SETTINGS as never);
  assert.deepEqual(team.map((s) => s.id), [OWNER, NOA, DANA]);
  assert.deepEqual(Object.keys(team[0]).sort(), ['color', 'hours', 'id', 'name', 'services']);
  assert.deepEqual(team[2].hours[1], { open: 12, close: 20 });
});
await ok('per-staff availability: the public page offers a time when the chosen person, or anyone for "לא משנה לי", is free', () => {
  const team = publicTeam(TEAM, SETTINGS as never);
  const busy = staffBusyRanges([appt({ staff_id: null })], TEAM, () => 0);
  const [o, nn, d] = team;
  assert.equal(publicSlotFree(o, busy[OWNER], MON, 600, 60, 0), false);
  assert.equal(publicSlotFree(nn, busy[NOA], MON, 600, 60, 0), true);
  assert.equal(publicSlotFree(d, busy[DANA], MON, 600, 60, 0), false, 'before her hours');
  assert.deepEqual(publicEligible(team, 'גבות').map((s) => s.id), [OWNER, NOA]);
  assert.deepEqual(teamDayWindow([o, d], 1), { open: 9, close: 20 }, 'the widest hours anyone works that day');
  assert.equal(teamDayWindow([d], 2), null);
});

await ok('the owner form checks the picked person’s own hours, the same rule as the booking route', () => {
  // Rinat works Saturday, when the business is closed; Dana is off on Tuesday, when the business is open.
  const rinat = mk({ id: 'aaaaaaaa-0000-4000-8000-000000000005', name: 'רינת', sort_order: 4, hours: { 6: { open: 10, close: 16 } } as never });
  const team = { on: true, staff: [owner, noa, dana, rinat] };
  assert.equal(formDayHours({ on: false, staff: [] }, null, SETTINGS as never, 6), null, 'no team: business hours, closed Saturday');
  assert.deepEqual(formDayHours(team, rinat.id, SETTINGS as never, 6), { open: 10, close: 16 }, 'Rinat on Saturday: bookable');
  assert.equal(formDayHours(team, DANA, SETTINGS as never, 2), null, 'Dana off on Tuesday');
  assert.deepEqual(formDayHours(team, DANA, SETTINGS as never, 1), { open: 12, close: 20 });
  assert.deepEqual(formDayHours(team, NOA, SETTINGS as never, 3), { open: 9, close: 18 }, 'no own hours: the business hours');
  assert.equal(formDayHours(team, null, SETTINGS as never, 6), null, 'nobody picked: the owner');
  assert.equal(formDayHours(team, OTHER_BIZ, SETTINGS as never, 6), null, 'an unknown id: the owner');
  // The server agrees: the same person, the same day.
  const sat = '2026-11-21';
  assert.equal(staffSlotState(rinat, q({ date: sat, start: 660 })), 'ok');
  assert.equal(staffSlotState(owner, q({ date: sat, start: 660 })), 'closed');
  assert.equal(staffSlotState(dana, q({ date: TUE, start: 660 })), 'closed');
  const app = read('app/beautyos.jsx');
  assert.match(app, /const apptDayHours = teamCal \? formDayHours\(team, apptStaff, settings, apptDay\) : dayHoursFrom\(settings, apptDay\);/, 'the form uses it');
  assert.match(read('app/api/book-appointment/route.js'), /const pick = pickStaff\(candidates, requestedStaff, \{\n        settings: settingsRow,/, 'the route resolves hours per person through pickStaff');
});

// ── 4. "first available" ───────────────────────────────────────────────────
await ok('"לא משנה לי": the free person with the fewest clients that day', () => {
  const day = [
    appt({ staff_id: null, start_minute: 540 }), appt({ staff_id: null, start_minute: 720 }), // the owner: 2 clients
    appt({ staff_id: NOA, start_minute: 840 }),                                             // Noa: 1 client
  ];
  const r = pickStaff(eligibleFor(TEAM, 'גבות'), ANY_STAFF, q({ appointments: day, start: 660 }));
  assert.ok(r.ok && r.staff.id === NOA && r.auto, 'Noa has fewer clients');
  const r2 = pickStaff(eligibleFor(TEAM, 'גבות'), undefined, q({ appointments: day, start: 540 }));
  assert.ok(r2.ok && r2.staff.id === NOA, 'the owner is busy at 9:00; nothing sent means "לא משנה לי"');
  const tie = pickStaff(eligibleFor(TEAM, 'גבות'), ANY_STAFF, q({ appointments: [], start: 600 }));
  assert.ok(tie.ok && tie.staff.id === OWNER, 'a tie: the owner first, then her order');
  const cancelled = [appt({ staff_id: null, start_minute: 540, confirmation_status: 'cancelled' }), appt({ staff_id: null, start_minute: 900, kind: 'personal' })];
  const c = pickStaff([owner, noa], ANY_STAFF, q({ appointments: [...cancelled, appt({ staff_id: NOA, start_minute: 900 })], start: 600 }));
  assert.ok(c.ok && c.staff.id === OWNER, 'a cancellation and her own block are not clients');
  const none = pickStaff([owner, noa], ANY_STAFF, q({ appointments: [appt({ staff_id: null }), appt({ staff_id: NOA })] }));
  assert.deepEqual(none, { ok: false, reason: 'taken' });
  assert.deepEqual(pickStaff([owner, noa], ANY_STAFF, q({ date: '2026-11-21' })), { ok: false, reason: 'closed' }, 'Saturday');
  assert.deepEqual(pickStaff([owner, noa], ANY_STAFF, q({ start: 1110 })), { ok: false, reason: 'outside' });
});
await ok('a named person: booked with her when free, refused when busy', () => {
  const day = [appt({ staff_id: NOA })];
  assert.deepEqual(pickStaff([owner, noa], NOA, q({ appointments: day })), { ok: false, reason: 'taken' });
  const r = pickStaff([owner, noa], OWNER, q({ appointments: day }));
  assert.ok(r.ok && r.staff.id === OWNER && !r.auto);
});

// ── 5. tenant isolation and inactive staff ─────────────────────────────────
await ok('a staff id from another business, someone who left, or garbage is refused', () => {
  const eligible = eligibleFor(TEAM, 'גבות');
  assert.deepEqual(pickStaff(eligible, OTHER_BIZ, q()), { ok: false, reason: 'unknown_staff' }, 'another business');
  assert.deepEqual(pickStaff(eligible, LEFT, q()), { ok: false, reason: 'unknown_staff' }, 'inactive');
  assert.deepEqual(pickStaff(eligible, DANA, q({ start: 780 })), { ok: false, reason: 'unknown_staff' }, 'does not do this treatment');
  assert.deepEqual(pickStaff(eligible, "x' or 1=1", q()), { ok: false, reason: 'unknown_staff' });
  assert.deepEqual(pickStaff(eligible, { id: NOA }, q()), { ok: false, reason: 'unknown_staff' });
  // Even a list that wrongly held someone inactive never books her.
  assert.deepEqual(pickStaff([owner, left], LEFT, q()), { ok: false, reason: 'unknown_staff' });
});
await ok('tenant isolation: the route reads staff of THIS business only, and the database refuses a cross-business staff id', () => {
  const book = read('app/api/book-appointment/route.js');
  assert.match(book, /const t = await readTeamSafe\(supabase, activeTenantId\);\n      if \(t\.available && teamOn\(t\.staff\)\) team = t\.staff;/);
  assert.match(book, /const candidates = teamMode \? \(eligibleFor\(team, service\)\.length \? eligibleFor\(team, service\) : activeStaff\(team\)\) : \[\];/);
  assert.match(book, /const pick = pickStaff\(candidates, requestedStaff, \{/);
  assert.match(book, /code: "staff_unavailable"/);
  assert.match(book, /\.\.\.\(chosenStaff \? \{ staff_id: staffIdForWrite\(chosenStaff\) \} : \{\}\),/);
  const sql = read('supabase/migrations/add_team_calendar_2026-11-12.sql');
  assert.match(sql, /foreign key \(tenant_id, staff_id\) references public\.staff_members \(tenant_id, id\);/, 'composite key: her own business only');
  assert.match(sql, /if not s\.active and \(tg_op = 'INSERT' or new\.staff_id is distinct from old\.staff_id\) then/, 'no NEW appointment for someone who left');
  const route = read('app/api/team/route.ts');
  assert.match(route, /const tenantId = await callerTenantId\(session\);/, 'the session’s business, never the body’s');
  assert.ok(!/body\.tenantId|body\.tenant_id/.test(route));
});

// A fake service-role client with the query shapes lib/teamRepo.ts uses.
function fakeDb(init: Array<Record<string, unknown>>, opts: { missing?: boolean; fail?: boolean } = {}) {
  const rows = init.map((r) => ({ ...r }));
  let seq = 100;
  const from = (table: string) => {
    assert.equal(table, 'staff_members');
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const run = () => {
      if (opts.missing) return { data: null, error: { code: '42P01', message: 'relation "public.staff_members" does not exist' } };
      if (opts.fail) return { data: null, error: { code: '57014', message: 'timeout' } };
      const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v);
      if (op === 'insert') {
        if (payload.is_owner && rows.some((r) => r.tenant_id === payload.tenant_id && r.is_owner)) return { data: null, error: { code: '23505', message: 'duplicate' } };
        rows.push({ id: `cccccccc-0000-4000-8000-${String(++seq).padStart(12, '0')}`, active: true, is_owner: false, sort_order: 0, ...payload });
        return { data: null, error: null };
      }
      if (op === 'update') { for (const r of rows) if (match(r)) Object.assign(r, payload); return { data: null, error: null }; }
      return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
      insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return chain; },
      update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return chain; },
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  };
  return { db: { from }, rows };
}

await ok('tenant isolation: the repository reads, adds and changes only her own rows', async () => {
  const { db, rows } = fakeDb([
    { id: OWNER, tenant_id: T1, name: 'מאיה', is_owner: true, active: true, sort_order: 0 },
    { id: OTHER_BIZ, tenant_id: T2, name: 'זרה', is_owner: false, active: true, sort_order: 1 },
  ]);
  const t = await readTeam(db, T1);
  assert.deepEqual(t.staff.map((s) => s.id), [OWNER]);
  const r = await saveStaff(db, T1, OTHER_BIZ, { name: 'חטיפה', color: '#123456', hours: null, services: null });
  assert.deepEqual(r, { ok: false, error: 'לא מצאנו את אשת הצוות הזו', status: 404 });
  assert.equal(rows.find((x) => x.id === OTHER_BIZ)!.name, 'זרה', 'the other business’s row is untouched');
  assert.deepEqual(await setStaffActive(db, T1, OTHER_BIZ, false), { ok: false, error: 'לא מצאנו את אשת הצוות הזו', status: 404 });
  const added = await saveStaff(db, T1, null, { name: 'נועה', color: '#7FA88E', hours: null, services: ['גבות'] });
  assert.ok(added.ok && added.staff.length === 2);
  const newRow = rows.find((x) => x.name === 'נועה')!;
  assert.equal(newRow.tenant_id, T1);
  assert.deepEqual(await setStaffActive(db, T1, OWNER, false), { ok: false, error: 'את תמיד פעילה ביומן', status: 400 });
  const off = await setStaffActive(db, T1, String(newRow.id), false);
  assert.ok(off.ok);
  assert.equal(rows.length, 3, 'deactivated, never deleted');
  assert.equal(newRow.active, false);
});
await ok('the owner row is made on first use, once, named as in her settings', async () => {
  const { db, rows } = fakeDb([]);
  const t0 = await readTeam(db, T1);
  const t1 = await ensureOwner(db, T1, t0, { therapist_name: 'מאיה', primary_color: '#AA5577' });
  assert.equal(t1.staff.length, 1);
  assert.ok(t1.staff[0].is_owner && t1.staff[0].name === 'מאיה' && t1.staff[0].color === '#AA5577');
  await ensureOwner(db, T1, t0, null); // a second tab with a stale read: the unique index refuses, the row is read again
  assert.equal(rows.filter((r) => r.is_owner).length, 1);
  const { db: db2 } = fakeDb([]);
  const t2 = await ensureOwner(db2, T1, await readTeam(db2, T1), { therapist_name: '' });
  assert.equal(t2.staff[0].name, 'אני');
});
await ok('a limit on active staff', async () => {
  const many = Array.from({ length: MAX_ACTIVE_STAFF }, (_, i) => ({ id: `dddddddd-0000-4000-8000-00000000000${i}`, tenant_id: T1, name: `א${i}`, is_owner: i === 0, active: true, sort_order: i }));
  const { db } = fakeDb(many);
  const r = await saveStaff(db, T1, null, { name: 'עוד', color: '#7FA88E', hours: null, services: null });
  assert.equal(r.ok, false);
});

// ── 6. one practitioner: nothing changes ───────────────────────────────────
await ok('single staff: the route takes the old path, the page asks nothing, the availability answer is the old one', () => {
  assert.equal(teamOn([owner]), false);
  const book = read('app/api/book-appointment/route.js');
  // The old checks run unchanged when there is no team.
  assert.match(book, /if \(!teamMode\) \{\n      \/\/ Midday, not midnight/);
  assert.match(book, /if \(!teamMode && overlapsLunch\(resolveLunch\(settingsRow\?\.branding\), newStart, svcDuration \+ svcBuffer\)\) \{/);
  assert.match(book, /\/\/    the in-app overlap guard \(cancelled appointments free their slot\)\.\n    if \(!teamMode\) \{/);
  assert.match(book, /readSameDayAppointments\(supabase, activeTenantId, date, team\.length > 0\)/, 'staff_id is not even asked for');
  const page = read('app/BookingPage.jsx');
  assert.match(page, /if \(staff\.length < 2\) return null;/, 'a team of one is no team on the page');
  assert.match(page, /const freeAt = \(ds, m\) => \(teamPool\n    \? .*\n    : !busyOn\(ds\)\.some\(\(\[bs, be\]\) => overlaps\(m, m \+ svcDuration \+ svcBuffer, bs, be\)\)\);/, 'the old test without a team');
  assert.match(page, /const dayWindow = \(d\) => \(teamPool \? teamDayWindow\(teamPool, d\.getDay\(\)\) : dayHoursFrom\(settings, d\.getDay\(\)\)\);/);
  // With one person the per-person busy list is exactly the business busy list.
  const rows = [appt({}), appt({ start_minute: 720 })];
  assert.deepEqual(staffBusyRanges(rows, [owner, noa], () => 5)[OWNER], publicBusyRanges(rows, () => 5));
});

// ── 7. before the migration ────────────────────────────────────────────────
await ok('missing table: "one practitioner", never an error', async () => {
  const { db } = fakeDb([], { missing: true });
  assert.deepEqual(await readTeam(db, T1), { available: false, staff: [] });
  assert.deepEqual(await readTeamSafe(db, T1), { available: false, staff: [] });
  assert.deepEqual(await ensureOwner(db, T1, { available: false, staff: [] }, null), { available: false, staff: [] }, 'no write is tried');
  assert.equal((await saveStaff(db, T1, null, { name: 'נועה', color: '#7FA88E', hours: null, services: null })).ok, false);
  const { db: broken } = fakeDb([], { fail: true });
  await assert.rejects(() => readTeam(broken, T1), 'the owner screen sees a real failure');
  assert.deepEqual(await readTeamSafe(broken, T1), { available: false, staff: [] }, 'a public booking never does');
  for (const e of [{ code: '42P01' }, { code: 'PGRST205' }, { code: '42703', message: 'column appointments.staff_id does not exist' }, { message: 'Could not find the table public.staff_members in the schema cache' }]) assert.equal(staffTableMissing(e), true, JSON.stringify(e));
  assert.equal(staffTableMissing({ code: '57014', message: 'timeout' }), false);
});
await ok('missing column: the routes fall back to one practitioner when staff_id cannot be read', () => {
  const book = read('app/api/book-appointment/route.js');
  assert.match(book, /return \{ \.\.\.res, staffRead: optional\.includes\("staff_id"\) \};/);
  assert.match(book, /if \(team\.length && !staffRead\) team = \[\];/);
  const avail = read('app/api/availability/route.ts');
  assert.match(avail, /if \(!serverCols\.includes\('staff_id'\)\) team = \[\];/);
  const hook = read('app/useTeam.js');
  assert.match(hook, /if \(!j \|\| j\.success !== true \|\| j\.available !== true \|\| !Array\.isArray\(j\.staff\)\) return \{ \.\.\.OFF, loaded: true \};/);
  const route = read('app/api/team/route.ts');
  assert.match(route, /if \(!team\.available\) return NextResponse\.json\(\{ success: true, available: false, on: false, staff: \[\] \}\);/);
});

// ── 8. report, messages, wiring ────────────────────────────────────────────
await ok('the report per person adds up to the month: unlinked payments are the owner’s', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const appts = [
    { id: 'a1', date: '2026-11-03', staff_id: null, confirmation_status: 'confirmed' },
    { id: 'a2', date: '2026-11-04', staff_id: NOA, confirmation_status: 'confirmed' },
    { id: 'a3', date: '2026-11-05', staff_id: NOA, confirmation_status: 'no_show' },
    { id: 'a4', date: '2026-11-06', staff_id: NOA, confirmation_status: 'cancelled' },
    { id: 'a5', date: '2026-11-25', staff_id: NOA, confirmation_status: 'confirmed' },  // ahead: not a visit yet
    { id: 'a6', date: '2026-10-30', staff_id: NOA, confirmation_status: 'confirmed' },  // last month
    { id: 'a7', date: '2026-11-07', staff_id: null, kind: 'personal' },
  ];
  const receipts = [
    { amount: 200, created_at: '2026-11-03T09:00:00Z', appointment_id: 'a1' },
    { amount: 300, created_at: '2026-11-04T09:00:00Z', appointment_id: 'a2' },
    { amount: 50, created_at: '2026-11-10T09:00:00Z', appointment_id: null },   // a product at the till
    { amount: 999, created_at: '2026-10-30T09:00:00Z', appointment_id: 'a6' },  // last month
  ];
  const rows = teamMonthReport({ staff: [owner, noa, left], appointments: appts, receipts, now });
  assert.deepEqual(rows.map((r) => [r.name, r.visits, r.income]), [['מאיה', 1, 250], ['נועה', 1, 300]], 'nobody who left with nothing this month');
  assert.equal(rows.reduce((s, r) => s + r.income, 0), 550, 'the rows add up to the month');
  const net = teamMonthReport({ staff: [owner, noa], appointments: appts, receipts, now, net: (g) => g / 1.18 });
  assert.equal(net[1].income, Math.round(300 / 1.18), 'net of VAT like the report above it');
});
await ok('nothing is ever sent to a staff member, and nothing new is sent to clients', () => {
  for (const f of ['lib/team.ts', 'lib/teamRepo.ts', 'lib/teamReport.ts', 'app/api/team/route.ts', 'app/TeamSettings.jsx', 'app/useTeam.js', 'app/TeamReport.jsx']) {
    const s = read(f);
    assert.ok(!/sendWhatsApp|notifyOwner|greenApi|queueIntakeMessage|sendBookingNotifications/.test(s), `${f} sends nothing`);
  }
  const book = read('app/api/book-appointment/route.js');
  assert.equal((book.match(/sendBookingNotifications\(\{/g) || []).length, 1, 'the one confirmation, as before');
  assert.ok(!/staff/.test(book.slice(book.indexOf('sendBookingNotifications({'), book.indexOf('sendBookingNotifications({') + 400)), 'its arguments are unchanged');
});
await ok('wiring: referenced tables, rate limit, i18n files, migration verify queries, no deletes', () => {
  assert.ok((REFERENCED_TABLES as string[]).includes('staff_members'));
  assert.ok((REFERENCED_COLUMNS as Record<string, string[]>).staff_members.includes('is_owner'));
  assert.ok('team' in RATE_POLICIES);
  const extract = read('scripts/i18n-extract.mjs');
  assert.match(extract, /'app\/TeamSettings\.jsx',\n      'app\/TeamReport\.jsx',/);
  const sql = read('supabase/migrations/add_team_calendar_2026-11-12.sql');
  assert.match(sql, /── VERIFY/);
  assert.ok(!/\bdelete from\b|\bdrop table\b|\btruncate\b/i.test(sql), 'the migration deletes nothing');
  assert.match(sql, /revoke all on public\.staff_members from anon, authenticated;\ngrant select on public\.staff_members to authenticated;/, 'no browser writes');
  assert.match(sql, /staff_members_require_active_insert/, 'the trial gate');
  for (const f of ['lib/teamRepo.ts', 'app/api/team/route.ts']) assert.ok(!/\.delete\(/.test(read(f)), `${f} never deletes`);
});
await ok('copy: no dashes, never "קבלה", feminine to her', () => {
  for (const f of ['app/TeamSettings.jsx', 'app/TeamReport.jsx', 'lib/teamRepo.ts', 'app/api/team/route.ts']) {
    const s = read(f);
    const heb = (s.match(/"[^"\n]*[֐-׿][^"\n]*"|'[^'\n]*[֐-׿][^'\n]*'|`[^`\n]*[֐-׿][^`\n]*`/g) || []).join('\n');
    assert.ok(!/[–—]/.test(heb), `${f}: no en or em dash in copy`);
    assert.ok(!/קבלה/.test(heb), `${f}: never קבלה`);
  }
  const card = read('app/TeamSettings.jsx');
  assert.match(card, /סמני לפחות טיפול אחד/);
});

console.log(`team calendar: passed ${n} failed 0`);

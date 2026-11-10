// test-import-from-system.ts
//
// "מעבר מתוכנה אחרת" (lib/importFile.ts, app/api/import-file/route.ts, app/ImportFromSystem.jsx):
//   * column auto-mapping from Hebrew and English headers, presets only nudging the guess
//   * dedupe by normalised Israeli phone, against her clients and inside the file
//   * past appointments skipped (including earlier today), cancelled ones skipped
//   * conflicts with her calendar (and inside the file) reported by row, never imported
//   * idempotent: the same file twice adds nothing the second time
//   * no notifications: the route imports no sender, makes no network call, writes only clients / service_prices / appointments
//   * tenant from the session only, preview writes nothing, import needs confirm=yes
//   * flag off: the component renders nothing and the route answers 404
// The real route handler runs through testkit/aliasLoader.mjs against an in-memory database. No network, no real tenant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import {
  autoMapHeaders, cleanMapping, buildImportPlan, phoneOf, parseFileDate, parseFileTime, detectDateOrder, importToolEnabled,
  planHeadlineHe, israelClock, normalizeHeader, type ExistingData, type PlanOptions, type FileField,
} from './lib/importFile.ts';
import { RATE_POLICIES } from './lib/rateLimit.ts';

register('./testkit/aliasLoader.mjs', import.meta.url);

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// ── dates relative to the real clock, in Israel time (the route uses israelClock too) ──
const clock = israelClock();
const addDays = (iso: string, d: number) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const TOMORROW = addDays(clock.today, 1);
const IN_3 = addDays(clock.today, 3);
const YESTERDAY = addDays(clock.today, -1);

const baseOpts = (o: Partial<PlanOptions> = {}): PlanOptions => ({ clients: true, services: false, appts: false, dateOrder: 'dmy', today: '2026-11-10', nowMinute: 12 * 60, ...o });
const empty = (): ExistingData => ({ clients: [], services: [], appointments: [] });

// ── 1. mapping ───────────────────────────────────────────────────────────────

await ok('Hebrew headers map to the right fields', () => {
  const m = autoMapHeaders(['שם מלא', 'נייד', 'דוא״ל', 'תאריך לידה', 'הערות', 'תאריך הצטרפות']);
  assert.deepEqual(m, ['name', 'phone', 'email', 'birthday', 'notes', 'ignore']);
});

await ok('English headers map to the right fields', () => {
  const m = autoMapHeaders(['First Name', 'Last Name', 'Mobile', 'E-mail', 'Date of Birth', 'Notes', 'Created At', 'ID']);
  assert.deepEqual(m, ['firstName', 'lastName', 'phone', 'email', 'birthday', 'notes', 'ignore', 'ignore']);
});

await ok('an appointments export: date, start, end, client, service, price, status', () => {
  const m = autoMapHeaders(['תאריך', 'שעת התחלה', 'שעת סיום', 'שם הלקוחה', 'טלפון לקוח', 'שם הטיפול', 'מחיר טיפול', 'משך טיפול', 'סטטוס', 'עובדת']);
  assert.deepEqual(m, ['date', 'time', 'endTime', 'name', 'phone', 'service', 'price', 'duration', 'status', 'ignore']);
});

await ok('birthday never becomes the appointment date, and each field goes to one column', () => {
  const m = autoMapHeaders(['שם', 'טלפון', 'טלפון נוסף', 'יום הולדת']);
  assert.deepEqual(m, ['name', 'phone', 'ignore', 'birthday']);
});

await ok('an unlabelled column of phone numbers is the phone', () => {
  const m = autoMapHeaders(['שם', 'עמודה 2'], [['דנה', '050-1234567'], ['מיכל', '0529876543'], ['רות', '+972 54 111 2222']]);
  assert.deepEqual(m, ['name', 'phone']);
});

await ok('a preset nudges an ambiguous header, generic stays the default', () => {
  assert.equal(normalizeHeader(' Phone_Number '), 'phone number');
  assert.deepEqual(autoMapHeaders(['לקוחה', 'שעת התור'], [], 'pink'), ['name', 'time']);
  assert.deepEqual(autoMapHeaders(['לקוחה', 'שעת התור']), ['name', 'time']);
});

await ok('a mapping from the browser is cleaned: unknown ids dropped, one column per field, right width', () => {
  assert.deepEqual(cleanMapping(['name', 'name', 'drop table', 'notes', 'notes'], 6), ['name', 'ignore', 'ignore', 'notes', 'notes', 'ignore']);
  assert.deepEqual(cleanMapping('nope', 2), ['ignore', 'ignore']);
});

await ok('cell readers: day first, month first when chosen, Excel serial, date+time cell, fractions of a day', () => {
  assert.equal(parseFileDate('12/08/2026'), '2026-08-12');
  assert.equal(parseFileDate('08/12/2026', 'mdy'), '2026-08-12');
  assert.equal(parseFileDate('2026-08-12'), '2026-08-12');
  assert.equal(parseFileDate('46246'), '2026-08-12');
  assert.equal(parseFileDate('12/08/2026 14:30'), '2026-08-12');
  assert.equal(parseFileDate('31/02/2026'), null);
  assert.equal(parseFileTime('14:30'), 870);
  assert.equal(parseFileTime('14:30:00'), 870);
  assert.equal(parseFileTime('0.604166667'), 870);
  assert.equal(parseFileTime('2pm'), 840);
  assert.equal(parseFileDate('12/08/2026 2:30 PM'), '2026-08-12');
});

await ok('times with AM / PM: h:mm, h, with seconds, Hebrew לפנה"צ / אחה"צ; nonsense refused', () => {
  assert.equal(parseFileTime('2:30 PM'), 870);
  assert.equal(parseFileTime('2:30pm'), 870);
  assert.equal(parseFileTime('02:30:00 PM'), 870);
  assert.equal(parseFileTime('2 PM'), 840);
  assert.equal(parseFileTime('2:30 p.m.'), 870);
  assert.equal(parseFileTime('9:15 AM'), 555);
  assert.equal(parseFileTime('12:00 AM'), 0);
  assert.equal(parseFileTime('12:30 PM'), 750);
  assert.equal(parseFileTime('2:30 אחה"צ'), 870);
  assert.equal(parseFileTime('9:00 לפנה״צ'), 540);
  assert.equal(parseFileTime('14'), 840);
  assert.equal(parseFileTime('14:30 PM'), null);
  assert.equal(parseFileTime('13 AM'), null);
  assert.equal(parseFileTime('2:75 PM'), null);
  assert.equal(parseFileTime('25:00'), null);
  assert.equal(parseFileTime('בקרוב'), null);
  // A future appointment written "2:30 PM" (separate column, or in the date cell) is imported, not skipped as "no time".
  const plan = buildImportPlan(
    [['12/11/2026', '2:30 PM', 'דנה', '0501234567'], ['13/11/2026 9:00 AM', '', 'מיכל', '0529876543']],
    ['date', 'time', 'name', 'phone'], empty(), baseOpts({ clients: false, appts: true }));
  assert.equal(plan.appts.noTime, 0);
  assert.deepEqual(plan.appts.toCreate.map((a) => [a.date, a.startMinute]), [['2026-11-12', 870], ['2026-11-13', 540]]);
  assert.equal(detectDateOrder(['13/01/2026', '02/02/2026']), 'dmy');
  assert.equal(detectDateOrder(['01/13/2026']), 'mdy');
  assert.equal(detectDateOrder(['01/02/2026']), 'unknown');
});

// ── 2. phone dedupe ──────────────────────────────────────────────────────────

await ok('every shape of one Israeli mobile is one key, stored the way she types it', () => {
  const keys = ['050-1234567', '0501234567', '+972-50-1234567', '972501234567', '+972 (0)50 123 4567', '50-123-4567'].map((p) => phoneOf(p));
  for (const k of keys) { assert.equal(k.key, '0501234567'); assert.equal(k.stored, '0501234567'); assert.equal(k.mobile, true); }
  const land = phoneOf('03-1234567');
  assert.equal(land.mobile, false); assert.equal(land.key, '031234567');
});

await ok('clients dedupe by phone against her list AND inside the file; phone-less ones by name', () => {
  const map: FileField[] = ['name', 'phone'];
  const rows = [
    ['דנה כהן', '050-1234567'],      // already hers (stored as 972...)
    ['מיכל לוי', '052-9876543'],
    ['מיכל ל.', '+972529876543'],    // same phone again in the file
    ['רות', ''],                     // no phone, new
    ['רות', ''],                     // no phone, same name
    ['שירה', ''],                    // no phone, already hers by name
    ['', '0541112222'],              // no name
  ];
  const ex = empty();
  ex.clients = [{ id: 'c1', name: 'דנה', phone: '972501234567' }, { id: 'c2', name: 'שירה', phone: '0547777777' }];
  const plan = buildImportPlan(rows, map, ex, baseOpts());
  assert.equal(plan.clients.found, 6);
  assert.equal(plan.clients.existing, 2);
  assert.equal(plan.clients.dupInFile, 2);
  assert.equal(plan.clients.noName, 1);
  assert.deepEqual(plan.clients.toCreate.map((c) => [c.name, c.phone]), [['מיכל לוי', '0529876543'], ['רות', '']]);
  assert.deepEqual(planHeadlineHe(plan, { clients: true, services: false, appts: false }), ['נמצאו 6 לקוחות, 4 כפולות ידלגו. 2 חדשות ייווספו.']);
});

await ok('email and a year-less birthday go to notes, a full birthday is stored, first + last make the name', () => {
  const plan = buildImportPlan(
    [['נועה', 'ברק', '0501112233', 'noa@example.com', '14/03/1990', 'אלרגית ללטקס'], ['יעל', 'גל', '0502223344', '', '14/03', '']],
    ['firstName', 'lastName', 'phone', 'email', 'birthday', 'notes'], empty(), baseOpts());
  const [a, b] = plan.clients.toCreate;
  assert.equal(a.name, 'נועה ברק'); assert.equal(a.birthday, '1990-03-14');
  assert.equal(a.notes, 'אלרגית ללטקס\nמייל: noa@example.com');
  assert.equal(b.birthday, ''); assert.equal(b.notes, 'יום הולדת: 14/03');
});

// ── 3. appointments: past skipped, cancelled skipped ─────────────────────────

const APPT_MAP: FileField[] = ['date', 'time', 'name', 'phone', 'service', 'duration', 'status'];

await ok('past appointments (yesterday, and earlier today) are skipped; later today and the future are kept', () => {
  const rows = [
    ['09/11/2026', '10:00', 'דנה', '0501234567', 'גבות', '30', ''],     // yesterday
    ['10/11/2026', '11:30', 'דנה', '0501234567', 'גבות', '30', ''],     // today, before 12:00
    ['10/11/2026', '15:00', 'דנה', '0501234567', 'גבות', '30', ''],     // today, later
    ['12/11/2026', '10:00', 'מיכל', '0529876543', 'לק ג׳ל', '60', ''],   // future
    ['13/11/2026', '10:00', 'רות', '0541112222', 'גבות', '30', 'בוטל'], // cancelled
    ['14/11/2026', '', 'רות', '0541112222', 'גבות', '30', ''],          // no time
  ];
  const plan = buildImportPlan(rows, APPT_MAP, empty(), baseOpts({ clients: false, appts: true }));
  assert.equal(plan.appts.past, 2);
  assert.equal(plan.appts.cancelled, 1);
  assert.equal(plan.appts.noTime, 1);
  assert.deepEqual(plan.appts.toCreate.map((a) => [a.date, a.startMinute]), [['2026-11-10', 900], ['2026-11-12', 600]]);
  // Clients the appointments need are created even when "clients" was not ticked, one card per person.
  assert.equal(plan.clients.toCreate.length, 2);
  assert.equal(plan.clients.forApptsOnly, 2);
});

await ok('duration comes from the end time, then her service; price from her service', () => {
  const ex = empty();
  ex.services = [{ name: 'לק ג׳ל', price: 120, duration: 75 }];
  const plan = buildImportPlan(
    [['12/11/2026', '10:00', '11:15', 'מיכל', 'גבות'], ['12/11/2026', '12:00', '', 'רות', 'לק ג׳ל']],
    ['date', 'time', 'endTime', 'name', 'service'], ex, baseOpts({ clients: false, appts: true }));
  assert.deepEqual(plan.appts.toCreate.map((a) => [a.duration, a.price]), [[75, 0], [75, 120]]);
});

// ── 4. conflicts ─────────────────────────────────────────────────────────────

await ok('an appointment that overlaps her calendar is reported by row and NOT imported; so is one that overlaps the file', () => {
  const ex = empty();
  ex.clients = [{ id: 'c9', name: 'אורית', phone: '0509999999' }];
  ex.appointments = [
    { id: 'a1', date: '2026-11-12', start_minute: 600, duration: 60, client_id: 'c9', name: 'אורית', confirmation_status: 'pending' },
    { id: 'a2', date: '2026-11-12', start_minute: 900, duration: 30, buffer_minutes: 15, name: 'הפסקה', confirmation_status: 'pending' },
    { id: 'a3', date: '2026-11-12', start_minute: 780, duration: 60, name: 'בוטלה', confirmation_status: 'cancelled' },
  ];
  const rows = [
    ['12/11/2026', '10:30', 'דנה', '0501234567', 'גבות', '30', ''],   // row 2: inside a1
    ['12/11/2026', '15:40', 'מיכל', '0529876543', 'גבות', '30', ''],  // row 3: inside a2's buffer
    ['12/11/2026', '13:00', 'רות', '0541112222', 'גבות', '60', ''],   // row 4: a cancelled slot is free
    ['12/11/2026', '13:30', 'נועה', '0543334444', 'גבות', '30', ''],  // row 5: overlaps row 4
    ['12/11/2026', '11:00', 'יעל', '0545556666', 'גבות', '30', ''],   // row 6: right after a1, fine
  ];
  const plan = buildImportPlan(rows, APPT_MAP, ex, baseOpts({ clients: false, appts: true }));
  assert.equal(plan.appts.conflictCount, 3);
  assert.deepEqual(plan.appts.conflicts.map((c) => [c.row, c.time, c.with]), [[2, '10:30', 'אורית'], [3, '15:40', 'הפסקה'], [5, '13:30', 'רות']]);
  assert.deepEqual(plan.appts.toCreate.map((a) => a.row), [4, 6]);
});

await ok('the same appointment already in her calendar is a duplicate, not a conflict', () => {
  const ex = empty();
  ex.clients = [{ id: 'c1', name: 'דנה', phone: '972501234567' }];
  ex.appointments = [{ date: '2026-11-12', start_minute: 630, duration: 30, client_id: 'c1', name: 'דנה', confirmation_status: 'pending' }];
  const plan = buildImportPlan([['12/11/2026', '10:30', 'דנה כהן', '050-1234567', 'גבות', '30', '']], APPT_MAP, ex, baseOpts({ appts: true }));
  assert.equal(plan.appts.alreadyInCalendar, 1);
  assert.equal(plan.appts.conflictCount, 0);
  assert.equal(plan.appts.toCreate.length, 0);
  assert.equal(plan.clients.existing, 1);
});

// ── 5. the route, end to end, against an in-memory database ──────────────────

const TENANT = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, any>;
function makeDb(tables: Record<string, Row[]>, opts: { tenant?: string | null; failInsert?: (table: string, rows: Row[]) => boolean } = {}) {
  const writes: { table: string; rows: Row[] }[] = [];
  let seq = 0;
  const query = (table: string) => {
    const st = { filters: [] as ((r: Row) => boolean)[], insert: null as Row[] | null, range: null as [number, number] | null };
    const run = () => {
      if (st.insert && opts.failInsert && opts.failInsert(table, st.insert)) return { data: null, error: { code: '23514', message: 'new row violates check constraint' } };
      if (st.insert) {
        const rows: Row[] = st.insert.map((r) => ({ id: `${table}-${++seq}`, ...r }));
        // the database's own no-overlap constraint, for appointments
        if (table === 'appointments') {
          for (const r of rows) {
            const clash = (tables.appointments || []).some((a) => a.tenant_id === r.tenant_id && a.date === r.date && a.confirmation_status !== 'cancelled'
              && r.start_minute < a.start_minute + a.duration && a.start_minute < r.start_minute + r.duration);
            if (clash) return { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' } };
          }
        }
        (tables[table] ||= []).push(...rows);
        writes.push({ table, rows });
        return { data: rows, error: null };
      }
      let hit = (tables[table] || []).filter((r) => st.filters.every((f) => f(r)));
      const count = hit.length;
      if (st.range) hit = hit.slice(st.range[0], st.range[1] + 1);
      return { data: hit.map((r) => ({ ...r })), error: null, count };
    };
    const api: any = {
      select: () => api,
      eq: (c: string, v: unknown) => { st.filters.push((r) => r[c] === v); return api; },
      gte: (c: string, v: string) => { st.filters.push((r) => String(r[c]) >= v); return api; },
      order: () => api,
      range: (a: number, b: number) => { st.range = [a, b]; return api; },
      insert: (rows: Row | Row[]) => { st.insert = Array.isArray(rows) ? rows : [rows]; return api; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  const tenant = opts.tenant === undefined ? TENANT : opts.tenant;
  const db = {
    auth: { getUser: async () => ({ data: { user: tenant ? { id: 'u1' } : null } }) },
    rpc: async (fn: string) => fn === 'get_user_tenant_id' ? { data: tenant, error: null } : fn === 'is_tenant_active' ? { data: true, error: null } : { data: null, error: { message: 'no such rpc' } },
    from: (t: string) => query(t),
  };
  return { db, writes, tables };
}

// Any network call is a failure: the import must never reach a WhatsApp / SMS provider.
const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async () => { fetchCalls++; throw new Error('import-file reached the network'); }) as typeof fetch;

process.env.NEXT_PUBLIC_IMPORT_TOOL = '1';
const route = await import('./app/api/import-file/route.ts');

let ipSeq = 0;
async function call(fields: Record<string, string>, csv: string, name = 'export.csv') {
  const form = new FormData();
  form.append('file', new File([csv], name, { type: 'text/csv' }));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await route.POST(new Request('http://localhost/api/import-file', { method: 'POST', body: form, headers: { 'x-real-ip': `10.0.0.${++ipSeq}` } }));
  return { status: res.status, body: await res.json() as any };
}

const CLIENTS_CSV = [
  'שם מלא,טלפון,מייל,תאריך לידה,הערות',
  'דנה כהן,050-1234567,dana@example.com,12/08/1990,עור רגיש',
  'מיכל לוי,052-9876543,,,',
  'מיכל לוי,+972529876543,,,כפולה',
  'רות אברהם,054-1112222,,,',
].join('\n');

const APPTS_CSV = [
  'Date,Start Time,End Time,Client Name,Phone,Service,Price,Status',
  `${dmy(YESTERDAY)},10:00,10:30,דנה כהן,0501234567,גבות,80,`,
  `${dmy(TOMORROW)},10:00,10:45,דנה כהן,0501234567,גבות,80,`,
  `${dmy(TOMORROW)},10:30,11:00,נועה ברק,0543334444,לק,120,`,
  `${dmy(IN_3)},12:00,13:00,שירה חדשה,0547778888,לק,120,`,
  `${dmy(IN_3)},14:00,15:00,טל,0541231234,לק,120,Cancelled`,
].join('\n');

await ok('step=read guesses the columns and writes nothing', async () => {
  const w = makeDb({});
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const r = await call({ step: 'read' }, CLIENTS_CSV);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.mapping, ['name', 'phone', 'email', 'birthday', 'notes']);
  assert.equal(r.body.rowCount, 4);
  assert.equal(r.body.sample.length, 4);
  assert.equal(r.body.wroteAnything, false);
  assert.equal(w.writes.length, 0);
});

await ok('preview: the summary sentence, nothing written; import without confirm=yes is still a preview', async () => {
  const w = makeDb({ clients: [{ id: 'x1', tenant_id: TENANT, name: 'רות', phone: '972541112222' }] });
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const fields = { step: 'preview', mapping: JSON.stringify(['name', 'phone', 'email', 'birthday', 'notes']), clients: '1' };
  const r = await call(fields, CLIENTS_CSV);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.summary.headline[0], 'נמצאו 4 לקוחות, 2 כפולות ידלגו. 2 חדשות ייווספו.');
  const r2 = await call({ ...fields, step: 'import' }, CLIENTS_CSV);
  assert.equal(r2.body.wroteAnything, false);
  assert.equal(w.writes.length, 0);
});

await ok('import: tenant from the session only, a tenant_id in the body is ignored, and re-importing adds nothing', async () => {
  const w = makeDb({ clients: [{ id: 'o1', tenant_id: OTHER, name: 'דנה של מישהי אחרת', phone: '0501234567' }] });
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const fields = { step: 'import', confirm: 'yes', tenant_id: OTHER, tenantId: OTHER, mapping: JSON.stringify(['name', 'phone', 'email', 'birthday', 'notes']), clients: '1' };
  const r = await call(fields, CLIENTS_CSV);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.added, { services: 0, clients: 3, appts: 0 });
  const mine = w.tables.clients.filter((c) => c.tenant_id === TENANT);
  assert.equal(mine.length, 3);
  assert.ok(w.tables.clients.every((c) => c.tenant_id === TENANT || c.id === 'o1'), 'nothing written into another tenant');
  const dana = mine.find((c) => c.name === 'דנה כהן')!;
  assert.equal(dana.phone, '0501234567');
  assert.equal(dana.birthday, '1990-08-12');
  assert.equal(dana.notes, 'עור רגיש\nמייל: dana@example.com');

  const again = await call(fields, CLIENTS_CSV);
  assert.deepEqual(again.body.added, { services: 0, clients: 0, appts: 0 });
  assert.equal(again.body.wroteAnything, false);
  assert.equal(w.tables.clients.filter((c) => c.tenant_id === TENANT).length, 3);
});

await ok('appointments: past and cancelled skipped, a conflict reported and left out, services and clients created, idempotent', async () => {
  const w = makeDb({
    clients: [{ id: 'c1', tenant_id: TENANT, name: 'דנה כהן', phone: '0501234567' }],
    service_prices: [{ id: 's1', tenant_id: TENANT, name: 'גבות', price: 80, duration: 30, color: '#F4A7B9' }],
    appointments: [],
  });
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const read = await call({ step: 'read' }, APPTS_CSV);
  assert.deepEqual(read.body.mapping, ['date', 'time', 'endTime', 'name', 'phone', 'service', 'price', 'status']);
  const fields = { step: 'import', confirm: 'yes', mapping: JSON.stringify(read.body.mapping), clients: '1', services: '1', appts: '1', dateOrder: 'dmy' };
  const r = await call(fields, APPTS_CSV);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.summary;
  assert.equal(s.appts.past, 1);
  assert.equal(s.appts.cancelled, 1);
  assert.equal(s.appts.conflictCount, 1);
  assert.equal(s.appts.conflicts[0].row, 4);
  assert.equal(s.appts.conflicts[0].name, 'נועה ברק');
  assert.deepEqual(r.body.added, { services: 1, clients: 3, appts: 2 });
  const appts = w.tables.appointments;
  assert.ok(appts.every((a) => a.date >= clock.today), 'nothing in the past');
  assert.ok(appts.every((a) => a.tenant_id === TENANT && a.confirmation_sent === false && a.confirmation_status === 'pending'));
  const dana = appts.find((a) => a.name === 'דנה כהן')!;
  assert.equal(dana.client_id, 'c1', 'linked to the card she already had');
  assert.equal(dana.duration, 45);
  const shira = appts.find((a) => a.name === 'שירה חדשה')!;
  const shiraCard = w.tables.clients.find((c) => c.name === 'שירה חדשה')!;
  assert.equal(shira.client_id, shiraCard.id, 'linked to the card the import created');
  assert.equal(w.tables.service_prices.filter((x) => x.name === 'לק').length, 1);

  const again = await call(fields, APPTS_CSV);
  assert.deepEqual(again.body.added, { services: 0, clients: 0, appts: 0 });
  assert.equal(again.body.summary.appts.alreadyInCalendar, 2);
  assert.equal(w.tables.appointments.length, 2);
});

await ok('a slot taken between the preview and the insert is caught by the database and reported, not lost', async () => {
  const w = makeDb({ clients: [], service_prices: [], appointments: [] });
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  // Someone books 10:00-11:00 tomorrow WHILE the import runs: the plan read an empty day, the insert meets the booking.
  const realFrom = w.db.from;
  let readsDone = 0;
  w.db.from = (t: string) => {
    if (t === 'appointments' && ++readsDone === 2) w.tables.appointments.push({ id: 'late', tenant_id: TENANT, date: TOMORROW, start_minute: 600, duration: 60, confirmation_status: 'pending' });
    return realFrom(t);
  };
  const csv = ['תאריך,שעה,שם,טלפון', `${dmy(TOMORROW)},10:15,ליה,0501110000`, `${dmy(TOMORROW)},12:00,מאיה,0501110001`].join('\n');
  const r = await call({ step: 'import', confirm: 'yes', mapping: JSON.stringify(['date', 'time', 'name', 'phone']), appts: '1' }, csv);
  assert.equal(r.body.added.appts, 1);
  assert.equal(r.body.summary.appts.conflictCount, 1);
  assert.equal(r.body.summary.appts.conflicts[0].name, 'ליה');
});

await ok('a client card that fails to save holds back its appointments (never client_id null), and a re-import repairs it', async () => {
  let broken = true;
  const w = makeDb({ clients: [], service_prices: [], appointments: [] }, { failInsert: (t) => broken && t === 'clients' });
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const csv = ['תאריך,שעה,שם,טלפון', `${dmy(TOMORROW)},2:30 PM,ליה,0501110000`, `${dmy(IN_3)},10:00,מאיה,0501110001`].join('\n');
  const fields = { step: 'import', confirm: 'yes', mapping: JSON.stringify(['date', 'time', 'name', 'phone']), appts: '1' };
  const r = await call(fields, csv);
  assert.equal(r.body.success, false);
  assert.equal(r.body.added.appts, 0);
  assert.equal(r.body.apptsNoClient, 2);
  assert.deepEqual(r.body.apptsNoClientRows.map((x: any) => [x.row, x.name, x.time]), [[2, 'ליה', '14:30'], [3, 'מאיה', '10:00']]);
  assert.match(r.body.error, /לייבא את אותו קובץ שוב/);
  assert.equal(w.tables.appointments.length, 0, 'no appointment without a client card');

  broken = false;
  const again = await call(fields, csv);
  assert.deepEqual(again.body.added, { services: 0, clients: 2, appts: 2 });
  assert.equal(again.body.apptsNoClient, 0);
  assert.ok(w.tables.appointments.every((a) => w.tables.clients.some((c) => c.id === a.client_id)), 'every appointment is linked');
});

await ok('no notifications: no network call happened, only the three import tables were written', () => {
  assert.equal(fetchCalls, 0);
  const src = readFileSync('app/api/import-file/route.ts', 'utf8') + readFileSync('lib/importFile.ts', 'utf8');
  const code = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
  for (const banned of ['whatsapp', 'bookingNotify', 'ownerNotify', 'waCloud', 'phoneVerify', 'sms', 'push', 'reminders', 'greetings', 'cancelNotify']) {
    assert.ok(!new RegExp(banned, 'i').test(code), `import-file must not import ${banned}`);
  }
  const tablesWritten = new Set<string>();
  for (const m of src.matchAll(/from\('([a-z_]+)'\)\.insert/g)) tablesWritten.add(m[1]);
  assert.deepEqual([...tablesWritten].sort(), ['appointments', 'clients', 'service_prices']);
});

await ok('refusals: logged out, no file, no name column, oversized file', async () => {
  (globalThis as any).__TEST_SUPABASE__ = makeDb({}, { tenant: null }).db;
  assert.equal((await call({ step: 'read' }, CLIENTS_CSV)).status, 401);
  (globalThis as any).__TEST_SUPABASE__ = makeDb({}).db;
  const noName = await call({ step: 'preview', mapping: JSON.stringify(['ignore', 'phone']), clients: '1' }, CLIENTS_CSV);
  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /שם/);
  const big = 'שם,טלפון\n' + 'דנה,0501234567\n'.repeat(400_000);
  assert.equal((await call({ step: 'read' }, big)).status, 413);
});

await ok('the rate-limit policy exists', () => {
  assert.ok(RATE_POLICIES['file-import']);
  assert.ok(RATE_POLICIES['file-import'].perTenant.limit >= 20);
});

// ── 6. the flag ──────────────────────────────────────────────────────────────

await ok('flag: empty is off, "1" / "true" is on', () => {
  assert.equal(importToolEnabled({ NEXT_PUBLIC_IMPORT_TOOL: '' }), false);
  assert.equal(importToolEnabled({ NEXT_PUBLIC_IMPORT_TOOL: undefined }), false);
  assert.equal(importToolEnabled({ NEXT_PUBLIC_IMPORT_TOOL: '0' }), false);
  assert.equal(importToolEnabled({ NEXT_PUBLIC_IMPORT_TOOL: '1' }), true);
  assert.equal(importToolEnabled({ NEXT_PUBLIC_IMPORT_TOOL: 'true' }), true);
});

await ok('flag off: the route answers 404 and touches nothing', async () => {
  process.env.NEXT_PUBLIC_IMPORT_TOOL = '';
  const w = makeDb({});
  (globalThis as any).__TEST_SUPABASE__ = w.db;
  const r = await call({ step: 'import', confirm: 'yes', mapping: '["name","phone"]', clients: '1' }, CLIENTS_CSV);
  assert.equal(r.status, 404);
  assert.equal(w.writes.length, 0);
});

const { importApp, renderApp } = await import('./testkit/render.mjs');
const { default: ImportFromSystem } = await importApp('app/ImportFromSystem.jsx');

await ok('flag off: the component renders nothing at all', () => {
  process.env.NEXT_PUBLIC_IMPORT_TOOL = '';
  assert.equal(renderApp(ImportFromSystem, { onImported: () => {} }), '');
});

await ok('flag on: the card renders, promises any system and no messages, no claimed compatibility', () => {
  process.env.NEXT_PUBLIC_IMPORT_TOOL = '1';
  const html = renderApp(ImportFromSystem, { onImported: () => {} });
  assert.match(html, /data-testid="import-from-system"/);
  assert.match(html, /קובץ CSV או Excel מכל מערכת/);
  assert.match(html, /העלאת קובץ/);
  assert.ok(!/תואם|תומך ב|compatible/i.test(html));
  assert.ok(!/—/.test(readFileSync('app/ImportFromSystem.jsx', 'utf8')), 'no em dashes in the copy');
});

await ok('both entry points in the app render the component, and only through it', () => {
  const app = readFileSync('app/beautyos.jsx', 'utf8');
  assert.equal((app.match(/<ImportFromSystem /g) || []).length, 2);
  assert.match(app, /dynamic\(\(\) => import\("\.\/ImportFromSystem"\)/);
});

globalThis.fetch = realFetch;
console.log(`\ntest-import-from-system: passed ${n} failed 0`);

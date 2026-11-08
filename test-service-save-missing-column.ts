// test-service-save-missing-column.ts
//
// Vercel security finding (2026-11-08): before add_service_buffer_2026-11-05.sql ran, saving a service with a buffer failed on
// the missing buffer_minutes column, and the retry dropped requires_deposit too, so a "deposit required" service was saved
// without it and public bookings skipped the deposit. The retry must drop ONLY the column the database names.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missingColumnName } from './lib/pgError.ts';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };

ok(missingColumnName({ code: 'PGRST204', message: "Could not find the 'buffer_minutes' column of 'service_prices' in the schema cache" }) === 'buffer_minutes', 'PostgREST names the column');
ok(missingColumnName({ code: '42703', message: 'column "buffer_minutes" of relation "service_prices" does not exist' }) === 'buffer_minutes', 'Postgres names the column');
ok(missingColumnName({ code: '42703', message: 'column service_prices.field does not exist' }) === 'field', 'qualified name');
ok(missingColumnName({ code: '23502', message: 'null value in column "amount" violates not-null constraint' }) === null, 'not a missing column');
ok(missingColumnName(null) === null, 'no error');

const app = readFileSync('app/beautyos.jsx', 'utf8');
ok(!app.includes('const { field, requires_deposit, buffer_minutes, ...reduced }'), 'no retry drops the whole optional set any more');
ok(/const col = missingColumnName\(err\);/.test(app), 'the retry drops the column the error names');
ok((app.match(/retryWithoutMissing\(/g) || []).length >= 2, 'used for both the insert and the update');
ok((app.match(/הפיקדון של \$\{s\.name\} לא נשמר/g) || []).length === 2, 'a deposit that could not be kept is an error, never silent');

console.log(`service save missing column: ${n} ok`);

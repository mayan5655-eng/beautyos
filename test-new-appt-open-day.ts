// A new appointment starts on the first day she is open (2026-10-24 phone review: on a Saturday the form opened on "closed today" with a dead save button).
import assert from 'node:assert/strict';
import { nextOpenDay } from './lib/businessHours.ts';

const d = (s: string) => new Date(s + 'T12:00:00');
const day = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
// the default week of a new business: closed on Saturday (6) - see dayHoursFrom's defaults
const settings = { working_hours_start: 8, working_hours_end: 18 } as never;
assert.equal(day(nextOpenDay(settings, d('2026-10-25'))), '2026-10-25', 'a Sunday stays Sunday');
assert.equal(day(nextOpenDay(settings, d('2026-10-24'))), '2026-10-25', 'closed Saturday starts on Sunday');
// never open: today, not an endless search
const never = { business_hours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } } as never;
assert.equal(day(nextOpenDay(never, d('2026-10-24'))), '2026-10-24');
console.log('new-appt-open-day: ok');

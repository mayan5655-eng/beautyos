// Proves lib/supportInbox.ts with a fake db: the nightly alert for "an unseen
// support message for two days is worse than no button." Plain node, no
// database, no network.
import assert from 'node:assert/strict';
import { staleSupportMessages, formatStaleSupportLine } from './lib/supportInbox.ts';

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

function fakeDb(rows: { created_at: string }[], errorMessage: string | null = null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        is: (_col: string, _val: null) => ({
          lt: async (_col2: string, _val2: string) => {
            if (errorMessage) return { data: null, error: { message: errorMessage } };
            return { data: rows.filter((r) => new Date(r.created_at).getTime() < new Date(_val2).getTime()), error: null };
          },
        }),
      }),
    }),
  };
}

// Nothing stuck: zero, not null - "checked, and clean" reads differently from
// "could not check".
{
  const r = await staleSupportMessages(fakeDb([]), 2);
  assert.deepEqual(r, { count: 0, oldestDays: null });
  assert.equal(formatStaleSupportLine(r), '', 'nothing to say when clean');
}

// Two old, one recent: only the old ones count, and the oldest sets the days.
{
  const rows = [{ created_at: iso(5) }, { created_at: iso(3) }, { created_at: iso(1) }];
  const r = await staleSupportMessages(fakeDb(rows), 2);
  assert.equal(r.count, 2, 'the 1-day-old row is inside the 2-day window, so excluded');
  assert.equal(r.oldestDays, 5);
  assert.match(formatStaleSupportLine(r), /2 \(הישנה ביותר: לפני 5 ימים\)/);
}

// A missing table (support-messages.sql not applied yet) degrades to null,
// never throws and never reads as "0 stuck" - that would be a false all-clear.
{
  const r = await staleSupportMessages(fakeDb([], 'relation "public.support_messages" does not exist'), 2);
  assert.deepEqual(r, { count: null, oldestDays: null });
  assert.equal(formatStaleSupportLine(r), '', 'unknown state says nothing rather than pretending to be healthy');
}

// A real query error (not a missing table) is surfaced, not swallowed.
{
  const r = await staleSupportMessages(fakeDb([], 'connection reset'), 2);
  assert.equal(r.count, null);
  assert.equal(r.error, 'connection reset');
}

console.log('support inbox: ok');

// lib/ai/loadBusinessProfile.ts: the real business profile fed to every
// marketing prompt, and specifically that it degrades — never blacks out
// business_name and everything else — when business_fields is not yet a
// real column (supabase/migrations/add_business_fields.sql, applied by hand).
import assert from 'node:assert/strict';
import { loadBusinessProfile } from './lib/ai/loadBusinessProfile.ts';

type Answer = { data: unknown; error: unknown };

// The narrow slice of a query builder this file's calls actually reach —
// select/eq chain to a terminal .limit() (settings) or .or() (service_prices).
interface FakeQuery {
  select(cols?: string): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  limit(...args: unknown[]): Promise<Answer>;
  or(...args: unknown[]): Promise<Answer>;
}

/** loadBusinessProfile's own client parameter type, structural and not
 *  exported — a hand-rolled FakeQuery satisfies it by shape. */
type FakeSupabase = Parameters<typeof loadBusinessProfile>[0];

// A fake Supabase client: each .from(table) returns a query builder whose
// terminal call (.limit or .or) resolves to {data, error}. `settingsAnswer`
// is a function so a test can react to which columns were actually asked for.
function fakeClient(settingsAnswer: (columns: string) => Answer, services: unknown[] = []): FakeSupabase {
  const client = {
    from(table: string): FakeQuery {
      if (table === 'settings') {
        let columns = '';
        const builder: FakeQuery = {
          select(cols) { columns = cols || ''; return builder; },
          eq() { return builder; },
          limit: () => Promise.resolve(settingsAnswer(columns)),
          or: () => Promise.resolve(settingsAnswer(columns)),
        };
        return builder;
      }
      const builder: FakeQuery = {
        select() { return builder; },
        eq() { return builder; },
        limit: () => Promise.resolve({ data: services, error: null }),
        or: () => Promise.resolve({ data: services, error: null }),
      };
      return builder;
    },
  };
  return client as unknown as FakeSupabase;
}

// No tenant: the documented empty-profile shortcut, unrelated to fields.
assert.deepEqual(await loadBusinessProfile(fakeClient(() => ({ data: [], error: null })), null), {});

// Normal case: business_fields comes back like any other column, and lands
// on the profile through businessFieldsOf.
{
  const client = fakeClient((cols) => {
    assert.ok(cols.includes('business_fields'), 'asks for it in the normal case');
    return { data: [{ business_name: 'x', business_fields: ['nails'] }], error: null };
  });
  const profile = await loadBusinessProfile(client, 't1');
  assert.deepEqual(profile.fields, ['nails']);
  assert.equal(profile.business_name, 'x');
}

// A row with no business_fields at all (a real row from before the column
// existed) reads as cosmetics, same as businessFieldsOf's own default.
{
  const client = fakeClient(() => ({ data: [{ business_name: 'x' }], error: null }));
  const profile = await loadBusinessProfile(client, 't1');
  assert.deepEqual(profile.fields, ['cosmetics']);
}

// The migration has not run yet: the first select naming business_fields
// fails with a missing-column error. The function must retry WITHOUT it and
// still return the rest of the real profile — business_name included — not
// the empty-profile fallback.
{
  let calls = 0;
  const client = fakeClient((cols) => {
    calls++;
    if (cols.includes('business_fields')) return { data: null, error: { code: '42703', message: 'column settings.business_fields does not exist' } };
    return { data: [{ business_name: 'הקליניקה של מאיה', therapist_name: 'מאיה' }], error: null };
  });
  const profile = await loadBusinessProfile(client, 't1');
  assert.equal(calls, 2, 'asked once with the new column, once without');
  assert.equal(profile.business_name, 'הקליניקה של מאיה', 'the rest of the real profile survives the missing column');
  assert.equal(profile.therapist_name, 'מאיה');
  assert.deepEqual(profile.fields, ['cosmetics'], 'falls back to the safe default, same as an unset row');
}

console.log('load business profile: ok');

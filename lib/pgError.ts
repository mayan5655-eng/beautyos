// lib/pgError.ts
//
// "Did this fail because the column is not there yet?"
//
// Migrations in this repo are applied by hand in the Supabase SQL Editor, which
// means there is always a window where the deployed code knows about a column
// the database does not. The rule the codebase follows is that code ships first
// and degrades: ask for the new column, and if the database has not got it,
// carry on without it rather than failing the whole operation.
//
// This is the test for that, extracted from softCancelAppointment - which has
// been doing it inline for the cancel-audit columns - so that every place
// making the same bet spells it the same way. PostgREST reports the condition
// two different ways depending on whether it was the schema cache or Postgres
// itself that noticed, and the message text is the third-hand fallback.

export type MaybePgError = { code?: string | null; message?: string | null } | null | undefined;

export function isMissingColumnError(error: MaybePgError): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;   // Postgres: undefined_column
  if (error.code === 'PGRST204') return true; // PostgREST: not in the schema cache
  return /column .* does not exist|could not find the '.*' column/i.test(String(error.message || ''));
}

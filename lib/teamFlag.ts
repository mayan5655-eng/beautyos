// lib/teamFlag.ts
//
// The switch for the team calendar ("יומן צוות", lib/team.ts). Safe for the browser: it reads one public variable.
// NEXT_PUBLIC_TEAM_CALENDAR empty (the default) = nothing renders anywhere, /api/team answers 404 and the public booking page and
// /api/book-appointment behave exactly as they did. "1" or "true" only turns the code on: a business still sees the calendar
// change only once add_team_calendar_2026-11-12.sql has run AND she has at least two active staff members.

/** On only for "1" or "true". The variable is written out in full so Next inlines it into the browser bundle. */
export function teamCalendarEnabled(
  env: Record<string, string | undefined> = { NEXT_PUBLIC_TEAM_CALENDAR: process.env.NEXT_PUBLIC_TEAM_CALENDAR },
): boolean {
  const v = String(env.NEXT_PUBLIC_TEAM_CALENDAR || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

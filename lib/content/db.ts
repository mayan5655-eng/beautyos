// lib/content/db.ts
//
// Shared by the content routes: is this database error "the content tables are not created yet"
// (add_content_plan.sql not run)? The routes then answer with a plain Hebrew message instead of failing.

export const CONTENT_NOT_AVAILABLE_HE = 'לוח התוכן עוד לא הופעל בחשבון (חסרה הרצת SQL: kalmea-sql-content-plan).';

export function isMissingContentTable(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  const m = e.message || '';
  return /content_(plans|items|item_platforms|preferences)/.test(m) && /does not exist|schema cache/i.test(m);
}

// lib/i18n/dates.ts — a day ("2026-11-12") as words in a language. Hebrew is lib/messages.js hebrewDate, unchanged
// ("יום חמישי, 12 בנובמבר"); Arabic and English come from Intl ("الخميس، 12 نوفمبر" / "Thursday 12 November").
import { hebrewDate } from '../messages.js';
import { localeOf, type Lang } from './core.ts';

export function dateLabel(dateStr: string | null | undefined, lang: Lang): string {
  if (!dateStr) return '';
  if (lang === 'he') return hebrewDate(dateStr);
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  return new Intl.DateTimeFormat(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

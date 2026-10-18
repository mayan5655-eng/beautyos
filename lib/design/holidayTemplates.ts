// lib/design/holidayTemplates.ts
// occasion key -> the newest feed template that carries it, restricted to her own field(s) - otherwise a nails
// tenant could get pointed at the cosmetics version of the same occasion, or vice versa. Shared by the content tab
// (app/design/WeekView.jsx) and the home screen's "שיווק היום" card (app/MarketingToday.jsx).
import { getTemplate, TEMPLATES } from './templates';
import type { FieldKey } from '../businessFields';

export function holidayTemplates(fields: readonly FieldKey[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of TEMPLATES) {
    if (!t.holiday || t.format !== 'feed45') continue;
    if (!t.fields.some((f) => fields.includes(f))) continue;
    if (!out[t.holiday] || t.version > (getTemplate(out[t.holiday])?.version ?? -1)) out[t.holiday] = t.key;
  }
  return out;
}

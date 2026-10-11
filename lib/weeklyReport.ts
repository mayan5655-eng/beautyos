// lib/weeklyReport.ts
//
// The Sunday message to her: last week in a few lines. Sent only to her, only when she turned it on in Settings
// (automations.weekly_report === true), through the same owner channel as the evening summary. Pure, so the
// sentences are testable; the cron route does the reading.
//
// Voice: a short note from someone who keeps her books, not a dashboard export. An empty week is not worth a
// message (returns null), same rule as the evening summary.

import type { Goals, Progress } from './goals.ts';

export type WeeklyInput = {
  weekRevenue: number;
  prevWeekRevenue: number;
  bookings: number;
  cancellations: number;
  newLeads: number;
  newClients: number;
  topSource?: string | null;
  monthRevenue?: Progress | null;
  monthBookings?: Progress | null;
  goals?: Goals;
};

const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const countClients = (n: number) => (n === 1 ? 'לקוחה אחת' : `${n} לקוחות`);

export function buildWeeklyReport(i: WeeklyInput): string | null {
  const active = i.weekRevenue > 0 || i.bookings > 0 || i.newLeads > 0 || i.newClients > 0;
  if (!active) return null;
  const out: string[] = ['השבוע שעבר בקצרה:'];

  if (i.weekRevenue > 0) {
    let line = `הכנסות: ${money(i.weekRevenue)}`;
    if (i.prevWeekRevenue > 0) {
      const diff = Math.round(((i.weekRevenue - i.prevWeekRevenue) / i.prevWeekRevenue) * 100);
      if (diff >= 5) line += ` (עלייה של ${diff}% לעומת השבוע שלפניו)`;
      else if (diff <= -5) line += ` (ירידה של ${Math.abs(diff)}% לעומת השבוע שלפניו)`;
      else line += ' (כמו בשבוע שלפניו)';
    }
    out.push(line + '.');
  }
  if (i.bookings > 0) {
    out.push(`תורים שהתקיימו או נקבעו: ${i.bookings}${i.cancellations > 0 ? `, ${i.cancellations} בוטלו` : ''}.`);
  }
  if (i.newLeads > 0) {
    out.push(`פניות חדשות: ${i.newLeads}${i.topSource ? `, רובן מ${i.topSource}` : ''}.`);
  }
  if (i.newClients > 0) out.push(`הצטרפו ${countClients(i.newClients)} חדשות.`);

  const g = i.monthRevenue;
  if (g) {
    out.push('', g.reached
      ? `יעד ההכנסות של החודש הושג (${money(g.actual)} מתוך ${money(g.target)}).`
      : `יעד ההכנסות לחודש: ${g.pct}% (${money(g.actual)} מתוך ${money(g.target)}, חסרים ${money(g.remaining)}).`);
  }
  const b = i.monthBookings;
  if (b) out.push(b.reached ? `יעד התורים של החודש הושג (${b.actual}).` : `יעד התורים לחודש: ${b.actual} מתוך ${b.target}.`);

  out.push('', 'שבוע טוב.');
  return out.join('\n');
}

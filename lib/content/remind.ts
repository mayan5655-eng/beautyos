// lib/content/remind.ts
//
// The morning "היום מפרסמים" notification text (app/api/content/remind). Pure, so the test pins it.

const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

export function contentReminderHe(items: Array<{ topic: string; plannedFor: Date }>): { title: string; body: string } {
  const sorted = [...items].sort((a, b) => a.plannedFor.getTime() - b.plannedFor.getTime());
  const lines = sorted.slice(0, 3).map((i) => `${hm(i.plannedFor)} · ${(i.topic || 'פוסט').trim().slice(0, 60)}`);
  const more = sorted.length > 3 ? `ועוד ${sorted.length - 3}` : '';
  return {
    title: sorted.length === 1 ? 'היום מפרסמים פוסט' : `היום מפרסמים ${sorted.length} פוסטים`,
    body: [...lines, more].filter(Boolean).join('\n') + '\nהטקסטים מוכנים בלוח התוכן.',
  };
}

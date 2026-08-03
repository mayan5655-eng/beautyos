// lib/leads/contact.ts
// Contact-history helpers for leads.
//
// leads.first_contacted_at / last_contacted_at / contact_attempts have existed
// on the table since it was created but nothing wrote them until now. These
// helpers format that history for display.

// Whole calendar days between a timestamp and today. Uses day boundaries rather
// than elapsed hours, so a message sent last night reads "אתמול" rather than
// "לפני 0 ימים".
export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - thenDay.getTime()) / 86400000);
}

// Short form for the list row: "היום" / "אתמול" / "לפני 5 ימים".
export function contactAgoHe(iso: string | null | undefined): string {
  const d = daysAgo(iso);
  if (d === null) return '';
  if (d <= 0) return 'היום';
  if (d === 1) return 'אתמול';
  return `לפני ${d} ימים`;
}

// Full line for the drawer. Adds the attempt count only when she tried more
// than once, so a single contact stays quiet.
export function contactSummaryHe(
  lead:
    | { last_contacted_at?: string | null; contact_attempts?: number | null }
    | null
    | undefined
): string {
  if (!lead?.last_contacted_at) return 'טרם יצרת קשר';
  const when = contactAgoHe(lead.last_contacted_at);
  const attempts = Number(lead.contact_attempts) || 0;
  return attempts > 1 ? `${when} · ${attempts} פניות` : when;
}

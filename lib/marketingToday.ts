// lib/marketingToday.ts
//
// Pure helpers for the home screen's "שיווק היום" card (app/MarketingToday.jsx): who to ask for a review this week,
// the review message, and a ready caption for today's post suggestion.
//
// Same rule as the public page: nothing is invented. A row exists only when real data backs it (a visit that happened,
// a client with a phone, a suggestion with a caption we can stand behind), and the captions claim nothing about her
// business: no prices, no "spots left", no results.

export type Appt = { id?: string | number | null; client_id?: string | number | null; date?: string | null; confirmation_status?: string | null };
export type Client = { id?: string | number | null; name?: string | null; phone?: string | null };

export type ReviewTarget = { clientId: string; name: string; phone: string; appointmentId: string; date: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD `days` before the given YYYY-MM-DD (calendar days, no time zone involved). */
export function daysBefore(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/**
 * Clients who were here in the last 7 days (today included), one row each, for their latest visit. Cancelled visits,
 * future ones, clients without a phone and appointments without a real id (needed for the signed link) are left out.
 * Newest visit first.
 */
export function reviewTargets(appointments: readonly Appt[], clients: readonly Client[], today: string): ReviewTarget[] {
  const from = daysBefore(today, 7);
  const byId = new Map(clients.map((c) => [String(c.id), c]));
  const latest = new Map<string, Appt>();
  for (const a of appointments) {
    if (!a || !a.date || a.date < from || a.date > today) continue;
    if (a.confirmation_status === 'cancelled') continue;
    if (!UUID_RE.test(String(a.id ?? ''))) continue;
    const cid = String(a.client_id ?? '');
    if (!cid || !byId.has(cid)) continue;
    const prev = latest.get(cid);
    if (!prev || String(a.date) > String(prev.date)) latest.set(cid, a);
  }
  const out: ReviewTarget[] = [];
  for (const [cid, a] of latest) {
    const c = byId.get(cid)!;
    const phone = String(c.phone ?? '').trim();
    if (!phone) continue;
    out.push({ clientId: cid, name: String(c.name ?? '').trim(), phone, appointmentId: String(a.id), date: String(a.date) });
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
}

const firstName = (name: string) => (name.trim().split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}'׳״"-]/gu, '');

/**
 * The review request. With the signed link (her own review form) it points there; without it, at her Google review
 * link when she set one; with neither, the polite ask alone (the card says how to add a link).
 */
export function reviewMessage(o: { name: string; businessName?: string; link?: string | null; googleUrl?: string | null }): string {
  const first = firstName(o.name);
  const biz = String(o.businessName || '').trim();
  const lines = [`היי${first ? ` ${first}` : ''}! 🌸`, `תודה שהגעת${biz && biz !== 'העסק שלי' ? ` ל${biz}` : ''}, היה לי כיף לפגוש אותך.`];
  const link = String(o.link || '').trim() || String(o.googleUrl || '').trim();
  if (link) {
    lines.push('אם יש לך דקה, אשמח מאוד שתכתבי כמה מילים על הטיפול:');
    lines.push(link);
  } else {
    lines.push('אם יש לך דקה, אשמח מאוד לשמוע איך היה לך.');
  }
  lines.push('תודה! 💛');
  return lines.join('\n');
}

const SEASON_WITH_ARTICLE: Record<string, string> = { summer: 'הקיץ', autumn: 'הסתיו', winter: 'החורף', spring: 'האביב' };

/** The parts of a lib/design/suggestions.ts Suggestion this needs. */
export type SuggestionLike = { key: string; reason?: string; values?: Record<string, string>; upcoming?: { holiday?: { key?: string; name?: string } } };

/**
 * A ready caption for a post suggestion, ending with her booking page when there is one. Null for suggestion kinds
 * we cannot caption honestly without her (a saved review, an AI idea): those stay in the content tab.
 */
export function suggestionCaption(s: SuggestionLike, pageUrl?: string | null): string | null {
  const url = String(pageUrl || '').trim();
  const tail = url ? `\nלקביעת תור:\n${url}` : '';
  if (s.key.startsWith('occasion:')) {
    const key = s.upcoming?.holiday?.key || s.key.slice('occasion:'.length);
    const name = SEASON_WITH_ARTICLE[key] || String(s.upcoming?.holiday?.name || '').trim();
    if (!name) return null;
    return `לקראת ${name} 🌸\nזה הזמן לפנק את עצמך.${tail}`;
  }
  if (s.key.startsWith('quiet:')) {
    const when = String(s.values?.subline || '').trim();
    if (!when) return null;
    return `התפנה מקום ל${when} ✨\nמי רוצה?${tail}`;
  }
  if (s.key.startsWith('service:')) {
    const service = String(s.values?.headline || s.key.slice('service:'.length)).trim();
    if (!service) return null;
    return `${service} 🌸\nרוצה לשמוע עוד או לקבוע? כתבי לי.${tail}`;
  }
  return null;
}

/** The first suggestion that has a caption, with it. Null when none does. */
export function todaysPost<T extends SuggestionLike>(suggestions: readonly T[], pageUrl?: string | null): { suggestion: T; caption: string } | null {
  for (const s of suggestions) {
    const caption = suggestionCaption(s, pageUrl);
    if (caption) return { suggestion: s, caption };
  }
  return null;
}

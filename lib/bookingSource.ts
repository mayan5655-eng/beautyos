// lib/bookingSource.ts
//
// "Which post brought this booking?" - the question her marketing never answered. Kalmea measured where LEADS came from
// (lib/sourceReport.ts) but not where BOOKINGS came from: a client who saw a reel, tapped the link and booked arrived as "nothing".
//
// Every link she sends out now says where it was sent (?src=<channel>), and a client's personal "bring a friend" link says who sent
// it (?ref=<client id>). Her public page and booking page remember both for the visit (sessionStorage, per business), the booking
// stores them on the appointment and on a NEW client card (add_booking_source.sql), and the source report counts bookings and money
// per channel and per referring client.
//
// Nothing here is trusted for anything but a label: a forged src only mislabels one booking, and ref is checked on the server to be
// a client of the same business (app/api/book-appointment).

export const SOURCE_CHANNELS = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'google', 'post', 'story', 'bio', 'qr', 'referral', 'link'] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const SOURCE_LABEL_HE: Record<string, string> = {
  instagram: 'אינסטגרם',
  facebook: 'פייסבוק',
  whatsapp: 'וואטסאפ',
  tiktok: 'טיקטוק',
  google: 'גוגל',
  post: 'פוסט',
  story: 'סטורי',
  bio: 'קישור בביו',
  qr: 'קוד QR',
  referral: 'חברה מביאה חברה',
  link: 'הקישור שלך',
};

/** A source as it may be stored: lower-case letters, digits, '-' and '_', at most 30. '' when unusable. */
export function cleanSource(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  return s;
}

/** A referring client id: a uuid, or ''. */
export function cleanRef(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : '';
}

export function sourceLabel(src: unknown): string {
  const s = cleanSource(src);
  if (!s) return 'לא ידוע';
  return SOURCE_LABEL_HE[s] || s;
}

/** The source carried by a URL's query: ?src= first, then a campaign's utm_source; a ref alone means "referral". */
export function readSourceParams(search: string): { src: string; ref: string } {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const ref = cleanRef(q.get('ref'));
  const src = cleanSource(q.get('src')) || cleanSource(q.get('utm_source')) || (ref ? 'referral' : '');
  return { src, ref };
}

/** Adds ?src= (and ?ref=) to one of her links, keeping whatever query it already has. Unusable values add nothing. */
export function withSource(url: string, src: string, ref?: string): string {
  const s = cleanSource(src);
  const r = cleanRef(ref);
  if (!s && !r) return url;
  try {
    const u = new URL(url);
    if (s) u.searchParams.set('src', s);
    if (r) u.searchParams.set('ref', r);
    return u.toString();
  } catch {
    const extra = [s ? `src=${s}` : '', r ? `ref=${r}` : ''].filter(Boolean).join('&');
    return `${url}${url.includes('?') ? '&' : '?'}${extra}`;
  }
}

const key = (tenantId: string) => `kalmea_bk_src_${tenantId}`;

/** On her public page or booking page: remember this visit's source, first touch wins for the visit. Never throws. */
export function rememberSource(tenantId: string, search: string, store?: Pick<Storage, 'getItem' | 'setItem'> | null): void {
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    if (!s || !tenantId) return;
    const found = readSourceParams(search);
    if (!found.src && !found.ref) return;
    if (s.getItem(key(tenantId))) return;
    s.setItem(key(tenantId), JSON.stringify(found));
  } catch { /* private mode, blocked storage: the booking simply has no source */ }
}

/** What the booking sends: this URL's own params, else what the visit remembered. */
export function recalledSource(tenantId: string, search: string, store?: Pick<Storage, 'getItem'> | null): { src: string; ref: string } {
  const here = readSourceParams(search);
  if (here.src || here.ref) return here;
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
    const raw = s?.getItem(key(tenantId));
    if (!raw) return { src: '', ref: '' };
    const o = JSON.parse(raw) as { src?: unknown; ref?: unknown };
    return { src: cleanSource(o.src), ref: cleanRef(o.ref) };
  } catch {
    return { src: '', ref: '' };
  }
}

/** The message she sends a happy client, with her personal link to pass on. */
export function referralMessageHe(i: { clientName?: string | null; businessName?: string | null; link: string }): string {
  const first = String(i.clientName || '').trim().split(/\s+/)[0] || '';
  const biz = String(i.businessName || '').trim();
  return [
    `היי${first ? ` ${first}` : ''} 🌸`,
    `תודה שאת איתי${biz ? ` ב${biz}` : ''}! אם יש לך חברה שתשמח לטיפול, זה הקישור האישי שלך לשלוח לה:`,
    i.link,
    'כשהיא קובעת דרכו, אני יודעת שהיא הגיעה ממך 💛',
  ].join('\n');
}

export type ApptRow = { id?: unknown; source?: unknown; referred_by?: unknown; date?: string | null; confirmation_status?: unknown; client_id?: unknown };
export type ReceiptLite = { appointment_id?: unknown; amount?: unknown; voided?: unknown };

/** Bookings and their paid money per channel, inside [from, to] (YYYY-MM-DD). Cancelled bookings are not counted. */
export function bookingsBySource(appts: ApptRow[], receipts: ReceiptLite[], from: string, to: string): { key: string; label: string; bookings: number; revenue: number }[] {
  const paid = new Map<string, number>();
  for (const r of receipts || []) {
    if (r.voided) continue;
    const id = String(r.appointment_id ?? '');
    if (!id) continue;
    paid.set(id, (paid.get(id) || 0) + (Number(r.amount) || 0));
  }
  const rows = new Map<string, { key: string; label: string; bookings: number; revenue: number }>();
  for (const a of appts || []) {
    const d = String(a.date || '');
    if (!d || d < from || d > to || a.confirmation_status === 'cancelled') continue;
    const k = cleanSource(a.source) || '__none__';
    const row = rows.get(k) || { key: k, label: k === '__none__' ? 'לא סומן מקור' : sourceLabel(k), bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += paid.get(String(a.id ?? '')) || 0;
    rows.set(k, row);
  }
  return [...rows.values()].sort((x, y) => (x.key === '__none__' ? 1 : y.key === '__none__' ? -1 : y.bookings - x.bookings || y.revenue - x.revenue));
}

/** Who brought friends: referring client id -> how many NEW clients came through her link. */
export function referralCounts(clients: { id?: unknown; referred_by?: unknown }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of clients || []) {
    const r = cleanRef(c.referred_by);
    if (r && r !== String(c.id ?? '')) m.set(r, (m.get(r) || 0) + 1);
  }
  return m;
}

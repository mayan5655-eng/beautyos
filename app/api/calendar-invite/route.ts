// app/api/calendar-invite/route.ts
//
// "Add to my calendar" for a client who just booked, as a real URL instead of a blob download.
//
// Found 2026-10-24 in the phone review: the booking page's "לאייפון / ליומן" button built a blob and clicked a hidden
// `<a download>`. Her clients open the booking link from Instagram and Facebook, whose in-app browsers drop that download
// without a word, and iPhone Safari saves it into Files instead of offering "Add to Calendar". A plain link that answers with
// `text/calendar` is what iPhone Safari opens straight into the Calendar sheet, and Android hands to the calendar app.
//
// Stateless and public: the event is described by the query itself (the page already has all of it), nothing is read from or
// written to the database, and a bad query is a plain 400. Text is length-capped; buildIcs escapes it.
import { buildIcs } from '@/lib/calendarInvite';

const bad = () => new Response('Bad request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
const clip = (v: string | null, n: number) => (v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get('date') || '';
  const start = Number(q.get('start'));
  const duration = Number(q.get('duration') || 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(start) || start < 0 || start >= 1440) return bad();
  if (!Number.isFinite(duration) || duration < 5 || duration > 600) return bad();
  const title = clip(q.get('title'), 120) || 'תור';
  const ics = buildIcs({
    date, startMinute: start, duration, title,
    location: clip(q.get('location'), 200) || undefined,
    details: clip(q.get('details'), 300) || undefined,
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tor.ics"',
      'Cache-Control': 'no-store',
    },
  });
}

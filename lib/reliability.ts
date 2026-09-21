// lib/reliability.ts
//
// What an appointment's ending says about the client: she came, she did not
// come, or she cancelled - and if she cancelled, whether it was in time.
//
// ── Statuses ───────────────────────────────────────────────────────────────
// appointments.confirmation_status was pending | confirmed | cancelled, and
// "did not show up" existed only on leads. NO_SHOW joins the set: the
// appointment stood, she was not there. It is set by hand, on or after the
// day, and never by the system - nothing in the product can know she did not
// arrive except the person who was waiting.
//
// ── Late cancellation ──────────────────────────────────────────────────────
// A cancellation is late when it lands inside LATE_HOURS of the start, read
// from cancelled_at against the appointment's date and start minute. Rows
// cancelled before that column existed have no cancelled_at and are counted
// as neither late nor on time: unknown is unknown.
//
// ── Recurrence ─────────────────────────────────────────────────────────────
// The regular client: "every three weeks, eight times". The dates are pure
// arithmetic here; the clash check and the inserts are the caller's, because
// which dates clash depends on what is already in her calendar.

export const NO_SHOW = 'no_show';
export const LATE_HOURS = 24;

export type ApptLike = {
  id?: unknown;
  date?: string | null;
  start_minute?: number | null;
  hour?: number | null;
  confirmation_status?: string | null;
  cancelled_at?: string | null;
  kind?: string | null;
};

const startMin = (a: ApptLike): number | null => {
  if (a.start_minute != null && Number.isFinite(Number(a.start_minute))) return Number(a.start_minute);
  if (a.hour != null && Number.isFinite(Number(a.hour))) return Number(a.hour) * 60;
  return null;
};

/** Start of the appointment as a local Date, or null. */
export function startOf(a: ApptLike): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a.date || ''));
  if (!m) return null;
  const s = startMin(a) ?? 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(s / 60), s % 60);
}

export function isNoShow(a: ApptLike): boolean {
  return a.confirmation_status === NO_SHOW;
}

/** Cancelled within LATE_HOURS of the start. Unknown cancel time is false. */
export function isLateCancellation(a: ApptLike, lateHours: number = LATE_HOURS): boolean {
  if (a.confirmation_status !== 'cancelled' || !a.cancelled_at) return false;
  const start = startOf(a);
  const at = new Date(a.cancelled_at);
  if (!start || isNaN(at.getTime())) return false;
  const diffH = (start.getTime() - at.getTime()) / 3_600_000;
  return diffH < lateHours;
}

export type Reliability = { noShows: number; lateCancels: number; visits: number };

/** Counts over one client's appointments. Personal events never count. */
export function clientReliability(appts: ApptLike[], lateHours: number = LATE_HOURS): Reliability {
  let noShows = 0, lateCancels = 0, visits = 0;
  for (const a of appts) {
    if (a.kind === 'personal') continue;
    if (isNoShow(a)) noShows++;
    else if (isLateCancellation(a, lateHours)) lateCancels++;
    else if (a.confirmation_status !== 'cancelled') visits++;
  }
  return { noShows, lateCancels, visits };
}

/** Hebrew one-liner for the client card, or null when there is nothing to say. */
export function reliabilityLine(r: Reliability): string | null {
  const parts: string[] = [];
  if (r.noShows) parts.push(r.noShows === 1 ? 'לא הגיעה פעם אחת' : `לא הגיעה ${r.noShows} פעמים`);
  if (r.lateCancels) parts.push(r.lateCancels === 1 ? 'ביטול מאוחר אחד' : `${r.lateCancels} ביטולים מאוחרים`);
  return parts.length ? parts.join(' · ') : null;
}

/** May this appointment be marked no-show? Only a real client visit, on or after its day. */
export function canMarkNoShow(a: ApptLike, todayKey: string): boolean {
  if (a.kind === 'personal') return false;
  if (a.confirmation_status === 'cancelled' || a.confirmation_status === NO_SHOW) return false;
  return !!a.date && String(a.date) <= todayKey;
}

/**
 * The dates of a series: the first is `startDate` itself, then every
 * `everyWeeks` weeks, `count` dates in all. YYYY-MM-DD in, YYYY-MM-DD out,
 * computed on the calendar day so DST never shifts a Tuesday.
 */
export function recurrenceDates(startDate: string, everyWeeks: number, count: number): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ''));
  const n = Math.max(1, Math.min(52, Math.floor(Number(count) || 0)));
  const w = Math.max(1, Math.min(12, Math.floor(Number(everyWeeks) || 0)));
  if (!m) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + i * w * 7);
    const p = (x: number) => String(x).padStart(2, '0');
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

/** "12.10, 2.11" for a toast, in order. */
export function shortDates(dates: string[]): string {
  return dates.map((d) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d); return m ? `${Number(m[2])}.${Number(m[1])}` : d; }).join(', ');
}

/** The presets for a personal event: what it is, and how it shapes the time. */
export type PersonalPreset = {
  key: string;
  title: string;
  icon: string;
  allDay: boolean;
  /** minutes from midnight; ignored when allDay */
  startMinute?: number;
  /** minutes; ignored when allDay */
  duration?: number;
  /** extra days after the first, for a range */
  spanDays?: number;
};

export const PERSONAL_PRESETS: PersonalPreset[] = [
  { key: 'lunch', title: 'הפסקת צהריים', icon: '☕', allDay: false, startMinute: 13 * 60, duration: 60 },
  { key: 'dayoff', title: 'יום חופש', icon: '🌿', allDay: true },
  { key: 'vacation', title: 'חופשה', icon: '✈', allDay: true, spanDays: 6 },
];

/** Apply a preset to a personal-event draft. Pure; returns the new draft. */
export function applyPersonalPreset<T extends { from: string; to: string; title: string; allDay: boolean; startMinute: number; duration: number }>(draft: T, preset: PersonalPreset): T {
  const next: T = { ...draft, title: preset.title, allDay: preset.allDay };
  if (preset.allDay) {
    if (preset.spanDays) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.from);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + preset.spanDays);
        const p = (x: number) => String(x).padStart(2, '0');
        next.to = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      }
    } else {
      next.to = draft.from;
    }
  } else {
    next.to = draft.from;
    if (preset.startMinute != null) next.startMinute = preset.startMinute;
    if (preset.duration != null) next.duration = preset.duration;
  }
  return next;
}

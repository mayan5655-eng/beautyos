// lib/monthValue.ts
//
// "מה קלמיה עשתה בשבילך החודש": the value a month of Kalmea brought her, counted only from what the app actually recorded.
// Pure, so the home card and its test share one definition. Nothing is estimated: no "hours saved", no projected money.
//
//   bookedOnline    appointments a client booked herself through the booking page (appointments.self_booked), not cancelled
//   onlineRevenue   what was paid (non-voided receipts) for those appointments
//   confirmed       appointments the client confirmed from the WhatsApp confirmation (confirmation_sent + confirmed)
//   newClients      client cards created this month
//
// Month = the calendar month of `now` in the app's own YYYY-MM-DD dates (appointments.date), and created_at's first 10 chars.

export type MonthValueAppt = { id?: unknown; date?: string | null; self_booked?: unknown; confirmation_status?: unknown; confirmation_sent?: unknown };
export type MonthValueReceipt = { appointment_id?: unknown; amount?: unknown; voided?: unknown };
export type MonthValueClient = { created_at?: string | null };

export type MonthValue = { bookedOnline: number; onlineRevenue: number; confirmed: number; newClients: number };

const monthKey = (iso: string | null | undefined) => String(iso || '').slice(0, 7);

export function monthValue(o: { appointments: MonthValueAppt[]; receipts: MonthValueReceipt[]; clients: MonthValueClient[]; month: string }): MonthValue {
  const m = o.month; // 'YYYY-MM'
  const online = new Set<string>();
  let bookedOnline = 0;
  let confirmed = 0;
  for (const a of o.appointments || []) {
    if (monthKey(a.date) !== m || a.confirmation_status === 'cancelled') continue;
    if (a.self_booked === true) { bookedOnline++; online.add(String(a.id ?? '')); }
    if (a.confirmation_sent === true && a.confirmation_status === 'confirmed') confirmed++;
  }
  let onlineRevenue = 0;
  for (const r of o.receipts || []) {
    if (r.voided) continue;
    const id = String(r.appointment_id ?? '');
    if (id && online.has(id)) onlineRevenue += Number(r.amount) || 0;
  }
  let newClients = 0;
  for (const c of o.clients || []) if (monthKey(c.created_at) === m) newClients++;
  return { bookedOnline, onlineRevenue: Math.round(onlineRevenue), confirmed, newClients };
}

/** 'YYYY-MM' for a Date, in its local calendar (the app's dates are local YYYY-MM-DD). */
export function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The card's lines, only the ones with something to say. Empty means the card is not shown at all. */
export function monthValueLines(v: MonthValue): Array<{ key: string; big: string; text: string }> {
  const out: Array<{ key: string; big: string; text: string }> = [];
  if (v.bookedOnline > 0) {
    out.push({
      key: 'online',
      big: String(v.bookedOnline),
      text: v.bookedOnline === 1 ? 'תור שלקוחה קבעה לבד דרך הקישור' : 'תורים שלקוחות קבעו לבד דרך הקישור',
    });
    if (v.onlineRevenue > 0) out.push({ key: 'revenue', big: `₪${v.onlineRevenue.toLocaleString('he-IL')}`, text: 'שולמו על התורים האלה' });
  }
  if (v.confirmed > 0) out.push({ key: 'confirmed', big: String(v.confirmed), text: v.confirmed === 1 ? 'לקוחה אישרה הגעה בוואטסאפ' : 'לקוחות אישרו הגעה בוואטסאפ' });
  if (v.newClients > 0) out.push({ key: 'new', big: String(v.newClients), text: v.newClients === 1 ? 'לקוחה חדשה נוספה' : 'לקוחות חדשות נוספו' });
  return out;
}

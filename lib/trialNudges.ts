// lib/trialNudges.ts
//
// Which in-app nudge, if any, belongs on this day of the trial. Three of them, and nothing else:
//   day 1   -> send the booking link to one client (the first value)
//   day 10  -> here is what your month looks like, record the first payment
//   day 23  -> the trial ends soon, here is what you built and the regular price
//
// In-app only: a card she can dismiss. No WhatsApp and no email, ever, from here (owner decision 2026-10-18).
// Pure functions, so the days can be tested at any date. Days are counted in Israel's calendar (Asia/Jerusalem), because "day 1" is
// the day she signed up as she lives it, not as UTC sees it.

export type NudgeKey = 'day1' | 'day10' | 'day23'

/** The first day of each nudge, and how many days it stays visible so a busy week does not skip it. */
export const NUDGE_DAYS: Array<{ key: NudgeKey; day: number; visibleDays: number }> = [
  { key: 'day1', day: 1, visibleDays: 2 },
  { key: 'day10', day: 10, visibleDays: 2 },
  { key: 'day23', day: 23, visibleDays: 2 },
]

const jerusalemYmd = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** 1 on the day the trial started, 2 the next calendar day (Israel time), and so on. null when the start is unknown. */
export function trialDayNumber(trialStartedAt: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!trialStartedAt) return null
  const start = trialStartedAt instanceof Date ? trialStartedAt : new Date(trialStartedAt)
  if (Number.isNaN(start.getTime())) return null
  const a = Date.parse(jerusalemYmd(start) + 'T00:00:00Z')
  const b = Date.parse(jerusalemYmd(now) + 'T00:00:00Z')
  return Math.floor((b - a) / 86_400_000) + 1
}

export interface NudgeInput {
  /** The effective plan status (lib/planState): only a live trial is ever nudged. */
  status: string | null | undefined
  trialStartedAt: Date | string | null | undefined
  now?: Date
}

/** The nudge for today, or null. A paying, blocked or undated tenant never gets one. */
export function pickTrialNudge(input: NudgeInput): { key: NudgeKey; day: number } | null {
  if (input.status !== 'trial') return null
  const day = trialDayNumber(input.trialStartedAt, input.now)
  if (day === null || day < 1) return null
  for (const n of NUDGE_DAYS) {
    if (day >= n.day && day < n.day + n.visibleDays) return { key: n.key, day }
  }
  return null
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : `${n} ${many}`)

export interface NudgeCopy {
  title: string
  body: string
  /** What the button does: the component maps this to a real action. */
  action: 'copy_link' | 'open_cashier' | 'contact'
  actionLabel: string
}

export function nudgeCopy(key: NudgeKey, counts: { appointments: number; clients: number }): NudgeCopy {
  const appts = Math.max(0, Math.floor(counts.appointments || 0))
  const clients = Math.max(0, Math.floor(counts.clients || 0))
  if (key === 'day1') {
    // The first booking can arrive on day 1 (the new-tenant walk got one within minutes). Then "get your first
    // booking" is stale advice on every screen: congratulate, and ask for the next one instead.
    if (appts > 0) {
      return {
        title: 'התור הראשון כבר ביומן 🌸',
        body: 'איזו התחלה! עכשיו שלחי את הקישור לקביעת תור לעוד לקוחה או שתיים, וככה היומן מתמלא בלי להרים טלפון.',
        action: 'copy_link',
        actionLabel: 'העתקת הקישור לקביעת תור',
      }
    }
    return {
      title: 'היום הראשון שלך בקלמיה',
      body: 'הצעד הכי שווה עכשיו: לשלוח ללקוחה אחת את הקישור לקביעת תור, אפשר להדביק אותו בוואטסאפ. כך תקבלי את התור הראשון בלי להרים טלפון.',
      action: 'copy_link',
      actionLabel: 'העתקת הקישור לקביעת תור',
    }
  }
  if (key === 'day10') {
    // An empty calendar has nothing to charge: send her to the first booking, not to the cashier.
    if (appts === 0) {
      return {
        title: 'עברו 10 ימים. היומן עוד ריק',
        body: 'עוד אין תורים ביומן. שלחי את הקישור לקביעת תור ללקוחה אחת, והתור הראשון ייכנס לבד.',
        action: 'copy_link',
        actionLabel: 'העתקת הקישור לקביעת תור',
      }
    }
    return {
      title: 'עברו 10 ימים. ככה נראה החודש שלך עד עכשיו',
      body: `${plural(appts, 'תור אחד ביומן', 'תורים ביומן')}, ${clients === 0 ? 'עוד אין לקוחות' : plural(clients, 'לקוחה אחת', 'לקוחות')}. כדאי לרשום עכשיו את התשלום הראשון, כדי לראות את ההכנסות שלך מסודרות.`,
      action: 'open_cashier',
      actionLabel: 'פתיחת הקופה',
    }
  }
  return {
    title: 'תקופת ההתנסות מסתיימת בקרוב',
    body: `${appts === 0 && clients === 0 ? 'עוד לא קבענו תורים יחד, ואפשר להתחיל מהקישור לקביעת תור שלך.' : `עד עכשיו יש לך ${plural(appts, 'תור אחד', 'תורים')}, ${clients === 0 ? 'ועוד אין לקוחות' : plural(clients, 'לקוחה אחת', 'לקוחות')}.`} המחיר הרגיל הוא 499 ₪ לחודש. כתבי לנו ונסגור את זה בקלות. כל מה שיצרת נשאר שלך.`,
    action: 'contact',
    actionLabel: 'לדבר איתנו',
  }
}

/** localStorage key for "she closed this one". Per business, so two accounts on one phone do not hide each other's. */
export const nudgeStorageKey = (tenantId: string | null | undefined, key: NudgeKey): string => `kalmea_nudge_${tenantId || 'x'}_${key}`

// lib/feedbackBanner.ts
//
// The feedback banner: who sees it, when it comes back, and what is kept. Pure functions, so the days can be tested at any date.
//   when      from day 4 (three full days after signup, Israel calendar), once she has really used the system: at least one
//             appointment or client. A live trial or a paying business only; never blocked, undated or demo.
//   snooze    "לא עכשיו" or ✕ brings it back after 3 days. After the third time it stays away for good: asking a fourth time is nagging.
//             Kept on this phone (localStorage), like TrialNudge.
//   once      the table allows one row per business (see add_product_feedback_2026-10-30.sql); a sent answer is never asked again.
//
// The rating is stars, the five questions are emoji faces, and free text is optional. Only the stars are required: a half-answered
// form still tells us something, and a required question is how a busy woman ends up closing it.

import { trialDayNumber } from './trialNudges.ts'

/** Day 1 is the signup day, so day 4 is three full days after it. */
export const FEEDBACK_FIRST_DAY = 4
export const FEEDBACK_SNOOZE_DAYS = 3
export const FEEDBACK_MAX_SNOOZES = 3
/** It never greets her on arrival: she gets a moment to see her day first. */
export const FEEDBACK_SHOW_DELAY_MS = 6000
export const FEEDBACK_MAX_TEXT = 2000

export const NOT_YET = 'not_yet'

export interface FeedbackQuestion {
  id: string
  label: string
  /** The short name on the owner screen. */
  shortLabel: string
  /** Offers "עוד לא צפיתי" beside the faces, and a link to the videos. */
  videos?: boolean
}

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { id: 'ease', label: 'כמה קל לך להתמצא בקלמיה?', shortLabel: 'קלות שימוש' },
  { id: 'calendar', label: 'איך היומן וקביעת התורים עובדים לך?', shortLabel: 'יומן ותורים' },
  { id: 'time', label: 'כמה קלמיה חוסכת לך זמן ביום יום?', shortLabel: 'חיסכון בזמן' },
  { id: 'videos', label: 'סרטוני ההדרכה עזרו לך?', shortLabel: 'סרטוני הדרכה', videos: true },
  { id: 'recommend', label: 'כמה סביר שתמליצי עלינו לחברה מהמקצוע?', shortLabel: 'המלצה לחברה' },
]

export const FEEDBACK_FACES: Array<{ value: number; face: string; label: string }> = [
  { value: 1, face: '😞', label: 'ממש לא' },
  { value: 2, face: '🙁', label: 'פחות' },
  { value: 3, face: '😐', label: 'בסדר' },
  { value: 4, face: '🙂', label: 'טוב' },
  { value: 5, face: '😍', label: 'מעולה' },
]

export const faceFor = (value: unknown): string => FEEDBACK_FACES.find((f) => f.value === value)?.face ?? ''

export interface EligibilityInput {
  /** The effective plan status (lib/planState). */
  status: string | null | undefined
  trialStartedAt: Date | string | null | undefined
  isDemo?: boolean
  appointments: number
  clients: number
  now?: Date
}

export function feedbackEligible(input: EligibilityInput): boolean {
  if (input.isDemo) return false
  if (input.status !== 'trial' && input.status !== 'active') return false
  const day = trialDayNumber(input.trialStartedAt, input.now)
  if (day === null || day < FEEDBACK_FIRST_DAY) return false
  return input.appointments > 0 || input.clients > 0
}

export const feedbackStorageKey = (tenantId: string | null | undefined): string => `kalmea_feedback_v1_${tenantId ?? ''}`

export interface FeedbackLocalState {
  /** Epoch ms it may come back; 0 when it was never snoozed. */
  until: number
  snoozes: number
  /** Sent, or the server says this business already answered. */
  done: boolean
}

export function readFeedbackState(raw: string | null | undefined): FeedbackLocalState {
  try {
    const v = JSON.parse(raw || '{}')
    return {
      until: Number.isFinite(v?.until) ? v.until : 0,
      snoozes: Number.isFinite(v?.snoozes) ? v.snoozes : 0,
      done: v?.done === true,
    }
  } catch {
    return { until: 0, snoozes: 0, done: false }
  }
}

export function feedbackDue(state: FeedbackLocalState, nowMs: number): boolean {
  return !state.done && state.snoozes < FEEDBACK_MAX_SNOOZES && nowMs >= state.until
}

export function snoozeFeedback(state: FeedbackLocalState, nowMs: number): FeedbackLocalState {
  return { ...state, snoozes: state.snoozes + 1, until: nowMs + FEEDBACK_SNOOZE_DAYS * 86_400_000 }
}

export type FeedbackAnswers = Record<string, number | typeof NOT_YET>

export type CleanFeedback =
  | { ok: true; rating: number; answers: FeedbackAnswers; freeText: string | null }
  | { ok: false; error: string }

/** The request body, reduced to what the table may hold. Unknown questions and impossible values are dropped, never stored. */
export function cleanFeedback(body: unknown): CleanFeedback {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const rating = b.rating
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'בחרי כמה כוכבים מגיעים לנו' }
  }
  const raw = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>
  const answers: FeedbackAnswers = {}
  for (const q of FEEDBACK_QUESTIONS) {
    const v = raw[q.id]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) answers[q.id] = v
    else if (q.videos && v === NOT_YET) answers[q.id] = NOT_YET
  }
  const text = typeof b.freeText === 'string' ? b.freeText.trim().slice(0, FEEDBACK_MAX_TEXT) : ''
  return { ok: true, rating, answers, freeText: text || null }
}

/** One table is enough for one answer per business, so "not there yet" must not be mistaken for any other failure. */
export const isMissingTable = (message: string | null | undefined): boolean =>
  /product_feedback/i.test(message || '') && /does not exist|schema cache|relation/i.test(message || '')

export interface FeedbackRow {
  tenant_id: string
  rating: number
  answers: Record<string, unknown> | null
  free_text: string | null
  created_at: string
}

export interface FeedbackSummary {
  count: number
  avgRating: number | null
  questions: Array<{ id: string; label: string; avg: number | null; answered: number; notYet: number }>
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function feedbackSummary(rows: FeedbackRow[]): FeedbackSummary {
  const avg = (ns: number[]): number | null => (ns.length ? round1(ns.reduce((a, b) => a + b, 0) / ns.length) : null)
  return {
    count: rows.length,
    avgRating: avg(rows.map((r) => r.rating)),
    questions: FEEDBACK_QUESTIONS.map((q) => {
      const vals = rows.map((r) => r.answers?.[q.id])
      const nums = vals.filter((v): v is number => typeof v === 'number')
      return { id: q.id, label: q.shortLabel, avg: avg(nums), answered: nums.length, notYet: vals.filter((v) => v === NOT_YET).length }
    }),
  }
}

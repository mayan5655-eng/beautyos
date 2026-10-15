// lib/ownerControl.ts
//
// The owner-only control screens (app/dashboard/owner/*). Pure functions over TENANT-LEVEL metadata only: business name,
// plan status, dates and the signup source label. Nothing here knows about a client, an appointment, a receipt, a lead or
// a message, and the rows it accepts have no such field (test-owner-control.ts pins that).

import { planState } from './planState.ts'
import type { PlanStatus } from './planState.ts'
import { isDemoTenantId } from './demoTenants.ts'

/** Sign-ups on or before 20.10.2026, end of day Israel time (UTC+3 that day), keep the launch price of 349. */
export const LAUNCH_PRICE_CUTOFF_ISO = '2026-10-20T20:59:59Z'

/** The only columns the owner screens ever read from public.tenants. */
export const OWNER_TENANT_COLUMNS = 'id, name, created_at, plan_status, trial_started_at, trial_ends_at, signup_source' as const

export type OwnerTenant = {
  id: string
  name: string | null
  created_at: string | null
  plan_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  signup_source: string | null
}

const MS_DAY = 24 * 60 * 60 * 1000

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : NaN
}

/** Real businesses only: the demo tenants and the viewer's own business are not signups. */
export function realTenants<T extends { id: string }>(rows: T[], ownTenantId: string | null): T[] {
  return rows.filter((r) => !isDemoTenantId(r.id) && r.id !== ownTenantId)
}

/** The instant today began in Israel (00:00 Asia/Jerusalem), as epoch ms. */
export function israelDayStart(now: Date): number {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' })
  const day = fmt.format(now) // yyyy-mm-dd
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`)
  for (const offsetHours of [3, 2]) {
    const c = utcMidnight - offsetHours * 3600 * 1000
    if (fmt.format(new Date(c)) === day && hour.format(new Date(c)) === '00') return c
  }
  return utcMidnight - 2 * 3600 * 1000
}

export type SignupWindows = { today: number; last7: number; last30: number; total: number }

export function signupWindows(rows: OwnerTenant[], now: Date): SignupWindows {
  const t0 = israelDayStart(now)
  const n = now.getTime()
  const out = { today: 0, last7: 0, last30: 0, total: rows.length }
  for (const r of rows) {
    const c = ms(r.created_at)
    if (!Number.isFinite(c)) continue
    if (c >= t0) out.today++
    if (c >= n - 7 * MS_DAY) out.last7++
    if (c >= n - 30 * MS_DAY) out.last30++
  }
  return out
}

export const UNKNOWN_SOURCE_HE = 'לא ידוע'

export type SourceCount = { source: string; last30: number; total: number }

export function signupsBySource(rows: OwnerTenant[], now: Date): SourceCount[] {
  const map = new Map<string, SourceCount>()
  const n = now.getTime()
  for (const r of rows) {
    const key = (r.signup_source || '').trim() || UNKNOWN_SOURCE_HE
    const e = map.get(key) || { source: key, last30: 0, total: 0 }
    e.total++
    const c = ms(r.created_at)
    if (Number.isFinite(c) && c >= n - 30 * MS_DAY) e.last30++
    map.set(key, e)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || b.last30 - a.last30 || a.source.localeCompare(b.source))
}

export type NewestSignup = { id: string; name: string; created_at: string; source: string }

export function newestSignups(rows: OwnerTenant[], limit = 20): NewestSignup[] {
  return rows
    .filter((r) => Number.isFinite(ms(r.created_at)))
    .sort((a, b) => ms(b.created_at) - ms(a.created_at))
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: (r.name || '').trim() || 'ללא שם', created_at: r.created_at as string, source: (r.signup_source || '').trim() || UNKNOWN_SOURCE_HE }))
}

export type EndingTrial = { id: string; name: string; trial_ends_at: string; daysLeft: number }

/** Trials that run out within the next `days` days (default 7), soonest first. An already-elapsed trial is not "ending". */
export function trialsEndingSoon(rows: OwnerTenant[], now: Date, days = 7): EndingTrial[] {
  const n = now.getTime()
  const out: EndingTrial[] = []
  for (const r of rows) {
    const p = planState(r, now)
    if (p.status !== 'trial' || !p.trialEndsAt) continue
    const end = p.trialEndsAt.getTime()
    if (end < n || end > n + days * MS_DAY) continue
    out.push({ id: r.id, name: (r.name || '').trim() || 'ללא שם', trial_ends_at: p.trialEndsAt.toISOString(), daysLeft: Math.max(0, Math.ceil((end - n) / MS_DAY)) })
  }
  return out.sort((a, b) => Date.parse(a.trial_ends_at) - Date.parse(b.trial_ends_at))
}

export function planStatusCounts(rows: OwnerTenant[], now: Date): Record<PlanStatus, number> {
  const c: Record<PlanStatus, number> = { trial: 0, active: 0, expired: 0, paused: 0 }
  for (const r of rows) c[planState(r, now).status]++
  return c
}

export type LaunchPriceRow = { id: string; name: string; created_at: string; status: PlanStatus }

/** Everyone who signed up on or before the cutoff, oldest first. The decision stays with a person: this only lists. */
export function launchPriceQualifiers(rows: OwnerTenant[], now: Date, cutoffIso = LAUNCH_PRICE_CUTOFF_ISO): LaunchPriceRow[] {
  const cut = Date.parse(cutoffIso)
  return rows
    .filter((r) => {
      const c = ms(r.created_at)
      return Number.isFinite(c) && c <= cut
    })
    .sort((a, b) => ms(a.created_at) - ms(b.created_at))
    .map((r) => ({ id: r.id, name: (r.name || '').trim() || 'ללא שם', created_at: r.created_at as string, status: planState(r, now).status }))
}

export type ActivityRow = { id: string; name: string; lastActivityAt: string | null }

/** Business name and the timestamp only. Anything else on a row from the metrics function is dropped here. */
export function activityRows(raw: Array<Record<string, unknown>>, ownTenantId: string | null): ActivityRow[] {
  return raw
    .filter((r) => typeof r.id === 'string' && !isDemoTenantId(r.id as string) && r.id !== ownTenantId)
    .map((r) => {
      const t = typeof r.last_activity_at === 'string' && Number.isFinite(Date.parse(r.last_activity_at)) ? (r.last_activity_at as string) : null
      return { id: r.id as string, name: (typeof r.name === 'string' && r.name.trim()) || 'ללא שם', lastActivityAt: t }
    })
    .sort((a, b) => (b.lastActivityAt ? Date.parse(b.lastActivityAt) : -1) - (a.lastActivityAt ? Date.parse(a.lastActivityAt) : -1))
}

/** A date for her screen: 16.10.2026, in Israel's calendar. */
export function dateHe(iso: string | null | undefined): string {
  const t = ms(iso)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t)).replace(/\//g, '.')
}

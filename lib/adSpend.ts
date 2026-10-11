// lib/adSpend.ts
//
// Pure helpers for the ad_spend table (supabase/migrations/add_ad_spend.sql): what a manual entry may look like,
// the day window the daily job pulls, and how a Graph error is told apart from "the permission is not approved
// yet". No I/O here, so it is all testable (test-ad-spend.ts).

export const FACEBOOK_SOURCE_LABEL = 'פייסבוק';
export const MAX_SPEND_AMOUNT = 1_000_000;
export const PULL_DAYS = 35;

export type ManualSpendInput = { day: string; source: string; amount: number };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A manual entry from the browser, reduced to what may be stored; or the Hebrew reason it was refused. */
export function parseManualSpend(body: unknown): { ok: true; value: ManualSpendInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const day = typeof b.day === 'string' ? b.day.trim() : '';
  if (!validDay(day)) return { ok: false, error: 'תאריך לא תקין' };
  const source = typeof b.source === 'string' ? b.source.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (!source) return { ok: false, error: 'חסר מקור' };
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_SPEND_AMOUNT) return { ok: false, error: 'סכום לא תקין' };
  return { ok: true, value: { day, source, amount: Math.round(amount * 100) / 100 } };
}

/** The [since, until] window of the daily pull, as ISO day keys, ending yesterday (today is still counting). */
export function pullWindow(now: Date = new Date(), days: number = PULL_DAYS): { since: string; until: string } {
  const until = new Date(now.getTime() - 864e5);
  const since = new Date(until.getTime() - (days - 1) * 864e5);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

/** True when a Graph error means "this token has no ads permission (yet)" rather than a real outage. */
export function isAdsPermissionError(err: unknown): boolean {
  const e = err as { fbError?: { code?: number; type?: string; message?: string }; message?: string } | null;
  const fb = e?.fbError;
  if (fb && (fb.code === 10 || fb.code === 190 || (fb.code !== undefined && fb.code >= 200 && fb.code <= 299))) return true;
  const msg = String(fb?.message || e?.message || '');
  return /ads_read|ads_management|permission|requires/i.test(msg);
}

/** Rows to upsert for one tenant from the Graph answer. Zero-spend days are kept: "ran, spent nothing" is data. */
export function spendRowsForUpsert(tenantId: string, rows: { day: string; spend: number; currency?: string }[]) {
  return rows
    .filter((r) => validDay(r.day) && Number.isFinite(r.spend) && r.spend >= 0)
    .map((r) => ({
      tenant_id: tenantId,
      day: r.day,
      source: FACEBOOK_SOURCE_LABEL,
      amount: Math.round(r.spend * 100) / 100,
      currency: r.currency || 'ILS',
      origin: 'facebook' as const,
      campaign_id: '',
      updated_at: new Date().toISOString(),
    }));
}

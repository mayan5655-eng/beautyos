// lib/cronFanout.js
//
// Run a job once per tenant: in parallel, with a cap, each tenant on its own.
//
// The all-tenant crons used to be one serial loop. At 50 tenants that is a few
// hundred sequential WhatsApp sends against a 300-second limit, and the failure
// mode was the worst one available: the platform kills the function mid-loop,
// the tenants at the end of the list are simply never reminded, and nothing
// anywhere says who. One tenant whose send hangs held up every tenant behind it.
//
// What this guarantees:
//   * ISOLATION - a worker that throws, or hangs past `itemTimeoutMs`, is
//     recorded as failed / timed_out for THAT tenant and the rest carry on;
//   * a CAP - at most `concurrency` tenants in flight, so a burst cannot open a
//     hundred sockets to the one WhatsApp number at once;
//   * a DEADLINE - no tenant is STARTED after `budgetMs`. The run then ends on
//     its own terms, inside the platform limit (budget + one item timeout must
//     stay under maxDuration), instead of being killed;
//   * a RECORD - the result lists every tenant as ok, failed, timed_out or
//     notStarted. Nothing a run did not finish is ever absent from its report.
//
// A timed-out worker cannot be cancelled (JavaScript cannot), so it may still
// be running when the run returns; its tenant is reported as timed_out and is
// NOT retried automatically - the report is how someone knows to look.

class TimedOut extends Error {}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => Promise<any>} worker
 * @param {{ keyOf?: (item: T) => string, concurrency?: number, budgetMs?: number,
 *           itemTimeoutMs?: number, now?: () => number }} [opts]
 */
export async function fanOut(items, worker, opts = {}) {
  const {
    keyOf = (x) => String(x), concurrency = 4,
    budgetMs = 200_000, itemTimeoutMs = 60_000, now = () => Date.now(),
  } = opts;
  const start = now();
  const queue = [...items];
  const outcomes = [];

  const lane = async () => {
    for (;;) {
      if (queue.length === 0) return;
      if (now() - start > budgetMs) return; // leave the rest for the report
      const item = queue.shift();
      const key = keyOf(item);
      const t0 = now();
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => worker(item)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new TimedOut(`no answer within ${itemTimeoutMs}ms`)), itemTimeoutMs); }),
        ]);
        outcomes.push({ key, status: 'ok', ms: now() - t0, value });
      } catch (err) {
        outcomes.push({
          key, status: err instanceof TimedOut ? 'timed_out' : 'failed',
          error: err?.message || String(err), ms: now() - t0,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, lane));

  const notStarted = queue.map(keyOf);
  const by = (s) => outcomes.filter((o) => o.status === s).map((o) => o.key);
  return {
    outcomes,
    summary: {
      total: items.length,
      ok: by('ok').length,
      failed: by('failed'),
      timedOut: by('timed_out'),
      notStarted,
      ms: now() - start,
      complete: notStarted.length === 0 && by('failed').length === 0 && by('timed_out').length === 0,
    },
  };
}

/**
 * One operator-facing sentence about everything a run did not finish, or ''
 * when it finished everything. Short ids, because a tenant uuid is not
 * something a person reads.
 */
export function describeMissed(label, summary, { nameOf = (k) => String(k).slice(0, 8) } = {}) {
  if (!summary || summary.complete) return '';
  const part = (title, keys) => (keys.length ? `${title} (${keys.length}): ${keys.map(nameOf).join(', ')}` : '');
  return [
    `${label} - לא הושלם לכל העסקים.`,
    part('לא התחילו', summary.notStarted),
    part('נכשלו', summary.failed),
    part('נתקעו', summary.timedOut),
  ].filter(Boolean).join('\n');
}

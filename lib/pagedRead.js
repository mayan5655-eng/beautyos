// lib/pagedRead.js
//
// Read EVERY row a query matches, and say so when it could not.
//
// Why this exists. PostgREST answers any read with at most `max_rows` rows
// (1000 by default) and does not say it stopped: no error, no flag, a short
// result that looks exactly like the whole table. The app read whole tables
// with `.select('*')` in three places that matter - the dashboard boot, the
// winback / package reminders, the nightly invariants - so past 1,000 rows each
// quietly worked from a fragment: a calendar missing recent appointments, a
// client who visited yesterday told "we have not seen you in a while", a
// monitor reporting "healthy" on a partial check. A truncated read that nobody
// can tell was truncated is the worst kind of wrong.
//
// What it does:
//   * asks for an exact count with the first page, then fetches the remaining
//     pages (a few at a time) and checks it received what the count promised;
//   * pages by the size the SERVER actually returned, so a lower max_rows
//     setting still reads the whole table instead of mistaking a capped page for
//     the last one;
//   * orders by a unique column (or a list of columns that together are one) so
//     pages do not overlap or skip;
//   * has a hard `ceiling`. Past it the read STOPS and returns complete:false,
//     truncated:true, with the real total - the caller is told, never guessing;
//   * returns the supabase-js shape ({ data, error }) plus { total, complete,
//     truncated, fetched }. A failed page fails the whole read (data: null):
//     half a table is never returned as if it were a table.
//
// Callers: if `complete` is false they must not present the data as everything.
// The boot shows a notice, the crons refuse to act on what they cannot see.

export const PAGE_SIZE = 1000;
export const CEILING = 50000;

/**
 * @param {{ from: Function }} db supabase-js client
 * @param {string} table
 * @param {{ columns?: string, order?: string, filter?: (q: any) => any,
 *           ceiling?: number, concurrency?: number, pageSize?: number }} [opts]
 * @returns {Promise<{ data: any[] | null, error: any, total: number | null,
 *                     fetched: number, complete: boolean, truncated: boolean }>}
 */
export async function readAllRows(db, table, opts = {}) {
  const {
    columns = '*', order = 'id', filter = (q) => q,
    ceiling = CEILING, concurrency = 4, pageSize = PAGE_SIZE,
  } = opts;

  const page = (from, to, withCount) =>
    [].concat(order)
      .reduce((q, col) => q.order(col), filter(db.from(table).select(columns, withCount ? { count: 'exact' } : undefined)))
      .range(from, to);

  const fail = (error) => ({ data: null, error, total: null, fetched: 0, complete: false, truncated: false });
  const dedupe = (rows) => {
    if (!rows.length || rows.some((r) => r == null || r.id === undefined)) return rows;
    const seen = new Set();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const first = await page(0, pageSize - 1, true);
    if (first.error) return fail(first.error);
    const rows = first.data || [];
    const total = typeof first.count === 'number' ? first.count : null;
    const step = rows.length; // what the server really gives per page
    if (step === 0) return { data: [], error: null, total: total ?? 0, fetched: 0, complete: true, truncated: false };

    if (total === null) {
      // No count came back: walk forward until a page is empty.
      let acc = rows;
      for (let from = step; acc.length < ceiling; ) {
        const nxt = await page(from, from + step - 1, false);
        if (nxt.error) return fail(nxt.error);
        const got = nxt.data || [];
        if (got.length === 0) break;
        acc = acc.concat(got);
        from += got.length;
      }
      const data = dedupe(acc);
      const truncated = data.length >= ceiling;
      return { data, error: null, total: null, fetched: data.length, complete: !truncated, truncated };
    }

    const target = Math.min(total, ceiling);
    const offsets = [];
    for (let o = step; o < target; o += step) offsets.push(o);
    const pages = new Array(offsets.length);
    let failure = null;
    let nextIdx = 0;
    const worker = async () => {
      while (!failure && nextIdx < offsets.length) {
        const i = nextIdx++;
        const res = await page(offsets[i], offsets[i] + step - 1, false);
        if (res.error) { failure = res.error; return; }
        pages[i] = res.data || [];
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, offsets.length) }, worker));
    if (failure) return fail(failure);

    const data = dedupe(rows.concat(...pages));
    const truncated = total > ceiling;
    if (!truncated && data.length < total && attempt === 0) continue; // rows shifted mid-read: once more
    return { data, error: null, total, fetched: data.length, complete: !truncated && data.length >= total, truncated };
  }
  return fail({ message: 'readAllRows: row count kept changing while reading' });
}

// testkit/capDb.js
//
// An in-memory stand-in for the slice of supabase-js the app uses, with the ONE
// behaviour the older test fakes left out: PostgREST's max-rows cap. A real
// Supabase project answers any read with at most `maxRows` rows (default 1000),
// whatever range was asked for, and says nothing - no error, no flag. The older
// fake in test-smart-reminders.js returned every row it held, so a suite that
// ran "50 tenants x 200 clients" passed on code that silently dropped
// everything past row 1000 in production.
//
//   const db = makeCapDb({ appointments: [...] }, { maxRows: 1000 });
//
// Supports what the app's reads and the jobs under test use: select (with
// {count:'exact'} and head), eq/neq/is/not/in/gte/lte/like, order, range, limit,
// insert, then. `db.log` records every read so a test can assert how it paged.
/** @param {Record<string, any[]>} tables @param {{ maxRows?: number, failPage?: ((from: number) => boolean) | null }} [opts] */
export function makeCapDb(tables, { maxRows = 1000, failPage = null } = {}) {
  const log = [];
  const db = {
    log,
    tables,
    from(table) {
      let rows = tables[table] ? [...tables[table]] : [];
      let wantCount = false, head = false, ord = [], lo = 0, hi = null, lim = null;
      const entry = { table, range: null, count: false, order: null };
      const chain = {
        select(_cols, opts) { if (opts?.count) wantCount = entry.count = true; if (opts?.head) head = true; return chain; },
        eq(c, v) { rows = rows.filter((r) => r[c] === v); return chain; },
        neq(c, v) { rows = rows.filter((r) => r[c] !== v); return chain; },
        is(c, v) { rows = rows.filter((r) => (v === null ? r[c] == null : r[c] === v)); return chain; },
        not(c, op, v) { if (op === 'is' && v === null) rows = rows.filter((r) => r[c] != null); return chain; },
        in(c, vs) { const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return chain; },
        gte(c, v) { rows = rows.filter((r) => r[c] >= v); return chain; },
        lte(c, v) { rows = rows.filter((r) => r[c] <= v); return chain; },
        like(c, pat) { const re = new RegExp('^' + pat.replace(/%/g, '.*') + '$'); rows = rows.filter((r) => re.test(String(r[c] ?? ''))); return chain; },
        order(c) { ord.push(c); entry.order = ord.slice(); return chain; },
        range(a, b) { lo = a; hi = b; entry.range = [a, b]; return chain; },
        limit(n) { lim = n; return chain; },
        insert(row) { (tables[table] = tables[table] || []).push(...[].concat(row)); return Promise.resolve({ error: null }); },
        then(res, rej) {
          log.push(entry);
          if (failPage && entry.range && failPage(entry.range[0])) {
            return Promise.resolve({ data: null, error: { message: 'simulated page failure' }, count: null }).then(res, rej);
          }
          if (ord.length) rows.sort((x, y) => { for (const c of ord) { if (x[c] < y[c]) return -1; if (x[c] > y[c]) return 1; } return 0; });
          const total = rows.length;
          let out = hi === null ? rows : rows.slice(lo, hi + 1);
          if (lim !== null) out = out.slice(0, lim);
          out = out.slice(0, maxRows); // <- the cap: silent, whatever was asked for
          return Promise.resolve({ data: head ? null : out, error: null, count: wantCount ? total : null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return db;
}

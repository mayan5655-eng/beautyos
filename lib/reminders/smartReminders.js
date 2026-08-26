// lib/reminders/smartReminders.js
//
// The smart-reminder engine, extracted from app/api/send-smart-reminders so it
// can be driven with a synthetic dataset at target scale. The route is now a
// thin wrapper that supplies the real database and the real WhatsApp sender.
//
// ── Why this was extracted ─────────────────────────────────────────────────
// The bug this fixes only appears at scale, and the production data is far too
// small to show it: 9 clients, 5 with appointments, 0 lapsed. A before/after
// against real data measures 0 vs 0. The only honest proof is to run THIS code
// - not a copy of it - against 50 tenants' worth of synthetic clients with a
// fake db and a fake sender, which is what test-smart-reminders.js does.
//
// ── What was wrong ─────────────────────────────────────────────────────────
// handleReminder() ran `alreadySent()` - a database round trip - once per
// CANDIDATE, before it knew whether anything would be sent. The winback pass
// considers every client whose last visit was 90+ days ago, forever: a client
// who left two years ago was re-queried every single day. The candidate set
// only grows, and the auto_reminders_log table each query scanned grows too.
// Two multiplying curves, and the job spent nearly all its time asking "did I
// already send this?" about people it was not going to message.
//
// Measured round trip for that query: 281 ms from a laptop, ~10-30 ms from
// Vercel. At 4,000 lapsed clients that is 80 seconds of pure lookups on the
// optimistic figure - the function times out having sent nothing.
//
// ── What it does now ───────────────────────────────────────────────────────
//   1. ONE paged read of auto_reminders_log into a Set. No per-candidate query.
//   2. Each pass COLLECTS candidates; nothing sends inline.
//   3. Caps are applied to the collected list, so the run's cost is bounded by
//      construction rather than by hoping the candidate set stays small.
//   4. Sends run with bounded concurrency instead of serially.
//
// ── Why the caps matter beyond timeouts ────────────────────────────────────
// The first run after deploying at scale meets a backlog of thousands of
// never-sent winback candidates. Uncapped, a "fix" would blast all of them.
// That is worse than the timeout: it is a mass WhatsApp to real clients about
// visits from years ago. The cap makes that impossible even if the backlog
// marking is skipped.

/** Global and per-tenant send ceilings for one run. */
export const DEFAULT_CAPS = { perRun: 200, perTenant: 20 };

/** How many sends are in flight at once. */
export const DEFAULT_CONCURRENCY = 6;

/**
 * Priority when the cap bites. Time-sensitive types go first.
 *
 * birthday is FIRST and deliberately so: its reference_id is the year, so a
 * birthday deferred by the cap is a birthday MISSED - tomorrow it is no longer
 * her birthday. winback is last because it has waited 90 days already and can
 * wait one more.
 */
export const TYPE_PRIORITY = ['birthday', 'review', 'package_done', 'winback'];

const PAGE = 1000;

/** "YYYY-MM-DD", `daysAgo` days before `now`, in Israel time. */
export function dateNDaysAgo(daysAgo, now = new Date()) {
  const d = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  d.setDate(d.getDate() - daysAgo);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function logKey(tenantId, clientId, type, referenceId) {
  return `${tenantId}|${clientId}|${type}|${referenceId || ''}`;
}

/**
 * Every already-sent reminder, as a Set of keys.
 *
 * PAGED on purpose. An unbounded select is at the mercy of whatever row cap the
 * API is configured with, and a silently truncated log here does not fail - it
 * re-sends reminders people already received. Paging means a cap can never
 * quietly turn this into a duplicate-message bug.
 *
 * Growth: the log gains at most caps.perRun rows a day (~73k/year at 200/day),
 * four small columns each. If it ever gets genuinely large, add a retention
 * policy - the winback/package keys stay stable, so old rows still matter and
 * must not simply be deleted by age without thought.
 */
export async function loadSentSet(db, stats) {
  const sent = new Set();
  for (let from = 0; ; from += PAGE) {
    stats.queries++;
    const { data, error } = await db
      .from('auto_reminders_log')
      .select('tenant_id, client_id, reminder_type, reference_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`auto_reminders_log read failed: ${error.message}`);
    const rows = data || [];
    for (const r of rows) sent.add(logKey(r.tenant_id, r.client_id, r.reminder_type, r.reference_id));
    if (rows.length < PAGE) break;
  }
  return sent;
}

/** Run `worker` over `items`, at most `limit` in flight. Order-independent. */
export async function pooled(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Spread the global cap across tenants instead of letting the first few take
 * it all. Round-robin by tenant, priority-ordered within each tenant.
 *
 * Without this, 50 tenants sorted by id means tenants near the end of the
 * alphabet never get a reminder out on a busy day.
 */
export function selectWithCaps(candidates, caps) {
  const byTenant = new Map();
  for (const c of candidates) {
    if (!byTenant.has(c.tenantId)) byTenant.set(c.tenantId, []);
    byTenant.get(c.tenantId).push(c);
  }
  for (const list of byTenant.values()) {
    list.sort((a, b) => {
      const p = TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type);
      if (p !== 0) return p;
      return String(a.clientId).localeCompare(String(b.clientId)); // deterministic
    });
  }

  const tenants = [...byTenant.keys()].sort();
  const taken = [];
  const perTenantCount = new Map();
  let exhausted = false;
  while (!exhausted && taken.length < caps.perRun) {
    exhausted = true;
    for (const t of tenants) {
      if (taken.length >= caps.perRun) break;
      const list = byTenant.get(t);
      const used = perTenantCount.get(t) || 0;
      if (used >= caps.perTenant || list.length === 0) continue;
      taken.push(list.shift());
      perTenantCount.set(t, used + 1);
      exhausted = false;
    }
  }

  const deferred = [];
  for (const list of byTenant.values()) deferred.push(...list);
  return { selected: taken, deferred };
}

/**
 * @param {object} o
 * @param {object} o.db      supabase-shaped client
 * @param {Function} o.send  (phone, message, opts) => {ok:boolean}
 * @param {boolean} o.dryRun no sends, no log writes
 */
export async function runSmartReminders({
  db,
  send,
  dryRun = false,
  now = new Date(),
  caps = DEFAULT_CAPS,
  concurrency = DEFAULT_CONCURRENCY,
  collectOnly = false,
} = {}) {
  const startedAt = Date.now();
  const stats = {
    queries: 0,
    candidates: { winback: 0, package_done: 0, review: 0, birthday: 0 },
    considered: 0,
    skipped: { alreadySent: 0, noPhone: 0, paused: 0, toggledOff: 0 },
    selected: 0,
    deferredByCap: 0,
    sent: 0,
    failed: 0,
    ms: 0,
  };

  // ── reference data ──────────────────────────────────────────────────────
  stats.queries++;
  const { data: settingsRows } = await db.from('settings').select('*');
  const settingsByTenant = {};
  const businessNameByTenant = {};
  const reviewUrlByTenant = {};
  (settingsRows || []).forEach((row) => {
    settingsByTenant[row.tenant_id] = row;
    businessNameByTenant[row.tenant_id] = row.business_name || 'העסק';
    if (row.review_url) reviewUrlByTenant[row.tenant_id] = row.review_url;
  });

  // Master switch. Fails OPEN: only a literal true pauses, so a missing column
  // or malformed JSONB can never silently stop a paying tenant's messages.
  const tenantPaused = (tenantId) => {
    const a = settingsByTenant[tenantId]?.automations;
    return !!(a && typeof a === 'object' && a.paused === true);
  };
  // Each type is ON by default; only an explicit false disables it.
  const flagEnabled = (tenantId, flag) => settingsByTenant[tenantId]?.[flag] !== false;

  stats.queries++;
  const { data: clients } = await db.from('clients').select('id, name, phone, tenant_id, birthday');
  const clientById = {};
  (clients || []).forEach((c) => { clientById[c.id] = c; });

  // ONE read, instead of one per candidate. This is the fix.
  const sent = await loadSentSet(db, stats);

  const candidates = [];
  const add = (client, type, referenceId, message) => {
    stats.candidates[type]++;
    candidates.push({
      tenantId: client.tenant_id, clientId: client.id, client, type, referenceId, message,
    });
  };

  // ── 1. WINBACK ──────────────────────────────────────────────────────────
  const cutoff90 = dateNDaysAgo(90, now);
  stats.queries++;
  const { data: allAppts } = await db
    .from('appointments')
    .select('client_id, date, tenant_id, confirmation_status');
  const lastVisitByClient = {};
  (allAppts || []).forEach((a) => {
    if (!a.client_id || !a.date) return;
    if (a.confirmation_status === 'cancelled') return; // not a real visit
    const prev = lastVisitByClient[a.client_id];
    if (!prev || a.date > prev) lastVisitByClient[a.client_id] = a.date;
  });

  for (const [clientId, lastDate] of Object.entries(lastVisitByClient)) {
    if (lastDate >= cutoff90) continue;
    const client = clientById[clientId];
    if (!client) continue;
    if (!flagEnabled(client.tenant_id, 'winback_enabled')) { stats.skipped.toggledOff++; continue; }
    const businessName = businessNameByTenant[client.tenant_id] || 'העסק';
    add(client, 'winback', lastDate,
      `שלום ${client.name}! 💗\n` +
      `מתגעגעים אלייך ב${businessName}!\n` +
      `מזמן לא ראינו אותך — נשמח לפנק אותך בטיפול ✨\n` +
      `רוצה לקבוע תור? פשוט כתבי לנו 😊`);
  }

  // ── 2. PACKAGE DONE ─────────────────────────────────────────────────────
  stats.queries++;
  const { data: pkgs } = await db
    .from('packages')
    .select('id, client_id, service, total_sessions, used_sessions, active, tenant_id');
  for (const pkg of pkgs || []) {
    const finished =
      pkg.active === false ||
      (pkg.total_sessions != null && pkg.used_sessions != null &&
       Number(pkg.used_sessions) >= Number(pkg.total_sessions));
    if (!finished) continue;
    const client = clientById[pkg.client_id];
    if (!client) continue;
    if (!flagEnabled(client.tenant_id, 'package_reminders_enabled')) { stats.skipped.toggledOff++; continue; }
    const businessName = businessNameByTenant[client.tenant_id] || 'העסק';
    add(client, 'package_done', pkg.id,
      `שלום ${client.name}! ✨\n` +
      `סיימת את חבילת ${pkg.service} ב${businessName} — כל הכבוד! 💆‍♀️\n` +
      `רוצה לחדש ולהמשיך את הטיפולים? נשמח להכין לך חבילה חדשה 💗`);
  }

  // ── 3. REVIEW REQUEST ───────────────────────────────────────────────────
  const reviewDay = dateNDaysAgo(2, now);
  stats.queries++;
  const { data: reviewAppts } = await db
    .from('appointments')
    .select('id, client_id, service, date, tenant_id, confirmation_status')
    .eq('date', reviewDay);
  for (const appt of reviewAppts || []) {
    if (appt.confirmation_status === 'cancelled') continue;
    const client = clientById[appt.client_id];
    if (!client) continue;
    if (!flagEnabled(client.tenant_id, 'review_requests_enabled')) { stats.skipped.toggledOff++; continue; }
    const businessName = businessNameByTenant[client.tenant_id] || 'העסק';
    const reviewUrl = reviewUrlByTenant[client.tenant_id];
    add(client, 'review', appt.id,
      `שלום ${client.name}! 💗\n` +
      `תודה שביקרת אצלנו ב${businessName}!\n` +
      `נשמח מאוד אם תשאירי לנו ביקורת ⭐\n` +
      `זה לוקח רק דקה ועוזר לנו מאוד 🙏` +
      (reviewUrl ? `\n\nנשמח אם תשאירי לנו ביקורת קצרה:\n${reviewUrl}` : ''));
  }

  // ── 4. BIRTHDAY ─────────────────────────────────────────────────────────
  const todayIsrael = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const todayMonth = todayIsrael.getMonth() + 1;
  const todayDay = todayIsrael.getDate();
  const todayYear = String(todayIsrael.getFullYear());
  for (const client of clients || []) {
    if (!client.birthday) continue;
    let bMonth, bDay;
    const m = String(client.birthday).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) { bMonth = Number(m[2]); bDay = Number(m[3]); }
    else {
      const d = new Date(client.birthday);
      if (isNaN(d.getTime())) continue;
      bMonth = d.getMonth() + 1; bDay = d.getDate();
    }
    if (bMonth !== todayMonth || bDay !== todayDay) continue;
    const businessName = businessNameByTenant[client.tenant_id] || 'העסק';
    add(client, 'birthday', todayYear,
      `שלום ${client.name}! 🎉\n` +
      `יום הולדת שמח מ${businessName}! 💗\n` +
      `שיהיה לך יום מתוק ומפנק — מגיע לך 🎂\n` +
      `לרגל היום המיוחד נשמח לפנק אותך בטיפול ✨`);
  }

  // ── filter, then cap ────────────────────────────────────────────────────
  const results = { winback: [], package_done: [], review: [], birthday: [] };
  const pausedLogged = new Set();
  const eligible = [];

  for (const c of candidates) {
    stats.considered++;
    if (tenantPaused(c.tenantId)) {
      if (!pausedLogged.has(c.tenantId)) {
        console.log(`[send-smart-reminders] skipped: automations paused for tenant ${c.tenantId}`);
        pausedLogged.add(c.tenantId);
      }
      stats.skipped.paused++;
      results[c.type].push({ name: c.client.name || '?', status: 'מושהה (השהיית אוטומציות)' });
      continue;
    }
    if (!c.client.phone) {
      stats.skipped.noPhone++;
      results[c.type].push({ name: c.client.name || '?', status: 'אין טלפון' });
      continue;
    }
    // In-memory now. This used to be a database round trip, per candidate.
    if (sent.has(logKey(c.tenantId, c.clientId, c.type, c.referenceId))) {
      stats.skipped.alreadySent++;
      continue;
    }
    eligible.push(c);
  }

  // Used by scripts/mark-reminder-backlog.mjs, which needs the FULL eligible
  // list rather than one capped run's worth. Going through this function rather
  // than reimplementing the rules is the point: the backlog script marks
  // exactly what the cron would otherwise have sent, and cannot drift from it.
  if (collectOnly) {
    stats.ms = Date.now() - startedAt;
    return { results, stats, eligible };
  }

  const { selected, deferred } = selectWithCaps(eligible, caps);
  stats.selected = selected.length;
  stats.deferredByCap = deferred.length;
  for (const c of deferred) {
    results[c.type].push({ name: c.client.name, status: 'נדחה למחר (מכסה יומית)' });
  }

  if (dryRun) {
    for (const c of selected) {
      results[c.type].push({ name: c.client.name, status: 'תצוגה מקדימה (לא נשלח)' });
    }
    stats.ms = Date.now() - startedAt;
    return { results, stats };
  }

  // ── send ────────────────────────────────────────────────────────────────
  await pooled(selected, concurrency, async (c) => {
    const res = await send(c.client.phone, c.message, {
      name: c.client.name, type: `auto_${c.type}`, tenantId: c.tenantId,
    });
    if (res && res.ok) {
      stats.queries++;
      await db.from('auto_reminders_log').insert({
        tenant_id: c.tenantId, client_id: c.clientId,
        reminder_type: c.type, reference_id: c.referenceId || '',
      });
      stats.sent++;
    } else {
      stats.failed++;
    }
    results[c.type].push({ name: c.client.name, status: res && res.ok ? 'נשלח' : 'נכשל' });
  });

  stats.ms = Date.now() - startedAt;
  return { results, stats };
}

"use client";
// app/sections/useDataLoadingSection.jsx — part of the owner's app: 348 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useRef } from "react";
import { supabase } from "../supabase";
import { planState } from "@/lib/planState";
import { isDemoTenantId } from "@/lib/demoTenants";
import { readAllRows } from "@/lib/pagedRead";
import { historyCutoff, mergeById } from "@/lib/historyWindow";
import * as Sentry from "@/lib/sentryLazy";
import { loginPathForScreen } from "@/lib/screenLink";
import { ownServices } from "@/lib/serviceScope";
import { tr } from "@/lib/i18n/tr";

export function useDataLoadingSection(ctx) {
  const {
    FORM_LIST_COLUMNS, isAuthTransportFailure, leavingForOnboardingRef, router, setAppointments, setAuthEmail,
    setClients, setCurrentPlan, setDeferred, setExpenses, setForms, setLeads, setLoadError, setLoading,
    setOwnerNotifs, setPackages, setPlanRow, setReceipts, setReceiptVoids, setServices, setSettings, setWaitlist,
    setWhatsappPending, toast,
  } = ctx;
  /* @section-body */const loadDeferred = async () => {
    try {
      const [f, ex, wl] = await Promise.all([
        // The list only: no form_data, no signature. The answers are read one form at a time, when she opens them
        // (app/FormAnswersSheet). If the narrowed read fails for any reason, the full read it replaced runs instead.
        readAllRows(supabase, "forms", { columns: FORM_LIST_COLUMNS }).then(r => (r?.error ? readAllRows(supabase, "forms") : r)),
        readAllRows(supabase, "expenses"),
        readAllRows(supabase, "waitlist"),
      ]);
      const take = (name, res, set) => {
        // A read that stopped short (complete:false) is an error, not a shorter list.
        if (res?.error || res?.complete === false) {
          console.error(`[BeautyOS] loadDeferred: ${name} failed`, res.error || `${res.fetched}/${res.total}`);
          try { Sentry.captureException(new Error(`loadDeferred ${name} — ${res.error?.message || "incomplete"}`)); } catch {}
          return "error";
        }
        set(res?.data || []);
        return "ok";
      };
      setDeferred(prev => ({
        ...prev,
        forms: take("forms", f, setForms),
        expenses: take("expenses", ex, setExpenses),
        waitlist: take("waitlist", wl, setWaitlist),
      }));
    } catch (err) {
      console.error("[BeautyOS] loadDeferred threw:", err);
      try { Sentry.captureException(err); } catch {}
      setDeferred(prev => ({ ...prev, forms: "error", expenses: "error", waitlist: "error" }));
    }
  };

  // The older half of the data, read AFTER the first screen is on: appointments before the recent window, payments before it, and the leads.
  // Each read is complete or it is an error: a partial history is never merged in and called done (same rule as the boot reads). Rows are
  // merged by id, so one that was created while this ran is not duplicated. Safe to call again (the retry button does).
  const historyCutoffRef = useRef(null);
  const loadHistory = async () => {
    const cut = historyCutoffRef.current || (historyCutoffRef.current = historyCutoff());
    setDeferred(prev => ({ ...prev, history: "loading", leads: "loading" }));
    try {
      const [oa, orc, ld] = await Promise.all([
        readAllRows(supabase, "appointments", { filter: (q) => q.lt("date", cut.date) }),
        readAllRows(supabase, "receipts", { filter: (q) => q.lt("created_at", cut.iso) }),
        readAllRows(supabase, "leads"),
      ]);
      const okRead = (r) => !r.error && r.data && r.complete !== false;
      if (okRead(oa)) setAppointments(prev => mergeById(prev, oa.data));
      if (okRead(orc)) setReceipts(prev => mergeById(prev, orc.data));
      if (okRead(ld)) setLeads(prev => mergeById(prev, ld.data));
      for (const [name, r] of [["appointments", oa], ["receipts", orc], ["leads", ld]]) {
        if (!okRead(r)) {
          console.error(`[BeautyOS] loadHistory: ${name} not fully read`, r.error || `${r.fetched}/${r.total}`);
          try { Sentry.captureException(new Error(`loadHistory ${name} — ${r.error?.message || "incomplete"}`)); } catch {}
        }
      }
      setDeferred(prev => ({ ...prev, history: okRead(oa) && okRead(orc) ? "ok" : "error", leads: okRead(ld) ? "ok" : "error" }));
    } catch (err) {
      console.error("[BeautyOS] loadHistory threw:", err);
      try { Sentry.captureException(err); } catch {}
      setDeferred(prev => ({ ...prev, history: "error", leads: "error" }));
    }
  };

  // The network half of "is she really signed in", moved off the boot's
  // critical path (see authP in loadAll). Same rule as before: a definite
  // "no user" sends her to /login; "could not reach the auth server" (offline,
  // timeout) is NOT logged out and changes nothing - the data on screen
  // already loaded under her session.
  const verifySession = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user) return;
      if (isAuthTransportFailure(error)) return;
      router.replace(loginPathForScreen(window.location.pathname, window.location.search) || "/login");
    } catch { /* unverifiable is not logged out */ }
  };

  const loadAll = async () => {
    try {
      // Get the logged-in user and their tenant, to load the correct settings row.
      // No session → redirect to login instead of rendering the app "logged out"
      // (which is what let writes fail silently with auth.uid() = NULL).
      //
      // BUT: "could not reach the auth server" is NOT "logged out". getUser()
      // makes a network call, and offline it comes back with a retryable
      // transport error and user = null. Treating that as logged-out sent her
      // to /login, where she would try to sign in and fail again - the app
      // telling someone with a valid session that she is not signed in. This is
      // the same no-data/no-answer conflation as everywhere else, one step
      // earlier in the same function. The app is a PWA (public/sw.js), so the
      // shell genuinely does load with no network and this path is reachable.
      //
      // Everything below that does not depend on the ANSWER to "who is she" is
      // started right here, before the first await: the auth check, the tenant
      // lookup and the ten core reads all leave together. They used to run as
      // three dependent stages (auth, then rpc, then reads), each a full round
      // trip plus a CORS preflight - ~1.85s of a throttled-mobile cold load.
      // The reads carry no tenant filter of their own (RLS scopes them), so
      // they never needed the tenant id; only the tenants read does, and that
      // one still waits for it below.
      //
      // Starting a read early does not make its result trustworthy early: not
      // one of them is looked at until the same checks as before have passed -
      // transport failure, logged out, rpc error, failed core read, in that
      // order (test-load-chain.ts pins it). For a logged-out visitor the
      // reads come back empty under RLS and are thrown away by the redirect.
      // supabase-js query builders are lazy thenables - nothing is sent until
      // .then() - so each is wrapped in Promise.resolve to actually start it.
      // getSession(), not getUser(): getSession reads the session already in
      // the browser (and refreshes it only if it has expired), no round trip.
      // getUser() is a network call that HOLDS supabase-js's auth lock for its
      // whole duration, and every REST read waits on that lock for its token -
      // so awaiting it first put a full round trip (+ preflight) in front of
      // every read, measured on production. The server already ran getUser for
      // this very navigation (app/dashboard/layout.tsx redirects to /login
      // without a valid user), so the network check is not repeated on the
      // critical path; verifySession() below does it right after the core
      // load, with the same offline-is-not-logged-out rule.
      const bootCut = historyCutoffRef.current = historyCutoff();
      const authP = Promise.resolve(supabase.auth.getSession());
      const rpcP = Promise.resolve(supabase.rpc("get_user_tenant_id"));
      const EARLY_READS = [
        // Only the recent window here (lib/historyWindow.js): the rest of the history and the leads arrive in the background (loadHistory).
        ["appointments",   readAllRows(supabase, "appointments", { filter: (q) => q.gte("date", bootCut.date) })],
        ["clients",        readAllRows(supabase, "clients")],
        ["settings",       supabase.from("settings").select("*")],
        ["receipts",       readAllRows(supabase, "receipts", { filter: (q) => q.gte("created_at", bootCut.iso) })],
        // Not core: the table arrives with add_till_and_calendar_small_things.sql,
        // applied by hand, and a missing table must not stop the boot. Until it
        // exists no receipt can be voided, which the void button says.
        ["receipt_voids",  readAllRows(supabase, "receipt_voids")],
        ["packages",       readAllRows(supabase, "packages")],
        // Manual WhatsApp queue: not core, same reasoning as receipt_voids -
        // whatsapp-manual-mode.sql is handed over by hand. Capped at 100 and
        // newest-first: a queue is something she works through, not an
        // archive, and this card groups/caps display further on its own.
        // Through /api/messages, not a browser read: the table has no SELECT
        // policy for her, so a direct read came back empty and the queue never showed.
        ["whatsapp_pending", fetch("/api/messages?status=pending_manual", { cache: "no-store" })
          .then(async (r) => { const j = await r.json().catch(() => ({})); return r.ok && j.success ? { data: j.messages || [], count: j.count ?? null, error: null } : { data: null, count: null, error: { code: String(r.status), message: j.error || "messages read failed" } }; })
          .catch((e) => ({ data: null, count: null, error: { code: "network", message: String(e?.message || e) } }))],
        ["owner_notifs",     supabase.from("owner_notifications").select("*", { count: "exact" }).is("read_at", null).order("created_at", { ascending: false }).limit(50)],
      ].map(([name, q]) => [name, Promise.resolve(q)]);

      const { data: authData, error: authErr } = await authP;
      const user = authData?.session?.user || null;
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const authTransportFailure = isAuthTransportFailure(authErr);
      if (authTransportFailure) {
        console.error("[BeautyOS] loadAll: could not verify session", authErr);
        setLoadError({ tables: [], message: authErr?.message || "", code: isOffline ? "offline" : "auth", offline: true });
        return; // the `finally` still clears `loading`
      }
      if (!user) { router.replace(loginPathForScreen(window.location.pathname, window.location.search) || "/login"); return; }
      setAuthEmail(user.email || "");
      // Resolve the tenant with the SAME function the RLS policies use.
      // Reading tenant_members directly from the client is itself gated by
      // RLS and often returns null, which then mis-selects the settings row.
      //
      // An ERROR here is fatal, unlike a null RESULT. A null result is a real
      // answer ("this user belongs to no tenant"); an error means we do not
      // know, and carrying on would pick a settings row by fallback and show
      // her a dashboard assembled from a guess.
      const { data: rpcTenant, error: rpcErr } = await rpcP;
      if (rpcErr) {
        console.error("[BeautyOS] loadAll: get_user_tenant_id failed", rpcErr);
        try { Sentry.captureException(new Error(`loadAll: get_user_tenant_id — ${rpcErr.message}`)); } catch {}
        setLoadError({ tables: ["get_user_tenant_id"], message: rpcErr.message || "", code: rpcErr.code || "" });
        return;
      }
      const myTenantId = rpcTenant || null;
      // Every read is NAMED, so a failure can say which one failed instead of
      // vanishing. See the CORE_READS check below for why that matters.
      //
      // The tenants read is the one that needs myTenantId, so it is the one
      // that goes second - one short stage, not three.
      // Selects the whole row deliberately: the plan-state columns are added
      // by trial-state.sql, which is run by hand against Supabase, so naming
      // them explicitly would make this query fail outright on any
      // environment where that migration has not been run yet. The row is one
      // row on a tiny table, and RLS already scopes it to her own tenant.
      const READS = [
        ...EARLY_READS,
        // Feature tier + trial/subscription state for this tenant.
        ["tenants", Promise.resolve(supabase.from("tenants").select("*").eq("id", myTenantId).maybeSingle())],
        // Only her own rows, and paged: the table is readable across businesses, so an unfiltered read hit the 1,000-row cap once the platform had
        // that many services and could return a list without hers (ownServices below still filters, as a second line).
        ["service_prices", readAllRows(supabase, "service_prices", { filter: (q) => q.eq("tenant_id", myTenantId) })],
      ];
      const settled = await Promise.all(READS.map(([, q]) => q));
      const res = {};
      READS.forEach(([name], i) => { res[name] = settled[i] || {}; });
      const { appointments: a, clients: c, service_prices: sv, settings: st, receipts: r, receipt_voids: rv, packages: pk, tenants: tn, whatsapp_pending: wap, owner_notifs: onf } = res;

      // ── A FAILED READ IS NOT AN EMPTY READ ────────────────────────────────
      // This used to be `if (a.data) setAppointments(a.data)` for all eleven.
      // supabase-js does NOT throw on a query error - it returns
      // { data: null, error } - so the catch below never fired, the error was
      // dropped on the floor, and every state stayed at its initial []. The
      // result was that a failed load rendered as a clean, EMPTY app:
      // no clients, no appointments, no revenue, indistinguishable from a
      // brand-new account. For a cosmetician with a year of history, "we could
      // not load your data" showed up as "your data is gone".
      //
      // Now any core read that errors stops the render and shows her an
      // explicit failure with a retry. Empty is only ever allowed to mean empty.
      //
      // `tenants` is deliberately NOT core. Its failure already has a
      // considered answer directly below - planState() treats a null row as
      // unblocked - because this is the BILLING row, and a transient error
      // there must never lock her out of her own calendar. Failing open on
      // billing and failing loud on data is the intended asymmetry.
      // Every one of those whole-table reads goes through readAllRows: the API
      // hands back at most max_rows (1,000 by default) per request and says
      // nothing when it stops, so a plain select("*") quietly showed a busy
      // business a calendar missing its newest appointments. Past a very large
      // ceiling a read stops on purpose and reports complete:false - and then she
      // is told, below, instead of being shown a fragment as if it were all.
      const CORE_READS = READS.map(([name]) => name).filter((n) => n !== "tenants" && n !== "receipt_voids" && n !== "whatsapp_pending" && n !== "owner_notifs");
      const failedReads = CORE_READS.filter((n) => res[n]?.error);
      if (failedReads.length > 0) {
        const first = res[failedReads[0]].error;
        console.error("[BeautyOS] loadAll failed for:", failedReads.join(", "), first);
        try {
          Sentry.captureException(
            new Error(`loadAll failed: ${failedReads.join(", ")} — ${first?.message || "unknown"}`)
          );
        } catch {}
        setLoadError({ tables: failedReads, message: first?.message || "", code: first?.code || "" });
        return; // the `finally` still clears `loading`
      }

      const PARTIAL_HE = { appointments: "התורים", clients: "הלקוחות", receipts: "אישורי התשלום", receipt_voids: "ביטולי אישורי התשלום", packages: "החבילות" };
      const partialReads = Object.keys(PARTIAL_HE).filter((n) => res[n] && res[n].data && res[n].complete === false);
      if (partialReads.length > 0) {
        console.error("[BeautyOS] loadAll: incomplete read", partialReads.map((n) => `${n} ${res[n].fetched}/${res[n].total}`).join(", "));
        try { Sentry.captureException(new Error(`loadAll incomplete: ${partialReads.map((n) => `${n} ${res[n].fetched}/${res[n].total}`).join(", ")}`)); } catch {}
        toast(tr("לא נטענה כל ההיסטוריה של {0} - מה שמוצג חלקי. כתבי לנו ונטפל בזה.", [partialReads.map((n) => PARTIAL_HE[n]).join(" ו")]), "error");
      }

      // The two capped reads are capped ON PURPOSE (a queue she works through, the
      // newest notifications) - and the exact count comes back with them, so when
      // the cap hides some, the code knows and says so instead of the oldest
      // waiting messages simply not being there.
      const hidden = (r) => (r && typeof r.count === "number" && r.data ? Math.max(0, r.count - r.data.length) : 0);
      if (hidden(wap) > 0) toast(tr("יש {0} הודעות שממתינות לשליחה ידנית - מוצגות {1} האחרונות. אחרי ששלחת אותן יופיעו הישנות יותר.", [wap.count, wap.data.length]), "error");
      if (hidden(onf) > 0) console.warn(`[BeautyOS] ${hidden(onf)} older unread notifications not shown (cap ${onf.data.length})`);

      // Safe default 'none' if the row/column is missing for any reason.
      const plan = tn?.data?.plan || "none";
      setCurrentPlan(plan);
      // Trial/subscription state. A failed read leaves this null on purpose:
      // planState() then reports an unblocked tenant, so a transient error can
      // never lock her out of her own data.
      setPlanRow(tn?.data || null);
      console.log("[BeautyOS] current plan:", plan, "| plan_status:", tn?.data?.plan_status || "(not migrated)");
      // A CLOSED SYSTEM (owner decision 2026-10-21): an expired or paused business
      // sees only the renewal screen (app/PlanBlockedScreen.jsx, rendered below in
      // place of the shell). Stop here, before any calendar, client or receipt row
      // is put into state, so there is nothing behind that screen to reveal.
      // Nothing is deleted: once the plan is active the next load is the full app.
      // Same rule as planInfo (planState fails OPEN on a missing or unreadable row).
      if (planState(tn?.data || null).isBlocked && !isDemoTenantId(myTenantId)) {
        setLoadError(null);
        return; // the `finally` still clears `loading`
      }
      // Past the guard above, every one of these succeeded, so an empty array
      // is a real answer and can be trusted.
      setAppointments(a.data || []);
      setClients(c.data || []);
      // service_prices is the one table that is readable across tenants (the public booking page needs an
      // anonymous read), so unlike the others it is NOT scoped by RLS for her: keep only the rows that are hers.
      // A new tenant used to see 21 services from three other businesses here, and a checklist that called
      // the menu done. See lib/serviceScope.js.
      setServices(ownServices(sv.data, myTenantId));
      // Zero settings rows now means SHE IS GENUINELY NEW, not "the settings
      // read failed" - that case returned above. Before this change the two
      // were the same branch, so a failed read could bounce an established user
      // into onboarding, and finishing it inserts a SECOND settings row.
      if(st.data && st.data.length === 0) { leavingForOnboardingRef.current = true; router.replace("/onboarding"); return; }
      if(st.data && st.data.length > 0) {
        // The settings row for THIS user's tenant, or nothing.
        //
        // There used to be a fallback here: no match, take the most recently
        // created row. It was defended as being "stable across refreshes", and
        // it is - stability was never the problem. The row it falls back to is
        // not checked against myTenantId at all, so the one case it exists to
        // handle is precisely the case where it displays another business's
        // name, hours, address and branding as hers, with no error anywhere.
        //
        // Nothing legitimate reaches it. The read above carries no tenant
        // filter of its own and is scoped entirely by RLS, which scopes by
        // get_user_tenant_id() - the same function myTenantId came from. Rows
        // present but none matching therefore means the two disagreed, and a
        // disagreement about which business this is cannot be resolved by
        // picking one. Her own tenant having no settings row at all is a
        // different case and lands in the length === 0 branch above, which
        // sends her to onboarding.
        const myRow = st.data.find(s => s.tenant_id === myTenantId);
        if (!myRow) {
          console.error("[BeautyOS] loadAll: no settings row for tenant", myTenantId,
            "| rows visible:", st.data.length, "| tenants:", st.data.map(r => r.tenant_id));
          try { Sentry.captureException(new Error("loadAll: settings/tenant mismatch")); } catch {}
          setLoadError({ tables: ["settings"], message: tr("הגדרות העסק לא נטענו"), code: "tenant-mismatch" });
          return;
        }
        setSettings(myRow);
        // Tag every later error report with the business it happened in. This
        // is what turns the six-character code a beta user reads out into
        // "which salon, on which data" without having to ask her. The tenant
        // UUID only - never her name, phone or email; see lib/sentryScrub for
        // the rule this follows.
        try { Sentry.setTag("tenant_id", myRow?.tenant_id || myTenantId || "unknown"); } catch {}
      }
      setReceipts(r.data || []);
      // A failed voids read (table not migrated yet) is an empty set, logged.
      if (rv?.error) console.warn("[BeautyOS] receipt_voids not readable yet:", rv.error.code || "", rv.error.message || "");
      setReceiptVoids(rv?.error ? [] : (rv?.data || []));
      // Same "missing table is an empty queue, not an error" rule, for the
      // two whatsapp-manual-mode.sql tables.
      if (wap?.error) console.warn("[BeautyOS] whatsapp_messages (pending_manual) not readable yet:", wap.error.code || "", wap.error.message || "");
      setWhatsappPending(wap?.error ? [] : (wap?.data || []));
      if (onf?.error) console.warn("[BeautyOS] owner_notifications not readable yet:", onf.error.code || "", onf.error.message || "");
      setOwnerNotifs(onf?.error ? [] : (onf?.data || []));
      setPackages(pk.data || []);
      setLoadError(null);
      // Core load succeeded and is on screen's way; fetch the three lists no
      // first screen needs. Not awaited: nothing waits on them.
      loadDeferred();
      loadHistory();
      verifySession();
    } catch (err) {
      // Anything unexpected is ALSO a failed load, not an empty one. This used
      // to call handleDbError alone, which raises a toast and then lets the
      // render fall through to a dashboard showing zero of everything - the
      // toast can be missed, the empty dashboard cannot.
      console.error("[BeautyOS] loadAll threw:", err);
      try { Sentry.captureException(err); } catch {}
      setLoadError({
        tables: [],
        message: err?.message || String(err),
        code: err?.code || "",
        offline: typeof navigator !== "undefined" && navigator.onLine === false,
      });
    } finally {
      if (!leavingForOnboardingRef.current) setLoading(false);
    }
  };/* @section-end */
  return { historyCutoffRef, loadAll, loadDeferred, loadHistory };
}

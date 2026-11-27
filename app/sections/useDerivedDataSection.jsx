"use client";
// app/sections/useDerivedDataSection.jsx — part of the owner's app: 339 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
//
// `late`: entrySubtitle is declared further down the component than this hook's call. A handler here may call
// it (handlers run after the whole component body has), but reading it while rendering would be an error. So it arrives as a getter and is
// wrapped below: read only when called.
import { useCallback, useMemo } from "react";
import { parseDb } from "@/lib/dbTime";
import { daysSinceLastVisit, isActiveClient, isColdClient, winbackDaysOf } from "@/lib/clientActivity";
import { matchesQuery } from "@/lib/search/matchQuery";
import { startMinute, endMinute } from "@/lib/apptTime";
import { isPersonal, isClientAppointment } from "@/lib/calendarKind";
import { totalsOf, receiptsOnDay, monthSummary, paidWith, localDayKey, mostUsedMethod } from "@/lib/till";
import { incomeTotals } from "@/lib/incomePeriod";
import { monthlyReport } from "@/lib/monthlyReport";
import { resolveLeadSources, sourceLabelHe } from "@/lib/leadSources";
import { buildSourceReport } from "@/lib/sourceReport";
import { buildMyDay, myDayEnabled } from "@/lib/myDay";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";
import { tr } from "@/lib/i18n/tr";

export function useDerivedDataSection(ctx) {
  const {
    activeServices, appointments, clients, clientWindow, deferred, filterSkin, filterStatus, fmtDateHe,
    formatDate, forms, globalSearch, historyReady, lastMonth, lastMonthYear, LEAD_SOURCES, LEAD_STATUSES,
    leadFilter, leads, leadSearch, leadWindow, LIST_PAGE, liveRcpts, MONTHS_HE, now, openSettings, packages,
    receiptFilter, receipts, searchQuery, SELECTABLE_PAYMENT_METHODS, services, setActiveTab, setClientTab,
    setClientWindow, setGlobalSearch, setLeadWindow, setSelectedClient, setSelectedLead, setShowReceipt,
    settings, setWeekStart, SOURCE_ICONS, thisMonth, thisYear, today, tomorrow, vatRateForYear, weekStart,
    weekSundayOf, late,
  } = ctx;
  const entrySubtitle = (...args) => late.entrySubtitle(...args);
  /* @section-body */const clientAppts = useMemo(() => appointments.filter(isClientAppointment), [appointments]);
  // Every revenue figure reads liveRcpts - receipts minus voids. `receipts`
  // itself is for lists and history, where a voided receipt must still show.
  // ONE computation for the month: the headline is `monthTotals.total` and the
  // per-method cards are `monthTotals.byMethod`, so they add up by
  // construction. They used to be two: the headline filtered to this month,
  // the breakdown ran over every receipt ever - and the cash card showed 2,700
  // under a 1,400 month. Same set, same window, same void rule, or nothing.
  const monthTotals = useMemo(() => monthSummary(liveRcpts, thisMonth, thisYear), [liveRcpts, thisMonth, thisYear]);
  const thisMonthRevenue = monthTotals.total;
  const lastMonthRevenue = useMemo(() => monthSummary(liveRcpts, lastMonth, lastMonthYear).total, [liveRcpts, lastMonth, lastMonthYear]);
  // Today, for the till: what she took, by method, with tips beside it.
  const todayTotals = useMemo(() => totalsOf(receiptsOnDay(liveRcpts, today)), [liveRcpts, today]);
  // The till opens on the method she uses most (UX pass 2026-11-08), counted from her own receipts. None yet: מזומן.
  const favoritePaymentMethod = useMemo(() => mostUsedMethod(liveRcpts, SELECTABLE_PAYMENT_METHODS.map(m=>m.key), "מזומן"), [liveRcpts]);
  // Two lists per day, on purpose. *Entries are what she sees - her whole day,
  // her own commitments included. *Appts are what gets counted, because a count
  // labelled תורים that includes her accountant is a lie about her workload.
  const todayEntries    = useMemo(() => appointments.filter(a=>a.date===today), [appointments, today]);
  const tomorrowEntries = useMemo(() => appointments.filter(a=>a.date===tomorrow), [appointments, tomorrow]);
  const todayAppts    = useMemo(() => todayEntries.filter(isClientAppointment), [todayEntries]);
  const tomorrowAppts = useMemo(() => tomorrowEntries.filter(isClientAppointment), [tomorrowEntries]);
  // Compare on local YYYY-MM-DD strings (via formatDate), not Date objects:
  // weekStart carries a time-of-day while new Date("YYYY-MM-DD") is UTC midnight,
  // which previously dropped today's appointments from the weekly count.
  // Spans the SAME seven days the grid draws. It used to run from weekStart
  // itself, so with an arbitrary weekStart the count covered Wednesday to
  // Tuesday while the columns showed Sunday to Saturday - two different weeks,
  // one screen. Deriving both from getWeekDates removes the possibility.
  const weekAppts     = useMemo(() => { const ws=formatDate(weekSundayOf(weekStart)); const weEnd=new Date(weekSundayOf(weekStart)); weEnd.setDate(weEnd.getDate()+6); const we=formatDate(weEnd); return clientAppts.filter(a=>a.date&&a.date>=ws&&a.date<=we); }, [clientAppts, weekStart]);
  const thisMonthAppts = useMemo(() => clientAppts.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}), [clientAppts, thisMonth, thisYear]);

  // ── Last-visit index ──────────────────────────────────────────────────────
  // getDaysSince used to call getLastAppt, which filtered AND sorted the whole
  // appointments array for one client. filteredClients calls it per client on
  // every keystroke, so at 200 clients and 300 appointments that was ~60,000
  // filter operations plus 200 sorts per character typed - and activeClients
  // and coldClients each did the same again.
  //
  // One pass over appointments, then O(1) lookups. Built with useMemo keyed on
  // appointments alone: `now` is not a dependency because the index stores the
  // DATE, and the day arithmetic still happens per call.
  //
  // Deliberately identical to the old behaviour, including the parts that look
  // like bugs: cancelled appointments still count as visits here. The reminder
  // engine's computeLastVisits excludes them, and swapping that in would make
  // clients look more lapsed than they do today - a real change to who appears
  // in "cold", dressed up as a refactor. If cancelled visits should not count,
  // that is a product decision and its own change.
  const lastApptDateByClient = useMemo(() => {
    const m = new Map();
    for (const a of appointments) {
      if (!a.client_id || !a.date) continue;   // matches the old `!l?.date` -> 999
      const k = String(a.client_id);
      const prev = m.get(k);
      // Lexicographic max over YYYY-MM-DD is chronological max, which is what
      // the old descending localeCompare sort selected.
      if (!prev || a.date > prev) m.set(k, a.date);
    }
    return m;
  }, [appointments]);

  const getLastApptDate = (cid) => lastApptDateByClient.get(String(cid));
  // lib/clientActivity.ts owns the null-vs-sentinel rule and is unit-tested
  // directly - see that file's own comment for why a client with no
  // appointment yet must read as null, never as a huge day-count.
  const getDaysSince   = (cid) => daysSinceLastVisit(getLastApptDate(cid), now);
  // Same shape as the last-visit index above. topClients sorts every client
  // with a comparator that called this, and a comparator runs O(n log n) times
  // - so a full scan of receipts per comparison, then again in the filter.
  const clientTotalById = useMemo(() => {
    const m = new Map();
    for (const r of liveRcpts) {
      if (!r.client_id) continue;
      const k = String(r.client_id);
      m.set(k, (m.get(k) || 0) + (Number(r.amount) || 0));
    }
    return m;
  }, [liveRcpts]);
  const getClientTotal = (cid) => clientTotalById.get(String(cid)) || 0;
  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));
  const getClientReceipts = (cid) => receipts.filter(r=>String(r.client_id)===String(cid));
  const getClientPackages = (cid) => packages.filter(p=>String(p.client_id)===String(cid)&&p.active);

  // "New" (no appointment yet) is its own state - never active (she hasn't
  // actually been seen), never cold (she isn't overdue for anything; there
  // was never a first visit to lapse from). This is what keeps her out of
  // the needs-attention queue's win-back nudges. See lib/clientActivity.ts.
  const activeClients = useMemo(() => historyReady ? clients.filter(c=>isActiveClient(getLastApptDate(c.id), now)) : [], [clients, appointments, today, historyReady]);
  // A client last seen before the recent window has NO last visit until the history is in, which would read as "new" instead of "lapsed":
  // so these two lists stay empty until it is (they are nudges, and arrive a moment later).
  const winbackDays   = winbackDaysOf(settings?.automations);
  // The simple monthly report (lib/monthlyReport.ts): the same live receipts and the same incomeTotals as the income screen.
  // An unchosen registration is read as "what she took" (the exempt rule: no VAT carved out), never as a guess at VAT.
  // "לפי מטפלת" under the monthly report: the same VAT treatment as the report itself.
  const teamNet = useCallback((gross) => incomeTotals([gross], settings?.business_tax_status || "exempt", vatRateForYear(new Date().getFullYear())).net, [settings?.business_tax_status]);
  const monthlyReportData = useMemo(() => historyReady ? monthlyReport({ receipts: liveRcpts, appointments, status: settings?.business_tax_status || "exempt", vatRate: vatRateForYear(new Date().getFullYear()), now: new Date() }) : null, [liveRcpts, appointments, settings?.business_tax_status, today, historyReady]);
  const coldClients   = useMemo(() => historyReady ? clients.filter(c=>isColdClient(getLastApptDate(c.id), now, winbackDays)) : [], [clients, appointments, today, historyReady, winbackDays]);
  const topClients    = useMemo(() => [...clients].sort((a,b)=>getClientTotal(b.id)-getClientTotal(a.id)).filter(c=>getClientTotal(c.id)>0).slice(0,5), [clients, liveRcpts]);

  // Per-service breakdown.
  //
  // Built from the union of the CURRENT menu and every service name that
  // actually appears in history — not from activeServices alone. Iterating the
  // live menu meant archiving a treatment silently deleted its past revenue
  // from this report while the receipts sat untouched in the database, and it
  // also hid income she had genuinely earned under names that were never on
  // the menu (this tenant has receipts for "ניקוי עור עמוק" and "תשלום").
  // Totals elsewhere are summed straight off receipts, so they were always
  // right — it was only this breakdown that disagreed with them.
  const serviceStats = useMemo(() => {
    const byName = new Map();
    for (const s of activeServices) {
      byName.set(s.name, { name: s.name, color: s.color, archived: false });
    }
    for (const row of [...appointments, ...receipts]) {
      const n = row.service;
      if (!n || byName.has(n)) continue;
      // Present in history but not on the live menu: archived, renamed, or
      // typed by hand at the till. Carry its colour over when we still have it.
      const known = services.find(s => s.name === n);
      byName.set(n, { name: n, color: known?.color || DEFAULT_SERVICE_COLOR, archived: true });
    }
    return [...byName.values()]
      .map(s => ({
        ...s,
        count: appointments.filter(a => a.service === s.name).length,
        revenue: liveRcpts.filter(r => r.service === s.name).reduce((sum,r)=>sum+(Number(r.amount)||0),0),
      }))
      .sort((a,b)=>b.count-a.count);
  }, [activeServices, services, appointments, receipts, liveRcpts]);
  const avgTransaction = useMemo(() => liveRcpts.length>0?Math.round(liveRcpts.reduce((s,r)=>s+(Number(r.amount)||0),0)/liveRcpts.length):0, [liveRcpts]);

  const monthlyData = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);   // day 1: setMonth on the 29th to 31st rolled into the next month and doubled one month in the chart
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    const rev=liveRcpts.filter(r=>{if(!r.created_at)return false;const rd=parseDb(r.created_at);return rd.getMonth()===m&&rd.getFullYear()===y;}).reduce((s,r)=>s+(Number(r.amount)||0),0);
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:rev};
  /* now is derived from thisMonth/thisYear, which gate this memo */ }), [appointments, liveRcpts, thisMonth, thisYear]);

  const upcomingBirthdays = useMemo(() => clients.filter(c=>{
    if(!c.birthday)return false;
    try{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))<=30&&Math.floor((bd-now)/(1000*60*60*24))>=0;}catch{return false;}
  }).sort((a,b)=>{const days=(c)=>{const bx=new Date(c.birthday);const bd=new Date(now.getFullYear(),bx.getMonth(),bx.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24));};return days(a)-days(b);})
  /* now is gated by `today` (changes daily) */ , [clients, today]);

  const tomorrowConfirmed  = tomorrowAppts.filter(a=>a.confirmation_status==="confirmed").length;
  const tomorrowCancelled  = tomorrowAppts.filter(a=>a.confirmation_status==="cancelled").length;
  const tomorrowPending    = tomorrowAppts.filter(a=>!a.confirmation_status||a.confirmation_status==="pending").length;

  // Un-handled leads for the sidebar badge: both canonical entry statuses -
  // "new" (where inbound Facebook leads and manually added leads start) and
  // "no_answer" (reached out, nobody picked up).
  const newLeadsCount      = leads.filter(l=>l.status==="no_answer"||l.status==="new").length;
  const thisMonthLeads     = leads.filter(l=>{if(!l.created_at)return false;const d=parseDb(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads     = leads.filter(l=>l.status==="closed");
  const conversionRate     = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost"&&l.status!=="irrelevant");

  // "היום שלי" (app/MyDayCard.jsx, lib/myDay.js): the morning card. Computed once per change of data or per minute, never per keystroke
  // elsewhere on the screen. Off for a tenant with automations.feature_flags.my_day === false (the old today list then shows instead).
  const myDayOn = myDayEnabled(settings);
  const myDayMinute = now.getHours()*60+now.getMinutes();
  const myDayModel = useMemo(() => {
    if (!myDayOn) return null;
    const byId = new Map(clients.map(c => [String(c.id), c]));
    return buildMyDay({
      entries: todayEntries, clientAppts, tomorrowAppts, receipts: liveRcpts, leads, leadsReady: deferred.leads === "ok", paymentsReady: historyReady,
      now: new Date(), startMinute, endMinute, isPersonal,
      hasPhone: (a) => !!((byId.get(String(a.client_id))?.phone || "").trim()),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDayOn, todayEntries, clientAppts, tomorrowAppts, liveRcpts, leads, clients, deferred.leads, historyReady, myDayMinute]);

  // ── Attribution ───────────────────────────────────────────────────────────
  // Where a client came from is DERIVED, not copied. handleConvertLead already
  // writes leads.client_id, so the lead is the single source of truth for
  // source and campaign, and looking it up costs nothing extra - the leads are
  // already in memory. Copying source onto clients would have meant a new
  // column, a migration, a backfill, and two places to disagree.
  //
  // It also works retroactively: any conversion that set client_id is
  // attributable today, with no data change.
  const leadByClientId = useMemo(() => {
    const m = new Map();
    for (const l of leads) {
      if (!l.client_id) continue;
      const k = String(l.client_id);
      // If two leads somehow point at one client, keep the EARLIEST - that is
      // the one that actually brought her in.
      const prev = m.get(k);
      if (!prev || String(l.created_at||"") < String(prev.created_at||"")) m.set(k, l);
    }
    return m;
  }, [leads]);

  /** The lead a client came from, or null when nothing points at her. */
  const getClientLead = (cid) => leadByClientId.get(String(cid)) || null;

  /**
   * Clients grouped by where they came from, with what they have spent.
   *
   * Client-centric on purpose: she asked how many CLIENTS each source produced,
   * which is not the same as how many leads converted. A client with no lead
   * pointing at her - imported directly, added by hand, or converted before
   * client_id was written - lands in "לא ידוע" rather than being guessed into a
   * source or silently dropped.
   *
   * Spend comes from receipts via the clientTotalById index, never from
   * clients.total_spent, which is a column nothing in this app has ever
   * written.
   */
  const clientSourceStats = useMemo(() => {
    const rows = new Map();
    const bump = (key) => {
      if (!rows.has(key)) rows.set(key, { key, label: sourceLabelHe(key), clients: 0, revenue: 0 });
      return rows.get(key);
    };
    for (const c of clients) {
      const lead = leadByClientId.get(String(c.id));
      const r = bump(lead && lead.source ? lead.source : "__unknown__");
      r.clients += 1;
      r.revenue += clientTotalById.get(String(c.id)) || 0;
    }
    const unknown = rows.get("__unknown__");
    if (unknown) unknown.label = "לא ידוע";
    return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.clients - a.clients);
  }, [clients, leadByClientId, clientTotalById]);

  // Her editable list of sources (Settings > Clients and leads); what the new-lead form offers.
  const leadSourceList = useMemo(() => resolveLeadSources(settings?.automations), [settings?.automations]);
  // Every lead, every source as stored (csv_import, facebook_lead_ad ... included): the header number.
  const allSourcesReport = useMemo(() => buildSourceReport(leads, liveRcpts), [leads, liveRcpts]);

  const campaignStats = useMemo(() => LEAD_SOURCES.map(source=>{
    const sourceLeads=leads.filter(l=>l.source===source);
    const converted=sourceLeads.filter(l=>l.status==="closed");
    const revenue=converted.reduce((sum,l)=>{if(!l.client_id)return sum;return sum+liveRcpts.filter(r=>String(r.client_id)===String(l.client_id)).reduce((s,r)=>s+(Number(r.amount)||0),0);},0);
    return {source,icon:SOURCE_ICONS[source],total:sourceLeads.length,converted:converted.length,revenue,rate:sourceLeads.length>0?Math.round((converted.length/sourceLeads.length)*100):0};
  }).filter(s=>s.total>0).sort((a,b)=>b.revenue-a.revenue), [leads, liveRcpts]);

  // The per-method rows are rendered straight from monthTotals/todayTotals
  // through lib/till bucketByMethod - there is deliberately no separate
  // breakdown memo, because a second computation is how the cards stopped
  // agreeing with the headline. The list below keeps voided receipts (badged)
  // and matches a split receipt under each of its methods.
  const filteredReceipts = receiptFilter==="all"?receipts:receipts.filter(r=>paidWith(r,receiptFilter));

  // Search on both screens goes through lib/search/matchQuery. The old
  // `phone?.includes(q)` could not find an imported lead at all: the importer
  // stores E.164 (972527778899) and the app stores what she typed
  // (0542845655), so typing the number off her own phone matched nothing. It
  // was also case-sensitive, which broke every Latin name in her import.
  const filteredLeads = useMemo(() => leads.filter(l=>{
    const matchSearch=matchesQuery(leadSearch,{text:[l.name,l.service_interest,l.source],phones:[l.phone]});
    const matchFilter=leadFilter==="all"||l.status===leadFilter;
    return matchSearch&&matchFilter;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")), [leads, leadSearch, leadFilter]);

  const filteredClients = useMemo(() => clients.filter(c=>{
    const matchSearch=matchesQuery(searchQuery,{text:[c.name],phones:[c.phone]});
    const matchStatus=filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&isColdClient(getLastApptDate(c.id),now,winbackDays))||(filterStatus==="active"&&isActiveClient(getLastApptDate(c.id),now));
    const matchSkin=filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  }), [clients, appointments, searchQuery, filterStatus, filterSkin, today]);

  // How many rows each list is currently drawing. Derived, not stored: when the
  // filter signature changes the previous window is simply not hers any more
  // and the count falls back to the first page, without a state write.
  const leadFilterSig   = `${leadSearch}|${leadFilter}`;
  const clientFilterSig = `${searchQuery}|${filterStatus}|${filterSkin}`;
  const leadsShown   = leadWindow.sig   === leadFilterSig   ? leadWindow.n   : LIST_PAGE;
  const clientsShown = clientWindow.sig === clientFilterSig ? clientWindow.n : LIST_PAGE;
  const showMoreLeads   = () => setLeadWindow({ sig: leadFilterSig, n: leadsShown + LIST_PAGE });
  const showMoreClients = () => setClientWindow({ sig: clientFilterSig, n: clientsShown + LIST_PAGE });

  // The group the leads screen is currently looking at, and therefore the group
  // it can message. Null while the filter is "הכל": the send API is scoped to a
  // single status, so with no status there is no group - and no action bar.
  //
  // Every number the action bar shows comes from HERE, and the same array is
  // what gets handed to openBulk. One derivation, so the count on the button
  // and the set that receives the message cannot drift apart. `narrowed` is the
  // gap between "leads in this status" and "leads matching the search too" -
  // the number that has to shout when 47 becomes 1.
  const leadGroup = useMemo(() => {
    if (leadFilter === "all") return null;
    const statusTotal = leads.filter(l => l.status === leadFilter).length;
    const withPhone = filteredLeads.filter(l => l.phone);
    return {
      status: leadFilter,
      label: (LEAD_STATUSES[leadFilter] || {}).label || leadFilter,
      matched: filteredLeads,
      withPhone,
      statusTotal,
      narrowed: filteredLeads.length < statusTotal,
      // The list draws a page at a time. The send does not: it goes to every
      // lead matching the filter, including the ones below the fold that
      // "הצג עוד" has not drawn yet. Stated outright in the bar rather than
      // left for her to work out from two numbers on different rows.
      windowed: leadsShown < filteredLeads.length,
    };
  }, [leadFilter, leads, filteredLeads, leadsShown]);

  // Global top-bar search. Normalizes the query once (trim + lowercase) and
  // matches against lowercased fields across five sources. Each source is
  // capped at 5 rows (so one busy source can't crowd out the rest), and the
  // combined list is capped at ~15. Every result is a self-describing
  // {type,label,sub,obj} so the dropdown can group + navigate by type.
  const _searchQ = globalSearch.trim().toLowerCase();
  const globalResults = _searchQ.length<2?[]:(()=>{
    const has = (v)=> (v==null?"":String(v).toLowerCase()).includes(_searchQ);
    const groups = [
      clients.filter(c=>has(c.name)||has(c.phone))
        .slice(0,5).map(c=>({type:"client",label:c.name,sub:c.phone||"",obj:c})),
      appointments.filter(a=>has(a.name)||has(a.service)||has(a.client_phone)||(isPersonal(a)&&has(a.note)))
        .slice(0,5).map(a=>({type:"appt",label:(isPersonal(a)?"🔒 ":"")+a.name,sub:(entrySubtitle(a)||"")+" · "+a.date,obj:a})),
      leads.filter(l=>has(l.name)||has(l.phone)||has(l.service_interest))
        .slice(0,5).map(l=>({type:"lead",label:l.name,sub:l.source||"",obj:l})),
      activeServices.filter(s=>has(s.name))
        .slice(0,5).map(s=>({type:"service",label:s.name,sub:`₪${s.price}`+(s.duration?` · ${s.duration}′`:""),obj:s})),
      receipts.filter(r=>has(r.client_name)||has(r.service)||has(r.amount))
        .slice(0,5).map(r=>({type:"receipt",label:r.client_name||tr("תשלום"),sub:`₪${r.amount} · ${fmtDateHe(localDayKey(r.created_at))}`,obj:r})),
    ];
    return groups.flat().slice(0,15);
  })();

  // Navigate to whatever a search result points at, reusing existing handlers
  // (zero new logic). Called from the grouped results dropdown.
  const openSearchResult = (r) => {
    setGlobalSearch("");
    if (r.type === "client") { setSelectedClient(r.obj); setClientTab("info"); }
    else if (r.type === "lead") { setSelectedLead(r.obj); setActiveTab("leads"); }
    else if (r.type === "appt") { setActiveTab("calendar"); if (r.obj?.date) setWeekStart(new Date(r.obj.date)); }
    else if (r.type === "receipt") { setShowReceipt(r.obj); }
    else if (r.type === "service") { openSettings("services"); }
  };/* @section-end */
  return { activeClients, allSourcesReport, clientAppts, clientSourceStats, clientsShown, coldClients, conversionRate,
    convertedLeads, favoritePaymentMethod, filteredClients, filteredLeads, filteredReceipts, getClientAppts,
    getClientForms, getClientLead, getClientPackages, getClientReceipts, getClientTotal, getDaysSince,
    getLastApptDate, globalResults, lastMonthRevenue, leadGroup, leadSourceList, leadsShown, leadsWithReminders,
    monthlyData, monthlyReportData, monthTotals, myDayModel, myDayOn, newLeadsCount, openSearchResult,
    showMoreClients, showMoreLeads, teamNet, thisMonthAppts, thisMonthLeads, thisMonthRevenue, todayAppts,
    todayEntries, todayTotals, tomorrowAppts, tomorrowCancelled, tomorrowConfirmed, tomorrowEntries,
    tomorrowPending, upcomingBirthdays, weekAppts, winbackDays };
}

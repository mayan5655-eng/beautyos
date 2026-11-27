"use client";
// app/sections/useImportingSection.jsx — part of the owner's app: 361 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useMemo } from "react";
import { supabase } from "../supabase";
import { startMinute, endMinute, startFields, clashesWith } from "@/lib/apptTime";
import { bufferedRange, clashesWithBuffer } from "@/lib/serviceBuffer";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { DEFAULT_SERVICE_COLOR, SERVICE_COLOR_CYCLE } from "@/lib/serviceColors";
import { parseImportGrid, detectHeaderRow, buildServiceRows, buildImportRows, buildApptRows, withServiceDefaults, IMPORT_SPEC, importPhoneKey } from "@/lib/importMapping";
import { vcardImportText, isVcardFile } from "@/lib/vcard";
import { tr } from "@/lib/i18n/tr";

export function useImportingSection(ctx) {
  const {
    appointments, clients, emptyClient, guardWrite, historyReady, ImportChooser, importCols, importHasHeader,
    importing, importTarget, importText, now, pc, pcTint, services, setAppointments, setClients, setImportCols,
    setImportHasHeader, setImporting, setImportResult, setImportStage, setImportTarget, setImportText,
    setServices, setShowImportHub, setShowImportModal, setShowSettings, settings, toast, today,
  } = ctx;
  /* @section-body */const parseImportText = (text) => {
    const rows = [];
    (text || "").split("\n").forEach((line) => {
      const raw = line.trim();
      if (!raw) return;
      // Split on comma, tab, or 2+ spaces
      let parts = raw.split(/,|\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        // Try "name phone" with a single space before a phone-like token
        const m = raw.match(/^(.*?)[\s]+([0-9\-+() ]{6,})$/);
        if (m) parts = [m[1].trim(), m[2].trim()];
      }
      let name = parts[0] || "";
      let phone = parts[1] || "";
      // If the first token looks like a phone and second like a name, swap
      if (/^[0-9\-+() ]{6,}$/.test(name) && phone && !/^[0-9\-+() ]{6,}$/.test(phone)) {
        [name, phone] = [phone, name];
      }
      phone = phone.replace(/[^\d+]/g, "");
      if (name) rows.push({ name, phone });
    });
    return rows;
  };

  // Open the device contact picker (works on Chrome/Android only)
  const pickFromContacts = async () => {
    if (!(navigator.contacts && navigator.contacts.select)) {
      toast(tr("המכשיר לא תומך בבחירה מאנשי קשר, השתמשי בהדבקה ידנית"), "error");
      return;
    }
    try {
      const selected = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const lines = selected.map((c) => {
        const nm = (c.name && c.name[0]) || "";
        const tel = (c.tel && c.tel[0]) || "";
        return `${nm}, ${tel}`;
      });
      setImportText((prev) => (prev ? prev + "\n" : "") + lines.join("\n"));
    } catch {
      // user cancelled - ignore
    }
  };

  // A .vcf (vCard) file of contacts: on an iPhone there is no contact picker, but the Contacts app can share contacts as a vCard
  // file (lib/vcard.js). The file becomes the same text a paste makes and goes on to the same mapping, preview and import, so the
  // dedupe against her clients by phone is the existing one.
  const importVcardFile = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = ""; // the same file can be picked again after a "חזרה"
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast(tr("הקובץ גדול מדי. אפשר לשתף פחות אנשי קשר בכל פעם."), "error"); return; }
    let text = "";
    try { text = await file.text(); } catch { toast(tr("לא הצלחנו לקרוא את הקובץ. אפשר לנסות שוב, או להדביק רשימה."), "error"); return; }
    const r = vcardImportText(text);
    if (!r.count) {
      toast(isVcardFile(file) || /BEGIN:VCARD/i.test(text) ? tr("לא מצאנו אנשי קשר עם שם או טלפון בקובץ הזה.") : tr("זה לא נראה כמו קובץ אנשי קשר (vcf). אפשר לבחור קובץ אחר, או להדביק רשימה."), "error");
      return;
    }
    setImportText(r.text);
    goToImportMapping(r.text);
  };

  // Save all parsed contacts as new clients
  // Move from paste to mapping: parse the grid, detect a header row, pre-guess
  // each column. She corrects the guesses rather than starting from scratch.
  // Opening any import screen closes Settings first. The z-index already lifts
  // these above it, but a modal that is gone cannot hide anything - and relying
  // on a stacking comparison for whether a screen is visible at all is too
  // fragile for the main way she moves her data in. Both import entry points
  // live inside Settings, so this is the common case, not an edge one.
  //
  // editSettings is deliberately left alone: clearing it would throw away
  // anything she had typed in Settings, and hiding the modal is enough.
  const openImportHub = () => { setShowSettings(false); setShowImportHub(true); };
  const openImportFor = (kind) => {
    setImportTarget(kind);
    resetImport();
    setShowSettings(false);
    setShowImportHub(false);
    setShowImportModal(true);
  };

  // The chooser itself lives in app/ImportChooser.tsx so onboarding - a
  // separate route with none of this component's state - can render the exact
  // same list without reaching into the wizard.
  const renderImportChooser = () => (
    <ImportChooser onPick={openImportFor} accent={pc} accentTint={pcTint} />
  );

  // The wizard is shared; the spec supplies the copy, fields and guesser, and
  // only the row builder needs binding - the appointments one has to know what
  // "now" is to tell a future booking from history.
  const importSpec    = IMPORT_SPEC[importTarget] || IMPORT_SPEC.clients;
  const importFields  = importSpec.fields;
  const importGuesser = importSpec.guess;
  // Her own treatment names, so an appointments import can reject rows whose
  // "client name" is actually a treatment - a mis-mapped column, not a booking.
  const knownServiceNames = useMemo(
    () => new Set(services.map(s => String(s.name||"").trim()).filter(Boolean)),
    [services]
  );
  // Appointments: a row with no duration or price in the paste takes her treatment's own (lib/importMapping withServiceDefaults).
  const importBuilder = importTarget === "appts"    ? ((g,c,h)=>{ const b=buildApptRows(g,c,h,today,now.getHours()*60+now.getMinutes(),knownServiceNames); return { ...b, rows: withServiceDefaults(b.rows, services) }; })
                      : importTarget === "services" ? buildServiceRows
                      : ((g,c,h)=>buildImportRows(g,c,h,knownServiceNames));

  // `text` is passed when the list did not come from the paste box (a .vcf file): the state update has not landed yet.
  const goToImportMapping = (text) => {
    const grid = parseImportGrid(typeof text === "string" ? text : importText);
    if (!grid.rows.length) { toast(tr("לא נמצאו שורות"), "error"); return; }
    const hasHeader = detectHeaderRow(grid.rows);
    setImportHasHeader(hasHeader);
    setImportCols(importGuesser(grid.rows, hasHeader));
    setImportStage("map");
  };

  const resetImport = () => {
    setImportText(""); setImportCols([]); setImportHasHeader(false);
    setImportResult(null); setImportStage("paste");
  };

  // Services import. Same safety shape as the client import: explicit tenant,
  // dedupe, chunked inserts, and a failing chunk counted rather than aborting.
  const importServices = async () => {
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const { rows, noName } = buildServiceRows(grid, importCols, importHasHeader);
    if (rows.length === 0) { toast(tr("לא נמצאו טיפולים להוספה"), "error"); return; }

    setImporting(true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Skip treatments already on the price list, matched on trimmed name.
      const existing = new Set(services.map(s => String(s.name||"").trim()));
      const seen = new Set();
      const fresh = [];
      let dupes = 0;
      // Continue the colour cycle from however many services already exist, so
      // an import does not restart on colours she is already using.
      let colorAt = services.length;
      for (const r of rows) {
        const key = r.name.trim();
        if (existing.has(key) || seen.has(key)) { dupes++; continue; }
        seen.add(key);
        fresh.push({ ...r, color: SERVICE_COLOR_CYCLE[colorAt++ % SERVICE_COLOR_CYCLE.length], ...tenantField });
      }

      const CHUNK = 100;
      let failed = 0;
      let firstError = null;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("service_prices").insert(chunk).select();
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }

      if (inserted.length) setServices(prev => [...prev, ...inserted]);
      setImportResult({ added: inserted.length, dupes, noName, nameIsService: 0, failed,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };

  // Future-bookings import. Two writes, in order: any client in the paste we
  // have never seen is created first, so the appointment attaches to a real
  // record instead of being a loose name on the calendar.
  const importAppointments = async () => {
    if (!historyReady) { toast(tr("הלוח הישן עוד בדרך. כדי שלא ייווצרו תורים כפולים, אפשר לנסות שוב בעוד רגע."), "info"); return; }
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const built0 = buildApptRows(grid, importCols, importHasHeader, today, now.getHours()*60+now.getMinutes(), knownServiceNames);
    // Duration and price from her own treatment when the paste has none, BEFORE the overlap check below uses the duration.
    const built = { ...built0, rows: withServiceDefaults(built0.rows, services) };
    if (built.rows.length === 0) { toast(tr("לא נמצאו תורים עתידיים להוספה"), "error"); return; }

    setImporting(true);
    let firstError = null;
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Phone -> client id, digits only, so "054-123 4567" and "0541234567"
      // are the same person however her old system wrote them.
      const digits = importPhoneKey;
      const byPhone = new Map();
      for (const c of clients) {
        const k = digits(c.phone);
        if (k && !byPhone.has(k)) byPhone.set(k, c.id);
      }

      const toCreate = [];
      const queued = new Set();
      for (const r of built.rows) {
        const k = digits(r.phone);
        if (!k || byPhone.has(k) || queued.has(k)) continue;
        queued.add(k);
        toCreate.push({ ...emptyClient, name:r.name, phone:r.phone, status:"active", ...tenantField });
      }
      const newClients = [];
      for (let i = 0; i < toCreate.length; i += 100) {
        const { data, error } = await supabase.from("clients").insert(toCreate.slice(i, i+100)).select();
        if (error) { if (!firstError) firstError = error; continue; }
        if (data) newClients.push(...data);
      }
      for (const c of newClients) { const k = digits(c.phone); if (k) byPhone.set(k, c.id); }
      if (newClients.length) setClients(prev => [...prev, ...newClients]);

      // Skip anything already on the calendar in that slot for that person.
      // Reruns after a partial failure are normal, and the week grid renders
      // only one appointment per date+hour, so a duplicate would just hide.
      // Keyed on the exact start rather than the hour: with minutes, an
      // imported 14:00 and 14:30 for the same client are two bookings, and
      // hour-granularity would have silently discarded the second as a dupe.
      const slotKey = (date, startMin, phone, name) =>
        `${date}|${Number(startMin)}|${digits(phone) || String(name||"").trim()}`;
      const clientPhone = new Map(clients.map(c => [c.id, c.phone]));
      const existingSlots = new Set(
        appointments.map(a => slotKey(a.date, startMinute(a), clientPhone.get(a.client_id), a.name))
      );

      // Then refuse to double-book, which dedup does not do. The key above only
      // catches an identical start for the same person; it says nothing about an
      // imported 14:30+60 landing on top of an existing 14:00+60. That was
      // unreachable while every imported time was rounded to a whole hour, and
      // stage 3 makes it reachable, so the importer now runs the same [start,end)
      // half-open test as the modal and the public booking route.
      //
      // Cancelled appointments free their slot, exactly as in handleSave.
      // Accepted rows join the bucket as we go, so a single paste cannot overlap
      // itself either - two 14:00 lash fills in the same file is the common case.
      const byDate = new Map();
      for (const a of appointments) {
        if (a.confirmation_status === "cancelled") continue;
        if (!byDate.has(a.date)) byDate.set(a.date, []);
        byDate.get(a.date).push(a);
      }

      const seen = new Set();
      const fresh = [];
      let dupes = 0, overlapping = 0;
      for (const r of built.rows) {
        const k = slotKey(r.date, r.startMinute, r.phone, r.name);
        if (existingSlots.has(k) || seen.has(k)) { dupes++; continue; }

        const sameDay = byDate.get(r.date) || [];
        if (clashesWith(r.startMinute, Number(r.duration||0), sameDay)) { overlapping++; continue; }
        // Imported history is checked WITHOUT her buffers (a pasted diary is what already happened) and stored with 0. A
        // row the database holds a buffer for still blocks it there (appointments_no_overlap), so that one is checked too,
        // here, rather than failing a whole chunk of 100 at insert time.
        const storedBusy = sameDay.flatMap(a => { const s0 = startMinute(a), e0 = endMinute(a); return s0===null||e0===null ? [] : [bufferedRange(s0, e0, a.buffer_minutes)]; });
        if (clashesWithBuffer(r.startMinute, Number(r.duration||0), 0, storedBusy)) { overlapping++; continue; }

        seen.add(k);
        const svc = services.find(s => String(s.name||"").trim() === String(r.service||"").trim());
        fresh.push({
          date: r.date, ...startFields(r.startMinute), name: r.name, service: r.service || "",
          duration: r.duration, price: r.price,
          // Stored data, not styling: appointments.color is read back to tint
          // the calendar block, so it must stay a literal hex.
          color: svc?.color || DEFAULT_SERVICE_COLOR,
          client_id: byPhone.get(digits(r.phone)) || null,
          note: r.note || "",
          confirmation_status: "pending", confirmation_sent: false,
          ...tenantField,
          ...apptBufferField(0),
        });
        sameDay.push({ start_minute: r.startMinute, duration: Number(r.duration||0) });
        if (!byDate.has(r.date)) byDate.set(r.date, sameDay);
      }

      const CHUNK = 100;
      let failed = 0;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await writeWithApptBuffer(chunk, (r) => supabase.from("appointments").insert(r).select());
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }
      if (inserted.length) setAppointments(prev => [...prev, ...inserted]);

      setImportResult({ added: inserted.length, dupes, overlapping, noName: built.noName, failed,
                        newClients: newClients.length, past: built.past, noDate: built.noDate,
                        noTime: built.noTime,
                        nameIsService: built.nameIsService,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };

  const importContacts = async () => {
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const { rows, noName, nameIsService } = buildImportRows(grid, importCols, importHasHeader, knownServiceNames);
    if (rows.length === 0) { toast(tr("לא נמצאו לקוחות להוספה"), "error"); return; }

    setImporting(true);
    try {
      // Tenant is set explicitly rather than relying on a column default, the
      // same pattern handleSaveAppointment uses. Inserts run under RLS through
      // the browser client, so each row is checked server-side regardless.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Skip clients already on file, matched on digits-only phone. A rerun of
      // the same paste - which happens after a partial failure - must not
      // double the list.
      const existing = new Set(
        clients.map(c => importPhoneKey(c.phone)).filter(Boolean)
      );
      const seen = new Set();
      const fresh = [];
      let dupes = 0;
      for (const r of rows) {
        const key = importPhoneKey(r.phone);
        if (key && (existing.has(key) || seen.has(key))) { dupes++; continue; }
        if (key) seen.add(key);
        fresh.push({ ...emptyClient, ...r, status:"active", ...tenantField });
      }

      // Batched: a 500-row paste is 5 requests, not 500. A failing chunk is
      // counted and the rest continue, so one bad row cannot lose the import.
      const CHUNK = 100;
      let failed = 0;
      let firstError = null;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("clients").insert(chunk).select();
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }

      // Only rows the database actually returned go into local state, so the
      // list on screen always matches what was really written.
      if (inserted.length) setClients(prev => [...prev, ...inserted]);
      setImportResult({ added: inserted.length, dupes, noName, nameIsService, failed,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };/* @section-end */
  return { goToImportMapping, importAppointments, importBuilder, importContacts, importFields, importGuesser,
    importServices, importSpec, importVcardFile, openImportFor, openImportHub, pickFromContacts,
    renderImportChooser, resetImport };
}

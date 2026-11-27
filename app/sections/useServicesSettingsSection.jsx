"use client";
// app/sections/useServicesSettingsSection.jsx — part of the owner's app: 350 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { WRITE_BLOCKED_TOAST_HE } from "@/lib/planCopy";
import { flushPendingSaves } from "../pendingSaves";
import { SERVICE_BUFFER_PENDING_HE } from "@/lib/serviceBuffer";
import { cleanRebookDays } from "@/lib/reminders/rebookPlan.js";
import { isMissingColumnError, missingColumnName } from "@/lib/pgError";
import { STUCK_HE } from "@/lib/errorCopy";
import { businessFieldsOf } from "@/lib/businessFields";
import { DEFAULT_SERVICE_COLOR } from "@/lib/serviceColors";
import { tr } from "@/lib/i18n/tr";

export function useServicesSettingsSection(ctx) {
  const {
    editServices, editSettings, guardWrite, handleDbError, isBusy, isConnectionError, newService,
    pendingCardSaves, readOnly, services, setBusyKey, setEditServices, setEditSettings, setNewService,
    setServices, setSettings, setShowNewService, setShowTemplatePicker, setTemplatePicks, settings,
    settingsDirty, templatePicks, toast,
  } = ctx;
  /* @section-body */const SERVICE_FIELDS = ["name", "price", "duration", "description", "field", "color", "active", "requires_deposit", "buffer_minutes", "rebook_days", "intake"];
  const commitServiceDraft = async (tid) => {
    // rebook_days is typed freely (typedRebookDays) and only validated here and on blur: clamping each keystroke turned "21" into 71.
    const draft = editServices ? editServices.map(s => (s && Object.prototype.hasOwnProperty.call(s, "rebook_days") ? { ...s, rebook_days: cleanRebookDays(s.rebook_days) } : s)) : editServices;
    if (!draft) return { changed: 0, errors: [], bufferPending: false };
    // A save that failed on a column the database does not have yet: retry without THAT column only (lib/pgError
    // missingColumnName), up to three optional columns. Returns null when the error was not a missing optional column.
    const OPTIONAL_SERVICE_COLS = ["field", "requires_deposit", "buffer_minutes", "rebook_days", "intake"];
    const retryWithoutMissing = async (row, firstError, run) => {
      if (!firstError || !isMissingColumnError(firstError)) return null;
      let cur = { ...row }, err = firstError, result = null;
      const cols = [];
      for (let i = 0; i < OPTIONAL_SERVICE_COLS.length && err && isMissingColumnError(err); i++) {
        const col = missingColumnName(err);
        if (!col || !OPTIONAL_SERVICE_COLS.includes(col) || !(col in cur)) break;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it
        const { [col]: _gone, ...rest } = cur;
        cur = rest; cols.push(col);
        result = await run(cur);
        err = result.error;
      }
      return result ? { result, cols } : null;
    };
    const baseline = new Map(services.map(s => [s.id, s]));
    const errors = [];
    let changed = 0;
    let bufferPending = false;

    for (const s of draft) {
      // 1. Deleted — only rows that exist server-side; a _new row that was
      //    deleted again was dropped from the draft outright.
      if (s._deleted) {
        if (!s.id) continue;
        const { error } = await supabase
          .from("service_prices").delete().eq("id", s.id).eq("tenant_id", tid);
        if (error) { errors.push(`מחיקת ${s.name}`); continue; }
        changed++;
        continue;
      }

      // 2. New — insert. tenant_id is stamped explicitly so the RLS WITH CHECK
      //    passes without relying on a column default.
      if (!s.id) {
        const row = { tenant_id: tid, active: s.active !== false };
        // Only fields the draft actually has. supabase-js lists every key of an inserted array in `columns=`,
        // and PostgREST writes NULL for a listed key with no value instead of the column default: the
        // quick-add row has no requires_deposit, so every "+ הוסיפי שירות" save failed on its NOT NULL
        // (23502), for every business (found 2026-10-24).
        for (const k of SERVICE_FIELDS) if (k !== "active" && s[k] !== undefined) row[k] = s[k];
        let { data, error } = await supabase.from("service_prices").insert([row]).select();
        // field is added by supabase/migrations/add_business_fields.sql,
        // applied by hand and possibly not yet run — degrade rather than
        // break a plain service save for every tenant over one new column.
        // Drop ONLY the column the database says is missing, one at a time, and only from the optional ones; a dropped
        // requires_deposit that she turned on is an error, never a silent save without the deposit.
        const dropped = await retryWithoutMissing(row, error, (r) => supabase.from("service_prices").insert([r]).select());
        if (dropped) ({ data, error } = dropped.result);
        if (dropped?.cols.includes("buffer_minutes") && Number(row.buffer_minutes) > 0) bufferPending = true;
        if (dropped?.cols.includes("requires_deposit") && row.requires_deposit === true) { errors.push(`הפיקדון של ${s.name} לא נשמר`); }
        if (error || !data || !data[0]) { errors.push(`הוספת ${s.name}`); continue; }
        changed++;
        continue;
      }

      // 3. Existing — update only what actually differs.
      const base = baseline.get(s.id);
      if (!base) continue;
      const patch = {};
      for (const k of SERVICE_FIELDS) {
        const a = k === "active" ? s[k] !== false : s[k];
        const b = k === "active" ? base[k] !== false : base[k];
        if (a !== b) patch[k] = a;
      }
      if (Object.keys(patch).length === 0) continue;
      let { data, error } = await supabase
        .from("service_prices").update(patch).eq("id", s.id).select();
      {
        const dropped = await retryWithoutMissing(patch, error, (r) => supabase.from("service_prices").update(r).eq("id", s.id).select());
        if (dropped) ({ data, error } = dropped.result);
        if (dropped?.cols.includes("buffer_minutes")) bufferPending = true;
        if (dropped?.cols.includes("requires_deposit") && patch.requires_deposit === true) { errors.push(`הפיקדון של ${s.name} לא נשמר`); }
      }
      if (error || !data || !data[0]) { errors.push(`עדכון ${s.name}`); continue; }
      changed++;
    }

    return { changed, errors, bufferPending };
  };

  // The bar's "שמירה": first the cards with their own save, then the settings draft (only when it changed, so a policy-only change does
  // not also toast "ההגדרות נשמרו"). A card that failed has already said why and keeps its change.
  const saveSettingsPanel = async () => {
    if (isBusy("saveSettings")) return;
    if (pendingCardSaves > 0 && !(await flushPendingSaves())) return;
    if (settingsDirty) await handleSaveSettings();
  };

  const handleSaveSettings = async () => {
    if(isBusy("saveSettings")) return;
    setBusyKey("saveSettings", true);
    try {
      // Resolve the tenant with the SAME function the RLS policies use
      // (get_user_tenant_id). Reading tenant_members directly from the client is
      // itself gated by RLS and frequently returns null - which made tenant_id
      // wrong, the UPDATE miss 0 rows, and the INSERT fail with an empty {} error.
      const { data: rpcTenant, error: rpcErr } = await supabase.rpc("get_user_tenant_id");
      const tenantId = rpcTenant || settings.tenant_id || null;
      if (!tenantId) {
        // Offline, get_user_tenant_id cannot answer, so we can land here with a
        // perfectly valid account. "Log out and back in" is the worst possible
        // advice then: signing out clears the session and she cannot sign back
        // in without a network. Same trap as the load-error screen.
        if (isConnectionError(rpcErr) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          toast(tr("אין חיבור לאינטרנט. ההגדרות לא נשמרו, והפרטים עדיין כאן. נסי שוב כשהחיבור יחזור."), "error");
          return;
        }
        toast(STUCK_HE, "error");
        return;
      }

      // The write goes through the server: app/api/settings/save keeps only
      // the columns in lib/settingsColumns.ts, stamps the tenant from her
      // session, and creates the row when there is none. The browser used to
      // write the whole row back here - which let a tenant set the webhook's
      // instance id, the lead-key hash and the platform's feature flags on her
      // own row - and it logged that whole row to the console on every save.
      // The draft is sent as-is; what the server refuses, it drops and logs.
      let savedRow = null;
      let res;
      try {
        res = await fetch("/api/settings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: editSettings }),
        });
      } catch (netErr) {
        handleDbError(netErr, "update settings");
        return;
      }
      const saveData = await res.json().catch(() => ({}));
      if (!res.ok || !saveData.success) {
        // A refused Google review link: her own words, not a generic database error.
        if (saveData.field === "review_url" && saveData.error) { toast(saveData.error, "error"); return; }
        handleDbError({ message: saveData.error || `HTTP ${res.status}` }, "update settings");
        return;
      }
      savedRow = saveData.settings || null;
      if (!savedRow) {
        // Both paths returned 0 rows - this is an RLS / permissions problem,
        // not a success. Tell the truth instead of toasting "saved".
        toast(tr("השמירה נכשלה, אין הרשאה לעדכן את ההגדרות. אפשר להתנתק ולהתחבר שוב."), "error");
        return;
      }
      setSettings(savedRow);

      // The services live in a different table, but she pressed one button and
      // means one thing by it. Commit the service draft in the same action.
      // An account on hold cannot write services (the database refuses); say why, instead of "some services failed: update X".
      if (readOnly && editServices && JSON.stringify(editServices) !== JSON.stringify(services)) {
        toast(tr("ההגדרות נשמרו, אבל את השירותים אי אפשר לשנות כרגע. {0}", [WRITE_BLOCKED_TOAST_HE]), "error");
        return;
      }
      const { changed, errors, bufferPending } = await commitServiceDraft(tenantId);

      // Re-read rather than patching state from the responses: the draft may
      // have inserted, updated and deleted in one pass, and one query is the
      // only version of "what is actually there now" that cannot drift.
      if (changed > 0) {
        const { data: fresh, error: refetchErr } = await supabase.from("service_prices").select("*").eq("tenant_id", tenantId);
        if (!refetchErr && fresh) setServices(fresh);
      }

      if (errors.length > 0) {
        // Half a save is not a save. Say which part failed, leave the panel
        // open with the draft intact so nothing she typed is lost, and do not
        // toast success over the top of it.
        const { data: fresh } = await supabase.from("service_prices").select("*").eq("tenant_id", tenantId);
        if (fresh) {
          setServices(fresh);
          setEditServices(fresh.map(sv => ({ ...sv })));
        }
        toast(tr("ההגדרות נשמרו, אבל חלק מהשירותים לא: {0}", [errors.join(", ")]), "error");
        return;
      }

      setEditSettings(null);
      setEditServices(null);
      setShowNewService(false);
      setShowTemplatePicker(false);
      setTemplatePicks([]);
      toast((changed > 0 ? `ההגדרות נשמרו · ${changed} שינויים בשירותים` : "ההגדרות נשמרו") + (bufferPending ? `. ${SERVICE_BUFFER_PENDING_HE}` : ""), bufferPending ? "info" : undefined);
    } finally {
      setBusyKey("saveSettings", false);
    }
  };

  // ── The service list is a DRAFT ────────────────────────────────────────────
  //
  // Everything below edits editServices and nothing else. The single save
  // button at the bottom of Settings is the only thing that writes to
  // service_prices — see commitServiceDraft, called from handleSaveSettings.
  //
  // The per-row ✓ that used to live here is gone. It wrote immediately while
  // the button underneath it did not, which meant the panel had two saves with
  // different scopes and no way to tell which had committed what. It also had
  // a bug worth recording: it was wrapped in `if (svc.id)`, so on a row with no
  // id yet it did nothing at all — no write, no toast, no error. The batch
  // commit handles both cases explicitly instead: a row with an id is updated,
  // a row without one is inserted.

  const patchDraftService = (idx, patch) =>
    setEditServices(prev => (prev || []).map((s, i) => i === idx ? { ...s, ...patch } : s));

  // Archive / restore. The treatment stays in every past appointment and
  // receipt either way — those store its name as text, never a reference to
  // this row — so this only decides whether it is offered from now on.
  const toggleDraftServiceActive = (idx) =>
    setEditServices(prev => (prev || []).map((s, i) =>
      i === idx ? { ...s, active: s.active === false } : s));

  // Permanent delete — allowed ONLY when nothing references the service.
  //
  // The reference check still runs the moment she taps, because it is a READ
  // and instant feedback is the whole value of it: "this is in 3 appointments,
  // archive it instead" is useless an hour later at save time. Only the delete
  // itself is deferred, by marking the row and letting the save carry it out.
  //
  // The check runs against the DATABASE, not the arrays in local state — those
  // hold whatever this session happened to load, and "looks unreferenced from
  // here" is not the same claim as "is unreferenced". Matching is by name
  // because that is how history stores it; there is no service_id anywhere.
  const handleDeleteService = async (svc, idx) => {
    if (guardWrite()) return;
    if (isBusy("deleteService")) return;

    // A row she added in this session and has not saved yet exists nowhere but
    // the draft. Nothing can reference it, so there is nothing to check.
    if (!svc.id) {
      setEditServices(prev => (prev || []).filter((_, i) => i !== idx));
      return;
    }

    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    if (!tid) { toast(tr("לא זוהה עסק, נסי לרענן"), "error"); return; }

    setBusyKey("deleteService", true);
    try {
      // Every count is tenant-filtered as well as name-filtered.
      const checks = [
        ["appointments", "service",          "תורים"],
        ["receipts",     "service",          "תשלומים"],
        ["packages",     "service",          "חבילות"],
        ["leads",        "service_interest", "פניות"],
      ];
      const results = await Promise.all(
        checks.map(([table, col]) =>
          supabase.from(table).select("id", { count: "exact", head: true })
            .eq("tenant_id", tid).eq(col, svc.name)
        )
      );
      const failed = results.find(r => r.error);
      if (failed) { handleDbError(failed.error, "check service references"); return; }

      const used = results
        .map((r, i) => ({ label: checks[i][2], n: r.count || 0 }))
        .filter(x => x.n > 0);

      if (used.length > 0) {
        // Not a dead end — say what is holding it and what she can do instead.
        toast(
          tr("אי אפשר למחוק: השירות מופיע ב־{0}. אפשר להעביר אותו לארכיון במקום.", [used.map(u=>`${u.n} ${u.label}`).join(", ")]),
          "error"
        );
        return;
      }

      setEditServices(prev => (prev || []).map((s, i) =>
        i === idx ? { ...s, _deleted: true } : s));
    } finally {
      setBusyKey("deleteService", false);
    }
  };

  const undeleteDraftService = (idx) =>
    setEditServices(prev => (prev || []).map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s }; delete next._deleted; return next;
    }));

  // Add a typed row to the draft. Nothing is written here.
  const handleAddService = () => {
    if (guardWrite()) return;
    if (!newService.name.trim()) { toast(tr("איך נקרא השירות? חסר שם"), "error"); return; }
    if (!(Number(newService.price) >= 0)) { toast(tr("המחיר לא יכול להיות שלילי"), "error"); return; }
    if (!(Number(newService.duration) >= 5 && Number(newService.duration) <= 600)) { toast(tr("משך הטיפול צריך להיות בין 5 ל-600 דקות"), "error"); return; }
    const name = newService.name.trim();
    const clash = (editServices || []).some(s => !s._deleted && (s.name || "").trim() === name);
    if (clash) { toast(tr("כבר יש שירות בשם הזה"), "error"); return; }
    // A hand-typed service has no seed group to inherit `field` from (see
    // lib/defaultImages.js's header on why that matters). If she picked one
    // in the selector, keep it; otherwise default to her one active field —
    // with two active fields there is no safe guess, so it stays unset and
    // she can fix it in the row afterwards.
    const oneField = businessFieldsOf(settings).length === 1 ? businessFieldsOf(settings)[0] : null;
    const field = newService.field || oneField;
    setEditServices(prev => [...(prev || []), { ...newService, name, field, _new: true }]);
    setNewService({ name: "", price: 0, duration: 60, color: DEFAULT_SERVICE_COLOR, active: true });
    setShowNewService(false);
  };

  // Add the treatments she ticked in the suggested-menu picker.
  //
  // The same picker onboarding uses, mounted here so that skipping it at signup
  // is not a one-time door: a cosmetician who built her list by hand in March
  // can still open it in June to top up. Everything it adds is an ordinary row
  // of hers — there is no link back to the template, so a seeded treatment
  // renames, reprices and archives exactly like a typed one.
  //
  // Onboarding still inserts directly through insertPickedServices, because
  // there is no draft there: that screen has its own explicit finish step.
  const handleAddTemplateServices = () => {
    if (guardWrite()) return;
    if (templatePicks.length === 0) { toast(tr("לא סימנת אף טיפול"), "error"); return; }
    const existing = new Set((editServices || []).filter(s => !s._deleted).map(s => (s.name || "").trim()));
    const fresh = [];
    let skipped = 0;
    for (const pick of templatePicks) {
      const name = (pick.name || "").trim();
      if (!name || existing.has(name)) { skipped++; continue; }
      existing.add(name);
      fresh.push({
        name,
        price: pick.price,
        duration: pick.duration,
        field: pick.field || null,
        color: pick.color || DEFAULT_SERVICE_COLOR,
        active: true,
        _new: true,
      });
    }
    if (fresh.length) setEditServices(prev => [...(prev || []), ...fresh]);
    setTemplatePicks([]);
    setShowTemplatePicker(false);
    toast(
      skipped > 0
        ? tr("{0} טיפולים נוספו · {1} כבר היו ברשימה, לחצי שמירה", [fresh.length, skipped])
        : tr("{0} טיפולים נוספו, לחצי שמירה", [fresh.length])
    );
  };/* @section-end */
  return { handleAddService, handleAddTemplateServices, handleDeleteService, patchDraftService, saveSettingsPanel,
    toggleDraftServiceActive, undeleteDraftService };
}

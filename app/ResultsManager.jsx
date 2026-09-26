"use client";
import { useState, useEffect, useCallback } from "react";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { supabase } from "./supabase";
import { resizeImage, IMAGE_PRESETS } from "@/lib/imageResize";
import { PUBLIC_BUCKET } from "@/lib/clientImages";
import { consentComplete, publishBlockers } from "@/lib/results";
import { STUCK_HE, SAVE_FAILED_HE } from "@/lib/errorCopy";

// ============================================================
// SETTINGS -> BRANDING -> TREATMENT RESULTS
//
// Client photos for the public page. Unlike the rest of the branding tab this
// does NOT ride on the page's Save button: each result is its own database row
// (treatment_results) with its own consent record, and saves the moment she
// presses its own button. Keeping the consent record out of settings.branding
// is deliberate - branding is served whole to every visitor of her page.
//
// The rule "no publishing without consent" is enforced by the database; the
// form mirrors it (lib/results.consentComplete) so the button can say what is
// missing instead of failing.
// ============================================================

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = () => ({
  id: null, serviceId: "", serviceName: "", beforeUrl: "", afterUrl: "", caption: "", sessions: "",
  consentName: "", consentGivenOn: today(), consentConfirmed: false, published: false,
});
const fromRow = (r) => ({
  id: r.id, serviceId: r.service_id || "", serviceName: r.service_name || "", beforeUrl: r.before_url || "", afterUrl: r.after_url || "",
  caption: r.caption || "", sessions: r.sessions ? String(r.sessions) : "",
  consentName: r.consent_name || "", consentGivenOn: r.consent_given_on || today(), consentConfirmed: !!r.consent_confirmed, published: !!r.published,
});

const lbl = { fontSize: "var(--t-sm)", color: "var(--ink-3)", fontWeight: 600, marginBottom: 5 };
const inp = { width: "100%", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "9px 12px", fontSize: "var(--t-sm)", fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--surface)" };
const hint = { fontSize: "var(--t-xs)", color: "var(--ink-3)", lineHeight: 1.5, margin: 0 };

export default function ResultsManager({ tenantId, services }) {
  const [rows, setRows] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null); // the form, or null
  const [busy, setBusy] = useState(""); // "save" | "up:before" | "up:after" | row id
  const [msg, setMsg] = useState("");

  const apply = useCallback(({ data, error }) => {
    if (error) {
      setRows([]);
      // 42P01 / PGRST205: the migration has not been run yet.
      setLoadError(/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`)
        ? "הטבלה של התוצאות עדיין לא נוצרה במסד הנתונים (add_treatment_results.sql). עד שתורץ אי אפשר לשמור תוצאות."
        : "לא הצלחנו לטעון את התוצאות עכשיו, והן שמורות. נסי לרענן.");
      return;
    }
    setLoadError("");
    setRows(data || []);
  }, []);
  const fetchRows = () => supabase.from("treatment_results").select("*").order("created_at", { ascending: false });
  const load = async () => apply(await fetchRows());
  useEffect(() => {
    let alive = true;
    (async () => { const res = await fetchRows(); if (alive) apply(res); })();
    return () => { alive = false; };
  }, [apply]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // A different photo is a different consent question: the confirmation was
  // for the photos she was looking at when she ticked it.
  const setPhoto = (side, url) => set({ [side === "before" ? "beforeUrl" : "afterUrl"]: url, consentConfirmed: false, published: false });

  const upload = async (side, file) => {
    if (!file) return;
    if (!/^image\//.test(file.type || "")) { setMsg("קובץ תמונה בלבד"); return; }
    if (file.size > 3 * 1024 * 1024) { setMsg("התמונה גדולה מדי (עד 3MB)"); return; }
    if (!tenantId) { setMsg(STUCK_HE); return; }
    setMsg(""); setBusy("up:" + side);
    try {
      const blob = await resizeImage(file, IMAGE_PRESETS.gallery);
      const path = `${tenantId}/results/${side}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) { setMsg("לא הצלחנו להעלות את התמונה. נסי שוב בעוד רגע."); return; }
      const url = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || "";
      if (url) setPhoto(side, url);
    } finally { setBusy(""); }
  };

  const pickService = (value) => {
    if (value === "__other") return set({ serviceId: "", serviceName: "" });
    const s = services.find((x) => String(x.id) === value);
    set(s ? { serviceId: String(s.id), serviceName: s.name } : {});
  };

  const save = async (publish) => {
    if (!draft) return;
    setMsg("");
    if (!String(draft.afterUrl).trim()) { setMsg("צריך לפחות תמונת אחרי"); return; }
    if (publish && publishBlockers(draft).length) { setMsg("חסר: " + publishBlockers(draft).join(", ")); return; }
    const sessions = parseInt(draft.sessions, 10);
    const payload = {
      service_id: draft.serviceId || null,
      service_name: draft.serviceName.trim(),
      before_url: draft.beforeUrl.trim() || null,
      after_url: draft.afterUrl.trim(),
      caption: draft.caption.trim().slice(0, 140),
      sessions: Number.isInteger(sessions) && sessions > 0 && sessions < 100 ? sessions : null,
      consent_name: draft.consentName.trim(),
      consent_given_on: draft.consentGivenOn || null,
      consent_confirmed: draft.consentConfirmed === true,
      published: publish && consentComplete(draft),
    };
    setBusy("save");
    try {
      const q = draft.id
        ? supabase.from("treatment_results").update(payload).eq("id", draft.id)
        : supabase.from("treatment_results").insert({ ...payload, tenant_id: tenantId });
      const { error } = await q;
      if (error) { setMsg(SAVE_FAILED_HE); return; }
      setDraft(null);
      await load();
    } finally { setBusy(""); }
  };

  const togglePublish = async (r) => {
    setMsg(""); setBusy(r.id);
    try {
      const { error } = await supabase.from("treatment_results").update({ published: !r.published }).eq("id", r.id);
      if (error) setMsg("אפשר לפרסם רק אחרי שרשמת את הסכמת הלקוחה. פתחי את התוצאה והשלימי אותה.");
      await load();
    } finally { setBusy(""); }
  };

  const remove = async (r) => {
    if (!window.confirm("למחוק את התוצאה הזו ואת רישום ההסכמה שלה?")) return;
    setBusy(r.id);
    try {
      const { error } = await supabase.from("treatment_results").delete().eq("id", r.id);
      if (error) setMsg("המחיקה נכשלה.");
      await load();
    } finally { setBusy(""); }
  };

  const blockers = draft ? publishBlockers(draft) : [];
  const svcValue = draft ? (draft.serviceId && services.some((s) => String(s.id) === draft.serviceId) ? draft.serviceId : "__other") : "";
  const photoBox = (side, url, label) => (
    <label style={{ flex: 1, textAlign: "center", cursor: "pointer", fontSize: "var(--t-xs)", color: "var(--ink-3)" }}>
      {url
        ? <img src={url} alt="" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: "var(--r-xs)", display: "block", marginBottom: 4 }} />
        : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3 / 4", border: "1.5px dashed var(--line-2)", borderRadius: "var(--r-xs)", marginBottom: 4, color: "var(--pc-deep)", fontWeight: 600 }}>
            {busy === "up:" + side ? <Spinner inline label="מעלה" /> : "+"}
          </span>}
      {label}
      <input type="file" accept="image/*" disabled={!!busy} style={{ display: "none" }} onChange={(e) => { upload(side, e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <p style={{ fontSize: "var(--t-sm)", color: "var(--ink)", fontWeight: 700, marginBottom: 2 }}><Icon name="image" size={14} /> תוצאות טיפולים</p>
      <p style={{ ...hint, fontSize: "var(--t-sm)", marginBottom: 10 }}>
        תמונות של לקוחות, לפי טיפול. מוצגות בדף ההזמנות מקובצות לפי טיפול, וגם בכרטיס הטיפול. אפשר זוג לפני ואחרי או תמונת אחרי בלבד.
        כל תמונה נשמרת עם רישום אישור, ואי אפשר לפרסם אותה בלעדיו. כאן השמירה היא מיידית, לא בכפתור השמירה של העמוד.
      </p>

      {loadError && <p style={{ ...hint, color: "var(--danger)", marginBottom: 8 }}>{loadError}</p>}
      {msg && <p style={{ ...hint, color: "var(--danger)", marginBottom: 8 }}>{msg}</p>}

      {rows === null && <Spinner inline label="טוען" />}

      {rows && rows.length > 0 && !draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {r.before_url && <img src={r.before_url} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: "var(--r-xs)" }} />}
                <img src={r.after_url} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: "var(--r-xs)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "var(--t-md)", color: "var(--ink)", fontWeight: 600, margin: 0 }}>{r.service_name || "ללא טיפול"}</p>
                <p style={{ ...hint, color: r.published ? "var(--pc-deep)" : "var(--ink-3)" }}>
                  {r.published ? "מפורסם" : r.consent_confirmed ? "טיוטה" : "טיוטה, חסרה הסכמה"}
                  {r.sessions ? ` · ${r.sessions} טיפולים` : ""}
                </p>
              </div>
              <button disabled={!!busy || (!r.published && !r.consent_confirmed)} onClick={() => togglePublish(r)}
                style={{ background: "none", border: "none", color: "var(--pc-deep)", fontSize: "var(--t-xs)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", opacity: (!r.published && !r.consent_confirmed) ? 0.4 : 1 }}>
                {r.published ? "הסרה מהדף" : "פרסום"}
              </button>
              <button disabled={!!busy} onClick={() => { setMsg(""); setDraft(fromRow(r)); }}
                style={{ background: "none", border: "none", color: "var(--ink-2)", fontSize: "var(--t-xs)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>עריכה</button>
              <button disabled={!!busy} onClick={() => remove(r)} aria-label="מחיקה"
                style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: "var(--t-lg)", cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, border: "1px solid var(--line-2)", borderRadius: "var(--r-md)", background: "var(--surface-2)" }}>
          <div>
            <p style={lbl}>הטיפול</p>
            <select value={svcValue} onChange={(e) => pickService(e.target.value)} style={inp}>
              <option value="__other">{draft.serviceName && svcValue === "__other" ? draft.serviceName : "בחרי טיפול…"}</option>
              {services.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <p style={lbl}>תמונות</p>
            <div style={{ display: "flex", gap: 8 }}>
              {photoBox("before", draft.beforeUrl, "לפני (לא חובה)")}
              {photoBox("after", draft.afterUrl, "אחרי")}
            </div>
            {draft.beforeUrl && <button onClick={() => setPhoto("before", "")} style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: "var(--t-xs)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", marginTop: 4 }}>הסרת תמונת ה&quot;לפני&quot;</button>}
          </div>

          <div>
            <p style={lbl}>שורה קצרה על התוצאה (לא חובה)</p>
            <input value={draft.caption} maxLength={140} onChange={(e) => set({ caption: e.target.value })} placeholder="למשל: אחרי 6 שבועות של טיפול" style={inp} />
          </div>
          <div>
            <p style={lbl}>כמה טיפולים (לא חובה)</p>
            <input value={draft.sessions} inputMode="numeric" onChange={(e) => set({ sessions: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="למשל: 4" style={{ ...inp, maxWidth: 120 }} />
          </div>

          {/* CONSENT - its own box, because it is a different kind of field: it
              is a record, it is never shown on the page, and it gates publishing. */}
          <div style={{ padding: 12, border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>הסכמת הלקוחה</p>
            <p style={hint}>מה שנרשם כאן נשמר אצלך בלבד ולא מופיע בדף. ברגע שהכול מלא אפשר לפרסם.</p>
            <div>
              <p style={lbl}>מי הסכימה</p>
              <input value={draft.consentName} onChange={(e) => set({ consentName: e.target.value, consentConfirmed: false, published: false })} style={inp} />
            </div>
            <div>
              <p style={lbl}>מתי היא הסכימה</p>
              <input type="date" value={draft.consentGivenOn} max={today()} onChange={(e) => set({ consentGivenOn: e.target.value })} style={{ ...inp, maxWidth: 190, direction: "ltr" }} />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={draft.consentConfirmed} onChange={(e) => set({ consentConfirmed: e.target.checked })}
                style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: "var(--pc)" }} />
              <span style={{ fontSize: "var(--t-sm)", color: "var(--ink)", lineHeight: 1.6 }}>
                הלקוחה ידעה והסכימה שאפרסם את התמונות האלה בדף העסק שלי.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={!!busy || blockers.length > 0} onClick={() => save(true)} className="primary-btn"
              style={{ flex: 1, minWidth: 140, opacity: blockers.length ? 0.5 : 1 }}>
              {busy === "save" ? <Spinner inline label="שומרת" /> : "שמירה ופרסום"}
            </button>
            <button disabled={!!busy} onClick={() => save(false)}
              style={{ flex: 1, minWidth: 120, background: "var(--surface)", color: "var(--pc-deep)", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "9px 14px", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              שמירה כטיוטה
            </button>
            <button disabled={!!busy} onClick={() => { setDraft(null); setMsg(""); }}
              style={{ background: "none", border: "none", color: "var(--ink-3)", fontSize: "var(--t-sm)", cursor: "pointer", fontFamily: "inherit" }}>ביטול</button>
          </div>
          {blockers.length > 0 && <p style={hint}>כדי לפרסם חסר: {blockers.join(", ")}.</p>}
        </div>
      )}

      {!draft && !loadError && (
        <button onClick={() => { setMsg(""); setDraft(blank()); }}
          style={{ display: "block", width: "100%", border: "1.5px dashed var(--line-2)", borderRadius: "var(--r-sm)", padding: 12, textAlign: "center", cursor: "pointer", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--pc-deep)", background: "var(--surface-2)", fontFamily: "inherit" }}>
          + הוספת תוצאה
        </button>
      )}
    </div>
  );
}

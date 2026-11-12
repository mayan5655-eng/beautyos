'use client';
// app/TeamSettings.jsx
//
// "הצוות שלי" in Settings > booking (lib/team.ts, /api/team): the people who work with her. Name, colour, optional hours of their
// own per weekday (otherwise the business hours) and which treatments each one does (otherwise all). Nobody is deleted: "השבתה"
// takes a person off the calendar and the booking page, and her past and booked appointments stay with her name.
//
// Renders NOTHING unless NEXT_PUBLIC_TEAM_CALENDAR is on AND the server says the team exists for this business (the migration ran).
// Staff get no login and no messages in this version; the card says so, so she never expects otherwise.
import { useState } from "react";
import { tr } from "@/lib/i18n/tr";
import { STAFF_COLORS, MAX_ACTIVE_STAFF, activeStaff } from "@/lib/team";
import { dayHoursFrom } from "@/lib/businessHours";
import useTeam, { TEAM_CHANGED } from "./useTeam";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
const box = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 16px", boxShadow: "var(--shadow-xs)", marginTop: 14 };
const input = { width: "100%", minHeight: 44, border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: "var(--t-md)", fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", boxSizing: "border-box" };
const sel = { minHeight: 40, border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "4px 6px", fontSize: "var(--t-sm)", fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", direction: "ltr" };

export default function TeamSettings({ services = [], settings = null, pc = "var(--pc)", pcTint = "var(--pc-tint)", toast = () => {}, isDemo = false }) {
  const team = useTeam();
  const [form, setForm] = useState(null); // null | { staffId|null, name, color, ownHours, hours, allServices, services }
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(null);

  if (!team.enabled || !team.available) return null;

  const names = [...new Set((services || []).filter((s) => s && s.active !== false && s.name).map((s) => String(s.name)))];
  const activeCount = activeStaff(team.staff).length;

  const post = async (body, okMsg) => {
    if (isDemo) { toast(tr("זו תצוגה, במערכת שלך זה נשמר באמת")); return false; }
    setBusy(true);
    try {
      const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.success) { toast((j && j.error) || tr("לא הצלחנו לשמור, אפשר לנסות שוב בעוד רגע"), "error"); return false; }
      team.setFromResponse(j);
      window.dispatchEvent(new Event(TEAM_CHANGED));
      toast(okMsg);
      return true;
    } catch {
      toast(tr("אין חיבור כרגע. אפשר לנסות שוב בעוד רגע"), "error");
      return false;
    } finally { setBusy(false); }
  };

  const openForm = (s) => {
    const base = {};
    for (let d = 0; d < 7; d++) base[d] = s?.hours && Object.prototype.hasOwnProperty.call(s.hours, String(d)) ? s.hours[String(d)] : dayHoursFrom(settings, d);
    setForm({
      staffId: s ? s.id : null,
      isOwner: !!s?.is_owner,
      name: s ? s.name : "",
      color: s ? s.color : STAFF_COLORS[(team.staff.length) % STAFF_COLORS.length],
      ownHours: !!s?.hours,
      hours: base,
      allServices: !s?.services,
      services: s?.services ? [...s.services] : [],
    });
  };

  const save = async () => {
    if (!form.name.trim()) { toast(tr("חסר שם"), "error"); return; }
    if (!form.allServices && form.services.length === 0) { toast(tr("סמני לפחות טיפול אחד, או ״כל הטיפולים״"), "error"); return; }
    const hours = form.ownHours ? Object.fromEntries(Object.entries(form.hours).map(([d, v]) => [d, v ? { open: v.open, close: v.close } : null])) : null;
    const ok = await post({ action: "save", staffId: form.staffId, staff: { name: form.name.trim(), color: form.color, hours, services: form.allServices ? null : form.services } },
      form.staffId ? tr("נשמר ✦") : tr("{0} נוספה לצוות ✦", [form.name.trim()]));
    if (ok) setForm(null);
  };

  const setDay = (d, v) => setForm((f) => ({ ...f, hours: { ...f.hours, [d]: v } }));

  return (
    <div data-testid="team-settings" style={box}>
      <p style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{tr("הצוות שלי")}</p>
      <p style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)", lineHeight: 1.6, marginBottom: 10 }}>{tr("מטפלות שעובדות איתך. כשיש שתיים פעילות או יותר, ביומן אפשר לסנן לפי מטפלת ולקבוע לכל אחת תורים משלה, ובדף ההזמנה הלקוחות בוחרות עם מי. לצוות אין כניסה למערכת, והן לא מקבלות הודעות.")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {team.staff.map((s) => (
          <div key={s.id} data-testid="team-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: s.active ? "var(--surface-2)" : "var(--surface)", opacity: s.active ? 1 : 0.7 }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere" }}>
              {s.name}{s.is_owner ? ` ${tr("(את)")}` : ""}{!s.active ? ` · ${tr("לא פעילה")}` : ""}
            </span>
            <button type="button" onClick={() => openForm(s)} disabled={busy} style={{ minHeight: 40, padding: "0 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: "var(--t-sm)", cursor: "pointer" }}>{tr("עריכה")}</button>
            {!s.is_owner && (s.active ? (
              <button type="button" onClick={() => setConfirmOff(s)} disabled={busy} style={{ minHeight: 40, padding: "0 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink-2)", fontFamily: "inherit", fontSize: "var(--t-sm)", cursor: "pointer" }}>{tr("השבתה")}</button>
            ) : (
              <button type="button" onClick={() => post({ action: "active", staffId: s.id, active: true }, tr("{0} חזרה לצוות ✦", [s.name]))} disabled={busy || activeCount >= MAX_ACTIVE_STAFF} style={{ minHeight: 40, padding: "0 12px", borderRadius: "var(--r-sm)", border: `1px solid ${pc}`, background: pcTint, color: "var(--ink)", fontFamily: "inherit", fontSize: "var(--t-sm)", cursor: "pointer" }}>{tr("החזרה לצוות")}</button>
            ))}
          </div>
        ))}
      </div>

      {confirmOff && (
        <div role="alertdialog" style={{ marginTop: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--line-2)" }}>
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink)", lineHeight: 1.6, marginBottom: 8 }}>{tr("להשבית את {0}? היא לא תופיע יותר ביומן לתורים חדשים ובדף ההזמנה. התורים שכבר נקבעו לה נשארים ביומן עם השם שלה.", [confirmOff.name])}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy} onClick={async () => { const s = confirmOff; if (await post({ action: "active", staffId: s.id, active: false }, tr("{0} הושבתה", [s.name]))) setConfirmOff(null); }} style={{ minHeight: 44, padding: "0 14px", borderRadius: "var(--r-sm)", border: "none", background: "var(--ink)", color: "var(--surface)", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>{tr("השבתה")}</button>
            <button type="button" onClick={() => setConfirmOff(null)} style={{ minHeight: 44, padding: "0 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", cursor: "pointer" }}>{tr("ביטול")}</button>
          </div>
        </div>
      )}

      {!form && activeCount < MAX_ACTIVE_STAFF && (
        <button type="button" data-testid="team-add" onClick={() => openForm(null)} disabled={busy} style={{ marginTop: 10, minHeight: 44, width: "100%", borderRadius: "var(--r-sm)", border: `1px dashed ${pc}`, background: pcTint, color: "var(--ink)", fontFamily: "inherit", fontWeight: 700, fontSize: "var(--t-sm)", cursor: "pointer" }}>{tr("+ הוספת מטפלת")}</button>
      )}

      {form && (
        <div data-testid="team-form" style={{ marginTop: 12, padding: "12px", borderRadius: "var(--r-sm)", border: `1px solid ${pc}`, background: "var(--surface)" }}>
          <label style={{ display: "block", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }} htmlFor="team-name">{tr("שם")}</label>
          <input id="team-name" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr("למשל: נועה")} style={input} />

          <p style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink-2)", margin: "12px 0 6px" }}>{tr("צבע ביומן")}</p>
          <div role="radiogroup" aria-label={tr("צבע ביומן")} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STAFF_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={c} onClick={() => setForm({ ...form, color: c })}
                style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: form.color === c ? "3px solid var(--ink)" : "2px solid var(--surface)", boxShadow: "var(--shadow-xs)", cursor: "pointer" }} />
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: "var(--t-sm)", color: "var(--ink)", minHeight: 44 }}>
            <input type="checkbox" checked={form.ownHours} onChange={(e) => setForm({ ...form, ownHours: e.target.checked })} />
            {tr("שעות עבודה משלה (אחרת: שעות העסק)")}
          </label>
          {form.ownHours && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {DAYS.map((label, d) => {
                const v = form.hours[d];
                return (
                  <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ width: 70, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
                      <input type="checkbox" checked={!!v} onChange={(e) => setDay(d, e.target.checked ? (dayHoursFrom(settings, d) || { open: 9, close: 18 }) : null)} />
                      {tr(label)}
                    </label>
                    {v ? (
                      <>
                        <select aria-label={tr("שעת התחלה ביום {0}", [tr(label)])} value={v.open} onChange={(e) => { const open = Number(e.target.value); setDay(d, { open, close: Math.max(v.close, open + 1) }); }} style={sel}>{HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
                        <span style={{ color: "var(--ink-3)" }}>{tr("עד")}</span>
                        <select aria-label={tr("שעת סיום ביום {0}", [tr(label)])} value={v.close} onChange={(e) => { const close = Number(e.target.value); setDay(d, { open: Math.min(v.open, close - 1), close }); }} style={sel}>{HOURS.slice(1).map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
                      </>
                    ) : <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)" }}>{tr("לא עובדת")}</span>}
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink-2)", margin: "14px 0 6px" }}>{tr("איזה טיפולים היא עושה")}</p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", color: "var(--ink)", minHeight: 40 }}>
            <input type="checkbox" checked={form.allServices} onChange={(e) => setForm({ ...form, allServices: e.target.checked, services: e.target.checked ? [] : names.slice() })} />
            {tr("כל הטיפולים")}
          </label>
          {!form.allServices && names.map((n) => (
            <label key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", color: "var(--ink)", minHeight: 40, paddingInlineStart: 18 }}>
              <input type="checkbox" checked={form.services.includes(n)} onChange={(e) => setForm({ ...form, services: e.target.checked ? [...form.services, n] : form.services.filter((x) => x !== n) })} />
              {n}
            </label>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" data-testid="team-save" onClick={save} disabled={busy} style={{ flex: 2, minHeight: 44, borderRadius: "var(--r-sm)", border: "none", background: pc, color: "var(--pc-contrast)", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>{busy ? tr("שומרת…") : tr("שמירה")}</button>
            <button type="button" onClick={() => setForm(null)} style={{ flex: 1, minHeight: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", cursor: "pointer" }}>{tr("ביטול")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
// "No time that suits you?" on her booking page: the client joins the waiting
// list (app/api/waitlist/join) instead of leaving. Collapsed to one quiet line
// until she taps it, so it never competes with the slots above it.
import { useState } from "react";
import { phoneErrorHe } from "@/lib/phone";
import { WINDOWS } from "@/lib/waitlistMatch.js";

const DAYS = [["א׳", 0], ["ב׳", 1], ["ג׳", 2], ["ד׳", 3], ["ה׳", 4], ["ו׳", 5], ["ש׳", 6]];

export default function WaitlistJoin({ tenantId, service, preferredDate, pc, pcText, ink, muted, prominent = false }) {
  const [open, setOpen] = useState(prominent);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // "added" | "already" | "added-nowindow"
  const [days, setDays] = useState([]);
  const [windowKey, setWindowKey] = useState("any");

  if (!tenantId || !service) return null;

  const field = { width: "100%", boxSizing: "border-box", border: "1px solid rgba(31,58,48,0.22)", borderRadius: "var(--r-sm)", padding: "12px 14px", fontSize: "var(--t-md)", fontFamily: "inherit", background: "var(--brand-surface, #FDFBF9)", color: ink, direction: "rtl", marginBottom: 10, minHeight: 48 };

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr("איך קוראים לך? חסר שם"); return; }
    const pe = phoneErrorHe(phone);
    if (pe) { setErr(pe); return; }
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name: name.trim(), phone: phone.trim(), service, preferredDate: preferredDate || null, days, window: windowKey }),
      });
      const r = await res.json().catch(() => ({}));
      if (!r.success) { setErr(r.error || "משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע"); return; }
      setDone(r.already ? "already" : r.windowSaved === false ? "added-nowindow" : "added");
    } catch {
      setErr("משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div data-testid="waitlist-done" role="status" style={{ marginTop: 18, padding: "14px 16px", borderRadius: "var(--r-md)", border: `1px solid ${pc}`, color: ink, fontSize: "var(--t-md)", lineHeight: 1.7, textAlign: "right" }}>
        {done === "already" ? "את כבר ברשימת ההמתנה לטיפול הזה." : "נרשמת לרשימת ההמתנה."} {done === "added-nowindow" ? `את הימים והשעות לא הצלחנו לשמור, אז נציע לך כל תור שמתפנה ל${service}. ` : ""}כשיתפנה תור ל{service}{done === "added" && (days.length || windowKey !== "any") ? " שמתאים לך" : ""}, נשלח לך הודעה עם קישור לתפוס אותו.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" data-testid="waitlist-open" onClick={() => setOpen(true)}
        style={{ display: "block", width: "100%", marginTop: 18, background: "none", border: "none", color: pcText, fontSize: "var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 4, minHeight: 44 }}>
        לא מצאת זמן שמתאים? הצטרפי לרשימת ההמתנה
      </button>
    );
  }

  return (
    <div data-testid="waitlist-form" style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(31,58,48,0.12)", textAlign: "right" }}>
      <p style={{ fontSize: "var(--t-md)", fontWeight: 700, color: ink, marginBottom: 4 }}>רשימת המתנה ל{service}</p>
      <p style={{ fontSize: "var(--t-sm)", color: muted, lineHeight: 1.6, marginBottom: 12 }}>כשיתפנה תור, נשלח לך הודעה בוואטסאפ עם קישור לתפוס אותו. הראשונה שלוחצת מקבלת.</p>
      <input aria-label="שם" placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} style={field} autoComplete="name" />
      <input aria-label="טלפון נייד" placeholder="טלפון נייד" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...field, direction: "ltr", textAlign: "right" }} inputMode="tel" autoComplete="tel" />
      <p id="wl-days-label" style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: ink, margin: "2px 0 6px" }}>באילו ימים מתאים לך? (אפשר לדלג)</p>
      <div role="group" aria-labelledby="wl-days-label" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {DAYS.map(([label, n]) => {
          const on = days.includes(n);
          return <button key={n} type="button" data-testid={`wl-day-${n}`} aria-pressed={on} onClick={() => setDays(on ? days.filter((d) => d !== n) : [...days, n])} style={chip(on, pc, ink)}>{on ? "✓ " : ""}{label}</button>;
        })}
      </div>
      <p id="wl-window-label" style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: ink, margin: "2px 0 6px" }}>ובאילו שעות?</p>
      <div role="group" aria-labelledby="wl-window-label" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {WINDOWS.map((w) => {
          const on = windowKey === w.key;
          return <button key={w.key} type="button" data-testid={`wl-window-${w.key}`} aria-pressed={on} onClick={() => setWindowKey(w.key)} style={chip(on, pc, ink)}>{on ? "✓ " : ""}{w.label}</button>;
        })}
      </div>
      {err && <p role="alert" style={{ fontSize: "var(--t-sm)", color: "var(--danger, #A23B2A)", marginBottom: 10 }}>{err}</p>}
      <button type="button" onClick={submit} disabled={busy} className="bk-btn"
        style={{ width: "100%", padding: "14px 0", minHeight: 48, borderRadius: "var(--r-md)", background: pc, color: "var(--pc-contrast, #1F3A30)", border: "none", fontSize: "var(--t-md)", fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
        {busy ? "שולחת…" : "הוסיפו אותי לרשימה"}
      </button>
    </div>
  );
}

// A pill the size of a thumb (44px), 16px text so iPhone does not zoom, selected state shown by fill AND a check mark, not by colour alone.
function chip(on, pc, ink) {
  return { minHeight: 44, minWidth: 44, padding: "0 14px", borderRadius: 999, border: `1px solid ${on ? pc : "rgba(31,58,48,0.28)"}`, background: on ? pc : "transparent", color: on ? "var(--pc-contrast, #1F3A30)" : ink, fontSize: 16, fontWeight: on ? 700 : 500, fontFamily: "inherit", cursor: "pointer" };
}

"use client";
// Settings > connections: her Kalmea diary in her phone's own calendar
// (lib/calendarFeed.ts, app/api/calendar-feed/*). One tap per calendar app,
// a copy button for anything else, and a reset for a link that went too far.
import { useState } from "react";

export default function CalendarFeedCard({ pc, toast, isDemo }) {
  const [links, setLinks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async (reset = false) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/calendar-feed/link", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset }),
      });
      const r = await res.json().catch(() => ({}));
      if (!r.success) { setErr(r.error || "משהו נתקע אצלנו, אפשר לנסות שוב"); return; }
      setLinks(r);
      if (reset) toast?.("נוצר קישור חדש. הקישור הקודם הפסיק לעבוד");
    } catch {
      setErr("משהו נתקע אצלנו, אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(links.https); toast?.("הקישור הועתק"); }
    catch { setErr("לא הצלחנו להעתיק. אפשר לסמן את הקישור ולהעתיק ידנית"); }
  };

  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "8px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, textDecoration: "none", cursor: "pointer", fontFamily: "inherit" };

  return (
    <div data-testid="calendar-feed" style={{ border: "1px solid var(--line-2)", borderRadius: "var(--r-md)", padding: "14px", background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>היומן בטלפון</p>
      <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)", lineHeight: 1.6, margin: 0 }}>
        התורים מ-Kalmea יופיעו גם ביומן של הטלפון (גוגל או אייפון), ויתעדכנו לבד כשמשהו משתנה. רק שם הלקוחה והטיפול, בלי מספרי טלפון.
      </p>
      {isDemo ? (
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", margin: 0 }}>בחשבון ההדגמה אין חיבור ליומן.</p>
      ) : !links ? (
        <button type="button" onClick={() => load(false)} disabled={busy} style={{ ...btn, background: pc, color: "var(--pc-contrast, #1F3A30)", border: "none", alignSelf: "flex-start" }}>
          {busy ? "מכינה קישור…" : "חיבור ליומן בטלפון"}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={links.webcal} style={btn}>לאייפון</a>
            <a href={links.google} target="_blank" rel="noreferrer" style={btn}>ליומן Google</a>
            <button type="button" onClick={copy} style={btn}>העתקת הקישור</button>
          </div>
          <p style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
            גוגל מעדכן יומן כזה פעם בכמה שעות, אייפון בדרך כלל כל שעה. מי שיש לה את הקישור יכולה לראות את היומן, אז לא משתפים אותו.
          </p>
          <button type="button" onClick={() => load(true)} disabled={busy} style={{ ...btn, alignSelf: "flex-start", border: "none", background: "none", color: "var(--ink-3)", textDecoration: "underline", padding: 0, minHeight: 32 }}>
            יצירת קישור חדש (הקודם יפסיק לעבוד)
          </button>
        </>
      )}
      {err && <p role="alert" style={{ fontSize: "var(--t-sm)", color: "var(--danger)", margin: 0 }}>{err}</p>}
    </div>
  );
}

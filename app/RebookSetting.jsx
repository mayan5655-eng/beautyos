"use client";
// Settings > הודעות: "תזכורת לקבוע את התור הבא" (lib/reminders/rebookPlan.js). Her switch lives in automations.rebook_enabled (the
// settings JSON, no migration): ON unless she turned it off. The platform flag (automations.feature_flags.rebook_nudges === false)
// hides the whole row. Under the switch, "מי תקבל תזכורת היום": the same rules as the daily run, read from /api/rebook/today,
// so she sees who is going to get one before it goes. Read only: nothing here sends anything.
import { useState } from "react";

const sinceLabel = (d) => (d >= 14 && d % 7 <= 1 ? `${Math.floor(d / 7)} שבועות` : `${d} ימים`);
const REASON = { no_phone: "אין לה מספר טלפון", no_consent: "לא אישרה לקבל הודעות" };

export default function RebookSetting({ autos, setAutos, pc, Row }) {
  const flags = autos && typeof autos.feature_flags === "object" && autos.feature_flags ? autos.feature_flags : {};
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: "idle", data: null });
  if (flags.rebook_nudges === false) return null;
  const on = autos.rebook_enabled !== false;

  const load = async () => {
    setState({ status: "loading", data: null });
    try {
      const r = await fetch("/api/rebook/today", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) { setState({ status: "error", data: j?.error || null }); return; }
      setState({ status: "ok", data: j });
    } catch { setState({ status: "error", data: null }); }
  };
  const toggleList = () => { const next = !open; setOpen(next); if (next && state.status !== "ok") load(); };
  const d = state.data;

  return (
    <div data-testid="rebook-setting">
      <Row pc={pc} label="תזכורת לקבוע את התור הבא" on={on} onChange={() => setAutos({ ...autos, rebook_enabled: !on })}
        desc="ללקוחה שאין לה תור עתידי, כשמגיע הזמן לטיפול הבא: לפי מה שהגדרת לכל שירות (״להזכיר לחזור אחרי״ בשירותים), ואם לא הגדרת, לפי הקצב שלה או לפי סוג הטיפול (למשל 3 שבועות אחרי לק ג׳ל). מכינה הודעה חמה עם הקישור לקביעת תור. רק ללקוחות שהסכימו לקבל הודעות, ולא יותר מפעם ב-3 שבועות לכל לקוחה." />
      {on && (
        <div style={{ marginTop: -4, marginBottom: 12 }}>
          <button type="button" data-testid="rebook-today-toggle" onClick={toggleList} aria-expanded={open}
            style={{ minHeight: 44, background: "none", border: "none", padding: "0 2px", color: "var(--ink)", fontWeight: 700, fontSize: "var(--t-sm)", fontFamily: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {open ? "הסתרת הרשימה" : "מי תקבל תזכורת היום?"}
          </button>
          {open && (
            <div data-testid="rebook-today" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>
              {state.status === "loading" && <p style={{ margin: 0 }}>בודקת...</p>}
              {state.status === "error" && (
                <p style={{ margin: 0 }}>{d || "לא הצלחנו לבדוק כרגע."} <button type="button" onClick={load} style={{ background: "none", border: "none", color: "var(--ink)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", minHeight: 44 }}>לנסות שוב</button></p>
              )}
              {state.status === "ok" && d && (
                <>
                  {d.paused && <p style={{ margin: "0 0 6px", color: "var(--warning)" }}>ההודעות האוטומטיות מושהות עכשיו, אז היום לא תצא אף תזכורת.</p>}
                  {d.ready.length === 0 && d.sentToday.length === 0 && <p style={{ margin: 0 }}>היום אין מי שצריכה תזכורת. כשיגיע הזמן של מישהי, היא תופיע כאן.</p>}
                  {d.ready.length > 0 && (
                    <>
                      <p style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--ink)" }}>{d.readyCount === 1 ? "לקוחה אחת תקבל היום תזכורת" : `${d.readyCount} לקוחות יקבלו היום תזכורת`}{d.readyCount > d.perDayCap ? ` (עד ${d.perDayCap} ביום, השאר מחר)` : ""}</p>
                      <ul style={{ margin: "0 0 6px", paddingInlineStart: 18 }}>
                        {d.ready.map((x, i) => <li key={`r${i}`}>{x.name}{x.service ? `, ${x.service}` : ""} · לפני {sinceLabel(x.daysSince)}</li>)}
                      </ul>
                    </>
                  )}
                  {d.sentToday.length > 0 && (
                    <p style={{ margin: "0 0 6px" }}>כבר הוכנה היום תזכורת ל{d.sentToday.map((x) => x.name).join(", ")}.</p>
                  )}
                  {d.skipped.length > 0 && (
                    <p style={{ margin: "0 0 6px", color: "var(--ink-3)" }}>לא יקבלו: {d.skipped.map((x) => `${x.name} (${REASON[x.reason] || ""})`).join(", ")}.</p>
                  )}
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: "var(--t-xs)" }}>אם המספר המרכזי מחובר ההודעות יוצאות ממנו, ואחרת הן מחכות לך ב״הודעות מוכנות לשליחה״.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

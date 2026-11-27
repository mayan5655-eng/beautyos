"use client";
// app/ApptProtocolCard.jsx — the protocol on an appointment, when its treatment carries one (lib/protocolBook/book.ts
// protocolForService). Closed by default: one line, "פרוטוקול: אקנה · 52–64 דק׳". Opened: what stops the treatment today,
// the steps with their times, and the client's course ("טיפול 3 מתוך 6") with one tap to record this session.
//
// Renders NOTHING when the book is off, when the treatment has no protocol, or when she may no longer open it. The course part
// needs add_client_protocol_courses_2026-11-27.sql; until it runs it says so in one line, and the steps still show.
import { useEffect, useMemo, useState } from "react";
import { protocolBookEnabled, protocolForService, totalMinutes, bookLangOf, serviceIdForAppt } from "@/lib/protocolBook/book";
import { progressOf } from "@/lib/protocolBook/course";
import { businessFieldsOf } from "@/lib/businessFields";
import { tr, getActiveLang } from "@/lib/i18n/tr";
import Bidi from "./dashboard/protocol-book/Bidi";

const ON = protocolBookEnabled();

export default function ApptProtocolCard({ settings, services, serviceName, clientId, appointmentId, date, toast }) {
  const lang = bookLangOf(getActiveLang());
  const protocol = useMemo(() => {
    if (!ON) return undefined;
    return protocolForService(settings, serviceIdForAppt(services, serviceName), businessFieldsOf(settings));
  }, [settings, services, serviceName]);
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState(undefined); // undefined: not loaded, null: none
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !protocol || !clientId || course !== undefined) return;
    let alive = true;
    fetch(`/api/protocol-book/course?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (j?.missingMigration) { setMissing(true); setCourse(null); return; }
        if (!ok || !j?.success) { setCourse(null); return; }
        setCourse((j.courses || []).find((c) => c.protocol_key === protocol.key && c.status !== "stopped") || null);
      })
      .catch(() => alive && setCourse(null));
    return () => { alive = false; };
  }, [open, protocol, clientId, course]);

  if (!protocol) return null;
  const x = protocol.text[lang];
  const [lo, hi] = totalMinutes(protocol);

  const call = async (payload) => {
    setBusy(true);
    try {
      const res = await fetch("/api/protocol-book/course", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (j?.missingMigration) { setMissing(true); return; }
      if (!res.ok || !j.success) throw new Error(j.error || tr("לא נשמר, נסי שוב"));
      setCourse(j.course);
      return j.course;
    } catch (e) { toast?.(String(e.message || e), "error"); } finally { setBusy(false); }
  };
  const recorded = course && appointmentId && (course.sessions || []).some((s) => String(s.appointment_id) === String(appointmentId));
  const p = course ? progressOf(course) : null;

  return (
    <div data-testid="appt-protocol" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)", overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", padding: "10px 12px", background: "none", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "start" }}>
        <span style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--k-green)" }}>{tr("פרוטוקול")}: {x.title}</span>
        <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><bdi dir="ltr">{lo === hi ? lo : `${lo}–${hi}`}</bdi> {tr("דק׳")} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "var(--k-petal)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
            <p style={{ fontSize: "var(--t-xs)", fontWeight: 700, color: "#A4434F", margin: "0 0 4px" }}>{tr("לא מטפלים היום אם")}</p>
            <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: "var(--t-xs)", lineHeight: 1.5, color: "var(--ink)" }}>{x.contraStop.map((c) => <li key={c}><Bidi>{c}</Bidi></li>)}</ul>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {x.steps.map(([name, detail], i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: "var(--t-xs)", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 700, color: "#B8975A", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                <span><b style={{ color: "var(--ink)" }}><Bidi>{name}</Bidi></b> <span style={{ color: "var(--ink-2)" }}><Bidi>{detail}</Bidi></span></span>
                <span dir="ltr" style={{ color: "var(--ink-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}>{protocol.steps[i] ? (protocol.steps[i].min[0] === protocol.steps[i].min[1] ? protocol.steps[i].min[0] : `${protocol.steps[i].min[0]}–${protocol.steps[i].min[1]}`) : ""}</span>
              </li>
            ))}
          </ol>

          {clientId && (
            missing ? (
              <p style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)", margin: 0 }}>{tr("שמירת סדרת טיפולים בכרטיס הלקוחה תיפתח אחרי עדכון במסד הנתונים.")}</p>
            ) : course === undefined ? null : course ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)" }}>{tr("סדרה: {0} מתוך {1}", [p.done, p.planned])}</span>
                {recorded ? <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>{tr("הטיפול הזה רשום בסדרה")}</span> : (
                  <button type="button" disabled={busy || !appointmentId} onClick={() => call({ action: "session", courseId: course.id, date, appointmentId })}
                    style={{ fontFamily: "inherit", fontSize: "var(--t-xs)", fontWeight: 700, padding: "6px 12px", borderRadius: "var(--r-full)", border: "1px solid var(--k-green)", background: "var(--k-green)", color: "var(--k-cream)", cursor: "pointer" }}>
                    {tr("רישום הטיפול הזה בסדרה")}
                  </button>
                )}
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={async () => { const c = await call({ action: "start", clientId, key: protocol.key }); if (c && appointmentId) await call({ action: "session", courseId: c.id, date, appointmentId }); }}
                style={{ alignSelf: "flex-start", fontFamily: "inherit", fontSize: "var(--t-xs)", fontWeight: 700, padding: "6px 12px", borderRadius: "var(--r-full)", border: "1px solid var(--k-green)", background: "var(--surface)", color: "var(--k-green)", cursor: "pointer" }}>
                {tr("פתיחת סדרה בכרטיס הלקוחה")}
              </button>
            )
          )}
          <a href={`/dashboard/protocol-book#${protocol.key}`} style={{ fontSize: "var(--t-xs)", fontWeight: 600, color: "var(--ink-2)" }}>{tr("לפרוטוקול המלא בספר")}</a>
        </div>
      )}
    </div>
  );
}

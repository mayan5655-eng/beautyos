"use client";
// app/ClientProtocolCourses.jsx — the client's protocol courses on her card ("אקנה · 3 מתוך 6"). Opened from an appointment
// (app/ApptProtocolCard.jsx). Renders NOTHING when the book is off, when she has no course, or before the table exists: a
// client card is not the place to advertise a feature, and with no table there can be no course to show.
import { useEffect, useState } from "react";
import { protocolBookEnabled, protocolByKey, bookLangOf } from "@/lib/protocolBook/book";
import { progressOf } from "@/lib/protocolBook/course";
import { tr, getActiveLang } from "@/lib/i18n/tr";

const ON = protocolBookEnabled();
const STATUS = { active: "בתהליך", done: "הסתיימה", stopped: "הופסקה" };

export default function ClientProtocolCourses({ clientId, toast, photos = [], onAddPhotos }) {
  const [courses, setCourses] = useState([]);
  const lang = bookLangOf(getActiveLang());

  useEffect(() => {
    if (!ON || !clientId) return;
    let alive = true;
    fetch(`/api/protocol-book/course?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (alive && j?.success) setCourses(j.courses || []); }).catch(() => {});
    return () => { alive = false; };
  }, [clientId]);

  if (!ON || courses.length === 0) return null;

  const setStatus = async (id, status) => {
    const res = await fetch("/api/protocol-book/course", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", courseId: id, status }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) { toast?.(j.error || tr("לא נשמר, נסי שוב"), "error"); return; }
    setCourses((cs) => cs.map((c) => (c.id === id ? j.course : c)));
  };

  return (
    <div data-testid="client-protocol-courses" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "12px 14px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--ink)", margin: 0 }}>{tr("סדרות טיפול")}</p>
      {courses.map((c) => {
        const p = protocolByKey(c.protocol_key);
        const pr = progressOf(c);
        const last = (c.sessions || []).at(-1);
        // Before/after photos for this course: the existing client_photos rows saved under the protocol's name.
        const title = p ? p.text.he.title : "";
        const shots = title ? photos.filter((ph) => String(ph.treatment || "").trim() === title).length : 0;
        return (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <a href={p ? `/dashboard/protocol-book#${p.key}` : undefined} style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--k-green)" }}>{p ? p.text[lang].title : c.protocol_key}</a>
              <span style={{ fontSize: "var(--t-xs)", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{tr("{0} מתוך {1}", [pr.done, pr.planned])} · {tr(STATUS[c.status] || "")}</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pr.percent} aria-label={tr("התקדמות בסדרה")}
              style={{ height: 6, borderRadius: "var(--r-full)", background: "var(--k-sage)", overflow: "hidden" }}>
              <div style={{ width: `${pr.percent}%`, height: "100%", background: "var(--k-green)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: "var(--t-xs)", color: "var(--ink-3)" }}>
              <span>{last ? tr("טיפול אחרון: {0}", [last.date.split("-").reverse().join("/")]) : tr("עוד לא נרשם טיפול")}</span>
              {onAddPhotos && p && <button type="button" onClick={() => onAddPhotos(title)} style={{ background: "none", border: 0, padding: 0, color: "var(--k-green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>{shots ? tr("לפני/אחרי ({0})", [shots]) : tr("צילום לפני/אחרי לסדרה")}</button>}
              {c.status === "active"
                ? <button type="button" onClick={() => setStatus(c.id, "stopped")} style={{ background: "none", border: 0, padding: 0, color: "var(--ink-3)", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>{tr("הפסקת הסדרה")}</button>
                : <button type="button" onClick={() => setStatus(c.id, "active")} style={{ background: "none", border: 0, padding: 0, color: "var(--ink-3)", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>{tr("החזרה לתהליך")}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

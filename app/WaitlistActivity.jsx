"use client";
// The waiting-list card: one line on what happens when a slot frees (the smart waitlist, lib/waitlistOffers.js), and what it did
// in the last two weeks ("הצענו את התור ל..."), from /api/waitlist/activity. Read only. A failed read shows nothing rather than
// a wrong history; the card above it still works.
import { useEffect, useState } from "react";

export default function WaitlistActivity({ onOpenSettings }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/waitlist/activity", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success) setData(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data) return null;
  return (
    <div data-testid="waitlist-activity" style={{ marginTop: 10, fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>
      <p style={{ margin: "0 0 6px" }}>
        {data.on
          ? "כשמתבטל תור, אני מציעה אותו אוטומטית למי שמחכה ושהוא מתאים לה, והראשונה שלוחצת מקבלת."
          : "ההצעה האוטומטית לרשימת ההמתנה כבויה. כשמתבטל תור, אפשר להציע אותו מהיומן."}
        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings} style={{ background: "none", border: "none", color: "var(--ink)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", minHeight: 44, padding: "0 4px" }}>
            {data.on ? "הגדרות" : "להפעלה"}
          </button>
        )}
      </p>
      {data.items.length > 0 && (
        <>
          <p style={{ margin: "4px 0 4px", fontWeight: 700, color: "var(--ink)" }}>מה קרה לאחרונה</p>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {data.items.map((x) => (
              <li key={x.key} style={{ marginBottom: 4, color: x.outcome === "won" ? "var(--ink)" : "var(--ink-2)" }}>{x.line}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

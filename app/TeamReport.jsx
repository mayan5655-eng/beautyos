'use client';
// app/TeamReport.jsx
//
// "לפי מטפלת" under the monthly report (lib/teamReport.ts): visits and income per person, this month so far. Rendered by the owner's
// app only in team mode (NEXT_PUBLIC_TEAM_CALENDAR on and two or more active staff); otherwise it is never mounted.
import { useMemo } from "react";
import { tr } from "@/lib/i18n/tr";
import { teamMonthReport } from "@/lib/teamReport";

const money = (n) => `₪${Math.round(Number(n) || 0).toLocaleString("he-IL")}`;

export default function TeamReport({ staff, appointments, receipts, net, netOfVat = false }) {
  const rows = useMemo(() => teamMonthReport({ staff: staff || [], appointments: appointments || [], receipts: receipts || [], now: new Date(), net }), [staff, appointments, receipts, net]);
  if (rows.length < 2) return null;
  return (
    <div data-testid="team-report" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 16px", marginTop: 14 }}>
      <p style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{tr("לפי מטפלת")}</p>
      <p style={{ fontSize: "var(--t-xs)", color: "var(--ink-3)", lineHeight: 1.6, marginBottom: 10 }}>{netOfVat ? tr("החודש עד היום, לפני מע״מ. תשלום שלא נרשם על תור נספר אצלך.") : tr("החודש עד היום. תשלום שלא נרשם על תור נספר אצלך.")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-sm)", color: "var(--ink)", background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{r.name}</span>
            <span>{r.visits === 1 ? tr("ביקור אחד") : tr("{0} ביקורים", [r.visits])} · {money(r.income)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";
// Settings > הודעות: her own switch for the automatic WhatsApp reminder and booking confirmation (lib/waCloud/auto.ts),
// stored in automations.wa_auto_messages / automations.wa_auto_lead_hours (the settings JSON, nothing to migrate).
// Off unless she turns it on.
//
// Owner's rule: nothing that is not active is shown. The row renders ONLY when /api/wa-auto/status says
// { available: true }, which it does only when WA_AUTO_ENABLED=true, live mode and every Meta credential are set
// (lib/waCloud/autoConfig.ts publicAutoStatus). Before that, while loading, on a failed fetch, or with the kill switch
// off: nothing at all, no placeholder and no teaser (lib/waCloud/autoVisible.js, test-wa-auto-reminders.ts).
import { useEffect, useState } from "react";
import { autoSettingVisible, LEAD_CHOICES } from "@/lib/waCloud/autoVisible.js";

export default function WaAutoMessagesSetting({ autos, setAutos, pc, Row }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/wa-auto/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setStatus(j); })
      .catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
  }, []);
  if (!autoSettingVisible(status)) return null;

  const a = autos && typeof autos === "object" ? autos : {};
  const on = a.wa_auto_messages === true;
  const dflt = LEAD_CHOICES.includes(Number(status.leadHours)) ? Number(status.leadHours) : 24;
  const lead = LEAD_CHOICES.includes(Number(a.wa_auto_lead_hours)) ? Number(a.wa_auto_lead_hours) : dflt;
  return (
    <div data-testid="wa-auto-setting">
      <Row pc={pc} label="תזכורות ואישורי תור אוטומטיים בוואטסאפ" on={on} onChange={() => setAutos({ ...a, wa_auto_messages: !on })}
        desc="כשמופעל, כל לקוחה מקבלת אישור מיד אחרי שקבעה תור באתר, ותזכורת לפני התור, מהמספר הרשמי של קלמיה בשם העסק שלך. בתזכורת יש כפתורים: 'מאשרת הגעה' ו'צריכה לבטל', והתור מתעדכן אצלך מעצמו. לא נשלח כלום בשבת, בחג ובין 21:00 ל-08:00 (אישור שנקבע בלילה יוצא ב-08:00). לקוחה שלוחצת 'לא לשלוח לי הודעות' או כותבת 'הסר' לא מקבלת יותר הודעות אוטומטיות. אם הודעה לא יכולה לצאת אוטומטית, היא מחכה לך ב'הודעות מוכנות לשליחה' כמו היום. כבוי כברירת מחדל." />
      {on && (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
          <span>מתי לשלוח את התזכורת</span>
          <select data-testid="wa-auto-lead" value={lead} onChange={(e) => setAutos({ ...a, wa_auto_lead_hours: Number(e.target.value) })}
            style={{ minHeight: 44, fontSize: 16, fontFamily: "inherit", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "0 10px", background: "var(--surface-2)", color: "var(--ink)" }}>
            {LEAD_CHOICES.map((n) => <option key={n} value={n}>{n === 24 ? "יום לפני" : "יומיים לפני"}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

"use client";
// app/ClientPrivacyPanel.jsx
// "Her data" on the client card: download everything held about her and erase her for real.
// Erasing asks for the client's name to be typed (or the word "מחיקה" when the card has no name); the server checks it again
// (app/api/clients/erase). What is deleted and what stays without her identity is written in lib/clientData.ts and said here in plain words
// before the button can be pressed. A client who only wants the messages to stop does not need any of this: the card has "הסירה את עצמה מדיוור".

import { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner";
import { deliverFile, deliveryToast } from "@/lib/deliverFile";

const small = { fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 };
const btn = { padding: "10px 14px", minHeight: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer" };

export default function ClientPrivacyPanel({ client, toast, onErased, historyReady = true, upcomingCount = 0 }) {
  const [busy, setBusy] = useState("");
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (erasing) inputRef.current?.focus(); }, [erasing]);

  // A card that came from an import or a booking can have no name: then the word to type is "מחיקה".
  const hasName = String(client.name || "").trim() !== "";
  const confirmWord = hasName ? String(client.name) : "מחיקה";
  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const nameOk = norm(typed) === norm(confirmWord) && norm(typed) !== "";

  const download = async (format) => {
    if (busy) return;
    setBusy(format);
    try {
      const res = await fetch("/api/clients/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, format }) });
      if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch { /* not json */ } toast(m || "לא הצלחנו להכין את הקובץ. אפשר לנסות שוב בעוד רגע.", "error"); return; }
      const blob = await res.blob();
      // After the fetch her tap is used up, so the share sheet is skipped; the home-screen app and in-app browsers get an honest "blocked".
      const outcome = await deliverFile(blob, `${(client.name || "client").replace(/[^\p{L}\p{N}_-]+/gu, "_")}-data.${format}`);
      const t = deliveryToast(outcome, { downloaded: "הקובץ הורד" });
      if (t) toast(t.text, t.kind);
    } catch { toast("לא הצלחנו להכין את הקובץ. אפשר לנסות שוב בעוד רגע.", "error"); }
    finally { setBusy(""); }
  };

  const erase = async () => {
    if (busy) return;
    setBusy("erase");
    try {
      const res = await fetch("/api/clients/erase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, confirmName: typed }) });
      let j = {}; try { j = await res.json(); } catch { /* not json */ }
      if (!res.ok || !j.success) { toast(j.error || "המחיקה לא הושלמה. אפשר ללחוץ שוב כדי להשלים.", "error"); return; }   // the dialog stays open with the name typed: pressing again is safe
      toast("הלקוחה נמחקה. התורים והתשלומים שלה נשארו בלי פרטים מזהים.");
      setErasing(false); setTyped("");
      onErased?.(client.id);
    } catch { toast("המחיקה לא הושלמה. אפשר ללחוץ שוב כדי להשלים.", "error"); }
    finally { setBusy(""); }
  };

  return (
    <div data-testid="client-privacy" style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
      <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>המידע על הלקוחה</p>
      <p style={{ ...small, marginBottom: 10 }}>כשלקוחה מבקשת לראות את המידע שלה או למחוק אותו, אפשר לעשות את זה מכאן.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" onClick={() => download("json")} disabled={!!busy} style={btn}>{busy === "json" ? <Spinner inline label="מכינה" /> : "הורדת כל המידע"}</button>
        <button type="button" onClick={() => download("csv")} disabled={!!busy} style={btn}>{busy === "csv" ? <Spinner inline label="מכינה" /> : "הורדה לאקסל"}</button>
      </div>
      <p style={{ ...small, marginBottom: 14 }}>אם היא רק רוצה להפסיק לקבל הודעות שיווק, אין צורך למחוק: אפשר לסמן למעלה &quot;הסירה את עצמה מדיוור&quot;.</p>
      {!erasing ? (
        <button type="button" onClick={() => setErasing(true)} disabled={!historyReady} style={{ ...btn, color: "var(--danger)", borderColor: "var(--danger)" }}>מחיקת הלקוחה לצמיתות</button>
      ) : (
        <div
          role="alertdialog"
          aria-label="מחיקת לקוחה"
          onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); setErasing(false); setTyped(""); } }}
          style={{ background: "var(--surface-2)", border: "1px solid var(--danger)", borderRadius: "var(--r-md)", padding: "12px 14px" }}
        >
          <p style={{ ...small, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{hasName ? `למחוק את ${client.name} לצמיתות?` : "למחוק את הכרטיס הזה לצמיתות?"}</p>
          <p style={{ ...small, marginBottom: 8 }}>
            יימחקו: כרטיס הלקוחה, טפסים והצהרות בריאות, תמונות, ביקורות, פניות והודעות הוואטסאפ שלה. התורים והתשלומים נשארים בחשבון שלך, בלי שם ובלי טלפון,
            כי חובה לשמור רישומי חשבונאות. תוצאות לפני ואחרי שפרסמת בעמוד העסק לא נמחקות מכאן: אפשר למחוק אותן במסך התוצאות. אי אפשר לבטל. אם היא ביקשה עותק, כדאי להוריד אותו לפני.
          </p>
          {upcomingCount > 0 && (
            <p style={{ ...small, marginBottom: 8, fontWeight: 600 }}>
              {upcomingCount === 1 ? "יש לה תור עתידי אחד. הוא יישאר ביומן בלי שם, ולא תישלח אליה תזכורת." : `יש לה ${upcomingCount} תורים עתידיים. הם יישארו ביומן בלי שם, ולא תישלח אליה תזכורת.`}
            </p>
          )}
          <p style={{ ...small, marginBottom: 6 }}>{hasName ? "להמשך, הקלידי את השם שלה בדיוק:" : "להמשך, הקלידי את המילה \"מחיקה\":"}</p>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="שם הלקוחה לאישור"
            placeholder={hasName ? "הקלידי את השם כאן" : "הקלידי כאן"}
            style={{ width: "100%", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: 16, fontFamily: "inherit", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={erase} disabled={!nameOk || !!busy} style={{ ...btn, background: nameOk ? "var(--danger)" : "var(--surface)", color: nameOk ? "#fff" : "var(--ink-3)", borderColor: "var(--danger)" }}>
              {busy === "erase" ? <Spinner inline label="מוחקת" /> : "מחיקה לצמיתות"}
            </button>
            <button type="button" onClick={() => { setErasing(false); setTyped(""); }} disabled={busy === "erase"} style={btn}>ביטול</button>
          </div>
          {!nameOk && <p style={{ ...small, marginTop: 8 }}>הכפתור נפתח כשהכתוב זהה.</p>}
        </div>
      )}
    </div>
  );
}

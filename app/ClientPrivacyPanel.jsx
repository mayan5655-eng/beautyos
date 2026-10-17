"use client";
// app/ClientPrivacyPanel.jsx
// "Her data" on the client card: download everything held about her (JSON or CSV) and erase her for real.
// Erasing asks her to type the client's name; the server checks it again (app/api/clients/erase). What is deleted and what is kept
// without her identity is written in lib/clientData.ts and said here in plain words before the button can be pressed.

import { useState } from "react";
import Spinner from "./Spinner";

const small = { fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 };
const btn = { padding: "10px 14px", minHeight: 44, borderRadius: "var(--r-sm)", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer" };

export default function ClientPrivacyPanel({ client, toast, onErased, canWrite = true }) {
  const [busy, setBusy] = useState("");
  const [erasing, setErasing] = useState(false);
  const [typed, setTyped] = useState("");

  const download = async (format) => {
    if (busy) return;
    setBusy(format);
    try {
      const res = await fetch("/api/clients/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, format }) });
      if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch { /* not json */ } toast(m || "לא הצלחנו להכין את הקובץ. אפשר לנסות שוב בעוד רגע.", "error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(client.name || "client").replace(/[^\p{L}\p{N}_-]+/gu, "_")}-data.${format}`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast("הקובץ ירד");
    } catch { toast("לא הצלחנו להכין את הקובץ. אפשר לנסות שוב בעוד רגע.", "error"); }
    finally { setBusy(""); }
  };

  const erase = async () => {
    if (busy) return;
    setBusy("erase");
    try {
      const res = await fetch("/api/clients/erase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, confirmName: typed }) });
      let j = {}; try { j = await res.json(); } catch { /* not json */ }
      if (!res.ok || !j.success) { toast(j.error || "המחיקה לא הושלמה. אפשר לנסות שוב.", "error"); return; }
      toast("הלקוחה נמחקה");
      setErasing(false); setTyped("");
      onErased?.(client.id);
    } catch { toast("המחיקה לא הושלמה. אפשר לנסות שוב.", "error"); }
    finally { setBusy(""); }
  };

  const nameOk = typed.replace(/\s+/g, " ").trim() === String(client.name || "").replace(/\s+/g, " ").trim() && typed.trim() !== "";

  return (
    <div data-testid="client-privacy" style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
      <p style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>המידע על הלקוחה</p>
      <p style={{ ...small, marginBottom: 10 }}>אפשר להוריד עותק של כל מה ששמור עליה, כדי לתת לה אם היא מבקשת.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" onClick={() => download("json")} disabled={!!busy} style={btn}>{busy === "json" ? <Spinner inline label="מכינה" /> : "הורדה (JSON)"}</button>
        <button type="button" onClick={() => download("csv")} disabled={!!busy} style={btn}>{busy === "csv" ? <Spinner inline label="מכינה" /> : "הורדה לאקסל (CSV)"}</button>
      </div>
      {!erasing ? (
        <button type="button" onClick={() => setErasing(true)} disabled={!canWrite} style={{ ...btn, color: "var(--danger)", borderColor: "var(--danger)" }}>מחיקת הלקוחה לצמיתות</button>
      ) : (
        <div role="alertdialog" aria-label="מחיקת לקוחה" style={{ background: "var(--surface-2)", border: "1px solid var(--danger)", borderRadius: "var(--r-md)", padding: "12px 14px" }}>
          <p style={{ ...small, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>למחוק את {client.name} לצמיתות?</p>
          <p style={{ ...small, marginBottom: 8 }}>
            יימחקו: כרטיס הלקוחה, הצהרות הבריאות, סריקות העור, התמונות, הביקורות והודעות הוואטסאפ שלה. התורים והתשלומים נשארים בחשבון שלך
            כי חובה לשמור רישומים חשבונאיים, אבל בלי שם, בלי טלפון ובלי קשר אליה. אי אפשר לבטל.
          </p>
          <p style={{ ...small, marginBottom: 6 }}>להמשך, הקלידי את השם שלה בדיוק:</p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="שם הלקוחה לאישור"
            placeholder={client.name}
            style={{ width: "100%", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: 16, fontFamily: "inherit", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={erase} disabled={!nameOk || !!busy} style={{ ...btn, background: nameOk ? "var(--danger)" : "var(--surface)", color: nameOk ? "#fff" : "var(--ink-3)", borderColor: "var(--danger)" }}>
              {busy === "erase" ? <Spinner inline label="מוחקת" /> : "מחיקה לצמיתות"}
            </button>
            <button type="button" onClick={() => { setErasing(false); setTyped(""); }} disabled={busy === "erase"} style={btn}>ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

// app/claim/[token]/page.tsx
// Public, no-auth page a client opens from a WhatsApp gap-fill link. It reads
// the offer via the service-role route (/api/claim), shows the freed slot, and
// lets the first valid click claim it. RTL Hebrew, mobile-first, BloomOS look.

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// BloomOS palette (this page renders outside the main app's CSS variables).
const BLUSH = "#D98BA0";
const BLUSH_DEEP = "#B85C77";
const GOLD = "#C9A24B";
const INK = "#3A2A30";
const PAPER = "#FBF4F6";

type Details = {
  service?: string | null;
  slotDate?: string | null;
  slotHour?: number | null;
  clientName?: string | null;
  businessName?: string | null;
};

// "YYYY-MM-DD" -> "יום רביעי, 5 באוגוסט"
function formatDate(slotDate?: string | null): string {
  if (!slotDate) return "";
  const d = new Date(`${slotDate}T00:00:00`);
  if (isNaN(d.getTime())) return slotDate;
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}

function formatHour(slotHour?: number | null): string {
  if (slotHour === null || slotHour === undefined) return "";
  return `${String(slotHour).padStart(2, "0")}:00`;
}

export default function ClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [state, setState] = useState<string>("loading");
  const [details, setDetails] = useState<Details>({});
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    let active = true;
    fetch(`/api/claim?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setState(data.state || "invalid");
        setDetails(data);
      })
      .catch(() => active && setState("error"));
    return () => { active = false; };
  }, [token]);

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      setState(data.state || "error");
      if (data.service) setDetails((d) => ({ ...d, ...data }));
    } catch {
      setState("error");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div dir="rtl" style={{
      minHeight: "100dvh", background: `linear-gradient(160deg, ${PAPER} 0%, #F3E4EA 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "'Heebo', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", color: INK,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400,
        padding: "34px 26px", textAlign: "center",
        boxShadow: "0 18px 50px rgba(184,92,119,0.18)", border: "1px solid #F0DCE3",
      }}>
        <div aria-hidden style={{ fontSize: 30, marginBottom: 6 }}>🌸</div>
        <div style={{ fontSize: 12, letterSpacing: "0.14em", color: GOLD, fontWeight: 700, marginBottom: 18 }}>
          {details.businessName || " "}
        </div>

        {state === "loading" && (
          <p style={{ color: "#8A7A80", fontSize: 15, margin: "24px 0" }}>טוען…</p>
        )}

        {state === "available" && (
          <>
            <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.3 }}>
              {details.clientName ? `${details.clientName}, ` : ""}התפנה תור!
            </h1>
            <p style={{ fontSize: 14, color: "#8A7A80", margin: "0 0 22px" }}>
              רוצה לתפוס אותו? הראשונה שתלחץ — התור שלה.
            </p>
            <div style={{ background: PAPER, borderRadius: 16, padding: "18px 16px", margin: "0 0 24px", textAlign: "right" }}>
              <SlotRow label="טיפול" value={details.service || "טיפול"} />
              <SlotRow label="תאריך" value={formatDate(details.slotDate)} />
              <SlotRow label="שעה" value={formatHour(details.slotHour)} last />
            </div>
            <button
              onClick={claim}
              disabled={claiming}
              style={{
                width: "100%", padding: "16px 0", border: "none", borderRadius: 16,
                background: claiming ? "#E7C9D3" : `linear-gradient(90deg, ${BLUSH}, ${BLUSH_DEEP})`,
                color: "#fff", fontSize: 17, fontWeight: 700, cursor: claiming ? "default" : "pointer",
                fontFamily: "inherit", boxShadow: "0 8px 20px rgba(184,92,119,0.28)",
              }}
            >
              {claiming ? "רק רגע…" : "אני רוצה את התור"}
            </button>
          </>
        )}

        {state === "won" && (
          <Result emoji="✨" title="התור שלך! נתראה" tone={GOLD}
            body={`שמרנו לך את ${details.service || "התור"}${details.slotDate ? ` · ${formatDate(details.slotDate)}` : ""}${details.slotHour !== null && details.slotHour !== undefined ? ` בשעה ${formatHour(details.slotHour)}` : ""}. נתראה! 🌸`} />
        )}

        {state === "taken" && (
          <Result emoji="💔" title="התור נתפס, מצטערים" tone={BLUSH_DEEP}
            body="מישהי הקדימה אותך הפעם. נעדכן אותך בהזדמנות הבאה שמתפנה תור." />
        )}

        {state === "expired" && (
          <Result emoji="⏳" title="ההצעה פגה" tone="#9A8A90"
            body="חלון הזמן לתפוס את התור הזה נסגר. נשמח לעדכן אותך בפעם הבאה." />
        )}

        {(state === "invalid") && (
          <Result emoji="🔗" title="הקישור לא תקין" tone="#9A8A90"
            body="נראה שהקישור שגוי או ישן. אם קיבלת אותו בוואטסאפ, נסי ללחוץ שוב על הקישור המקורי." />
        )}

        {state === "error" && (
          <Result emoji="⚠️" title="משהו השתבש" tone="#C0553F"
            body="לא הצלחנו להשלים את הפעולה. נסי שוב עוד רגע, או פני אלינו בוואטסאפ." />
        )}
      </div>
    </div>
  );
}

function SlotRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 2px", borderBottom: last ? "none" : "1px solid #EFDCE3",
    }}>
      <span style={{ fontSize: 12.5, color: "#A08A92" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{value}</span>
    </div>
  );
}

function Result({ emoji, title, body, tone }: { emoji: string; title: string; body: string; tone: string }) {
  return (
    <div style={{ padding: "12px 0" }}>
      <div aria-hidden style={{ fontSize: 44, marginBottom: 10 }}>{emoji}</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", color: tone }}>{title}</h1>
      <p style={{ fontSize: 14.5, color: "#8A7A80", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

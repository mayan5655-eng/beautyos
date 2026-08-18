// app/claim/[token]/page.tsx
// Public, no-auth page a client opens from a WhatsApp gap-fill link. It reads
// the offer via the service-role route (/api/claim), shows the freed slot, and
// lets the first valid click claim it. RTL Hebrew, mobile-first, BloomOS look.

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Client-facing page: a client opens this from HER cosmetician's WhatsApp, so
// it takes the ACCENT tier (--pc-*), not the BloomOS brand tier. When the
// tenant's colour is applied the whole page follows it.
import { PC, PC_DEEP, PC_TINT, PC_SOFT, CREAM, SURFACE, MUTED, ACCENT_LINE, DEEP_SHADOW } from '@/lib/brand';

const BLUSH = PC;
const BLUSH_DEEP = PC_DEEP;
const GOLD = PC_DEEP;
const INK = 'var(--ink, #2A2233)';
const PAPER = CREAM;

type Details = {
  service?: string | null;
  slotDate?: string | null;
  slotHour?: number | null;
  slotTime?: string | null;
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

// Prefer slotTime from the API, which is formatted from slot_start_minute.
// slotHour is the pre-minutes fallback and only ever renders on the hour.
function formatHour(slotHour?: number | null, slotTime?: string | null): string {
  if (slotTime) return slotTime;
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
      minHeight: "100dvh", background: `linear-gradient(160deg, ${PAPER} 0%, ${PC_TINT} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "'Heebo', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", color: INK,
    }}>
      <div style={{
        background: SURFACE, borderRadius: 24, width: "100%", maxWidth: 400,
        padding: "34px 26px", textAlign: "center",
        boxShadow: `0 18px 50px ${DEEP_SHADOW}`, border: `1px solid ${ACCENT_LINE}`,
      }}>
        <div aria-hidden style={{ fontSize: 30, marginBottom: 6 }}>🌸</div>
        <div style={{ fontSize: 12, letterSpacing: "0.14em", color: GOLD, fontWeight: 700, marginBottom: 18 }}>
          {details.businessName || " "}
        </div>

        {state === "loading" && (
          <p style={{ color: MUTED, fontSize: 15, margin: "24px 0" }}>טוען…</p>
        )}

        {state === "available" && (
          <>
            <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.3 }}>
              {details.clientName ? `${details.clientName}, ` : ""}התפנה תור!
            </h1>
            <p style={{ fontSize: 14, color: MUTED, margin: "0 0 22px" }}>
              רוצה לתפוס אותו? הראשונה שתלחץ — התור שלה.
            </p>
            <div style={{ background: PAPER, borderRadius: 16, padding: "18px 16px", margin: "0 0 24px", textAlign: "right" }}>
              <SlotRow label="טיפול" value={details.service || "טיפול"} />
              <SlotRow label="תאריך" value={formatDate(details.slotDate)} />
              <SlotRow label="שעה" value={formatHour(details.slotHour, details.slotTime)} last />
            </div>
            <button
              onClick={claim}
              disabled={claiming}
              style={{
                width: "100%", padding: "16px 0", border: "none", borderRadius: 16,
                background: claiming ? PC_TINT : `linear-gradient(90deg, ${BLUSH}, ${BLUSH_DEEP})`,
                color: SURFACE, fontSize: 17, fontWeight: 700, cursor: claiming ? "default" : "pointer",
                fontFamily: "inherit", boxShadow: "0 8px 20px rgba(184,92,119,0.28)",
              }}
            >
              {claiming ? "רק רגע…" : "אני רוצה את התור"}
            </button>
          </>
        )}

        {state === "won" && (
          <Result emoji="✨" title="התור שלך! נתראה" tone={GOLD}
            body={`שמרנו לך את ${details.service || "התור"}${details.slotDate ? ` · ${formatDate(details.slotDate)}` : ""}${formatHour(details.slotHour, details.slotTime) ? ` בשעה ${formatHour(details.slotHour, details.slotTime)}` : ""}. נתראה! 🌸`} />
        )}

        {state === "taken" && (
          <Result emoji="💔" title="התור נתפס, מצטערים" tone={BLUSH_DEEP}
            body="מישהי הקדימה אותך הפעם. נעדכן אותך בהזדמנות הבאה שמתפנה תור." />
        )}

        {state === "expired" && (
          <Result emoji="⏳" title="ההצעה פגה" tone={MUTED}
            body="חלון הזמן לתפוס את התור הזה נסגר. נשמח לעדכן אותך בפעם הבאה." />
        )}

        {(state === "invalid") && (
          <Result emoji="🔗" title="הקישור לא תקין" tone={MUTED}
            body="נראה שהקישור שגוי או ישן. אם קיבלת אותו בוואטסאפ, נסי ללחוץ שוב על הקישור המקורי." />
        )}

        {state === "error" && (
          <Result emoji="⚠️" title="משהו השתבש" tone="var(--danger, #E05B6F)"
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
      padding: "9px 2px", borderBottom: last ? "none" : `1px solid ${ACCENT_LINE}`,
    }}>
      <span style={{ fontSize: 12.5, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{value}</span>
    </div>
  );
}

function Result({ emoji, title, body, tone }: { emoji: string; title: string; body: string; tone: string }) {
  return (
    <div style={{ padding: "12px 0" }}>
      <div aria-hidden style={{ fontSize: 44, marginBottom: 10 }}>{emoji}</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", color: tone }}>{title}</h1>
      <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

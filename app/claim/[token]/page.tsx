// app/claim/[token]/page.tsx
// Public, no-auth page a client opens from a WhatsApp gap-fill link. It reads
// the offer via the service-role route (/api/claim), shows the freed slot, and
// lets the first valid click claim it. RTL Hebrew, mobile-first, Kalmea look.

"use client";

import { useEffect, useState } from "react";
import Spinner from "../../Spinner";
import { useParams } from "next/navigation";
import { PublicPage, BusinessHeader, LineIcon } from "../../PublicChrome";

// Client-facing page: a client opens this from HER cosmetician's WhatsApp, so
// it takes the ACCENT tier (--pc-*), not the Kalmea brand tier. When the
// tenant's colour is applied the whole page follows it.
import { PC_SOFT, MUTED, ICON_CALENDAR, ICON_HEART, ICON_SPARKLE, ICON_QUESTION } from '@/lib/brand';

const INK = 'var(--ink, #2A2233)';

type Details = {
  service?: string | null;
  slotDate?: string | null;
  slotHour?: number | null;
  slotTime?: string | null;
  clientName?: string | null;
  businessName?: string | null;
  primaryColor?: string | null;
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
    <PublicPage primary={details.primaryColor || null}>
      <div className="pub-card" style={{ padding: "30px 24px 28px" }}>
        {/* Her name first and large: the offer is hers. */}
        <BusinessHeader name={details.businessName} />

        {state === "loading" && (
          <p style={{ color: MUTED, fontSize: "var(--t-lg)", margin: "24px 0" }}><Spinner inline label="טוען" /></p>
        )}

        {state === "available" && (
          <>
            <h1 className="pub-h1">{details.clientName ? `${details.clientName}, ` : ""}התפנה תור!</h1>
            <p style={{ fontSize: "var(--t-md)", color: MUTED, margin: "0 0 20px" }}>רוצה לתפוס אותו? הראשונה שתלחץ — התור שלה.</p>
            <div style={{ background: "var(--pc-tint, #FDF6F6)", borderRadius: "var(--r-md)", padding: "16px 16px", margin: "0 0 22px", textAlign: "right" }}>
              <SlotRow label="טיפול" value={details.service || "טיפול"} />
              <SlotRow label="תאריך" value={formatDate(details.slotDate)} />
              <SlotRow label="שעה" value={formatHour(details.slotHour, details.slotTime)} last />
            </div>
            <button onClick={claim} disabled={claiming} className="pub-pill">
              {claiming ? <Spinner inline label="רק רגע" /> : "אני רוצה את התור"}
            </button>
          </>
        )}

        {state === "won" && (
          <Result icon={ICON_SPARKLE} title="התור שלך! נתראה"
            body={`שמרנו לך את ${details.service || "התור"}${details.slotDate ? ` · ${formatDate(details.slotDate)}` : ""}${formatHour(details.slotHour, details.slotTime) ? ` בשעה ${formatHour(details.slotHour, details.slotTime)}` : ""}. נתראה! 🌸`} />
        )}

        {state === "taken" && (
          <Result icon={ICON_HEART} title="התור נתפס, מצטערים"
            body="מישהי הקדימה אותך הפעם. נעדכן אותך בהזדמנות הבאה שמתפנה תור." />
        )}

        {state === "expired" && (
          <Result icon={ICON_CALENDAR} title="ההצעה פגה"
            body="חלון הזמן לתפוס את התור הזה נסגר. נשמח לעדכן אותך בפעם הבאה." />
        )}

        {(state === "invalid") && (
          <Result icon={ICON_QUESTION} title="הקישור לא תקין"
            body="נראה שהקישור שגוי או ישן. אם קיבלת אותו בוואטסאפ, נסי ללחוץ שוב על הקישור המקורי." />
        )}

        {state === "error" && (
          <Result icon={ICON_QUESTION} title="משהו השתבש"
            body="לא הצלחנו להשלים את הפעולה. נסי שוב עוד רגע, או פני אלינו בוואטסאפ." />
        )}
      </div>
    </PublicPage>
  );
}

function SlotRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 2px", borderBottom: last ? "none" : `1px solid ${PC_SOFT}`,
    }}>
      <span style={{ fontSize: "var(--t-sm)", color: MUTED }}>{label}</span>
      <span style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: INK }}>{value}</span>
    </div>
  );
}

// An outcome with a brand line icon (empty and error states carry the quiet line icons, per the public-page language).
function Result({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ padding: "6px 0" }}>
      <LineIcon src={icon} />
      <h1 className="pub-h1">{title}</h1>
      <p style={{ fontSize: "var(--t-md)", color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

// app/claim/[token]/page.tsx
// Public, no-auth page a client opens from a WhatsApp gap-fill link. It reads
// the offer via the service-role route (/api/claim), shows the freed slot, and
// lets the first valid click claim it. RTL Hebrew, mobile-first, Kalmea look.
// Client-facing page: a client opens this from HER cosmetician's WhatsApp, so
// it takes the ACCENT tier (--pc-*), not the Kalmea brand tier. When the
// tenant's colour is applied the whole page follows it.
//
// Round-2 audit (2026-11-16): the page speaks her page's language (/api/claim returns branding.language; every string goes through
// tr(), like the booking page), the date is read as a calendar day (lib/i18n/dates.ts, never the browser's time zone), a failed
// load offers "נסי שוב", and "invalid" and "won" no longer end in a dead end when her booking link or WhatsApp is known.
"use client";

import { useEffect, useState } from "react";
import Spinner from "../../Spinner";
import { useParams } from "next/navigation";
import { PublicPage, BusinessHeader, LineIcon } from "../../PublicChrome";
import { trFor, type Tr } from "@/lib/i18n/publicTr";
import { normalizeLang } from "@/lib/i18n/core";
import { dateLabel } from "@/lib/i18n/dates";

import { PC_SOFT, MUTED, ICON_CALENDAR, ICON_HEART, ICON_SPARKLE, ICON_QUESTION } from '@/lib/brand';

const INK = 'var(--ink, #1F3A30)';

type Details = {
  service?: string | null;
  slotDate?: string | null;
  slotHour?: number | null;
  slotTime?: string | null;
  clientName?: string | null;
  businessName?: string | null;
  primaryColor?: string | null;
  bookUrl?: string | null;
  whatsapp?: string | null;
  language?: string | null;
};

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const lang = normalizeLang(details.language);
  const tr = trFor(lang);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    let active = true;
    setLoadFailed(false);
    fetch(`/api/claim?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setState(data.state || "invalid");
        setDetails(data);
      })
      .catch(() => { if (active) { setLoadFailed(true); setState("error"); } });
    return () => { active = false; };
  }, [token, attempt]);

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
      if (data.service) setDetails((d) => ({ ...d, ...data, language: d.language }));
    } catch {
      setState("error");
    } finally {
      setClaiming(false);
    }
  }

  const when = dateLabel(details.slotDate, lang);
  const hour = formatHour(details.slotHour, details.slotTime);
  const hasContact = !!(details.bookUrl || details.whatsapp);

  return (
    <PublicPage primary={details.primaryColor || null}>
      <div className="pub-card" style={{ padding: "30px 24px 28px" }}>
        {/* Her name first and large: the offer is hers. */}
        <BusinessHeader name={details.businessName} />

        {state === "loading" && (
          <p style={{ color: MUTED, fontSize: "var(--t-lg)", margin: "24px 0" }}><Spinner inline label={tr("טוענת")} /></p>
        )}

        {state === "available" && (
          <>
            <h1 className="pub-h1">{details.clientName ? tr("{0}, התפנה תור!", [details.clientName]) : tr("התפנה תור!")}</h1>
            <p style={{ fontSize: "var(--t-md)", color: MUTED, margin: "0 0 20px" }}>{tr("רוצה לתפוס אותו? הראשונה שלוחצת מקבלת את התור.")}</p>
            <div style={{ background: "var(--pc-tint, #FDF6F6)", borderRadius: "var(--r-md)", padding: "16px 16px", margin: "0 0 22px", textAlign: "start" }}>
              <SlotRow label={tr("טיפול")} value={details.service || tr("טיפול")} />
              <SlotRow label={tr("תאריך")} value={when} />
              <SlotRow label={tr("שעה")} value={hour} ltr last />
            </div>
            <button onClick={claim} disabled={claiming} className="pub-pill">
              {claiming ? <Spinner inline label={tr("רק רגע")} /> : tr("אני רוצה את התור")}
            </button>
          </>
        )}

        {state === "won" && (
          <Result icon={ICON_SPARKLE} title={tr("התור שלך! נתראה")}
            body={[tr("שמרנו לך את {0}", [details.service || tr("התור")]), when, hour ? tr("בשעה {0}", [hour]) : ""].filter(Boolean).join(" · ") + ". " + tr("נתראה! 🌸")} />
        )}

        {state === "taken" && (
          <Result icon={ICON_HEART} title={tr("אוי, התור כבר נתפס")}
            body={tr("מישהי הקדימה אותך הפעם. נעדכן אותך בהזדמנות הבאה שמתפנה תור.")} />
        )}

        {state === "expired" && (
          <Result icon={ICON_CALENDAR} title={tr("ההצעה פגה")}
            body={tr("חלון הזמן לתפוס את התור הזה נסגר. נשמח לעדכן אותך בפעם הבאה.")} />
        )}

        {(state === "invalid") && (
          <Result icon={ICON_QUESTION} title={tr("הקישור לא תקין")}
            body={tr("נראה שהקישור שגוי או ישן. אם קיבלת אותו בוואטסאפ, נסי ללחוץ שוב על הקישור המקורי.")} />
        )}

        {/* A service with a deposit or her cancellation policy is booked on her booking page, never in one tap (lib/claimGuard.ts). */}
        {state === "needs_booking" && (
          <Result icon={ICON_CALENDAR} title={tr("עוד צעד קטן")}
            body={tr("כדי לשמור את התור הזה צריך לקבוע אותו דרך דף ההזמנות, שם מאשרים את תנאי ההזמנה (ולפעמים משלמים מקדמה). זה לוקח דקה.")} />
        )}

        {state === "error" && (
          <>
            {/* Only promise WhatsApp when there is a number to write to. */}
            <Result icon={ICON_QUESTION} title={tr("משהו השתבש")}
              body={hasContact ? tr("לא הצלחנו להשלים את הפעולה. נסי שוב עוד רגע, או כתבי לעסק.") : tr("לא הצלחנו להשלים את הפעולה. נסי שוב עוד רגע.")} />
            {loadFailed && (
              <button type="button" data-testid="claim-retry" className="pub-pill" style={{ marginTop: 18 }} onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>{tr("נסי שוב")}</button>
            )}
          </>
        )}

        {/* Another time on her booking page, or a word with her (lib/publicContact.ts), wherever the client could otherwise be stuck. */}
        {state !== "loading" && state !== "available" && (
          <NextSteps tr={tr} bookUrl={state === "won" ? null : details.bookUrl} whatsapp={details.whatsapp} businessName={details.businessName} />
        )}
      </div>
    </PublicPage>
  );
}

function SlotRow({ label, value, last, ltr }: { label: string; value: string; last?: boolean; ltr?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 2px", borderBottom: last ? "none" : `1px solid ${PC_SOFT}`,
    }}>
      <span style={{ fontSize: "var(--t-sm)", color: MUTED }}>{label}</span>
      <span style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: INK }}>{ltr ? <bdi dir="ltr">{value}</bdi> : value}</span>
    </div>
  );
}

// An outcome with a brand line icon (empty and error states carry the quiet line icons, per the public-page language).
function NextSteps({ tr, bookUrl, whatsapp, businessName }: { tr: Tr; bookUrl?: string | null; whatsapp?: string | null; businessName?: string | null }) {
  const book = typeof bookUrl === "string" && bookUrl.startsWith("/") ? bookUrl : "";
  const wa = /^\d{8,15}$/.test(String(whatsapp || "")) ? String(whatsapp) : "";
  if (!book && !wa) return null;
  return (
    <div data-testid="claim-next" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
      {book && <a href={book} className="pub-pill" style={{ textDecoration: "none" }}>{tr("קביעת מועד אחר")}</a>}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="pub-pill pub-pill-quiet" style={{ textDecoration: "none" }}>{tr("כתיבה ל{0} בוואטסאפ", [businessName || tr("עסק")])}</a>}
    </div>
  );
}

function Result({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ padding: "6px 0" }}>
      <LineIcon src={icon} />
      <h1 className="pub-h1">{title}</h1>
      <p style={{ fontSize: "var(--t-md)", color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

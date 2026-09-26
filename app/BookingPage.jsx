"use client";
import { useState, useEffect } from "react";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { supabase } from "./supabase";
import { dayHoursFrom, isOpenOn, normalizeBusinessHours } from "@/lib/businessHours";
import { fetchPublicSettings, resolveBranding, DEFAULT_HOW_I_WORK, DEFAULT_HERO_HEADLINE, DEFAULT_HERO_BENEFITS, DEFAULT_VALUE_PROPS } from "@/lib/branding";
import { defaultImageUrl, serviceImage } from "@/lib/defaultImages";
import { cleanPublicResults, groupResults, groupKeyForService, resultsForService } from "@/lib/results";
import { ACTIVE_OR_NULL } from "@/lib/serviceActive";
import { startMinute, endMinute, fmtTime, overlaps, slotsBetween } from "@/lib/apptTime";
import { isTooSoonForSelfBooking } from "@/lib/bookingPolicy";
import { phoneErrorHe } from "@/lib/phone";
import { accentStyle } from "@/lib/theme";

// ============================================================
// PUBLIC BOOKING PAGE  —  /book
// An elegant Google-Business-Profile-style mini-site for each clinic,
// with her BloomOS branding, that opens straight into the booking flow.
//
// MULTI-TENANT: this is a public page (no login), so the tenant is
// identified from the ?t=<tenantId> URL param. Every data query below
// is scoped to that tenant, so each cosmetician gets her own clean
// booking page (her services, her hours, her booked slots only).
// ============================================================

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function hh(n) { return `${String(n).padStart(2, "0")}:00`; }

// Normalize a phone into an international wa.me target (Israel-aware): strip
// non-digits, convert a leading 0 to 972, accept an already-972 or bare 9-digit.
function normalizeWa(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return d;
}
// Build a full URL from a handle OR a pasted link.
function socialHref(base, val) {
  const v = String(val || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, "");
}

const HAIR = "rgba(74,46,90,0.14)";

// A picture that never leaves a hole: missing or broken (a default not yet
// shipped, a deleted upload) falls back to a soft tint instead of an icon.
function Photo({ src, style, eager = false }) {
  const [badSrc, setBadSrc] = useState(null);
  const bad = badSrc === src;
  if (!src || bad) {
    return <div aria-hidden="true" style={{ ...style, background: "linear-gradient(135deg, var(--pc-tint, #F1E7F0) 0%, var(--brand-cream, #FEFAF7) 100%)" }} />;
  }
  return <img src={src} alt="" loading={eager ? "eager" : "lazy"} onError={() => setBadSrc(src)} style={{ ...style, objectFit: "cover", objectPosition: "center", display: "block" }} />;
}

// Small botanical mark + rules either side: the section beat, used on every
// section title so the ornament stays a rhythm, not decoration everywhere.
function SectionTitle({ children }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <svg width="30" height="20" viewBox="0 0 30 20" fill="none" stroke="var(--pc)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", margin: "0 auto 4px" }}>
        <path d="M15 18C11 15 10 9 15 2c5 7 4 13 0 16z" />
        <path d="M14 18C9 18 4 14 3 9c5 0 9 3 11 9z" />
        <path d="M16 18c5 0 10-4 11-9-5 0-9 3-11 9z" />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: HAIR }} />
        <h2 className="serif" style={{ margin: 0, fontSize: "var(--t-xl)", fontWeight: 600, color: "var(--ink, #2A2233)", lineHeight: 1.3 }}>{children}</h2>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: HAIR }} />
      </div>
    </div>
  );
}

const VALUE_ICON_PATHS = [
  <path key="h" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  <g key="f"><path d="M12 21c-4 0-8-3-8-9 4 0 7 2 8 5 1-3 4-5 8-5 0 6-4 9-8 9z" /><path d="M12 17c-2-3-2-8 0-13 2 5 2 10 0 13z" /></g>,
  <g key="l"><path d="M5 21C5 11 10 5 21 3c0 10-5 17-14 17" /><path d="M5 21C9 14 13 10 17 8" /></g>,
  <path key="s" d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />,
];
function ValueIcon({ i }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {VALUE_ICON_PATHS[i % VALUE_ICON_PATHS.length]}
    </svg>
  );
}

// One before/after pair. Drag anywhere on it (pointer events, so touch and
// mouse both work; vertical scrolling stays with the page) or use the arrow
// keys on the hidden range input.
function BeforeAfterSlider({ before, after }) {
  const [pos, setPos] = useState(50);
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    setPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };
  return (
    <div dir="ltr"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e); }}
      style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: "var(--r-md)", overflow: "hidden", touchAction: "pan-y", userSelect: "none", border: "1px solid " + HAIR }}>
      <Photo src={after} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", inset: 0, clipPath: "inset(0 " + (100 - pos) + "% 0 0)" }}>
        <Photo src={before} style={{ width: "100%", height: "100%" }} />
      </div>
      <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: pos + "%", width: 2, marginLeft: -1, background: "#fff", boxShadow: "var(--shadow-sm)" }}>
        <span style={{ position: "absolute", top: "50%", left: "50%", width: 30, height: 30, marginTop: -15, marginLeft: -15, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-sm)", color: "#555" }}>‹›</span>
      </div>
      <span aria-hidden="true" style={{ position: "absolute", bottom: 8, left: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>לפני</span>
      <span aria-hidden="true" style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>אחרי</span>
      <input type="range" min="0" max="100" value={Math.round(pos)} onChange={(e) => setPos(Number(e.target.value))} aria-label="השוואת לפני ואחרי"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, pointerEvents: "none", margin: 0 }} />
    </div>
  );
}

// One published result: a slider when there is a before, a single "after" when there
// is not, then her line and the session count.
function ResultCard({ result }) {
  return (
    <div>
      {result.before ? (
        <BeforeAfterSlider before={result.before} after={result.after} />
      ) : (
        <div style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid " + HAIR }}>
          <Photo src={result.after} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          <span aria-hidden="true" style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>אחרי</span>
        </div>
      )}
      {(result.caption || result.sessions) && (
        <p style={{ margin: "8px 0 0", fontSize: "var(--t-sm)", color: "var(--ink-2, #6B6275)", lineHeight: 1.5, textAlign: "center" }}>
          {result.caption}
          {result.caption && result.sessions ? " · " : ""}
          {result.sessions ? result.sessions + " טיפולים" : ""}
        </p>
      )}
    </div>
  );
}

/**
 * The whole client-facing page: her shop window and the four-step booking flow.
 *
 * It lives here rather than under a route because TWO routes render it now.
 * /[slug] is the canonical one - a readable URL she can say out loud, and the
 * only one that can carry per-tenant Open Graph tags, since those need a server
 * component and this is emphatically a client one. /book?t=<uuid> is every link
 * she has already sent to a client, and has to keep working forever.
 *
 * tenantId comes as a prop from /[slug], which has already resolved the slug on
 * the server. Without it the component falls back to reading ?t= itself, which
 * is exactly what it always did.
 */
export default function BookingPage({ tenantId: tenantIdProp }) {
  // === DATA ===
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState(null);
  const [tenantError, setTenantError] = useState(false);
  // Whether the busy-slot list actually loaded. Distinct from "nothing is
  // booked", and the distinction matters: conflating the two is what made the
  // old bug invisible, because a failed read looked exactly like a free diary.
  const [availabilityError, setAvailabilityError] = useState(false);
  const [brand, setBrand] = useState(null); // resolved clinic branding (safe fallbacks)
  const [posts, setPosts] = useState([]); // her client-facing announcements (public, read-only)
  // Reviews written by clients. null until the read resolves, so "none yet" and
  // "not loaded" stay apart.
  const [dbReviews, setDbReviews] = useState(null);
  // Client result photos she has published WITH a consent record (the database
  // serves nothing else). Empty when none, or when the read fails: a result is
  // never worth blocking the page for.
  const [results, setResults] = useState([]);
  const [showAllHours, setShowAllHours] = useState(false);

  // === BOOKING FLOW STATE ===
  const [step, setStep] = useState(1); // 1=business card + service, 2=date+time, 3=details, 4=done
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  // Minutes from midnight. Named for what it holds, so it cannot be confused
  // with the whole-hour value the old wire format used.
  const [selectedStart, setSelectedStart] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Consent to the booking's data use, ticked before submit. Interim wording
  // until the lawyer's answer; the point is that nothing is stored or sent
  // before she has been told what for and has said yes.
  const [agreed, setAgreed] = useState(false);

  // Read the tenant from the URL (?t=...) on mount, then load that tenant's data.
  useEffect(() => {
    let t = tenantIdProp || null, svc = null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (!t) t = params.get("t");
      // Context carried over from the skin scanner (or any deep link) so the
      // visitor never re-enters what we already know.
      svc = params.get("service");
      const nm = params.get("name");
      const ph = params.get("phone");
      if (nm) setName(nm);
      if (ph) setPhone(ph);
    } catch {}
    if (!t) {
      // No tenant in the URL - we cannot safely show any business's data.
      setTenantError(true);
      setLoading(false);
      return;
    }
    setTenantId(t);
    loadData(t, svc);
    // Mount only. tenantIdProp is fixed for the life of a rendered page - the
    // server resolved it before this component existed - so listing it would
    // add a dependency that cannot change and re-run the whole load if it did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (t, prefillServiceName) => {
    try {
      // Every query is scoped to this tenant only.
      const [row, sv, ap, rv, rs] = await Promise.all([
        // SECURITY: public-safe settings via the shared layer (hardened RPC, no
        // direct anonymous settings access; never green_api_token or other secrets).
        fetchPublicSettings(supabase, t),
        supabase.from("service_prices").select("*").eq("tenant_id", t).or(ACTIVE_OR_NULL),
        // Busy slots come from the server, NOT from a direct table read.
        //
        // This used to be supabase.from("appointments") on the anon key. RLS
        // denies anon on that table, so it returned zero rows to every real
        // visitor - as data, not as an error - and the page cheerfully showed
        // every slot as free. /api/availability does the read on the service
        // role and returns TIMES ONLY (date, start_minute, hour, duration);
        // no names, phones, services or prices.
        fetch(`/api/availability?t=${encodeURIComponent(t)}`)
          .then((r) => r.json())
          .catch(() => ({ success: false })),
        // Reviews a client wrote, through the same SECURITY DEFINER pattern as
        // the branding: anon holds no privilege on public.reviews in either
        // direction, and the function returns published rows only - so "hidden"
        // is enforced once, in the database, rather than remembered by every
        // caller.
        supabase.rpc("get_public_reviews", { p_tenant_id: t }),
        supabase.rpc("get_public_results", { p_tenant_id: t }),
      ]);
      setResults(rs?.error ? [] : cleanPublicResults(rs?.data));

      // A failed read leaves this null, which falls back to the hand-typed
      // array below rather than showing a business with no reviews at all.
      setDbReviews(rv?.error ? null : (rv?.data || []));

      if (row) {
        setSettings(row);
        setBrand(resolveBranding(row)); // logo/colors/welcome/gallery/socials from the branding jsonb
      } else {
        // Tenant has no settings row - treat as not found rather than guessing.
        setTenantError(true);
        setLoading(false);
        return;
      }

      if (sv.data && sv.data.length > 0) {
        const active = sv.data.filter((s) => s.active !== false);
        setServices(active);
        // Preserve the scanner's recommended treatment: preselect it and skip the
        // service-selection step so the visitor lands straight on date/time.
        if (prefillServiceName) {
          const match = active.find((s) => s.name === prefillServiceName);
          if (match) { setSelectedService(match); setStep(2); }
        }
      }
      // Only treat this as availability when the server actually said so.
      // Anything else - transport failure, rate limit, 500 - is recorded as an
      // ERROR and surfaced to the visitor, never quietly rendered as "free".
      if (ap && ap.success && Array.isArray(ap.busy)) {
        setAppointments(ap.busy);
        setAvailabilityError(false);
      } else {
        setAppointments([]);
        setAvailabilityError(true);
        console.error("availability load failed:", ap?.error || "unknown");
      }

      // Her client-facing announcements feed. Read through the SAME vetted safe
      // public endpoint the standalone /community page uses (service role, returns
      // ONLY whitelisted non-secret fields, scoped to this tenant). Best-effort:
      // any failure just leaves the feed empty and never blocks the booking flow.
      try {
        const cRes = await fetch(`/api/community?t=${encodeURIComponent(t)}`);
        const cData = await cRes.json();
        if (cData && cData.success && Array.isArray(cData.posts)) setPosts(cData.posts);
      } catch { /* announcements are optional — ignore */ }
    } catch (err) {
      console.error("loadData error:", err);
      setTenantError(true);
    } finally {
      setLoading(false);
    }
  };

  // The tenant's accent is set ONCE, as CSS variables on the page root
  // (accentStyle → --pc, --pc-deep, --pc-tint, --pc-soft …). Everything below
  // reads the variables, so no heading can fall back to the default purple.
  const accent = brand?.primary || settings?.primary_color || "#4A2E5A";
  const pc = "var(--pc)";
  const deep = "var(--pc-deep)";

  // Half-hour granularity, and slotsBetween refuses any start whose treatment
  // would run past closing - the old loop offered the last hour of the day even
  // when a 90-minute service could not possibly fit inside it.
  const SLOT_STEP = 30;
  // Before she has picked a treatment - which is when the booking button and
  // the day count are decided - the shortest one on the menu is the honest
  // question to ask: "could this business fit anybody in at all". A flat 60
  // would hide a clinic that only does 30-minute visits in the gaps it has.
  const shortestService = services.reduce((m, sv) => Math.min(m, Number(sv.duration) || 60), Infinity);
  const svcDuration = Number(selectedService?.duration)
    || (Number.isFinite(shortestService) ? shortestService : 60);

  // Busy INTERVALS, not busy hours. The old version marked only the hour an
  // appointment started in, so a 90-minute booking at 14:00 left 15:00 on offer
  // and the server refused it with a 409 after the client had already picked it.
  // It also read `hour` alone, so a 14:30 booking made in the app was invisible
  // here and a client could book straight over it.
  //
  // Her own personal events are in here too. /api/availability returns them as
  // times with no title - it selects date, start_minute, hour and duration and
  // nothing else - so a day she has blocked out is busy to this page without it
  // needing to know what she blocked it for.
  const busyOn = (dateStr) => appointments
    .filter((a) => a.date === dateStr && a.confirmation_status !== "cancelled")
    .map((a) => [startMinute(a), endMinute(a)])
    .filter(([bs, be]) => bs !== null && be !== null);

  // Could this treatment actually be booked on this day?
  //
  // A day whose every slot is taken used to sit in the strip looking bookable,
  // and only turned out not to be after she tapped it and read a grid of
  // disabled buttons. That reads as a busy clinic; the truth is that there is
  // nothing there for her, and saying so is shorter and kinder. It matters more
  // now that a day off is a thing she can block out in one action - a week of
  // holiday would otherwise be seven days of dead chips.
  const dayHasFreeSlot = (d) => {
    const dh = dayHoursFrom(settings, d.getDay());
    if (!dh) return false;
    const ds = formatDate(d);
    const busy = busyOn(ds);
    return slotsBetween(dh.open, dh.close, SLOT_STEP, svcDuration).some((m) =>
      !isTooSoonForSelfBooking(ds, m) &&
      !busy.some(([bs, be]) => overlaps(m, m + svcDuration, bs, be))
    );
  };

  // === Build the next 14 BOOKABLE days (respecting per-day business_hours) ===
  // If availability could not be loaded, appointments is empty and every open
  // day looks free - which is the right way to degrade: the page keeps offering
  // days and warns at the slot level, rather than hiding her whole diary
  // because one fetch failed.
  const availableDays = [];
  for (let i = 0; i < 21 && availableDays.length < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (isOpenOn(settings, d) && dayHasFreeSlot(d)) availableDays.push(d);
  }

  // === Build hours for the SELECTED day (its own open→close window) ===
  const selDayHours = selectedDate ? dayHoursFrom(settings, selectedDate.getDay()) : null;
  const allSlots = selDayHours
    ? slotsBetween(selDayHours.open, selDayHours.close, SLOT_STEP, svcDuration)
    : [];

  const busyToday = selectedDate ? busyOn(formatDate(selectedDate)) : [];
  const slotTaken = (start) =>
    busyToday.some(([bs, be]) => overlaps(start, start + svcDuration, bs, be));

  // Minimum notice for client self-booking. The server enforces the same rule -
  // this only keeps the page from offering a slot that would then be rejected.
  const selectedDateStr = selectedDate ? formatDate(selectedDate) : null;
  const tooSoon = (start) =>
    selectedDateStr !== null && isTooSoonForSelfBooking(selectedDateStr, start);

  // What step 2 actually puts on screen, hoisted so the grid and its empty
  // state read the same list. Late in the day every remaining slot is inside
  // the notice window, and a treatment longer than the day leaves slotsBetween
  // with nothing to return - both render an empty grid that looks identical to
  // a grid still loading.
  const visibleSlots = allSlots.filter((m) => !tooSoon(m));
  const everySlotTaken = visibleSlots.length > 0 && visibleSlots.every(slotTaken);

  const handleConfirm = async () => {
    setErrorMsg("");
    if (!name.trim()) { setErrorMsg("נא להזין שם"); return; }
    // A number we cannot reach is not a booking. This used to be a non-empty
    // check on both sides, so "abc" saved an appointment, sent no confirmation,
    // and told neither of them anything was wrong. Same rule server-side.
    const phoneErr = phoneErrorHe(phone);
    if (phoneErr) { setErrorMsg(phoneErr); return; }
    if (!agreed) { setErrorMsg("כדי לקבוע תור צריך לאשר את שמירת הפרטים"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      // The API saves the appointment AND sends WhatsApp messages to both
      // the client and the business owner. We pass the tenantId so it lands
      // in the right account.
      const res = await fetch("/api/book-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          service: selectedService.name,
          date: formatDate(selectedDate),
          // Explicit minutes. The server reads startMinute in preference to
          // hour precisely so a bare number can never be ambiguous.
          startMinute: selectedStart,
          duration: selectedService.duration || 60,
          price: selectedService.price || 0,
          color: selectedService.color || pc,
          tenantId: tenantId,
        }),
      });
      const result = await res.json();
      // Prefer the server's specific message (e.g. "slot taken") when provided,
      // otherwise fall back to the generic error.
      if (!result.success) { setErrorMsg(result.error || "אירעה שגיאה. נסי שוב."); setSubmitting(false); return; }
      setStep(4);
    } catch (err) {
      setErrorMsg("אירעה שגיאה. נסי שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "var(--brand-cream, #FEFAF7)", fontSize:"var(--t-lg)", letterSpacing: "1px", color: pc }}>
        ✦ טוען
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "linear-gradient(160deg, var(--brand-cream, #FEFAF7) 0%, var(--brand-cream, #FEFAF7) 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize:"var(--t-hero)", marginBottom: 16, color: "var(--pc, #4A2E5A)" }}>✦</div>
        <h1 className="serif" style={{ fontSize:"var(--t-2xl)", fontWeight: 600, color: "var(--brand-muted, #98879B)", marginBottom: 10, letterSpacing: "0.3px" }}>הקישור אינו תקין</h1>
        <p style={{ fontSize:"var(--t-md)", color: "var(--brand-muted, #98879B)", maxWidth: 320, lineHeight: 1.7 }}>
          נראה שהקישור לקביעת התור חסר או שגוי. אנא פני לעסק לקבלת קישור עדכני.
        </p>
      </div>
    );
  }

  // === Derived branding/business-card values ===
  // WHOSE PAGE THIS IS. Only the business name answers that, so only the
  // business name is allowed to.
  //
  // welcomeHeadline used to sit at the front of this chain, which made a
  // tagline REPLACE the name rather than accompany it. A clinic with
  // "הטיפוח שלך מתחיל כאן" in that field had a shop window that never said
  // whose shop it was - and the field is called "opening headline" in settings,
  // so nobody filling it in could have known that was the trade. It rendered as
  // designed for weeks and the design was wrong.
  //
  // The fallback chain that remains is about WHERE the name is read from, not
  // WHAT stands in for it. If business_name really is empty the page now says
  // so plainly instead of borrowing the tagline to cover it, which is the
  // prompt to go and fill it in.
  const bizName = brand?.businessName || settings?.business_name || "העסק שלי";
  // Her line, under her name. Optional - most clinics never set one.
  const personName = brand?.therapistName || settings?.therapist_name || "";
  const personTitle = brand?.therapistTitle || "";
  const person = [personName, personTitle].filter(Boolean).join(" · ");
  const phoneRaw = String(brand?.whatsappNumber || settings?.business_phone || "").trim();
  const wa = normalizeWa(phoneRaw);
  // Whether this clinic can actually take a booking right now. Everything that
  // offers one keys off this: with no services there is no bookable thing, and
  // with no open day in the next three weeks there is nowhere to put one. A
  // page that shows a booking button anyway wastes her client's time and loses
  // the enquiry silently.
  const hasServices = services.length > 0;
  const hasOpenDays = availableDays.length > 0;
  const canBook = hasServices && hasOpenDays;
  // The sticky bar exists whenever there is something to tap: WhatsApp if she has a
  // number, otherwise the online flow (which needs a bookable service and day).
  const barShown = !!wa || canBook;
  const waHref = wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent("היי, אשמח לקבוע תור") : "";
  // Public-page copy: hers when set, otherwise a default that claims nothing.
  const heroHeadline = brand?.welcomeHeadline || DEFAULT_HERO_HEADLINE;
  const heroLines = heroHeadline.split(/\n|(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const heroBenefits = brand?.heroBenefits || brand?.welcomeMessage || DEFAULT_HERO_BENEFITS;
  const scriptAccent = brand?.scriptAccent || "טיפוח שמתחיל באהבה עצמית";
  const aboutSignoff = brand?.aboutSignoff || "";
  const aboutText = brand?.businessDescription || "ברוכה הבאה! כאן תמצאי טיפולים המותאמים אישית לעור שלך, באווירה רגועה ונעימה.";
  const valueProps = brand?.valueProps && brand.valueProps.length ? brand.valueProps : DEFAULT_VALUE_PROPS;
  const resultGroups = groupResults(results, services);
  const addr = brand?.address || "";
  const mapsHref = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "";
  const gallery = brand?.gallery || [];
  const clinicPhotos = brand?.clinicPhotos || [];
  // null = she never touched it -> the seeded default; [] = explicitly cleared.
  const howIWork = brand?.howIWork === null || brand?.howIWork === undefined
    ? DEFAULT_HOW_I_WORK
    : brand.howIWork;
  // REAL REVIEWS WIN. dbReviews comes from clients who were actually here;
  // brand.reviews is the array she types herself in the branding tab. The old
  // array is kept as a FALLBACK and not deleted, so nobody's existing
  // testimonials vanish the day this ships - but the moment one real review
  // exists, the typed ones stop being shown. A page cannot claim both.
  const reviews = (dbReviews && dbReviews.length)
    ? dbReviews.map((r) => ({ name: r.client_name, rating: r.rating, text: r.body }))
    : (brand?.reviews || []);
  // Whether the number above the stars is standing on anything. Three reviews
  // averaging 5.0 should not wear the same clothes as sixty.
  const reviewsAreReal = !!(dbReviews && dbReviews.length);
  const avgRating = reviews.length ? reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length : 0;
  const now = new Date();
  const weekHours = normalizeBusinessHours(settings);
  const todayHours = weekHours[now.getDay()];
  const socials = [
    brand?.website && { key: "web", label: "אתר", href: socialHref("https://", brand.website) },
    brand?.instagram && { key: "ig", label: "אינסטגרם", href: socialHref("https://instagram.com/", brand.instagram) },
    brand?.facebook && { key: "fb", label: "פייסבוק", href: socialHref("https://facebook.com/", brand.facebook) },
    brand?.tiktok && { key: "tt", label: "טיקטוק", href: socialHref("https://tiktok.com/@", brand.tiktok) },
  ].filter(Boolean);

  // Client-facing announcements: newest first, cap to keep the mini-site tight.
  const recentPosts = (posts || []).slice(0, 5);
  const postTypeLabel = (t) => (t === "offer" ? "מבצע" : t === "tip" ? "טיפ" : "עדכון");
  // Offers lean on the brand color; tips a soft sage; updates a quiet neutral.
  const postTypeColor = (t) => (t === "offer" ? pc : t === "tip" ? "var(--success, #46B37B)" : faint);


  const goToResults = (key) => {
    const el = typeof document !== "undefined" ? document.getElementById("bk-results-" + key) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToServices = () => {
    const el = typeof document !== "undefined" ? document.getElementById("bk-services") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // === refined style tokens (premium / luxury visual layer) ===
  const ink = "var(--ink, #2A2233)";
  const muted = "var(--brand-muted, #98879B)";
  const faint = "var(--brand-muted, #98879B)";
  const hair = "rgba(74,46,90,0.14)";
  // One shape for every "here is why this is empty" line on the page.
  const noticeBox = { background: "var(--brand-cream, #FEFAF7)", border: `1px solid ${hair}`, borderRadius:"var(--r-sm)", padding: "10px 13px", marginBottom: 12, fontSize:"var(--t-sm)", lineHeight: 1.6, color: ink };
  const cream = "var(--brand-cream, #FEFAF7)";
  // ── type scale ───────────────────────────────────────────────────────────
  // display / body / meta. Nothing between them, because a size that is nearly
  // another size is just noise. Hebrew carries more leading than Latin at the
  // same size, so body runs at 1.7.
  const T_BODY    = { fontSize:"var(--t-lg)", fontWeight: 400, lineHeight: 1.7 };
  const T_META    = { fontSize:"var(--t-md)", fontWeight: 400, lineHeight: 1.5 };

  const section = { width: "100%", maxWidth: 540, padding: "0 20px", marginBottom: 34 };
  const cardBox = { background: "var(--brand-surface, #FAF6FC)", borderRadius:"var(--r-lg)", padding: "26px 24px", boxShadow:"var(--shadow-lg)", border: `1px solid ${hair}` };
  // The section beat: every section opens the same way - a short accent dash,
  // then the serif title, then 14px of air. One rhythm down the whole page, so
  // the sections read as movements of one piece rather than widgets stacked.
  const eyebrow = (text) => (
    <div style={{ marginBottom: 14 }}>
      <span aria-hidden="true" style={{ display: "block", width: 22, height: 2, borderRadius:"var(--r-xs)", background: pc, marginBottom: 10 }} />
      <p className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: ink, lineHeight: 1.3 }}>{text}</p>
    </div>
  );
  const socialPill = (bg, color, borderColor) => ({ display: "inline-flex", alignItems: "center", gap: 7, background: bg, color: color || "var(--brand-surface, #FAF6FC)", textDecoration: "none", padding: "10px 20px", borderRadius:"var(--r-full)", fontSize:"var(--t-sm)", fontWeight: 600, letterSpacing: "0.4px", border: borderColor ? `1px solid ${borderColor}3D` : "none", boxShadow:"var(--shadow-md)" });

  return (
    <div dir="rtl" style={{ ...accentStyle(accent), fontFamily: "var(--font-assistant), 'Assistant', sans-serif", background: "linear-gradient(180deg,var(--brand-cream, #FEFAF7) 0%,var(--brand-cream, #FEFAF7) 55%,var(--brand-cream, #FEFAF7) 100%)", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 60px", color: ink, position: "relative", zIndex: 0, overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        .serif { font-family: var(--font-frank), 'Frank Ruhl Libre', serif; }
        .script { font-family: var(--font-script), 'Amatic SC', cursive; font-weight: 700; }
        .bk-stack { width: 100%; display: flex; flex-direction: column; align-items: center; }
        .bk-stack { animation: fadein .2s ease-out both; }
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .bk-stack { animation: none } }
        .bk-chip { transition: transform .2s, box-shadow .2s; cursor: pointer; }
        .bk-chip:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -22px rgba(70,50,60,0.4); }
        .bk-chip:active { transform: scale(.99); }
        .bk-btn { transition: transform .18s, filter .18s; cursor: pointer; border: none; font-family: inherit; }
        .bk-btn:hover:not(:disabled) { filter: brightness(1.04); transform: translateY(-1px); }
        .bk-btn:active:not(:disabled) { transform: scale(.98); }
        .bk-btn:disabled { opacity: .5; cursor: default; }
        .gal-item { transition: transform .28s, box-shadow .28s; }
        .gal-item:hover { transform: scale(1.04); box-shadow: 0 12px 26px -14px rgba(70,50,60,0.45); }
      `}</style>

      {/* ============ STEP 1 - THE PUBLIC PAGE ============
          One continuous page, top to bottom: hero, treatments, results, about,
          what she stands for, then the practical sections. Every section has a
          default or hides itself, so a clinic with nothing uploaded still reads
          as finished. */}
      {step === 1 && (
        <div className="bk-stack" style={{ paddingBottom: barShown ? "calc(112px + env(safe-area-inset-bottom, 0px))" : 0 }}>

          {/* HERO - the photograph is the page; everything is written ON it.
              Her hero photo, else the shipped default. The veil is light and
              opaque enough that dark type reads on any photo she picks. */}
          <div style={{ position: "relative", width: "100%", maxWidth: 540, minHeight: "min(80vh, 660px)", overflow: "hidden", display: "flex" }}>
            <Photo src={brand?.heroImageUrl || defaultImageUrl("hero")} eager
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(254,250,247,0.88) 0%, rgba(254,250,247,0.64) 46%, rgba(254,250,247,0.34) 100%)" }} />
            <div style={{ position: "relative", width: "100%", padding: "26px 22px 34px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {brand?.logoUrl ? (
                <img src={brand.logoUrl} alt={bizName}
                  style={{ maxHeight: 84, maxWidth: "min(70%, 260px)", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
              ) : (
                <p className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 600, color: ink, letterSpacing: 1, margin: 0 }}>{bizName}</p>
              )}
              {brand?.logoTagline && <p style={{ ...T_META, color: ink, opacity: 0.8, margin: "6px 0 0" }}>{brand.logoTagline}</p>}

              <div style={{ marginTop: "auto", paddingTop: 36, width: "100%" }}>
                <h1 className="serif" style={{ margin: 0, fontSize: "var(--t-hero)", fontWeight: 700, lineHeight: 1.12, color: ink }}>
                  {heroLines.map((ln, i) => (
                    <span key={i} style={{ display: "block", color: i === 0 ? ink : deep }}>{ln}</span>
                  ))}
                </h1>
                <p style={{ ...T_BODY, color: ink, margin: "14px auto 0", maxWidth: 360 }}>{heroBenefits}</p>
                {(canBook || wa) && (
                  canBook ? (
                    <button onClick={goToServices} className="bk-btn"
                      style={{ marginTop: 20, minWidth: 220, height: 52, padding: "0 30px", borderRadius: "var(--r-full)", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-accent)" }}>
                      {brand?.ctaLabel || "קביעת תור"}
                    </button>
                  ) : (
                    <a href={waHref} target="_blank" rel="noreferrer" className="bk-btn"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, minWidth: 220, height: 52, padding: "0 30px", borderRadius: "var(--r-full)", background: pc, color: "var(--pc-contrast, #FFFFFF)", textDecoration: "none", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-accent)" }}>
                      <Icon name="whatsapp" size={16} /> {brand?.ctaLabel || "קביעת תור"}
                    </a>
                  )
                )}
              </div>

              {/* The one handwritten line up here. Sparingly: it is an accent. */}
              <p aria-hidden="true" className="script" style={{ position: "absolute", right: 16, top: "38%", width: 96, margin: 0, fontSize: "var(--t-2xl)", lineHeight: 1.05, color: deep, transform: "rotate(-7deg)", textAlign: "center" }}>{scriptAccent}</p>
            </div>
          </div>

          <div style={{ ...section, marginTop: 14, marginBottom: 22, textAlign: "center" }}>
            {person && <p style={{ ...T_BODY, fontWeight: 600, color: ink, margin: "0 0 4px" }}>{person}</p>}
            <p style={{ ...T_META, color: faint, margin: 0 }}>
              {todayHours ? "היום " + String(todayHours.open).padStart(2, "0") + ":00–" + String(todayHours.close).padStart(2, "0") + ":00" : "סגור היום"}
              {addr ? " · " + addr : ""}
            </p>
          </div>

          {/* Nothing bookable yet.
              This is what a visitor used to get instead: the services section
              and the booking button were BOTH hidden behind services.length > 0,
              so she saw a business card, opening hours and a gallery, and no way
              to book and no explanation. A new cosmetician gets her link on the
              day she signs up, so this is the state her very first visitors see.
              Silence here loses an enquiry that neither of them ever hears about. */}
          {!canBook && (
            <div style={{ ...section }}>
              <div style={{ ...cardBox, textAlign: "center" }}>
                <p style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep, marginBottom: 8 }}>
                  ההזמנות המקוונות ייפתחו כאן בקרוב
                </p>
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink-2, #6B6275)", lineHeight: 1.8, marginBottom: wa ? 18 : 0 }}>
                  {(!hasServices ? "רשימת הטיפולים עדיין בהכנה. " : "אין כרגע ימים פנויים לקביעת תור אונליין. ") +
                    (wa ? "אפשר לפנות אלינו ישירות בוואטסאפ ונשמח לתאם לך תור."
                        : "אפשר לחזור לכאן בקרוב, או ליצור קשר עם העסק.")}
                </p>
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="bk-btn"
                     style={{ display: "block", textDecoration: "none", width: "100%", padding: "15px 0", borderRadius:"var(--r-md)", background: "#25D366", color: "var(--brand-surface, #FAF6FC)", fontSize:"var(--t-lg)", fontWeight: 600, letterSpacing: "0.5px", boxShadow:"var(--shadow-lg)" }}>
                    <Icon name="whatsapp" size={15}/> לתיאום תור בוואטסאפ
                  </a>
                )}
              </div>
            </div>
          )}

          {/* TREATMENTS - a photo, a name, a line, its own button. */}
          {services.length > 0 && (
            <div id="bk-services" style={{ ...section, scrollMarginTop: 14 }}>
              <SectionTitle>הטיפולים שלי</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {services.map((sv, i) => {
                  const img = serviceImage(sv, brand?.serviceImages);
                  return (
                    <div key={sv.id || i} style={{ background: "var(--brand-surface, #FAF6FC)", border: "1px solid " + HAIR, borderRadius: "var(--r-md)", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-sm)" }}>
                      <Photo src={img.url} style={{ width: "100%", aspectRatio: "4 / 3" }} />
                      <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1, textAlign: "center" }}>
                        <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: ink, margin: 0, lineHeight: 1.25 }}>{sv.name}</p>
                        {sv.description && <p style={{ ...T_META, color: faint, margin: 0, lineHeight: 1.5 }}>{sv.description}</p>}
                        <p style={{ ...T_META, color: faint, margin: 0 }}>{sv.duration || 60} דק׳ · ₪{sv.price}</p>
                        {(() => {
                          const mine = resultsForService(results, sv);
                          const key = groupKeyForService(resultGroups, sv);
                          if (!mine.length || !key) return null;
                          return (
                            <button onClick={() => goToResults(key)} className="bk-btn" aria-label={"תוצאות של " + sv.name}
                              style={{ background: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <span style={{ display: "flex" }}>
                                {mine.slice(0, 3).map((r, k) => (
                                  <span key={r.id || k} style={{ width: 30, height: 30, marginInlineStart: k ? -8 : 0, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--brand-surface, #FAF6FC)", display: "block" }}>
                                    <Photo src={r.after} style={{ width: "100%", height: "100%" }} />
                                  </span>
                                ))}
                              </span>
                              <span style={{ fontSize: "var(--t-sm)", color: deep, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>תוצאות ({mine.length})</span>
                            </button>
                          );
                        })()}
                        {canBook && (
                          <button onClick={() => { setSelectedService(sv); setSelectedDate(null); setSelectedStart(null); setStep(2); }} className="bk-btn"
                            style={{ marginTop: "auto", height: 42, borderRadius: "var(--r-full)", background: "var(--pc-tint)", color: deep, fontSize: "var(--t-md)", fontWeight: 600, border: "1px solid var(--pc-soft)" }}>
                            {brand?.ctaLabel || "קביעת תור"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RESULTS - client photos, grouped by treatment. Only rows with a consent
              record reach this page (get_public_results); a result with no "before"
              is shown as a single "after". */}
          {resultGroups.length > 0 && (
            <div id="bk-results" style={{ ...section, marginTop: 34 }}>
              <SectionTitle>תוצאות</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                {resultGroups.map((g) => (
                  <div key={g.key} id={"bk-results-" + g.key} style={{ scrollMarginTop: 14 }}>
                    <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: ink, margin: "0 0 10px", textAlign: "center" }}>{g.name}</p>
                    <div style={{ display: "grid", gridTemplateColumns: g.items.length === 1 ? "minmax(0, 260px)" : "repeat(2, minmax(0, 1fr))", justifyContent: "center", gap: 12 }}>
                      {g.items.map((r) => <ResultCard key={r.id} result={r} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABOUT - her portrait on one side, her words on the other. */}
          <div style={{ ...section, marginTop: 34 }}>
            <SectionTitle>אודותיי</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
              <div>
                {personName && <p className="serif" style={{ ...T_BODY, fontWeight: 700, color: ink, margin: "0 0 8px" }}>נעים מאוד, אני {personName},</p>}
                <p style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.85, margin: 0, whiteSpace: "pre-line" }}>{aboutText}</p>
                {aboutSignoff && <p className="script" style={{ margin: "12px 0 0", fontSize: "var(--t-3xl)", lineHeight: 1.1, color: deep }}>{aboutSignoff}</p>}
              </div>
              <Photo src={brand?.portraitUrl || defaultImageUrl("about")} style={{ width: "100%", aspectRatio: "4 / 5", borderRadius: "var(--r-lg)", border: "1px solid " + HAIR }} />
            </div>
          </div>

          {/* WHAT SHE STANDS FOR - four short lines, four icons. */}
          <div style={{ ...section, marginTop: 34 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {valueProps.map((v, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", border: "1px solid " + HAIR, background: "var(--brand-surface, #FAF6FC)", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", color: pc }}>
                    <ValueIcon i={i} />
                  </div>
                  <p style={{ fontSize: "var(--t-sm)", color: ink, lineHeight: 1.4, margin: 0 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* HOW I WORK - her 4 steps, the trust section. Seeded with a
              default any cosmetician could stand behind until she writes her
              own; an explicitly cleared list renders nothing. */}
          {howIWork.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("איך זה עובד אצלי")}
                <div>
                  {howIWork.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${hair}` }}>
                      <span className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: pc, flexShrink: 0, lineHeight: 1 }}>{i + 1}</span>
                      <p style={{ ...T_BODY, color: ink, margin: 0 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* THE CLINIC - up to 3 atmosphere shots: the room, not the work.
              Full-bleed of the column, no card, so they read as place rather
              than portfolio. */}
          {clinicPhotos.length > 0 && (
            <div style={{ ...section }}>
              <div style={{ display: "grid", gridTemplateColumns: clinicPhotos.length === 1 ? "1fr" : `repeat(${clinicPhotos.length}, 1fr)`, gap: 8 }}>
                {clinicPhotos.map((p, i) => (
                  <div key={i} style={{ aspectRatio: clinicPhotos.length === 1 ? "16 / 9" : "3 / 4", borderRadius:"var(--r-md)", overflow: "hidden", border: `1px solid ${hair}` }}>
                    <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GALLERY */}
          {gallery.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("גלריה")}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                  {gallery.map((g, i) => (
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="gal-item" style={{ display: "block", aspectRatio: "1 / 1", borderRadius:"var(--r-md)", overflow: "hidden", border: `1px solid ${hair}` }}>
                      <img src={g} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REVIEWS */}
          {reviews.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("ביקורות")}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <span className="serif" style={{ fontSize:"var(--t-hero)", fontWeight: 600, color: deep, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                  <div>
                    <div style={{ fontSize:"var(--t-lg)", color: pc, letterSpacing: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= Math.round(avgRating) ? "★" : "☆"}</span>)}
                    </div>
                    <span style={{ ...T_META, color: faint }}>{reviews.length} ביקורות{reviewsAreReal ? " מלקוחות" : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, margin: "0 -2px" }}>
                  {reviews.map((rv, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 250, background: cream, border: `1px solid ${hair}`, borderRadius:"var(--r-lg)", padding: "18px 20px" }}>
                      <div style={{ fontSize:"var(--t-md)", color: pc, letterSpacing: 1.5, marginBottom: 10 }}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= (Number(rv.rating) || 5) ? "★" : "☆"}</span>)}
                      </div>
                      {rv.text && <p className="serif" style={{ fontSize:"var(--t-md)", color: "var(--ink, #2A2233)", lineHeight: 1.75, marginBottom: 12, fontStyle: "italic" }}>“{rv.text}”</p>}
                      {rv.name && <p style={{ fontSize:"var(--t-sm)", fontWeight: 600, color: muted, letterSpacing: "1px" }}>— {rv.name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* HOURS */}
          <div style={{ ...section }}>
            <div>
              {eyebrow("שעות פעילות")}
              {/* Today's line lives in the header, where she actually looks for
                  it. The full week is reference material and was costing seven
                  rows of chrome on every visit, above the prices. */}
              {!showAllHours && (
                <button onClick={() => setShowAllHours(true)} className="bk-btn"
                  style={{ ...T_BODY, background: "none", padding: 0, color: ink, textDecoration: "underline", textDecorationColor: hair, textUnderlineOffset: 5 }}>
                  כל השעות
                </button>
              )}
              {(showAllHours ? [0, 1, 2, 3, 4, 5, 6] : []).map((d) => {
                const v = weekHours[d];
                const today = d === now.getDay();
                return (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", margin: "0 -12px", borderRadius:"var(--r-sm)", background: today ? "var(--pc-tint)" : "transparent", borderBottom: d < 6 ? `1px solid ${hair}` : "none" }}>
                    <span style={{ fontSize:"var(--t-md)", color: today ? deep : "var(--ink-2, #6B6275)", fontWeight: today ? 700 : 500 }}>{DAYS_HE[d]}{today ? " · היום" : ""}</span>
                    <span style={{ fontSize:"var(--t-md)", color: v ? (today ? deep : "var(--ink, #2A2233)") : faint, fontWeight: today ? 700 : 500, letterSpacing: v ? "0.5px" : 0 }}>{v ? `${hh(v.open)}–${hh(v.close)}` : "סגור"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LOCATION */}
          {addr && (
            <div style={{ ...section }}>
              <div>
                {eyebrow("מיקום")}
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #2A2233)", marginBottom: 16, lineHeight: 1.7 }}>{addr}</p>
                {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--pc-tint)", color: deep, textDecoration: "none", padding: "11px 20px", borderRadius:"var(--r-full)", fontSize:"var(--t-md)", fontWeight: 600, letterSpacing: "0.4px", border: "1px solid var(--pc-soft)" }}>ניווט במפות Google</a>}
              </div>
            </div>
          )}

          {/* SOCIAL LINKS */}
          {(socials.length > 0 || wa) && (
            <div style={{ ...section }}>
              <div>
                {eyebrow("עקבו אחרינו")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={socialPill("#25D366")}>וואטסאפ</a>}
                  {socials.map((s) => (
                    <a key={s.key} href={s.href} target="_blank" rel="noreferrer" style={socialPill("var(--brand-surface, #FAF6FC)", deep, pc)}>{s.label}</a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ANNOUNCEMENTS (her client feed — read-only, hidden when empty).
              Placed right before the booking CTA so her latest offer/update is
              the last thing a client sees before booking. */}
          {recentPosts.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("עדכונים")}
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {recentPosts.map((p) => (
                    <div key={p.id} style={{ background: cream, borderRadius:"var(--r-md)", border: `1px solid ${hair}`, overflow: "hidden" }}>
                      {p.image_url && (
                        <img alt="" src={p.image_url} style={{ width: "100%", maxHeight: 240, objectFit: "cover", objectPosition: "center", display: "block" }} />
                      )}
                      <div style={{ padding: "15px 17px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                          <span style={{ fontSize:"var(--t-sm)", fontWeight: 700, color: "var(--brand-surface, #FAF6FC)", background: postTypeColor(p.post_type), padding: "3px 11px", borderRadius:"var(--r-full)", letterSpacing: "0.4px" }}>
                            {postTypeLabel(p.post_type)}
                          </span>
                          <span style={{ fontSize:"var(--t-sm)", color: faint, letterSpacing: "0.3px" }}>
                            {new Date(p.created_at).toLocaleDateString("he-IL")}
                          </span>
                        </div>
                        {p.title && <p className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep, margin: "0 0 5px", lineHeight: 1.35 }}>{p.title}</p>}
                        {p.body && <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #2A2233)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>}
                        {p.cta_label && (
                          wa ? (
                            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
                               style={{ display: "inline-block", marginTop: 13, padding: "9px 20px", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-sm)", fontWeight: 600, borderRadius:"var(--r-full)", textDecoration: "none", letterSpacing: "0.4px", boxShadow:"var(--shadow-accent)" }}>
                              {p.cta_label}
                            </a>
                          ) : (
                            <span style={{ display: "inline-block", marginTop: 13, padding: "9px 20px", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-sm)", fontWeight: 600, borderRadius:"var(--r-full)", letterSpacing: "0.4px" }}>
                              {p.cta_label}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* STICKY BOOKING BAR. WhatsApp when she has a number - the fastest way to
          reach a person; otherwise the online flow. */}
      {step === 1 && barShown && (
        <div style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 60,
          padding: "14px 20px calc(14px + env(safe-area-inset-bottom, 0px))",
          background: "linear-gradient(180deg, rgba(254,250,247,0) 0%, var(--brand-cream, #FEFAF7) 38%)" }}>
          {wa ? (
            <a href={waHref} target="_blank" rel="noreferrer" className="bk-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", maxWidth: 500, margin: "0 auto", height: 54, borderRadius: "var(--r-full)", textDecoration: "none",
                background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-lg)" }}>
              <Icon name="whatsapp" size={18} /> לקביעת תור בוואטסאפ
            </a>
          ) : (
            <button onClick={goToServices} className="bk-btn"
              style={{ display: "block", width: "100%", maxWidth: 500, margin: "0 auto", height: 54, borderRadius: "var(--r-full)",
                background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-lg)" }}>
              {brand?.ctaLabel || "קביעת תור"}
            </button>
          )}
        </div>
      )}

      {/* ============ STEPS 2–4 — BOOKING FLOW ============ */}
      {step >= 2 && (
        <>
          {/* compact header */}
          <div style={{ width: "100%", maxWidth: 480, padding: "30px 20px 6px", textAlign: "center" }}>
            {brand?.logoUrl ? (
              <img src={brand.logoUrl} alt={bizName} style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
            ) : null}
            <h2 className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: deep, letterSpacing: "0.3px" }}>{bizName}</h2>
          </div>

          {/* PROGRESS BAR */}
          {step < 4 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 22, padding: "10px 20px 0" }}>
              {[1, 2, 3].map((s) => (
                <div key={s} style={{ width: 44, height: 4, borderRadius:"var(--r-xs)", background: step >= s ? pc : hair, transition: "background 0.3s" }} />
              ))}
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

            {/* STEP 2 — CHOOSE DATE + TIME */}
            {step === 2 && (
              <div className="bk-card">
                <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: pc, fontSize:"var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה לעמוד העסק</button>
                <div style={{ background: cream, borderRadius:"var(--r-md)", padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${hair}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedService.color || pc }} />
                  <p style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink, flex: 1 }}>{selectedService.name}</p>
                  <p className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep }}>₪{selectedService.price}</p>
                </div>

                <p style={{ fontSize:"var(--t-sm)", letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי יום</p>
                {availableDays.length === 0 ? (
                  <div style={{ ...noticeBox, marginBottom: 22 }}>
                    אין כרגע ימים פנויים לקביעת תור אונליין. אפשר ליצור קשר עם העסק ונשמח לתאם לך מועד.
                  </div>
                ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 22 }}>
                  {availableDays.map((d, i) => {
                    const isSel = selectedDate && formatDate(d) === formatDate(selectedDate);
                    return (
                      <div key={i} className="bk-chip" onClick={() => { setSelectedDate(d); setSelectedStart(null); }}
                        style={{ flexShrink: 0, width: 62, padding: "13px 0", borderRadius:"var(--r-md)", textAlign: "center", background: isSel ? pc : "var(--brand-surface, #FAF6FC)", color: isSel ? "var(--brand-surface, #FAF6FC)" : ink, boxShadow: isSel ? "var(--shadow-accent)" : "var(--shadow-sm)", border: isSel ? "none" : `1px solid ${hair}` }}>
                        <p style={{ fontSize:"var(--t-sm)", fontWeight: 600, opacity: 0.75 }}>{DAYS_HE[d.getDay()]}</p>
                        <p className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, lineHeight: 1.2 }}>{d.getDate()}</p>
                        <p style={{ fontSize:"var(--t-sm)", opacity: 0.65 }}>{MONTHS_HE[d.getMonth()].slice(0, 3)}</p>
                      </div>
                    );
                  })}
                </div>
                )}

                {selectedDate && (
                  <>
                    {/* Availability could not be loaded. Say so plainly rather
                        than presenting an unchecked grid as if it were checked.
                        Booking is still allowed: /api/book-appointment re-checks
                        server-side and the appointments_no_overlap constraint
                        backs it, so the worst case is a rejection at submit,
                        which is honest. Silently showing everything as free is
                        the thing this must never do again. */}
                    {availabilityError && (
                      <div style={noticeBox}>
                        לא הצלחנו לבדוק כרגע אילו שעות כבר תפוסות. אפשר להמשיך, אבל ייתכן
                        שהשעה שתבחרי כבר נתפסה. אם כך יקרה, נודיע לך מיד ונציע שעה אחרת.
                      </div>
                    )}
                    <p style={{ fontSize:"var(--t-sm)", letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי שעה</p>
                    {visibleSlots.length === 0 && (
                      <div style={noticeBox}>אין שעות פנויות ביום זה. אפשר לבחור יום אחר למעלה.</div>
                    )}
                    {everySlotTaken && (
                      <div style={noticeBox}>כל השעות ביום זה כבר תפוסות. אפשר לבחור יום אחר למעלה.</div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                      {visibleSlots.map((h) => {
                        const taken = slotTaken(h);
                        const isSel = selectedStart === h;
                        return (
                          <button key={h} disabled={taken} onClick={() => setSelectedStart(h)}
                            className="bk-btn"
                            style={{ padding: "12px 0", borderRadius:"var(--r-sm)", fontSize:"var(--t-md)", fontWeight: 600, background: taken ? "var(--brand-cream, #FEFAF7)" : isSel ? pc : "var(--brand-surface, #FAF6FC)", color: taken ? faint : isSel ? "var(--brand-surface, #FAF6FC)" : ink, textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "var(--shadow-sm)", border: isSel ? "none" : `1px solid ${hair}` }}>
                            {fmtTime(h)}
                          </button>
                        );
                      })}
                    </div>
                    {selectedStart !== null && (
                      <button onClick={() => setStep(3)} className="bk-btn"
                        style={{ width: "100%", padding: "16px 0", borderRadius:"var(--r-md)", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-lg)", fontWeight: 600, marginTop: 10, letterSpacing: "0.8px", boxShadow:"var(--shadow-accent)" }}>
                        המשיכי ←
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3 — DETAILS */}
            {step === 3 && (
              <div className="bk-card">
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: pc, fontSize:"var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה</button>

                <div style={{ background: cream, borderRadius:"var(--r-lg)", padding: "18px 20px", marginBottom: 20, border: `1px solid ${hair}` }}>
                  <p style={{ fontSize:"var(--t-sm)", letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 12 }}>סיכום התור</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>טיפול</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{selectedService.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>תאריך</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>שעה</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{fmtTime(selectedStart)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${hair}`, paddingTop: 10, marginTop: 4 }}>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>מחיר</span>
                    <span className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep }}>₪{selectedService.price}</span>
                  </div>
                </div>

                <p style={{ fontSize:"var(--t-sm)", letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 14 }}>הפרטים שלך</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius:"var(--r-md)", padding: "14px 16px", fontSize:"var(--t-lg)", fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--brand-surface, #FAF6FC)", marginBottom: 10 }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius:"var(--r-md)", padding: "14px 16px", fontSize:"var(--t-lg)", fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--brand-surface, #FAF6FC)", marginBottom: 14 }} />

                {/* CONSENT, before the button. What is stored, what it is
                    used for, where the full policy is - and a tick that the
                    button waits for. Shown here rather than after, because
                    after is too late to be asked. */}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px", borderRadius:"var(--r-md)", border: `1px solid ${agreed ? pc : hair}`, background: "var(--brand-surface, #FAF6FC)", marginBottom: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setErrorMsg(""); }} aria-label="אישור שמירת הפרטים" style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                  <span style={{ fontSize:"var(--t-md)", color: ink, lineHeight: 1.6 }}>
                    אני מאשרת שהשם והטלפון שלי יישמרו אצל {brand?.businessName || settings?.business_name || "העסק"} לצורך ניהול התור, ושאקבל עליו הודעות בוואטסאפ.{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: pc, fontWeight: 700, textDecoration: "underline" }}>מדיניות הפרטיות</a>
                  </span>
                </label>

                {errorMsg && <p style={{ color: "var(--danger, #E05B6F)", fontSize:"var(--t-md)", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>{errorMsg}</p>}

                <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
                  style={{ width: "100%", padding: "16px 0", borderRadius:"var(--r-md)", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-lg)", fontWeight: 600, letterSpacing: "0.8px", boxShadow:"var(--shadow-accent)" }}>
                  {submitting ?<Spinner inline label="קובע תור"/>: (brand?.ctaLabel || "קביעת תור")}
                </button>
                <p style={{ ...T_META, color: faint, textAlign: "center", marginTop: 10 }}>התור מאושר מיד, ואישור נשלח אלייך בוואטסאפ</p>
              </div>
            )}

            {/* STEP 4 — SUCCESS */}
            {step === 4 && (
              <div className="bk-card" style={{ textAlign: "center", paddingTop: 24 }}>
                <div style={{ fontSize:"var(--t-hero)", marginBottom: 14, color: pc }}>✦</div>
                <h2 className="serif" style={{ fontSize:"var(--t-3xl)", fontWeight: 600, color: deep, marginBottom: 10, letterSpacing: "0.3px" }}>התור נקבע!</h2>
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #2A2233)", lineHeight: 1.7, marginBottom: 22 }}>
                  נתראה ב{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} בשעה {fmtTime(selectedStart)}
                </p>
                <div style={{ background: cream, borderRadius:"var(--r-lg)", padding: "20px 22px", border: `1px solid ${hair}`, textAlign: "right", marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize:"var(--t-md)", color: muted }}>טיפול</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{selectedService.name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize:"var(--t-md)", color: muted }}>שם</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize:"var(--t-md)", color: muted }}>טלפון</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{phone}</span></div>
                </div>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#25D366", color: "var(--brand-surface, #FAF6FC)", textDecoration: "none", padding: "12px 22px", borderRadius:"var(--r-full)", fontSize:"var(--t-md)", fontWeight: 600, letterSpacing: "0.4px", marginBottom: 16 }}><Icon name="whatsapp" size={15}/> שלחי לנו הודעה</a>}
                <p style={{ fontSize:"var(--t-sm)", color: faint, letterSpacing: "0.5px" }}>נשמח לראותך</p>
              </div>
            )}

          </div>
        </>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "34px 20px 0" }}>
        {addr && step === 1 && (
          <p style={{ fontSize:"var(--t-sm)", color: muted, fontWeight: 500, marginBottom: 8, letterSpacing: "0.3px" }}>{addr}</p>
        )}
        <p style={{ fontSize:"var(--t-sm)", color: faint, letterSpacing: "1px" }}>מופעל ע"י BloomOS ✦</p>
      </div>
    </div>
  );
}

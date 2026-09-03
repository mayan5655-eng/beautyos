"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { dayHoursFrom, isOpenOn, normalizeBusinessHours } from "@/lib/businessHours";
import { fetchPublicSettings, resolveBranding } from "@/lib/branding";
import { ACTIVE_OR_NULL } from "@/lib/serviceActive";
import { startMinute, endMinute, fmtTime, overlaps, slotsBetween } from "@/lib/apptTime";
import { isTooSoonForSelfBooking } from "@/lib/bookingPolicy";
import { phoneErrorHe } from "@/lib/phone";

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
  const [showAllHours, setShowAllHours] = useState(false);
  const [tab, setTab] = useState("book");

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
      const [row, sv, ap, rv] = await Promise.all([
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
      ]);

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

  const pc = brand?.primary || settings?.primary_color || "#4A2E5A";
  const deep = brand?.deep || pc;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "var(--brand-cream, #FEFAF7)", fontSize: 15, letterSpacing: "1px", color: pc }}>
        ✦ טוען
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "linear-gradient(160deg, var(--brand-cream, #FEFAF7) 0%, var(--brand-cream, #FEFAF7) 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16, color: "var(--pc, #4A2E5A)" }}>✦</div>
        <h1 className="serif" style={{ fontSize: 23, fontWeight: 600, color: "var(--brand-muted, #98879B)", marginBottom: 10, letterSpacing: "0.3px" }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: "var(--brand-muted, #98879B)", maxWidth: 320, lineHeight: 1.7 }}>
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
  const tagline = brand?.welcomeHeadline || "";
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
  const addr = brand?.address || "";
  const mapsHref = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "";
  const gallery = brand?.gallery || [];
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

  // THREE PANES, not one long scroll: what the business is, booking a time,
  // and what is on offer. Three purposes rather than three slices of one list -
  // which is why this is worth a tab bar when service CATEGORIES were not. A
  // client who came to book taps once instead of scrolling past a gallery.
  //
  // Booking is first and default because it is the action. The hero above the
  // bar already does the introducing.
  //
  // THE TABS ONLY EXIST IF THERE IS SOMETHING BEHIND THEM. Three tabs, two of
  // them empty, is worse than the single page this replaces - so with nothing
  // to say beyond the treatments, the bar does not render and every section
  // falls back into one sequence exactly as before. WhatsApp alone does not
  // count as an "about": a tab holding one green pill is not a tab.
  const hasAbout = !!(brand?.businessDescription || gallery.length || reviews.length || addr || socials.length);
  const hasOffers = recentPosts.length > 0;
  const showTabs = hasAbout || hasOffers;
  const inTab = (t) => !showTabs || tab === t;
  const TABS = [
    { key: "book", label: "הזמנת תור" },
    hasAbout && { key: "about", label: "אודות" },
    hasOffers && { key: "offers", label: "מבצעים" },
  ].filter(Boolean);

  const goToServices = () => {
    // From another pane the services are not on screen to scroll to.
    if (tab !== "book") { setTab("book"); return; }
    const el = typeof document !== "undefined" ? document.getElementById("bk-services") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // === refined style tokens (premium / luxury visual layer) ===
  const ink = "var(--ink, #2A2233)";
  const muted = "var(--brand-muted, #98879B)";
  const faint = "var(--brand-muted, #98879B)";
  const hair = "rgba(74,46,90,0.14)";
  // One shape for every "here is why this is empty" line on the page.
  const noticeBox = { background: "var(--brand-cream, #FEFAF7)", border: `1px solid ${hair}`, borderRadius: 12, padding: "10px 13px", marginBottom: 12, fontSize: 12.5, lineHeight: 1.6, color: ink };
  const cream = "var(--brand-cream, #FEFAF7)";
  // ── type scale ───────────────────────────────────────────────────────────
  // display / body / meta. Nothing between them, because a size that is nearly
  // another size is just noise. Hebrew carries more leading than Latin at the
  // same size, so body runs at 1.7.
  const T_DISPLAY = { fontSize: 34, fontWeight: 600, lineHeight: 1.15, letterSpacing: 0 };
  const T_BODY    = { fontSize: 16, fontWeight: 400, lineHeight: 1.7 };
  const T_META    = { fontSize: 13, fontWeight: 400, lineHeight: 1.5 };

  const section = { width: "100%", maxWidth: 540, padding: "0 20px", marginBottom: 34 };
  const cardBox = { background: "var(--brand-surface, #FAF6FC)", borderRadius: 22, padding: "26px 24px", boxShadow: "0 20px 48px -28px rgba(70,50,60,0.25)", border: `1px solid ${hair}` };
  // The section beat: every section opens the same way - a short accent dash,
  // then the serif title, then 14px of air. One rhythm down the whole page, so
  // the sections read as movements of one piece rather than widgets stacked.
  const eyebrow = (text) => (
    <div style={{ marginBottom: 14 }}>
      <span aria-hidden="true" style={{ display: "block", width: 22, height: 2, borderRadius: 2, background: pc, marginBottom: 10 }} />
      <p className="serif" style={{ fontSize: 19, fontWeight: 600, color: ink, lineHeight: 1.3 }}>{text}</p>
    </div>
  );
  const socialPill = (bg, color, borderColor) => ({ display: "inline-flex", alignItems: "center", gap: 7, background: bg, color: color || "var(--brand-surface, #FAF6FC)", textDecoration: "none", padding: "10px 20px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.4px", border: borderColor ? `1px solid ${borderColor}3D` : "none", boxShadow: "0 8px 20px -14px rgba(70,50,60,0.4)" });

  return (
    <div dir="rtl" style={{ fontFamily: "var(--font-assistant), 'Assistant', sans-serif", background: "linear-gradient(180deg,var(--brand-cream, #FEFAF7) 0%,var(--brand-cream, #FEFAF7) 55%,var(--brand-cream, #FEFAF7) 100%)", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 60px", color: ink, position: "relative", zIndex: 0, overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        .serif { font-family: var(--font-frank), 'Frank Ruhl Libre', serif; }
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

      {/* ============ STEP 1 — BUSINESS CARD ============ */}
      {step === 1 && (
        <div className="bk-stack" style={{ paddingBottom: canBook ? "calc(104px + env(safe-area-inset-bottom, 0px))" : 0 }}>

          {/* HERO
              A beauty business is sold on a face and a room, and the page had
              nowhere to put either: hero_image_url rendered 220px tall behind a
              scrim, with a logo medallion punched through it - a photograph
              treated as texture. A portrait gets the top of the screen and no
              wash over it.

              min(62vh, 620px): tall enough to be the page rather than a banner,
              short enough that the name is still on the first screen. The crop
              sits at 32% from the top because that is where a face is when
              someone frames themselves; centre gives you a chin.

              hero_image_url still works for anyone who set one, so nothing she
              uploaded before disappears. */}
          {brand?.portraitUrl ? (
            /* The two-line lockup lives ON the portrait: the name and the
               person are on the same screen as the face, not a scroll below
               it. The scrim rises from the page's own cream so the text sits
               on the photograph without the photograph going grey. */
            <div style={{ position: "relative", width: "100%", maxWidth: 540, height: "min(62vh, 620px)", overflow: "hidden" }}>
              <img src={brand.portraitUrl} alt={bizName}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 32%", display: "block" }} />
              <div aria-hidden="true" style={{ position: "absolute", insetInline: 0, bottom: 0, height: "46%", background: "linear-gradient(to top, var(--brand-cream, #FEFAF7) 8%, rgba(254,250,247,0.72) 42%, transparent 100%)" }} />
              <div style={{ position: "absolute", insetInline: 0, bottom: 14, textAlign: "center", padding: "0 20px" }}>
                <h1 className="serif" style={{ ...T_DISPLAY, color: ink, marginBottom: 4 }}>{bizName}</h1>
                {(person || tagline) && (
                  <p style={{ ...T_BODY, fontWeight: person ? 600 : 400, color: person ? ink : muted, margin: 0 }}>{person || tagline}</p>
                )}
              </div>
            </div>
          ) : brand?.heroImageUrl ? (
            <div style={{ position: "relative", width: "100%", maxWidth: 540, height: 220, overflow: "hidden", borderRadius: "0 0 28px 28px" }}>
              <img src={brand.heroImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(251,247,244,0.28) 0%, rgba(251,247,244,0.00) 38%, transparent 68%)" }} />
            </div>
          ) : null}

          {/* HEADER (logo overlaps cover) */}
          {/* With a portrait, the lockup already carried the name (and the
              person, when set) - repeating them here would read the page its
              own headline twice. The header keeps only what the hero did not
              say. Without a portrait it remains the full introduction. */}
          <div style={{ ...section, marginTop: brand?.portraitUrl ? 20 : brand?.heroImageUrl ? 28 : 44, textAlign: "center" }}>
            {/* A logo is never cropped: contain inside a capped box, natural
                aspect - a wide logo takes width, a square one takes height.
                With a portrait the portrait is the hero and the logo stays
                supporting (60px). WITHOUT one, the logo IS the hero: up to
                110px tall and most of the column, centred above the name. */}
            {brand?.logoUrl && (
              <img src={brand.logoUrl} alt={bizName}
                style={brand?.portraitUrl || brand?.heroImageUrl
                  ? { maxHeight: 60, maxWidth: 200, width: "auto", height: "auto", objectFit: "contain", margin: "0 auto 16px", display: "block" }
                  : { maxHeight: 110, maxWidth: "min(72%, 280px)", width: "auto", height: "auto", objectFit: "contain", margin: "0 auto 20px", display: "block" }} />
            )}
            {!brand?.portraitUrl && (
              <h1 className="serif" style={{ ...T_DISPLAY, color: ink, marginBottom: person || tagline ? 8 : 12 }}>{bizName}</h1>
            )}
            {!brand?.portraitUrl && person && <p style={{ ...T_BODY, fontWeight: 600, color: ink, marginBottom: 8 }}>{person}</p>}
            {/* Three levels, in the order a stranger needs them: who this is,
                what they say about themselves, then the longer sentence. The
                tagline takes the accent colour so it reads as hers and not as a
                subtitle the page generated. */}
            {tagline && (!brand?.portraitUrl || person) && <p style={{ ...T_BODY, color: muted, marginBottom: 10, maxWidth: 400, marginInline: "auto" }}>{tagline}</p>}
            {brand?.welcomeMessage && <p style={{ ...T_BODY, color: muted, marginBottom: 14, maxWidth: 400, marginInline: "auto" }}>{brand.welcomeMessage}</p>}
            <p style={{ ...T_META, color: faint }}>
              {todayHours ? `היום ${String(todayHours.open).padStart(2, "0")}:00–${String(todayHours.close).padStart(2, "0")}:00` : "סגור היום"}
              {addr ? ` · ${addr}` : ""}
            </p>
          </div>

          {showTabs && (
            <div style={{ ...section, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 24, borderBottom: `1px solid ${hair}` }}>
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} className="bk-btn"
                    style={{ background: "none", padding: "0 0 12px", ...T_BODY,
                      fontWeight: tab === t.key ? 600 : 400,
                      color: tab === t.key ? ink : muted,
                      borderBottom: `2px solid ${tab === t.key ? pc : "transparent"}`, marginBottom: -1 }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {inTab("book") && (<>
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
                <p style={{ fontSize: 15, fontWeight: 600, color: deep, marginBottom: 8 }}>
                  ההזמנות המקוונות ייפתחו כאן בקרוב
                </p>
                <p style={{ fontSize: 13.5, color: "var(--ink-2, #6B6275)", lineHeight: 1.8, marginBottom: wa ? 18 : 0 }}>
                  {(!hasServices ? "רשימת הטיפולים עדיין בהכנה. " : "אין כרגע ימים פנויים לקביעת תור אונליין. ") +
                    (wa ? "אפשר לפנות אלינו ישירות בוואטסאפ ונשמח לתאם לך תור."
                        : "אפשר לחזור לכאן בקרוב, או ליצור קשר עם העסק.")}
                </p>
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="bk-btn"
                     style={{ display: "block", textDecoration: "none", width: "100%", padding: "15px 0", borderRadius: 16, background: "#25D366", color: "var(--brand-surface, #FAF6FC)", fontSize: 15, fontWeight: 600, letterSpacing: "0.5px", boxShadow: "0 14px 30px -16px rgba(37,211,102,0.9)" }}>
                    💬 לתיאום תור בוואטסאפ
                  </a>
                )}
              </div>
            </div>
          )}

          {/* SERVICES (the booking entry point) */}
          {services.length > 0 && (
            <div id="bk-services" style={{ ...section, scrollMarginTop: 14 }}>
              <div style={cardBox}>
                {eyebrow("השירותים שלנו")}
                <div>
                  {services.map((s, i) => (
                    <div key={i} className="bk-chip" onClick={() => { setSelectedService(s); setSelectedDate(null); setSelectedStart(null); setStep(2); }}
                      style={{ padding: "16px 0", borderTop: i === 0 ? "none" : `1px solid ${hair}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ ...T_BODY, fontWeight: 600, color: ink }}>{s.name}</p>
                        {s.description && (
                          <p style={{ ...T_META, color: faint, marginTop: 2, lineHeight: 1.5 }}>{s.description}</p>
                        )}
                        <p style={{ ...T_META, color: faint, marginTop: 2 }}>{s.duration || 60} דקות</p>
                      </div>
                      <p style={{ ...T_BODY, color: ink, whiteSpace: "nowrap" }}>₪{s.price}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          </>)}

          {inTab("about") && (<>
          {/* ABOUT */}
          {brand?.businessDescription && (
            <div style={{ ...section }}>
              <div>
                {eyebrow("אודות")}
                <p style={{ fontSize: 14, color: "var(--ink, #2A2233)", lineHeight: 1.85, whiteSpace: "pre-line" }}>{brand.businessDescription}</p>
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
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="gal-item" style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden", border: `1px solid ${hair}` }}>
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
                  <span className="serif" style={{ fontSize: 36, fontWeight: 600, color: deep, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                  <div>
                    <div style={{ fontSize: 15, color: pc, letterSpacing: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= Math.round(avgRating) ? "★" : "☆"}</span>)}
                    </div>
                    <span style={{ ...T_META, color: faint }}>{reviews.length} ביקורות{reviewsAreReal ? " מלקוחות" : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, margin: "0 -2px" }}>
                  {reviews.map((rv, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 250, background: cream, border: `1px solid ${hair}`, borderRadius: 18, padding: "18px 20px" }}>
                      <div style={{ fontSize: 13.5, color: pc, letterSpacing: 1.5, marginBottom: 10 }}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= (Number(rv.rating) || 5) ? "★" : "☆"}</span>)}
                      </div>
                      {rv.text && <p className="serif" style={{ fontSize: 14.5, color: "var(--ink, #2A2233)", lineHeight: 1.75, marginBottom: 12, fontStyle: "italic" }}>“{rv.text}”</p>}
                      {rv.name && <p style={{ fontSize: 11.5, fontWeight: 600, color: muted, letterSpacing: "1px" }}>— {rv.name}</p>}
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
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", margin: "0 -12px", borderRadius: 10, background: today ? `${pc}0D` : "transparent", borderBottom: d < 6 ? `1px solid ${hair}` : "none" }}>
                    <span style={{ fontSize: 13.5, color: today ? deep : "var(--ink-2, #6B6275)", fontWeight: today ? 700 : 500 }}>{DAYS_HE[d]}{today ? " · היום" : ""}</span>
                    <span style={{ fontSize: 13.5, color: v ? (today ? deep : "var(--ink, #2A2233)") : faint, fontWeight: today ? 700 : 500, letterSpacing: v ? "0.5px" : 0 }}>{v ? `${hh(v.open)}–${hh(v.close)}` : "סגור"}</span>
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
                <p style={{ fontSize: 14, color: "var(--ink, #2A2233)", marginBottom: 16, lineHeight: 1.7 }}>{addr}</p>
                {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: `${pc}10`, color: deep, textDecoration: "none", padding: "11px 20px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: "0.4px", border: `1px solid ${pc}30` }}>ניווט במפות Google</a>}
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

          </>)}

          {inTab("offers") && (<>
          {/* ANNOUNCEMENTS (her client feed — read-only, hidden when empty).
              Placed right before the booking CTA so her latest offer/update is
              the last thing a client sees before booking. */}
          {recentPosts.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow("עדכונים")}
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {recentPosts.map((p) => (
                    <div key={p.id} style={{ background: cream, borderRadius: 16, border: `1px solid ${hair}`, overflow: "hidden" }}>
                      {p.image_url && (
                        <img alt="" src={p.image_url} style={{ width: "100%", maxHeight: 240, objectFit: "cover", objectPosition: "center", display: "block" }} />
                      )}
                      <div style={{ padding: "15px 17px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-surface, #FAF6FC)", background: postTypeColor(p.post_type), padding: "3px 11px", borderRadius: 999, letterSpacing: "0.4px" }}>
                            {postTypeLabel(p.post_type)}
                          </span>
                          <span style={{ fontSize: 12, color: faint, letterSpacing: "0.3px" }}>
                            {new Date(p.created_at).toLocaleDateString("he-IL")}
                          </span>
                        </div>
                        {p.title && <p className="serif" style={{ fontSize: 16.5, fontWeight: 600, color: deep, margin: "0 0 5px", lineHeight: 1.35 }}>{p.title}</p>}
                        {p.body && <p style={{ fontSize: 13.5, color: "var(--ink, #2A2233)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>}
                        {p.cta_label && (
                          wa ? (
                            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
                               style={{ display: "inline-block", marginTop: 13, padding: "9px 20px", background: pc, color: "var(--brand-surface, #FAF6FC)", fontSize: 12.5, fontWeight: 600, borderRadius: 999, textDecoration: "none", letterSpacing: "0.4px", boxShadow: `0 10px 24px -14px ${pc}` }}>
                              {p.cta_label}
                            </a>
                          ) : (
                            <span style={{ display: "inline-block", marginTop: 13, padding: "9px 20px", background: pc, color: "var(--brand-surface, #FAF6FC)", fontSize: 12.5, fontWeight: 600, borderRadius: 999, letterSpacing: "0.4px" }}>
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

          </>)}

          {/* The sticky CTA is rendered outside this stack, below. */}
        </div>
      )}

      {step === 1 && canBook && (
        <div style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 60,
          padding: "14px 20px calc(14px + env(safe-area-inset-bottom, 0px))",
          background: "linear-gradient(180deg, rgba(254,250,247,0) 0%, var(--brand-cream, #FEFAF7) 38%)" }}>
          <button onClick={goToServices} className="bk-btn"
            style={{ display: "block", width: "100%", maxWidth: 500, margin: "0 auto", height: 52, borderRadius: 14,
              background: pc, color: brand?.onPrimary || "var(--brand-surface, #FAF6FC)", fontSize: 16, fontWeight: 600 }}>
            {brand?.ctaLabel || "קביעת תור"}
          </button>
          <p style={{ ...T_META, color: faint, textAlign: "center", marginTop: 8 }}>אישור מיידי בוואטסאפ</p>
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
            <h2 className="serif" style={{ fontSize: 20, fontWeight: 600, color: deep, letterSpacing: "0.3px" }}>{bizName}</h2>
          </div>

          {/* PROGRESS BAR */}
          {step < 4 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 22, padding: "10px 20px 0" }}>
              {[1, 2, 3].map((s) => (
                <div key={s} style={{ width: 44, height: 4, borderRadius: 4, background: step >= s ? pc : hair, transition: "background 0.3s" }} />
              ))}
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 480, padding: "0 20px" }}>

            {/* STEP 2 — CHOOSE DATE + TIME */}
            {step === 2 && (
              <div className="bk-card">
                <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה לעמוד העסק</button>
                <div style={{ background: cream, borderRadius: 16, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${hair}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedService.color || pc }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: ink, flex: 1 }}>{selectedService.name}</p>
                  <p className="serif" style={{ fontSize: 15, fontWeight: 600, color: deep }}>₪{selectedService.price}</p>
                </div>

                <p style={{ fontSize: 12, letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי יום</p>
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
                        style={{ flexShrink: 0, width: 62, padding: "13px 0", borderRadius: 16, textAlign: "center", background: isSel ? pc : "var(--brand-surface, #FAF6FC)", color: isSel ? "var(--brand-surface, #FAF6FC)" : ink, boxShadow: isSel ? `0 10px 24px -12px ${pc}` : "0 6px 16px -12px rgba(70,50,60,0.4)", border: isSel ? "none" : `1px solid ${hair}` }}>
                        <p style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>{DAYS_HE[d.getDay()]}</p>
                        <p className="serif" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.2 }}>{d.getDate()}</p>
                        <p style={{ fontSize: 11.5, opacity: 0.65 }}>{MONTHS_HE[d.getMonth()].slice(0, 3)}</p>
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
                    <p style={{ fontSize: 12, letterSpacing: "3px", color: pc, fontWeight: 700, marginBottom: 12 }}>בחרי שעה</p>
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
                            style={{ padding: "12px 0", borderRadius: 12, fontSize: 14, fontWeight: 600, background: taken ? "var(--brand-cream, #FEFAF7)" : isSel ? pc : "var(--brand-surface, #FAF6FC)", color: taken ? faint : isSel ? "var(--brand-surface, #FAF6FC)" : ink, textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "0 4px 12px -8px rgba(70,50,60,0.4)", border: isSel ? "none" : `1px solid ${hair}` }}>
                            {fmtTime(h)}
                          </button>
                        );
                      })}
                    </div>
                    {selectedStart !== null && (
                      <button onClick={() => setStep(3)} className="bk-btn"
                        style={{ width: "100%", padding: "16px 0", borderRadius: 16, background: pc, color: "var(--brand-surface, #FAF6FC)", fontSize: 15, fontWeight: 600, marginTop: 10, letterSpacing: "0.8px", boxShadow: `0 16px 34px -18px ${pc}` }}>
                        המשך ←
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3 — DETAILS */}
            {step === 3 && (
              <div className="bk-card">
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: pc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px" }}>← חזרה</button>

                <div style={{ background: cream, borderRadius: 18, padding: "18px 20px", marginBottom: 20, border: `1px solid ${hair}` }}>
                  <p style={{ fontSize: 12, letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 12 }}>סיכום התור</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>טיפול</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{selectedService.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>תאריך</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: muted }}>שעה</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{fmtTime(selectedStart)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${hair}`, paddingTop: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>מחיר</span>
                    <span className="serif" style={{ fontSize: 17, fontWeight: 600, color: deep }}>₪{selectedService.price}</span>
                  </div>
                </div>

                <p style={{ fontSize: 12, letterSpacing: "2.5px", color: pc, fontWeight: 700, marginBottom: 14 }}>הפרטים שלך</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--brand-surface, #FAF6FC)", marginBottom: 10 }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="טלפון נייד"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius: 14, padding: "14px 16px", fontSize: 15, fontFamily: "inherit", outline: "none", direction: "rtl", background: "var(--brand-surface, #FAF6FC)", marginBottom: 14 }} />

                {errorMsg && <p style={{ color: "var(--danger, #E05B6F)", fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>{errorMsg}</p>}

                <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
                  style={{ width: "100%", padding: "16px 0", borderRadius: 16, background: pc, color: "var(--brand-surface, #FAF6FC)", fontSize: 16, fontWeight: 600, letterSpacing: "0.8px", boxShadow: `0 16px 36px -18px ${pc}` }}>
                  {submitting ? "קובע תור..." : (brand?.ctaLabel || "קביעת תור")}
                </button>
                <p style={{ ...T_META, color: faint, textAlign: "center", marginTop: 10 }}>התור מאושר מיד, ואישור נשלח אלייך בוואטסאפ</p>
              </div>
            )}

            {/* STEP 4 — SUCCESS */}
            {step === 4 && (
              <div className="bk-card" style={{ textAlign: "center", paddingTop: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 14, color: pc }}>✦</div>
                <h2 className="serif" style={{ fontSize: 26, fontWeight: 600, color: deep, marginBottom: 10, letterSpacing: "0.3px" }}>התור נקבע!</h2>
                <p style={{ fontSize: 14, color: "var(--ink, #2A2233)", lineHeight: 1.7, marginBottom: 22 }}>
                  נתראה ב{DAYS_HE[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} בשעה {fmtTime(selectedStart)}
                </p>
                <div style={{ background: cream, borderRadius: 18, padding: "20px 22px", border: `1px solid ${hair}`, textAlign: "right", marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, color: muted }}>טיפול</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{selectedService.name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13, color: muted }}>שם</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: muted }}>טלפון</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{phone}</span></div>
                </div>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#25D366", color: "var(--brand-surface, #FAF6FC)", textDecoration: "none", padding: "12px 22px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.4px", marginBottom: 16 }}>💬 שלחי לנו הודעה</a>}
                <p style={{ fontSize: 12, color: faint, letterSpacing: "0.5px" }}>נשמח לראותך</p>
              </div>
            )}

          </div>
        </>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "34px 20px 0" }}>
        {addr && step === 1 && (
          <p style={{ fontSize: 12, color: muted, fontWeight: 500, marginBottom: 8, letterSpacing: "0.3px" }}>{addr}</p>
        )}
        <p style={{ fontSize: 12, color: faint, letterSpacing: "1px" }}>מופעל ע"י BloomOS ✦</p>
      </div>
    </div>
  );
}

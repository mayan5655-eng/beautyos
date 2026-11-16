"use client";
import { useState, useEffect, useRef } from "react";
import { parseDb } from "@/lib/dbTime";
import { displayName } from "@/lib/personName";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { logoSrc } from "@/lib/logoSrc";
import { fetchPublicServices } from "@/lib/publicServices";
// The Supabase browser client (about 56KB gzipped) is NOT imported at the top: this page is opened by her clients on a
// phone, and the server already seeds settings and services. The two public reads below are plain fetches; the client
// is only loaded in the rare fallback where the server did not seed the page.
const lazySupabase = () => import("./supabase").then((m) => m.supabase);
async function anonRpc(name, args) {
  try {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) return { data: null, error: { message: `${name} ${r.status}` } };
    return { data: await r.json(), error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
import { dayHoursFrom, isOpenOn, normalizeBusinessHours } from "@/lib/businessHours";
import { fetchPublicSettings, resolveBranding, defaultHowIWork, defaultHeroHeadline, defaultAboutText, defaultHeroBenefits, defaultValueProps } from "@/lib/branding";
import { defaultImageUrl, serviceImage, defaultHeroKey, defaultAboutKey } from "@/lib/defaultImages";
import { cleanPublicResults, groupResults, groupKeyForService, resultsForService } from "@/lib/results";
import { fmtTime, overlaps, slotsBetween } from "@/lib/apptTime";
import { cleanBufferMinutes, serviceBufferMinutes, businessBufferDefault } from "@/lib/serviceBuffer";
// The team calendar (lib/team.ts): only when /api/availability sends `team` (flag on, two or more active staff). Otherwise unused.
import { publicEligible, publicSlotFree, teamDayWindow, ANY_STAFF } from "@/lib/team";
import { isTooSoonForSelfBooking, bookingTermsRequired } from "@/lib/bookingPolicy";
import { policyAppliesToService } from "@/lib/cancellationPolicy";
import { phoneErrorHe } from "@/lib/phone";
import { CLIENT_STUCK_HE } from "@/lib/errorCopy";
import { rememberSource, recalledSource } from "@/lib/bookingSource";
import { googleCalendarUrl } from "@/lib/calendarInvite";
import { accentStyle } from "@/lib/theme";
import { LOGO_COMPACT } from "@/lib/brand";
import { Watermark, PoweredBy } from "./PublicChrome";
import PublicFooterLinks from "./PublicFooterLinks";
import WaitlistJoin from "./WaitlistJoin";
import BrandImage from "@/app/BrandImage";
import Image from "next/image";
import { CARD_CONSENT_TEXT_HE } from "@/lib/grow/tokenFlow";
import { PAYMENT_TERMS_HREF, PAY_TERMS_BEFORE_HE, PAY_TERMS_LINK_HE, PAY_TERMS_AFTER_HE } from "@/lib/paymentTerms";
import { patchTestConfirmHe, intakeFromBusinessHe } from "@/lib/intakeCopy";
import { useTr } from "@/lib/i18n/useTr";
import { useLang } from "@/lib/i18n/react";
import { dirOf, localeOf } from "@/lib/i18n/core";

// ============================================================
// PUBLIC BOOKING PAGE  —  /book
// An elegant Google-Business-Profile-style mini-site for each clinic,
// with her Kalmea branding, that opens straight into the booking flow.
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

const HAIR = "rgba(233,169,161,0.14)";
// Results visible per treatment group before "עוד N".
const RESULTS_PER_GROUP = 4;

// A picture that never leaves a hole: missing or broken (a default not yet
// shipped, a deleted upload) falls back to a soft tint instead of an icon.
//
// Goes through next/image, not a bare <img>: the files are tenant uploads (or
// the shipped defaults) and used to be sent exactly as stored - the original
// bytes at any screen size, with only the storage bucket's 1-hour cache. Now
// each one is served as WebP at the width it is drawn (the `sizes` prop says
// how wide that is) and cached for a month by the image optimizer, which also
// covers photos uploaded before the upload path learned to resize. `fill`
// inside a positioned wrapper keeps every call site's box exactly as it was:
// the wrapper takes the old style, so aspect-ratio / absolute inset still hold
// and nothing moves when the picture arrives. `eager` is the hero: preloaded
// and fetched at high priority, because it is the largest thing on the page.
function Photo({ src, style, eager = false, sizes = "(max-width: 540px) 100vw, 540px" }) {
  const [badSrc, setBadSrc] = useState(null);
  const bad = badSrc === src;
  if (!src || bad) {
    return <div aria-hidden="true" style={{ ...style, background: "linear-gradient(135deg, var(--pc-tint, #FDF6F6) 0%, var(--brand-cream, #FBF8F1) 100%)" }} />;
  }
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <Image src={src} alt="" fill sizes={sizes} quality={75}
        preload={eager} fetchPriority={eager ? "high" : undefined} loading={eager ? undefined : "lazy"}
        unoptimized={/\.svg(\?|$)/i.test(src)}
        onError={() => setBadSrc(src)}
        style={{ objectFit: "cover", objectPosition: "center" }} />
    </div>
  );
}

// Her logo: a real <Image> with width and height, so the box is reserved before
// the file arrives. The pair is the largest the CSS ever draws it at; the style
// on the caller shrinks it to the file's true proportions, as before.
function Logo({ src, alt, w, h, style }) {
  return <Image src={src} alt={alt} width={w} height={h} sizes={w + "px"} unoptimized={/\.svg(\?|$)/i.test(src) || src.startsWith("/logo/")} style={style} />;
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
        <h2 className="serif" style={{ margin: 0, fontSize: "var(--t-xl)", fontWeight: 600, color: "var(--ink, #1F3A30)", lineHeight: 1.3 }}>{children}</h2>
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
  const tr = useTr();
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
      <span aria-hidden="true" style={{ position: "absolute", bottom: 8, left: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>{tr("לפני")}</span>
      <span aria-hidden="true" style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>{tr("אחרי")}</span>
      <input type="range" min="0" max="100" value={Math.round(pos)} onChange={(e) => setPos(Number(e.target.value))} aria-label={tr("השוואת לפני ואחרי")}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, pointerEvents: "none", margin: 0 }} />
    </div>
  );
}

// A result at two-up size: the "after" photo only, so the grid stays light and
// readable. Caption, session count and the before/after slider live in the
// full-size view (ResultLightbox); a small pill says there is a "before".
function ResultThumb({ result, onOpen, label }) {
  const tr = useTr();
  return (
    <button onClick={onOpen} aria-label={label} className="bk-btn"
      style={{ position: "relative", display: "block", width: "100%", padding: 0, aspectRatio: "1 / 1", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid " + HAIR, background: "none" }}>
      <Photo src={result.after} sizes="(max-width: 540px) 50vw, 270px" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {result.before && (
        <span aria-hidden="true" style={{ position: "absolute", bottom: 6, insetInlineEnd: 6, padding: "1px 8px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "var(--t-xs)", fontWeight: 600 }}>{tr("לפני · אחרי")}</span>
      )}
    </button>
  );
}

// One result, full-size, where the before/after slider has room to be used.
// Esc, the backdrop and the close button all close it; the page behind does not
// scroll while it is open.
function ResultLightbox({ items, index, title, onClose, onStep }) {
  const tr = useTr();
  const closeRef = useRef(null);
  const r = items[index];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    // Mount only: onClose just clears state, so the first render's copy is always right,
    // and re-running this on every step would re-steal focus and re-lock the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!r) return null;
  const arrow = { background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--t-xl)", color: "var(--ink, #1F3A30)", padding: "4px 14px" };
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,15,25,0.84)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(100%, 440px)", maxHeight: "100%", overflowY: "auto", background: "var(--brand-cream, #FBF8F1)", borderRadius: "var(--r-card)", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <p className="serif" style={{ margin: 0, fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--ink, #1F3A30)" }}>{title}</p>
          <button ref={closeRef} onClick={onClose} aria-label={tr("סגירה")} style={{ ...arrow, fontSize: "var(--t-xl)", padding: "0 6px" }}>×</button>
        </div>
        <div style={{ width: "min(100%, calc(66vh * 0.75))", margin: "0 auto" }}>
          {r.before ? (
            <BeforeAfterSlider key={r.id} before={r.before} after={r.after} />
          ) : (
            <div style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid " + HAIR }}>
              <Photo src={r.after} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              <span aria-hidden="true" style={{ position: "absolute", bottom: 8, right: 8, padding: "2px 10px", borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: "var(--t-sm)", fontWeight: 600 }}>{tr("אחרי")}</span>
            </div>
          )}
        </div>
        {(r.caption || r.sessions) && (
          <p style={{ margin: "12px 0 0", fontSize: "var(--t-md)", color: "var(--ink, #1F3A30)", lineHeight: 1.6, textAlign: "center" }}>
            {r.caption}
            {r.caption && r.sessions ? " · " : ""}
            {r.sessions ? tr("{0} טיפולים", [r.sessions]) : ""}
          </p>
        )}
        {items.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
            <button onClick={() => onStep(-1)} aria-label={tr("הקודמת")} style={arrow}>›</button>
            <span style={{ fontSize: "var(--t-sm)", color: "var(--brand-muted, #7D8D87)" }}>{index + 1} / {items.length}</span>
            <button onClick={() => onStep(1)} aria-label={tr("הבאה")} style={arrow}>‹</button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The `team` field of /api/availability (lib/team.ts), checked: two or more people with an id, a name and a week of hours, and a
 * busy list per person. Anything else is null, which is one practitioner: the page then works exactly as it always did.
 */
function cleanTeam(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.staff) || !t.busy || typeof t.busy !== "object") return null;
  const staff = t.staff.filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && x.name.trim() && x.hours && typeof x.hours === "object")
    .map((x) => ({ id: x.id, name: x.name.trim(), color: typeof x.color === "string" ? x.color : null, services: Array.isArray(x.services) ? x.services : null, hours: x.hours }));
  if (staff.length < 2) return null;
  const busy = {};
  for (const x of staff) busy[x.id] = Array.isArray(t.busy[x.id]) ? t.busy[x.id] : [];
  return { staff, busy };
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
export default function BookingPage({ tenantId: tenantIdProp, initialSettings = /** @type {any} */ (null), initialServices = /** @type {any} */ (null) }) {
  const tr = useTr();
  const lang = useLang();
  // === DATA ===
  // /[slug] reads the public settings and the service list on the server and
  // hands them in, so the first HTML already contains her hero, treatments and
  // hours - and the hero photo can be preloaded from the document head instead
  // of being discovered only after this component has downloaded, run, and
  // fetched. Without them (/book?t=, which has no server step) it loads
  // everything itself, exactly as before.
  const [settings, setSettings] = useState(initialSettings);
  const [services, setServices] = useState(initialServices || []);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(!initialSettings);
  const goServicesOnLoad = useRef(false);
  // Declared up here with the other hooks (an effect after the early returns breaks React #310).
  // Arrived from her page's "קביעת תור אונליין" (?go=services): jump to the treatments once they are on screen.
  useEffect(() => {
    if (loading || !goServicesOnLoad.current) return;
    goServicesOnLoad.current = false;
    const id = setTimeout(() => {
      const el = document.getElementById("bk-services");
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    }, 60);
    return () => clearTimeout(id);
  }, [loading]);
  // False through the server render and the first client render, so anything
  // that depends on the clock (today's hours, which days have a free slot)
  // starts identical on both sides and only fills in once we are in the browser.
  const [mounted, setMounted] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [tenantError, setTenantError] = useState(false);
  // Whether the busy-slot list actually loaded. Distinct from "nothing is
  // booked", and the distinction matters: conflating the two is what made the
  // old bug invisible, because a failed read looked exactly like a free diary.
  const [availabilityError, setAvailabilityError] = useState(false);
  // True until /api/availability has answered (either way). The day and time pickers do not render before then: an unchecked grid must
  // never look like a checked one (the "every slot is free" bug), and the first screen no longer waits for it.
  const [availabilityPending, setAvailabilityPending] = useState(true);
  // Her business-wide buffer default (lib/serviceBuffer.ts), from /api/availability's `defaultBuffer`. The buffer of the
  // treatment being booked comes from that service's own row in the public services list; absent (an older deployment,
  // a failed read) falls back to her public branding, then 0, which is what the page did before buffers existed.
  const [defaultBuffer, setDefaultBuffer] = useState(null);
  // The team (lib/team.ts publicTeam + per-person busy intervals), from /api/availability; null for one practitioner, which is
  // every business without the team calendar: then nothing below changes. staffPick: a staff id, or ANY_STAFF ("לא משנה לי").
  const [team, setTeam] = useState(null);
  const [staffPick, setStaffPick] = useState(ANY_STAFF);
  const [bookedWith, setBookedWith] = useState("");
  const [brand, setBrand] = useState(() => (initialSettings ? resolveBranding(initialSettings) : null)); // resolved clinic branding (safe fallbacks)
  const [posts, setPosts] = useState([]); // her client-facing announcements (public, read-only)
  // Reviews written by clients. null until the read resolves, so "none yet" and
  // "not loaded" stay apart.
  const [dbReviews, setDbReviews] = useState(null);
  // Client result photos she has published WITH a consent record (the database
  // serves nothing else). Empty when none, or when the read fails: a result is
  // never worth blocking the page for.
  const [results, setResults] = useState([]);
  // Which treatment groups are expanded past the first four, and which result is
  // open full-size ({ key, index } into that group), if any.
  const [expandedGroups, setExpandedGroups] = useState({});
  const [openResult, setOpenResult] = useState(null);
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
  // The time she picked was taken by someone else while she typed her details: said on the time step she is sent back to.
  const [slotTakenMsg, setSlotTakenMsg] = useState("");
  // Consent to the booking's data use, ticked before submit. Interim wording
  // until the lawyer's answer; the point is that nothing is stored or sent
  // before she has been told what for and has said yes.
  const [agreed, setAgreed] = useState(false);
  // Optional, UNCHECKED by default (Israeli communications law, section 30A: promotions need an explicit yes). Not required to book.
  const [marketingOk, setMarketingOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [depositInfo, setDepositInfo] = useState(null);
  // The intake gate (lib/intakeGate.ts), from /api/book-appointment: { formFromBusiness, patchTest } for a service she gated (the same for every booker), else null.
  const [intakeInfo, setIntakeInfo] = useState(null);
  // Her cancellation policy on top of Grow (/api/grow/policy/public): null unless she turned it on, and then the booking works as it always did.
  const [growPolicy, setGrowPolicy] = useState(null);
  // Her Grow clearing is on: the client is told she can pay by credit card (the same answer, card: true).
  const [cardPay, setCardPay] = useState(false);
  // Back from Grow's secure page: ?grow=paid|cancelled (lib/grow/payload withGrowResult). Without it she landed on a blank new booking, not
  // knowing whether it went through, and might book again.
  const [growReturn, setGrowReturn] = useState(null);
  // After booking: the appointment to pay for, and the press on "pay by card" (/api/grow/booking-pay opens Grow's page).
  const [bookedId, setBookedId] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const payNow = async () => {
    if (payBusy || !bookedId) return;
    setPayBusy(true); setPayErr("");
    try {
      const r = await fetch("/api/grow/booking-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tenantId, appointmentId: bookedId }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.success && j.url) { window.location.href = j.url; return; }
      setPayErr(j?.error || tr("התשלום באשראי לא זמין כרגע. אפשר לשלם בעסק."));
    } catch { setPayErr(tr("התשלום באשראי לא זמין כרגע. אפשר לשלם בעסק.")); }
    setPayBusy(false);
  };
  const [policyOk, setPolicyOk] = useState(false);
  const [cardOk, setCardOk] = useState(false);
  const [policyStep, setPolicyStep] = useState(null);
  const [policyStepAt, setPolicyStepAt] = useState(0);
  // "Pay the deposit" / "save the card": Grow's page link lasts ~10 minutes (the deposit hold lasts 30, a saved card has no deadline), so after the
  // first few minutes, or when the first page never opened, each press asks for a fresh page (app/api/grow/deposit/pay). A dead link used to leave
  // her no way through.
  const payDeposit = async () => {
    if (payBusy || !policyStep) return;
    if (policyStep.url && (Date.now() - policyStepAt < 8 * 60 * 1000 || !bookedId)) { window.location.href = policyStep.url; return; }
    if (!bookedId) return;
    setPayBusy(true); setPayErr("");
    try {
      const r = await fetch("/api/grow/deposit/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: tenantId, appointmentId: bookedId, kind: policyStep.kind === "saved_card" ? "card" : "deposit" }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.success && j.url) { window.location.href = j.url; return; }
      setPayErr(j?.error || tr("לא הצלחנו לפתוח את דף התשלום, נסי שוב"));
    } catch { setPayErr(tr("אין חיבור כרגע. נסי שוב בעוד רגע.")); }
    setPayBusy(false);
  };
  // Deposit mode covers only the services she marked "requires deposit"; any other service books exactly as before (no policy block, no tick, no deposit).
  const needsPolicy = !!growPolicy && policyAppliesToService(growPolicy.mode, selectedService);
  // Saving a card is a second, separate tick (Grow's rule): the client agrees that her card details are kept for future charges. A deposit
  // paid on the wallet page keeps no card (/api/grow/policy/public cardSave: false), so it asks for none.
  const needsCardTick = needsPolicy && (growPolicy.mode === "saved_card" || (growPolicy.mode === "deposit" && growPolicy.cardSave !== false));
  // Where this visit came from (?src= / ?ref=, lib/bookingSource.ts): remembered for the visit and sent with the booking.
  useEffect(() => {
    if (tenantId && typeof window !== "undefined") rememberSource(tenantId, window.location.search);
  }, [tenantId]);
  useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    fetch(`/api/grow/policy/public?t=${encodeURIComponent(tenantId)}`).then((r) => r.json()).then((j) => { if (!alive || !j) return; if (j.card === true) setCardPay(true); if (j.mode && j.mode !== "off") setGrowPolicy(j); }).catch(() => {});
    return () => { alive = false; };
  }, [tenantId]);

  // A new step starts at its top. On a phone the details step used to open scrolled to where the time grid had been, below its
  // own summary and the back button (2026-11-03 UX review). Not on the first render: the page opens where the browser put it.
  const stepSeen = useRef(false);
  useEffect(() => {
    if (!stepSeen.current) { stepSeen.current = true; return; }
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* old browser: stays put */ }
  }, [step]);

  // Read the tenant from the URL (?t=...) on mount, then load that tenant's data.
  useEffect(() => {
    setMounted(true);
    let t = tenantIdProp || null, svc = null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (!t) t = params.get("t");
      // Context carried over from the skin scanner (or any deep link) so the
      // visitor never re-enters what we already know.
      svc = params.get("service");
      // ?go=services: her page already showed the shop window, so open on the list of treatments.
      if (params.get("go") === "services") goServicesOnLoad.current = true;
      const gr = params.get("grow");
      if (gr === "paid" || gr === "cancelled") setGrowReturn(gr);
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

  // The busy times again, after the server said her pick was taken: the grid she goes back to shows it taken.
  const refetchAvailability = async () => {
    if (!tenantId) return;
    try {
      const ap = await fetch(`/api/availability?t=${encodeURIComponent(tenantId)}`, { cache: "no-store" }).then((r) => r.json());
      if (ap && ap.success && Array.isArray(ap.busy)) { setAppointments(ap.busy); setTeam(cleanTeam(ap.team)); setDefaultBuffer(cleanBufferMinutes(ap.defaultBuffer)); setAvailabilityError(false); }
      else setAvailabilityError(true);
    } catch { setAvailabilityError(true); }
  };

  const loadData = async (t, prefillServiceName) => {
    try {
      // Every query is scoped to this tenant only.
      // Busy slots come from the server, NOT from a direct table read.
      //
      // This used to be supabase.from("appointments") on the anon key. RLS
      // denies anon on that table, so it returned zero rows to every real
      // visitor - as data, not as an error - and the page cheerfully showed
      // every slot as free. /api/availability does the read on the service
      // role and returns TIMES ONLY (date, start_minute, hour, duration);
      // no names, phones, services or prices.
      //
      // STARTED here, together with the rest, but NOT awaited with them: it is the slowest call by a wide margin (measured
      // 2026-10-07: ~1.4 s cold, against ~0.3 s for each of the others), and the first screen - her business, her services,
      // her reviews - needs none of it. The page used to show nothing until it had answered. Only the day and time pickers need
      // it, and they wait for it (availabilityPending) instead of showing every slot as free.
      const availabilityP = fetch(`/api/availability?t=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .catch(() => ({ success: false }));

      const [row, sv, rv, rs] = await Promise.all([
        // SECURITY: public-safe settings via the shared layer (hardened RPC, no
        // direct anonymous settings access; never green_api_token or other secrets).
        initialSettings ? Promise.resolve(initialSettings) : lazySupabase().then((sb) => fetchPublicSettings(sb, t)),
        initialServices ? Promise.resolve({ data: initialServices }) : lazySupabase().then((sb) => fetchPublicServices(sb, t)),
        // Reviews a client wrote, through the same SECURITY DEFINER pattern as
        // the branding: anon holds no privilege on public.reviews in either
        // direction, and the function returns published rows only - so "hidden"
        // is enforced once, in the database, rather than remembered by every
        // caller.
        anonRpc("get_public_reviews", { p_tenant_id: t }),
        anonRpc("get_public_results", { p_tenant_id: t }),
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
      // Her client-facing announcements feed. Read through the SAME vetted safe
      // public endpoint the standalone /community page uses (service role, returns
      // ONLY whitelisted non-secret fields, scoped to this tenant). Best-effort:
      // any failure just leaves the feed empty and never blocks the booking flow.
      // NOT awaited: it used to be, so the whole page waited (a further 0.5-1.0 s) for an optional feed.
      fetch(`/api/community?t=${encodeURIComponent(t)}`)
        .then((cRes) => cRes.json())
        .then((cData) => { if (cData && cData.success && Array.isArray(cData.posts)) setPosts(cData.posts); })
        .catch(() => { /* announcements are optional — ignore */ });

      // The page can be shown now; availability lands on its own.
      setLoading(false);

      // Only treat this as availability when the server actually said so.
      // Anything else - transport failure, rate limit, 500 - is recorded as an
      // ERROR and surfaced to the visitor, never quietly rendered as "free".
      const ap = await availabilityP;
      if (ap && ap.success && Array.isArray(ap.busy)) {
        setAppointments(ap.busy);
        setTeam(cleanTeam(ap.team));
        setDefaultBuffer(cleanBufferMinutes(ap.defaultBuffer));
        setAvailabilityError(false);
      } else {
        setAppointments([]);
        setAvailabilityError(true);
        console.error("availability load failed:", ap?.error || "unknown");
      }
      setAvailabilityPending(false);
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
  const accent = brand?.primary || settings?.primary_color || "#E9A9A1";
  const pc = "var(--pc)";
  // Words in her colour read --pc-text (lib/theme.ts), never --pc itself: the
  // accent is a fill, and the default pink is 1.97:1 as text. Every heading,
  // price and step label below goes through these two; fills keep `pc`.
  const pcText = "var(--pc-text)";
  const deep = pcText;

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
  //
  // /api/availability sends MERGED busy intervals { date, start, end } with every buffer already included
  // (lib/busyIntervals.ts), so nothing here says how long any one appointment is or what it is. The treatment being
  // booked brings its own buffer (svcBuffer). The treatment must end by closing; its buffer may run past it. Same rule
  // as /api/book-appointment, which refuses what this offers.
  const busyOn = (dateStr) => appointments
    .filter((a) => a.date === dateStr)
    .map((a) => [Number(a.start), Number(a.end)])
    .filter(([bs, be]) => Number.isFinite(bs) && Number.isFinite(be));
  const svcBuffer = selectedService
    ? serviceBufferMinutes(selectedService, defaultBuffer ?? businessBufferDefault(settings?.branding))
    : 0;

  // Could this treatment actually be booked on this day?
  //
  // A day whose every slot is taken used to sit in the strip looking bookable,
  // and only turned out not to be after she tapped it and read a grid of
  // disabled buttons. That reads as a busy clinic; the truth is that there is
  // nothing there for her, and saying so is shorter and kinder. It matters more
  // now that a day off is a thing she can block out in one action - a week of
  // holiday would otherwise be seven days of dead chips.
  // ── The team (lib/team.ts), only when the server sent one ──
  // Who does this treatment (nobody listed for it = everyone, the same rule as /api/book-appointment). The client is asked
  // "עם מי?" only when two or more of them do it; the times are then theirs: a time is free when the one she chose is free, or,
  // for "לא משנה לי", when anyone is. The server picks and checks again.
  const teamAll = team ? team.staff : [];
  const teamForSvc = !team ? [] : (selectedService ? (publicEligible(teamAll, selectedService.name).length ? publicEligible(teamAll, selectedService.name) : teamAll) : teamAll);
  const askWho = teamForSvc.length >= 2;
  const pickedStaff = askWho && staffPick !== ANY_STAFF ? teamForSvc.find((x) => x.id === staffPick) || null : null;
  const teamPool = !team ? null : pickedStaff ? [pickedStaff] : teamForSvc;
  const dayWindow = (d) => (teamPool ? teamDayWindow(teamPool, d.getDay()) : dayHoursFrom(settings, d.getDay()));
  const freeAt = (ds, m) => (teamPool
    ? teamPool.some((x) => publicSlotFree(x, team.busy[x.id], ds, m, svcDuration, svcBuffer))
    : !busyOn(ds).some(([bs, be]) => overlaps(m, m + svcDuration + svcBuffer, bs, be)));

  const dayHasFreeSlot = (d) => {
    const dh = dayWindow(d);
    if (!dh) return false;
    const ds = formatDate(d);
    return slotsBetween(dh.open, dh.close, SLOT_STEP, svcDuration).some((m) =>
      !isTooSoonForSelfBooking(ds, m, new Date(), bookingRules.minLeadMinutes) && freeAt(ds, m)
    );
  };

  // Her own self-booking rules (Settings > calendar and services); the defaults are the page's old behaviour.
  const bookingRules = brand?.bookingRules || { minLeadMinutes: 120, maxDaysAhead: 21, depositAmount: 0, depositNote: "", cancelWindowHours: 0 };
  const termsRequired = bookingTermsRequired(bookingRules);
  // === Build the next 14 BOOKABLE days (respecting per-day business_hours) ===
  // Her own rules (notice, how far ahead) are applied here and again by /api/book-appointment.
  // If availability could not be loaded, appointments is empty and every open
  // day looks free - which is the right way to degrade: the page keeps offering
  // days and warns at the slot level, rather than hiding her whole diary
  // because one fetch failed.
  const availableDays = [];
  for (let i = 0; mounted && i <= bookingRules.maxDaysAhead && availableDays.length < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if ((teamPool ? !!dayWindow(d) : isOpenOn(settings, d)) && dayHasFreeSlot(d)) availableDays.push(d);
  }

  // === Build hours for the SELECTED day (its own open→close window) ===
  const selDayHours = selectedDate ? dayWindow(selectedDate) : null;
  const allSlots = selDayHours
    ? slotsBetween(selDayHours.open, selDayHours.close, SLOT_STEP, svcDuration)
    : [];

  const busyToday = selectedDate && !teamPool ? busyOn(formatDate(selectedDate)) : [];
  const slotTaken = (start) => (teamPool
    ? !selectedDate || !freeAt(formatDate(selectedDate), start)
    : busyToday.some(([bs, be]) => overlaps(start, start + svcDuration + svcBuffer, bs, be)));

  // Minimum notice for client self-booking. The server enforces the same rule -
  // this only keeps the page from offering a slot that would then be rejected.
  const selectedDateStr = selectedDate ? formatDate(selectedDate) : null;
  const tooSoon = (start) =>
    selectedDateStr !== null && isTooSoonForSelfBooking(selectedDateStr, start, new Date(), bookingRules.minLeadMinutes);

  // What step 2 actually puts on screen, hoisted so the grid and its empty
  // state read the same list. Late in the day every remaining slot is inside
  // the notice window, and a treatment longer than the day leaves slotsBetween
  // with nothing to return - both render an empty grid that looks identical to
  // a grid still loading.
  const visibleSlots = allSlots.filter((m) => !tooSoon(m));
  const everySlotTaken = visibleSlots.length > 0 && visibleSlots.every(slotTaken);

  const handleConfirm = async () => {
    setErrorMsg("");
    if (!name.trim()) { setErrorMsg(tr("איך קוראים לך? חסר שם")); return; }
    // A number we cannot reach is not a booking. This used to be a non-empty
    // check on both sides, so "abc" saved an appointment, sent no confirmation,
    // and told neither of them anything was wrong. Same rule server-side.
    const phoneErr = phoneErrorHe(phone);
    if (phoneErr) { setErrorMsg(phoneErr); return; }
    if (!agreed) { setErrorMsg(tr("כדי לקבוע תור צריך לאשר את שמירת הפרטים")); return; }
    if (termsRequired && !termsOk) { setErrorMsg(tr("כדי לקבוע תור צריך לאשר את תנאי ההזמנה")); return; }
    if (needsPolicy && !policyOk) { setErrorMsg(tr("כדי לקבוע תור צריך לאשר את מדיניות הביטולים")); return; }
    if (needsCardTick && !cardOk) { setErrorMsg(tr("כדי לשמור את הכרטיס צריך לאשר את שמירת פרטי האשראי")); return; }
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
          // Her real colour, never the CSS variable: this is stored on the appointment (the server checks it is a hex).
          color: selectedService.color || accent,
          tenantId: tenantId,
          // Only when the page asked "עם מי?": her pick, or "לא משנה לי". The server checks it belongs to this business and is active.
          ...(team ? { staffId: pickedStaff ? pickedStaff.id : ANY_STAFF } : {}),
          ...(() => { const r = recalledSource(tenantId, typeof window !== "undefined" ? window.location.search : ""); return { src: r.src || undefined, ref: r.ref || undefined }; })(),
          marketingConsent: marketingOk === true,
          acceptedTerms: termsRequired ? termsOk === true : undefined,
          acceptedPolicy: needsPolicy ? policyOk === true : undefined,
          acceptedCardSave: needsCardTick ? cardOk === true : undefined,
        }),
      });
      const result = await res.json();
      // Prefer the server's specific message (e.g. "slot taken") when provided,
      // otherwise fall back to the generic error.
      // Someone else took that time a moment ago: back to the times, nothing picked, the grid read again so it shows as taken.
      // The person she chose is not available any more (left, or stopped doing this treatment): back to the times, "לא משנה לי".
      if (!result.success && result.code === "staff_unavailable") {
        setStaffPick(ANY_STAFF);
        setSelectedStart(null);
        setSlotTakenMsg(result.error || tr("המטפלת שבחרת לא זמינה לטיפול הזה, אפשר לבחור שוב?"));
        setStep(2);
        setSubmitting(false);
        refetchAvailability();
        return;
      }
      if (!result.success && result.code === "slot_taken") {
        setSelectedStart(null);
        setSlotTakenMsg(result.error || tr("השעה הזו כבר נתפסה, אפשר לבחור שעה אחרת?"));
        setStep(2);
        setSubmitting(false);
        refetchAvailability();
        return;
      }
      if (!result.success) { setErrorMsg(result.error || CLIENT_STUCK_HE); setSubmitting(false); return; }
      setDepositInfo(result.deposit || null);
      // Two flags, the same for every booker (lib/intakeCopy.ts intakePublicAnswer). No form link comes from this public response.
      setIntakeInfo(result.intake && typeof result.intake === "object" ? {
        formFromBusiness: result.intake.formFromBusiness === true,
        patchTest: result.intake.patchTest === true,
      } : null);
      setPolicyStep(result.policyStep || null);
      setPolicyStepAt(Date.now());
      setBookedId(result.appointmentId || null);
      setBookedWith(result.staff && typeof result.staff.name === "string" ? result.staff.name : "");
      setStep(4);
    } catch (err) {
      setErrorMsg(CLIENT_STUCK_HE);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "var(--brand-cream, #FBF8F1)", fontSize:"var(--t-lg)", letterSpacing: "1px", color: pcText }}>
        {tr("✦ טוען")}
      </div>
    );
  }

  // Invalid / missing tenant - show a friendly message instead of the wrong data
  if (tenantError) {
    return (
      <div dir={dirOf(lang)} lang={lang} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Assistant',sans-serif", background: "linear-gradient(160deg, var(--brand-cream, #FBF8F1) 0%, var(--brand-cream, #FBF8F1) 100%)", padding: 24, textAlign: "center" }}>
        {/* No valid tenant resolved here, so there is no "her" accent to
            preserve - this is Kalmea chrome, not her content, hence the
            flower mark instead of a pc-colored glyph. */}
        <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={150} height={44} style={{ width: 150, height: "auto", marginBottom: 16 }} />
        <h1 className="serif" style={{ fontSize:"var(--t-2xl)", fontWeight: 600, color: "var(--brand-muted, #7D8D87)", marginBottom: 10, letterSpacing: "0.3px" }}>{tr("הקישור אינו תקין")}</h1>
        <p style={{ fontSize:"var(--t-md)", color: "var(--brand-muted, #7D8D87)", maxWidth: 320, lineHeight: 1.7 }}>
          {tr("נראה שהקישור לקביעת התור חסר או שגוי. כדאי לפנות לעסק ולבקש קישור חדש.")}
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
  // Never the placeholder "העסק שלי" (2026-10-21 audit: a skipped onboarding step printed it as the page title for her clients).
  // A real business name, else her own name, else a neutral heading.
  const realName = (v) => { const s = String(v || "").trim(); return s && s !== "העסק שלי" ? s : ""; };
  const bizName = realName(brand?.businessName) || realName(settings?.business_name)
    || displayName(brand?.therapistName || settings?.therapist_name || "") || tr("קביעת תור");
  // Her line, under her name. Optional - most clinics never set one.
  const personName = displayName(brand?.therapistName || settings?.therapist_name || ""); // never a login handle: lib/personName.js
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
  // Until mounted there is no clock to ask, so assume days exist: the booking
  // buttons are in the server HTML and are taken away a beat later in the one
  // case where she really has none open.
  const hasOpenDays = !mounted || availableDays.length > 0;
  const canBook = hasServices && hasOpenDays;
  // The sticky bar exists whenever there is something to tap: WhatsApp if she has a
  // number, otherwise the online flow (which needs a bookable service and day).
  const barShown = !!wa || canBook;
  const waHref = wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent("היי, אשמח לקבוע תור") : "";
  // Public-page copy: hers when set, otherwise a default that claims nothing
  // - and, since business_fields shipped, a default that names the right
  // body part. brand.fields is real (lib/branding.js's resolveBranding sets
  // it from businessFieldsOf), same source defaultHeroKey/defaultAboutKey
  // already use a few lines below for the photos.
  const heroHeadline = brand?.welcomeHeadline || tr(defaultHeroHeadline(brand?.fields));
  // No regex lookbehind here: Safari before 16.4 (iPhones that cannot update past iOS 15/16) fails to even PARSE one, which blanks the whole
  // booking page for her client (2026-10-24 phone review). Same split: a line break, or the space after . ! ?
  const heroLines = heroHeadline.replace(/([.!?])\s+/g, "$1\n").split("\n").map((x) => x.trim()).filter(Boolean);
  const heroBenefits = brand?.heroBenefits || brand?.welcomeMessage || tr(defaultHeroBenefits(brand?.fields));
  const scriptAccent = brand?.scriptAccent || tr("טיפוח שמתחיל באהבה עצמית");
  const aboutSignoff = brand?.aboutSignoff || "";
  const aboutText = brand?.businessDescription || tr(defaultAboutText(brand?.fields));
  const valueProps = brand?.valueProps && brand.valueProps.length ? brand.valueProps : defaultValueProps(brand?.fields).map((v) => tr(v));
  const resultGroups = groupResults(results, services);
  const addr = brand?.address || "";
  const mapsHref = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "";
  const gallery = brand?.gallery || [];
  const clinicPhotos = brand?.clinicPhotos || [];
  // null = she never touched it -> the seeded default; [] = explicitly cleared.
  const howIWork = brand?.howIWork === null || brand?.howIWork === undefined
    ? defaultHowIWork(brand?.fields).map((v) => tr(v))
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
  const now = mounted ? new Date() : null;
  const weekHours = normalizeBusinessHours(settings);
  const todayHours = now ? weekHours[now.getDay()] : null;
  const socials = [
    brand?.website && { key: "web", label: tr("אתר"), href: socialHref("https://", brand.website) },
    brand?.instagram && { key: "ig", label: tr("אינסטגרם"), href: socialHref("https://instagram.com/", brand.instagram) },
    brand?.facebook && { key: "fb", label: tr("פייסבוק"), href: socialHref("https://facebook.com/", brand.facebook) },
    brand?.tiktok && { key: "tt", label: tr("טיקטוק"), href: socialHref("https://tiktok.com/@", brand.tiktok) },
  ].filter(Boolean);

  // Client-facing announcements: newest first, cap to keep the mini-site tight.
  const recentPosts = (posts || []).slice(0, 5);
  const postTypeLabel = (t) => (t === "offer" ? tr("מבצע") : t === "tip" ? tr("טיפ") : tr("עדכון"));
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
  const ink = "var(--ink, #1F3A30)";
  const muted = "var(--brand-muted, #7D8D87)";
  const faint = "var(--brand-muted, #7D8D87)";
  const hair = "rgba(233,169,161,0.14)";
  // One shape for every "here is why this is empty" line on the page.
  const noticeBox = { background: "var(--brand-cream, #FBF8F1)", border: `1px solid ${hair}`, borderRadius:"var(--r-sm)", padding: "10px 13px", marginBottom: 12, fontSize:"var(--t-sm)", lineHeight: 1.6, color: ink };
  const cream = "var(--brand-cream, #FBF8F1)";
  // ── type scale ───────────────────────────────────────────────────────────
  // display / body / meta. Nothing between them, because a size that is nearly
  // another size is just noise. Hebrew carries more leading than Latin at the
  // same size, so body runs at 1.7.
  const T_BODY    = { fontSize:"var(--t-lg)", fontWeight: 400, lineHeight: 1.7 };
  const T_META    = { fontSize:"var(--t-md)", fontWeight: 400, lineHeight: 1.5 };

  const section = { width: "100%", maxWidth: 540, padding: "0 20px", marginBottom: 34 };
  const cardBox = { background: "var(--brand-surface, #FDFBF9)", borderRadius:"var(--r-card)", padding: "26px 24px", boxShadow:"var(--shadow-lg)", border: `1px solid ${hair}` };
  // The section beat: every section opens the same way - a short accent dash,
  // then the serif title, then 14px of air. One rhythm down the whole page, so
  // the sections read as movements of one piece rather than widgets stacked.
  const eyebrow = (text) => (
    <div style={{ marginBottom: 14 }}>
      <span aria-hidden="true" style={{ display: "block", width: 22, height: 2, borderRadius:"var(--r-xs)", background: pc, marginBottom: 10 }} />
      <p className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: ink, lineHeight: 1.3 }}>{text}</p>
    </div>
  );
  // WhatsApp's own green (#25D366) is 1.98:1 under white text; #0B7A3E is 5.4:1 and still reads as
  // WhatsApp. Used for every WhatsApp button on this page.
  const socialPill = (bg, color, borderColor) => ({ display: "inline-flex", alignItems: "center", gap: 7, background: bg, color: color || "var(--brand-surface, #FDFBF9)", textDecoration: "none", padding: "10px 20px", borderRadius:"var(--r-full)", fontSize:"var(--t-sm)", fontWeight: 600, letterSpacing: "0.4px", border: borderColor ? `1px solid ${borderColor}3D` : "none", boxShadow:"var(--shadow-md)" });

  return (
    <div dir={dirOf(lang)} lang={lang} style={{ ...accentStyle(accent), fontFamily: "var(--font-assistant), 'Assistant', sans-serif", background: "linear-gradient(180deg,var(--brand-cream, #FBF8F1) 0%,var(--brand-cream, #FBF8F1) 55%,var(--brand-cream, #FBF8F1) 100%)", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 60px", color: ink, position: "relative", zIndex: 0, overflow: "hidden" }}>
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

      <Watermark style={{ top: "auto", bottom: 120, insetInlineEnd: "auto", insetInlineStart: -70, width: 240 }} />

      {/* ============ STEP 1 - THE PUBLIC PAGE ============
          One continuous page, top to bottom: hero, treatments, results, about,
          what she stands for, then the practical sections. Every section has a
          default or hides itself, so a clinic with nothing uploaded still reads
          as finished. */}
      {step === 1 && (
        <div className="bk-stack" style={{ paddingBottom: barShown ? "calc(112px + env(safe-area-inset-bottom, 0px))" : 0 }}>
          {growReturn && (
            <div role="status" data-testid="grow-return" style={{ width: "100%", maxWidth: 540, boxSizing: "border-box", padding: "14px 18px", background: cream, borderBottom: `1px solid ${hair}`, textAlign: "center", fontSize: "var(--t-md)", color: ink, lineHeight: 1.6 }}>
              {growReturn === "paid" ? tr("✓ הכל הושלם, תודה! 🌸 התור שלך שמור, אין צורך לקבוע אותו שוב.") : tr("התשלום לא הושלם ולא חויב כסף. לשאלות אפשר לפנות לעסק.")}
              <button type="button" onClick={() => setGrowReturn(null)} aria-label={tr("סגירת ההודעה")} style={{ marginInlineStart: 10, border: "none", background: "none", color: ink, cursor: "pointer", fontSize: "var(--t-md)", fontFamily: "inherit" }}>✕</button>
            </div>
          )}

          {/* HERO - the photograph is the page; everything is written ON it.
              Her hero photo, else the shipped default. The veil is light and
              opaque enough that dark type reads on any photo she picks. */}
          <div style={{ position: "relative", width: "100%", maxWidth: 540, minHeight: "min(80vh, 660px)", overflow: "hidden", display: "flex" }}>
            <Photo src={brand?.heroImageUrl || defaultImageUrl(defaultHeroKey(brand?.fields))} eager
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(254,250,247,0.88) 0%, rgba(254,250,247,0.64) 46%, rgba(254,250,247,0.34) 100%)" }} />
            <div style={{ position: "relative", width: "100%", padding: "26px 22px 34px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {brand?.logoUrl ? (
                <Logo src={logoSrc(brand.logoUrl, tenantIdProp || tenantId)} alt={bizName} w={300} h={104}
                  style={{ maxHeight: 104, maxWidth: "min(78%, 300px)", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
              ) : (
                <p className="serif" style={{ fontSize: 32, fontWeight: 700, color: ink, letterSpacing: 0.5, lineHeight: 1.2, margin: 0 }}>{bizName}</p>
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
                      {brand?.ctaLabel || tr("קביעת תור")}
                    </button>
                  ) : (
                    <a href={waHref} target="_blank" rel="noreferrer" className="bk-btn"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, minWidth: 220, height: 52, padding: "0 30px", borderRadius: "var(--r-full)", background: pc, color: "var(--pc-contrast, #FFFFFF)", textDecoration: "none", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-accent)" }}>
                      <Icon name="whatsapp" size={16} /> {brand?.ctaLabel || tr("קביעת תור")}
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
              {!mounted ? "\u00A0" : todayHours ? tr("היום") + " " + String(todayHours.open).padStart(2, "0") + ":00–" + String(todayHours.close).padStart(2, "0") + ":00" : tr("סגור היום")}
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
                  {tr("ההזמנות המקוונות ייפתחו כאן בקרוב")}
                </p>
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink-2, #6B6275)", lineHeight: 1.8, marginBottom: wa ? 18 : 0 }}>
                  {(!hasServices ? tr("רשימת הטיפולים עדיין בהכנה.") : tr("אין כרגע ימים פנויים לקביעת תור אונליין.")) + " " +
                    (wa ? tr("אפשר לפנות אלינו ישירות בוואטסאפ ונשמח לתאם לך תור.")
                        : tr("אפשר לחזור לכאן בקרוב, או ליצור קשר עם העסק."))}
                </p>
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="bk-btn"
                     style={{ display: "block", textDecoration: "none", width: "100%", padding: "15px 0", borderRadius:"var(--r-md)", background: "#0B7A3E", color: "var(--brand-surface, #FDFBF9)", fontSize:"var(--t-lg)", fontWeight: 600, letterSpacing: "0.5px", boxShadow:"var(--shadow-lg)" }}>
                    <Icon name="whatsapp" size={15}/> {tr("לתיאום תור בוואטסאפ")}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* TREATMENTS - a photo, a name, a line, its own button. */}
          {services.length > 0 && (
            <div id="bk-services" style={{ ...section, scrollMarginTop: 14 }}>
              <SectionTitle>{tr("הטיפולים שלי")}</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {services.map((sv, i) => {
                  const img = serviceImage(sv, brand?.serviceImages);
                  return (
                    <div key={sv.id || i} style={{ background: "var(--brand-surface, #FDFBF9)", border: "1px solid " + HAIR, borderRadius: "var(--r-card)", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-sm)" }}>
                      <Photo src={img.url} sizes="(max-width: 540px) 46vw, 260px" style={{ width: "100%", aspectRatio: "4 / 3" }} />
                      <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1, textAlign: "center" }}>
                        <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: ink, margin: 0, lineHeight: 1.25 }}>{sv.name}</p>
                        {sv.description && <p style={{ ...T_META, color: faint, margin: 0, lineHeight: 1.5 }}>{sv.description}</p>}
                        <p style={{ ...T_META, color: faint, margin: 0 }}>{sv.duration || 60} {tr("דק׳ · ₪")}{sv.price}</p>
                        {(() => {
                          const mine = resultsForService(results, sv);
                          const key = groupKeyForService(resultGroups, sv);
                          if (!mine.length || !key) return null;
                          return (
                            <button onClick={() => goToResults(key)} className="bk-btn" aria-label={tr("תוצאות ({0}) של {1}", [mine.length, sv.name])}
                              style={{ background: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <span style={{ display: "flex" }}>
                                {mine.slice(0, 3).map((r, k) => (
                                  <span key={r.id || k} style={{ width: 30, height: 30, marginInlineStart: k ? -8 : 0, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--brand-surface, #FDFBF9)", display: "block" }}>
                                    <Photo src={r.after} sizes="64px" style={{ width: "100%", height: "100%" }} />
                                  </span>
                                ))}
                              </span>
                              <span style={{ fontSize: "var(--t-sm)", color: deep, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>{tr("תוצאות (")}{mine.length})</span>
                            </button>
                          );
                        })()}
                        {canBook && (
                          <button onClick={() => { setSelectedService(sv); setSelectedDate(null); setSelectedStart(null); setStep(2); }} className="bk-btn"
                            style={{ marginTop: "auto", height: 42, borderRadius: "var(--r-full)", background: "var(--pc-tint)", color: deep, fontSize: "var(--t-md)", fontWeight: 600, border: "1px solid var(--pc-soft)" }}>
                            {brand?.ctaLabel || tr("קביעת תור")}
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
              record reach this page (get_public_results). Two per row, four per
              group until she asks for more; tapping one opens it full-size. */}
          {resultGroups.length > 0 && (
            <div id="bk-results" style={{ ...section, marginTop: 34 }}>
              <SectionTitle>{tr("תוצאות")}</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {resultGroups.map((g) => {
                  const open = !!expandedGroups[g.key];
                  const visible = open ? g.items : g.items.slice(0, RESULTS_PER_GROUP);
                  const hidden = g.items.length - RESULTS_PER_GROUP;
                  return (
                    <div key={g.key} id={"bk-results-" + g.key} style={{ scrollMarginTop: 14 }}>
                      <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: ink, margin: "0 0 10px", textAlign: "center" }}>{g.name}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, maxWidth: 340, margin: "0 auto" }}>
                        {visible.map((r, i) => (
                          <ResultThumb key={r.id} result={r} label={tr("תוצאה {0} מתוך {1}: {2}", [i + 1, g.items.length, g.name])}
                            onOpen={() => setOpenResult({ key: g.key, index: i })} />
                        ))}
                      </div>
                      {hidden > 0 && (
                        <button onClick={() => setExpandedGroups((m) => ({ ...m, [g.key]: !open }))} className="bk-btn"
                          style={{ display: "block", margin: "12px auto 0", padding: "8px 20px", borderRadius: "var(--r-full)", background: "var(--pc-tint)", color: deep, border: "1px solid var(--pc-soft)", fontSize: "var(--t-md)", fontWeight: 600 }}>
                          {open ? tr("הצג פחות") : tr("עוד {0}", [hidden])}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABOUT - her portrait on one side, her words on the other. */}
          <div style={{ ...section, marginTop: 34 }}>
            <SectionTitle>{tr("אודותיי")}</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: 16, alignItems: "center" }}>
              <div>
                {personName && <p className="serif" style={{ ...T_BODY, fontWeight: 700, color: ink, margin: "0 0 8px" }}>{tr("נעים מאוד, אני")} {personName},</p>}
                <p style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.85, margin: 0, whiteSpace: "pre-line" }}>{aboutText}</p>
                {aboutSignoff && <p className="script" style={{ margin: "12px 0 0", fontSize: "var(--t-3xl)", lineHeight: 1.1, color: deep }}>{aboutSignoff}</p>}
              </div>
              <Photo src={brand?.portraitUrl || defaultImageUrl(defaultAboutKey(brand?.fields))} sizes="(max-width: 540px) 46vw, 260px" style={{ width: "100%", aspectRatio: "4 / 5", borderRadius: "var(--r-card)", border: "1px solid " + HAIR }} />
            </div>
          </div>

          {/* WHAT SHE STANDS FOR - four short lines, four icons. */}
          <div style={{ ...section, marginTop: 34 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {valueProps.map((v, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", border: "1px solid " + HAIR, background: "var(--brand-surface, #FDFBF9)", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", color: pcText }}>
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
                {eyebrow(tr("איך זה עובד אצלי"))}
                <div>
                  {howIWork.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${hair}` }}>
                      <span className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, color: pcText, flexShrink: 0, lineHeight: 1 }}>{i + 1}</span>
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
                    <Photo src={p} sizes="(max-width: 540px) 50vw, 270px" style={{ width: "100%", height: "100%" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GALLERY */}
          {gallery.length > 0 && (
            <div style={{ ...section }}>
              <div style={cardBox}>
                {eyebrow(tr("גלריה"))}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                  {gallery.map((g, i) => (
                    <a key={i} href={g} target="_blank" rel="noreferrer" className="gal-item" aria-label={tr("תמונה {0} מתוך {1} בגלריה", [i + 1, gallery.length])} style={{ display: "block", aspectRatio: "1 / 1", borderRadius:"var(--r-md)", overflow: "hidden", border: `1px solid ${hair}` }}>
                      <Photo src={g} sizes="(max-width: 540px) 25vw, 135px" style={{ width: "100%", height: "100%" }} />
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
                {eyebrow(tr("ביקורות"))}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <span className="serif" style={{ fontSize:"var(--t-hero)", fontWeight: 600, color: deep, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                  <div>
                    <div style={{ fontSize:"var(--t-lg)", color: pcText, letterSpacing: 2 }}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= Math.round(avgRating) ? "★" : "☆"}</span>)}
                    </div>
                    <span style={{ ...T_META, color: faint }}>{reviews.length} {tr("ביקורות")}{reviewsAreReal ? tr(" מלקוחות") : ""}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, margin: "0 -2px" }}>
                  {reviews.map((rv, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 250, background: cream, border: `1px solid ${hair}`, borderRadius:"var(--r-card)", padding: "18px 20px" }}>
                      <div style={{ fontSize:"var(--t-md)", color: pcText, letterSpacing: 1.5, marginBottom: 10 }}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= (Number(rv.rating) || 5) ? "★" : "☆"}</span>)}
                      </div>
                      {rv.text && <p className="serif" style={{ fontSize:"var(--t-md)", color: "var(--ink, #1F3A30)", lineHeight: 1.75, marginBottom: 12, fontStyle: "italic" }}>“{rv.text}”</p>}
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
              {eyebrow(tr("שעות פעילות"))}
              {/* Today's line lives in the header, where she actually looks for
                  it. The full week is reference material and was costing seven
                  rows of chrome on every visit, above the prices. */}
              {!showAllHours && (
                <button onClick={() => setShowAllHours(true)} className="bk-btn"
                  style={{ ...T_BODY, background: "none", padding: 0, color: ink, textDecoration: "underline", textDecorationColor: hair, textUnderlineOffset: 5 }}>
                  {tr("כל השעות")}
                </button>
              )}
              {(showAllHours ? [0, 1, 2, 3, 4, 5, 6] : []).map((d) => {
                const v = weekHours[d];
                const today = !!now && d === now.getDay();
                return (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", margin: "0 -12px", borderRadius:"var(--r-sm)", background: today ? "var(--pc-tint)" : "transparent", borderBottom: d < 6 ? `1px solid ${hair}` : "none" }}>
                    <span style={{ fontSize:"var(--t-md)", color: today ? deep : "var(--ink-2, #6B6275)", fontWeight: today ? 700 : 500 }}>{tr(DAYS_HE[d])}{today ? " · " + tr("היום") : ""}</span>
                    <span style={{ fontSize:"var(--t-md)", color: v ? (today ? deep : "var(--ink, #1F3A30)") : faint, fontWeight: today ? 700 : 500, letterSpacing: v ? "0.5px" : 0 }}>{v ? `${hh(v.open)}–${hh(v.close)}` : tr("סגור")}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LOCATION */}
          {addr && (
            <div style={{ ...section }}>
              <div>
                {eyebrow(tr("מיקום"))}
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #1F3A30)", marginBottom: 16, lineHeight: 1.7 }}>{addr}</p>
                {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--pc-tint)", color: deep, textDecoration: "none", padding: "11px 20px", borderRadius:"var(--r-full)", fontSize:"var(--t-md)", fontWeight: 600, letterSpacing: "0.4px", border: "1px solid var(--pc-soft)" }}>{tr("ניווט במפות Google")}</a>}
              </div>
            </div>
          )}

          {/* SOCIAL LINKS */}
          {(socials.length > 0 || wa) && (
            <div style={{ ...section }}>
              <div>
                {/* "Follow us" only when there is something to follow; WhatsApp alone is a way to write. */}{eyebrow(socials.length > 0 ? "עקבו אחרינו" : "כתבי לנו")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={socialPill("#0B7A3E")}>{tr("וואטסאפ")}</a>}
                  {socials.map((s) => (
                    <a key={s.key} href={s.href} target="_blank" rel="noreferrer" style={socialPill("var(--brand-surface, #FDFBF9)", deep, pc)}>{s.label}</a>
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
                {eyebrow(tr("עדכונים"))}
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {recentPosts.map((p) => (
                    <div key={p.id} style={{ background: cream, borderRadius:"var(--r-card)", border: `1px solid ${hair}`, overflow: "hidden" }}>
                      {/* A post image saved before the bucket split can point into the PRIVATE
                          client-images bucket, which never serves to the public: the browser
                          blocks the response and logs an error on every visit to her page, for a
                          picture nobody can see. Skip those; a re-upload goes to the public one. */}
                      {p.image_url && !p.image_url.includes("/client-images/") && (
                        <Photo src={p.image_url} sizes="(max-width: 540px) 100vw, 540px" style={{ width: "100%", height: 240 }} />
                      )}
                      <div style={{ padding: "15px 17px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                          <span style={{ fontSize:"var(--t-sm)", fontWeight: 700, color: "var(--brand-surface, #FDFBF9)", background: postTypeColor(p.post_type), padding: "3px 11px", borderRadius:"var(--r-full)", letterSpacing: "0.4px" }}>
                            {postTypeLabel(p.post_type)}
                          </span>
                          <span style={{ fontSize:"var(--t-sm)", color: faint, letterSpacing: "0.3px" }}>
                            {parseDb(p.created_at).toLocaleDateString(localeOf(lang))}
                          </span>
                        </div>
                        {p.title && <p className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep, margin: "0 0 5px", lineHeight: 1.35 }}>{p.title}</p>}
                        {p.body && <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #1F3A30)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>}
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
          background: "linear-gradient(180deg, rgba(254,250,247,0) 0%, var(--brand-cream, #FBF8F1) 38%)" }}>
          {wa ? (
            <a href={waHref} target="_blank" rel="noreferrer" className="bk-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", maxWidth: 500, margin: "0 auto", height: 54, borderRadius: "var(--r-full)", textDecoration: "none",
                background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-lg)" }}>
              <Icon name="whatsapp" size={18} /> {tr("לקביעת תור בוואטסאפ")}
            </a>
          ) : (
            <button onClick={goToServices} className="bk-btn"
              style={{ display: "block", width: "100%", maxWidth: 500, margin: "0 auto", height: 54, borderRadius: "var(--r-full)",
                background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize: "var(--t-lg)", fontWeight: 600, boxShadow: "var(--shadow-lg)" }}>
              {brand?.ctaLabel || tr("קביעת תור")}
            </button>
          )}
        </div>
      )}

      {openResult && (() => {
        const g = resultGroups.find((x) => x.key === openResult.key);
        if (!g) return null;
        return (
          <ResultLightbox items={g.items} index={Math.min(openResult.index, g.items.length - 1)} title={g.name}
            onClose={() => setOpenResult(null)}
            onStep={(d) => setOpenResult((o) => (o ? { ...o, index: (o.index + d + g.items.length) % g.items.length } : o))} />
        );
      })()}

      {/* ============ STEPS 2–4 — BOOKING FLOW ============ */}
      {step >= 2 && (
        <>
          {/* compact header */}
          <div style={{ width: "100%", maxWidth: 480, padding: "30px 20px 6px", textAlign: "center" }}>
            {brand?.logoUrl ? (
              <Logo src={logoSrc(brand.logoUrl, tenantIdProp || tenantId)} alt={bizName} w={220} h={72} style={{ maxHeight: 72, maxWidth: 220, width: "auto", height: "auto", objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
            ) : null}
            <h1 className="serif" style={{ fontSize: 26, fontWeight: 700, color: deep, letterSpacing: "0.3px" }}>{bizName}</h1>
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
                <button onClick={() => { setSlotTakenMsg(""); setStep(1); }} style={{ background: "none", border: "none", color: pcText, fontSize:"var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px", minHeight: 44, padding: "0 4px" }}>{tr("→ חזרה לעמוד העסק")}</button>
                <div style={{ background: cream, borderRadius:"var(--r-md)", padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${hair}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: selectedService.color || pc }} />
                  <p style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink, flex: 1 }}>{selectedService.name}</p>
                  <p className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep }}>₪{selectedService.price}</p>
                </div>

                {askWho && !availabilityPending && (
                  <div data-testid="staff-pick" style={{ marginBottom: 20 }}>
                    <p style={{ fontSize:"var(--t-sm)", letterSpacing: "3px", color: pcText, fontWeight: 700, marginBottom: 12 }}>{tr("עם מי?")}</p>
                    <div role="radiogroup" aria-label={tr("עם מי?")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[{ id: ANY_STAFF, name: tr("לא משנה לי"), color: null }, ...teamForSvc].map((x) => {
                        const on = (pickedStaff ? pickedStaff.id : ANY_STAFF) === x.id;
                        return (
                          <button key={x.id} type="button" role="radio" aria-checked={on} className="bk-btn"
                            onClick={() => { setStaffPick(x.id); setSelectedDate(null); setSelectedStart(null); setSlotTakenMsg(""); }}
                            style={{ minHeight: 44, padding: "8px 16px", borderRadius: "var(--r-full)", fontSize: "var(--t-md)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, background: on ? pc : "var(--brand-surface, #FDFBF9)", color: on ? "var(--pc-contrast, #FFFFFF)" : ink, border: on ? "none" : `1px solid ${hair}`, boxShadow: on ? "var(--shadow-accent)" : "var(--shadow-sm)" }}>
                            {x.color && <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: x.color, flexShrink: 0 }} />}
                            {x.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p style={{ fontSize:"var(--t-sm)", letterSpacing: "3px", color: pcText, fontWeight: 700, marginBottom: 12 }}>{tr("בחרי יום")}</p>
                {availabilityPending ? (
                  // The page is already up; only the diary is still being read. Say so, never show an unchecked grid.
                  <div role="status" style={{ ...noticeBox, marginBottom: 22 }}>{tr("בודקת אילו ימים ושעות פנויים…")}</div>
                ) : availableDays.length === 0 ? (
                  <div style={{ ...noticeBox, marginBottom: 22 }}>
                    {tr("אין כרגע ימים פנויים לקביעת תור אונליין. אפשר ליצור קשר עם העסק ונשמח לתאם לך מועד.")}
                  </div>
                ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 22 }}>
                  {availableDays.map((d, i) => {
                    const isSel = selectedDate && formatDate(d) === formatDate(selectedDate);
                    return (
                      <div key={i} className="bk-chip" role="button" tabIndex={0} aria-pressed={!!isSel} aria-label={tr("יום {0} {1} {2}", [tr(DAYS_HE[d.getDay()]), d.getDate(), tr(MONTHS_HE[d.getMonth()])])}
                        onClick={() => { setSelectedDate(d); setSelectedStart(null); setSlotTakenMsg(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedDate(d); setSelectedStart(null); } }}
                        style={{ flexShrink: 0, width: 62, padding: "13px 0", borderRadius:"var(--r-md)", textAlign: "center", background: isSel ? pc : "var(--brand-surface, #FDFBF9)", color: isSel ? "var(--pc-contrast, #FFFFFF)" : ink, boxShadow: isSel ? "var(--shadow-accent)" : "var(--shadow-sm)", border: isSel ? "none" : `1px solid ${hair}` }}>
                        <p style={{ fontSize:"var(--t-sm)", fontWeight: 600, opacity: 0.75 }}>{tr(DAYS_HE[d.getDay()])}</p>
                        <p className="serif" style={{ fontSize:"var(--t-xl)", fontWeight: 600, lineHeight: 1.2 }}>{d.getDate()}</p>
                        <p style={{ fontSize:"var(--t-sm)", opacity: 0.65 }}>{lang === "he" ? MONTHS_HE[d.getMonth()].slice(0, 3) : new Intl.DateTimeFormat(localeOf(lang), { month: "short" }).format(d)}</p>
                      </div>
                    );
                  })}
                </div>
                )}

                {selectedDate && !availabilityPending && (
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
                        {tr("לא הצלחנו לבדוק כרגע אילו שעות כבר תפוסות. אפשר להמשיך, אבל ייתכן שהשעה שתבחרי כבר נתפסה. אם כך יקרה, נודיע לך מיד ונציע שעה אחרת.")}
                      </div>
                    )}
                    {slotTakenMsg && <div role="alert" data-testid="slot-taken" style={{ ...noticeBox, fontWeight: 600 }}>{slotTakenMsg}</div>}
                    <p style={{ fontSize:"var(--t-sm)", letterSpacing: "3px", color: pcText, fontWeight: 700, marginBottom: 12 }}>{tr("בחרי שעה")}</p>
                    {visibleSlots.length === 0 && (
                      <div style={noticeBox}>{tr("אין שעות פנויות ביום זה. אפשר לבחור יום אחר למעלה.")}</div>
                    )}
                    {everySlotTaken && (
                      <div style={noticeBox}>{tr("כל השעות ביום זה כבר תפוסות. אפשר לבחור יום אחר למעלה.")}</div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
                      {visibleSlots.map((h) => {
                        const taken = slotTaken(h);
                        const isSel = selectedStart === h;
                        return (
                          <button key={h} disabled={taken} onClick={() => { setSelectedStart(h); setSlotTakenMsg(""); }}
                            className="bk-btn"
                            style={{ padding: "12px 0", borderRadius:"var(--r-sm)", fontSize:"var(--t-md)", fontWeight: 600, background: taken ? "var(--brand-cream, #FBF8F1)" : isSel ? pc : "var(--brand-surface, #FDFBF9)", color: taken ? faint : isSel ? "var(--pc-contrast, #FFFFFF)" : ink, textDecoration: taken ? "line-through" : "none", boxShadow: taken ? "none" : "var(--shadow-sm)", border: isSel ? "none" : `1px solid ${hair}` }}>
                            {fmtTime(h)}
                          </button>
                        );
                      })}
                    </div>
                    {selectedStart !== null && (
                      <button onClick={() => setStep(3)} className="bk-btn"
                        style={{ width: "100%", padding: "16px 0", borderRadius:"var(--r-md)", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-lg)", fontWeight: 600, marginTop: 10, letterSpacing: "0.8px", boxShadow:"var(--shadow-accent)" }}>
                        {tr("המשיכי ←")}
                      </button>
                    )}
                  </>
                )}
                {/* Nothing fits: join the waiting list instead of leaving (app/WaitlistJoin.jsx). Open by default when no day or no hour is free. */}
                {!availabilityPending && (
                  <WaitlistJoin tenantId={tenantId} service={selectedService.name} preferredDate={selectedDate ? formatDate(selectedDate) : null}
                    pc={pc} pcText={pcText} ink={ink} muted={muted}
                    prominent={availableDays.length === 0 || (!!selectedDate && (visibleSlots.length === 0 || everySlotTaken))} />
                )}
              </div>
            )}

            {/* STEP 3 — DETAILS */}
            {step === 3 && (
              <div className="bk-card">
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: pcText, fontSize:"var(--t-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, letterSpacing: "0.3px", minHeight: 44, padding: "0 4px" }}>{tr("→ חזרה")}</button>

                <div style={{ background: cream, borderRadius:"var(--r-card)", padding: "18px 20px", marginBottom: 20, border: `1px solid ${hair}` }}>
                  <p style={{ fontSize:"var(--t-sm)", letterSpacing: "2.5px", color: pcText, fontWeight: 700, marginBottom: 12 }}>{tr("סיכום התור")}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("טיפול")}</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{selectedService.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("תאריך")}</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{tr(DAYS_HE[selectedDate.getDay()])} {selectedDate.getDate()}/{selectedDate.getMonth() + 1}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("שעה")}</span>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{fmtTime(selectedStart)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${hair}`, paddingTop: 10, marginTop: 4 }}>
                    <span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{tr("מחיר")}</span>
                    <span className="serif" style={{ fontSize:"var(--t-lg)", fontWeight: 600, color: deep }}>₪{selectedService.price}</span>
                  </div>
                </div>

                <p style={{ fontSize:"var(--t-sm)", letterSpacing: "2.5px", color: pcText, fontWeight: 700, marginBottom: 14 }}>{tr("הפרטים שלך")}</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("שם מלא")} aria-label={tr("שם מלא")} autoComplete="name" aria-required="true"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius:"var(--r-md)", padding: "14px 16px", fontSize:"var(--t-lg)", fontFamily: "inherit", outline: "none", background: "var(--brand-surface, #FDFBF9)", marginBottom: 10 }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder={tr("טלפון נייד")} aria-label={tr("טלפון נייד")} aria-required="true"
                  style={{ width: "100%", border: `1px solid ${hair}`, borderRadius:"var(--r-md)", padding: "14px 16px", fontSize:"var(--t-lg)", fontFamily: "inherit", outline: "none", background: "var(--brand-surface, #FDFBF9)", marginBottom: 14 }} />

                {cardPay && Number(selectedService?.price) > 0 && !needsPolicy && (
                  <p data-testid="booking-card-pay" style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.6, padding: "10px 12px", borderRadius: "var(--r-md)", border: `1px solid ${hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12 }}>
                    {tr("💳 אפשר לשלם אצלנו בכרטיס אשראי. אחרי קביעת התור יופיע כאן כפתור לתשלום בדף מאובטח.")}
                  </p>
                )}

                {/* CONSENT, before the button. What is stored, what it is
                    used for, where the full policy is - and a tick that the
                    button waits for. Shown here rather than after, because
                    after is too late to be asked. */}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px", borderRadius:"var(--r-md)", border: `1px solid ${agreed ? pc : hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setErrorMsg(""); }} aria-label={tr("אישור שמירת הפרטים")} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                  <span style={{ fontSize:"var(--t-md)", color: ink, lineHeight: 1.6 }}>
                    {tr("אני מאשרת שהשם והטלפון שלי יישמרו אצל")} {brand?.businessName || settings?.business_name || tr("העסק")} {tr("לצורך ניהול התור, ושאקבל עליו הודעות בוואטסאפ.")}{" "}
                    <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: pcText, fontWeight: 700, textDecoration: "underline" }}>{tr("מדיניות הפרטיות")}</a>
                  </span>
                </label>
                {termsRequired && (
                  <label data-testid="booking-terms" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px", borderRadius: "var(--r-md)", border: `1px solid ${termsOk ? pc : hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={termsOk} onChange={(e) => { setTermsOk(e.target.checked); if (e.target.checked) setErrorMsg(""); }} aria-label={tr("אישור תנאי ההזמנה")} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                    <span style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.6 }}>
                      {bookingRules.depositAmount > 0 && <>{tr("מקדמה של ₪")}{bookingRules.depositAmount} {tr("לתיאום התור")}{bookingRules.depositNote ? ` (${bookingRules.depositNote})` : ""}. </>}
                      {bookingRules.cancelWindowHours > 0 && <>{tr("אפשר לבטל עד")} {bookingRules.cancelWindowHours} {tr("שעות לפני התור.")} </>}
                      {tr("קראתי ואני מאשרת.")}
                    </span>
                  </label>
                )}
                {needsPolicy && (
                  <label data-testid="grow-policy" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px", borderRadius: "var(--r-md)", border: `1px solid ${policyOk ? pc : hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={policyOk} onChange={(e) => { setPolicyOk(e.target.checked); if (e.target.checked) setErrorMsg(""); }} aria-label={tr("אישור מדיניות הביטולים")} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                    <span style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.6 }}>
                      <b>{tr("מדיניות ביטולים")}</b><br />
                      <span data-testid="grow-policy-text" style={{ whiteSpace: "pre-line" }}>{growPolicy.text}</span><br />
                      {PAY_TERMS_BEFORE_HE}{tr("מדיניות הביטולים ול")}<a href={PAYMENT_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: pcText, fontWeight: 700, textDecoration: "underline" }}>{PAY_TERMS_LINK_HE}</a>{PAY_TERMS_AFTER_HE}
                    </span>
                  </label>
                )}
                {needsCardTick && (
                  <label data-testid="grow-card-consent" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 12px", borderRadius: "var(--r-md)", border: `1px solid ${cardOk ? pc : hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={cardOk} onChange={(e) => { setCardOk(e.target.checked); if (e.target.checked) setErrorMsg(""); }} aria-label={tr("אישור שמירת פרטי כרטיס האשראי")} required style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                    <span style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.6 }}>{CARD_CONSENT_TEXT_HE}</span>
                  </label>
                )}
                <label data-testid="marketing-consent-checkbox" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius:"var(--r-md)", border: `1px solid ${marketingOk ? pc : hair}`, background: "var(--brand-surface, #FDFBF9)", marginBottom: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={marketingOk} onChange={(e) => setMarketingOk(e.target.checked)} aria-label={tr("אשמח לקבל עדכונים ומבצעים")} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: pc }} />
                  <span style={{ fontSize:"var(--t-md)", color: ink, lineHeight: 1.6 }}>{tr("אשמח לקבל עדכונים ומבצעים")}</span>
                </label>

                {errorMsg && <p role="alert" style={{ color: "var(--danger, #E05B6F)", fontSize:"var(--t-md)", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>{errorMsg}</p>}

                <button onClick={handleConfirm} disabled={submitting} className="bk-btn"
                  style={{ width: "100%", padding: "16px 0", borderRadius:"var(--r-md)", background: pc, color: "var(--pc-contrast, #FFFFFF)", fontSize:"var(--t-lg)", fontWeight: 600, letterSpacing: "0.8px", boxShadow:"var(--shadow-accent)" }}>
                  {submitting ?<Spinner inline label={tr("קובעת את התור")}/>: (brand?.ctaLabel || tr("קביעת תור"))}
                </button>
                <p style={{ ...T_META, color: faint, textAlign: "center", marginTop: 10 }}>{/* No WhatsApp promise: while the central number is off the confirmation waits for her tap. */}{tr("התור נשמר מיד, וכל הפרטים יופיעו כאן. יש שאלה? אפשר לפנות אלינו בוואטסאפ")}</p>
              </div>
            )}

            {/* STEP 4 — SUCCESS */}
            {step === 4 && (
              <div className="bk-card" style={{ textAlign: "center", paddingTop: 24 }}>
                <div style={{ fontSize:"var(--t-hero)", marginBottom: 14, color: pcText }}>✦</div>
                <h2 className="serif" style={{ fontSize:"var(--t-3xl)", fontWeight: 600, color: deep, marginBottom: 10, letterSpacing: "0.3px" }}>{policyStep && policyStep.kind === "deposit" && policyStep.url ? tr("התור שמור עבורך") : tr("התור נקבע!")}</h2>
                <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #1F3A30)", lineHeight: 1.7, marginBottom: 22 }}>
                  {tr("נתראה ב{0} {1} בשעה {2}", [tr(DAYS_HE[selectedDate.getDay()]), `${selectedDate.getDate()}/${selectedDate.getMonth() + 1}`, fmtTime(selectedStart)])}
                </p>
                <div style={{ background: cream, borderRadius:"var(--r-card)", padding: "20px 22px", border: `1px solid ${hair}`, textAlign: "start", marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("טיפול")}</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{selectedService.name}</span></div>
                  {bookedWith && <div data-testid="booked-with" style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("עם")}</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{bookedWith}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("שם")}</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{name}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize:"var(--t-md)", color: muted }}>{tr("טלפון")}</span><span style={{ fontSize:"var(--t-md)", fontWeight: 600, color: ink }}>{phone}</span></div>
                </div>
                {/* The form she asked for before this treatment, and a first-timer's patch test (lib/intakeGate.ts). Only for a gated service. */}
                {intakeInfo && (intakeInfo.formFromBusiness || intakeInfo.patchTest) && (
                  <div data-testid="intake-step" style={{ background: cream, borderRadius: "var(--r-card)", padding: "16px 18px", border: `1px solid ${pc}`, textAlign: "start", marginBottom: 18, lineHeight: 1.7 }}>
                    {intakeInfo.formFromBusiness && <p data-testid="intake-from-business" style={{ fontSize: "var(--t-md)", color: ink }}>{intakeFromBusinessHe(bizName)}</p>}
                    {intakeInfo.patchTest && <p data-testid="intake-patch-test" style={{ fontSize: "var(--t-md)", color: ink, marginTop: intakeInfo.formFromBusiness ? 12 : 0 }}>{patchTestConfirmHe(bizName)}</p>}
                  </div>
                )}
                {/* The manual deposit and how to pay it. It sat in step 1's social links, which are gone by step 4, so the client never saw it. */}
                {depositInfo && depositInfo.amount > 0 && (
                  <div data-testid="deposit-info" style={{ background: cream, borderRadius: "var(--r-card)", padding: "14px 18px", border: `1px solid ${hair}`, textAlign: "start", marginBottom: 18, lineHeight: 1.7, fontSize: "var(--t-md)", color: ink }}>
                    <b>{tr("מקדמה: ₪")}{depositInfo.amount}</b>
                    {depositInfo.note ? <><br />{depositInfo.note}</> : null}
                  </div>
                )}
                {policyStep && policyStep.url && (
                  <div data-testid="grow-step" style={{ background: cream, borderRadius: "var(--r-card)", padding: "16px 18px", border: `1px solid ${pc}`, textAlign: "start", marginBottom: 18, lineHeight: 1.7 }}>
                    <p style={{ fontSize: "var(--t-md)", color: "var(--ink, #1F3A30)", marginBottom: 10 }}>
                      {policyStep.kind === "deposit" ? tr("התור שמור עבורך ל-30 דקות. כדי לאשר אותו, משלמים את המקדמה בדף תשלום מאובטח. אם המקדמה לא תשולם בזמן, התור ישוחרר. פרטי הכרטיס נמסרים רק לחברת הסליקה.") : tr("התור נקבע. נשאר רק לשמור כרטיס אשראי בדף מאובטח, לפי מדיניות הביטולים. לא יחויב כסף עכשיו, ופרטי הכרטיס נמסרים רק לחברת הסליקה.")}
                    </p>
                    <button type="button" className="bk-btn" data-testid="deposit-pay" disabled={payBusy} onClick={payDeposit} style={{ display: "block", width: "100%", textAlign: "center", padding: "13px 0", minHeight: 48, background: pc, color: "var(--pc-contrast, #1F3A30)", border: "none", borderRadius: "var(--r-md)", fontWeight: 700, fontFamily: "inherit", fontSize: "var(--t-md)", cursor: "pointer" }}>{payBusy ? tr("פותחת את הדף המאובטח…") : policyStep.kind === "deposit" ? tr("המשך לתשלום המקדמה") : tr("המשך לשמירת הכרטיס")}</button>
                    {payErr && <p role="alert" style={{ fontSize: "var(--t-sm)", color: ink, marginTop: 8 }}>{payErr}</p>}
                  </div>
                )}
                {cardPay && bookedId && !policyStep && Number(selectedService?.price) > 0 && (
                  <div data-testid="booking-pay-now" style={{ background: cream, borderRadius: "var(--r-card)", padding: "16px 18px", border: `1px solid ${pc}`, textAlign: "start", marginBottom: 18, lineHeight: 1.7 }}>
                    <p style={{ fontSize: "var(--t-md)", color: "var(--ink, #1F3A30)", marginBottom: 10 }}>{tr("אפשר לשלם על הטיפול כבר עכשיו בכרטיס אשראי, בדף תשלום מאובטח. פרטי הכרטיס נמסרים רק לחברת הסליקה. אחרי התשלום יופיע כאן אישור.")}</p>
                    <button type="button" className="bk-btn" disabled={payBusy} onClick={payNow} style={{ display: "block", width: "100%", textAlign: "center", padding: "13px 0", minHeight: 48, background: pc, color: "var(--pc-contrast, #1F3A30)", border: "none", borderRadius: "var(--r-md)", fontWeight: 700, fontFamily: "inherit", fontSize: "var(--t-md)", cursor: "pointer" }}>{payBusy ? tr("פותחת את דף התשלום…") : tr("💳 לתשלום ₪{0} בכרטיס אשראי", [Number(selectedService.price)])}</button>
                    {payErr && <p role="alert" style={{ fontSize: "var(--t-sm)", color: ink, marginTop: 8 }}>{payErr}</p>}
                  </div>
                )}
                {policyStep && !policyStep.url && (
                  <div data-testid="grow-step-error" style={{ background: cream, borderRadius: "var(--r-card)", padding: "14px 18px", border: `1px solid ${hair}`, textAlign: "start", marginBottom: 18, lineHeight: 1.7, fontSize: "var(--t-md)", color: ink }}>
                    {tr("התור נקבע, אבל לא הצלחנו לפתוח עכשיו את הדף המאובטח.")} {brand?.businessName || tr("העסק")} {tr("תיצור איתך קשר להשלמת")} {policyStep.kind === "deposit" ? tr("המקדמה") : tr("שמירת הכרטיס")}.
                    {policyStep.kind === "saved_card" && bookedId && (
                      <>
                        <button type="button" className="bk-btn" data-testid="card-retry" disabled={payBusy} onClick={payDeposit} style={{ display: "block", width: "100%", marginTop: 10, padding: "12px 0", minHeight: 48, background: "var(--brand-surface, #FDFBF9)", color: ink, border: `1px solid ${pc}`, borderRadius: "var(--r-md)", fontWeight: 700, fontFamily: "inherit", fontSize: "var(--t-md)", cursor: "pointer" }}>{payBusy ? tr("פותחת את הדף המאובטח…") : tr("לנסות שוב לשמור את הכרטיס")}</button>
                        {payErr && <p role="alert" style={{ fontSize: "var(--t-sm)", color: ink, marginTop: 8 }}>{payErr}</p>}
                      </>
                    )}
                  </div>
                )}
                {/* Add to her own calendar. Hidden while a deposit is still pending: that slot is only held, and may be released. */}
                {!(policyStep && policyStep.kind === "deposit") && (() => {
                  const invite = {
                    date: formatDate(selectedDate),
                    startMinute: selectedStart,
                    duration: selectedService.duration || 60,
                    title: `${selectedService.name} · ${brand?.businessName || tr("תור")}`,
                    location: addr || undefined,
                    details: wa ? tr("לשינוי או שאלה: https://wa.me/{0}", [wa]) : undefined,
                  };
                  // A real link, not a blob download: the in-app browsers of Instagram and Facebook drop a blob download without a word,
                  // and iPhone Safari opens a link that answers text/calendar straight into "Add to Calendar" (app/api/calendar-invite).
                  const icsHref = `/api/calendar-invite?${new URLSearchParams({
                    date: invite.date, start: String(invite.startMinute), duration: String(invite.duration), title: invite.title,
                    ...(invite.location ? { location: invite.location } : {}), ...(invite.details ? { details: invite.details } : {}),
                  }).toString()}`;
                  const chip = { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: ink, border: "1px solid rgba(31,58,48,0.22)", textDecoration: "none", padding: "10px 16px", minHeight: 44, borderRadius: "var(--r-full)", fontSize: "var(--t-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
                  return (
                    <div data-testid="add-to-calendar" style={{ marginBottom: 18 }}>
                      <p style={{ fontSize: "var(--t-sm)", color: muted, marginBottom: 8 }}>{tr("שמרי את התור ביומן שלך, כדי שהטלפון יזכיר לך")}</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <a href={icsHref} data-testid="add-to-calendar-ics" style={chip}>{tr("לאייפון / ליומן")}</a>
                        <a href={googleCalendarUrl(invite)} target="_blank" rel="noreferrer" style={chip}>{tr("ליומן Google")}</a>
                      </div>
                    </div>
                  );
                })()}
                {/* Where to come: her address, and Waze straight to it (2026-11-03 UX review). Only when she has an address. */}
                {addr && (
                  <div data-testid="booking-address" style={{ marginBottom: 18 }}>
                    <p style={{ fontSize: "var(--t-md)", color: ink, lineHeight: 1.6, marginBottom: 8 }}>📍 {addr}</p>
                    <a href={`https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`} target="_blank" rel="noreferrer" data-testid="booking-waze"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: ink, border: "1px solid rgba(31,58,48,0.22)", textDecoration: "none", padding: "10px 16px", minHeight: 44, borderRadius: "var(--r-full)", fontSize: "var(--t-sm)", fontWeight: 600, fontFamily: "inherit" }}>{tr("ניווט ב-Waze")}</a>
                  </div>
                )}
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#0B7A3E", color: "var(--brand-surface, #FDFBF9)", textDecoration: "none", padding: "12px 22px", borderRadius:"var(--r-full)", fontSize:"var(--t-md)", fontWeight: 600, letterSpacing: "0.4px", marginBottom: 16 }}><Icon name="whatsapp" size={15}/> {tr("שלחי לנו הודעה")}</a>}
                <p style={{ fontSize:"var(--t-sm)", color: faint, letterSpacing: "0.5px" }}>{tr("נשמח לראותך")}</p>
              </div>
            )}

          </div>
        </>
      )}

      {/* FOOTER - her address (when she has one), then Kalmea as a small mark. The full 340px banner used to sit here and
          out-shouted her own page; on a business's page the business is the most prominent thing (public-page language). */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "30px 20px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {addr && step === 1 && (
          <p style={{ fontSize:"var(--t-sm)", color: muted, fontWeight: 500, marginBottom: 8, letterSpacing: "0.3px" }}>{addr}</p>
        )}
        <PoweredBy />
        <PublicFooterLinks />
      </div>
    </div>
  );
}

"use client";
// app/PublicLandingPage.tsx
//
// The public landing page at /[slug] (v2). Mobile-first, RTL, one column.
//
// The rule this page is built on: NOTHING is invented. Every section reads a
// value the tenant actually entered (or a client actually wrote, for reviews)
// and hides itself when that value is missing - no placeholder reviews, no
// stock "before/after", no follower counts, no default hours. A brand-new
// tenant gets a short, clean page with her name, her services and a way to
// reach her; it grows as she fills in Settings.
//
// Booking itself is not re-implemented here: "Book online" goes to the existing
// flow at /book?t=<tenant>, which is the same BookingPage the old /[slug] showed
// (still reachable at /[slug]?v=old).
//
// Colours: only the tenant's accent tokens (--pc-*, set once by accentStyle on
// the root) and the shared ink / cream tokens. Nothing hardcoded except the nail
// polish swatches, which are content (a colour to pick), not theme.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Icon from "./Icon";
import { PoweredBy } from "./PublicChrome";
import PublicFooterLinks from "./PublicFooterLinks";
import { accentStyle } from "@/lib/theme";
import { resolveBranding } from "@/lib/branding";
import { logoSrc } from "@/lib/logoSrc";
import { displayName } from "@/lib/personName";
import { normalizeBusinessHours } from "@/lib/businessHours";
import {
  DAYS_HE, displayPhone, fmtHour, googleInfo, hasRealHours, instagramHandle, israelClock,
  mapsHref, openStatus, openStatusLabel, planMessage, telHref, todayHours, waHref, wazeHref,
  type OpenStatus,
} from "@/lib/publicLanding";

type Service = { id?: string | number; name?: string; price?: number | string | null; duration?: number | string | null; description?: string | null; field?: string | null; active?: boolean | null };
type Review = { client_name?: string | null; rating?: number | null; body?: string | null; created_at?: string | null };

// Classic salon shades. Shown only to a tenant that works in nails; the pick is
// optional and only adds one line to the WhatsApp message.
const POLISH = [
  { name: "נוד", hex: "#E3BFA6" },
  { name: "ורוד עדין", hex: "#F2B8C6" },
  { name: "אדום קלאסי", hex: "#B3122E" },
  { name: "בורדו", hex: "#6B1A2C" },
  { name: "לבן חלבי", hex: "#F4EFE6" },
  { name: "פרנץ'", hex: "#FBEFEA" },
  { name: "שחור", hex: "#1E1B1F" },
  { name: "כחול נייבי", hex: "#1F2B4D" },
  { name: "ירוק זית", hex: "#5E6B3A" },
  { name: "סגול לילך", hex: "#B49AC9" },
];

const FIELD_TITLE: Record<string, string> = { cosmetics: "קוסמטיקה וטיפוח", nails: "ציפורניים" };

const ink = "var(--ink, #2A2233)";
const ink2 = "var(--ink-2, #4E4658)";
const hair = "var(--pc-soft)";
const surface = "var(--brand-surface, #FFFFFF)";
const cream = "var(--brand-cream, #FDFBF9)";

function priceOf(s: Service): number { const n = Number(s.price); return Number.isFinite(n) && n > 0 ? n : 0; }
function minutesOf(s: Service): number { const n = Number(s.duration); return Number.isFinite(n) && n > 0 ? n : 0; }

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span aria-hidden="true" style={{ color: "var(--pc-text)", fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n <= full ? "★" : "☆"}</span>)}
    </span>
  );
}

function Photo({ src, eager = false, sizes, style }: { src: string; eager?: boolean; sizes: string; style?: CSSProperties }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div aria-hidden="true" style={{ ...style, background: "var(--pc-tint)" }} />;
  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <Image src={src} alt="" fill sizes={sizes} quality={75}
        preload={eager} fetchPriority={eager ? "high" : undefined} loading={eager ? undefined : "lazy"}
        unoptimized={/\.svg(\?|$)/i.test(src)} onError={() => setBad(true)}
        style={{ objectFit: "cover", objectPosition: "center" }} />
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="lp-sec" aria-label={title}>
      <h2 className="serif lp-h2">{title}</h2>
      {children}
    </section>
  );
}

export default function PublicLandingPage({
  tenantId, settings, services: servicesIn, reviews: reviewsIn,
}: {
  tenantId: string;
  settings: Record<string, any> | null;
  services: Service[] | null;
  reviews: Review[] | null;
}) {
  const brand = useMemo(() => resolveBranding(settings), [settings]);
  const rawBranding = (settings?.branding && typeof settings.branding === "object" ? settings.branding : {}) as Record<string, unknown>;
  const services = useMemo(
    () => (servicesIn || []).filter((s) => s && s.active !== false && String(s.name || "").trim()),
    [servicesIn]
  );
  const reviews = useMemo(
    () => (reviewsIn || []).filter((r) => r && Number(r.rating) >= 1 && (String(r.body || "").trim() || String(r.client_name || "").trim())),
    [reviewsIn]
  );

  // The clock is read only in the browser: the server render and the first
  // client render must match, and "open now" is about the visitor's moment.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // The sticky bar appears once the hero's own buttons have scrolled away, so
  // the two rows of the same buttons are never on screen together.
  const heroCtaRef = useRef<HTMLDivElement | null>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  useEffect(() => {
    const el = heroCtaRef.current;
    // No hero buttons at all (no services, no phone): nothing to duplicate, so the bar shows from the start.
    if (!el) { setHeroCtaVisible(false); return; }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHeroCtaVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Plan-your-treatment state.
  const [picked, setPicked] = useState<string[]>([]);
  const [polish, setPolish] = useState<string | null>(null);

  // ── Derived, all from real data ────────────────────────────────────────────
  const bizName = brand.businessName || "";
  const person = [displayName(brand.therapistName || ""), brand.therapistTitle].filter(Boolean).join(" · ");
  const headline = brand.welcomeHeadline || "";
  const description = brand.businessDescription || brand.welcomeMessage || "";
  const waPhone = brand.whatsappNumber || settings?.business_phone || "";
  const callPhone = settings?.business_phone || brand.whatsappNumber || "";
  const phoneShown = displayPhone(callPhone);
  const tel = telHref(callPhone);
  const waBase = waHref(waPhone, planMessage(bizName, []));
  const address = brand.address || "";
  const google = googleInfo(rawBranding);
  const igHandle = instagramHandle(brand.instagram);
  const hoursKnown = hasRealHours(settings);
  const week = hoursKnown ? normalizeBusinessHours(settings) : null;
  const status: OpenStatus | null = now ? openStatus(settings, now) : null;
  const today = now ? todayHours(settings, now) : null;
  const todayDow = now ? israelClock(now).dow : -1;
  // The polish picker needs a nails business AND a nails treatment to pick it for. A tenant marked "nails" whose
  // menu is all cosmetics would otherwise be offered polish colours for a facial. Services saved before
  // service_prices.field existed carry no field, so a menu with no field at all still counts.
  const isNails = brand.fields.includes("nails")
    && (services.some((s) => s.field === "nails") || !services.some((s) => s.field));
  const fieldsInMenu = Array.from(new Set(services.map((s) => (s.field === "nails" || s.field === "cosmetics" ? s.field : "")))).filter(Boolean);
  const groupByField = brand.fields.length > 1 && fieldsInMenu.length > 1;
  const groups: { key: string; title: string; items: Service[] }[] = groupByField
    ? [...fieldsInMenu.map((f) => ({ key: f, title: FIELD_TITLE[f] || f, items: services.filter((s) => s.field === f) })),
       { key: "other", title: "עוד טיפולים", items: services.filter((s) => s.field !== "nails" && s.field !== "cosmetics") }]
        .filter((g) => g.items.length)
    : [{ key: "all", title: "", items: services }];

  // Gallery: her uploads only (gallery + atmosphere photos), de-duplicated.
  const gallery = Array.from(new Set([...(brand.gallery || []), ...(brand.clinicPhotos || [])])).filter(Boolean);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const GALLERY_FIRST = 6;
  const galleryShown = galleryOpen ? gallery : gallery.slice(0, GALLERY_FIRST);

  // Real reviews only (written by clients, published). Their own average.
  const reviewsAvg = reviews.length ? reviews.reduce((a, r) => a + Number(r.rating || 0), 0) / reviews.length : 0;

  const bookBase = `/book?t=${encodeURIComponent(tenantId)}`;
  const canBook = services.length > 0;
  // A single picked treatment is carried into the booking flow (BookingPage
  // preselects it from ?service= and opens straight on the date step).
  const bookHref = picked.length === 1 ? `${bookBase}&service=${encodeURIComponent(picked[0])}` : bookBase;
  const navHref = address ? wazeHref(address) : google?.url || "";

  const pickedServices = services.filter((s) => picked.includes(String(s.name)));
  const totalMin = pickedServices.reduce((a, s) => a + minutesOf(s), 0);
  const allPriced = pickedServices.length > 0 && pickedServices.every((s) => priceOf(s) > 0);
  const totalPrice = pickedServices.reduce((a, s) => a + priceOf(s), 0);
  const planWa = waHref(waPhone, planMessage(bizName, picked, polish));

  // Stats: only values that exist. Rating prefers Google; with no Google rating,
  // the clients' own published reviews (three or more, so one 5 is not a statistic).
  const stats: { value: string; label: string }[] = [];
  if (google) stats.push({ value: google.rating.toFixed(1) + "★", label: "דירוג בגוגל" });
  else if (reviews.length >= 3) stats.push({ value: reviewsAvg.toFixed(1) + "★", label: "דירוג לקוחות" });
  if (google?.count) stats.push({ value: google.count.toLocaleString("he-IL"), label: "ביקורות בגוגל" });
  else if (reviews.length >= 3) stats.push({ value: String(reviews.length), label: "ביקורות לקוחות" });
  if (today) stats.push({ value: fmtHour(today.close), label: "שעת סגירה היום" });

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  const barItems = [
    waBase && { key: "wa", href: waBase, label: "וואטסאפ", icon: "whatsapp", external: true },
    tel && { key: "call", href: tel, label: "התקשרות", icon: "phone", external: false },
    navHref && { key: "nav", href: navHref, label: "ניווט", icon: "pin", external: true },
    canBook && { key: "book", href: bookBase, label: "קביעת תור", icon: "calendar", external: false, primary: true },
  ].filter(Boolean) as { key: string; href: string; label: string; icon: string; external: boolean; primary?: boolean }[];
  const barShown = barItems.length > 0 && !heroCtaVisible;

  return (
    <div dir="rtl" lang="he" style={{ ...accentStyle(brand.primary), background: cream, color: ink, minHeight: "100dvh", fontFamily: "var(--font-assistant), 'Assistant', sans-serif", overflowX: "hidden" }}>
      <style>{`
        .serif { font-family: var(--font-frank), 'Frank Ruhl Libre', serif; }
        .lp-wrap { width: 100%; max-width: 560px; margin: 0 auto; padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
        .lp-sec { margin: 0 16px 28px; }
        .lp-h2 { margin: 0 0 12px; font-size: var(--t-xl, 22px); font-weight: 700; line-height: 1.3; color: ${ink}; }
        .lp-card { background: ${surface}; border: 1px solid ${hair}; border-radius: var(--r-card, 18px); padding: 16px; box-shadow: var(--shadow-sm); }
        .lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: var(--r-full, 999px); font-family: inherit; font-size: var(--t-md, 16px); font-weight: 700; text-decoration: none; cursor: pointer; border: none; transition: transform .15s, filter .15s; -webkit-tap-highlight-color: transparent; }
        .lp-btn:active { transform: scale(.98); }
        .lp-primary { background: var(--pc); color: var(--pc-contrast, #fff); box-shadow: 0 10px 24px -14px var(--pc-shadow); }
        .lp-ghost { background: ${surface}; color: var(--pc-text); border: 1.5px solid var(--pc); }
        .lp-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; border-radius: var(--r-full, 999px); border: 1.5px solid ${hair}; background: ${surface}; color: ${ink}; font-family: inherit; font-size: var(--t-sm, 15px); font-weight: 600; cursor: pointer; text-align: start; }
        .lp-chip[aria-pressed="true"] { background: var(--pc-tint); border-color: var(--pc); color: var(--pc-text); }
        .lp-link { color: var(--pc-text); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
        .lp-bar { position: fixed; inset-inline: 0; bottom: 0; z-index: 50; background: ${surface}; border-top: 1px solid ${hair}; box-shadow: 0 -8px 24px -18px rgba(0,0,0,.35); padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px)); transform: translateY(110%); transition: transform .22s ease-out; }
        .lp-bar[data-shown="true"] { transform: none; }
        .lp-bar a { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 52px; border-radius: var(--r-md, 12px); text-decoration: none; font-size: var(--t-xs, 13px); font-weight: 700; color: var(--pc-text); background: var(--pc-tint); }
        .lp-bar a[data-primary="true"] { background: var(--pc); color: var(--pc-contrast, #fff); }
        @media (prefers-reduced-motion: reduce) { .lp-bar, .lp-btn { transition: none; } }
      `}</style>

      <div className="lp-wrap">
        {/* 1. HERO */}
        <header style={{ position: "relative", overflow: "hidden", marginBottom: 20, background: brand.heroImageUrl ? undefined : "linear-gradient(180deg, var(--pc-tint) 0%, " + cream + " 100%)" }}>
          {brand.heroImageUrl && (
            <>
              <Photo src={brand.heroImageUrl} eager sizes="(max-width: 560px) 100vw, 560px" style={{ position: "absolute", inset: 0 }} />
              <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(253,251,249,.80) 0%, rgba(253,251,249,.90) 60%, " + cream + " 100%)" }} />
            </>
          )}
          <div style={{ position: "relative", padding: "28px 16px 22px", textAlign: "center" }}>
            {brand.logoUrl && (
              <Image src={logoSrc(brand.logoUrl, tenantId)} alt="" width={240} height={84} sizes="240px"
                unoptimized={/\.svg(\?|$)/i.test(brand.logoUrl) || brand.logoUrl.startsWith("/logo/")}
                style={{ display: "block", margin: "0 auto 12px", maxHeight: 84, maxWidth: "70%", width: "auto", height: "auto", objectFit: "contain" }} />
            )}
            <h1 className="serif" style={{ margin: 0, fontSize: "clamp(28px, 8vw, 38px)", fontWeight: 700, lineHeight: 1.15, color: ink }}>{bizName || " "}</h1>
            {person && <p style={{ margin: "6px 0 0", fontSize: "var(--t-md, 16px)", color: ink2, fontWeight: 600 }}>{person}</p>}

            {/* Reserved height: the badge fills in after mount without moving the page. */}
            <div style={{ minHeight: 34, marginTop: 12, display: "flex", justifyContent: "center" }}>
              {status && (
                <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: "var(--r-full, 999px)", background: surface, border: "1px solid " + hair, fontSize: "var(--t-sm, 15px)", fontWeight: 700, color: ink }}>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: status.open ? "var(--success, #2E8B57)" : "var(--ink-3, #8A8191)" }} />
                  {openStatusLabel(status)}
                </span>
              )}
            </div>

            {headline && (
              <p className="serif" style={{ margin: "14px auto 0", maxWidth: 420, fontSize: "clamp(20px, 5.6vw, 26px)", fontWeight: 600, lineHeight: 1.3, color: "var(--pc-text)", whiteSpace: "pre-line" }}>{headline}</p>
            )}
            {description && (
              <p style={{ margin: "10px auto 0", maxWidth: 420, fontSize: "var(--t-md, 16px)", lineHeight: 1.7, color: ink2, whiteSpace: "pre-line" }}>{description}</p>
            )}

            {(canBook || waBase) && (
              <div ref={heroCtaRef} style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
                {canBook && <a href={bookBase} className="lp-btn lp-primary" style={{ flex: "1 1 160px", maxWidth: 260 }}><Icon name="calendar" size={18} /> קביעת תור אונליין</a>}
                {waBase && <a href={waBase} target="_blank" rel="noreferrer" className="lp-btn lp-ghost" style={{ flex: "1 1 140px", maxWidth: 220 }}><Icon name="whatsapp" size={18} /> וואטסאפ</a>}
              </div>
            )}
          </div>
        </header>

        {/* 2. GOOGLE CARD - only with a real rating she entered from her Google profile. */}
        {google && (
          <section className="lp-sec" aria-label="דירוג בגוגל">
            <div className="lp-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="serif" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: ink }}>{google.rating.toFixed(1)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Stars value={google.rating} size={16} />
                <p style={{ margin: "2px 0 0", fontSize: "var(--t-sm, 15px)", color: ink2 }}>
                  {google.count ? `${google.count.toLocaleString("he-IL")} ביקורות בגוגל` : "דירוג בגוגל"}
                </p>
              </div>
              {google.url && <a href={google.url} target="_blank" rel="noreferrer" className="lp-link" style={{ fontSize: "var(--t-sm, 15px)", flexShrink: 0 }}>לביקורות</a>}
            </div>
          </section>
        )}

        {/* 3. PLAN YOUR TREATMENT - chips from her real menu build a WhatsApp message. */}
        {services.length > 0 && (
          <Section id="plan" title="מתכננות טיפול?">
            <div className="lp-card">
              <p style={{ margin: "0 0 12px", fontSize: "var(--t-sm, 15px)", color: ink2, lineHeight: 1.6 }}>
                בחרי את הטיפולים שמעניינים אותך{waBase ? " ונשלח לך הודעה מוכנה בוואטסאפ" : ""}.
              </p>
              {groups.map((g) => (
                <div key={g.key} style={{ marginBottom: 10 }}>
                  {g.title && <p style={{ margin: "0 0 6px", fontSize: "var(--t-xs, 13px)", fontWeight: 700, color: ink2 }}>{g.title}</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {g.items.map((s) => {
                      const name = String(s.name);
                      const on = picked.includes(name);
                      return (
                        <button key={String(s.id ?? name)} type="button" className="lp-chip" aria-pressed={on} onClick={() => toggle(name)}>
                          {on && <Icon name="check" size={14} />}{name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {isNails && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ margin: "0 0 8px", fontSize: "var(--t-xs, 13px)", fontWeight: 700, color: ink2 }}>
                    צבע לק שאהבת (לא חובה){polish ? ": " + polish : ""}
                  </p>
                  <div role="radiogroup" aria-label="צבע לק" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {POLISH.map((c) => {
                      const on = polish === c.name;
                      return (
                        <button key={c.name} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name}
                          onClick={() => setPolish(on ? null : c.name)}
                          style={{ width: 34, height: 34, borderRadius: "50%", background: c.hex, cursor: "pointer", padding: 0, border: on ? "3px solid var(--pc)" : "1px solid rgba(0,0,0,.15)", outline: on ? "2px solid " + surface : "none", outlineOffset: -5 }} />
                      );
                    })}
                  </div>
                </div>
              )}

              {pickedServices.length > 0 && (totalMin > 0 || allPriced) && (
                <p style={{ margin: "12px 0 0", fontSize: "var(--t-sm, 15px)", color: ink, fontWeight: 600 }}>
                  {[totalMin > 0 ? `כ-${totalMin} דק׳` : "", allPriced ? `₪${totalPrice.toLocaleString("he-IL")}` : ""].filter(Boolean).join(" · ")}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                <a href={bookHref} className="lp-btn lp-primary" style={{ width: "100%" }}><Icon name="calendar" size={18} /> קביעת תור אונליין</a>
                {planWa && (
                  <a href={planWa} target="_blank" rel="noreferrer" className="lp-btn lp-ghost" style={{ width: "100%" }}>
                    <Icon name="whatsapp" size={18} /> {picked.length ? "שליחת הבחירה בוואטסאפ" : "שאלה בוואטסאפ"}
                  </a>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* 4. STATS - only the ones with a real value. */}
        {/* Two or more: a lone closing-hour card would only repeat the hero badge. */}
        {stats.length >= 2 && (
          <section className="lp-sec" aria-label="במספרים">
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 8 }}>
              {stats.map((s) => (
                <div key={s.label} className="lp-card" style={{ padding: "12px 8px", textAlign: "center" }}>
                  <p className="serif" style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--pc-text)", lineHeight: 1.1 }}>{s.value}</p>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--t-xs, 13px)", color: ink2 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. GALLERY - her own uploads. */}
        {gallery.length > 0 && (
          <Section title="מהעבודות שלי">
            {/* As many columns as there are photos, up to three, so one or two never leave empty cells. */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(gallery.length, 3)}, minmax(0, 1fr))`, gap: 6, maxWidth: gallery.length === 1 ? 260 : undefined, margin: "0 auto" }}>
              {galleryShown.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" aria-label={`תמונה ${i + 1} מתוך ${gallery.length}`}
                  style={{ display: "block", aspectRatio: "1 / 1", borderRadius: "var(--r-sm, 10px)", overflow: "hidden" }}>
                  <Photo src={src} sizes={gallery.length === 1 ? "260px" : "(max-width: 560px) 50vw, 280px"} style={{ width: "100%", height: "100%" }} />
                </a>
              ))}
            </div>
            {gallery.length > GALLERY_FIRST && (
              <button type="button" onClick={() => setGalleryOpen((o) => !o)} className="lp-btn lp-ghost" style={{ display: "flex", margin: "12px auto 0", minHeight: 40 }}>
                {galleryOpen ? "הצגת פחות" : `עוד ${gallery.length - GALLERY_FIRST} תמונות`}
              </button>
            )}
          </Section>
        )}

        {/* 6. REVIEWS - written by clients after a real visit, published only. */}
        {reviews.length > 0 && (
          <Section title="מה הלקוחות אומרות">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.slice(0, 6).map((r, i) => (
                <figure key={i} className="lp-card" style={{ margin: 0 }}>
                  <Stars value={Number(r.rating)} />
                  {r.body && <blockquote style={{ margin: "6px 0 0", fontSize: "var(--t-md, 16px)", lineHeight: 1.7, color: ink }}>{r.body}</blockquote>}
                  {r.client_name && <figcaption style={{ marginTop: 6, fontSize: "var(--t-sm, 15px)", fontWeight: 700, color: ink2 }}>{displayName(r.client_name) || r.client_name}</figcaption>}
                </figure>
              ))}
            </div>
          </Section>
        )}

        {/* 7. INSTAGRAM - a real handle and a follow link. Nothing else. */}
        {igHandle && (
          <section className="lp-sec" aria-label="אינסטגרם">
            <div className="lp-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "var(--t-sm, 15px)", color: ink2 }}>עקבי אחריי באינסטגרם</p>
                <p dir="ltr" style={{ margin: "2px 0 0", fontSize: "var(--t-md, 16px)", fontWeight: 700, color: ink, overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>@{igHandle}</p>
              </div>
              <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer" className="lp-btn lp-ghost" style={{ minHeight: 42, flexShrink: 0 }}>מעקב</a>
            </div>
          </section>
        )}

        {/* 8. SERVICES - the full menu. */}
        {services.length > 0 && (
          <Section id="services" title="הטיפולים">
            {groups.map((g) => (
              <div key={g.key} className="lp-card" style={{ padding: "4px 16px", marginBottom: 10 }}>
                {g.title && <p style={{ margin: "12px 0 0", fontSize: "var(--t-xs, 13px)", fontWeight: 700, color: ink2 }}>{g.title}</p>}
                {g.items.map((s, i) => {
                  const meta = [minutesOf(s) ? `${minutesOf(s)} דק׳` : "", priceOf(s) ? `₪${priceOf(s).toLocaleString("he-IL")}` : ""].filter(Boolean).join(" · ");
                  return (
                    <a key={String(s.id ?? s.name)} href={`${bookBase}&service=${encodeURIComponent(String(s.name))}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 && !g.title ? "none" : "1px solid " + hair, textDecoration: "none", color: ink }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "var(--t-md, 16px)", fontWeight: 700 }}>{s.name}</p>
                        {s.description && <p style={{ margin: "2px 0 0", fontSize: "var(--t-sm, 15px)", color: ink2, lineHeight: 1.5 }}>{s.description}</p>}
                        {meta && <p style={{ margin: "2px 0 0", fontSize: "var(--t-sm, 15px)", color: ink2 }}>{meta}</p>}
                      </div>
                      <span aria-hidden="true" style={{ color: "var(--pc-text)", fontWeight: 700, fontSize: "var(--t-sm, 15px)", flexShrink: 0 }}>לקביעה ‹</span>
                    </a>
                  );
                })}
              </div>
            ))}
          </Section>
        )}

        {/* 9. HOURS, ADDRESS, PHONE */}
        {(week || address || phoneShown) && (
          <Section title="שעות ופרטי קשר">
            <div className="lp-card">
              {week && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--t-sm, 15px)" }}>
                  <tbody>
                    {DAYS_HE.map((d, i) => {
                      const h = week[i];
                      const isToday = i === todayDow;
                      return (
                        <tr key={d} style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "var(--pc-text)" : ink }}>
                          <td style={{ padding: "5px 0" }}>{d}{isToday ? " (היום)" : ""}</td>
                          <td style={{ padding: "5px 0", textAlign: "left", direction: "ltr" }}>{h ? `${fmtHour(h.open)}–${fmtHour(h.close)}` : "סגור"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {address && (
                <div style={{ marginTop: week ? 14 : 0, paddingTop: week ? 14 : 0, borderTop: week ? "1px solid " + hair : "none" }}>
                  <p style={{ margin: 0, fontSize: "var(--t-md, 16px)", fontWeight: 600, display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="pin" size={16} /> {address}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <a href={mapsHref(address)} target="_blank" rel="noreferrer" className="lp-btn lp-ghost" style={{ flex: 1, minHeight: 42 }}>Google Maps</a>
                    <a href={wazeHref(address)} target="_blank" rel="noreferrer" className="lp-btn lp-ghost" style={{ flex: 1, minHeight: 42 }}>Waze</a>
                  </div>
                </div>
              )}
              {phoneShown && tel && (
                <div style={{ marginTop: week || address ? 14 : 0, paddingTop: week || address ? 14 : 0, borderTop: week || address ? "1px solid " + hair : "none" }}>
                  <a href={tel} className="lp-link" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--t-md, 16px)" }}>
                    <Icon name="phone" size={16} /> <span dir="ltr">{phoneShown}</span>
                  </a>
                </div>
              )}
            </div>
          </Section>
        )}

        <footer style={{ textAlign: "center", padding: "8px 16px 0" }}>
          <PoweredBy />
          <PublicFooterLinks />
        </footer>
      </div>

      {/* 10. STICKY BAR - after the hero's buttons scroll away. */}
      {barItems.length > 0 && (
        <nav className="lp-bar" data-shown={barShown ? "true" : "false"} aria-label="יצירת קשר" aria-hidden={!barShown}>
          <div style={{ display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
            {barItems.map((b) => (
              <a key={b.key} href={b.href} data-primary={b.primary ? "true" : undefined} tabIndex={barShown ? 0 : -1}
                {...(b.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                <Icon name={b.icon as any} size={18} />
                <span>{b.label}</span>
              </a>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

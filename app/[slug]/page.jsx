"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../supabase";
import { fetchPublicSettings } from "@/lib/branding";
import { ACTIVE_OR_NULL } from "@/lib/serviceActive";

// ============================================================
// DYNAMIC LANDING PAGE  —  /[slug]
// Each beautician gets a personal landing page at /her-slug
// Shows: business name, services + prices, "book now" button.
// Design adapts to her primary_color automatically.
// ============================================================

// Lighten a hex color by mixing with white (for soft backgrounds)
function lighten(hex, amount) {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const nr = Math.round(r + (255 - r) * amount);
    const ng = Math.round(g + (255 - g) * amount);
    const nb = Math.round(b + (255 - b) * amount);
    return `rgb(${nr}, ${ng}, ${nb})`;
  } catch {
    return "var(--pc-tint, #EDE7F0)";
  }
}

export default function LandingPage() {
  const params = useParams();
  const slug = params?.slug;

  const [tenant, setTenant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  // null | "notfound" | "failed". Splitting these is the point: a blocked or
  // broken read used to render as "this business does not exist" on her public
  // landing page, which is the page she puts in her Instagram bio.
  const [loadError, setLoadError] = useState(null);
  // Separate, because a failed SERVICES read must not blank the whole page -
  // but it must not render as "she offers no treatments" either.
  const [servicesFailed, setServicesFailed] = useState(false);

  useEffect(() => {
    if (slug) loadData();
  }, [slug]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    setServicesFailed(false);
    try {
      // 1. Find the tenant by slug.
      //
      // Through get_public_tenant_by_slug (SECURITY DEFINER), NOT a direct
      // table read. This page was the ONLY anonymous reader of public.tenants,
      // and that read is what kept the world-readable public_read_tenants
      // policy alive. The RPC returns exactly the two fields this page uses -
      // id and name - so plan_status, plan_price, the trial dates,
      // signup_source, business_description, target_audience and owner_id stop
      // being reachable by anyone with the anon key.
      //
      // An unknown slug comes back as an empty array with no error, so "no such
      // business" and "the lookup failed" are finally distinguishable.
      const { data: rows, error: rpcErr } = await supabase
        .rpc("get_public_tenant_by_slug", { p_slug: slug });

      if (rpcErr) {
        // Could not find out. NOT the same as "does not exist" - this used to
        // be the same branch, so a transient failure told a real client that a
        // real business was not there.
        console.error("Landing tenant lookup failed:", rpcErr.message);
        setLoadError("failed");
        return;
      }
      const tenantData = Array.isArray(rows) ? rows[0] : rows;
      if (!tenantData) {
        setLoadError("notfound");   // genuinely no business at this slug
        return;
      }
      setTenant(tenantData);

      // 2. Load this tenant's settings + services in parallel
      const [settingsRow, servicesRes] = await Promise.all([
        // SECURITY: public-safe settings via the shared layer (hardened RPC; never
        // the full row / green_api_token). Strictly scoped to this tenant's UUID.
        fetchPublicSettings(supabase, tenantData.id),
        supabase.from("service_prices").select("*").eq("tenant_id", tenantData.id).or(ACTIVE_OR_NULL),
      ]);

      if (settingsRow) setSettings(settingsRow);
      // A failed services read is recorded, not swallowed. Before, the page
      // simply rendered no treatment list - a business with a full price list
      // looked like a business that offers nothing.
      if (servicesRes.error) {
        console.error("Landing services load failed:", servicesRes.error.message);
        setServicesFailed(true);
      } else {
        setServices((servicesRes.data || []).filter((s) => s.active !== false));
      }
    } catch (err) {
      console.error("Landing load error:", err);
      setLoadError("failed");
    } finally {
      setLoading(false);
    }
  };

  const pc = settings?.primary_color || "#4A2E5A";
  const businessName = settings?.business_name || tenant?.name || "";
  const therapistName = settings?.therapist_name || "";
  const bgSoft = lighten(pc, 0.92);
  const bgSoft2 = lighten(pc, 0.85);
  // /book reads ?t=<tenant uuid> (app/book/page.jsx line 79). This was
  // ?biz=<slug>, which /book does not read at all: it found no tenant and
  // showed its "link is not valid" screen. The primary call to action on every
  // landing page - the button that turns a visitor into a booking - went
  // nowhere. The id comes from the RPC above.
  const bookUrl = tenant?.id ? `/book?t=${encodeURIComponent(tenant.id)}` : "/book";

  // === LOADING ===
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Heebo',sans-serif", background: "var(--pc-tint, #EDE7F0)", fontSize: 18, color: "#4A2E5A" }}>
        טוען... 💗
      </div>
    );
  }

  // === NOT FOUND ===
  // Could not load. Deliberately NOT the "page does not exist" screen: telling
  // a prospective client that a real business is not there is the worst
  // possible answer to a dropped request.
  if (loadError === "failed") {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Heebo',sans-serif", background: "var(--brand-cream, #FEFAF7)", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--ink, #2A2233)", marginBottom: 8 }}>לא הצלחנו לטעון את הדף</h1>
        <p style={{ fontSize: 14, color: "var(--brand-muted, #98879B)", marginBottom: 20, maxWidth: 320, lineHeight: 1.7 }}>
          העסק קיים, פשוט לא הצלחנו להביא את הפרטים כרגע. אפשר לנסות שוב.
        </p>
        <button
          type="button"
          onClick={() => loadData()}
          style={{ padding: "12px 30px", borderRadius: 999, border: "none", background: "var(--ink, #2A2233)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          נסי שוב
        </button>
      </div>
    );
  }

  if (loadError === "notfound") {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "'Heebo',sans-serif", background: "var(--brand-cream, #FEFAF7)", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🤔</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--ink, #2A2233)", marginBottom: 8 }}>הדף לא נמצא</h1>
        <p style={{ fontSize: 14, color: "var(--brand-muted, #98879B)" }}>הכתובת שחיפשת לא קיימת. בדקי שהקישור נכון.</p>
      </div>
    );
  }

  // === MAIN LANDING ===
  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo','Assistant',sans-serif", background: `linear-gradient(165deg, ${bgSoft} 0%, ${bgSoft2} 100%)`, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        .ld-in { animation: ldIn 0.5s ease-out; }
        @keyframes ldIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ld-svc { transition: transform 0.15s, box-shadow 0.15s; }
        .ld-svc:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
        .ld-cta { transition: transform 0.15s; }
        .ld-cta:active { transform: scale(0.97); }
      `}</style>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 20px 50px" }}>

        {/* HERO */}
        <div className="ld-in" style={{ textAlign: "center", padding: "50px 0 30px" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: pc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: `0 8px 28px ${pc}55`, color: "var(--brand-surface, #FAF6FC)", fontWeight: 800 }}>
            {businessName ? businessName[0] : "💗"}
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: pc, marginBottom: 6 }}>{businessName}</h1>
          {therapistName && <p style={{ fontSize: 15, color: "var(--ink, #2A2233)", fontWeight: 500 }}>{therapistName}</p>}
        </div>

        {/* BOOK CTA (top) */}
        <a href={bookUrl} className="ld-cta" style={{ display: "block", textDecoration: "none", textAlign: "center", background: pc, color: "var(--brand-surface, #FAF6FC)", padding: "16px 0", borderRadius: 16, fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55`, marginBottom: 30 }}>
          ✨ לקביעת תור
        </a>

        {/* SERVICES */}
        {/* The list could not be read. Saying so is the honest answer; an empty
            section reads as "this clinic offers nothing". */}
        {servicesFailed && services.length === 0 && (
          <div className="ld-in" style={{ textAlign: "center", padding: "10px 14px", marginBottom: 14, borderRadius: 12, background: "rgba(255,255,255,0.6)" }}>
            <p style={{ fontSize: 13, color: "var(--brand-muted, #98879B)", lineHeight: 1.7 }}>
              לא הצלחנו לטעון את רשימת הטיפולים כרגע. אפשר לקבוע תור והעסק יחזור אלייך עם הפרטים.
            </p>
          </div>
        )}
        {services.length > 0 && (
          <div className="ld-in">
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--ink, #2A2233)", marginBottom: 14, textAlign: "center" }}>הטיפולים שלנו</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {services.map((s, i) => (
                <div key={i} className="ld-svc" style={{ background: "var(--brand-surface, #FAF6FC)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color || pc, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink, #2A2233)" }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: "var(--brand-muted, #98879B)" }}>{s.duration || 60} דקות</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: pc }}>₪{s.price}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOOK CTA (bottom) */}
        <a href={bookUrl} className="ld-cta" style={{ display: "block", textDecoration: "none", textAlign: "center", background: pc, color: "var(--brand-surface, #FAF6FC)", padding: "16px 0", borderRadius: 16, fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55`, marginTop: 30 }}>
          ✨ קבעי תור עכשיו
        </a>

      </div>

      {/* FOOTER */}
      <div style={{ marginTop: "auto", padding: "20px 0 24px", fontSize: 11, color: "var(--brand-muted, #98879B)" }}>
        מופעל ע"י BloomOS 💎
      </div>
    </div>
  );
}

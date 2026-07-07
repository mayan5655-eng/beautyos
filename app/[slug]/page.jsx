"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../supabase"; 

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
    return "#FFF0F6";
  }
}

export default function LandingPage() {
  const params = useParams();
  const slug = params?.slug;

  const [tenant, setTenant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (slug) loadData();
  }, [slug]);

  const loadData = async () => {
    try {
      // 1. Find the tenant by slug
      const { data: tenantData, error: tenantErr } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .single();

      if (tenantErr || !tenantData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTenant(tenantData);

      // 2. Load this tenant's settings + services in parallel
      const [settingsRes, servicesRes] = await Promise.all([
        supabase.from("settings").select("*").eq("tenant_id", tenantData.id),
        supabase.from("service_prices").select("*").eq("tenant_id", tenantData.id),
      ]);

      if (settingsRes.data && settingsRes.data.length > 0) setSettings(settingsRes.data[0]);
      if (servicesRes.data) setServices(servicesRes.data.filter((s) => s.active !== false));
    } catch (err) {
      console.error("Landing load error:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const pc = settings?.primary_color || "#E91E63";
  const businessName = settings?.business_name || tenant?.name || "";
  const therapistName = settings?.therapist_name || "";
  const bgSoft = lighten(pc, 0.92);
  const bgSoft2 = lighten(pc, 0.85);
  const bookUrl = `/book?biz=${slug}`;

  // === LOADING ===
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "#FFF0F6", fontSize: 18, color: "#E91E63" }}>
        טוען... 💗
      </div>
    );
  }

  // === NOT FOUND ===
  if (notFound) {
    return (
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Heebo',sans-serif", background: "#FAFAFA", textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🤔</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#333", marginBottom: 8 }}>הדף לא נמצא</h1>
        <p style={{ fontSize: 14, color: "#888" }}>הכתובת שחיפשת לא קיימת. בדקי שהקישור נכון.</p>
      </div>
    );
  }

  // === MAIN LANDING ===
  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo','Assistant',sans-serif", background: `linear-gradient(165deg, ${bgSoft} 0%, ${bgSoft2} 100%)`, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: pc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: `0 8px 28px ${pc}55`, color: "#fff", fontWeight: 800 }}>
            {businessName ? businessName[0] : "💗"}
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: pc, marginBottom: 6 }}>{businessName}</h1>
          {therapistName && <p style={{ fontSize: 15, color: "#666", fontWeight: 500 }}>{therapistName}</p>}
        </div>

        {/* BOOK CTA (top) */}
        <a href={bookUrl} className="ld-cta" style={{ display: "block", textDecoration: "none", textAlign: "center", background: pc, color: "#fff", padding: "16px 0", borderRadius: 16, fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55`, marginBottom: 30 }}>
          ✨ לקביעת תור
        </a>

        {/* SERVICES */}
        {services.length > 0 && (
          <div className="ld-in">
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#3A2A30", marginBottom: 14, textAlign: "center" }}>הטיפולים שלנו</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {services.map((s, i) => (
                <div key={i} className="ld-svc" style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color || pc, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "#3A2A30" }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: "#999" }}>{s.duration || 60} דקות</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: pc }}>₪{s.price}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOOK CTA (bottom) */}
        <a href={bookUrl} className="ld-cta" style={{ display: "block", textDecoration: "none", textAlign: "center", background: pc, color: "#fff", padding: "16px 0", borderRadius: 16, fontSize: 17, fontWeight: 800, boxShadow: `0 8px 22px ${pc}55`, marginTop: 30 }}>
          ✨ קבעי תור עכשיו
        </a>

      </div>

      {/* FOOTER */}
      <div style={{ marginTop: "auto", padding: "20px 0 24px", fontSize: 11, color: "#BBB" }}>
        מופעל ע"י BloomOS 💎
      </div>
    </div>
  );
}

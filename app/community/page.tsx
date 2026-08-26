"use client";

// app/community/page.tsx
// Public community feed for a tenant's clients. No login required.
// Visited via /community?t=<tenant_id> (the link the cosmetician shares).

import { useEffect, useState } from "react";

type Post = {
  id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  post_type: string | null;
  cta_label: string | null;
  created_at: string;
};

type Business = { name: string; color: string; phone: string };

function typeLabel(t: string | null) {
  if (t === "offer") return "מבצע";
  if (t === "tip") return "טיפ";
  return "עדכון";
}
function typeColor(t: string | null) {
  if (t === "offer") return "var(--pc, #4A2E5A)";
  if (t === "tip") return "var(--success, #46B37B)";
  return "var(--brand-muted, #98879B)";
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [business, setBusiness] = useState<Business>({ name: "", color: "var(--pc, #4A2E5A)", phone: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (!t) { setError("קישור לא תקין"); setLoading(false); return; }
    fetch(`/api/community?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setPosts(d.posts); setBusiness(d.business); }
        else setError("לא ניתן לטעון את הקהילה");
      })
      .catch(() => setError("לא ניתן לטעון את הקהילה"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "linear-gradient(180deg,var(--brand-cream, #FEFAF7),var(--brand-cream, #FEFAF7))", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 14px 48px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", padding: "34px 16px 22px" }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>💜</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink, #2A2233)", margin: 0 }}>
            {business.name ? `הקהילה של ${business.name}` : "מרחב הלקוחות"}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--brand-muted, #98879B)", marginTop: 6 }}>
            עדכונים, מבצעים וטיפים — במקום אחד
          </p>
        </div>

        {loading && <p style={{ textAlign: "center", color: "rgba(74,46,90,0.14)", fontSize: 13 }}>טוען...</p>}
        {error && !loading && <p style={{ textAlign: "center", color: "rgba(74,46,90,0.14)", fontSize: 13 }}>{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--brand-surface, #FAF6FC)", borderRadius: 18 }}>
            <p style={{ fontSize: 13.5, color: "var(--brand-muted, #98879B)" }}>עוד אין פוסטים — בקרוב יהיו כאן עדכונים. 💜</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {posts.map((p) => (
            <div key={p.id} style={{ background: "var(--brand-surface, #FAF6FC)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(74,46,90,0.14)", boxShadow: "0 1px 6px rgba(0,0,0,0.03)" }}>
              {p.image_url && (
                <img alt="" src={p.image_url} style={{ width: "100%", maxHeight: 320, objectFit: "cover", objectPosition: "center", display: "block" }} />
              )}
              <div style={{ padding: "15px 17px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--brand-surface, #FAF6FC)", background: typeColor(p.post_type), padding: "3px 10px", borderRadius: 20 }}>
                    {typeLabel(p.post_type)}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(74,46,90,0.14)" }}>
                    {new Date(p.created_at).toLocaleDateString("he-IL")}
                  </span>
                </div>
                {p.title && <p style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink, #2A2233)", margin: "0 0 5px" }}>{p.title}</p>}
                {p.body && <p style={{ fontSize: 13, color: "var(--ink, #2A2233)", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>}
                {p.cta_label && business.phone && (
                  <a href={`https://wa.me/972${business.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer"
                     style={{ display: "inline-block", marginTop: 12, padding: "9px 20px", background: "linear-gradient(90deg,var(--pc, #4A2E5A),var(--pc-tint, #EDE7F0))", color: "var(--brand-surface, #FAF6FC)", fontSize: 12.5, fontWeight: 600, borderRadius: 22, textDecoration: "none" }}>
                    {p.cta_label}
                  </a>
                )}
                {p.cta_label && !business.phone && (
                  <span style={{ display: "inline-block", marginTop: 12, padding: "9px 20px", background: "linear-gradient(90deg,var(--pc, #4A2E5A),var(--pc-tint, #EDE7F0))", color: "var(--brand-surface, #FAF6FC)", fontSize: 12.5, fontWeight: 600, borderRadius: 22 }}>
                    {p.cta_label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 9.5, color: "rgba(74,46,90,0.14)", marginTop: 30 }}>BloomOS 💜</p>
      </div>
    </div>
  );
}

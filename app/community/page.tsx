"use client";

// app/community/page.tsx
// Public community feed for a tenant's clients. No login required.
// Visited via /community?t=<tenant_id> (the link the cosmetician shares).

import { useEffect, useState } from "react";
import Spinner from "../Spinner";
import { ICON_HEART, ICON_QUESTION } from "@/lib/brand";
import { PublicPage, LineIcon } from "../PublicChrome";

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
  if (t === "offer") return "var(--pc, #E9A9A1)";
  if (t === "tip") return "var(--success, #46B37B)";
  return "var(--brand-muted, #7D8D87)";
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [business, setBusiness] = useState<Business>({ name: "", color: "var(--pc, #E9A9A1)", phone: "" });
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
    // Her clients read this as HER business (Stage 2 of the Kalmea rebrand:
    // not in the original audit list, found while auditing --pc usage - this
    // page never actually scoped the accent to the real tenant color before,
    // it just fell back to whatever the global default happened to be).
    <PublicPage primary={business.color} maxWidth={620}>
      <div style={{ paddingBottom: 8 }}>
        {/* Header: her name is the headline, in her colour's rule */}
        <div className="pub-biz" style={{ padding: "6px 16px 0", marginBottom: 18 }}>
          <h1 className="pub-biz-name" style={{ fontSize: 28 }}>{business.name ? `הקהילה של ${business.name}` : "מרחב הלקוחות"}</h1>
          <span className="pub-biz-rule" aria-hidden />
          <p style={{ fontSize: "var(--t-sm)", color: "var(--brand-muted, #656A56)", margin: 0 }}>עדכונים, מבצעים וטיפים — במקום אחד</p>
        </div>

        {/* These three were rgba(233,169,161,0.14) - 14% alpha, a hairline-
            border value someone reused for plain text, which made the
            loading/error caption and the post date nearly invisible. Not
            part of the rebrand; fixed while already here for the flower
            watermark below, since there is no point decorating text nobody
            could read in the first place. */}
        {loading && <p style={{ textAlign: "center", color: "var(--brand-muted, #7D8D87)", fontSize:"var(--t-md)" }}><Spinner inline label="טוען"/></p>}
        {error && !loading && (
          <div className="pub-card"><LineIcon src={ICON_QUESTION} /><p style={{ color: "var(--ink-2)", fontSize: "var(--t-lg)", margin: 0 }}>{error}</p></div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="pub-card" style={{ padding: "36px 20px" }}>
            <LineIcon src={ICON_HEART} />
            <p style={{ fontSize: "var(--t-lg)", color: "var(--ink-2)", margin: 0 }}>עוד אין פוסטים — בקרוב יהיו כאן עדכונים.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {posts.map((p) => (
            <div key={p.id} className="pub-card" style={{ borderRadius: "var(--r-card)", overflow: "hidden", padding: 0, textAlign: "start" }}>
              {p.image_url && (
                <img alt="" src={p.image_url} style={{ width: "100%", maxHeight: 320, objectFit: "cover", objectPosition: "center", display: "block" }} />
              )}
              <div style={{ padding: "15px 17px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize:"var(--t-sm)", fontWeight: 700, color: "var(--brand-surface, #FDFBF9)", background: typeColor(p.post_type), padding: "3px 10px", borderRadius:"var(--r-lg)" }}>
                    {typeLabel(p.post_type)}
                  </span>
                  <span style={{ fontSize:"var(--t-sm)", color: "var(--brand-muted, #7D8D87)" }}>
                    {new Date(p.created_at).toLocaleDateString("he-IL")}
                  </span>
                </div>
                {p.title && <p style={{ fontSize:"var(--t-lg)", fontWeight: 700, color: "var(--ink, #2A2233)", margin: "0 0 5px" }}>{p.title}</p>}
                {p.body && <p style={{ fontSize:"var(--t-md)", color: "var(--ink, #2A2233)", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>{p.body}</p>}
                {p.cta_label && business.phone && (
                  <a href={`https://wa.me/972${business.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer"
                     style={{ display: "inline-block", marginTop: 12, padding: "9px 20px", background: "linear-gradient(90deg,var(--pc, #E9A9A1),var(--pc-tint, #FDF6F6))", color: "var(--brand-surface, #FDFBF9)", fontSize:"var(--t-sm)", fontWeight: 600, borderRadius:"var(--r-lg)", textDecoration: "none" }}>
                    {p.cta_label}
                  </a>
                )}
                {/* No phone, no button. A span styled exactly like the link
                    above used to render here - a button that did nothing,
                    shipped to her clients whenever business_phone was blank. */}
              </div>
            </div>
          ))}
        </div>

      </div>
    </PublicPage>
  );
}

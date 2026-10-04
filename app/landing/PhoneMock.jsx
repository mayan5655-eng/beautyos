// app/landing/PhoneMock.jsx
//
// A phone-framed snapshot of the real היום screen - reusing the real
// pieces where they're genuinely reusable (Icon, the brand line-icons,
// the exact same card language and tokens the dashboard itself uses), not
// a from-scratch illustration. The dashboard component itself (beautyos.jsx)
// is a single ~11,000-line client component wired to a live tenant's auth
// session and Supabase data end to end - there's no version of "import it
// here" that doesn't also drag in a real login. This rebuilds its visual
// shape with sample data instead, using the SAME design tokens (--pc,
// --r-*, --shadow-*, the serif/hand fonts) so it reads as the product, not
// a mockup of it.
//
// Server component - the only piece that needs client JS is the delayed
// reveal on the "שאלה אחת" card, which is just Reveal (already a client
// component) used with an extra delay.

import Icon from "../Icon";
import { ICON_QUESTION } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import Reveal from "./Reveal";

export default function PhoneMock() {
  return (
    <div
      aria-hidden
      style={{
        width: 300,
        borderRadius: 36,
        border: "10px solid var(--ink)",
        background: "var(--ink)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      <div style={{ background: "var(--brand-cream, #F0EADE)", borderRadius: 26, overflow: "hidden" }}>
        {/* status bar */}
        <div style={{ height: 22 }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 10px" }}>
          <span style={{ fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontWeight: 700, color: "var(--brand-accent)", fontSize: 15 }}>kalmea</span>
          <Icon name="settings" size={15} style={{ color: "var(--ink-3)" }} />
        </div>

        <div style={{ padding: "0 14px 18px" }}>
          <p className="serif" style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>בוקר טוב</p>

          {/* revenue hero */}
          <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--line)", padding: "12px 14px", marginBottom: 10, boxShadow: "var(--shadow-sm)" }}>
            <p style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 2 }}>הכנסות היום</p>
            <p className="serif" style={{ fontSize: 22, fontWeight: 700, color: "var(--pc, #E9A9A1)" }}>₪890</p>
          </div>

          {/* two upcoming appointments */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {[
              { time: "10:30", name: "רונית כהן", service: "טיפול פנים" },
              { time: "12:00", name: "דנה לוי", service: "מניקור ג'ל" },
            ].map((a) => (
              <div key={a.time} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, border: "1px solid var(--line)", padding: "8px 10px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--pc, #E9A9A1)", minWidth: 32 }}>{a.time}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{a.name}</p>
                  <p style={{ fontSize: 9.5, color: "var(--ink-3)" }}>{a.service}</p>
                </div>
              </div>
            ))}
          </div>

          {/* שאלה אחת - appears a beat after the rest, as if the system just
              thought of it. Same copy voice and colour as the real card. */}
          <Reveal delay={650} style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid rgba(233,169,161,.5)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <BrandImage width={20} height={20} alt="" src={ICON_QUESTION} style={{ width: 20, height: 20, objectFit: "contain" }} />
              <span style={{ fontFamily: "var(--font-hand), cursive", fontSize: 13, color: "#C07A72" }}>שאלה אחת</span>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--ink-2)", lineHeight: 1.5 }}>התפנה תור ב-14:00 — להציע אותו בוואטסאפ ללקוחות מתאימות?</p>
          </Reveal>
        </div>

        {/* bottom nav, decorative */}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 14px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
          {["היום", "יומן", "לקוחות", "תשלום", "תוכן"].map((l, i) => (
            <span key={l} style={{ fontSize: 8.5, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? "var(--pc, #E9A9A1)" : "var(--ink-3)" }}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

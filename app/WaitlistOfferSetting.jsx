"use client";
// Settings > הודעות: the switch for the smart waitlist (lib/waitlistOffers.js) and its daily cap. Lives in automations.waitlist_offers /
// automations.waitlist_daily_cap (the settings JSON, so nothing to migrate). ON unless she turns it off (lib/waitlistFlag.js); the
// platform flag (automations.feature_flags.waitlist_offers === false) hides the whole row.
import { DEFAULT_DAILY_CAP } from "@/lib/waitlistFlag.js";

const CAPS = [3, 6, 10, 15];

export default function WaitlistOfferSetting({ autos, setAutos, pc, Row }) {
  const flags = autos && typeof autos.feature_flags === "object" && autos.feature_flags ? autos.feature_flags : {};
  if (flags.waitlist_offers === false) return null;
  const on = autos.waitlist_offers !== false;
  const cap = CAPS.includes(Number(autos.waitlist_daily_cap)) ? Number(autos.waitlist_daily_cap) : DEFAULT_DAILY_CAP;
  return (
    <div data-testid="waitlist-offer-setting">
      <Row pc={pc} label="הצעה אוטומטית לרשימת ההמתנה" on={on} onChange={() => setAutos({ ...autos, waitlist_offers: !on })}
        desc="כשתור מתבטל (על ידך, על ידי הלקוחה, או כשפיקדון לא שולם בזמן), מי שברשימת ההמתנה והתור מתאים לה (אותו טיפול או טיפול קצר יותר שנכנס בזמן, היום והשעות שבחרה) מקבלת הצעה אחת בוואטסאפ עם קישור, והראשונה שלוחצת מקבלת את התור. השאר מקבלות הודעה עדינה שהוא נתפס, ואת רואה שורה אחת מה קרה. לא יוצא בשבת ובלילה, ומי שביקשה הסרה לא מקבלת. אם השליחה האוטומטית לא פעילה, ההצעות מחכות ב&quot;הודעות מוכנות לשליחה&quot;. פעיל כברירת מחדל, ואפשר לכבות." />
      {on && (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, fontSize: "var(--t-sm)", color: "var(--ink)" }}>
          <span>תקרה יומית להצעות</span>
          <select data-testid="waitlist-cap" value={cap} onChange={(e) => setAutos({ ...autos, waitlist_daily_cap: Number(e.target.value) })}
            style={{ minHeight: 44, fontSize: 16, fontFamily: "inherit", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "0 10px", background: "var(--surface-2)", color: "var(--ink)" }}>
            {CAPS.map((n) => <option key={n} value={n}>{n} ביום</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

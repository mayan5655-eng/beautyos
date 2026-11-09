"use client";
// Settings > הודעות: the switch for the smart waitlist (lib/waitlistOffers.js) and its daily cap. Lives in automations.waitlist_offers /
// automations.waitlist_daily_cap (the settings JSON, so nothing to migrate). Off unless she turns it on (lib/waitlistFlag.js); the
// platform flag (automations.feature_flags.waitlist_offers === false) hides the whole row.
import { DEFAULT_DAILY_CAP } from "@/lib/waitlistFlag.js";
import { useDeployFlags } from "./useDeployFlags";

// While the central number does not send by itself (today), the copy says what happens: the offer is prepared and she sends it with a
// tap. It never promises an automatic message that will not go out (2026-11-09 owner rule). With automatic sending on: unchanged.
export const WAITLIST_LABEL = { auto: "הצעה אוטומטית לרשימת ההמתנה", manual: "הצעה לרשימת ההמתנה כשתור מתבטל" };
export const WAITLIST_DESC = {
  auto: "כשתור מתבטל (על ידך, על ידי הלקוחה, או כשפיקדון לא שולם בזמן), מי שברשימת ההמתנה והתור מתאים לה (אותו טיפול או טיפול קצר יותר שנכנס בזמן, היום והשעות שבחרה) מקבלת הצעה אחת בוואטסאפ עם קישור, והראשונה שלוחצת מקבלת את התור. השאר מקבלות הודעה עדינה שהוא נתפס, ואת רואה שורה אחת מה קרה. לא יוצא בשבת ובלילה, ומי שביקשה הסרה לא מקבלת. אם השליחה האוטומטית לא פעילה, ההצעות מחכות ב\"הודעות מוכנות לשליחה\". כבוי כברירת מחדל.",
  manual: "כשתור מתבטל (על ידך, על ידי הלקוחה, או כשפיקדון לא שולם בזמן), מוכנה לך ב\"הודעות מוכנות לשליחה\" הצעה עם קישור לכל מי שברשימת ההמתנה והתור מתאים לה (אותו טיפול או טיפול קצר יותר שנכנס בזמן, היום והשעות שבחרה). את שולחת כל הצעה בלחיצה מהוואטסאפ שלך, והראשונה שלוחצת על הקישור מקבלת את התור. לא בשבת ובלילה, ומי שביקשה הסרה לא מקבלת. כבוי כברירת מחדל.",
};

const CAPS = [3, 6, 10, 15];

export default function WaitlistOfferSetting({ autos, setAutos, pc, Row }) {
  const { autoSend } = useDeployFlags();
  const mode = autoSend ? "auto" : "manual";
  const flags = autos && typeof autos.feature_flags === "object" && autos.feature_flags ? autos.feature_flags : {};
  if (flags.waitlist_offers === false) return null;
  const on = autos.waitlist_offers === true;
  const cap = CAPS.includes(Number(autos.waitlist_daily_cap)) ? Number(autos.waitlist_daily_cap) : DEFAULT_DAILY_CAP;
  return (
    <div data-testid="waitlist-offer-setting">
      <Row pc={pc} label={WAITLIST_LABEL[mode]} on={on} onChange={() => setAutos({ ...autos, waitlist_offers: !on })}
        desc={WAITLIST_DESC[mode]} />
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

// app/tutorials/page.tsx
// The tutorial videos for a new cosmetician: the link in the WhatsApp welcome message (OWNER_WELCOME_TUTORIALS_URL).
// Server component, no session: any top-level single segment is public (lib/supabase/middleware.ts). "tutorials" is a
// reserved slug (lib/slug.ts + supabase/migrations/add_reserved_slug_tutorials.sql), so no business page sits under it.
//
// Grouped by topic (2026-11-04), so she finds the one she needs now instead of scrolling through every video. Where each comes from:
//   tour, booking            recorded from the demo tenant by marketing/tutorials.mjs
//   welcome                  marketing/welcome-motion.mjs
//   home                     marketing/home-icon-motion.mjs
//   morning                  marketing/morning-motion.mjs
//   appointment-actions, clients, till, reminders, my-page, services-hours, ai, skin-scan
//                            marketing/topics-motion.mjs (drawn screens, every label copied from the app's code;
//                            skin-scan is its "skin" mode, published as kalmea-skin-scan.mp4)
//   help-chat, waitlist-rebook, forms, loyalty, client-page, grow-connect, grow-till, pay-page, deposits, grow-refunds,
//   gift-vouchers, products, reviews, booking-button, referral, monthly
//                            marketing/topics-motion.mjs section 9 (2026-11-09, features frozen: one video per feature)
// A video of a feature the deployment switches on as a whole (card clearing through Grow, the referral and annual plan) is hidden
// while that switch is off (lib/helpSections.ts TUTORIAL_FLAG, lib/tutorialFlags.ts). Hidden, not deleted.
// To update one, re-run its script and copy the file over public/tutorials/kalmea-<id>.mp4 (and its poster .jpg). preload="none":
// nothing is downloaded until she presses play, which is why these clips have their own size limit in test-asset-budget.ts.
//
// Owner, 2026-11-01: no AI figures. The last seconds of the older files were covered with the Kalmea flower, because the scripts
// there still draw the AI presenter on their end cards: a new render must drop it (marketing/motion-lib.mjs endCard,
// marketing/tutorials.mjs). The topic videos end on the flower card already.

import PublicAnalytics from "../PublicAnalytics";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, BRAND_WASH_SOFT } from "@/lib/brand";
import PublicFooterLinks from "../PublicFooterLinks";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import { tutorialOn } from "@/lib/helpSections";
import { tutorialFlagsOn } from "@/lib/tutorialFlags";

export const metadata: Metadata = {
  title: "סרטוני הדרכה · Kalmea",
  description: "סרטוני הדרכה קצרים לקלמיה, לפי נושא: איך מתחילים, היומן והתורים, הלקוחות, הקופה והתשלומים, שיווק וצמיחה, ודוחות.",
  robots: { index: false },
};

type Video = { id: string; title: string; sub: string; steps?: readonly string[] };
type Topic = { key: string; title: string; videos: readonly Video[] };

// In the order she meets things (owner, 2026-11-09): getting started, the calendar, clients, the till and payments with card clearing,
// marketing and growth, reports. "steps": the same thing in three short lines under the video, for reading without sound and for
// explaining it to someone else. Titles are the same as lib/helpSections.ts TUTORIAL_TITLES (a test keeps them in step).
const TOPICS: readonly Topic[] = [
  {
    key: "start",
    title: "להתחיל",
    videos: [
      { id: "welcome", title: "מה מיוחד בקלמיה", sub: "כל מה שקלמיה עושה בשבילך, בדקה אחת" },
      { id: "tour", title: "סיור בכל המסכים", sub: "היומן, הלקוחות, התשלומים, התוכן וההגדרות" },
      { id: "home", title: "קלמיה על מסך הבית", sub: "איך מוסיפים אותה לטלפון, באייפון ובאנדרואיד" },
      { id: "services-hours", title: "טיפולים ושעות פעילות", sub: "מחיר ומשך לכל טיפול, והימים והשעות שאת עובדת", steps: ["הגדרות ← יומן ושירותים", "בוחרים מרשימת טיפולים מוכנה, ומתקנים מחיר ומשך", "מסמנים ימים ושעות, ולוחצים ״שמירה ✓״"] },
      { id: "my-page", title: "הדף שלך ללקוחות", sub: "מעתיקים את הקישור לאינסטגרם ולוואטסאפ, ומה הלקוחה רואה כשהיא קובעת", steps: ["הגדרות ← הדף שלי ← ״הקישורים שלך״", "מעתיקים את הקישור למקום שבו תדביקי אותו", "הלקוחה בוחרת טיפול, יום ושעה, והתור נכנס ליומן"] },
      { id: "help-chat", title: "שאלי את העוזרת", sub: "נתקעת? שואלים במילים שלך ומקבלים תשובה מיד, לרוב עם סרטון", steps: ["לוחצים ״תקועה?״ למטה במסך", "כותבים מה רוצים לעשות, ולוחצים ״שאלי״", "״▶ סרטון״ מראה איך. לא עזר? השאלה עוברת אלינו"] },
    ],
  },
  {
    key: "calendar",
    title: "יומן ותורים",
    videos: [
      { id: "booking", title: "איך קובעים תור", sub: "ביומן שלך, ואיך הלקוחה קובעת לבד בדף שלך", steps: ["״✦ תור חדש״, או לחיצה על משבצת ריקה ביומן", "בוחרים לקוחה, טיפול, יום ושעה, ושומרים", "תור שלקוחה קבעה בדף שלך נכנס ליומן לבד"] },
      { id: "appointment-actions", title: "מה עושים עם תור", sub: "פותחים תור מ״היום שלי״: תשלום, תזכורת, כרטיס הלקוחה או ביטול", steps: ["לוחצים על תור ב״היום שלי״ או ביומן", "למעלה: ₪ לתשלום, תזכורת, כרטיס לקוחה או ביטול", "תור שבוטל נשאר ביומן, ויש ״החזרה״"] },
      { id: "reminders", title: "תזכורות לתורים", sub: "את שולחת כל תזכורת בלחיצה מהוואטסאפ שלך, והלקוחה מאשרת או מבטלת מהקישור", steps: ["במסך ״היום״: ״הודעות מוכנות לשליחה״", "״שליחה״ פותח את הוואטסאפ עם ההודעה כתובה", "הלקוחה מאשרת או מבטלת, והיומן מתעדכן לבד"] },
      { id: "waitlist-rebook", title: "רשימת המתנה ותור הבא", sub: "תור שהתבטל מוצע למי שמחכה, ולקוחה בלי תור הבא מקבלת תזכורת חמה. שתיהן מופעלות רק אם תרצי", steps: ["מפעילים בהגדרות ← הודעות", "לקוחה בלי שעה מתאימה נרשמת לרשימת ההמתנה בדף שלך", "״↻ קבעי לה שוב״ קובע את התור הבא לפי הקצב שלה"] },
    ],
  },
  {
    key: "clients",
    title: "לקוחות",
    videos: [
      { id: "clients", title: "הוספת לקוחות", sub: "לקוחה אחת ביד, או כל הרשימה בבת אחת, ומה יש בכרטיס שלה", steps: ["לקוחות ← ״✦ לקוחה חדשה״, או ייבוא כל הרשימה", "בייבוא מדביקים מאקסל או מאנשי הקשר", "לחיצה על לקוחה פותחת את הכרטיס שלה"] },
      { id: "forms", title: "טופס אנמנזה וחתימה", sub: "הלקוחה ממלאת וחותמת מהטלפון, ואת רואה את התשובות בכרטיס שלה", steps: ["כרטיס הלקוחה ← ״טפסים״ ← בוחרים טופס", "הקישור מועתק. מדביקים אותו לה בוואטסאפ", "אחרי החתימה: ״צפייה בתשובות״, והחשוב מסומן"] },
      { id: "skin-scan", title: "סריקת עור AI", sub: "הלקוחה מצלמת את הפנים מהקישור שלך, ומקבלת דוח עור והמלצה לטיפול מהשירותים שלך. הכוונה קוסמטית, לא אבחון", steps: ["שולחים לה את קישור הסורק, או סורקים מכרטיס הלקוחה", "היא מצלמת ומקבלת דוח עור והמלצה מהשירותים שלך", "הסריקה נשמרת בכרטיס שלה"] },
      { id: "loyalty", title: "כרטיסיית נאמנות", sub: "כל כמה ביקורים מגיעה ללקוחה מתנה. הביקורים נספרים לבד מהתשלומים", steps: ["הגדרות ← לקוחות ופניות ← כרטיסיית נאמנות", "בוחרים כל כמה ביקורים, ומה המתנה", "בקופה מופיע 🎁 כשמגיעה לה מתנה"] },
      { id: "client-page", title: "הדף האישי של הלקוחה", sub: "דף פרטי שרק היא רואה: לפני ואחרי, ההמלצות שלך, וכפתור לתור הבא", steps: ["כרטיס הלקוחה ← ״✦ שליחת הדף שלה״", "כותבים את ההמלצות שלך, ו״יצירת הקישור״", "שולחים לה מהוואטסאפ שלך, ורואים אם פתחה"] },
    ],
  },
  {
    key: "payments",
    title: "קופה ותשלומים",
    videos: [
      { id: "till", title: "תשלום בקופה", sub: "לקוחה וטיפול, הנחה או טיפ, איך שילמה, ואישור התשלום", steps: ["״תשלום״ ← ״✦ תשלום חדש״, או ״₪ לתשלום״ מתוך התור", "בוחרים לקוחה וטיפול, ואיך שילמה", "״רשמי תשלום ✓״, ואישור התשלום מוכן לשליחה"] },
      { id: "grow-connect", title: "חיבור סליקת אשראי (Grow)", sub: "פותחים חשבון ב-Grow או מחברים חשבון קיים, ומקבלות תשלום באשראי, בביט ובארנקים דיגיטליים", steps: ["הגדרות ← חיבורים ← סליקת אשראי (Grow)", "אין לך Grow? בוחרים מסלול וממלאים את הטופס מה-SMS", "יש לך? מדביקים את קוד העסק שמגיע מ-Grow"] },
      { id: "grow-till", title: "תשלום באשראי מהקופה ובקישור", sub: "הלקוחה משלמת מהטלפון שלה, והתשלום נרשם בקופה לבד", steps: ["בקופה: ״בקשת תשלום״ בתיבה של Grow", "שולחים בוואטסאפ, או שהיא סורקת את הקוד", "לא לוחצים ״רשמי תשלום״: האישור נרשם לבד"] },
      { id: "pay-page", title: "דף התשלום של הלקוחה", sub: "מה הלקוחה רואה כשהיא פותחת את קישור התשלום, וגם כשהוא נפתח בתוך וואטסאפ", steps: ["היא מסמנת שקראה את התנאים ולוחצת ״לתשלום״", "משלמת בכרטיס, בביט, ב-Apple Pay או ב-Google Pay", "נפתח בוואטסאפ ולא עובד? הדף מסביר לפתוח בדפדפן"] },
      { id: "deposits", title: "מקדמה בקביעת תור", sub: "הלקוחה משלמת מקדמה כשהיא קובעת, והמקדמה יורדת בקופה ביום הטיפול", steps: ["הגדרות ← תשלומים ← מדיניות ביטולים", "בוחרים ״מקדמה בקביעת התור״ ומסמנים ״דורש מקדמה״ בטיפולים", "התור נשמר לה 30 דקות עד התשלום"] },
      { id: "grow-refunds", title: "ביטול תשלום והחזר כסף", sub: "מבטלים תשלום שעבר ב-Grow, והכסף חוזר ללקוחה. בהיסטוריה רואים מה קרה", steps: ["בקופה פותחים את התשלום ← ״ביטול התשלום״", "כותבים סיבה. ״גם להחזיר את הכסף ללקוחה ב-Grow״ מסומן", "ההחזר נכשל? ״לנסות שוב להחזיר ב-Grow״"] },
      { id: "gift-vouchers", title: "שוברי מתנה", sub: "לקוחות קונות שובר בדף שלך או בקופה, ומממשים אותו אצלך", steps: ["השוברים כבר פועלים. משנים בהגדרות ← העסק שלי", "בדף שלך יש ״שובר מתנה״, והקונה שולחת אותו בעצמה", "בקופה מקלידים את הקוד, והסכום יורד מהתשלום"] },
      { id: "products", title: "מוצרים ומלאי בקופה", sub: "מוכרים מוצר ליד הטיפול, והמלאי מתעדכן לבד", steps: ["קופה ← ״מוצרים״ ← מוסיפים מוצר ומלאי", "בתשלום: ״+ הוסיפי מוצר״ ליד הטיפול", "הגיע משלוח? ״עדכון מלאי״ עם סיבה"] },
      { id: "morning", title: "קבלות חוקיות ממורנינג", sub: "מחברים את חשבון מורנינג פעם אחת, וכל תשלום בקופה מקבל קבלה", steps: ["הגדרות ← חיבורים ← מורנינג", "מדביקים את המפתחות מחשבון מורנינג שלך", "מעכשיו כל תשלום בקופה מקבל קבלה חוקית"] },
    ],
  },
  {
    key: "marketing",
    title: "שיווק וצמיחה",
    videos: [
      { id: "ai", title: "היועצת, הפוסטים והרילסים", sub: "שואלים את היועצת העסקית, ומקבלים פוסט, רעיונות לצילום ותסריט לרילס. את מאשרת כל דבר לפני שמפרסמים", steps: ["״יועץ AI״: שואלים שאלה על העסק שלך", "תוכן ← ״עם AI״: פוסט, רעיונות לצילום ותסריט לרילס", "את מאשרת ומפרסמת בעצמך"] },
      { id: "reviews", title: "ביקורות ומה הלקוחות אמרו", sub: "אחרי טיפול: ״איך היה?״. מי שנהנתה מוזמנת לגוגל, ומי שמשהו הפריע לה כותבת לך בפרטיות", steps: ["הבקשה מוכנה לך בהודעות לשליחה אחרי הטיפול", "הלקוחה עונה ״היה מעולה״ או ״משהו היה פחות טוב״", "ב״מה הלקוחות אמרו״ רואים מספרים והערות פרטיות"] },
      { id: "booking-button", title: "כפתור קביעת תור באינסטגרם ובגוגל", sub: "הקישור שלך בביו, בפרופיל העסקי בגוגל, בפייסבוק ובוואטסאפ ביזנס", steps: ["הגדרות ← הדף שלי ← כפתור קביעת תור", "פותחים מקום, קוראים את השלבים ומעתיקים את הקישור", "מדביקים, ומסמנים ״סימנתי שעשיתי״"] },
      { id: "referral", title: "חודש במתנה ומנוי שנתי", sub: "ממליצה על קלמיה לבעלת עסק, ושתיכן מקבלות חודש מנוי. ומנוי שנתי עם חודשיים במתנה", steps: ["הגדרות ← העסק שלי ← חברה מביאה חברה", "שולחים לה את הקישור האישי מהוואטסאפ שלך", "במנוי: ״שנתי״, והמעבר בתוקף בחידוש הבא"] },
    ],
  },
  {
    key: "reports",
    title: "דוחות",
    videos: [
      { id: "monthly", title: "הדוח החודשי והסיכום השבועי", sub: "כמה הכנסת, מי חזרה ומי לא, ומה כדאי לעשות השבוע", steps: ["בתחילת החודש: סיכום קצר במסך ״היום״", "״לדוח החודשי המלא״: הכנסות, טיפולים ומי לא חזרה", "בכל יום ראשון: הסיכום השבועי עם מה לעשות"] },
    ],
  },
];

export default function TutorialsPage() {
  const wa = supportWhatsAppUrl("היי, יש לי שאלה על קלמיה");
  const on = tutorialFlagsOn();
  const topics = TOPICS.map((g) => ({ ...g, videos: g.videos.filter((v) => tutorialOn(v.id, on)) })).filter((g) => g.videos.length > 0);
  return (
    <div dir="rtl" style={pageStyle}>
      <PublicAnalytics />
      <article style={cardStyle}>
        <header style={{ marginBottom: 6 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>ברוכה הבאה לקלמיה</h1>
          <p style={leadStyle}>סרטונים קצרים לפי נושא, כדי שתמצאי מהר את מה שצריך לך עכשיו.</p>
          <nav aria-label="נושאים" style={navStyle}>
            {topics.map((g) => (
              <a key={g.key} href={`#topic-${g.key}`} style={chipStyle}>{g.title}</a>
            ))}
          </nav>
        </header>

        {topics.map((g) => (
          <section key={g.key} id={`topic-${g.key}`} style={topicStyle} aria-labelledby={`topic-${g.key}-h`}>
            <h2 id={`topic-${g.key}-h`} style={topicTitleStyle}>{g.title}</h2>
            {g.videos.map((t, i) => (
              <div key={t.id} style={i === 0 ? videoBlockFirst : videoBlock}>
                <h3 id={`t-${t.id}`} style={h3Style}>{t.title}</h3>
                <p style={subStyle}>{t.sub}</p>
                {t.steps && (
                  <ol style={stepsStyle} aria-label={`בקיצור: ${t.title}`}>
                    {t.steps.map((st) => <li key={st} style={stepStyle}>{st}</li>)}
                  </ol>
                )}
                <video
                  src={`/tutorials/kalmea-${t.id}.mp4`}
                  poster={`/tutorials/kalmea-${t.id}.jpg`}
                  controls
                  playsInline
                  preload="none"
                  style={videoStyle}
                  aria-labelledby={`t-${t.id}`}
                />
              </div>
            ))}
          </section>
        ))}

        <section style={topicStyle}>
          <h2 style={topicTitleStyle}>יש שאלה?</h2>
          <p style={subStyle}>
            אנחנו כאן בוואטסאפ (הודעות בלבד):{" "}
            {wa
              ? <a href={wa} target="_blank" rel="noopener noreferrer" style={linkStyle} dir="ltr">{KALMEA_SUPPORT_WHATSAPP_DISPLAY}</a>
              : <span dir="ltr">{KALMEA_SUPPORT_WHATSAPP_DISPLAY}</span>}
          </p>
        </section>
        <PublicFooterLinks style={{ padding: "18px 0 0" }} />
      </article>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh", background: BRAND_WASH_SOFT, padding: "32px 16px", display: "flex", justifyContent: "center",
  fontFamily: "var(--font-heebo), 'Heebo', 'Assistant', sans-serif", color: DEEP,
};
const cardStyle: CSSProperties = {
  width: "100%", maxWidth: 520, background: SURFACE, borderRadius: "var(--r-lg)", padding: "30px 22px",
  border: `1px solid ${ACCENT_LINE}`, boxShadow: "var(--shadow-accent)", boxSizing: "border-box", alignSelf: "flex-start",
};
const brandStyle: CSSProperties = { fontSize: "var(--t-xs)", fontWeight: 600, letterSpacing: 2, color: MUTED, marginBottom: 8 };
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-hero)", fontWeight: 600, color: DEEP, lineHeight: 1.2, marginBottom: 6,
};
const leadStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.7, color: DEEP, margin: 0 };
// The topics as a row of links to their sections: on a phone the page is long, and this is the way straight to the one she needs.
const navStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 };
const chipStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", borderRadius: "var(--r-full)",
  border: `1px solid ${ACCENT_LINE}`, color: DEEP, fontSize: "var(--t-sm)", fontWeight: 600, textDecoration: "none", background: BRAND_WASH_SOFT,
};
const topicStyle: CSSProperties = { paddingTop: 22, marginTop: 24, borderTop: `1px solid ${ACCENT_LINE}`, scrollMarginTop: 16 };
const topicTitleStyle: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-2xl)", fontWeight: 700, color: DEEP, marginBottom: 4,
};
const videoBlockFirst: CSSProperties = { paddingTop: 10 };
const videoBlock: CSSProperties = { paddingTop: 22 };
const h3Style: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-xl)", fontWeight: 600, color: DEEP, marginBottom: 4,
};
const subStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.7, color: DEEP, marginBottom: 12 };
// The three steps under a video: numbered by the list itself (decimal, on the reading side), on a soft wash so they read as one block.
const stepsStyle: CSSProperties = {
  margin: "0 0 12px", padding: "10px 14px", paddingInlineStart: 30, background: BRAND_WASH_SOFT, borderRadius: "var(--r-md)",
  border: `1px solid ${ACCENT_LINE}`, listStyle: "decimal", color: DEEP,
};
const stepStyle: CSSProperties = { fontSize: "var(--t-sm)", lineHeight: 1.7, overflowWrap: "anywhere" };
const videoStyle: CSSProperties = {
  display: "block", width: "100%", maxWidth: 360, aspectRatio: "9 / 16", margin: "0 auto", borderRadius: "var(--r-md)",
  background: "#1F3A30", border: `1px solid ${ACCENT_LINE}`,
};
const linkStyle: CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: "underline" };

// lib/helpSections.ts
//
// The in-app help text, and the nail-technician variant of it. Moved out of app/beautyos.jsx with no change to the text or to how it is
// used (2026-10-18). Plain data and one pure function, so it can be tested without rendering the dashboard.

// videos: ids of the tutorial videos on /tutorials (public/tutorials/kalmea-<id>.mp4) that show this section, each opened at its
// own heading (#t-<id>). The help page shows them as "▶" links under the text (2026-11-04: written help and videos together).
import { growCostLineHe, growCostDetailsHe } from "./growPricing.ts";

// gate: the section is shown only while at least one of these is on (lib/helpVisibility.ts computes them, 2026-11-09 owner rule:
// nothing that is not active may be shown, help text included).
export type HelpSection = { key: string; icon: string; title: string; body: string[]; videos?: string[]; gate?: HelpGate[] }

/** The video titles shown on the help page's links. Same ids and titles as app/tutorials/page.tsx (a test keeps them in step). */
export const TUTORIAL_TITLES: Record<string, string> = {
  welcome: "מה מיוחד בקלמיה",
  tour: "סיור בכל המסכים",
  home: "קלמיה על מסך הבית",
  booking: "איך קובעים תור",
  "appointment-actions": "מה עושים עם תור",
  reminders: "תזכורות לתורים",
  clients: "הוספת לקוחות",
  till: "תשלום בקופה",
  morning: "קבלות חוקיות ממורנינג",
  ai: "היועצת, הפוסטים והרילסים",
  "skin-scan": "סריקת עור AI",
  "my-page": "הדף שלך ללקוחות",
  "services-hours": "טיפולים ושעות פעילות",
  // 2026-11-09, features frozen: one video for every feature added since (marketing/topics-motion.mjs section 9).
  "help-chat": "שאלי את העוזרת",
  "waitlist-rebook": "רשימת המתנה ותור הבא",
  forms: "טופס אנמנזה וחתימה",
  loyalty: "כרטיסיית נאמנות",
  "client-page": "הדף האישי של הלקוחה",
  "grow-connect": "חיבור סליקת אשראי (Grow)",
  "grow-till": "תשלום באשראי מהקופה ובקישור",
  "pay-page": "דף התשלום של הלקוחה",
  deposits: "מקדמה בקביעת תור",
  "grow-refunds": "ביטול תשלום והחזר כסף",
  "gift-vouchers": "שוברי מתנה",
  products: "מוצרים ומלאי בקופה",
  reviews: "ביקורות ומה הלקוחות אמרו",
  "booking-button": "כפתור קביעת תור באינסטגרם ובגוגל",
  referral: "חודש במתנה ומנוי שנתי",
  monthly: "הדוח החודשי והסיכום השבועי",
};
export const tutorialHref = (id: string) => `/tutorials#t-${id}`;

/** The deployment switch a video's feature lives behind (lib/tutorialFlags.ts reads them). A video with none is always shown. */
export type TutorialFlag = "grow" | "referral";
export const TUTORIAL_FLAG: Record<string, TutorialFlag> = {
  "grow-connect": "grow",
  "grow-till": "grow",
  "pay-page": "grow",
  deposits: "grow",
  "grow-refunds": "grow",
  referral: "referral",
};
/** Is this video's feature switched on? `on` omitted: every video counts as on (only the tests and legacy callers omit it). */
export const tutorialOn = (id: string, on?: Partial<Record<TutorialFlag, boolean>>): boolean =>
  !on || !TUTORIAL_FLAG[id] || on[TUTORIAL_FLAG[id]] === true;

// ── What can hide a piece of help (2026-11-09 owner rule) ─────────────────────
// Nothing that is not active may be shown: not a button, not a card, and not a line of help that explains it. Each gate is one
// switch, computed by lib/helpVisibility.ts helpGatesFor() from her settings row and the deployment's switches (the browser reads
// the server-only ones from /api/feature-visibility). HIDDEN, NOT DELETED: the text stays here and comes back with its switch.
//   deployment, ON ONLY WHEN TRUE (a missing value is off):
//     grow           GROW_UI_ENABLED (and GROW_ALLOWED_TENANTS) for her business
//     referral       the video "חודש במתנה ומנוי שנתי": NEXT_PUBLIC_REFERRALS or the yearly plan
//     bizReferral    "חברה מביאה חברה" (NEXT_PUBLIC_REFERRALS)
//     annual         the yearly plan in "המנוי שלך" (NEXT_PUBLIC_ANNUAL_PLAN with BILLING_UI_ENABLED)
//     autoSend       the central number sends WhatsApp messages by itself (platform_settings.whatsapp_auto_utility_enabled).
//                    Off, which is the case today: every message waits for her tap, and the text says exactly that.
//     voucherOnline  gift vouchers bought online (needs Grow)
//     bot            the WhatsApp bot connected to her business (settings.green_api_instance)
//   her business, ON UNLESS EXPLICITLY FALSE (the platform and tab switches, all of them default on):
//     waitlist, rebook, vouchers, products, reviews, monthly, skinScan, leads, advisor, packages, reelTemplates
export type HelpGate = TutorialFlag | "bizReferral" | "annual" | "autoSend" | "voucherOnline" | "bot"
  | "waitlist" | "rebook" | "vouchers" | "products" | "reviews" | "monthly" | "skinScan" | "leads" | "advisor" | "packages" | "reelTemplates";
export type HelpOn = Partial<Record<HelpGate, boolean>>;
const STRICT_GATES: readonly HelpGate[] = ["grow", "referral", "bizReferral", "annual", "autoSend", "voucherOnline", "bot"];
/** Is this gate on? `on` omitted: everything is on (the legacy, ungated text). */
export const gateOn = (on: HelpOn | undefined, g: HelpGate): boolean =>
  !on || (STRICT_GATES.includes(g) ? on[g] === true : on[g] !== false);
/** The per-business switches a video's feature lives behind (any one on shows it), on top of TUTORIAL_FLAG. */
export const VIDEO_GATE: Record<string, HelpGate[]> = {
  "skin-scan": ["skinScan"],
  "waitlist-rebook": ["waitlist", "rebook"],
  "gift-vouchers": ["vouchers"],
  products: ["products"],
  reviews: ["reviews"],
  monthly: ["monthly"],
};
/** May the help page and the help chat point her to this video? */
export const helpVideoOn = (id: string, on?: HelpOn): boolean =>
  tutorialOn(id, on) && (!on || !VIDEO_GATE[id] || VIDEO_GATE[id].some((g) => gateOn(on, g)));

// Help page (nav "עזרה"). The text of help-content.md, one entry per "##"
// heading, embedded verbatim rather than fetched: the page must work offline
// and cannot depend on a file the deploy may not carry. Body lines render by
// prefix - "- " is a bullet, "### " a sub-heading, anything else a paragraph -
// and **bold** inside a line renders bold. Nothing here rewrites the copy.
export const HELP_TITLE = "עזרה: איך המערכת עובדת";
export const HELP_INTRO = "מדריך קצר לכל מסך במערכת. אפשר לפתוח כל חלק בנפרד, ולרוב יש בו גם סרטון קצר שמראה איך.";
export const HELP_SECTIONS: HelpSection[] = [
  { key:"start", icon:"home", title:"מתחילות", videos:["welcome","tour","home","help-chat"], body:[
    "שלושה סרטונים קצרים שכדאי לראות ביום הראשון: מה יש בקלמיה, סיור בכל המסכים, ואיך מוסיפים את קלמיה למסך הבית של הטלפון כמו אפליקציה.",
    "- במסך **היום** רואים את התורים של היום ב\"היום שלי\". לחיצה על תור פותחת אותו, והכפתור **✦ תור חדש** קובע תור מהר.",
    "- **דורש תשומת לב**: מה מחכה לך, למשל תזכורות לתורי מחר.",
    "- רוצה לראות רק את הצד של המכירות? בהגדרות, תחת **העסק שלי**, ב**מה מוצג לי במערכת** בוחרים **קופה, ניקובים ודוחות בלבד**. היומן, ההודעות והשיווק יוצאים מהתפריט, לא נמחק כלום, ודף ההזמנות שלך ממשיך לעבוד. אפשר לחזור ל**הכל** בכל רגע.",
    "- נתקעת? הכפתור **תקועה?** למטה פותח את **שאלי את העוזרת**: כותבים שאלה ומקבלים תשובה מהמדריך, לרוב עם סרטון. **לא עזר?** מעביר את השאלה אלינו.",
  ]},
  { key:"calendar", icon:"calendar", title:"יומן", videos:["booking","appointment-actions","waitlist-rebook"], body:[
    "היומן הוא המסך הראשי שלך. כאן את רואה את כל התורים, קובעת חדשים, ומנהלת את הזמן שלך.",
    "- מעבר בין תצוגת **יום** ל**שבוע**, וקפיצה מהירה ל**היום**",
    "- **✦ תור חדש**: או פשוט לחיצה על משבצת ריקה ביומן, והשעה כבר מוכנה",
    "- לחיצה על תור קיים פותחת אותו. למעלה יש כפתורים: **₪ לתשלום**, **תזכורת**, **כרטיס לקוחה** ו**ביטול התור**",
    "- תור ששולם מסומן **✓ שולם**, ולחיצה פותחת את אישור התשלום",
    "- **🔒 אירוע אישי**: חסימת זמן לעצמך, שלא ייקבע בו תור",
    "- כל תור מסומן בצבע לפי הסטטוס: אישרה, ביטלה, ממתין, אישי",
    "בחלון קביעת התור את מחפשת לקוחה לפי שם או טלפון (או מקלידה חדשה), בוחרת תאריך ושעה, שעות תפוסות מסומנות ⛔, בוחרת טיפול ומשך (30 עד 120 דקות, או המשך של הטיפול), ושומרת. תור חדש להיום מתחיל אוטומטית בחצי השעה הקרובה.",
  ]},
  { key:"reminders", icon:"clock", title:"תזכורות לתורים", videos:["reminders"], body:[
    "בכל יום המערכת מכינה לך את התזכורות לתורי מחר. את שולחת כל אחת בלחיצה, מהוואטסאפ שלך.",
    "- במסך **היום**, תחת **דורש תשומת לב**, או בלשונית **הודעות**: **הודעות מוכנות לשליחה**",
    "- לחיצה על **שליחה** פותחת את הוואטסאפ עם ההודעה כבר כתובה, ונשאר רק ללחוץ שלח",
    "- בהודעה יש קישור: הלקוחה מאשרת או מבטלת בעצמה, והיומן מתעדכן לבד",
    "- מי שביטלה, לא הגיעה או כבר קיבלה תזכורת לא מופיעה שוב ברשימה",
  ]},
  { key:"clients", icon:"people", title:"לקוחות", videos:["clients"], body:[
    "כל הלקוחות שלך במקום אחד, עם כל ההיסטוריה שלהן.",
    "- חיפוש לפי שם או טלפון, וסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות) או סוג עור",
    "- **✦ לקוחה חדשה** להוספה ידנית, **⇪ ייבוא לקוחות** בהדבקה מאקסל או מאנשי הקשר",
    "- **⏱ מזמן לא הגיעו**: מוצא מי לא הגיעה מזמן ושולח לכולן הודעת חזרה בלחיצה אחת",
    "- לכל שורה כפתור **✆ הודעה** לוואטסאפ",
    "- לחיצה על לקוחה פותחת את כרטיס הלקוחה",
  ]},
  { key:"client-card", icon:"id", title:"כרטיס הלקוחה", videos:["clients","forms","loyalty","client-page","skin-scan"], body:[
    "לחיצה על לקוחה פותחת חלון צד עם הכל עליה. למעלה, שם, טלפון, סוג עור, וכמה הוציאה אצלך בסך הכל. לפעמים יופיע שם גם רמז אוטומטי, כמו \"לא ביקרה 60 ימים, שווה הודעת התחדשות\".",
    "ארבעה כפתורים בראש הכרטיס: **וואטסאפ**, **✎ עריכה**, **✦ קביעת תור**, ו־**✦ סריקת עור AI**.",
    "### הלשוניות",
    "- **פרטים**: סיכום לקריאה: יום הולדת, סוג עור, אלרגיות (צהוב), מידע רפואי (כחול), הערות. לעריכה, הכפתור ✎ למעלה",
    "- **היסטוריה**: כל התורים מהחדש לישן, עם טיפול, תאריך ומחיר. לכל שורה כפתור **שלחי תזכורת**",
    "- **סריקות עור**: כל הסריקות שנשמרו, עם ציון צבעוני. לחיצה פותחת את הדוח המלא מחדש",
    "- **אישורי תשלום**: כל התשלומים, לחיצה פותחת את האישור. אם חיברת חשבון מורנינג, מופיעה כאן גם הקבלה או החשבונית שהונפקה.",
    "- **חבילות**: חבילות פעילות עם פס התקדמות, וכפתור **✓ השתמשי** שמנצל טיפול",
    "- **כרטיסיית נאמנות**: כמה ביקורים צברה עד המתנה, היסטוריית המתנות, ותיקון ידני של ביקור אחד, להוסיף או להוריד, עם סיבה. מפעילים בהגדרות, ובקופה מופיע 🎁 כשמגיעה לה מתנה",
    "- **טפסים**: שליחת טופס לחתימה דיגיטלית לפי סוג טיפול (אבחון עור ואנמנזה לפני טיפול ראשון, פלזמה, לייזר, פילינג ועוד). מתחת רואים מה נחתם ✓ ומה ממתין ⏳, ובטופס שנחתם **צפייה בתשובות** מראה מה היא ענתה, עם תשובות ה\"כן\" מסומנות",
    "- **לפני/אחרי**: העלאת זוג תמונות עם שם טיפול והערה",
    "- **תמונות**: כל התמונות. הראשונה הופכת לתמונת הפרופיל",
    "### ✦ סריקת עור AI, איך זה עובד",
    "מצלמת פנים של הלקוחה (או מעלה תמונה), וממתינה כמה שניות. מקבלת דוח: ציון 0-100, סוג עור, ממצאים, טיפול מומלץ, תוכנית טיפול בקליניקה, תוכנית טיפוח לבית, והערות מקצועיות בשבילך.",
    "אם הטיפול המומלץ קיים ברשימת השירותים שלך, יופיע כפתור לקביעת התור ישירות. הסריקה נשמרת אוטומטית בכרטיס הלקוחה.",
    "⚠️ יש מכסת סריקות חודשית, מוצגת בהגדרות → לקוחות ופניות.",
  ]},
  { key:"leads", gate:["leads"], icon:"chat", title:"פניות", body:[
    "כל מי שפנתה אליך ועדיין לא הפכה ללקוחה, מהאתר, מפייסבוק או שהזנת ידנית.",
    "- סינון לפי סטטוס: חדש, אין מענה, ממתינה לתשובה, בטיפול, נשלח מחיר, נקבע תור, לא הגיע, למעקב בהמשך, נסגר, לא רלוונטי",
    "- **✦ פנייה חדשה** להוספה ידנית, **⇪ ייבוא פניות** מקובץ",
    "- **✆ שליחת וואטסאפ** לכל הפניות בסטטוס מסוים בבת אחת",
    "- לחיצה על פנייה פותחת אותה: שינוי סטטוס, תזכורת מעקב, הודעות מוכנות, והמרה ללקוחה רשומה",
    "- פניות מפייסבוק ומדף נחיתה נכנסות לכאן אוטומטית",
  ]},
  { key:"services", icon:"nails", title:"שירותים והיסטוריית טיפולים", videos:["services-hours"], body:[
    "רשימת השירותים והמחירים נמצאת ב**הגדרות → שירותים**. שם את מוסיפה טיפול, קובעת מחיר, ומעדכנת מתי שרוצה. אפשר גם לבחור מרשימה מוכנה במקום להקליד הכל.",
    "ההיסטוריה של כל טיפול שנתת נשמרת בכרטיס הלקוחה, בלשונית **היסטוריה**: יחד עם התמונות לפני/אחרי.",
  ]},
  { key:"marketing", icon:"megaphone", title:"שיווק", videos:["ai"], body:[
    "בלשונית **תוכן** יש שני חלקים: **פוסטים ותבניות**, ו**קמפיינים**.",
    "### השבוע",
    "- **מה מפרסמים השבוע**: פוסטים שכבר מוכנים בצבעים שלך, לפי החגים, היומן והטיפולים שלך. בוחרים אחד, משנים מילה ומורידים.",
    "- **מה לצלם השבוע**: 3 עד 5 רעיונות של עשר דקות בעסק, לפי השירותים והיומן שלך. מכל רעיון אפשר **להפוך לרילס**.",
    "### תבניות",
    "תבניות מוכנות, כבר בצבעים שלך: כל תבנית מתמלאת בלוגו, בשם העסק, בצבע המותג ובתמונות מהגלריה. בוחרים אחת, משנים מה שרוצים, ומורידים.",
    "### רילסים",
    "- **רילס מהצילומים שלי**: בוחרים תמונות וסרטונים שלך מהעבודה, לפני ואחרי, ומקבלים רילס מוכן בעיצוב שלך.",
    "- **תבניות רילס**: רשימת צילומים מוכנה, מוזיקה, מעברים ואפקטים. מצלמות לפי הרשימה ומקבלות רילס.",
    "- **תסריט לצילום**: ה-AI כותב תסריט קצר לרילס, סצנה אחרי סצנה, על נושא שתבחרי.",
    "### עם AI",
    "**מילוי עם AI**: משפט אחד, וה-AI כותב את הטקסטים לתבנית, טקסט לפוסט וכיוונים לתמונה.",
    "⚠️ טיפולים רפואיים כמו בוטוקס ומילויים מסוננים אוטומטית מהפוסטים.",
    "### קמפיינים",
    "מתחברים לפייסבוק, ורואים את ביצועי המודעות בפייסבוק ובאינסטגרם: הוצאה, פניות ומחיר לפנייה.",
  ]},
  { key:"advisor", gate:["advisor"], icon:"robot", title:"יועץ AI", videos:["ai"], body:[
    "צ'אט אישי שמכיר את הנתונים האמיתיים של העסק שלך, התורים, התשלומים, הלקוחות והפניות. שואלת שאלה עסקית, מקבלת תשובה מבוססת על המספרים שלך, לא עצה כללית.",
    "יש ארבע שאלות מוכנות להתחלה: איך להעלות הכנסות החודש, מה כדאי לתמחר מחדש, איך להחזיר לקוחות רדומות, ורעיון לקמפיין לחודש חלש.",
    "הרבה פעמים התשובה תכלול גם הודעה מוכנה לשליחה ללקוחות. השיחה נשמרת, אפשר לחזור אליה בכל זמן.",
  ]},
  { key:"payments", icon:"receipt", title:"תשלומים ואישורי תשלום", videos:["till","morning","grow-refunds"], body:[
    "כשתור מסתיים, בלשונית **קופה** רושמים את התשלום, ומקבלים אישור תשלום. אפשר להגיע לשם גם ישר מהתור, בכפתור **₪ לתשלום**.",
    "- בוחרים לקוחה וטיפול, ואפשר להוסיף **הנחה** (בשקלים או באחוזים) ו**טיפ**",
    "- בוחרים איך שילמה: מזומן, אשראי, ביט, פייבוקס או העברה",
    "אישור תשלום הוא לא קבלה חוקית. קבלה או חשבונית חוקית יוצאת מתוכנה רשומה, כמו מורנינג. אפשר לחבר אחת בהגדרות, תחת **חיבורים**.",
    "אם ביטלת תשלום בטעות, אפשר לבטל אותו מתוך האישור, והמקור נשמר ברישום.",
  ]},
  { key:"grow", gate:["grow"], icon:"receipt", title:"סליקת אשראי (Grow)", videos:["grow-connect","grow-till","pay-page","deposits","grow-refunds"], body:[
    "הלקוחות משלמות באשראי, בביט, ב-Apple Pay או ב-Google Pay, והכסף נכנס לחשבון ה-Grow שלך. Grow מפיקה את הקבלה החוקית.",
    "- **חיבור**: בהגדרות, תחת **חיבורים**, בכרטיס **סליקת אשראי (Grow)**. אין לך Grow? בוחרים מסלול, ממלאים תעודת זהות או מספר עוסק ונייד, ו-Grow שולחת SMS עם טופס קצר. יש לך Grow? פונים לשירות הלקוחות של Grow ומדביקים את קוד העסק שמגיע במייל.",
    "- **בקופה**: אחרי שבוחרים לקוחה וטיפול, לוחצים **בקשת תשלום** בתיבה של Grow. דף התשלום נפתח, ואפשר לשלוח אותו בוואטסאפ או להראות קוד QR. כשהלקוחה משלמת, אישור התשלום נרשם לבד, אז לא לוחצים גם **רשמי תשלום**.",
    "- **בקשת תשלום בקישור**: בקופה, למקדמה או לסכום מלא, גם בלי תור פתוח. מקדמה ששולמה נשמרת כקרדיט ויורדת בקופה בלחיצה.",
    "- **מקדמה בקביעת תור**: בהגדרות, תחת **תשלומים**, בוחרים **מקדמה בקביעת התור**, ומסמנים **דורש מקדמה** ליד כל טיפול שצריך. התור נשמר ללקוחה 30 דקות עד התשלום.",
    "- **ביטול והחזר**: בקופה פותחים את התשלום, **ביטול התשלום**, כותבים סיבה. **גם להחזיר את הכסף ללקוחה ב-Grow** מסומן מראש. בהיסטוריה כתוב אם הכסף הוחזר, ואם נכשל יש **לנסות שוב להחזיר ב-Grow**.",
    "- **כל התשלומים האחרונים ב-Grow**: בקופה, ומתחת לכל תשלום כתוב מאיפה הגיע: מהקופה, מדף ההזמנה, משובר מתנה או מבקשת תשלום.",
    "- הלקוחה פותחת את הקישור מוואטסאפ והחלון לא נפתח? הדף מסביר לה לפתוח אותו בדפדפן של הטלפון, והיא לא חויבה.",
  ]},
  { key:"vouchers-products", gate:["vouchers","products"], icon:"receipt", title:"שוברי מתנה ומוצרים", videos:["gift-vouchers","products"], body:[
    "### 🎁 שוברי מתנה",
    "השוברים כבר פועלים: מוכרים ומממשים בקופה, בלשונית **שוברי מתנה**. אם Grow מחובר, אפשר לקנות שובר גם אונליין מהדף שלך, והקונה שולחת אותו בעצמה בוואטסאפ. סכומים, תוקף ועיצוב משנים בהגדרות, תחת **העסק שלי**.",
    "- **מימוש**: בקופה מקלידים את קוד השובר, והסכום יורד מהתשלום. היתרה נשארת בשובר.",
    "- שובר נספר בהכנסות ביום שנמכר, ובמימוש לא נספר שוב.",
    "### 🧴 מוצרים ומלאי",
    "בקופה, בלשונית **מוצרים**: מוסיפים מוצר עם מחיר, מחיר עלות (רק את רואה) וכמה יש במלאי. בתשלום לוחצים **+ הוסיפי מוצר** ליד הטיפול, והמלאי יורד לבד.",
    "- **עדכון מלאי**: כשמגיע משלוח, נזק או ספירה, עם סיבה שנשמרת ביומן המלאי.",
    "- מלאי נמוך מסומן, ומכירה לא נחסמת גם כשהמלאי נגמר.",
  ]},
  { key:"waitlist-rebook", gate:["waitlist","rebook"], icon:"calendar", title:"רשימת המתנה ותור הבא", videos:["waitlist-rebook"], body:[
    "שתי עזרות שמפעילים בהגדרות, תחת **הודעות**. שתיהן כבויות עד שתפעילי.",
    "- **הצעה אוטומטית לרשימת ההמתנה**: לקוחה שלא מצאה שעה בדף שלך נרשמת לרשימת ההמתנה. כשתור מתבטל, מי שהתור מתאים לה מקבלת הצעה עם קישור, והראשונה שלוחצת מקבלת. ביומן רואים מה קרה.",
    "- **תזכורת לקבוע את התור הבא**: לקוחה בלי תור עתידי מקבלת תזכורת חמה כשמגיע הזמן, רק אם הסכימה לקבל הודעות. רואים מראש **מי תקבל תזכורת היום?**",
    "- **↻ קבעי לה שוב**: מכרטיס הלקוחה או מתור שהסתיים, התור הבא לפי הקצב שלה בלחיצה, וההודעה אליה מוכנה בוואטסאפ שלך.",
    "אם השליחה מהמספר המרכזי לא פעילה, ההודעות מחכות לך ב**הודעות מוכנות לשליחה**.",
  ]},
  { key:"reviews-reports", icon:"megaphone", title:"ביקורות ודוחות", videos:["reviews","monthly"], body:[
    "### ביקורות בשני צעדים",
    "אחרי טיפול מוכנה לך בקשה קצרה ללקוחה: **איך היה?** מי שנהנתה מוזמנת לכתוב ביקורת בגוגל, ומי שמשהו הפריע לה כותבת לך הערה פרטית. גם לה מוצעת ביקורת בגוגל.",
    "- **מה הלקוחות אמרו**: כמה בקשות יצאו, כמה עברו לגוגל, הביקורות בעמוד שלך וההערות הפרטיות, עם תשובה בוואטסאפ. מגיעים מההתראה או מההגדרות, תחת **הודעות**.",
    "### הדוח החודשי והסיכום השבועי",
    "- **הדוח החודשי**: בתחילת כל חודש מחכה לך במסך **היום** סיכום קצר, ו**לדוח החודשי המלא** מראה הכנסות מול החודש הקודם, ביקורים, לקוחות חדשות, הטיפולים שהכניסו הכי הרבה ומי לא חזרה.",
    "- **הסיכום השבועי**: בכל יום ראשון, ארבעה מספרים של השבוע שעבר ועד שלושה דברים שכדאי לעשות.",
    "- את ההתראות אפשר לכבות בהגדרות, תחת **העסק שלי**.",
  ]},
  { key:"booking-link", icon:"share", title:"הקישור לקביעת תור", videos:["my-page","booking-button"], body:[
    "ללקוחות יש קישור משלך שבו הן קובעות תור לבד, בלי לשלוח הודעה.",
    "- **להעתקה**: בהגדרות, תחת **לקוחות ופניות**, או מהכפתור בכרטיס הפתיחה. אפשר להדביק אותו בוואטסאפ, באינסטגרם ובביו.",
    "- **כתובת קצרה**: בהגדרות, תחת **הדף שלי**, אפשר לבחור כתובת עם שם העסק במקום הקישור הארוך.",
    "- התור נכנס ליומן לבד, ואת מקבלת התראה.",
    "- בסוף הקביעה הלקוחה רואה את הכתובת שלך וכפתור **ניווט ב-Waze**.",
  ]},
  { key:"data-requests", icon:"id", title:"לקוחה שמבקשת מידע או מחיקה", body:[
    "בכרטיס הלקוחה, בלשונית **פרטים**, למטה, יש **המידע על הלקוחה**.",
    "- **הורדת עותק**: קובץ עם כל מה ששמור עליה, כדי למסור לה.",
    "- **מחיקה**: מוחקת את כרטיס הלקוחה, הטפסים, התמונות וההודעות שלה. התורים והתשלומים נשארים בחשבון בלי שם ובלי טלפון, כי חובה לשמור רישומי חשבונאות.",
    "- אם היא רק רוצה להפסיק לקבל הודעות שיווק, אין צורך למחוק: אפשר לסמן **הסירה את עצמה מדיוור**. כך גם כשהיא כותבת לך \"הסר\" בוואטסאפ האישי: המערכת לא רואה את ההודעות שם, אז מסמנים בכרטיס שלה.",
  ]},
  { key:"settings", icon:"settings", title:"הגדרות", videos:["services-hours","morning","grow-connect","referral"], body:[
    "כאן מגדירים את המערכת פעם אחת, ואחר כך כמעט לא נוגעים.",
    "- **העסק שלי**: שם העסק, שם המטפלת, טלפון העסק (גם לביט), סוג העסק (פטור, מורשה או חברה), תחומי העיסוק, יעדים, שוברי מתנה ומוצרים",
    "- **חברה מביאה חברה** (ב״העסק שלי״): קישור אישי להזמנת בעלת עסק אחרת, וכשהיא משלמת בפעם הראשונה שתיכן מקבלות חודש מנוי במתנה.",
    "- **המנוי שלך** (ב״העסק שלי״): אפשר לעבור לתשלום שנתי, חודשיים במתנה, והמעבר נכנס לתוקף בחידוש הבא.",
    "- **הדף שלי**: הדף הציבורי שלך: תמונות, צבעים, טקסטים, גלריה ורשתות",
    "- **יומן ושירותים**: הטיפולים והמחירים שלך, ושעות הפתיחה לכל יום",
    "- **תשלומים**: כל מה שקשור למקדמה בקביעת תור, במקום אחד: סכום המקדמה ואיך משלמים אותה (למשל בביט). הלקוחה רואה אותה בדף ההזמנה ומאשרת לפני שהתור נקבע",
    "- **הודעות**: תזכורות ללקוחות, התראות אלייך, מצב שקט, ומתי יוצאות בקשת הביקורת והחזרת הלקוחות הרדומות",
    "- **לקוחות ופניות**: הקישורים ללקוחות, קישור הביקורות בגוגל, כרטיסיית נאמנות, וייבוא לקוחות ופניות מאקסל או מאנשי הקשר",
    "- **כרטיסיית נאמנות** (בקבוצה \"לקוחות ופניות\"): כל כמה ביקורים מגיעה מתנה, מה המתנה, לאילו טיפולים, ותוקף. כבויה עד שתפעילי. הביקורים נספרים לבד מאישורי התשלום, ותשלום שבוטל לא נספר",
    "- **חיבורים**: סליקת אשראי דרך Grow, קבלות וחשבוניות חוקיות (מורנינג), פייסבוק ואינסטגרם, היומן בטלפון והתראות דפדפן",
    `- **סליקת אשראי (Grow)**: ${growCostLineHe()} ${growCostDetailsHe().slice(0, 3).join(' ')}`,
    "- **מתקדם**: מסכים נוספים בתפריט, שינוי סיסמה, יציאה מהחשבון, והנתונים שלך",
    "- **בוט וואטסאפ ושאלות ותשובות** (ב\"מתקדם\"): מופיעים רק בעסק שחיברנו לו בוט בתיאום איתנו. בחשבון חדש אין בוט שעונה ללקוחות, ולכן הם לא מוצגים.",
    "⚠️ אל תשכחי ללחוץ **✓ שמירה** בסוף.",
  ]},
];
// The help text was written for facial cosmetics. For a business that is nails only, the facial parts (skin type, the skin scanner,
// plasma/laser/peel forms, "clinic") are replaced or dropped, and nothing else changes. Anyone with cosmetics among her fields gets the
// original text untouched.
const NAILS_HELP_REPLACE: Array<[string, string]> = [
  ["ובסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות) או סוג עור","ובסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות)"],
  ["וסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות) או סוג עור","וסינון לפי סטטוס (פעילות, חמות, VIP, להתחדשות)"],
  ["שם, טלפון, סוג עור, וכמה הוציאה אצלך בסך הכל","שם, טלפון, וכמה הוציאה אצלך בסך הכל"],
  ["ארבעה כפתורים בראש הכרטיס: **וואטסאפ**, **✎ עריכה**, **✦ קביעת תור**, ו־**✦ סריקת עור AI**.","שלושה כפתורים בראש הכרטיס: **וואטסאפ**, **✎ עריכה**, ו־**✦ קביעת תור**."],
  ["יום הולדת, סוג עור, אלרגיות (צהוב), מידע רפואי (כחול), הערות","יום הולדת, אלרגיות (צהוב, למשל אלרגיה לג'ל או לאקריליק), מידע רפואי (כחול), הערות"],
  ["שליחת טופס לחתימה דיגיטלית לפי סוג טיפול (אבחון עור ואנמנזה לפני טיפול ראשון, פלזמה, לייזר, פילינג ועוד)","שליחת טופס לחתימה דיגיטלית: הצהרת בריאות ואישור טיפול לציפורניים, או אישור צילום עבודות"],
  ["**לפני/אחרי**: העלאת זוג תמונות עם שם טיפול והערה","**לפני/אחרי**: העלאת זוג תמונות של העבודה, עם שם הטיפול והערה"],
];
const NAILS_HELP_DROP: string[] = [
  "- **סריקות עור**",
  "### ✦ סריקת עור AI",
  "מצלמת פנים של הלקוחה",
  "אם הטיפול המומלץ קיים ברשימת השירותים",
  "⚠️ יש מכסת סריקות חודשית",
  "⚠️ טיפולים רפואיים כמו בוטוקס",
];
/** Videos about facial cosmetics only: a nails-only business is never pointed to them (help page and help chat alike). */
// "forms" shows the skin anamnesis form and names the plasma, laser and peel forms, which a nails-only business does not have.
export const COSMETICS_ONLY_VIDEOS: readonly string[] = ["skin-scan", "forms"];
export const isNailsOnly = (fields: unknown): boolean =>
  Array.isArray(fields) && fields.includes("nails") && !fields.includes("cosmetics");
/** The tutorial videos this business may be pointed to. */
export const tutorialIdsFor = (fields: unknown, on?: HelpOn): string[] =>
  Object.keys(TUTORIAL_TITLES).filter((id) => !(isNailsOnly(fields) && COSMETICS_ONLY_VIDEOS.includes(id)) && helpVideoOn(id, on));

// A help line that describes a gated feature: dropped while its gate is off (matched by the line's start, before any rewrite).
export const HELP_LINE_GATES: ReadonlyArray<[string, HelpGate]> = [
  ["- **סריקות עור**", "skinScan"],
  ["### ✦ סריקת עור AI", "skinScan"],
  ["מצלמת פנים של הלקוחה", "skinScan"],
  ["אם הטיפול המומלץ קיים ברשימת השירותים", "skinScan"],
  ["⚠️ יש מכסת סריקות חודשית", "skinScan"],
  ["- **חבילות**:", "packages"],
  ["### 🎁 שוברי מתנה", "vouchers"],
  ["השוברים כבר פועלים", "vouchers"],
  ["- **מימוש**:", "vouchers"],
  ["- שובר נספר בהכנסות", "vouchers"],
  ["### 🧴 מוצרים ומלאי", "products"],
  ["בקופה, בלשונית **מוצרים**", "products"],
  ["- **עדכון מלאי**", "products"],
  ["- מלאי נמוך מסומן", "products"],
  ["- **הצעה אוטומטית לרשימת ההמתנה**", "waitlist"],
  ["- **תזכורת לקבוע את התור הבא**", "rebook"],
  ["אם השליחה מהמספר המרכזי לא פעילה", "autoSend"],
  ["### ביקורות בשני צעדים", "reviews"],
  ["אחרי טיפול מוכנה לך בקשה קצרה", "reviews"],
  ["- **מה הלקוחות אמרו**", "reviews"],
  ["- **הדוח החודשי**", "monthly"],
  ["- **חברה מביאה חברה**", "bizReferral"],
  ["- **המנוי שלך**", "annual"],
  ["- **סליקת אשראי (Grow)**", "grow"],
  ["- **בוט וואטסאפ ושאלות ותשובות**", "bot"],
  ["- **תבניות רילס**", "reelTemplates"],
];
// While a gate is off, these words are rewritten so the line stops promising it (applied after the drops above).
const WAITLIST_ONE = "עזרה שמפעילים בהגדרות, תחת **הודעות**. היא כבויה עד שתפעילי.";
const WAITLIST_TWO = "שתי עזרות שמפעילים בהגדרות, תחת **הודעות**. שתיהן כבויות עד שתפעילי.";
export const HELP_OFF_REPLACE: ReadonlyArray<[HelpGate, string, string]> = [
  ["skinScan", "ארבעה כפתורים בראש הכרטיס: **וואטסאפ**, **✎ עריכה**, **✦ קביעת תור**, ו־**✦ סריקת עור AI**.", "שלושה כפתורים בראש הכרטיס: **וואטסאפ**, **✎ עריכה**, ו־**✦ קביעת תור**."],
  ["grow", "סליקת אשראי דרך Grow, קבלות", "קבלות"],
  ["voucherOnline", " אם Grow מחובר, אפשר לקנות שובר גם אונליין מהדף שלך, והקונה שולחת אותו בעצמה בוואטסאפ.", ""],
  ["waitlist", WAITLIST_TWO, WAITLIST_ONE],
  ["rebook", WAITLIST_TWO, WAITLIST_ONE],
  // No automatic sending today: the offer and the nudge are prepared, and she sends each one with a tap.
  ["autoSend", "**הצעה אוטומטית לרשימת ההמתנה**", "**הצעה לרשימת ההמתנה כשתור מתבטל**"],
  ["autoSend", "כשתור מתבטל, מי שהתור מתאים לה מקבלת הצעה עם קישור, והראשונה שלוחצת מקבלת.", "כשתור מתבטל, מוכנה לך ב**הודעות מוכנות לשליחה** הצעה עם קישור למי שהתור מתאים לה. את שולחת בלחיצה, והראשונה שלוחצת על הקישור מקבלת."],
  ["autoSend", "לקוחה בלי תור עתידי מקבלת תזכורת חמה כשמגיע הזמן, רק אם הסכימה לקבל הודעות.", "ללקוחה בלי תור עתידי מוכנה תזכורת חמה כשמגיע הזמן, רק אם הסכימה לקבל הודעות. את שולחת אותה בלחיצה, מ**הודעות מוכנות לשליחה**."],
  ["monthly", "### הדוח החודשי והסיכום השבועי", "### הסיכום השבועי"],
  // Settings line and section title: the word goes with its feature (the settings line before the title, which it contains).
  ["vouchers", "יעדים, שוברי מתנה ומוצרים", "יעדים ומוצרים"],
  ["vouchers", "שוברי מתנה ומוצרים", "מוצרים"],
  ["products", "יעדים, שוברי מתנה ומוצרים", "יעדים ושוברי מתנה"],
  ["products", "יעדים ומוצרים", "יעדים"],
  ["products", "שוברי מתנה ומוצרים", "שוברי מתנה"],
];
const rewrite = (t: string, on: HelpOn) => HELP_OFF_REPLACE.reduce((s, [g, a, b]) => (gateOn(on, g) ? s : s.split(a).join(b)), t);
/** The help text with every gated part applied: `on` omitted keeps the full, ungated text. */
const gated = (sections: HelpSection[], on?: HelpOn): HelpSection[] => {
  if (!on) return sections;
  return sections
    .filter((sec) => !sec.gate || sec.gate.some((g) => gateOn(on, g)))
    .map((sec) => ({ ...sec,
      title: rewrite(sec.title, on),
      ...(sec.videos ? { videos: sec.videos.filter((v) => helpVideoOn(v, on)) } : {}),
      body: sec.body
        .filter((line) => !HELP_LINE_GATES.some(([start, g]) => line.startsWith(start) && !gateOn(on, g)))
        .map((line) => rewrite(line, on)),
    }));
};
export const helpSectionsFor = (fields: unknown, on?: HelpOn): HelpSection[] => gated(helpSectionsForFields(fields), on);
const helpSectionsForFields = (fields: unknown): HelpSection[] => {
  if (!Array.isArray(fields) || fields.includes("cosmetics") || !fields.includes("nails")) return HELP_SECTIONS;
  return HELP_SECTIONS.map((sec) => ({...sec, videos: sec.videos?.filter((v) => !COSMETICS_ONLY_VIDEOS.includes(v)), body: sec.body
    .filter((line: string) => !NAILS_HELP_DROP.some(d => line.startsWith(d)))
    .map((line: string) => NAILS_HELP_REPLACE.reduce((t, [a, b]) => t.split(a).join(b), line)
      .split("תוכנית טיפול בקליניקה").join("תוכנית טיפול")
      .split("בקליניקה").join("בעסק"))}));
};

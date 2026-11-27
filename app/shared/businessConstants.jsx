"use client";
// app/shared/businessConstants.jsx — the app's fixed lists: VAT and tax wording, plans, client and lead statuses, lead sources, payment methods, form types, the tour's steps.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { LEAD_STATUS_KEYS, LEAD_STATUS_LABELS, LEGACY_LEAD_STATUS_LABELS } from "@/lib/leads/statuses";
import { ICON_FLOWER, ICON_CALENDAR, ICON_PERSON, ICON_WALLET, ICON_FRAME } from "@/lib/brand";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leadSources";
import { clientMembershipsEnabled, MEMBERSHIP_PAYMENT } from "@/lib/membershipFlag";
import { displayPhone } from "@/lib/publicLanding";
import { tr } from "@/lib/i18n/tr";
import { PROTOCOL_FORMS, protocolFormTitle } from "@/lib/protocolBook/questions";

/* @module-body */
// "**x**" -> <b>x</b>; everything else passes through untouched.
const helpInline = (text) => text.split(/(\*\*[^*]+\*\*)/g).map((part,i) =>
  part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2,-2)}</b> : part
);
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// ── Onboarding walkthrough — six steps, one per screen, in the order a new
// cosmetician actually meets them, ending on her booking link rather than a
// seventh "congratulations" step. See app/OnboardingTour.jsx for the
// component that renders these; the step objects just say WHERE (a
// selector the component polls for) and WHAT TO SAY. The last step's
// onNext is special-cased in the component (isLast -> onFinish), which the
// tour's finish handler below turns into opening the new-appointment modal.
const TOUR_STEPS = [
  // `tab` is the screen the step describes (lib/tourFlow.js): the tour follows her between them.
  { id:"dashboard", tab:"dashboard", selector:'button[aria-label="היום"]', icon: ICON_FLOWER,
    title:"היום שלך", text:"פה תראי את היום שלך במבט אחד: מי מגיעה, כמה נכנס, ומה מחכה." },
  { id:"calendar", tab:"calendar", selector:'button[aria-label="יומן"]', icon: ICON_CALENDAR,
    title:"היומן", text:"הלוח שלך. תורים נקבעים כאן, ואת רואה את כל השבוע בלחיצה." },
  { id:"clients", tab:"clients", selector:'button[aria-label="לקוחות"]', icon: ICON_PERSON,
    title:"הלקוחות שלך", text:"כל לקוחה שלך, עם ההיסטוריה שלה, במקום אחד שתמיד זמין." },
  { id:"cashier", tab:"cashier", selector:'button[aria-label="קופה"]', icon: ICON_WALLET,
    title:"הקופה", text:"כשתור מסתיים, התשלום נרשם כאן, פשוט ומסודר." },
  { id:"content", tab:"campaigns", selector:'button[aria-label="תוכן"]', icon: ICON_FRAME,
    title:"תוכן", text:"פוסטים ורילסים מוכנים, כבר בצבעים ובלוגו שלך." },
  // requiresSettings: the tour's advance handler opens Settings at settingsTab before switching to this step. The booking-link
  // button lives in the "clients" group (tab "import" maps there), not in כללי: opening כללי left the card pointing at nothing
  // (2026-10-21 audit).
  { id:"booking-link", selector:'[data-tour="booking-link"]', icon: ICON_CALENDAR,
    title:"הקישור שלך להזמנות", requiresSettings:true, settingsTab:"import",
    text:"זה הקישור שהלקוחות שלך יזמינו דרכו. אפשר לשלוח אותו עכשיו, או פשוט לקבוע את התור הראשון בעצמך.",
    cta:"קביעת תור ראשון ✦" },
];

// שיעור המע"מ — קבוע יחיד, קל לשינוי כשהשיעור משתנה.
// Israel's VAT was 17% until the end of 2024 and 18% from 1 January 2025. The tax screen offers the last four years,
// so the rate follows the year being looked at.
const VAT_RATE = 0.18;
const vatRateForYear = (y) => (Number(y) >= 2025 ? 0.18 : 0.17);
// קטגוריות הוצאה (מפתח DB -> תווית בעברית)
const EXPENSE_CATEGORIES = [
  {k:"materials",l:"חומרים"},
  {k:"equipment",l:"ציוד"},
  {k:"marketing",l:"שיווק"},
  {k:"rent",     l:"שכירות"},
  {k:"other",    l:"אחר"},
];
// הסתייגות משפטית שמופיעה בכל דוח מס (מסך + הדפסה).
const TAX_DISCLAIMER = "הדוח הוא לנוחותך בלבד. יש לבדוק את הנתונים מול רואה חשבון / יועץ מס לפני הגשה לרשויות. האחריות על הדיווח היא של בעל העסק.";

// ─── Subscription plans (mapping only — NOT used to gate anything yet) ───
//
// ⚠️ תחזוקה: כשמוסיפים פיצ'ר חדש למערכת — מוסיפים אותו כאן לרמות שאמורות
//    לקבל אותו. פיצ'ר שלא רשום בשום רמה = premium בלבד (ברירת מחדל).
//    כלומר אם מוסיפים פיצ'ר ולא מעדכנים את המיפוי, basic/pro לא יקבלו אותו
//    עד שיירשם להם במפורש — רק premium יקבל אותו.
//
// Feature keys (short, English) and what they mean:
//   clients   - ניהול לקוחות      calendar  - יומן תורים
//   cashier   - קופה              receipts  - קבלות
//   marketing - שיווק / קמפיינים  leads     - ניהול לידים
//   whatsapp  - בוט וואטסאפ אוטומטי
//   birthdays - ברכות יום הולדת אוטומטיות
//   reviews   - בקשות ביקורת אוטומטיות
//   advisor   - יועץ עסקי AI       skinscan  - סריקת עור AI
//   reels     - יוצר רילסים        community - קהילה
// Tiers are cumulative: pro includes basic, premium includes pro.
const _PLAN_BASIC   = ["clients","calendar","cashier","receipts"];

// Her business type, and whether SHE chose it. The live column defaults to 'exempt', so a type alone can be the default;
// business_tax_status_set_at (add_business_tax_status_set_at.sql) says when she picked it. Before that migration the key is
// absent from the row and nothing counts as unconfirmed - the app behaves as before.
const TAX_STATUS_HE = { exempt: "עוסק פטור", licensed: "עוסק מורשה", company: "חברה בע\"מ" };
const taxStatusUnconfirmed = (s) => !!s && Object.prototype.hasOwnProperty.call(s, "business_tax_status_set_at") && !s.business_tax_status_set_at;
const _PLAN_PRO     = [..._PLAN_BASIC, "marketing","leads","whatsapp","birthdays","reviews"];
const _PLAN_PREMIUM = [..._PLAN_PRO, "advisor","skinscan","reels","community"];
const PLAN_FEATURES = {
  none:    [],            // עסק שעדיין לא בחר מנוי
  // A tenant in her 30-day trial. The signup trigger writes plan = 'trial'
  // (verified against a real test signup), and this map had no such key - so
  // PLAN_FEATURES['trial'] was undefined and planAllows fell through to
  // (undefined || []).includes(...), i.e. FALSE for every feature. A trialling
  // cosmetician would have seen an empty product on day one, which is the
  // opposite of what a trial is for. Harmless until now only because
  // planAllows has no callers yet.
  trial:   _PLAN_PREMIUM, // a trial shows the whole product
  basic:   _PLAN_BASIC,
  pro:     _PLAN_PRO,
  premium: _PLAN_PREMIUM,
};

// planAllows(plan, feature) -> true/false: האם לרמה יש גישה לפיצ'ר.
//  • premium מקבל תמיד הכל — כולל פיצ'רים עתידיים שלא רשומים במיפוי
//    (כך שמשתמשת premium לעולם לא תיחסם בטעות).
//  • trial מקבל בדיוק כמו premium — כולל פיצ'רים עתידיים.
//  • פיצ'ר שלא רשום במיפוי של basic/pro -> false עבורן (= premium-only כברירת מחדל).
//
// 'trial' is in the catch-all as well as in the map above, and needs to be in
// BOTH. The map alone would give a trialling tenant today's premium features
// but silently withhold any feature added later and not registered - so a trial
// would drift out of "the full product" over time, in exactly the quiet way
// this whole fix exists to prevent.
const planAllows = (plan, feature) => {
  if (plan === "premium" || plan === "trial") return true;
  return (PLAN_FEATURES[plan] || []).includes(feature);
};
// A stored phone the way she writes it ("052-111-1111"), not the e164 digits bookings store ("972521111111").
const fmtPhone = (p) => displayPhone(p) || p || "";
// "רגיל" is what the seeded and imported clients carry; the sixth option used to be a misspelt non-word (2026-10-23 pass).
const SKIN_TYPES = ["רגיל","יבש","שמן","מעורב","רגיש","נוטה לאקנה"];
const STATUS_COLORS = {"VIP":"#C9A24B","active":"var(--success)","cold":"var(--ink-3)","hot":"#C68A5E"};
const STATUS_LABELS = {"VIP":"VIP","active":"פעילה","cold":"לא פעילה","hot":"חמה"};
// `only`: shown just to businesses in these fields. A nail technician is offered the nail forms, not plasma, laser or peel.
const FORM_TYPES = [
  {key:"general",label:"הצהרת בריאות כללית",only:["cosmetics"]},
  // 2026-11-04: the first-visit intake (questions in lib/formTemplates.ts). Cosmetics only, like the facial forms.
  {key:"skin_anamnesis",label:"אבחון עור ואנמנזה",only:["cosmetics"]},
  {key:"plasma",label:"טיפול פלזמה",only:["cosmetics"]},
  {key:"device",label:"מכשור מתקדם",only:["cosmetics"]},
  {key:"laser",label:"הסרת שיער בלייזר",only:["cosmetics"]},
  {key:"peel",label:"פילינג כימי",only:["cosmetics"]},
  {key:"nails_general",label:"הצהרת בריאות ואישור טיפול (ציפורניים)",only:["nails"]},
  {key:"nails_media",label:"אישור צילום עבודות",only:["nails"]},
];
// The protocol book's questionnaires (lib/formTemplates.ts appends them). Listed for sending only through protocolFormAllowed;
// in this list so a form already sent keeps its name on the client card and in the answers sheet.
const FORM_TYPES_ALL = [...FORM_TYPES, ...PROTOCOL_FORMS.map(f=>({key:f.formKey,label:protocolFormTitle(f,"he"),protocol:true}))];
// What the boot reads of public.forms: enough to list them. form_data and signature stay in the database until asked for.
const FORM_LIST_COLUMNS = "id, tenant_id, client_id, client_name, form_type, status, signed_at";
// The default list. Her own list (settings.automations.lead_sources) is resolved by resolveLeadSources.
const LEAD_SOURCES = [...DEFAULT_LEAD_SOURCES];
// Canonical manual workflow statuses. These KEYS must stay in sync with
// ALLOWED_STATUSES in app/api/leads/send-bulk/route.js and LEAD_STATUSES in
// app/dashboard/leads/LeadsClient.tsx — the bulk WhatsApp send targets a status
// by key. Colors/bg are drawn from the beautyOS palette so the chips, badges
// and buttons match the rest of the app.
// beautyOS palette. Keys and Hebrew labels come from the shared module; only
// the colors are local to this screen.
// A categorical palette, NOT semantic tokens. Ten statuses must stay visually
// distinct from each other at a glance, so these are literal values on purpose:
// routing them through --success / --danger / --ink-2 would collapse several
// statuses onto the same colour and destroy the distinction.
const LEAD_STATUS_COLORS = {
 "new":             {color:"#6E8CA0",bg:"#EFF4F7"},
 "no_answer":       {color:"#8C8073",bg:"#F4F1EC"},
 "awaiting_reply":  {color:"#8E7AA3",bg:"#F3EFF7"},
 "in_progress":     {color:"#A67C52",bg:"#F7F1E6"},
 "quote_sent":      {color:"#C9A24B",bg:"#FAF4E4"},
 "scheduled":       {color:"#5C9460",bg:"#EEF6EF"},
 "no_show":         {color:"#C0872E",bg:"#FBF3E2"},
 "follow_up_later": {color:"#7FA8A0",bg:"#EFF6F4"},
 "closed":          {color:"#5580C4",bg:"#EBF3FF"},
 "irrelevant":      {color:"#C62828",bg:"#FEEBEE"},
};
const LEAD_STATUSES = Object.fromEntries(
 LEAD_STATUS_KEYS.map(k => [k, {label: LEAD_STATUS_LABELS[k], ...LEAD_STATUS_COLORS[k]}])
);
// Legacy status values that may still exist on rows created before the status
// model above (no DB migration is run). Shown read-only so old leads never
// render blank; they are NOT offered as canonical chips/buttons.
// Categorical, same reasoning as LEAD_STATUS_COLORS above.
const LEGACY_LEAD_STATUS_COLORS = {
 "contacted": {color:"#A67C52",bg:"#F7F1E6"},
 "converted": {color:"#5C9460",bg:"#EEF6EF"},
 "lost":      {color:"#C62828",bg:"#FEEBEE"},
};
const LEGACY_LEAD_STATUSES = Object.fromEntries(
 Object.keys(LEGACY_LEAD_STATUS_LABELS).map(k =>
   [k, {label: LEGACY_LEAD_STATUS_LABELS[k], ...LEGACY_LEAD_STATUS_COLORS[k]}])
);
// Resolve a status value to its display meta: canonical first, then legacy,
// then a neutral fallback so any unexpected value is still visible.
const leadStatusMeta = (status) =>
 LEAD_STATUSES[status] || LEGACY_LEAD_STATUSES[status] ||
 {label: status || tr("ללא סטטוס"), color:"var(--ink-2)", bg:"var(--surface-2)"};
const SOURCE_ICONS = {"פייסבוק":"◦","אינסטגרם":"◦","גוגל":"◦","טיקטוק":"◦","המלצה":"◦","הליכה ברחוב":"◦","סורק העור":"✦","אחר":"◦"};

// Hebrew for the source values that are NOT already Hebrew.
//
// LEAD_SOURCES above is the list she picks from by hand, so those values are
// their own labels. Machine-written sources are not: the importer stamps
// csv_import on every row it creates, which is 247 of her leads - by far the
// largest single source - and it would otherwise appear in her own attribution
// report as a raw English key.
// sourceLabelHe (machine sources -> Hebrew) lives in lib/leadSources.ts, shared with the report.
// Reporting only, never a button. It has to be IN this list or
// paymentBreakdown cannot count it - that function iterates PAYMENT_METHODS, so
// a method missing from it is a receipt that silently leaves the report. But
// "paid from a package" is a consequence of drawing a session, not a way of
// paying, and offering it as a choice would let her write a receipt claiming a
// package that nothing was deducted from.
const PACKAGE_PAYMENT = "חבילה";
const PAYMENT_METHODS = [
  {key:"מזומן",icon:"◦",color:"#C9A24B"},
  {key:"אשראי",icon:"◦",color:"#A67C52"},
  {key:"ביט",icon:"◦",color:"#C68A5E"},
  {key:"פייבוקס",icon:"◦",color:"#CBA15E"},
  {key:"העברה",icon:"◦",color:"#8C6239"},
  {key:PACKAGE_PAYMENT,icon:"◦",color:"#6B5279"},
  // A visit covered by a client membership (₪0: the month was counted as income when it was charged). Listed only while the
  // feature is on, so no empty "מנוי" row or filter appears for anyone else.
  ...(clientMembershipsEnabled() ? [{key:MEMBERSHIP_PAYMENT,icon:"◦",color:"#4F6B5A"}] : []),
];
/** What the till offers. PACKAGE_PAYMENT and MEMBERSHIP_PAYMENT are reached by drawing a credit, not by tapping. */
const SELECTABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter(m=>m.key!==PACKAGE_PAYMENT&&m.key!==MEMBERSHIP_PAYMENT);
/* @module-end */
export {
  _PLAN_BASIC, _PLAN_PREMIUM, _PLAN_PRO, EXPENSE_CATEGORIES, fmtPhone, FORM_LIST_COLUMNS, FORM_TYPES,
  FORM_TYPES_ALL, helpInline, LEAD_SOURCES, LEAD_STATUS_COLORS, LEAD_STATUSES, leadStatusMeta,
  LEGACY_LEAD_STATUS_COLORS, LEGACY_LEAD_STATUSES, MONTHS_HE, PACKAGE_PAYMENT, PAYMENT_METHODS, PLAN_FEATURES,
  planAllows, SELECTABLE_PAYMENT_METHODS, SKIN_TYPES, SOURCE_ICONS, STATUS_COLORS, STATUS_LABELS,
  TAX_DISCLAIMER, TAX_STATUS_HE, taxStatusUnconfirmed, TOUR_STEPS, VAT_RATE, vatRateForYear,
};

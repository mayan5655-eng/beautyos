"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import FloralCorners from "./FloralCorners";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, clientImagePath, toStoragePath } from "../lib/clientImages";
import { dayHoursFrom, normalizeBusinessHours, legacyHoursFromMap } from "@/lib/businessHours";
import { planState } from "@/lib/planState";
import { WRITE_BLOCKED_TOAST_HE, DISABLED_REASON_HE, READ_ONLY_BADGE_HE } from "@/lib/planCopy";
import { LEAD_STATUS_KEYS, LEAD_STATUS_LABELS, LEGACY_LEAD_STATUS_LABELS } from "@/lib/leads/statuses";
import { renderLeadTemplate, resolveLeadTemplate, DEFAULT_LEAD_TEMPLATES } from "@/lib/leads/templates";
import { contactAgoHe, contactSummaryHe } from "@/lib/leads/contact";
import { hexToRgb, lighten, darken, applyAccentTokens } from "@/lib/theme";
import { LOGO_COMPACT, BRAND_WASH, FLORAL_BLUSH, FLORAL_LILAC } from "@/lib/brand";
import TrialBanner from "./TrialBanner";
import ImportChooser from "./ImportChooser";
import { startMinute, endMinute, fmtTime, fmtApptTime, startFields, toMinutes, clashesWith, slotsBetween } from "@/lib/apptTime";
import * as Sentry from "@sentry/nextjs";
import { supportWhatsAppUrl, SUPPORT_WHATSAPP_MESSAGE } from "@/lib/support";
import { isTabVisible, visibleTabIds } from "@/lib/featureFlags";

// Renders a private client image from storage. `value` may be a bare storage
// path (new format) or a legacy public URL (old); either way we resolve a
// short-lived signed URL on demand, so the underlying bucket can stay private.
// While loading — or if the object can't be signed (e.g. a legacy object not
// yet migrated into the tenant folder) — it renders `fallback` (default null),
// so a broken image never flashes. The DB always stores the path, never the
// signed URL, so uploads/deletes keep operating on stable references.
function SignedImage({ value, alt = "", style, fallback = null }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    const path = toStoragePath(value);
    if (!path) return;
    supabase.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (active && !error && data?.signedUrl) setUrl(data.signedUrl);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [value]);
  if (!url) return fallback;
  return <img alt={alt} src={url} style={style} />;
}

// A single pill on/off switch. Extracted so every settings toggle shares one
// piece of markup instead of repeating the same inline styles. `pc` is the
// tenant's primary color (the "on" background).
function Toggle({ on, onChange, pc }) {
  return (
    <button onClick={onChange} style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: on ? pc : "#D8CEd3", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", transition: "left .2s" }} />
    </button>
  );
}

// One "label + switch (+ optional hint)" row for the Automations settings tab.
function AutoToggleRow({ label, desc, on, onChange, pc }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--ink)" }}>{label}</span>
        <Toggle on={on} onChange={onChange} pc={pc} />
      </div>
      {desc && <p style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.5 }}>{desc}</p>}
    </div>
  );
}

// Beauty Voice — the full set of spoken commands the assistant understands.
// The `intent` values mirror the actions in app/api/voice-intent/route.ts; each
// row carries a friendly label + one example phrase to show users what they can
// say. Display-only: this drives the "מה אפשר לומר?" help list and does not
// affect recognition or dispatch.
const VOICE_COMMANDS = [
  { intent: "book_appointment",    icon: "✦",  label: "קביעת תור",      example: "קבעי תור לרונית מחר בעשר וחצי" },
  { intent: "show_day",            icon: "◴",  label: "התורים של היום",  example: "מה יש לי מחר?" },
  { intent: "revenue_summary",     icon: "₪",  label: "סיכום הכנסות",    example: "כמה הכנסתי החודש?" },
  { intent: "cancel_appointment",  icon: "✕",  label: "ביטול תור",       example: "בטלי את התור של דנה מחר" },
  { intent: "call_client",         icon: "✆",  label: "חיוג ללקוחה",     example: "תתקשרי לרונית" },
  { intent: "create_receipt",      icon: "🧾", label: "הוצאת קבלה",      example: "תוציאי קבלה לרונית על 200 שקל" },
];

// Section metadata for the global top-bar search dropdown — render order,
// Hebrew header label, and type icon. Display-only; the result objects come
// from globalResults and are routed by openSearchResult.
const SEARCH_GROUPS = [
  { type: "client",  label: "לקוחות",  icon: "♥" },
  { type: "appt",    label: "תורים",   icon: "◴" },
  { type: "lead",    label: "לידים",   icon: "✦" },
  { type: "service", label: "שירותים", icon: "✂" },
  { type: "receipt", label: "קבלות",   icon: "🧾" },
];

// Compact "what can I say?" list for the Beauty Voice modal. Uses runtime CSS
// vars (--pc etc.) so it needs no props. Purely presentational.
function VoiceCommandList() {
  return (
    <div style={{ marginTop: 16, textAlign: "right" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", marginBottom: 8 }}>מה אפשר לומר?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {VOICE_COMMANDS.map((c) => (
          <div key={c.intent} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span style={{ width: 27, height: 27, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--pc)", background: "var(--pc-tint)" }}>{c.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--ink)" }}>{c.label}</span>
              <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-2)" }}>&ldquo;{c.example}&rdquo;</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CONSTANTS
// ============================================================

// No default/demo services: a new cosmetician starts with an empty list and is
// guided (empty state + first-run checklist) to add her own real services.

const HOURS_ALL = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
// Reassuring steps cycled through while the AI skin scan is processing, so the
// wait feels alive and progressing rather than frozen.
const SCAN_STEPS = ["בודקת גוון עור...","מזהה מרקם ולחות...","מאתרת אזורי טיפול...","מכינה המלצות מותאמות..."];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// שיעור המע"מ — קבוע יחיד, קל לשינוי כשהשיעור משתנה.
const VAT_RATE = 0.18;
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
const SKIN_TYPES = ["יבש","שמן","מעורב","רגיש","נורמלי","אסתתי"];
const STATUS_COLORS = {"VIP":"#C9A24B","active":"var(--success)","cold":"var(--ink-3)","hot":"#C68A5E"};
const STATUS_LABELS = {"VIP":"VIP","active":"פעילה","cold":"לא פעילה","hot":"חמה"};
const FORM_TYPES = [
  {key:"general",label:"הצהרת בריאות כללית"},
  {key:"plasma",label:"טיפול פלזמה"},
  {key:"device",label:"מכשור מתקדם"},
  {key:"laser",label:"הסרת שיער בלייזר"},
  {key:"peel",label:"פילינג כימי"},
];
const LEAD_SOURCES = ["פייסבוק","אינסטגרם","גוגל","טיקטוק","המלצה","הליכה ברחוב","סורק העור","אחר"];
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
 {label: status || "ללא סטטוס", color:"var(--ink-2)", bg:"var(--surface-2)"};
const SOURCE_ICONS = {"פייסבוק":"◦","אינסטגרם":"◦","גוגל":"◦","טיקטוק":"◦","המלצה":"◦","הליכה ברחוב":"◦","סורק העור":"✦","אחר":"◦"};
const PAYMENT_METHODS = [
  {key:"מזומן",icon:"◦",color:"#C9A24B"},
  {key:"אשראי",icon:"◦",color:"#A67C52"},
  {key:"ביט",icon:"◦",color:"#C68A5E"},
  {key:"פייבוקס",icon:"◦",color:"#CBA15E"},
  {key:"העברה",icon:"◦",color:"#8C6239"},
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getWeekDates(startDate) {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatDateHe(date) {
  return `${date.getDate()}/${date.getMonth()+1}`;
}

function waLink(phone) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}`;
}

function waMsg(phone, msg) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}
// The browser has no signing secret and must never be given one, so the signed
// links are minted by /api/confirm/link, which checks the session and that the
// appointment belongs to the caller's tenant. Returns null if that fails, so a
// caller never sends a reminder carrying a link that cannot work.
async function fetchConfirmLinks(apptId) {
  try {
    const res = await fetch(`/api/confirm/link?id=${encodeURIComponent(apptId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return null;
    return { confirmUrl: data.confirmUrl, cancelUrl: data.cancelUrl };
  } catch {
    return null;
  }
}

// `time` is an ALREADY-FORMATTED "14:30", not an hour number. It used to take
// appt.hour and interpolate it raw, which sent a client "בשעה 14" - the bare
// integer, wrong for every half-hour appointment and badly formatted even for
// whole ones. Callers pass fmtApptTime(appt); the parameter is named for what
// it is so the next caller cannot make the same substitution.
function waConfirmLink(phone, name, service, date, time, links) {
  const confirmUrl = links.confirmUrl;
  const cancelUrl  = links.cancelUrl;
  return waMsg(
    phone,
    `שלום ${name}! ✦\nתזכורת לתור מחר:\n${service}\n${date} בשעה ${time}\n\nלאישור התור:\n${confirmUrl}\n\nלביטול התור:\n${cancelUrl}\n\nמחכים לך! `
  );
}

function waBirthday(phone, name, businessName) {
  // Drop the business-name clause when it's empty or the legacy placeholder, so
  // "מהעסק שלי" / a dangling "מ" never reaches a real client.
  const b = (businessName || "").trim();
  const bs = b && b !== "העסק שלי" ? b : "";
  return waMsg(phone, `שלום ${name}! \nיום הולדת שמח! \n${bs ? `מ${bs} ` : ""}אנחנו שולחים לך ברכות חמות!\nלרגל היום המיוחד - 15% הנחה על הטיפול הבא שלך \nנחכה לך! ✦`);
}

function waReview(phone, name) {
  return waMsg(phone, `שלום ${name}! \nתודה שביקרת אצלנו!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `);
}

function waPayment(phone, name, amount, service, method, businessPhone) {
  let payLine = "";
  if (method==="ביט"&&businessPhone) payLine=`\nביט: ${businessPhone}`;
  else if (method==="פייבוקס") payLine=`\nפייבוקס`;
  else if (method==="העברה") payLine=`\nהעברה בנקאית`;
  return waMsg(phone, `שלום ${name}! \nתודה על הביקור! ✦\nלתשלום עבור ${service}:\nסכום: ₪${amount}${payLine}\n\nתודה רבה! `);
}

const emptyClient = {name:"",phone:"",birthday:"",skinType:"",allergies:"",medical:"",notes:"",status:"active"};

// service_prices.color and appointments.color are STORED DATA, not styling:
// they are written to the database and read back to tint calendar blocks. They
// must stay literal hex. A theme token here would persist a CSS variable
// reference into the data layer, where it resolves only by accident inside a
// styled context and breaks everywhere else.
const DEFAULT_SERVICE_COLOR = "#D9B98C";

// Palette for imported services, assigned round-robin so a pasted list gets
// distinct calendar colours instead of one repeated tint. Same hues the seeded
// services already use.
const SERVICE_COLOR_CYCLE = ["#F4A7B9","#A7C4F4","#B5EAD7","#FFDAC1","#E2CFEA","#F9C6D0","#D9B98C","#C7E9E4"];

// ============================================================
// CLIENT IMPORT — paste + column mapping
// A cosmetician moving from another system exports to Excel, copies the
// columns and pastes them here. Excel copies as TAB-separated text, which is
// why paste is the path rather than file upload: no parser library, and it is
// the one thing every system can produce.
// ============================================================

// The client fields a pasted column can be mapped onto. Note skinType, not
// skintype: the table has both, and the rest of the app writes camelCase.
const IMPORT_FIELDS = [
  { id:"ignore",    label:"התעלם" },
  { id:"name",      label:"שם" },
  { id:"phone",     label:"טלפון" },
  { id:"birthday",  label:"תאריך לידה" },
  { id:"skinType",  label:"סוג עור" },
  { id:"allergies", label:"אלרגיות" },
  { id:"medical",   label:"מצב רפואי" },
  { id:"notes",     label:"הערות" },
];

// The service_prices fields a pasted column can map onto. Colour is absent on
// purpose: it is assigned round-robin below rather than asked for.
const SERVICE_IMPORT_FIELDS = [
  { id:"ignore",   label:"התעלם" },
  { id:"name",     label:"שם הטיפול" },
  { id:"price",    label:"מחיר" },
  { id:"duration", label:"משך (דקות)" },
];

// The appointment fields a pasted column can map onto. The "time" column carries
// the whole start time, minutes included: start_minute stores the real minute, so
// an imported 14:30 stays 14:30. It used to be rounded to 15:00 and reported in
// the preview, because appointments.hour could not represent anything else.
const APPT_IMPORT_FIELDS = [
  { id:"ignore",   label:"התעלם" },
  { id:"date",     label:"תאריך" },
  { id:"time",     label:"שעה" },
  { id:"name",     label:"שם הלקוחה" },
  { id:"phone",    label:"טלפון" },
  { id:"service",  label:"טיפול" },
  { id:"duration", label:"משך (דקות)" },
  { id:"price",    label:"מחיר" },
  { id:"notes",    label:"הערות" },
];

const looksLikePhone = (s) => /^[\d\-+() ]{6,}$/.test(String(s||"").trim());
const looksLikeDate = (s) => /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(String(s||"").trim());
const looksLikeTime = (s) => /^\d{1,2}[:.]\d{2}$/.test(String(s||"").trim())
                          || /^\d{1,2}\s*(am|pm)$/i.test(String(s||"").trim());

// "₪ 1,200" -> 1200. Anything unparseable returns null so the caller can fall
// back to the column default rather than writing a wrong number.
const parseMoney = (s) => {
  const n = parseFloat(String(s||"").replace(/[^\d.]/g,""));
  return Number.isFinite(n) ? n : null;
};
// "45 דק׳" -> 45.
const parseMinutes = (s) => {
  const n = parseInt(String(s||"").replace(/[^\d]/g,""), 10);
  return Number.isFinite(n) ? n : null;
};
const isNumericCell = (s) => /^[₪$\s]*[\d,.]+[\s֐-׿׳'"a-z.]*$/i.test(String(s||"").trim()) && /\d/.test(String(s||""));

// Split one pasted line into cells. Tabs win when present (an Excel paste);
// otherwise commas, but NOT commas inside quotes — "כהן, דנה" is one cell.
const splitImportLine = (line) => {
  if (line.includes("\t")) return line.split("\t").map(c=>c.trim());
  const out=[]; let cur=""; let q=false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur.trim()); cur=""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

// Pasted text -> a rectangular grid. Short rows are padded so every row has
// the same width as the widest, which keeps the mapping dropdowns aligned.
const parseImportGrid = (text) => {
  // Filter blank lines WITHOUT trimming the kept ones: trimming a line would
  // eat a leading tab, and with it the empty first cell. A row like
  // "<tab>0541234567" - a client with a phone but no name - would otherwise
  // collapse to one cell and import the phone AS the name.
  const rows = String(text||"").split("\n").filter(l=>l.trim()).map(splitImportLine);
  const width = rows.reduce((w,r)=>Math.max(w,r.length),0);
  return { rows: rows.map(r=>{ const c=r.slice(); while(c.length<width) c.push(""); return c; }), width };
};

// Row 1 is a header when it contains a recognised heading AND no phone-shaped
// cell. Requiring both avoids treating a real client named "שם" as a header.
// Shared by both wizards, so it carries client AND price-list vocabulary. A
// services paste headed "טיפול / מחיר / משך" is a header row too; without
// these words it was imported as a service literally named "טיפול".
const HEADER_WORDS = ["שם","טלפון","נייד","מייל","אימייל","הערות","כתובת","תאריך","לידה","עור","אלרגי","רפואי",
                      "name","phone","mobile","email","notes","address","birthday","date","client","customer",
                      "טיפול","שירות","מחיר","עלות","משך","דקות","זמן",
                      "service","treatment","price","cost","duration","min",
                      "שעה","לקוחה","hour","time"];
const detectHeaderRow = (rows) => {
  const first = rows[0]; if (!first) return false;
  const hasHeaderWord = first.some(c => HEADER_WORDS.some(w => String(c).toLowerCase().includes(w)));
  const hasPhone = first.some(looksLikePhone);
  // A header row never carries a bare number. This is what stops a real
  // service called "טיפול פנים" being eaten as a header just because it
  // contains the word טיפול - its row also holds a price, so it is data.
  const hasNumber = first.some(isNumericCell);
  return hasHeaderWord && !hasPhone && !hasNumber;
};

// Pre-guess each column: by header text when there is one, otherwise by what
// the cells look like. The first text-ish column becomes the name.
const guessColumns = (rows, hasHeader) => {
  const { length: width } = rows[0] || [];
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  let nameTaken = false, phoneTaken = false;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);
    const phoneish = cells.length && cells.filter(looksLikePhone).length >= cells.length*0.6;

    if (!phoneTaken && (/טלפון|נייד|phone|mobile/.test(head) || (!head && phoneish))) { guess[c]="phone"; phoneTaken=true; continue; }
    if (!nameTaken && (/שם|name|client|customer/.test(head) || (!head && !phoneish && cells.length))) { guess[c]="name"; nameTaken=true; continue; }
    if (/לידה|birthday|תאריך|date/.test(head)) { guess[c]="birthday"; continue; }
    if (/עור|skin/.test(head)) { guess[c]="skinType"; continue; }
    if (/אלרגי|allerg/.test(head)) { guess[c]="allergies"; continue; }
    if (/רפואי|medical/.test(head)) { guess[c]="medical"; continue; }
    if (/הערות|notes|comment/.test(head)) { guess[c]="notes"; continue; }
  }
  return guess;
};

// Column guessing for a services paste. Headers win when present. Without
// them, numbers are split by magnitude: a treatment is far more likely to cost
// 250 than to last 250 minutes, and to last 45 than to cost 45.
const guessServiceColumns = (rows, hasHeader) => {
  const width = (rows[0] || []).length;
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  let nameTaken = false, priceTaken = false, durTaken = false;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);
    const numeric = cells.length && cells.filter(isNumericCell).length >= cells.length*0.6;
    const nums = cells.map(parseMoney).filter(n=>n!==null);
    const median = nums.length ? nums.slice().sort((a,b)=>a-b)[Math.floor(nums.length/2)] : 0;

    if (!priceTaken && (/מחיר|price|₪|עלות|תשלום/.test(head))) { guess[c]="price"; priceTaken=true; continue; }
    if (!durTaken && (/משך|דקות|duration|min|זמן/.test(head)))  { guess[c]="duration"; durTaken=true; continue; }
    if (!nameTaken && (/שם|טיפול|שירות|name|service|treatment/.test(head))) { guess[c]="name"; nameTaken=true; continue; }
    if (head) continue; // a labelled column we did not recognise stays ignored

    if (numeric) {
      // Durations cluster low and in round steps; prices sit higher.
      if (!durTaken && median <= 200) { guess[c]="duration"; durTaken=true; continue; }
      if (!priceTaken) { guess[c]="price"; priceTaken=true; continue; }
      continue;
    }
    if (!nameTaken && cells.length) { guess[c]="name"; nameTaken=true; }
  }
  return guess;
};

// Apply a services mapping. Price and duration fall back to the column
// defaults (0 and 60) rather than guessing, so a blank cell never invents a
// number she would have to hunt down later.
const buildServiceRows = (grid, cols, hasHeader) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0;
  for (const r of body) {
    const rec = { name:"", price:0, duration:60, active:true };
    let hasName = false;
    cols.forEach((field, i) => {
      const v = String(r[i]||"").trim();
      if (field === "ignore" || !field || !v) return;
      if (field === "name")     { rec.name = v; hasName = true; }
      if (field === "price")    { const n = parseMoney(v);   if (n !== null) rec.price = n; }
      if (field === "duration") { const n = parseMinutes(v); if (n !== null) rec.duration = n; }
    });
    if (!hasName) { noName++; continue; }
    out.push(rec);
  }
  return { rows: out, noName };
};

// Apply the mapping. Rows with no name are dropped — a client record without
// a name is not usable, and silently creating blanks is worse than skipping.
const buildImportRows = (grid, cols, hasHeader) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0;
  for (const r of body) {
    const rec = {};
    cols.forEach((field, i) => {
      if (field === "ignore" || !field) return;
      const v = String(r[i]||"").trim();
      if (!v) return;
      rec[field] = field === "phone" ? v.replace(/[^\d+]/g,"") : v;
    });
    if (!rec.name) { noName++; continue; }
    out.push(rec);
  }
  return { rows: out, noName };
};
// "12/08/2026", "12.8.26", "2026-08-12" -> "2026-08-12". Day-first, because
// that is what Israeli exports produce. The wizard says so on screen rather
// than sniffing per row, which would be right most of the time and silently
// wrong for the rest - 03/04 is a real date either way round.
const parseImportDate = (s) => {
  const m = String(s||"").trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let y, mo, d;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }  // ISO, year first
  else { d = +m[1]; mo = +m[2]; y = +m[3]; }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  // Rejects 31/02 and friends: the Date constructor rolls them into March
  // instead of failing, so compare the parts back.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return formatDate(dt);
};

// "14:30" -> 870 minutes from midnight. Also reads "14.30", "14", "2pm", "2 am".
// Returns null on anything it cannot parse, so the caller counts the row instead
// of inventing a time for it.
//
// Nothing is rounded: start_minute holds the real minute. This used to return the
// nearest whole hour plus a `rounded` flag, and the caller tallied how many rows
// it had moved, because appointments.hour could not represent anything else.
const parseImportTime = (s) => {
  const t = String(s||"").trim().toLowerCase();
  let h, min = 0;
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) { h = +m[1]; min = +m[2]; }
  else {
    m = t.match(/^(\d{1,2})\s*(am|pm)?$/);
    if (!m) return null;
    h = +m[1];
    if (m[2] === "pm" && h < 12) h += 12;
    if (m[2] === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return { startMinute: h * 60 + min };
};

// Column guessing for an appointments paste. Headers win; without them the
// shape of the cells decides, date and time before phone so a "12/08/2026"
// column is never mistaken for something else.
const guessApptColumns = (rows, hasHeader) => {
  const width = (rows[0] || []).length;
  const body = hasHeader ? rows.slice(1) : rows;
  const guess = new Array(width).fill("ignore");
  const taken = {};
  const mostly = (cells, fn) => cells.length && cells.filter(fn).length >= cells.length * 0.6;

  for (let c = 0; c < width; c++) {
    const head = hasHeader ? String(rows[0][c]||"").toLowerCase() : "";
    const cells = body.map(r=>r[c]).filter(Boolean);

    if (!taken.date     && /תאריך|date/.test(head))                    { guess[c]="date";     taken.date=1;     continue; }
    if (!taken.time     && /שעה|time|hour/.test(head))                 { guess[c]="time";     taken.time=1;     continue; }
    if (!taken.phone    && /טלפון|נייד|phone|mobile/.test(head))       { guess[c]="phone";    taken.phone=1;    continue; }
    if (!taken.name     && /שם|לקוח|name|client|customer/.test(head))  { guess[c]="name";     taken.name=1;     continue; }
    if (!taken.service  && /טיפול|שירות|service|treatment/.test(head)) { guess[c]="service";  taken.service=1;  continue; }
    if (!taken.duration && /משך|דקות|duration|min/.test(head))         { guess[c]="duration"; taken.duration=1; continue; }
    if (!taken.price    && /מחיר|price|עלות|₪/.test(head))             { guess[c]="price";    taken.price=1;    continue; }
    if (!taken.notes    && /הערות|notes|comment/.test(head))           { guess[c]="notes";    taken.notes=1;    continue; }
    if (head) continue; // a labelled column we did not recognise stays ignored

    if (!taken.date  && mostly(cells, looksLikeDate))  { guess[c]="date";  taken.date=1;  continue; }
    if (!taken.time  && mostly(cells, looksLikeTime))  { guess[c]="time";  taken.time=1;  continue; }
    if (!taken.phone && mostly(cells, looksLikePhone)) { guess[c]="phone"; taken.phone=1; continue; }
    if (mostly(cells, isNumericCell)) {
      // Same split as the price list: a treatment lasts 45 far more often than
      // it costs 45, and costs 250 far more often than it lasts 250.
      const nums = cells.map(parseMoney).filter(n=>n!==null);
      const median = nums.length ? nums.slice().sort((a,b)=>a-b)[Math.floor(nums.length/2)] : 0;
      if (!taken.duration && median <= 200) { guess[c]="duration"; taken.duration=1; continue; }
      if (!taken.price) { guess[c]="price"; taken.price=1; continue; }
      continue;
    }
    if (!cells.length) continue;
    if (!taken.name)    { guess[c]="name";    taken.name=1;    continue; }
    if (!taken.service) { guess[c]="service"; taken.service=1; continue; }
  }
  return guess;
};

// Apply an appointments mapping. Future only: anything already past is counted
// and dropped, so a full export can be pasted as-is without back-filling a year
// of history nobody asked for.
//
// Counters are committed only for rows that actually survive: tallying during
// parsing would report on hundreds of skipped historical rows she never sees.
//
// nowMinute is minutes from midnight. Comparing on the hour would have dropped
// a 14:30 booking as "past" at 14:05, and kept one at 14:00 that had already
// started.
const buildApptRows = (grid, cols, hasHeader, todayStr, nowMinute, knownServices) => {
  const body = hasHeader ? grid.rows.slice(1) : grid.rows;
  const out = [];
  let noName = 0, noDate = 0, past = 0, noTime = 0, nameIsService = 0;
  const nameIsServiceSamples = [];

  for (const r of body) {
    const rec = { date:"", startMinute:null, name:"", phone:"", service:"", duration:60, price:0, note:"" };
    let badDate = false, timeSeen = false, timeBad = false;

    cols.forEach((field, i) => {
      const v = String(r[i]||"").trim();
      if (field === "ignore" || !field || !v) return;
      if (field === "date")     { const d = parseImportDate(v); if (d) rec.date = d; else badDate = true; }
      if (field === "time")     { timeSeen = true; const t = parseImportTime(v);
                                  if (t) rec.startMinute = t.startMinute;
                                  else timeBad = true; }
      if (field === "name")     rec.name = v;
      if (field === "phone")    rec.phone = v.replace(/[^\d+]/g,"");
      if (field === "service")  rec.service = v;
      if (field === "duration") { const n = parseMinutes(v); if (n !== null) rec.duration = n; }
      if (field === "price")    { const n = parseMoney(v);   if (n !== null) rec.price = n; }
      if (field === "notes")    rec.note = v;
    });

    if (!rec.name) { noName++; continue; }

    // A row whose "client name" is one of her own treatments is a mis-mapped
    // column, not a booking. This really happened: a paste that led with the
    // treatment put "עיצוב גבות" in the name column, which then created a
    // CLIENT called עיצוב גבות and an appointment greeting her by treatment
    // name. Rejecting the row also stops the bogus client being created,
    // because clients are minted from these rows downstream.
    if (knownServices && knownServices.has(rec.name.trim())) {
      nameIsService++;
      if (nameIsServiceSamples.length < 3) nameIsServiceSamples.push(rec.name.trim());
      continue;
    }

    if (!rec.date || badDate) { noDate++; continue; }
    // No time column, or one this cannot read: park it at the start of the day
    // rather than dropping a real booking. Counted so the preview can say so.
    // `hour` is not carried on the record: startFields() derives it from
    // startMinute at insert time, so there is one source of truth for the start.
    if (rec.startMinute === null) {
      if (timeSeen && timeBad) noTime++;
      rec.startMinute = 9 * 60;
    }
    if (rec.date < todayStr || (rec.date === todayStr && rec.startMinute < nowMinute)) { past++; continue; }

    out.push(rec);
  }
  return { rows: out, noName, noDate, past, noTime, nameIsService, nameIsServiceSamples };
};

// Everything that differs between the three imports, in one place. The wizard
// itself - paste box, mapping table, preview, result - is identical for all of
// them, and was starting to grow a ternary per target.
const IMPORT_SPEC = {
  clients: {
    fields: IMPORT_FIELDS, guess: guessColumns, requires: ["name"], unit: "לקוחות",
    title: "ייבוא לקוחות",
    blurb: "יש לך רשימת לקוחות בתוכנה אחרת? ייצאי אותה לאקסל, סמני את העמודות, העתיקי והדביקי כאן. בשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל לקוחה):",
    placeholder: "דנה כהן\t0541234567\nמיכל לוי\t0529876543",
  },
  services: {
    fields: SERVICE_IMPORT_FIELDS, guess: guessServiceColumns, requires: ["name"], unit: "טיפולים",
    title: "ייבוא טיפולים ומחירים",
    blurb: "יש לך מחירון בתוכנה אחרת או באקסל? העתיקי את העמודות והדביקי כאן. בשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל טיפול):",
    placeholder: "טיפול פנים\t250\t60\nעיצוב גבות\t80\t30",
  },
  appts: {
    fields: APPT_IMPORT_FIELDS, guess: guessApptColumns, requires: ["name","date"], unit: "תורים",
    title: "ייבוא תורים עתידיים",
    blurb: "מעבירים רק תורים שעוד לא היו — היסטוריה לא מיובאת. ייצאי את היומן לאקסל, העתיקי והדביקי כאן, ובשלב הבא תבחרי מה כל עמודה מייצגת.",
    rowLabel: "הדביקי כאן (שורה לכל תור):",
    placeholder: "12/08/2026\t14:30\tדנה כהן\t0541234567\tטיפול פנים",
  },
};

// Manually added leads start at "new", the same entry status the Facebook
// webhook writes, so both intake paths begin in one place.
const emptyLead = {name:"",phone:"",source:"פייסבוק",service_interest:"",status:"new",notes:"",reminder_date:""};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function BeautyOS() {
  const router = useRouter();

  // === DATA STATES ===
  const [appointments, setAppointments] = useState([]);
  const [clients,      setClients]      = useState([]);
  const [forms,        setForms]        = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [receipts,     setReceipts]     = useState([]);
  const [expenses,     setExpenses]     = useState([]);
  const [services,     setServices]     = useState([]);
  const [packages,     setPackages]     = useState([]);
  const [waitlist,     setWaitlist]     = useState([]);
  const [settings,     setSettings]     = useState({business_name:"",therapist_name:"",primary_color:"#D98BA0",working_hours_start:8,working_hours_end:19,business_phone:""});

  // === UI STATES ===
  const [weekStart,         setWeekStart]         = useState(new Date());
  // Mobile calendar: "day" = single-day agenda (default on phones), "week" = the
  // desktop grid. Toggle is mobile-only; on desktop calView stays "day" and the
  // desktop-only week grid always renders, so the desktop calendar is unchanged.
  const [calView,           setCalView]           = useState("day");
  const [calDay,            setCalDay]            = useState(new Date()); // selected day for the mobile agenda
  const [showModal,         setShowModal]          = useState(false);
  const [showClientModal,   setShowClientModal]    = useState(false);
  const [showImportModal,   setShowImportModal]    = useState(false);
  const [importText,        setImportText]         = useState("");
  const [importing,         setImporting]          = useState(false);
  // Import wizard: paste -> map -> done. importCols holds one field id per
  // pasted column; importResult holds the counts shown after the run.
  const [importStage,       setImportStage]        = useState("paste");
  const [importCols,        setImportCols]         = useState([]);
  const [importHasHeader,   setImportHasHeader]    = useState(false);
  const [importResult,      setImportResult]       = useState(null);
  // Which table the wizard is filling. The stages, parser and result panel are
  // shared; only the field list, row builder and insert target differ.
  const [importTarget,      setImportTarget]       = useState("clients"); // clients | services
  // The single import entry point. Reachable from Settings and from
  // onboarding, so there is one obvious way in rather than buttons scattered
  // across the screens that happen to show each kind of data.
  const [showImportHub,     setShowImportHub]      = useState(false);
  const [showLeadModal,     setShowLeadModal]      = useState(false);
  const [showSettings,      setShowSettings]       = useState(false);
  const [showCashier,       setShowCashier]        = useState(false);
  const [showReceipt,       setShowReceipt]        = useState(null);
  const [showPackageModal,  setShowPackageModal]   = useState(false);
  const [showWaitlistModal, setShowWaitlistModal]  = useState(false);
  const emptyProtocol = {brand:"",name:"",concern:"",skin_types:[],frequency:"",sessions_count:1,duration_minutes:60,price:0,notes:""};
  const [newProtocol,      setNewProtocol]      = useState(emptyProtocol);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [editingClient,     setEditingClient]      = useState(null);
  const [editingLead,       setEditingLead]        = useState(null);
  const [selectedClient,    setSelectedClient]     = useState(null);
  const [selectedLead,      setSelectedLead]       = useState(null);
  // Facebook campaigns (live ad performance)
  const [fbCampaigns,    setFbCampaigns]    = useState(null);
  const [fbTotals,       setFbTotals]       = useState(null);
  const [fbLoading,      setFbLoading]      = useState(false);
  const [fbError,        setFbError]        = useState(null);
  const [fbDatePreset,   setFbDatePreset]   = useState("last_30d");
  // Connected Facebook page for THIS tenant (row from facebook_pages), or null if not connected
  const [fbPage,         setFbPage]         = useState(null);
  // AI content generator (posts)
  const [postGoal,       setPostGoal]       = useState("");
  const [postVariations, setPostVariations] = useState(null);
  const [postStrategy,   setPostStrategy]   = useState(null);
  const [postLoading,    setPostLoading]    = useState(false);
  const [postError,      setPostError]      = useState(null);
  const [groups,         setGroups]         = useState(null);
  const [groupsLoading,  setGroupsLoading]  = useState(false);
  const [groupsError,    setGroupsError]    = useState(null);
  const [savedCampaigns, setSavedCampaigns] = useState(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  // AI business advisor chat
  const [advisorMessages, setAdvisorMessages] = useState(null); // null = not loaded yet
  const [advisorInput,    setAdvisorInput]    = useState("");
  const [advisorSending,  setAdvisorSending]  = useState(false);
  // Subscription plan of the logged-in business: none | basic | pro | premium.
  // Loaded in loadAll; NOT used to gate anything yet.
  const [currentPlan,     setCurrentPlan]     = useState("none");
  // Raw trial/subscription columns from the tenants row (plan_status, trial
  // dates, plan_price, signup_source). null until loadAll resolves, or when the
  // row cannot be read at all -- which planState() treats as "not blocked".
  const [planRow,         setPlanRow]         = useState(null);
  // Tax-report screen controls
  const [taxYear,        setTaxYear]       = useState(new Date().getFullYear());
  const [taxPeriodMode,  setTaxPeriodMode] = useState("bimonthly"); // monthly | bimonthly
  const [taxPeriodIdx,   setTaxPeriodIdx]  = useState(Math.floor(new Date().getMonth()/2));
  const [newExpense,     setNewExpense]    = useState({amount:"",expense_date:new Date().toISOString().slice(0,10),description:"",category:"materials"});
  // Beauty Voice
  const [showVoice,      setShowVoice]     = useState(false);
  const [voiceStatus,    setVoiceStatus]   = useState("listening"); // listening|processing|result|error|unsupported
  const [voiceTranscript,setVoiceTranscript]=useState("");
  const [voiceIntent,    setVoiceIntent]   = useState(null);
  const [voiceErr,       setVoiceErr]      = useState("");
  const [voiceBooking,   setVoiceBooking]  = useState(null); // editable draft before confirm
  const [voiceInfo,      setVoiceInfo]     = useState(null); // read-only result (day / revenue)
  const [voiceCancel,    setVoiceCancel]   = useState(null); // { matches:[], selected: appt|null }
  const [voiceCall,      setVoiceCall]     = useState(null); // { matches:[], selected: client|null }
  const [voiceReceipt,   setVoiceReceipt]  = useState(null); // { clientName, amount, payment }
  const recognitionRef = useRef(null);
  const [aiPostsView,    setAiPostsView]    = useState("create"); // create | saved | reels
  // AI reel generator
  const [reelTopic,   setReelTopic]   = useState("");
  const [reelData,    setReelData]    = useState(null);
  const [reelLoading, setReelLoading] = useState(false);
  const [reelError,   setReelError]   = useState(null);
  const [marketingView,  setMarketingView]  = useState("campaigns"); // campaigns | ai
  // WhatsApp tab sub-views: the send tools, or the log of what was already sent.
  const [waView,         setWaView]         = useState("send"); // send | log
  const [waMessages,     setWaMessages]     = useState(null);   // null = not loaded yet
  const [waLogLoading,   setWaLogLoading]   = useState(false);
  const [waLogError,     setWaLogError]     = useState("");
  const [activeTab,         setActiveTab]          = useState("dashboard");
  const [clientTab,         setClientTab]          = useState("info");
  const [scanLoading,       setScanLoading]        = useState(false);
  const [scanStep,          setScanStep]           = useState(0);
  const [scanReport,        setScanReport]         = useState(null);
  const [clientScans,       setClientScans]        = useState([]);
  const [clientPhotos,      setClientPhotos]       = useState([]);
  const [photoUploading,    setPhotoUploading]     = useState(false);
  const [scansLoading,      setScansLoading]       = useState(false);
  const [viewScan,          setViewScan]           = useState(null);
  const [communityPosts,    setCommunityPosts]     = useState([]);
  const [protocols,         setProtocols]         = useState([]);
  const [protocolsLoading,  setProtocolsLoading]   = useState(false);
  const [communityLoading,  setCommunityLoading]   = useState(false);
  const [showPostModal,     setShowPostModal]      = useState(false);
  const [designPost,        setDesignPost]         = useState(null);
  const [designing,         setDesigning]          = useState(false);
  const [designBg,          setDesignBg]           = useState(null);
  const [newPost,           setNewPost]            = useState({title:"",body:"",post_type:"update",cta_label:"",image_url:""});
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [savingPost,        setSavingPost]         = useState(false);
  const [settingsTab,       setSettingsTab]        = useState("general");
  const [leadFilter,        setLeadFilter]         = useState("all");
  const [leadSearch,        setLeadSearch]         = useState("");
  const [leadSourceFilter,  setLeadSourceFilter]   = useState("all");
  // --- Bulk WhatsApp send (per status group) ---
  // bulkStatus = status key being composed for (null = closed modal).
  // bulkStep walks: compose -> confirm -> sending -> result. Nothing is sent
  // until the explicit "confirm" step, which shows the real recipient count.
  const [bulkStatus,        setBulkStatus]         = useState(null);
  const [bulkMessage,       setBulkMessage]        = useState("");
  const [bulkStep,          setBulkStep]           = useState("compose");
  const [bulkResult,        setBulkResult]         = useState(null);
  const [bulkError,         setBulkError]          = useState("");
  // Non-null = send to these lead ids only (the per-lead one-click send).
  // Null = the whole status group, which is the original behavior.
  const [bulkLeadIds,       setBulkLeadIds]        = useState(null);
  const [hoveredAppt,       setHoveredAppt]        = useState(null);
  const [loading,           setLoading]            = useState(true);
  // Non-null when a core read in loadAll FAILED. Distinct from "she has no
  // data": empty state is only ever allowed to mean empty. Renders a
  // full-screen explanation with a retry, instead of an empty dashboard.
  const [loadError,         setLoadError]          = useState(null);
  // -- "תקועה?" -- reaching a human from anywhere in the app ------------------
  // Until now the only route to support was the WhatsApp link on the trial
  // banner, which only appears when her PLAN needs attention. Someone stuck on
  // day three with a perfectly healthy plan had nowhere to go.
  const [showHelp,          setShowHelp]           = useState(false);
  const [helpText,          setHelpText]           = useState("");
  const [helpState,         setHelpState]          = useState("idle"); // idle|sending|sent|failed

  const sendHelp = useCallback(async () => {
    const message = helpText.trim();
    if (!message || helpState === "sending") return;
    setHelpState("sending");
    // The last error her browser reported, so a vague "it broke" can still be
    // traced to a real stack. Guarded: telemetry must never break the send.
    let sentryEventId = null;
    try { sentryEventId = (Sentry.lastEventId && Sentry.lastEventId()) || null; } catch { /* ignore */ }
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          tab: activeTab,
          appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev",
          sentryEventId,
        }),
      });
      const data = await res.json().catch(() => null);
      // Success is rendered ONLY on an explicit success from the server. A
      // "we got your message" that reached nobody is worse than an error: she
      // stops asking and waits for a reply that is never coming.
      if (res.ok && data && data.success) { setHelpState("sent"); return; }
      setHelpState("failed");
    } catch {
      setHelpState("failed");
    }
  }, [helpText, helpState, activeTab]);
  const [uploading,         setUploading]          = useState(false);
  const [searchQuery,       setSearchQuery]        = useState("");
  const [globalSearch,      setGlobalSearch]       = useState("");
  const [filterStatus,      setFilterStatus]       = useState("all");
  const [filterSkin,        setFilterSkin]         = useState("all");
  const [receiptFilter,     setReceiptFilter]      = useState("all");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  // Bottom-bar "עוד" sheet: holds the tabs that do not fit in the bar itself.
  const [showMoreSheet,     setShowMoreSheet]     = useState(false);
  // Viewport width, for the things CSS cannot reach - currently the floral
  // opacity, which is an SVG prop rather than a style.
  //
  // MUST stay up here with the other hooks. This pair originally sat beside
  // floralOpacity further down, which is AFTER `if (loading) return (...)`:
  // the first render bailed out before reaching them, the render after the data
  // arrived did reach them, and React saw the hook count grow from N to N+2 and
  // tore the tree down with "Rendered more hooks than during the previous
  // render". Blank screen for every user, desktop included. tsc cannot see this,
  // so the build passed and only the runtime broke.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width:680px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // Onboarding sends her here with /?import=1 when she says she has data to
  // bring across, so that step and the Settings tab open the same screen.
  // She picks WHAT to import while still in onboarding, so &kind=... skips the
  // chooser and opens that wizard straight away rather than asking her twice.
  // The params are stripped afterwards so a refresh does not reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("import") === "1") {
      const kind = p.get("kind");
      if (kind && Object.prototype.hasOwnProperty.call(IMPORT_SPEC, kind)) {
        setImportTarget(kind);
        setShowImportModal(true);
      } else {
        setShowImportHub(true);
      }
      p.delete("import");
      p.delete("kind");
      const qs = p.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // Escape closes the sheet, matching every other overlay in the app.
  useEffect(() => {
    if (!showMoreSheet) return;
    const onKey = (e) => { if (e.key === "Escape") setShowMoreSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMoreSheet]);
  // Unified approval queue: session-local set of dismissed item keys (Reject).
  const [queueDismissed,    setQueueDismissed]    = useState(()=>new Set());
  const [queueApproved,     setQueueApproved]     = useState(()=>new Set()); // mocked-approved skin keys (double-click guard)
  const [skinQueue,         setSkinQueue]         = useState(null);          // skin-followup suggestions from the route (null=not loaded)
  const [skinQueueLoading,  setSkinQueueLoading]  = useState(false);
  const [skinQueueError,    setSkinQueueError]    = useState(null);
  const [skinEdits,         setSkinEdits]         = useState({});            // key -> edited message (local/test only)
  const [skinOpen,          setSkinOpen]          = useState(()=>new Set()); // keys with the message preview/edit expanded

  // === FORM STATES ===
  const [newAppt,    setNewAppt]    = useState({clientId:"",name:"",service:"",duration:60,date:formatDate(new Date()),hour:9,price:0});
  const [newClient,  setNewClient]  = useState(emptyClient);
  const [newLead,    setNewLead]    = useState(emptyLead);
  const [apptNote,   setApptNote]   = useState("");
  // When set, the appointment modal is in EDIT mode for this appointment id
  // (reschedule/edit an existing row) rather than CREATE mode. Reset to null on
  // every close so the modal never opens stale in edit mode.
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [editSettings,   setEditSettings]   = useState(null);
  const [brandUploading, setBrandUploading] = useState(""); // which branding asset is uploading
  const [newService,     setNewService]     = useState({name:"",price:0,duration:60,color:DEFAULT_SERVICE_COLOR,active:true});
  const [showNewService, setShowNewService] = useState(false);
  const [showSetup, setShowSetup] = useState(false); // always-accessible setup checklist modal
  const [cashierAppt,     setCashierAppt]     = useState(null);
  const [cashierClient,   setCashierClient]   = useState(null);
  const [cashierSearch,   setCashierSearch]   = useState("");
  const [cashierItems,    setCashierItems]    = useState([]);
  const [cashierDiscount, setCashierDiscount] = useState(0);
  const [paymentMethod,   setPaymentMethod]   = useState("מזומן");
  const [cashierNote,     setCashierNote]     = useState("");
  const [newPackage,  setNewPackage]  = useState({client_id:"",client_name:"",service:"",total_sessions:5,price:0});
  // Change-password form (Settings → כללי). Independent of handleSaveSettings.
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [newWaitlist, setNewWaitlist] = useState({client_id:"",client_name:"",phone:"",service:"",preferred_date:"",notes:""});

  // === WHATSAPP CENTER STATE ===
  const [waSentToday, setWaSentToday] = useState({});
  const [waBroadcastMsg, setWaBroadcastMsg] = useState("");
  const [waBroadcastAudience, setWaBroadcastAudience] = useState("all");
  const [waFreeClient, setWaFreeClient] = useState(null);
  const [waFreeSearch, setWaFreeSearch] = useState("");
  const [waFreeMsg, setWaFreeMsg] = useState("");

  // === UX SYSTEMS: Toasts, Confirm, Busy ===
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [busy, setBusy] = useState({});

  // `action` (optional): { label, onClick } renders a button inside the toast
  // (e.g. "ביטול" for undo). Toasts with an action linger a bit longer.
  const toast = useCallback((msg, type = "success", action = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 5500 : 3500);
  }, []);

  // Keyboard activation for clickable elements that aren't native buttons:
  // Enter/Space triggers the element's own onClick (via .click()).
  const onKbdActivate = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
  };

  const askConfirm = useCallback((opts) => {
    setConfirmDialog({
      title: opts.title || "אישור",
      message: opts.message || "האם את בטוחה?",
      confirmText: opts.confirmText || "אישור",
      cancelText: opts.cancelText || "ביטול",
      danger: opts.danger || false,
      onConfirm: opts.onConfirm,
    });
  }, []);

  const setBusyKey = useCallback((key, val) => {
    setBusy(prev => {
      if (val) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const isBusy = useCallback((key) => !!busy[key], [busy]);

  // Is this a lost connection rather than a database refusal? The two look
  // nothing alike to her and must never be reported the same way.
  const isConnectionError = useCallback((err) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    const m = String(err?.message || "");
    // The browsers' own wording, which differs per engine:
    //   Chrome "Failed to fetch" | Safari "Load failed"
    //   Firefox "NetworkError when attempting to fetch resource"
    return /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet_disconnected/i.test(m);
  }, []);

  const handleDbError = useCallback((err, context = "") => {
    console.error(`[BeautyOS DB error] ${context}:`, err);
    // A LOST CONNECTION IS NOT A DATABASE ERROR.
    //
    // Offline, supabase-js hands back the browser's own English string, and the
    // fallback at the bottom of this function printed it raw:
    //     "שגיאה: Failed to fetch"
    // In an otherwise all-Hebrew app that reads as a broken system rather than a
    // dropped signal, tells her nothing about what to do, and gives her no
    // reason to believe her half-typed client is still safe on the screen
    // behind the toast. It is - every save handler returns before clearing its
    // form - so the message should say so.
    if (isConnectionError(err)) {
      toast("אין חיבור לאינטרנט. שום דבר לא אבד, והפרטים שהזנת עדיין כאן. נסי לשמור שוב כשהחיבור יחזור.", "error");
      return;
    }
    // A row-level-security denial on a write is exactly what the read-only gate
    // looks like from the browser. Translate it into the shared Hebrew
    // explanation rather than surfacing a raw Postgres string. This is the
    // safety net for any write path that guardWrite() does not cover, so no
    // blocked write can ever show her an unexplained error. Detection is by
    // error code/message only, so it stays correct regardless of plan state.
    const code = err?.code || "";
    const message = String(err?.message || "");
    if (code === "42501" || /row-level security|violates row-level/i.test(message)) {
      toast(WRITE_BLOCKED_TOAST_HE, "error");
      return;
    }
    // The double-booking guarantees, in her language rather than Postgres's.
    //   23505 uniq_appt_slot_active   - same start minute.
    //   23P01 appointments_no_overlap - overlapping range, e.g. a 14:30+30
    //         dropped inside an existing 14:00+60.
    // Both mean the same thing to her, and both are only reachable when the
    // in-app overlap check lost a race with another writer (her phone and her
    // laptop, or a client self-booking at the same moment) - so the raw
    // constraint name would be the first she ever heard of it.
    if (code === "23505" || code === "23P01") {
      toast("השעה הזו כבר תפוסה. נא לבחור שעה אחרת.", "error");
      return;
    }
    toast(`שגיאה: ${message || "פעולה נכשלה"}`, "error");
  }, [toast, isConnectionError]);

  const handleLogout = useCallback(() => {
    askConfirm({
      title: "התנתקות",
      message: "האם להתנתק מהמערכת?",
      confirmText: "התנתקי",
      onConfirm: async () => {
        try {
          setBusyKey("logout", true);
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        } catch (err) {
          handleDbError(err, "logout");
          setBusyKey("logout", false);
        }
      },
    });
  }, [askConfirm, handleDbError, router, setBusyKey]);

  // === COMPUTED ===
  const weekDates = getWeekDates(weekStart);
  const now    = new Date();
  const today  = formatDate(now);
  const tomorrow = formatDate(new Date(now.getTime()+86400000));
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const lastMonth = thisMonth===0?11:thisMonth-1;
  const lastMonthYear = thisMonth===0?thisYear-1:thisYear;
  // Brand accent. Default is the BloomOS deep-plum (#5B3E67) so the whole app
  // wears the premium lavender/plum palette out of the box; a tenant may still
  // pick her own color in Settings (hybrid theming) and everything re-tints.
  const pc = (settings&&settings.primary_color)||"#5B3E67";
  // Derived theme shades from the chosen primary color, so the whole app
  // recolors when the cosmetician picks a color in settings.
  // hexToRgb / lighten / darken now live in lib/theme.ts so every page can use
  // the same derivation. Same maths, same output - see the imports at the top.
  const pcRgb = hexToRgb(pc);
  const pc2 = lighten(pc, 0.22);                 // lighter partner for gradients
  const pcDeep = darken(pc, 0.16);               // deeper partner for premium depth
  const pcSoft = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.10)`;  // soft tint backgrounds
  const pcTint = lighten(pc, 0.90);                              // light selected/hover bg
  const pcTint2 = lighten(pc, 0.82);                             // slightly stronger tint
  const pcGrad = `linear-gradient(135deg,${pc2} 0%,${pcDeep} 100%)`;  // elegant diagonal
  const pcShadow = `rgba(${pcRgb.r},${pcRgb.g},${pcRgb.b},0.28)`;

  // ── TRIAL / SUBSCRIPTION STATE ──────────────────────────────────────────
  //    Derived from the tenants row loaded in loadAll, and rendered by
  //    <TrialBanner/> inside <main>. Phase 3 adds the access gate; today this
  //    state only decides what the banner says.
  //    planState() fails OPEN: an unreadable row, a missing column or an
  //    unrecognised status all report an unblocked tenant with tone 'none', so
  //    no banner appears. Blocking only ever happens on a definite 'expired'
  //    or 'paused'.
  const planInfo = planState(planRow);

  // Read-only mode: an expired or paused tenant keeps FULL read access to her
  // calendar, clients and reports, and loses only the ability to write. Call
  // guardWrite() first in every mutating handler: it explains the situation in
  // Hebrew and returns true, meaning "stop here". The RLS restrictive policies
  // are the actual enforcement; this exists so she gets a clear explanation
  // instead of a failed request, and so no pointless round trip is made.
  const readOnly = planInfo.isBlocked;
  const guardWrite = useCallback(() => {
    if (!planInfo.isBlocked) return false;
    toast(WRITE_BLOCKED_TOAST_HE, "error");
    return true;
  }, [planInfo.isBlocked, toast]);

  // ── SETUP CHECKLIST — persistent, always-accessible. Each item auto-detects
  //    "done" from her real data and jumps straight to the right Settings tab
  //    (reuses the existing setEditSettings/setSettingsTab/setShowSettings jump). ──
  const openSetupTab = (tab, extra) => {
    setEditSettings({ ...settings });
    setSettingsTab(tab);
    if (extra === "newService") setShowNewService(true);
    setShowSettings(true);
    setShowSetup(false);
  };
  const _sb = (settings.branding && typeof settings.branding === "object") ? settings.branding : {};
  const setupSteps = [
    { key:"details",  done: !!(settings.business_name && settings.business_name.trim() && settings.business_name.trim()!=="העסק שלי") && !!(settings.business_phone && String(settings.business_phone).trim()), label:"פרטי העסק", hint:"שם וטלפון ליצירת קשר", onClick:()=>openSetupTab("general") },
    { key:"services", done: services.length>0, label:"שירותים ומחירים", hint:"רשימת הטיפולים והמחירים", onClick:()=>openSetupTab("services","newService") },
    { key:"hours",    done: !!(settings.business_hours && typeof settings.business_hours==="object" && Object.keys(settings.business_hours).length>0) || (settings.working_hours_start!=null && settings.working_hours_end!=null), label:"שעות פעילות", hint:"מתי העסק פתוח", onClick:()=>openSetupTab("hours") },
    { key:"branding", done: !!_sb.logo_url && !!settings.primary_color && !!(_sb.welcome_headline||_sb.welcome_message), label:"מיתוג", hint:"לוגו, צבעים וטקסט פתיחה", onClick:()=>openSetupTab("branding") },
    { key:"gallery",  done: Array.isArray(_sb.gallery) && _sb.gallery.length>0, label:"גלריית תמונות", hint:"תמונות לעמוד העסק", onClick:()=>openSetupTab("branding") },
    { key:"social",   done: !!(_sb.whatsapp_number||_sb.instagram||_sb.facebook||_sb.tiktok||_sb.website), label:"רשתות חברתיות וקישורים", hint:"וואטסאפ, אינסטגרם, אתר ועוד", onClick:()=>openSetupTab("branding") },
    { key:"whatsapp", done: !!(settings.green_api_instance && String(settings.green_api_instance).trim() && settings.green_api_token && String(settings.green_api_token).trim()), label:"חיבור וואטסאפ", hint:"לשליחת תזכורות והודעות אוטומטית", onClick:()=>openSetupTab("automations") },
  ];
  // Guided, one step at a time - deliberately NOT an accordion. Only the next
  // incomplete step can be opened; completed ones sit collapsed with their tick
  // and the ones beyond the next are visible but not yet actionable. Everything
  // starts collapsed, so the card is a short list of single lines instead of
  // seven expanded blocks.
  const nextSetupKey = (setupSteps.find(s=>!s.done)||{}).key || null;
  // Holds the key she expanded, not a boolean. Once that step is completed the
  // key stops matching nextSetupKey on its own, so the following step arrives
  // collapsed and no effect is needed to reset anything.
  const [expandedSetupKey, setExpandedSetupKey] = useState(null);

  const setupDone = setupSteps.filter(s=>s.done).length;
  const setupTotal = setupSteps.length;
  const setupPct = Math.round((setupDone/setupTotal)*100);
  const renderSetupBody = () => (
    <>
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
          <span style={{fontSize:12,fontWeight:700,color:pcDeep}}>{setupDone} מתוך {setupTotal} הושלמו</span>
          <span style={{fontSize:11,color:"var(--ink-3)"}}>{setupPct}%</span>
        </div>
        <div style={{height:8,borderRadius:20,background:pcTint,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${setupPct}%`,background:pcGrad,borderRadius:20,transition:"width 0.5s ease"}}/>
        </div>
      </div>
      {setupDone===setupTotal && (
        <div style={{textAlign:"center",padding:"6px 0 14px"}}>
          <p className="serif" style={{fontSize:18,fontWeight:600,color:pcDeep,marginBottom:3}}>הכל מוכן! ✨</p>
          <p style={{fontSize:11.5,color:"var(--ink-3)",lineHeight:1.5}}>המערכת שלך מוגדרת במלואה. אפשר לחזור לכאן בכל עת כדי לעדכן.</p>
        </div>
      )}
      {/* ONE bordered box with hairline-separated rows, not seven cards each
          with its own border, radius and 8px gap - that per-card chrome was
          most of the height. A row is now a single ~34px line: small ring,
          label, arrow. Completed steps keep a plain background and a green
          tick rather than a filled green row, which is what made the card read
          as a stack of blocks.
          One step is open at a time. The next incomplete step is emphasised
          (accent ring, bold label) but every incomplete step is tappable, so
          the arrow on each line does what it looks like it does. */}
      <div style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden"}}>
        {setupSteps.map((s,i)=>{
          const isNext = !s.done && s.key===nextSetupKey;
          const open   = !s.done && expandedSetupKey===s.key;
          return (
          <div key={s.key} style={{borderTop:i===0?"none":"1px solid var(--line)",background:open?pcTint:"transparent",transition:"background 0.18s"}}>
            {/* Collapsed line — always visible. */}
            <button
              onClick={()=>{ if(!s.done) setExpandedSetupKey(open?null:s.key); }}
              aria-expanded={s.done?undefined:open}
              disabled={s.done}
              style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 11px",background:"none",border:"none",fontFamily:"inherit",textAlign:"right",cursor:s.done?"default":"pointer"}}>
              <span style={{width:18,height:18,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:700,background:s.done?"var(--success)":"transparent",color:s.done?"var(--surface)":pc,border:s.done?"none":`1.5px solid ${isNext?pc:"var(--line-2)"}`}}>{s.done?"✓":""}</span>
              <span style={{flex:1,minWidth:0,fontSize:11.5,fontWeight:isNext?700:500,color:s.done?"var(--ink-2)":"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
              {s.done
                ?<span style={{fontSize:9.5,color:"var(--success)",fontWeight:700,flexShrink:0}}>✓ בוצע</span>
                :<span aria-hidden style={{fontSize:13,color:isNext?pc:"var(--ink-3)",flexShrink:0,display:"inline-block",transition:"transform 0.2s",transform:open?"rotate(-90deg)":"none"}}>←</span>}
            </button>

            {/* Expanded body — the hint and the action, revealed on request. */}
            {open&&(
              <div style={{padding:"0 11px 10px 11px",display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                <p style={{flex:1,minWidth:110,fontSize:10,color:"var(--ink-2)",lineHeight:1.5}}>{s.hint}</p>
                <button onClick={s.onClick} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:18,padding:"6px 14px",fontSize:10.5,fontWeight:600,flexShrink:0,whiteSpace:"nowrap",cursor:"pointer",fontFamily:"inherit"}}>הגדרה ←</button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </>
  );
  // Global-search result rows. Extracted because the search input now lives in
  // two places: inline in the header on desktop, and inside the nav drawer on
  // phones, where the header has no width to spare. Only the wrapper differs -
  // the header floats a dropdown over the page, the drawer lists them in flow.
  const renderSearchGroups = (onPick) => SEARCH_GROUPS.map(g=>{
    const rows=globalResults.filter(r=>r.type===g.type);
    if(rows.length===0) return null;
    return(
 <div key={g.type}>
 <div style={{padding:"9px 14px 5px",background:"var(--surface-2)",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:6,position:"sticky",top:0}}>
 <span style={{fontSize:9.5,fontWeight:700,color:"var(--ink-2)",letterSpacing:"0.03em"}}>{g.label}</span>
 <span style={{fontSize:9,color:"var(--ink-3)"}}>{rows.length}</span>
 </div>
        {rows.map((r,i)=>(
 <div key={g.type+i} onClick={()=>{ openSearchResult(r); if(onPick) onPick(); }} className="client-row"
          style={{padding:"9px 14px",borderBottom:"1px solid var(--line)",cursor:"pointer",display:"flex",gap:10,alignItems:"center"}}>
 <span style={{width:26,height:26,borderRadius:8,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"var(--pc)",background:"var(--pc-tint)"}}>{g.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11.5,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</p>
 <p style={{fontSize:9,color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</p>
 </div>
 </div>
        ))}
 </div>
    );
  });

  // Push the active palette into CSS variables for the static <style> block.
  // Shared with every other page via lib/theme.ts, which also derives
  // --pc-grad and --pc-contrast (readable text on the accent).
  applyAccentTokens(pc);
  const origin = typeof window!=="undefined"?window.location.origin:"";

  const activeServices = useMemo(() => services.filter(s=>s.active!==false), [services]);
  const workingHours = HOURS_ALL.slice(Math.max((settings?.working_hours_start||8)-7,0),Math.min((settings?.working_hours_end||19)-7,HOURS_ALL.length));
  const cashierTotal = Math.max(0,cashierItems.reduce((s,item)=>s+(item.price*item.qty),0)-Number(cashierDiscount||0));

  // --- New-appointment modal timing (STAGE A: live end time, STAGE B: per-day hours) ---
  // Day-of-week of the picked date, parsed as LOCAL (not UTC) so it never shifts
  // across the date line. Falls back to today's day if the string is malformed.
  const apptDay = (()=>{ const p=String(newAppt.date||"").split("-"); return p.length===3?new Date(Number(p[0]),Number(p[1])-1,Number(p[2])).getDay():new Date().getDay(); })();
  // That day's open/close from the per-day business_hours (null = closed that day).
  const apptDayHours = dayHoursFrom(settings, apptDay);
  // Bookable START hours for the day: open .. close-1 (can't start at closing time).
  // Half-hour granularity. slotsBetween also refuses any start whose treatment
  // would run past closing, which the old whole-hour list never checked.
  const APPT_SLOT_STEP = 30;
  const apptSlotOptions = apptDayHours ? slotsBetween(apptDayHours.open, apptDayHours.close, APPT_SLOT_STEP, Number(newAppt.duration)||0) : [];
  // Keep the shown hour inside the day's range even before the clamp effect runs,
  // so the label + select stay consistent when the date changes.
  // startMinute once the picker has set one; hour*60 for the eight call sites
  // that still construct newAppt with a whole hour, where hour N means N:00.
  const apptRequestedStart = newAppt.startMinute != null ? Number(newAppt.startMinute) : Number(newAppt.hour) * 60;
  const apptEffectiveStart = apptSlotOptions.includes(apptRequestedStart) ? apptRequestedStart : (apptSlotOptions.length ? apptSlotOptions[0] : apptRequestedStart);
  const fmtHM = (mins)=>`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(((mins%60)+60)%60).padStart(2,"0")}`;
  const apptStartMin = apptEffectiveStart;
  const apptEndMin = apptStartMin + Number(newAppt.duration||0);
  // --- STAGE C: block double-booking ---
  // Busy [start,end) minute-intervals already taken on the picked date. Cancelled
  // appointments free their slot (grid + gap-fill treat them as available), so
  // they are excluded here.
  // In EDIT mode, exclude the appointment being edited so it never flags itself
  // as a conflict (an appointment can't clash with its own current slot).
  const apptBusy = appointments
    .filter(a=>a.date===newAppt.date && a.confirmation_status!=="cancelled" && a.id!==editingAppointmentId)
    .map(a=>[startMinute(a), endMinute(a)]).filter(([s,e])=>s!==null&&e!==null);
  // Is a candidate start hour taken, given the currently selected duration?
  // Recomputes every render, so changing the duration re-evaluates the picker.
  const slotIsTaken = (m)=>{ const s=m, e=s+Number(newAppt.duration||0); return apptBusy.some(([bs,be])=>s<be&&bs<e); };
  // Is the START hour currently shown in the picker itself taken? Drives the
  // persistent inline warning + the disabled Save button (derived, so it stays
  // visible until the therapist picks a free time — no toast to disappear).
  const apptSelectedTaken = !!apptDayHours && apptSlotOptions.length>0 && slotIsTaken(apptEffectiveStart);
  // When the picked day changes and the current hour falls outside that day's
  // range, snap to the first open hour so a stale start can't be saved.
  useEffect(()=>{
    if(!showModal||!apptDayHours) return;
    if(!apptSlotOptions.includes(apptRequestedStart)) setNewAppt(prev=>({...prev,startMinute:apptSlotOptions[0],hour:Math.floor(apptSlotOptions[0]/60)}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showModal,newAppt.date,apptDayHours?.open,apptDayHours?.close]);

  // Mount only. loadAll is a plain function, recreated on every render, so
  // listing it here would re-run the whole eleven-table load on every render.
  // The previous directive was a BLOCK comment on this same line, so
  // "next-line" pointed at the blank line below and suppressed nothing - the
  // warning had been firing ever since.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ loadAll(); },[]);

  // Fetch existing Skin Follow-up suggestions into the unified queue when the
  // dashboard is shown. The route is tenant-scoped + auth-gated and returns an
  // empty queue when the automation is Off or the clinic is paused, so those
  // states naturally produce no actionable items. Nothing here sends anything.
  useEffect(()=>{
    if(activeTab!=="dashboard") return;
    let cancelled=false;
    setSkinQueueLoading(true); setSkinQueueError(null);
    fetch("/api/automations/skin-followup")
      .then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
      .then(d=>{ if(!cancelled) setSkinQueue(Array.isArray(d?.queue)?d.queue:[]); })
      .catch(()=>{ if(!cancelled){ setSkinQueue([]); setSkinQueueError("לא ניתן לטעון כרגע הצעות מעקב עור"); } })
      .finally(()=>{ if(!cancelled) setSkinQueueLoading(false); });
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeTab]);

  // Approve a Skin Follow-up suggestion — MOCKED test mode ONLY. Validates the
  // client still exists and has a phone, guards against double-clicks, and shows
  // a clear success state. It NEVER calls the WhatsApp send endpoint and never
  // sends a real message; production sending is a separate, gated step.
  const approveSkinFollowup = (it) => {
    if(queueApproved.has(it.key)) return; // double-click / repeated-approval guard
    const c = clients.find(x=>String(x.id)===String(it.clientId));
    if(!c){ toast("הלקוחה כבר לא קיימת — הפעולה בוטלה","error"); return; }
    if(!(c.phone&&String(c.phone).trim())){ toast("אין מספר טלפון ללקוחה — לא ניתן לשלוח","error"); return; }
    setQueueApproved(prev=>{const n=new Set(prev);n.add(it.key);return n;});
    toast("אושר במצב בדיקה — לא נשלחה הודעה אמיתית ✓","success");
  };

  // Connect a free-text Advisor reply to ONE existing next action. The Advisor
  // returns unstructured prose (no client/scan/appointment references), so this
  // does NOT change the AI or invent recommendation types — it matches the KNOWN
  // topics the advisor already covers and routes to the relevant existing module.
  // Returns {label, run} or null. First match wins (priority order); idempotent
  // navigation (no entity mutation, no duplicates, safe to click repeatedly).
  const advisorAction = (text) => {
    const t = String(text||"");
    const has = (...ws)=>ws.some(w=>t.includes(w));
    // Dormant / win-back advice -> the unified approval queue, where the per-client
    // rebooking + skin-follow-up suggestions already exist (no new items invented).
    if(has("רדומ","לא ביקר","לא הגיע","החזרת לקוחות","להחזיר לקוחות","נטש"))
      return { label:"פתחי משימות ממתינות", run:()=>setActiveTab("dashboard") };
    if(has("קמפיין","מבצע","שיווק","פוסט","סושיאל","אינסטגרם","פייסבוק"))
      return { label:"צרי קמפיין", run:()=>setActiveTab("campaigns") };
    if(has("ליד","פנייה","פניות","לידים"))
      return { label:"פתחי לידים", run:()=>setActiveTab("leads") };
    if(has("יומן","תור פנוי","תורים פנויים","למלא את היומן","זמינות"))
      return { label:"פתחי יומן", run:()=>setActiveTab("calendar") };
    if(has("תמחור","העלאת מחיר","המחיר","חבילת","חבילות"))
      return { label:"פתחי שירותים ומחירים", run:()=>{setEditSettings({...settings});setSettingsTab("services");setShowSettings(true);} };
    return null;
  };

  // Facebook connect: load the current connection state on mount, and handle the
  // return from the OAuth callback. The callback redirects back here with
  // ?fb_success=true (page connected) or ?fb_error=... — show a toast, then strip
  // those params so a refresh doesn't re-fire the message.
  useEffect(() => {
    loadFbConnection();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("fb_success") === "true") {
        toast("הדף חובר בהצלחה ✦");
        loadFbConnection();
      } else if (params.get("fb_error")) {
        toast("החיבור נכשל, נסי שוב", "error");
      }
      if (params.has("fb_success") || params.has("fb_error") || params.has("pages")) {
        params.delete("fb_success"); params.delete("fb_error"); params.delete("pages");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
      }
    } catch { /* non-fatal */ }
    /* eslint-disable-next-line */
  }, []);

  // Esc closes any open modal / drawer (does not touch session/tenant logic).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setShowModal(false); setShowClientModal(false); setShowImportModal(false);
      setShowLeadModal(false); setShowCashier(false); setShowReceipt(null);
      setShowPackageModal(false); setShowWaitlistModal(false); setShowProtocolModal(false);
      setShowPostModal(false); setShowSettings(false); setShowNewService(false);
      setSelectedClient(null); setSelectedLead(null);
      setEditingClient(null); setEditingLead(null); setEditSettings(null);
      setConfirmDialog(null); setShowMobileSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When a modal opens, focus its first input field (all modals use .modal-card).
  const anyModalOpen = showModal||showClientModal||showImportModal||showLeadModal||
    showCashier||!!showReceipt||showPackageModal||showWaitlistModal||showProtocolModal||
    showPostModal||showSettings||!!confirmDialog;
  useEffect(() => {
    if (!anyModalOpen) return;
    const id = setTimeout(() => {
      const el = document.querySelector('.modal-card input:not([type="hidden"]):not([type="file"]), .modal-card textarea, .modal-card select');
      if (el) { try { el.focus(); } catch {} }
    }, 60);
    return () => clearTimeout(id);
  }, [anyModalOpen]);

  // Load skin-scan history whenever a client card is opened
  useEffect(() => {
   if (selectedClient?.id) { loadClientScans(selectedClient.id); loadClientPhotos(selectedClient.id); }
    else { setClientScans([]); setClientPhotos([]); }
    /* eslint-disable-next-line */
  }, [selectedClient?.id]);

  // Never sit on a tab this tenant cannot see. Filtering the nav lists is the
  // only way into the three stub tabs today, so this is a backstop rather than
  // a live path - but it is the one that matters if a flag is switched OFF
  // while she is standing on that tab, and it means a future deep link or
  // restored-tab feature cannot reopen a hidden screen by accident.
  useEffect(() => {
    if (!isTabVisible(settings, activeTab)) setActiveTab("dashboard");
  }, [settings, activeTab]);

  // Load saved campaigns the first time the AI marketing view is opened
  useEffect(() => {
    if (activeTab === "campaigns" && marketingView === "ai" && savedCampaigns === null) {
      loadSavedCampaigns();
    }
    /* eslint-disable-next-line */
  }, [activeTab, marketingView]);

  useEffect(() => {
    if (activeTab === "community") loadCommunityPosts();
    if (activeTab === "protocols") loadProtocols();
    if (activeTab === "advisor" && advisorMessages === null) loadAdvisor();
    /* eslint-disable-next-line */
  }, [activeTab]);

  // Keep the advisor chat scrolled to the latest message.
  useEffect(() => {
    const el = document.getElementById("advisor-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [advisorMessages, advisorSending]);

  const loadAll = async () => {
    try {
      // Get the logged-in user and their tenant, to load the correct settings row.
      // No session → redirect to login instead of rendering the app "logged out"
      // (which is what let writes fail silently with auth.uid() = NULL).
      //
      // BUT: "could not reach the auth server" is NOT "logged out". getUser()
      // makes a network call, and offline it comes back with a retryable
      // transport error and user = null. Treating that as logged-out sent her
      // to /login, where she would try to sign in and fail again - the app
      // telling someone with a valid session that she is not signed in. This is
      // the same no-data/no-answer conflation as everywhere else, one step
      // earlier in the same function. The app is a PWA (public/sw.js), so the
      // shell genuinely does load with no network and this path is reachable.
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user || null;
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const authTransportFailure =
        isOffline ||
        (!!authErr && (
          authErr.name === "AuthRetryableFetchError" ||
          !authErr.status ||
          /fetch|network|load failed|timeout/i.test(String(authErr.message || ""))
        ));
      if (authTransportFailure) {
        console.error("[BeautyOS] loadAll: could not verify session", authErr);
        setLoadError({ tables: [], message: authErr?.message || "", code: isOffline ? "offline" : "auth", offline: true });
        return; // the `finally` still clears `loading`
      }
      if (!user) { router.replace("/login"); return; }
      // Resolve the tenant with the SAME function the RLS policies use.
      // Reading tenant_members directly from the client is itself gated by
      // RLS and often returns null, which then mis-selects the settings row.
      //
      // An ERROR here is fatal, unlike a null RESULT. A null result is a real
      // answer ("this user belongs to no tenant"); an error means we do not
      // know, and carrying on would pick a settings row by fallback and show
      // her a dashboard assembled from a guess.
      const { data: rpcTenant, error: rpcErr } = await supabase.rpc("get_user_tenant_id");
      if (rpcErr) {
        console.error("[BeautyOS] loadAll: get_user_tenant_id failed", rpcErr);
        try { Sentry.captureException(new Error(`loadAll: get_user_tenant_id — ${rpcErr.message}`)); } catch {}
        setLoadError({ tables: ["get_user_tenant_id"], message: rpcErr.message || "", code: rpcErr.code || "" });
        return;
      }
      const myTenantId = rpcTenant || null;
      // Every read is NAMED, so a failure can say which one failed instead of
      // vanishing. See the CORE_READS check below for why that matters.
      const READS = [
        ["appointments",   supabase.from("appointments").select("*")],
        ["clients",        supabase.from("clients").select("*")],
        ["forms",          supabase.from("forms").select("*")],
        ["leads",          supabase.from("leads").select("*")],
        ["service_prices", supabase.from("service_prices").select("*")],
        ["settings",       supabase.from("settings").select("*")],
        ["receipts",       supabase.from("receipts").select("*")],
        ["packages",       supabase.from("packages").select("*")],
        ["waitlist",       supabase.from("waitlist").select("*")],
        // Business expenses (for input-VAT in tax reports). RLS-scoped to tenant.
        ["expenses",       supabase.from("expenses").select("*")],
        // Feature tier + trial/subscription state for this tenant.
        // Selects the whole row deliberately: the plan-state columns are added
        // by trial-state.sql, which is run by hand against Supabase, so naming
        // them explicitly would make this query fail outright on any
        // environment where that migration has not been run yet. The row is one
        // row on a tiny table, and RLS already scopes it to her own tenant.
        ["tenants",        supabase.from("tenants").select("*").eq("id", myTenantId).maybeSingle()],
      ];
      const settled = await Promise.all(READS.map(([, q]) => q));
      const res = {};
      READS.forEach(([name], i) => { res[name] = settled[i] || {}; });
      const [a,c,f,l,sv,st,r,pk,wl,ex,tn] = settled;

      // ── A FAILED READ IS NOT AN EMPTY READ ────────────────────────────────
      // This used to be `if (a.data) setAppointments(a.data)` for all eleven.
      // supabase-js does NOT throw on a query error - it returns
      // { data: null, error } - so the catch below never fired, the error was
      // dropped on the floor, and every state stayed at its initial []. The
      // result was that a failed load rendered as a clean, EMPTY app:
      // no clients, no appointments, no revenue, indistinguishable from a
      // brand-new account. For a cosmetician with a year of history, "we could
      // not load your data" showed up as "your data is gone".
      //
      // Now any core read that errors stops the render and shows her an
      // explicit failure with a retry. Empty is only ever allowed to mean empty.
      //
      // `tenants` is deliberately NOT core. Its failure already has a
      // considered answer directly below - planState() treats a null row as
      // unblocked - because this is the BILLING row, and a transient error
      // there must never lock her out of her own calendar. Failing open on
      // billing and failing loud on data is the intended asymmetry.
      const CORE_READS = READS.map(([name]) => name).filter((n) => n !== "tenants");
      const failedReads = CORE_READS.filter((n) => res[n]?.error);
      if (failedReads.length > 0) {
        const first = res[failedReads[0]].error;
        console.error("[BeautyOS] loadAll failed for:", failedReads.join(", "), first);
        try {
          Sentry.captureException(
            new Error(`loadAll failed: ${failedReads.join(", ")} — ${first?.message || "unknown"}`)
          );
        } catch {}
        setLoadError({ tables: failedReads, message: first?.message || "", code: first?.code || "" });
        return; // the `finally` still clears `loading`
      }

      // Safe default 'none' if the row/column is missing for any reason.
      const plan = tn?.data?.plan || "none";
      setCurrentPlan(plan);
      // Trial/subscription state. A failed read leaves this null on purpose:
      // planState() then reports an unblocked tenant, so a transient error can
      // never lock her out of her own data.
      setPlanRow(tn?.data || null);
      console.log("[BeautyOS] current plan:", plan, "| plan_status:", tn?.data?.plan_status || "(not migrated)");
      // Past the guard above, every one of these succeeded, so an empty array
      // is a real answer and can be trusted.
      setAppointments(a.data || []);
      setClients(c.data || []);
      setForms(f.data || []);
      setLeads(l.data || []);
      setServices(sv.data || []);
      // Zero settings rows now means SHE IS GENUINELY NEW, not "the settings
      // read failed" - that case returned above. Before this change the two
      // were the same branch, so a failed read could bounce an established user
      // into onboarding, and finishing it inserts a SECOND settings row.
      if(st.data && st.data.length === 0) { router.replace("/onboarding"); return; }
      if(st.data && st.data.length > 0) {
        // Pick the settings row for this user's tenant. Fall back to the most
        // recently created row (not an arbitrary array index) so the choice is
        // stable across refreshes and a just-saved row isn't masked by a stale one.
        const myRow = st.data.find(s => s.tenant_id === myTenantId)
          || [...st.data].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0];
        setSettings(myRow);
        // Tag every later error report with the business it happened in. This
        // is what turns the six-character code a beta user reads out into
        // "which salon, on which data" without having to ask her. The tenant
        // UUID only - never her name, phone or email; see lib/sentryScrub for
        // the rule this follows.
        try { Sentry.setTag("tenant_id", myRow?.tenant_id || myTenantId || "unknown"); } catch {}
      }
      setReceipts(r.data || []);
      setExpenses(ex?.data || []);
      setPackages(pk.data || []);
      setWaitlist(wl.data || []);
      setLoadError(null);
    } catch (err) {
      // Anything unexpected is ALSO a failed load, not an empty one. This used
      // to call handleDbError alone, which raises a toast and then lets the
      // render fall through to a dashboard showing zero of everything - the
      // toast can be missed, the empty dashboard cannot.
      console.error("[BeautyOS] loadAll threw:", err);
      try { Sentry.captureException(err); } catch {}
      setLoadError({
        tables: [],
        message: err?.message || String(err),
        code: err?.code || "",
        offline: typeof navigator !== "undefined" && navigator.onLine === false,
      });
    } finally {
      setLoading(false);
    }
  };

  // === CALCULATIONS ===
  const thisMonthRevenue = useMemo(() => receipts.filter(r=>{if(!r.created_at)return false;const d=new Date(r.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}).reduce((s,r)=>s+(Number(r.amount)||0),0), [receipts, thisMonth, thisYear]);
  const lastMonthRevenue = useMemo(() => receipts.filter(r=>{if(!r.created_at)return false;const d=new Date(r.created_at);return d.getMonth()===lastMonth&&d.getFullYear()===lastMonthYear;}).reduce((s,r)=>s+(Number(r.amount)||0),0), [receipts, lastMonth, lastMonthYear]);
  const todayAppts    = useMemo(() => appointments.filter(a=>a.date===today), [appointments, today]);
  const tomorrowAppts = useMemo(() => appointments.filter(a=>a.date===tomorrow), [appointments, tomorrow]);
  // Compare on local YYYY-MM-DD strings (via formatDate), not Date objects:
  // weekStart carries a time-of-day while new Date("YYYY-MM-DD") is UTC midnight,
  // which previously dropped today's appointments from the weekly count.
  const weekAppts     = useMemo(() => { const ws=formatDate(weekStart); const weEnd=new Date(weekStart); weEnd.setDate(weEnd.getDate()+5); const we=formatDate(weEnd); return appointments.filter(a=>a.date&&a.date>=ws&&a.date<=we); }, [appointments, weekStart]);
  const thisMonthAppts = useMemo(() => appointments.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}), [appointments, thisMonth, thisYear]);

  const getLastAppt    = (cid) => appointments.filter(a=>String(a.client_id)===String(cid)).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  const getDaysSince   = (cid) => {const l=getLastAppt(cid);if(!l?.date)return 999;return Math.floor((now-new Date(l.date))/(1000*60*60*24));};
  const getClientTotal = (cid) => receipts.filter(r=>String(r.client_id)===String(cid)).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));
  const getClientReceipts = (cid) => receipts.filter(r=>String(r.client_id)===String(cid));
  const getClientPackages = (cid) => packages.filter(p=>String(p.client_id)===String(cid)&&p.active);

  const activeClients = useMemo(() => clients.filter(c=>getDaysSince(c.id)<=60), [clients, appointments, today]);
  const coldClients   = useMemo(() => clients.filter(c=>getDaysSince(c.id)>60), [clients, appointments, today]);
  const topClients    = useMemo(() => [...clients].sort((a,b)=>getClientTotal(b.id)-getClientTotal(a.id)).filter(c=>getClientTotal(c.id)>0).slice(0,5), [clients, receipts]);

  const serviceStats = useMemo(() => activeServices.map(s=>({name:s.name,color:s.color,count:appointments.filter(a=>a.service===s.name).length,revenue:receipts.filter(r=>r.service===s.name).reduce((sum,r)=>sum+(Number(r.amount)||0),0)})).sort((a,b)=>b.count-a.count), [activeServices, appointments, receipts]);
  const avgTransaction = useMemo(() => receipts.length>0?Math.round(receipts.reduce((s,r)=>s+(Number(r.amount)||0),0)/receipts.length):0, [receipts]);

  const monthlyData = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(now);d.setMonth(now.getMonth()-(5-i));
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    const rev=receipts.filter(r=>{if(!r.created_at)return false;const rd=new Date(r.created_at);return rd.getMonth()===m&&rd.getFullYear()===y;}).reduce((s,r)=>s+(Number(r.amount)||0),0);
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:rev};
  /* now is derived from thisMonth/thisYear, which gate this memo */ }), [appointments, receipts, thisMonth, thisYear]);

  const upcomingBirthdays = useMemo(() => clients.filter(c=>{
    if(!c.birthday)return false;
    try{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))<=30&&Math.floor((bd-now)/(1000*60*60*24))>=0;}catch{return false;}
  }).sort((a,b)=>{const days=(c)=>{const bx=new Date(c.birthday);const bd=new Date(now.getFullYear(),bx.getMonth(),bx.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24));};return days(a)-days(b);})
  /* now is gated by `today` (changes daily) */ , [clients, today]);

  const tomorrowConfirmed  = tomorrowAppts.filter(a=>a.confirmation_status==="confirmed").length;
  const tomorrowCancelled  = tomorrowAppts.filter(a=>a.confirmation_status==="cancelled").length;
  const tomorrowPending    = tomorrowAppts.filter(a=>!a.confirmation_status||a.confirmation_status==="pending").length;

  // Un-handled leads for the sidebar badge: both canonical entry statuses -
  // "new" (where inbound Facebook leads and manually added leads start) and
  // "no_answer" (reached out, nobody picked up).
  const newLeadsCount      = leads.filter(l=>l.status==="no_answer"||l.status==="new").length;
  const thisMonthLeads     = leads.filter(l=>{if(!l.created_at)return false;const d=new Date(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads     = leads.filter(l=>l.status==="closed");
  const conversionRate     = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost"&&l.status!=="irrelevant");

  const campaignStats = useMemo(() => LEAD_SOURCES.map(source=>{
    const sourceLeads=leads.filter(l=>l.source===source);
    const converted=sourceLeads.filter(l=>l.status==="closed");
    const revenue=converted.reduce((sum,l)=>{if(!l.client_id)return sum;return sum+receipts.filter(r=>String(r.client_id)===String(l.client_id)).reduce((s,r)=>s+(Number(r.amount)||0),0);},0);
    return {source,icon:SOURCE_ICONS[source],total:sourceLeads.length,converted:converted.length,revenue,rate:sourceLeads.length>0?Math.round((converted.length/sourceLeads.length)*100):0};
  }).filter(s=>s.total>0).sort((a,b)=>b.revenue-a.revenue), [leads, receipts]);

  const paymentBreakdown = useMemo(() => PAYMENT_METHODS.map(m=>({...m,total:receipts.filter(r=>r.payment_method===m.key).reduce((s,r)=>s+(Number(r.amount)||0),0),count:receipts.filter(r=>r.payment_method===m.key).length})).filter(m=>m.count>0), [receipts]);
  const filteredReceipts = receiptFilter==="all"?receipts:receipts.filter(r=>r.payment_method===receiptFilter);

  const filteredLeads = useMemo(() => leads.filter(l=>{
    const matchSearch=!leadSearch||l.name?.includes(leadSearch)||l.phone?.includes(leadSearch);
    const matchFilter=leadFilter==="all"||l.status===leadFilter;
    const matchSource=leadSourceFilter==="all"||l.source===leadSourceFilter;
    return matchSearch&&matchFilter&&matchSource;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")), [leads, leadSearch, leadFilter, leadSourceFilter]);

  const filteredClients = useMemo(() => clients.filter(c=>{
    const matchSearch=!searchQuery||c.name?.includes(searchQuery)||c.phone?.includes(searchQuery);
    const matchStatus=filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&getDaysSince(c.id)>60)||(filterStatus==="active"&&getDaysSince(c.id)<=60);
    const matchSkin=filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  }), [clients, appointments, searchQuery, filterStatus, filterSkin, today]);

  // Global top-bar search. Normalizes the query once (trim + lowercase) and
  // matches against lowercased fields across five sources. Each source is
  // capped at 5 rows (so one busy source can't crowd out the rest), and the
  // combined list is capped at ~15. Every result is a self-describing
  // {type,label,sub,obj} so the dropdown can group + navigate by type.
  const _searchQ = globalSearch.trim().toLowerCase();
  const globalResults = _searchQ.length<2?[]:(()=>{
    const has = (v)=> (v==null?"":String(v).toLowerCase()).includes(_searchQ);
    const groups = [
      clients.filter(c=>has(c.name)||has(c.phone))
        .slice(0,5).map(c=>({type:"client",label:c.name,sub:c.phone||"",obj:c})),
      appointments.filter(a=>has(a.name)||has(a.service)||has(a.client_phone))
        .slice(0,5).map(a=>({type:"appt",label:a.name,sub:(a.service||"")+" · "+a.date,obj:a})),
      leads.filter(l=>has(l.name)||has(l.phone)||has(l.service_interest))
        .slice(0,5).map(l=>({type:"lead",label:l.name,sub:l.source||"",obj:l})),
      activeServices.filter(s=>has(s.name))
        .slice(0,5).map(s=>({type:"service",label:s.name,sub:`₪${s.price}`+(s.duration?` · ${s.duration}′`:""),obj:s})),
      receipts.filter(r=>has(r.client_name)||has(r.service)||has(r.amount))
        .slice(0,5).map(r=>({type:"receipt",label:r.client_name||"קבלה",sub:`₪${r.amount} · ${(r.created_at||"").slice(0,10)}`,obj:r})),
    ];
    return groups.flat().slice(0,15);
  })();

  // Navigate to whatever a search result points at, reusing existing handlers
  // (zero new logic). Called from the grouped results dropdown.
  const openSearchResult = (r) => {
    setGlobalSearch("");
    if (r.type === "client") { setSelectedClient(r.obj); setClientTab("info"); }
    else if (r.type === "lead") { setSelectedLead(r.obj); setActiveTab("leads"); }
    else if (r.type === "appt") { setActiveTab("calendar"); if (r.obj?.date) setWeekStart(new Date(r.obj.date)); }
    else if (r.type === "receipt") { setShowReceipt(r.obj); }
    else if (r.type === "service") { setEditSettings({ ...settings }); setSettingsTab("services"); setShowSettings(true); }
  };

  // Bucketed by hour on purpose: the grid still has one row per hour, so a
  // 14:30 appointment must render in the 14:00 row rather than vanish. The row
  // shows its real start time. A true minute-resolution grid is a separate job.
  const getAppt = (date,hour) => appointments.find(a=>{
    if(a.date!==formatDate(date)) return false;
    const sm = startMinute(a);
    return sm!==null && Math.floor(sm/60)===Number(hour);
  });

  const getApptColor = (appt) => {
    if(appt.confirmation_status==="confirmed") return "var(--success)";
    if(appt.confirmation_status==="cancelled") return "var(--danger)";
    return appt.color||"var(--warning)";
  };

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleSlotClick = (date,hour) => {
    if(getAppt(date,hour))return;
    const svc=activeServices[0];
    setEditingAppointmentId(null); // fresh create, not edit
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),hour,startMinute:Number(hour)*60,price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  // Open the appointment modal in EDIT mode, pre-filled with an existing
  // appointment's values so its date/time/service/etc. can be rescheduled.
  // Reuses the exact same modal + per-day-hours + double-booking logic as create;
  // editingAppointmentId flips handleSave to UPDATE and excludes this row from
  // the conflict checks.
  const handleApptClick = (appt) => {
    setEditingAppointmentId(appt.id);
    setNewAppt({clientId:appt.client_id||"",name:appt.name||"",service:appt.service||"",duration:Number(appt.duration)||60,date:appt.date,hour:Number(appt.hour),startMinute:startMinute(appt),price:appt.price||0});
    setApptNote(appt.note||"");
    setShowModal(true);
  };

  const handleClientSelect = (clientId) => {
    const c=clients.find(c=>String(c.id)===String(clientId));
    setNewAppt(prev=>({...prev,clientId,name:c?c.name:""}));
  };

  const handleServiceSelect = (svcName) => {
    const svc=activeServices.find(s=>s.name===svcName);
    setNewAppt(prev=>({...prev,service:svcName,duration:svc?.duration||60,price:svc?.price||0}));
  };

  const handleSave = async () => {
    if (guardWrite()) return;
    if(!newAppt.name.trim()){toast("נא להזין שם לקוחה","error");return;}
    // STAGE C: refuse to double-book. The new appointment occupies
    // [start, start+duration) minutes; reject if it overlaps any non-cancelled
    // appointment already on that date. (Runs before the busy flag is set.)
    {
      const newStart = apptEffectiveStart;
      const newEnd = newStart + Number(newAppt.duration||0);
      const clash = appointments.some(a=>{
        if(a.id===editingAppointmentId) return false; // don't clash with self when editing
        if(a.date!==newAppt.date || a.confirmation_status==="cancelled") return false;
        const bs = startMinute(a), be = endMinute(a); if(bs===null||be===null) return false;
        return newStart < be && bs < newEnd;
      });
      if(clash){ toast("השעה הזו כבר תפוסה","error"); return; }
    }
    if(isBusy("saveAppt")) return;
    setBusyKey("saveAppt", true);
    try {
      // Resolve the tenant and stamp it on the inserts so the row satisfies the
      // appointments/clients RLS WITH CHECK (tenant_id = get_user_tenant_id())
      // even if the table's column default isn't applied. Mirrors
      // handleSaveSettings. If the tenant can't be resolved (rare rpc hiccup) we
      // omit the field rather than send null, so we never regress below the DB
      // default behavior.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      let clientId=newAppt.clientId;
      if(!clientId){
        const {data:nc,error:ce}=await supabase.from("clients").insert([{name:newAppt.name,phone:"",skinType:"",notes:"",status:"active",...tenantField}]).select();
        if(ce){handleDbError(ce, "create client"); return;}
        if(nc?.[0]){clientId=nc[0].id;setClients(prev=>[...prev,nc[0]]);}
      }
      const svcColor=activeServices.find(s=>s.name===newAppt.service)?.color||DEFAULT_SERVICE_COLOR;
      if(editingAppointmentId){
        // EDIT/reschedule: update only the editable fields on the existing row.
        // confirmation_status/confirmation_sent are intentionally left untouched
        // (no change to unrelated confirmation logic).
        const patch={date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0};
        const {data,error}=await supabase.from("appointments").update(patch).eq("id",editingAppointmentId).select();
        if(error){handleDbError(error, "update appointment"); return;}
        if(data)setAppointments(prev=>prev.map(a=>a.id===editingAppointmentId?data[0]:a));
        setShowModal(false);setApptNote("");setEditingAppointmentId(null);
        toast("התור עודכן בהצלחה");
      } else {
        const appt={date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false,...tenantField};
        const {data,error}=await supabase.from("appointments").insert([appt]).select();
        if(error){handleDbError(error, "create appointment"); return;}
        if(data)setAppointments(prev=>[...prev,data[0]]);
        setShowModal(false);setApptNote("");
        toast("התור נשמר בהצלחה");
      }
    } finally {
      setBusyKey("saveAppt", false);
    }
  };

  // Gap-fill trigger: ask the server to offer this freed slot to matching clients
  // over WhatsApp. All candidate selection + sending happens server-side (see
  // app/api/slots/offer); the server also re-checks the toggle, so this is a
  // safe fire-and-forget. Real messages go out, hence the undo-window guard below.
  const triggerGapFill = async (appt) => {
    try {
      const res = await fetch("/api/slots/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: appt.date, startMinute: startMinute(appt), service: appt.service,
          duration: appt.duration, cancelledClientId: appt.client_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.sent > 0) toast(`נשלחה הצעה למילוי התור ל-${data.sent} לקוחות ✦`);
    } catch { /* non-fatal: the cancellation already succeeded */ }
  };

  // ── SOFT CANCEL ───────────────────────────────────────────────────────────
  // Her cancel used to DELETE the row while a client's cancel (app/api/confirm)
  // set confirmation_status = 'cancelled'. Two meanings of "cancelled" in one
  // calendar: a client-cancelled appointment stayed visible and marked, hers
  // vanished without trace - no record that it ever existed, who cancelled it,
  // or when. That is also the only copy of the appointment.
  //
  // Both paths now write the same soft cancel. The calendar was ALREADY built
  // for this: red border, "ביטלה"/"בוטל" chips, the day-cell indicator and the
  // dashboard's cancelled count all key off confirmation_status. They simply
  // never saw one of hers.
  //
  // cancelled_at / cancelled_by are added by
  // supabase/migrations/pending/appointment-cancel-audit.sql. Until that runs
  // the columns do not exist, so a write naming them fails - and refusing to
  // cancel because an audit column is missing would be the worse failure. So
  // the write is retried without them, and the cancel still happens.
  const softCancelAppointment = useCallback(async (appt, by = "business") => {
    const withAudit = {
      confirmation_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: by,
    };
    let res = await supabase.from("appointments").update(withAudit).eq("id", appt.id).select();
    const missingColumn =
      res.error &&
      (res.error.code === "42703" ||
        res.error.code === "PGRST204" ||
        /column .* does not exist|could not find the '.*' column/i.test(String(res.error.message || "")));
    if (missingColumn) {
      res = await supabase
        .from("appointments")
        .update({ confirmation_status: "cancelled" })
        .eq("id", appt.id)
        .select();
    }
    return res;
  }, []);

  const handleDelete = (appt) => {
    if (guardWrite()) return;
    askConfirm({
      title: "ביטול תור",
      message: `לבטל את התור של ${appt.name} (${appt.service}, ${appt.date} ${fmtApptTime(appt)})? התור יסומן כמבוטל וישאר ביומן.`,
      confirmText: "ביטול התור",
      danger: true,
      onConfirm: async () => {
        const previousStatus = appt.confirmation_status || "pending";
        const { data, error } = await softCancelAppointment(appt);
        if (error) { handleDbError(error, "cancel appointment"); return; }
        const updated = (data && data[0]) || { ...appt, confirmation_status: "cancelled" };
        setAppointments(prev=>prev.map(a=>a.id===appt.id?updated:a));
        setHoveredAppt(null);
        // Undo restores the previous status in place. No re-insert, so the row
        // keeps its id and every receipt or form pointing at it stays valid -
        // the old undo created a NEW row with a fresh id and silently orphaned
        // anything that referenced the original.
        let restored = false;
        const restore = async () => {
          restored = true;
          let r = await supabase.from("appointments")
            .update({ confirmation_status: previousStatus, cancelled_at: null, cancelled_by: null })
            .eq("id", appt.id).select();
          if (r.error && (r.error.code === "42703" || r.error.code === "PGRST204" ||
              /column .* does not exist|could not find the '.*' column/i.test(String(r.error.message || "")))) {
            r = await supabase.from("appointments")
              .update({ confirmation_status: previousStatus })
              .eq("id", appt.id).select();
          }
          if (r.error) { handleDbError(r.error, "restore appointment"); return; }
          if (r.data && r.data[0]) setAppointments(prev=>prev.map(a=>a.id===appt.id?r.data[0]:a));
          toast("התור שוחזר");
        };
        toast("התור בוטל", "success", { label: "החזרה", onClick: restore });
        // Fire gap-fill only AFTER the undo window closes, and only if it wasn't
        // undone — so a quick "ביטול" never lets a real WhatsApp offer go out for
        // an appointment the cosmetician restored. Gated by the settings toggle.
        if (settings.gap_fill_enabled === true) {
          setTimeout(() => { if (!restored) triggerGapFill(appt); }, 6500);
        }
      },
    });
  };

  const handleSendConfirmation = async (appt) => {
    if (guardWrite()) return;
    const client=clients.find(c=>String(c.id)===String(appt.client_id));
    if(!client?.phone){toast("אין מספר טלפון ללקוחה","error");return;}
    // The window is opened synchronously, inside the click, and only then
    // pointed at the link. Awaiting the signed links first and opening
    // afterwards would put window.open outside the user gesture, which Safari
    // and Chrome block as a popup.
    const w = window.open("", "_blank");
    const links = await fetchConfirmLinks(appt.id);
    if (!links) { if (w) w.close(); toast("לא הצלחנו להכין את קישורי האישור", "error"); return; }
    const link = waConfirmLink(client.phone, appt.name, appt.service, appt.date, fmtApptTime(appt), links);
    if (w) w.location.href = link; else window.open(link, "_blank");
    const {data, error}=await supabase.from("appointments").update({confirmation_sent:true}).eq("id",appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return; }
    if(data)setAppointments(prev=>prev.map(a=>a.id===appt.id?data[0]:a));
  };

  const handleSendAllConfirmations = async () => {
    if (guardWrite()) return;
    const pending=tomorrowAppts.filter(a=>!a.confirmation_sent);
    if(pending.length===0){toast("כבר נשלחו תזכורות לכל התורים מחר", "info");return;}
    askConfirm({
      title: "שליחת תזכורות",
      message: `לשלוח תזכורת ל-${pending.length} לקוחות?`,
      confirmText: "שליחה",
      onConfirm: async () => {
        for(const appt of pending){
          await handleSendConfirmation(appt);
          await new Promise(r=>setTimeout(r,500));
        }
        toast(`נשלחו תזכורות ל-${pending.length} לקוחות`);
      },
    });
  };

  const handleSaveClient = async () => {
    if (guardWrite()) return;
    if(!newClient.name.trim()){toast("נא להזין שם","error");return;}
    if(isBusy("saveClient")) return;
    setBusyKey("saveClient", true);
    try {
      if(editingClient){
        const {data,error}=await supabase.from("clients").update(newClient).eq("id",editingClient.id).select();
        if(error){handleDbError(error, "update client"); return;}
        if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
        setClients(prev=>prev.map(c=>c.id===editingClient.id?data[0]:c));setSelectedClient(data[0]);
        toast("הלקוחה עודכנה");
      }else{
        const {data,error}=await supabase.from("clients").insert([newClient]).select();
        if(error){handleDbError(error, "create client"); return;}
        if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
        setClients(prev=>[...prev,data[0]]);
        toast("הלקוחה נוספה");
      }
      setShowClientModal(false);setEditingClient(null);setNewClient(emptyClient);
    } finally {
      setBusyKey("saveClient", false);
    }
  };

  // Parse pasted text into {name, phone} rows. Accepts "name, phone" or
  // "name <tab/space> phone", one per line.
  const parseImportText = (text) => {
    const rows = [];
    (text || "").split("\n").forEach((line) => {
      const raw = line.trim();
      if (!raw) return;
      // Split on comma, tab, or 2+ spaces
      let parts = raw.split(/,|\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 1) {
        // Try "name phone" with a single space before a phone-like token
        const m = raw.match(/^(.*?)[\s]+([0-9\-+() ]{6,})$/);
        if (m) parts = [m[1].trim(), m[2].trim()];
      }
      let name = parts[0] || "";
      let phone = parts[1] || "";
      // If the first token looks like a phone and second like a name, swap
      if (/^[0-9\-+() ]{6,}$/.test(name) && phone && !/^[0-9\-+() ]{6,}$/.test(phone)) {
        [name, phone] = [phone, name];
      }
      phone = phone.replace(/[^\d+]/g, "");
      if (name) rows.push({ name, phone });
    });
    return rows;
  };

  // Open the device contact picker (works on Chrome/Android only)
  const pickFromContacts = async () => {
    if (!(navigator.contacts && navigator.contacts.select)) {
      toast("המכשיר לא תומך בבחירה מאנשי קשר - השתמשי בהדבקה ידנית", "error");
      return;
    }
    try {
      const selected = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const lines = selected.map((c) => {
        const nm = (c.name && c.name[0]) || "";
        const tel = (c.tel && c.tel[0]) || "";
        return `${nm}, ${tel}`;
      });
      setImportText((prev) => (prev ? prev + "\n" : "") + lines.join("\n"));
    } catch {
      // user cancelled - ignore
    }
  };

  // Save all parsed contacts as new clients
  // Move from paste to mapping: parse the grid, detect a header row, pre-guess
  // each column. She corrects the guesses rather than starting from scratch.
  // Opening any import screen closes Settings first. The z-index already lifts
  // these above it, but a modal that is gone cannot hide anything - and relying
  // on a stacking comparison for whether a screen is visible at all is too
  // fragile for the main way she moves her data in. Both import entry points
  // live inside Settings, so this is the common case, not an edge one.
  //
  // editSettings is deliberately left alone: clearing it would throw away
  // anything she had typed in Settings, and hiding the modal is enough.
  const openImportHub = () => { setShowSettings(false); setShowImportHub(true); };
  const openImportFor = (kind) => {
    setImportTarget(kind);
    resetImport();
    setShowSettings(false);
    setShowImportHub(false);
    setShowImportModal(true);
  };

  // The chooser itself lives in app/ImportChooser.tsx so onboarding - a
  // separate route with none of this component's state - can render the exact
  // same list without reaching into the wizard.
  const renderImportChooser = () => (
    <ImportChooser onPick={openImportFor} accent={pc} accentTint={pcTint} />
  );

  // The wizard is shared; the spec supplies the copy, fields and guesser, and
  // only the row builder needs binding - the appointments one has to know what
  // "now" is to tell a future booking from history.
  const importSpec    = IMPORT_SPEC[importTarget] || IMPORT_SPEC.clients;
  const importFields  = importSpec.fields;
  const importGuesser = importSpec.guess;
  // Her own treatment names, so an appointments import can reject rows whose
  // "client name" is actually a treatment - a mis-mapped column, not a booking.
  const knownServiceNames = useMemo(
    () => new Set(services.map(s => String(s.name||"").trim()).filter(Boolean)),
    [services]
  );
  const importBuilder = importTarget === "appts"    ? ((g,c,h)=>buildApptRows(g,c,h,today,now.getHours()*60+now.getMinutes(),knownServiceNames))
                      : importTarget === "services" ? buildServiceRows
                      : buildImportRows;

  const goToImportMapping = () => {
    const grid = parseImportGrid(importText);
    if (!grid.rows.length) { toast("לא נמצאו שורות", "error"); return; }
    const hasHeader = detectHeaderRow(grid.rows);
    setImportHasHeader(hasHeader);
    setImportCols(importGuesser(grid.rows, hasHeader));
    setImportStage("map");
  };

  const resetImport = () => {
    setImportText(""); setImportCols([]); setImportHasHeader(false);
    setImportResult(null); setImportStage("paste");
  };

  // Services import. Same safety shape as the client import: explicit tenant,
  // dedupe, chunked inserts, and a failing chunk counted rather than aborting.
  const importServices = async () => {
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const { rows, noName } = buildServiceRows(grid, importCols, importHasHeader);
    if (rows.length === 0) { toast("לא נמצאו טיפולים להוספה", "error"); return; }

    setImporting(true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Skip treatments already on the price list, matched on trimmed name.
      const existing = new Set(services.map(s => String(s.name||"").trim()));
      const seen = new Set();
      const fresh = [];
      let dupes = 0;
      // Continue the colour cycle from however many services already exist, so
      // an import does not restart on colours she is already using.
      let colorAt = services.length;
      for (const r of rows) {
        const key = r.name.trim();
        if (existing.has(key) || seen.has(key)) { dupes++; continue; }
        seen.add(key);
        fresh.push({ ...r, color: SERVICE_COLOR_CYCLE[colorAt++ % SERVICE_COLOR_CYCLE.length], ...tenantField });
      }

      const CHUNK = 100;
      let failed = 0;
      let firstError = null;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("service_prices").insert(chunk).select();
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }

      if (inserted.length) setServices(prev => [...prev, ...inserted]);
      setImportResult({ added: inserted.length, dupes, noName, failed,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };

  // Future-bookings import. Two writes, in order: any client in the paste we
  // have never seen is created first, so the appointment attaches to a real
  // record instead of being a loose name on the calendar.
  const importAppointments = async () => {
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const built = buildApptRows(grid, importCols, importHasHeader, today, now.getHours()*60+now.getMinutes(), knownServiceNames);
    if (built.rows.length === 0) { toast("לא נמצאו תורים עתידיים להוספה", "error"); return; }

    setImporting(true);
    let firstError = null;
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Phone -> client id, digits only, so "054-123 4567" and "0541234567"
      // are the same person however her old system wrote them.
      const digits = (p) => String(p||"").replace(/\D/g,"");
      const byPhone = new Map();
      for (const c of clients) {
        const k = digits(c.phone);
        if (k && !byPhone.has(k)) byPhone.set(k, c.id);
      }

      const toCreate = [];
      const queued = new Set();
      for (const r of built.rows) {
        const k = digits(r.phone);
        if (!k || byPhone.has(k) || queued.has(k)) continue;
        queued.add(k);
        toCreate.push({ ...emptyClient, name:r.name, phone:r.phone, status:"active", ...tenantField });
      }
      const newClients = [];
      for (let i = 0; i < toCreate.length; i += 100) {
        const { data, error } = await supabase.from("clients").insert(toCreate.slice(i, i+100)).select();
        if (error) { if (!firstError) firstError = error; continue; }
        if (data) newClients.push(...data);
      }
      for (const c of newClients) { const k = digits(c.phone); if (k) byPhone.set(k, c.id); }
      if (newClients.length) setClients(prev => [...prev, ...newClients]);

      // Skip anything already on the calendar in that slot for that person.
      // Reruns after a partial failure are normal, and the week grid renders
      // only one appointment per date+hour, so a duplicate would just hide.
      // Keyed on the exact start rather than the hour: with minutes, an
      // imported 14:00 and 14:30 for the same client are two bookings, and
      // hour-granularity would have silently discarded the second as a dupe.
      const slotKey = (date, startMin, phone, name) =>
        `${date}|${Number(startMin)}|${digits(phone) || String(name||"").trim()}`;
      const clientPhone = new Map(clients.map(c => [c.id, c.phone]));
      const existingSlots = new Set(
        appointments.map(a => slotKey(a.date, startMinute(a), clientPhone.get(a.client_id), a.name))
      );

      // Then refuse to double-book, which dedup does not do. The key above only
      // catches an identical start for the same person; it says nothing about an
      // imported 14:30+60 landing on top of an existing 14:00+60. That was
      // unreachable while every imported time was rounded to a whole hour, and
      // stage 3 makes it reachable, so the importer now runs the same [start,end)
      // half-open test as the modal and the public booking route.
      //
      // Cancelled appointments free their slot, exactly as in handleSave.
      // Accepted rows join the bucket as we go, so a single paste cannot overlap
      // itself either - two 14:00 lash fills in the same file is the common case.
      const byDate = new Map();
      for (const a of appointments) {
        if (a.confirmation_status === "cancelled") continue;
        if (!byDate.has(a.date)) byDate.set(a.date, []);
        byDate.get(a.date).push(a);
      }

      const seen = new Set();
      const fresh = [];
      let dupes = 0, overlapping = 0;
      for (const r of built.rows) {
        const k = slotKey(r.date, r.startMinute, r.phone, r.name);
        if (existingSlots.has(k) || seen.has(k)) { dupes++; continue; }

        const sameDay = byDate.get(r.date) || [];
        if (clashesWith(r.startMinute, Number(r.duration||0), sameDay)) { overlapping++; continue; }

        seen.add(k);
        const svc = services.find(s => String(s.name||"").trim() === String(r.service||"").trim());
        fresh.push({
          date: r.date, ...startFields(r.startMinute), name: r.name, service: r.service || "",
          duration: r.duration, price: r.price,
          // Stored data, not styling: appointments.color is read back to tint
          // the calendar block, so it must stay a literal hex.
          color: svc?.color || DEFAULT_SERVICE_COLOR,
          client_id: byPhone.get(digits(r.phone)) || null,
          note: r.note || "",
          confirmation_status: "pending", confirmation_sent: false,
          ...tenantField,
        });
        sameDay.push({ start_minute: r.startMinute, duration: Number(r.duration||0) });
        if (!byDate.has(r.date)) byDate.set(r.date, sameDay);
      }

      const CHUNK = 100;
      let failed = 0;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("appointments").insert(chunk).select();
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }
      if (inserted.length) setAppointments(prev => [...prev, ...inserted]);

      setImportResult({ added: inserted.length, dupes, overlapping, noName: built.noName, failed,
                        newClients: newClients.length, past: built.past, noDate: built.noDate,
                        noTime: built.noTime,
                        nameIsService: built.nameIsService,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };

  const importContacts = async () => {
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const { rows, noName } = buildImportRows(grid, importCols, importHasHeader);
    if (rows.length === 0) { toast("לא נמצאו לקוחות להוספה", "error"); return; }

    setImporting(true);
    try {
      // Tenant is set explicitly rather than relying on a column default, the
      // same pattern handleSaveAppointment uses. Inserts run under RLS through
      // the browser client, so each row is checked server-side regardless.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Skip clients already on file, matched on digits-only phone. A rerun of
      // the same paste - which happens after a partial failure - must not
      // double the list.
      const existing = new Set(
        clients.map(c => String(c.phone||"").replace(/\D/g,"")).filter(Boolean)
      );
      const seen = new Set();
      const fresh = [];
      let dupes = 0;
      for (const r of rows) {
        const key = String(r.phone||"").replace(/\D/g,"");
        if (key && (existing.has(key) || seen.has(key))) { dupes++; continue; }
        if (key) seen.add(key);
        fresh.push({ ...emptyClient, ...r, status:"active", ...tenantField });
      }

      // Batched: a 500-row paste is 5 requests, not 500. A failing chunk is
      // counted and the rest continue, so one bad row cannot lose the import.
      const CHUNK = 100;
      let failed = 0;
      let firstError = null;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await supabase.from("clients").insert(chunk).select();
        if (error) { failed += chunk.length; if (!firstError) firstError = error; continue; }
        if (data) inserted.push(...data);
      }

      // Only rows the database actually returned go into local state, so the
      // list on screen always matches what was really written.
      if (inserted.length) setClients(prev => [...prev, ...inserted]);
      setImportResult({ added: inserted.length, dupes, noName, failed,
                        error: firstError ? firstError.message : null });
      setImportStage("done");
    } finally {
      setImporting(false);
    }
  };

  // Change the logged-in user's password from inside the app: validate, verify
  // the CURRENT password by re-authenticating, then update. Does not touch the
  // session/tenant resolution or handleSaveSettings.
  const handleChangePassword = async () => {
    if (isBusy("changePw")) return;
    if (!pwCurrent || !pwNew || !pwConfirm) { toast("נא למלא את כל השדות", "error"); return; }
    if (pwNew.length < 8) { toast("הסיסמה החדשה חייבת להכיל לפחות 8 תווים", "error"); return; }
    if (pwNew !== pwConfirm) { toast("הסיסמאות אינן תואמות", "error"); return; }
    setBusyKey("changePw", true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { toast("לא זוהה משתמש מחובר", "error"); return; }
      // Verify the current password by re-authenticating the same user.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent });
      if (reauthErr) { toast("הסיסמה הנוכחית שגויה", "error"); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updErr) {
        const sameAsOld = /should be different|New password/i.test(updErr.message || "");
        toast(sameAsOld ? "הסיסמה החדשה חייבת להיות שונה מהנוכחית" : "עדכון הסיסמה נכשל, נסי שוב", "error");
        return;
      }
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      toast("הסיסמה עודכנה ✓");
    } finally {
      setBusyKey("changePw", false);
    }
  };

  const handleSaveLead = async () => {
    if (guardWrite()) return;
    if(!newLead.name.trim()){toast("נא להזין שם","error");return;}
    if(isBusy("saveLead")) return;
    setBusyKey("saveLead", true);
    try {
      if(editingLead){
        const {data,error}=await supabase.from("leads").update(newLead).eq("id",editingLead.id).select();
        if(error){handleDbError(error, "update lead"); return;}
        if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
        setLeads(prev=>prev.map(l=>l.id===editingLead.id?data[0]:l));setSelectedLead(data[0]);
        toast("הליד עודכן");
      }else{
        const {data,error}=await supabase.from("leads").insert([newLead]).select();
        if(error){handleDbError(error, "create lead"); return;}
        if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
        setLeads(prev=>[...prev,data[0]]);
        toast("הליד נוסף");
      }
      setShowLeadModal(false);setEditingLead(null);setNewLead(emptyLead);
    } finally {
      setBusyKey("saveLead", false);
    }
  };

  const handleUpdateLeadStatus = async (lead,status) => {
    if (guardWrite()) return;
    const {data,error}=await supabase.from("leads").update({status}).eq("id",lead.id).select();
    if(error){handleDbError(error, "update lead status"); return;}
    if(data&&data[0]){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  // --- Bulk WhatsApp send per status group ---
  // openBulk resets the flow to a clean "compose" step for the chosen status.
  // Prefills the composer from the saved per-status template
  // (settings.automations.lead_templates). Always editable before sending, and
  // blank when no template is saved for that status.
  // Passing `lead` targets that single lead instead of the whole status group.
  const openBulk = (status, lead) => {
    const tpl = resolveLeadTemplate(settings, status);
    setBulkStatus(status);
    setBulkLeadIds(lead ? [lead.id] : null);
    setBulkMessage(tpl ? renderLeadTemplate(tpl, lead, settings) : "");
    setBulkResult(null); setBulkError(""); setBulkStep("compose");
  };
  const closeBulk = () => {
    setBulkStatus(null); setBulkStep("compose"); setBulkMessage("");
    setBulkResult(null); setBulkError(""); setBulkLeadIds(null);
  };
  // Reuses the SAME API route as the standalone leads screen
  // (app/api/leads/send-bulk/route.js). The route resolves the tenant from the
  // authenticated session and sends a REAL WhatsApp to every lead with a phone
  // in the given status — hence the explicit confirm step before we call it.
  const confirmBulkSend = async () => {
    if(!bulkStatus||!bulkMessage.trim()) return;
    setBulkStep("sending"); setBulkError("");
    try{
      const res=await fetch("/api/leads/send-bulk",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          status:bulkStatus,
          message:bulkMessage.trim(),
          // Only present for a single-lead send; omitted for a group send.
          ...(bulkLeadIds?{leadIds:bulkLeadIds}:{}),
        }),
      });
      const data=await res.json();
      if(!res.ok||!data.success){
        setBulkError(data.error||"שליחה נכשלה"); setBulkStep("confirm"); return;
      }
      setBulkResult({sent:data.sent??0,failed:data.failed??0,skipped_no_phone:data.skipped_no_phone??0});
      // Single-lead send: reflect the contact trail immediately in the row and
      // the open drawer instead of waiting for the next load. Group sends are
      // left to the next refresh - the API reports results by name, not id.
      if(bulkLeadIds&&bulkLeadIds.length===1&&(data.sent??0)>0){
        const nowIso=new Date().toISOString();
        const id=bulkLeadIds[0];
        const stamp=(l)=>({...l,last_contacted_at:nowIso,first_contacted_at:l.first_contacted_at||nowIso,contact_attempts:(Number(l.contact_attempts)||0)+1});
        setLeads(prev=>prev.map(l=>l.id===id?stamp(l):l));
        setSelectedLead(prev=>(prev&&prev.id===id)?stamp(prev):prev);
      }
      setBulkStep("result");
    }catch(err){
      setBulkError(err instanceof Error?err.message:"שליחה נכשלה"); setBulkStep("confirm");
    }
  };

  const handleConvertLead = (lead) => {
    if (guardWrite()) return;
    askConfirm({
      title: "המרת ליד ללקוחה",
      message: `להמיר את ${lead.name} ללקוחה רשומה?`,
      confirmText: "המרה",
      onConfirm: async () => {
        const {data:cd,error:ce}=await supabase.from("clients").insert([{name:lead.name,phone:lead.phone||"",skinType:"",notes:`הומר מליד — מקור: ${lead.source}`,status:"active"}]).select();
        if(ce){handleDbError(ce, "convert lead -> create client"); return;}
        if(!cd||!cd[0]){toast("ההמרה נכשלה","error");return;}
        const {data:ld, error:le}=await supabase.from("leads").update({status:"closed",converted_at:new Date().toISOString(),client_id:cd[0].id}).eq("id",lead.id).select();
        if(le){handleDbError(le, "convert lead -> update lead"); return;}
        setClients(prev=>[...prev,cd[0]]);
        if(ld&&ld[0])setLeads(prev=>prev.map(l=>l.id===lead.id?ld[0]:l));
        setSelectedLead(null);
        // Next step: offer to book her first appointment, pre-filled with the
        // service the lead already told us (service_interest) — no re-entry, and
        // the conversion no longer dead-ends at a toast.
        const nc=cd[0], svcName=lead.service_interest||"";
        toast(`${lead.name} הומרה ללקוחה`, "success", { label:"קבעי תור", onClick:()=>{
          const svc=activeServices.find(s=>s.name===svcName);
          setEditingAppointmentId(null);
          setNewAppt({clientId:nc.id,name:nc.name,service:svc?.name||svcName||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});
          setApptNote("");setShowModal(true);
        }});
      },
    });
  };

  const handleSetReminder = async (lead,date) => {
    if (guardWrite()) return;
    const {data,error}=await supabase.from("leads").update({reminder_date:date}).eq("id",lead.id).select();
    if(error){handleDbError(error, "set reminder"); return;}
    if(data&&data[0]){setLeads(prev=>prev.map(l=>l.id===lead.id?data[0]:l));setSelectedLead(data[0]);}
  };

  const handleUploadImage = async (e,client) => {
    if (guardWrite()) return;
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    try {
      const tid=settings?.tenant_id;
      if(!tid){toast("לא זוהה עסק — לא ניתן להעלות","error");return;}
      // Tenant-scoped, private path. We store the PATH (not a URL); display
      // resolves a signed URL on demand via <SignedImage>.
      const fileName=clientImagePath(tid,client.id,`${Date.now()}_${file.name}`);
      const {error:ue}=await supabase.storage.from(PRIVATE_BUCKET).upload(fileName,file);
      if(ue){handleDbError(ue, "upload image"); return;}
      const newImages=[...(client.images||[]),fileName];
      const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
      if(error){handleDbError(error, "save image url"); return;}
      if(data&&data[0]){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
      toast("התמונה הועלתה");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = (client,imageUrl) => {
    if (guardWrite()) return;
    askConfirm({
      title: "מחיקת תמונה",
      message: "למחוק את התמונה?",
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const newImages=(client.images||[]).filter(img=>img!==imageUrl);
        const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
        if(error){handleDbError(error, "delete image"); return;}
        if(data&&data[0]){setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);}
        toast("התמונה נמחקה");
      },
    });
  };

  // Upload a public branding asset (logo/hero) to the PUBLIC bucket under the
  // clinic's OWN tenant folder ("<tenant>/branding/…"), so one clinic can never
  // write into another's path. Validates type + size; stores the public URL in
  // editSettings.branding (persisted on Save).
  const uploadBrandAsset = async (file, key) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast("קובץ תמונה בלבד","error"); return; }
    if(file.size > 3*1024*1024){ toast("התמונה גדולה מדי (עד 3MB)","error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast("לא זוהה עסק — נסי לצאת ולהיכנס שוב","error"); return; }
    setBrandUploading(key);
    try {
      const ext = ((file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")) || "png";
      const path = `${tid}/branding/${key}_${Date.now()}.${ext}`;
      const { error:ue } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, { contentType:file.type });
      if(ue){ handleDbError(ue, "upload brand asset"); return; }
      const url = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || "";
      setEditSettings(prev=>({...prev, branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}), [key]: url }}));
      toast("התמונה הועלתה — לחצי שמירה");
    } finally { setBrandUploading(""); }
  };

  // Upload one gallery image and APPEND its public URL to branding.gallery (an
  // array), same tenant-scoped path rules as uploadBrandAsset. The public /book
  // page renders these as a Google-style photo grid.
  const uploadGalleryImage = async (file) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast("קובץ תמונה בלבד","error"); return; }
    if(file.size > 3*1024*1024){ toast("התמונה גדולה מדי (עד 3MB)","error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast("לא זוהה עסק — נסי לצאת ולהיכנס שוב","error"); return; }
    setBrandUploading("gallery");
    try {
      const ext = ((file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")) || "jpg";
      const path = `${tid}/branding/gallery_${Date.now()}.${ext}`;
      const { error:ue } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, { contentType:file.type });
      if(ue){ handleDbError(ue, "upload gallery image"); return; }
      const url = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || "";
      if(url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const gal=Array.isArray(b.gallery)?b.gallery:[]; return {...prev, branding:{...b, gallery:[...gal, url]}}; });
      toast("התמונה נוספה לגלריה — לחצי שמירה");
    } finally { setBrandUploading(""); }
  };

  const handleSendForm = async (client,formType) => {
    if (guardWrite()) return;
    const {data,error}=await supabase.from("forms").insert([{client_id:client.id,client_name:client.name,form_type:formType,status:"pending"}]).select();
    if(error){handleDbError(error, "create form"); return;}
    if(!data||!data[0]){toast("יצירת הטופס נכשלה","error");return;}
    setForms(prev=>[...prev,data[0]]);
    const link=`${origin}/form?id=${data[0].id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("הקישור הועתק - מוכן לשליחה");
    } catch {
      toast(`הקישור: ${link}`, "info");
    }
  };

  // DELIBERATELY NOT guarded by guardWrite(). This is the ONE mutating handler
  // that an expired or paused tenant must still be able to run, and it matches
  // the database exactly: public.settings is intentionally absent from the
  // `targets` list in gate.sql, so no RESTRICTIVE policy blocks this write
  // (check 6f asserts that). Her public /book page serves business name, phone
  // and opening hours out of this table, so locking her out would leave real
  // clients looking at wrong hours with no way for her to correct them.
  //
  // Everything this handler touches is public.settings and nothing else, so
  // there is no gated table behind it. Do not "fix" the missing guard here.
  // The accepted trade-off (settings also holds green_api_* and `automations`)
  // is documented at the top of gate.sql.
  const handleSaveSettings = async () => {
    if(isBusy("saveSettings")) return;
    setBusyKey("saveSettings", true);
    try {
      // Resolve the tenant with the SAME function the RLS policies use
      // (get_user_tenant_id). Reading tenant_members directly from the client is
      // itself gated by RLS and frequently returns null - which made tenant_id
      // wrong, the UPDATE miss 0 rows, and the INSERT fail with an empty {} error.
      const { data: rpcTenant, error: rpcErr } = await supabase.rpc("get_user_tenant_id");
      const { data: { user: dbgUser } } = await supabase.auth.getUser();
      console.log("[SETTINGS DEBUG] auth user id:", dbgUser?.id);
      console.log("[SETTINGS DEBUG] rpc get_user_tenant_id ->", { rpcTenant, rpcErr: rpcErr && { message: rpcErr.message, code: rpcErr.code, details: rpcErr.details, hint: rpcErr.hint } });
      console.log("[SETTINGS DEBUG] settings.id / settings.tenant_id in state:", settings.id, settings.tenant_id);
      const tenantId = rpcTenant || settings.tenant_id || null;
      console.log("[SETTINGS DEBUG] resolved tenantId:", tenantId);
      if (!tenantId) {
        // Offline, get_user_tenant_id cannot answer, so we can land here with a
        // perfectly valid account. "Log out and back in" is the worst possible
        // advice then: signing out clears the session and she cannot sign back
        // in without a network. Same trap as the load-error screen.
        if (isConnectionError(rpcErr) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          toast("אין חיבור לאינטרנט. ההגדרות לא נשמרו, והפרטים עדיין כאן. נסי שוב כשהחיבור יחזור.", "error");
          return;
        }
        toast("לא זוהה עסק - נסי לצאת ולהיכנס שוב", "error");
        return;
      }

      // Build a clean payload: editable fields only. Never write the primary key
      // or created_at (immutable / generated), and always stamp the resolved
      // tenant_id so the RLS WITH CHECK passes.
      const payload = { ...editSettings };
      delete payload.id;
      delete payload.created_at;
      delete payload.tenant_id;
      payload.tenant_id = tenantId;
      if ("bot_active" in payload) {
        payload.bot_active = !(payload.bot_active === false || payload.bot_active === "false");
      }

      // Update the tenant's existing settings row. We key on tenant_id (not the
      // cached settings.id) so the write lines up exactly with the RLS USING
      // clause and can't miss because of a stale/empty id in state.
      console.log("[SETTINGS DEBUG] UPDATE payload:", JSON.stringify(payload));
      let savedRow = null;
      const {data:upd,error:updErr} = await supabase.from("settings").update(payload).eq("tenant_id",tenantId).select();
      console.log("[SETTINGS DEBUG] UPDATE result -> rows:", upd, "| error:", updErr && { message: updErr.message, code: updErr.code, details: updErr.details, hint: updErr.hint });
      if (updErr) { handleDbError(updErr, "update settings"); return; }
      savedRow = (upd && upd[0]) || null;

      // Only create a row if this tenant genuinely has none yet.
      if (!savedRow) {
        console.log("[SETTINGS DEBUG] UPDATE matched 0 rows -> attempting INSERT");
        const {data:ins,error:insErr} = await supabase.from("settings").insert([payload]).select();
        console.log("[SETTINGS DEBUG] INSERT result -> rows:", ins, "| error:", insErr && { message: insErr.message, code: insErr.code, details: insErr.details, hint: insErr.hint });
        if (insErr) { handleDbError(insErr, "create settings"); return; }
        savedRow = (ins && ins[0]) || null;
      }
      if (!savedRow) {
        // Both paths returned 0 rows - this is an RLS / permissions problem,
        // not a success. Tell the truth instead of toasting "saved".
        toast("השמירה נכשלה - אין הרשאה לעדכן את ההגדרות", "error");
        return;
      }
      setSettings(savedRow);
      setEditSettings(null);
      toast("ההגדרות נשמרו");
    } finally {
      setBusyKey("saveSettings", false);
    }
  };

  const handleSaveService = async (svc,idx) => {
    if (guardWrite()) return;
    if(svc.id){
      const {data,error}=await supabase.from("service_prices").update(svc).eq("id",svc.id).select();
      if(error){handleDbError(error, "update service"); return;}
      if(data&&data[0]){setServices(prev=>prev.map((s,i)=>i===idx?data[0]:s)); toast("המחיר עודכן");}
    }
  };

  const handleAddService = async () => {
    if (guardWrite()) return;
    if(!newService.name.trim()){toast("נא להזין שם שירות","error");return;}
    if(isBusy("addService")) return;
    setBusyKey("addService", true);
    try {
      const {data,error}=await supabase.from("service_prices").insert([newService]).select();
      if(error){handleDbError(error, "add service"); return;}
      if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
      setServices(prev=>[...prev,data[0]]);setNewService({name:"",price:0,duration:60,color:DEFAULT_SERVICE_COLOR,active:true});setShowNewService(false); toast("השירות נוסף");
    } finally {
      setBusyKey("addService", false);
    }
  };

  const handleOpenCashier = (appt) => {
    setCashierAppt(appt||null);
    if(appt){
      const client=clients.find(c=>String(c.id)===String(appt.client_id));
      setCashierClient(client||null);setCashierSearch(client?.name||"");
      const svc=activeServices.find(s=>s.name===appt.service);
      setCashierItems([{id:Date.now(),name:appt.service,price:svc?.price||appt.price||0,qty:1,color:svc?.color||DEFAULT_SERVICE_COLOR}]);
    }else{setCashierClient(null);setCashierSearch("");setCashierItems([]);}
    setPaymentMethod("מזומן");setCashierDiscount(0);setCashierNote("");setShowCashier(true);
  };

  const handleSaveReceipt = async () => {
    if (guardWrite()) return;
    if(!cashierItems.length){toast("נא להוסיף פריט אחד לפחות","error");return;}
    if(isBusy("saveReceipt")) return;
    setBusyKey("saveReceipt", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      const receipt={
        client_id:cashierClient?.id||null,
        client_name:cashierClient?.name||"לקוחה",
        appointment_id:cashierAppt?.id||null,
        service:serviceNames,
        amount:cashierTotal,
        payment_method:paymentMethod,
        note:cashierNote,
        items:JSON.stringify(cashierItems),
        discount:Number(cashierDiscount||0),
      };
      const {data,error}=await supabase.from("receipts").insert([receipt]).select();
      if(error){handleDbError(error, "save receipt"); return;}
      if(!data||!data[0]){toast("יצירת הקבלה נכשלה","error");return;}
      setReceipts(prev=>[...prev,data[0]]);
      // Auto-send the receipt to the client on WhatsApp when enabled in settings.
      // Fire-and-forget: never blocks or breaks receipt creation; only warns on
      // failure. Uses the same sendReceiptToClient the manual button uses.
      if((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cashierClient?.phone){
        sendReceiptToClient(data[0],{silent:true})
          .then(ok=>{ if(!ok) toast("הקבלה נוצרה, אך השליחה האוטומטית נכשלה — שלחי ידנית מהקבלה","error"); })
          .catch(()=>toast("הקבלה נוצרה, אך השליחה האוטומטית נכשלה — שלחי ידנית מהקבלה","error"));
      }
      setShowCashier(false);setShowReceipt(data[0]);
      setCashierItems([]);setCashierClient(null);setCashierSearch("");setCashierDiscount(0);setCashierNote("");setCashierAppt(null);
      toast(`קבלה נוצרה — ₪${cashierTotal}`);
    } finally {
      setBusyKey("saveReceipt", false);
    }
  };

  // Add a business expense (tenant_id is filled by the DB column default).
  const handleAddExpense = async () => {
    if (guardWrite()) return;
    const amt = Number(newExpense.amount);
    if(!amt || amt<=0){ toast("נא להזין סכום תקין","error"); return; }
    if(!newExpense.expense_date){ toast("נא לבחור תאריך","error"); return; }
    if(isBusy("addExpense")) return;
    setBusyKey("addExpense", true);
    try {
      const payload = {
        amount: amt,
        expense_date: newExpense.expense_date,
        description: (newExpense.description||"").trim(),
        category: newExpense.category,
      };
      const {data,error} = await supabase.from("expenses").insert([payload]).select();
      if(error){ handleDbError(error,"add expense"); return; }
      if(data) setExpenses(prev=>[...prev, data[0]]);
      // Keep the chosen date + category for the next entry; clear amount + text.
      setNewExpense(prev=>({...prev, amount:"", description:""}));
      toast("ההוצאה נוספה");
    } finally {
      setBusyKey("addExpense", false);
    }
  };

  const handleDeleteExpense = (exp) => {
    if (guardWrite()) return;
    askConfirm({
      title: "מחיקת הוצאה",
      message: `למחוק את ההוצאה${exp.description?` "${exp.description}"`:""} (₪${Number(exp.amount).toLocaleString()})?`,
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const {error} = await supabase.from("expenses").delete().eq("id", exp.id);
        if(error){ handleDbError(error,"delete expense"); return; }
        setExpenses(prev=>prev.filter(e=>e.id!==exp.id));
        toast("ההוצאה נמחקה");
      },
    });
  };

  // ─── Beauty Voice: listen (Web Speech API) → understand (/api/voice-intent) ───
  const stopRecognition = () => {
    try { if (recognitionRef.current) recognitionRef.current.stop(); } catch {}
    recognitionRef.current = null;
  };
  const closeVoice = () => { stopRecognition(); setShowVoice(false); };

  const processVoice = async (transcript) => {
    setVoiceStatus("processing");
    try {
      const res = await fetch("/api/voice-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, today }),
      });
      const data = await res.json();
      if (res.ok && data.intent) {
        const intent = data.intent;
        setVoiceIntent(intent);
        if (intent.action === "book_appointment") prepareBooking(intent);
        else if (intent.action === "show_day") showDayInfo(intent);
        else if (intent.action === "revenue_summary") revenueInfo(intent);
        else if (intent.action === "cancel_appointment") prepareCancel(intent);
        else if (intent.action === "call_client") prepareCall(intent);
        else if (intent.action === "create_receipt") prepareReceipt(intent);
        else setVoiceStatus("result");
      } else { setVoiceErr(data.error || "לא הצלחתי להבין את הבקשה"); setVoiceStatus("error"); }
    } catch (err) {
      setVoiceErr(err.message); setVoiceStatus("error");
    }
  };

  // show_day: read-only list of the requested day's appointments (from state).
  const showDayInfo = (intent) => {
    const d = intent.date || today;
    const list = appointments.filter(a => a.date === d)
      .sort((a,b) => (startMinute(a)??0) - (startMinute(b)??0));
    setVoiceInfo({ kind: "day", date: d, items: list.map(a => ({ name: a.name, hour: a.hour, startMinute: startMinute(a), service: a.service })) });
    setVoiceStatus("info");
  };

  // revenue_summary: sum receipts for today / this month (read-only).
  const revenueInfo = (intent) => {
    const period = intent.period === "today" ? "today" : "month";
    const rs = period === "today"
      ? receipts.filter(r => (r.created_at||"").slice(0,10) === today)
      : receipts.filter(r => { const c = r.created_at && new Date(r.created_at); return c && c.getMonth() === thisMonth && c.getFullYear() === thisYear; });
    const total = rs.reduce((s,r) => s + (Number(r.amount)||0), 0);
    setVoiceInfo({ kind: "revenue", period, total, count: rs.length });
    setVoiceStatus("info");
  };

  // create_receipt: build an editable receipt draft (matching an existing client
  // if any). Nothing is created here — only on explicit confirm.
  const prepareReceipt = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const payMap = { cash: "מזומן", card: "אשראי", bit: "ביט" };
    setVoiceReceipt({
      clientName: matched ? matched.name : nameSpoken,
      amount: (intent.amount != null && intent.amount !== "") ? String(intent.amount) : "",
      payment: payMap[intent.payment_method] || "מזומן",
    });
    setVoiceStatus("receipt");
  };

  // Create the receipt (and the client, if new) — ONLY on explicit confirm.
  // Mirrors handleSaveReceipt's DB fields; tenant_id is filled by the DB default.
  const handleVoiceReceipt = async () => {
    if (guardWrite()) return;
    const b = voiceReceipt;
    if (!b) return;
    if (!b.clientName.trim()) { toast("חסר שם לקוחה", "error"); return; }
    const amt = Number(b.amount);
    if (!amt || amt <= 0) { toast("נא להזין סכום תקין", "error"); return; }
    if (isBusy("voiceReceipt")) return;
    setBusyKey("voiceReceipt", true);
    try {
      // Resolve the client: reuse an exact match, otherwise create a new one.
      let clientId = null;
      let clientName = b.clientName.trim();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === clientName.toLowerCase());
      if (existing) { clientId = existing.id; clientName = existing.name; }
      else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:clientName,phone:"",skinType:"",notes:"",status:"active"}]).select();
        if (ce) { handleDbError(ce, "create client (voice receipt)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const receipt = {
        client_id: clientId,
        client_name: clientName,
        appointment_id: null,
        service: "תשלום",
        amount: amt,
        payment_method: b.payment,
        note: "",
        items: JSON.stringify([]),
        discount: 0,
      };
      const {data,error} = await supabase.from("receipts").insert([receipt]).select();
      if (error) { handleDbError(error, "create receipt (voice)"); return; }
      closeVoice();
      toast("הקבלה הופקה ✦");
      // Open the receipt modal so the voice receipt gets the same actions
      // (print / manual "send to client") as a regular receipt.
      if (data) {
        setReceipts(prev=>[...prev, data[0]]);
        setShowReceipt(data[0]);
        // Auto-send to the client on WhatsApp when enabled (same helper as the
        // manual button). Fire-and-forget — never blocks or breaks creation.
        const cl = clients.find(c=>String(c.id)===String(data[0].client_id));
        if ((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cl?.phone) {
          sendReceiptToClient(data[0],{silent:true})
            .then(ok=>{ if(!ok) toast("הקבלה נוצרה, אך השליחה האוטומטית נכשלה — שלחי ידנית מהקבלה","error"); })
            .catch(()=>toast("הקבלה נוצרה, אך השליחה האוטומטית נכשלה — שלחי ידנית מהקבלה","error"));
        }
      }
    } finally {
      setBusyKey("voiceReceipt", false);
    }
  };

  // Send a receipt summary to the client's WhatsApp via GreenAPI (server route
  // /api/send-receipt, which reuses lib/whatsapp.js — the same mechanism as
  // booking confirmations). Only sends when the client has a phone number.
  // `silent` suppresses toasts for the auto-send path. Returns true on success.
  const sendReceiptToClient = async (receipt, { silent = false } = {}) => {
    if (guardWrite()) return false;
    if (!receipt) return false;
    // Resolve the phone from the tenant's own client row; fall back to any
    // phone already on the receipt object.
    const cl = clients.find(c => String(c.id) === String(receipt.client_id));
    const phone = (cl?.phone || receipt.client_phone || "").trim();
    if (!phone) { if (!silent) toast("ללקוחה אין מספר טלפון", "error"); return false; }
    try {
      const res = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: settings.tenant_id,
          client_name: receipt.client_name,
          client_phone: phone,
          amount: receipt.amount,
          payment_method: receipt.payment_method,
          date: (receipt.created_at || "").slice(0, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (!silent) toast(
          data.notConnected
            ? "וואטסאפ לא מחובר — חברי בהגדרות, או שלחי בקישור הישיר"
            : "שליחת הקבלה נכשלה — נסי בקישור הישיר",
          "error"
        );
        return false;
      }
      if (!silent) toast("הקבלה נשלחה ללקוחה ב-WhatsApp ✦");
      return true;
    } catch {
      if (!silent) toast("שליחת הקבלה נכשלה", "error");
      return false;
    }
  };

  // Print a receipt by rendering it into a fresh standalone window. This replaces
  // the in-modal @media-print trick, which the redesign broke: the modal overlay
  // (backdrop-filter) and the .pop-in card (transform: scale(1)) each become the
  // containing block for the position:fixed receipt, so it printed blank. A
  // standalone document has no such ancestors, so the full receipt always prints.
  const printReceipt = (receipt) => {
    if (!receipt) return;
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const rows = [
      ["לקוחה", esc(receipt.client_name || "לקוחה")],
      ["תאריך", esc((receipt.created_at || "").slice(0, 10))],
      ["שירות", esc(receipt.service || "")],
      ["אמצעי תשלום", esc(receipt.payment_method || "")],
    ];
    if (Number(receipt.discount) > 0) rows.push(["הנחה", "−₪" + esc(receipt.discount)]);
    if (receipt.note) rows.push(["הערה", esc(receipt.note)]);
    const rowsHtml = rows.map(([k, v]) => `<div class="row"><span class="k">${k}:</span><span class="v">${v}</span></div>`).join("");
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבלה</title>
<style>
  @page{size:A4;margin:18mm}
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{width:100%}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#2A2233;direction:rtl;font-size:16px}
  .wrap{max-width:700px;margin:0 auto;padding:24px 8px}
  .head{text-align:center;border-bottom:2px dashed #E3DBEC;padding-bottom:22px;margin-bottom:22px}
  .biz{font-size:34px;font-weight:700;letter-spacing:-0.01em}
  .sub{font-size:15px;color:#9A93A4;margin-top:4px}
  .body{font-size:19px;line-height:2.1}
  .row{display:flex;justify-content:space-between;gap:16px}
  .k{color:#9A93A4}
  .v{font-weight:600}
  .total{border-top:2px dashed #E3DBEC;margin-top:22px;padding-top:22px;display:flex;justify-content:space-between;align-items:center}
  .total .lbl{font-size:22px;font-weight:600;color:#5B5563}
  .total .amt{font-size:44px;font-weight:700;color:${esc(pc)}}
  .foot{text-align:center;font-size:14px;color:#9A93A4;margin-top:24px}
</style></head>
<body onload="window.print()">
  <div class="wrap">
    <div class="head">
      <div class="biz">${esc(settings.business_name || "העסק")}</div>
      <div class="sub">קבלה</div>
      ${settings.business_phone ? `<div class="sub">${esc(settings.business_phone)}</div>` : ""}
    </div>
    <div class="body">${rowsHtml}</div>
    <div class="total"><span class="lbl">סה״כ:</span><span class="amt">₪${esc(receipt.amount)}</span></div>
    <div class="foot">תודה ונתראה בקרוב ✦</div>
  </div>
  <script>window.onafterprint=function(){window.close()}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) { toast("החלון נחסם — אפשרי חלונות קופצים ונסי שוב", "error"); return; }
    w.document.write(html);
    w.document.close();
  };

  // Manual appointment reminder text — identical to the automatic cron reminder
  // and the /api/send-reminder-manual server message, incl. confirm/cancel links.
  // Used for the zero-dependency wa.me fallback.
  // Async now: the confirm/cancel links have to be signed server-side. Both
  // callers already await a fetch before opening WhatsApp, so this adds no new
  // popup-blocker exposure. Returns null when the links cannot be minted, so a
  // reminder is never sent carrying links that would be rejected.
  const reminderText = async (appt) => {
    const businessName = settings.business_name || "העסק";
    const links = await fetchConfirmLinks(appt.id);
    if (!links) return null;
    const confirmLink = links.confirmUrl;
    const cancelLink = links.cancelUrl;
    return `שלום ${appt.name}! 💆‍♀️ תזכורת לתור שלך ב-${businessName}:\n` +
      `📅 ${appt.date} בשעה ${fmtApptTime(appt)}\n` +
      `✨ טיפול: ${appt.service}\n\n` +
      `✅ לאישור התור: ${confirmLink}\n` +
      `🚫 לביטול התור: ${cancelLink}`;
  };

  // Send a one-off reminder for a specific appointment. Tries the tenant's
  // GreenAPI (server route, mirrors sendReceiptToClient); if that isn't
  // connected or fails, falls back to opening WhatsApp with the message
  // pre-filled (wa.me) so the reminder still goes out.
  const sendReminderToClient = async (appt) => {
    if (guardWrite()) return;
    if (!appt || isBusy("sendReminder")) return;
    const cl = clients.find(c => String(c.id) === String(appt.client_id));
    const phone = (cl?.phone || appt.client_phone || "").trim();
    if (!phone) { toast("ללקוחה אין מספר טלפון", "error"); return; }
    setBusyKey("sendReminder", true);
    try {
      const res = await fetch("/api/send-reminder-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: settings.tenant_id, appointmentId: appt.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) { toast("התזכורת נשלחה ללקוחה ✦"); return; }
      // Fallback: open WhatsApp with the reminder pre-filled.
      toast(data.notConnected ? "וואטסאפ לא מחובר — נפתחת שליחה ידנית" : "השליחה נכשלה — נפתחת שליחה ידנית", "error");
      const text = await reminderText(appt);
      const link = text && waMsg(phone, text);
      if (link) window.open(link, "_blank", "noopener");
    } catch {
      toast("השליחה נכשלה — נפתחת שליחה ידנית", "error");
      const text = await reminderText(appt);
      const link = text && waMsg(phone, text);
      if (link) window.open(link, "_blank", "noopener");
    } finally {
      setBusyKey("sendReminder", false);
    }
  };

  // Plain-text receipt summary for the zero-dependency wa.me fallback — opens
  // WhatsApp with the message pre-filled, so the receipt can be shared even when
  // GreenAPI isn't connected. Mirrors the server message in /api/send-receipt.
  const receiptShareText = (receipt) => {
    const businessName = settings.business_name || "העסק";
    return `שלום ${receipt.client_name || "לקוחה"}! ✦\n` +
      `קבלה מ${businessName}\n\n` +
      `💰 סכום: ₪${receipt.amount}\n` +
      `💳 אמצעי תשלום: ${receipt.payment_method || "מזומן"}\n` +
      `📅 תאריך: ${(receipt.created_at || "").slice(0, 10)}\n\n` +
      `תודה ונתראה בקרוב! 😊`;
  };

  // call_client: find the client by name; the call itself just opens tel:.
  const prepareCall = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr("לא זוהה שם לקוחה לחיוג. נסי שוב."); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = clients.filter(c => (c.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = clients.filter(c => (c.name||"").toLowerCase().includes(low));
    if (matches.length === 0) { setVoiceErr(`לא מצאתי לקוחה בשם ${nameSpoken}`); setVoiceStatus("error"); return; }
    setVoiceCall({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("call");
  };

  // cancel_appointment: find matching appointments (by name, then date) — nothing
  // is deleted here; deletion happens only on explicit confirm.
  const prepareCancel = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr("לא זוהה שם לקוחה לביטול. נסי שוב."); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = appointments.filter(a => (a.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = appointments.filter(a => (a.name||"").toLowerCase().includes(low));
    if (intent.date) matches = matches.filter(a => a.date === intent.date);
    if (matches.length === 0) { setVoiceErr(`לא מצאתי תור תואם ל${nameSpoken}`); setVoiceStatus("error"); return; }
    matches = [...matches].sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || ((startMinute(a)??0)-(startMinute(b)??0)));
    setVoiceCancel({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("cancel");
  };

  // Delete the selected appointment — ONLY on explicit confirm (same as handleDelete).
  const handleVoiceCancel = async () => {
    if (guardWrite()) return;
    const appt = voiceCancel?.selected;
    if (!appt) return;
    if (isBusy("voiceCancel")) return;
    setBusyKey("voiceCancel", true);
    try {
      // Soft cancel, same as handleDelete - this used to DELETE the row, so a
      // voice cancellation destroyed the appointment outright.
      const { data, error } = await softCancelAppointment(appt);
      if (error) { handleDbError(error, "cancel appointment (voice)"); return; }
      const updated = (data && data[0]) || { ...appt, confirmation_status: "cancelled" };
      setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
      closeVoice();
      toast("התור בוטל");
    } finally {
      setBusyKey("voiceCancel", false);
    }
  };

  // Build an editable booking draft from the intent (matching against the
  // tenant's own clients/services already in state). Nothing is created here.
  const prepareBooking = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    let matched = null;
    if (nameSpoken) {
      const low = nameSpoken.toLowerCase();
      matched = clients.find(c => (c.name||"").trim().toLowerCase() === low)
             || clients.find(c => (c.name||"").toLowerCase().includes(low));
    }
    const svcSpoken = (intent.service || "").trim();
    let svc = null;
    if (svcSpoken) {
      const low = svcSpoken.toLowerCase();
      svc = activeServices.find(s => (s.name||"").toLowerCase() === low)
         || activeServices.find(s => (s.name||"").toLowerCase().includes(low) || low.includes((s.name||"").toLowerCase()));
    }
    setVoiceBooking({
      clientName: matched ? matched.name : nameSpoken,
      service: svc ? svc.name : "",
      date: intent.date || today,
      time: intent.time || "",
    });
    setVoiceStatus("confirm");
  };

  // Create the appointment (and the client, if new) — ONLY on explicit confirm.
  // Mirrors the regular booking flow (same table, tenant_id filled by DB default).
  const handleVoiceBook = async () => {
    if (guardWrite()) return;
    const b = voiceBooking;
    if (!b) return;
    if (!b.clientName.trim()) { toast("חסר שם לקוחה", "error"); return; }
    if (!b.service) { toast("נא לבחור שירות", "error"); return; }
    if (!b.date || !b.time) { toast("נא לבחור תאריך ושעה", "error"); return; }
    const svc = activeServices.find(s => s.name === b.service);
    // Real minutes. This used to take Number(time.split(":")[0]) and store that
    // as a whole hour, so "קבעי לרונית ב-שתיים וחצי" silently booked 14:00 -
    // the one write path the minutes migration missed. toMinutes rejects
    // anything unparseable rather than falling through to 0, so a malformed
    // time still never books silently at 00:00.
    const startMin = toMinutes(b.time);
    if (startMin === null) { toast("שעה לא תקינה", "error"); return; }
    const duration = svc?.duration || 60;
    // Guard against double-booking, mirroring handleSave: reject if the new
    // [start,end) overlaps any non-cancelled appointment on that date.
    {
      const newStart = startMin, newEnd = newStart + duration;
      const clash = appointments.some(a=>{
        if(a.date!==b.date || a.confirmation_status==="cancelled") return false;
        const bs=startMinute(a), be=endMinute(a); if(bs===null||be===null) return false;
        return newStart<be && bs<newEnd;
      });
      if(clash){ toast("השעה הזו כבר תפוסה","error"); return; }
    }
    if (isBusy("voiceBook")) return;
    setBusyKey("voiceBook", true);
    try {
      // Stamp the resolved tenant on both inserts so they satisfy the RLS
      // WITH CHECK even if the table column default isn't applied (mirrors the
      // regular booking flow). Omit the field if the tenant can't be resolved,
      // so we never regress below the DB default behavior.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      // Resolve client: reuse an exact-name match, otherwise create a new one.
      let clientId = null;
      const low = b.clientName.trim().toLowerCase();
      const existing = clients.find(c => (c.name||"").trim().toLowerCase() === low);
      if (existing) {
        clientId = existing.id;
      } else {
        const {data:nc,error:ce} = await supabase.from("clients")
          .insert([{name:b.clientName.trim(),phone:"",skinType:"",notes:"",status:"active",...tenantField}]).select();
        if (ce) { handleDbError(ce, "create client (voice)"); return; }
        if (nc?.[0]) { clientId = nc[0].id; setClients(prev=>[...prev, nc[0]]); }
      }
      const appt = {
        date: b.date,
        // Both columns, exactly as every other write path does it.
        ...startFields(startMin),
        name: b.clientName.trim(),
        service: b.service,
        duration: duration,
        color: svc?.color || "var(--warning)",
        client_id: clientId,
        note: "",
        price: svc?.price || 0,
        confirmation_status: "pending",
        confirmation_sent: false,
        ...tenantField,
      };
      const {data,error} = await supabase.from("appointments").insert([appt]).select();
      if (error) { handleDbError(error, "create appointment (voice)"); return; }
      if (data) setAppointments(prev=>[...prev, data[0]]);
      closeVoice();
      toast("התור נקבע ✦");
    } finally {
      setBusyKey("voiceBook", false);
    }
  };

  const startVoice = () => {
    const SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setVoiceIntent(null); setVoiceTranscript(""); setVoiceErr("");
    setShowVoice(true);
    if (!SR) { setVoiceStatus("unsupported"); return; }
    setVoiceStatus("listening");
    const rec = new SR();
    rec.lang = "he-IL";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
      setVoiceTranscript(t);
      if (t) processVoice(t);
    };
    rec.onerror = (e) => {
      setVoiceErr(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "אין הרשאת מיקרופון. אפשרי גישה בדפדפן ונסי שוב."
        : "שגיאה בהאזנה. נסי שוב.");
      setVoiceStatus("error");
    };
    // If listening ended with no result, surface a gentle retry state.
    rec.onend = () => { setVoiceStatus(s => s === "listening" ? "error" : s); };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setVoiceStatus("error"); setVoiceErr("לא ניתן להפעיל את המיקרופון"); }
  };

  // Credit card payment via Grow - opens secure payment page
  const handleCreditPayment = async () => {
    if (guardWrite()) return;
    if(!cashierItems.length){toast("נא להוסיף פריט אחד לפחות","error");return;}
    if(isBusy("creditPayment")) return;
    setBusyKey("creditPayment", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      const res=await fetch("/api/payment/create",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          sum:cashierTotal,
          description:serviceNames,
          fullName:cashierClient?.name||"לקוחה",
          phone:cashierClient?.phone||"",
          clientId:cashierClient?.id||"",
          appointmentId:cashierAppt?.id||"",
        }),
      });
      const data=await res.json();
      if(data.ok&&data.url){
        // Open Grow secure payment page in a new tab
        window.open(data.url,"_blank");
        toast("💳 דף התשלום נפתח - הקבלה תיווצר אוטומטית לאחר התשלום");
        setShowCashier(false);
      }else{
        toast(`שגיאה בפתיחת התשלום: ${data.error||"לא ידוע"}`,"error");
      }
    } catch(err) {
      handleDbError(err,"credit payment");
    } finally {
      setBusyKey("creditPayment", false);
    }
  };

  const handleSavePackage = async () => {
    if (guardWrite()) return;
    if(!newPackage.client_id||!newPackage.service){toast("נא לבחור לקוחה ושירות","error");return;}
    if(isBusy("savePackage")) return;
    setBusyKey("savePackage", true);
    try {
      const {data,error}=await supabase.from("packages").insert([newPackage]).select();
      if(error){handleDbError(error, "save package"); return;}
      if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
      setPackages(prev=>[...prev,data[0]]);setShowPackageModal(false);toast("החבילה נוספה");
    } finally {
      setBusyKey("savePackage", false);
    }
  };

  const handleUsePackageSession = async (pkg) => {
    if (guardWrite()) return;
    const used=Number(pkg.used_sessions)+1;
    const active=used<Number(pkg.total_sessions);
    const {data,error}=await supabase.from("packages").update({used_sessions:used,active}).eq("id",pkg.id).select();
    if(error){handleDbError(error, "use package session"); return;}
    if(data&&data[0]){setPackages(prev=>prev.map(p=>p.id===pkg.id?data[0]:p)); toast(active?`טיפול ${used}/${pkg.total_sessions}`:"החבילה הסתיימה");}
  };

  const handleSaveWaitlist = async () => {
    if (guardWrite()) return;
    if(!newWaitlist.client_name||!newWaitlist.service){toast("נא למלא פרטים","error");return;}
    if(isBusy("saveWaitlist")) return;
    setBusyKey("saveWaitlist", true);
    try {
      const {data,error}=await supabase.from("waitlist").insert([newWaitlist]).select();
      if(error){handleDbError(error, "save waitlist"); return;}
      if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
      setWaitlist(prev=>[...prev,data[0]]);setShowWaitlistModal(false);toast("נוספה לרשימת המתנה");
    } finally {
      setBusyKey("saveWaitlist", false);
    }
  };

  const handleSaveProtocol = async () => {
    if (guardWrite()) return;
    if(!newProtocol.brand||!newProtocol.name){toast("נא למלא מותג ושם","error");return;}
    if(isBusy("saveProtocol")) return;
    setBusyKey("saveProtocol", true);
    try {
      const {data,error}=await supabase.from("treatment_protocols").insert([newProtocol]).select();
      if(error){handleDbError(error, "save protocol"); return;}
      if(!data||!data[0]){toast("השמירה נכשלה","error");return;}
      setProtocols(prev=>[data[0],...prev]);setShowProtocolModal(false);setNewProtocol(emptyProtocol);toast("הפרוטוקול נשמר");
    } finally {
      setBusyKey("saveProtocol", false);
    }
  };

  const handleExportCSV = () => {
    const rows=[["שם","טלפון","שירות","תאריך","סכום","אמצעי תשלום"]];
    receipts.forEach(r=>{const client=clients.find(c=>String(c.id)===String(r.client_id));rows.push([r.client_name,client?.phone||"",r.service,r.created_at?.slice(0,10)||"",r.amount,r.payment_method]);});
    // Quote every cell (escaping embedded quotes) so values containing commas
    // — e.g. a multi-item receipt service "פנים, עיסוי" — don't shift columns.
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv=rows.map(r=>r.map(esc).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`beautyos_${today}.csv`;a.click();URL.revokeObjectURL(url);
    toast("הקובץ ירד");
  };

  // === WHATSAPP CENTER HANDLERS ===
  const waSendOne = (clientId, phone, message) => {
    if(!phone){toast("אין מספר טלפון ללקוחה","error");return;}
    const link=waMsg(phone,message);
    if(link)window.open(link,"_blank");
    if(clientId)setWaSentToday(prev=>({...prev,[clientId]:true}));
  };

  const waSendGroup = (items) => {
    const targets=items.filter(it=>it.phone);
    if(targets.length===0){toast("אין נמענים עם טלפון","error");return;}
    askConfirm({
      title:"שליחה קבוצתית",
      message:`ייפתחו ${targets.length} חלונות וואטסאפ — אחד לכל לקוחה. לאשר?`,
      confirmText:"שלחי",
      onConfirm:async()=>{
        for(const t of targets){
          waSendOne(t.clientId,t.phone,t.message);
          await new Promise(r=>setTimeout(r,700));
        }
        toast(`נפתחו ${targets.length} הודעות`);
      },
    });
  };

  const openEditClient = (client) => {
    setEditingClient(client);
    setNewClient({name:client.name||"",phone:client.phone||"",birthday:client.birthday||"",skinType:client.skinType||"",allergies:client.allergies||"",medical:client.medical||"",notes:client.notes||"",status:client.status||"active"});
    setShowClientModal(true);
  };

  const openEditLead = (lead) => {
    setEditingLead(lead);
    setNewLead({name:lead.name||"",phone:lead.phone||"",source:lead.source||"פייסבוק",service_interest:lead.service_interest||"",status:lead.status||"new",notes:lead.notes||"",reminder_date:lead.reminder_date||""});
    setShowLeadModal(true);
  };

  // Downscale + compress an image file in the browser before sending it to
  // the AI, so we never hit the server's request-size limit (413).
  const compressImage = (file, maxDim = 1024, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          canvas.toBlob(
            (blob) => resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg", blob }),
            "image/jpeg", quality
          );
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Load all saved skin scans for a client (newest first)
  const loadClientScans = async (clientId) => {
    setScansLoading(true);
    try {
      const { data } = await supabase
        .from("skin_scans")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientScans(data || []);
    } catch { setClientScans([]); }
    finally { setScansLoading(false); }
  };

  // Load all before/after photos for a client (newest first)
  const loadClientPhotos = async (clientId) => {
    try {
      const { data } = await supabase
        .from("client_photos")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientPhotos(data || []);
    } catch { setClientPhotos([]); }
  };

  // Upload a before/after photo pair for a client
  const uploadClientPhoto = async (beforeFile, afterFile, treatment, note, clientId) => {
    if (!beforeFile && !afterFile) { toast("בחרי לפחות תמונה אחת", "error"); return; }
    setPhotoUploading(true);
    try {
      const tid = settings?.tenant_id;
      if (!tid) { toast("לא זוהה עסק — לא ניתן להעלות", "error"); return; }
      // Store tenant-scoped PATHS (private bucket); display signs them on demand.
      let beforeUrl = null, afterUrl = null;
      if (beforeFile) {
        const { blob } = await compressImage(beforeFile, 1280, 0.82);
        const fn = clientImagePath(tid, clientId, `before-${Date.now()}.jpg`);
        await supabase.storage.from(PRIVATE_BUCKET).upload(fn, blob, { contentType: "image/jpeg" });
        beforeUrl = fn;
      }
      if (afterFile) {
        const { blob } = await compressImage(afterFile, 1280, 0.82);
        const fn = clientImagePath(tid, clientId, `after-${Date.now()}.jpg`);
        await supabase.storage.from(PRIVATE_BUCKET).upload(fn, blob, { contentType: "image/jpeg" });
        afterUrl = fn;
      }
      const { error } = await supabase.from("client_photos").insert([{
       tenant_id: settings.tenant_id,
        client_id: clientId,
        before_url: beforeUrl,
        after_url: afterUrl,
        treatment: treatment || null,
        note: note || null,
      }]);
      if (error) { handleDbError(error, "save client photo"); return; }
      toast("התמונות נשמרו");
      loadClientPhotos(clientId);
    } catch { toast("שגיאה בהעלאת התמונות", "error"); }
    finally { setPhotoUploading(false); }
  };

  // Scan a client's skin: analyze with AI, store the image, and save the full
  // report to skin_scans so it builds a history per client.
  const scanClientSkin = async (client, file) => {
    if (!file || scanLoading) return;
    setScanLoading(true); setScanReport(null);
    try {
      // Compress in the browser first to avoid 413 (payload too large)
      const { base64, mediaType, blob } = await compressImage(file);
      const res = await fetch("/api/skin-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType, tenantId: settings.tenant_id }),
      });
      const data = await res.json();
      if (!data.success) { toast(data.error || "הניתוח נכשל", "error"); setScanLoading(false); return; }
      setScanReport(data.report);

      // Upload the scan image to storage (best-effort)
      let imageUrl = null;
      try {
        const tid = settings?.tenant_id;
        if (tid) {
          // Tenant-scoped PATH in the private bucket; signed on display.
          const fileName = clientImagePath(tid, client.id, `scan_${Date.now()}.jpg`);
          const { error: ue } = await supabase.storage.from(PRIVATE_BUCKET).upload(fileName, blob, { contentType: "image/jpeg" });
          if (!ue) imageUrl = fileName;
        }
      } catch {}

      // Save the full report to skin_scans (per-client history).
      // tenant_id is set automatically by the column default (get_user_tenant_id()).
      try {
        await supabase.from("skin_scans").insert({
          client_id: client.id,
          image_url: imageUrl,
          report: data.report,
          score: data.report.score,
          skin_type: data.report.skin_type,
        });
      } catch (e) { /* non-fatal */ }

      // Refresh history if this client's card is open
      loadClientScans(client.id);
      toast("✦ הסריקה נשמרה לכרטיס");
    } catch (err) {
      toast("שגיאה בסריקה", "error");
    } finally {
      setScanLoading(false);
    }
  };

  // Cycle the reassuring "מנתחת..." steps while a scan is in flight (UI only).
  useEffect(() => {
    if (!scanLoading) { setScanStep(0); return; }
    const id = setInterval(() => setScanStep((s) => s + 1), 1800);
    return () => clearInterval(id);
  }, [scanLoading]);

  // Is a Facebook page connected for THIS tenant? Mirrors the campaigns route's
  // check (facebook_pages, is_active). RLS scopes the query to the tenant, so we
  // never see another business's page.
  const loadFbConnection = async () => {
    try {
      const { data } = await supabase
        .from("facebook_pages")
        .select("page_name")
        .eq("is_active", true)
        .limit(1);
      setFbPage(data && data.length > 0 ? data[0] : null);
    } catch { /* non-fatal — leave as not-connected */ }
  };

  // Fetch live Facebook ad campaigns for the current tenant
  const loadFbCampaigns = async (preset) => {
    setFbLoading(true); setFbError(null);
    try {
      const dp = preset || fbDatePreset;
      const res = await fetch(`/api/marketing/campaigns?datePreset=${dp}`);
      const data = await res.json();
      if (data.ok) {
        setFbCampaigns(data.campaigns || []);
        setFbTotals(data.totals || null);
      } else {
        setFbCampaigns([]);
        setFbError(data.error || "לא ניתן לטעון קמפיינים");
      }
    } catch (err) {
      setFbError(err.message);
      setFbCampaigns([]);
    } finally {
      setFbLoading(false);
    }
  };

  // === AI MARKETING: full flow (strategy -> posts with images, + groups) ===
  const generatePosts = async () => {
    if (!postGoal.trim()) { toast("נא לכתוב מה תרצי לפרסם", "error"); return; }
    if (postLoading) return;
    setPostLoading(true); setPostError(null); setPostVariations(null); setPostStrategy(null);
    try {
      // Step 1: strategy
      const sRes = await fetch("/api/marketing/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: postGoal.trim() }),
      });
      const sData = await sRes.json();
      if (!sRes.ok || !sData.strategy) {
        setPostError(sData.error || "יצירת האסטרטגיה נכשלה");
        setPostLoading(false);
        return;
      }
      setPostStrategy(sData.strategy);

      // Step 2: post variations (with Unsplash images) based on that strategy
      const vRes = await fetch("/api/marketing/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: sData.strategy, count: 5 }),
      });
      const vData = await vRes.json();
      if (vRes.ok && vData.variations) {
        setPostVariations(vData.variations);
      } else {
        setPostError(vData.error || "יצירת הפוסטים נכשלה");
      }
    } catch (err) {
      setPostError(err.message);
    } finally {
      setPostLoading(false);
    }
  };

  const generateReel = async () => {
    if (!reelTopic.trim()) { toast("כתבי נושא לרילס", "error"); return; }
    if (reelLoading) return;
    setReelLoading(true); setReelError(null); setReelData(null);
    try {
      const res = await fetch("/api/marketing/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: reelTopic.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.reel) {
        setReelData(data.reel);
      } else {
        setReelError(data.error || "יצירת הרילס נכשלה");
      }
    } catch (err) {
      setReelError(err.message);
    } finally {
      setReelLoading(false);
    }
  };

  const loadGroups = async () => {
    if (groupsLoading) return;
    setGroupsLoading(true); setGroupsError(null);
    try {
      const res = await fetch("/api/marketing/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      });
      const data = await res.json();
      if (res.ok && data.groups) {
        setGroups(data.groups);
      } else {
        setGroupsError(data.error || "טעינת הקבוצות נכשלה");
      }
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      setGroupsLoading(false);
    }
  };

  // Copy a public link (scanner / booking) for the current tenant
  const copyPublicLink = async (kind) => {
    const t = settings.tenant_id;
    if (!t) { toast("חסר מזהה עסק - נסי לרענן", "error"); return; }
    const base = "https://beautyos-theta.vercel.app";
    const url = kind === "scan" ? `${base}/skin-scan?t=${t}` : kind === "community" ? `${base}/community?t=${t}` : `${base}/book?t=${t}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(kind === "scan" ? "קישור הסורק הועתק" : kind === "community" ? "קישור הקהילה הועתק" : "קישור קביעת התור הועתק");
    } catch {
      toast(url, "info");
    }
  };

  // Load the community feed posts for this tenant (newest first)
  const loadCommunityPosts = async () => {
    setCommunityLoading(true);
    try {
      const { data } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false });
      setCommunityPosts(data || []);
    } catch { setCommunityPosts([]); }
    finally { setCommunityLoading(false); }
  };
  // Load treatment protocols for the current tenant
  const loadProtocols = async () => {
    setProtocolsLoading(true);
    try {
      const { data } = await supabase
        .from("treatment_protocols")
        .select("*")
        .order("created_at", { ascending: false });
      setProtocols(data || []);
    } catch { setProtocols([]); }
    finally { setProtocolsLoading(false); }
  };

  // Load the AI advisor conversation history (tenant resolved server-side).
  const loadAdvisor = async () => {
    try {
      const res = await fetch("/api/advisor");
      const data = await res.json();
      setAdvisorMessages(res.ok && Array.isArray(data.messages) ? data.messages : []);
    } catch { setAdvisorMessages([]); }
  };

  // Send a question to the AI advisor; optimistically show it, then the reply.
  const sendAdvisor = async () => {
    if (guardWrite()) return;
    const q = advisorInput.trim();
    if (!q || advisorSending) return;
    setAdvisorSending(true);
    setAdvisorInput("");
    // Optimistic: show the user's question immediately.
    setAdvisorMessages(prev => [...(prev || []), { id: "tmp-" + Date.now(), role: "user", content: q }]);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setAdvisorMessages(prev => [...(prev || []), { id: "a-" + Date.now(), role: "assistant", content: data.reply }]);
      } else {
        toast(data.error || "היועץ לא הצליח לענות", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAdvisorSending(false);
    }
  };

  // Upload an image for a community post to the shared bucket
  const uploadPostImage = async (file) => {
    if (!file) return;
    setPostImageUploading(true);
    try {
      const { base64, blob } = await compressImage(file, 1280, 0.82);
      // Community images are shown publicly to other businesses in the community
      // feed, so they live in a separate PUBLIC bucket (not the private
      // client-images bucket) and keep using a public URL.
      const tid = settings?.tenant_id || "shared";
      const fileName = `${tid}/${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from(PUBLIC_BUCKET).upload(fileName, blob, { contentType: "image/jpeg" });
      if (!ue) {
        const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(fileName);
        setNewPost(p => ({ ...p, image_url: urlData.publicUrl }));
        toast("התמונה הועלתה");
      } else { toast("שגיאה בהעלאת תמונה", "error"); }
    } catch { toast("שגיאה בהעלאת תמונה", "error"); }
    finally { setPostImageUploading(false); }
  };

  // Save a new community post
  const saveCommunityPost = async () => {
    if (guardWrite()) return;
    if (savingPost) return;
    if (!newPost.body && !newPost.title) { toast("כתבי תוכן לפוסט", "error"); return; }
    setSavingPost(true);
    try {
      const { data, error } = await supabase.from("community_posts").insert([{
        title: newPost.title || null,
        body: newPost.body || null,
        image_url: newPost.image_url || null,
        post_type: newPost.post_type || "update",
        cta_label: newPost.cta_label || null,
      }]).select();
      if (error) { handleDbError(error, "create community post"); return; }
      if (data && data[0]) setCommunityPosts(prev => [data[0], ...prev]);
      setNewPost({ title:"", body:"", post_type:"update", cta_label:"", image_url:"" });
      setShowPostModal(false);
      toast("הפוסט פורסם למרחב הלקוחות");
    } finally { setSavingPost(false); }
  };

  // Delete a community post
  const deleteCommunityPost = async (id) => {
    if (guardWrite()) return;
    // Supabase returns { error } rather than throwing, so a try/catch never fired
    // on a real DB/RLS failure — the post vanished from the UI but not the DB.
    const { error } = await supabase.from("community_posts").delete().eq("id", id);
    if (error) { handleDbError(error, "delete community post"); return; }
    setCommunityPosts(prev => prev.filter(p => p.id !== id));
    toast("הפוסט נמחק");
  };

  const copyPost = async (v) => {
    const text = `${v.body}\n\n${v.callToAction}\n\n${(v.hashtags || []).join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("הפוסט הועתק - אפשר להדביק בפייסבוק/אינסטגרם");
    } catch {
      toast("לא ניתן להעתיק אוטומטית", "error");
    }
  };

  // Open Facebook's share dialog. We also copy the post text to the clipboard
  // so she can paste it straight into the Facebook composer.
  const shareToFacebook = async (v) => {
    const text = `${v.body}\n\n${v.callToAction}\n\n${(v.hashtags || []).join(" ")}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    const shareUrl = "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent("https://beautyos-theta.vercel.app") +
      "&quote=" + encodeURIComponent(text);
    window.open(shareUrl, "_blank", "width=640,height=640");
    toast("הטקסט הועתק - הדביקי אותו בחלון של פייסבוק");
  };

  // Download the post image as a 1080x1080 square (Facebook/Instagram ready)
  const downloadImage = async (url, idx) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const SIZE = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      // Cover-crop the source into a centered square
      const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      canvas.toBlob((out) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(out);
        link.download = `beautyos-post-${idx || 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast("התמונה הורדה בפורמט פוסט (1080x1080)");
      }, "image/jpeg", 0.92);
    } catch {
      window.open(url, "_blank");
      toast("התמונה נפתחה בחלון חדש - לחצי שמירה");
    }
  };

  // Render the styled post template (DOM node #post-design) to a 1080x1080 PNG
  const downloadPostImage = async () => {
    const node = document.getElementById("post-design");
    if (!node) { toast("התבנית לא נמצאה", "error"); return; }
    setDesigning(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
      canvas.toBlob((out) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(out);
        link.download = "beautyos-design-" + Date.now() + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast("התמונה המעוצבת הורדה");
      }, "image/png");
    } catch (e) {
      toast("שגיאה ביצירת התמונה", "error");
    } finally { setDesigning(false); }
  };

  // Save the current generated campaign + posts to the database
  const saveCampaign = async () => {
    if (guardWrite()) return;
    if (!postVariations || postVariations.length === 0) return;
    if (savingCampaign) return;
    setSavingCampaign(true);
    try {
      const res = await fetch("/api/marketing/save-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: postGoal.trim().slice(0, 40),
          goal: postGoal.trim(),
          strategy: postStrategy,
          variations: postVariations,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast("✦ הקמפיין נשמר");
        loadSavedCampaigns();
      } else {
        toast(data.error || "השמירה נכשלה", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingCampaign(false);
    }
  };

  // The WhatsApp message log. /api/messages derives the tenant from the session
  // cookie, so no tenant id is sent or needed - she can only ever read her own.
  const loadWaMessages = async () => {
    setWaLogLoading(true); setWaLogError("");
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      if (data.success) setWaMessages(data.messages || []);
      else setWaLogError(data.error || "טעינת ההודעות נכשלה");
    } catch (err) {
      setWaLogError(err.message || "טעינת ההודעות נכשלה");
    }
    setWaLogLoading(false);
  };
  // Hebrew labels for the message_type column. slot_offer and lead_bulk are
  // written by the gap-fill and lead-template send paths.
  const WA_TYPE_LABELS = {
    reminder:"תזכורת", confirmation:"אישור הגעה", booking_confirm:"אישור תור",
    owner_alert:"התראת תור", receipt:"קבלה", skin_report:"דוח עור",
    skin_lead_alert:"ליד מהסורק", slot_offer:"הצעת תור", lead_bulk:"הודעה ללידים",
    general:"כללי",
  };

  const loadSavedCampaigns = async () => {
    try {
      const res = await fetch("/api/marketing/list");
      const data = await res.json();
      if (res.ok && data.campaigns) setSavedCampaigns(data.campaigns);
    } catch {}
  };

  const deleteCampaign = (campaignId) => {
    if (guardWrite()) return;
    askConfirm({
      title: "מחיקת קמפיין",
      message: "למחוק את הקמפיין וכל הפוסטים שלו?",
      confirmText: "מחיקה",
      danger: true,
      onConfirm: async () => {
        const res = await fetch("/api/marketing/delete-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
        if (res.ok) {
          toast("הקמפיין נמחק");
          loadSavedCampaigns();
        } else {
          toast("המחיקה נכשלה", "error");
        }
      },
    });
  };

  if(loading) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,var(--surface-2) 0%,#FFFFFF 340px)",padding:"22px 18px",fontFamily:"'Heebo',sans-serif"}}>
      <style>{`@keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}.skel{background:linear-gradient(90deg,var(--pc-tint) 25%,#F8F1F4 50%,var(--pc-tint) 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}`}</style>
      <div style={{maxWidth:1180,margin:"0 auto"}}>
        <div className="skel" style={{width:180,height:26,marginBottom:22}}/>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:22}}>
          {[0,1,2,3].map(i=><div key={i} className="skel" style={{flex:"1 1 160px",height:90,borderRadius:18}}/>)}
        </div>
        <div className="skel" style={{width:140,height:20,marginBottom:14}}/>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[0,1,2,3,4].map(i=><div key={i} className="skel" style={{width:"100%",height:54,borderRadius:14}}/>)}
        </div>
      </div>
    </div>
  );

  // ── COULD NOT LOAD ────────────────────────────────────────────────────────
  // Deliberately a full-screen stop, in the same position as the loading
  // screen, rather than a toast over an empty dashboard. A toast can be missed
  // and the app behind it still says "no clients" - which is the exact lie this
  // exists to prevent. The copy leads with "your data is safe" because the
  // first thing this screen has to answer, for someone with a year of history,
  // is "have I lost everything".
  if(loadError) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,var(--surface-2) 0%,#FFFFFF 340px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"22px 18px",fontFamily:"'Heebo','Assistant',sans-serif",direction:"rtl"}}>
      <div style={{width:"100%",maxWidth:440,background:"var(--surface,#FFFFFF)",border:"1px solid var(--line,#ECE4F0)",borderRadius:20,boxShadow:"0 18px 44px rgba(74,46,90,0.10)",padding:"32px 26px",textAlign:"center"}}>
        <div aria-hidden style={{width:60,height:60,margin:"0 auto 18px",borderRadius:"50%",background:"var(--pc-tint,#F1E2F2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{loadError.offline ? "📶" : "⚠️"}</div>
        <h1 style={{fontSize:22,fontWeight:600,margin:"0 0 10px",color:"var(--ink,#2A2233)"}}>
          {loadError.offline ? "אין חיבור לאינטרנט" : "לא הצלחנו לטעון את הנתונים"}
        </h1>
        <p style={{fontSize:14.5,lineHeight:1.7,color:"var(--ink-2,#6B6275)",margin:"0 0 22px"}}>
          <strong>הנתונים שלך במקום.</strong> לא נמחק כלום.
          {loadError.offline
            ? " הטלפון לא מחובר לרשת כרגע, אז לא הצלחנו להביא את היומן שלך. ברגע שיהיה חיבור, הכל יחזור כרגיל."
            : " פשוט לא הצלחנו להביא אותם כרגע, ולכן אנחנו לא מציגים לך מסך ריק שנראה כאילו אין לך לקוחות."}
          <br/>
          {loadError.offline
            ? "בדקי את החיבור ונסי שוב."
            : "אפשר לנסות שוב. אם זה חוזר, שלחי לנו את השורה הקטנה שלמטה."}
        </p>
        <button
          type="button"
          onClick={()=>{ setLoadError(null); setLoading(true); loadAll(); }}
          style={{width:"100%",padding:"14px 20px",borderRadius:999,border:"none",background:"linear-gradient(135deg,#7D6489 0%,#4C3457 100%)",color:"#FFFFFF",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}
        >
          נסי שוב
        </button>
        {/* Sign-out is hidden while offline ON PURPOSE. Signing out clears the
            local session, and with no network she cannot sign back in - the
            "fix it" button would lock her out of her own app until the
            connection returns. It is only useful for a genuine auth problem. */}
        {!loadError.offline && (
          <button
            type="button"
            onClick={()=>{ supabase.auth.signOut().finally(()=>router.replace("/login")); }}
            style={{width:"100%",padding:"12px 20px",borderRadius:999,border:"1px solid var(--line,#E2D6EA)",background:"transparent",color:"var(--ink-2,#5B3E67)",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
          >
            יציאה והתחברות מחדש
          </button>
        )}
        <p style={{fontSize:11,color:"var(--ink-3,#9A93A3)",margin:"18px 0 0",direction:"ltr",fontFamily:"ui-monospace,Menlo,Consolas,monospace",wordBreak:"break-word"}}>
          {loadError.tables.join(", ")}{loadError.code ? ` · ${loadError.code}` : ""}
        </p>
      </div>
    </div>
  );

  // Primary navigation – matches the mockup's right-hand sidebar.
  // Each item maps to an existing activeTab id, so no logic changes.
  // Floral density per tab. The login page is the reference: a full, rich
  // watercolor wash. Sparse screens match it exactly; screens dominated by
  // tables and grids sit lower so rows stay readable through the blossoms -
  // clearly visible, not barely there.
  const DENSE_TABS = ["calendar", "cashier", "leads", "tax", "clients"];
  const SPARSE_TABS = ["dashboard", "insights", "advisor", "community"];
  const floralOpacity = SPARSE_TABS.includes(activeTab)
    ? 1                        // same as /login
    : DENSE_TABS.includes(activeTab)
      ? (isNarrow ? 0.72 : 0.58)  // still readable through, distinctly floral
      : (isNarrow ? 0.92 : 0.8);  // everything else sits between the two

  // Bottom bar: the five destinations she reaches most in a working day.
  // Everything else lives behind "עוד" so the bar never crowds.
  const BOTTOM_NAV = [
    {id:"calendar",  label:"יומן"},
    {id:"clients",   label:"לקוחות"},
    {id:"leads",     label:"לידים"},
    {id:"cashier",   label:"תשלום"},
    {id:"dashboard", label:"בית"},
  ];
  // The three one-insert stubs (community, packages, protocols) are filtered
  // out of BOTH nav lists unless this tenant has opted back in. Hidden, not
  // deleted: every loader, render block and table below is untouched, so the
  // flag brings a tab back with its data intact. campaigns and insights are
  // never filtered - see lib/featureFlags.ts for why that is a deliberate
  // exception and not an oversight.
  const MORE_NAV = visibleTabIds(settings, ["insights","tax","campaigns","community","packages","protocols","advisor","whatsapp"]);

  const NAV_ITEMS = [
    {id:"dashboard",label:"היום"},
    {id:"insights", label:"תובנות"},
    {id:"calendar", label:"יומן"},
    {id:"clients",  label:"לקוחות"},
    {id:"leads",    label:"לידים"},
    {id:"cashier",  label:"קופה"},
    {id:"tax",      label:"דוחות מס"},
    {id:"whatsapp", label:"הודעות"},
    {id:"campaigns",label:"שיווק"},
    {id:"community",label:"קהילה"},
    {id:"packages", label:"מנויים"},
    {id:"protocols",label:"פרוטוקולים"},
    {id:"advisor",  label:"יועץ AI"},
  ].filter(item => isTabVisible(settings, item.id));
  const navIcon = (id) => {
    const p = { fill:"none", stroke:"currentColor", strokeWidth:1.6, strokeLinecap:"round", strokeLinejoin:"round" };
    const svg = (children) => <svg viewBox="0 0 24 24" width="19" height="19">{children}</svg>;
    switch(id){
      case "dashboard": return svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" {...p}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...p}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...p}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...p}/></>);
      case "insights":  return svg(<><path d="M4 20h16" {...p}/><rect x="5" y="12" width="3.2" height="6" rx="1" {...p}/><rect x="10.4" y="8" width="3.2" height="10" rx="1" {...p}/><rect x="15.8" y="4" width="3.2" height="14" rx="1" {...p}/></>);
      case "calendar":  return svg(<><rect x="3" y="4.5" width="18" height="16" rx="2.5" {...p}/><path d="M3 9h18M8 2.5v4M16 2.5v4" {...p}/></>);
      case "clients":   return svg(<><circle cx="12" cy="8" r="3.4" {...p}/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" {...p}/></>);
      case "leads":     return svg(<><path d="M12 3l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 21l-5.2 3 1.2-5.6L3.8 14.6 9.6 8z" {...p}/></>);
      case "cashier":   return svg(<><rect x="3" y="6" width="18" height="13" rx="2.5" {...p}/><path d="M3 10h18M7 15h4" {...p}/></>);
      case "tax":       return svg(<><path d="M6 3h9l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0z" {...p}/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" {...p}/></>);
      case "whatsapp":  return svg(<><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.6-4A8 8 0 1 1 20 11.5z" {...p}/></>);
      case "campaigns": return svg(<><path d="M4 9v6h3l8 4V5L7 9z" {...p}/><path d="M18 9.5a3 3 0 0 1 0 5" {...p}/></>);
      case "community": return svg(<><circle cx="9" cy="8" r="3" {...p}/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" {...p}/><path d="M16 6.2A3 3 0 0 1 18 12M21 19c0-2.3-1.4-4-3.5-4.7" {...p}/></>);
      case "packages":  return svg(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...p}/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...p}/></>);
      case "protocols": return svg(<><rect x="5" y="3" width="14" height="18" rx="2.5" {...p}/><path d="M9 8h6M9 12h6M9 16h4" {...p}/></>);
      case "advisor":   return svg(<><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" {...p}/><path d="M12 7.5v.01M9.5 10.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.8-1.1 1.6" {...p}/></>);
      default: return svg(<circle cx="12" cy="12" r="8" {...p}/>);
    }
  };

  return (
 <div dir="rtl" style={{position:"relative",zIndex:0,fontFamily:"var(--sans)",background:BRAND_WASH,backgroundAttachment:"fixed",minHeight:"100vh",display:"flex",flexDirection:"column",color:"var(--ink)"}}>
                {/* skipTop: no background blossom lands behind the header, so
                    the flowers in the BloomOS logo are the only ones there and
                    nothing competes with them. */}
                {/* The same two-hue palette /login uses - peach blush plus
                    lilac - rather than one tint of the tenant accent. Two
                    distinct hues are what make the login florals read as
                    colourful watercolor instead of a single-colour wash. */}
 <FloralCorners idPrefix="app" fixed zIndex={1} blush={FLORAL_BLUSH} gold={FLORAL_LILAC} skipTop opacity={floralOpacity} />
 <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Frank+Ruhl+Libre:wght@400;500;600;700;900&family=Heebo:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700;800&display=swap');
        .serif{font-family:var(--display)}
        /* Bottom-nav sheet rise. */
        @keyframes sheetUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        /* Keyboard focus indicator (only for keyboard nav, not mouse). The
           !important overrides the many inline outline:none declarations. */
        button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,[role="button"]:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--pc)!important;outline-offset:2px;border-radius:10px}
        .slot:hover{background:var(--pc-tint)!important;cursor:pointer}
        .appt-card{transition:transform 0.2s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s}.appt-card:hover{transform:translateY(-2px) scale(1.01);box-shadow:var(--shadow-md)}
        .client-row{transition:box-shadow 0.2s,transform 0.2s,border-color 0.2s}
        .client-row:hover{cursor:pointer;box-shadow:var(--shadow-md);border-color:var(--pc)!important;transform:translateY(-2px)}
        .lead-row{transition:box-shadow 0.2s,transform 0.2s,border-color 0.2s}
        .stat-card{transition:transform 0.28s cubic-bezier(.2,.7,.3,1),box-shadow 0.28s,border-color 0.28s;box-shadow:var(--shadow-sm)}
        .stat-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);border-color:var(--pc)!important}
        .soft-card{box-shadow:var(--shadow-md)}
        .nav-item{display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;border-radius:13px;padding:10px 13px;font-size:13.5px;font-weight:500;color:var(--ink-2);cursor:pointer;font-family:inherit;text-align:right;transition:background 0.2s,color 0.2s,transform 0.12s;position:relative;letter-spacing:-0.01em}
        .nav-item:hover{background:var(--pc-tint);color:var(--ink)}
        .nav-item:active{transform:scale(0.98)}
        .nav-item .nav-ico{width:19px;height:19px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:0.7;transition:opacity 0.2s,color 0.2s}
        .nav-item.active{background:linear-gradient(100deg,var(--pc-tint),var(--pc-tint-2));color:var(--pc-deep);font-weight:700}
        .nav-item.active .nav-ico{opacity:1;color:var(--pc)}
        .nav-item.active::before{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);width:3.5px;height:20px;border-radius:4px;background:var(--pc);box-shadow:0 0 10px var(--pc-shadow)}
        .wa-btn{background:#25D366;color:#fff;border:none;border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none;transition:transform 0.12s,box-shadow 0.2s}
        .wa-btn:hover{background:var(--success);transform:translateY(-1px);box-shadow:0 6px 16px rgba(37,211,102,0.3)}
        .call-btn{background:var(--pc);color:var(--surface);border:none;border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .icon-btn{background:var(--pc-tint);border:none;border-radius:50%;width:32px;height:32px;color:var(--pc);font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.2s,transform 0.12s;display:inline-flex;align-items:center;justify-content:center}
        .icon-btn:hover{background:var(--pc-tint-2);transform:translateY(-1px)}
        .icon-btn:disabled{opacity:0.5;cursor:default}
        .primary-btn{border:none;border-radius:var(--r-full);font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-0.01em;transition:transform 0.12s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,filter 0.2s}
        .primary-btn:hover:not(:disabled){transform:translateY(-1.5px);filter:saturate(1.06)}
        .primary-btn:active:not(:disabled){transform:scale(0.97)}
        .primary-btn:disabled{opacity:0.5;cursor:default}
        /* Reusable premium primitives for the redesign */
        .glass-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-md);position:relative;overflow:hidden}
        .pill{display:inline-flex;align-items:center;gap:6px;border-radius:var(--r-full);font-weight:600;font-size:11px;letter-spacing:-0.01em}
        .quick-action{transition:transform 0.16s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,border-color 0.2s}
        .quick-action:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--pc)!important}
        .quick-action:active{transform:translateY(-1px) scale(0.99)}
        @keyframes toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        .toast{animation:toast-in 0.24s cubic-bezier(.2,.7,.3,1)}
        @keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}
        .skel{background:linear-gradient(90deg,#EFE7F3 25%,#F8F2FB 50%,#EFE7F3 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}
        @keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fade-in-up 0.4s cubic-bezier(.2,.7,.3,1) both}
        @keyframes pop-in{0%{opacity:0;transform:scale(0.96)}100%{opacity:1;transform:scale(1)}}
        .pop-in{animation:pop-in 0.24s cubic-bezier(.2,.7,.3,1) both}
        @keyframes voice-pulse{0%{box-shadow:0 0 0 0 var(--pc-shadow)}70%{box-shadow:0 0 0 16px rgba(122,90,136,0)}100%{box-shadow:0 0 0 0 rgba(122,90,136,0)}}
        .voice-pulse{animation:voice-pulse 1.4s infinite}
        @keyframes sheen{0%{transform:translateX(-120%)}60%,100%{transform:translateX(220%)}}
        .empty-cta{transition:transform 0.14s,box-shadow 0.2s,filter 0.2s}.empty-cta:hover{transform:translateY(-2px);box-shadow:var(--shadow-glow);filter:saturate(1.06)}
        .mobile-only{display:none}
        @media (max-width:680px){
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .sidebar-aside{position:fixed!important;top:0;bottom:0;right:0;width:80%!important;max-width:280px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .sidebar-aside.open{transform:translateX(0)}
          .nav-aside{position:fixed!important;top:0;bottom:0;right:0;width:78%!important;max-width:270px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .nav-aside.open{transform:translateX(0)}
          .sidebar-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1499}
          .header-search{max-width:none!important}
          .modal-card{width:94%!important;max-width:380px!important}
          .client-drawer,.lead-drawer{width:100%!important}
          /* Phase 2 — mobile readability: 16px form fields stop iOS zoom-on-focus;
             modest floor on the drawer nav so labels stay legible on a phone. */
          .modal-card input,.modal-card select,.modal-card textarea{font-size:16px!important}
          .nav-item{font-size:14px!important}
          /* Navigation adapts by width, from ONE markup tree rather than two
             layouts. Above this breakpoint the persistent sidebar already
             lists all 13 tabs with labels, so the bottom bar would only
             duplicate it; below it, the sidebar collapses to an off-canvas
             drawer and the bottom bar becomes the primary navigation.
             Clearance for the bar is scoped here too, so desktop keeps its
             full content height. */
          /* ONE rule, not two. This was previously a padding-bottom declaration
             followed by a padding shorthand, and the shorthand reset the
             bottom back to 12px - same specificity, both !important, so source
             order won. The bar has therefore been covering the last row of every
             scrolling tab ever since, which no z-index could fix because it is
             spacing, not layering.

             Zero side padding: content runs edge to edge like a native app, and
             the cards' own internal padding keeps text off the glass. Vertical
             padding stays, including the clearance for the bottom bar. */
          .app-main{padding:12px 0 calc(74px + env(safe-area-inset-bottom, 0px))!important}
          /* Phase 4 — tap targets: round icon buttons up to a touch-friendly ~40px. */
          .icon-btn{width:40px!important;height:40px!important;font-size:15px!important}
          .wa-btn,.call-btn{padding:9px 14px!important}
          /* Header fit — the desktop logo (30px, 6px letter-spacing, no shrink) pushed
             the left-side action icons off the viewport in RTL. Shrink the wordmark,
             hide the tagline, let the brand block shrink, and tighten header padding so
             the power/download/settings icons stay fully on-screen. */
          /* Header fit, done as arithmetic rather than by eye. Budget at 360px:
               padding 16 + brand 158 + gap 6 + search 64 + gap 6 + icons 86
               = 336, with the brand being hamburger 40 + gap 6 + logo 104 + 8.
             The old numbers came to 485 against a 390px iPhone, which is why the
             action icons ran off the left edge in RTL and the logo appeared to
             sit on top of the search field. Two of the four icons now live in
             the nav drawer instead, which is most of the saving. */
          /* Zero side padding here too, so the header's contents reach the same
             edges as the content below it and the bar above the home button.
             It also hands 16px back to the width budget below. The first and
             last children are 40px icon buttons, so running them to the edge
             makes them easier to hit, not harder. */
          /* One short row: hamburger, large logo, two icons. The search is gone
             from the header entirely on phones and lives in the nav drawer - it
             was competing with the logo for width when inline, and cost ~30px of
             permanent height when it took its own row.

             padding-top carries env(safe-area-inset-top) so that in a home-screen
             (standalone) install the header starts below the clock and battery
             instead of underneath them, which is what was letting the greeting
             card sit against the status bar.

             Budget at 360px: hamburger 40 + gap 6 + logo 168 + gap 6 + two
             icons 86 = 306, leaving room for the leads badge. */
          .app-header{padding:0 0 0 0!important;padding-top:env(safe-area-inset-top, 0px)!important;gap:6px!important;height:auto!important;min-height:56px!important;flex-wrap:nowrap!important}
          .hdr-brand{gap:6px!important}
          .header-search{display:none!important}
          /* The header's backdrop-filter creates a stacking context that (being
             earlier in the DOM than <main>) trapped the global-search results
             dropdown BEHIND the page content on mobile. Lift the whole header
             context above the content — but keep it below modals/drawers/toasts
             (>=1000) so those still overlay the header as before. */
          .app-header{position:relative!important;z-index:100!important}
          /* overflow stays visible: the logo's petals reach the edge of the
             artwork and must never be cropped by this container. */
          /* flex-shrink 0, not 1. Letting the brand block shrink was the actual
             clipping mechanism: the block narrowed, the img inside it did not
             (fixed width, flex-shrink:0), and overflow:visible let the artwork
             spill under the next sibling instead of pushing it aside. Nothing
             shares its row now, so it has no reason to shrink. */
          .hdr-brand{min-width:auto!important;flex-shrink:0!important;overflow:visible}
          /* Width-driven, matching /login: overriding height here would fight
             the aspect ratio the artwork sets. */
          .hdr-logo{width:168px!important;margin-inline-end:0!important}
          /* Dashboard hero — desktop's 26px side padding was far too wide on a
             ~344px screen. Only the box is adjusted here: the greeting's own
             size and leading are a clamp() on the element, so there is one
             source of truth rather than a rule here fighting an inline style.
             !important because the card carries padding/margin inline. */
          .hero-card{margin-bottom:26px!important;padding:16px 16px!important}

          /* Card padding. Ten tabs (leads, cashier, tax, marketing, insights,
             advisor, community, packages, protocols, whatsapp) had no mobile
             rules at all, so their cards kept desktop's 24-26px inset. With
             .app-main's 8px gutter that spent up to 68px of a 344px screen on
             padding alone. .glass-card carries no padding of its own - it is
             always inline - so this is the only place one rule can reach all of
             them, and it needs !important to outrank those inline values.

             .card-flush is the opt-out for the six cards whose children already
             supply their own padding (the calendar grid, the tax table, and
             four list cards). Padding them here would double the inset and, for
             the two scrolling ones, inset the scroll area itself. It MUST stay
             below the rule above: same specificity, both !important, so source
             order decides. */
          .glass-card{padding:19px 16px!important}
          .card-flush{padding:0!important}

          /* Full bleed. Once the gutters are gone a card that keeps its rounded
             corners and side borders still reads as a framed panel floating on a
             page - the exact "website in a frame" look this is meant to remove.
             Squaring the corners and dropping the left/right borders turns each
             card into a full-width section, which is the native pattern. The top
             and bottom borders stay, because they are what still separates one
             section from the next.
             .modal-card is a different class and keeps its 24px radius: a
             centred sheet should still look like a sheet. */
          .glass-card,.hero-card{border-radius:0!important;border-left:0!important;border-right:0!important}

          /* ── Richness. The wash and the blossoms were already identical to
             /login - BRAND_WASH, same two-hue florals, opacity 1 on the sparse
             tabs against /login's 0.9. The problem was that --surface is
             #FFFFFF, fully opaque, and going edge to edge turned every card
             into a full-bleed white panel that buried the artwork completely.
             Making the cards glass is what brings /login's world back: the
             ombré and the flowers now read THROUGH the content instead of
             behind it. Desktop keeps solid cards, where the wash is visible
             around them anyway.

             0.62 alpha with a blur is the readability line: ink on
             near-white over a pale cream-to-lavender wash still clears AA
             comfortably, and the blur stops the blossoms turning body text
             into texture. */
          .glass-card{background:rgba(255,255,255,0.62)!important;
                      -webkit-backdrop-filter:blur(14px) saturate(1.25);
                      backdrop-filter:blur(14px) saturate(1.25)}
          /* The hero keeps its own gradient - washing it out would flatten the
             one surface that already reads rich - but it lets a little through. */
          .hero-card{background:linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.14)),var(--grad-hero)!important}

          /* Tinted glass chrome, following HER accent rather than a hardcoded
             purple, so the header sits in the same world as the wash instead of
             capping it with a flat bar. */
          .app-header{background:linear-gradient(180deg,
                        color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.74)),
                        color-mix(in srgb, var(--pc) 5%,  rgba(255,255,255,0.52)))!important;
                      -webkit-backdrop-filter:blur(16px) saturate(1.2);
                      backdrop-filter:blur(16px) saturate(1.2)}

          /* Gentle sheen on the flat chips, so they catch light like the rest of
             the surface. background-image only - the base colour each pill sets
             inline is left alone, which keeps the categorical status colours. */
          .pill{background-image:linear-gradient(180deg,rgba(255,255,255,0.38),rgba(255,255,255,0))}

          /* Same tinted glass as the header, so the two bars bracket the page in
             one material instead of one being glass and the other flat paint.
             The inline rgba(252,250,254,0.94) it replaces was near-opaque. */
          .app-bottombar{background:linear-gradient(180deg,
                           color-mix(in srgb, var(--pc) 6%,  rgba(255,255,255,0.60)),
                           color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.78)))!important;
                         -webkit-backdrop-filter:blur(18px) saturate(1.2);
                         backdrop-filter:blur(18px) saturate(1.2)}

          /* Air above the first card. The per-card padding lives with the
             .card-flush opt-out further up and must stay there: declaring
             .glass-card padding again below .card-flush would win on source
             order and re-pad the six cards that must stay flush. */
          .app-main{padding-top:16px!important}
        }
        /* Small phones (SE, older Androids). Same budget as above but 316px:
           the logo gives up another 20px so nothing spills at 320. */
        @media (max-width:360px){
          .hdr-logo{width:132px!important}
        }
        @media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:fixed;top:0;left:0;width:100%;padding:40px}
          /* Tax report: print only the report card, clean A4, centered. */
          #tax-report,#tax-report *{visibility:visible}
          #tax-report{position:fixed;top:0;left:0;right:0;margin:0 auto;width:100%;max-width:720px;box-shadow:none!important;border:none!important;padding:32px 28px}}
      `}</style>

      {/* -- "תקועה?" -- on every screen, above everything ------------------ */}
      {!showHelp && (
        <button
          type="button"
          onClick={() => { setShowHelp(true); setHelpState("idle"); }}
          aria-label="תקועה? כתבי לנו"
          style={{position:"fixed",insetInlineStart:14,bottom:14,zIndex:4500,padding:"10px 16px",borderRadius:999,border:"1px solid var(--line-2)",background:"var(--surface)",color:pcDeep,fontSize:12.5,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 8px 20px rgba(74,46,90,0.16)"}}
        >
          תקועה?
        </button>
      )}

      {showHelp && (
        <div
          dir="rtl"
          onClick={() => setShowHelp(false)}
          style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:5200,padding:14}}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{width:"100%",maxWidth:420,background:"var(--surface)",borderRadius:20,padding:"22px 20px",boxShadow:"0 24px 60px rgba(74,46,90,0.28)"}}>
            {helpState === "sent" ? (
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:44,marginBottom:10}}>✅</div>
                <h3 className="serif" style={{fontSize:19,fontWeight:600,marginBottom:6,color:"var(--ink)"}}>ההודעה נשלחה</h3>
                <p style={{fontSize:13,color:"var(--ink-3)",lineHeight:1.7,marginBottom:18}}>
                  מעיין תחזור אלייך. אפשר להמשיך לעבוד בינתיים.
                </p>
                <button type="button" onClick={()=>{setShowHelp(false);setHelpText("");setHelpState("idle");}} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--surface)",borderRadius:24,fontSize:13}}>סגירה</button>
              </div>
            ) : (
              <>
                <h3 className="serif" style={{fontSize:19,fontWeight:600,marginBottom:4,color:"var(--ink)"}}>תקועה?</h3>
                <p style={{fontSize:12.5,color:"var(--ink-3)",lineHeight:1.6,marginBottom:12}}>
                  כתבי מה קרה, ומעיין תחזור אלייך. נשלח גם באיזה מסך את נמצאת, כדי שלא תצטרכי להסביר.
                </p>
                <textarea
                  value={helpText}
                  onChange={(e)=>{setHelpText(e.target.value); if(helpState==="failed") setHelpState("idle");}}
                  rows={5}
                  maxLength={4000}
                  placeholder="מה קרה? אפשר גם רק במשפט אחד."
                  style={{width:"100%",padding:"11px 12px",borderRadius:12,border:"1px solid var(--line-2)",fontSize:13,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",background:"var(--surface-2)",color:"var(--ink)"}}
                />
                {helpState === "failed" && (
                  <div style={{marginTop:10,padding:"11px 12px",borderRadius:12,background:"var(--brand-cream, #FEFAF7)",border:"1px solid var(--line-2)"}}>
                    <p style={{fontSize:12.5,fontWeight:700,color:"var(--danger)",marginBottom:4}}>ההודעה לא נשלחה</p>
                    <p style={{fontSize:12,color:"var(--ink-2)",lineHeight:1.6,marginBottom:9}}>
                      לא הצלחנו לשלוח אותה מכאן. מה שכתבת עדיין כאן, ואפשר לשלוח אותו ישירות בוואטסאפ.
                    </p>
                    <a
                      href={supportWhatsAppUrl(helpText.trim() || SUPPORT_WHATSAPP_MESSAGE)}
                      target="_blank"
                      rel="noreferrer"
                      style={{display:"block",textAlign:"center",padding:"10px 0",borderRadius:24,background:"#25D366",color:"#fff",fontSize:12.5,fontWeight:700,textDecoration:"none"}}
                    >
                      ✆ שליחה בוואטסאפ
                    </a>
                  </div>
                )}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button type="button" onClick={()=>setShowHelp(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1.5px solid var(--line-2)",borderRadius:24,background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
                  <button type="button" onClick={sendHelp} disabled={!helpText.trim()||helpState==="sending"} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",borderRadius:24,fontSize:12,opacity:(!helpText.trim()||helpState==="sending")?0.55:1}}>
                    {helpState==="sending"?"שולחת...":helpState==="failed"?"נסי לשלוח שוב":"שליחה"}
                  </button>
                </div>
                <p style={{fontSize:10.5,color:"var(--ink-3)",marginTop:10,lineHeight:1.5,textAlign:"center"}}>
                  לא נשלחים שמות לקוחות, טלפונים או פרטי טיפול. רק מה שכתבת כאן.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOASTS */}
      {toasts.length>0&&(
 <div aria-live="polite" aria-atomic="true" style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:5000,display:"flex",flexDirection:"column",gap:7,alignItems:"center",pointerEvents:"none"}}>
          {toasts.map(t=>{
            const colors={success:{bg:"var(--ink)",fg:"var(--surface)",icon:"✓"},error:{bg:"var(--danger)",fg:"var(--surface)",icon:"!"},info:{bg:pcDeep,fg:"var(--surface)",icon:"i"}};
            const c=colors[t.type]||colors.success;
            return(
 <div key={t.id} className="toast" role={t.type==="error"?"alert":"status"} style={{background:c.bg,color:c.fg,padding:"10px 18px",borderRadius:24,fontSize:12,fontWeight:600,boxShadow:"var(--shadow-lg)",maxWidth:"90vw",direction:"rtl",pointerEvents:"auto",display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{c.icon}</span>
                {t.msg}
                {t.action&&<button onClick={()=>{t.action.onClick();setToasts(prev=>prev.filter(x=>x.id!==t.id));}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:c.fg,fontSize:11,fontWeight:700,padding:"4px 11px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",marginRight:2,whiteSpace:"nowrap"}}>{t.action.label}</button>}
 </div>
            );
          })}
 </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:4000,padding:14}} onClick={()=>setConfirmDialog(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:22,padding:24,width:340,maxWidth:"100%",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:8}}>{confirmDialog.title}</h3>
 <p style={{fontSize:12.5,color:"var(--ink-2)",lineHeight:1.5,marginBottom:18}}>{confirmDialog.message}</p>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>setConfirmDialog(null)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1.5px solid var(--line-2)",borderRadius:24,background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>{confirmDialog.cancelText}</button>
 <button onClick={()=>{const fn=confirmDialog.onConfirm;setConfirmDialog(null);if(fn)fn();}} className="primary-btn" style={{flex:2,padding:"11px 0",background:confirmDialog.danger?"var(--danger)":pcGrad,color:"var(--surface)",fontSize:12,boxShadow:confirmDialog.danger?"0 8px 18px rgba(224,91,111,0.3)":`0 8px 18px ${pcShadow}`}}>{confirmDialog.confirmText}</button>
 </div>
 </div>
 </div>
      )}

      {/* BEAUTY VOICE — floating mic button (accessible from every screen) */}
 <button onClick={()=>{ showVoice ? closeVoice() : startVoice(); }} aria-label="שליטה קולית — Beauty Voice" title="Beauty Voice"
        style={{position:"fixed",bottom:22,left:22,zIndex:3500,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:pcGrad,color:"var(--surface)",boxShadow:`0 8px 22px ${pcShadow}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
 <svg viewBox="0 0 24 24" width="24" height="24" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
 </button>

      {/* BEAUTY VOICE — modal */}
      {showVoice&&(
 <div onClick={closeVoice} style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:4200,padding:16}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:24,width:430,maxWidth:"100%",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)",marginBottom:84}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>Beauty Voice ✦</h3>
 <button onClick={closeVoice} aria-label="סגירה" style={{background:"none",border:"none",fontSize:16,cursor:"pointer",color:"var(--ink-3)"}}>✕</button>
 </div>

            {voiceStatus==="listening"&&(
 <div style={{textAlign:"center",padding:"16px 0"}}>
 <div className="voice-pulse" style={{width:66,height:66,borderRadius:"50%",background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:pc}}>
 <svg viewBox="0 0 24 24" width="28" height="28" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
 </div>
 <p style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>🎙️ מקשיבה...</p>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginTop:5,lineHeight:1.5}}>אמרי בקול אחת מהפקודות הבאות:</p>
 <VoiceCommandList/>
 </div>
            )}

            {voiceStatus==="processing"&&(
 <div style={{textAlign:"center",padding:"18px 0"}}>
 <p style={{fontSize:12.5,color:"var(--ink-2)",marginBottom:6}}>שמעתי: "{voiceTranscript}"</p>
 <p style={{fontSize:14,fontWeight:600,color:pc}}>מבינה את הבקשה…</p>
 </div>
            )}

            {voiceStatus==="result"&&voiceIntent&&(
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:10}}>שמעתי: "{voiceIntent.raw||voiceTranscript}"</p>
                {voiceIntent.action==="book_appointment"?(
 <div style={{background:pcTint,border:`1px solid ${pc}`,borderRadius:14,padding:"14px 16px"}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:8}}>הבנתי — קביעת תור:</p>
                    {[["לקוחה",voiceIntent.client_name],["תאריך",voiceIntent.date],["שעה",voiceIntent.time],["שירות",voiceIntent.service]].map(([l,v])=>(
 <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(212,175,55,0.16)"}}>
 <span style={{fontSize:11,color:"var(--ink-2)"}}>{l}</span>
 <span style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{v||"— לא צוין —"}</span>
 </div>
                    ))}
 </div>
                ):(
 <p style={{fontSize:12.5,color:"var(--ink-2)",lineHeight:1.6,textAlign:"center",padding:"8px 0"}}>לא זיהיתי פעולה נתמכת. כרגע נתמכת קביעת תור — נסי לומר "קבעי תור ל...".</p>
                )}
                {voiceIntent.clarification&&<p style={{fontSize:11,color:"var(--warning)",marginTop:10}}>ℹ️ {voiceIntent.clarification}</p>}
 <p style={{fontSize:10,color:"var(--ink-3)",marginTop:12,textAlign:"center"}}>שלב 2 — הצגת ההבנה בלבד. יצירת התור בפועל תיווסף בשלב הבא.</p>
 <div style={{display:"flex",gap:8,marginTop:14}}>
 <button onClick={startVoice} className="primary-btn" style={{flex:1,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>🎙️ נסי שוב</button>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"10px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>סגירה</button>
 </div>
 </div>
            )}

            {voiceStatus==="confirm"&&voiceBooking&&(()=>{
              const nameLow=(voiceBooking.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceBooking.clientName.trim()&&!existsClient;
              const ready=voiceBooking.clientName.trim()&&voiceBooking.service&&voiceBooking.date&&voiceBooking.time;
              return (
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}". בדקי ואשרי:</p>

                {/* client */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>לקוחה</p>
 <input value={voiceBooking.clientName} onChange={e=>setVoiceBooking({...voiceBooking,clientName:e.target.value})} placeholder="שם הלקוחה" style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
                  {voiceBooking.clientName.trim()&&(isNew
                    ? <p style={{fontSize:10,color:"var(--warning)",marginTop:4}}>✦ לקוחה חדשה בשם "{voiceBooking.clientName.trim()}" תיווצר עם האישור</p>
                    : <p style={{fontSize:10,color:"var(--success)",marginTop:4}}>✓ לקוחה קיימת</p>)}
 </div>

                {/* service picker */}
 <div style={{marginBottom:10}}>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:4}}>שירות {voiceBooking.service?"":"— בחרי:"}</p>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {activeServices.map(s=>{
                      const sel=voiceBooking.service===s.name;
                      return <button key={s.id||s.name} onClick={()=>setVoiceBooking({...voiceBooking,service:s.name})} style={{padding:"6px 11px",borderRadius:16,fontSize:10.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid var(--line)",background:sel?pcTint:"var(--surface)",color:sel?pc:"var(--ink-2)"}}>{s.name}</button>;
                    })}
 </div>
 </div>

                {/* date + time */}
 <div style={{display:"flex",gap:8,marginBottom:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>תאריך</p><input type="date" value={voiceBooking.date} onChange={e=>setVoiceBooking({...voiceBooking,date:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>שעה</p><input type="time" value={voiceBooking.time} onChange={e=>setVoiceBooking({...voiceBooking,time:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 </div>
                {/* The "this will be saved on the round hour" notice that used
                    to live here is gone, along with the rounding it was warning
                    about. Half-hour starts are stored exactly since the minutes
                    migration, so the notice was telling her the opposite of the
                    truth. */}

 <div style={{display:"flex",gap:8,marginTop:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>ביטול</button>
 <button onClick={handleVoiceBook} disabled={!ready||isBusy("voiceBook")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{isBusy("voiceBook")?"קובעת...":"✦ אישור וקביעת תור"}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="info"&&voiceInfo&&(
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {voiceInfo.kind==="day"&&(
 <div>
 <h4 className="serif" style={{fontSize:17,fontWeight:600,color:"var(--ink)",marginBottom:10}}>תורים ל-{(voiceInfo.date||"").split("-").reverse().join("/")}</h4>
                    {voiceInfo.items.length===0?(
 <p style={{fontSize:12.5,color:"var(--ink-3)",textAlign:"center",padding:"16px 0"}}>אין תורים ביום הזה</p>
                    ):voiceInfo.items.map((it,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",background:pcTint,borderRadius:12,marginBottom:6}}>
 <span className="serif" style={{fontSize:16,fontWeight:600,color:pc,width:52,flexShrink:0}}>{fmtTime(it.startMinute ?? it.hour * 60)}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{it.name}</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)"}}>{it.service}</p>
 </div>
 </div>
                    ))}
 </div>
                )}
                {voiceInfo.kind==="revenue"&&(
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:16,padding:"22px 18px"}}>
 <p style={{fontSize:12,color:"var(--ink-2)",marginBottom:8}}>{voiceInfo.period==="today"?"הכנסות היום":"הכנסות החודש"}</p>
 <p className="serif" style={{fontSize:38,fontWeight:600,color:"var(--ink)",lineHeight:1}}>₪{Math.round(voiceInfo.total).toLocaleString()}</p>
 <p style={{fontSize:11,color:pc,marginTop:8,fontWeight:500}}>{voiceInfo.count} עסקאות</p>
 </div>
                )}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:14,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>סגירה</button>
 </div>
            )}

            {voiceStatus==="cancel"&&voiceCancel&&(
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCancel.selected?(
 <div>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)",marginBottom:10}}>נמצאו כמה תורים — בחרי איזה לבטל:</p>
                    {voiceCancel.matches.map(a=>(
 <button key={a.id} onClick={()=>setVoiceCancel({...voiceCancel,selected:a})} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"right",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span className="serif" style={{fontSize:15,fontWeight:600,color:pc,width:78,flexShrink:0}}>{(a.date||"").split("-").reverse().slice(0,2).join("/")} · {fmtApptTime(a)}</span>
 <span style={{flex:1,minWidth:0}}><span style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{a.name}</span> <span style={{fontSize:12,color:"var(--ink-2)"}}>· {a.service}</span></span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>ביטול</button>
 </div>
                ):(
 <div>
 <div style={{background:"#FEECEC",border:"1px solid #F3C6C6",borderRadius:14,padding:"16px 16px",textAlign:"center",marginBottom:14}}>
 <p style={{fontSize:12.5,color:"var(--danger)",fontWeight:600,marginBottom:8}}>לבטל את התור?</p>
 <p style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{voiceCancel.selected.name}</p>
 <p style={{fontSize:12,color:"var(--ink-2)",marginTop:3}}>{voiceCancel.selected.service} · {(voiceCancel.selected.date||"").split("-").reverse().join("/")} בשעה {fmtApptTime(voiceCancel.selected)}</p>
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>לא, השאירי</button>
 <button onClick={handleVoiceCancel} disabled={isBusy("voiceCancel")} className="primary-btn" style={{flex:2,padding:"11px 0",background:"var(--danger)",color:"var(--surface)",fontSize:12}}>{isBusy("voiceCancel")?"מבטלת...":"כן, בטלי את התור"}</button>
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="call"&&voiceCall&&(
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}"</p>
                {!voiceCall.selected?(
 <div>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)",marginBottom:10}}>נמצאו כמה לקוחות — בחרי למי לחייג:</p>
                    {voiceCall.matches.map(c=>(
 <button key={c.id} onClick={()=>setVoiceCall({...voiceCall,selected:c})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",textAlign:"right",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,padding:"10px 12px",marginBottom:6,cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{c.name}</span>
 <span style={{fontSize:11,color:c.phone?"var(--ink-2)":"var(--ink-3)",direction:"ltr"}}>{c.phone||"אין מספר"}</span>
 </button>
                    ))}
 <button onClick={closeVoice} className="primary-btn" style={{width:"100%",marginTop:6,padding:"10px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>סגירה</button>
 </div>
                ):(
 <div>
 <div style={{textAlign:"center",background:pcTint,border:`1px solid ${pc}`,borderRadius:16,padding:"20px 16px",marginBottom:14}}>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)"}}>{voiceCall.selected.name}</p>
                      {voiceCall.selected.phone
                        ? <p style={{fontSize:15,color:pc,marginTop:6,direction:"ltr",fontWeight:600}}>{voiceCall.selected.phone}</p>
                        : <p style={{fontSize:12.5,color:"var(--warning)",marginTop:8}}>אין מספר טלפון שמור ל{voiceCall.selected.name}</p>}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>סגירה</button>
                      {voiceCall.selected.phone&&(
 <button onClick={()=>{ window.location.href = `tel:${(voiceCall.selected.phone||"").replace(/[^\d+]/g,"")}`; }} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>📞 חייג</button>
                      )}
 </div>
 </div>
                )}
 </div>
            )}

            {voiceStatus==="receipt"&&voiceReceipt&&(()=>{
              const nameLow=(voiceReceipt.clientName||"").trim().toLowerCase();
              const existsClient=nameLow?clients.find(c=>(c.name||"").trim().toLowerCase()===nameLow):null;
              const isNew=voiceReceipt.clientName.trim()&&!existsClient;
              const ready=voiceReceipt.clientName.trim()&&Number(voiceReceipt.amount)>0;
              return (
 <div>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12}}>שמעתי: "{voiceIntent?.raw||voiceTranscript}". בדקי ואשרי הוצאת קבלה:</p>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:12,color:"var(--ink-2)",marginBottom:3}}>לקוחה</p>
 <input value={voiceReceipt.clientName} onChange={e=>setVoiceReceipt({...voiceReceipt,clientName:e.target.value})} placeholder="שם הלקוחה" style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"9px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/>
                  {voiceReceipt.clientName.trim()&&(isNew
                    ? <p style={{fontSize:12,color:"var(--warning)",marginTop:4}}>✦ לקוחה חדשה בשם "{voiceReceipt.clientName.trim()}" תיווצר עם האישור</p>
                    : <p style={{fontSize:12,color:"var(--success)",marginTop:4}}>✓ לקוחה קיימת</p>)}
 </div>

 <div style={{marginBottom:10}}>
 <p style={{fontSize:12,color:"var(--ink-2)",marginBottom:3}}>סכום (₪)</p>
 <input type="number" value={voiceReceipt.amount} onChange={e=>setVoiceReceipt({...voiceReceipt,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"9px 11px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/>
 </div>

 <div style={{marginBottom:12}}>
 <p style={{fontSize:12,color:"var(--ink-2)",marginBottom:4}}>אמצעי תשלום</p>
 <div style={{display:"flex",gap:6}}>
                    {["מזומן","אשראי","ביט"].map(pm=>{
                      const sel=voiceReceipt.payment===pm;
                      return <button key={pm} onClick={()=>setVoiceReceipt({...voiceReceipt,payment:pm})} style={{flex:1,padding:"8px 0",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`2px solid ${pc}`:"1px solid var(--line)",background:sel?pcTint:"var(--surface)",color:sel?pc:"var(--ink-2)"}}>{pm}</button>;
                    })}
 </div>
 </div>

 <div style={{display:"flex",gap:8}}>
 <button onClick={closeVoice} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",color:"var(--ink-2)",fontSize:12}}>ביטול</button>
 <button onClick={handleVoiceReceipt} disabled={!ready||isBusy("voiceReceipt")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{isBusy("voiceReceipt")?"מפיקה...":"✦ אישור והפקת קבלה"}</button>
 </div>
 </div>
              );
            })()}

            {voiceStatus==="error"&&(
 <div style={{padding:"14px 0"}}>
 <div style={{textAlign:"center"}}>
 <p style={{fontSize:13,color:"var(--danger)",marginBottom:12,lineHeight:1.5}}>{voiceErr||"לא נקלט דיבור. נסי שוב."}</p>
 <button onClick={startVoice} className="primary-btn" style={{padding:"10px 22px",background:pcGrad,color:"var(--surface)",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>🎙️ נסי שוב</button>
 </div>
 <VoiceCommandList/>
 </div>
            )}

            {voiceStatus==="unsupported"&&(
 <div style={{padding:"10px 0"}}>
 <p style={{fontSize:12.5,color:"var(--ink-2)",lineHeight:1.7,textAlign:"center"}}>השליטה הקולית זמינה בדפדפני <b>Chrome</b> או <b>Edge</b> (מחשב או אנדרואיד). נסי לפתוח את המערכת באחד מהם.</p>
 <VoiceCommandList/>
 </div>
            )}
 </div>
 </div>
      )}

      {/* OMBRE PROMO BAR */}
      {/* HEADER */}
                {/* No near-white panel: on /login the logo sits directly on the
                    ombré wash with nothing behind it, and an opaque header bar
                    is what made it read as a box here. Only the faint accent
                    tint remains, so the page ombré shows straight through and
                    the logo blends the same way it does on login. */}
 <header className="app-header" style={{background:"var(--pc-chrome)",borderBottom:"1px solid var(--line)",padding:"0 22px",display:"flex",alignItems:"center",justifyContent:"space-between",height:88,flexShrink:0,gap:8,flexWrap:"nowrap",overflow:"visible"}}>
 <div className="hdr-brand" style={{display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
 <button className="mobile-only icon-btn" onClick={()=>setShowMobileSidebar(true)} style={{display:"none"}} aria-label="תפריט ניווט">☰</button>
                {/* Compact BloomOS lockup: florals + wordmark, no tagline.
                    Brand tier, so it never takes the tenant accent. Intrinsic
                    520x177 with the height capped, so the ratio holds. */}
                {/* Matches the /login treatment exactly: width-driven sizing so
                    the artwork sets its own ratio, the same drop-shadow that
                    makes it float there, and its own breathing room rather than
                    sitting flush against the menu button. No wrapper box, no
                    background, no overflow - the petals reach the edge of the
                    artwork and must never be cropped. */}
 <img className="hdr-logo" src={LOGO_COMPACT} alt="BloomOS" width={520} height={177}
      style={{width:196,height:"auto",display:"block",overflow:"visible",flexShrink:0,
              marginInlineEnd:14,filter:"drop-shadow(0 10px 22px rgba(48,24,72,0.16))"}}/>
          {newLeadsCount>0&&<span onClick={()=>setActiveTab("leads")} style={{background:pcGrad,color:"var(--surface)",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20,cursor:"pointer",boxShadow:`0 4px 10px ${pcShadow}`}}>{newLeadsCount}</span>}
          {tomorrowCancelled>0&&<span className="desktop-only" style={{background:"var(--danger)",color:"var(--surface)",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20}}>{tomorrowCancelled}</span>}
 </div>
 <div className="header-search" style={{position:"relative",flex:1,maxWidth:280,minWidth:80}}>
 <span style={{position:"absolute",top:"50%",right:13,transform:"translateY(-50%)",fontSize:12,color:"var(--ink-3)",pointerEvents:"none",zIndex:1}}>⌕</span>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="חיפוש..."
            style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:24,padding:"8px 34px 8px 14px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink)",boxShadow:"var(--shadow-xs)"}}/>
          {globalResults.length>0&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:16,boxShadow:"var(--shadow-lg)",zIndex:999,overflow:"hidden",marginTop:6,maxHeight:400,overflowY:"auto"}}>
              {renderSearchGroups()}
 </div>
          )}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {upcomingBirthdays[0]&&<span className="desktop-only" style={{fontSize:12,color:pc}}>{upcomingBirthdays[0].name}</span>}
 <span className="desktop-only" style={{fontSize:11.5,color:"var(--ink-2)"}}>שלום{settings.therapist_name?.trim()?`, ${settings.therapist_name}`:""} </span>
          {/* ☑ and ↓ leave the header below 680px: four 40px buttons plus the
              logo, hamburger and search cannot fit on any phone (see the
              breakpoint block). Both keep a mobile home in the nav drawer, so
              nothing becomes unreachable - only ⚙ and ⏻ stay in the bar. */}
 <button onClick={()=>setShowSetup(true)} className="icon-btn desktop-only" title="הגדרת המערכת" aria-label="הגדרת המערכת">☑</button>
 <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);}} className="icon-btn" title="הגדרות" aria-label="הגדרות">⚙</button>
 <button onClick={handleExportCSV} className="icon-btn desktop-only" title="ייצוא CSV" aria-label="ייצוא לקוחות לקובץ CSV">↓</button>
 <button onClick={handleLogout} disabled={isBusy("logout")} className="icon-btn" title="התנתקות" aria-label="התנתקות מהמערכת">⏻</button>
 </div>
 </header>

 <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {showMobileSidebar&&<div className="sidebar-backdrop mobile-only" onClick={()=>setShowMobileSidebar(false)}/>}

        {/* NAVIGATION SIDEBAR (right, RTL) */}
 <aside className={`nav-aside${showMobileSidebar?" open":""}`} style={{order:0,width:212,background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.7)",borderLeft:"1px solid var(--line)",padding:"16px 12px",display:"flex",flexDirection:"column",gap:3,flexShrink:0,overflowY:"auto"}}>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",alignSelf:"flex-start",background:"none",border:"none",fontSize:16,cursor:"pointer",color:"var(--ink-3)",marginBottom:4}}>✕</button>
          {/* Search lives here on phones. It used to take a whole second row in
              the header, which pushed the header to ~90px; the header cannot
              afford the width inline next to the logo either. In the drawer it
              gets full width, and results list in flow rather than as a floating
              dropdown. Desktop keeps the header field and never renders this. */}
 <div className="mobile-only" style={{display:"none",flexDirection:"column",marginBottom:10}}>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="חיפוש לקוחה, תור, פנייה..."
              style={{width:"100%",boxSizing:"border-box",border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 14px",fontSize:16,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink)"}}/>
            {globalResults.length>0&&(
 <div style={{marginTop:8,border:"1px solid var(--line)",borderRadius:14,overflow:"hidden",maxHeight:300,overflowY:"auto"}}>
                {renderSearchGroups(()=>setShowMobileSidebar(false))}
 </div>
            )}
 </div>
          {NAV_ITEMS.map(item=>(
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMobileSidebar(false);}} className={`nav-item${activeTab===item.id?" active":""}`}>
 <span className="nav-ico">{navIcon(item.id)}</span>
 <span style={{flex:1}}>{item.label}</span>
              {item.id==="leads"&&newLeadsCount>0&&<span style={{background:pcGrad,color:"var(--surface)",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20}}>{newLeadsCount}</span>}
 </button>
          ))}
 <button onClick={()=>{setEditSettings({...settings});setShowSettings(true);setShowMobileSidebar(false);}} className="nav-item" style={{marginTop:8}}>
 <span className="nav-ico"><svg viewBox="0 0 24 24" width="19" height="19"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>
 <span style={{flex:1}}>הגדרות</span>
 </button>
          {/* The two header icons that do not fit on a phone. Inline display
              none + .mobile-only{display:flex!important} is this file's
              established pattern - the inline value has to be the DESKTOP one,
              because only the breakpoint rule carries !important. */}
 <button className="nav-item mobile-only" style={{display:"none"}} onClick={()=>{setShowSetup(true);setShowMobileSidebar(false);}}>
 <span className="nav-ico">☑</span>
 <span style={{flex:1}}>הגדרת המערכת</span>
 </button>
 <button className="nav-item mobile-only" style={{display:"none"}} onClick={()=>{handleExportCSV();setShowMobileSidebar(false);}}>
 <span className="nav-ico">↓</span>
 <span style={{flex:1}}>ייצוא לקוחות (CSV)</span>
 </button>
 </aside>

        {/* TODAY / REMINDERS PANEL (left, RTL) */}
 <aside className="sidebar-aside desktop-only" style={{order:2,width:195,background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.6)",borderRight:"1px solid var(--line)",padding:"14px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>היום ({todayAppts.length})</p>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",background:"none",border:"none",fontSize:14,cursor:"pointer",color:"var(--ink-3)"}}>✕</button>
 </div>
            {todayAppts.length===0?<p style={{fontSize:12.5,color:"var(--ink-3)"}}>אין תורים</p>
              :todayAppts.slice().sort((a,b)=>(startMinute(a)??0)-(startMinute(b)??0)).map(a=>(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--lavender-50),var(--surface))",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"7px 9px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
                  {/* fmtApptTime, not hand-built from `hour`. This indexed
                      workingHours by (hour - working_hours_start) and fell back
                      to `hour + ":00"` — so a 14:30 appointment read "14:00" in
                      the Today panel, and any appointment outside her configured
                      opening hours fell through to that same wrong string. The
                      one display site the minutes migration missed; found while
                      auditing type sizes here. */}
 <p style={{fontSize:12,color:"var(--ink-2)"}}>{fmtApptTime(a)} · {a.service}</p>
                  {a.confirmation_status==="confirmed"&&<span style={{fontSize:10.5,color:"var(--success)",fontWeight:700}}>אישרה</span>}
                  {a.confirmation_status==="cancelled"&&<span style={{fontSize:10.5,color:"var(--danger)",fontWeight:700}}>ביטלה</span>}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:14,padding:"3px 9px",fontSize:11.5,cursor:"pointer",fontFamily:"inherit",marginTop:3,display:"block"}}>גבי</button>
 </div>
              ))}
 </div>

          {tomorrowAppts.length>0&&(
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>מחר ({tomorrowAppts.length})</p>
 <button onClick={handleSendAllConfirmations} style={{background:"rgba(212,175,55,0.12)",color:pc,border:"none",borderRadius:14,padding:"3px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>שליחה מרוכזת</button>
 </div>
 <div style={{background:pcTint,borderRadius:10,padding:"6px 9px",marginBottom:6,fontSize:11.5}}>
 <span style={{color:"var(--success)"}}>{tomorrowConfirmed} </span>
 <span style={{color:"var(--danger)"}}>{tomorrowCancelled} </span>
 <span style={{color:"var(--ink-2)"}}>⏳ {tomorrowPending}</span>
 </div>
              {tomorrowAppts.map(a=>{
                const client=clients.find(c=>String(c.id)===String(a.client_id));
                const confColor=a.confirmation_status==="confirmed"?"var(--success)":a.confirmation_status==="cancelled"?"var(--danger)":"var(--ink-2)";
                return(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--surface-2),#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:10,padding:"6px 8px",marginBottom:5}}>
 <p style={{fontSize:11,fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:12,color:"var(--ink-2)"}}>{a.service}</p>
                    {client?.phone&&!a.confirmation_sent&&(
 <button onClick={()=>handleSendConfirmation(a)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:14,padding:"3px 8px",fontSize:11.5,cursor:"pointer",fontFamily:"inherit",marginTop:3}}>שלחי תזכורת</button>
                    )}
                    {a.confirmation_sent&&<span style={{fontSize:10.5,color:confColor,fontWeight:700}}>{a.confirmation_status==="confirmed"?"אישרה":a.confirmation_status==="cancelled"?"ביטלה":"נשלח"}</span>}
 </div>
                );
              })}
 </div>
          )}

          {leadsWithReminders.length>0&&(
 <div>
 <p className="serif" style={{fontSize:13,fontWeight:600,color:pc,marginBottom:5}}>תזכורות פניות</p>
              {leadsWithReminders.map(l=>(
 <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");setShowMobileSidebar(false);}} style={{background:"#FFF3E0",borderRadius:10,padding:"5px 9px",marginBottom:3,cursor:"pointer"}}>
 <p style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{l.name}</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)"}}>{l.reminder_date}</p>
 </div>
              ))}
 </div>
          )}

          {coldClients.slice(0,3).length>0&&(
 <div>
 <p className="serif" style={{fontSize:13,fontWeight:600,color:"var(--ink-2)",marginBottom:4}}>להתחדשות</p>
              {coldClients.slice(0,3).map(c=>(
 <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");setShowMobileSidebar(false);}} style={{fontSize:12,color:pc,marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}י)</div>
              ))}
 </div>
          )}

 <button onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);setShowMobileSidebar(false);}}
            style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:24,padding:"11px 10px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",boxShadow:`0 6px 16px ${pcShadow}`}}>
            ✦ קביעת תור
 </button>
 </aside>

 <main className="app-main" style={{order:1,flex:1,overflow:"auto",padding:"28px 30px"}}>
          {/* Trial notice. Sits OUTSIDE the keyed tab wrapper on purpose: it is a
              property of the account, not of a screen, so it stays put and does
              not replay its entrance animation on every tab change. Renders
              nothing at all for an active tenant. */}
 <TrialBanner plan={planInfo} pc={pc} pcDeep={pcDeep} pcTint={pcTint} pcGrad={pcGrad} pcShadow={pcShadow}/>
 <div key={activeTab} className="fade-in">
          {/* DASHBOARD */}
          {activeTab==="dashboard"&&(<>
            {(()=>{
              const hour=now.getHours();
              const greeting=hour<12?"בוקר טוב":hour<17?"צהריים טובים":hour<21?"ערב טוב":"לילה טוב";
              // Warm, adaptive one-liner from today's existing data — no new sources.
              // Priority: full day → new leads → a lighter day → calm/empty.
              const warmMsg = todayAppts.length>=5
                ? `יום מלא היום — ${todayAppts.length} תורים. את מוכנה 💪`
                : newLeadsCount>0
                ? `${newLeadsCount} ${newLeadsCount===1?"פנייה חדשה מחכה":"פניות חדשות מחכות"} לך 🌸`
                : todayAppts.length>0
                ? `${todayAppts.length} ${todayAppts.length===1?"תור היום":"תורים היום"} — שיהיה יום נהדר ✨`
                : `${hour<12?"בוקר רגוע":hour<17?"צהריים רגועים":hour<21?"ערב רגוע":"לילה רגוע"} ☕ — יום טוב לפנות ללקוחות ותיקות`;
              const bdToday=upcomingBirthdays.filter(c=>{const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);return Math.floor((bd-now)/(1000*60*60*24))===0;});
              // Revenue stats + chart moved to the "תובנות" (insights) tab.
              const openNewAppt=()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);setShowMobileSidebar(false);};
              const quickActions=[
                {label:"תור חדש",hint:"קביעת פגישה",icon:"✦",onClick:openNewAppt},
                {label:"תשלום",hint:"פתיחת קופה",icon:"₪",onClick:()=>handleOpenCashier(null)},
                {label:"מטופלת חדשה",hint:"הוספה ל-CRM",icon:"♥",onClick:()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}},
                {label:"הודעות",hint:"מרכז וואטסאפ",icon:"✆",onClick:()=>setActiveTab("whatsapp")},
              ];
              return(<>
                {/* ── TIER 1a: slim greeting bar + 2 primary inline actions ── */}
 <motion.div className="hero-card" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.4,ease:[0.2,0.7,0.3,1]}}
   style={{maxWidth:1180,margin:"0 auto 22px",background:"var(--grad-hero)",borderRadius:22,border:"1px solid var(--line)",boxShadow:"var(--shadow-md)",padding:"20px 26px",position:"relative",overflow:"hidden"}}>
 <div aria-hidden style={{position:"absolute",top:-80,left:-60,width:240,height:240,borderRadius:"50%",background:"radial-gradient(circle, rgba(232,201,233,0.5), transparent 70%)",pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,flexWrap:"wrap"}}>
                    {/* flex-basis 220 rather than min-width 220: it still asks
                        for the same width, but it can now shrink below it. On a
                        320px phone the card only offers ~272px of content, and
                        a hard 220px floor plus the action buttons forced a wrap
                        that left the greeting stranded on its own row. */}
 <div style={{flex:"1 1 220px",minWidth:0}}>
 <div className="pill" style={{background:"rgba(255,255,255,0.7)",color:pcDeep,padding:"5px 12px",border:"1px solid var(--line-2)",boxShadow:"var(--shadow-xs)",marginBottom:10}}>
 <span style={{width:7,height:7,borderRadius:"50%",background:"var(--success)",boxShadow:"0 0 0 3px rgba(70,179,123,0.18)"}}/>
                      {todayAppts.length>0?`${todayAppts.length} תורים היום · ${weekAppts.length} השבוע`:`יום פנוי · ${weekAppts.length} תורים השבוע`}
 </div>
                    {/* Two separate causes, both needed:
                        1. font-size is a clamp, not a fixed 30px with a media
                           query. One source of truth, and it scales on every
                           width instead of stepping at 680px.
                        2. The name span paints its gradient with
                           background-clip:text, which only paints INSIDE the
                           element's background box. Italic glyphs on this
                           display face overhang that box, so their tops and
                           descenders got no paint and read as cut off. That box
                           is sized from the font metrics, NOT from line-height,
                           which is why raising the line-height alone never
                           fixed it. Vertical padding on the inline span widens
                           the paint box without affecting layout at all. */}
 <h1 className="serif hero-greeting" style={{fontSize:"clamp(21px, 6.2vw, 30px)",fontWeight:600,color:"var(--ink)",lineHeight:1.4,letterSpacing:"-0.01em",margin:"0 0 2px",overflowWrap:"break-word"}}>{greeting}{settings.therapist_name?.trim()?<>, <span style={{background:pcGrad,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",fontStyle:"italic",padding:"0.10em 0 0.22em",overflowWrap:"break-word"}}>{settings.therapist_name}</span></>:""}</h1>
 <p style={{fontSize:13,color:"var(--ink-2)",marginTop:7,fontWeight:400,maxWidth:520,lineHeight:1.5}}>{warmMsg}</p>
 </div>
 <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {/* Read-only mode visibly disables these: both open a form that
                        could only fail. guardWrite() still backstops the handlers. */}
                    {quickActions.slice(0,2).map((qa,i)=>(
 <motion.button key={i} onClick={qa.onClick} disabled={readOnly} title={readOnly?DISABLED_REASON_HE:undefined} whileHover={readOnly?undefined:{y:-2}} whileTap={readOnly?undefined:{scale:0.98}} className="primary-btn"
   style={{display:"inline-flex",alignItems:"center",gap:9,padding:"11px 18px",fontSize:12.5,cursor:readOnly?"not-allowed":"pointer",opacity:readOnly?0.5:1,fontFamily:"inherit",background:i===0?pcGrad:"var(--surface)",color:i===0?"var(--surface)":pcDeep,border:i===0?"none":"1px solid var(--line-2)",boxShadow:i===0?`0 8px 18px ${pcShadow}`:"var(--shadow-xs)"}}>
 <span style={{fontSize:14}}>{qa.icon}</span>{qa.label}
 </motion.button>
                    ))}
 </div>
 </div>
 </motion.div>

                {/* SETUP CHECKLIST — prominent on the dashboard ONLY while incomplete.
                    Once every item is done it disappears from here and lives compactly
                    inside Settings (+ the always-on header ☑ button / modal). */}
                {setupDone < setupTotal && (
 <div style={{maxWidth:1180,margin:"0 auto 18px",background:"var(--surface)",border:`1px solid ${pc}`,borderRadius:20,padding:"18px 22px",boxShadow:"var(--shadow-md)"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:6}}>
 <h3 className="serif" style={{fontSize:17,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>הגדרת המערכת</h3>
 <span style={{fontSize:11,color:pcDeep,fontWeight:700}}>{setupDone}/{setupTotal}</span>
 </div>
                  {renderSetupBody()}
 </div>
                )}

                {/* ── TIER 1b: FOCAL — Today (primary) + Needs attention ── */}
 <div style={{maxWidth:1180,margin:"0 auto",display:"flex",gap:18,flexWrap:"wrap",alignItems:"flex-start"}}>

 {/* TODAY — the focal point: widest, most prominent */}
 <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.42,ease:[0.2,0.7,0.3,1]}} className="glass-card" style={{padding:"24px 26px",flex:"2 1 380px",minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"var(--pc-tint)",color:pc}}>◴</span>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>תורים להיום</h3>
                      {todayAppts.length>0&&<span className="pill" style={{marginRight:"auto",background:"var(--pc-tint)",color:pcDeep,padding:"3px 11px",fontSize:11}}>{todayAppts.length}</span>}
 </div>
                    {todayAppts.length===0?(
 <div style={{textAlign:"center",padding:"20px 14px"}}>
 <div style={{width:52,height:52,borderRadius:17,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,background:"var(--pc-tint)"}}>☕</div>
 <p style={{fontSize:13,fontWeight:600,color:"var(--ink)",marginBottom:4}}>אין תורים להיום</p>
 <p style={{fontSize:13,color:"var(--ink-3)",marginBottom:16,lineHeight:1.5}}>יום פנוי — הזדמנות טובה לקבוע תור או להתארגן</p>
 <button className="empty-cta" onClick={openNewAppt} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:24,padding:"10px 20px",fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 8px 18px ${pcShadow}`}}>✦ קביעת תור</button>
 </div>
                      ):todayAppts.slice().sort((a,b)=>(startMinute(a)??0)-(startMinute(b)??0)).map((a,i,arr)=>{
                        const st=a.confirmation_status==="confirmed"?{l:"אושר",c:"var(--success)",bg:"rgba(70,179,123,0.12)"}:a.confirmation_status==="cancelled"?{l:"בוטל",c:"var(--danger)",bg:"rgba(224,91,111,0.12)"}:{l:"ממתין",c:pc,bg:"var(--pc-tint)"};
                        return(
 <div key={a.id} className="appt-card" style={{display:"flex",alignItems:"center",gap:13,padding:"11px 12px",borderRadius:14,marginBottom:6,background:"var(--surface-2)",border:"1px solid var(--line)"}}>
 <span style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:52,flexShrink:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:11,padding:"5px 0"}}>
                          {/* One line, not two. This used to render {a.hour}
                              in the serif face with a separate ":00" beneath
                              it, which composed to "14" + ":00". fmtApptTime
                              now returns the whole "14:30", so the second span
                              was appending a stray ":00" under every time on
                              the dashboard - reading "14:30" above ":00".
                              A leftover of the minutes migration, found while
                              auditing type sizes on this screen. */}
 <span className="serif" style={{fontSize:17,fontWeight:700,color:pc,lineHeight:1.1}}>{fmtApptTime(a)}</span>
 </span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:12.5,color:"var(--ink-2)",marginTop:1}}>{a.service}</p>
 </div>
 <span className="pill" style={{padding:"5px 12px",background:st.bg,color:st.c}}>{st.l}</span>
 </div>
                        );
                      })}
 </motion.div>

 {/* NEEDS ATTENTION — secondary (today's birthdays folded in as an action) */}
 <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.42,delay:0.06,ease:[0.2,0.7,0.3,1]}} className="glass-card" style={{padding:"24px 26px",flex:"1 1 280px",minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"rgba(242,184,75,0.14)",color:"var(--warning)"}}>✷</span>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>דורש תשומת לב</h3>
 </div>
                    {(()=>{
                      // Unified approval queue: individual pending actions collected from
                      // existing signals (leads, cold clients, birthdays, tomorrow reminders).
                      // Each item carries its own primary action; nothing is sent — actions
                      // open an editable surface (booking modal / lead drawer) or navigate.
                      const q=[];
                      leadsWithReminders.forEach(l=>q.push({key:`lead:${l.id}`,icon:"◴",accent:"var(--danger)",source:"לידים",what:"מעקב אחר פנייה",who:l.name,why:`תזכורת מעקב להיום${l.service_interest?` · ${l.service_interest}`:""}`,primaryLabel:"פתחי פנייה",run:()=>{setSelectedLead(l);setActiveTab("leads");}}));
                      coldClients.forEach(c=>q.push({key:`rebook:${c.id}`,icon:"✦",accent:"var(--warning)",source:"לקוחות",what:"הצעת תור חוזר",who:c.name,why:"לא ביקרה מעל 60 יום",primaryLabel:"קבעי תור",run:()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:c.id,name:c.name,service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}}));
                      if(newLeadsCount>0)q.push({key:"newleads",icon:"✉",accent:"var(--pc)",source:"לידים",what:"מענה לפניות חדשות",who:`${newLeadsCount} פניות חדשות`,why:"ממתינות למענה ראשוני",primaryLabel:"פתחי לידים",run:()=>setActiveTab("leads")});
                      bdToday.forEach(c=>q.push({key:`bday:${c.id}`,icon:"🎀",accent:"var(--danger)",source:"לקוחות",what:"ברכת יום הולדת",who:c.name,why:"יום הולדת היום",primaryLabel:"פתחי הודעות",run:()=>setActiveTab("whatsapp")}));
                      const tomorrowNotSent=tomorrowAppts.filter(a=>!a.confirmation_sent);
                      if(tomorrowNotSent.length>0)q.push({key:"tomorrow",icon:"✆",accent:"var(--success)",source:"יומן",what:"תזכורות לתורי מחר",who:`${tomorrowNotSent.length} תורים`,why:"טרם נשלחה תזכורת",primaryLabel:"פתחי מרכז הודעות",run:()=>setActiveTab("whatsapp")});
                      // Skin Follow-up suggestions from the existing route (empty when Off/paused).
                      (skinQueue||[]).forEach(s=>{ if(s&&s.clientId!=null) q.push({key:`skin:${s.clientId}`,isSkin:true,icon:"🧴",accent:"var(--pc-deep)",source:"מעקב עור",what:"הצעת מעקב עור",who:s.name||"לקוחה",why:s.reasonText||"",message:s.message||"",hasPhone:!!s.hasPhone,clientId:s.clientId}); });
                      // Dedup by key (stable per client/entity) + drop dismissed AND mocked-approved.
                      const seen=new Set();
                      const visible=q.filter(it=>{if(seen.has(it.key))return false;seen.add(it.key);return !queueDismissed.has(it.key)&&!queueApproved.has(it.key);});
                      const paused=settings?.automations?.paused===true;
                      if(visible.length===0&&!skinQueueLoading&&!skinQueueError)return(
 <div style={{textAlign:"center",padding:"18px 10px"}}>
 <div style={{width:46,height:46,borderRadius:15,margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:"rgba(70,179,123,0.12)",color:"var(--success)"}}>✓</div>
 <p style={{fontSize:12,color:"var(--ink-2)",fontWeight:600}}>הכל מטופל</p>
 <p style={{fontSize:13,color:"var(--ink-3)",marginTop:3}}>אין פעולות שממתינות לך כרגע</p>
 </div>);
                      return(<>
                        {paused&&<p style={{fontSize:12,color:"var(--warning)",fontWeight:700,background:"rgba(242,184,75,0.12)",borderRadius:10,padding:"6px 10px",marginBottom:8}}>⏸ האוטומציות מושהות — פעולות ידניות עדיין זמינות.</p>}
                        {skinQueueLoading&&skinQueue===null&&<p style={{fontSize:12,color:"var(--ink-3)",padding:"2px 2px 8px"}}>טוען הצעות מעקב עור…</p>}
                        {skinQueueError&&<p style={{fontSize:12,color:"var(--danger)",fontWeight:600,background:"rgba(224,91,111,0.08)",borderRadius:10,padding:"6px 10px",marginBottom:8}}>{skinQueueError}</p>}
                        {visible.map(it=>(
 <div key={it.key} style={{border:"1px solid var(--line)",background:"var(--surface-2)",borderRadius:14,padding:"11px 13px",marginBottom:8}}>
 <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
 <span style={{width:30,height:30,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:it.accent,background:lighten(it.accent,0.85)}}>{it.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>{it.what}</p>
 <span style={{fontSize:10.5,fontWeight:700,color:"var(--ink-3)",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:20,padding:"1px 7px"}}>{it.source}</span>
 <span style={{fontSize:10.5,fontWeight:700,color:"var(--warning)",background:"rgba(242,184,75,0.15)",borderRadius:20,padding:"1px 7px"}}>ממתין</span>
 </div>
 <p style={{fontSize:11,color:"var(--ink)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.who}</p>
 <p style={{fontSize:12,color:"var(--ink-3)",marginTop:1}}>{it.why}</p>
                                {it.isSkin&&!it.hasPhone&&<p style={{fontSize:12,color:"var(--danger)",fontWeight:600,marginTop:3}}>⚠ אין מספר טלפון ללקוחה — לא ניתן לשלוח</p>}
                                {it.isSkin&&(
 <div style={{marginTop:6}}>
 <button onClick={()=>setSkinOpen(prev=>{const n=new Set(prev);if(n.has(it.key))n.delete(it.key);else n.add(it.key);return n;})} style={{background:"none",border:"none",color:pc,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>{skinOpen.has(it.key)?"▲ הסתר הודעה":"▼ צפייה ועריכה בהודעה"}</button>
                                    {skinOpen.has(it.key)&&(
 <textarea value={skinEdits[it.key]??it.message} onChange={e=>setSkinEdits(prev=>({...prev,[it.key]:e.target.value}))} rows={3} dir="rtl" style={{width:"100%",marginTop:6,border:"1px solid var(--line-2)",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",direction:"rtl",background:"var(--surface)",resize:"vertical",color:"var(--ink)"}}/>
                                    )}
 </div>
                                )}
 <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                                  {it.isSkin?(
 <button onClick={()=>approveSkinFollowup(it)} disabled={!it.hasPhone} className="primary-btn" style={{background:it.hasPhone?pcGrad:"var(--line-2)",color:"var(--surface)",fontSize:13,padding:"7px 15px",opacity:it.hasPhone?1:0.65,cursor:it.hasPhone?"pointer":"not-allowed"}}>אשרי (בדיקה) ✓</button>
                                  ):(
 <button onClick={it.run} className="primary-btn" style={{background:pcGrad,color:"var(--surface)",fontSize:13,padding:"7px 15px"}}>{it.primaryLabel}</button>
                                  )}
 <button onClick={()=>setQueueDismissed(prev=>{const n=new Set(prev);n.add(it.key);return n;})} style={{background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:20,fontSize:13,padding:"7px 12px",color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>דחייה</button>
 </div>
 </div>
 </div>
 </div>
                        ))}
                      </>);
                    })()}
 </motion.div>
 </div>

 </>);
            })()}
 </>)}

          {/* INSIGHTS / תובנות — overview & analytics (moved off the calm "היום" home) */}
          {activeTab==="insights"&&(<>
            {(()=>{
              const revTrend=lastMonthRevenue>0?Math.round(((thisMonthRevenue-lastMonthRevenue)/lastMonthRevenue)*100):null;
              const stats=[
                {label:"הכנסות החודש",value:`₪${thisMonthRevenue.toLocaleString()}`,icon:"₪",accent:pc,trend:revTrend,
                  sub:revTrend!==null?(revTrend>=0?`עלייה של ${revTrend}% מהחודש שעבר`:`ירידה של ${Math.abs(revTrend)}% מהחודש שעבר`):"החודש הראשון שלך"},
                {label:"תורים השבוע",value:weekAppts.length,icon:"◴",accent:pc,trend:null,sub:`${todayAppts.length} מהם היום`},
                {label:"לקוחות פעילות",value:activeClients.length,icon:"♥",accent:"var(--success)",trend:null,sub:thisMonthLeads.length>0?`${thisMonthLeads.length} פניות חדשות החודש`:"אין פניות חדשות"},
                {label:"להתחדשות",value:coldClients.length,icon:"✦",accent:"var(--warning)",trend:null,sub:coldClients.length>0?"שווה לשלוח הודעה":"כל הלקוחות פעילות "},
              ];
              const maxRev=Math.max(...monthlyData.map(m=>m.revenue),1);
              return(
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>סקירה עסקית</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:18}}>תובנות</h2>

                {/* STAT WIDGETS — full size */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16,marginBottom:24}}>
                  {stats.map((s,i)=>{
                    const up=s.trend!=null&&s.trend>=0;
                    return(
 <motion.div key={i} className="stat-card" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.42,delay:0.05*i,ease:[0.2,0.7,0.3,1]}}
   style={{background:"var(--surface)",borderRadius:20,padding:"22px 22px",border:"1px solid var(--line)",textAlign:"right",position:"relative",overflow:"hidden"}}>
 <div aria-hidden style={{position:"absolute",top:0,right:0,width:110,height:110,background:`radial-gradient(circle at 100% 0%, ${lighten(s.accent,0.82)}, transparent 70%)`,pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
 <span style={{width:42,height:42,borderRadius:13,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,fontWeight:700,color:s.accent,background:lighten(s.accent,0.86),border:`1px solid ${lighten(s.accent,0.7)}`}}>{s.icon}</span>
                        {s.trend!=null&&(
 <span className="pill" style={{background:up?"rgba(70,179,123,0.12)":"rgba(224,91,111,0.12)",color:up?"var(--success)":"var(--danger)",padding:"4px 9px"}}>{up?"▲":"▼"} {Math.abs(s.trend)}%</span>
                        )}
 </div>
 <p style={{position:"relative",fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:6}}>{s.label}</p>
 <p className="serif" style={{position:"relative",fontSize:38,fontWeight:600,color:"var(--ink)",lineHeight:1,letterSpacing:"-0.01em"}}>{s.value}</p>
                      {s.sub&&<p style={{position:"relative",fontSize:10.5,color:"var(--ink-2)",marginTop:10,fontWeight:500}}>{s.sub}</p>}
 </motion.div>
                    );
                  })}
 </div>

                {/* REVENUE CHART */}
 <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{duration:0.45,delay:0.1,ease:[0.2,0.7,0.3,1]}}
   style={{background:"var(--surface)",borderRadius:24,padding:"26px 30px 22px",border:"1px solid var(--line)",boxShadow:"var(--shadow-md)",marginBottom:24,position:"relative",overflow:"hidden"}}>
 <div aria-hidden style={{position:"absolute",top:-70,left:-40,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle, var(--pc-soft), transparent 70%)",pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14,marginBottom:22,flexWrap:"wrap"}}>
 <div>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:5}}>סקירת הכנסות</p>
 <h3 className="serif" style={{fontSize:22,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>6 החודשים האחרונים</h3>
 </div>
 <div style={{textAlign:"left"}}>
 <p className="serif" style={{fontSize:26,fontWeight:600,color:pc,lineHeight:1}}>₪{monthlyData.reduce((s,m)=>s+m.revenue,0).toLocaleString()}</p>
 <p style={{fontSize:10,color:"var(--ink-3)",marginTop:3}}>סה״כ בתקופה</p>
 </div>
 </div>
 <div style={{position:"relative",display:"flex",alignItems:"flex-end",gap:12,height:168,paddingBottom:4,borderBottom:"1px solid var(--line)"}}>
                    {monthlyData.map((m,i)=>{
                      const h=Math.round((m.revenue/maxRev)*130);
                      const isCurrent=i===monthlyData.length-1;
                      return(
 <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",gap:7,height:"100%"}}>
 <span style={{fontSize:9.5,fontWeight:700,color:isCurrent?pc:"var(--ink-3)"}}>{m.revenue>0?`₪${(m.revenue/1000).toFixed(m.revenue>=10000?0:1)}k`:""}</span>
 <motion.div initial={{height:0}} animate={{height:Math.max(h,4)}} transition={{duration:0.6,delay:0.15+0.06*i,ease:[0.2,0.7,0.3,1]}}
   title={`${m.month}: ₪${m.revenue.toLocaleString()}`}
   style={{width:"100%",maxWidth:44,borderRadius:"12px 12px 5px 5px",background:isCurrent?`linear-gradient(180deg,${pc2} 0%,${pcDeep} 100%)`:`linear-gradient(180deg,${lighten(pc,0.62)} 0%,${lighten(pc,0.4)} 100%)`,boxShadow:isCurrent?`0 8px 18px ${pcShadow}`:"none",cursor:"default"}}/>
 </div>
                      );
                    })}
 </div>
 <div style={{display:"flex",gap:12,marginTop:8}}>
                    {monthlyData.map((m,i)=>{const isCurrent=i===monthlyData.length-1;return(
 <span key={i} style={{flex:1,textAlign:"center",fontSize:10,color:isCurrent?"var(--ink)":"var(--ink-3)",fontWeight:isCurrent?700:500}}>{m.month}</span>
                    );})}
 </div>
 </motion.div>

                {/* UPCOMING BIRTHDAYS — full list */}
 <div className="glass-card" style={{padding:"24px 26px",marginBottom:24}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"rgba(224,91,111,0.12)",color:"var(--danger)"}}>🎀</span>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>ימי הולדת קרובים</h3>
                    {upcomingBirthdays.length>0&&<span className="pill" style={{marginRight:"auto",background:"var(--pc-tint)",color:pcDeep,padding:"3px 11px",fontSize:11}}>{upcomingBirthdays.length}</span>}
 </div>
                    {upcomingBirthdays.length===0?(
 <div style={{textAlign:"center",padding:"22px 14px"}}>
 <div style={{width:52,height:52,borderRadius:17,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,background:"rgba(224,91,111,0.10)"}}>🎂</div>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink-2)"}}>אין ימי הולדת קרובים</p>
 <p style={{fontSize:10.5,color:"var(--ink-3)",marginTop:3}}>ב-30 הימים הקרובים</p>
 </div>
                      ):upcomingBirthdays.slice(0,20).map((c)=>{
                        const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(bd<now)bd.setFullYear(now.getFullYear()+1);
                        return(
 <div key={c.id} className="appt-card" style={{display:"flex",alignItems:"center",gap:13,padding:"9px 10px",borderRadius:14,marginBottom:6,background:"var(--surface-2)",border:"1px solid var(--line)"}}>
 <div className="serif" style={{width:44,height:44,borderRadius:13,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"var(--surface)",background:pcGrad,boxShadow:`0 5px 12px ${pcShadow}`}}>{b.getDate()}</div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <p style={{fontSize:10,color:"var(--ink-3)",marginTop:1}}>{bd.getDate()}/{bd.getMonth()+1}</p>
 </div>
                          {c.phone&&<a href={waBirthday(c.phone,c.name,settings.business_name)} target="_blank" rel="noreferrer" className="pill" style={{padding:"6px 14px",background:"var(--pc-tint)",color:pc,textDecoration:"none"}}>ברכה</a>}
 </div>
                        );
                      })}
 </div>
 </div>
              );
            })()}
 </>)}

          {/* CALENDAR */}
          {activeTab==="calendar"&&(<>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12,maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div className={calView==="week"?undefined:"desktop-only"}>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>לוח שבועי</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(weekDates[0])} – {formatDateHe(weekDates[5])}</h2>
 </div>
 <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
 {/* Mobile-only day/week toggle. Hidden on desktop, so desktop always shows the week grid. */}
 <div className="mobile-only" style={{gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>setCalView("day")} style={{background:calView==="day"?pcGrad:"none",color:calView==="day"?"var(--surface)":"var(--ink-2)",border:"none",borderRadius:11,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>יום</button>
 <button onClick={()=>setCalView("week")} style={{background:calView==="week"?pcGrad:"none",color:calView==="week"?"var(--surface)":"var(--ink-2)",border:"none",borderRadius:11,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit"}}>שבוע</button>
 </div>
 <div className="desktop-only" style={{display:"flex",gap:10,fontSize:12,color:"var(--ink-2)",alignItems:"center"}}>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--success)"}}/>אישרה</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--danger)"}}/>ביטלה</span>
 <span className="pill" style={{gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--ink-3)"}}/>ממתין</span>
 </div>
 <div className={calView==="week"?undefined:"desktop-only"} style={{display:"flex",alignItems:"center",gap:2,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,padding:3,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-6);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:11,padding:"7px 12px",cursor:"pointer",fontSize:13,color:pc,fontFamily:"inherit"}}>←</button>
 <button onClick={()=>setWeekStart(new Date())} style={{background:"var(--pc-tint)",border:"none",borderRadius:11,padding:"7px 14px",cursor:"pointer",fontSize:11.5,fontWeight:600,color:pcDeep,fontFamily:"inherit"}}>היום</button>
 <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+6);setWeekStart(d);}} style={{background:"none",border:"none",borderRadius:11,padding:"7px 12px",cursor:"pointer",fontSize:13,color:pc,fontFamily:"inherit"}}>→</button>
 </div>
 <button className="primary-btn" onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{background:pcGrad,color:"var(--surface)",padding:"10px 18px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ תור חדש</button>
 </div>
 </div>
 <div className={calView==="week"?"glass-card card-flush":"glass-card card-flush desktop-only"} style={{overflow:"auto",WebkitOverflowScrolling:"touch",maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"grid",gridTemplateColumns:"52px repeat(6,minmax(70px,1fr))",borderBottom:"1px solid var(--line)",background:"linear-gradient(100deg,var(--lavender-100),var(--surface))",minWidth:480}}>
 <div/>
                {weekDates.map((d,i)=>{
                  const isToday=formatDate(d)===today;
                  const dayAppts=appointments.filter(a=>a.date===formatDate(d));
                  const hasCancel=dayAppts.some(a=>a.confirmation_status==="cancelled");
                  const isClosed=!dayHoursFrom(settings,d.getDay());
                  return(
 <div key={i} style={{padding:"11px 4px",textAlign:"center",borderRight:i<5?"1px solid var(--line)":"none",background:isToday?"var(--pc-tint)":hasCancel?"rgba(224,91,111,0.05)":"transparent",opacity:isClosed?0.5:1}}>
 <p style={{fontSize:11.5,color:isToday?pcDeep:"var(--ink-3)",fontWeight:600}}>{DAYS_HE[d.getDay()]}</p>
 <p className="serif" style={{fontSize:18,fontWeight:700,color:isToday?pc:"var(--ink)",lineHeight:1.2,display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:26,height:26,borderRadius:"50%",...(isToday?{background:pcGrad,color:"var(--surface)",WebkitTextFillColor:"var(--surface)"}:{})}}>{d.getDate()}</p>
 <p style={{fontSize:7.5,color:"var(--ink-3)",marginTop:1}}>{d.getMonth()+1}/{d.getFullYear().toString().slice(2)}</p>
                      {isClosed&&<p style={{fontSize:7.5,color:"var(--ink-3)",fontWeight:700}}>סגור</p>}
                      {hasCancel&&<p style={{fontSize:7.5,color:"var(--danger)",fontWeight:600}}>ביטול</p>}
 </div>
                  );
                })}
 </div>
              {workingHours.map((hour,hi)=>(
 <div key={hour} style={{display:"grid",gridTemplateColumns:"52px repeat(6,minmax(70px,1fr))",borderBottom:hi<workingHours.length-1?"1px solid var(--line)":"none",minHeight:56,minWidth:480}}>
 <div style={{padding:"5px 3px 0",fontSize:9,color:"var(--ink-3)",fontWeight:600,textAlign:"center",borderLeft:"1px solid var(--line)"}}>{hour}</div>
                  {weekDates.map((date,di)=>{
                    const actualHour=settings.working_hours_start+hi;
                    const appt=getAppt(date,actualHour);
                    const apptColor=appt?getApptColor(appt):null;
                    const dh=dayHoursFrom(settings,date.getDay());
                    const openCell=!!dh&&actualHour>=dh.open&&actualHour<dh.close;
                    const blocked=!appt&&!openCell; // closed day / outside that day's hours -> not bookable
                    return(
 <div key={di} className={(!appt&&openCell)?"slot":""} onClick={blocked?undefined:()=>handleSlotClick(date,actualHour)} style={{borderRight:di<5?"1px solid var(--line)":"none",position:"relative",padding:3,minHeight:56,transition:"background 0.15s",cursor:blocked?"default":undefined,background:blocked?"repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(122,90,136,0.06) 5px,rgba(122,90,136,0.06) 10px)":undefined}}>
                        {appt&&(
 <div className="appt-card" title="לחצי לעריכה / שינוי מועד" onClick={e=>{e.stopPropagation();handleApptClick(appt);}} onMouseEnter={()=>setHoveredAppt(appt.id)} onMouseLeave={()=>setHoveredAppt(null)}
                            style={{background:apptColor,borderRadius:11,padding:"5px 7px",height:"calc(100% - 2px)",position:"relative",boxShadow:"0 3px 8px rgba(43,34,51,0.14)",cursor:"pointer",border:appt.confirmation_status==="confirmed"?"2px solid var(--success)":appt.confirmation_status==="cancelled"?"2px solid var(--danger)":"2px solid rgba(255,255,255,0.35)"}}>
 <p style={{fontSize:11.5,fontWeight:700,color:"var(--surface)",textShadow:"0 1px 2px rgba(0,0,0,0.35)",lineHeight:1.15}}>{appt.name}</p>
 <p style={{fontSize:7.5,color:"rgba(255,255,255,0.92)"}}>{appt.service}</p>
                            {appt.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"var(--surface)"}}>✓</span>}
                            {appt.confirmation_status==="cancelled"&&<span style={{fontSize:8,color:"var(--surface)"}}>✕</span>}
 <div style={{display:"flex",gap:3,position:"absolute",bottom:3,right:3}}>
                              {appt.client_id&&<button title="כרטיס לקוחה" onClick={e=>{e.stopPropagation();setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");}} style={{background:"rgba(255,255,255,0.85)",border:"none",borderRadius:6,width:17,height:17,fontSize:8,cursor:"pointer",lineHeight:1}}>♥</button>}
                              {(clients.find(c=>String(c.id)===String(appt.client_id))?.phone||appt.client_phone)&&<button title="שלחי תזכורת" onClick={e=>{e.stopPropagation();sendReminderToClient(appt);}} disabled={isBusy("sendReminder")} style={{background:"rgba(255,255,255,0.85)",border:"none",borderRadius:6,width:17,height:17,fontSize:8,cursor:"pointer",lineHeight:1}}>✉</button>}
 <button title="תשלום" onClick={e=>{e.stopPropagation();handleOpenCashier(appt);}} style={{background:"rgba(255,255,255,0.85)",border:"none",borderRadius:6,width:17,height:17,fontSize:8,cursor:"pointer",lineHeight:1}}>₪</button>
 </div>
                            {hoveredAppt===appt.id&&<button onClick={e=>{e.stopPropagation();handleDelete(appt);}} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.28)",border:"none",borderRadius:6,width:15,height:15,fontSize:8,cursor:"pointer",color:"var(--surface)"}}>✕</button>}
 </div>
                        )}
 </div>
                    );
                  })}
 </div>
              ))}
 </div>
              {/* MOBILE single-day agenda — mobile-only + rendered only in day view.
                  Desktop never shows this (calView stays "day" but .mobile-only hides it),
                  so the desktop calendar is unchanged. Reuses all existing handlers. */}
              {calView==="day"&&(()=>{
                const dh=dayHoursFrom(settings,calDay.getDay());
                const isTodaySel=formatDate(calDay)===today;
                const agBtn={background:"rgba(255,255,255,0.9)",border:"none",borderRadius:10,width:40,height:40,fontSize:16,cursor:"pointer",lineHeight:1,color:"var(--ink)",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0};
                return(
 <div className="mobile-only" style={{flexDirection:"column",maxWidth:560,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12}}>
 <button aria-label="יום קודם" onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()-1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,width:44,height:44,fontSize:18,color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>←</button>
 <div style={{textAlign:"center",flex:1}}>
 <p style={{fontSize:12,color:"var(--ink-3)",fontWeight:600}}>יום {DAYS_HE[calDay.getDay()]}</p>
 <p className="serif" style={{fontSize:21,fontWeight:700,color:isTodaySel?pc:"var(--ink)",letterSpacing:"-0.01em"}}>{formatDateHe(calDay)}{isTodaySel?" · היום":""}</p>
 </div>
 <button aria-label="יום הבא" onClick={()=>{const d=new Date(calDay);d.setDate(d.getDate()+1);setCalDay(d);}} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,width:44,height:44,fontSize:18,color:pc,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>→</button>
 </div>
 <div style={{display:"flex",gap:8,marginBottom:14}}>
 <button onClick={()=>setCalDay(new Date())} style={{flex:1,background:"var(--pc-tint)",border:"none",borderRadius:14,padding:"11px 0",fontSize:13,fontWeight:600,color:pcDeep,cursor:"pointer",fontFamily:"inherit"}}>היום</button>
 <button className="primary-btn" onClick={()=>{const svc=activeServices[0];setEditingAppointmentId(null);setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(calDay),hour:dh?dh.open:settings.working_hours_start,price:svc?.price||0});setApptNote("");setShowModal(true);}} style={{flex:2,background:pcGrad,color:"var(--surface)",padding:"11px 0",fontSize:13,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ תור חדש</button>
 </div>
                  {!dh?(
 <div style={{textAlign:"center",padding:"48px 0",color:"var(--danger)",fontWeight:700,fontSize:15,background:"var(--surface)",borderRadius:16,border:"1px solid var(--line)"}}>סגור ביום זה</div>
                  ):(
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {workingHours.map((hourLabel,hi)=>{
                        const actualHour=settings.working_hours_start+hi;
                        const openCell=actualHour>=dh.open&&actualHour<dh.close;
                        const appt=getAppt(calDay,actualHour);
                        if(!openCell&&!appt) return null;
                        const apptColor=appt?getApptColor(appt):null;
                        const hasPhone=appt&&(clients.find(c=>String(c.id)===String(appt.client_id))?.phone||appt.client_phone);
                        return(
 <div key={hi} style={{display:"flex",alignItems:"stretch",gap:10}}>
 <div style={{width:48,flexShrink:0,textAlign:"center",paddingTop:appt?12:15,fontSize:13,fontWeight:700,color:"var(--ink-3)"}}>{hourLabel}</div>
                            {appt?(
 <div onClick={()=>handleApptClick(appt)} style={{flex:1,minWidth:0,background:apptColor,borderRadius:14,padding:"12px 14px",cursor:"pointer",boxShadow:"0 3px 8px rgba(43,34,51,0.14)",border:appt.confirmation_status==="confirmed"?"2px solid var(--success)":appt.confirmation_status==="cancelled"?"2px solid var(--danger)":"2px solid rgba(255,255,255,0.35)"}}>
 <p style={{fontSize:15,fontWeight:700,color:"var(--surface)",textShadow:"0 1px 2px rgba(0,0,0,0.35)",lineHeight:1.2}}>{appt.name}{appt.confirmation_status==="confirmed"?" ✓":appt.confirmation_status==="cancelled"?" ✕":""}</p>
 <p style={{fontSize:12.5,color:"rgba(255,255,255,0.92)",marginTop:2}}>{appt.service} · {appt.duration}ד׳</p>
 <div style={{display:"flex",gap:8,marginTop:10}}>
                                  {appt.client_id&&<button aria-label="כרטיס לקוחה" onClick={e=>{e.stopPropagation();setSelectedClient(clients.find(c=>String(c.id)===String(appt.client_id)));setClientTab("info");}} style={agBtn}>♥</button>}
                                  {hasPhone&&<button aria-label="שליחת תזכורת" onClick={e=>{e.stopPropagation();sendReminderToClient(appt);}} disabled={isBusy("sendReminder")} style={agBtn}>✉</button>}
 <button aria-label="תשלום" onClick={e=>{e.stopPropagation();handleOpenCashier(appt);}} style={agBtn}>₪</button>
 <button aria-label="מחיקה" onClick={e=>{e.stopPropagation();handleDelete(appt);}} style={{...agBtn,marginRight:"auto",background:"rgba(0,0,0,0.24)",color:"var(--surface)"}}>✕</button>
 </div>
 </div>
                            ):(
 <button onClick={()=>handleSlotClick(calDay,actualHour)} style={{flex:1,background:"var(--surface)",border:"1px dashed var(--line-2)",borderRadius:14,padding:14,fontSize:13,color:"var(--ink-3)",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>+ פנוי</button>
                            )}
 </div>
                        );
                      })}
 </div>
                  )}
 </div>
                );
              })()}
 </>)}

          {/* CLIENTS */}
          {activeTab==="clients"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>ניהול קשרי לקוחות</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>לקוחות <span style={{color:"var(--ink-3)",fontWeight:400}}>({filteredClients.length})</span></h2>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button onClick={openImportHub} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>⇪ ייבוא לקוחות</button>
 <button className="primary-btn" onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"var(--surface)",padding:"10px 18px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ מטופלת חדשה</button>
 </div>
 </div>
 <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
 <div style={{position:"relative",flex:1,minWidth:160}}>
 <span style={{position:"absolute",top:"50%",right:14,transform:"translateY(-50%)",fontSize:12,color:"var(--ink-3)",pointerEvents:"none"}}>⌕</span>
 <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="חיפוש לפי שם או טלפון..." style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 36px 10px 14px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",boxShadow:"var(--shadow-xs)"}}/>
 </div>
 <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 14px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink-2)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
 <option value="all">כל הסטטוסים</option><option value="VIP">VIP</option><option value="hot">חמות</option><option value="active">✓ פעילות</option><option value="cold">להתחדשות</option>
 </select>
 <select value={filterSkin} onChange={e=>setFilterSkin(e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 14px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink-2)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
 <option value="all">כל עור</option>{SKIN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
 </select>
 </div>
            {filteredClients.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:24,marginTop:6}}>
 <div style={{width:64,height:64,borderRadius:20,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>{(searchQuery||filterStatus!=="all")?"⌕":"♥"}</div>
 <p style={{fontSize:15,fontWeight:700,color:"var(--ink)",marginBottom:5}}>{(searchQuery||filterStatus!=="all")?"לא נמצאו לקוחות":"עוד אין לקוחות"}</p>
 <p style={{fontSize:12,color:"var(--ink-2)",maxWidth:340,margin:"0 auto 18px",lineHeight:1.6}}>{(searchQuery||filterStatus!=="all")?"נסי לשנות את החיפוש או הסינון.":"הוסיפי את הלקוחה הראשונה, או ייבאי רשימה שלמה בבת אחת."}</p>
 {!(searchQuery||filterStatus!=="all")&&(
 <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
 <button className="empty-cta primary-btn" onClick={()=>{setEditingClient(null);setNewClient(emptyClient);setShowClientModal(true);}} style={{background:pcGrad,color:"var(--surface)",padding:"11px 22px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ מטופלת חדשה</button>
 <button className="empty-cta" onClick={openImportHub} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:24,padding:"11px 22px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>⇪ ייבוא לקוחות</button>
 </div>
 )}
 </div>
 )
              :filteredClients.map(client=>{
                const appts=getClientAppts(client.id);
                // Most recent visit by actual date (then hour) - not by row id,
                // so a later-created past appointment can't masquerade as "last".
                const last=[...appts].sort((a,b)=>{const d=String(b.date||"").localeCompare(String(a.date||""));return d!==0?d:(Number(b.hour)||0)-(Number(a.hour)||0);})[0];
                const statusColor=STATUS_COLORS[client.status]||"var(--warning)";
                const days=getDaysSince(client.id);
                const total=getClientTotal(client.id);
                return(
 <div key={client.id} className="client-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת כרטיס הלקוחה ${client.name}`} onClick={()=>{setSelectedClient(client);setClientTab("info");}} style={{background:"var(--surface)",borderRadius:18,padding:"13px 16px",border:"1px solid var(--line)",display:"flex",alignItems:"center",gap:13,marginBottom:8,boxShadow:"var(--shadow-sm)"}}>
 <div style={{width:46,height:46,borderRadius:15,padding:2,background:`linear-gradient(135deg,${lighten(statusColor,0.4)},${statusColor})`,flexShrink:0,boxShadow:"var(--shadow-xs)"}}>
 <div style={{width:"100%",height:"100%",borderRadius:13,background:client.images?.[0]?"transparent":statusColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"var(--surface)",overflow:"hidden"}}>
                      {client.images?.[0]?<SignedImage value={client.images[0]} alt={client.name} style={{width:"100%",height:"100%",objectFit:"cover"}} fallback={client.name[0]}/>:client.name[0]}
 </div>
 </div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
 <p style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",letterSpacing:"-0.01em"}}>{client.name}</p>
                        {client.status&&<span className="pill" style={{fontSize:10.5,background:statusColor,color:"var(--surface)",padding:"3px 8px"}}>{STATUS_LABELS[client.status]}</span>}
                        {days>90&&<span className="pill" style={{fontSize:10.5,background:"rgba(242,184,75,0.16)",color:"var(--warning)",padding:"3px 8px"}}>רדומה · {days}י</span>}
                        {total>0&&<span className="pill" style={{fontSize:10.5,background:"var(--pc-tint)",color:pcDeep,padding:"3px 8px"}}>₪{total.toLocaleString()}</span>}
 </div>
 <p style={{fontSize:12.5,color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.phone&&`${client.phone} · `}{appts.length} תורים{last&&` · ${last.service}`}</p>
 </div>
                    {client.phone&&<a href={waLink(client.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"6px 11px",fontSize:12}}>✆ הודעה</a>}
 <span style={{fontSize:13,color:pc}}>←</span>
 </div>
                );
              })}
 </div>
 </>)}

          {/* LEADS */}
          {activeTab==="leads"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>צינור מכירות</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>פניות <span style={{color:"var(--ink-3)",fontWeight:400}}>({leads.length})</span></h2>
 </div>
 <button className="primary-btn" onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"var(--surface)",padding:"10px 18px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ פנייה חדשה</button>
 </div>
 <div style={{display:"flex",gap:7,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
 <button onClick={()=>setLeadFilter("all")} style={{background:leadFilter==="all"?pcGrad:"var(--surface)",borderRadius:24,padding:"8px 15px",border:`1px solid ${leadFilter==="all"?"transparent":"var(--line-2)"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit",fontSize:11,fontWeight:600,color:leadFilter==="all"?"var(--surface)":"var(--ink-2)",boxShadow:leadFilter==="all"?`0 6px 14px ${pcShadow}`:"var(--shadow-xs)",transition:"transform 0.12s"}}>הכל ({leads.length})</button>
              {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>setLeadFilter(leadFilter===key?"all":key)} style={{background:leadFilter===key?s.bg:"var(--surface)",borderRadius:24,padding:"8px 15px",border:`1px solid ${leadFilter===key?s.color:"var(--line-2)"}`,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit",fontSize:11,fontWeight:leadFilter===key?700:500,color:leadFilter===key?s.color:"var(--ink-2)",boxShadow:"var(--shadow-xs)",transition:"transform 0.12s"}}>{s.label} ({leads.filter(l=>l.status===key).length})</button>
              ))}
 </div>
 <div style={{position:"relative",marginBottom:12}}>
 <span style={{position:"absolute",top:"50%",right:14,transform:"translateY(-50%)",fontSize:12,color:"var(--ink-3)",pointerEvents:"none"}}>⌕</span>
 <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="חיפוש פנייה..." style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 36px 10px 14px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",boxShadow:"var(--shadow-xs)"}}/>
 </div>
            {/* Bulk WhatsApp by status — one send action per status group. Sends
                REAL messages, but only after the explicit confirm step in the
                modal below. Count on each pill = leads with a phone that will
                receive the message. */}
            {leads.length>0&&(
 <div className="glass-card" style={{padding:"14px 16px",marginBottom:14}}>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11,flexWrap:"wrap"}}>
 <span style={{width:30,height:30,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,background:"rgba(37,211,102,0.12)",color:"var(--success)"}}>✆</span>
 <p style={{fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>שליחת וואטסאפ לפי סטטוס</p>
 <span style={{fontSize:12,color:"var(--ink-3)"}}>המספר = פניות עם טלפון שיקבלו את ההודעה</span>
 </div>
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.entries(LEAD_STATUSES).map(([key,s])=>{
                  const withPhone=leads.filter(l=>l.status===key&&l.phone).length;
                  return(
 <button key={key} onClick={()=>openBulk(key)} disabled={withPhone===0} title={withPhone===0?"אין פניות עם טלפון בסטטוס זה":undefined} style={{padding:"7px 13px",border:"1px solid",borderColor:withPhone===0?"var(--line)":s.color,borderRadius:20,background:withPhone===0?"var(--surface-2)":s.bg,color:withPhone===0?"var(--ink-3)":s.color,fontSize:12.5,fontWeight:600,cursor:withPhone===0?"not-allowed":"pointer",fontFamily:"inherit",opacity:withPhone===0?0.65:1}}>{s.label} ({withPhone})</button>
                  );
                })}
 </div>
 </div>
            )}
            {filteredLeads.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:24,marginTop:6}}>
 <div style={{width:64,height:64,borderRadius:20,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>✦</div>
 <p style={{fontSize:15,fontWeight:700,color:"var(--ink)",marginBottom:5}}>{leadSearch||leadFilter!=="all"?"לא נמצאו פניות":"עוד אין פניות"}</p>
 <p style={{fontSize:12,color:"var(--ink-2)",maxWidth:320,margin:"0 auto 18px",lineHeight:1.6}}>{leadSearch||leadFilter!=="all"?"נסי לשנות את החיפוש או הסינון.":"פניות מהאתר ומפייסבוק יופיעו כאן. אפשר גם להוסיף פנייה ידנית."}</p>
 {!(leadSearch||leadFilter!=="all")&&<button className="empty-cta primary-btn" onClick={()=>{setEditingLead(null);setNewLead(emptyLead);setShowLeadModal(true);}} style={{background:pcGrad,color:"var(--surface)",padding:"11px 22px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ פנייה חדשה</button>}
 </div>
              ):filteredLeads.map(lead=>{
                const st=leadStatusMeta(lead.status);
                const hasReminder=lead.reminder_date&&lead.reminder_date<=tomorrow;
                return(
 <div key={lead.id} className="lead-row" role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת פרטי הפנייה ${lead.name}`} onClick={()=>setSelectedLead(lead)} style={{background:"var(--surface)",borderRadius:18,padding:"12px 15px",border:`1px solid ${hasReminder?"var(--warning)":"var(--line)"}`,display:"flex",alignItems:"center",gap:11,marginBottom:8,boxShadow:"var(--shadow-sm)"}}>
 <div style={{width:38,height:38,borderRadius:12,background:st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{SOURCE_ICONS[lead.source]||"✦"}</div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
 <p style={{fontWeight:700,fontSize:12.5,color:"var(--ink)",letterSpacing:"-0.01em"}}>{lead.name}</p>
 <span className="pill" style={{fontSize:10.5,background:st.bg,color:st.color,padding:"3px 8px"}}>{st.label}</span>
                        {hasReminder&&<span className="pill" style={{fontSize:10.5,background:"rgba(242,184,75,0.16)",color:"var(--warning)",padding:"3px 8px"}}>◴ תזכורת</span>}
 </div>
 <p style={{fontSize:12.5,color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lead.phone&&`${lead.phone} · `}{SOURCE_ICONS[lead.source]} {lead.source}{lead.service_interest&&` · ${lead.service_interest}`}{lead.last_contacted_at&&` · ✓ ${contactAgoHe(lead.last_contacted_at)}`}</p>
 </div>
                    {lead.phone&&<a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="wa-btn" style={{padding:"5px 9px",fontSize:12}}>✆</a>}
                    {lead.status!=="closed"&&lead.status!=="lost"&&lead.status!=="irrelevant"&&<button onClick={e=>{e.stopPropagation();handleConvertLead(lead);}} style={{background:"var(--success)",color:"var(--surface)",border:"none",borderRadius:20,padding:"5px 11px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600,flexShrink:0}}>המר ✓</button>}
 </div>
                );
              })}
 </div>
 </>)}

          {/* CASHIER */}
          {activeTab==="cashier"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
 <div>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>קופה וקבלות</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>תשלומים</h2>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button className="primary-btn" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"var(--surface)",padding:"10px 18px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ תשלום חדש</button>
 <button onClick={handleExportCSV} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:24,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>⇩ ייצוא Excel</button>
 </div>
 </div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:14,marginBottom:18}}>
 <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.4,ease:[0.2,0.7,0.3,1]}} className="stat-card" style={{background:"var(--surface)",borderRadius:20,padding:"18px 20px",border:"1px solid var(--line)",position:"relative",overflow:"hidden"}}>
 <div aria-hidden style={{position:"absolute",top:0,right:0,width:110,height:110,background:"radial-gradient(circle at 100% 0%, var(--pc-tint), transparent 70%)",pointerEvents:"none"}}/>
 <div style={{position:"relative",display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:pc,background:"var(--pc-tint)"}}>₪</span>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600}}>הכנסות החודש</p>
 </div>
 <p className="serif" style={{position:"relative",fontSize:26,fontWeight:600,color:pc,lineHeight:1}}>₪{thisMonthRevenue.toLocaleString()}</p>
 </motion.div>
              {paymentBreakdown.map((p,i)=>(
 <motion.div key={p.key} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.4,delay:0.05*(i+1),ease:[0.2,0.7,0.3,1]}} className="stat-card" style={{background:"var(--surface)",borderRadius:20,padding:"18px 20px",border:"1px solid var(--line)"}}>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"var(--surface-2)",border:"1px solid var(--line)"}}>{p.icon}</span>
 <p style={{fontSize:12.5,color:"var(--ink-3)",fontWeight:600}}>{p.key}</p>
 </div>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:"var(--ink)",lineHeight:1}}>₪{p.total.toLocaleString()}</p>
 <p style={{fontSize:12,color:"var(--ink-3)",marginTop:6}}>{p.count} עסקאות</p>
 </motion.div>
              ))}
 </div>

            {todayAppts.length>0&&(
 <div className="glass-card" style={{padding:"18px 20px",marginBottom:16}}>
 <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"var(--pc-tint)",color:pc}}>⚡</span>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>תורים היום — תשלום מהיר</h3>
 </div>
                {todayAppts.map(a=>{
                  const client=clients.find(c=>String(c.id)===String(a.client_id));
                  const paid=receipts.some(r=>String(r.appointment_id)===String(a.id));
                  return(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",background:paid?"rgba(70,179,123,0.08)":"var(--surface-2)",borderRadius:14,marginBottom:7,border:`1px solid ${paid?"rgba(70,179,123,0.35)":"var(--line)"}`,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:120}}>
 <p style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:12.5,color:"var(--ink-3)"}}>{a.service} · ₪{a.price}</p>
 </div>
                      {paid?<span className="pill" style={{fontSize:10.5,color:"var(--success)",background:"rgba(70,179,123,0.12)",padding:"4px 11px"}}>✓ שולם</span>
                        :<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                          {client?.phone&&PAYMENT_METHODS.slice(1).map(pm=>(
 <a key={pm.key} href={waPayment(client.phone,a.name,a.price,a.service,pm.key,settings.business_phone)} target="_blank" rel="noreferrer" title={pm.key}
                              style={{background:pm.color,color:"var(--surface)",border:"none",borderRadius:16,padding:"5px 9px",fontSize:12,cursor:"pointer",textDecoration:"none",fontWeight:600}}>{pm.icon}</a>
                          ))}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:16,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>₪ קופה</button>
 </div>
                      }
 </div>
                  );
                })}
 </div>
            )}

 <div className="glass-card" style={{padding:"18px 20px"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:10}}>
 <span style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:"var(--pc-tint)",color:pc}}>🧾</span>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>קבלות</h3>
 </div>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {["all",...PAYMENT_METHODS.map(p=>p.key)].map(m=>(
 <button key={m} onClick={()=>setReceiptFilter(m)} style={{background:receiptFilter===m?pcGrad:"var(--surface)",color:receiptFilter===m?"var(--surface)":"var(--ink-2)",border:`1px solid ${receiptFilter===m?"transparent":"var(--line-2)"}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:receiptFilter===m?`0 5px 12px ${pcShadow}`:"var(--shadow-xs)"}}>
                      {m==="all"?"הכל":m}
 </button>
                  ))}
 </div>
 </div>
              {filteredReceipts.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"46px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:22,marginTop:6}}>
 <div style={{width:60,height:60,borderRadius:19,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>🧾</div>
 <p style={{fontSize:15,fontWeight:700,color:"var(--ink)",marginBottom:5}}>{receiptFilter!=="all"?"אין קבלות בסינון הזה":"עוד אין קבלות"}</p>
 <p style={{fontSize:12,color:"var(--ink-2)",maxWidth:320,margin:"0 auto 18px",lineHeight:1.6}}>{receiptFilter!=="all"?"נסי לשנות את אופן התשלום בסינון.":"כל תשלום שתגבי יופיע כאן. אפשר לפתוח תשלום חדש עכשיו."}</p>
 {receiptFilter==="all"&&<button className="empty-cta primary-btn" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"var(--surface)",padding:"11px 22px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>✦ תשלום חדש</button>}
 </div>
              ):filteredReceipts.sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")).slice(0,20).map(r=>{
                const pm=PAYMENT_METHODS.find(p=>p.key===r.payment_method);
                const pmColor=pm?.color||DEFAULT_SERVICE_COLOR;
                return(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת קבלה — ${r.client_name||"לקוחה"}`} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 13px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:14,marginBottom:6,cursor:"pointer"}} className="client-row">
 <div style={{width:36,height:36,borderRadius:12,background:`linear-gradient(135deg,${lighten(pmColor,0.35)},${pmColor})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"var(--surface)",flexShrink:0,boxShadow:"var(--shadow-xs)"}}>
                      {pm?.icon||"₪"}
 </div>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{r.client_name}</p>
 <p style={{fontSize:12,color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.service} · {r.payment_method} · {r.created_at?.slice(0,10)}</p>
 </div>
 <p className="serif" style={{fontSize:15,fontWeight:600,color:pc}}>₪{r.amount}</p>
 </div>
                );
              })}
 </div>
 </div>
 </>)}

          {/* WHATSAPP CENTER */}
          {activeTab==="whatsapp"&&(()=>{
            // Safe business name for outgoing messages: never leak an empty name
            // or the legacy "העסק שלי" placeholder to real clients. When absent,
            // the message phrasing simply drops the business-name clause.
            const bizName=(settings.business_name||"").trim();
            const bizSafe=bizName&&bizName!=="העסק שלי"?bizName:"";
            const reminderTargets=tomorrowAppts.map(a=>{
              const cl=clients.find(c=>String(c.id)===String(a.client_id));
              return {clientId:a.client_id,name:a.name,phone:cl?.phone,
                message:`שלום ${a.name}! ✦\nתזכורת לתור מחר:\n${a.service}\nבשעה ${fmtApptTime(a)}\n\nמחכים לך! `};
            });
            const birthdayTargets=upcomingBirthdays.map(c=>{
              const b=new Date(c.birthday);const bd=new Date(now.getFullYear(),b.getMonth(),b.getDate());
              if(bd<now)bd.setFullYear(now.getFullYear()+1);
              const days=Math.floor((bd-now)/(1000*60*60*24));
              return {clientId:c.id,name:c.name,phone:c.phone,days,
                message:`שלום ${c.name}! \nיום הולדת שמח! \n${bizSafe?`מ${bizSafe} `:""}אנחנו שולחים לך ברכות חמות!\nלרגל היום המיוחד - 15% הנחה על הטיפול הבא שלך \nנחכה לך! ✦`};
            });
            const coldTargets=coldClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,days:getDaysSince(c.id),
              message:`שלום ${c.name}! \nמתגעגעים אלייך${bizSafe?` ב${bizSafe}`:""}!\nמזמן לא ראינו אותך — נשמח לפנק אותך בטיפול \nרוצה לקבוע תור? פשוט תכתבי לנו `}));
            const weekAgo=formatDate(new Date(now.getTime()-7*86400000));
            const reviewClientIds=[...new Set(appointments.filter(a=>a.date&&a.date>=weekAgo&&a.date<=today).map(a=>String(a.client_id)))];
            const reviewTargets=reviewClientIds.map(cid=>{
              const c=clients.find(cl=>String(cl.id)===cid);
              if(!c)return null;
              return {clientId:c.id,name:c.name,phone:c.phone,
                message:`שלום ${c.name}! \nתודה שביקרת אצלנו${bizSafe?` ב${bizSafe}`:""}!\nנשמח מאוד אם תשאירי לנו ביקורת \nזה לוקח רק דקה ועוזר לנו מאוד! `};
            }).filter(Boolean);

            const audienceClients=clients.filter(c=>{
              if(!c.phone)return false;
              if(waBroadcastAudience==="all")return true;
              if(waBroadcastAudience==="vip")return c.status==="VIP";
              if(waBroadcastAudience==="active")return getDaysSince(c.id)<=60;
              if(waBroadcastAudience==="cold")return getDaysSince(c.id)>60;
              return true;
            });

            const groups=[
              // Categorical: the four groups must stay distinguishable from one
              // another, so these are literal values rather than tokens.
              {key:"reminders",icon:"◴",title:"תזכורות לתורי מחר",color:"#E0913A",targets:reminderTargets,empty:"אין תורים מחר"},
              {key:"birthdays",icon:"🎀",title:"ברכות יום הולדת",color:pc,targets:birthdayTargets,empty:"אין ימי הולדת ב-30 הימים הקרובים"},
              {key:"cold",icon:"✦",title:"מטופלות להתחדשות (60+ יום)",color:"#5580C4",targets:coldTargets,empty:"כל המטופלות פעילות! "},
              {key:"review",icon:"⭐",title:"בקשת ביקורת (השבוע האחרון)",color:"#9C27B0",targets:reviewTargets,empty:"אין ביקורים בשבוע האחרון"},
            ];

            return(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>וואטסאפ</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>מרכז הודעות</h2>
 <p style={{fontSize:12,color:"var(--ink-2)",marginBottom:18}}>שליחת הודעות מוכנות ללקוחות — בלחיצה אחת</p>

 {/* Sub-tabs: the send tools, or the log of everything already sent. */}
 <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
 <div style={{display:"inline-flex",gap:3,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:15,padding:3}}>
 <button onClick={()=>setWaView("send")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,borderRadius:11,background:waView==="send"?pcGrad:"transparent",color:waView==="send"?"var(--surface)":"var(--ink-2)"}}>שליחת הודעות</button>
 <button onClick={()=>{setWaView("log");if(waMessages===null)loadWaMessages();}} className="primary-btn" style={{padding:"8px 20px",fontSize:12,borderRadius:11,background:waView==="log"?pcGrad:"transparent",color:waView==="log"?"var(--surface)":"var(--ink-2)"}}>יומן הודעות</button>
 </div>
 </div>

 {waView==="send"&&(<>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,marginBottom:16}}>
                {groups.map(g=>{
                  const withPhone=g.targets.filter(t=>t.phone);
                  return(
 <div key={g.key} className="glass-card card-flush">
 <div style={{background:lighten(g.color,0.86),padding:"13px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,borderBottom:"1px solid var(--line)"}}>
 <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
 <span style={{width:34,height:34,borderRadius:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:g.color,background:"rgba(255,255,255,0.7)"}}>{g.icon}</span>
 <div style={{minWidth:0}}>
 <p style={{fontSize:11.5,fontWeight:700,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.title}</p>
 <p style={{fontSize:9,color:g.color,fontWeight:700}}>{withPhone.length} נמענים</p>
 </div>
 </div>
                        {withPhone.length>0&&(
 <button onClick={()=>waSendGroup(g.targets)} className="wa-btn" style={{padding:"7px 12px",fontSize:10,flexShrink:0}}>✆ שליחה מרוכזת</button>
                        )}
 </div>
 <div style={{padding:"8px 12px",maxHeight:200,overflowY:"auto"}}>
                        {g.targets.length===0?<p style={{fontSize:10,color:"var(--ink-3)",padding:"8px 2px"}}>{g.empty}</p>
                          :g.targets.map((t,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 4px",borderBottom:i<g.targets.length-1?"1px solid var(--line)":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:10.5,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {waSentToday[t.clientId]&&<span style={{color:"var(--success)"}}>✓ </span>}{t.name}
 </p>
 <p style={{fontSize:8.5,color:"var(--ink-3)"}}>{t.phone||"אין טלפון"}{t.days!==undefined?` · ${t.days} ימים`:""}</p>
 </div>
                              {t.phone?(
 <button onClick={()=>waSendOne(t.clientId,t.phone,t.message)} className="wa-btn" style={{padding:"4px 10px",fontSize:9}}>שלחי</button>
                              ):<span style={{fontSize:8,color:"var(--ink-3)"}}>—</span>}
 </div>
                          ))}
 </div>
 </div>
                  );
                })}
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>שליחת הודעה לקבוצה</h3>
 <p style={{fontSize:9.5,color:"var(--ink-3)",fontWeight:600,marginBottom:7}}>בחרי קהל יעד</p>
 <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                  {[{k:"all",l:"כל המטופלות"},{k:"vip",l:"VIP"},{k:"active",l:"✓ פעילות"},{k:"cold",l:"להתחדשות"}].map(a=>(
 <button key={a.k} onClick={()=>setWaBroadcastAudience(a.k)} style={{padding:"7px 14px",border:`1px solid ${waBroadcastAudience===a.k?"transparent":"var(--line-2)"}`,borderRadius:20,background:waBroadcastAudience===a.k?pcGrad:"var(--surface)",color:waBroadcastAudience===a.k?"var(--surface)":"var(--ink-2)",fontSize:10.5,cursor:"pointer",fontFamily:"inherit",fontWeight:600,boxShadow:waBroadcastAudience===a.k?`0 5px 12px ${pcShadow}`:"var(--shadow-xs)"}}>{a.l}</button>
                  ))}
 </div>
 <textarea value={waBroadcastMsg} onChange={e=>setWaBroadcastMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה... למשל: שלום! החודש מבצע מיוחד — 20% הנחה על טיפולי פנים "
                  style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:14,padding:"11px 13px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:10}}/>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)"}}>{audienceClients.length} לקוחות עם טלפון בקבוצה זו</p>
 <button onClick={()=>{
                    if(!waBroadcastMsg.trim()){toast("נא לכתוב הודעה","error");return;}
                    waSendGroup(audienceClients.map(c=>({clientId:c.id,name:c.name,phone:c.phone,message:`שלום ${c.name}! ${waBroadcastMsg}`})));
                  }} className="wa-btn" style={{padding:"9px 18px",fontSize:11}}>✆ שלחי לקבוצה</button>
 </div>
 </div>

 <div className="glass-card" style={{padding:18}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>הודעה אישית למטופלת</h3>
 <div style={{position:"relative",marginBottom:10}}>
 <input value={waFreeSearch} onChange={e=>{setWaFreeSearch(e.target.value);if(!e.target.value)setWaFreeClient(null);}}
                    placeholder="חיפוש לקוחה לפי שם או טלפון..."
                    style={{width:"100%",border:`1px solid ${waFreeClient?"var(--success)":"var(--line-2)"}`,borderRadius:14,padding:"11px 13px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:waFreeClient?"rgba(70,179,123,0.07)":"var(--surface-2)"}}/>
                  {waFreeClient&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"var(--success)"}}>✓</span>}
                  {waFreeSearch.length>1&&!waFreeClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,boxShadow:"var(--shadow-lg)",zIndex:99,overflow:"hidden",marginTop:4,maxHeight:180,overflowY:"auto"}}>
                      {clients.filter(c=>c.name?.includes(waFreeSearch)||c.phone?.includes(waFreeSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setWaFreeClient(c);setWaFreeSearch(c.name);}} className="client-row" style={{padding:"10px 13px",borderBottom:"1px solid var(--line)",cursor:"pointer"}}>
 <p style={{fontSize:11.5,fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <p style={{fontSize:9,color:"var(--ink-3)"}}>{c.phone||"אין טלפון"}</p>
 </div>
                      ))}
 </div>
                  )}
 </div>
 <textarea value={waFreeMsg} onChange={e=>setWaFreeMsg(e.target.value)} rows={3}
                  placeholder="כתבי כאן את ההודעה..."
                  style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:14,padding:"11px 13px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:10}}/>
 <button onClick={()=>{
                  if(!waFreeClient){toast("נא לבחור לקוחה","error");return;}
                  if(!waFreeClient.phone){toast("אין טלפון ללקוחה זו","error");return;}
                  if(!waFreeMsg.trim()){toast("נא לכתוב הודעה","error");return;}
                  waSendOne(waFreeClient.id,waFreeClient.phone,waFreeMsg);
                  setWaFreeMsg("");
                }} className="wa-btn" style={{padding:"11px 16px",fontSize:11.5,width:"100%",justifyContent:"center"}}>✆ שלחי הודעה</button>
 </div>
 </>)}

 {/* Log of everything already sent, newest first. Read-only. */}
 {waView==="log"&&(<>
 <div className="glass-card" style={{padding:"16px 18px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <div>
 <p style={{fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>יומן הודעות</p>
 <p style={{fontSize:9.5,color:"var(--ink-3)",marginTop:2}}>100 ההודעות האחרונות שנשלחו מהמערכת בשמך.</p>
 </div>
 <button onClick={loadWaMessages} disabled={waLogLoading} className="primary-btn" style={{padding:"8px 18px",background:pcGrad,color:"var(--surface)",fontSize:11}}>{waLogLoading?"טוען...":"רענני"}</button>
 </div>

 {waLogError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:14,padding:"12px 16px",marginBottom:14}}>
 <p style={{fontSize:11.5,color:pc,fontWeight:600}}>{waLogError}</p>
 </div>
 )}

 {waLogLoading&&waMessages===null&&<p style={{fontSize:11.5,color:"var(--ink-3)",textAlign:"center",padding:"26px 0"}}>טוען...</p>}

 {!waLogLoading&&waMessages&&waMessages.length===0&&(
 <div className="glass-card" style={{padding:"36px 20px",textAlign:"center"}}>
 <p style={{fontSize:12,color:"var(--ink-3)"}}>עדיין לא נשלחו הודעות.</p>
 </div>
 )}

 {waMessages&&waMessages.length>0&&(
 <div className="glass-card card-flush" style={{overflow:"hidden"}}>
 {/* Horizontal scroll on narrow phones so the six columns never crush. */}
 <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
 <table style={{width:"100%",minWidth:640,borderCollapse:"collapse"}}>
 <thead>
 <tr style={{background:"var(--pc-tint)",textAlign:"right"}}>
                        {["שם","טלפון","סוג","סטטוס","תוכן","תאריך"].map(h=>(
 <th key={h} style={{padding:"11px 13px",fontSize:9.5,color:"var(--ink-3)",fontWeight:600}}>{h}</th>
                        ))}
 </tr>
 </thead>
 <tbody>
                      {waMessages.map((m,i)=>(
 <tr key={m.id||i} style={{borderTop:"1px solid var(--line)",background:i%2===0?"var(--surface)":"var(--surface-2)"}}>
 <td style={{padding:"10px 13px",fontSize:11.5,fontWeight:600,color:"var(--ink)"}}>{m.recipient_name||"—"}</td>
 <td style={{padding:"10px 13px",fontSize:11,color:"var(--ink-2)",whiteSpace:"nowrap"}}>{m.recipient_phone}</td>
 <td style={{padding:"10px 13px",fontSize:10}}><span className="pill" style={{background:"var(--pc-tint)",color:pc,padding:"3px 9px",fontWeight:600}}>{WA_TYPE_LABELS[m.message_type]||m.message_type}</span></td>
 <td style={{padding:"10px 13px",fontSize:10,fontWeight:700,whiteSpace:"nowrap",color:m.status==="sent"?"var(--success)":"var(--danger)"}}>{m.status==="sent"?"✓ נשלח":"✕ נכשל"}</td>
 <td style={{padding:"10px 13px",fontSize:11,color:"var(--ink-2)",maxWidth:300}}>{m.message_body}</td>
 <td style={{padding:"10px 13px",fontSize:9.5,color:"var(--ink-3)",whiteSpace:"nowrap"}}>{m.created_at?new Date(m.created_at).toLocaleString("he-IL"):""}</td>
 </tr>
                      ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </>)}
 </div>
 </>);
          })()}

          {/* CAMPAIGNS */}
          {activeTab==="campaigns"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>שיווק וצמיחה</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:16}}>שיווק</h2>

 <div style={{display:"inline-flex",gap:3,marginBottom:18,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:15,padding:4,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>setMarketingView("campaigns")} className="primary-btn" style={{padding:"8px 18px",fontSize:12,borderRadius:11,background:marketingView==="campaigns"?pcGrad:"transparent",color:marketingView==="campaigns"?"var(--surface)":"var(--ink-2)"}}>קמפיינים בפייסבוק</button>
 <button onClick={()=>{setMarketingView("ai");if(savedCampaigns===null)loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 18px",fontSize:12,borderRadius:11,background:marketingView==="ai"?pcGrad:"transparent",color:marketingView==="ai"?"var(--surface)":"var(--ink-2)"}}>תוכן AI</button>
 </div>

 {marketingView==="campaigns"&&(<>
 <div className="glass-card" style={{padding:18,marginBottom:16}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>קמפיינים בפייסבוק ואינסטגרם</h3>
 <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
 {fbPage?(
 <span title={fbPage.page_name} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,color:"var(--success)",background:"rgba(70,179,123,0.12)",borderRadius:20,padding:"6px 12px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>מחובר ✓ · {fbPage.page_name}</span>
 ):(
 <button onClick={()=>{window.location.href="/api/facebook/oauth/start";}} className="primary-btn" style={{padding:"7px 14px",background:"#1877F2",color:"#fff",fontSize:11}}>התחבר לפייסבוק</button>
 )}
 <select value={fbDatePreset} onChange={e=>{setFbDatePreset(e.target.value);loadFbCampaigns(e.target.value);}} style={{border:"1px solid var(--line)",borderRadius:20,padding:"6px 10px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:"var(--ink-2)"}}>
 <option value="today">היום</option>
 <option value="last_7d">7 ימים</option>
 <option value="last_30d">30 ימים</option>
 <option value="last_90d">90 ימים</option>
 </select>
 <button onClick={()=>loadFbCampaigns()} disabled={fbLoading} className="primary-btn" style={{padding:"7px 14px",background:pcGrad,color:"var(--surface)",fontSize:11}}>{fbLoading?"טוען...":fbCampaigns===null?"טעני קמפיינים":"רענני"}</button>
 </div>
 </div>

 {fbCampaigns===null&&!fbLoading&&!fbError&&(
 <p style={{fontSize:11,color:"var(--ink-2)",padding:"10px 0"}}>לחצי "טעני קמפיינים" כדי לראות את ביצועי המודעות שלך בפייסבוק ואינסטגרם — הוצאה, לידים, ומחיר לליד.</p>
 )}

 {fbError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:12,padding:"11px 14px"}}>
 <p style={{fontSize:11,color:pc,fontWeight:600,marginBottom:3}}>לא ניתן לטעון כרגע</p>
 <p style={{fontSize:10,color:"var(--ink-2)"}}>{fbError}</p>
 </div>
 )}

 {fbTotals&&fbCampaigns&&fbCampaigns.length>0&&(
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:14}}>
 <div style={{background:"var(--surface-2)",borderRadius:14,padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>סה״כ הוצאה</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:pc}}>₪{Math.round(fbTotals.spend).toLocaleString()}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:14,padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>לידים</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)"}}>{fbTotals.leads}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:14,padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>מחיר לליד</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:pc}}>{fbTotals.cpl?`₪${fbTotals.cpl}`:"—"}</p>
 </div>
 <div style={{background:"var(--surface-2)",borderRadius:14,padding:"13px 15px",border:"1px solid var(--line)"}}>
 <p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>חשיפות</p>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)"}}>{fbTotals.impressions.toLocaleString()}</p>
 </div>
 </div>
 )}

 {fbCampaigns&&fbCampaigns.length>0&&fbCampaigns.map(c=>(
 <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:14,marginBottom:7,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:140}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
 <p style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{c.name}</p>
 <span className="pill" style={{fontSize:8,padding:"2px 8px",background:c.status==="ACTIVE"?"rgba(70,179,123,0.14)":"var(--line)",color:c.status==="ACTIVE"?"var(--success)":"var(--ink-3)"}}>{c.status==="ACTIVE"?"פעיל":"מושהה"}</span>
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",marginTop:2}}>{c.impressions.toLocaleString()} חשיפות · {c.clicks} קליקים</p>
 </div>
 <div style={{textAlign:"center",minWidth:60}}>
 <p style={{fontSize:8,color:"var(--ink-3)"}}>הוצאה</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>₪{Math.round(c.spend).toLocaleString()}</p>
 </div>
 <div style={{textAlign:"center",minWidth:45}}>
 <p style={{fontSize:8,color:"var(--ink-3)"}}>לידים</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{c.leads}</p>
 </div>
 <div style={{textAlign:"center",minWidth:55}}>
 <p style={{fontSize:8,color:"var(--ink-3)"}}>לליד</p>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>{c.cpl?`₪${c.cpl}`:"—"}</p>
 </div>
 </div>
 ))}

 {fbCampaigns&&fbCampaigns.length===0&&!fbError&&(
 <p style={{fontSize:11,color:"var(--ink-2)",padding:"8px 0"}}>לא נמצאו קמפיינים בטווח הזמן הזה.</p>
 )}
 </div>

 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:16}}>
              {[
                {label:"סה״כ לידים",value:leads.length,icon:"✉"},
                {label:"הומרו",value:convertedLeads.length,icon:"✓"},
                {label:"המרה",value:`${conversionRate}%`,icon:"↗"},
                {label:"הכנסות מלידים",value:`₪${campaignStats.reduce((s,c)=>s+c.revenue,0).toLocaleString()}`,icon:"₪"},
              ].map((s,i)=>(
 <div key={i} className="stat-card" style={{background:"var(--surface)",borderRadius:18,padding:"16px 16px",border:`1px solid var(--line)`}}>
 <span style={{display:"inline-flex",width:30,height:30,borderRadius:9,alignItems:"center",justifyContent:"center",fontSize:14,color:pc,background:"var(--pc-tint)",marginBottom:8}}>{s.icon}</span>
 <p style={{fontSize:9.5,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>{s.label}</p>
 <p className="serif" style={{fontSize:21,fontWeight:600,color:pc}}>{s.value}</p>
 </div>
              ))}
 </div>
 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:14}}>ביצועים לפי מקור</h3>
              {campaignStats.length===0?<p style={{color:"var(--ink-3)",fontSize:11}}>אין נתונים עדיין</p>
                :campaignStats.map((s,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 12px",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:14,marginBottom:6}}>
 <span style={{fontSize:16,flexShrink:0}}>{s.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11.5,fontWeight:700,color:"var(--ink)"}}>{s.source}</p>
 <div style={{display:"flex",gap:8,marginTop:2,flexWrap:"wrap"}}>
 <span style={{fontSize:8.5,color:"var(--ink-3)"}}>{s.total} לידים</span>
 <span style={{fontSize:8.5,color:"var(--success)"}}>{s.converted} הומרו</span>
 <span style={{fontSize:8.5,color:pc,fontWeight:700}}>{s.rate}%</span>
 </div>
 <div style={{background:"var(--line)",borderRadius:4,height:5,marginTop:5,overflow:"hidden"}}>
 <div style={{background:pcGrad,borderRadius:4,height:5,width:`${s.rate}%`}}/>
 </div>
 </div>
 <p className="serif" style={{fontSize:14,fontWeight:600,color:pc}}>₪{s.revenue.toLocaleString()}</p>
 </div>
                ))}
 </div>
 </>)}

 {marketingView==="ai"&&(<>
 <div style={{textAlign:"center",marginBottom:18}}>
 <h2 className="serif" style={{fontSize:26,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:6}}>תוכן AI</h2>
 <p style={{fontSize:12.5,color:"var(--ink-2)"}}>פוסטים מוכנים, קמפיינים שמורים, ורילסים — הכל במקום אחד</p>
 </div>

 <div style={{display:"flex",justifyContent:"center",marginBottom:22}}>
 <div style={{display:"inline-flex",gap:3,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:15,padding:4,boxShadow:"var(--shadow-xs)",flexWrap:"wrap",justifyContent:"center"}}>
 <button onClick={()=>setAiPostsView("create")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,borderRadius:11,background:aiPostsView==="create"?pcGrad:"transparent",color:aiPostsView==="create"?"var(--surface)":"var(--ink-2)"}}>יצירת פוסטים</button>
 <button onClick={()=>{setAiPostsView("saved");loadSavedCampaigns();}} className="primary-btn" style={{padding:"8px 20px",fontSize:12,borderRadius:11,background:aiPostsView==="saved"?pcGrad:"transparent",color:aiPostsView==="saved"?"var(--surface)":"var(--ink-2)"}}>הקמפיינים שלי{savedCampaigns&&savedCampaigns.length>0?` (${savedCampaigns.length})`:""}</button>
 <button onClick={()=>setAiPostsView("reels")} className="primary-btn" style={{padding:"8px 20px",fontSize:12,borderRadius:11,background:aiPostsView==="reels"?pcGrad:"transparent",color:aiPostsView==="reels"?"var(--surface)":"var(--ink-2)"}}>🎬 רילסים</button>
 </div>
 </div>

 {aiPostsView==="create"&&(<>
 <div className="glass-card" style={{padding:"22px 24px",marginBottom:18}}>
 <p style={{fontSize:11,color:"var(--ink-3)",fontWeight:600,marginBottom:8}}>מה תרצי לפרסם?</p>
 <textarea value={postGoal} onChange={e=>setPostGoal(e.target.value)} rows={3}
 placeholder="לדוגמה: מבצע על טיפולי פנים לחודש הקרוב / להחזיר לקוחות שלא הגיעו מזמן"
 style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:14,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:12}}/>
 <button onClick={generatePosts} disabled={postLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:pcGrad,color:"var(--surface)",fontSize:14}}>
 {postLoading?"יוצרת פוסטים... ✦":"✦ צרי לי 5 פוסטים"}
 </button>
 </div>

 {postError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:11.5,color:pc,fontWeight:600}}>{postError}</p>
 </div>
 )}

 {postLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:13,color:pc,fontWeight:500}}>ה-AI בונה אסטרטגיה וכותב 5 וריאציות... רגע אחד ✦</p>
 </div>
 )}

 {postStrategy&&!postLoading&&(
 <div style={{background:pcTint,borderRadius:18,padding:"18px 22px",marginBottom:18}}>
 <p style={{fontSize:11,color:pc,fontWeight:700,marginBottom:6}}>האסטרטגיה של ה-AI</p>
 <p style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.6,marginBottom:8}}>{postStrategy.strategy}</p>
 {postStrategy.keyPoints&&postStrategy.keyPoints.length>0&&(
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
 {postStrategy.keyPoints.map((kp,i)=>(
 <span key={i} style={{fontSize:9.5,background:"rgba(255,255,255,0.7)",color:pc,padding:"3px 10px",borderRadius:20,fontWeight:500}}>{kp}</span>
 ))}
 </div>
 )}
 </div>
 )}

 {postVariations&&postVariations.length>0&&postVariations.map((v,i)=>(
 <div key={i} className="glass-card card-flush" style={{marginBottom:14}}>
 {v.image&&v.image.url&&(
 <div style={{position:"relative"}}>
 <img alt="" src={v.image.url} style={{width:"100%",height:200,objectFit:"cover",objectPosition:"center",display:"block"}}/>
 {v.image.photographerName&&(
 <span style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,0.45)",color:"var(--surface)",fontSize:8,padding:"2px 7px",borderRadius:10}}>
 {/* Unsplash terms require the photographer name to link to their profile.
     This is the pre-save preview, so the field is the in-memory camelCase
     photographerUrl rather than the persisted image_credit_url column. */}
 צילום: {v.image.photographerUrl?<a href={v.image.photographerUrl} target="_blank" rel="noopener noreferrer" style={{color:"var(--surface)",textDecoration:"underline"}}>{v.image.photographerName}</a>:v.image.photographerName}
 </span>
 )}
 </div>
 )}
 <div style={{padding:"20px 22px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span className="serif" style={{fontSize:22,fontWeight:600,color:pc}}>{i+1}</span>
 <span style={{fontSize:9,background:"var(--pc-tint)",color:pc,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{({emotional:"רגשי",educational:"חינוכי",urgency:"דחיפות",social_proof:"המלצות",engaging_question:"שאלה מעוררת"})[v.variationType]||v.variationType}</span>
 </div>
 <button onClick={()=>copyPost(v)} className="primary-btn" style={{padding:"6px 14px",background:pcGrad,color:"var(--surface)",fontSize:10}}>העתיקי</button>
 </div>
 {v.title&&<p className="serif" style={{fontSize:16,fontWeight:600,color:"var(--ink)",marginBottom:6}}>{v.title}</p>}
 <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.65,whiteSpace:"pre-wrap",marginBottom:10}}>{v.body}</p>
 {v.callToAction&&<p style={{fontSize:12.5,color:pc,fontWeight:600,marginBottom:8}}>{v.callToAction}</p>}
 {v.hashtags&&v.hashtags.length>0&&(
 <p style={{fontSize:11,color:"var(--ink-2)"}}>{v.hashtags.join(" ")}</p>
 )}
 <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>
 <button onClick={()=>shareToFacebook(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"#1877F2",color:"#fff",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>שיתוף לפייסבוק</button>
 <button onClick={()=>copyPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:"var(--surface)",color:pc,border:"1px solid var(--line)",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>העתקת טקסט</button>
 <button onClick={()=>setDesignPost(v)} style={{flex:"1 1 auto",padding:"8px 12px",background:pcGrad,color:"var(--surface)",border:"none",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🎨 עצבי כתמונה</button>
 {v.image&&v.image.url&&<button onClick={()=>downloadImage(v.image.url,v.variationNumber)} style={{flex:"1 1 auto",padding:"8px 12px",background:"var(--surface)",color:pc,border:"1px solid var(--line)",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הורדת תמונה</button>}
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",marginTop:6}}>לאינסטגרם: הורידי את התמונה והדביקי את הטקסט</p>
 </div>
 </div>
 ))}

 {postVariations&&postVariations.length===0&&!postError&&(
 <p style={{fontSize:12,color:"var(--ink-2)",textAlign:"center",padding:"20px 0"}}>לא נוצרו פוסטים. נסי שוב עם תיאור אחר.</p>
 )}

 {postVariations&&postVariations.length>0&&(
 <button onClick={saveCampaign} disabled={savingCampaign} className="primary-btn" style={{width:"100%",padding:"12px 0",background:"var(--surface)",color:pc,border:`1.5px solid ${pc}`,fontSize:13,marginBottom:8}}>
 {savingCampaign?"שומרת...":"✦ שמרי את הקמפיין הזה"}
 </button>
 )}

 <div className="glass-card" style={{padding:"22px 24px",marginTop:24}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>קבוצות פייסבוק לפרסום</h3>
 <button onClick={loadGroups} disabled={groupsLoading} className="primary-btn" style={{padding:"7px 14px",background:pcGrad,color:"var(--surface)",fontSize:11}}>{groupsLoading?"מחפשת...":groups===null?"הציעי לי קבוצות":"רענני"}</button>
 </div>
 <p style={{fontSize:11,color:"var(--ink-2)",marginBottom:groups?14:0}}>קבוצות שכדאי לחפש ולהצטרף אליהן כדי לפרסם בהן</p>
 {groupsError&&<p style={{fontSize:11,color:pc,fontWeight:600,marginTop:10}}>{groupsError}</p>}
 {groups&&groups.length>0&&groups.map((g,i)=>(
 <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 0",borderBottom:i<groups.length-1?"1px solid var(--surface-2)":"none"}}>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>{g.name}</p>
 <span style={{fontSize:8.5,background:"var(--pc-tint)",color:pc,padding:"2px 8px",borderRadius:20,fontWeight:500}}>{g.category}</span>
 </div>
 <p style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.5}}>{g.reasoning}</p>
 </div>
 <a href={`https://www.facebook.com/search/groups/?q=${encodeURIComponent(g.name)}`} target="_blank" rel="noreferrer" className="wa-btn" style={{background:"#5580C4",padding:"5px 10px",fontSize:9,whiteSpace:"nowrap"}}>חפשי</a>
 </div>
 ))}
 </div>
 </>)}

 {aiPostsView==="saved"&&(<>
 {savedCampaigns===null&&<p style={{fontSize:12,color:"var(--ink-2)",textAlign:"center",padding:"30px 0"}}>טוען...</p>}
 {savedCampaigns&&savedCampaigns.length===0&&(
 <div className="pop-in" style={{background:"var(--grad-hero)",borderRadius:22,padding:"46px 20px",textAlign:"center",border:"1px solid var(--line)"}}>
 <div style={{width:56,height:56,borderRadius:18,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>✦</div>
 <p style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:5}}>עדיין לא שמרת קמפיינים</p>
 <p style={{fontSize:11.5,color:"var(--ink-3)"}}>צרי פוסטים בלשונית "יצירת פוסטים" ולחצי "שמרי את הקמפיין"</p>
 </div>
 )}
 {savedCampaigns&&savedCampaigns.length>0&&savedCampaigns.map(c=>(
 <div key={c.id} className="glass-card card-flush" style={{marginBottom:14}}>
 <div style={{background:"var(--pc-tint)",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,borderBottom:"1px solid var(--line)"}}>
 <div style={{flex:1,minWidth:0}}>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"var(--ink)"}}>{c.name||c.goal}</p>
 <p style={{fontSize:10,color:"var(--ink-2)",marginTop:2}}>{c.created_at?new Date(c.created_at).toLocaleDateString("he-IL"):""} · {(c.posts||[]).length} פוסטים</p>
 </div>
 <button onClick={()=>deleteCampaign(c.id)} className="primary-btn" style={{padding:"5px 12px",background:"var(--surface)",color:"var(--danger)",border:"1px solid rgba(224,91,111,0.10)",fontSize:10}}>מחקי</button>
 </div>
 <div style={{padding:"14px 18px"}}>
 {c.ai_strategy&&<p style={{fontSize:11.5,color:"var(--ink-2)",lineHeight:1.6,marginBottom:12}}>{c.ai_strategy}</p>}
 {(c.posts||[]).map((p,i)=>(
 <div key={i} style={{borderTop:i>0?"1px solid var(--surface-2)":"none",padding:"10px 0"}}>
 {/* Saved list is a preview, so prefer the thumbnail and fall back to the
     full image. Skipped entirely when the post has no image. */}
 {(p.image_thumb_url||p.image_url)&&(
 <div style={{position:"relative",borderRadius:12,overflow:"hidden",marginBottom:8}}>
 <img alt={p.image_alt||p.title||""} src={p.image_thumb_url||p.image_url} style={{width:"100%",height:140,objectFit:"cover",objectPosition:"center",display:"block"}}/>
 {p.image_credit_name&&(
 <span style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,0.45)",color:"var(--surface)",fontSize:8,padding:"2px 7px",borderRadius:10}}>
 {/* Unsplash terms require the photographer name to link to their profile. */}
 צילום: {p.image_credit_url?<a href={p.image_credit_url} target="_blank" rel="noopener noreferrer" style={{color:"var(--surface)",textDecoration:"underline"}}>{p.image_credit_name}</a>:p.image_credit_name}
 </span>
 )}
 </div>
 )}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:6}}>
 {p.title&&<p style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{p.title}</p>}
 <button onClick={()=>copyPost({body:p.body,callToAction:p.call_to_action,hashtags:p.hashtags})} className="primary-btn" style={{padding:"4px 10px",background:pcGrad,color:"var(--surface)",fontSize:9,flexShrink:0}}>העתיקי</button>
 </div>
 <p style={{fontSize:12,color:"var(--ink)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>
 {p.call_to_action&&<p style={{fontSize:11.5,color:pc,fontWeight:600,marginTop:4}}>{p.call_to_action}</p>}
 {p.hashtags&&p.hashtags.length>0&&<p style={{fontSize:10,color:"var(--ink-2)",marginTop:4}}>{p.hashtags.join(" ")}</p>}
 </div>
 ))}
 </div>
 </div>
 ))}
 </>)}

 {aiPostsView==="reels"&&(<>
 <div className="glass-card" style={{padding:"22px 24px",marginBottom:18}}>
 <p style={{fontSize:11,color:"var(--ink-3)",fontWeight:600,marginBottom:8}}>על מה הרילס?</p>
 <textarea value={reelTopic} onChange={e=>setReelTopic(e.target.value)} rows={3}
 placeholder="לדוגמה: טיפול פנים לכלות / 3 טיפים לעור זוהר / למה כדאי לעשות פילינג באביב"
 style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:14,padding:"12px 14px",fontSize:13,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none",marginBottom:12}}/>
 <button onClick={generateReel} disabled={reelLoading} className="primary-btn" style={{width:"100%",padding:"13px 0",background:pcGrad,color:"var(--surface)",fontSize:14}}>
 {reelLoading?"יוצרת רילס... 🎬":"🎬 צרי לי רילס"}
 </button>
 </div>

 {reelError&&(
 <div style={{background:"var(--surface-2)",border:"1px solid rgba(242,184,75,0.16)",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
 <p style={{fontSize:11.5,color:pc,fontWeight:600}}>{reelError}</p>
 </div>
 )}

 {reelLoading&&(
 <div style={{textAlign:"center",padding:"30px 0"}}>
 <p style={{fontSize:13,color:pc,fontWeight:500}}>ה-AI כותב לך תסריט, הוראות צילום והכל... רגע אחד 🎬</p>
 </div>
 )}

 {reelData&&!reelLoading&&(<div className="fade-in">
 <div style={{background:pcGrad,borderRadius:18,padding:"20px 22px",marginBottom:14,color:"var(--surface)",textAlign:"center"}}>
 <p style={{fontSize:10,opacity:0.85,fontWeight:600,marginBottom:4}}>כותרת לכריכה</p>
 <p className="serif" style={{fontSize:24,fontWeight:700,marginBottom:8}}>{reelData.cover_title}</p>
 <p style={{fontSize:12,opacity:0.95}}>{reelData.hook}</p>
 </div>

 <button onClick={()=>{
   const lines=[];
   if(reelData.cover_title)lines.push("כותרת: "+reelData.cover_title);
   if(reelData.hook)lines.push("פתיחה: "+reelData.hook);
   lines.push("");
   (reelData.scenes||[]).forEach((sc,i)=>{
     lines.push("סצנה "+(sc.scene_number||i+1)+(sc.seconds?" ("+sc.seconds+" שניות)":""));
     if(sc.spoken)lines.push("🗣️ "+sc.spoken);
     if(sc.on_screen_text)lines.push("📱 "+sc.on_screen_text);
     if(sc.filming)lines.push("🎥 "+sc.filming);
     lines.push("");
   });
   if(reelData.call_to_action)lines.push("📣 "+reelData.call_to_action);
   if(reelData.caption)lines.push("","תיאור: "+reelData.caption);
   if(reelData.hashtags&&reelData.hashtags.length>0)lines.push(reelData.hashtags.join(" "));
   if(reelData.music_vibe)lines.push("","🎵 "+reelData.music_vibe);
   navigator.clipboard.writeText(lines.join("\n")).then(()=>toast("הרילס המלא הועתק")).catch(()=>toast("לא ניתן להעתיק","error"));
 }} className="primary-btn" style={{width:"100%",padding:"11px 0",background:"var(--surface)",color:pc,border:`1.5px solid ${pc}`,fontSize:12.5,marginBottom:14}}>📋 העתיקי את כל הרילס</button>

 {reelData.scenes&&reelData.scenes.length>0&&reelData.scenes.map((sc,i)=>(
 <div key={i} style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--line)",padding:"16px 18px",marginBottom:10,position:"relative",overflow:"hidden",boxShadow:"var(--shadow-sm)"}}>
 <div style={{position:"absolute",top:0,right:0,width:4,bottom:0,background:pcGrad}}/>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
 <span className="serif" style={{fontSize:20,fontWeight:700,color:pc}}>{sc.scene_number||i+1}</span>
 <span className="pill" style={{fontSize:9,background:"var(--pc-tint)",color:pcDeep,padding:"3px 10px"}}>סצנה{sc.seconds?` · ${sc.seconds} שניות`:""}</span>
 </div>
 <p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:2}}>🗣️ מה אומרים</p>
 <p style={{fontSize:13,color:"var(--ink)",lineHeight:1.6,marginBottom:8}}>{sc.spoken}</p>
 {sc.on_screen_text&&(<><p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:2}}>📱 טקסט על המסך</p><p style={{fontSize:12,color:"var(--ink)",lineHeight:1.5,marginBottom:8}}>{sc.on_screen_text}</p></>)}
 {sc.filming&&(<><p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:2}}>🎥 איך לצלם</p><p style={{fontSize:12,color:"var(--ink-2)",lineHeight:1.5}}>{sc.filming}</p></>)}
 </div>
 ))}

 {reelData.call_to_action&&(<div style={{background:"var(--pc-tint)",borderRadius:14,padding:"14px 18px",marginBottom:10}}><p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>📣 קריאה לפעולה (בסוף הרילס)</p><p style={{fontSize:13,color:pcDeep,fontWeight:600}}>{reelData.call_to_action}</p></div>)}

 {reelData.caption&&(<div style={{background:"var(--surface)",borderRadius:14,border:"1px solid var(--line)",padding:"14px 18px",marginBottom:10,boxShadow:"var(--shadow-sm)"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600}}>✍️ תיאור לפוסט</p><button onClick={()=>{navigator.clipboard.writeText(`${reelData.caption}\n\n${(reelData.hashtags||[]).join(" ")}`);toast("התיאור הועתק");}} className="primary-btn" style={{padding:"4px 12px",background:pcGrad,color:"var(--surface)",fontSize:9}}>העתיקי</button></div><p style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{reelData.caption}</p>{reelData.hashtags&&reelData.hashtags.length>0&&<p style={{fontSize:11,color:"var(--ink-3)",marginTop:8}}>{reelData.hashtags.join(" ")}</p>}</div>)}

 {reelData.music_vibe&&(<div style={{background:"var(--surface)",borderRadius:14,border:"1px solid var(--line)",padding:"12px 18px",marginBottom:10,boxShadow:"var(--shadow-sm)"}}><p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:2}}>🎵 סגנון מוזיקה מומלץ</p><p style={{fontSize:12.5,color:"var(--ink)"}}>{reelData.music_vibe}</p></div>)}
 </div>)}
 </>)}
 </>)}
 </div>
 </>)}

          {/* TAX REPORTS */}
          {activeTab==="tax"&&(()=>{
            const status = settings.business_tax_status || "exempt";
            const statusLabel = status==="exempt"?"עוסק פטור":status==="licensed"?"עוסק מורשה":"חברה בע\"מ";
            const years = Array.from({length:4},(_,i)=>(new Date().getFullYear())-i);
            const inYear = receipts.filter(r=>r.created_at && new Date(r.created_at).getFullYear()===taxYear);
            let periodReceipts, rangeLabel;
            if(status==="exempt"){
              periodReceipts=inYear; rangeLabel=`שנת ${taxYear}`;
            } else if(taxPeriodMode==="monthly"){
              periodReceipts=inYear.filter(r=>new Date(r.created_at).getMonth()===taxPeriodIdx);
              rangeLabel=`${MONTHS_HE[taxPeriodIdx]} ${taxYear}`;
            } else {
              periodReceipts=inYear.filter(r=>Math.floor(new Date(r.created_at).getMonth()/2)===taxPeriodIdx);
              rangeLabel=`${MONTHS_HE[taxPeriodIdx*2]}–${MONTHS_HE[taxPeriodIdx*2+1]} ${taxYear}`;
            }
            const gross=periodReceipts.reduce((s,r)=>s+(Number(r.amount)||0),0);
            const net=gross/(1+VAT_RATE);
            const vatDue=gross*VAT_RATE/(1+VAT_RATE);
            const count=periodReceipts.length;
            // Expenses filtered to the SAME period (by expense_date) — used for the
            // list below and for input VAT (step C). expense_date is "YYYY-MM-DD".
            const exYear=(e)=>Number((e.expense_date||"").slice(0,4));
            const exMonth=(e)=>Number((e.expense_date||"").slice(5,7))-1;
            const periodExpenses = status==="exempt" ? []
              : taxPeriodMode==="monthly"
                ? expenses.filter(e=>exYear(e)===taxYear && exMonth(e)===taxPeriodIdx)
                : expenses.filter(e=>exYear(e)===taxYear && Math.floor(exMonth(e)/2)===taxPeriodIdx);
            const expensesTotal = periodExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
            // Input VAT extracted from expenses (same formula as output VAT).
            const inputVat = expensesTotal*VAT_RATE/(1+VAT_RATE);
            const finalVat = vatDue - inputVat;      // output VAT minus input VAT
            const isRefund = finalVat < 0;           // negative => refund from the authority
            const nis=(x)=>`₪${Math.round(x).toLocaleString()}`;
            const Stat=({label,value,big,gold})=>(
 <div style={{flex:1,minWidth:120,background:gold?"var(--pc-tint)":"var(--surface-2)",border:`1px solid ${gold?pc:"var(--line)"}`,borderRadius:16,padding:"16px 14px",textAlign:"center"}}>
 <p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:7,letterSpacing:"0.3px"}}>{label}</p>
 <p className="serif" style={{fontSize:big?30:22,fontWeight:600,color:gold?pcDeep:"var(--ink)",lineHeight:1}}>{value}</p>
 </div>
            );
            return (
 <div style={{maxWidth:720,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{textAlign:"center",marginBottom:6}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.04em",marginBottom:4}}>ניהול פיננסי</p>
 <h2 className="serif" style={{fontSize:26,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>דוחות מס</h2>
 </div>
 <p style={{textAlign:"center",fontSize:11.5,color:"var(--ink-2)",marginBottom:16}}>סטטוס העסק: <b style={{color:pcDeep}}>{statusLabel}</b> · ניתן לשנות בהגדרות</p>

                {/* CONTROLS */}
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:14}}>
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {years.map(y=>(
 <button key={y} onClick={()=>setTaxYear(y)} style={{padding:"7px 15px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:taxYear===y?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:taxYear===y?"var(--pc-tint)":"var(--surface)",color:taxYear===y?pcDeep:"var(--ink-2)",boxShadow:"var(--shadow-xs)"}}>{y}</button>
                    ))}
 </div>
 </div>
                {status!=="exempt"&&(
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center",marginBottom:16}}>
 <div style={{display:"flex",gap:3,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:20,padding:4,boxShadow:"var(--shadow-xs)"}}>
 <button onClick={()=>{setTaxPeriodMode("bimonthly");setTaxPeriodIdx(Math.floor(new Date().getMonth()/2));}} style={{padding:"6px 13px",borderRadius:16,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="bimonthly"?pcGrad:"transparent",color:taxPeriodMode==="bimonthly"?"var(--surface)":"var(--ink-2)"}}>דו-חודשי</button>
 <button onClick={()=>{setTaxPeriodMode("monthly");setTaxPeriodIdx(new Date().getMonth());}} style={{padding:"6px 13px",borderRadius:16,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="monthly"?pcGrad:"transparent",color:taxPeriodMode==="monthly"?"var(--surface)":"var(--ink-2)"}}>חודשי</button>
 </div>
 <select value={taxPeriodIdx} onChange={e=>setTaxPeriodIdx(Number(e.target.value))} style={{border:"1px solid var(--line-2)",borderRadius:20,padding:"8px 13px",fontSize:11.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
                      {taxPeriodMode==="monthly"
                        ? MONTHS_HE.map((m,i)=><option key={i} value={i}>{m}</option>)
                        : Array.from({length:6},(_,i)=><option key={i} value={i}>{MONTHS_HE[i*2]}–{MONTHS_HE[i*2+1]}</option>)}
 </select>
 </div>
                )}

                {/* PRINT / PDF */}
 <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
 <button onClick={()=>window.print()} className="primary-btn" style={{background:pcGrad,color:"var(--surface)",padding:"10px 22px",fontSize:12.5,display:"inline-flex",alignItems:"center",gap:8}}>
 <svg viewBox="0 0 24 24" width="16" height="16" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
                    הורד PDF / הדפס
 </button>
 </div>

                {/* REPORT CARD */}
 <div id="tax-report" style={{background:"var(--surface)",borderRadius:22,border:"1px solid var(--line)",boxShadow:"var(--shadow-md)",padding:"26px 24px"}}>
 <div style={{textAlign:"center",marginBottom:18}}>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{settings.business_name||"העסק"} — {statusLabel}</p>
 <p style={{fontSize:12,color:"var(--ink-2)",marginTop:3}}>תקופת הדיווח: {rangeLabel}</p>
 </div>
                  {status==="exempt"?(
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <Stat label={"מחזור שנתי (ללא מע\"מ)"} value={nis(gross)} big gold/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
                  ):(
 <>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
 <Stat label={"מחזור ברוטו (כולל מע\"מ)"} value={nis(gross)}/>
 <Stat label={"מחזור נטו (לפני מע\"מ)"} value={nis(net)}/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        <Stat label={`מס עסקאות (מע\"מ ${Math.round(VAT_RATE*100)}%)`} value={nis(vatDue)}/>
 <Stat label="מס תשומות (על הוצאות)" value={nis(inputVat)}/>
 <Stat label={isRefund?"החזר מע\"מ":"מע\"מ סופי לתשלום"} value={nis(Math.abs(finalVat))} big gold/>
 </div>
 <p style={{fontSize:10.5,color:"var(--ink-3)",marginTop:14,lineHeight:1.6,textAlign:"center"}}>{`מע"מ סופי = מס עסקאות (מהמכירות) פחות מס תשומות (חילוץ ה-${Math.round(VAT_RATE*100)}% מסך ההוצאות שנרשמו לתקופה). ${isRefund?"התוצאה שלילית — כלומר מגיע לך החזר מע\"מ מהרשויות.":"זהו הסכום לתשלום לרשויות בגין התקופה."}`}</p>
 </>
                  )}

                  {/* LEGAL DISCLAIMER */}
 <div style={{marginTop:20,padding:"12px 14px",background:"rgba(242,184,75,0.12)",border:"1px solid rgba(242,184,75,0.35)",borderRadius:12}}>
 <p style={{fontSize:10.5,color:"var(--warning)",lineHeight:1.6,textAlign:"center"}}>⚠️ {TAX_DISCLAIMER}</p>
 </div>
 </div>

                {/* EXPENSES (licensed/company only) — outside #tax-report so it stays out of the PDF */}
                {status!=="exempt"&&(
 <div style={{marginTop:22}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>הוצאות העסק — {rangeLabel}</h3>
 <p style={{fontSize:10.5,color:"var(--ink-2)",marginBottom:12}}>הוצאות (כולל מע"מ) משמשות לחישוב מס התשומות. ההוצאות מסוננות לתקופת הדוח שנבחרה למעלה.</p>

                    {/* ADD FORM */}
 <div className="glass-card" style={{padding:"14px 16px",marginBottom:12}}>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
 <div style={{flex:"1 1 110px"}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>סכום (כולל מע"מ)</p><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/></div>
 <div style={{flex:"1 1 130px"}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>תאריך</p><input type="date" value={newExpense.expense_date} onChange={e=>setNewExpense({...newExpense,expense_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:"2 1 160px"}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>תיאור</p><input value={newExpense.description} onChange={e=>setNewExpense({...newExpense,description:e.target.value})} placeholder="למשל: חומרים מספק" style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 </div>
 <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
 <span style={{fontSize:9,color:"var(--ink-3)",fontWeight:600}}>קטגוריה:</span>
                        {EXPENSE_CATEGORIES.map(cat=>{
                          const sel=newExpense.category===cat.k;
                          return <button key={cat.k} onClick={()=>setNewExpense({...newExpense,category:cat.k})} style={{padding:"5px 12px",borderRadius:16,fontSize:10.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:sel?pcDeep:"var(--ink-2)"}}>{cat.l}</button>;
                        })}
 <button onClick={handleAddExpense} disabled={isBusy("addExpense")} className="primary-btn" style={{marginRight:"auto",background:pcGrad,color:"var(--surface)",padding:"8px 18px",fontSize:12}}>{isBusy("addExpense")?"מוסיף...":"✦ הוסף הוצאה"}</button>
 </div>
 </div>

                    {/* LIST */}
                    {periodExpenses.length===0?(
 <p style={{fontSize:11,color:"var(--ink-3)",textAlign:"center",padding:"14px 0"}}>אין הוצאות בתקופה זו</p>
                    ):(<>
                      {[...periodExpenses].sort((a,b)=>String(b.expense_date||"").localeCompare(String(a.expense_date||""))).map(exp=>{
                        const catL=EXPENSE_CATEGORIES.find(c=>c.k===exp.category)?.l||"אחר";
                        return (
 <div key={exp.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:13,padding:"10px 13px",marginBottom:6,boxShadow:"var(--shadow-xs)"}}>
 <span style={{fontSize:10,color:"var(--ink-3)",width:74,flexShrink:0}}>{exp.expense_date}</span>
 <span className="pill" style={{fontSize:8,background:"var(--pc-tint)",color:pcDeep,padding:"2px 9px",flexShrink:0}}>{catL}</span>
 <span style={{flex:1,minWidth:0,fontSize:11.5,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{exp.description||"—"}</span>
 <span className="serif" style={{fontSize:14,fontWeight:600,color:"var(--ink)",flexShrink:0}}>{nis(Number(exp.amount)||0)}</span>
 <button onClick={()=>handleDeleteExpense(exp)} aria-label="מחיקת הוצאה" style={{background:"none",border:"none",color:"var(--danger)",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>✕</button>
 </div>
                        );
                      })}
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 13px",marginTop:5,background:"var(--pc-tint)",borderRadius:13}}>
 <span style={{fontSize:11.5,fontWeight:600,color:"var(--ink-2)"}}>סך הוצאות בתקופה ({periodExpenses.length})</span>
 <span className="serif" style={{fontSize:18,fontWeight:600,color:pcDeep}}>{nis(expensesTotal)}</span>
 </div>
                    </>)}
 </div>
                )}
 </div>
            );
          })()}

          {/* AI BUSINESS ADVISOR */}
          {activeTab==="advisor"&&(
 <div style={{maxWidth:840,marginLeft:"auto",marginRight:"auto",display:"flex",flexDirection:"column",height:"100%"}}>
 <div style={{textAlign:"center",marginBottom:6}}>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.04em",marginBottom:4}}>בינה מלאכותית</p>
 <h2 className="serif" style={{fontSize:26,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>יועץ עסקי AI</h2>
 </div>
 <p style={{textAlign:"center",fontSize:11.5,color:"var(--ink-2)",marginBottom:16}}>יועצת אישית שמכירה את הנתונים של {settings.business_name||"העסק שלך"} — שאלי כל שאלה עסקית</p>

 <div id="advisor-scroll" className="glass-card" style={{flex:1,overflowY:"auto",padding:"18px 18px",display:"flex",flexDirection:"column",gap:12,minHeight:300}}>
              {advisorMessages===null?(
 <p style={{textAlign:"center",color:"var(--ink-3)",fontSize:11.5,margin:"auto"}}>טוען…</p>
              ):advisorMessages.length===0?(
 <div className="pop-in" style={{margin:"auto",textAlign:"center",padding:"20px",maxWidth:460}}>
 <div style={{width:60,height:60,borderRadius:19,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,color:"var(--surface)",background:pcGrad,boxShadow:`0 10px 24px ${pcShadow}`}}>✦</div>
 <p style={{fontSize:16,fontWeight:700,color:"var(--ink)",marginBottom:6}}>איך אפשר לעזור לעסק שלך היום?</p>
 <p style={{fontSize:11.5,color:"var(--ink-2)",lineHeight:1.6,marginBottom:16}}>היועצת רואה את הנתונים האמיתיים שלך — לקוחות, הכנסות, שירותים ולידים — ונותנת פתרונות ותוכניות עבודה. נסי אחת מהשאלות:</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
                    {["איך אחזיר לקוחות רדומות?","איך אעלה את ההכנסות החודש?","מה כדאי לתמחר מחדש?","רעיון לקמפיין לחודש חלש"].map(q=>(
 <button key={q} className="empty-cta" onClick={()=>setAdvisorInput(q)} style={{background:"var(--pc-tint)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:20,padding:"9px 15px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
                    ))}
 </div>
 </div>
              ):advisorMessages.map(m=>(
 <div key={m.id} style={{alignSelf:m.role==="user"?"flex-start":"flex-end",maxWidth:"82%",background:m.role==="user"?pcGrad:"var(--surface-2)",color:m.role==="user"?"var(--surface)":"var(--ink)",border:m.role==="user"?"none":"1px solid var(--line)",borderRadius:m.role==="user"?"16px 16px 16px 4px":"16px 16px 4px 16px",padding:"12px 15px",fontSize:12.5,lineHeight:1.65,whiteSpace:"pre-wrap",boxShadow:m.role==="user"?`0 6px 14px ${pcShadow}`:"var(--shadow-xs)"}}>
                    {m.content}
                    {m.role!=="user"&&(()=>{const a=advisorAction(m.content);return a?(
 <button onClick={a.run} className="primary-btn" style={{display:"inline-block",marginTop:10,background:pcGrad,color:"var(--surface)",fontSize:11,fontWeight:600,padding:"8px 15px",borderRadius:12}}>← {a.label}</button>
                    ):null;})()}
 </div>
              ))}
              {advisorSending&&(
 <div style={{alignSelf:"flex-end",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"16px 16px 4px 16px",padding:"11px 16px",fontSize:12,color:"var(--ink-2)"}}>היועצת חושבת…</div>
              )}
 </div>

 <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:12}}>
 {/* The advisor is a paid AI write action, so read-only mode disables the
     input itself and states why, rather than letting her type a question
     that the server would refuse with a 402. */}
 <textarea value={advisorInput} onChange={e=>setAdvisorInput(e.target.value)} disabled={readOnly} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAdvisor();}}} placeholder={readOnly?READ_ONLY_BADGE_HE:"כתבי שאלה עסקית… (Enter לשליחה)"} rows={1} style={{flex:1,border:"1px solid var(--line-2)",borderRadius:16,padding:"12px 14px",fontSize:12.5,fontFamily:"inherit",outline:"none",direction:"rtl",background:readOnly?"var(--surface-2)":"var(--surface)",resize:"none",maxHeight:120,boxShadow:"var(--shadow-xs)",opacity:readOnly?0.6:1,cursor:readOnly?"not-allowed":"auto"}}/>
 <button onClick={sendAdvisor} disabled={readOnly||advisorSending||!advisorInput.trim()} title={readOnly?DISABLED_REASON_HE:undefined} className="primary-btn" style={{background:pcGrad,color:"var(--surface)",padding:"12px 22px",fontSize:12.5,boxShadow:`0 8px 18px ${pcShadow}`,opacity:readOnly?0.5:1,cursor:readOnly?"not-allowed":"pointer"}}>{advisorSending?"…":"שליחה"}</button>
 </div>
 </div>
          )}

          {/* COMMUNITY */}
          {activeTab==="community"&&(<>
 <div style={{maxWidth:760,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:8}}>
 <div>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>מרחב לקוחות</p>
 <h2 className="serif" style={{fontSize:23,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>מרחב הלקוחות</h2>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginTop:2}}>פרסמי עדכונים, מבצעים וטיפים — הלקוחות שלך רואות הכל במקום אחד.</p>
 </div>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>copyPublicLink("community")} style={{padding:"9px 15px",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>העתקת קישור לקהילה</button>
 <button onClick={()=>{setNewPost({title:"",body:"",post_type:"update",cta_label:"",image_url:""});setShowPostModal(true);}} className="primary-btn" style={{padding:"10px 16px",background:pcGrad,color:"var(--surface)",fontSize:11.5,boxShadow:`0 8px 18px ${pcShadow}`}}>+ פוסט חדש</button>
 </div>
 </div>

 {communityLoading?(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {[0,1].map(i=><div key={i} style={{background:"var(--surface)",borderRadius:18,overflow:"hidden",border:"1px solid var(--line)",boxShadow:"var(--shadow-sm)"}}><div className="skel" style={{width:"100%",height:150,borderRadius:0}}/><div style={{padding:"14px 16px"}}><div className="skel" style={{width:90,height:14,marginBottom:9}}/><div className="skel" style={{width:"60%",height:16,marginBottom:7}}/><div className="skel" style={{width:"100%",height:12,marginBottom:5}}/><div className="skel" style={{width:"80%",height:12}}/></div></div>)}
 </div>
 )
 :communityPosts.length===0?(
 <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:24,marginTop:14}}>
 <div style={{width:60,height:60,borderRadius:19,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>💜</div>
 <p style={{fontSize:15,fontWeight:700,color:"var(--ink)",marginBottom:5}}>עוד אין פוסטים</p>
 <p style={{fontSize:12,color:"var(--ink-2)",maxWidth:360,margin:"0 auto",lineHeight:1.6}}>פרסמי את הפוסט הראשון — מבצע, טיפ, או עדכון — והלקוחות שלך יראו אותו במרחב הלקוחות.</p>
 </div>
 ):(
 <div style={{display:"flex",flexDirection:"column",gap:13,marginTop:14}}>
 {communityPosts.map(p=>(
 <div key={p.id} className="glass-card card-flush">
 {p.image_url&&<img alt="" src={p.image_url} style={{width:"100%",maxHeight:280,objectFit:"cover",objectPosition:"center",display:"block"}}/>}
 <div style={{padding:"14px 16px"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
 <span className="pill" style={{fontSize:9.5,color:"var(--surface)",background:p.post_type==="offer"?pc:p.post_type==="tip"?"var(--success)":"var(--ink-3)",padding:"3px 10px"}}>{p.post_type==="offer"?"מבצע":p.post_type==="tip"?"טיפ":"עדכון"}</span>
 <span style={{fontSize:9,color:"var(--ink-3)"}}>{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
 </div>
 {p.title&&<p style={{fontSize:14.5,fontWeight:700,color:"var(--ink)",marginBottom:4}}>{p.title}</p>}
 {p.body&&<p style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.body}</p>}
 {p.cta_label&&<div style={{marginTop:10}}><span style={{display:"inline-block",padding:"7px 16px",background:pcGrad,color:"var(--surface)",fontSize:11,fontWeight:600,borderRadius:20}}>{p.cta_label}</span></div>}
 <div style={{display:"flex",justifyContent:"flex-start",marginTop:10}}>
 <button onClick={()=>deleteCommunityPost(p.id)} style={{background:"none",border:"none",color:"var(--ink-3)",fontSize:10.5,cursor:"pointer",fontFamily:"inherit"}}>מחיקה</button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </>)}

          {/* PROTOCOLS */}
          {activeTab==="protocols"&&(<>
            <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
                <div>
                  <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>ספריית טיפולים</p>
                  <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>פרוטוקולי טיפול</h2>
                  <p style={{fontSize:11.5,color:"var(--ink-2)",marginTop:2}}>ספריית הטיפולים שלך לפי מותג ובעיה.</p>
                </div>
                <button onClick={()=>{setNewProtocol(emptyProtocol);setShowProtocolModal(true);}} className="primary-btn" style={{padding:"10px 16px",background:pcGrad,color:"var(--surface)",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>+ פרוטוקול חדש</button>
              </div>
              {protocolsLoading?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>{[0,1,2].map(i=><div key={i} className="skel" style={{width:"100%",height:74,borderRadius:16}}/>)}</div>
              ):protocols.length===0?(
                <div className="pop-in" style={{textAlign:"center",padding:"52px 20px",background:"var(--grad-hero)",border:"1px solid var(--line)",borderRadius:24}}>
                  <div style={{width:60,height:60,borderRadius:19,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,background:"var(--surface)",boxShadow:"var(--shadow-md)"}}>📋</div>
                  <p style={{fontSize:15,fontWeight:700,color:"var(--ink)",marginBottom:5}}>עוד אין פרוטוקולים</p>
                  <p style={{fontSize:12,color:"var(--ink-2)"}}>צרי פרוטוקול ראשון כדי לבנות את ספריית הטיפולים שלך.</p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {protocols.map(pr=>(
                    <div key={pr.id} className="glass-card" style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                        <div>
                          <span className="pill" style={{fontSize:9.5,color:pcDeep,background:"var(--pc-tint)",padding:"3px 10px"}}>{pr.brand}</span>
                          <h3 style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginTop:6}}>{pr.name}</h3>
                          {pr.concern&&<p style={{fontSize:11,color:"var(--ink-2)",marginTop:2}}>{pr.concern}</p>}
                        </div>
                        <div style={{textAlign:"left",fontSize:10,color:"var(--ink-3)"}}>
                          {pr.sessions_count?<div>{pr.sessions_count} מפגשים</div>:null}
                          {pr.price?<div style={{fontWeight:700,color:"var(--ink)",fontSize:13}}>₪{pr.price}</div>:null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}

          {/* PACKAGES */}
          {activeTab==="packages"&&(<>
 <div style={{maxWidth:1180,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:7}}>
 <div>
 <p style={{fontSize:10.5,color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.02em",marginBottom:3}}>מנויים וחבילות</p>
 <h2 className="serif" style={{fontSize:24,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>מנויי טיפולים</h2>
 </div>
 <div style={{display:"flex",gap:6}}>
 <button className="primary-btn" onClick={()=>setShowPackageModal(true)} style={{background:pcGrad,color:"var(--surface)",padding:"10px 16px",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`}}>+ חבילה חדשה</button>
 <button onClick={()=>setShowWaitlistModal(true)} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:24,padding:"10px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--shadow-xs)"}}>רשימת המתנה</button>
 </div>
 </div>

 <div className="glass-card" style={{padding:18,marginBottom:14}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>חבילות פעילות ({packages.filter(p=>p.active).length})</h3>
              {packages.filter(p=>p.active).length===0?<p style={{color:"var(--ink-3)",fontSize:11}}>אין חבילות פעילות</p>
                :packages.filter(p=>p.active).map(pkg=>(
 <div key={pkg.id} style={{background:"var(--surface-2)",borderRadius:14,padding:"13px 15px",marginBottom:8,border:"1px solid var(--line)"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9,flexWrap:"wrap",gap:5}}>
 <div>
 <p style={{fontSize:12,fontWeight:700,color:"var(--ink)"}}>{pkg.client_name}</p>
 <p style={{fontSize:10,color:"var(--ink-3)"}}>{pkg.service} · ₪{pkg.price}</p>
 </div>
 <button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:20,padding:"6px 12px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        ✓ השתמשי
 </button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:5}}>
                      {Array.from({length:Number(pkg.total_sessions)},(_,i)=>(
 <div key={i} style={{flex:1,height:8,borderRadius:4,background:i<Number(pkg.used_sessions)?pcGrad:"var(--line)"}}/>
                      ))}
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)"}}>{pkg.used_sessions}/{pkg.total_sessions} טיפולים · נותרו {Number(pkg.total_sessions)-Number(pkg.used_sessions)}</p>
 </div>
                ))}
 </div>

 <div className="glass-card" style={{padding:18}}>
 <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:12}}>רשימת המתנה ({waitlist.filter(w=>w.status==="waiting").length})</h3>
              {waitlist.filter(w=>w.status==="waiting").length===0?<p style={{color:"var(--ink-3)",fontSize:11}}>אין ממתינות</p>
                :waitlist.filter(w=>w.status==="waiting").map(w=>(
 <div key={w.id} style={{background:"var(--surface-2)",borderRadius:14,padding:"11px 14px",marginBottom:6,border:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8}}>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:11,fontWeight:600,color:"var(--ink)"}}>{w.client_name}</p>
 <p style={{fontSize:9,color:"var(--ink-3)"}}>{w.service}{w.preferred_date&&` · ${w.preferred_date}`}</p>
 </div>
                    {w.phone&&<a href={waLink(w.phone)} target="_blank" rel="noreferrer" className="wa-btn" style={{padding:"5px 10px",fontSize:9}}>✆</a>}
 </div>
                ))}
 </div>
 </div>
 </>)}
 </div>
 </main>
 </div>

      {/* APPT MODAL */}
      {showModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>{setShowModal(false);setEditingAppointmentId(null);}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:24,width:360,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:14}}>{editingAppointmentId?"עריכת תור":"קביעת תור חדש"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clients.length>0&&<select value={newAppt.clientId} onChange={e=>handleClientSelect(e.target.value)} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">— בחרי לקוחה קיימת —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}</select>}
 <input value={newAppt.name} onChange={e=>setNewAppt({...newAppt,name:e.target.value,clientId:""})} placeholder="או הזיני שם מטופלת חדשה" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>תאריך</p><input type="date" value={newAppt.date} onChange={e=>setNewAppt({...newAppt,date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>שעה</p>{apptDayHours?(<select value={apptEffectiveStart} onChange={e=>setNewAppt({...newAppt,startMinute:Number(e.target.value),hour:Math.floor(Number(e.target.value)/60)})} style={{width:"100%",border:apptSelectedTaken?"1.5px solid var(--danger)":"1px solid var(--line-2)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:apptSelectedTaken?"rgba(224,91,111,0.08)":"var(--surface-2)",color:apptSelectedTaken?"var(--danger)":"inherit",fontWeight:apptSelectedTaken?700:400}}>{apptSlotOptions.map(m=>{const taken=slotIsTaken(m);return <option key={m} value={m} disabled={taken} style={taken?{color:"#E05B6F",fontWeight:700}:{color:"var(--ink)",fontWeight:400}}>{fmtTime(m)}{taken?" ⛔ תפוס":""}</option>;})}</select>):(<div style={{border:"1px solid var(--line-2)",borderRadius:12,padding:"8px 10px",fontSize:10.5,color:"var(--danger)",background:"var(--surface-2)",textAlign:"center",fontWeight:600}}>סגור ביום זה</div>)}</div>
 </div>
 <select value={newAppt.service} onChange={e=>handleServiceSelect(e.target.value)} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}>
 <option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price} ({s.duration}′)</option>)}
 </select>
 <div style={{display:"flex",gap:4}}>{[30,45,60,90].map(d=><button key={d} onClick={()=>setNewAppt({...newAppt,duration:d})} style={{flex:1,padding:"8px 0",border:"1px solid",borderColor:newAppt.duration===d?"transparent":"var(--line-2)",borderRadius:12,background:newAppt.duration===d?pcGrad:"var(--surface)",color:newAppt.duration===d?"var(--surface)":"var(--ink-2)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{d}′</button>)}</div>
              {apptDayHours&&<p style={{fontSize:11,color:apptSelectedTaken?"var(--danger)":pcDeep,fontWeight:600,textAlign:"center",background:apptSelectedTaken?"rgba(224,91,111,0.08)":"var(--pc-tint)",borderRadius:10,padding:"6px 0",margin:"1px 0"}}>⏱ {fmtHM(apptStartMin)}–{fmtHM(apptEndMin)} · {Number(newAppt.duration||0)} דקות</p>}
              {apptSelectedTaken&&<p style={{fontSize:11.5,color:"var(--surface)",fontWeight:700,textAlign:"center",background:"var(--danger)",borderRadius:10,padding:"7px 0",margin:"1px 0",boxShadow:"0 4px 10px rgba(224,91,111,0.35)"}}>⛔ השעה תפוסה — בחרי שעה אחרת</p>}
 <input type="number" value={newAppt.price||""} onChange={e=>setNewAppt({...newAppt,price:e.target.value})} placeholder="₪ מחיר" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"var(--surface-2)",textAlign:"right"}}/>
 <textarea value={apptNote} onChange={e=>setApptNote(e.target.value)} placeholder="הערה" rows={2} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>{setShowModal(false);setEditingAppointmentId(null);}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSave} disabled={isBusy("saveAppt")||!apptDayHours||apptSelectedTaken} className="primary-btn" style={{flex:2,padding:"11px 0",background:apptSelectedTaken?"var(--danger)":pcGrad,color:"var(--surface)",fontSize:12,boxShadow:`0 8px 18px ${pcShadow}`,opacity:(apptDayHours&&!apptSelectedTaken)?1:0.6,cursor:(apptDayHours&&!apptSelectedTaken)?undefined:"not-allowed"}}>{isBusy("saveAppt")?"שומר...":!apptDayHours?"סגור ביום זה":apptSelectedTaken?"⛔ השעה תפוסה":editingAppointmentId?"עדכון ✓":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* IMPORT HUB — the same chooser as the Settings tab, as a modal. This is
          where onboarding lands via /?import=1, so both routes reach one
          screen rather than two lookalikes. */}
      {/* z-index 1050, above the Settings modal (1000) rather than level with it.
          Both import entry points are launched from Settings - the chooser tab
          and the "ייבוא מחירון" button - and at an equal z-index the later
          element in the DOM wins, which is Settings. The hub was opening
          instantly and rendering underneath it, so it only became visible once
          Settings was dismissed. Kept low enough that the confirm dialog (4000)
          and the drawers still come out on top. */}
      {showImportHub&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1050,padding:14}} onClick={()=>setShowImportHub(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:24,width:440,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <p className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:6}}>ייבוא נתונים</p>
 <p style={{fontSize:12,color:"var(--ink-2)",lineHeight:1.7,marginBottom:16}}>עוברת מתוכנה אחרת? אפשר להעביר את הנתונים לכאן בכמה דקות, בלי להקליד הכל מחדש. בחרי מה להעביר:</p>
                {renderImportChooser()}
 <button onClick={()=>setShowImportHub(false)} style={{width:"100%",marginTop:14,padding:"11px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:12,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>אולי מאוחר יותר</button>
 </div>
 </div>
      )}

      {/* 1060 - one step above the hub, so picking a kind visibly replaces it
          rather than appearing behind it, and above Settings for the same
          reason as the hub. */}
      {showImportModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1060,padding:14}} onClick={()=>setShowImportModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:24,width:420,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <p className="serif" style={{fontSize:19,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:6}}>{importSpec.title}</p>

 {/* ---------- STAGE 1: PASTE ---------- */}
 {importStage==="paste"&&(<>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:14,lineHeight:1.6}}>{importSpec.blurb}</p>

 {importTarget==="clients"&&(<><button onClick={pickFromContacts} style={{width:"100%",padding:"11px 0",background:"var(--pc-tint)",color:pcDeep,border:"1px dashed var(--pc)",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6}}>📇 בחירה מאנשי הקשר בטלפון</button>
 <p style={{fontSize:9,color:"var(--ink-3)",marginBottom:14,textAlign:"center"}}>(עובד בעיקר בטלפונים אנדרואיד. באייפון/מחשב — השתמשי בהדבקה למטה)</p></>)}

 <p style={{fontSize:10,color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>{importSpec.rowLabel}</p>
 <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={7} placeholder={importSpec.placeholder} style={{width:"100%",padding:"11px 13px",borderRadius:12,border:"1px solid var(--line-2)",background:"var(--surface-2)",fontSize:12.5,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box",resize:"vertical",direction:"rtl",outline:"none"}}/>

 {importText.trim()&&(()=>{ const g=parseImportGrid(importText); return (
 <p style={{fontSize:10.5,color:"var(--success)",fontWeight:600,marginBottom:12}}>זוהו {g.rows.length} שורות ו-{g.width} עמודות</p>
 );})()}

 <div style={{display:"flex",gap:8}}>
 <button onClick={goToImportMapping} disabled={!importText.trim()} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13,opacity:importText.trim()?1:0.5,boxShadow:`0 8px 18px ${pcShadow}`}}>המשך להתאמת עמודות ←</button>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </>)}

 {/* ---------- STAGE 2: MAP COLUMNS ---------- */}
 {importStage==="map"&&(()=>{
   const grid = parseImportGrid(importText);
   const preview = (importHasHeader?grid.rows.slice(1):grid.rows).slice(0,5);
   const built = importBuilder(grid, importCols, importHasHeader);
   // Every target needs a name column; appointments also need a date, since a
   // booking with no date cannot be placed on the calendar at all.
   const missing = importSpec.requires.filter(f => !importCols.includes(f));
   const hasName = missing.length === 0;
   const missingLabels = missing.map(f => importFields.find(x=>x.id===f)?.label || f).join(" ו-");
   // How many people in this paste we have never seen, so she knows before
   // pressing the button that clients will be created too.
   const newClientCount = importTarget!=="appts" ? 0 : (()=>{
     const have = new Set(clients.map(c=>String(c.phone||"").replace(/\D/g,"")).filter(Boolean));
     const s = new Set();
     built.rows.forEach(r=>{ const k=String(r.phone||"").replace(/\D/g,""); if(k&&!have.has(k)) s.add(k); });
     return s.size;
   })();
   return (<>
 <p style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>בחרי מה כל עמודה מייצגת. ניחשנו עבורך — אפשר לשנות.{importTarget==="appts"&&<> תאריכים נקראים כ<strong>יום/חודש/שנה</strong>.</>}</p>

 <label style={{display:"flex",alignItems:"center",gap:7,fontSize:11.5,color:"var(--ink-2)",marginBottom:12,cursor:"pointer"}}>
 <input type="checkbox" checked={importHasHeader} onChange={e=>{const h=e.target.checked;setImportHasHeader(h);setImportCols(importGuesser(grid.rows,h));}}/>
   השורה הראשונה היא כותרות (לא לקוחה)
 </label>

 <div style={{overflowX:"auto",border:"1px solid var(--line)",borderRadius:12,marginBottom:12}}>
 <table style={{borderCollapse:"collapse",width:"100%",minWidth:Math.max(320,grid.width*130)}}>
 <thead>
 <tr>
   {Array.from({length:grid.width}).map((_,i)=>(
 <th key={i} style={{padding:"8px 6px",background:"var(--pc-tint)",borderBottom:"1px solid var(--line)"}}>
 <select value={importCols[i]||"ignore"} onChange={e=>{const n=importCols.slice();n[i]=e.target.value;setImportCols(n);}}
         style={{width:"100%",fontSize:11,fontFamily:"inherit",padding:"5px 4px",borderRadius:8,border:`1px solid ${importCols[i]&&importCols[i]!=="ignore"?pc:"var(--line-2)"}`,background:"var(--surface)",color:"var(--ink)",outline:"none"}}>
     {importFields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
 </select>
 {importHasHeader&&<p style={{fontSize:9,color:"var(--ink-3)",marginTop:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{grid.rows[0][i]||"—"}</p>}
 </th>
   ))}
 </tr>
 </thead>
 <tbody>
   {preview.map((r,ri)=>(
 <tr key={ri} style={{background:ri%2?"var(--surface-2)":"var(--surface)"}}>
     {r.map((cell,ci)=>(
 <td key={ci} style={{padding:"7px 8px",fontSize:11,color:importCols[ci]&&importCols[ci]!=="ignore"?"var(--ink)":"var(--ink-3)",borderTop:"1px solid var(--line)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{cell||"—"}</td>
     ))}
 </tr>
   ))}
 </tbody>
 </table>
 </div>

 {!hasName
   ?<p style={{fontSize:11,color:"var(--danger)",fontWeight:600,marginBottom:12}}>יש לבחור עמודה בתור «{missingLabels}» כדי להמשיך.</p>
   :<p style={{fontSize:11,color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>
      <strong style={{color:pcDeep}}>{built.rows.length} {importSpec.unit} ייווצרו</strong>
      {newClientCount>0&&<> · {newClientCount} לקוחות חדשות ייווצרו גם</>}
      {built.past>0&&<> · {built.past} דולגו — תאריך שכבר עבר</>}
      {built.noDate>0&&<> · {built.noDate} דולגו — תאריך לא ברור</>}
      {built.noName>0&&<> · {built.noName} ידולגו (ללא שם)</>}
      {built.nameIsService>0&&<> · {built.nameIsService} ידולגו (שם הלקוחה הוא שם טיפול)</>}
      {preview.length<(importHasHeader?grid.rows.length-1:grid.rows.length)&&<> · מוצגות 5 שורות ראשונות</>}
    </p>}

 {/* The rounding warning that stood here is gone: the schema stores minutes
     now, so 14:30 imports as 14:30 and there is nothing left to warn about. */}
 {/* Loud, not a footnote: this almost always means the name column is
     pointing at the wrong column, so the whole import is about to be wrong. */}
 {hasName&&built.nameIsService>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
 <p style={{fontSize:11,color:"var(--danger)",fontWeight:700,marginBottom:3}}>⚠ {built.nameIsService} שורות ידולגו — שם הלקוחה הוא שם של טיפול</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.6}}>נראה שעמודת «שם הלקוחה» מצביעה על עמודת הטיפולים. בדקי את ההתאמה למעלה — אחרת ייווצרו לקוחות עם שם של טיפול.</p>
 {built.nameIsServiceSamples.length>0&&<p style={{fontSize:10,color:"var(--ink-3)",marginTop:4}}>{built.nameIsServiceSamples.join("   ·   ")}</p>}
 </div>
 )}
 {hasName&&built.noTime>0&&(
 <p style={{fontSize:10.5,color:"var(--ink-2)",marginBottom:12,lineHeight:1.6}}>· {built.noTime} תורים ללא שעה קריאה — ייקבעו ל-9:00 ואפשר להזיז אותם ביומן.</p>
 )}

 <div style={{display:"flex",gap:8}}>
 <button onClick={importTarget==="appts"?importAppointments:importTarget==="services"?importServices:importContacts} disabled={importing||!hasName||built.rows.length===0} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13,opacity:(importing||!hasName||built.rows.length===0)?0.5:1,boxShadow:`0 8px 18px ${pcShadow}`}}>{importing?"מייבא...":`ייבוא ${built.rows.length} ${importSpec.unit}`}</button>
 <button onClick={()=>setImportStage("paste")} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>→ חזרה</button>
 </div>
 </>);
 })()}

 {/* ---------- STAGE 3: RESULT ---------- */}
 {importStage==="done"&&importResult&&(<>
 <div style={{textAlign:"center",padding:"10px 0 16px"}}>
 <p className="serif" style={{fontSize:26,fontWeight:700,color:pcDeep,marginBottom:4}}>{importResult.added}</p>
 <p style={{fontSize:12.5,color:"var(--ink-2)"}}>{importSpec.unit} נוספו</p>
 </div>
 <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
   {importResult.newClients>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.newClients} לקוחות חדשות נוצרו מהתורים</p>}
   {importResult.past>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.past} דולגו — תאריך שכבר עבר (היסטוריה לא מיובאת)</p>}
   {importResult.noTime>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.noTime} נקבעו ל-9:00 (שעה לא קריאה)</p>}
   {importResult.noDate>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.noDate} דולגו — תאריך לא ברור</p>}
   {importResult.dupes>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.dupes} דולגו — כבר קיימות אצלך (זוהו לפי טלפון)</p>}
   {/* Not the same as a duplicate, and not in grey: these are real future
       bookings that were NOT imported because the slot was already busy. She
       has to place them by hand, so the line has to be impossible to skim past. */}
   {importResult.overlapping>0&&<p style={{fontSize:11.5,color:"var(--danger)",fontWeight:600}}>· {importResult.overlapping} דולגו — השעה כבר תפוסה ביומן. יש לקבוע אותן ידנית</p>}
   {importResult.noName>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.noName} דולגו — ללא שם</p>}
   {importResult.nameIsService>0&&<p style={{fontSize:11.5,color:"var(--ink-2)"}}>· {importResult.nameIsService} דולגו — שם הלקוחה היה שם של טיפול</p>}
   {importResult.failed>0&&(
 <div style={{background:"rgba(224,91,111,0.10)",border:"1px solid var(--danger)",borderRadius:12,padding:"10px 12px"}}>
 <p style={{fontSize:11.5,color:"var(--danger)",fontWeight:700,marginBottom:3}}>{importResult.failed} לא נוספו</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.5}}>שאר הלקוחות נוספו בהצלחה. אפשר להדביק שוב רק את מי שחסרה — לקוחות שכבר קיימות לא ייווצרו פעמיים.</p>
 {importResult.error&&<p style={{fontSize:9.5,color:"var(--ink-3)",marginTop:5,direction:"ltr",textAlign:"left"}}>{importResult.error}</p>}
 </div>
   )}
 </div>
 <div style={{display:"flex",gap:8}}>
 <button onClick={()=>{setShowImportModal(false);resetImport();}} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13,boxShadow:`0 8px 18px ${pcShadow}`}}>סיום</button>
 <button onClick={resetImport} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ייבוא נוסף</button>
 </div>
 </>)}
 </div>
 </div>
      )}

      {/* CLIENT MODAL */}
      {showClientModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowClientModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"var(--surface)",borderRadius:22,padding:24,width:380,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:14}}>{editingClient?"עריכת מטופלת":"מטופלת חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder="שם מלא *" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <input value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <input type="date" value={newClient.birthday} onChange={e=>setNewClient({...newClient,birthday:e.target.value})} placeholder="תאריך לידה" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 <select value={newClient.skinType} onChange={e=>setNewClient({...newClient,skinType:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">סוג עור</option>{SKIN_TYPES.map(t=><option key={t}>{t}</option>)}</select>
 <textarea value={newClient.allergies} onChange={e=>setNewClient({...newClient,allergies:e.target.value})} placeholder="אלרגיות" rows={2} style={{width:"100%",border:"1px solid rgba(242,184,75,0.16)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none"}}/>
 <textarea value={newClient.medical} onChange={e=>setNewClient({...newClient,medical:e.target.value})} placeholder="מצבים רפואיים" rows={2} style={{width:"100%",border:"1px solid #A7C4F4",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)",resize:"none"}}/>
 <textarea value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:4}}>סטטוס</p><div style={{display:"flex",gap:4}}>{Object.entries(STATUS_LABELS).map(([key,label])=><button key={key} onClick={()=>setNewClient({...newClient,status:key})} style={{flex:1,padding:"7px 2px",border:"1px solid",borderColor:newClient.status===key?pc:"var(--line)",borderRadius:12,background:newClient.status===key?STATUS_COLORS[key]:pcTint,color:newClient.status===key?"var(--surface)":"var(--ink-2)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>)}</div></div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowClientModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSaveClient} disabled={isBusy("saveClient")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{isBusy("saveClient")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* LEAD MODAL */}
      {showLeadModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowLeadModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"var(--surface)",borderRadius:22,padding:24,width:370,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:14}}>{editingLead?"עריכת פנייה":"פנייה חדשה"}</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newLead.name} onChange={e=>setNewLead({...newLead,name:e.target.value})} placeholder="שם *" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <input value={newLead.phone} onChange={e=>setNewLead({...newLead,phone:e.target.value})} placeholder="טלפון" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>מקור</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{LEAD_SOURCES.map(s=><button key={s} onClick={()=>setNewLead({...newLead,source:s})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.source===s?pc:"var(--line)",borderRadius:20,background:newLead.source===s?pcGrad:pcTint,color:newLead.source===s?"var(--surface)":"var(--ink-2)",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{SOURCE_ICONS[s]} {s}</button>)}</div></div>
 <select value={newLead.service_interest} onChange={e=>setNewLead({...newLead,service_interest:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">תחום עניין</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>סטטוס</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(LEAD_STATUSES).map(([key,s])=><button key={key} onClick={()=>setNewLead({...newLead,status:key})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.status===key?s.color:"var(--line)",borderRadius:20,background:newLead.status===key?s.bg:pcTint,color:newLead.status===key?s.color:"var(--ink-2)",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:newLead.status===key?700:400}}>{s.label}</button>)}</div></div>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>תזכורת מעקב</p><input type="date" value={newLead.reminder_date} onChange={e=>setNewLead({...newLead,reminder_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/></div>
 <textarea value={newLead.notes} onChange={e=>setNewLead({...newLead,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowLeadModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSaveLead} disabled={isBusy("saveLead")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{isBusy("saveLead")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* BULK WHATSAPP MODAL — compose -> confirm -> sending -> result.
          Nothing is sent until the explicit "confirm" step, which shows the
          real recipient count. Reuses app/api/leads/send-bulk/route.js. */}
      {bulkStatus&&(()=>{
        const s=leadStatusMeta(bulkStatus);
        // Single-lead send narrows the recipient list, so the confirm step
        // always shows the real count for what is about to be sent.
        const inGroup=bulkLeadIds
          ? leads.filter(l=>bulkLeadIds.includes(l.id))
          : leads.filter(l=>l.status===bulkStatus);
        const withPhone=inGroup.filter(l=>l.phone).length;
        const noPhone=inGroup.length-withPhone;
        return(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={bulkStep==="sending"?undefined:closeBulk}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" dir="rtl" style={{background:"var(--surface)",borderRadius:22,padding:24,width:400,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"var(--ink)",marginBottom:4}}>שליחת וואטסאפ — {s.label}</h3>
 <p style={{fontSize:10.5,color:"var(--ink-2)",marginBottom:16}}>{inGroup.length} פניות בסטטוס · {withPhone} עם טלפון{noPhone>0?` · ${noPhone} ללא טלפון (ידולגו)`:""}</p>

            {bulkStep==="compose"&&(<>
 <textarea value={bulkMessage} onChange={e=>setBulkMessage(e.target.value)} rows={5} placeholder="כתבי כאן את ההודעה שתישלח לכל הפניות בסטטוס זה..." style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"11px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"vertical",boxSizing:"border-box",marginBottom:16}}/>
 <div style={{display:"flex",gap:6}}>
 <button onClick={closeBulk} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={()=>setBulkStep("confirm")} disabled={!bulkMessage.trim()||withPhone===0} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>המשך</button>
 </div>
            </>)}

            {bulkStep==="confirm"&&(<>
 <div style={{background:"rgba(242,184,75,0.16)",border:"1px solid var(--line)",borderRadius:12,padding:"11px 13px",marginBottom:12,fontSize:11.5,color:"var(--warning)",lineHeight:1.6}}>⚠ פעולה זו תשלח הודעת <b>וואטסאפ אמיתית</b> ל-<b>{withPhone}</b> נמענים.{noPhone>0?` (${noPhone} ללא טלפון ידולגו)`:""}</div>
 <div style={{background:pcTint,borderRadius:12,padding:"11px 13px",marginBottom:12,fontSize:11.5,whiteSpace:"pre-wrap",maxHeight:140,overflowY:"auto"}}>{bulkMessage}</div>
              {bulkError&&<p style={{color:"var(--danger)",fontSize:11,marginBottom:10}}>{bulkError}</p>}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>{setBulkStep("compose");setBulkError("");}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>חזרה לעריכה</button>
 <button onClick={confirmBulkSend} className="primary-btn" style={{flex:2,padding:"11px 0",background:"var(--success)",color:"var(--surface)",fontSize:12}}>שלחי ל-{withPhone} נמענים ✓</button>
 </div>
            </>)}

            {bulkStep==="sending"&&(
 <div style={{textAlign:"center",padding:"28px 10px",fontSize:12.5,color:"var(--ink-2)"}}>שולח הודעות... נא לא לסגור את החלון</div>
            )}

            {bulkStep==="result"&&bulkResult&&(<>
 <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
 <div style={{flex:1,minWidth:88,background:"rgba(70,179,123,0.12)",borderRadius:12,padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:22,fontWeight:700,color:"var(--success)"}}>{bulkResult.sent}</p><p style={{fontSize:9,color:"var(--ink-2)"}}>נשלחו</p></div>
 <div style={{flex:1,minWidth:88,background:"rgba(224,91,111,0.10)",borderRadius:12,padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:22,fontWeight:700,color:"var(--danger)"}}>{bulkResult.failed}</p><p style={{fontSize:9,color:"var(--ink-2)"}}>נכשלו</p></div>
 <div style={{flex:1,minWidth:88,background:"var(--surface-2)",borderRadius:12,padding:"13px 8px",textAlign:"center"}}><p className="serif" style={{fontSize:22,fontWeight:700,color:"var(--ink-2)"}}>{bulkResult.skipped_no_phone}</p><p style={{fontSize:9,color:"var(--ink-2)"}}>דילוג (אין טלפון)</p></div>
 </div>
 <button onClick={closeBulk} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>סגירה</button>
            </>)}
 </div>
 </div>
        );
      })()}

      {/* CASHIER MODAL */}
      {showCashier&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowCashier(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"var(--surface)",borderRadius:22,padding:24,width:420,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:14}}>קופה — תשלום חדש</h3>
 <div style={{position:"relative",marginBottom:10}}>
 <input value={cashierSearch} onChange={e=>{setCashierSearch(e.target.value);if(!e.target.value)setCashierClient(null);}} placeholder="חיפוש לקוחה..." style={{width:"100%",border:`1px solid ${cashierClient?"var(--success)":"var(--line)"}`,borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:cashierClient?"var(--surface-2)":pcTint}}/>
              {cashierSearch.length>1&&!cashierClient&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",borderRadius:12,boxShadow:"0 8px 24px rgba(212,175,55,0.12)",zIndex:99,overflow:"hidden",marginTop:3,maxHeight:160,overflowY:"auto"}}>
                  {clients.filter(c=>c.name?.includes(cashierSearch)||c.phone?.includes(cashierSearch)).slice(0,6).map(c=>(
 <div key={c.id} onClick={()=>{setCashierClient(c);setCashierSearch(c.name);}} className="client-row" style={{padding:"9px 12px",borderBottom:"1px solid var(--surface-2)",cursor:"pointer"}}>
 <p style={{fontSize:11,fontWeight:600,color:"var(--ink)"}}>{c.name}</p><p style={{fontSize:9,color:"var(--ink-2)"}}>{c.phone||"אין טלפון"}</p>
 </div>
                  ))}
 </div>
              )}
 </div>
 <div style={{marginBottom:10}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
 <p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600}}>פריטים</p>
 <select onChange={e=>{const svc=activeServices.find(s=>s.name===e.target.value);if(svc){setCashierItems(prev=>[...prev,{id:Date.now(),name:svc.name,price:svc.price,qty:1,color:svc.color}]);}e.target.value="";}} style={{border:"1px solid var(--line)",borderRadius:10,padding:"5px 9px",fontSize:10,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,color:pc}}><option value="">+ הוסיפי שירות</option>{activeServices.map(s=><option key={s.name} value={s.name}>{s.name} — ₪{s.price}</option>)}</select>
 </div>
              {cashierItems.length===0?<p style={{fontSize:10,color:"var(--ink-3)",padding:"8px 0"}}>לא נבחרו פריטים</p>
                :cashierItems.map(item=>(
 <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 9px",background:pcTint,borderRadius:10,marginBottom:4}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:item.color||"var(--warning)",flexShrink:0}}/>
 <p style={{flex:1,fontSize:11,fontWeight:600,color:"var(--ink)"}}>{item.name}</p>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:Math.max(1,i.qty-1)}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>−</button>
 <span style={{fontSize:11,minWidth:16,textAlign:"center"}}>{item.qty}</span>
 <button onClick={()=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))} className="icon-btn" style={{width:22,height:22,fontSize:11}}>+</button>
 <input type="number" value={item.price} onChange={e=>setCashierItems(prev=>prev.map(i=>i.id===item.id?{...i,price:Number(e.target.value)}:i))} style={{width:54,border:"1px solid var(--line)",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <button onClick={()=>setCashierItems(prev=>prev.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:"var(--danger)",fontSize:13,cursor:"pointer"}}>✕</button>
 </div>
                ))}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <p style={{fontSize:11,color:"var(--ink-2)",flex:1}}>הנחה (₪)</p>
 <input type="number" value={cashierDiscount||""} onChange={e=>setCashierDiscount(e.target.value)} placeholder="0" style={{width:80,border:"1px solid var(--line)",borderRadius:10,padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/>
 </div>
 <p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600,marginBottom:5}}>אמצעי תשלום</p>
 <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              {PAYMENT_METHODS.map(pm=>(
 <button key={pm.key} onClick={()=>setPaymentMethod(pm.key)} style={{flex:"1 0 28%",padding:"9px 4px",border:"1px solid",borderColor:paymentMethod===pm.key?pm.color:"var(--line)",borderRadius:12,background:paymentMethod===pm.key?pm.color:pcTint,color:paymentMethod===pm.key?"var(--surface)":"var(--ink-2)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{pm.icon} {pm.key}</button>
              ))}
 </div>
            {["ביט","פייבוקס","העברה"].includes(paymentMethod)&&cashierClient?.phone&&(
 <div style={{background:"var(--pc-tint)",borderRadius:12,padding:"10px 12px",marginBottom:10}}>
 <p style={{fontSize:10,color:"var(--pc-deep)",fontWeight:600,marginBottom:6}}>שלחי בקשת תשלום ב-{paymentMethod}</p>
 <a href={waPayment(cashierClient.phone,cashierClient.name,cashierTotal,cashierItems.map(i=>i.name).join(", "),paymentMethod,settings.business_phone)} target="_blank" rel="noreferrer"
                  className="wa-btn" style={{display:"inline-flex",padding:"7px 12px",fontSize:10}}>שלחי בקשת תשלום</a>
 </div>
            )}
 <textarea value={cashierNote} onChange={e=>setCashierNote(e.target.value)} placeholder="הערה לקבלה" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none",marginBottom:10}}/>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:pcTint,borderRadius:14,marginBottom:14}}>
 <span style={{fontSize:12,color:"var(--ink-2)",fontWeight:600}}>סה״כ לתשלום</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:pc}}>₪{cashierTotal.toLocaleString()}</span>
 </div>
            {paymentMethod==="אשראי"&&(
              <button onClick={handleCreditPayment} disabled={isBusy("creditPayment")} className="primary-btn" style={{width:"100%",padding:"13px 0",background:`linear-gradient(90deg,${pc},${pc2})`,color:"var(--surface)",fontSize:13,marginBottom:8}}>{isBusy("creditPayment")?"פותח תשלום...":"💳 גבי באשראי דרך Grow"}</button>
            )}
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setShowCashier(false)} className="primary-btn" style={{flex:1,padding:"12px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSaveReceipt} disabled={isBusy("saveReceipt")} className="primary-btn" style={{flex:2,padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13}}>{isBusy("saveReceipt")?"שומר...":"צרי קבלה ידנית ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14}} onClick={()=>setShowReceipt(null)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:0,width:360,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto",overflow:"hidden",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <div className="receipt-print" style={{padding:24}}>
 <div style={{textAlign:"center",borderBottom:"2px dashed var(--line-2)",paddingBottom:14,marginBottom:14}}>
 <p className="serif" style={{fontSize:22,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{settings.business_name}</p>
 <p style={{fontSize:10,color:"var(--ink-3)",marginTop:2}}>קבלה</p>
                {settings.business_phone&&<p style={{fontSize:9,color:"var(--ink-3)"}}>{settings.business_phone}</p>}
 </div>
 <div style={{fontSize:11,color:"var(--ink)",lineHeight:1.9}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>לקוחה:</span><span style={{fontWeight:600}}>{showReceipt.client_name}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>תאריך:</span><span>{showReceipt.created_at?.slice(0,10)}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>שירות:</span><span style={{fontWeight:600}}>{showReceipt.service}</span></div>
 <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>אמצעי תשלום:</span><span>{showReceipt.payment_method}</span></div>
                {showReceipt.discount>0&&<div style={{display:"flex",justifyContent:"space-between",color:pc}}><span>הנחה:</span><span>−₪{showReceipt.discount}</span></div>}
                {showReceipt.note&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--ink-3)"}}>הערה:</span><span>{showReceipt.note}</span></div>}
 </div>
 <div style={{borderTop:"2px dashed var(--line-2)",marginTop:14,paddingTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <span style={{fontSize:13,fontWeight:600,color:"var(--ink-2)"}}>סה״כ:</span>
 <span className="serif" style={{fontSize:26,fontWeight:700,color:pc}}>₪{showReceipt.amount}</span>
 </div>
 <p style={{textAlign:"center",fontSize:9,color:"var(--ink-3)",marginTop:14}}>תודה ונתראה בקרוב ✦</p>
 </div>
 <div style={{display:"flex",gap:6,padding:"0 24px 24px"}}>
 <button onClick={()=>printReceipt(showReceipt)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line-2)",background:"var(--surface)",fontSize:11,color:"var(--ink-2)"}}>הדפסה</button>
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));return cl?.phone?(
 <button onClick={async()=>{if(isBusy("sendReceipt"))return;setBusyKey("sendReceipt",true);try{await sendReceiptToClient(showReceipt);}finally{setBusyKey("sendReceipt",false);}}} disabled={isBusy("sendReceipt")} className="primary-btn" style={{flex:1,padding:"11px 0",background:"#25D366",color:"#fff",fontSize:11,border:"none"}}>{isBusy("sendReceipt")?"שולח...":"שליחה ללקוחה"}</button>
              ):null;})()}
 <button onClick={()=>setShowReceipt(null)} className="primary-btn" style={{flex:1,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:11}}>סגירה</button>
 </div>
              {/* Zero-dependency fallback: opens WhatsApp with the receipt pre-filled,
                  works even if GreenAPI isn't connected. */}
              {(()=>{const cl=clients.find(c=>String(c.id)===String(showReceipt.client_id));const phone=(cl?.phone||showReceipt.client_phone||"").trim();return phone?(
 <a href={waMsg(phone,receiptShareText(showReceipt))} target="_blank" rel="noreferrer" className="primary-btn" style={{display:"block",margin:"0 24px 22px",padding:"11px 0",background:"var(--surface)",color:"#128C7E",border:"1.5px solid #25D366",borderRadius:12,fontSize:11.5,fontWeight:700,textAlign:"center",textDecoration:"none"}}>✆ שלחי בוואטסאפ (קישור ישיר)</a>
              ):null;})()}
 </div>
 </div>
      )}

      {/* PACKAGE MODAL */}
      {showPackageModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowPackageModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"var(--surface)",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:14}}>חבילת טיפולים חדשה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newPackage.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewPackage({...newPackage,client_id:e.target.value,client_name:c?.name||""});}} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newPackage.service} onChange={e=>setNewPackage({...newPackage,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>מספר טיפולים</p><input type="number" value={newPackage.total_sessions} onChange={e=>setNewPackage({...newPackage,total_sessions:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>מחיר חבילה ₪</p><input type="number" value={newPackage.price} onChange={e=>setNewPackage({...newPackage,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowPackageModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSavePackage} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* ============================================================
          BOTTOM NAVIGATION
          Added ALONGSIDE the existing sidebar, not replacing it, so both can
          be compared before anything is retired.

          Accent tier: the bar follows --pc-*, so it recolours with her chosen
          colour like the rest of her app. The safe-area inset keeps the labels
          clear of the iPhone home bar.

          zIndex 900, NOT 1400. The old value was chosen on the belief that
          modals sat at 1500+, but every modal in this file is 1000-1060 and the
          drawers are 1200-1300, so the bar was painting over all of them - and
          a 90vh modal on a phone leaves less clearance at the bottom than the
          bar is tall, so it covered exactly the row where every modal keeps its
          action buttons. 900 puts it above page content and below every overlay.
          The "עוד" sheet (1401) and the off-canvas drawer (1500) are opened FROM
          the bar and still correctly sit above it.
          ============================================================ */}
 <nav className="mobile-only app-bottombar" aria-label="ניווט תחתון" style={{position:"fixed",insetInline:0,bottom:0,zIndex:900,
        background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.94)",
        backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
        borderTop:"1px solid var(--line)",boxShadow:"0 -2px 16px rgba(48,24,72,0.06)",
        /* NO inline display here. An inline style outranks a class selector,
           so display:flex would beat .mobile-only{display:none} and the bar
           would render on desktop alongside the sidebar. Visibility is left
           entirely to .mobile-only, which supplies flex below the breakpoint
           and none above it. */
        alignItems:"stretch",
        paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
        {BOTTOM_NAV.map(item=>{
          const on = activeTab===item.id;
          return (
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMoreSheet(false);}}
        aria-current={on?"page":undefined} aria-label={item.label}
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:on?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",position:"relative",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:13,background:on?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
              {navIcon(item.id)}
              {item.id==="leads"&&newLeadsCount>0&&(
 <span style={{position:"absolute",top:4,insetInlineEnd:"50%",transform:"translateX(50%) translateX(14px)",
               background:pcGrad,color:"#fff",fontSize:9,fontWeight:700,lineHeight:1,
               padding:"2px 6px",borderRadius:20,boxShadow:`0 2px 6px ${pcShadow}`}}>{newLeadsCount}</span>
              )}
 </span>
 <span style={{fontSize:10,fontWeight:on?700:500,letterSpacing:"-0.01em"}}>{item.label}</span>
 </button>
          );
        })}
        {/* עוד — opens the sheet with everything that does not fit above. */}
 <button onClick={()=>setShowMoreSheet(v=>!v)} aria-expanded={showMoreSheet} aria-label="עוד"
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:showMoreSheet?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:13,background:showMoreSheet?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
 <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>
 </svg>
 </span>
 <span style={{fontSize:10,fontWeight:showMoreSheet?700:500,letterSpacing:"-0.01em"}}>עוד</span>
 </button>
 </nav>

      {/* "עוד" SHEET — the remaining tabs. */}
      {showMoreSheet&&(
 <div className="mobile-only" onClick={()=>setShowMoreSheet(false)}
      style={{position:"fixed",inset:0,zIndex:1401,background:"rgba(48,24,72,0.34)",
              backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
              /* Same reasoning as the bar: no inline display, so .mobile-only
                 alone decides whether this can appear. */
              alignItems:"flex-end",justifyContent:"center"}}>
 <div onClick={e=>e.stopPropagation()} role="dialog" aria-label="עוד מסכים"
      style={{width:"100%",maxWidth:560,background:"var(--surface)",
              borderTopLeftRadius:26,borderTopRightRadius:26,
              border:"1px solid var(--line)",borderBottom:"none",
              boxShadow:"0 -20px 60px rgba(48,24,72,0.22)",
              padding:"14px 16px calc(78px + env(safe-area-inset-bottom, 0px))",
              animation:"sheetUp 0.22s cubic-bezier(.2,.7,.3,1)"}}>
 <div aria-hidden style={{width:42,height:4,borderRadius:99,background:"var(--line-2)",margin:"2px auto 14px"}}/>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(96px,1fr))",gap:8}}>
              {MORE_NAV.map(id=>{
                const label=(NAV_ITEMS.find(n=>n.id===id)||{}).label||id;
                const on=activeTab===id;
                return (
 <button key={id} onClick={()=>{setActiveTab(id);setShowMoreSheet(false);}}
        style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,
                padding:"14px 6px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",
                border:`1px solid ${on?"var(--pc)":"var(--line)"}`,
                background:on?"var(--pc-tint)":"var(--surface-2)",
                color:on?"var(--pc)":"var(--ink-2)",transition:"background 0.18s,border-color 0.18s"}}>
                  {navIcon(id)}
 <span style={{fontSize:11.5,fontWeight:on?700:600}}>{label}</span>
 </button>
                );
              })}
 </div>
 </div>
 </div>
      )}

      {/* POST DESIGN MODAL */}
      {designPost&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14,overflowY:"auto"}} onClick={()=>setDesignPost(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:420,width:"100%"}}>
            {/* Scroll wrapper: contains the fixed 380px export canvas on <380px phones
                without resizing #post-design (html2canvas captures it at its rendered
                size, so its dimensions must stay fixed to keep the exported PNG square). */}
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <div id="post-design" style={{width:380,height:380,marginLeft:"auto",marginRight:"auto",background:designBg?"#000":pcGrad,borderRadius:0,padding:34,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              {designBg&&<img alt="" src={designBg} crossOrigin="anonymous" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>}
              {designBg&&<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.55))"}}/>}
              <div style={{position:"absolute",top:18,right:22,fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:600,letterSpacing:"1px"}}>{settings.business_name||""}</div>
              {designPost.title&&<div className="serif" style={{fontSize:26,fontWeight:700,color:"var(--surface)",lineHeight:1.25,marginBottom:14,textShadow:"0 1px 6px rgba(0,0,0,0.18)"}}>{designPost.title}</div>}
              <div style={{fontSize:14,color:"var(--surface)",lineHeight:1.6,whiteSpace:"pre-wrap",textShadow:"0 1px 4px rgba(0,0,0,0.15)",maxHeight:170,overflow:"hidden"}}>{designPost.body}</div>
              {designPost.callToAction&&<div style={{marginTop:16,display:"inline-block",alignSelf:"flex-start",background:"var(--surface)",color:"var(--ink)",fontSize:12.5,fontWeight:700,padding:"8px 18px",borderRadius:30}}>{designPost.callToAction}</div>}
            </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:10,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <label style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.92)",color:"var(--ink)",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                📷 העלאת תמונת רקע
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f){const r=new FileReader();r.onload=()=>setDesignBg(r.result);r.readAsDataURL(f);}}}/>
              </label>
              {designBg&&<button onClick={()=>setDesignBg(null)} style={{flex:"0 0 auto",padding:"10px 14px",background:"rgba(255,255,255,0.92)",color:"var(--danger)",border:"none",borderRadius:12,fontSize:11.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>הסרה</button>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,maxWidth:380,marginLeft:"auto",marginRight:"auto"}}>
              <button onClick={()=>{setDesignPost(null);setDesignBg(null);}} style={{flex:1,padding:"12px 0",background:"var(--surface)",color:"var(--ink-2)",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>סגירה</button>
              <button onClick={downloadPostImage} disabled={designing} style={{flex:2,padding:"12px 0",background:"var(--ink)",color:"var(--surface)",border:"none",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:designing?0.6:1}}>{designing?"מייצר...":"⬇ הורדת תמונה"}</button>
            </div>
          </div>
        </div>
      )}

      {/* PROTOCOL MODAL */}
      {showProtocolModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowProtocolModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:18,padding:20,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",marginBottom:14}}>פרוטוקול חדש</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input value={newProtocol.brand} onChange={e=>setNewProtocol({...newProtocol,brand:e.target.value})} placeholder="מותג *" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
              <input value={newProtocol.name} onChange={e=>setNewProtocol({...newProtocol,name:e.target.value})} placeholder="שם הפרוטוקול *" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
              <input value={newProtocol.concern} onChange={e=>setNewProtocol({...newProtocol,concern:e.target.value})} placeholder="בעיה שהפרוטוקול פותר (אקנה, אנטי-אייג׳ינג...)" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
              <input value={newProtocol.frequency} onChange={e=>setNewProtocol({...newProtocol,frequency:e.target.value})} placeholder="תדירות (למשל: אחת לשבועיים)" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>מספר מפגשים</p><input type="number" value={newProtocol.sessions_count} onChange={e=>setNewProtocol({...newProtocol,sessions_count:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>זמן (דקות)</p><input type="number" value={newProtocol.duration_minutes} onChange={e=>setNewProtocol({...newProtocol,duration_minutes:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>מחיר ₪</p><input type="number" value={newProtocol.price} onChange={e=>setNewProtocol({...newProtocol,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
              </div>
              <textarea value={newProtocol.notes} onChange={e=>setNewProtocol({...newProtocol,notes:e.target.value})} placeholder="הערות / התוויות נגד" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setShowProtocolModal(false)} style={{flex:1,padding:"11px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line)",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
                <button onClick={handleSaveProtocol} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>שמירה ✓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WAITLIST MODAL */}
      {showWaitlistModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>setShowWaitlistModal(false)}>
 <div onClick={e=>e.stopPropagation()} className="modal-card" style={{background:"var(--surface)",borderRadius:22,padding:24,width:340,maxWidth:"100%"}}>
 <h3 className="serif" style={{fontSize:20,fontWeight:600,color:"var(--ink)",marginBottom:14}}>הוספה לרשימת המתנה</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <select value={newWaitlist.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewWaitlist({...newWaitlist,client_id:e.target.value,client_name:c?.name||"",phone:c?.phone||""});}} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">— בחרי לקוחה —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newWaitlist.service} onChange={e=>setNewWaitlist({...newWaitlist,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}><option value="">— בחרי שירות —</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <input type="date" value={newWaitlist.preferred_date} onChange={e=>setNewWaitlist({...newWaitlist,preferred_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 <textarea value={newWaitlist.notes} onChange={e=>setNewWaitlist({...newWaitlist,notes:e.target.value})} placeholder="הערות" rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowWaitlistModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>ביטול</button>
 <button onClick={handleSaveWaitlist} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>שמירה ✓</button>
 </div>
 </div>
 </div>
      )}

      {/* COMMUNITY POST MODAL */}
      {showPostModal&&(
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={()=>setShowPostModal(false)}>
 <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:20,maxWidth:460,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:"22px"}}>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",marginBottom:14}}>פוסט חדש למרחב הלקוחות</p>

 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:5}}>סוג הפוסט</p>
 <div style={{display:"flex",gap:6,marginBottom:13}}>
 {[{k:"update",l:"עדכון"},{k:"offer",l:"מבצע"},{k:"tip",l:"טיפ"}].map(t=>(
 <button key={t.k} onClick={()=>setNewPost({...newPost,post_type:t.k})} style={{flex:1,padding:"8px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:newPost.post_type===t.k?`2px solid ${pc}`:"1px solid var(--line)",background:newPost.post_type===t.k?pcTint:"var(--surface)",color:pc}}>{t.l}</button>
 ))}
 </div>

 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:5}}>כותרת (לא חובה)</p>
 <input value={newPost.title} onChange={e=>setNewPost({...newPost,title:e.target.value})} placeholder="לדוגמה: מבצע אביב על טיפולי פנים" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid var(--pc-tint)",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:5}}>תוכן</p>
 <textarea value={newPost.body} onChange={e=>setNewPost({...newPost,body:e.target.value})} rows={4} placeholder="כתבי כאן את העדכון, המבצע או הטיפ..." style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid var(--pc-tint)",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box",resize:"vertical"}}/>

 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:5}}>טקסט לכפתור (לא חובה)</p>
 <input value={newPost.cta_label} onChange={e=>setNewPost({...newPost,cta_label:e.target.value})} placeholder="לדוגמה: לפרטים בוואטסאפ" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid var(--pc-tint)",fontSize:12.5,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:5}}>תמונה (לא חובה)</p>
 {newPost.image_url&&<img alt="" src={newPost.image_url} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
 <label style={{display:"block",padding:"9px 0",textAlign:"center",borderRadius:10,border:"1px dashed var(--line)",fontSize:11.5,color:pc,cursor:"pointer",marginBottom:16,fontWeight:600}}>
 {postImageUploading?"מעלה...":newPost.image_url?"החלפת תמונה":"+ הוספת תמונה"}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadPostImage(f);}}/>
 </label>

 <div style={{display:"flex",gap:8}}>
 <button onClick={saveCommunityPost} disabled={savingPost} className="primary-btn" style={{flex:1,padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13,opacity:savingPost?0.6:1}}>{savingPost?"מפרסם...":"פרסום"}</button>
 <button onClick={()=>setShowPostModal(false)} style={{padding:"12px 18px",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--pc-tint)",borderRadius:12,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>ביטול</button>
 </div>
 </div>
 </div>
      )}

      {/* SETTINGS MODAL */}
      {showSetup && (
        <div onClick={()=>setShowSetup(false)} style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:14}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:20,padding:"20px 22px",width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"var(--shadow-lg)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h3 className="serif" style={{fontSize:19,fontWeight:600,color:"var(--ink)"}}>הגדרת המערכת</h3>
              <button onClick={()=>setShowSetup(false)} className="icon-btn" aria-label="סגירה">✕</button>
            </div>
            {renderSetupBody()}
          </div>
        </div>
      )}

      {showSettings&&editSettings&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:14}} onClick={()=>{setShowSettings(false);setEditSettings(null);}}>
 <div onClick={e=>e.stopPropagation()} className="modal-card pop-in" style={{background:"var(--surface)",borderRadius:24,padding:0,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <div style={{padding:"20px 24px 0"}}>
 <h3 className="serif" style={{fontSize:21,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:14}}>⚙ הגדרות</h3>
 {/* Compact setup-checklist entry — the checklist's home once it leaves the dashboard */}
 <button onClick={()=>setShowSetup(true)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:pcTint,border:"1px solid var(--line)",borderRadius:12,padding:"10px 12px",marginBottom:14,cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>
 <span style={{fontSize:15,color:setupDone===setupTotal?"var(--success)":pc,flexShrink:0}}>{setupDone===setupTotal?"✓":"☑"}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)"}}>הגדרת המערכת</p>
 <p style={{fontSize:9.5,color:"var(--ink-3)"}}>{setupDone===setupTotal?"הכל מוכן. אפשר לעדכן בכל עת":"רשימת ההגדרות להשלמה"}</p>
 </div>
 <span style={{fontSize:11,color:pcDeep,fontWeight:700,flexShrink:0}}>{setupDone===setupTotal?"✨":`${setupDone}/${setupTotal}`}</span>
 </button>
 <div style={{display:"flex",gap:4,borderBottom:"1px solid var(--line)",overflowX:"auto"}}>
                {[{k:"general",l:"כללי"},{k:"branding",l:"מיתוג"},{k:"automations",l:"אוטומציות"},{k:"services",l:"שירותים"},{k:"import",l:"ייבוא נתונים"},{k:"faq",l:"שאלות ותשובות"},{k:"hours",l:"שעות"},{k:"payment",l:"תשלום"}].map(t=>(
 <button key={t.k} onClick={()=>setSettingsTab(t.k)} style={{background:"none",border:"none",padding:"10px 12px",fontSize:11.5,fontWeight:settingsTab===t.k?700:500,color:settingsTab===t.k?pcDeep:"var(--ink-3)",borderBottom:settingsTab===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"color 0.2s"}}>{t.l}</button>
                ))}
 </div>
 </div>
 <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
              {settingsTab==="general"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>שם העסק</p><input value={editSettings.business_name||""} onChange={e=>setEditSettings({...editSettings,business_name:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/></div>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>שם המטפלת</p><input value={editSettings.therapist_name||""} onChange={e=>setEditSettings({...editSettings,therapist_name:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/></div>
 <div><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:5}}>צבע מותג</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["#5B3E67","#7A5A88","#9B6FB0","#B784C4","#D98BA0","#C2557A","#A34A6B","#C68A5E","#C9A24B","#2A2233"].map(col=><button key={col} onClick={()=>setEditSettings({...editSettings,primary_color:col})} style={{width:34,height:34,borderRadius:"50%",background:col,border:editSettings.primary_color===col?"3px solid var(--ink)":"2px solid var(--line-2)",cursor:"pointer",boxShadow:editSettings.primary_color===col?"var(--shadow-sm)":"none",transition:"transform 0.12s"}}/>)}</div></div>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>לינק ביקורת (Google)</p><input value={editSettings.review_url||""} onChange={e=>setEditSettings({...editSettings,review_url:e.target.value})} placeholder="https://g.page/r/..." style={{width:"100%",border:"1px solid var(--line)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:pcTint}}/><p style={{fontSize:9,color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>יצורף אוטומטית להודעת בקשת הביקורת שנשלחת ללקוחה יומיים אחרי הטיפול</p></div>
 <div><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:4}}>סטטוס עוסק (לדוחות מס)</p>
 <div style={{display:"flex",gap:6}}>
                  {[{k:"exempt",l:"עוסק פטור"},{k:"licensed",l:"עוסק מורשה"},{k:"company",l:"חברה בע\"מ"}].map(o=>{
                    const sel=(editSettings.business_tax_status||"exempt")===o.k;
                    return <button key={o.k} onClick={()=>setEditSettings({...editSettings,business_tax_status:o.k})} style={{flex:1,padding:"9px 4px",borderRadius:11,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:sel?pcDeep:"var(--ink-2)"}}>{o.l}</button>;
                  })}
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>קובע איך מחושב דוח המס שלך במסך "דוחות מס"</p></div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-3)",marginBottom:8,fontWeight:700}}>קישורים ללקוחות (לשליחה בוואטסאפ / ביו)</p>
 <button onClick={()=>copyPublicLink("scan")} className="primary-btn" style={{width:"100%",padding:"11px 0",background:pcGrad,color:"var(--surface)",borderRadius:12,fontSize:12,marginBottom:7,boxShadow:`0 6px 14px ${pcShadow}`}}>✦ העתקת קישור לסורק העור</button>
 <button onClick={()=>copyPublicLink("book")} style={{width:"100%",padding:"11px 0",background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>📅 העתקת קישור לקביעת תור</button>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-3)",marginBottom:8,fontWeight:700}}>שינוי סיסמה</p>
 <div style={{display:"flex",flexDirection:"column",gap:7}}>
 <input type="password" value={pwCurrent} onChange={e=>setPwCurrent(e.target.value)} placeholder="סיסמה נוכחית" autoComplete="current-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="סיסמה חדשה (לפחות 8 תווים)" autoComplete="new-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder="אימות סיסמה חדשה" autoComplete="new-password" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/>
 <button onClick={handleChangePassword} disabled={isBusy("changePw")} className="primary-btn" style={{padding:"10px 0",background:pcGrad,color:"var(--surface)",fontSize:12,marginTop:2}}>{isBusy("changePw")?"מעדכן...":"עדכון סיסמה"}</button>
 </div>
 </div>
 </div>
              )}
              {settingsTab==="branding"&&(()=>{
                const brand=(editSettings.branding&&typeof editSettings.branding==="object")?editSettings.branding:{};
                const setBrand=(k,v)=>setEditSettings(prev=>({...prev,branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}),[k]:v}}));
                const lbl={fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:5};
                const inp={width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"};
                const upBtn={background:"var(--pc-tint)",color:pcDeep,border:"none",borderRadius:12,padding:"8px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"};
                const swatches=["#5B3E67","#7A5A88","#9B6FB0","#B784C4","#D98BA0","#C2557A","#A34A6B","#C68A5E","#C9A24B","#2A2233"];
                const colorRow=(label,val,onPick)=>(<div><p style={lbl}>{label}</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{swatches.map(c=><button key={c} onClick={()=>onPick(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:val===c?"3px solid var(--ink)":"2px solid var(--line-2)",cursor:"pointer"}}/>)}</div></div>);
                const uploader=(key,current)=>(
                  current?(
 <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
 <img src={current} alt="" style={{maxHeight:52,maxWidth:120,objectFit:"contain",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:10,padding:6}}/>
 <label style={upBtn}>{brandUploading===key?"מעלה…":"החלפה"}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadBrandAsset(f,key);e.target.value="";}}/></label>
 <button onClick={()=>setBrand(key,"")} style={{background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:12,padding:"8px 12px",fontSize:11,fontWeight:600,color:"var(--danger)",cursor:"pointer",fontFamily:"inherit"}}>הסרה</button>
 </div>
                  ):(
 <label style={{display:"block",border:"1.5px dashed var(--line-2)",borderRadius:12,padding:"14px",textAlign:"center",cursor:"pointer",fontSize:11.5,fontWeight:600,color:pcDeep,background:"var(--surface-2)"}}>{brandUploading===key?"מעלה…":"העלאת תמונה (PNG/JPG, עד 3MB)"}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadBrandAsset(f,key);e.target.value="";}}/></label>
                  )
                );
                return(
 <div style={{display:"flex",flexDirection:"column",gap:14}}>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5}}>המיתוג מופיע בעמודי הלקוחות — הסורק, תוצאות הסריקה ודף קביעת התור. אם משאירים ריק, מוצג עיצוב ברירת המחדל.</p>
 <div><p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600,marginBottom:6}}>לוגו הקליניקה</p>{uploader("logo_url",brand.logo_url)}</div>
                    {colorRow("צבע ראשי",editSettings.primary_color,(c)=>setEditSettings({...editSettings,primary_color:c}))}
                    {colorRow("צבע משני (הדגשות)",brand.secondary_color,(c)=>setBrand("secondary_color",c))}
 <div><p style={lbl}>כותרת פתיחה ללקוחה</p><input value={brand.welcome_headline||""} onChange={e=>setBrand("welcome_headline",e.target.value)} placeholder="למשל: העור שלך מתחיל כאן" style={inp}/></div>
 <div><p style={lbl}>משפט פתיחה קצר</p><textarea value={brand.welcome_message||""} onChange={e=>setBrand("welcome_message",e.target.value)} rows={2} placeholder="הזמנה חמה ללקוחה" style={{...inp,resize:"none"}}/></div>
 <div><p style={lbl}>כתובת הקליניקה (מוצגת ללקוחה)</p><input value={brand.public_address||""} onChange={e=>setBrand("public_address",e.target.value)} placeholder="רחוב, עיר" style={inp}/></div>
 <div><p style={lbl}>טקסט כפתור קביעת תור</p><input value={brand.booking_cta_label||""} onChange={e=>setBrand("booking_cta_label",e.target.value)} placeholder="קביעת תור" style={inp}/></div>
 <div><p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600,marginBottom:6}}>תמונת רקע (אופציונלי)</p>{uploader("hero_image_url",brand.hero_image_url)}</div>
 <div><p style={lbl}>תיאור העסק (אודות)</p><textarea value={brand.business_description||""} onChange={e=>setBrand("business_description",e.target.value)} rows={3} placeholder="ספרי בקצרה על העסק, ההתמחות והגישה שלך" style={{...inp,resize:"none"}}/></div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:12,color:"var(--ink)",fontWeight:700,marginBottom:2}}>📷 גלריית תמונות</p>
 <p style={{fontSize:9.5,color:"var(--ink-3)",marginBottom:8}}>התמונות יוצגו בעמוד העסק שלך (/book) כרשת תמונות</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(70px,1fr))",gap:6,marginBottom:8}}>
                    {(Array.isArray(brand.gallery)?brand.gallery:[]).map((g,i)=>(
 <div key={i} style={{position:"relative",aspectRatio:"1 / 1",borderRadius:10,overflow:"hidden",border:"1px solid var(--line)"}}>
 <img src={g} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>setBrand("gallery",(Array.isArray(brand.gallery)?brand.gallery:[]).filter((_,j)=>j!==i))} style={{position:"absolute",top:2,left:2,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",color:"var(--surface)",border:"none",fontSize:11,cursor:"pointer",lineHeight:1}}>✕</button>
 </div>
                    ))}
 </div>
 <label style={{display:"block",border:"1.5px dashed var(--line-2)",borderRadius:12,padding:"12px",textAlign:"center",cursor:"pointer",fontSize:11.5,fontWeight:600,color:pcDeep,background:"var(--surface-2)"}}>{brandUploading==="gallery"?"מעלה…":"+ הוספת תמונה לגלריה"}<input type="file" accept="image/*" disabled={!!brandUploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadGalleryImage(f);e.target.value="";}}/></label>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>
 <p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600}}>קישורים ורשתות חברתיות (יוצגו רק אם מולאו)</p>
 <div><p style={lbl}>מספר וואטסאפ</p><input value={brand.whatsapp_number||""} onChange={e=>setBrand("whatsapp_number",e.target.value)} placeholder="050-0000000" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>אינסטגרם</p><input value={brand.instagram||""} onChange={e=>setBrand("instagram",e.target.value)} placeholder="@username או קישור מלא" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>פייסבוק</p><input value={brand.facebook||""} onChange={e=>setBrand("facebook",e.target.value)} placeholder="username או קישור מלא" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>טיקטוק</p><input value={brand.tiktok||""} onChange={e=>setBrand("tiktok",e.target.value)} placeholder="@username או קישור מלא" style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 <div><p style={lbl}>אתר אינטרנט</p><input value={brand.website||""} onChange={e=>setBrand("website",e.target.value)} placeholder="https://..." style={{...inp,direction:"ltr",textAlign:"left"}}/></div>
 </div>
 <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>
 <p style={{fontSize:12,color:"var(--ink)",fontWeight:700,marginBottom:2}}>⭐ ביקורות לקוחות</p>
 <p style={{fontSize:9.5,color:"var(--ink-3)",marginBottom:8}}>יוצגו בעמוד העסק שלך כמו ביקורות Google (רק אם הוספת לפחות אחת)</p>
                    {(Array.isArray(brand.reviews)?brand.reviews:[]).map((rv,i)=>{
                      const revs=Array.isArray(brand.reviews)?brand.reviews:[];
                      const updRev=(patch)=>setBrand("reviews",revs.map((x,j)=>j===i?{...x,...patch}:x));
                      return (
 <div key={i} style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:12,padding:"10px 12px",marginBottom:8}}>
 <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
 <input value={rv.name||""} onChange={e=>updRev({name:e.target.value})} placeholder="שם הלקוחה" style={{...inp,flex:1,padding:"7px 10px"}}/>
 <button onClick={()=>setBrand("reviews",revs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>✕</button>
 </div>
 <div style={{display:"flex",gap:3,marginBottom:6}}>
                          {[1,2,3,4,5].map(n=>(
 <button key={n} onClick={()=>updRev({rating:n})} style={{background:"none",border:"none",cursor:"pointer",fontSize:19,lineHeight:1,padding:0,color:(Number(rv.rating)||5)>=n?pc:"var(--line-2)"}}>★</button>
                          ))}
 </div>
 <textarea value={rv.text||""} onChange={e=>updRev({text:e.target.value})} rows={2} placeholder="תוכן הביקורת" style={{...inp,resize:"none"}}/>
 </div>
                      );
                    })}
 <button onClick={()=>setBrand("reviews",[...(Array.isArray(brand.reviews)?brand.reviews:[]),{name:"",rating:5,text:""}])} style={{background:"var(--pc-tint)",border:`1px dashed ${pc}`,borderRadius:12,padding:"9px 0",width:"100%",fontSize:11.5,color:pcDeep,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>+ הוסף ביקורת</button>
 </div>
 </div>
                );
              })()}

              {settingsTab==="automations"&&(()=>{
                // Default-ON reminder flags: undefined (column never set) counts
                // as ON, matching today's cron behavior. Only an explicit false
                // turns them off.
                //
                // These are live, not settings-only: send-reminders reads
                // reminders_enabled, and send-smart-reminders reads
                // winback_enabled, package_reminders_enabled and
                // review_requests_enabled. The master pause below
                // (automations.paused) gates all of them, plus gap-fill.
                const onDefaultTrue=(k)=>!(editSettings[k]===false||editSettings[k]==="false");
                // Preserve the existing default-OFF semantics for gap-fill and
                // auto-receipt exactly as they were in the General tab.
                const botOn=onDefaultTrue("bot_active");
                const gapOn=(editSettings.gap_fill_enabled===true);
                const receiptOn=(editSettings.send_receipt_auto===true||editSettings.send_receipt_auto==="true");
                // Connected = her own instance id + token are both set (mirrors
                // isWhatsAppConnected's per-tenant rule; url is optional).
                const waConnected=!!(String(editSettings.green_api_instance||"").trim()&&String(editSettings.green_api_token||"").trim());
                const setFlag=(k,v)=>setEditSettings({...editSettings,[k]:v});
                // Structured automation config lives in the settings.automations JSONB
                // (same store as business_hours/faq). Read/write defensively.
                const autos=(editSettings.automations&&typeof editSettings.automations==="object")?editSettings.automations:{};
                const skinMode=(autos.skin_followup&&autos.skin_followup.mode)||"off";
                const masterPaused=autos.paused===true;
                const setAutos=(next)=>setEditSettings({...editSettings,automations:next});
                const setSkinMode=(m)=>setAutos({...autos,skin_followup:{...(autos.skin_followup||{}),mode:m}});
                const setPaused=(v)=>setAutos({...autos,paused:v});
                // Ready-made WhatsApp messages per lead status. A blank textarea
                // removes the key, so only real templates are persisted.
                const leadTemplates=(autos.lead_templates&&typeof autos.lead_templates==="object")?autos.lead_templates:{};
                const setLeadTemplate=(k,v)=>{
                  // Store "" rather than deleting the key: an explicit clear must
                  // stick, otherwise the default would reappear on the next open.
                  const next={...leadTemplates,[k]:v};
                  setAutos({...autos,lead_templates:next});
                };
                // True only when the tenant saved this status as empty on purpose.
                const isCleared=(k)=>Object.prototype.hasOwnProperty.call(leadTemplates,k)&&!String(leadTemplates[k]).trim();
                return(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5,marginBottom:2}}>הפעלה וכיבוי של כל התהליכים האוטומטיים במקום אחד.</p>

 <div style={{background:masterPaused?"rgba(242,184,75,0.12)":"var(--surface-2)",border:`1px solid ${masterPaused?"rgba(242,184,75,0.55)":"var(--line)"}`,borderRadius:12,padding:"2px 12px"}}>
 <AutoToggleRow pc={pc} label="⏸ השהיית כל האוטומציות" on={masterPaused} onChange={()=>setPaused(!masterPaused)} desc="עצירה זמנית של כל התהליכים האוטומטיים בקליניקה. ההגדרות של כל אוטומציה נשמרות ויחזרו כשתבטלי את ההשהיה." />
 </div>
 {masterPaused&&<p style={{fontSize:9.5,color:"var(--warning)",fontWeight:700,margin:"-2px 0 2px"}}>⏸ כל האוטומציות מושהות כרגע.</p>}

 <div>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>תזכורות ללקוחות</p>
 <AutoToggleRow pc={pc} label="תזכורת לתור (יום לפני)" on={onDefaultTrue("reminders_enabled")} onChange={()=>setFlag("reminders_enabled",!onDefaultTrue("reminders_enabled"))} desc="שליחת תזכורת אוטומטית בוואטסאפ ללקוחות שיש להן תור מחר." />
 <AutoToggleRow pc={pc} label="בקשת ביקורת (יומיים אחרי טיפול)" on={onDefaultTrue("review_requests_enabled")} onChange={()=>setFlag("review_requests_enabled",!onDefaultTrue("review_requests_enabled"))} desc="בקשה אוטומטית להשאיר ביקורת, נשלחת כיומיים לאחר הביקור." />
 <AutoToggleRow pc={pc} label="החזרת לקוחות רדומות (90+ יום)" on={onDefaultTrue("winback_enabled")} onChange={()=>setFlag("winback_enabled",!onDefaultTrue("winback_enabled"))} desc="הודעת התחדשות ללקוחות שלא ביקרו למעלה מ-90 יום." />
 <AutoToggleRow pc={pc} label="סיום חבילת טיפולים" on={onDefaultTrue("package_reminders_enabled")} onChange={()=>setFlag("package_reminders_enabled",!onDefaultTrue("package_reminders_enabled"))} desc="תזכורת אוטומטית ללקוחה שסיימה חבילת טיפולים, לקביעת המשך." />
 </div>

 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>וואטסאפ</p>
 <AutoToggleRow pc={pc} label="בוט הוואטסאפ החכם פעיל" on={botOn} onChange={()=>setFlag("bot_active",!botOn)} />
 {botOn&&(
 <div>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:6}}>מתי הבוט יענה?</p>
 <div style={{display:"flex",gap:6}}>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"always"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:(editSettings.bot_mode||"always")==="always"?`2px solid ${pc}`:"1px solid var(--line)",background:(editSettings.bot_mode||"always")==="always"?pcTint:"var(--surface)",color:pc}}>תמיד</button>
 <button onClick={()=>setEditSettings({...editSettings,bot_mode:"after_hours"})} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:editSettings.bot_mode==="after_hours"?`2px solid ${pc}`:"1px solid var(--line)",background:editSettings.bot_mode==="after_hours"?pcTint:"var(--surface)",color:pc}}>רק מחוץ לשעות העבודה</button>
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",marginTop:6}}>{editSettings.bot_mode==="after_hours"?"הבוט יענה רק כשאת לא בשעות/ימי העבודה — בשאר הזמן את עונה בעצמך.":"הבוט יענה לכל הודעה נכנסת, בכל שעה."}</p>
 </div>
 )}
 </div>

 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:8,fontWeight:600}}>מעקב עור חכם</p>
 <p style={{fontSize:11,fontWeight:600,color:"var(--ink-2)",marginBottom:2}}>הצעות מעקב לפי סריקות עור</p>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>הכנת הודעת המשך אישית ללקוחה לפי מגמת הסריקות שלה (למשל התקדמות שנעצרה או זמן להערכה מחדש). ההודעה תמיד ניתנת לעריכה לפני שליחה, ולעולם לא נשלח דבר ללא אישורך.</p>
 <div style={{display:"flex",gap:6,opacity:masterPaused?0.5:1}}>
                    {[["off","כבוי"],["approval","באישור"],["automatic","אוטומטי"]].map(([m,l])=>(
 <button key={m} onClick={()=>!masterPaused&&setSkinMode(m)} disabled={masterPaused} style={{flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:600,cursor:masterPaused?"default":"pointer",fontFamily:"inherit",border:skinMode===m?`2px solid ${pc}`:"1px solid var(--line)",background:skinMode===m?pcTint:"var(--surface)",color:pc}}>{l}</button>
                    ))}
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",marginTop:6}}>{skinMode==="off"?"כבוי — לא נוצרות הצעות.":skinMode==="approval"?"באישור — נכין עבורך הצעות, וכל הודעה תישלח רק לאחר אישורך.":"אוטומטי — יופעל בקרוב; בינתיים ההצעות ממתינות לאישורך (לא נשלח דבר אוטומטית)."}</p>
 </div>

 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
 <p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600}}>חיבור וואטסאפ (GreenAPI)</p>
 <span style={{fontSize:9.5,fontWeight:700,borderRadius:20,padding:"5px 11px",...(waConnected?{color:"var(--success)",background:"rgba(70,179,123,0.12)"}:{color:"var(--warning)",background:"rgba(242,184,75,0.16)"})}}>{waConnected?"מחובר ✓":"לא מחובר"}</span>
 </div>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>חברי את מספר הוואטסאפ שלך דרך GreenAPI כדי שההודעות (תזכורות, קבלות ועוד) יישלחו מהמספר שלך. את הפרטים תמצאי בקונסולת GreenAPI. אם לא תחברי — נשלח מהמספר הכללי של המערכת.</p>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <div><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>מזהה מכשיר (idInstance)</p><input value={editSettings.green_api_instance||""} onChange={e=>setEditSettings({...editSettings,green_api_instance:e.target.value})} placeholder="7103000000" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:"var(--surface-2)"}}/></div>
 <div><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>טוקן (apiTokenInstance)</p><input value={editSettings.green_api_token||""} onChange={e=>setEditSettings({...editSettings,green_api_token:e.target.value})} placeholder="••••••••••••••••" autoComplete="off" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:"var(--surface-2)"}}/></div>
 <div><p style={{fontSize:9,color:"var(--ink-3)",fontWeight:600,marginBottom:3}}>כתובת API (אופציונלי)</p><input value={editSettings.green_api_url||""} onChange={e=>setEditSettings({...editSettings,green_api_url:e.target.value})} placeholder="https://7103.api.greenapi.com" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"left",background:"var(--surface-2)"}}/></div>
 </div>
 </div>

 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:4,fontWeight:600}}>הודעות מוכנות לפי סטטוס פנייה</p>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5,marginBottom:8}}>ההודעה תיפתח מוכנה לשליחה כשתשלחי הודעה לפי סטטוס במסך הפניות. אפשר לכתוב {"{name}"} לשם הפונה ו-{"{clinic}"} לשם העסק. הנוסח האפור הוא ברירת המחדל שתישלח אם לא תשני דבר; אם תמחקי הכל, אותו סטטוס ייפתח ריק.</p>
 {LEAD_STATUS_KEYS.map(k=>(
 <div key={k} style={{marginBottom:8}}>
 <p style={{fontSize:9.5,color:LEAD_STATUS_COLORS[k].color,fontWeight:700,marginBottom:3}}>{LEAD_STATUS_LABELS[k]}</p>
 <textarea value={leadTemplates[k]||""} onChange={e=>setLeadTemplate(k,e.target.value)} rows={2}
   placeholder={DEFAULT_LEAD_TEMPLATES[k]||""}
   style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint,resize:"vertical",boxSizing:"border-box"}}/>
 {isCleared(k)&&<p style={{fontSize:8.5,color:"var(--warning)",fontWeight:700,marginTop:3}}>(נוקה — ייפתח ריק)</p>}
 </div>
 ))}
 </div>

 <div style={{borderTop:"1px solid var(--line)",paddingTop:12,marginTop:4}}>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:10,fontWeight:600}}>תפעול</p>
 <AutoToggleRow pc={pc} label="מילוי תור שהתפנה (הצעה בוואטסאפ)" on={gapOn} onChange={()=>setFlag("gap_fill_enabled",!gapOn)} desc="כשמופעל — כשמבטלים תור, נשלחת אוטומטית הודעת וואטסאפ אמיתית ללקוחות מתאימים עם קישור לתפוס את התור שהתפנה; הראשונה שתלחץ תופסת. כבוי כברירת מחדל." />
 <AutoToggleRow pc={pc} label="שליחת קבלה אוטומטית ללקוחה בוואטסאפ" on={receiptOn} onChange={()=>setFlag("send_receipt_auto",!receiptOn)} desc="כשמופעל — הקבלה נשלחת אוטומטית ללקוחה מיד לאחר יצירתה (רק אם יש לה מספר טלפון). כשכבוי — נשלחת רק בלחיצה ידנית." />
 </div>
 </div>
                );
              })()}
              {settingsTab==="services"&&(
 <div>
                  {services.length===0&&!showNewService&&(
 <div style={{textAlign:"center",padding:"22px 14px",background:pcTint,borderRadius:14,marginBottom:8}}>
 <div style={{fontSize:26,marginBottom:8}}>✦</div>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)",marginBottom:4}}>עדיין לא הוספת שירותים</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>הוסיפי את השירותים שאת מציעה עם המחיר ומשך הטיפול — הם יופיעו בקביעת תור ובקופה.</p>
 </div>
                  )}
                  {services.map((svc,idx)=>(
 <div key={idx} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:pcTint,borderRadius:12,marginBottom:5}}>
 <span style={{width:10,height:10,borderRadius:"50%",background:svc.color||"var(--warning)",flexShrink:0}}/>
 <input value={svc.name} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,name:e.target.value}:s))} style={{flex:1,minWidth:0,border:"none",background:"transparent",fontSize:11,fontFamily:"inherit",outline:"none",fontWeight:600,color:"var(--ink)"}}/>
 <input type="number" value={svc.price} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,price:Number(e.target.value)}:s))} style={{width:54,border:"1px solid var(--line)",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <input type="number" value={svc.duration} onChange={e=>setServices(prev=>prev.map((s,i)=>i===idx?{...s,duration:Number(e.target.value)}:s))} style={{width:44,border:"1px solid var(--line)",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <button onClick={()=>handleSaveService(svc,idx)} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ))}
                  {showNewService?(
 <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"var(--pc-tint)",borderRadius:12,marginTop:6}}>
 <input value={newService.name} onChange={e=>setNewService({...newService,name:e.target.value})} placeholder="שם שירות" style={{flex:1,minWidth:0,border:"1px solid var(--line)",borderRadius:8,padding:"4px 8px",fontSize:11,fontFamily:"inherit",outline:"none",background:"var(--surface)"}}/>
 <input type="number" value={newService.price} onChange={e=>setNewService({...newService,price:Number(e.target.value)})} placeholder="₪" style={{width:54,border:"1px solid var(--line)",borderRadius:8,padding:"4px 6px",fontSize:10,fontFamily:"inherit",outline:"none",textAlign:"center",background:"var(--surface)"}}/>
 <button onClick={handleAddService} className="icon-btn" style={{width:26,height:26,fontSize:11}}>✓</button>
 </div>
                  ):(
 <div style={{display:"flex",gap:6,marginTop:6}}>
 <button onClick={()=>setShowNewService(true)} style={{flex:2,background:pcTint,border:`1px dashed ${pc}`,borderRadius:12,padding:"8px 0",fontSize:11,color:pc,cursor:"pointer",fontFamily:"inherit"}}>+ הוסיפי שירות</button>
 {/* Same wizard as the client import, pointed at service_prices. */}
 <button onClick={openImportHub} style={{flex:1,background:"var(--surface)",border:"1px solid var(--line-2)",borderRadius:12,padding:"8px 0",fontSize:11,color:"var(--ink-2)",cursor:"pointer",fontFamily:"inherit"}}>ייבוא מחירון</button>
 </div>
                  )}
 </div>
              )}
              {settingsTab==="import"&&(
 <div>
 <p style={{fontSize:12.5,color:"var(--ink-2)",lineHeight:1.7,marginBottom:16}}>עוברת מתוכנה אחרת? אפשר להעביר את הנתונים לכאן בכמה דקות, בלי להקליד הכל מחדש. בחרי מה להעביר:</p>
                  {renderImportChooser()}
 </div>
              )}
              {settingsTab==="faq"&&(
 <div>
 <p style={{fontSize:10,color:"var(--ink-3)",lineHeight:1.6,marginBottom:10}}>שאלות ותשובות שתמלאי כאן ישמשו את הבוט בוואטסאפ — כשלקוחה תשאל שאלה דומה, הבוט יענה לפי התשובה שכתבת, במקום תשובה כללית.</p>
                  {(editSettings.faq||[]).length===0&&(
 <div style={{textAlign:"center",padding:"22px 14px",background:pcTint,borderRadius:14,marginBottom:8}}>
 <div style={{fontSize:26,marginBottom:8}}>✦</div>
 <p style={{fontSize:12.5,fontWeight:600,color:"var(--ink)",marginBottom:4}}>עדיין לא הוספת שאלות ותשובות</p>
 <p style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>הוסיפי שאלות נפוצות של לקוחות (חניה, ביטולים, מה כדאי להביא) עם התשובה שלך — והבוט יענה בדיוק כמוך.</p>
 </div>
                  )}
                  {(editSettings.faq||[]).map((f,idx)=>(
 <div key={idx} style={{background:pcTint,borderRadius:12,padding:"10px 10px 8px",marginBottom:6,position:"relative"}}>
 <button onClick={()=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).filter((_,i)=>i!==idx)})} className="icon-btn" style={{position:"absolute",top:8,left:8,width:24,height:24,fontSize:11}} title="מחיקה" aria-label="מחיקת שאלה">✕</button>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>שאלה</p>
 <input value={f.q||""} onChange={e=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).map((x,i)=>i===idx?{...x,q:e.target.value}:x)})} placeholder="למשל: יש חניה?" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:9,padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",fontWeight:600,color:"var(--ink)",marginBottom:6}}/>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>תשובה</p>
 <textarea value={f.a||""} onChange={e=>setEditSettings({...editSettings,faq:(editSettings.faq||[]).map((x,i)=>i===idx?{...x,a:e.target.value}:x)})} placeholder="התשובה שהבוט ייתן ללקוחה" rows={2} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:9,padding:"7px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",resize:"vertical",lineHeight:1.5}}/>
 </div>
                  ))}
 <button onClick={()=>setEditSettings({...editSettings,faq:[...(editSettings.faq||[]),{q:"",a:""}]})} style={{background:pcTint,border:`1px dashed ${pc}`,borderRadius:12,padding:"8px 0",width:"100%",fontSize:11,color:pc,cursor:"pointer",fontFamily:"inherit",marginTop:6}}>+ הוסף שאלה</button>
 </div>
              )}
              {settingsTab==="hours"&&(()=>{
                // Per-day hours live in the business_hours JSONB. We edit a
                // normalized { 0..6: {open,close}|null } map and, on every
                // change, also refresh the legacy start/end + working_days on
                // editSettings so the existing handleSaveSettings persists both
                // — keeping un-migrated readers correct. Save logic unchanged.
                const bh=normalizeBusinessHours(editSettings);
                const commit=(next)=>setEditSettings({...editSettings,business_hours:next,...legacyHoursFromMap(next)});
                const toggleDay=(d)=>{const next={...bh};next[d]=bh[d]?null:{open:9,close:18};commit(next);};
                const setOpen=(d,val)=>{const cur=bh[d]||{open:9,close:18};const open=Number(val);let close=cur.close;if(close<=open)close=Math.min(open+1,20);commit({...bh,[d]:{open,close}});};
                const setClose=(d,val)=>{const cur=bh[d]||{open:9,close:18};const close=Number(val);let open=cur.open;if(close<=open)open=Math.max(close-1,7);commit({...bh,[d]:{open,close}});};
                return(
 <div style={{display:"flex",flexDirection:"column",gap:6}}>
 <p style={{fontSize:9,color:"var(--ink-3)",lineHeight:1.5,marginBottom:2}}>הגדירי לכל יום אם את עובדת ובאילו שעות. יום כבוי מסומן כ״סגור״.</p>
 {DAYS_HE.map((label,d)=>{
   const dh=bh[d];const isOpen=!!dh;
   return(
 <div key={d} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:12,border:"1px solid var(--line-2)",background:isOpen?"var(--surface-2)":"var(--surface)",opacity:isOpen?1:0.6,transition:"opacity .2s"}}>
 <span style={{width:52,fontSize:12,fontWeight:600,color:"var(--ink)"}}>{label}</span>
 <Toggle on={isOpen} onChange={()=>toggleDay(d)} pc={pc} />
 {isOpen?(
 <div style={{display:"flex",alignItems:"center",gap:6,marginRight:"auto"}}>
 <select value={dh.open} onChange={e=>setOpen(d,e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:10,padding:"6px 8px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)"}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select>
 <span style={{fontSize:11,color:"var(--ink-3)"}}>–</span>
 <select value={dh.close} onChange={e=>setClose(d,e.target.value)} style={{border:"1px solid var(--line-2)",borderRadius:10,padding:"6px 8px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)"}}>{HOURS_ALL.map((h,i)=><option key={h} value={7+i}>{h}</option>)}</select>
 </div>
 ):(
 <span style={{marginRight:"auto",fontSize:11,color:"var(--ink-3)",fontWeight:600}}>סגור</span>
 )}
 </div>
   );
 })}
 </div>
                );
              })()}
              {settingsTab==="payment"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9}}>
 <div><p style={{fontSize:9,color:"var(--ink-2)",marginBottom:3}}>טלפון לביט / בקשות תשלום</p><input value={editSettings.business_phone||""} onChange={e=>setEditSettings({...editSettings,business_phone:e.target.value})} placeholder="050-0000000" style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface-2)"}}/></div>
 <p style={{fontSize:10,color:"var(--ink-3)",lineHeight:1.5}}>המספר הזה ישמש לבקשות תשלום ב-ביט שנשלחות ללקוחות </p>
 </div>
              )}
 </div>
 <div style={{display:"flex",gap:6,padding:"14px 24px",borderTop:"1px solid var(--line)"}}>
 <button onClick={()=>{setShowSettings(false);setEditSettings(null);}} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:12,color:"var(--ink-2)"}}>סגירה</button>
 <button onClick={handleSaveSettings} disabled={isBusy("saveSettings")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{isBusy("saveSettings")?"שומר...":"שמירה ✓"}</button>
 </div>
 </div>
 </div>
      )}

      {/* CLIENT PROFILE DRAWER */}
      {selectedClient&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",justifyContent:"flex-start",zIndex:1200}} onClick={()=>setSelectedClient(null)}>
 <div onClick={e=>e.stopPropagation()} className="client-drawer" style={{background:"var(--surface)",width:440,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"var(--shadow-xl)",borderLeft:"1px solid var(--line)"}}>
            {(()=>{
              const c=selectedClient;
              const appts=getClientAppts(c.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
              const cReceipts=getClientReceipts(c.id).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
              const cForms=getClientForms(c.id);
              const cPackages=getClientPackages(c.id);
              const total=getClientTotal(c.id);
              const days=getDaysSince(c.id);
              const statusColor=STATUS_COLORS[c.status]||"var(--warning)";
              return(<>
 <div style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"var(--surface)",position:"relative"}}>
 <button onClick={()=>setSelectedClient(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:30,height:30,color:"var(--surface)",fontSize:14,cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:14}}>
 <div style={{width:60,height:60,borderRadius:"50%",background:c.images?.[0]?"transparent":"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,overflow:"hidden",flexShrink:0}}>{c.images?.[0]?<SignedImage value={c.images[0]} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}} fallback={c.name[0]}/>:c.name[0]}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:23,fontWeight:600}}>{c.name}</h3>
 <p style={{fontSize:11,opacity:0.9}}>{c.phone||"אין טלפון"}</p>
 <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
 <span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{STATUS_LABELS[c.status]||"פעילה"}</span>
                        {c.skinType&&<span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20}}>{c.skinType}</span>}
                        {total>0&&<span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,fontWeight:700}}>₪{total.toLocaleString()}</span>}
 </div>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {c.phone&&<a href={waLink(c.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"var(--surface)",color:pc,borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditClient(c)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 {/* Book an appointment for THIS client — opens the existing new-appointment
     modal pre-filled with her (all the per-day-hours / no-double-booking /
     end-time logic is reused as-is). Closes the drawer so the modal is visible. */}
 <button onClick={()=>{const svc=activeServices[0];setNewAppt({clientId:c.id,name:c.name,service:svc?.name||"",duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");setSelectedClient(null);setShowModal(true);}} style={{display:"block",width:"100%",marginTop:8,background:"rgba(255,255,255,0.95)",color:pc,border:"none",borderRadius:20,padding:"9px 0",fontSize:11,fontWeight:700,textAlign:"center",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(0,0,0,0.10)"}}>✦ קביעת תור</button>
 <label style={{display:"block",marginTop:8,background:"rgba(255,255,255,0.95)",color:pc,borderRadius:20,padding:"9px 0",fontSize:11,fontWeight:700,textAlign:"center",cursor:scanLoading?"not-allowed":"pointer",opacity:scanLoading?0.6:1,pointerEvents:scanLoading?"none":"auto"}}>
 {scanLoading?"סורקת... 🔍":"✦ סריקת עור AI"}
 <input type="file" accept="image/*" capture="user" disabled={scanLoading} onChange={e=>{const f=e.target.files?.[0]; if(f) scanClientSkin(c,f); e.target.value="";}} style={{display:"none"}}/>
 </label>
 </div>

                {(()=>{
                  const insights=[];
                  if(days>90)insights.push({icon:"",text:`לא ביקרה ${days} ימים — שווה הודעת התחדשות`,color:"#5580C4"});
                  if(c.allergies)insights.push({icon:"",text:`אלרגיות: ${c.allergies}`,color:"var(--warning)"});
                  if(c.medical)insights.push({icon:"",text:`רפואי: ${c.medical}`,color:"#5580C4"});
                  if(total>2000)insights.push({icon:"",text:`לקוחה מובילה — ₪${total.toLocaleString()} סה״כ`,color:pc});
                  if(cPackages.length>0)insights.push({icon:"",text:`${cPackages.length} חבילות פעילות`,color:"var(--pc-deep)"});
                  if(insights.length===0)return null;
                  return(
 <div style={{padding:"14px 22px 0"}}>
                      {insights.map((ins,i)=>(
 <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:pcTint,borderRadius:12,marginBottom:6,borderRight:`3px solid ${ins.color}`}}>
 <span style={{fontSize:14}}>{ins.icon}</span>
 <p style={{fontSize:10.5,color:"var(--ink)",fontWeight:500}}>{ins.text}</p>
 </div>
                      ))}
 </div>
                  );
                })()}

 <div style={{display:"flex",gap:3,padding:"14px 22px 0",borderBottom:"1px solid var(--line)",overflowX:"auto"}}>
                  {[{k:"info",l:"פרטים"},{k:"history",l:`היסטוריה (${appts.length})`},{k:"scans",l:`סריקות עור (${clientScans.length})`},{k:"receipts",l:`קבלות (${cReceipts.length})`},{k:"packages",l:`חבילות (${cPackages.length})`},{k:"forms",l:`טפסים (${cForms.length})`},{k:"beforeafter",l:`לפני/אחרי (${clientPhotos.length})`},{k:"images",l:`תמונות (${c.images?.length||0})`}].map(t=>(
 <button key={t.k} onClick={()=>setClientTab(t.k)} style={{background:"none",border:"none",padding:"9px 9px",fontSize:10.5,fontWeight:clientTab===t.k?700:500,color:clientTab===t.k?pcDeep:"var(--ink-3)",borderBottom:clientTab===t.k?`2.5px solid ${pc}`:"2.5px solid transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"color 0.2s"}}>{t.l}</button>
                  ))}
 </div>

 <div style={{padding:"16px 22px"}}>
                  {clientTab==="info"&&(
 <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:11.5}}>
                      {c.birthday&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}><span style={{color:"var(--ink-2)"}}>יום הולדת</span><span style={{fontWeight:600}}>{c.birthday}</span></div>}
                      {c.skinType&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--surface-2)"}}><span style={{color:"var(--ink-2)"}}>סוג עור</span><span style={{fontWeight:600}}>{c.skinType}</span></div>}
                      {c.allergies&&<div style={{padding:"8px 10px",background:"var(--surface-2)",borderRadius:10,border:"1px solid rgba(242,184,75,0.16)"}}><p style={{color:"var(--warning)",fontWeight:700,fontSize:9,marginBottom:2}}>אלרגיות</p><p>{c.allergies}</p></div>}
                      {c.medical&&<div style={{padding:"8px 10px",background:"var(--surface-2)",borderRadius:10,border:"1px solid #A7C4F4"}}><p style={{color:"#5580C4",fontWeight:700,fontSize:9,marginBottom:2}}>רפואי</p><p>{c.medical}</p></div>}
                      {c.notes&&<div style={{padding:"8px 10px",background:pcTint,borderRadius:10}}><p style={{color:"var(--ink-2)",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p>{c.notes}</p></div>}
 </div>
                  )}
                  {clientTab==="history"&&(
                    appts.length===0?<p style={{fontSize:11,color:"var(--ink-3)"}}>אין היסטוריית תורים</p>
                    :appts.map(a=>(
 <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--surface-2)"}}>
 <span style={{width:8,height:8,borderRadius:"50%",background:a.color||"var(--warning)",flexShrink:0}}/>
 <div style={{flex:1}}><p style={{fontSize:11,fontWeight:600,color:"var(--ink)"}}>{a.service}</p><p style={{fontSize:9,color:"var(--ink-2)"}}>{a.date} · {fmtApptTime(a)}{a.price?` · ₪${a.price}`:""}</p></div>
                        {a.confirmation_status==="confirmed"&&<span style={{fontSize:8,color:"var(--success)"}}>✓</span>}
                        {c.phone&&<button onClick={()=>sendReminderToClient(a)} disabled={isBusy("sendReminder")} title="שלחי תזכורת" style={{flexShrink:0,background:pcTint,color:pcDeep,border:`1px solid ${pc}`,borderRadius:16,padding:"5px 10px",fontSize:9.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✉ שלחי תזכורת</button>}
 </div>
                    ))
                  )}
                  {clientTab==="scans"&&(
                    scansLoading?<p style={{fontSize:11,color:"var(--ink-3)"}}>טוען סריקות...</p>
                    :clientScans.length===0?<p style={{fontSize:11,color:"var(--ink-3)"}}>אין סריקות עדיין. לחצי על "סריקת עור AI" למעלה.</p>
                    :clientScans.map(s=>(
 <div key={s.id} onClick={()=>setViewScan(s)} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderBottom:"1px solid var(--surface-2)",cursor:"pointer"}}>
 {s.image_url?<SignedImage value={s.image_url} alt="" style={{width:46,height:46,borderRadius:10,objectFit:"cover",flexShrink:0}} fallback={<div style={{width:46,height:46,borderRadius:10,background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>✦</div>}/>:<div style={{width:46,height:46,borderRadius:10,background:pcTint,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>✦</div>}
 <div style={{flex:1}}>
 <p style={{fontSize:11.5,fontWeight:600,color:"var(--ink)"}}>{s.skin_type||"סריקת עור"}</p>
 <p style={{fontSize:9,color:"var(--ink-2)"}}>{new Date(s.created_at).toLocaleDateString("he-IL")}{s.report?.clinical_treatment?` · ${s.report.clinical_treatment}`:""}</p>
 </div>
 <div style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:`3px solid ${s.score>=75?"var(--success)":s.score>=50?"var(--warning)":pc}`,flexShrink:0}}><span style={{fontSize:12,fontWeight:800,color:s.score>=75?"var(--success)":s.score>=50?"var(--warning)":pc}}>{s.score}</span></div>
 </div>
                    ))
                  )}
                  {clientTab==="receipts"&&(
                    cReceipts.length===0?<p style={{fontSize:11,color:"var(--ink-3)"}}>אין קבלות</p>
                    :cReceipts.map(r=>(
 <div key={r.id} onClick={()=>setShowReceipt(r)} role="button" tabIndex={0} onKeyDown={onKbdActivate} aria-label={`פתיחת קבלה — ${r.client_name||"לקוחה"}`} className="client-row" style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",background:pcTint,borderRadius:10,marginBottom:5,cursor:"pointer"}}>
 <span style={{fontSize:13}}>{PAYMENT_METHODS.find(p=>p.key===r.payment_method)?.icon||""}</span>
 <div style={{flex:1}}><p style={{fontSize:10.5,fontWeight:600,color:"var(--ink)"}}>{r.service}</p><p style={{fontSize:8.5,color:"var(--ink-2)"}}>{r.created_at?.slice(0,10)} · {r.payment_method}</p></div>
 <span className="serif" style={{fontSize:13,fontWeight:600,color:pc}}>₪{r.amount}</span>
 </div>
                    ))
                  )}
                  {clientTab==="packages"&&(
                    cPackages.length===0?<p style={{fontSize:11,color:"var(--ink-3)"}}>אין חבילות פעילות</p>
                    :cPackages.map(pkg=>(
 <div key={pkg.id} style={{background:pcTint,borderRadius:12,padding:"11px 12px",marginBottom:7}}>
 <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><p style={{fontSize:11,fontWeight:700,color:"var(--ink)"}}>{pkg.service}</p><button onClick={()=>handleUsePackageSession(pkg)} style={{background:pcGrad,color:"var(--surface)",border:"none",borderRadius:14,padding:"3px 9px",fontSize:9,cursor:"pointer",fontFamily:"inherit"}}>✓ השתמשי</button></div>
 <div style={{display:"flex",gap:2}}>{Array.from({length:Number(pkg.total_sessions)},(_,i)=><div key={i} style={{flex:1,height:6,borderRadius:3,background:i<Number(pkg.used_sessions)?pc:"var(--pc-tint)"}}/>)}</div>
 <p style={{fontSize:8.5,color:"var(--ink-2)",marginTop:3}}>{pkg.used_sessions}/{pkg.total_sessions}</p>
 </div>
                    ))
                  )}
                  {clientTab==="forms"&&(
 <div>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:6}}>שלחי טופס לחתימה דיגיטלית</p>
 <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
                        {FORM_TYPES.map(ft=>(
 <button key={ft.key} onClick={()=>handleSendForm(c,ft.key)} style={{background:pcTint,border:"1px solid var(--line)",borderRadius:10,padding:"8px 11px",fontSize:10.5,color:"var(--ink)",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}>{ft.label}</button>
                        ))}
 </div>
                      {cForms.length>0&&<>
 <p style={{fontSize:9,color:"var(--ink-2)",marginBottom:5}}>טפסים קיימים</p>
                        {cForms.map(f=>(
 <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:f.status==="signed"?"var(--surface-2)":"var(--surface-2)",borderRadius:10,marginBottom:4}}>
 <span style={{fontSize:12}}>{f.status==="signed"?"✓":"⏳"}</span>
 <p style={{flex:1,fontSize:10,color:"var(--ink)"}}>{FORM_TYPES.find(ft=>ft.key===f.form_type)?.label||f.form_type}</p>
 <span style={{fontSize:8,color:f.status==="signed"?"var(--success)":"var(--warning)"}}>{f.status==="signed"?"נחתם":"ממתין"}</span>
 </div>
                        ))}
 </>}
 </div>
                  )}
                {clientTab==="beforeafter"&&(
 <div>
 {(()=>{
 let beforeFile=null, afterFile=null, taVal="", noteVal="";
 return(
 <div style={{background:pcTint,borderRadius:12,padding:"12px",marginBottom:14}}>
 <p style={{fontSize:10,color:"var(--ink-2)",fontWeight:600,marginBottom:8}}>הוספת תמונות לפני/אחרי</p>
 <div style={{display:"flex",gap:8,marginBottom:8}}>
 <label style={{flex:1,padding:"22px 0",background:"var(--surface)",border:`1px dashed ${pc}`,borderRadius:10,textAlign:"center",fontSize:10.5,color:pc,cursor:"pointer"}} id="ba-before-lbl">
 לפני
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{beforeFile=e.target.files?.[0]||null;const l=document.getElementById("ba-before-lbl");if(l&&beforeFile)l.style.borderStyle="solid";}}/>
 </label>
 <label style={{flex:1,padding:"22px 0",background:"var(--surface)",border:`1px dashed ${pc}`,borderRadius:10,textAlign:"center",fontSize:10.5,color:pc,cursor:"pointer"}} id="ba-after-lbl">
 אחרי
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{afterFile=e.target.files?.[0]||null;const l=document.getElementById("ba-after-lbl");if(l&&afterFile)l.style.borderStyle="solid";}}/>
 </label>
 </div>
 <input placeholder="שם הטיפול (לא חובה)" onChange={e=>{taVal=e.target.value;}} style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",marginBottom:6,boxSizing:"border-box"}}/>
 <input placeholder="הערה (לא חובה)" onChange={e=>{noteVal=e.target.value;}} style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:11,fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",marginBottom:8,boxSizing:"border-box"}}/>
 <button disabled={photoUploading} onClick={()=>uploadClientPhoto(beforeFile,afterFile,taVal,noteVal,c.id)} className="primary-btn" style={{width:"100%",padding:"10px 0",background:pcGrad,color:"var(--surface)",fontSize:12}}>{photoUploading?"מעלה...":"שמירת התמונות"}</button>
 </div>
 );
 })()}
 {clientPhotos.length===0?<p style={{fontSize:10,color:"var(--ink-3)",textAlign:"center",marginTop:8}}>אין תמונות לפני/אחרי עדיין</p>
 :clientPhotos.map(ph=>(
 <div key={ph.id} style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,padding:"10px",marginBottom:8}}>
 {(ph.treatment||ph.note)&&<p style={{fontSize:10.5,fontWeight:600,color:"var(--ink)",marginBottom:6}}>{ph.treatment}{ph.treatment&&ph.note?" · ":""}<span style={{fontWeight:400,color:"var(--ink-2)"}}>{ph.note}</span></p>}
 <div style={{display:"flex",gap:6}}>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:8.5,color:"var(--ink-2)",marginBottom:3}}>לפני</p>
 {ph.before_url?<SignedImage value={ph.before_url} alt="תמונת לפני הטיפול" style={{width:"100%",borderRadius:8,display:"block"}} fallback={<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"var(--ink-3)"}}>—</div>}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"var(--ink-3)"}}>—</div>}
 </div>
 <div style={{flex:1,textAlign:"center"}}>
 <p style={{fontSize:8.5,color:"var(--ink-2)",marginBottom:3}}>אחרי</p>
 {ph.after_url?<SignedImage value={ph.after_url} alt="תמונת אחרי הטיפול" style={{width:"100%",borderRadius:8,display:"block"}} fallback={<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"var(--ink-3)"}}>—</div>}/>:<div style={{padding:"24px 0",background:pcTint,borderRadius:8,fontSize:9,color:"var(--ink-3)"}}>—</div>}
 </div>
 </div>
 <p style={{fontSize:8,color:"var(--ink-3)",marginTop:5,textAlign:"left"}}>{new Date(ph.created_at).toLocaleDateString("he-IL")}</p>
 </div>
 ))}
 </div>
                  )}
                  {clientTab==="images"&&(
 <div>
 <label style={{display:"block",background:pcTint,border:`1px dashed ${pc}`,borderRadius:12,padding:"14px 0",textAlign:"center",fontSize:11,color:pc,cursor:"pointer",marginBottom:10}}> {uploading?"מעלה...":"העלי תמונה"}
 <input type="file" accept="image/*" onChange={e=>handleUploadImage(e,c)} style={{display:"none"}} disabled={uploading}/>
 </label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                        {(c.images||[]).map((img,i)=>(
 <div key={i} style={{position:"relative",paddingBottom:"100%",borderRadius:10,overflow:"hidden",background:pcTint}}>
 <SignedImage value={img} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
 <button onClick={()=>handleDeleteImage(c,img)} style={{position:"absolute",top:3,left:3,background:"rgba(0,0,0,0.45)",border:"none",borderRadius:"50%",width:20,height:20,color:"var(--surface)",fontSize:9,cursor:"pointer"}}>✕</button>
 </div>
                        ))}
 </div>
                      {(!c.images||c.images.length===0)&&<p style={{fontSize:10,color:"var(--ink-3)",textAlign:"center",marginTop:8}}>אין תמונות עדיין</p>}
 </div>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>
      )}

      {/* SKIN SCAN RESULT MODAL */}
      {/* SKIN-SCAN LOADING OVERLAY — calm, on-brand, cycles reassuring steps */}
      {scanLoading&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1400,padding:14}}>
 <div className="pop-in" style={{background:"var(--surface)",borderRadius:24,padding:"32px 30px",width:320,maxWidth:"100%",textAlign:"center",boxShadow:"var(--shadow-xl)",border:"1px solid var(--line)"}}>
 <motion.div animate={{scale:[1,1.12,1],opacity:[0.82,1,0.82]}} transition={{duration:1.6,repeat:Infinity,ease:"easeInOut"}} style={{width:78,height:78,borderRadius:"50%",margin:"0 auto 18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,background:pcGrad,boxShadow:`0 10px 26px ${pcShadow}`}}>🔍</motion.div>
 <p className="serif" style={{fontSize:18,fontWeight:600,color:"var(--ink)",marginBottom:8}}>מנתחת את העור...</p>
 <p style={{fontSize:12.5,color:pcDeep,fontWeight:600,minHeight:18}}>{SCAN_STEPS[scanStep%SCAN_STEPS.length]}</p>
 <div style={{display:"flex",gap:5,justifyContent:"center",marginTop:16}}>
                {SCAN_STEPS.map((_,i)=><span key={i} style={{width:6,height:6,borderRadius:"50%",background:i===scanStep%SCAN_STEPS.length?pc:"var(--line-2)",transition:"background 0.3s"}}/>)}
 </div>
 </div>
 </div>
      )}

      {(scanReport||viewScan)&&(()=>{ const SR = scanReport || viewScan.report; const closeModal=()=>{setScanReport(null);setViewScan(null);}; return (
 <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1300,padding:14}} onClick={closeModal}>
 <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:20,maxWidth:420,width:"100%",maxHeight:"88vh",overflowY:"auto",padding:"22px 22px"}}>
 {viewScan?.image_url&&<SignedImage value={viewScan.image_url} alt="תמונת סריקת עור" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:14,marginBottom:14}}/>}
 <div style={{textAlign:"center",marginBottom:14}}>
 <div style={{width:90,height:90,borderRadius:"50%",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",border:`6px solid ${SR.score>=75?"var(--success)":SR.score>=50?"var(--warning)":pc}`}}>
 <span style={{fontSize:30,fontWeight:800,color:SR.score>=75?"var(--success)":SR.score>=50?"var(--warning)":pc}}>{SR.score}</span>
 </div>
 <p className="serif" style={{fontSize:16,fontWeight:600,color:"var(--ink)",marginTop:10}}>{SR.skin_type}</p>
 </div>
 {SR.summary&&<p style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.6,textAlign:"center",marginBottom:14}}>{SR.summary}</p>}
 {SR.concerns?.length>0&&(
 <div style={{marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:"var(--ink)",marginBottom:6}}>ממצאים</p>
 {SR.concerns.map((c,i)=>(<p key={i} style={{fontSize:11.5,color:"var(--ink-2)",marginBottom:3}}>• {c}</p>))}
 </div>
 )}
 {SR.clinical_treatment&&(
 <div style={{background:pcTint,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:10,color:"var(--ink-2)",marginBottom:2}}>טיפול מומלץ</p>
 <p style={{fontSize:14,fontWeight:700,color:pc}}>{SR.clinical_treatment}</p>
 {SR.matched_service&&<p style={{fontSize:11,color:"var(--ink-2)",marginTop:2}}>אצלך: {SR.matched_service}</p>}
 </div>
 )}
 {SR.clinic_plan&&(
 <div style={{background:"var(--surface)",borderRadius:14,padding:"12px 16px",marginBottom:12,border:"1.5px solid var(--line)"}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:6}}>✦ תכנית טיפול בקליניקה</p>
 {SR.clinic_plan.treatment_type&&<p style={{fontSize:11.5,color:"var(--ink)",fontWeight:600,marginBottom:3}}>{SR.clinic_plan.treatment_type}</p>}
 {SR.clinic_plan.sessions&&<p style={{fontSize:11,color:"var(--ink-2)",marginBottom:6}}>{SR.clinic_plan.sessions}</p>}
 {SR.clinic_plan.steps?.length>0&&SR.clinic_plan.steps.map((s,i)=>(<p key={i} style={{fontSize:11,color:"var(--ink)",lineHeight:1.5,marginBottom:2}}>• {s}</p>))}
 {SR.clinic_plan.expected_results&&<p style={{fontSize:10.5,color:"var(--success)",marginTop:6}}>תוצאה צפויה: {SR.clinic_plan.expected_results}</p>}
 </div>
 )}
 {SR.home_plan&&(
 <div style={{background:pcTint,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
 <p style={{fontSize:12,fontWeight:700,color:pc,marginBottom:6}}>✦ תכנית טיפוח לבית</p>
 {SR.home_plan.summary&&<p style={{fontSize:11,color:"var(--ink)",lineHeight:1.5,marginBottom:6}}>{SR.home_plan.summary}</p>}
 {SR.home_plan.products?.length>0&&SR.home_plan.products.map((p,i)=>(<p key={i} style={{fontSize:11,color:"var(--ink)",lineHeight:1.5,marginBottom:2}}>• {p}</p>))}
 {SR.home_plan.tips?.length>0&&SR.home_plan.tips.map((t,i)=>(<p key={i} style={{fontSize:10.5,color:"var(--ink-2)",lineHeight:1.5,marginTop:i===0?6:2}}>טיפ: {t}</p>))}
 </div>
 )}
 {SR.therapist_notes&&(
 <div style={{background:"var(--surface-2)",borderRadius:14,padding:"12px 16px",marginBottom:12,border:"1px solid var(--pc-tint)"}}>
 <p style={{fontSize:11,fontWeight:700,color:"var(--pc-deep)",marginBottom:6}}>הערות למטפלת</p>
 {SR.therapist_notes.skin_assessment&&<p style={{fontSize:11,color:"var(--ink)",lineHeight:1.5,marginBottom:6}}>{SR.therapist_notes.skin_assessment}</p>}
 {SR.therapist_notes.protocol&&<p style={{fontSize:11,color:"var(--ink)",lineHeight:1.5}}><b>פרוטוקול:</b> {SR.therapist_notes.protocol}</p>}
 {SR.therapist_notes.cautions&&<p style={{fontSize:10.5,color:"var(--danger)",lineHeight:1.5,marginTop:6}}>⚠️ {SR.therapist_notes.cautions}</p>}
 </div>
 )}
 <div style={{background:pcTint,borderRadius:12,padding:"10px 13px",margin:"2px 0 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
 <span style={{fontSize:13,flexShrink:0,lineHeight:1.5}}>ℹ️</span>
 <p style={{fontSize:10,color:"var(--ink-2)",lineHeight:1.6,textAlign:"right"}}>זוהי הערכת AI ראשונית בלבד ואינה מהווה אבחון רפואי. לתכנית טיפול מלאה ומדויקת מומלץ להתייעץ עם הקוסמטיקאית.</p>
 </div>
 {/* Next step: book the matched treatment (reuses the drawer's booking opener,
     pre-filled with her + the AI-matched service). Turns the scan's best moment
     from a dead end into a booking. Primary action when a service was matched. */}
 {selectedClient&&SR.matched_service&&(()=>{const svc=activeServices.find(s=>s.name===SR.matched_service);return(
 <button onClick={()=>{const c=selectedClient;setEditingAppointmentId(null);setNewAppt({clientId:c.id,name:c.name,service:svc?.name||SR.matched_service,duration:svc?.duration||60,date:formatDate(new Date()),hour:settings.working_hours_start,price:svc?.price||0});setApptNote("");closeModal();setSelectedClient(null);setShowModal(true);}} className="primary-btn" style={{width:"100%",padding:"12px 0",background:pcGrad,color:"var(--surface)",fontSize:13,marginBottom:8}}>✦ קבעי טיפול {SR.matched_service}</button>
 );})()}
 <button onClick={closeModal} className="primary-btn" style={{width:"100%",padding:"12px 0",background:(selectedClient&&SR.matched_service)?"var(--surface)":pcGrad,color:(selectedClient&&SR.matched_service)?"var(--ink-2)":"var(--surface)",border:(selectedClient&&SR.matched_service)?"1px solid var(--line-2)":"none",fontSize:13}}>סגירה</button>
 {!viewScan&&<p style={{fontSize:9.5,color:"var(--ink-3)",textAlign:"center",marginTop:8}}>הסריקה נשמרה לכרטיס הלקוחה</p>}
 </div>
 </div>
      ); })()}

      {/* LEAD PROFILE DRAWER */}
      {selectedLead&&(
 <div style={{position:"fixed",inset:0,background:"rgba(43,34,51,0.45)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",display:"flex",justifyContent:"flex-start",zIndex:1200}} onClick={()=>setSelectedLead(null)}>
 <div onClick={e=>e.stopPropagation()} className="lead-drawer" style={{background:"var(--surface)",width:400,maxWidth:"100%",height:"100%",overflowY:"auto",boxShadow:"var(--shadow-xl)",borderLeft:"1px solid var(--line)"}}>
            {(()=>{
              const l=selectedLead;
              const st=leadStatusMeta(l.status);
              return(<>
 <div style={{background:`linear-gradient(135deg,${pc2} 0%,${pc} 100%)`,padding:"22px 22px 18px",color:"var(--surface)",position:"relative"}}>
 <button onClick={()=>setSelectedLead(null)} style={{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.25)",border:"none",borderRadius:"50%",width:30,height:30,color:"var(--surface)",fontSize:14,cursor:"pointer"}}>✕</button>
 <div style={{display:"flex",alignItems:"center",gap:13}}>
 <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{SOURCE_ICONS[l.source]||""}</div>
 <div style={{flex:1}}>
 <h3 className="serif" style={{fontSize:21,fontWeight:600}}>{l.name}</h3>
 <p style={{fontSize:11,opacity:0.9}}>{l.phone||"אין טלפון"}</p>
 <span style={{fontSize:8,background:"rgba(255,255,255,0.25)",padding:"2px 8px",borderRadius:20,marginTop:4,display:"inline-block"}}>{SOURCE_ICONS[l.source]} {l.source}</span>
 </div>
 </div>
 <div style={{display:"flex",gap:6,marginTop:14}}>
                    {l.phone&&<a href={waLink(l.phone)} target="_blank" rel="noreferrer" style={{flex:1,background:"var(--surface)",color:pc,borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none"}}>וואטסאפ</a>}
 <button onClick={()=>openEditLead(l)} style={{flex:1,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✎ עריכה</button>
 </div>
 {/* One-click send to THIS lead, prefilled from the template saved for her
     current status. Opens the same confirm flow as a group send. */}
 {l.phone&&(
 <button onClick={()=>openBulk(l.status,l)} style={{width:"100%",marginTop:6,background:"rgba(255,255,255,0.25)",color:"var(--surface)",border:"none",borderRadius:20,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>הודעה מוכנה</button>
 )}
 </div>
 <div style={{padding:"16px 22px"}}>
 <p style={{fontSize:9,color:"var(--ink-3)",marginBottom:6,fontWeight:600}}>סטטוס</p>
 <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:16}}>
                    {Object.entries(LEAD_STATUSES).map(([key,s])=>(
 <button key={key} onClick={()=>handleUpdateLeadStatus(l,key)} style={{padding:"6px 11px",border:"1px solid",borderColor:l.status===key?s.color:"var(--line-2)",borderRadius:20,background:l.status===key?s.bg:"var(--surface)",color:l.status===key?s.color:"var(--ink-2)",fontSize:9.5,cursor:"pointer",fontFamily:"inherit",fontWeight:l.status===key?700:500}}>{s.label}</button>
                    ))}
 </div>
                  {l.service_interest&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:11.5}}><span style={{color:"var(--ink-3)"}}>תחום עניין</span><span style={{fontWeight:600,color:"var(--ink)"}}>{l.service_interest}</span></div>}
                  {l.created_at&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:11.5}}><span style={{color:"var(--ink-3)"}}>נוצר</span><span style={{color:"var(--ink)"}}>{l.created_at.slice(0,10)}</span></div>}
                  {/* Contact trail. Reads "טרם יצרת קשר" until the first
                      successful WhatsApp send from the app. */}
 <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--line)",fontSize:11.5}}><span style={{color:"var(--ink-3)"}}>יצירת קשר</span><span style={{color:l.last_contacted_at?"var(--ink)":"var(--ink-3)",fontWeight:l.last_contacted_at?600:400}}>{contactSummaryHe(l)}</span></div>
 <div style={{marginTop:12}}>
 <p style={{fontSize:9,color:"var(--ink-3)",marginBottom:4,fontWeight:600}}>תזכורת מעקב</p>
 <input type="date" value={l.reminder_date||""} onChange={e=>handleSetReminder(l,e.target.value)} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:12,padding:"9px 12px",fontSize:12,fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 </div>
                  {l.notes&&<div style={{marginTop:12,padding:"10px 12px",background:"var(--pc-tint)",borderRadius:12}}><p style={{color:"var(--ink-3)",fontWeight:700,fontSize:9,marginBottom:2}}>הערות</p><p style={{fontSize:11,color:"var(--ink)"}}>{l.notes}</p></div>}
                  {l.status!=="closed"&&l.status!=="lost"&&l.status!=="irrelevant"&&(
 <button onClick={()=>handleConvertLead(l)} className="primary-btn" style={{width:"100%",marginTop:16,background:"var(--success)",color:"var(--surface)",borderRadius:24,padding:"12px 0",fontSize:12,fontWeight:700,boxShadow:"0 8px 18px rgba(70,179,123,0.3)"}}>✓ המירי ללקוחה רשומה</button>
                  )}
 </div>
 </>);
            })()}
 </div>
 </div>
      )}

 </div>
  );
}

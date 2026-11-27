"use client";
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { parseDb } from "@/lib/dbTime";
import { normalizeIsraeliMobile, waLink as waMsgLink } from "@/lib/phone";
import { APP_URL } from "@/lib/appUrl";
import { displayName } from "@/lib/personName";
import { SETTINGS_SWATCHES, swatchLabel } from "@/lib/brandSwatches";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import { daysSinceLastVisit, isActiveClient, isColdClient, winbackDaysOf } from "@/lib/clientActivity";
import FloralCorners from "./FloralCorners";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, clientImagePath, toStoragePath } from "../lib/clientImages";
import { dayHoursFrom, normalizeBusinessHours, legacyHoursFromMap, nextOpenDay, newApptStart } from "@/lib/businessHours";
import { planState } from "@/lib/planState";
import { WRITE_BLOCKED_TOAST_HE, DISABLED_REASON_HE, READ_ONLY_BADGE_HE } from "@/lib/planCopy";
import { LEAD_STATUS_KEYS, LEAD_STATUS_LABELS, LEGACY_LEAD_STATUS_LABELS } from "@/lib/leads/statuses";
import { renderLeadTemplate, resolveLeadTemplate, hasLeadPlaceholders, pickPreviewLead, DEFAULT_LEAD_TEMPLATES } from "@/lib/leads/templates";
import { matchesQuery } from "@/lib/search/matchQuery";
import { contactAgoHe, contactSummaryHe } from "@/lib/leads/contact";
import { hexToRgb, lighten, darken, applyAccentTokens, accentStyle, DEFAULT_ACCENT } from "@/lib/theme";
import { LOGO_COMPACT, BRAND_WASH, FLORAL_BLUSH, FLORAL_LILAC, FLOWER_64, FLOWER_128, FLOWER_256, ROSE_DIVIDER, ICON_QUESTION, ICON_MICROPHONE, ICON_HEART, ICON_FLOWER, ICON_CALENDAR, ICON_PERSON, ICON_ENVELOPE, ICON_WALLET, ICON_FRAME, ICON_SPARKLE, BANNER_WIDE, BANNER_WIDE_W, BANNER_WIDE_H } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import TrialNudge from "./TrialNudge";
import FirstBookingCard from "./FirstBookingCard";
import { firstBookingCardEnabled, firstBookingSteps, firstBookingRecord, firstBookingView, showSetupOnToday, showAttentionOnToday, firstBookingStorageKey, firstLinkMessage, FIRST_BOOKING_KEY } from "@/lib/firstBooking";
import FeedbackBanner from "./FeedbackBanner";
import { usePendingSaveCount, flushPendingSaves, clearPendingSaves } from "./pendingSaves";
import BillingNotices from "./BillingNotices";
import { addonPackForMessage, OPEN_ADDONS_EVENT } from "@/lib/addonOffer";
import { openUpgrades } from "@/lib/upgradesStore";
import { addonButtonHe } from "@/lib/pricing";
// "שדרוגים ✨": the one-tap store for what she buys from Kalmea, its entry points, and the chip on each metered screen.
import UpgradesStore, { UpgradeChip, UpgradesEntry, loadUpgrades, packAvailable, setUpgradesIdentity, clearUpgrades } from "./UpgradesStore";
import PlanBlockedScreen from "./PlanBlockedScreen";
const BillingCard = dynamic(() => import("./BillingCard"), { ssr: false });
const BusinessReferralCard = dynamic(() => import("./BusinessReferralCard"), { ssr: false });
const OnboardingTour = dynamic(() => import("./OnboardingTour"), { ssr: false });
import { isDemoTenantId } from "@/lib/demoTenants";
import { installDemoOutboundGuard } from "@/lib/demoOutbound";
import { CESDK_POC } from "./cesdk-poc/flag"; // cesdk-poc: dev-only proof of concept, see app/cesdk-poc/README.md
const CesdkReelPoc = dynamic(() => import("./cesdk-poc/ReelPoc"), { ssr: false });
// The design studio: templates in her branding, her saved designs (lib/design + app/design).
const DesignStudio = dynamic(() => import("./design/DesignStudio"), { ssr: false });
// "צילום אחרי טיפול": one photo -> a ready post + story (app/design/PhotoToPost.jsx), from the dashboard and a client card.
const PhotoToPost = dynamic(() => import("./design/PhotoToPost"), { ssr: false });
// "רילס מהצילומים שלי": her own photos and clips -> a reel in her brand (app/design/OwnReel.jsx), reached from the photo sheet.
const OwnReel = dynamic(() => import("./design/OwnReel"), { ssr: false });
import EmptyState from "./EmptyState";
import Sheet from "./Sheet";
import Spinner from "./Spinner";
import DeferredGate from "./DeferredGate";
import Icon from "./Icon";
import { startMinute, endMinute, fmtTime, fmtApptTime, startFields, toMinutes, clashesWith, slotsBetween } from "@/lib/apptTime";
import { eveningSummaryOn, withEveningSummary } from "@/lib/eveningSummarySetting";
import { exemptCeilingWarning } from "@/lib/vatExemptCeiling";
import { bufferLookup, businessBufferDefault, cleanBufferMinutes, bufferedRange, clashesWithBuffer, BUFFER_OPTIONS, SERVICE_BUFFER_PENDING_HE, SERVICE_BUFFER_LABEL_HE } from "@/lib/serviceBuffer";
import { suggestedRebookDays, cleanRebookDays, typedRebookDays, rebookVisible } from "@/lib/reminders/rebookPlan.js";
import { waitlistOffersOn, waitlistOffersVisible, waitlistOfferToast } from "@/lib/waitlistFlag.js";
import { DISMISS_KEY as SUGGEST_DISMISS_KEY } from "@/lib/automationSuggest.js";
import { firstFreeStart } from "@/lib/apptFirstFree";
import { isPersonal, isClientAppointment, isAllDay, PERSONAL, ALL_DAY_DURATION } from "@/lib/calendarKind";
import { isMissingColumnError, missingColumnName } from "@/lib/pgError";
import { apptBufferField, writeWithApptBuffer } from "@/lib/apptBuffer";
import { loyaltyConfig, loyaltyState, rewardAtTill, afterSaveLine, messageMoment, loyaltyMessage, isMissingLoyaltyTable, isRewardReceipt, rewardGivenOn, loyaltyLedgersSettled, rewardIsStale } from "@/lib/loyalty";
import LoyaltySettings from "./LoyaltySettings";
import LoyaltyClientCard from "./LoyaltyClientCard";
import { paymentsOf, isSplit, validateSplit, discountAmount, liveReceipts, voidOf, voidedIds, totalsOf, receiptsOnDay, monthSummary, bucketByMethod, paidWith, localDayKey, SPLIT_METHOD, mostUsedMethod } from "@/lib/till";
import { docLabelHe, PAYMENT_NOTICE_HE, PAYMENT_NOTICES_HE, legalStateHe, creditStateHe, needsLegalDoc } from "@/lib/legalReceipts/policy";
import { effectiveMode, periodFilter, periodLabel, incomeTotals } from "@/lib/incomePeriod";
import { monthlyReport } from "@/lib/monthlyReport";
import { tourOnNavigate, tourResumeStep, tourStrandedOutsideSettings, tourMayStart, tourStepsFor } from "@/lib/tourFlow";
import { NO_SHOW, clientReliability, reliabilityLine, canMarkNoShow, recurrenceDates, shortDates, applyPersonalPreset, PERSONAL_PRESETS } from "@/lib/reliability";
import { tightGapAppointmentIds, TIGHT_GAP_MINUTES } from "@/lib/scheduleGaps";
import { durationOutcome, durationOutcomeHe } from "@/lib/durationDrift";
import { greet as msgGreet, lines as msgLines, mapsLink as msgMapsLink, hebrewDate as msgHebrewDate, moveLine as msgMoveLine } from "@/lib/messages.js";

// " היום" / " מחר" from the appointment's own date at the moment the text is built, never assumed (2026-11-02 audit).
function dayWordFor(dateStr) {
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const diff = Math.round((Date.parse(String(dateStr).slice(0, 10)) - Date.parse(todayIL)) / 86_400_000);
  return diff === 0 ? " היום" : diff === 1 ? " מחר" : "";
}
import { resizeImage, IMAGE_PRESETS, MAX_SOURCE_BYTES, TOO_LARGE_SOURCE_HE, COULD_NOT_SHRINK_HE, notUploadable } from "@/lib/imageResize";
import { readAllRows } from "@/lib/pagedRead";
import { historyCutoff, mergeById } from "@/lib/historyWindow";
import { advisorWaitLine } from "@/lib/advisorWait";
import { defaultHowIWork, defaultHeroHeadline, defaultValueProps } from "@/lib/branding";
import { STUCK_HE, SAVE_FAILED_HE, couldNotHe } from "@/lib/errorCopy";
import { LUNCH_DEFAULT } from "@/lib/lunchBreak";
import { buildClosingList, ALL_CLEAR_HE } from "@/lib/closingList";
import { buildNextClientBrief, untilHe } from "@/lib/nextClient";
import { serviceImage, defaultImageUrl } from "@/lib/defaultImages";
const ResultsManager = dynamic(() => import("./ResultsManager"), { ssr: false });
import ChromeFlowerBg from "./ChromeFlowerBg";
import { quietStatus } from "@/lib/quiet";
import { slugError } from "@/lib/slug";
import { latinSlugFromName } from "@/lib/latinSlug";
import * as Sentry from "@/lib/sentryLazy";
import { supportWhatsAppUrl, SUPPORT_WHATSAPP_MESSAGE, SUPPORT_TEAM_HE } from "@/lib/support";
import HelpChat from "./HelpChat";
const LeadImportModal = dynamic(() => import("./LeadImportModal"), { ssr: false });
const LapsedClientsModal = dynamic(() => import("./LapsedClientsModal"), { ssr: false });
// Loaded after the home screen is up: it pulls the template catalogue for today's post suggestion.
const MarketingToday = dynamic(() => import("./MarketingToday"), { ssr: false });
import { canMarket, marketingStatus, withMarketingFooter, withAdLabel, consentFields, optOutFields, MARKETING_FOOTER } from "@/lib/marketingConsent";
import { DEFAULT_LEAD_SOURCES, resolveLeadSources, sourceLabelHe } from "@/lib/leadSources";
import { buildSourceReport } from "@/lib/sourceReport";
const LeadSourcesEditor = dynamic(() => import("./LeadSourcesEditor"), { ssr: false });
const SourceReport = dynamic(() => import("./SourceReport"), { ssr: false });
import GoalsCard from "./GoalsCard";
const GoalsEditor = dynamic(() => import("./GoalsEditor"), { ssr: false });
const VisitFeedbackPanel = dynamic(() => import("./VisitFeedbackPanel"), { ssr: false });
const BookingButtonsCard = dynamic(() => import("./BookingButtonsCard"), { ssr: false });
// "להימצא בגוגל" in the content tab (lib/googleKit.ts). Renders nothing unless NEXT_PUBLIC_GOOGLE_KIT is on.
const GoogleKitCard = dynamic(() => import("./GoogleKitCard"), { ssr: false });
const GrowCard = dynamic(() => import("./GrowCard"), { ssr: false });
const PaymentsSettings = dynamic(() => import("./PaymentsSettings"), { ssr: false });
// Panels that open only inside Settings, the till or a sheet: loaded when first shown, not in the dashboard's first download (2026-11-02
// audit; the app chunk was ~311 KB gzipped). Same pattern as GrowCard.
const ClientPrivacyPanel = dynamic(() => import("./ClientPrivacyPanel"), { ssr: false });
const ImportChooser = dynamic(() => import("./ImportChooser"), { ssr: false });
// "מעבר מתוכנה אחרת": a CSV / Excel export from any system. Renders nothing unless NEXT_PUBLIC_IMPORT_TOOL is on.
const ImportFromSystem = dynamic(() => import("./ImportFromSystem"), { ssr: false });
// Kalmea Academy: renders nothing unless NEXT_PUBLIC_ACADEMY is on and she can open a course (app/AcademyNavEntry.jsx).
const AcademyNavEntry = dynamic(() => import("./AcademyNavEntry"), { ssr: false });
// The protocol book: renders nothing unless NEXT_PUBLIC_PROTOCOL_BOOK is on (app/ProtocolBookNavEntry.jsx).
const ProtocolBookNavEntry = dynamic(() => import("./ProtocolBookNavEntry"), { ssr: false });
// The protocol on an appointment and the client's courses: both render nothing while the book is off.
const ApptProtocolCard = dynamic(() => import("./ApptProtocolCard"), { ssr: false });
const ClientProtocolCourses = dynamic(() => import("./ClientProtocolCourses"), { ssr: false });
const ACADEMY_ON = academyEnabled();
const WaitlistOfferSetting = dynamic(() => import("./WaitlistOfferSetting"), { ssr: false });
const WaAutoMessagesSetting = dynamic(() => import("./WaAutoMessagesSetting"), { ssr: false });
const RebookSetting = dynamic(() => import("./RebookSetting"), { ssr: false });
const WaitlistActivity = dynamic(() => import("./WaitlistActivity"), { ssr: false });
const AutomationSuggestCard = dynamic(() => import("./AutomationSuggestCard"), { ssr: false });
const GrowChargePanel = dynamic(() => import("./GrowChargePanel"), { ssr: false });
const GrowCashierCredit = dynamic(() => import("./GrowCashierCredit"), { ssr: false });
// Client memberships (lib/memberships.ts): the till tab, the client card and the till credit. Each renders nothing unless
// NEXT_PUBLIC_CLIENT_MEMBERSHIPS is on AND the server says memberships are available for her (Grow connected, saved-card credentials).
const MembershipsPanel = dynamic(() => import("./MembershipsPanel"), { ssr: false });
const MembershipClientCard = dynamic(() => import("./MembershipClientCard"), { ssr: false });
const MembershipTill = dynamic(() => import("./MembershipTill"), { ssr: false });
import { clientMembershipsEnabled, MEMBERSHIP_PAYMENT } from "@/lib/membershipFlag";
// Gift vouchers (lib/giftVouchers.ts): the cashier list and sale, the till redemption, the settings. Each renders nothing unless the
// platform flag automations.feature_flags.gift_vouchers is on.
const GiftVouchersPanel = dynamic(() => import("./GiftVouchersPanel"), { ssr: false });
const VoucherRedeemTill = dynamic(() => import("./VoucherRedeemTill"), { ssr: false });
const GiftVoucherSettings = dynamic(() => import("./GiftVoucherSettings"), { ssr: false });
const GiftVoucherMarketingCard = dynamic(() => import("./GiftVoucherMarketingCard"), { ssr: false });
// Products and inventory (lib/products.ts): the catalog screen in the till tab, the till picker and its stock warnings. On by default;
// each renders nothing when products are switched off (platform flag or her own switch) or before the migration has run.
const ProductsPanel = dynamic(() => import("./ProductsPanel"), { ssr: false });
const ProductSettings = dynamic(() => import("./ProductSettings"), { ssr: false });
import { ProductTillPicker, ProductTillWarnings } from "./ProductsTill";
import useProducts from "./useProducts";
import { lowStockAttention, productsConfig } from "@/lib/products";
import { tillTabsOf, activeTillTab } from "@/lib/tillTabs";
import { VOID_REFUND_HE } from "@/lib/grow/voidRefund";
import { REFUND_STATE_HE, REFUND_STUCK_HE, stateFromVoidRefundAnswer } from "@/lib/grow/refundFollowups";
const DepositLinkSheet = dynamic(() => import("./DepositLinkSheet"), { ssr: false });
const RebookNextSheet = dynamic(() => import("./RebookNextSheet"), { ssr: false });
const ClientPageSheet = dynamic(() => import("./ClientPageSheet"), { ssr: false });
const FormAnswersSheet = dynamic(() => import("./FormAnswersSheet"), { ssr: false });
const GreetingsPanel = dynamic(() => import("./GreetingsPanel"), { ssr: false });
const FieldPicker = dynamic(() => import("./FieldPicker"), { ssr: false });
const GrowPaymentRequests = dynamic(() => import("./GrowPaymentRequests"), { ssr: false });
const CalendarFeedCard = dynamic(() => import("./CalendarFeedCard"), { ssr: false });
import FeeQuestions from "./FeeQuestions";
import HoldBadge from "./HoldBadge";
import ServiceDepositToggle from "./ServiceDepositToggle";
// The pre-visit intake gate (lib/intakeGate.ts): per-service setting, calendar badges, "send the form" in her queue.
import ServiceIntakeToggle from "./ServiceIntakeToggle";
import IntakeBadge, { IntakeQueueSync } from "./IntakeBadge";
import { intakeColumnReady } from "@/lib/intakeGate";
import ApptDepositToggle from "./ApptDepositToggle";
import MyDayCard from "./MyDayCard";
import { toastDurationMs, UNDO_SETTLE_MS } from "@/lib/toastDuration";
import { apptStatus, APPT_STATUS_TONE_COLOR } from "@/lib/apptStatus";
import { buildMyDay, myDayEnabled } from "@/lib/myDay";
import { feesChanged } from "./useFees";
import { resolveGoals } from "@/lib/goals";
import { accountantSheets, periodProfit } from "@/lib/accountantPack";
import { displayPhone } from "@/lib/publicLanding";
import { countHe } from "@/lib/hebrewCount";
import { waStatusLabel, WA_TYPE_LABELS as WA_TYPE_LABELS_BASE } from "@/lib/waStatusLabel";
import { birthdayMessage, birthdayOfferOf } from "@/lib/birthdayOffer";
import { withSource } from "@/lib/bookingSource";
import { googleKitEnabled } from "@/lib/googleKit";
import { isTabVisible, visibleTabIds, settingsToggleTabs, SWITCHABLE_LABELS, skinScanVisible, SKIN_SCAN_LABEL, voiceBookingVisible } from "@/lib/featureFlags";
import { VIEW_MODE_KEY, VIEW_MODES, VIEW_MODE_LABELS, viewModeOf, isTillOnly, viewAllowsTab, viewAllowsSettingsGroup, bottomNavIds, moreNavIds } from "@/lib/viewMode";
import { reviewTimingOf, looksLikeGoogleLink, GOOGLE_LINK_HELP, GOOGLE_LINK_INVALID_HE } from "@/lib/reviewRequests";
import { monthlyPageOn } from "@/lib/monthlyFull";
import { giftVouchersVisible, giftVouchersSelling, voucherRedeemNote, voucherOverUsed, VOUCHER_OVER_USED_HE, receiptMethodLabel, paidByVoucher, splitVoucherCodes } from "@/lib/giftVouchers";
import { screenFromSearch, searchForScreen, sameScreen, viewOf, loginPathForScreen } from "@/lib/screenLink";
const ServiceTemplatePicker = dynamic(() => import("./ServiceTemplatePicker"), { ssr: false });
// Where bookings come from, and the "bring a friend" link (lib/bookingSource.ts).
const ClientReferral = dynamic(() => import("./ClientReferral"), { ssr: false });
const BookingSourceReport = dynamic(() => import("./BookingSourceReport"), { ssr: false });
const MonthValueCard = dynamic(() => import("./MonthValueCard"), { ssr: false });
const MonthlyReportCard = dynamic(() => import("./MonthlyReportCard"), { ssr: false });
const TeamSettings = dynamic(() => import("./TeamSettings"), { ssr: false });
const TeamReport = dynamic(() => import("./TeamReport"), { ssr: false });
// The team calendar filter's "everyone".
const STAFF_FILTER_ALL = "all";
import { businessFieldsOf, BUSINESS_FIELDS } from "@/lib/businessFields";
import { DEFAULT_SERVICE_COLOR, SERVICE_COLOR_CYCLE } from "@/lib/serviceColors";
import { ownServices } from "@/lib/serviceScope";
import { deliverFile, deliveryToast, dataUrlToBlob } from "@/lib/deliverFile";
import { copyText } from "@/lib/copyText";
import { preloadXlsx, loadedXlsx, getXlsx, workbookBlob } from "@/lib/xlsxLoader";

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
  return <img alt={alt} src={url} loading="lazy" decoding="async" style={style} />;
}

// A single pill on/off switch. Extracted so every settings toggle shares one
// piece of markup instead of repeating the same inline styles. `pc` is the
// tenant's primary color (the "on" background).
// It is a switch, and says so: role + state + a name (found 2026-10-07: nine unnamed buttons on the Automations tab, so a screen reader
// announced "button, button, button" for nine different automations).
function Toggle({ on, onChange, pc, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label || undefined} onClick={onChange} style={{ width: 46, height: 26, borderRadius:"var(--r-sm)", border: "none", cursor: "pointer", background: on ? pc : "#D8CEd3", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "var(--surface)", transition: "left .2s" }} />
    </button>
  );
}

// One "label + switch (+ optional hint)" row for the Automations settings tab.
function AutoToggleRow({ label, desc, on, onChange, pc }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize:"var(--t-sm)", color: "var(--ink)" }}>{trv(label)}</span>
        <Toggle on={on} onChange={onChange} pc={pc} label={trv(label)} />
      </div>
      {desc &&<p style={{ fontSize:"var(--t-sm)", color: "var(--ink-3)", marginTop: 6, lineHeight: 1.5 }}>{trv(desc)}</p>}
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
  { intent: "create_receipt",      icon: "🧾", label: "רישום תשלום",      example: "תרשמי תשלום של 200 שקל לרונית" },
];

// Section metadata for the global top-bar search dropdown — render order,
// Hebrew header label, and type icon. Display-only; the result objects come
// from globalResults and are routed by openSearchResult.
const SEARCH_GROUPS = [
  { type: "client",  label: "לקוחות",  icon: "♥" },
  { type: "appt",    label: "תורים",   icon: "◴" },
  { type: "lead",    label: "פניות",   icon: "✦" },
  { type: "service", label: "שירותים", icon: "✂" },
  { type: "receipt", label: PAYMENT_NOTICES_HE,   icon: "🧾" },
];

// Compact "what can I say?" list for the Beauty Voice modal. Uses runtime CSS
// vars (--pc etc.) so it needs no props. Purely presentational.
function VoiceCommandList() {
  return (
    <div style={{ marginTop: 16, textAlign: "right" }}>
      <p style={{ fontSize:"var(--t-xs)", fontWeight: 700, color: "var(--ink-2)", marginBottom: 8 }}>{tr("מה אפשר לומר?")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {VOICE_COMMANDS.map((c) => (
          <div key={c.intent} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius:"var(--r-sm)" }}>
            <span style={{ width: 27, height: 27, borderRadius:"var(--r-xs)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize:"var(--t-sm)", color: "var(--pc)", background: "var(--pc-tint)" }}>{c.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize:"var(--t-sm)", fontWeight: 700, color: "var(--ink)" }}>{trv(c.label)}</span>
              <span style={{ display: "block", fontSize:"var(--t-sm)", color: "var(--ink-2)" }}>&ldquo;{c.example}&rdquo;</span>
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

// Pixels per 30-minute row in the week grid. 28 gives a 60-minute
// appointment 56px - enough for a name plus one detail line at 62px wide.
const WK_ROW_H = 28;
// Every hour of the day, indexed BY THE HOUR: HOURS_ALL[9] === "09:00".
//
// This was 07:00–20:00, which meant a cosmetician who works evenings could not
// describe her own week — the hours simply were not in the list, and every
// reader compensated with a hardcoded -7 offset. Cosmeticians do not share a
// schedule: some start at 07:00, some finish at 22:00, some work Saturday night
// after Shabbat. The list is now the whole day and the index IS the hour, so
// there is no offset left to get wrong.
const HOURS_ALL = Array.from({length:24},(_,h)=>`${String(h).padStart(2,"0")}:00`);
// Closing times run 01:00–24:00: a day that ends at midnight is a real answer,
// and "24:00" is how it reads on a Hebrew price list.
const CLOSE_HOURS = Array.from({length:24},(_,i)=>({value:i+1,label:`${String(i+1).padStart(2,"0")}:00`}));
// 12.5px rather than the 11px these were: a 24-entry list is read, not glanced
// at. On a phone the .sheet rule raises every select to 16px anyway.
const hourSelectStyle = {border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"7px 9px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",color:"var(--ink)"};
const DAYS_HE = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
// Reassuring steps cycled through while the AI skin scan is processing, so the
// wait feels alive and progressing rather than frozen.
const SCAN_STEPS = ["בודקת גוון עור...","מזהה מרקם ולחות...","מאתרת אזורי טיפול...","מכינה המלצות מותאמות..."];
import { HELP_TITLE, HELP_INTRO, helpSectionsFor, TUTORIAL_TITLES, tutorialHref } from "@/lib/helpSections";
// What is switched on for her (2026-11-09: nothing inactive is shown, help included): her settings plus the server-only switches.
import { helpGatesFor } from "@/lib/helpVisibility";
import { useDeployFlags } from "./useDeployFlags";

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

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** The Sunday that begins the Israeli week containing `date`. Midnight, local. */
function weekSundayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday, so subtracting it always lands on this week's Sunday.
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * The seven days of the Israeli week containing `date`: ראשון through שבת.
 *
 * SNAPS to Sunday rather than treating its argument as the first column. The
 * week used to start on whatever day it happened to be, so the columns shifted
 * every morning and "the week" meant a different seven days depending on when
 * she opened it. Snapping here rather than at the call sites makes it
 * impossible for any caller to disagree about where the week begins - which is
 * exactly how the six-day version drifted into four places.
 */
function getWeekDates(date) {
  const sunday = weekSundayOf(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
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

// "2026-10-25" -> "25.10.2026" for Hebrew screens; anything else comes back as it was.
function fmtDateHe(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : String(iso || "");
}

function waMsg(phone, msg) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g,"");
  const intl = clean.startsWith("0") ? "972" + clean.slice(1) : clean;
  // A promotional message opens with "פרסומת" (lib/marketingConsent.js withAdLabel); anything else is unchanged.
  return `https://wa.me/${intl}?text=${encodeURIComponent(withAdLabel(msg))}`;
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
    return { confirmUrl: data.confirmUrl, cancelUrl: data.cancelUrl, rescheduleUrl: data.rescheduleUrl || null };
  } catch {
    return null;
  }
}

// Browser push opt-in for owner_notifications (new booking / cancellation /
// hot skin-scan lead) - lib/ownerNotify.js sends to every subscription stored
// here. A plain function component (not a hook mid-render) so it can sit
// inside Settings' JSX without its own effect tangling with the parent's.
function PushSubscribeButton({ pc, pcGrad }) {
  const [state, setState] = useState("idle"); // idle | checking | on | off | unsupported | error
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const urlBase64ToUint8Array = (base64) => {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  const subscribe = async () => {
    setState("checking"); setErr("");
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setErr(tr("התראות דפדפן עדיין לא מוגדרות במערכת.")); setState("off"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setErr(tr("ההרשאה לא אושרה בדפדפן.")); setState("off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) { setErr(tr("לא הצלחנו לשמור, אפשר לנסות שוב.")); setState("off"); return; }
      setState("on");
    } catch (e) {
      setErr(e?.message || tr("לא הצלחנו להפעיל, אפשר לנסות שוב."));
      setState("off");
    }
  };

  const unsubscribe = async () => {
    setState("checking");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  };

  if (state === "unsupported") {
    // An iPhone only offers push to a web app that was added to the home screen (iOS 16.4+), and an Instagram/Facebook browser has none:
    // "this browser does not support it" sent her away with nothing to do (2026-10-24 phone review).
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const text = /Instagram|FBAN|FBAV|FB_IAB|Messenger/i.test(ua)
      ? "בדפדפן של אינסטגרם או פייסבוק אי אפשר לקבל התראות. פתחי את קלמיה בספארי או בכרום."
      : /iPhone|iPad|iPod/.test(ua)
        ? "באייפון ההתראות עובדות רק מאפליקציה שהוספת למסך הבית: בספארי לחצי על שיתוף ← הוספה למסך הבית, ופתחי את קלמיה משם."
        : "הדפדפן הזה לא תומך בהתראות דחיפה.";
    return <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)" }}>{trv(text)}</p>;
  }
  return (
    <div>
      <button
        onClick={state === "on" ? unsubscribe : subscribe}
        disabled={state === "checking" || state === "idle"}
        style={{
          background: state === "on" ? "var(--surface)" : pcGrad,
          color: state === "on" ? "var(--ink-2)" : "var(--pc-contrast)",
          border: state === "on" ? "1px solid var(--line-2)" : "none",
          borderRadius: "var(--r-sm)", padding: "9px 16px", fontSize: "var(--t-sm)", fontWeight: 600,
          cursor: state === "checking" ? "default" : "pointer", fontFamily: "inherit",
          opacity: state === "checking" ? 0.6 : 1,
        }}
      >
        {state === "checking" ? tr("רגע...") : state === "on" ? tr("כיבוי התראות") : tr("הפעלת התראות")}
      </button>
      {err && <p style={{ fontSize: "var(--t-xs)", color: "var(--danger)", marginTop: 6 }}>{err}</p>}
    </div>
  );
}

// `time` is an ALREADY-FORMATTED "14:30", not an hour number. It used to take
// appt.hour and interpolate it raw, which sent a client "בשעה 14" - the bare
// integer, wrong for every half-hour appointment and badly formatted even for
// whole ones. Callers pass fmtApptTime(appt); the parameter is named for what
// it is so the next caller cannot make the same substitution.
function waConfirmLink(phone, name, service, date, time, links, extra = {}) {
  // The THIRD hand-written copy of "remind her about tomorrow", after the cron
  // and the manual route. Same voice as the other two now, including the
  // address/arrival-note enrichment and the softened, reschedule-inviting
  // cancel line - it keeps its own date and time arguments because its
  // callers pass them already formatted.
  const confirmUrl = links.confirmUrl;
  const cancelUrl  = links.cancelUrl;
  const businessName = (extra.businessName || "").trim();
  const address = (extra.address || "").trim();
  const arrivalNote = (extra.arrivalNote || "").trim();
  return waMsg(
    phone,
    msgLines(
      msgGreet(name),
      businessName ? `תזכורת לתור שלך ב${businessName}${dayWordFor(date)}.` : `תזכורת לתור${dayWordFor(date)}.`,
      "",
      service,
      `${msgHebrewDate(date)}, ${time}`,
      address ? "" : null,
      address ? `📍 ${address}` : null,
      address ? msgMapsLink(address) : null,
      arrivalNote ? "" : null,
      arrivalNote || null,
      "",
      `לאישור: ${confirmUrl}`,
      msgMoveLine(links.rescheduleUrl, extra.branding),
      `אם צריך לבטל, אפשר כאן: ${cancelUrl}`
    )
  );
}

function waBirthday(phone, name, businessName, automations) {
  // Her own birthday offer (lib/birthdayOffer.js); the business-name clause drops when empty or the legacy placeholder.
  return waMsg(phone, withMarketingFooter(birthdayMessage(name, businessName, automations)));
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
//
// Both now live in lib/serviceColors.ts: the onboarding template picker creates
// services too, and /onboarding does not import this component at all, so a
// third copy of the palette was the alternative.

// ============================================================
// CLIENT IMPORT — paste + column mapping
// A cosmetician moving from another system exports to Excel, copies the
// columns and pastes them here. Excel copies as TAB-separated text, which is
// why paste is the path rather than file upload: no parser library, and it is
// the one thing every system can produce.
// ============================================================

// The client fields a pasted column can be mapped onto. Note skinType, not
// skintype: the table has both, and the rest of the app writes camelCase.
import { parseImportGrid, detectHeaderRow, buildServiceRows, buildImportRows, buildApptRows, withServiceDefaults, countExistingServices, IMPORT_SPEC, importPhoneKey } from "@/lib/importMapping";
import { vcardImportText, isVcardFile, VCARD_ACCEPT } from "@/lib/vcard";
import { LANGS, LANG_LABELS, langOfSettings, speechLangOf } from "@/lib/i18n/core";
import { applyOwnerLang, cachedOwnerLang, devLangOverride } from "@/lib/i18n/ownerLang";
import { tr, trv, uiDir, getActiveLang } from "@/lib/i18n/tr";
import { academyEnabled } from "@/lib/academy";
import { protocolFormAllowed } from "@/lib/protocolBook/book";
import { PROTOCOL_FORMS, protocolFormTitle } from "@/lib/protocolBook/questions";
// The team calendar (lib/team.ts, NEXT_PUBLIC_TEAM_CALENDAR): off, or fewer than two active staff = team.on is false and the
// calendar is exactly the one-practitioner calendar it was.
import useTeam from "./useTeam";
import { activeStaff as teamActiveStaff, ownerOf as teamOwnerOf, sameStaff, staffIdForWrite, staffOfAppt, formDayHours } from "@/lib/team";
import ProtocolsScreen from "./screens/ProtocolsScreen";
import PackagesScreen from "./screens/PackagesScreen";
import CommunityScreen from "./screens/CommunityScreen";
import AdvisorScreen from "./screens/AdvisorScreen";
import CashierScreen from "./screens/CashierScreen";
import ClientsScreen from "./screens/ClientsScreen";
import CalendarScreen from "./screens/CalendarScreen";
import CampaignsScreen from "./screens/CampaignsScreen";
import WhatsappScreen from "./screens/WhatsappScreen";
import TaxScreen from "./screens/TaxScreen";
import HelpScreen from "./screens/HelpScreen";
import ScanReportModal from "./screens/ScanReportModal";
import ClientCardModal from "./screens/ClientCardModal";
import SettingsScreen from "./screens/SettingsScreen";
import PersonalEventModal from "./screens/PersonalEventModal";
import ReceiptModal from "./screens/ReceiptModal";
import CashierModal from "./screens/CashierModal";
import BulkStatusModal from "./screens/BulkStatusModal";
import ImportModal from "./screens/ImportModal";
import ApptModal from "./screens/ApptModal";
import LeadsScreen from "./screens/LeadsScreen";
import InsightsScreen from "./screens/InsightsScreen";
import DashboardScreen from "./screens/DashboardScreen";
import VoiceModal from "./screens/VoiceModal";
import HelpModal from "./screens/HelpModal";
import LeadCardModal from "./screens/LeadCardModal";
import MoreSheetModal from "./screens/MoreSheetModal";
import PackageModal from "./screens/PackageModal";
import WaQueueModal from "./screens/WaQueueModal";
import ComposeSendModal from "./screens/ComposeSendModal";

// Manually added leads start at "new", the same entry status the Facebook
// webhook writes, so both intake paths begin in one place.
const emptyLead = {name:"",phone:"",source:"",service_interest:"",status:"new",notes:"",reminder_date:""};

// ============================================================
// MAIN COMPONENT
// ============================================================

// "Could not reach the auth server" is NOT "logged out". Offline, an auth call
// comes back with a retryable transport error and no user; treating that as
// logged-out sent her to /login to fail signing in again - the app telling
// someone with a valid session that she is not signed in. The app is a PWA
// (public/sw.js), so the shell genuinely loads with no network.
function isAuthTransportFailure(authErr) {
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    isOffline ||
    (!!authErr && (
      authErr.name === "AuthRetryableFetchError" ||
      !authErr.status ||
      /fetch|network|load failed|timeout/i.test(String(authErr.message || ""))
    ))
  );
}

// ownerEntry: a node the server renders only for platform admins (see OwnerEntry in the owner control section); null for everyone else.
/** @param {{ ownerEntry?: import("react").ReactNode }} [props] */
export default function BeautyOS({ ownerEntry = null } = {}) {
  const router = useRouter();

  // === DATA STATES ===
  const [appointments, setAppointments] = useState([]);
  const [clients,      setClients]      = useState([]);
  const [forms,        setForms]        = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [receipts,     setReceipts]     = useState([]);
  // Voids: a cancelling record per voided receipt (receipt_voids). The receipt
  // row itself is never altered; every total reads `liveRcpts`, which drops
  // the voided ones, and the lists show the original with a badge.
  const [receiptVoids, setReceiptVoids] = useState([]);
  // Manual WhatsApp queue + owner notifications (whatsapp-manual-mode.sql).
  // Non-core reads, same as receiptVoids above: the migration is handed over
  // by hand, so a missing table must never block the app from loading.
  const [whatsappPending, setWhatsappPending] = useState([]);
  const [ownerNotifs, setOwnerNotifs] = useState([]);
  const [showWaQueue, setShowWaQueue] = useState(false);
  const [waQueueDone, setWaQueueDone] = useState({}); // {[row.id]: true} - optimistic, mirrors composeDone
  const liveRcpts = useMemo(() => liveReceipts(receipts, receiptVoids), [receipts, receiptVoids]);
  const voidedReceiptIdSet = useMemo(() => new Set((receiptVoids || []).map((v) => String(v.receipt_id))), [receiptVoids]);
  // The payment already recorded for this visit, by the same test the till's quick-pay list uses ("✓ שולם"), or null.
  const receiptForAppt = (a) => (a ? liveRcpts.find(r => String(r.appointment_id) === String(a.id)) || null : null);
  const [expenses,     setExpenses]     = useState([]);
  const [services,     setServices]     = useState([]);
  const [packages,     setPackages]     = useState([]);
  const [waitlist,     setWaitlist]     = useState([]);
  // forms / expenses / waitlist are NOT read at boot (see loadDeferred): the
  // dashboard does not draw them, and each only matters inside one tab or one
  // client card. Until they arrive their lists are [] - which must never be
  // shown as "none" - so every screen that reads one is gated on its status
  // here ("loading" | "ok" | "error"), via <DeferredGate>.
  // history: appointments and payments older than the recent window, leads: the whole leads list. Both are read in the background after the
  // first screen is on (loadHistory), so a business with years of data sees her day straight away. See lib/historyWindow.js.
  const [deferred, setDeferred] = useState({ forms: "loading", expenses: "loading", waitlist: "loading", history: "loading", leads: "loading" });
  const historyReady = deferred.history === "ok";
  const [histSlow, setHistSlow] = useState(false);
  useEffect(() => {
    if (deferred.history !== "loading") { setHistSlow(false); return; }
    const t = setTimeout(() => setHistSlow(true), 700);   // a small business gets it before this fires and never sees the strip
    return () => clearTimeout(t);
  }, [deferred.history]);
  // Re-render once a minute so the clock-driven cards on the dashboard (the next
  // client, the end-of-day list) appear and change on their own.
  const [, setMinuteTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setMinuteTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const [settings,     setSettings]     = useState({business_name:"",therapist_name:"",primary_color:"#D98BA0",working_hours_start:8,working_hours_end:19,business_phone:""});
  // Her language (settings.branding.language, lib/i18n): the whole app, its direction, and every page her clients open.
  // uiLang is the language whose words are on screen now; it follows the saved setting once its table has loaded, and
  // starts from the one this browser last used so a non-Hebrew business does not see Hebrew flash first.
  const [, setUiLang] = useState("he");
  useEffect(() => {
    const cached = cachedOwnerLang();
    if (cached === "he") return;
    let gone = false;
    applyOwnerLang(cached).then((l) => { if (!gone) setUiLang(l); });
    return () => { gone = true; };
  }, []);
  const savedLang = langOfSettings(settings);
  const settingsLoaded = !!settings?.tenant_id;
  useEffect(() => {
    if (!settingsLoaded) return;
    let gone = false;
    applyOwnerLang(devLangOverride() || savedLang).then((l) => { if (!gone) setUiLang(l); });
    return () => { gone = true; };
  }, [savedLang, settingsLoaded]);
  // Skin type is a facial concept: a nail technician is not asked for it (a value already saved still shows on the client card).
  // Declared AFTER settings: it reads it while rendering.
  const showSkinType = businessFieldsOf(settings).includes("cosmetics");

  // === UI STATES ===
  const [weekStart,         setWeekStart]         = useState(new Date());
  // The week grid scroller, so it can open at the first appointment rather
  // than at the top of an axis that may start hours before anything happens.
  const weekScrollRef = useRef(null);
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
  // CSV lead import (stage 2: preview only, writes nothing).
  const [showLeadImport,    setShowLeadImport]     = useState(false);
  const [showLapsed,        setShowLapsed]         = useState(false);
  // Where she stands against the scanner ceiling. Fetched, not derived: the cap
  // is enforced against her CLIENTS in a request she is not part of, so without
  // this she would learn about it by noticing her leads had stopped.
  const [scanQuota,         setScanQuota]          = useState(null);
  // The signed scanner link (this origin + /skin-scan?t=…&s=…) and its QR,
  // loaded when settings opens so she sees the current link, not a memory.
  const [scanLink,          setScanLink]           = useState(null);
  const [scanQr,            setScanQr]             = useState(null);
  const [scanLinkError,     setScanLinkError]      = useState("");

  // ── List windows ────────────────────────────────────────────────────────
  // The leads and clients screens render every matching row. A lead card is
  // ~66 JSX elements, so 250 leads is ~16,500 DOM nodes, rebuilt on every
  // keystroke because the search box feeds the same memo. That is a RENDER
  // cost, not a query cost - the rows are already in memory and every stat on
  // the screen (conversion rate, per-status counts, per-source breakdown) is
  // derived from the full array. So the window caps what is DRAWN and nothing
  // else; the numbers in the header keep counting all of them.
  //
  // The window is keyed by a signature of the active filters and resolved
  // during render rather than reset from an effect: changing a filter makes
  // the old window stale immediately, with no second render and no setState
  // in an effect body.
  const LIST_PAGE = 50;
  const [leadWindow,   setLeadWindow]   = useState({ sig: '', n: LIST_PAGE });
  const [clientWindow, setClientWindow] = useState({ sig: '', n: LIST_PAGE });
  const [showSettings,      setShowSettings]       = useState(false);
  const [showCashier,       setShowCashier]        = useState(false);
  const [showReceipt,       setShowReceipt]        = useState(null);
  // Rebooking offered on the receipt. rebookWeeks is the interval she is
  // looking at; rebookDone holds the appointment once created, so the strip can
  // become a confirmation instead of vanishing.
  const [rebookWeeks,       setRebookWeeks]        = useState(4);
  // Appointment modal. The client field is a search rather than a native
  // <select>: the select listed every client with no filter, which is a
  // scroll-wheel of 300 names on a phone and gave her two controls - the
  // select and a separate "or type a new name" box - for one decision.
  const [apptClientQuery,   setApptClientQuery]    = useState("");
  // Price and note live behind a disclosure. Price is derived from the service
  // and almost never overridden; showing it always priced the exception as if
  // it were the rule.
  const [apptMoreOpen,      setApptMoreOpen]       = useState(false);
  // Services show as chips, most-used first. This opens the long tail.
  const [apptAllServices,   setApptAllServices]    = useState(false);
  // The till (UX pass 2026-11-08): the same one-tap service chips, and discount, tip and note behind one line.
  const [cashierAllServices, setCashierAllServices] = useState(false);
  const [cashierExtrasOpen,  setCashierExtrasOpen]  = useState(false);
  // New client form: name and phone first, the rest behind "פרטים נוספים" (UX pass 2026-11-08). Editing opens it.
  const [clientMoreOpen,     setClientMoreOpen]     = useState(false);
  const [rebookDone,        setRebookDone]         = useState(null);
  // The receipt just recorded at the till, for which the one-time "did she agree to updates?" prompt may show. Opening an old receipt from the list never asks.
  const [consentAskFor,     setConsentAskFor]      = useState(null);
  // A time she picked instead of the proposed one, scoped to the receipt it was
  // picked on so it can never leak onto a different client's booking. It
  // deliberately survives a change of interval: "same time, a week later" is
  // the thing she means, and it is dropped automatically if that time is not
  // free on the new date.
  const [rebookPick,        setRebookPick]         = useState(null);
  const [rebookPickOpen,    setRebookPickOpen]     = useState(false);
  // "קבעי לה שוב" (client card / finished appointment): { client, appt } while the sheet is open.
  const [rebookNext,        setRebookNext]         = useState(null);
  const [formAnswersFor,    setFormAnswersFor]     = useState(null); // "צפייה בתשובות": the signed form whose answers are open (app/FormAnswersSheet)
  const [clientPageFor,     setClientPageFor]      = useState(null); // "שליחת הדף שלה": the client whose personal results page is being prepared
  const [showPackageModal,  setShowPackageModal]   = useState(false);
  const [showWaitlistModal, setShowWaitlistModal]  = useState(false);
  const emptyProtocol = {brand:"",name:"",concern:"",skin_types:[],frequency:"",sessions_count:1,duration_minutes:60,price:0,notes:""};
  const [newProtocol,      setNewProtocol]      = useState(emptyProtocol);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [editingClient,     setEditingClient]      = useState(null);
  const [editingLead,       setEditingLead]        = useState(null);
  const [selectedClient,    setSelectedClient]     = useState(null);
  const [photoPost, setPhotoPost] = useState(null); // null = closed; { clientName } = open (clientName may be "")
  const [ownReel, setOwnReel] = useState(null); // the same, for "רילס מהצילומים שלי"
  // Which agenda card has its "עוד" actions open (the day view shows one main action per card).
  const [apptMenuId, setApptMenuId] = useState(null);
  const [selectedLead,      setSelectedLead]       = useState(null);
  // Facebook campaigns (live ad performance)
  const [fbCampaigns,    setFbCampaigns]    = useState(null);
  const [fbTotals,       setFbTotals]       = useState(null);
  const [fbLoading,      setFbLoading]      = useState(false);
  const [fbError,        setFbError]        = useState(null);
  const [fbDatePreset,   setFbDatePreset]   = useState("last_30d");
  // Connected Facebook page for THIS tenant (row from facebook_pages), or null if not connected
  const [fbPage,         setFbPage]         = useState(null);
  // Every Page she connected (Settings > connections): name, whether leads from it are on, Instagram link.
  const [fbPages,        setFbPages]        = useState(null);
  const [fbPageBusy,     setFbPageBusy]     = useState("");
  // Failed Facebook webhook events (facebook_webhook_events, processed=false).
  // Drives the red badge on the leads screen's inspector button: a lead that
  // arrived and failed should announce itself, not wait to be gone looking for.
  const [fbEventFails,   setFbEventFails]   = useState(0);
  // "The one question": the newest pending owner_questions row, or null. The
  // dashboard shows at most one question at a time; stats feed the yes-rate
  // footer so the pattern is measured from day one.
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [questionStats,   setQuestionStats]   = useState(null); // {yes, no}
  // The compose window a yes opens: she reviews the message and the list, and
  // sends herself over wa.me - one tap per client, from her own WhatsApp.
  // {title, messageTemplate, candidates:[{name,phone,claimUrl}], greenApiConnected, autoSend}
  const [composeSend,     setComposeSend]     = useState(null);
  const [composeDone,     setComposeDone]     = useState({});   // phone -> true after tap
  // AI business advisor chat
  const [advisorMessages, setAdvisorMessages] = useState(null); // null = not loaded yet
  const [advisorInput,    setAdvisorInput]    = useState("");
  const [advisorSending,  setAdvisorSending]  = useState(false);
  const [advisorWaitSec,  setAdvisorWaitSec]  = useState(0); // seconds since she asked, until the first word
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
  const [aiPostsView,    setAiPostsView]    = useState("studio"); // studio | saved | reels | shootlist
  // The planning agent's output: {week_note, ideas:[...]} from /api/marketing/shooting-list
  // AI reel generator
  const [reelTopic,   setReelTopic]   = useState("");
  // Length and vibe: /api/marketing/reel has always accepted these two and the
  // UI never sent them, so every reel came back 30s with no vibe. The values
  // here must stay in step with the whitelists in that route.
  const [reelDuration, setReelDuration] = useState("30");
  const [reelVibe,     setReelVibe]     = useState("");
  const [reelData,    setReelData]    = useState(null);
  const [reelLoading, setReelLoading] = useState(false);
  const [reelError,   setReelError]   = useState(null);
  const [marketingView,  setMarketingView]  = useState("posts"); // posts | campaigns - posts and templates first: they need no AI and no Facebook connection
  // WhatsApp tab sub-views: the send tools, or the log of what was already sent.
  const [waView,         setWaView]         = useState("send"); // send | log
  const [waMessages,     setWaMessages]     = useState(null);   // null = not loaded yet
  // Grow, billing and automatic WhatsApp sending, as the server sees them for her business (all false until known).
  const deployFlags = useDeployFlags();
  // Her connection to a registered receipt provider (Morning), or null until loaded.
  // Optional: with no connection the till works exactly as it always has.
  const [legalAccount, setLegalAccount] = useState(null);
  const [legalKeyId, setLegalKeyId] = useState("");
  const [legalSecret, setLegalSecret] = useState("");
  const [legalMsg, setLegalMsg] = useState("");
  useEffect(() => {
    if (!settings?.tenant_id) return;
    let alive = true;
    fetch("/api/legal-receipts/account").then((r) => r.json()).then((d) => { if (alive && d && d.success) setLegalAccount(d); }).catch(() => {});
    return () => { alive = false; };
  }, [settings?.tenant_id]);
  const [waLogLoading,   setWaLogLoading]   = useState(false);
  const [waLogError,     setWaLogError]     = useState("");
  const [activeTab,         setActiveTab]          = useState("dashboard");
  const [clientTab,         setClientTab]          = useState("info");
  const [scanLoading,       setScanLoading]        = useState(false);
  const [scanStep,          setScanStep]           = useState(0);
  const [scanReport,        setScanReport]         = useState(null);
  const [clientScans,       setClientScans]        = useState([]);
  const [clientPhotos,      setClientPhotos]       = useState([]);
  // The treatment name the before/after form opens with, when a protocol course sends her there (app/ClientProtocolCourses).
  const [photoTreatmentPrefill, setPhotoTreatmentPrefill] = useState("");
  const [photoUploading,    setPhotoUploading]     = useState(false);
  const [scansLoading,      setScansLoading]       = useState(false);
  const [viewScan,          setViewScan]           = useState(null);
  const [communityPosts,    setCommunityPosts]     = useState([]);
  const [protocols,         setProtocols]         = useState([]);
  const [protocolsLoading,  setProtocolsLoading]   = useState(false);
  const [communityLoading,  setCommunityLoading]   = useState(false);
  const [showPostModal,     setShowPostModal]      = useState(false);
  const [newPost,           setNewPost]            = useState({title:"",body:"",post_type:"update",cta_label:"",image_url:""});
  const [postImageUploading, setPostImageUploading] = useState(false);
  const [savingPost,        setSavingPost]         = useState(false);
  const [settingsTab,       setSettingsTab]        = useState("general");
  // Settings is shown as seven groups; the old tab keys survive as section names and as the jump targets other
  // screens use (openSettings("branding")), mapped to a group by SETTINGS_TAB_GROUP.
  const [settingsGroup,     setSettingsGroup]      = useState("business");
  const inG = (...gs) => gs.includes(settingsGroup);
  const SETTINGS_TAB_GROUP = { general: "business", payment: "business", branding: "page", hours: "booking", services: "booking", automations: "messages", import: "clients", faq: "advanced" };
  const [leadFilter,        setLeadFilter]         = useState("all");
  const [leadSearch,        setLeadSearch]         = useState("");
  // --- Bulk WhatsApp send (per status group) ---
  // bulkStatus = status key being composed for (null = closed modal).
  // bulkStep walks: compose -> confirm -> sending -> result. Nothing is sent
  // until the explicit "confirm" step, which shows the real recipient count.
  const [bulkStatus,        setBulkStatus]         = useState(null);
  const [bulkMessage,       setBulkMessage]        = useState("");
  const [bulkStep,          setBulkStep]           = useState("compose");
  const [bulkResult,        setBulkResult]         = useState(null);
  const [bulkError,         setBulkError]          = useState("");
  // She states, for this one send, that the imported leads in the group agreed to hear from her.
  const [bulkConfirmConsent, setBulkConfirmConsent] = useState(false);
  // Non-null = send to these lead ids only (the per-lead one-click send).
  // Null = the whole status group, which is the original behavior.
  const [bulkLeadIds,       setBulkLeadIds]        = useState(null);
  const [loading,           setLoading]            = useState(true);
  // A brand-new account (no settings row) is sent to /onboarding from loadAll. Until that navigation lands, the loading screen stays:
  // clearing `loading` first painted the empty dashboard for about a second before onboarding (journey pass F5).
  const leavingForOnboardingRef = useRef(false);
  // Non-null when a core read in loadAll FAILED. Distinct from "she has no
  // data": empty state is only ever allowed to mean empty. Renders a
  // full-screen explanation with a retry, instead of an empty dashboard.
  const [loadError,         setLoadError]          = useState(null);
  // Has she copied or shared her booking link on this device? Ticks the setup step "שליחת הקישור" when she does exactly that
  // (2026-10-21 audit: the step only ticked once an appointment or ANY client existed, so sending the link never ticked it,
  // and adding a client by hand did). Per device, in localStorage: a convenience mark, never business data.
  const [linkShared,        setLinkShared]         = useState(false);
  // "3 צעדים לתור הראשון" (lib/firstBooking.js): what this phone remembers ({shown_at, done_at}); null until read, so the card
  // and the 8-step checklist never flash in before the answer is known. fbCelebrate holds the one-time completion line for this visit.
  const [firstLocal,        setFirstLocal]         = useState(null);
  const [fbCelebrate,       setFbCelebrate]        = useState(false);
  // Which account this browser is signed in to, shown where she signs out: a page that answers "not found" because she is in
  // another account (a test one) must not look like a bug.
  const [authEmail,         setAuthEmail]          = useState("");
  // No per-tenant WhatsApp connection state. Per-tenant GreenAPI instances
  // were retired (lib/whatsapp.js): every automated message leaves from the
  // platform number, marketing goes through wa.me from her own phone. The
  // status fetch, the token inputs and the settings route that served them
  // were removed with the truth pass; nothing in the UI had used them for a
  // while, and the fetch ran on every load for nothing.
  // Lead-intake API key: configured yes/no from the server; the plaintext key
  // exists ONLY in leadKeyJustGenerated, immediately after a rotation, and is
  // gone on any navigation - by design, it cannot be re-shown.
  const [leadKeyConfigured, setLeadKeyConfigured]  = useState(null);
  const [leadKeyJustGenerated, setLeadKeyJustGenerated] = useState(null);
  const [leadKeyBusy,       setLeadKeyBusy]        = useState(false);
  // -- "תקועה?" -- reaching a human from anywhere in the app ------------------
  // Until now the only route to support was the WhatsApp link on the trial
  // banner, which only appears when her PLAN needs attention. Someone stuck on
  // day three with a perfectly healthy plan had nowhere to go.
  const [showHelp,          setShowHelp]           = useState(false);
  const [showMonthlyReport, setShowMonthlyReport]  = useState(false);
  const [helpText,          setHelpText]           = useState("");
  const [helpState,         setHelpState]          = useState("idle"); // idle|sending|sent|failed
  // "שאלי את העוזרת" at the top of the sheet (app/HelpChat.jsx). Kept here so closing the sheet keeps the conversation.
  const [helpChat,          setHelpChat]           = useState([]);
  const helpTextRef = useRef(null);
  // "לא עזר?": her question goes into the human form below, ready to send. Nothing is sent until she taps שליחה.
  const askHumanFromChat = useCallback((question) => {
    const q = String(question || "").trim();
    setHelpText((t) => (!t.trim() ? q : t.includes(q) ? t : `${t.trim()}\n${q}`));
    setHelpState("idle");
    setTimeout(() => {
      const el = helpTextRef.current;
      if (!el) return;
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* old browser */ }
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }, 0);
  }, []);

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

  // Back from Grow's card page for HER subscription (app/api/billing/card returns to /dashboard?billing=card&grow=paid|cancelled): say
  // what happened, instead of landing on the calendar with no word (2026-11-02 audit). The card itself is recorded by Grow's callback,
  // which can arrive a few seconds later, so "נשמר" is said as received from Grow's page, not as a fact from our database.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("billing") !== "card") return;
    const result = p.get("grow");
    if (result === "paid") toast(tr("הכרטיס התקבל 🌸 תוך רגע הוא יופיע בהגדרות > המנוי שלך"));
    else if (result === "cancelled") toast(tr("שמירת הכרטיס לא הושלמה. אפשר לנסות שוב מהגדרות > המנוי שלך"), "info");
    p.delete("billing"); p.delete("grow");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // The team calendar: who the open appointment is with (a staff id; the owner's own id for her), and the calendar's filter
  // ("all" or a staff id). Read only when team.on (lib/team.ts teamOn: the flag, the migration, two or more active people).
  const team = useTeam();
  const teamCal = team.on === true;
  const [apptStaff, setApptStaff] = useState(null);
  const [staffFilter, setStaffFilter] = useState("all");
  const teamOwnerId = teamCal ? (teamOwnerOf(team.staff)?.id || null) : null;
  // A filter on someone who is no longer active (or no team at all) shows everyone.
  const calStaffFilter = teamCal && staffFilter !== "all" && teamActiveStaff(team.staff).some(s => s.id === staffFilter) ? staffFilter : "all";
  const staffShown = (a) => !teamCal || calStaffFilter === "all" || sameStaff(a, calStaffFilter, team.staff);
  const staffColorOf = (a) => (teamCal ? staffOfAppt(a, team.staff)?.color || null : null);
  const staffNameOf = (a) => (teamCal ? staffOfAppt(a, team.staff)?.name || "" : "");
  // What an appointment write carries: nothing at all without the team (the column may not exist yet), else staff_id, NULL = her.
  const apptStaffWrite = () => (teamCal ? { staff_id: staffIdForWrite(team.staff.find(s => s.id === apptStaff) || null) } : {});
  // When set, the appointment modal is in EDIT mode for this appointment id
  // (reschedule/edit an existing row) rather than CREATE mode. Reset to null on
  // every close so the modal never opens stale in edit mode.
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  // Opening the appointment form: an existing appointment is with whoever it is with; a new one is with the person the calendar is
  // filtered on, otherwise with her.
  useEffect(() => {
    if (!showModal || !teamCal) return;
    const editing = editingAppointmentId ? appointments.find(a => a.id === editingAppointmentId) : null;
    if (editing) setApptStaff(editing.staff_id ? String(editing.staff_id) : teamOwnerId);
    else setApptStaff(calStaffFilter !== "all" ? calStaffFilter : teamOwnerId);
    // Only when the form opens (or switches appointment): later changes are hers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, editingAppointmentId, teamCal]);
  // Personal events. The draft carries a date RANGE; the save expands it into
  // one row per day, because that is the only shape the calendar, the
  // availability endpoint and the overlap constraint all understand. null when
  // the modal is closed, so a half-typed event cannot survive into the next one.
  // Her own URL. Lives on tenants.slug, not settings, so it saves on its own
  // rather than through handleSaveSettings.
  const [slugDraft, setSlugDraft] = useState(null);   // null = not editing
  const [slugBusy,  setSlugBusy]  = useState(false);
  const [slugNote,  setSlugNote]  = useState("");
  // Reviews clients wrote. Loaded on the settings screen only - see the note on
  // offerings for why a table read does not go in loadAll.
  const [clientReviews,      setClientReviews]      = useState([]);
  const [clientReviewsError, setClientReviewsError] = useState(false);
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [personalDraft,     setPersonalDraft]     = useState(null);
  const [editSettings,   setEditSettings]   = useState(null);
  // The service list is edited as a DRAFT, exactly like editSettings, and is
  // written only by the one save button at the bottom of the panel.
  //
  // Two things were wrong before. Each row had its own ✓ that wrote to
  // service_prices on the spot, so the panel had two save buttons with
  // different scopes and no way to tell them apart — the bottom one never
  // touched services at all. And the row inputs edited the app-wide `services`
  // array directly, so a half-typed treatment name was immediately live in the
  // appointment dropdown, the cashier and the public booking page.
  //
  // Rows carry two markers while they are in the draft: _new for a row that
  // does not exist in the database yet, and _deleted for one that should be
  // removed on save. Neither is ever sent to the server.
  const [editServices,   setEditServices]   = useState(null);
  const [brandUploading, setBrandUploading] = useState(""); // which branding asset is uploading
  const [newService,     setNewService]     = useState({name:"",price:0,duration:60,color:DEFAULT_SERVICE_COLOR,active:true});
  const [showNewService, setShowNewService] = useState(false);
  const [showSetup, setShowSetup] = useState(false); // always-accessible setup checklist modal
  // Suggested-menu picker in Settings → שירותים. Selection is held here and
  // written only on confirm, so nothing lands on her price list — or her public
  // booking page — while she is still reading the list.
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templatePicks,      setTemplatePicks]      = useState([]);
  const [cashierAppt,     setCashierAppt]     = useState(null);
  const [cashierClient,   setCashierClient]   = useState(null);
  const [cashierSearch,   setCashierSearch]   = useState("");
  const [cashierItems,    setCashierItems]    = useState([]);
  const [cashierDiscount, setCashierDiscount] = useState(0);
  const [paymentMethod,   setPaymentMethod]   = useState("מזומן");
  const [cashierNote,     setCashierNote]     = useState("");
  // The till's small things. Discount can be shekels or a percentage; the
  // shekel figure is what gets stored either way. A tip is its own column and
  // never part of the amount. A split is two or more (method, amount) lines
  // that have to add up to the total before the receipt is written.
  const [cashierDiscountMode, setCashierDiscountMode] = useState("ils"); // ils | pct
  const [cashierTip,      setCashierTip]      = useState(0);
  const [splitOn,         setSplitOn]         = useState(false);
  const [splitLines,      setSplitLines]      = useState([{method:"ביט",amount:0},{method:"מזומן",amount:0}]);
  // Void form on the receipt modal: the reason is required.
  const [voidOpen,        setVoidOpen]        = useState(false);
  const [voidReason,      setVoidReason]      = useState("");
  // "גם להחזיר את הכסף ללקוחה ב-Grow": on by default for a sale paid through Grow (lib/grow/voidRefund.ts).
  const [voidGrowRefund,  setVoidGrowRefund]  = useState(true);
  // The refund state of each voided Grow sale, for the till history (GET /api/grow/void-refund, lib/grow/refundFollowups.ts):
  // receiptId -> { state: refunded | in_progress | failed | void_only, stuck?, canRetry? }. Empty while Grow is off for her.
  const [growRefundStates, setGrowRefundStates] = useState({});
  // A recurring appointment: "every N weeks, M times", new appointments only.
  const [apptRepeat,      setApptRepeat]      = useState({on:false, everyWeeks:3, count:6});
  // Grow deposit on a booking she makes by hand: the switch in the appointment sheet, and the link sheet that follows a save with it on.
  const [apptDeposit,     setApptDeposit]     = useState(false);
  const [depositLink,     setDepositLink]     = useState(null);
  // Whether this visit is drawn from a package. OFF until she taps it: she paid
  // up front, and a session leaving her balance without being asked for is the
  // one thing this must never do.
  const [drawFromPackage, setDrawFromPackage] = useState(false);
  // A client membership credit used on this visit (app/MembershipTill.jsx): { membershipId, service, price, planName } or null. OFF until she taps it.
  const [membershipAdj, setMembershipAdj] = useState(null);
  // false until the memberships tab says it has something to show (flag on, Grow connected, the migration run).
  const [membershipsAvail, setMembershipsAvail] = useState(false);
  // Grow cancellation policy in the cashier: a deposit already paid for this appointment and client credit (app/GrowCashierCredit.jsx).
  const [growAdj, setGrowAdj] = useState({ deposit: 0, creditAvail: 0, creditOn: false });
  // A gift voucher used on this sale (app/VoucherRedeemTill.jsx): { ledgerId, voucherId, code, amount, balanceAfter, receiptId? }.
  const [voucherAdj, setVoucherAdj] = useState(null);
  // Her products (app/useProducts.js): loads nothing when products are switched off. Stock only ever moves on the server.
  const productsApi = useProducts(settings);
  // The till (קופה) in tabs: "pay" | "vouchers" | "products" (lib/tillTabs.ts). A tab for a feature that is off is not shown.
  const [tillTab, setTillTab] = useState("pay");
  // false once the vouchers panel says it has nothing to show (before its migration, or selling off with nothing sold).
  const [vouchersAvail, setVouchersAvail] = useState(true);
  // A request to open the voucher sale form, from "תשלום חדש" (a counter: each tap is a new request). The panel opens the SAME sale
  // form as its own "מכירת שובר" button (app/GiftVouchersPanel.jsx), so no sale logic lives here.
  const [voucherSellReq, setVoucherSellReq] = useState(0);
  const openVoucherSale = () => { setShowCashier(false); setActiveTab("cashier"); setTillTab("vouchers"); setVoucherSellReq(n=>n+1); };
  const [newPackage,  setNewPackage]  = useState({client_id:"",client_name:"",service:"",total_sessions:5,price:0,payment_method:PAYMENT_METHODS[0].key});
  // What she SELLS, as opposed to what someone has bought. Loaded lazily on the
  // packages tab rather than in loadAll: every read there is a CORE read, and a
  // core read that fails blanks the whole dashboard - so a table that does not
  // exist until a hand-run migration lands has no business in that list.
  const [offerings,        setOfferings]        = useState([]);
  const [offeringsError,   setOfferingsError]   = useState(false);
  const [newOffering,      setNewOffering]      = useState({service:"",sessions:5,price:0});
  const [showOfferingForm, setShowOfferingForm] = useState(false);
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
    // A "you used this month's ___" refusal for a feature that has an add-on pack (lib/pricing.ts, only with packs on) carries the
    // pack's button, which opens the add-ons in her billing settings. Recognised by its own wording (lib/addonOffer.ts).
    if (!action && type === "error") {
      const pack = addonPackForMessage(msg);
      if (pack && packAvailable(pack.key)) action = { label: addonButtonHe(pack), onClick: () => openUpgrades(pack.key) };
    }
    setToasts(prev => [...prev, { id, msg, type, action }]);
    // Error toasts stay until tapped: they carry real reasons now (an OAuth
    // error, a failed save), and a reason that vanishes in 3.5s while she is
    // still reaching for her phone camera is a reason she never had.
    if (type !== "error") {
      // Long enough to read: about 70ms a character, never under 3.5s, and 8s when there is a button to reach for (undo).
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), toastDurationMs(msg, !!action));
    }
  }, []);

  // Onboarding sends her here with ?svc=failed when the treatments she ticked could not be saved, so she is told
  // instead of finding an empty list and assuming she never did that step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("svc") !== "failed") return;
    toast(tr("הטיפולים שבחרת לא נשמרו. לא נורא, אפשר לבחור אותם שוב בהגדרות ← שירותים."), "error");
    p.delete("svc");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [toast]);

  // One-tap links from the weekly digest (lib/weeklyDigest.ts DIGEST_GO, /dashboard/digest): ?go=queue|leads|winback|week|birthdays
  // opens the screen the action is about. Anything else is ignored. A screen is handed to the screen link (?tab=, lib/screenLink.ts),
  // which opens it once loading ends; a sheet opens by its own state. "go" is stripped so a refresh does not reopen the sheet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const go = p.get("go");
    if (!go) return;
    const tabFor = { leads: "leads", week: "calendar", birthdays: "insights" };
    if (go === "queue") setShowWaQueue(true);
    else if (go === "winback") setShowLapsed(true);
    if (tabFor[go]) p.set("tab", tabFor[go]);
    if (go === "leads") setLeadFilter("new");
    if (go === "week") setCalView("week");
    p.delete("go");
    const qs = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // Keyboard activation for clickable elements that aren't native buttons:
  // Enter/Space triggers the element's own onClick (via .click()).
  const onKbdActivate = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); }
  };

  const askConfirm = useCallback((opts) => {
    setConfirmDialog({
      title: opts.title || tr("אישור"),
      message: opts.message || tr("האם את בטוחה?"),
      confirmText: opts.confirmText || tr("אישור"),
      cancelText: opts.cancelText || tr("ביטול"),
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
  // Synchronous in-flight guard for one-tap actions: `busy` is React state, so two taps inside the same frame both see it
  // false. A ref is already set when the second tap arrives (2026-10-20 audit: a double tap drew two package sessions).
  const inFlightRef = useRef(new Set());
  const runOnce = async (key, fn) => {
    if (inFlightRef.current.has(key)) return undefined;
    inFlightRef.current.add(key);
    try { return await fn(); } finally { inFlightRef.current.delete(key); }
  };

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
      toast(tr("אין חיבור לאינטרנט. שום דבר לא אבד, והפרטים שהזנת עדיין כאן. נסי לשמור שוב כשהחיבור יחזור."), "error");
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
      toast(tr("השעה הזו כבר תפוסה, אפשר לבחור שעה אחרת?"), "error");
      return;
    }
    console.error("[BeautyOS] db error:", code, message);
    toast(STUCK_HE, "error");
  }, [toast, isConnectionError]);

  const handleLogout = useCallback(() => {
    askConfirm({
      title: tr("התנתקות"),
      // The address is isolated (U+2068..U+2069): in the RTL sentence its dot and the "?" jumped to the wrong side (2026-11-08 QA).
      message: authEmail ? tr("את מחוברת כ-⁨{0}⁩. להתנתק?", [authEmail]) : tr("האם להתנתק מהמערכת?"),
      confirmText: tr("התנתקי"),
      onConfirm: async () => {
        try {
          setBusyKey("logout", true);
          clearUpgrades(); // the upgrades cache (usage, card last four) never outlives her session in this tab
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        } catch (err) {
          handleDbError(err, "logout");
          setBusyKey("logout", false);
        }
      },
    });
  }, [askConfirm, handleDbError, router, setBusyKey, authEmail]);

  // === COMPUTED ===
  const weekDates = getWeekDates(weekStart);
  const now    = new Date();
  const today  = formatDate(now);
  // One CALENDAR day, not 24 hours: on the night before Israel's spring clock change, now+24h lands on the day after tomorrow.
  const tomorrow = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 12));
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const lastMonth = thisMonth===0?11:thisMonth-1;
  const lastMonthYear = thisMonth===0?thisYear-1:thisYear;
  // Kalmea chrome accent (Stage 2 of the rebrand). Before this, this whole
  // family (pc/pc2/pcDeep/pcTint/pcGrad...) was derived from
  // settings.primary_color, and "hybrid theming" meant the ENTIRE dashboard
  // shell - nav, buttons, calendar highlights, every one of the ~345 uses
  // below - re-tinted to match whatever color a tenant picked. That mixed two
  // different things a client could read as branding into one variable: HER
  // business, and Kalmea the product. The shell is now fixed to Kalmea's
  // deep green regardless of her choice; her real color still exists, as
  // herAccent below, for the few things reached from inside this shell that
  // are genuinely hers (the printed receipt; DesignStudio, which re-applies
  // it locally further down since it otherwise inherits whatever this
  // component sets here).
  const pc = "#1F3A30";
  // Her actual accent (or the Kalmea product default if she hasn't chosen one
  // yet) - deliberately NOT what `pc` holds anymore. Read this, never `pc`,
  // anywhere that renders something a client attributes to her business.
  const herAccent = (settings&&settings.primary_color)||DEFAULT_ACCENT;
  // Derived theme shades from the CHROME accent above - the dashboard no
  // longer recolors when she picks a color in settings; only her own
  // public-facing surfaces do, via herAccent.
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
  // ── Settings: open, dirty, close ───────────────────────────────────────────
  //
  // One entry point for every route into the panel — the header gear, the
  // sidebar item, the setup checklist and the dashboard recommendations. It
  // exists because those routes used to each build their own draft, and
  // openSetupTab in particular did `setEditSettings({ ...settings })`
  // unconditionally from a button rendered INSIDE the open panel. Tapping the
  // checklist mid-edit therefore replaced everything she had typed with the
  // last saved values, silently, and dropped her on a different tab.
  //
  // So: build a draft only when the panel is closed. If it is already open,
  // carry the draft she is in and just move to the tab she asked for.
  // Keyed on whether a DRAFT exists, not on whether the panel is visible. The
  // import wizard hides Settings without closing it (openImportFor) precisely
  // so that nothing she typed is thrown away, and coming back afterwards must
  // land her in the same draft rather than a fresh one built from saved state.
  // A real close, and a successful save, both null the drafts.
  const openSettings = (tab, extra) => {
    if (!editSettings) setEditSettings({ ...settings });
    if (!editServices) {
      setEditServices(services.map(sv => ({ ...sv })));
    } else {
      // The services import writes straight to service_prices while the panel
      // is hidden. Fold anything new into the draft so it is visible and not
      // silently absent from the list she is editing — without touching rows
      // she has already changed.
      setEditServices(prev => {
        const held = new Set((prev || []).map(sv => sv.id).filter(Boolean));
        const missing = services.filter(sv => sv.id && !held.has(sv.id)).map(sv => ({ ...sv }));
        return missing.length ? [...(prev || []), ...missing] : prev;
      });
    }
    if (tab) { setSettingsTab(tab); if (SETTINGS_TAB_GROUP[tab]) setSettingsGroup(SETTINGS_TAB_GROUP[tab]); }
    if (extra === "newService") setShowNewService(true);
    setShowSettings(true);
    setShowSetup(false);
  };
  const openSetupTab = (tab, extra) => openSettings(tab, extra);
  // The add-on buttons (toast, reels, the post generator) all send one event; it opens Settings > העסק שלי at the add-ons.
  const openAddonsRef = useRef(null);
  // `target` (the upgrades store): "billing-card" to save a card, "business-referral" for the invite link; default the add-ons.
  openAddonsRef.current = (target = "billing-addons") => {
    setSettingsGroup("business");
    openSettings();
    setTimeout(() => { try { document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "smooth" }); } catch { /* not rendered yet */ } }, 700);
  };
  // The upgrades store's cache is keyed by who is signed in (app/UpgradesStore.jsx): set it now, and on every sign-in, sign-out or switch.
  useEffect(() => {
    let alive = true;
    // No session yet (INITIAL_SESSION during a reload) is "not known", never a sign-out: her saved purchase ids must survive it.
    supabase.auth.getSession().then(({ data }) => { if (alive) setUpgradesIdentity(data?.session?.user?.id || null); }).catch(() => {});
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") clearUpgrades();
      else setUpgradesIdentity(session?.user?.id || null);
    });
    return () => { alive = false; authSub?.subscription?.unsubscribe?.(); };
  }, []);
  useEffect(() => {
    const on = (e) => openAddonsRef.current?.(e?.detail?.target);
    window.addEventListener(OPEN_ADDONS_EVENT, on);
    return () => window.removeEventListener(OPEN_ADDONS_EVENT, on);
  }, []);

  // Has anything in the panel changed? Compared by value against the saved
  // state, not tracked by a flag, so typing a character and typing it back out
  // again correctly counts as clean. Both drafts start as copies, so key order
  // matches and a string compare is enough.
  const settingsDirty = useMemo(() => {
    if (!editSettings) return false;
    if (JSON.stringify(editSettings) !== JSON.stringify(settings)) return true;
    if (editServices && JSON.stringify(editServices) !== JSON.stringify(services)) return true;
    return false;
  }, [editSettings, settings, editServices, services]);
  // Cards that save to their own table (the cancellation policy) count too, so the bar never says "אין שינויים" over an unsaved change.
  const pendingCardSaves = usePendingSaveCount();
  const panelDirty = settingsDirty || pendingCardSaves > 0;

  // Closing throws the draft away, so it asks first when there is one. `force`
  // is for the save path, which has already written everything.
  const closeSettings = useCallback((force) => {
    const done = () => {
      setShowSettings(false);
      setEditSettings(null);
      setEditServices(null);
      setShowNewService(false);
      setShowTemplatePicker(false);
      setTemplatePicks([]);
      clearPendingSaves();
    };
    if (force || !panelDirty) { done(); return; }
    askConfirm({
      title: tr("לצאת בלי לשמור?"),
      message: tr("יש שינויים שעדיין לא נשמרו. אם תצאי עכשיו הם יאבדו."),
      confirmText: tr("צאי בלי לשמור"),
      cancelText: tr("חזרה לעריכה"),
      danger: true,
      onConfirm: done,
    });
  }, [panelDirty, askConfirm]);

  // ── Onboarding walkthrough — trigger + persistence. The handlers that
  // actually advance/skip/finish the tour live further down, right after
  // openNewAppt is declared (the finish step opens it). This just decides
  // WHEN to start: once, the first time settings has loaded for a tenant
  // that hasn't seen it, resuming at whatever step she last reached rather
  // than always restarting at 0.
  const [tourStep, setTourStep] = useState(null);
  const tourTriggeredRef = useRef(false);
  // The trigger effect itself sits after the "3 צעדים לתור הראשון" block below: it waits for that card (lib/tourFlow.js tourMayStart).

  // Fire-and-forget: merges into the existing automations bag (the save
  // route replaces the WHOLE column, not a per-key patch - sending just
  // {onboarding_tour_seen:true} without the rest of her automations would
  // silently wipe her quiet hours, reminder toggles, everything else in
  // there) and updates local state optimistically so skip/finish read back
  // correctly without waiting on a refetch.
  const persistTourPatch = useCallback((patch) => {
    const base = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    const nextAutomations = { ...base, ...patch };
    setSettings(prev => ({ ...prev, automations: { ...((prev.automations && typeof prev.automations === "object") ? prev.automations : {}), ...patch } }));
    fetch("/api/settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { automations: nextAutomations } }),
      // keepalive: ending the tour is often followed at once by leaving the page, and a plain fetch is cancelled by that navigation:
      // the "seen" flag was then never saved and the tour came back (found 2026-10-07, intermittent on a fresh account).
      keepalive: true,
    }).catch(() => {});
  }, [settings.automations]);

  // One automations key saved on its own, AND said when it did not save (unlike the tour's fire-and-forget above): the
  // booking buttons card's "סימנתי שעשיתי" (app/BookingButtonsCard.jsx). Written into editSettings too, so saving the Settings
  // panel afterwards carries the same value instead of an older copy.
  const saveAutomationsKey = useCallback(async (key, value) => {
    const base = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    try {
      const r = await fetch("/api/settings/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { automations: { ...base, [key]: value } } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || String(r.status));
    } catch {
      toast(tr("הסימון לא נשמר. אפשר לנסות שוב בעוד רגע"), "error");
      return false;
    }
    const put = (prev) => prev ? ({ ...prev, automations: { ...((prev.automations && typeof prev.automations === "object") ? prev.automations : {}), [key]: value } }) : prev;
    setSettings(put);
    setEditSettings(put);
    return true;
  }, [settings.automations, toast]);

  // The tour follows her (lib/tourFlow.js). It used to stay on step 1 ("היום שלך 1/6") over every screen until she pressed דלגי.
  // Going to the screen a step describes jumps to that step; going anywhere the tour has no step for ends it; closing Settings while the
  // tour is on its Settings step ends it too (nothing is left to point at).
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    const prevTab = prevTabRef.current; prevTabRef.current = activeTab;
    const move = tourOnNavigate({ steps: tourSteps, stepIndex: tourStep, prevTab, tab: activeTab, showSettings });
    if (move.type === "jump") { setTourStep(move.step); persistTourPatch({ onboarding_tour_step: move.step }); }
    else if (move.type === "end") { setTourStep(null); persistTourPatch({ onboarding_tour_seen: true }); }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tourStrandedOutsideSettings({ steps: tourSteps, stepIndex: tourStep, showSettings })) return;
    setTourStep(null); persistTourPatch({ onboarding_tour_seen: true });
  }, [showSettings, tourStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = settings?.tenant_id;
    if (!t) return;
    try { if (localStorage.getItem(`kl_link_shared_${t}`) === "1") setLinkShared(true); } catch { /* storage blocked: stays unticked */ }
  }, [settings?.tenant_id]);
  const _sb = (settings.branding && typeof settings.branding === "object") ? settings.branding : {};
  const setupSteps = [
    { key:"details",  done: !!(settings.business_name && settings.business_name.trim() && settings.business_name.trim()!=="העסק שלי") && !!(settings.business_phone && String(settings.business_phone).trim()), label:tr("פרטי העסק"), hint:tr("שם וטלפון ליצירת קשר"), onClick:()=>openSetupTab("general") },
    { key:"tax",      done: !!settings.business_tax_status, label:tr("סוג העסק (פטור, מורשה או חברה)"), hint:tr("קובע איזה מסמך חוקי אפשר להפיק"), onClick:()=>openSetupTab("general") },
    { key:"services", done: services.length>0, label:tr("שירותים ומחירים"), hint:tr("רשימת הטיפולים והמחירים"), onClick:()=>openSetupTab("services","newService") },
    { key:"hours",    done: !!(settings.business_hours && typeof settings.business_hours==="object" && Object.keys(settings.business_hours).length>0) || (settings.working_hours_start!=null && settings.working_hours_end!=null), label:tr("שעות פעילות"), hint:tr("מתי העסק פתוח"), onClick:()=>openSetupTab("hours") },
    { key:"link",     done: linkShared||!!settings?.automations?.link_shared_at||appointments.length>0, label:tr("שליחת הקישור לקביעת תור ללקוחה"), hint:tr("כך התור הראשון נקבע לבד"), cta:tr("העתקת הקישור"), onClick:()=>copyPublicLink("book") },
    { optional:true, key:"branding", done: !!_sb.logo_url && !!settings.primary_color && !!(_sb.welcome_headline||_sb.welcome_message), label:tr("מיתוג"), hint:tr("לוגו, צבעים וטקסט פתיחה"), onClick:()=>openSetupTab("branding") },
    { optional:true, key:"gallery",  done: Array.isArray(_sb.gallery) && _sb.gallery.length>0, label:tr("גלריית תמונות"), hint:tr("תמונות לעמוד העסק"), onClick:()=>openSetupTab("branding") },
    { optional:true, key:"social",   done: !!(_sb.whatsapp_number||_sb.instagram||_sb.facebook||_sb.tiktok||_sb.website), label:tr("רשתות חברתיות וקישורים"), hint:tr("וואטסאפ, אינסטגרם, אתר ועוד"), onClick:()=>openSetupTab("branding") },
    // Was: settings.green_api_token, which the browser no longer receives.
  ];
  // Guided, one step at a time - deliberately NOT an accordion. Only the next
  // incomplete step can be opened; completed ones sit collapsed with their tick
  // and the ones beyond the next are visible but not yet actionable. Everything
  // starts collapsed, so the card is a short list of single lines instead of
  // seven expanded blocks.
  // UX pass 2026-11-08: five core steps count; branding, gallery and social are "לא חובה, אבל עוזר" and live only
  // in the Settings checklist, so "הגדרת המערכת" leaves Today once the core five are done.
  const coreSetupSteps = setupSteps.filter(s=>!s.optional);
  const extraSetupSteps = setupSteps.filter(s=>s.optional);
  const nextSetupKey = (coreSetupSteps.find(s=>!s.done)||extraSetupSteps.find(s=>!s.done)||{}).key || null;
  // Holds the key she expanded, not a boolean. Once that step is completed the
  // key stops matching nextSetupKey on its own, so the following step arrives
  // collapsed and no effect is needed to reset anything.
  const [expandedSetupKey, setExpandedSetupKey] = useState(null);
  // Help page accordion: the key she opened; null = the first section.
  const [expandedHelpKey, setExpandedHelpKey] = useState(null);

  const setupDone = coreSetupSteps.filter(s=>s.done).length;
  const setupTotal = coreSetupSteps.length;
  const setupPct = Math.round((setupDone/setupTotal)*100);
  const renderSetupBody = (withExtras = false) => (
    <>
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
          <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep}}>{setupDone} {tr("מתוך")} {setupTotal} {tr("הושלמו")}</span>
          <span style={{fontSize:"var(--t-xs)",color:"var(--ink-3)"}}>{setupPct}%</span>
        </div>
        <div style={{height:8,borderRadius:"var(--r-lg)",background:pcTint,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${setupPct}%`,background:pcGrad,borderRadius:"var(--r-lg)",transition:"width 0.5s ease"}}/>
        </div>
      </div>
      {setupDone===setupTotal && (
        <div style={{textAlign:"center",padding:"6px 0 14px"}}>
          <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:pcDeep,marginBottom:3}}>{tr("הכל מוכן! ✨")}</p>
          <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",lineHeight:1.5}}>{tr("המערכת שלך מוגדרת. אפשר לחזור לכאן בכל עת כדי לעדכן.")}</p>
        </div>
      )}
      {renderSetupRows(coreSetupSteps)}
      {withExtras && extraSetupSteps.length>0 && (<>
        <p style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink-2)",margin:"16px 2px 6px"}}>{tr("לא חובה, אבל עוזר")}</p>
        {renderSetupRows(extraSetupSteps)}
      </>)}
    </>
  );
  const renderSetupRows = (list) => (
    <>
      {/* ONE bordered box with hairline-separated rows, not seven cards each
          with its own border, radius and 8px gap - that per-card chrome was
          most of the height. A row is now a single ~34px line: small ring,
          label, arrow. Completed steps keep a plain background and a green
          tick rather than a filled green row, which is what made the card read
          as a stack of blocks.
          One step is open at a time. The next incomplete step is emphasised
          (accent ring, bold label) but every incomplete step is tappable, so
          the arrow on each line does what it looks like it does. */}
      <div style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",overflow:"hidden"}}>
        {list.map((s,i)=>{
          const isNext = !s.done && s.key===nextSetupKey;
          const open   = !s.done && expandedSetupKey===s.key;
          return (
          <div key={s.key} style={{borderTop:i===0?"none":"1px solid var(--line)",background:open?pcTint:"transparent",transition:"background 0.18s"}}>
            {/* Collapsed line — always visible. */}
            <button
              onClick={()=>{ if(!s.done) setExpandedSetupKey(open?null:s.key); }}
              aria-expanded={s.done?undefined:open}
              disabled={s.done}
              style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 11px",minHeight:44,background:"none",border:"none",fontFamily:"inherit",textAlign:"right",cursor:s.done?"default":"pointer"}}>
              <span style={{width:18,height:18,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-sm)",fontWeight:700,background:s.done?"var(--success)":"transparent",color:s.done?"var(--surface)":pc,border:s.done?"none":`1.5px solid ${isNext?pc:"var(--line-2)"}`}}>{s.done?"✓":""}</span>
              <span style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",fontWeight:isNext?700:500,color:s.done?"var(--ink-2)":"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trv(s.label)}</span>
              {s.done
                ?<span style={{fontSize:"var(--t-sm)",color:"var(--success)",fontWeight:700,flexShrink:0}}>{tr("✓ בוצע")}</span>
                :<span aria-hidden style={{fontSize:"var(--t-md)",color:isNext?pc:"var(--ink-3)",flexShrink:0,display:"inline-block",transition:"transform 0.2s",transform:open?"rotate(-90deg)":"none"}}>←</span>}
            </button>

            {/* Expanded body — the hint and the action, revealed on request. */}
            {open&&(
              <div style={{padding:"0 11px 10px 11px",display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                <p style={{flex:1,minWidth:110,fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5}}>{trv(s.hint)}</p>
                <button onClick={s.onClick} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-lg)",padding:"6px 16px",minHeight:44,fontSize:"var(--t-sm)",fontWeight:600,flexShrink:0,whiteSpace:"nowrap",cursor:"pointer",fontFamily:"inherit"}}>{s.cta||tr("הגדרה ←")}</button>
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
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:"var(--ink-2)",letterSpacing:"0.03em"}}>{trv(g.label)}</span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{rows.length}</span>
 </div>
        {rows.map((r,i)=>(
 <div key={g.type+i} onClick={()=>{ openSearchResult(r); if(onPick) onPick(); }} className="client-row"
          style={{padding:"9px 14px",borderBottom:"1px solid var(--line)",cursor:"pointer",display:"flex",gap:10,alignItems:"center"}}>
 <span style={{width:26,height:26,borderRadius:"var(--r-xs)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-sm)",color:"var(--pc)",background:"var(--pc-tint)"}}>{g.icon}</span>
 <div style={{flex:1,minWidth:0}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trv(r.label)}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trv(r.sub)}</p>
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
  // Her buffer after each treatment (lib/serviceBuffer.ts): per service (service_prices.buffer_minutes, once
  // add_service_buffer_2026-11-05.sql runs), else the business default in branding.booking_rules. 0 until she sets one.
  // Every in-app "is this time free" test reads it, so the calendar and the public page agree about what is taken.
  const apptBufferOf = useMemo(() => bufferLookup(services, businessBufferDefault(settings?.branding)), [services, settings]);
  const newApptBufferFor = useCallback((serviceName) => apptBufferOf({ service: serviceName }), [apptBufferOf]);

  // ── "3 צעדים לתור הראשון" (lib/firstBooking.js, app/FirstBookingCard.jsx) ──
  // Pending until her settings, the full appointment history and this phone's record are all in: before that the
  // answer could be wrong in either direction (a card for a busy business, or no card for a new one).
  const fbEnabled = firstBookingCardEnabled(settings?.automations);
  useEffect(() => {
    const t = settings?.tenant_id;
    if (!t) return;
    let rec = {};
    try { rec = JSON.parse(localStorage.getItem(firstBookingStorageKey(t)) || "{}") || {}; } catch { rec = {}; }
    setFirstLocal(rec && typeof rec === "object" ? rec : {});
  }, [settings?.tenant_id]);
  const fbSteps = firstBookingSteps({ services, clients, appointments, linkShared, linkSharedAt: settings?.automations?.link_shared_at });
  const fbRecord = firstBookingRecord(settings?.automations, firstLocal);
  const fbComputed = !fbEnabled ? "off"
    : (!settings?.tenant_id || firstLocal === null || !historyReady) ? "pending"
    : firstBookingView({ enabled: true, steps: fbSteps, record: fbRecord, appointments });
  const fbView = fbCelebrate ? "celebrate" : fbComputed;
  const fbWriteLocal = (patch) => {
    const t = settings?.tenant_id; if (!t) return;
    const next = { ...(firstLocal || {}), ...patch };
    setFirstLocal(next);
    try { localStorage.setItem(firstBookingStorageKey(t), JSON.stringify(next)); } catch { /* storage blocked: her account copy still counts */ }
  };
  useEffect(() => {
    // The first time the card is on screen, this phone remembers it, so finishing later earns the completion line.
    if (fbComputed === "active" && !fbRecord.shown_at) fbWriteLocal({ shown_at: new Date().toISOString() });
    // All three just became done: show the line for this visit, and record done_at so it never comes back.
    if (fbComputed === "celebrate" && !fbCelebrate) {
      const at = new Date().toISOString();
      setFbCelebrate(true);
      fbWriteLocal({ done_at: at });
      persistTourPatch({ [FIRST_BOOKING_KEY]: { shown_at: fbRecord.shown_at || at, done_at: at } });
    }
  }, [fbComputed]); // eslint-disable-line react-hooks/exhaustive-deps
  // The 8-step "הגדרת המערכת" card is never on Today next to the 3-step one (and not while the answer is pending).
  const setupOnToday = fbView !== "pending" && showSetupOnToday(fbView, setupDone, setupTotal);
  const fbShowing = fbView === "active" || fbView === "celebrate" || fbView === "pending";
  // "דורש תשומת לב" steps aside while the 3-step card is on Today (it only said "הכל מטופל" on an empty account).
  const attentionOnToday = showAttentionOnToday(fbView);

  // The tour she gets: the short one (היום, תשלומים, יומן) once she has used the 3-step card, the full six otherwise (lib/tourFlow.js).
  const tourSteps = useMemo(() => tourStepsFor(TOUR_STEPS, fbRecord), [fbRecord.shown_at, fbRecord.done_at]); // eslint-disable-line react-hooks/exhaustive-deps
  // When the tour starts: once, the first time settings has loaded for a tenant that hasn't seen it, resuming at whatever step she
  // last reached rather than always restarting at 0.
  useEffect(() => {
    if (tourTriggeredRef.current) return;
    if (!settings?.tenant_id) return; // settings row not loaded yet
    // Not on top of the import screen onboarding opened: the tour points at buttons hidden behind it. It starts once she closes the
    // import (2026-11-02 audit).
    if (showImportModal || showImportHub) return;
    // Not over the "3 צעדים לתור הראשון" card either, nor while it is still being decided: on day 1 the tour opened on top of it
    // (2026-11 activation follow-up). It starts once the card is finished or switched off.
    if (!tourMayStart(fbView)) return;
    tourTriggeredRef.current = true;
    const autos = (settings.automations && typeof settings.automations === "object") ? settings.automations : {};
    if (autos.onboarding_tour_seen === true) return;
    const resumeAt = tourResumeStep(autos.onboarding_tour_step, tourSteps); // never a step whose card cannot be drawn (the Settings one)
    if (resumeAt == null) return;
    setTourStep(resumeAt);
  }, [settings?.tenant_id, settings?.automations, showImportModal, showImportHub, fbView, tourSteps]);

  // Her menu, ordered by how often she actually books each treatment.
  //
  // The order moves as her practice moves, which is the point: the six chips at
  // the top should be the six she reaches for this season, not the six that
  // happened to be typed in first. Ties fall back to name so the order is
  // stable rather than arbitrary.
  const servicesByUse = useMemo(() => {
    const count = new Map();
    for (const a of appointments) {
      if (!a.service || a.confirmation_status === "cancelled") continue;
      count.set(a.service, (count.get(a.service) || 0) + 1);
    }
    return [...activeServices].sort((x, y) => {
      const d = (count.get(y.name) || 0) - (count.get(x.name) || 0);
      return d !== 0 ? d : String(x.name).localeCompare(String(y.name), "he");
    });
  }, [activeServices, appointments]);

  // Who the search offers. Capped at six: past that it is a list to read rather
  // than a shortlist to pick from, and she should type another letter instead.
  const apptClientMatches = useMemo(() => {
    const q = apptClientQuery.trim();
    if (!q) return [];
    return clients
      .filter(c => matchesQuery(q, { text: [c.name], phones: [c.phone] }))
      .slice(0, 6);
  }, [apptClientQuery, clients]);

  // A picker with nothing in it is not an empty picker to her - it looks like a
  // picker that has not loaded. Five modals showed a select holding only its
  // placeholder, and two of them then demanded a choice from it at save. This
  // is the one line they all say instead, naming the screen that fixes it.
  const setupHint = (text) => (
 <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",fontWeight:600,background:"rgba(242,184,75,0.12)",borderRadius:"var(--r-sm)",padding:"8px 10px"}}>{trv(text)}</p>
  );
  const NO_SERVICES_HINT = "עוד לא הוספת טיפולים. אפשר להוסיף אותם בהגדרות ← שירותים.";
  const NO_CLIENTS_HINT = "עוד אין לקוחות במערכת. אפשר להוסיף לקוחה במסך הלקוחות.";
  // The package this visit could be drawn from: an active one, belonging to
  // this client, with sessions left, whose service is actually on the receipt.
  // Matching on the service is the point - a facial package does not pay for a
  // peel, and offering it would be worse than offering nothing.
  const cashierPackage = useMemo(() => {
    if (!cashierClient) return null;
    return packages.find(pk =>
      pk.active &&
      String(pk.client_id) === String(cashierClient.id) &&
      Number(pk.used_sessions) < Number(pk.total_sessions) &&
      cashierItems.some(i => i.name === pk.service)
    ) || null;
  }, [cashierClient, packages, cashierItems]);

  // One session, one unit. A client taking two of the same treatment in a visit
  // draws ONE session and pays for the other - anything else spends a balance
  // she cannot see being spent.
  const packageSessionCredit = (drawFromPackage && cashierPackage)
    ? Number(cashierItems.find(i => i.name === cashierPackage.service)?.price || 0)
    : 0;
  // Subtotal, then the discount in shekels whichever way she typed it, then
  // the package credit. The tip sits outside all of it: it is what she was
  // handed, not what the treatment cost.
  const cashierSubtotal = cashierItems.reduce((s,item)=>s+(item.price*item.qty),0);
  const cashierDiscountIls = discountAmount(cashierSubtotal, cashierDiscountMode, Number(cashierDiscount||0));
  // A client membership credit covers one treatment's price, like a package session (never both on one visit: app/MembershipTill.jsx
  // is blocked while a package is drawn). Both are paid up front, so together they are the "package credit" the totals take off.
  const membershipCredit = membershipAdj ? Math.min(Number(membershipAdj.price) || 0, Math.max(0, cashierSubtotal - cashierDiscountIls - packageSessionCredit)) : 0;
  const packageCredit = packageSessionCredit + membershipCredit;
  // Deposit and credit come off AFTER the discount and the package: the deposit first (it was paid for this visit), then credit if she ticked it.
  const growBase = Math.max(0, cashierSubtotal - cashierDiscountIls - packageCredit);
  const growDepositUsed = Math.min(Number(growAdj.deposit) || 0, growBase);
  const growCreditUsed = growAdj.creditOn ? Math.min(Number(growAdj.creditAvail) || 0, Math.max(0, growBase - growDepositUsed)) : 0;
  // A gift voucher comes off last, like credit: it was paid for (and counted as income) the day it was sold.
  const voucherDue = Math.max(0, Math.round((growBase - growDepositUsed - growCreditUsed) * 100) / 100);
  const voucherUsed = voucherAdj ? Math.min(Number(voucherAdj.amount) || 0, voucherDue) : 0;
  const cashierTotal = Math.max(0, Math.round((cashierSubtotal - cashierDiscountIls - packageCredit - growDepositUsed - growCreditUsed - voucherUsed) * 100) / 100);
  // A membership credit belongs to one sale and one client: a closed till, or no client chosen, drops it (app/MembershipTill.jsx).
  useEffect(() => { if (!showCashier || !cashierClient?.id) setMembershipAdj(null); }, [showCashier, cashierClient?.id]);
  // The voucher belongs to one sale: a till that opens starts without it. A till closed after the voucher was used but before the
  // payment was recorded says so (the amount is already off the voucher; the vouchers list can give it back).
  const voucherOpenRef = useRef(false);
  useEffect(() => {
    if (showCashier) { if (!voucherOpenRef.current) { voucherOpenRef.current = true; setVoucherAdj(null); } return; }
    if (!voucherOpenRef.current) return;
    voucherOpenRef.current = false;
    if (voucherAdj && !voucherAdj.receiptId) toast(tr("השובר מומש אבל התשלום לא נרשם. אפשר להחזיר את הסכום לשובר מרשימת שוברי המתנה בקופה."), "error");
    setVoucherAdj(null);
  }, [showCashier, voucherAdj, toast]);
  // Two lines: the first is what she types, the second is whatever is left.
  const splitResolved = useMemo(() => {
    const first = { method: splitLines[0]?.method || "ביט", amount: Number(splitLines[0]?.amount) || 0 };
    const rest = Math.max(0, Math.round((cashierTotal - first.amount) * 100) / 100);
    return [first, { method: splitLines[1]?.method || "מזומן", amount: rest }];
  }, [splitLines, cashierTotal]);

  // ── Loyalty stamp card (lib/loyalty.js) ─────────────────────────────────────
  // Stamps are derived from receipts; the two loyalty tables (add_loyalty_2026-11-05.sql, handed over by hand) only hold rewards
  // given and manual corrections. loyaltyDb.ready: null = not read yet, false = the tables are not there (the card still counts, and a
  // reward at the till is marked on the receipt itself), true = read, "error" = the read failed. Nothing is computed until the full
  // history has arrived (historyReady) AND the ledgers have settled (loyaltyLedgersSettled: true or false only): counting from the
  // recent window alone would tell her a client is further from her gift than she is, and counting from ledgers still loading or
  // failed to load could offer a reward she already gave through Grow. Unknown shows nothing, never a wrong number.
  const loyaltyCfg = useMemo(() => loyaltyConfig(settings), [settings]);
  const [loyaltyDb, setLoyaltyDb] = useState({ ready: null, redemptions: [], adjustments: [] });
  const [loyaltyApplied, setLoyaltyApplied] = useState(null);
  // The receipt just saved at the till, so the after-save line shows on that one only (not on an old receipt opened from a list).
  const [loyaltyAfterFor, setLoyaltyAfterFor] = useState(null);
  const loyaltyServiceNames = useMemo(() => services.map((sv) => String(sv.name || "").trim()).filter(Boolean), [services]);
  const loadLoyaltyRows = useCallback(async () => {
    try {
      const [rq, aq] = await Promise.all([
        supabase.from("loyalty_redemptions").select("*").order("created_at", { ascending: true }).limit(5000),
        supabase.from("loyalty_adjustments").select("*").order("created_at", { ascending: true }).limit(5000),
      ]);
      if (isMissingLoyaltyTable(rq.error) || isMissingLoyaltyTable(aq.error)) {
        console.warn("[loyalty] migration missing: add_loyalty_2026-11-05.sql (counting still works from receipts)");
        setLoyaltyDb({ ready: false, redemptions: [], adjustments: [] });
        return;
      }
      if (rq.error || aq.error) { console.warn("[loyalty] read failed", rq.error || aq.error); setLoyaltyDb({ ready: "error", redemptions: [], adjustments: [] }); return; }
      setLoyaltyDb({ ready: true, redemptions: rq.data || [], adjustments: aq.data || [] });
    } catch (e) { console.warn("[loyalty] read failed", e); setLoyaltyDb({ ready: "error", redemptions: [], adjustments: [] }); }
  }, []);
  useEffect(() => { if (loyaltyCfg.enabled && settings?.tenant_id) loadLoyaltyRows(); }, [loyaltyCfg.enabled, settings?.tenant_id, loadLoyaltyRows]);
  const loyaltyFor = useCallback((clientId) => {
    if (!loyaltyCfg.enabled || !clientId || !historyReady || !loyaltyLedgersSettled(loyaltyDb.ready)) return null;
    return loyaltyState({ config: loyaltyCfg, clientId, receipts, voids: receiptVoids, redemptions: loyaltyDb.redemptions, adjustments: loyaltyDb.adjustments, serviceNames: loyaltyServiceNames });
  }, [loyaltyCfg, historyReady, receipts, receiptVoids, loyaltyDb, loyaltyServiceNames]);
  const cashierLoyalty = useMemo(() => loyaltyFor(cashierClient?.id), [loyaltyFor, cashierClient]);
  // The reward goes on the receipt only while it is still ready AND still for the till's own client (applied for one client, then the
  // client was changed: rewardIsStale, and the effect beside applyLoyaltyReward takes it off).
  const loyaltyRewardLive = !!(loyaltyApplied && cashierLoyalty?.ready && !rewardIsStale(loyaltyApplied, cashierClient?.id));

  // --- New-appointment modal timing (STAGE A: live end time, STAGE B: per-day hours) ---
  // Day-of-week of the picked date, parsed as LOCAL (not UTC) so it never shifts
  // across the date line. Falls back to today's day if the string is malformed.
  const apptDay = (()=>{ const p=String(newAppt.date||"").split("-"); return p.length===3?new Date(Number(p[0]),Number(p[1])-1,Number(p[2])).getDay():new Date().getDay(); })();
  // That day's open/close from the per-day business_hours (null = closed that day). In the team calendar: the picked person's own
  // hours for that weekday when she set them (lib/team.ts formDayHours, the same rule /api/book-appointment applies), so a staff
  // member who works on a day the business is closed can be booked, and one who is off that day cannot.
  const apptDayHours = teamCal ? formDayHours(team, apptStaff, settings, apptDay) : dayHoursFrom(settings, apptDay);
  // Bookable START hours for the day. Half-hour granularity, and slotsBetween
  // refuses any start whose treatment would run past the end of the range.
  const APPT_SLOT_STEP = 30;
  // Her hours are the DEFAULT, not the limit. A client who asks for one late
  // appointment should not cost her an edit to the whole week's schedule, so
  // the picker reaches a margin either side and marks anything out there.
  // Same principle as the week axis, which stretches to show an out-of-hours
  // appointment rather than hiding it.
  //
  // A margin, not the whole day: 03:00 is not an override she ever means, and
  // a list that long stops being a list of her day. Two hours covers the early
  // client and the late one and nothing else.
  const APPT_MARGIN_HOURS = 2;
  const apptOfferedHours = apptDayHours ? {
    open:  Math.max(0,  apptDayHours.open  - APPT_MARGIN_HOURS),
    close: Math.min(24, apptDayHours.close + APPT_MARGIN_HOURS),
  } : null;
  const apptSlotOptions = apptOfferedHours ? slotsBetween(apptOfferedHours.open, apptOfferedHours.close, APPT_SLOT_STEP, Number(newAppt.duration)||0) : [];
  // Outside her actual hours - by starting before she opens, or by RUNNING PAST
  // when she closes. The second half matters: a 60-minute treatment at 18:30
  // against a 19:00 close is out of hours even though 18:30 is not.
  const apptOutsideHours = (m) => !apptDayHours
    || m < apptDayHours.open*60
    || (m + (Number(newAppt.duration)||0)) > apptDayHours.close*60;
  // Keep the shown hour inside the day's range even before the clamp effect runs,
  // so the label + select stay consistent when the date changes.
  // startMinute once the picker has set one; hour*60 for the eight call sites
  // that still construct newAppt with a whole hour, where hour N means N:00.
  const apptRequestedStart = newAppt.startMinute != null ? Number(newAppt.startMinute) : Number(newAppt.hour) * 60;
  // An existing appointment keeps its own time even when it is not on the picker's grid (10:15 from voice or an import, or a time
  // outside the margin). Found 2026-10-21: the effect below no longer snapped it, but this fallback still did, so Save wrote the
  // day's first slot (06:00) and reset the confirmation. When she changes the day or the length the effect moves it as before.
  const apptKeepOwnTime = !!editingAppointmentId && Number.isFinite(apptRequestedStart) && !apptSlotOptions.includes(apptRequestedStart);
  const apptEffectiveStart = apptSlotOptions.includes(apptRequestedStart) || apptKeepOwnTime ? apptRequestedStart : (apptSlotOptions.length ? apptSlotOptions[0] : apptRequestedStart);
  const fmtHM = (mins)=>`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(((mins%60)+60)%60).padStart(2,"0")}`;
  const apptStartMin = apptEffectiveStart;
  const apptEndMin = apptStartMin + Number(newAppt.duration||0);
  // --- STAGE C: block double-booking ---
  // Busy [start,end) minute-intervals already taken on the picked date. Cancelled
  // appointments free their slot (grid + gap-fill treat them as available), so
  // they are excluded here.
  // In EDIT mode, exclude the appointment being edited so it never flags itself
  // as a conflict (an appointment can't clash with its own current slot).
  // Each range ends after that treatment's buffer (lib/serviceBuffer.ts; 0 when she set none), and the one being
  // booked brings its own: a time inside a buffer is taken, the same rule the public page and /api/book-appointment use.
  // An edit that keeps its own date, time, length and service is never refused over a buffer: it was booked before she
  // set one (or by her on purpose), and opening it to fix a note must not turn it red. Moving it applies the buffers,
  // and only then is appointments.buffer_minutes rewritten (lib/apptBuffer.ts), so the database agrees with this check.
  const apptEditOrig = editingAppointmentId ? appointments.find(a=>a.id===editingAppointmentId) : null;
  const apptBuffersApply = !(apptEditOrig && apptEditOrig.date===newAppt.date && startMinute(apptEditOrig)===apptEffectiveStart && Number(apptEditOrig.duration||0)===Number(newAppt.duration||0) && String(apptEditOrig.service||"")===String(newAppt.service||""));
  // Per person in the team calendar: another staff member's client at the same time is not a clash.
  const apptBusy = appointments
    .filter(a=>a.date===newAppt.date && a.confirmation_status!=="cancelled" && a.id!==editingAppointmentId && (!teamCal || sameStaff(a, apptStaff, team.staff)))
    .map(a=>{const s=startMinute(a),e=endMinute(a);return [s, e===null?null:e+(apptBuffersApply?apptBufferOf(a):0)];}).filter(([s,e])=>s!==null&&e!==null);
  const newApptBuffer = apptBuffersApply ? newApptBufferFor(newAppt.service) : 0;
  // Is a candidate start hour taken, given the currently selected duration?
  // Recomputes every render, so changing the duration re-evaluates the picker.
  const slotIsTaken = (m)=>{ const s=m, e=s+Number(newAppt.duration||0)+newApptBuffer; return apptBusy.some(([bs,be])=>s<be&&bs<e); };
  // Is the START hour currently shown in the picker itself taken? Drives the
  // persistent inline warning + the disabled Save button (derived, so it stays
  // visible until the therapist picks a free time — no toast to disappear).
  const apptSelectedTaken = !!apptDayHours && apptSlotOptions.length>0 && slotIsTaken(apptEffectiveStart);
  // Is the hour SHOWN in the picker outside her hours? Derived the same way and
  // for the same reason: it has to stay on screen for as long as the choice
  // does. An option label she read once while scrolling is not enough to stop
  // her booking 20:00 believing she is open then.
  const apptSelectedOutside = !!apptDayHours && apptSlotOptions.length>0 && apptOutsideHours(apptEffectiveStart);
  // Is the picked time within TIGHT_GAP_MINUTES of the appointment right
  // before or after it? Reuses apptBusy (already excludes cancelled rows and
  // the appointment being edited), so this is the exact same neighbourhood
  // the clash check already looked at - just a softer question than "taken".
  // "before"/"after" rather than a bool because the sentence needs to say
  // which side is tight.
  const apptGapWarning = (!apptSelectedTaken && apptBusy.length) ? (() => {
    for (const [bs, be] of apptBusy) {
      if (apptEffectiveStart - be >= 0 && apptEffectiveStart - be < TIGHT_GAP_MINUTES) return "before";
      if (bs - apptEndMin >= 0 && bs - apptEndMin < TIGHT_GAP_MINUTES) return "after";
    }
    return null;
  })() : null;
  // When the picked day changes and the current hour falls outside that day's
  // range, snap to the first open hour so a stale start can't be saved.
  // Duration is a dependency for the same reason: lengthening the treatment
  // shortens the option list from the end, so a start that no longer fits
  // before closing has to move rather than sit there out of range.
  // Guarded on length, because a day too short to fit the treatment at all
  // offers no slots, and snapping to apptSlotOptions[0] there wrote NaN.
  const apptTimeTouched = useRef(false); // true once she has picked a time in the sheet herself
  // The appointment as it was when she opened it for editing: its time is kept exactly, unless she changes the day or the length.
  const editOrigRef = useRef(null);
  useEffect(()=>{ if(showModal) apptTimeTouched.current=false; },[showModal]);
  useEffect(()=>{
    if(!showModal||!apptDayHours) return;
    // Opening an existing appointment to add a note must never move it (2026-10-20 audit: a 10:15 from voice or an import snapped to
    // 09:00 and was saved there without the client being told). It moves only if she changes its day or its length.
    const orig=editOrigRef.current;
    if(editingAppointmentId && orig && newAppt.date===orig.date && Number(newAppt.duration)===orig.duration) return;
    if(apptSlotOptions.length && !apptSlotOptions.includes(apptRequestedStart)) {
      // The first slot is now an hour or two BEFORE she opens, and snapping
      // onto it would hand her an out-of-hours default she never asked for.
      // The margin is somewhere she can go, not somewhere she gets put.
      const target = apptSlotOptions.find(m=>!apptOutsideHours(m)) ?? apptSlotOptions[0];
      setNewAppt(prev=>({...prev,startMinute:target,hour:Math.floor(target/60)}));
    }
    // A NEW appointment opens on a time that is free, not on the hour she opens (usually taken on a busy day: the first
    // thing she saw was a red "השעה תפוסה"). Only until she picks a time herself; an edit keeps the time it has.
    if(!editingAppointmentId && !apptTimeTouched.current && apptSlotOptions.length){
      const want = firstFreeStart({options:apptSlotOptions,requested:apptRequestedStart,duration:Number(newAppt.duration)||0,busy:apptBusy,outside:apptOutsideHours});
      if(apptSlotOptions.includes(want) && want!==apptRequestedStart) setNewAppt(prev=>({...prev,startMinute:want,hour:Math.floor(want/60)}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showModal,newAppt.date,newAppt.duration,apptDayHours?.open,apptDayHours?.close,appointments,editingAppointmentId]);

  // Mount only. loadAll is a plain function, recreated on every render, so
  // listing it here would re-run the whole eleven-table load on every render.
  // The previous directive was a BLOCK comment on this same line, so
  // "next-line" pointed at the blank line below and suppressed nothing - the
  // warning had been firing ever since.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ loadAll(); },[]);
  useEffect(()=>{ if(activeTab==="tax") preloadXlsx(); },[activeTab]);

  // Separate from loadAll on purpose: this is one small status read, and a
  // failure here must not be able to blank the dashboard.
  useEffect(()=>{
    fetch("/api/settings/lead-key").then(r=>r.json()).then(d=>{ if(d?.success) setLeadKeyConfigured(!!d.configured); }).catch(()=>{});
  },[]);


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
      .catch(()=>{ if(!cancelled){ setSkinQueue([]); setSkinQueueError(tr("לא הצלחנו לטעון הצעות מעקב עור כרגע")); } })
      .finally(()=>{ if(!cancelled) setSkinQueueLoading(false); });
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeTab]);


  // Scanner ceiling, loaded when she opens Settings — where the link lives.
  // Silent on failure: a number she cannot see is better than a wrong one, and
  // the card renders nothing rather than a confident zero.
  useEffect(()=>{
    if(activeTab!=="settings") return;
    let cancelled=false;
    fetch("/api/skin-scan/link")
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(!cancelled && d && d.success) setScanQuota(d); })
      .catch(()=>{});
    return ()=>{cancelled=true;};
  },[activeTab]);

  // Approve a Skin Follow-up suggestion: open her WhatsApp with the prepared
  // message so she sends it from her own phone. This is a marketing message,
  // and marketing goes out through wa.me like the comeback and gap-fill
  // windows (lib/whatsapp.js). It used to be a "test mode" button that added a
  // key to a Set and toasted "no real message was sent" - an approve step with
  // nothing behind it, on a card that promised a follow-up. Now the tap is the
  // send. Validates the client still exists and has a phone, and guards
  // against a second tap on the same card.
  const approveSkinFollowup = (it) => {
    if(queueApproved.has(it.key)) return; // double-click / repeated-approval guard
    const c = clients.find(x=>String(x.id)===String(it.clientId));
    if(!c){ toast(tr("הלקוחה כבר לא קיימת, הפעולה בוטלה. אפשר לרענן את המסך."),"error"); return; }
    if(!(c.phone&&String(c.phone).trim())){ toast(tr("אין ללקוחה מספר טלפון, אז אי אפשר לשלוח לה"),"error"); return; }
    const text = String(it.message||"").trim();
    if(!text){ toast(tr("אין הודעה מוכנה לכרטיס הזה"),"error"); return; }
    const link = waMsg(c.phone, text);
    if(!link){ toast(tr("מספר הטלפון של הלקוחה לא תקין"),"error"); return; }
    window.open(link, "_blank", "noopener");
    setQueueApproved(prev=>{const n=new Set(prev);n.add(it.key);return n;});
    toast(tr("נפתחה שיחת וואטסאפ עם ההודעה מוכנה, שלחי משם ✓"),"success");
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
      return { label:tr("פתחי משימות ממתינות"), run:()=>setActiveTab("dashboard") };
    if(has("קמפיין","מבצע","שיווק","פוסט","סושיאל","אינסטגרם","פייסבוק"))
      return { label:tr("צרי קמפיין"), run:()=>{ setMarketingView("campaigns"); setActiveTab("campaigns"); } };
    if(has("ליד","פנייה","פניות","לידים"))
      return { label:tr("פתחי פניות"), run:()=>setActiveTab("leads") };
    if(has("יומן","תור פנוי","תורים פנויים","למלא את היומן","זמינות"))
      return { label:tr("פתחי יומן"), run:()=>setActiveTab("calendar") };
    if(has("תמחור","העלאת מחיר","המחיר","חבילת","חבילות"))
      return { label:tr("פתחי שירותים ומחירים"), run:()=>openSettings("services") };
    return null;
  };

  // Facebook connect: load the current connection state on mount, and handle the
  // return from the OAuth callback. The callback redirects back here with
  // ?fb_success=true (page connected) or ?fb_error=... — show a toast, then strip
  // those params so a refresh doesn't re-fire the message.
  useEffect(() => {
    // loadFbConnection is NOT called here any more: its two queries ran for every tenant at boot, including the
    // many who never open the content or leads tabs. It runs when one of those opens (effect below), and after
    // the OAuth return further down.
    loadPendingQuestion();
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("fb_success") === "true") {
        toast(tr("הדף חובר בהצלחה ✦"));
        loadFbConnection();
      } else if (params.get("fb_error")) {
        // Show the real reason when the callback sent one (fb_reason carries
        // the actual error text). A generic "failed, try again" cost three
        // debugging round-trips on an error the server knew all along.
        const code = params.get("fb_error");
        const reason = params.get("fb_reason");
        const labels = {
          invalid_state: "פג תוקף החיבור, נסי שוב",
          not_authenticated: "יש להתחבר קודם למערכת",
          no_tenant: "לא זוהה עסק לחשבון הזה",
          no_pages: "לא נמצאו דפי פייסבוק בחשבון",
          save_failed: "לא הצלחנו לשמור את הדף, אפשר לנסות שוב",
          subscribe_failed: "הדף נשמר, אבל ההתראות על פניות חדשות לא הופעלו. נסי להתחבר שוב ולאשר את כל ההרשאות",
          missing_parameters: "פייסבוק החזיר תשובה חסרה, נסי שוב",
        };
        const base = labels[code] || "החיבור לא הושלם, אפשר לנסות שוב";
        toast(reason ? `${base}: ${reason}` : `${base} (${code})`, "error");
      }
      if (params.has("fb_success") || params.has("fb_error") || params.has("pages") || params.has("fb_reason")) {
        params.delete("fb_success"); params.delete("fb_error"); params.delete("pages"); params.delete("fb_reason");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
      }
    } catch { /* non-fatal */ }
    /* eslint-disable-next-line */
  }, []);

  // Esc closes any open modal / drawer (does not touch session/tenant logic).
  //
  // The listener is registered once, so it cannot read current state directly.
  // This ref carries the two things it needs — whether Settings is open, and
  // the current close function, which knows whether the draft is dirty.
  const escRef = useRef({});
  useEffect(() => {
    escRef.current = { showSettings, closeSettings, confirmOpen: !!confirmDialog };
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // A confirm sits on top of whatever opened it — including the unsaved
      // changes prompt itself. Dismiss that first, or Escape would answer one
      // prompt by raising another.
      if (escRef.current.confirmOpen) { setConfirmDialog(null); return; }
      // Settings owns its own close: it may have unsaved work and must ask.
      // Returning here also stops the blanket reset below from nulling
      // editSettings behind the prompt's back.
      if (escRef.current.showSettings) { escRef.current.closeSettings(); return; }
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

  // When a modal opens, focus its first input field (every modal is a <Sheet>).
  const anyModalOpen = showModal||showClientModal||showImportModal||showLeadModal||
    showCashier||!!showReceipt||showPackageModal||showWaitlistModal||showProtocolModal||
    showPostModal||showSettings||!!confirmDialog;
  useEffect(() => {
    if (!anyModalOpen) return;
    const id = setTimeout(() => {
      const el = document.querySelector('.sheet input:not([type="hidden"]):not([type="file"]), .sheet textarea, .sheet select');
      if (el) { try { el.focus(); } catch {} }
    }, 60);
    return () => clearTimeout(id);
  }, [anyModalOpen]);

  // Load skin-scan history whenever a client card is opened
  useEffect(() => {
   setPhotoTreatmentPrefill(""); // a prefilled treatment name belongs to the client it was set for
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
    if (!isTabVisible(settings, activeTab) || !viewAllowsTab(settings, activeTab)) setActiveTab("dashboard");
  }, [settings, activeTab]);
  // The same backstop for Settings: in "קופה, ניקובים ודוחות בלבד" (lib/viewMode.ts) the page and messages groups are not offered,
  // so a restored address or an old shortcut lands on העסק שלי instead.
  useEffect(() => {
    if (!viewAllowsSettingsGroup(settings, settingsGroup)) setSettingsGroup("business");
  }, [settings, settingsGroup]);

  useEffect(() => {
    if (activeTab === "community") loadCommunityPosts();
    if (activeTab === "protocols") loadProtocols();
    if (activeTab === "advisor" && advisorMessages === null) loadAdvisor();
    /* eslint-disable-next-line */
  }, [activeTab]);

  // The advisor thinks for several seconds before its first word. Clock the wait,
  // so the bubble can change and show how long it has been (lib/advisorWait.js)
  // instead of sitting on one static line that looks like a hang.
  useEffect(() => {
    if (!advisorSending) { setAdvisorWaitSec(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setAdvisorWaitSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [advisorSending]);

  // Keep the advisor chat scrolled to the latest message.
  useEffect(() => {
    const el = document.getElementById("advisor-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [advisorMessages, advisorSending]);

  // The three reads the dashboard does not need. Started after the core load
  // succeeds (and again on every reload, since loadAll calls it), so they ride
  // behind first render instead of inside it. A failed read is "error", never
  // an empty list - same rule as the core reads, applied per screen.
  const loadDeferred = async () => {
    try {
      const [f, ex, wl] = await Promise.all([
        // The list only: no form_data, no signature. The answers are read one form at a time, when she opens them
        // (app/FormAnswersSheet). If the narrowed read fails for any reason, the full read it replaced runs instead.
        readAllRows(supabase, "forms", { columns: FORM_LIST_COLUMNS }).then(r => (r?.error ? readAllRows(supabase, "forms") : r)),
        readAllRows(supabase, "expenses"),
        readAllRows(supabase, "waitlist"),
      ]);
      const take = (name, res, set) => {
        // A read that stopped short (complete:false) is an error, not a shorter list.
        if (res?.error || res?.complete === false) {
          console.error(`[BeautyOS] loadDeferred: ${name} failed`, res.error || `${res.fetched}/${res.total}`);
          try { Sentry.captureException(new Error(`loadDeferred ${name} — ${res.error?.message || "incomplete"}`)); } catch {}
          return "error";
        }
        set(res?.data || []);
        return "ok";
      };
      setDeferred(prev => ({
        ...prev,
        forms: take("forms", f, setForms),
        expenses: take("expenses", ex, setExpenses),
        waitlist: take("waitlist", wl, setWaitlist),
      }));
    } catch (err) {
      console.error("[BeautyOS] loadDeferred threw:", err);
      try { Sentry.captureException(err); } catch {}
      setDeferred(prev => ({ ...prev, forms: "error", expenses: "error", waitlist: "error" }));
    }
  };

  // The older half of the data, read AFTER the first screen is on: appointments before the recent window, payments before it, and the leads.
  // Each read is complete or it is an error: a partial history is never merged in and called done (same rule as the boot reads). Rows are
  // merged by id, so one that was created while this ran is not duplicated. Safe to call again (the retry button does).
  const historyCutoffRef = useRef(null);
  const loadHistory = async () => {
    const cut = historyCutoffRef.current || (historyCutoffRef.current = historyCutoff());
    setDeferred(prev => ({ ...prev, history: "loading", leads: "loading" }));
    try {
      const [oa, orc, ld] = await Promise.all([
        readAllRows(supabase, "appointments", { filter: (q) => q.lt("date", cut.date) }),
        readAllRows(supabase, "receipts", { filter: (q) => q.lt("created_at", cut.iso) }),
        readAllRows(supabase, "leads"),
      ]);
      const okRead = (r) => !r.error && r.data && r.complete !== false;
      if (okRead(oa)) setAppointments(prev => mergeById(prev, oa.data));
      if (okRead(orc)) setReceipts(prev => mergeById(prev, orc.data));
      if (okRead(ld)) setLeads(prev => mergeById(prev, ld.data));
      for (const [name, r] of [["appointments", oa], ["receipts", orc], ["leads", ld]]) {
        if (!okRead(r)) {
          console.error(`[BeautyOS] loadHistory: ${name} not fully read`, r.error || `${r.fetched}/${r.total}`);
          try { Sentry.captureException(new Error(`loadHistory ${name} — ${r.error?.message || "incomplete"}`)); } catch {}
        }
      }
      setDeferred(prev => ({ ...prev, history: okRead(oa) && okRead(orc) ? "ok" : "error", leads: okRead(ld) ? "ok" : "error" }));
    } catch (err) {
      console.error("[BeautyOS] loadHistory threw:", err);
      try { Sentry.captureException(err); } catch {}
      setDeferred(prev => ({ ...prev, history: "error", leads: "error" }));
    }
  };

  // The network half of "is she really signed in", moved off the boot's
  // critical path (see authP in loadAll). Same rule as before: a definite
  // "no user" sends her to /login; "could not reach the auth server" (offline,
  // timeout) is NOT logged out and changes nothing - the data on screen
  // already loaded under her session.
  const verifySession = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user) return;
      if (isAuthTransportFailure(error)) return;
      router.replace(loginPathForScreen(window.location.pathname, window.location.search) || "/login");
    } catch { /* unverifiable is not logged out */ }
  };

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
      //
      // Everything below that does not depend on the ANSWER to "who is she" is
      // started right here, before the first await: the auth check, the tenant
      // lookup and the ten core reads all leave together. They used to run as
      // three dependent stages (auth, then rpc, then reads), each a full round
      // trip plus a CORS preflight - ~1.85s of a throttled-mobile cold load.
      // The reads carry no tenant filter of their own (RLS scopes them), so
      // they never needed the tenant id; only the tenants read does, and that
      // one still waits for it below.
      //
      // Starting a read early does not make its result trustworthy early: not
      // one of them is looked at until the same checks as before have passed -
      // transport failure, logged out, rpc error, failed core read, in that
      // order (test-load-chain.ts pins it). For a logged-out visitor the
      // reads come back empty under RLS and are thrown away by the redirect.
      // supabase-js query builders are lazy thenables - nothing is sent until
      // .then() - so each is wrapped in Promise.resolve to actually start it.
      // getSession(), not getUser(): getSession reads the session already in
      // the browser (and refreshes it only if it has expired), no round trip.
      // getUser() is a network call that HOLDS supabase-js's auth lock for its
      // whole duration, and every REST read waits on that lock for its token -
      // so awaiting it first put a full round trip (+ preflight) in front of
      // every read, measured on production. The server already ran getUser for
      // this very navigation (app/dashboard/layout.tsx redirects to /login
      // without a valid user), so the network check is not repeated on the
      // critical path; verifySession() below does it right after the core
      // load, with the same offline-is-not-logged-out rule.
      const bootCut = historyCutoffRef.current = historyCutoff();
      const authP = Promise.resolve(supabase.auth.getSession());
      const rpcP = Promise.resolve(supabase.rpc("get_user_tenant_id"));
      const EARLY_READS = [
        // Only the recent window here (lib/historyWindow.js): the rest of the history and the leads arrive in the background (loadHistory).
        ["appointments",   readAllRows(supabase, "appointments", { filter: (q) => q.gte("date", bootCut.date) })],
        ["clients",        readAllRows(supabase, "clients")],
        ["settings",       supabase.from("settings").select("*")],
        ["receipts",       readAllRows(supabase, "receipts", { filter: (q) => q.gte("created_at", bootCut.iso) })],
        // Not core: the table arrives with add_till_and_calendar_small_things.sql,
        // applied by hand, and a missing table must not stop the boot. Until it
        // exists no receipt can be voided, which the void button says.
        ["receipt_voids",  readAllRows(supabase, "receipt_voids")],
        ["packages",       readAllRows(supabase, "packages")],
        // Manual WhatsApp queue: not core, same reasoning as receipt_voids -
        // whatsapp-manual-mode.sql is handed over by hand. Capped at 100 and
        // newest-first: a queue is something she works through, not an
        // archive, and this card groups/caps display further on its own.
        // Through /api/messages, not a browser read: the table has no SELECT
        // policy for her, so a direct read came back empty and the queue never showed.
        ["whatsapp_pending", fetch("/api/messages?status=pending_manual", { cache: "no-store" })
          .then(async (r) => { const j = await r.json().catch(() => ({})); return r.ok && j.success ? { data: j.messages || [], count: j.count ?? null, error: null } : { data: null, count: null, error: { code: String(r.status), message: j.error || "messages read failed" } }; })
          .catch((e) => ({ data: null, count: null, error: { code: "network", message: String(e?.message || e) } }))],
        ["owner_notifs",     supabase.from("owner_notifications").select("*", { count: "exact" }).is("read_at", null).order("created_at", { ascending: false }).limit(50)],
      ].map(([name, q]) => [name, Promise.resolve(q)]);

      const { data: authData, error: authErr } = await authP;
      const user = authData?.session?.user || null;
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const authTransportFailure = isAuthTransportFailure(authErr);
      if (authTransportFailure) {
        console.error("[BeautyOS] loadAll: could not verify session", authErr);
        setLoadError({ tables: [], message: authErr?.message || "", code: isOffline ? "offline" : "auth", offline: true });
        return; // the `finally` still clears `loading`
      }
      if (!user) { router.replace(loginPathForScreen(window.location.pathname, window.location.search) || "/login"); return; }
      setAuthEmail(user.email || "");
      // Resolve the tenant with the SAME function the RLS policies use.
      // Reading tenant_members directly from the client is itself gated by
      // RLS and often returns null, which then mis-selects the settings row.
      //
      // An ERROR here is fatal, unlike a null RESULT. A null result is a real
      // answer ("this user belongs to no tenant"); an error means we do not
      // know, and carrying on would pick a settings row by fallback and show
      // her a dashboard assembled from a guess.
      const { data: rpcTenant, error: rpcErr } = await rpcP;
      if (rpcErr) {
        console.error("[BeautyOS] loadAll: get_user_tenant_id failed", rpcErr);
        try { Sentry.captureException(new Error(`loadAll: get_user_tenant_id — ${rpcErr.message}`)); } catch {}
        setLoadError({ tables: ["get_user_tenant_id"], message: rpcErr.message || "", code: rpcErr.code || "" });
        return;
      }
      const myTenantId = rpcTenant || null;
      // Every read is NAMED, so a failure can say which one failed instead of
      // vanishing. See the CORE_READS check below for why that matters.
      //
      // The tenants read is the one that needs myTenantId, so it is the one
      // that goes second - one short stage, not three.
      // Selects the whole row deliberately: the plan-state columns are added
      // by trial-state.sql, which is run by hand against Supabase, so naming
      // them explicitly would make this query fail outright on any
      // environment where that migration has not been run yet. The row is one
      // row on a tiny table, and RLS already scopes it to her own tenant.
      const READS = [
        ...EARLY_READS,
        // Feature tier + trial/subscription state for this tenant.
        ["tenants", Promise.resolve(supabase.from("tenants").select("*").eq("id", myTenantId).maybeSingle())],
        // Only her own rows, and paged: the table is readable across businesses, so an unfiltered read hit the 1,000-row cap once the platform had
        // that many services and could return a list without hers (ownServices below still filters, as a second line).
        ["service_prices", readAllRows(supabase, "service_prices", { filter: (q) => q.eq("tenant_id", myTenantId) })],
      ];
      const settled = await Promise.all(READS.map(([, q]) => q));
      const res = {};
      READS.forEach(([name], i) => { res[name] = settled[i] || {}; });
      const { appointments: a, clients: c, service_prices: sv, settings: st, receipts: r, receipt_voids: rv, packages: pk, tenants: tn, whatsapp_pending: wap, owner_notifs: onf } = res;

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
      // Every one of those whole-table reads goes through readAllRows: the API
      // hands back at most max_rows (1,000 by default) per request and says
      // nothing when it stops, so a plain select("*") quietly showed a busy
      // business a calendar missing its newest appointments. Past a very large
      // ceiling a read stops on purpose and reports complete:false - and then she
      // is told, below, instead of being shown a fragment as if it were all.
      const CORE_READS = READS.map(([name]) => name).filter((n) => n !== "tenants" && n !== "receipt_voids" && n !== "whatsapp_pending" && n !== "owner_notifs");
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

      const PARTIAL_HE = { appointments: "התורים", clients: "הלקוחות", receipts: "אישורי התשלום", receipt_voids: "ביטולי אישורי התשלום", packages: "החבילות" };
      const partialReads = Object.keys(PARTIAL_HE).filter((n) => res[n] && res[n].data && res[n].complete === false);
      if (partialReads.length > 0) {
        console.error("[BeautyOS] loadAll: incomplete read", partialReads.map((n) => `${n} ${res[n].fetched}/${res[n].total}`).join(", "));
        try { Sentry.captureException(new Error(`loadAll incomplete: ${partialReads.map((n) => `${n} ${res[n].fetched}/${res[n].total}`).join(", ")}`)); } catch {}
        toast(tr("לא נטענה כל ההיסטוריה של {0} - מה שמוצג חלקי. כתבי לנו ונטפל בזה.", [partialReads.map((n) => PARTIAL_HE[n]).join(" ו")]), "error");
      }

      // The two capped reads are capped ON PURPOSE (a queue she works through, the
      // newest notifications) - and the exact count comes back with them, so when
      // the cap hides some, the code knows and says so instead of the oldest
      // waiting messages simply not being there.
      const hidden = (r) => (r && typeof r.count === "number" && r.data ? Math.max(0, r.count - r.data.length) : 0);
      if (hidden(wap) > 0) toast(tr("יש {0} הודעות שממתינות לשליחה ידנית - מוצגות {1} האחרונות. אחרי ששלחת אותן יופיעו הישנות יותר.", [wap.count, wap.data.length]), "error");
      if (hidden(onf) > 0) console.warn(`[BeautyOS] ${hidden(onf)} older unread notifications not shown (cap ${onf.data.length})`);

      // Safe default 'none' if the row/column is missing for any reason.
      const plan = tn?.data?.plan || "none";
      setCurrentPlan(plan);
      // Trial/subscription state. A failed read leaves this null on purpose:
      // planState() then reports an unblocked tenant, so a transient error can
      // never lock her out of her own data.
      setPlanRow(tn?.data || null);
      console.log("[BeautyOS] current plan:", plan, "| plan_status:", tn?.data?.plan_status || "(not migrated)");
      // A CLOSED SYSTEM (owner decision 2026-10-21): an expired or paused business
      // sees only the renewal screen (app/PlanBlockedScreen.jsx, rendered below in
      // place of the shell). Stop here, before any calendar, client or receipt row
      // is put into state, so there is nothing behind that screen to reveal.
      // Nothing is deleted: once the plan is active the next load is the full app.
      // Same rule as planInfo (planState fails OPEN on a missing or unreadable row).
      if (planState(tn?.data || null).isBlocked && !isDemoTenantId(myTenantId)) {
        setLoadError(null);
        return; // the `finally` still clears `loading`
      }
      // Past the guard above, every one of these succeeded, so an empty array
      // is a real answer and can be trusted.
      setAppointments(a.data || []);
      setClients(c.data || []);
      // service_prices is the one table that is readable across tenants (the public booking page needs an
      // anonymous read), so unlike the others it is NOT scoped by RLS for her: keep only the rows that are hers.
      // A new tenant used to see 21 services from three other businesses here, and a checklist that called
      // the menu done. See lib/serviceScope.js.
      setServices(ownServices(sv.data, myTenantId));
      // Zero settings rows now means SHE IS GENUINELY NEW, not "the settings
      // read failed" - that case returned above. Before this change the two
      // were the same branch, so a failed read could bounce an established user
      // into onboarding, and finishing it inserts a SECOND settings row.
      if(st.data && st.data.length === 0) { leavingForOnboardingRef.current = true; router.replace("/onboarding"); return; }
      if(st.data && st.data.length > 0) {
        // The settings row for THIS user's tenant, or nothing.
        //
        // There used to be a fallback here: no match, take the most recently
        // created row. It was defended as being "stable across refreshes", and
        // it is - stability was never the problem. The row it falls back to is
        // not checked against myTenantId at all, so the one case it exists to
        // handle is precisely the case where it displays another business's
        // name, hours, address and branding as hers, with no error anywhere.
        //
        // Nothing legitimate reaches it. The read above carries no tenant
        // filter of its own and is scoped entirely by RLS, which scopes by
        // get_user_tenant_id() - the same function myTenantId came from. Rows
        // present but none matching therefore means the two disagreed, and a
        // disagreement about which business this is cannot be resolved by
        // picking one. Her own tenant having no settings row at all is a
        // different case and lands in the length === 0 branch above, which
        // sends her to onboarding.
        const myRow = st.data.find(s => s.tenant_id === myTenantId);
        if (!myRow) {
          console.error("[BeautyOS] loadAll: no settings row for tenant", myTenantId,
            "| rows visible:", st.data.length, "| tenants:", st.data.map(r => r.tenant_id));
          try { Sentry.captureException(new Error("loadAll: settings/tenant mismatch")); } catch {}
          setLoadError({ tables: ["settings"], message: tr("הגדרות העסק לא נטענו"), code: "tenant-mismatch" });
          return;
        }
        setSettings(myRow);
        // Tag every later error report with the business it happened in. This
        // is what turns the six-character code a beta user reads out into
        // "which salon, on which data" without having to ask her. The tenant
        // UUID only - never her name, phone or email; see lib/sentryScrub for
        // the rule this follows.
        try { Sentry.setTag("tenant_id", myRow?.tenant_id || myTenantId || "unknown"); } catch {}
      }
      setReceipts(r.data || []);
      // A failed voids read (table not migrated yet) is an empty set, logged.
      if (rv?.error) console.warn("[BeautyOS] receipt_voids not readable yet:", rv.error.code || "", rv.error.message || "");
      setReceiptVoids(rv?.error ? [] : (rv?.data || []));
      // Same "missing table is an empty queue, not an error" rule, for the
      // two whatsapp-manual-mode.sql tables.
      if (wap?.error) console.warn("[BeautyOS] whatsapp_messages (pending_manual) not readable yet:", wap.error.code || "", wap.error.message || "");
      setWhatsappPending(wap?.error ? [] : (wap?.data || []));
      if (onf?.error) console.warn("[BeautyOS] owner_notifications not readable yet:", onf.error.code || "", onf.error.message || "");
      setOwnerNotifs(onf?.error ? [] : (onf?.data || []));
      setPackages(pk.data || []);
      setLoadError(null);
      // Core load succeeded and is on screen's way; fetch the three lists no
      // first screen needs. Not awaited: nothing waits on them.
      loadDeferred();
      loadHistory();
      verifySession();
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
      if (!leavingForOnboardingRef.current) setLoading(false);
    }
  };

  // === CALCULATIONS ===
  // The calendar holds two kinds of row now, and almost every number on the
  // dashboard is about the first kind only. "3 תורים" has to mean three
  // clients, not two clients and a dentist.
  //
  // `appointments` deliberately stays the WHOLE calendar: every busy test,
  // clash check and free-slot list reads it, and a personal event that those
  // could not see would block nothing, which is the entire point of the
  // feature. `clientAppts` is the one to count, remind, confirm and bill
  // against; the entries lists below are what she LOOKS at.
  const clientAppts = useMemo(() => appointments.filter(isClientAppointment), [appointments]);
  // Every revenue figure reads liveRcpts - receipts minus voids. `receipts`
  // itself is for lists and history, where a voided receipt must still show.
  // ONE computation for the month: the headline is `monthTotals.total` and the
  // per-method cards are `monthTotals.byMethod`, so they add up by
  // construction. They used to be two: the headline filtered to this month,
  // the breakdown ran over every receipt ever - and the cash card showed 2,700
  // under a 1,400 month. Same set, same window, same void rule, or nothing.
  const monthTotals = useMemo(() => monthSummary(liveRcpts, thisMonth, thisYear), [liveRcpts, thisMonth, thisYear]);
  const thisMonthRevenue = monthTotals.total;
  const lastMonthRevenue = useMemo(() => monthSummary(liveRcpts, lastMonth, lastMonthYear).total, [liveRcpts, lastMonth, lastMonthYear]);
  // Today, for the till: what she took, by method, with tips beside it.
  const todayTotals = useMemo(() => totalsOf(receiptsOnDay(liveRcpts, today)), [liveRcpts, today]);
  // The till opens on the method she uses most (UX pass 2026-11-08), counted from her own receipts. None yet: מזומן.
  const favoritePaymentMethod = useMemo(() => mostUsedMethod(liveRcpts, SELECTABLE_PAYMENT_METHODS.map(m=>m.key), "מזומן"), [liveRcpts]);
  // Two lists per day, on purpose. *Entries are what she sees - her whole day,
  // her own commitments included. *Appts are what gets counted, because a count
  // labelled תורים that includes her accountant is a lie about her workload.
  const todayEntries    = useMemo(() => appointments.filter(a=>a.date===today), [appointments, today]);
  const tomorrowEntries = useMemo(() => appointments.filter(a=>a.date===tomorrow), [appointments, tomorrow]);
  const todayAppts    = useMemo(() => todayEntries.filter(isClientAppointment), [todayEntries]);
  const tomorrowAppts = useMemo(() => tomorrowEntries.filter(isClientAppointment), [tomorrowEntries]);
  // Compare on local YYYY-MM-DD strings (via formatDate), not Date objects:
  // weekStart carries a time-of-day while new Date("YYYY-MM-DD") is UTC midnight,
  // which previously dropped today's appointments from the weekly count.
  // Spans the SAME seven days the grid draws. It used to run from weekStart
  // itself, so with an arbitrary weekStart the count covered Wednesday to
  // Tuesday while the columns showed Sunday to Saturday - two different weeks,
  // one screen. Deriving both from getWeekDates removes the possibility.
  const weekAppts     = useMemo(() => { const ws=formatDate(weekSundayOf(weekStart)); const weEnd=new Date(weekSundayOf(weekStart)); weEnd.setDate(weEnd.getDate()+6); const we=formatDate(weEnd); return clientAppts.filter(a=>a.date&&a.date>=ws&&a.date<=we); }, [clientAppts, weekStart]);
  const thisMonthAppts = useMemo(() => clientAppts.filter(a=>{if(!a.date)return false;const d=new Date(a.date);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;}), [clientAppts, thisMonth, thisYear]);

  // ── Last-visit index ──────────────────────────────────────────────────────
  // getDaysSince used to call getLastAppt, which filtered AND sorted the whole
  // appointments array for one client. filteredClients calls it per client on
  // every keystroke, so at 200 clients and 300 appointments that was ~60,000
  // filter operations plus 200 sorts per character typed - and activeClients
  // and coldClients each did the same again.
  //
  // One pass over appointments, then O(1) lookups. Built with useMemo keyed on
  // appointments alone: `now` is not a dependency because the index stores the
  // DATE, and the day arithmetic still happens per call.
  //
  // Deliberately identical to the old behaviour, including the parts that look
  // like bugs: cancelled appointments still count as visits here. The reminder
  // engine's computeLastVisits excludes them, and swapping that in would make
  // clients look more lapsed than they do today - a real change to who appears
  // in "cold", dressed up as a refactor. If cancelled visits should not count,
  // that is a product decision and its own change.
  const lastApptDateByClient = useMemo(() => {
    const m = new Map();
    for (const a of appointments) {
      if (!a.client_id || !a.date) continue;   // matches the old `!l?.date` -> 999
      const k = String(a.client_id);
      const prev = m.get(k);
      // Lexicographic max over YYYY-MM-DD is chronological max, which is what
      // the old descending localeCompare sort selected.
      if (!prev || a.date > prev) m.set(k, a.date);
    }
    return m;
  }, [appointments]);

  const getLastApptDate = (cid) => lastApptDateByClient.get(String(cid));
  // lib/clientActivity.ts owns the null-vs-sentinel rule and is unit-tested
  // directly - see that file's own comment for why a client with no
  // appointment yet must read as null, never as a huge day-count.
  const getDaysSince   = (cid) => daysSinceLastVisit(getLastApptDate(cid), now);
  // Same shape as the last-visit index above. topClients sorts every client
  // with a comparator that called this, and a comparator runs O(n log n) times
  // - so a full scan of receipts per comparison, then again in the filter.
  const clientTotalById = useMemo(() => {
    const m = new Map();
    for (const r of liveRcpts) {
      if (!r.client_id) continue;
      const k = String(r.client_id);
      m.set(k, (m.get(k) || 0) + (Number(r.amount) || 0));
    }
    return m;
  }, [liveRcpts]);
  const getClientTotal = (cid) => clientTotalById.get(String(cid)) || 0;
  const getClientAppts = (cid) => appointments.filter(a=>String(a.client_id)===String(cid));
  const getClientForms = (cid) => forms.filter(f=>String(f.client_id)===String(cid));
  const getClientReceipts = (cid) => receipts.filter(r=>String(r.client_id)===String(cid));
  const getClientPackages = (cid) => packages.filter(p=>String(p.client_id)===String(cid)&&p.active);

  // "New" (no appointment yet) is its own state - never active (she hasn't
  // actually been seen), never cold (she isn't overdue for anything; there
  // was never a first visit to lapse from). This is what keeps her out of
  // the needs-attention queue's win-back nudges. See lib/clientActivity.ts.
  const activeClients = useMemo(() => historyReady ? clients.filter(c=>isActiveClient(getLastApptDate(c.id), now)) : [], [clients, appointments, today, historyReady]);
  // A client last seen before the recent window has NO last visit until the history is in, which would read as "new" instead of "lapsed":
  // so these two lists stay empty until it is (they are nudges, and arrive a moment later).
  const winbackDays   = winbackDaysOf(settings?.automations);
  // The simple monthly report (lib/monthlyReport.ts): the same live receipts and the same incomeTotals as the income screen.
  // An unchosen registration is read as "what she took" (the exempt rule: no VAT carved out), never as a guess at VAT.
  // "לפי מטפלת" under the monthly report: the same VAT treatment as the report itself.
  const teamNet = useCallback((gross) => incomeTotals([gross], settings?.business_tax_status || "exempt", vatRateForYear(new Date().getFullYear())).net, [settings?.business_tax_status]);
  const monthlyReportData = useMemo(() => historyReady ? monthlyReport({ receipts: liveRcpts, appointments, status: settings?.business_tax_status || "exempt", vatRate: vatRateForYear(new Date().getFullYear()), now: new Date() }) : null, [liveRcpts, appointments, settings?.business_tax_status, today, historyReady]);
  const coldClients   = useMemo(() => historyReady ? clients.filter(c=>isColdClient(getLastApptDate(c.id), now, winbackDays)) : [], [clients, appointments, today, historyReady, winbackDays]);
  const topClients    = useMemo(() => [...clients].sort((a,b)=>getClientTotal(b.id)-getClientTotal(a.id)).filter(c=>getClientTotal(c.id)>0).slice(0,5), [clients, liveRcpts]);

  // Per-service breakdown.
  //
  // Built from the union of the CURRENT menu and every service name that
  // actually appears in history — not from activeServices alone. Iterating the
  // live menu meant archiving a treatment silently deleted its past revenue
  // from this report while the receipts sat untouched in the database, and it
  // also hid income she had genuinely earned under names that were never on
  // the menu (this tenant has receipts for "ניקוי עור עמוק" and "תשלום").
  // Totals elsewhere are summed straight off receipts, so they were always
  // right — it was only this breakdown that disagreed with them.
  const serviceStats = useMemo(() => {
    const byName = new Map();
    for (const s of activeServices) {
      byName.set(s.name, { name: s.name, color: s.color, archived: false });
    }
    for (const row of [...appointments, ...receipts]) {
      const n = row.service;
      if (!n || byName.has(n)) continue;
      // Present in history but not on the live menu: archived, renamed, or
      // typed by hand at the till. Carry its colour over when we still have it.
      const known = services.find(s => s.name === n);
      byName.set(n, { name: n, color: known?.color || DEFAULT_SERVICE_COLOR, archived: true });
    }
    return [...byName.values()]
      .map(s => ({
        ...s,
        count: appointments.filter(a => a.service === s.name).length,
        revenue: liveRcpts.filter(r => r.service === s.name).reduce((sum,r)=>sum+(Number(r.amount)||0),0),
      }))
      .sort((a,b)=>b.count-a.count);
  }, [activeServices, services, appointments, receipts, liveRcpts]);
  const avgTransaction = useMemo(() => liveRcpts.length>0?Math.round(liveRcpts.reduce((s,r)=>s+(Number(r.amount)||0),0)/liveRcpts.length):0, [liveRcpts]);

  const monthlyData = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);   // day 1: setMonth on the 29th to 31st rolled into the next month and doubled one month in the chart
    const m=d.getMonth(),y=d.getFullYear();
    const appts=appointments.filter(a=>{if(!a.date)return false;const ad=new Date(a.date);return ad.getMonth()===m&&ad.getFullYear()===y;});
    const rev=liveRcpts.filter(r=>{if(!r.created_at)return false;const rd=parseDb(r.created_at);return rd.getMonth()===m&&rd.getFullYear()===y;}).reduce((s,r)=>s+(Number(r.amount)||0),0);
    return {month:MONTHS_HE[m].slice(0,3),count:appts.length,revenue:rev};
  /* now is derived from thisMonth/thisYear, which gate this memo */ }), [appointments, liveRcpts, thisMonth, thisYear]);

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
  const thisMonthLeads     = leads.filter(l=>{if(!l.created_at)return false;const d=parseDb(l.created_at);return d.getMonth()===thisMonth&&d.getFullYear()===thisYear;});
  const convertedLeads     = leads.filter(l=>l.status==="closed");
  const conversionRate     = leads.length>0?Math.round((convertedLeads.length/leads.length)*100):0;
  const leadsWithReminders = leads.filter(l=>l.reminder_date&&l.reminder_date<=tomorrow&&l.status!=="closed"&&l.status!=="lost"&&l.status!=="irrelevant");

  // "היום שלי" (app/MyDayCard.jsx, lib/myDay.js): the morning card. Computed once per change of data or per minute, never per keystroke
  // elsewhere on the screen. Off for a tenant with automations.feature_flags.my_day === false (the old today list then shows instead).
  const myDayOn = myDayEnabled(settings);
  const myDayMinute = now.getHours()*60+now.getMinutes();
  const myDayModel = useMemo(() => {
    if (!myDayOn) return null;
    const byId = new Map(clients.map(c => [String(c.id), c]));
    return buildMyDay({
      entries: todayEntries, clientAppts, tomorrowAppts, receipts: liveRcpts, leads, leadsReady: deferred.leads === "ok", paymentsReady: historyReady,
      now: new Date(), startMinute, endMinute, isPersonal,
      hasPhone: (a) => !!((byId.get(String(a.client_id))?.phone || "").trim()),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDayOn, todayEntries, clientAppts, tomorrowAppts, liveRcpts, leads, clients, deferred.leads, historyReady, myDayMinute]);

  // ── Attribution ───────────────────────────────────────────────────────────
  // Where a client came from is DERIVED, not copied. handleConvertLead already
  // writes leads.client_id, so the lead is the single source of truth for
  // source and campaign, and looking it up costs nothing extra - the leads are
  // already in memory. Copying source onto clients would have meant a new
  // column, a migration, a backfill, and two places to disagree.
  //
  // It also works retroactively: any conversion that set client_id is
  // attributable today, with no data change.
  const leadByClientId = useMemo(() => {
    const m = new Map();
    for (const l of leads) {
      if (!l.client_id) continue;
      const k = String(l.client_id);
      // If two leads somehow point at one client, keep the EARLIEST - that is
      // the one that actually brought her in.
      const prev = m.get(k);
      if (!prev || String(l.created_at||"") < String(prev.created_at||"")) m.set(k, l);
    }
    return m;
  }, [leads]);

  /** The lead a client came from, or null when nothing points at her. */
  const getClientLead = (cid) => leadByClientId.get(String(cid)) || null;

  /**
   * Clients grouped by where they came from, with what they have spent.
   *
   * Client-centric on purpose: she asked how many CLIENTS each source produced,
   * which is not the same as how many leads converted. A client with no lead
   * pointing at her - imported directly, added by hand, or converted before
   * client_id was written - lands in "לא ידוע" rather than being guessed into a
   * source or silently dropped.
   *
   * Spend comes from receipts via the clientTotalById index, never from
   * clients.total_spent, which is a column nothing in this app has ever
   * written.
   */
  const clientSourceStats = useMemo(() => {
    const rows = new Map();
    const bump = (key) => {
      if (!rows.has(key)) rows.set(key, { key, label: sourceLabelHe(key), clients: 0, revenue: 0 });
      return rows.get(key);
    };
    for (const c of clients) {
      const lead = leadByClientId.get(String(c.id));
      const r = bump(lead && lead.source ? lead.source : "__unknown__");
      r.clients += 1;
      r.revenue += clientTotalById.get(String(c.id)) || 0;
    }
    const unknown = rows.get("__unknown__");
    if (unknown) unknown.label = "לא ידוע";
    return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.clients - a.clients);
  }, [clients, leadByClientId, clientTotalById]);

  // Her editable list of sources (Settings > Clients and leads); what the new-lead form offers.
  const leadSourceList = useMemo(() => resolveLeadSources(settings?.automations), [settings?.automations]);
  // Every lead, every source as stored (csv_import, facebook_lead_ad ... included): the header number.
  const allSourcesReport = useMemo(() => buildSourceReport(leads, liveRcpts), [leads, liveRcpts]);

  const campaignStats = useMemo(() => LEAD_SOURCES.map(source=>{
    const sourceLeads=leads.filter(l=>l.source===source);
    const converted=sourceLeads.filter(l=>l.status==="closed");
    const revenue=converted.reduce((sum,l)=>{if(!l.client_id)return sum;return sum+liveRcpts.filter(r=>String(r.client_id)===String(l.client_id)).reduce((s,r)=>s+(Number(r.amount)||0),0);},0);
    return {source,icon:SOURCE_ICONS[source],total:sourceLeads.length,converted:converted.length,revenue,rate:sourceLeads.length>0?Math.round((converted.length/sourceLeads.length)*100):0};
  }).filter(s=>s.total>0).sort((a,b)=>b.revenue-a.revenue), [leads, liveRcpts]);

  // The per-method rows are rendered straight from monthTotals/todayTotals
  // through lib/till bucketByMethod - there is deliberately no separate
  // breakdown memo, because a second computation is how the cards stopped
  // agreeing with the headline. The list below keeps voided receipts (badged)
  // and matches a split receipt under each of its methods.
  const filteredReceipts = receiptFilter==="all"?receipts:receipts.filter(r=>paidWith(r,receiptFilter));

  // Search on both screens goes through lib/search/matchQuery. The old
  // `phone?.includes(q)` could not find an imported lead at all: the importer
  // stores E.164 (972527778899) and the app stores what she typed
  // (0542845655), so typing the number off her own phone matched nothing. It
  // was also case-sensitive, which broke every Latin name in her import.
  const filteredLeads = useMemo(() => leads.filter(l=>{
    const matchSearch=matchesQuery(leadSearch,{text:[l.name,l.service_interest,l.source],phones:[l.phone]});
    const matchFilter=leadFilter==="all"||l.status===leadFilter;
    return matchSearch&&matchFilter;
  }).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||"")), [leads, leadSearch, leadFilter]);

  const filteredClients = useMemo(() => clients.filter(c=>{
    const matchSearch=matchesQuery(searchQuery,{text:[c.name],phones:[c.phone]});
    const matchStatus=filterStatus==="all"||c.status===filterStatus||(filterStatus==="cold"&&isColdClient(getLastApptDate(c.id),now,winbackDays))||(filterStatus==="active"&&isActiveClient(getLastApptDate(c.id),now));
    const matchSkin=filterSkin==="all"||c.skinType===filterSkin;
    return matchSearch&&matchStatus&&matchSkin;
  }), [clients, appointments, searchQuery, filterStatus, filterSkin, today]);

  // How many rows each list is currently drawing. Derived, not stored: when the
  // filter signature changes the previous window is simply not hers any more
  // and the count falls back to the first page, without a state write.
  const leadFilterSig   = `${leadSearch}|${leadFilter}`;
  const clientFilterSig = `${searchQuery}|${filterStatus}|${filterSkin}`;
  const leadsShown   = leadWindow.sig   === leadFilterSig   ? leadWindow.n   : LIST_PAGE;
  const clientsShown = clientWindow.sig === clientFilterSig ? clientWindow.n : LIST_PAGE;
  const showMoreLeads   = () => setLeadWindow({ sig: leadFilterSig, n: leadsShown + LIST_PAGE });
  const showMoreClients = () => setClientWindow({ sig: clientFilterSig, n: clientsShown + LIST_PAGE });

  // The group the leads screen is currently looking at, and therefore the group
  // it can message. Null while the filter is "הכל": the send API is scoped to a
  // single status, so with no status there is no group - and no action bar.
  //
  // Every number the action bar shows comes from HERE, and the same array is
  // what gets handed to openBulk. One derivation, so the count on the button
  // and the set that receives the message cannot drift apart. `narrowed` is the
  // gap between "leads in this status" and "leads matching the search too" -
  // the number that has to shout when 47 becomes 1.
  const leadGroup = useMemo(() => {
    if (leadFilter === "all") return null;
    const statusTotal = leads.filter(l => l.status === leadFilter).length;
    const withPhone = filteredLeads.filter(l => l.phone);
    return {
      status: leadFilter,
      label: (LEAD_STATUSES[leadFilter] || {}).label || leadFilter,
      matched: filteredLeads,
      withPhone,
      statusTotal,
      narrowed: filteredLeads.length < statusTotal,
      // The list draws a page at a time. The send does not: it goes to every
      // lead matching the filter, including the ones below the fold that
      // "הצג עוד" has not drawn yet. Stated outright in the bar rather than
      // left for her to work out from two numbers on different rows.
      windowed: leadsShown < filteredLeads.length,
    };
  }, [leadFilter, leads, filteredLeads, leadsShown]);

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
      appointments.filter(a=>has(a.name)||has(a.service)||has(a.client_phone)||(isPersonal(a)&&has(a.note)))
        .slice(0,5).map(a=>({type:"appt",label:(isPersonal(a)?"🔒 ":"")+a.name,sub:(entrySubtitle(a)||"")+" · "+a.date,obj:a})),
      leads.filter(l=>has(l.name)||has(l.phone)||has(l.service_interest))
        .slice(0,5).map(l=>({type:"lead",label:l.name,sub:l.source||"",obj:l})),
      activeServices.filter(s=>has(s.name))
        .slice(0,5).map(s=>({type:"service",label:s.name,sub:`₪${s.price}`+(s.duration?` · ${s.duration}′`:""),obj:s})),
      receipts.filter(r=>has(r.client_name)||has(r.service)||has(r.amount))
        .slice(0,5).map(r=>({type:"receipt",label:r.client_name||tr("תשלום"),sub:`₪${r.amount} · ${fmtDateHe(localDayKey(r.created_at))}`,obj:r})),
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
    else if (r.type === "service") { openSettings("services"); }
  };

  // ── Week view geometry ────────────────────────────────────────────────────
  //
  // The week grid is positioned blocks, not table cells: an appointment's TOP
  // is its start time and its HEIGHT is its duration. That is what makes
  // overlaps visible - two bookings at 10:00 and 10:30 simply sit at different
  // offsets - and it removes the one-appointment-per-hour-cell assumption that
  // was silently hiding the second of any pair.
  //
  // The axis is 30-minute rows over the working day, EXTENDED to cover any
  // appointment in the displayed week that falls outside those hours. Clamping
  // an out-of-hours appointment to the edge would hide it, which is the same
  // class of bug: if it exists, it has to be on screen.
  const weekAxis = useMemo(() => {
    let lo = (settings?.working_hours_start ?? 8) * 60;
    let hi = (settings?.working_hours_end ?? 19) * 60;
    const inWeek = new Set(weekDates.map(formatDate));
    for (const a of appointments) {
      if (!inWeek.has(a.date)) continue;
      const s = startMinute(a);
      if (s === null) continue;
      const e = endMinute(a) ?? s + 60;
      if (s < lo) lo = s;
      if (e > hi) hi = e;
    }
    lo = Math.floor(lo / 30) * 30;
    hi = Math.ceil(hi / 30) * 30;
    if (hi <= lo) hi = lo + 30;
    return { lo, hi, rows: (hi - lo) / 30 };
  }, [weekDates, appointments, settings]);

  /**
   * One day's appointments, each with a lane so overlaps sit side by side.
   *
   * Classic interval packing: an appointment takes the first lane whose
   * previous occupant has already ended. Non-overlapping appointments all reuse
   * lane 0 and get the full column; only genuine overlaps split it.
   */
  const dayLanes = (date) => {
    const ds = formatDate(date);
    // The team calendar's filter (staffShown): only that person's appointments. Without the team every appointment is shown.
    const list = appointments
      .filter(a => a.date === ds && startMinute(a) !== null && staffShown(a))
      .sort((a, b) => startMinute(a) - startMinute(b));
    const laid = [];
    for (const appt of list) {
      const s = startMinute(appt);
      const e = Math.max(endMinute(appt) ?? s + 30, s + 30); // never zero-height
      let lane = 0;
      while (laid.some(x => x.lane === lane && x.e > s)) lane += 1;
      laid.push({ appt, s, e, lane });
    }
    const lanes = laid.reduce((m, x) => Math.max(m, x.lane + 1), 1);
    // Tight-turnover warning: which of today's appointments start with less
    // than TIGHT_GAP_MINUTES after the previous real occupant ends. Cancelled
    // and no-show rows free their slot the same way the clash check does -
    // nothing to reset a station for. Computed here, once, so both calendars
    // (the week grid and the mobile agenda) read the same answer.
    const gapRows = (rows) => rows
      .filter(a => a.confirmation_status !== "cancelled" && a.confirmation_status !== NO_SHOW)
      .map(a => { const s = startMinute(a); return { id: a.id, start: s, end: Math.max(endMinute(a) ?? s + 30, s + 30), kind: a.kind }; });
    // In the team calendar a turnover is per person: one staff member's 10:00 right after another's 9:00 is not tight.
    let tightGapIds;
    if (teamCal) {
      tightGapIds = new Set();
      const groups = new Map();
      for (const a of list) { const k = staffOfAppt(a, team.staff)?.id || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
      for (const g of groups.values()) for (const id of tightGapAppointmentIds(gapRows(g))) tightGapIds.add(id);
    } else {
      tightGapIds = tightGapAppointmentIds(gapRows(list));
    }
    return { laid, lanes, tightGapIds };
  };

  // Booking from a click on empty space, to the nearest half hour. The old grid
  // could only book on the hour because its cells WERE hours; blocks give the
  // Y offset, so 10:30 is now reachable.
  const handleSlotAtMinute = (date, minutes) => {
    const svc = activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),...startFields(minutes),price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  // Open the week grid at the first appointment of that week, not at the top
  // of the axis. The axis now stretches to cover anything out of hours, so a
  // single 06:00 appointment would otherwise mean scrolling past two empty
  // hours every time she opens the week. Falls back to the top when the week
  // is empty. Sets a DOM property rather than state, which is what an effect
  // is for.
  useEffect(()=>{
    if(calView!=="week") return;
    const el=weekScrollRef.current;
    if(!el) return;
    const inWeek=new Set(weekDates.map(formatDate));
    let first=null;
    for(const a of appointments){
      if(!inWeek.has(a.date)) continue;
      const s=startMinute(a);
      if(s===null) continue;
      if(first===null||s<first) first=s;
    }
    el.scrollTop = first===null ? 0 : Math.max(0,((first-weekAxis.lo)/30)*WK_ROW_H - WK_ROW_H);
  },[calView,weekStart,weekDates,appointments,weekAxis.lo]);

  // getAppts (every appointment in an hour, for side-by-side rendering in a
  // cell) is gone with the hour-cell grid it existed for. Positioned blocks
  // make overlap a matter of geometry rather than something a cell has to
  // special-case, so dayLanes above replaces it outright.
  // getAppt (ONE appointment per hour, by .find) is gone with them. It outlived
  // its grid by one screen: the mobile agenda went on calling it, and went on
  // hiding the second appointment of every hour and everything booked outside
  // the legacy hour range. Both calendars read dayLanes now.

  const getApptColor = (appt) => {
    // Her own time is neutral, and never a client-status colour. A personal
    // event has no confirmation to be pending or confirmed about, so painting
    // it amber would put it in the queue's visual language and make a dentist
    // look like an unconfirmed client. One return covers both calendars: the
    // week grid and the mobile agenda fill their cards from here.
    if(isPersonal(appt)) return "var(--ink-2)";
    if(appt.confirmation_status==="confirmed") return "var(--success)";
    if(appt.confirmation_status==="cancelled") return "var(--danger)";
    return appt.color||"var(--warning)";
  };

  // How a calendar row reads, in the four places that draw one: the sidebar
  // list, the dashboard card, the week grid and the mobile agenda. Central so
  // they cannot drift apart on what her own time looks like - which is exactly
  // how the two calendars came to disagree about which appointments exist.
  //
  // An all-day event has no start time worth showing: 00:00 is arithmetic, not
  // information.
  const entryTime = (a) => isAllDay(a) ? "כל היום" : fmtApptTime(a);
  // The second line. An appointment says what treatment; a personal event has
  // no service, so it says whatever she wrote, or names itself.
  // "רשימת המתנה (N)" in the calendar (UX pass 2026-11-08): the list lives on the packages screen; when that screen is
  // switched off, the chip opens "add to the waitlist" instead, so it never leads nowhere.
  // Gated like every waitlist reader: no number until the list has loaded (a 0 would be a lie).
  const waitingCount = deferred.waitlist==="ok" ? waitlist.filter(w=>w.status==="waiting").length : null;
  const waitlistChipLabel = waitingCount===null ? "רשימת המתנה" : `רשימת המתנה (${waitingCount})`;
  const openWaitlist = () => {
    if (!isTabVisible(settings, "packages")) { setShowWaitlistModal(true); return; }
    setActiveTab("packages");
    setTimeout(() => { try { document.getElementById("waitlist-card")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* old browser: the screen still opened */ } }, 250);
  };
  const entrySubtitle = (a) => isPersonal(a) ? (String(a.note||"").trim() || "אירוע אישי") : a.service;

  // ============================================================
  // HANDLERS
  // ============================================================

  // The "+" on a mobile week day header: a fresh appointment on that DATE.
  //
  // Deliberately without any "is this slot already taken" guard: she picks the
  // time in the modal, which runs its own clash check before it saves.
  // Seeding it with the day's opening hour rather than a fixed 9:00 means a
  // clinic that opens at 10 does not get a booking an hour before it unlocks.
  const handleNewApptOnDate = (date) => {
    const dh = dayHoursFrom(settings, date.getDay());
    const hour = dh ? dh.open : (settings?.working_hours_start || 9);
    const svc = activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(date),hour,startMinute:Number(hour)*60,price:svc?.price||0});
    setApptNote("");setShowModal(true);
  };

  // Open the appointment modal in EDIT mode, pre-filled with an existing
  // appointment's values so its date/time/service/etc. can be rescheduled.
  // Reuses the exact same modal + per-day-hours + double-booking logic as create;
  // editingAppointmentId flips handleSave to UPDATE and excludes this row from
  // the conflict checks.
  const handleApptClick = (appt) => {
    if (isPersonal(appt)) { openPersonalEditor(appt); return; }
    setEditingAppointmentId(appt.id);
    editOrigRef.current={date:appt.date,duration:Number(appt.duration)||60,start:startMinute(appt)};
    setNewAppt({clientId:appt.client_id||"",name:appt.name||"",service:appt.service||"",duration:Number(appt.duration)||60,date:appt.date,hour:Number(appt.hour),startMinute:startMinute(appt),price:appt.price||0});
    setApptNote(appt.note||"");
    setShowModal(true);
  };

  // ── Personal events ───────────────────────────────────────────────────────
  //
  // Her own time, on the same calendar and in the same table, so that it blocks
  // a client booking through machinery that already exists rather than through
  // new code that has to remember to run.

  // A range longer than this is a mistake, not a holiday, and each day is a row.
  const PERSONAL_MAX_DAYS = 62;

  // series_id is a uuid column, so a fallback that is not uuid-shaped would be
  // rejected by the database rather than degrading.
  const newSeriesId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    const h = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 36; i++) {
      if (i===8||i===13||i===18||i===23) out += "-";
      else if (i===14) out += "4";
      else if (i===19) out += h[(Math.random()*4|0)+8];
      else out += h[Math.random()*16|0];
    }
    return out;
  };

  // Local dates, inclusive. Parsed with an explicit T00:00:00 so they are LOCAL
  // midnights: new Date("2026-09-02") is UTC and lands on the previous day for
  // anyone behind it, which would silently shift a whole holiday by a day.
  const datesInRange = (fromStr, toStr) => {
    const from = new Date(String(fromStr) + "T00:00:00");
    const to   = new Date(String(toStr || fromStr) + "T00:00:00");
    if (Number.isNaN(+from)) return [];
    if (Number.isNaN(+to) || to < from) return [formatDate(from)];
    const out = [];
    for (const d = new Date(from); d <= to && out.length < PERSONAL_MAX_DAYS; d.setDate(d.getDate()+1)) out.push(formatDate(d));
    return out;
  };

  // Would this event sit on top of something already in the calendar? Same rule
  // as everywhere else - cancelled rows free their slot - and it excludes the
  // series OWN rows, so editing an event cannot collide with itself.
  // Returns the first offending date, or undefined.
  const personalClashDate = (dates, startMin, dur, ownIds) => dates.find(dd =>
    appointments.some(a => {
      if (ownIds.has(String(a.id))) return false;
      if (a.date !== dd || a.confirmation_status === "cancelled") return false;
      const bs = startMinute(a), be = endMinute(a);
      if (bs === null || be === null) return false;
      return startMin < be && bs < startMin + dur;
    })
  );

  const closePersonalEditor = () => { setShowPersonalModal(false); setPersonalDraft(null); };

  // Editing loads the whole SERIES, not the row she tapped: a week of holiday
  // is seven rows in the table and one thing in her head.
  const openPersonalEditor = (appt, seedDate) => {
    if (appt) {
      const rows = appt.series_id
        ? appointments.filter(a => a.series_id && a.series_id === appt.series_id)
        : [appt];
      const dates = rows.map(a => a.date).sort();
      setPersonalDraft({
        title: appt.name || "",
        from: dates[0] || appt.date,
        to: dates[dates.length-1] || appt.date,
        allDay: isAllDay(appt),
        startMinute: startMinute(appt) ?? 9*60,
        duration: Number(appt.duration) || 60,
        note: appt.note || "",
        seriesId: appt.series_id || null,
        ids: rows.map(a => a.id),
      });
    } else {
      const d = seedDate || formatDate(calDay);
      const dh = dayHoursFrom(settings, new Date(d + "T00:00:00").getDay());
      setPersonalDraft({
        title: "", from: d, to: d, allDay: false,
        startMinute: (dh ? dh.open : (settings?.working_hours_start || 9)) * 60,
        duration: 60, note: "", seriesId: null, ids: [],
      });
    }
    setShowPersonalModal(true);
  };

  const handleSavePersonal = async () => {
    if (guardWrite()) return;
    const d = personalDraft;
    if (!d) return;
    if (!String(d.title||"").trim()) { toast(tr("איך נקרא האירוע? אפשר להוסיף כותרת"),"error"); return; }
    const dates = datesInRange(d.from, d.to);
    if (dates.length === 0) { toast(tr("חסר תאריך, אפשר לבחור אחד"),"error"); return; }
    // A range is always all-day. A two-day course is not 09:00-10:00 on each of
    // two days; it is two days. Offering a time range across days would invite
    // a shape the one-row-per-day model cannot represent.
    const allDay = !!d.allDay || dates.length > 1;
    const start  = allDay ? 0 : Number(d.startMinute) || 0;
    const dur    = allDay ? ALL_DAY_DURATION : Math.max(15, Number(d.duration) || 60);
    const ownIds = new Set((d.ids||[]).map(String));

    // Checked before anything is written, because the replace path below has to
    // delete the old rows before inserting the new ones - the constraint would
    // otherwise see the event overlapping itself - and a delete followed by a
    // rejected insert would lose the event outright.
    const clash = personalClashDate(dates, start, dur, ownIds);
    if (clash) { toast(clash + ": כבר יש משהו ביומן בשעה הזו", "error"); return; }

    if (isBusy("savePersonal")) return;
    setBusyKey("savePersonal", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};
      const seriesId = d.seriesId || (dates.length > 1 ? newSeriesId() : null);
      // No client, no service, no price and no colour: getApptColor paints a
      // personal event from its kind. confirmation_status keeps its default on
      // purpose - that is what puts the row INSIDE appointments_no_overlap,
      // which is what makes it block a booking at all.
      const row = (date) => ({
        date, ...startFields(start), duration: dur,
        name: String(d.title).trim(), service: "", price: 0, client_id: null,
        note: String(d.note||""), kind: PERSONAL, series_id: seriesId, ...tenantField,
        // A personal block keeps no buffer of its own (lib/serviceBuffer.ts); a booking's buffer still cannot run into it.
        ...apptBufferField(0),
      });

      const existing = (d.ids||[]).length ? appointments.filter(a => ownIds.has(String(a.id))) : [];
      const oldDates = existing.map(a => a.date).sort();
      const sameSpan = existing.length > 0
        && oldDates.length === dates.length
        && oldDates.every((x,i) => x === dates[i]);

      if (sameSpan) {
        // The common edit - a rename, a new time, a note - moves no dates, so it
        // updates in place and never deletes anything.
        const byDate = new Map(existing.map(a => [a.date, a]));
        for (const dd of dates) {
          const prevRow = byDate.get(dd);
          if (!prevRow) continue;
          const { data, error } = await writeWithApptBuffer(row(dd), (r) => supabase.from("appointments").update(r).eq("id", prevRow.id).select());
          if (error) { handleDbError(error, "update personal event"); return; }
          if (data && data[0]) setAppointments(prev => prev.map(a => a.id===prevRow.id ? data[0] : a));
        }
      } else {
        if (existing.length) {
          const { error: delErr } = await supabase.from("appointments").delete().in("id", existing.map(a=>a.id));
          if (delErr) { handleDbError(delErr, "replace personal event"); return; }
          setAppointments(prev => prev.filter(a => !ownIds.has(String(a.id))));
        }
        const { data, error } = await writeWithApptBuffer(dates.map(row), (r) => supabase.from("appointments").insert(r).select());
        if (error) {
          // The old rows are already gone: put them back, or the block disappears and the time opens on her booking page
          // (2026-10-20 audit: an insert refused by a booking made meanwhile left nothing blocked).
          if (existing.length) {
            const { data: back, error: backErr } = await supabase.from("appointments").insert(existing).select();
            if (!backErr && back) setAppointments(prev => [...prev, ...back]);
            else if (backErr) console.error("[personal event] restore failed:", backErr.message);
          }
          handleDbError(error, "create personal event"); return;
        }
        if (data) setAppointments(prev => [...prev, ...data]);
      }
      closePersonalEditor();
      toast(dates.length > 1 ? "האירוע נשמר (" + dates.length + " ימים)" : tr("האירוע נשמר"));
    } finally {
      setBusyKey("savePersonal", false);
    }
  };

  // Deleted outright, not soft-cancelled. "Cancelled" is a client-facing state
  // that exists so a receipt or a form pointing at the row stays valid, and so
  // undo can restore it. Nothing points at a personal event, and a cancelled one
  // would sit in the calendar meaning nothing.
  const handleDeletePersonal = (appt) => {
    if (guardWrite()) return;
    const rows = appt.series_id
      ? appointments.filter(a => a.series_id && a.series_id === appt.series_id)
      : [appt];
    const ids = rows.map(a => a.id);
    askConfirm({
      title: tr("מחיקת אירוע"),
      message: ids.length > 1
        ? 'למחוק את "' + appt.name + '"? האירוע נמשך ' + ids.length + ' ימים וכולם יימחקו.'
        : 'למחוק את "' + appt.name + '"?',
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("appointments").delete().in("id", ids);
        if (error) { handleDbError(error, "delete personal event"); return; }
        setAppointments(prev => prev.filter(a => !ids.includes(a.id)));
        closePersonalEditor();
        toast(tr("האירוע נמחק"));
      },
    });
  };

  // ── Her public URL ────────────────────────────────────────────────────────
  //
  // Claimed here and nowhere else: tenants.slug has existed all along, with an
  // index and an RPC to resolve it, and NOTHING has ever written one. Until
  // this, every cosmetician's page lived behind /book?t=<uuid>.
  const mySlug = planRow?.slug || "";

  const saveSlug = async () => {
    if (guardWrite()) return;
    const want = String(slugDraft || "").trim();
    const tid = settings?.tenant_id;
    if (!tid) { toast(STUCK_HE,"error"); return; }
    const bad = slugError(want);
    if (!want) { toast(tr("כתבי כאן את הכתובת שתרצי"),"error"); return; }
    if (bad) { setSlugNote(bad); return; }
    if (want === mySlug) { setSlugDraft(null); setSlugNote(""); return; }

    setSlugBusy(true);
    setSlugNote("");
    try {
      // Is it taken? Asked through the same SECURITY DEFINER function the public
      // page resolves with, because an authenticated user cannot read another
      // tenant's row directly - and should not be able to. It returns id and
      // name only, which is all "taken by someone else" needs.
      const { data: hit } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: want });
      const row = Array.isArray(hit) ? hit[0] : hit;
      if (row && String(row.id) !== String(tid)) { setSlugNote(tr("הכתובת הזו כבר תפוסה")); return; }

      // Through claim_tenant_slug (supabase/migrations/add_slug_claim_rpc.sql): the browser holds no UPDATE on
      // tenants.slug, so the direct update below was refused. While that function has not been run, fall back to
      // the direct write, which is what this did before.
      let { data, error } = await supabase.rpc("claim_tenant_slug", { p_slug: want });
      if (error && (error.code === "PGRST202" || error.code === "42883" || /claim_tenant_slug/.test(String(error.message||"")) && /find|exist|function/i.test(String(error.message||"")))) {
        ({ data, error } = await supabase.from("tenants").update({ slug: want }).eq("id", tid).select());
      }
      if (error) {
        // 23505: someone claimed it between the check above and this write.
        // 23514: the shape or reserved-word constraint refused it - the
        // database is the authority and lib/slug only fails fast.
        if (error.code === "23505") { setSlugNote(tr("מישהי הספיקה לתפוס את הכתובת הזו, אפשר לנסות אחרת.")); return; }
        if (error.code === "23514") { setSlugNote(tr("הכתובת הזו לא זמינה")); return; }
        handleDbError(error, "save slug"); return;
      }
      if (!data || !data[0]) { toast(tr("אין הרשאה לעדכן את כתובת העמוד"),"error"); return; }
      // the function returns { id, slug }; the direct update returned the whole row. Merge, never replace.
      setPlanRow(prev=>({...(prev||{}),...data[0]}));
      setSlugDraft(null);
      toast(tr("הכתובת נשמרה ✦"));
    } finally { setSlugBusy(false); }
  };

  const handleClientSelect = (clientId) => {
    const c=clients.find(c=>String(c.id)===String(clientId));
    setNewAppt(prev=>({...prev,clientId,name:c?c.name:""}));
  };

  const handleServiceSelect = (svcName) => {
    const svc=activeServices.find(s=>s.name===svcName);
    setNewAppt(prev=>({...prev,service:svcName,duration:svc?.duration||60,price:svc?.price||0}));
  };

  const closeApptModal = () => {
    setShowModal(false);
    setEditingAppointmentId(null);
    setApptClientQuery("");
    setApptMoreOpen(false);
    setApptAllServices(false);
    setApptRepeat({on:false, everyWeeks:3, count:6});
  };

  const handleSave = async () => {
    if (guardWrite()) return;
    if(!newAppt.name.trim()){toast(tr("איך קוראים ללקוחה? חסר שם"),"error");return;}
    // STAGE C: refuse to double-book. The new appointment occupies
    // [start, start+duration) minutes; reject if it overlaps any non-cancelled
    // appointment already on that date. (Runs before the busy flag is set.)
    {
      const newStart = apptEffectiveStart;
      // Buffers included (lib/serviceBuffer.ts): same test as slotIsTaken above.
      const newEnd = newStart + Number(newAppt.duration||0) + newApptBuffer;
      const clash = appointments.some(a=>{
        if(a.id===editingAppointmentId) return false; // don't clash with self when editing
        if(a.date!==newAppt.date || a.confirmation_status==="cancelled") return false;
        if(teamCal && !sameStaff(a, apptStaff, team.staff)) return false; // another person's client: not a clash
        const bs = startMinute(a), rawEnd = endMinute(a); if(bs===null||rawEnd===null) return false;
        const be = rawEnd + (apptBuffersApply ? apptBufferOf(a) : 0);
        return newStart < be && bs < newEnd;
      });
      if(clash){ toast(tr("השעה הזו כבר תפוסה"),"error"); return; }
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
        // EDIT/reschedule: update only the editable fields on the existing row. A NEW day or time is a time the client has not
        // agreed to: the "confirmed" mark and the sent reminder belong to the old one, so both are reset and the next reminder asks
        // again (2026-10-20 audit). A note, price or name change keeps them.
        const orig=editOrigRef.current;
        const moved=!!orig && (orig.date!==newAppt.date || orig.start!==apptEffectiveStart);
        // A move (date, time, length or service: apptBuffersApply) stores the buffer it was just checked with. An edit that
        // does not move it leaves buffer_minutes alone, so it is never refused over a buffer.
        const patch={...apptStaffWrite(),date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,...(moved?{confirmation_status:"pending",confirmation_sent:false}:{}),...(apptBuffersApply?apptBufferField(newApptBuffer):{})};
        const {data,error}=await writeWithApptBuffer(patch, (r) => supabase.from("appointments").update(r).eq("id",editingAppointmentId).select());
        if(error){handleDbError(error, "update appointment"); return;}
        // Zero rows back means nothing was saved (deleted on another device, or not hers): say so instead of "updated", and never put
        // an undefined row into the calendar.
        if(!data?.length){toast(tr("התור לא נמצא, אולי נמחק במכשיר אחר. כדאי לרענן את היומן."),"error");return;}
        setAppointments(prev=>prev.map(a=>a.id===editingAppointmentId?data[0]:a));
        setApptNote("");closeApptModal();
        toast(tr("התור עודכן בהצלחה"));
      } else if (apptRepeat.on && Number(apptRepeat.count) > 1) {
        // RECURRING. One row per date, inserted one at a time so each can be
        // judged on its own: a date that clashes with something already in
        // the calendar - or that the database's overlap constraint refuses -
        // is skipped and NAMED in the summary, never silently dropped. The
        // rows share a series_id (the same column personal events use) so
        // the series can be found again.
        const dates = recurrenceDates(newAppt.date, apptRepeat.everyWeeks, apptRepeat.count);
        const seriesId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : null;
        const base={...apptStaffWrite(),...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false,...(seriesId?{series_id:seriesId}:{}),...tenantField,...apptBufferField(newApptBuffer)};
        // Buffers included, the same rule as a single booking: the database refuses the rest anyway (appointments_no_overlap).
        const start = apptEffectiveStart, end = start + Number(newAppt.duration||0) + newApptBuffer;
        const clashed = [], saved = [];
        let seriesStopped = false;
        for (const date of dates) {
          const localClash = appointments.some(a=>{
            if(a.date!==date || a.confirmation_status==="cancelled") return false;
            if(teamCal && !sameStaff(a, apptStaff, team.staff)) return false;
            const bs=startMinute(a), rawEnd=endMinute(a); if(bs===null||rawEnd===null) return false;
            return start < rawEnd + apptBufferOf(a) && bs < end;
          });
          if (localClash) { clashed.push(date); continue; }
          const {data,error}=await writeWithApptBuffer([{...base,date}], (r) => supabase.from("appointments").insert(r).select());
          if (error) {
            // 23P01 is appointments_no_overlap, 23505 the active-slot index:
            // something landed there since the calendar loaded. Same answer.
            if (error.code==="23P01" || error.code==="23505") { clashed.push(date); continue; }
            handleDbError(error, "create appointment"); seriesStopped = true; break;
          }
          if (data && data[0]) saved.push(data[0]);
        }
        if (saved.length) setAppointments(prev=>[...prev,...saved]);
        setApptNote("");closeApptModal();
        if (clashed.length) {
          askConfirm({
            title: tr("נקבעו {0} מתוך {1} תורים", [saved.length, dates.length]),
            message: tr("התאריכים האלה התנגשו עם משהו שכבר ביומן ולא נקבעו: {0}. אפשר לקבוע אותם ידנית בשעה אחרת.", [shortDates(clashed)]),
            confirmText: tr("הבנתי"),
            cancelText: tr("סגירה"),
          });
        } else if (seriesStopped) {
          // A database error ended the series part-way: never end on a success toast that overstates what was saved.
          toast(tr("נקבעו {0} מתוך {1} תורים. השאר לא נשמרו, אפשר לנסות שוב.", [saved.length, dates.length]), "error");
        } else {
          toast(tr("נקבעו {0} תורים, כל {1}", [saved.length, apptRepeat.everyWeeks===1?"שבוע":`${apptRepeat.everyWeeks} שבועות`]));
        }
      } else {
        const appt={...apptStaffWrite(),date:newAppt.date,...startFields(apptEffectiveStart),name:newAppt.name,service:newAppt.service,duration:Number(newAppt.duration),color:svcColor,client_id:clientId,note:apptNote,price:Number(newAppt.price)||0,confirmation_status:"pending",confirmation_sent:false,...tenantField,...apptBufferField(newApptBuffer)};
        const {data,error}=await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
        if(error){handleDbError(error, "create appointment"); return;}
        if(data)setAppointments(prev=>[...prev,data[0]]);
        const wantDeposit = apptDeposit && data && data[0];
        setApptNote("");closeApptModal();
        toast(tr("התור נשמר בהצלחה"));
        // "Request deposit": hold the booking for 30 minutes and hand her the Grow payment link to send (app/api/grow/deposit/request).
        if (wantDeposit) {
          try {
            const r = await fetch("/api/grow/deposit/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: String(data[0].id) }) });
            const j = await r.json().catch(() => null);
            if (r.ok && j && j.success) { setDepositLink({ url: j.url, amount: j.amount, minutes: j.minutes, clientName: j.clientName, phone: j.phone }); setAppointments(prev => prev.map(a => String(a.id) === String(data[0].id) ? { ...a, confirmation_status: "pending" } : a)); window.dispatchEvent(new Event("kalmea:holds-changed")); }
            else toast((j && j.error) || tr("התור נשמר, אבל לא הצלחנו לבקש מקדמה"), "error");
          } catch { toast(tr("התור נשמר, אבל לא הצלחנו לבקש מקדמה"), "error"); }
        }
      }
    } finally {
      setBusyKey("saveAppt", false);
    }
  };

  // "The one question" - load the newest pending question and the running
  // yes/no counts. Expires questions whose slot is too close for a 4h claim
  // link to matter (under 2 hours away), so a stale question never shows.
  const loadPendingQuestion = async () => {
    try {
      const { data, error } = await supabase
        .from("owner_questions")
        .select("id, kind, payload, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      // A denied read comes back as {data:null, error} without throwing - the
      // exact shape the old catch-all made invisible. Log it loudly; the card
      // not rendering must never again be indistinguishable from "no rows".
      if (error) {
        console.error("[one-question] read FAILED:", error.code || "", error.message);
        return;
      }
      const rows = data || [];
      let show = null;
      for (const q of rows) {
        if (q.kind === "gap_fill") {
          const p = q.payload || {};
          const startMs = new Date(`${p.date}T00:00:00`).getTime() + (Number(p.startMinute) || 0) * 60000;
          if (isNaN(startMs) || startMs - Date.now() < 2 * 60 * 60 * 1000) {
            supabase.from("owner_questions").update({ status: "expired", answered_at: new Date().toISOString() }).eq("id", q.id)
              .then(({ error: expErr }) => { if (expErr) console.error("[one-question] expire FAILED:", expErr.message); });
            continue;
          }
          // STILL FREE? Between the cancellation and now, anyone can have
          // booked this slot - and a card offering a slot that no longer
          // exists invites a yes that sends real people a dead link. Checked
          // against the calendar on every load; a taken slot marks the
          // question 'stale' (not yes/no - she never answered it), which is
          // measurable data: how often the market beats the question.
          const qStart = Number(p.startMinute) || 0;
          const qDur = Number(p.duration) > 0 ? Number(p.duration) : 60;
          const { data: dayAppts, error: dayErr } = await supabase
            .from("appointments")
            .select("start_minute, hour, duration, confirmation_status")
            .eq("date", p.date);
          if (dayErr) {
            console.error("[one-question] slot-free check FAILED:", dayErr.message);
            // Cannot verify - do not show a question we cannot stand behind.
            continue;
          }
          const taken = (dayAppts || []).some((a) => {
            if (a.confirmation_status === "cancelled") return false;
            const st = a.start_minute != null ? Number(a.start_minute) : (a.hour != null ? Number(a.hour) * 60 : null);
            if (st === null || !Number.isFinite(st)) return false;
            const dur = Number(a.duration) > 0 ? Number(a.duration) : 60;
            return st < qStart + qDur && qStart < st + dur;
          });
          if (taken) {
            console.log("[one-question] gap_fill went STALE before answer - slot rebooked:", p.date, qStart);
            supabase.from("owner_questions").update({ status: "stale", answered_at: new Date().toISOString() }).eq("id", q.id)
              .then(({ error: stErr }) => { if (stErr) console.error("[one-question] stale mark FAILED:", stErr.message); });
            continue;
          }
        }
        show = q; break;
      }
      setPendingQuestion(show);
      const { data: answered, error: statsErr } = await supabase
        .from("owner_questions")
        .select("status")
        .in("status", ["yes", "no"]);
      if (statsErr) console.error("[one-question] stats read FAILED:", statsErr.message);
      if (answered) {
        setQuestionStats({
          yes: answered.filter((r) => r.status === "yes").length,
          no: answered.filter((r) => r.status === "no").length,
        });
      }
    } catch (e) {
      console.error("[one-question] load THREW:", e?.message || String(e));
    }
  };

  // The mount-only load missed two real paths on mobile: a PWA resumed from
  // the background (no remount, stale state), and navigating to the dashboard
  // tab after the mount already ran. Reload on both.
  // Skipped on the FIRST run: the mount effect above already starts this load, and running both sent the same
  // two reads (pending questions, then the yes/no counts) twice at boot - two requests and two CORS preflights
  // on the critical path for nothing. Every later change of tab loads as before.
  const questionLoadedOnMountRef = useRef(true);
  useEffect(() => {
    if (questionLoadedOnMountRef.current) { questionLoadedOnMountRef.current = false; return; }
    if (activeTab === "dashboard") loadPendingQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  useEffect(() => {
    // The ready-to-send queue too: reminders are queued in the afternoon, often while the app is already open (2026-11-02 audit).
    const onVisible = () => { if (document.visibilityState === "visible") { loadPendingQuestion(); refreshWaQueue(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answerQuestion = async (q, saidYes) => {
    if (isBusy("ownerQuestion")) return;
    setBusyKey("ownerQuestion", true);
    try {
      let result = null;
      // A yes PREPARES rather than sends: the server picks the candidates and
      // writes the claim links, and a compose window opens for her to send
      // from her own WhatsApp (wa.me) - works with no GreenAPI, no ban risk,
      // and the message arrives from a number the client knows. There is no
      // automatic path: marketing leaves from her phone only.
      if (saidYes && (q.kind === "gap_fill" || q.kind === "comeback")) {
        const p = q.payload || {};
        if (q.kind === "comeback" && !p.quiet_start) {
          toast(tr("לא נמצאו לקוחות מתאימות"));
          result = { sent: 0 };
        } else {
          const url = q.kind === "gap_fill" ? "/api/slots/offer" : "/api/clients/comeback";
          const reqBody = q.kind === "gap_fill"
            ? { date: p.date, startMinute: p.startMinute, service: p.service,
                duration: p.duration, cancelledClientId: p.cancelledClientId,
                ...(p.staffId ? { staffId: p.staffId } : {}),
                explicitConfirm: true, mode: "prepare" }
            : { quietStart: p.quiet_start, mode: "prepare" };
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });
          const data = await res.json().catch(() => ({}));
          if (!data.success) { toast(data.error || tr("לא הצלחנו להכין, אפשר לנסות שוב"), "error"); return; }
          if (data.slotTaken) {
            // The slot was booked between the card rendering and her yes. Not
            // a yes and not a no - she never really answered; 'stale'.
            console.log("[one-question] gap_fill went STALE at yes - slot rebooked");
            toast(tr("התור הזה כבר נתפס בינתיים, אין צורך להציע אותו 🎉"));
            const { error: stErr } = await supabase.from("owner_questions")
              .update({ status: "stale", answered_at: new Date().toISOString() })
              .eq("id", q.id);
            if (stErr) console.error("[one-question] stale mark FAILED:", stErr.message);
            setPendingQuestion(null);
            return;
          }
          if (!data.candidates || data.candidates.length === 0) {
            toast(tr("לא נמצאו לקוחות מתאימות"));
            result = { sent: 0 };
          } else {
            setComposeDone({});
            setComposeSend({
              kind: q.kind,
              title: q.kind === "gap_fill" ? tr("הצעת התור שהתפנה") : tr("הודעת \"חזרנו\""),
              messageTemplate: data.messageTemplate || "",
              candidates: data.candidates,
              payload: p,
            });
            result = { prepared: data.candidates.length };
          }
        }
      }
      const { error: ansErr } = await supabase.from("owner_questions")
        .update({ status: saidYes ? "yes" : "no", result, answered_at: new Date().toISOString() })
        .eq("id", q.id);
      if (ansErr) {
        // The send (on yes) already happened; the MEASUREMENT failed. Say so -
        // a yes-rate quietly missing its rows is worse than a visible error.
        console.error("[one-question] answer update FAILED:", ansErr.code || "", ansErr.message);
        toast(tr("התשובה לא נשמרה: {0}", [ansErr.message]), "error");
        return;
      }
      setPendingQuestion(null);
      setQuestionStats((prev) => prev ? { ...prev, [saidYes ? "yes" : "no"]: prev[saidYes ? "yes" : "no"] + 1 } : prev);
    } catch (e) {
      toast(STUCK_HE, "error");
    } finally {
      setBusyKey("ownerQuestion", false);
    }
  };

  // Business quiet mode: manual (automations.quiet) or automatic (a calendar
  // with history that has gone dark). While quiet, the one-question card stays
  // silent - automatic quiet deliberately shows NO banner. See lib/quiet.js.
  const businessQuiet = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return quietStatus({
      pastDates: (appointments || []).map((a) => a.date).filter((d) => d && d <= todayStr),
      manualQuiet: settings?.automations?.quiet === true,
      manualQuietEndedAt: settings?.automations?.quiet_ended_at || null,
    });
  }, [appointments, settings?.automations?.quiet, settings?.automations?.quiet_ended_at]);

  // The comeback question: due COMEBACK_WAIT_DAYS after a break ends (day one
  // back looks like pressure). One question per break - deduped on the break's
  // end date, across every status, so "לא הפעם" is never re-asked.
  useEffect(() => {
    if (!settings?.tenant_id || !businessQuiet.comebackDue || !businessQuiet.quietEnd) return;
    (async () => {
      try {
        // Server-side write; the route also dedups one comeback per break.
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "comeback", payload: {
            quiet_start: businessQuiet.quietStart, quiet_end: businessQuiet.quietEnd,
          }}),
        });
        const cbData = await res.json().catch(() => ({}));
        if (!cbData.success) { console.error("[one-question] comeback insert FAILED:", cbData.error || res.status); return; }
        if (!cbData.duplicate) loadPendingQuestion();
      } catch (e) { console.error("[one-question] comeback THREW:", e?.message || String(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessQuiet.comebackDue, businessQuiet.quietEnd, settings?.tenant_id]);

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
          // The team calendar: her slot stays hers (the route checks it is one of this business's active staff).
          ...(appt.staff_id ? { staffId: String(appt.staff_id) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.sent > 0) toast(tr("הצעה למילוי התור מוכנה ל-{0} לקוחות, אפשר לשלוח מהתור הממתין בלוח הבקרה ✦", [data.sent]));
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
  // Her cancellation policy on top of Grow (app/api/grow/fees/detect): after SHE cancels or marks a no-show, the server decides from what the client
  // agreed to whether a fee question should appear. It only ever creates a question, never a charge, and it is silent when there is no policy.
  const notifyFeeDetect = (appointmentId, event) => {
    fetch("/api/grow/fees/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: String(appointmentId), event }) }).then(() => feesChanged()).catch(() => {});
  };
  // A fee was charged from a question: bring the new receipt into the lists (client card, cashier history, reports).
  const feeCharged = async (receiptId) => {
    if (!receiptId) return;
    try {
      const { data } = await supabase.from("receipts").select("*").eq("id", receiptId);
      if (data && data[0]) setReceipts(prev => prev.some(x => String(x.id) === String(data[0].id)) ? prev : [...prev, data[0]]);
    } catch { /* the receipt shows after the next reload */ }
  };

  const softCancelAppointment = useCallback(async (appt, by = "business") => {
    const withAudit = {
      confirmation_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: by,
    };
    let res = await supabase.from("appointments").update(withAudit).eq("id", appt.id).select();
    if (isMissingColumnError(res.error)) {
      res = await supabase
        .from("appointments")
        .update({ confirmation_status: "cancelled" })
        .eq("id", appt.id)
        .select();
    }
    if (!res.error) notifyFeeDetect(appt.id, "cancel");
    return res;
  }, []);

  // No-show: the appointment stood and she was not there. Set by hand, on or
  // after the day, never by the system - nothing but the person who was
  // waiting can know. Counted on the client card (lib/reliability.ts). The
  // row keeps its slot, its price and its history; only the status moves,
  // and the toast offers the way back.
  const markNoShow = (appt) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("לא הגיעה"),
      message: tr("לסמן ש{0} לא הגיעה לתור ב-{1} {2}? הסימון נספר בכרטיס הלקוחה.", [appt.name, fmtDateHe(appt.date), fmtApptTime(appt)]),
      confirmText: tr("סמני: לא הגיעה"),
      danger: true,
      onConfirm: async () => {
        const previousStatus = appt.confirmation_status || "pending";
        const { data, error } = await supabase.from("appointments").update({ confirmation_status: NO_SHOW }).eq("id", appt.id).select();
        if (error) {
          // 23514: the status check constraint still lists three values -
          // add_till_and_calendar_small_things.sql hasn't run on this DB yet.
          // She never needs to know that; "תקועה?" already sends the screen
          // name along with her message, which is enough for us to know too.
          if (error.code === "23514") { console.error("[markNoShow] migration missing: add_till_and_calendar_small_things.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
          handleDbError(error, "mark no-show"); return;
        }
        if (data && data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? data[0] : a));
        notifyFeeDetect(appt.id, "no_show");
        toast(tr("סומן: לא הגיעה"), "success", { label: tr("החזרה"), onClick: async () => {
          const r = await supabase.from("appointments").update({ confirmation_status: previousStatus }).eq("id", appt.id).select();
          if (r.error) { handleDbError(r.error, "restore appointment"); return; }
          if (r.data && r.data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? r.data[0] : a));
          notifyFeeDetect(appt.id, "restore");
          toast(tr("הסימון בוטל"));
        }});
      },
    });
  };

  // Real start/finish: see supabase/migrations/pending/
  // appointment-actual-duration.sql. Two separate writes rather than one
  // "log the duration afterward" field, because a treatment that is open
  // right now (started, not yet finished) is itself worth knowing, and
  // "finished" is the moment the one sentence that matters - booked vs.
  // actual - is still true, not something to reconstruct from a report.
  const handleStartTreatment = async (appt) => {
    if (guardWrite()) return;
    const { data, error } = await supabase.from("appointments").update({ actual_start_at: new Date().toISOString() }).eq("id", appt.id).select();
    if (error) {
      if (isMissingColumnError(error)) { console.error("[handleStartTreatment] migration missing: appointment-actual-duration.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
      handleDbError(error, "start treatment"); return;
    }
    if (data && data[0]) setAppointments(prev => prev.map(a => a.id === appt.id ? data[0] : a));
  };

  const handleFinishTreatment = async (appt) => {
    if (guardWrite()) return;
    const { data, error } = await supabase.from("appointments").update({ actual_end_at: new Date().toISOString() }).eq("id", appt.id).select();
    if (error) {
      if (isMissingColumnError(error)) { console.error("[handleFinishTreatment] migration missing: appointment-actual-duration.sql", error); toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); return; }
      handleDbError(error, "finish treatment"); return;
    }
    const updated = data && data[0];
    if (updated) setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
    const outcome = updated ? durationOutcome(updated.actual_start_at, updated.actual_end_at, Number(updated.duration) || 0) : null;
    toast(outcome ? durationOutcomeHe(outcome) : tr("התור סומן כהושלם"));
  };

  const handleDelete = (appt) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("ביטול תור"),
      message: tr("לבטל את התור של {0} ({1}, {2} {3})? התור יסומן כמבוטל וישאר ביומן.", [appt.name, appt.service, fmtDateHe(appt.date), fmtApptTime(appt)]),
      confirmText: tr("ביטול התור"),
      danger: true,
      onConfirm: async () => {
        const previousStatus = appt.confirmation_status || "pending";
        const { data, error } = await softCancelAppointment(appt);
        if (error) { handleDbError(error, "cancel appointment"); return; }
        const updated = (data && data[0]) || { ...appt, confirmation_status: "cancelled" };
        setAppointments(prev=>prev.map(a=>a.id===appt.id?updated:a));
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
          toast(tr("התור שוחזר"));
        };
        toast(tr("התור בוטל"), "success", { label: tr("החזרה"), onClick: restore });
        // She cancelled, so the client does not know yet (2026-10-23 pass, E1). After the same undo window, the
        // message telling her is prepared server-side: out from the central number when it is on, otherwise in
        // "הודעות מוכנות לשליחה". Only for a real client of hers with a phone; never for a personal block.
        const cancelClient = clients.find(c => String(c.id) === String(appt.client_id));
        if (appt.kind !== "personal" && (cancelClient?.phone || appt.client_phone)) {
          setTimeout(async () => {
            if (restored) return;
            try {
              const r = await fetch("/api/cancel-notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j.success) { if (r.status !== 403) toast(tr("לא הצלחנו להכין ללקוחה הודעה על הביטול. כדאי לכתוב לה בעצמך."), "error"); return; }
              if (j.queued) {
                const q = await fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then(x => x.json()).catch(() => null);
                if (q?.success) setWhatsappPending(q.messages || []);
                toast(tr("הודעה ל{0} על הביטול מחכה ב\"הודעות מוכנות לשליחה\"", [appt.name || "לקוחה"]), "info");
              } else {
                toast(tr("הודעה על הביטול יצאה ל{0} מהמספר המרכזי", [appt.name || "לקוחה"]));
              }
            } catch { toast(tr("לא הצלחנו להכין ללקוחה הודעה על הביטול. כדאי לכתוב לה בעצמך."), "error"); }
          }, UNDO_SETTLE_MS + 100);
        }
        // Smart waitlist: with her switch on (Settings > הודעות), the people waiting for this treatment whom the slot fits get one offer.
        // The server re-checks that the appointment is still cancelled, so the undo above always wins.
        // Only when she turned it on, and the platform flag allows it (lib/waitlistFlag.js). What happened is shown in one line
        // (waitlistOfferToast): who it was offered to, or that it waits for the morning; nothing when nobody fits.
        if (waitlistOffersOn(settings) && appt.kind !== "personal") {
          setTimeout(async () => {
            if (restored) return;
            try {
              const r = await fetch("/api/waitlist/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) });
              const j = await r.json().catch(() => ({}));
              const line = r.ok && j?.success ? waitlistOfferToast(j) : null;
              if (line) toast(line.text, line.kind);
            } catch { /* the owner alert still tells her; the slot is free either way */ }
          }, UNDO_SETTLE_MS);
        }
        // Fire gap-fill only AFTER the undo window closes, and only if it wasn't
        // undone — so a quick "ביטול" never lets a real WhatsApp offer go out for
        // an appointment the cosmetician restored. Gated by the settings toggle.
        if (settings.gap_fill_enabled === true) {
          setTimeout(() => { if (!restored) triggerGapFill(appt); }, UNDO_SETTLE_MS);
        } else {
          // Auto mode is off: ask instead of acting. The question is written
          // after the same undo window, so a restored appointment never asks.
          // Only future slots are worth offering.
          setTimeout(async () => {
            if (restored) return;
            if (settings?.automations?.quiet === true) return; // on a break: don't ask
            try {
              const startMs = new Date(`${appt.date}T00:00:00`).getTime() + (startMinute(appt) || 0) * 60000;
              if (isNaN(startMs) || startMs - Date.now() < 2 * 60 * 60 * 1000) return;
              // Server-side write: the browser holds no INSERT on
              // owner_questions - /api/questions stamps the tenant from the
              // session and validates the payload shape.
              const res = await fetch("/api/questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "gap_fill", payload: {
                  date: appt.date, startMinute: startMinute(appt), service: appt.service,
                  duration: appt.duration, cancelledClientId: appt.client_id,
                }}),
              });
              const qData = await res.json().catch(() => ({}));
              if (!qData.success) { console.error("[one-question] gap_fill insert FAILED:", qData.error || res.status); return; }
              loadPendingQuestion();
            } catch (e) { console.error("[one-question] gap_fill insert THREW:", e?.message || String(e)); }
          }, UNDO_SETTLE_MS);
        }
      },
    });
  };

  const handleSendConfirmation = (appt) => runOnce(`sendConfirm:${appt.id}`, () => sendConfirmationNow(appt));
  // Returns true only when a WhatsApp window actually opened. A blocked popup is not a sent reminder, so it is not marked sent
  // (2026-10-20 audit: the bulk loop marked every client after the first as handled while nothing had opened for them).
  const sendConfirmationNow = async (appt) => {
    if (guardWrite()) return false;
    const client=clients.find(c=>String(c.id)===String(appt.client_id));
    if(!client?.phone){toast(tr("אין מספר טלפון ללקוחה"),"error");return false;}
    // The window is opened synchronously, inside the click, and only then
    // pointed at the link. Awaiting the signed links first and opening
    // afterwards would put window.open outside the user gesture, which Safari
    // and Chrome block as a popup.
    const w = window.open("", "_blank");
    const links = await fetchConfirmLinks(appt.id);
    if (!links) { if (w) w.close(); toast(tr("לא הצלחנו להכין את קישורי האישור"), "error"); return false; }
    const brandJson = settings.branding && typeof settings.branding === "object" ? settings.branding : {};
    const link = waConfirmLink(client.phone, appt.name, appt.service, appt.date, fmtApptTime(appt), links, {
      businessName: settings.business_name,
      address: brandJson.public_address || brandJson.address,
      arrivalNote: brandJson.arrival_note,
      branding: brandJson,
    });
    const opened = w ? (w.location.href = link, true) : !!window.open(link, "_blank");
    if (!opened) { toast(tr("הדפדפן חסם את פתיחת וואטסאפ, אפשר לנסות שוב"), "info"); return false; }
    // Tell the server this appointment's reminder went: the daily run will not queue it again, and a copy already waiting in the
    // queue is dismissed (lib/reminders/handled.js; a client used to get two, 2026-11-02 audit). Best effort, never blocks her.
    fetch("/api/reminders/handled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: appt.id }) })
      .then(() => refreshWaQueue()).catch(() => {});
    const {data, error}=await supabase.from("appointments").update({confirmation_sent:true}).eq("id",appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return true; }
    if(data)setAppointments(prev=>prev.map(a=>a.id===appt.id?data[0]:a));
    return true;
  };

  const handleSendAllConfirmations = async () => {
    if (guardWrite()) return;
    // A cancelled or no-show booking gets no reminder (the cron and the "היום שלי" card already skip them; 2026-11-02 audit).
    const pending=tomorrowAppts.filter(a=>!a.confirmation_sent&&a.confirmation_status!=="cancelled"&&a.confirmation_status!==NO_SHOW);
    if(pending.length===0){toast(tr("כבר הכנת תזכורות לכל התורים של מחר"), "info");return;}
    askConfirm({
      title: tr("שליחת תזכורות"),
      message: `${pending.length===1?"לשלוח תזכורת ללקוחה אחת?":`לשלוח תזכורת ל-${pending.length} לקוחות?`}`,
      confirmText: tr("שליחה"),
      onConfirm: async () => {
        // The browser lets a page open a window only from a tap, so after the first one the rest may be blocked. Those stay
        // unmarked and she is told how many are left, instead of a toast that says all of them were opened.
        let opened = 0;
        for(const appt of pending){
          const ok = await handleSendConfirmation(appt);
          if (!ok) break;
          opened++;
          await new Promise(r=>setTimeout(r,500));
        }
        const left = pending.length - opened;
        if (left > 0) toast(opened ? tr("פתחנו וואטסאפ ל-{0} מתוך {1}. הדפדפן חסם את השאר, אפשר ללחוץ על כל תור בנפרד.", [opened, pending.length]) : tr("הדפדפן חסם את פתיחת וואטסאפ. אפשר ללחוץ על כל תור בנפרד."), "info");
        else toast(pending.length===1?tr("פתחנו וואטסאפ עם תזכורת מוכנה ללקוחה אחת. נשאר ללחוץ שליחה."):tr("פתחנו וואטסאפ עם תזכורת מוכנה ל-{0} לקוחות. נשאר ללחוץ שליחה בכל שיחה.", [pending.length]));
      },
    });
  };

  // Messages center, "תזכורות לתורי מחר": one reminder per tap, through the same path as a single reminder (confirm/cancel links,
  // marked sent, and /api/reminders/handled so the daily run does not queue it again). A loop of window.open calls is blocked by
  // phones after the first window, so the group button opens the next one only (2026-11-03 UX review).
  const sendNextReminder = async (targets) => {
    const next = (targets || []).find((t) => t.appt);
    if (!next) return;
    const ok = await handleSendConfirmation(next.appt);
    if (!ok) return;
    const left = targets.length - 1;
    toast(left > 0 ? tr("נפתח וואטסאפ עם תזכורת ל{0}. {1}, אפשר ללחוץ שוב.", [next.name || "לקוחה", left === 1 ? "נשארה עוד אחת" : `נשארו עוד ${left}`]) : tr("נפתח וואטסאפ עם תזכורת ל{0}. נשאר ללחוץ שליחה.", [next.name || "לקוחה"]));
  };

  // After her data was erased on the server: the same change here, so the screen does not show a client who no longer exists.
  const handleClientErased = (clientId) => {
    const same = (a) => String(a) === String(clientId);
    setClients(prev=>prev.filter(c=>!same(c.id)));
    setSelectedClient(null);
    setAppointments(prev=>prev.map(a=>same(a.client_id)?{...a,client_id:null,name:"לקוחה שנמחקה",client_phone:null,note:null}:a));
    setReceipts(prev=>prev.map(r=>same(r.client_id)?{...r,client_id:null,client_name:"לקוחה שנמחקה"}:r));
    setForms(prev=>prev.filter(f=>!same(f.client_id)));
    setWaitlist(prev=>prev.filter(w=>!same(w.client_id)));
    setPackages(prev=>prev.map(k=>same(k.client_id)?{...k,client_id:null,client_name:"לקוחה שנמחקה"}:k));
    setLeads(prev=>prev.filter(l=>!same(l.client_id)));
  };
  const saveClientDupOk = useRef(false);
  // Every new-client form opens short again (name and phone), whichever button opened it.
  useEffect(() => { if (!showClientModal) setClientMoreOpen(false); }, [showClientModal]);
  const handleSaveClient = async () => {
    if (guardWrite()) return;
    if(!newClient.name.trim()){toast(tr("חסר שם, אפשר להוסיף אותו"),"error");return;}
    // A phone she typed that WhatsApp cannot use used to be saved as typed, and her reminders to that client quietly never arrived.
    const typedPhone = String(newClient.phone||"").trim();
    const phoneInfo = typedPhone ? normalizeIsraeliMobile(typedPhone) : null;
    if(phoneInfo && !phoneInfo.ok){toast(tr("המספר לא נראה כמו נייד ישראלי. אפשר לבדוק אותו, או להשאיר ריק."),"error");return;}
    if(phoneInfo && !editingClient && !saveClientDupOk.current){
      const dup = clients.find(c=>normalizeIsraeliMobile(c.phone).e164===phoneInfo.e164);
      if(dup){
        askConfirm({title:tr("המספר הזה כבר קיים"),message:tr("יש כבר לקוחה עם המספר הזה: {0}. להוסיף בכל זאת כרטיס נוסף?", [dup.name]),confirmText:tr("להוסיף בכל זאת"),onConfirm:()=>{saveClientDupOk.current=true;Promise.resolve(handleSaveClient()).finally(()=>{saveClientDupOk.current=false;});}});
        return;
      }
    }
    if(isBusy("saveClient")) return;
    setBusyKey("saveClient", true);
    try {
      const toSave = {...newClient, name:newClient.name.trim()};
      if(editingClient){
        const {data,error}=await supabase.from("clients").update(toSave).eq("id",editingClient.id).select();
        if(error){handleDbError(error, "update client"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setClients(prev=>prev.map(c=>c.id===editingClient.id?data[0]:c));setSelectedClient(data[0]);
        toast(tr("הלקוחה עודכנה"));
      }else{
        const {data,error}=await supabase.from("clients").insert([toSave]).select();
        if(error){handleDbError(error, "create client"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setClients(prev=>[...prev,data[0]]);
        // The next step, one tap away (UX pass 2026-11-08): book her first visit with the client already filled in.
        const nc=data[0];
        toast(tr("נוספה ✓ · לקבוע לה תור?"), "success", { label:tr("קביעת תור"), onClick:()=>{ openNewAppt(); setNewAppt(prev=>({...prev,clientId:nc.id,name:nc.name})); } });
      }
      setShowClientModal(false);setEditingClient(null);setNewClient(emptyClient);
    } finally {
      setBusyKey("saveClient", false);
    }
  };

  // Marketing consent / opt-out for one client (lib/marketingConsent.js). The columns come from supabase/migrations/add_marketing_consent.sql;
  // until it has run the update fails and she is told so, plainly - never a success toast for a write that did not happen.
  const saveClientMarketing = async (client, fields, doneMsg) => {
    if (guardWrite()) return;
    if (isBusy("clientMarketing")) return;
    setBusyKey("clientMarketing", true);
    try {
      const {data,error}=await supabase.from("clients").update(fields).eq("id",client.id).select();
      if(error){
        console.error("[marketing consent] update failed:", error);
        const missing=/marketing_|column|schema cache/i.test(String(error.message||""));
        toast(missing?tr("שמירת הסכמה והסרה מדיוור עוד לא פעילה במערכת (עדכון מסד נתונים שעוד לא הורץ)."):SAVE_FAILED_HE,"error");
        return;
      }
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));
      // Only refresh the open card; from the cashier prompt no client card is open and none should pop up.
      setSelectedClient(prev=>prev&&String(prev.id)===String(client.id)?data[0]:prev);
      toast(doneMsg);
    } finally {
      setBusyKey("clientMarketing", false);
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
      toast(tr("המכשיר לא תומך בבחירה מאנשי קשר, השתמשי בהדבקה ידנית"), "error");
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

  // A .vcf (vCard) file of contacts: on an iPhone there is no contact picker, but the Contacts app can share contacts as a vCard
  // file (lib/vcard.js). The file becomes the same text a paste makes and goes on to the same mapping, preview and import, so the
  // dedupe against her clients by phone is the existing one.
  const importVcardFile = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = ""; // the same file can be picked again after a "חזרה"
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast(tr("הקובץ גדול מדי. אפשר לשתף פחות אנשי קשר בכל פעם."), "error"); return; }
    let text = "";
    try { text = await file.text(); } catch { toast(tr("לא הצלחנו לקרוא את הקובץ. אפשר לנסות שוב, או להדביק רשימה."), "error"); return; }
    const r = vcardImportText(text);
    if (!r.count) {
      toast(isVcardFile(file) || /BEGIN:VCARD/i.test(text) ? tr("לא מצאנו אנשי קשר עם שם או טלפון בקובץ הזה.") : tr("זה לא נראה כמו קובץ אנשי קשר (vcf). אפשר לבחור קובץ אחר, או להדביק רשימה."), "error");
      return;
    }
    setImportText(r.text);
    goToImportMapping(r.text);
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
  // Appointments: a row with no duration or price in the paste takes her treatment's own (lib/importMapping withServiceDefaults).
  const importBuilder = importTarget === "appts"    ? ((g,c,h)=>{ const b=buildApptRows(g,c,h,today,now.getHours()*60+now.getMinutes(),knownServiceNames); return { ...b, rows: withServiceDefaults(b.rows, services) }; })
                      : importTarget === "services" ? buildServiceRows
                      : ((g,c,h)=>buildImportRows(g,c,h,knownServiceNames));

  // `text` is passed when the list did not come from the paste box (a .vcf file): the state update has not landed yet.
  const goToImportMapping = (text) => {
    const grid = parseImportGrid(typeof text === "string" ? text : importText);
    if (!grid.rows.length) { toast(tr("לא נמצאו שורות"), "error"); return; }
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
    if (rows.length === 0) { toast(tr("לא נמצאו טיפולים להוספה"), "error"); return; }

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
      setImportResult({ added: inserted.length, dupes, noName, nameIsService: 0, failed,
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
    if (!historyReady) { toast(tr("הלוח הישן עוד בדרך. כדי שלא ייווצרו תורים כפולים, אפשר לנסות שוב בעוד רגע."), "info"); return; }
    if (guardWrite()) return;
    if (importing) return;

    const grid = parseImportGrid(importText);
    const built0 = buildApptRows(grid, importCols, importHasHeader, today, now.getHours()*60+now.getMinutes(), knownServiceNames);
    // Duration and price from her own treatment when the paste has none, BEFORE the overlap check below uses the duration.
    const built = { ...built0, rows: withServiceDefaults(built0.rows, services) };
    if (built.rows.length === 0) { toast(tr("לא נמצאו תורים עתידיים להוספה"), "error"); return; }

    setImporting(true);
    let firstError = null;
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      // Phone -> client id, digits only, so "054-123 4567" and "0541234567"
      // are the same person however her old system wrote them.
      const digits = importPhoneKey;
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
        // Imported history is checked WITHOUT her buffers (a pasted diary is what already happened) and stored with 0. A
        // row the database holds a buffer for still blocks it there (appointments_no_overlap), so that one is checked too,
        // here, rather than failing a whole chunk of 100 at insert time.
        const storedBusy = sameDay.flatMap(a => { const s0 = startMinute(a), e0 = endMinute(a); return s0===null||e0===null ? [] : [bufferedRange(s0, e0, a.buffer_minutes)]; });
        if (clashesWithBuffer(r.startMinute, Number(r.duration||0), 0, storedBusy)) { overlapping++; continue; }

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
          ...apptBufferField(0),
        });
        sameDay.push({ start_minute: r.startMinute, duration: Number(r.duration||0) });
        if (!byDate.has(r.date)) byDate.set(r.date, sameDay);
      }

      const CHUNK = 100;
      let failed = 0;
      const inserted = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { data, error } = await writeWithApptBuffer(chunk, (r) => supabase.from("appointments").insert(r).select());
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
    const { rows, noName, nameIsService } = buildImportRows(grid, importCols, importHasHeader, knownServiceNames);
    if (rows.length === 0) { toast(tr("לא נמצאו לקוחות להוספה"), "error"); return; }

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
        clients.map(c => importPhoneKey(c.phone)).filter(Boolean)
      );
      const seen = new Set();
      const fresh = [];
      let dupes = 0;
      for (const r of rows) {
        const key = importPhoneKey(r.phone);
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
      setImportResult({ added: inserted.length, dupes, noName, nameIsService, failed,
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
    if (!pwCurrent || !pwNew || !pwConfirm) { toast(tr("חסר משהו, אפשר למלא את כל השדות"), "error"); return; }
    if (pwNew.length < 8) { toast(tr("הסיסמה החדשה חייבת להכיל לפחות 8 תווים"), "error"); return; }
    if (pwNew !== pwConfirm) { toast(tr("הסיסמאות אינן תואמות"), "error"); return; }
    setBusyKey("changePw", true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { toast(tr("לא זוהה משתמש מחובר"), "error"); return; }
      // Verify the current password by re-authenticating the same user.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent });
      if (reauthErr) { toast(tr("הסיסמה הנוכחית שגויה"), "error"); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updErr) {
        const sameAsOld = /should be different|New password/i.test(updErr.message || "");
        toast(sameAsOld ? tr("הסיסמה החדשה חייבת להיות שונה מהנוכחית") : tr("עדכון הסיסמה נכשל, נסי שוב"), "error");
        return;
      }
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      toast(tr("הסיסמה עודכנה ✓"));
    } finally {
      setBusyKey("changePw", false);
    }
  };

  const handleSaveLead = async () => {
    if (guardWrite()) return;
    if(!newLead.name.trim()){toast(tr("חסר שם, אפשר להוסיף אותו"),"error");return;}
    if(isBusy("saveLead")) return;
    setBusyKey("saveLead", true);
    try {
      if(editingLead){
        const {data,error}=await supabase.from("leads").update(newLead).eq("id",editingLead.id).select();
        if(error){handleDbError(error, "update lead"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setLeads(prev=>prev.map(l=>l.id===editingLead.id?data[0]:l));setSelectedLead(data[0]);
        toast(tr("הפנייה עודכנה"));
      }else{
        const {data,error}=await supabase.from("leads").insert([{...newLead,source:newLead.source||null}]).select();
        if(error){handleDbError(error, "create lead"); return;}
        if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
        setLeads(prev=>[...prev,data[0]]);
        toast(tr("הפנייה נוספה"));
      }
      setShowLeadModal(false);setEditingLead(null);setNewLead(emptyLead);
    } finally {
      setBusyKey("saveLead", false);
    }
  };

  // Status chips in the lead drawer save on tap - there is no save button, and
  // there should not be one: a status is a one-tap field and a confirm step
  // would make it three.
  //
  // What was missing is the evidence that it saved. This and handleSetReminder
  // were the ONLY two of the 26 async write handlers in this file with no
  // toast, and the sole feedback was a 9.5px chip changing colour AFTER the
  // round-trip returned. So on a slow phone you tapped, nothing moved, and the
  // reasonable conclusion was that it had not worked.
  //
  // Four changes, in the order they matter:
  //   1. Optimistic - the chip moves on the tap, not on the response.
  //   2. Revert on failure, so an optimistic update can never leave the screen
  //      claiming something the database did not accept.
  //   3. A toast naming the new status, matching every other write in the app.
  //   4. A busy guard. Rapid taps used to fire concurrent updates where the
  //      last RESPONSE won rather than the last TAP, so she could land on a
  //      status she did not choose.
  const handleUpdateLeadStatus = async (lead,status) => {
    if (guardWrite()) return;
    if (status === lead.status) return;              // re-tapping the active chip
    if (isBusy("leadStatus")) return;
    const prevStatus = lead.status;
    const label = (LEAD_STATUSES[status] || {}).label || status;
    // Functional updates throughout: the drawer can be closed, or switched to
    // another lead, while the write is still in flight.
    const applyStatus = (s) => {
      setLeads(prev => prev.map(l => l.id === lead.id ? {...l, status:s} : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? {...prev, status:s} : prev);
    };
    applyStatus(status);
    setBusyKey("leadStatus", true);
    try {
      const {data,error}=await supabase.from("leads").update({status}).eq("id",lead.id).select();
      if(error){ applyStatus(prevStatus); handleDbError(error, "update lead status"); return; }
      // Zero rows back is not success. It means RLS refused the write, which
      // used to leave the old code showing nothing at all.
      if(!data||!data[0]){ applyStatus(prevStatus); toast(tr("לא הצלחנו לעדכן את הסטטוס, והוא חזר למה שהיה. נסי שוב בעוד רגע."),"error"); return; }
      const row = data[0];
      setLeads(prev => prev.map(l => l.id === lead.id ? row : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? row : prev);
      toast(tr("הסטטוס עודכן: {0}", [label]));
    } finally {
      setBusyKey("leadStatus", false);
    }
  };

  // --- Bulk WhatsApp send per status group ---
  // openBulk resets the flow to a clean "compose" step for the chosen status.
  // Prefills the composer from the saved per-status template
  // (settings.automations.lead_templates). Always editable before sending, and
  // blank when no template is saved for that status.
  // Passing `lead` targets that single lead instead of the whole status group.
  // `target` is one of three things, and the difference decides who receives it:
  //   a lead object  - just her (from the lead drawer)
  //   an array       - exactly these leads (the filtered group on the leads
  //                    screen, which is narrowed by the search box)
  //   null/undefined - everyone in the status
  //
  // The array form is what stops the group send from ignoring the search. It
  // used to take only a status, so searching "רונית" and sending to "חדש"
  // messaged all nine leads in that status rather than the one on screen. The
  // API applies leadIds AFTER its own tenant and status filters, so this can
  // only ever narrow the recipients, never widen them.
  const openBulk = (status, target) => {
    const tpl = resolveLeadTemplate(settings, status);
    const isList = Array.isArray(target);
    const singleLead = !isList && target ? target : null;
    setBulkStatus(status);
    setBulkLeadIds(
      isList ? target.map(l => (typeof l === "string" ? l : l.id)).filter(Boolean)
             : singleLead ? [singleLead.id]
             : null
    );
    // The template goes into the textarea AS SAVED, placeholders and all. It
    // used to be rendered here, once, with `singleLead` - null for a group -
    // so every recipient of a group send got "לקוחה יקרה" while a send from
    // the drawer got her real name. The route now renders per recipient
    // (app/api/leads/send-bulk/route.js), and the modal shows her a preview
    // for the first recipient so she still sees a real message, not braces.
    setBulkMessage(tpl || "");
    setBulkResult(null); setBulkError(""); setBulkStep("compose"); setBulkConfirmConsent(false);
  };
  const closeBulk = () => {
    setBulkStatus(null); setBulkStep("compose"); setBulkMessage("");
    setBulkResult(null); setBulkError(""); setBulkLeadIds(null); setBulkConfirmConsent(false);
  };
  // Called when she taps a prepared chat link: only then does the lead read as contacted.
  const markLeadContacted = async (leadId) => {
    if(!leadId) return;
    if(bulkResult?.results?.some(r=>r.leadId===leadId&&r.marked)) return;
    setBulkResult(prev=>prev?{...prev,results:prev.results.map(r=>r.leadId===leadId?{...r,marked:true}:r)}:prev);
    try{
      const res=await fetch("/api/leads/mark-contacted",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({leadIds:[leadId]})});
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.success){ toast(data?.error||tr("לא הצלחנו לסמן שיצרת קשר"),"error"); return; }
      const nowIso=data.at||new Date().toISOString();
      const stamp=(l)=>({...l,last_contacted_at:nowIso,first_contacted_at:l.first_contacted_at||nowIso,contact_attempts:(Number(l.contact_attempts)||0)+1});
      setLeads(prev=>prev.map(l=>l.id===leadId?stamp(l):l));
      setSelectedLead(prev=>(prev&&prev.id===leadId)?stamp(prev):prev);
    }catch{ /* the chat is open either way */ }
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
          ...(bulkConfirmConsent?{confirmedConsent:true}:{}),
        }),
      });
      const data=await res.json().catch(() => ({}));
      if(!res.ok||!data.success){
        setBulkError(data.error||tr("ההודעה לא נשלחה, אפשר לנסות שוב")); setBulkStep("confirm"); return;
      }
      setBulkResult({queued:data.queued??0,failed:data.failed??0,skipped_no_phone:data.skipped_no_phone??0,skipped_no_consent:data.skipped_no_consent??0,results:data.results||[]});
      // The contact trail is stamped when she TAPS a chat link (markLeadContacted), not here:
      // nothing has been sent yet, only prepared.
      setBulkStep("result");
    }catch(err){
      setBulkError(tr("אין חיבור. ההודעה לא נשלחה, אפשר לנסות שוב")); setBulkStep("confirm");
    }
  };

  const handleConvertLead = (lead) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("המרת פנייה ללקוחה"),
      message: tr("להמיר את {0} ללקוחה רשומה?", [lead.name]),
      confirmText: tr("המרה"),
      onConfirm: async () => {
        // The tenant is derived HERE, in this function.
        //
        // tenantField is not a component-level variable - handleSave,
        // importServices and importAppointments each declare their own local
        // copy. Spreading `...tenantField` here without declaring it threw
        // ReferenceError inside this async callback, where nothing awaited it:
        // the dialog opened, the confirm did nothing, no client appeared and no
        // error surfaced. tsc passes that happily, because it does not resolve
        // identifiers in a .jsx file.
        //
        // Same fallback chain as the other three, and the same omit-rather-
        // than-send-null behaviour so a missing tenant never regresses below
        // the database default.
        const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
        const tid = rpcTenant || settings?.tenant_id || null;
        const tenantField = tid ? { tenant_id: tid } : {};
        console.log(`[convert-lead] TENANT FILTER: tenant_id = ${tid ?? "(omitted — DB default)"} | lead ${lead.id}`);
        const {data:cd,error:ce}=await supabase.from("clients").insert([{name:lead.name,phone:lead.phone||"",skinType:"",notes:`הגיעה מפנייה. מקור: ${sourceLabelHe(lead.source)}`,status:"active",...tenantField}]).select();
        if(ce){handleDbError(ce, "convert lead -> create client"); return;}
        if(!cd||!cd[0]){toast(couldNotHe("להמיר את זה"),"error");return;}
        const {data:ld, error:le}=await supabase.from("leads").update({status:"closed",converted_at:new Date().toISOString(),client_id:cd[0].id}).eq("id",lead.id).select();
        if(le){handleDbError(le, "convert lead -> update lead"); return;}
        setClients(prev=>[...prev,cd[0]]);
        if(ld&&ld[0])setLeads(prev=>prev.map(l=>l.id===lead.id?ld[0]:l));
        setSelectedLead(null);
        // Next step: offer to book her first appointment, pre-filled with the
        // service the lead already told us (service_interest) — no re-entry, and
        // the conversion no longer dead-ends at a toast.
        const nc=cd[0], svcName=lead.service_interest||"";
        toast(tr("{0} הומרה ללקוחה", [lead.name]), "success", { label:tr("קבעי תור"), onClick:()=>{
          const svc=activeServices.find(s=>s.name===svcName);
          setEditingAppointmentId(null);
          setNewAppt({clientId:nc.id,name:nc.name,service:svc?.name||svcName||"",duration:svc?.duration||60,date:formatDate(nextOpenDay(settings)),hour:settings.working_hours_start,price:svc?.price||0});
          setApptNote("");setShowModal(true);
        }});
      },
    });
  };

  // The follow-up date, same treatment as the status chips above and for the
  // same reason - it is the other silent write in the lead drawer. A date
  // picker is worse off than a chip, in fact: the field shows the new date the
  // moment it is picked whether or not anything was saved, so there was no
  // signal at all to distinguish a successful write from a failed one.
  const handleSetReminder = async (lead,date) => {
    if (guardWrite()) return;
    if (isBusy("leadReminder")) return;
    const prevDate = lead.reminder_date || "";
    if (date === prevDate) return;
    const applyDate = (d) => {
      setLeads(prev => prev.map(l => l.id === lead.id ? {...l, reminder_date:d} : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? {...prev, reminder_date:d} : prev);
    };
    applyDate(date);
    setBusyKey("leadReminder", true);
    try {
      const {data,error}=await supabase.from("leads").update({reminder_date:date}).eq("id",lead.id).select();
      if(error){ applyDate(prevDate); handleDbError(error, "set reminder"); return; }
      if(!data||!data[0]){ applyDate(prevDate); toast(couldNotHe("לשמור את התזכורת"),"error"); return; }
      const row = data[0];
      setLeads(prev => prev.map(l => l.id === lead.id ? row : l));
      setSelectedLead(prev => prev && prev.id === lead.id ? row : prev);
      // Clearing the field is a real action and gets its own confirmation.
      toast(date ? tr("תזכורת מעקב נקבעה ל-{0}", [date]) : tr("תזכורת המעקב בוטלה"));
    } finally {
      setBusyKey("leadReminder", false);
    }
  };

  const handleUploadImage = async (e,client) => {
    if (guardWrite()) return;
    const file=e.target.files[0];if(!file)return;
    if(!/^image\//.test(file.type||"")){toast(tr("קובץ תמונה בלבד"),"error");return;}
    if(file.size>MAX_SOURCE_BYTES){toast(TOO_LARGE_SOURCE_HE,"error");return;}
    setUploading(true);
    try {
      const tid=settings?.tenant_id;
      if(!tid){toast(STUCK_HE,"error");return;}
      // Resized like every other photo: this used to send the original (several MB from a phone camera, and a HEIC
      // no browser can show), named after the phone's file name, which can carry characters a storage key refuses.
      const blob=await resizeImage(file,IMAGE_PRESETS.gallery);
      const why=notUploadable(blob);
      if(why){toast(why,"error");return;}
      // Tenant-scoped, private path. We store the PATH (not a URL); display
      // resolves a signed URL on demand via <SignedImage>.
      const fileName=clientImagePath(tid,client.id,`${Date.now()}.${/png/i.test(blob.type)?"png":"jpg"}`);
      const {error:ue}=await supabase.storage.from(PRIVATE_BUCKET).upload(fileName,blob,{contentType:blob.type||"image/jpeg"});
      if(ue){handleDbError(ue, "upload image"); return;}
      const newImages=[...(client.images||[]),fileName];
      const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
      if(error){handleDbError(error, "save image url"); return;}
      if(!data||!data[0]){
        // The file uploaded but the row did not take it. Clean the orphan up
        // rather than leaving a paid-for object nothing points at.
        await supabase.storage.from(PRIVATE_BUCKET).remove([fileName]);
        toast(tr("התמונה לא נשמרה בכרטיס, נסי שוב"),"error");
        return;
      }
      setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);
      toast(tr("התמונה הועלתה"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = (client,imageUrl) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("מחיקת תמונה"),
      message: tr("למחוק את התמונה?"),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const newImages=(client.images||[]).filter(img=>img!==imageUrl);
        // Row first, then the object. The other order can leave the card
        // pointing at a file that is already gone.
        const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
        if(error){handleDbError(error, "delete image"); return;}
        if(!data||!data[0]){ toast(tr("המחיקה לא נשמרה, נסי שוב"),"error"); return; }
        setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);
        // Through toStoragePath, which normalises both shapes the column
        // holds: bare paths written since the private-bucket move, and full
        // URLs from before it. .remove() takes paths, so passing the raw value
        // would delete nothing for every older row while reporting success.
        const path = toStoragePath(imageUrl);
        if (path) {
          const { error: re } = await supabase.storage.from(PRIVATE_BUCKET).remove([path]);
          if (re) { toast(tr("התמונה הוסרה מהכרטיס, אך הקובץ נשאר בשרת"),"error"); return; }
        }
        toast(tr("התמונה נמחקה"));
      },
    });
  };

  // Resize in the browser, then upload. Every branding image used to go into
  // the bucket exactly as shot: a 4032x3024 phone photo, three megabytes,
  // served at full size to every visitor of her booking page over their mobile
  // data as the first thing that has to paint. lib/imageResize has the per-
  // asset presets and the reasons behind each one - notably that a logo stays
  // PNG, because flattening a transparent logo onto white JPEG gives her a
  // white rectangle everywhere the page is not white.
  //
  // The check on the picked file (MAX_SOURCE_BYTES, 25 MB) is an INPUT guard: it is about what her phone can
  // decode without falling over, not about what leaves it. What leaves it is checked after resizing
  // (notUploadable). It was 3 MB until 2026-10-18 and refused ordinary phone photos.
  const uploadOne = async (file, preset, tid, name) => {
    const blob = await resizeImage(file, preset);
    // resizeImage fails open; a phone that could not decode the photo must not send the 20 MB original.
    const why = notUploadable(blob, { allowSvg: preset === IMAGE_PRESETS.logo });
    if (why) { toast(why, "error"); return { error: null, skipped: true }; }
    const ext = preset.type === "image/png" ? "png" : (/svg/i.test(file.type) ? "svg" : "jpg");
    const path = `${tid}/branding/${name}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: blob.type || preset.type, cacheControl: "31536000" });
    if (error) return { error };
    return { url: supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || "" };
  };

  // Upload a public branding asset to the PUBLIC bucket under the clinic's OWN
  // tenant folder ("<tenant>/branding/…"), so one clinic can never write into
  // another's path. Stores the public URL in editSettings.branding (persisted
  // on Save).
  const uploadBrandAsset = async (file, key) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading(key);
    try {
      const preset = key === "logo_url" ? IMAGE_PRESETS.logo
        : key === "portrait_url" ? IMAGE_PRESETS.portrait
        : IMAGE_PRESETS.hero;
      const main = await uploadOne(file, preset, tid, key);
      if (main.error) { handleDbError(main.error, "upload brand asset"); return; }
      if (main.skipped || !main.url) return; // too large even after resizing: uploadOne already said so
      const patch = { [key]: main.url };

      // THE PORTRAIT IS ALSO THE LINK PREVIEW, so it is stored twice: once as
      // she sees it on the page, and once cropped to the 1200x630 every
      // unfurler is built around. Derived at upload rather than on demand
      // because there is nowhere to derive it later - the page is static and
      // the preview is fetched by WhatsApp, not by us.
      if (key === "portrait_url") {
        const og = await uploadOne(file, IMAGE_PRESETS.portraitOg, tid, "portrait_og");
        // A failed derivative costs the link preview, not the portrait. Keep
        // the photo she just uploaded rather than failing the whole action.
        if (!og.error && og.url) patch.portrait_og_url = og.url;
      }

      setEditSettings(prev=>({...prev, branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}), ...patch }}));
      toast(tr("התמונה הועלתה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  // Upload one gallery image and APPEND its public URL to branding.gallery (an
  // array), same tenant-scoped path rules as uploadBrandAsset. The public /book
  // page renders these as a Google-style photo grid.
  // Same shape as the gallery upload, into branding.clinic_photos, capped at 3:
  // atmosphere shots of the room, not the work.
  const uploadClinicPhoto = async (file) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("clinic");
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "clinic");
      if(up.error){ handleDbError(up.error, "upload clinic photo"); return; }
      if(up.skipped) return;
      const url = up.url;
      if(url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const ph=Array.isArray(b.clinic_photos)?b.clinic_photos:[]; if(ph.length>=3){ toast(tr("עד 3 תמונות של העסק"),"error"); return prev; } return {...prev, branding:{...b, clinic_photos:[...ph, url]}}; });
      toast(tr("התמונה נוספה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  // Her own photo for one treatment card on the public page. Stored in
  // branding.service_images keyed by service id, so no migration and no column:
  // a service without an entry wears the default for its name.
  const uploadServicePhoto = async (serviceId, file) => {
    if(!file || !serviceId) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("svc:"+serviceId);
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "service");
      if(up.error){ handleDbError(up.error, "upload service photo"); return; }
      if(up.skipped) return;
      if(up.url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const m=(b.service_images&&typeof b.service_images==="object"&&!Array.isArray(b.service_images))?b.service_images:{}; return {...prev, branding:{...b, service_images:{...m,[serviceId]:up.url}}}; });
      toast(tr("התמונה נוספה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  const uploadGalleryImage = async (file) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("gallery");
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "gallery");
      if(up.error){ handleDbError(up.error, "upload gallery image"); return; }
      if(up.skipped) return;
      const url = up.url;
      if(url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const gal=Array.isArray(b.gallery)?b.gallery:[]; return {...prev, branding:{...b, gallery:[...gal, url]}}; });
      toast(tr("התמונה נוספה לגלריה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  const handleSendForm = (client,formType) => runOnce(`sendForm:${client.id}:${formType}`, () => sendFormNow(client, formType));
  const sendFormNow = async (client,formType) => {
    if (guardWrite()) return;
    const {data,error}=await supabase.from("forms").insert([{client_id:client.id,client_name:client.name,form_type:formType,status:"pending"}]).select();
    if(error){handleDbError(error, "create form"); return;}
    if(!data||!data[0]){toast(couldNotHe("ליצור את הטופס"),"error");return;}
    setForms(prev=>[...prev,data[0]]);
    const link=`${origin}/form?id=${data[0].id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(tr("הקישור הועתק, מוכן לשליחה"));
    } catch {
      toast(tr("הקישור: {0}", [link]), "info");
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
  // Write every service change the draft is holding: deletes, then inserts,
  // then updates. Returns a plain report rather than throwing, because the
  // settings row has already been written by the time this runs and "the save
  // half worked" is a thing she needs told, not hidden.
  //
  // Updates send an explicit patch of the five editable columns, never the
  // whole row: the old per-row save passed `svc` straight to .update(), which
  // meant it also sent id, tenant_id and created_at back to the server on
  // every keystroke-driven save.
  // requires_deposit comes from add_grow_cancellation.sql (hand-run): like `field`, a missing column degrades the save instead of breaking it.
  // buffer_minutes comes from add_service_buffer_2026-11-05.sql (hand-run): same degrade, and she is TOLD it was not kept
  // (bufferPending) rather than shown a save that silently dropped it.
  // rebook_days comes from add_service_rebook_days_2026-11-09.sql (hand-run): the field is disabled until it has run, and a save
  // that still meets the missing column drops only that column (the nudge then uses the automatic interval).
  // intake (lib/intakeGate.ts) comes from add_reschedule_intake_2026-11-09.sql (hand-run): the setting is hidden until it has run.
  const SERVICE_FIELDS = ["name", "price", "duration", "description", "field", "color", "active", "requires_deposit", "buffer_minutes", "rebook_days", "intake"];
  const commitServiceDraft = async (tid) => {
    // rebook_days is typed freely (typedRebookDays) and only validated here and on blur: clamping each keystroke turned "21" into 71.
    const draft = editServices ? editServices.map(s => (s && Object.prototype.hasOwnProperty.call(s, "rebook_days") ? { ...s, rebook_days: cleanRebookDays(s.rebook_days) } : s)) : editServices;
    if (!draft) return { changed: 0, errors: [], bufferPending: false };
    // A save that failed on a column the database does not have yet: retry without THAT column only (lib/pgError
    // missingColumnName), up to three optional columns. Returns null when the error was not a missing optional column.
    const OPTIONAL_SERVICE_COLS = ["field", "requires_deposit", "buffer_minutes", "rebook_days", "intake"];
    const retryWithoutMissing = async (row, firstError, run) => {
      if (!firstError || !isMissingColumnError(firstError)) return null;
      let cur = { ...row }, err = firstError, result = null;
      const cols = [];
      for (let i = 0; i < OPTIONAL_SERVICE_COLS.length && err && isMissingColumnError(err); i++) {
        const col = missingColumnName(err);
        if (!col || !OPTIONAL_SERVICE_COLS.includes(col) || !(col in cur)) break;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it
        const { [col]: _gone, ...rest } = cur;
        cur = rest; cols.push(col);
        result = await run(cur);
        err = result.error;
      }
      return result ? { result, cols } : null;
    };
    const baseline = new Map(services.map(s => [s.id, s]));
    const errors = [];
    let changed = 0;
    let bufferPending = false;

    for (const s of draft) {
      // 1. Deleted — only rows that exist server-side; a _new row that was
      //    deleted again was dropped from the draft outright.
      if (s._deleted) {
        if (!s.id) continue;
        const { error } = await supabase
          .from("service_prices").delete().eq("id", s.id).eq("tenant_id", tid);
        if (error) { errors.push(`מחיקת ${s.name}`); continue; }
        changed++;
        continue;
      }

      // 2. New — insert. tenant_id is stamped explicitly so the RLS WITH CHECK
      //    passes without relying on a column default.
      if (!s.id) {
        const row = { tenant_id: tid, active: s.active !== false };
        // Only fields the draft actually has. supabase-js lists every key of an inserted array in `columns=`,
        // and PostgREST writes NULL for a listed key with no value instead of the column default: the
        // quick-add row has no requires_deposit, so every "+ הוסיפי שירות" save failed on its NOT NULL
        // (23502), for every business (found 2026-10-24).
        for (const k of SERVICE_FIELDS) if (k !== "active" && s[k] !== undefined) row[k] = s[k];
        let { data, error } = await supabase.from("service_prices").insert([row]).select();
        // field is added by supabase/migrations/add_business_fields.sql,
        // applied by hand and possibly not yet run — degrade rather than
        // break a plain service save for every tenant over one new column.
        // Drop ONLY the column the database says is missing, one at a time, and only from the optional ones; a dropped
        // requires_deposit that she turned on is an error, never a silent save without the deposit.
        const dropped = await retryWithoutMissing(row, error, (r) => supabase.from("service_prices").insert([r]).select());
        if (dropped) ({ data, error } = dropped.result);
        if (dropped?.cols.includes("buffer_minutes") && Number(row.buffer_minutes) > 0) bufferPending = true;
        if (dropped?.cols.includes("requires_deposit") && row.requires_deposit === true) { errors.push(`הפיקדון של ${s.name} לא נשמר`); }
        if (error || !data || !data[0]) { errors.push(`הוספת ${s.name}`); continue; }
        changed++;
        continue;
      }

      // 3. Existing — update only what actually differs.
      const base = baseline.get(s.id);
      if (!base) continue;
      const patch = {};
      for (const k of SERVICE_FIELDS) {
        const a = k === "active" ? s[k] !== false : s[k];
        const b = k === "active" ? base[k] !== false : base[k];
        if (a !== b) patch[k] = a;
      }
      if (Object.keys(patch).length === 0) continue;
      let { data, error } = await supabase
        .from("service_prices").update(patch).eq("id", s.id).select();
      {
        const dropped = await retryWithoutMissing(patch, error, (r) => supabase.from("service_prices").update(r).eq("id", s.id).select());
        if (dropped) ({ data, error } = dropped.result);
        if (dropped?.cols.includes("buffer_minutes")) bufferPending = true;
        if (dropped?.cols.includes("requires_deposit") && patch.requires_deposit === true) { errors.push(`הפיקדון של ${s.name} לא נשמר`); }
      }
      if (error || !data || !data[0]) { errors.push(`עדכון ${s.name}`); continue; }
      changed++;
    }

    return { changed, errors, bufferPending };
  };

  // The bar's "שמירה": first the cards with their own save, then the settings draft (only when it changed, so a policy-only change does
  // not also toast "ההגדרות נשמרו"). A card that failed has already said why and keeps its change.
  const saveSettingsPanel = async () => {
    if (isBusy("saveSettings")) return;
    if (pendingCardSaves > 0 && !(await flushPendingSaves())) return;
    if (settingsDirty) await handleSaveSettings();
  };

  const handleSaveSettings = async () => {
    if(isBusy("saveSettings")) return;
    setBusyKey("saveSettings", true);
    try {
      // Resolve the tenant with the SAME function the RLS policies use
      // (get_user_tenant_id). Reading tenant_members directly from the client is
      // itself gated by RLS and frequently returns null - which made tenant_id
      // wrong, the UPDATE miss 0 rows, and the INSERT fail with an empty {} error.
      const { data: rpcTenant, error: rpcErr } = await supabase.rpc("get_user_tenant_id");
      const tenantId = rpcTenant || settings.tenant_id || null;
      if (!tenantId) {
        // Offline, get_user_tenant_id cannot answer, so we can land here with a
        // perfectly valid account. "Log out and back in" is the worst possible
        // advice then: signing out clears the session and she cannot sign back
        // in without a network. Same trap as the load-error screen.
        if (isConnectionError(rpcErr) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          toast(tr("אין חיבור לאינטרנט. ההגדרות לא נשמרו, והפרטים עדיין כאן. נסי שוב כשהחיבור יחזור."), "error");
          return;
        }
        toast(STUCK_HE, "error");
        return;
      }

      // The write goes through the server: app/api/settings/save keeps only
      // the columns in lib/settingsColumns.ts, stamps the tenant from her
      // session, and creates the row when there is none. The browser used to
      // write the whole row back here - which let a tenant set the webhook's
      // instance id, the lead-key hash and the platform's feature flags on her
      // own row - and it logged that whole row to the console on every save.
      // The draft is sent as-is; what the server refuses, it drops and logs.
      let savedRow = null;
      let res;
      try {
        res = await fetch("/api/settings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: editSettings }),
        });
      } catch (netErr) {
        handleDbError(netErr, "update settings");
        return;
      }
      const saveData = await res.json().catch(() => ({}));
      if (!res.ok || !saveData.success) {
        // A refused Google review link: her own words, not a generic database error.
        if (saveData.field === "review_url" && saveData.error) { toast(saveData.error, "error"); return; }
        handleDbError({ message: saveData.error || `HTTP ${res.status}` }, "update settings");
        return;
      }
      savedRow = saveData.settings || null;
      if (!savedRow) {
        // Both paths returned 0 rows - this is an RLS / permissions problem,
        // not a success. Tell the truth instead of toasting "saved".
        toast(tr("השמירה נכשלה, אין הרשאה לעדכן את ההגדרות. אפשר להתנתק ולהתחבר שוב."), "error");
        return;
      }
      setSettings(savedRow);

      // The services live in a different table, but she pressed one button and
      // means one thing by it. Commit the service draft in the same action.
      // An account on hold cannot write services (the database refuses); say why, instead of "some services failed: update X".
      if (readOnly && editServices && JSON.stringify(editServices) !== JSON.stringify(services)) {
        toast(tr("ההגדרות נשמרו, אבל את השירותים אי אפשר לשנות כרגע. {0}", [WRITE_BLOCKED_TOAST_HE]), "error");
        return;
      }
      const { changed, errors, bufferPending } = await commitServiceDraft(tenantId);

      // Re-read rather than patching state from the responses: the draft may
      // have inserted, updated and deleted in one pass, and one query is the
      // only version of "what is actually there now" that cannot drift.
      if (changed > 0) {
        const { data: fresh, error: refetchErr } = await supabase.from("service_prices").select("*").eq("tenant_id", tenantId);
        if (!refetchErr && fresh) setServices(fresh);
      }

      if (errors.length > 0) {
        // Half a save is not a save. Say which part failed, leave the panel
        // open with the draft intact so nothing she typed is lost, and do not
        // toast success over the top of it.
        const { data: fresh } = await supabase.from("service_prices").select("*").eq("tenant_id", tenantId);
        if (fresh) {
          setServices(fresh);
          setEditServices(fresh.map(sv => ({ ...sv })));
        }
        toast(tr("ההגדרות נשמרו, אבל חלק מהשירותים לא: {0}", [errors.join(", ")]), "error");
        return;
      }

      setEditSettings(null);
      setEditServices(null);
      setShowNewService(false);
      setShowTemplatePicker(false);
      setTemplatePicks([]);
      toast((changed > 0 ? `ההגדרות נשמרו · ${changed} שינויים בשירותים` : "ההגדרות נשמרו") + (bufferPending ? `. ${SERVICE_BUFFER_PENDING_HE}` : ""), bufferPending ? "info" : undefined);
    } finally {
      setBusyKey("saveSettings", false);
    }
  };

  // ── The service list is a DRAFT ────────────────────────────────────────────
  //
  // Everything below edits editServices and nothing else. The single save
  // button at the bottom of Settings is the only thing that writes to
  // service_prices — see commitServiceDraft, called from handleSaveSettings.
  //
  // The per-row ✓ that used to live here is gone. It wrote immediately while
  // the button underneath it did not, which meant the panel had two saves with
  // different scopes and no way to tell which had committed what. It also had
  // a bug worth recording: it was wrapped in `if (svc.id)`, so on a row with no
  // id yet it did nothing at all — no write, no toast, no error. The batch
  // commit handles both cases explicitly instead: a row with an id is updated,
  // a row without one is inserted.

  const patchDraftService = (idx, patch) =>
    setEditServices(prev => (prev || []).map((s, i) => i === idx ? { ...s, ...patch } : s));

  // Archive / restore. The treatment stays in every past appointment and
  // receipt either way — those store its name as text, never a reference to
  // this row — so this only decides whether it is offered from now on.
  const toggleDraftServiceActive = (idx) =>
    setEditServices(prev => (prev || []).map((s, i) =>
      i === idx ? { ...s, active: s.active === false } : s));

  // Permanent delete — allowed ONLY when nothing references the service.
  //
  // The reference check still runs the moment she taps, because it is a READ
  // and instant feedback is the whole value of it: "this is in 3 appointments,
  // archive it instead" is useless an hour later at save time. Only the delete
  // itself is deferred, by marking the row and letting the save carry it out.
  //
  // The check runs against the DATABASE, not the arrays in local state — those
  // hold whatever this session happened to load, and "looks unreferenced from
  // here" is not the same claim as "is unreferenced". Matching is by name
  // because that is how history stores it; there is no service_id anywhere.
  const handleDeleteService = async (svc, idx) => {
    if (guardWrite()) return;
    if (isBusy("deleteService")) return;

    // A row she added in this session and has not saved yet exists nowhere but
    // the draft. Nothing can reference it, so there is nothing to check.
    if (!svc.id) {
      setEditServices(prev => (prev || []).filter((_, i) => i !== idx));
      return;
    }

    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    if (!tid) { toast(tr("לא זוהה עסק, נסי לרענן"), "error"); return; }

    setBusyKey("deleteService", true);
    try {
      // Every count is tenant-filtered as well as name-filtered.
      const checks = [
        ["appointments", "service",          "תורים"],
        ["receipts",     "service",          "תשלומים"],
        ["packages",     "service",          "חבילות"],
        ["leads",        "service_interest", "פניות"],
      ];
      const results = await Promise.all(
        checks.map(([table, col]) =>
          supabase.from(table).select("id", { count: "exact", head: true })
            .eq("tenant_id", tid).eq(col, svc.name)
        )
      );
      const failed = results.find(r => r.error);
      if (failed) { handleDbError(failed.error, "check service references"); return; }

      const used = results
        .map((r, i) => ({ label: checks[i][2], n: r.count || 0 }))
        .filter(x => x.n > 0);

      if (used.length > 0) {
        // Not a dead end — say what is holding it and what she can do instead.
        toast(
          tr("אי אפשר למחוק: השירות מופיע ב־{0}. אפשר להעביר אותו לארכיון במקום.", [used.map(u=>`${u.n} ${u.label}`).join(", ")]),
          "error"
        );
        return;
      }

      setEditServices(prev => (prev || []).map((s, i) =>
        i === idx ? { ...s, _deleted: true } : s));
    } finally {
      setBusyKey("deleteService", false);
    }
  };

  const undeleteDraftService = (idx) =>
    setEditServices(prev => (prev || []).map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s }; delete next._deleted; return next;
    }));

  // Add a typed row to the draft. Nothing is written here.
  const handleAddService = () => {
    if (guardWrite()) return;
    if (!newService.name.trim()) { toast(tr("איך נקרא השירות? חסר שם"), "error"); return; }
    if (!(Number(newService.price) >= 0)) { toast(tr("המחיר לא יכול להיות שלילי"), "error"); return; }
    if (!(Number(newService.duration) >= 5 && Number(newService.duration) <= 600)) { toast(tr("משך הטיפול צריך להיות בין 5 ל-600 דקות"), "error"); return; }
    const name = newService.name.trim();
    const clash = (editServices || []).some(s => !s._deleted && (s.name || "").trim() === name);
    if (clash) { toast(tr("כבר יש שירות בשם הזה"), "error"); return; }
    // A hand-typed service has no seed group to inherit `field` from (see
    // lib/defaultImages.js's header on why that matters). If she picked one
    // in the selector, keep it; otherwise default to her one active field —
    // with two active fields there is no safe guess, so it stays unset and
    // she can fix it in the row afterwards.
    const oneField = businessFieldsOf(settings).length === 1 ? businessFieldsOf(settings)[0] : null;
    const field = newService.field || oneField;
    setEditServices(prev => [...(prev || []), { ...newService, name, field, _new: true }]);
    setNewService({ name: "", price: 0, duration: 60, color: DEFAULT_SERVICE_COLOR, active: true });
    setShowNewService(false);
  };

  // Add the treatments she ticked in the suggested-menu picker.
  //
  // The same picker onboarding uses, mounted here so that skipping it at signup
  // is not a one-time door: a cosmetician who built her list by hand in March
  // can still open it in June to top up. Everything it adds is an ordinary row
  // of hers — there is no link back to the template, so a seeded treatment
  // renames, reprices and archives exactly like a typed one.
  //
  // Onboarding still inserts directly through insertPickedServices, because
  // there is no draft there: that screen has its own explicit finish step.
  const handleAddTemplateServices = () => {
    if (guardWrite()) return;
    if (templatePicks.length === 0) { toast(tr("לא סימנת אף טיפול"), "error"); return; }
    const existing = new Set((editServices || []).filter(s => !s._deleted).map(s => (s.name || "").trim()));
    const fresh = [];
    let skipped = 0;
    for (const pick of templatePicks) {
      const name = (pick.name || "").trim();
      if (!name || existing.has(name)) { skipped++; continue; }
      existing.add(name);
      fresh.push({
        name,
        price: pick.price,
        duration: pick.duration,
        field: pick.field || null,
        color: pick.color || DEFAULT_SERVICE_COLOR,
        active: true,
        _new: true,
      });
    }
    if (fresh.length) setEditServices(prev => [...(prev || []), ...fresh]);
    setTemplatePicks([]);
    setShowTemplatePicker(false);
    toast(
      skipped > 0
        ? tr("{0} טיפולים נוספו · {1} כבר היו ברשימה, לחצי שמירה", [fresh.length, skipped])
        : tr("{0} טיפולים נוספו, לחצי שמירה", [fresh.length])
    );
  };

  // A void counts as complete (leaves the totals) only once its credit document exists.
  const isVoidComplete = (r) => !!r && voidedIds(receiptVoids).has(String(r.id));

  // Ask her provider to issue the legal document for a payment. The payment is ALREADY
  // recorded: this never blocks or undoes it, and any failure leaves a visible state.
  // Returns the server's answer, or null when there is nothing to do.
  const applyReceiptPatch = (id, patch) => {
    setReceipts(prev => prev.map(r => String(r.id) === String(id) ? { ...r, ...patch } : r));
    setShowReceipt(prev => prev && String(prev.id) === String(id) ? { ...prev, ...patch } : prev);
  };
  const issueLegalDocument = async (rec, { confirmUnknown = false } = {}) => {
    if (!legalAccount?.connected || !rec?.id || !needsLegalDoc(rec)) return null;
    applyReceiptPatch(rec.id, { legal_status: "pending" });
    try {
      const res = await fetch("/api/legal-receipts/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: rec.id, confirmUnknown }) });
      const d = await res.json().catch(() => null);
      if (!d) throw new Error("no answer");
      if (d.receipt) applyReceiptPatch(rec.id, d.receipt);
      else applyReceiptPatch(rec.id, { legal_status: d.status && d.status !== "none" ? d.status : (rec.legal_status || "none") });
      if (d.status === "issued" && !d.already) toast(docLabelHe({ legal_status: "issued", legal_doc_type: d.receipt?.legal_doc_type }) + (d.number ? " מספר " + d.number : "") + " הונפקה ✦");
      else if (d.error) toast(d.error + " התשלום נשמר.", "error");
      else if (d.skipped === "migration_missing") { console.error("[legal receipt] migration missing: add_legal_receipts.sql"); toast(tr("הנפקת מסמכי מס עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error"); }
      return d;
    } catch {
      // The browser did not hear back, but the server may have called the provider. Say so; the record shows the truth on reload.
      toast(tr("לא קיבלנו תשובה. התשלום נשמר; מצב המסמך יתעדכן בעוד רגע."), "error");
      return null;
    }
  };
  const retryLegal = (rec) => {
    if (isBusy("legalIssue")) return;
    const go = async (confirmUnknown) => {
      setBusyKey("legalIssue", true);
      try { await issueLegalDocument(rec, { confirmUnknown }); } finally { setBusyKey("legalIssue", false); }
    };
    if (rec.legal_status === "unknown") {
      askConfirm({
        title: tr("לבדוק לפני שמנסים שוב"),
        message: tr("לא בטוחות אם המסמך הונפק. פתחי את חשבון מורנינג ובדקי שאין שם מסמך לתשלום הזה. אם אין, אפשר לנסות שוב. אם יש, אל תנסי שוב, כדי שלא יונפקו שני מסמכים."),
        confirmText: tr("בדקתי, אין מסמך"),
        onConfirm: () => go(true),
      });
      return;
    }
    go(false);
  };
  // The credit document for a void of a payment that has a provider document.
  const requestCredit = async (vd, { confirmUnknown = false } = {}) => {
    try {
      const res = await fetch("/api/legal-receipts/credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voidId: vd.id, confirmUnknown }) });
      const d = await res.json().catch(() => null);
      if (!d) throw new Error("no answer");
      if (d.void) setReceiptVoids(prev => prev.map(v => String(v.id) === String(vd.id) ? { ...v, ...d.void } : v));
      return d;
    } catch { return null; }
  };
  const retryCredit = (vd) => {
    if (isBusy("legalCredit")) return;
    const go = async (confirmUnknown) => {
      setBusyKey("legalCredit", true);
      try {
        const d = await requestCredit(vd, { confirmUnknown });
        if (d && d.status === "issued") toast(tr("מסמך הזיכוי הונפק ✦"));
        else toast((d && d.error) || tr("לא הצלחנו להנפיק את מסמך הזיכוי. התשלום ממשיך להיספר."), "error");
      } finally { setBusyKey("legalCredit", false); }
    };
    if (vd.credit_status === "unknown") {
      askConfirm({
        title: tr("לבדוק לפני שמנסים שוב"),
        message: tr("לא בטוחות אם מסמך הזיכוי הונפק. בדקי בחשבון מורנינג שאין שם מסמך זיכוי לתשלום הזה. אם אין, אפשר לנסות שוב."),
        confirmText: tr("בדקתי, אין מסמך"),
        onConfirm: () => go(true),
      });
      return;
    }
    go(false);
  };
  // What follows a recorded payment. With a connected account the legal document comes FIRST
  // (in the background) so the message to the client can carry its link; without one, exactly as before.
  const afterPaymentRecorded = (rec, { autoSend }) => {
    (async () => {
      let cur = rec;
      const d = await issueLegalDocument(rec);
      if (d && d.receipt) cur = { ...rec, ...d.receipt };
      if (autoSend) {
        const ok = await sendReceiptToClient(cur, { silent: true }).catch(() => false);
        if (!ok) toast(tr("התשלום נרשם, אבל השליחה האוטומטית נכשלה. אפשר לשלוח ידנית מהאישור"), "error");
      }
    })();
  };

  // The voided Grow sales she can see (newest first, at most 100): their refund state is asked for whenever this set changes.
  const growVoidedKey = useMemo(() => {
    const v = voidedIds(receiptVoids);
    return receipts.filter(r => r.legal_provider === "grow" && v.has(String(r.id)))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 100).map(r => String(r.id)).join(",");
  }, [receipts, receiptVoids]);
  // When a refund POST last answered for each receipt: a history GET that started before it never overwrites that newer answer.
  const growRefundAnsweredAt = useRef({});
  const loadGrowRefundStates = useCallback(async (key) => {
    if (!key) { setGrowRefundStates({}); return; }
    const startedAt = Date.now();
    try {
      const res = await fetch(`/api/grow/void-refund?ids=${encodeURIComponent(key)}`);
      const j = await res.json().catch(() => null);
      if (j && j.states && !j.hidden) {
        const fresh = Object.fromEntries(Object.entries(j.states).filter(([id]) => !((growRefundAnsweredAt.current[id] || 0) >= startedAt)));
        setGrowRefundStates(prev => ({ ...prev, ...fresh }));
      }
    } catch { /* the history shows no refund line rather than a wrong one */ }
  }, []);
  useEffect(() => { loadGrowRefundStates(growVoidedKey); }, [growVoidedKey, loadGrowRefundStates]);
  // The answer of POST /api/grow/void-refund, applied to the till: the receipt's note line and the refund state shown in the history.
  const applyGrowRefundAnswer = (receiptId, answer) => {
    growRefundAnsweredAt.current[String(receiptId)] = Date.now();
    if (answer && answer.note) {
      const note = answer.note;
      setReceipts(prev => prev.map(r => String(r.id) === String(receiptId) ? { ...r, note } : r));
      setShowReceipt(prev => prev && String(prev.id) === String(receiptId) ? { ...prev, note } : prev);
    }
    setGrowRefundStates(prev => ({ ...prev, [String(receiptId)]: stateFromVoidRefundAnswer(answer) }));
  };
  // The refund line of a voided Grow sale (the till history row and the receipt). Nothing for any other receipt.
  const growRefundLine = (r, where) => {
    const st = r && r.legal_provider === "grow" ? growRefundStates[String(r.id)] : null;
    if (!st || !REFUND_STATE_HE[st.state]) return null;
    const color = st.state === "refunded" ? "var(--success)" : st.state === "failed" ? "var(--danger)" : st.state === "in_progress" ? "var(--warning)" : "var(--ink-3)";
    return (
 <div data-testid="grow-refund-state" data-state={st.state} style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:where==="row"?3:8}}>
 <span style={{fontSize:"var(--t-xs)",fontWeight:700,color,lineHeight:1.5}}>{trv(REFUND_STATE_HE[st.state])}{st.state==="in_progress"&&st.stuck?`. ${REFUND_STUCK_HE}`:""}</span>
        {st.state==="failed"&&st.canRetry&&<button data-testid="grow-refund-retry" onClick={e=>{e.stopPropagation();retryGrowRefund(r);}} disabled={isBusy("growRefundRetry")} className="primary-btn" style={{padding:"6px 12px",minHeight:36,fontSize:"var(--t-xs)",background:"var(--surface)",color:"var(--danger)",border:"1px solid var(--danger)"}}>{isBusy("growRefundRetry")?<Spinner inline label={tr("מנסה")}/>:tr("לנסות שוב להחזיר ב-Grow")}</button>}
 </div>
    );
  };
  // "לנסות שוב" on a failed refund: the same route and the same once-per-payment claim, so a retry can never refund twice.
  const retryGrowRefund = async (receipt) => {
    if (!receipt || guardWrite()) return;
    await runOnce("growRefundRetry", async () => {
      setBusyKey("growRefundRetry", true);
      let answer = null;
      try {
        const res = await fetch("/api/grow/void-refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: receipt.id }) });
        answer = await res.json().catch(() => null);
      } catch { answer = null; }
      finally { setBusyKey("growRefundRetry", false); }
      // As on the void itself: "hidden" is a known no-send; a lost answer may hide a done refund, so "check Grow first".
      if (answer && answer.hidden) answer = { ...answer, refunded: false, status: "failed", message: VOID_REFUND_HE.failed("") };
      else if (!answer || !answer.message) answer = { refunded: false, status: "unknown", message: VOID_REFUND_HE.unknown };
      applyGrowRefundAnswer(receipt.id, answer);
      if (answer.refunded || answer.status === "already_refunded") toast(answer.message);
      else toast(answer.message, "error");
    });
  };

  // Void: a row in receipt_voids naming the receipt and why. The receipt row
  // is not touched. The reason is required by the schema as well as the form.
  const growVoidOk = useRef(false);
  const handleVoidReceipt = async (receipt) => {
    if (guardWrite()) return;
    if (!receipt || !voidReason.trim()) { toast(tr("כתבי בקצרה למה מבטלים, זה נשמר ברישום"), "error"); return; }
    // A card payment taken through Grow is not undone by a void alone: the charge and Grow's own document stay.
    // With the refund unticked, say so first, so the books and the bank do not quietly disagree.
    // With the refund ticked (the default) the void sheet already says the money goes back, so there is nothing to confirm.
    const paidByGrow = receipt.legal_provider === "grow";
    const refundAtGrow = paidByGrow && voidGrowRefund;
    if (paidByGrow && !refundAtGrow && !growVoidOk.current) {
      askConfirm({
        title: tr("התשלום נגבה דרך Grow"),
        message: tr("ביטול כאן לא מחזיר את הכסף ללקוחה ולא מבטל את המסמך של Grow. את הזיכוי עושים בחשבון Grow. לבטל רק ברישום שלך?"),
        confirmText: tr("לבטל ברישום שלי"),
        onConfirm: () => { growVoidOk.current = true; Promise.resolve(handleVoidReceipt(receipt)).finally(() => { growVoidOk.current = false; }); },
      });
      return;
    }
    if (isBusy("voidReceipt")) return;
    setBusyKey("voidReceipt", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      // A payment that HAS a provider document is only truly cancelled by a credit document.
      // The request is recorded now, so it survives a dropped connection; the server turns it into the document.
      const legal = receipt.legal_status === "issued" && !!receipt.legal_doc_id;
      const { data, error } = await supabase.from("receipt_voids").insert([{
        receipt_id: receipt.id,
        reason: voidReason.trim(),
        ...(legal ? { credit_status: "pending_request" } : {}),
        ...(tid ? { tenant_id: tid } : {}),
      }]).select();
      if (error) {
        // 42P01: the table is not there yet. Say so rather than "error".
        if (error.code === "42P01" || /receipt_voids/.test(String(error.message||""))) {
          console.error("[voidReceipt] migration missing: add_till_and_calendar_small_things.sql", error);
          toast(tr("האפשרות הזו עדיין לא זמינה אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותה."), "error");
          return;
        }
        if (error.code === "23505") { toast(tr("התשלום כבר מבוטל"), "error"); return; }
        handleDbError(error, "void receipt"); return;
      }
      if (data && data[0]) setReceiptVoids(prev => [...prev, data[0]]);
      // Products on the voided receipt go back to stock, once (the database refuses a second time).
      if (data && data[0]) productsApi.afterVoid(receipt);
      // A gift voucher that paid this sale gets its amount back (app/api/vouchers reverse_receipt). It stayed spent before.
      let voucherBack = 0;
      if (data && data[0] && paidByVoucher(receipt)) {
        try {
          const vr = await fetch("/api/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse_receipt", receiptId: receipt.id }) }).then((r) => r.json()).catch(() => null);
          if (vr && vr.returned > 0) voucherBack = vr.returned;
          else if (!vr || vr.success === false) toast(tr("התשלום בוטל, אבל הסכום עוד לא חזר לשובר. אפשר לנסות שוב ממסך שוברי המתנה, או לכתוב לנו."), "error");
        } catch { /* the void itself stands; the message above covers a refusal */ }
      }
      // The void is saved and stands whatever Grow answers. Only now is the refund asked for (app/api/grow/void-refund).
      let growRefund = null;
      if (refundAtGrow && data && data[0]) {
        try {
          const res = await fetch("/api/grow/void-refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: receipt.id }) });
          growRefund = await res.json().catch(() => null);
        } catch { growRefund = null; }
        // "hidden" (Grow off): a known no-send, the route wrote "not done" and alerted. A lost answer may hide a done refund: "check Grow first".
        if (growRefund && growRefund.hidden) growRefund = { ...growRefund, refunded: false, status: "failed", message: VOID_REFUND_HE.failed("") };
        else if (!growRefund || !growRefund.message) growRefund = { refunded: false, status: "unknown", message: VOID_REFUND_HE.unknown };
        applyGrowRefundAnswer(receipt.id, growRefund);
      }
      setVoidOpen(false); setVoidReason("");
      // A loyalty reward given on this sale comes back to her client's card by itself (lib/loyalty.js loyaltyState drops a
      // voided receipt's redemption). Said out loud, so she does not think the gift is gone or re-add the stamps by hand.
      const rewardBack = loyaltyCfg.enabled && rewardGivenOn(receipt, loyaltyDb.redemptions) ? ". המתנה חזרה לכרטיסיית הנאמנות של הלקוחה" : "";
      if (growRefund) {
        // A Grow payment's document is Grow's own (no legal_doc_id), so this is normally false; kept so a credit request is never skipped.
        if (legal && data && data[0]) await requestCredit(data[0]);
        // Refused or unanswered: an error toast, which stays until she taps it, sending her to Grow's dashboard.
        const extra = (voucherBack > 0 ? ` ₪${voucherBack} חזרו לשובר המתנה.` : "") + (rewardBack ? ` ${rewardBack.replace(/^\.\s*/, "")}.` : "");
        if (growRefund.refunded || growRefund.status === "already_refunded") toast(growRefund.message + extra);
        else toast(growRefund.message, "error");
      } else if (legal && data && data[0]) {
        const d = await requestCredit(data[0]);
        if (d && d.status === "issued") toast("מסמך זיכוי מספר " + (d.number || "") + " הונפק, והתשלום ירד מהסיכומים" + rewardBack + " ✦");
        else toast(((d && d.error) || "מסמך הזיכוי עוד לא הונפק") + " התשלום ממשיך להיספר עד שהוא יונפק.", "error");
      } else {
        toast("התשלום בוטל, המקור נשמר, והסכום ירד מהסיכומים" + (voucherBack > 0 ? `. ₪${voucherBack} חזרו לשובר המתנה` : "") + rewardBack);
      }
    } finally { setBusyKey("voidReceipt", false); }
  };

  const dupPayOk = useRef(false);
  const handleOpenCashier = (appt) => {
    dupPayOk.current = false;
    setCashierAppt(appt||null);
    if(appt){
      const client=clients.find(c=>String(c.id)===String(appt.client_id));
      setCashierClient(client||null);setCashierSearch(client?.name||"");
      const svc=activeServices.find(s=>s.name===appt.service);
      setCashierItems([{id:Date.now(),name:appt.service,price:svc?.price||appt.price||0,qty:1,color:svc?.color||DEFAULT_SERVICE_COLOR}]);
    }else{setCashierClient(null);setCashierSearch("");setCashierItems([]);}
    setPaymentMethod(favoritePaymentMethod);setCashierAllServices(false);setCashierExtrasOpen(false);setCashierDiscount(0);setCashierDiscountMode("ils");setCashierTip(0);setSplitOn(false);setSplitLines([{method:"ביט",amount:0},{method:"מזומן",amount:0}]);setCashierNote("");setDrawFromPackage(false);setMembershipAdj(null);setGrowAdj({deposit:0,creditAvail:0,creditOn:false});setLoyaltyApplied(null);setShowCashier(true);
    // A loyalty ledger read that failed shows no card at the till (see loyaltyFor): opening the till tries it again.
    if (loyaltyCfg.enabled && loyaltyDb.ready === "error") loadLoyaltyRows();
  };

  // Opens the new-appointment modal pre-filled with her first active service.
  // Component-scoped on purpose: it used to be declared inside a closure that
  // only exists while the DASHBOARD tab renders, so the Calendar tab's own
  // empty-state button - which referenced the same bare name - threw
  // ReferenceError the instant appointments.length was 0, i.e. on every
  // single new signup's first visit to her calendar. Invisible on any tenant
  // that already has a booking, which is exactly why it reached production.
  // Today it opens on the next half hour from now inside her hours, not at the day's opening that has long passed (lib/businessHours).
  const openNewAppt = () => {
    const svc = activeServices[0];
    const when = newApptStart(settings, new Date(), svc?.duration || 60);
    setEditingAppointmentId(null);
    setNewAppt({clientId:"",name:"",service:svc?.name||"",duration:svc?.duration||60,date:formatDate(when.date),hour:Math.floor(when.minute/60),startMinute:when.minute,price:svc?.price||0});
    setApptNote("");
    setShowModal(true);
    setShowMobileSidebar(false);
  };

  // ── Onboarding walkthrough — advance / skip / finish. State and the
  // trigger effect live earlier, right after closeSettings.
  const handleTourNext = useCallback(() => {
    const next = tourStep + 1;
    const nextStep = tourSteps[next];
    if (!nextStep) return; // the last step's button is onFinish, not onNext
    if (nextStep.requiresSettings) openSettings(nextStep.settingsTab || "general");
    setTourStep(next);
    persistTourPatch({ onboarding_tour_step: next });
  }, [tourStep, tourSteps, openSettings, persistTourPatch]);

  const handleTourSkip = useCallback(() => {
    if (showSettings) closeSettings(true);
    setTourStep(null);
    persistTourPatch({ onboarding_tour_seen: true });
  }, [showSettings, closeSettings, persistTourPatch]);

  const handleTourFinish = useCallback(() => {
    const wasInSettings = showSettings;
    if (wasInSettings) closeSettings(true);
    setTourStep(null);
    persistTourPatch({ onboarding_tour_seen: true });
    // The one action it ends on, not a congratulation screen. A short delay
    // when Settings was open lets that sheet's own close finish first, so
    // the two never visually overlap mid-transition.
    setTimeout(() => openNewAppt(), wasInSettings ? 220 : 0);
  }, [showSettings, closeSettings, persistTourPatch, openNewAppt]);

  // What a payment at the till changes besides the receipt: a Grow deposit deducted, client credit used, a package session drawn. ONE
  // place, called by "רשמי תשלום" AND by a card payment through Grow (GrowChargePanel onPaid): before 2026-11-02 a card payment through
  // Grow skipped all three, so the same credit was offered again and a package visit was charged ₪0 without drawing a session. `snap`
  // carries the values from the moment she pressed (a Grow payment can complete minutes later, after the till moved on).
  // Loyalty writes. A reward given at the till is ALSO marked on the receipt (its zero-priced 🎁 item), so before the migration the
  // card is still right; the table row is the record for the client card and the only record of a reward paid by card through Grow.
  // The ledger in memory: one new row is appended only to a ledger that was read whole. Otherwise (not read yet, failed, or the table
  // just appeared) the whole ledger is read again, so the count never runs on a partial one.
  const addLoyaltyRow = (key, row) => {
    if (loyaltyDb.ready === true) setLoyaltyDb((prev) => (prev.ready === true ? { ...prev, [key]: [...prev[key], row] } : prev));
    else loadLoyaltyRows();
  };
  const recordLoyaltyRedemption = async (clientId, receiptId, { quiet = false, stampsUsed = null } = {}) => {
    if (!clientId) return false;
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    // stamps_used: what this reward took when it was given, so a later change of "every" never rewrites it (lib/loyalty.js).
    const used = Number(stampsUsed) || loyaltyCfg.every;
    const { data, error } = await supabase.from("loyalty_redemptions").insert([{
      client_id: clientId, receipt_id: receiptId || null, reward: loyaltyCfg.reward, every: used, stamps_used: used, ...(tid ? { tenant_id: tid } : {}),
    }]).select();
    if (error) {
      // This receipt's reward is already recorded: a Grow payment's row is written by the server before the till sees the receipt
      // (lib/grow/service.ts), so this browser write is a harmless duplicate. The ledger is read again to show the server's row.
      if (error.code === "23505") { if (loyaltyDb.ready === true) loadLoyaltyRows(); return true; }
      if (isMissingLoyaltyTable(error)) {
        console.error("[loyalty] migration missing: add_loyalty_2026-11-05.sql", error);
        if (!quiet) toast(tr("התשלום נרשם, אבל המתנה לא סומנה בכרטיסייה: חסר עדכון קטן במערכת. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל."), "error");
        return false;
      }
      console.error("[loyalty] redemption write failed", error);
      if (!quiet) toast(tr("התשלום נרשם, אבל המתנה לא סומנה בכרטיסייה. בדקי בכרטיס הלקוחה לפני שנותנים אותה שוב."), "error");
      return false;
    }
    if (data && data[0]) addLoyaltyRow("redemptions", data[0]);
    return true;
  };
  const writeLoyaltyAdjustment = async (clientId, delta, reason) => {
    if (guardWrite()) return false;
    if (isBusy("loyaltyAdjust")) return false;
    setBusyKey("loyaltyAdjust", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const { data, error } = await supabase.from("loyalty_adjustments").insert([{ client_id: clientId, delta, reason, ...(tid ? { tenant_id: tid } : {}) }]).select();
      if (error) {
        if (isMissingLoyaltyTable(error)) {
          console.error("[loyalty] migration missing: add_loyalty_2026-11-05.sql", error);
          setLoyaltyDb((prev) => ({ ...prev, ready: false }));
          toast(tr("התיקון הידני עדיין לא זמין אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל אותו."), "error");
          return false;
        }
        handleDbError(error, "loyalty adjustment"); return false;
      }
      if (data && data[0]) addLoyaltyRow("adjustments", data[0]);
      toast(delta > 0 ? tr("נוסף ביקור לכרטיסייה ✦") : tr("הורד ביקור מהכרטיסייה"));
      return true;
    } finally { setBusyKey("loyaltyAdjust", false); }
  };
  // One tap at the till: the reward goes onto this visit (a discount, or nothing for a present), and the receipt carries the mark.
  // Taking the reward off: the discount it set is reverted, the mark is dropped (it rides on loyaltyApplied), the state is reset.
  const clearLoyaltyReward = () => {
    if (loyaltyApplied?.mode) { setCashierDiscountMode("ils"); setCashierDiscount(0); }
    setLoyaltyApplied(null);
  };
  const applyLoyaltyReward = () => {
    if (loyaltyApplied) { clearLoyaltyReward(); return; }
    if (!cashierClient?.id || !cashierLoyalty?.ready) return;
    const r = rewardAtTill(loyaltyCfg, cashierItems);
    if (r.needsItem) { toast(loyaltyCfg.services.length ? tr("הוסיפי קודם את הטיפול שהמתנה עליו") : tr("הוסיפי קודם טיפול לקופה"), "error"); return; }
    if (r.mode) { setCashierDiscountMode(r.mode); setCashierDiscount(r.discount); }
    setLoyaltyApplied({ ...r, clientId: String(cashierClient.id) });
  };
  // The till's client changed (picked another, or the search was cleared) after a reward was applied: that reward was the first
  // client's, so it comes off here, discount and mark both. The new client's own offer is recomputed by cashierLoyalty.
  useEffect(() => {
    if (rewardIsStale(loyaltyApplied, cashierClient?.id)) clearLoyaltyReward();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashierClient?.id, loyaltyApplied]);

  const applyCashierAdjustments = async (receiptId, snap) => {
    const growMark = (url, body, what) => fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(async r=>{const j=await r.json().catch(()=>null); if(!r.ok||!j?.success) throw new Error(j?.error||"");})
      .catch(()=>toast(tr("אישור התשלום נשמר, אבל לא הצלחנו לסמן ש{0} נוצל. בדקי לפני שמנכים אותו שוב בתור הבא.", [what]),"error"));
    // A gift voucher used on this sale: its redemption names this receipt (once; the route refuses a second link).
    if (voucherAdj?.ledgerId && !voucherAdj.receiptId) {
      setVoucherAdj((v) => (v && v.ledgerId === voucherAdj.ledgerId ? { ...v, receiptId } : v));
      growMark("/api/vouchers", { action: "attach", ledgerId: voucherAdj.ledgerId, receiptId }, "השובר");
    }
    // Grow: the deposit was deducted once (and any part above this visit becomes client credit); credit that was ticked is marked used.
    if (snap.depositUsed > 0 && snap.appt?.id) growMark("/api/grow/deposit",{appointmentId:String(snap.appt.id),receiptId,used:snap.depositUsed},"המקדמה");
    if (snap.creditUsed > 0 && snap.client?.id) growMark("/api/grow/credit",{clientId:String(snap.client.id),amount:snap.creditUsed,receiptId},"הקרדיט");
    // The package draw, AFTER the receipt: a receipt with no deduction is one session she can draw by hand from the packages tab, and the
    // toast tells her to, by name. The appointment goes onto the entry, so the unique index refuses a second draw for the same visit.
    // The loyalty reward: the till's own receipt carries the 🎁 mark already (quiet: a missing table loses nothing there). A Grow
    // receipt is now marked AND recorded by the server when the link is paid (the reward travels with the charge, lib/grow/service.ts),
    // so this write meets the unique index on receipt_id and is the same redemption, once. It stays for a charge made before the
    // migration (no column to carry the reward): then it is the only record, and a failure is said out loud.
    if (snap.loyalty && snap.client?.id) recordLoyaltyRedemption(String(snap.client.id), receiptId, { quiet: !!snap.loyaltyMarked, stampsUsed: snap.loyaltyEvery });
    // A membership credit: used once for THIS receipt by the server (lib/memberships.ts redeemCredit; a retry of the same receipt uses nothing more).
    if (snap.membership && snap.client?.id) {
      fetch("/api/memberships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"redeem",membershipId:snap.membership.membershipId,clientId:String(snap.client.id),receiptId,service:snap.membership.service})})
        .then(async r=>{const j=await r.json().catch(()=>null); if(!r.ok||!j?.success) throw new Error(j?.error||""); toast(`נוכה טיפול מהמנוי ✦ ${j.label||""}`);})
        .catch((e)=>toast(`התשלום נרשם, אבל הטיפול לא נוכה מהמנוי${e?.message?`: ${e.message}`:""}. בדקי בכרטיס הלקוחה.`,"error"));
    }
    if (snap.pkg) {
      const fresh = await writePackageEntry(snap.pkg, -1, { appointmentId: snap.appt?.id || null, reason: "ניכוי בקופה" });
      if (!fresh) toast(tr("התשלום נרשם, אך הטיפול לא נוכה מהחבילה של {0}. נסי לפתוח את הקופה שוב ולנכות, או פני לתמיכה.", [snap.pkg.client_name]), "error");
    }
  };

  const handleSaveReceipt = async () => {
    if (guardWrite()) return;
    if(!cashierItems.length){toast(tr("הוסיפי לפחות פריט אחד כדי להמשיך"),"error");return;}
    // The voucher balance taken must equal what this receipt credits (Vercel review on PR #25): a till whose total dropped below the
    // amount already taken off the voucher is not saved until she gives the redemption back and applies it again.
    if (voucherOverUsed(voucherAdj, voucherDue)) { toast(VOUCHER_OVER_USED_HE, "error"); return; }
    // Paying the same visit twice (from the calendar after the home list, or after a Grow payment) doubled her income.
    if(cashierAppt && !dupPayOk.current && liveRcpts.some(r=>r.appointment_id && String(r.appointment_id)===String(cashierAppt.id))){
      askConfirm({
        title: tr("כבר יש תשלום לטיפול הזה"),
        message: tr("נרשם תשלום על הטיפול הזה. לרשום עוד אחד? זה יוסיף להכנסות."),
        confirmText: tr("לרשום עוד אחד"),
        onConfirm: () => { dupPayOk.current = true; handleSaveReceipt(); },
      });
      return;
    }
    if(isBusy("saveReceipt")) return;
    setBusyKey("saveReceipt", true);
    try {
      const serviceNames=cashierItems.map(i=>i.name).join(", ");
      // A drawn session leaves a receipt for whatever is still owed, which is
      // usually nothing. A zero receipt is not clutter: it keeps the invariant
      // that every completed visit produces one, so history and per-visit
      // reporting stay whole - and since the money was collected at purchase,
      // revenue is untouched either way.
      const drewFromPackage = drawFromPackage && !!cashierPackage;
      const coveredByPackage = drewFromPackage && cashierTotal === 0;
      const coveredByMembership = !!membershipAdj && !coveredByPackage && cashierTotal === 0;
      // A split has to add up before anything is written. validateSplit is the
      // same arithmetic the tests prove; a rounding slip becomes a sentence
      // naming both numbers, not a receipt whose lines disagree with its total.
      const useSplit = splitOn && !coveredByPackage && !coveredByMembership && cashierTotal > 0;
      if (useSplit) {
        const v = validateSplit(splitResolved, cashierTotal);
        if (!v.ok) { toast(v.error, "error"); return; }
      }
      const tip = Math.max(0, Number(cashierTip) || 0);
      // Paid from "תשלום חדש" rather than from her appointment: link the client's visit TODAY when there is
      // exactly one, not cancelled and not paid yet, so that visit shows as paid (2026-10-23 pass, F2).
      // Anything ambiguous stays unlinked, as before.
      const linkedApptId = cashierAppt?.id || (() => {
        if (!cashierClient?.id) return null;
        // A products-only sale is not that visit's payment: never auto-link it, or her treatment would show as paid with only a
        // cream bought (Vercel review 2026-11-08). Only a sale that has at least one treatment line is matched to today's visit.
        if (!cashierItems.some(i => i && i.kind !== "product")) return null;
        const c = appointments.filter(a => String(a.client_id) === String(cashierClient.id) && a.date === today
          && a.confirmation_status !== "cancelled" && a.kind !== "personal"
          && !receipts.some(r => String(r.appointment_id) === String(a.id)));
        return c.length === 1 ? c[0].id : null;
      })();
      const receipt={
        client_id:cashierClient?.id||null,
        client_name:cashierClient?.name||"לקוחה",
        appointment_id:linkedApptId||null,
        service:serviceNames,
        amount:cashierTotal,
        // Only when nothing is left to pay. A covered treatment plus a cream is
        // still a card payment, and calling that "package" would put real money
        // in the wrong column of her breakdown. A split is the literal SPLIT
        // string, with the lines in `payments`.
        payment_method:coveredByPackage ? PACKAGE_PAYMENT : coveredByMembership ? MEMBERSHIP_PAYMENT : useSplit ? SPLIT_METHOD : paymentMethod,
        note:[cashierNote, loyaltyRewardLive?`🎁 מתנת כרטיסיית נאמנות: ${loyaltyCfg.reward}`:"", growDepositUsed>0?`מקדמה ₪${growDepositUsed} שולמה מראש ונוכתה`:"", growCreditUsed>0?`קרדיט ₪${growCreditUsed} נוכה`:"", membershipAdj?`${membershipAdj.service} מהמנוי "${membershipAdj.planName||""}"`:""].filter(Boolean).join(" · "),
        items:JSON.stringify(loyaltyRewardLive?[...cashierItems,loyaltyApplied.marker]:cashierItems),
        discount:cashierDiscountIls,
        // The three new columns. Tip is never part of amount; discount_pct is
        // the percentage she typed, if she typed one; payments are the split.
        tip,
        discount_pct: cashierDiscountMode==="pct" ? Math.min(100, Math.max(0, Number(cashierDiscount)||0)) : null,
        payments: useSplit ? splitResolved : null,
      };
      // A gift voucher used on this sale (its amount is already off the voucher, app/VoucherRedeemTill.jsx): named on the receipt.
      if (voucherUsed > 0 && voucherAdj) receipt.note = [receipt.note, voucherRedeemNote(voucherAdj.code, voucherUsed)].filter(Boolean).join(" · ");
      let {data,error}=await supabase.from("receipts").insert([receipt]).select();
      if (error && isMissingColumnError(error)) {
        // The migration has not run. Write the receipt without the three new
        // columns so her money is recorded, and say plainly what was lost:
        // a split becomes its first method, a tip and a percentage are dropped.
        const legacy = { ...receipt };
        delete legacy.tip; delete legacy.discount_pct; delete legacy.payments;
        if (useSplit) legacy.payment_method = splitResolved[0].method;
        ({data,error}=await supabase.from("receipts").insert([legacy]).select());
        if (!error && (useSplit || tip > 0 || cashierDiscountMode==="pct")) {
          console.error("[receipt] migration missing: tip/split/discount columns not present");
          toast(tr("אישור התשלום נשמר, אבל פיצול, טיפ ואחוז הנחה עדיין לא נתמכים אצלך. אפשר לכתוב לנו ב'תקועה?' למטה ונפעיל את זה."), "error");
        }
      }
      if(error){handleDbError(error, "save receipt"); return;}
      if(!data||!data[0]){toast(couldNotHe("לרשום את התשלום"),"error");return;}
      setReceipts(prev=>[...prev,data[0]]);
      // Products on this receipt: the server moves their stock, once per line (app/useProducts.js). Never blocks the sale.
      productsApi.afterReceipt(data[0], toast);
      const loyaltyUsed = loyaltyRewardLive;
      await applyCashierAdjustments(String(data[0].id), { depositUsed: growDepositUsed, creditUsed: growCreditUsed, appt: cashierAppt, client: cashierClient, pkg: drewFromPackage ? cashierPackage : null, membership: membershipAdj, loyalty: loyaltyUsed, loyaltyMarked: loyaltyUsed, loyaltyEvery: loyaltyUsed ? loyaltyApplied.marker?.loyalty_every : null });
      setMembershipAdj(null);
      setLoyaltyApplied(null);
      // Auto-send the receipt to the client on WhatsApp when enabled in settings.
      // Fire-and-forget: never blocks or breaks receipt creation; only warns on
      // failure. Uses the same sendReceiptToClient the manual button uses.
      afterPaymentRecorded(data[0], { autoSend: !!((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cashierClient?.phone) });
      setShowCashier(false);setRebookDone(null);setRebookWeeks(4);setRebookPick(null);setRebookPickOpen(false);setShowReceipt(data[0]);setConsentAskFor(data[0].id);setLoyaltyAfterFor(String(data[0].id));
      setCashierItems([]);setCashierClient(null);setCashierSearch("");setCashierDiscount(0);setCashierDiscountMode("ils");setCashierTip(0);setSplitOn(false);setCashierNote("");setCashierAppt(null);setGrowAdj({deposit:0,creditAvail:0,creditOn:false});
      // No business type means the legal document is SKIPPED (lib/legalReceipts/service.js, tax_status_missing): say so now, never
      // "מפיקה מסמך…" for a document that will not come (2026-10-21 audit).
      const legalBlocked=legalAccount?.connected&&needsLegalDoc(data[0])&&(!settings.business_tax_status||taxStatusUnconfirmed(settings));
      toast(tr("התשלום נרשם, ₪{0}{1}{2}", [cashierTotal, tip>0?` + טיפ ₪${tip}`:"", legalBlocked?" · לא יופק מסמך חוקי עד שתבחרי או תאשרי את סוג העסק בהגדרות (העסק שלי)":legalAccount?.connected&&needsLegalDoc(data[0])?" · מפיקה מסמך…":""]), legalBlocked?"error":undefined);
    } finally {
      setBusyKey("saveReceipt", false);
    }
  };

  // ── Rebooking at checkout ──────────────────────────────────────────────────
  //
  // The moment she takes payment is the only moment the client is standing in
  // front of her with nothing else to do. Every other rebooking attempt after
  // that is a WhatsApp message and a wait. So the next appointment gets offered
  // here, on the receipt, and it has to cost one tap — she is on her feet, her
  // hands have just come off someone's face, and anything that opens a form
  // with a date picker in it will not be used.
  //
  // So nothing is asked. The slot is proposed: same weekday, same time, four
  // weeks out, which is what a cosmetician's standing interval usually is. The
  // interval chips move it without opening anything, and "שינוי" is there for
  // the genuinely irregular case.

  const REBOOK_INTERVALS = [2, 3, 4, 6];

  // Is this exact window free? The one clash test everything else is built on:
  // the proposal, the free-slot list she picks from, and the re-check on the
  // way in all call this, so they cannot disagree about what "free" means.
  // `ownBuffer` is the buffer of the treatment being booked; every existing one is busy until its end plus its own
  // buffer (lib/serviceBuffer.ts). Closing time is checked by the callers on the treatment alone.
  const isFreeAt = useCallback((dateStr, minute, durationMin, ownBuffer = 0) => {
    const dur = (Number(durationMin) || 60) + (cleanBufferMinutes(ownBuffer) ?? 0);
    return !appointments.some((a) => {
      if (a.date !== dateStr || a.confirmation_status === "cancelled") return false;
      const bs = startMinute(a), rawEnd = endMinute(a);
      if (bs === null || rawEnd === null) return false;
      const be = rawEnd + apptBufferOf(a);
      return minute < be && bs < minute + dur;
    });
  }, [appointments, apptBufferOf]);

  // Every bookable start on one day, on a half-hour grid inside her hours for
  // that weekday. Empty when the day is closed.
  // `ownBuffer`: the buffer of the treatment being booked (lib/serviceBuffer.ts). It may run past closing.
  const freeSlotsOn = useCallback((dateStr, durationMin, ownBuffer = 0) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return [];
    const dh = dayHoursFrom(settings, d.getDay());
    if (!dh) return [];
    const dur = Number(durationMin) || 60;
    const out = [];
    for (let m = dh.open * 60; m + dur <= dh.close * 60; m += 30) {
      if (isFreeAt(dateStr, m, dur, ownBuffer)) out.push(m);
    }
    return out;
  }, [settings, isFreeAt]);

  // Find a real, free slot at or after the ideal one.
  //
  // Ideal = same weekday and same time, `weeks` out. Reality gets in the way in
  // three ways and all three are handled by walking forward rather than by
  // refusing: the day may be closed, the exact hour may be taken, and the whole
  // day may be full. Proposing a slot that cannot be booked would be worse than
  // proposing nothing, because she would tap it in front of the client.
  const proposeRebookSlot = useCallback((fromDateStr, fromMinute, durationMin, weeks, ownBuffer = 0) => {
    const base = new Date(fromDateStr || today);
    if (Number.isNaN(base.getTime())) return null;
    base.setDate(base.getDate() + weeks * 7);

    const wanted = Number.isFinite(fromMinute) ? fromMinute : 10 * 60;
    const dur = Number(durationMin) || 60;

    // Up to 14 days past the ideal date. Beyond that the proposal has drifted
    // far enough from what she asked for that silently offering it is a lie.
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const d = new Date(base);
      d.setDate(d.getDate() + dayOffset);
      const dateStr = formatDate(d);
      if (dateStr <= today) continue;

      const slots = freeSlotsOn(dateStr, dur, ownBuffer);
      if (slots.length === 0) continue;

      if (dayOffset === 0) {
        // Her actual time first, even when it is off the half-hour grid - an
        // anchor at 14:15 should propose 14:15, not round her to 14:30. The
        // grid is only the fallback, and the only thing the picker offers.
        const dh = dayHoursFrom(settings, d.getDay());
        const insideHours = wanted >= dh.open * 60 && wanted + dur <= dh.close * 60;
        if (insideHours && isFreeAt(dateStr, wanted, dur, ownBuffer)) {
          return { date: dateStr, minute: wanted, sameTime: true };
        }
        const after = slots.find((m) => m >= wanted);
        if (after != null) return { date: dateStr, minute: after, sameTime: false };
        continue;
      }

      return { date: dateStr, minute: slots[0], sameTime: false };
    }
    return null;
  }, [settings, today, freeSlotsOn, isFreeAt]);

  // Everything the strip needs, derived from the receipt on screen.
  const rebookPlan = useMemo(() => {
    if (!showReceipt || !showReceipt.client_id) return null;
    const client = clients.find((c) => String(c.id) === String(showReceipt.client_id));
    if (!client) return null;

    // The service to repeat. A receipt's `service` is a comma-joined list of
    // everything on it, so match the first line that is still on her menu; fall
    // back to the client's last appointment, then to nothing rather than
    // guessing at the top of the list.
    const names = String(showReceipt.service || "").split(",").map((s) => s.trim()).filter(Boolean);
    let svc = null;
    for (const n of names) {
      const found = activeServices.find((s) => s.name === n);
      if (found) { svc = found; break; }
    }

    // Anchor on the appointment this receipt was taken for, so "same time" means
    // the time she actually just worked, not the time of some older visit.
    const src = showReceipt.appointment_id
      ? appointments.find((a) => String(a.id) === String(showReceipt.appointment_id))
      : null;
    const past = appointments
      .filter((a) => String(a.client_id) === String(client.id) && a.confirmation_status !== "cancelled")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const anchor = src || past[0] || null;

    if (!svc && anchor) svc = activeServices.find((s) => s.name === anchor.service) || null;
    if (!svc) return null;

    const slot = proposeRebookSlot(
      anchor?.date || today,
      anchor ? startMinute(anchor) : null,
      svc.duration,
      rebookWeeks,
      newApptBufferFor(svc.name)
    );
    if (!slot) return null;
    return { client, svc, slot };
  }, [showReceipt, clients, appointments, activeServices, rebookWeeks, today, proposeRebookSlot, newApptBufferFor]);

  // The day's free starts, for the picker. Same freeSlotsOn the proposal used,
  // so she can only ever choose something that was already bookable.
  const rebookSlots = useMemo(
    () => (rebookPlan ? freeSlotsOn(rebookPlan.slot.date, rebookPlan.svc.duration, newApptBufferFor(rebookPlan.svc.name)) : []),
    [rebookPlan, freeSlotsOn, newApptBufferFor]
  );

  // What will actually be booked: her pick when it is still free on this date,
  // otherwise the proposal. Checking validity here rather than clearing the
  // pick on every change means a taken slot degrades to the proposal instead of
  // failing at insert time.
  const rebookMinute = (() => {
    if (!rebookPlan) return null;
    if (rebookPick && String(rebookPick.receiptId) === String(showReceipt?.id)
        && rebookSlots.includes(rebookPick.minute)) return rebookPick.minute;
    return rebookPlan.slot.minute;
  })();

  // The one insert behind every "book the next visit" tap: the checkout strip below and the "קבעי לה שוב" sheet
  // (RebookNextSheet). Same row handleSave writes for a plain new appointment, minus everything the form asks for.
  // Returns the created row, or null after telling her why not.
  const insertRebookAppointment = async ({ client, svc, date, minute }) => {
    if (guardWrite()) return null;
    // Re-check on the way in, through the same isFreeAt the proposal and the picker use. The plan was computed from state
    // that may be a few minutes old, and the exclusion constraint would reject it anyway - this just turns that into a
    // sentence she can act on.
    if (!isFreeAt(date, minute, svc.duration, newApptBufferFor(svc.name))) {
      toast(tr("השעה נתפסה בינתיים, בחרי שעה אחרת"), "error");
      return null;
    }
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || null;
    const tenantField = tid ? { tenant_id: tid } : {};

    const appt = {
      date,
      ...startFields(minute),
      name: client.name,
      service: svc.name,
      duration: Number(svc.duration) || 60,
      color: svc.color || DEFAULT_SERVICE_COLOR,
      client_id: client.id,
      note: "",
      price: Number(svc.price) || 0,
      confirmation_status: "pending",
      confirmation_sent: false,
      ...tenantField,
      // The buffer isFreeAt just checked with, so the database enforces the same rule (lib/apptBuffer.ts).
      ...apptBufferField(newApptBufferFor(svc.name)),
    };
    const { data, error } = await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
    if (error) { handleDbError(error, "rebook appointment"); return null; }
    if (!data || !data[0]) { toast(couldNotHe("לקבוע את התור"), "error"); return null; }
    setAppointments((prev) => [...prev, data[0]]);
    toast(tr("נקבע תור ל-{0} בשעה {1}", [formatDateHe(new Date(date)), fmtTime(minute)]));
    return data[0];
  };

  // "קבעי לה שוב" -> "שינוי": the full new-appointment form, prefilled with the proposal.
  const openRebookForm = ({ client, svc, date, minute }) => {
    const sv = svc || activeServices[0];
    setEditingAppointmentId(null);
    setNewAppt({
      clientId: client.id, name: client.name, service: sv?.name || "", duration: sv?.duration || 60,
      date: date || formatDate(nextOpenDay(settings)),
      hour: minute != null ? Math.floor(minute / 60) : settings.working_hours_start,
      ...(minute != null ? { startMinute: minute } : {}),
      price: sv?.price || 0,
    });
    setApptNote("");
    setRebookNext(null);
    setSelectedClient(null);
    setShowModal(true);
  };
  // She tapped "open in WhatsApp" on the message for the booking she just made: the same flag sendConfirmationNow sets.
  const markRebookMessageOpened = async (appt) => {
    toast(tr("וואטסאפ נפתח עם ההודעה מוכנה. נשאר ללחוץ על שליחה."));
    const { data, error } = await supabase.from("appointments").update({ confirmation_sent: true }).eq("id", appt.id).select();
    if (error) { handleDbError(error, "mark confirmation_sent"); return; }
    if (data?.[0]) setAppointments((prev) => prev.map((a) => (a.id === appt.id ? data[0] : a)));
  };
  const refreshWaQueue = () => {
    fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.success) setWhatsappPending(j.messages || []); }).catch(() => {});
  };

  // Book it. Same insert as handleSave, minus everything the form asks for.
  const confirmRebook = async () => {
    if (guardWrite()) return;
    if (!rebookPlan || isBusy("rebook")) return;
    setBusyKey("rebook", true);
    try {
      const { client, svc, slot } = rebookPlan;
      const minute = rebookMinute;

      // Re-check on the way in, through the same isFreeAt the proposal and the
      // picker use. The plan was computed from state that may be a few minutes
      // old, and the exclusion constraint would reject it anyway — this just
      // turns that into a sentence she can act on.
      if (!isFreeAt(slot.date, minute, svc.duration, newApptBufferFor(svc.name))) {
        toast(tr("השעה נתפסה בינתיים, בחרי שעה אחרת"), "error");
        return;
      }

      const row = await insertRebookAppointment({ client, svc, date: slot.date, minute });
      if (!row) return;
      setRebookDone({ receiptId: showReceipt.id, appt: row });
      setRebookPick(null);
      setRebookPickOpen(false);
    } finally {
      setBusyKey("rebook", false);
    }
  };

  // Hand off to the full form, prefilled with the proposal, for the cases the
  // chips cannot express — a different treatment, a specific date she has been
  // told about, a time outside the pattern.
  const editRebook = () => {
    if (!rebookPlan) return;
    const { client, svc, slot } = rebookPlan;
    const minute = rebookMinute;
    setEditingAppointmentId(null);
    setNewAppt({
      clientId: client.id,
      name: client.name,
      service: svc.name,
      duration: svc.duration || 60,
      date: slot.date,
      hour: Math.floor(minute / 60),
      startMinute: minute,
      price: svc.price || 0,
    });
    setApptNote("");
    setShowReceipt(null);
    setShowModal(true);
  };

  // Add a business expense (tenant_id is filled by the DB column default).
  const handleAddExpense = async () => {
    if (guardWrite()) return;
    const amt = Number(newExpense.amount);
    if(!amt || amt<=0){ toast(tr("חסר סכום, אפשר להקליד אותו"),"error"); return; }
    if(!Number.isFinite(amt) || amt>=10000000){ toast(tr("הסכום נראה גדול מדי, אפשר לבדוק אותו?"),"error"); return; }
    if(!newExpense.expense_date){ toast(tr("חסר תאריך, אפשר לבחור אחד"),"error"); return; }
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
      toast(tr("ההוצאה נוספה"));
    } finally {
      setBusyKey("addExpense", false);
    }
  };

  const handleDeleteExpense = (exp) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("מחיקת הוצאה"),
      message: tr("למחוק את ההוצאה{0} (₪{1})?", [exp.description?` "${exp.description}"`:"", Number(exp.amount).toLocaleString()]),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const {error} = await supabase.from("expenses").delete().eq("id", exp.id);
        if(error){ handleDbError(error,"delete expense"); return; }
        setExpenses(prev=>prev.filter(e=>e.id!==exp.id));
        toast(tr("ההוצאה נמחקה"));
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
        body: JSON.stringify({ transcript, today, lang: getActiveLang() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.intent) {
        const intent = data.intent;
        setVoiceIntent(intent);
        if (data.capNotice) toast(data.capNotice);
        if (intent.action === "book_appointment") prepareBooking(intent);
        else if (intent.action === "show_day") showDayInfo(intent);
        else if (intent.action === "revenue_summary") revenueInfo(intent);
        else if (intent.action === "cancel_appointment") prepareCancel(intent);
        else if (intent.action === "call_client") prepareCall(intent);
        else if (intent.action === "create_receipt") prepareReceipt(intent);
        else setVoiceStatus("result");
      } else { setVoiceErr(data.error || tr("לא הצלחתי להבין את הבקשה")); setVoiceStatus("error"); }
    } catch (err) {
      setVoiceErr(tr("משהו השתבש בעיבוד הבקשה, נסי שוב")); setVoiceStatus("error");
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
      ? receiptsOnDay(liveRcpts, today)
      : liveRcpts.filter(r => { const c = r.created_at && parseDb(r.created_at); return c && c.getMonth() === thisMonth && c.getFullYear() === thisYear; });
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
    if (!b.clientName.trim()) { toast(tr("חסר שם לקוחה"), "error"); return; }
    const amt = Number(b.amount);
    if (!amt || amt <= 0) { toast(tr("חסר סכום, אפשר להקליד אותו"), "error"); return; }
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
      toast(tr("התשלום נרשם ✦"));
      // Open the receipt modal so the voice receipt gets the same actions
      // (print / manual "send to client") as a regular receipt.
      if (data) {
        setReceipts(prev=>[...prev, data[0]]);
        setShowReceipt(data[0]);setConsentAskFor(data[0].id);
        // Auto-send to the client on WhatsApp when enabled (same helper as the
        // manual button). Fire-and-forget — never blocks or breaks creation.
        const cl = clients.find(c=>String(c.id)===String(data[0].client_id));
        afterPaymentRecorded(data[0], { autoSend: !!((settings.send_receipt_auto===true||settings.send_receipt_auto==="true") && cl?.phone) });
      }
    } finally {
      setBusyKey("voiceReceipt", false);
    }
  };

  // Send a receipt summary to the client's WhatsApp via GreenAPI (server route
  // /api/send-receipt, which reuses lib/whatsapp.js — the same mechanism as
  // booking confirmations). Only sends when the client has a phone number.
  // A message the server queued and she is opening right now. When WhatsApp really opened, the queued row is
  // marked sent, so the same message does not also wait in "הודעות מוכנות לשליחה" (2026-10-23 pass, C3).
  // When the browser blocked it, it stays there and she is told so. (No "noopener": with it window.open
  // always returns null and an opened tab could not be told from a blocked one; opener is cut by hand.)
  const openQueuedWa = (link, messageId) => {
    const w = window.open(link, "_blank");
    if (w) {
      try { w.opener = null; } catch {}
      if (messageId) {
        fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: messageId }) }).catch(() => {});
        setWhatsappPending(prev => prev.filter(x => x.id !== messageId));
      }
      return true;
    }
    toast(tr("הדפדפן חסם את פתיחת וואטסאפ. ההודעה מחכה ב\"הודעות מוכנות לשליחה\""), "info");
    fetch("/api/messages?status=pending_manual", { cache: "no-store" }).then(r => r.json()).then(j => { if (j?.success) setWhatsappPending(j.messages || []); }).catch(() => {});
    return false;
  };

  // `silent` suppresses toasts for the auto-send path. Returns true on success.
  const sendReceiptToClient = async (receipt, { silent = false } = {}) => {
    if (guardWrite()) return false;
    if (!receipt) return false;
    // Resolve the phone from the tenant's own client row; fall back to any
    // phone already on the receipt object.
    const cl = clients.find(c => String(c.id) === String(receipt.client_id));
    const phone = (cl?.phone || receipt.client_phone || "").trim();
    if (!phone) { if (!silent) toast(tr("ללקוחה אין מספר טלפון"), "error"); return false; }
    try {
      const res = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: settings.tenant_id,
          receipt_id: receipt.id,
          client_name: receipt.client_name,
          client_phone: phone,
          amount: receipt.amount,
          payment_method: receipt.payment_method,
          tip: Number(receipt.tip) || 0,
          payments_text: isSplit(receipt) ? paymentsOf(receipt).map(p=>`${p.method} ₪${p.amount}`).join(", ") : "",
          date: localDayKey(receipt.created_at),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.queued && data.waLink) {
        // Manual mode (or the central number fell back): still a success,
        // just not automatic. The silent auto-send path leaves it in her
        // WhatsApp queue rather than popping a tab she didn't ask for right
        // now; a direct button tap opens it immediately.
        if (!silent) { toast(tr("מוכן לשליחה, נפתח וואטסאפ")); openQueuedWa(data.waLink, data.messageId); }
        return true;
      }
      if (!res.ok || !data.success) {
        if (!silent) toast(tr("לא הצלחנו להכין שליחה אוטומטית, אפשר לשלוח בקישור הישיר למטה"), "error");
        return false;
      }
      if (!silent) toast(tr("ההודעה הועברה לשליחה בוואטסאפ ✦"));
      return true;
    } catch {
      if (!silent) toast(tr("לא הצלחנו להכין שליחה אוטומטית"), "error");
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
    // A legal document is the provider's PDF, in her account, under her number. We never
    // print our own layout as if it were one.
    if (receipt.legal_status === "issued" && receipt.legal_doc_url) { window.open(receipt.legal_doc_url, "_blank", "noopener"); return; }
    const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const rows = [
      ["לקוחה", esc(receipt.client_name || "לקוחה")],
      ["תאריך", esc(fmtDateHe(localDayKey(receipt.created_at)))],
      ["שירות", esc(receipt.service || "")],
      ["אמצעי תשלום", esc(receiptMethodLabel(receipt))],
    ];
    if (isSplit(receipt)) for (const ln of paymentsOf(receipt)) rows.push(["· " + esc(ln.method), "₪" + esc(ln.amount)]);
    if (Number(receipt.discount) > 0) rows.push(["הנחה" + (receipt.discount_pct ? ` (${esc(receipt.discount_pct)}%)` : ""), "−₪" + esc(receipt.discount)]);
    if (Number(receipt.tip) > 0) rows.push(["טיפ", "₪" + esc(receipt.tip)]);
    // Voucher codes as LTR isolates that never wrap, as on the screen (lib/giftVouchers.ts splitVoucherCodes).
    if (receipt.note) rows.push(["הערה", splitVoucherCodes(receipt.note).map((seg) => seg.code ? `<bdi dir="ltr" style="white-space:nowrap">${esc(seg.text)}</bdi>` : esc(seg.text)).join("")]);
    const vd = voidOf(receipt, receiptVoids);
    if (vd) rows.push(["מבוטלת", esc(vd.reason || "") + " · " + esc(localDayKey(vd.created_at))]);
    const rowsHtml = rows.map(([k, v]) => `<div class="row"><span class="k">${k}:</span><span class="v">${v}</span></div>`).join("");
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(docLabelHe(receipt))}</title>
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
  .total .amt{font-size:44px;font-weight:700;color:${esc(herAccent)}}
  .foot{text-align:center;font-size:14px;color:#9A93A4;margin-top:24px}
</style></head>
<body onload="window.print()">
  <div class="wrap">
    <div class="head">
      <div class="biz">${esc(settings.business_name || "העסק")}</div>
      <div class="sub">${esc(docLabelHe(receipt))}</div>
      ${settings.business_phone ? `<div class="sub">${esc(settings.business_phone)}</div>` : ""}
    </div>
    <div class="body">${rowsHtml}</div>
    <div class="total"><span class="lbl">סה״כ:</span><span class="amt">₪${esc(receipt.amount)}</span></div>
    <div class="foot">תודה ונתראה בקרוב ✦</div>
    <div class="foot">אישור תשלום בלבד. אינו קבלה או חשבונית מס.</div>
  </div>
  <script>window.onafterprint=function(){window.close()}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) { toast(tr("החלון נחסם, אפשרי חלונות קופצים ונסי שוב"), "error"); return; }
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
    const brandJson = settings.branding && typeof settings.branding === "object" ? settings.branding : {};
    const address = (brandJson.public_address || brandJson.address || "").trim();
    const arrivalNote = (brandJson.arrival_note || "").trim();
    const links = await fetchConfirmLinks(appt.id);
    if (!links) return null;
    const confirmLink = links.confirmUrl;
    const cancelLink = links.cancelUrl;
    return msgLines(
      msgGreet(appt.name),
      `תזכורת לתור שלך ב${businessName}${dayWordFor(appt.date)}.`,
      "",
      appt.service,
      `${msgHebrewDate(appt.date)}, ${fmtApptTime(appt)}`,
      address ? "" : null,
      address ? `📍 ${address}` : null,
      address ? msgMapsLink(address) : null,
      arrivalNote ? "" : null,
      arrivalNote || null,
      "",
      `לאישור: ${confirmLink}`,
      msgMoveLine(links.rescheduleUrl, brandJson),
      `אם צריך לבטל, אפשר כאן: ${cancelLink}`
    );
  };

  // Send a one-off reminder for a specific appointment through the server
  // route (the platform number, same as the nightly cron). If the send fails,
  // fall back to opening WhatsApp with the message pre-filled (wa.me) so the
  // reminder still goes out from her own phone.
  const sendReminderToClient = async (appt) => {
    if (guardWrite()) return;
    if (!appt || isBusy("sendReminder")) return;
    const cl = clients.find(c => String(c.id) === String(appt.client_id));
    const phone = (cl?.phone || appt.client_phone || "").trim();
    if (!phone) { toast(tr("ללקוחה אין מספר טלפון"), "error"); return; }
    setBusyKey("sendReminder", true);
    try {
      const res = await fetch("/api/send-reminder-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: settings.tenant_id, appointmentId: appt.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && !data.queued) { toast(tr("התזכורת הועברה לשליחה ✦")); return; }
      if (res.ok && data.queued && data.waLink) {
        // Manual mode (or the central number fell back): this is still
        // success, just not automatic - the honest copy says so, and opens
        // the one tap that replaces it, with the exact message already
        // composed server-side.
        toast(tr("מוכן לשליחה, נפתח וואטסאפ"));
        openQueuedWa(data.waLink, data.messageId);
        return;
      }
      // A real failure (e.g. an unusable phone) - fall back to building the
      // link client-side so the send still has a path.
      toast(tr("לא הצלחנו להכין שליחה אוטומטית, נפתחת שליחה ידנית"), "error");
      const text = await reminderText(appt);
      const link = text && waMsg(phone, text);
      if (link) window.open(link, "_blank", "noopener");
    } catch {
      toast(tr("לא הצלחנו להכין שליחה אוטומטית, נפתחת שליחה ידנית"), "error");
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
      `${docLabelHe(receipt)} מ${businessName}\n\n` +
      `💰 סכום: ₪${receipt.amount}\n` +
      `💳 אמצעי תשלום: ${receiptMethodLabel(receipt, "מזומן")}\n` +
      `📅 תאריך: ${fmtDateHe(localDayKey(receipt.created_at))}\n\n` +
      (receipt.legal_status === "issued" && receipt.legal_doc_url ? `🧾 המסמך: ${receipt.legal_doc_url}\n\n` : `(אישור תשלום, לא מסמך מס)\n\n`) +
      `תודה ונתראה בקרוב! 😊`;
  };

  // call_client: find the client by name; the call itself just opens tel:.
  const prepareCall = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr(tr("לא זוהה שם לקוחה לחיוג. נסי שוב.")); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = clients.filter(c => (c.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = clients.filter(c => (c.name||"").toLowerCase().includes(low));
    if (matches.length === 0) { setVoiceErr(tr("לא מצאתי לקוחה בשם {0}", [nameSpoken])); setVoiceStatus("error"); return; }
    setVoiceCall({ matches, selected: matches.length === 1 ? matches[0] : null });
    setVoiceStatus("call");
  };

  // cancel_appointment: find matching appointments (by name, then date) — nothing
  // is deleted here; deletion happens only on explicit confirm.
  const prepareCancel = (intent) => {
    const nameSpoken = (intent.client_name || "").trim();
    if (!nameSpoken) { setVoiceErr(tr("לא זוהה שם לקוחה לביטול. נסי שוב.")); setVoiceStatus("error"); return; }
    const low = nameSpoken.toLowerCase();
    let matches = appointments.filter(a => (a.name||"").trim().toLowerCase() === low);
    if (matches.length === 0) matches = appointments.filter(a => (a.name||"").toLowerCase().includes(low));
    if (intent.date) matches = matches.filter(a => a.date === intent.date);
    if (matches.length === 0) { setVoiceErr(tr("לא מצאתי תור תואם ל{0}", [nameSpoken])); setVoiceStatus("error"); return; }
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
      toast(tr("התור בוטל"));
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
    if (!b.clientName.trim()) { toast(tr("חסר שם לקוחה"), "error"); return; }
    if (!b.service) { toast(tr("איזה שירות? אפשר לבחור"), "error"); return; }
    if (!b.date || !b.time) { toast(tr("חסרים תאריך ושעה, אפשר לבחור"), "error"); return; }
    const svc = activeServices.find(s => s.name === b.service);
    // Real minutes. This used to take Number(time.split(":")[0]) and store that
    // as a whole hour, so "קבעי לרונית ב-שתיים וחצי" silently booked 14:00 -
    // the one write path the minutes migration missed. toMinutes rejects
    // anything unparseable rather than falling through to 0, so a malformed
    // time still never books silently at 00:00.
    const startMin = toMinutes(b.time);
    if (startMin === null) { toast(tr("שעה לא תקינה"), "error"); return; }
    const duration = svc?.duration || 60;
    // Guard against double-booking, mirroring handleSave: reject if the new
    // [start,end) overlaps any non-cancelled appointment on that date.
    {
      // Buffers included (lib/serviceBuffer.ts), same test as handleSave.
      const newStart = startMin, newEnd = newStart + duration + newApptBufferFor(svc?.name);
      const clash = appointments.some(a=>{
        if(a.date!==b.date || a.confirmation_status==="cancelled") return false;
        const bs=startMinute(a), rawEnd=endMinute(a); if(bs===null||rawEnd===null) return false;
        return newStart<rawEnd+apptBufferOf(a) && bs<newEnd;
      });
      if(clash){ toast(tr("השעה הזו כבר תפוסה"),"error"); return; }
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
        // The buffer the clash check above used (lib/apptBuffer.ts).
        ...apptBufferField(newApptBufferFor(svc?.name)),
      };
      const {data,error} = await writeWithApptBuffer([appt], (r) => supabase.from("appointments").insert(r).select());
      if (error) { handleDbError(error, "create appointment (voice)"); return; }
      if (data) setAppointments(prev=>[...prev, data[0]]);
      closeVoice();
      toast(tr("התור נקבע ✦"));
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
    rec.lang = speechLangOf(getActiveLang()); // her language (lib/i18n): he-IL, ar-IL or en-US
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
      setVoiceTranscript(t);
      if (t) processVoice(t);
    };
    rec.onerror = (e) => {
      // "service-not-allowed" is what an iPhone answers when Dictation is switched off in the phone's own settings, not a browser permission.
      setVoiceErr(e.error === "service-not-allowed"
        ? tr("ההכתבה כבויה בטלפון. אפשר להפעיל אותה בהגדרות הטלפון ← כללי ← מקלדת ← הפעלת הכתבה, או להקליד את הבקשה.")
        : e.error === "not-allowed"
          ? tr("אין הרשאת מיקרופון. אפשרי גישה בדפדפן ונסי שוב.")
          : tr("שגיאה בהאזנה. נסי שוב."));
      setVoiceStatus("error");
    };
    // If listening ended with no result, surface a gentle retry state.
    rec.onend = () => { setVoiceStatus(s => s === "listening" ? "error" : s); };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setVoiceStatus("error"); setVoiceErr(tr("המיקרופון לא נפתח, אפשר לבדוק שהדפדפן קיבל אישור")); }
  };

  // There is no card-payment integration. A "pay by card through Grow" button
  // used to sit in the cashier and POST to /api/payment/create, a route that
  // never existed, while promising the receipt would be created on its own.
  // Card payments are recorded here like cash: she takes the payment on her
  // own terminal and writes the receipt. The button comes back with a
  // provider, not before.

  // Selling a package is the largest single transaction she makes, and until
  // now it earned nothing. This wrote a row into `packages` carrying a price and
  // created NO RECEIPT - and every revenue number in the product reads
  // `receipts`. So an 1,800 shekel sale was absent from her monthly revenue, her
  // payment breakdown and her tax report, while the package sat on screen
  // looking like a completed sale. The one number a business owner actually
  // checks was quietly wrong for the transaction that matters most.
  //
  // Two writes, and they are not equal. The package is the thing she sold; the
  // receipt is the record that she was paid for it. There is no transaction
  // across two PostgREST calls, so the order is chosen for which failure is
  // recoverable: package first, then receipt. A package with no receipt is
  // visible on her screen and can be fixed by ringing the amount up by hand,
  // and the toast below tells her to. A receipt for a package that does not
  // exist is money attributed to nothing, with nothing on any screen to show
  // for it.
  const loadOfferings = useCallback(async () => {
    const { data, error } = await supabase
      .from("package_offerings").select("*").order("sort_order", { ascending: true });
    if (error) {
      // Empty and broken are different answers, and this codebase has paid for
      // conflating them before. The list says which one it is.
      console.error("[offerings] load failed:", error.message);
      setOfferingsError(true);
      setOfferings([]);
      return;
    }
    setOfferingsError(false);
    setOfferings(data || []);
  }, []);

  const loadClientReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("[reviews] load failed:", error.message);
      setClientReviewsError(true);
      setClientReviews([]);
      return;
    }
    setClientReviewsError(false);
    setClientReviews(data || []);
  }, []);

  // Lazily, and only where each is shown.
  //
  // THESE MUST SIT BELOW THE useCallbacks THEY NAME. They were 3,000 lines
  // above them, and a dependency array is evaluated DURING RENDER, in source
  // order - so [activeTab, loadOfferings] read a const that had not been
  // initialised yet and threw "Cannot access 'loadOfferings' before
  // initialization" on every single render of this component, server and
  // client. The dashboard did not degrade; it did not render at all.
  //
  // It shipped in the catalogue-UI commit and again with the reviews
  // moderation row, and survived ten commits of "build passed" - because the
  // build died two steps earlier on a missing environment variable and never
  // reached the render. The first check that got far enough found it
  // immediately, which is the argument for the check.
  useEffect(()=>{ if(activeTab==="packages") loadOfferings(); },[activeTab, loadOfferings]);
  useEffect(()=>{ if(showSettings) loadClientReviews(); },[showSettings, loadClientReviews]);

  // The scanner link she should share: signed by the server, on the origin
  // she is using. Returns the url (or null) so the copy button can await it.
  // The QR is drawn from the SAME string - one link, three surfaces.
  const loadScanLink = useCallback(async () => {
    try {
      const res = await fetch("/api/skin-scan/link");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success || !(data.path || data.url)) {
        setScanLinkError((data && data.error) || tr("לא הצלחנו להפיק את הקישור"));
        return null;
      }
      setScanQuota(data);
      const origin = (typeof window !== "undefined" && window.location.origin) || "";
      const url = data.path && origin ? `${origin}${data.path}` : data.url;
      setScanLink(url);
      setScanLinkError("");
      try {
        const QRCode = (await import("qrcode")).default;
        setScanQr(await QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#2B2233", light: "#FFFFFF" } }));
      } catch { setScanQr(null); }
      return url;
    } catch {
      setScanLinkError(tr("לא הצלחנו להפיק את הקישור. בדקי את החיבור ונסי שוב."));
      return null;
    }
  }, []);
  useEffect(()=>{ if(showSettings && !scanLink) loadScanLink(); },[showSettings, scanLink, loadScanLink]);

  // Whether the CENTRAL WhatsApp number is on right now (the admin panel's
  // own toggle, platform-wide) - fetched once per settings-panel open, so
  // the owner-alert WhatsApp toggle below can say plainly, next to itself,
  // when turning it on wouldn't send anything yet. null = not loaded yet.
  const [waCentralConnected, setWaCentralConnected] = useState(null);
  useEffect(()=>{
    if(!showSettings) return;
    let cancelled=false;
    fetch("/api/whatsapp-central-status").then(r=>r.json()).then(d=>{ if(!cancelled) setWaCentralConnected(!!d.connected); }).catch(()=>{ if(!cancelled) setWaCentralConnected(false); });
    return ()=>{ cancelled=true; };
  },[showSettings]);

  // The demo's clients have real-looking numbers: no WhatsApp, call or SMS may open from it (lib/demoOutbound.js).
  const isDemoTenant = isDemoTenantId(settings?.tenant_id);
  useEffect(()=>{
    if(!isDemoTenant) return;
    return installDemoOutboundGuard(()=>toast(tr("זו תצוגת דמו, אז וואטסאפ לא נפתח. בחשבון שלך ההודעה תיפתח מוכנה לשליחה."),"info"));
  },[isDemoTenant, toast]);

  const downloadScanQr = () => {
    if (!scanQr) return;
    // Decoded in the same tap (a fetch first would use it up), so the phone's share sheet is still allowed.
    const blob = dataUrlToBlob(scanQr);
    if (!blob) { toast(tr("לא הצלחנו להכין את הקוד להורדה. אפשר לצלם אותו מהמסך"), "error"); return; }
    deliverFile(blob, `${(settings.business_name || "kalmea").replace(/[^\p{L}\p{N}]+/gu, "-")}-skin-scan-qr.png`).then(o => { const t = deliveryToast(o, { downloaded: "הקוד ירד" }); if (t) toast(t.text, t.kind); });
  };

  // HIDE, AND NOTHING ELSE. There is no edit here and there cannot be one: the
  // database refuses any change to the words, so a text field would be a box
  // that throws 42501 when she pressed save. The absence of that field is the
  // feature - a review she could rewrite is a testimonial, and the page says
  // these are from clients.
  const toggleReviewHidden = async (rv) => {
    if (guardWrite()) return;
    const next = rv.status === "hidden" ? "published" : "hidden";
    const { data, error } = await supabase
      .from("reviews").update({ status: next }).eq("id", rv.id).select();
    if (error) { handleDbError(error, "update review status"); return; }
    if (data && data[0]) {
      setClientReviews(prev => prev.map(x => x.id === rv.id ? data[0] : x));
      toast(next === "hidden" ? tr("הביקורת הוסתרה") : tr("הביקורת הוחזרה"));
    }
  };

  const handleSaveOffering = async () => {
    if (guardWrite()) return;
    if (!newOffering.service) { toast(tr("איזה טיפול? אפשר לבחור"),"error"); return; }
    if (!(Number(newOffering.sessions) > 0)) { toast(tr("מספר טיפולים חייב להיות גדול מאפס"),"error"); return; }
    if (isBusy("saveOffering")) return;
    setBusyKey("saveOffering", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const row = {
        service: newOffering.service,
        sessions: Number(newOffering.sessions),
        price: Number(newOffering.price) || 0,
        sort_order: offerings.length,
        ...(tid ? { tenant_id: tid } : {}),
      };
      const { data, error } = await supabase.from("package_offerings").insert([row]).select();
      if (error) { handleDbError(error, "save package offering"); return; }
      if (data && data[0]) {
        setOfferings(prev => [...prev, data[0]]);
        setNewOffering({ service:"", sessions:5, price:0 });
        setShowOfferingForm(false);
        toast(tr("החבילה נוספה לקטלוג"));
      }
    } finally { setBusyKey("saveOffering", false); }
  };

  // Retired, not deleted. Packages already sold point at this row, and a
  // catalogue entry that disappears takes the answer to "what did she buy?"
  // with it.
  const toggleOffering = async (o) => {
    if (guardWrite()) return;
    const { data, error } = await supabase
      .from("package_offerings").update({ active: !o.active }).eq("id", o.id).select();
    if (error) { handleDbError(error, "update package offering"); return; }
    if (data && data[0]) setOfferings(prev => prev.map(x => x.id === o.id ? data[0] : x));
  };

  const freePackageOk = useRef(false);
  const handleSavePackage = async () => {
    if (guardWrite()) return;
    if(!newPackage.client_id||!newPackage.service){toast(tr("חסרים לקוחה ושירות, אפשר לבחור"),"error");return;}
    // A free package is real (a comped series), but a forgotten price used to save as ₪0 without a word and
    // record no payment (2026-10-24 sweep). Ask once; the confirmed path comes back with free=true.
    if(!(Number(newPackage.price)>0)&&!freePackageOk.current){
      askConfirm({title:tr("חבילה בלי מחיר"),message:tr("לא הוזן מחיר לחבילה. לשמור אותה כמתנה, בלי לרשום תשלום?"),confirmText:tr("כן, בלי תשלום"),cancelText:tr("להוסיף מחיר"),onConfirm:()=>{freePackageOk.current=true;handleSavePackage();}});
      return;
    }
    freePackageOk.current=false;
    if(isBusy("savePackage")) return;
    setBusyKey("savePackage", true);
    try {
      // Stamp the tenant the way handleSave does, and for the same reason: so
      // the row satisfies the RLS WITH CHECK even where the column default is
      // not applied. This insert sent newPackage raw, with no tenant_id on it
      // at all - leaning on a database default that nothing in this repo
      // guarantees.
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const tid = rpcTenant || settings?.tenant_id || null;
      const tenantField = tid ? { tenant_id: tid } : {};

      const price = Number(newPackage.price) || 0;
      // payment_method belongs on the receipt, not on the package row - it is
      // how she was paid, not part of what she sold.
      // valid_months is a choice on the form, not a column: it becomes packages.expires_at (end of that day, Israel),
      // which the smart reminders read to tell her client two weeks before unused sessions run out.
      const { payment_method, valid_months, ...packageRow } = newPackage;
      const months = Number(valid_months) || 0;
      if (months > 0) {
        const d = new Date(); d.setMonth(d.getMonth() + months);
        packageRow.expires_at = `${formatDate(d)}T21:59:59Z`;
      }
      // active: true, written explicitly. The packages list and the cashier's
      // "charge from package" card both filter on it, the sync trigger only
      // sets it once the first ledger entry lands, and the table's own default
      // is defined nowhere in this repo. A package that sold as inactive would
      // vanish from both screens until its first draw - which could never
      // happen, because the draw is on the screen it vanished from.
      const {data,error}=await supabase.from("packages").insert([{ ...packageRow, active: true, ...tenantField }]).select();
      if(error){handleDbError(error, "save package"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      const pkg = data[0];
      setPackages(prev=>[...prev,pkg]);

      // A free package is a real thing - a comped series, a goodwill gesture -
      // and it should not leave a zero receipt cluttering her day.
      if (price > 0) {
        const receipt = {
          client_id: pkg.client_id || null,
          client_name: pkg.client_name || "לקוחה",
          appointment_id: null,                    // paid up front, against no visit
          service: "חבילה: " + pkg.service,
          amount: price,
          payment_method,
          note: "חבילת " + pkg.total_sessions + " טיפולים",
          // The same item shape the cashier writes, so this receipt renders,
          // prints and sends through exactly the same path as every other one.
          items: JSON.stringify([{ id: Date.now(), name: "חבילה: " + pkg.service + " (" + pkg.total_sessions + " טיפולים)", price, qty: 1 }]),
          discount: 0,
          ...tenantField,
        };
        const { data: rec, error: recErr } = await supabase.from("receipts").insert([receipt]).select();
        if (recErr || !rec || !rec[0]) {
          // Loud, and actionable. The package IS saved; what is missing is the
          // money, and she is the only one who can put it in.
          console.error("[packages] receipt insert failed", recErr);
          toast("החבילה נשמרה, אך התשלום לא נרשם. כדי שלא יישכח, רשמי תשלום של ₪" + price + " בקופה.", "error");
          setShowPackageModal(false);
          return;
        }
        setReceipts(prev=>[...prev, rec[0]]);
        afterPaymentRecorded(rec[0], { autoSend: false });
      }

      setShowPackageModal(false);
      toast(price > 0 ? "החבילה נמכרה, ₪" + price : tr("החבילה נוספה"));
    } finally {
      setBusyKey("savePackage", false);
    }
  };

  // Drawing a session is an ENTRY IN A LEDGER, not an increment.
  //
  // This used to read used_sessions, add one, and write it back. A number with
  // no history behind it: tap twice and there was no record that it happened,
  // no way to know which visit either tap was for, and no way back except
  // editing the number - which is not a correction, it is a second
  // unverifiable claim. Six months later, when a client says she has two left,
  // nothing in the system could settle it.
  //
  // packages.used_sessions is now derived. A trigger recomputes it from the
  // entries and another refuses any direct write, so this could not go back to
  // incrementing even if something tried - which is the point. A guarantee
  // that depends on every future caller remembering is not a guarantee.
  //
  // The package row is re-read rather than patched from a response, because
  // the number we want was written by a trigger and is not in the insert's
  // result.
  const writePackageEntry = async (pkg, delta, { appointmentId = null, reason = "" } = {}) => {
    const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
    const tid = rpcTenant || settings?.tenant_id || pkg.tenant_id || null;
    const { error } = await supabase.from("package_entries").insert([{
      package_id: pkg.id,
      appointment_id: appointmentId,
      delta,
      reason,
      ...(tid ? { tenant_id: tid } : {}),
    }]);
    if (error) {
      // 23505 is package_entries_one_draw_per_appt: this visit has already
      // drawn from this package. Two taps on the same appointment is the
      // mistake this feature is most likely to make, and the database
      // refusing it beats a reversal she has to notice she needs.
      if (error.code === "23505") { toast(tr("כבר נוכה טיפול מהחבילה עבור התור הזה"), "error"); return null; }
      handleDbError(error, delta < 0 ? "draw package session" : "reverse package session");
      return null;
    }
    const { data: fresh } = await supabase.from("packages").select("*").eq("id", pkg.id).maybeSingle();
    if (fresh) setPackages(prev => prev.map(x => x.id === pkg.id ? fresh : x));
    return fresh || null;
  };

  const handleUsePackageSession = (pkg, opts) => runOnce(`pkg:${pkg.id}`, () => usePackageSessionNow(pkg, opts));
  const usePackageSessionNow = async (pkg, opts) => {
    if (guardWrite()) return;
    if (Number(pkg.used_sessions) >= Number(pkg.total_sessions)) { toast(tr("החבילה כבר נוצלה במלואה"), "error"); return; }
    const fresh = await writePackageEntry(pkg, -1, opts);
    if (!fresh) return;
    const used = Number(fresh.used_sessions);
    toast(used < Number(fresh.total_sessions) ? tr("טיפול {0}/{1}", [used, fresh.total_sessions]) : tr("החבילה הסתיימה"));
  };

  // The reversal. Not a delete: the mistaken draw stays in the ledger and the
  // correction sits beside it, so the history explains itself instead of
  // quietly no longer containing the error.
  const handleUndoPackageSession = (pkg) => runOnce(`pkg:${pkg.id}`, () => undoPackageSessionNow(pkg));
  const undoPackageSessionNow = async (pkg) => {
    if (guardWrite()) return;
    if (Number(pkg.used_sessions) <= 0) { toast(tr("אין טיפול לבטל"), "error"); return; }
    const fresh = await writePackageEntry(pkg, 1, { reason: "ביטול ניכוי" });
    if (!fresh) return;
    toast(tr("הניכוי בוטל, {0}/{1}", [fresh.used_sessions, fresh.total_sessions]));
  };

  const handleSaveWaitlist = async () => {
    if (guardWrite()) return;
    if(!newWaitlist.client_name||!newWaitlist.service){toast(!newWaitlist.client_name?tr("בחרי לקוחה לרשימת ההמתנה"):tr("בחרי טיפול לרשימת ההמתנה"),"error");return;}
    if(isBusy("saveWaitlist")) return;
    setBusyKey("saveWaitlist", true);
    try {
      const { data: rpcTenant } = await supabase.rpc("get_user_tenant_id");
      const wlTid = rpcTenant || settings?.tenant_id || null;
      // status written explicitly: the list filters on "waiting", and no
      // migration in the repo gives the column a default, so an entry saved
      // without it could vanish from the list on the next reload.
      const {data,error}=await supabase.from("waitlist").insert([{ ...newWaitlist, status: "waiting", ...(wlTid ? { tenant_id: wlTid } : {}) }]).select();
      if(error){handleDbError(error, "save waitlist"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setWaitlist(prev=>[...prev,data[0]]);setShowWaitlistModal(false);toast(tr("נוספה לרשימת המתנה"));
    } finally {
      setBusyKey("saveWaitlist", false);
    }
  };

  const handleSaveProtocol = async () => {
    if (guardWrite()) return;
    if(!newProtocol.brand||!newProtocol.name){toast(tr("חסרים מותג ושם, אפשר להשלים"),"error");return;}
    if(isBusy("saveProtocol")) return;
    setBusyKey("saveProtocol", true);
    try {
      const {data,error}=await supabase.from("treatment_protocols").insert([newProtocol]).select();
      if(error){handleDbError(error, "save protocol"); return;}
      if(!data||!data[0]){toast(SAVE_FAILED_HE,"error");return;}
      setProtocols(prev=>[data[0],...prev]);setShowProtocolModal(false);setNewProtocol(emptyProtocol);toast(tr("הפרוטוקול נשמר"));
    } finally {
      setBusyKey("saveProtocol", false);
    }
  };

  const handleExportCSV = () => {
    // Until the older payments are in, the file would silently stop at about six months back: say so instead of handing her an accountant's file that is short.
    if(!historyReady){toast(deferred.history==="error"?tr("לא הצלחנו לטעון את כל ההיסטוריה, אז הקובץ היה חלקי. אפשר לנסות שוב מהסרגל שלמעלה."):tr("ההיסטוריה עוד בדרך. אפשר לנסות שוב בעוד רגע."),"info");return;}
    // Voided payments stay in the file but are marked, so the export agrees with the totals on screen instead of counting them as income.
    const voidedIds=new Set(receiptVoids.map(v=>String(v.receipt_id)));
    const rows=[["שם","טלפון","שירות","תאריך","סכום","אמצעי תשלום","טיפ","הנחה","מבוטל"]];
    receipts.forEach(r=>{const client=clients.find(c=>String(c.id)===String(r.client_id));rows.push([r.client_name,client?.phone||"",r.service,localDayKey(r.created_at)||"",r.amount,r.payment_method,Number(r.tip)||0,Number(r.discount)||0,voidedIds.has(String(r.id))?"כן":""]);});
    // Quote every cell (escaping embedded quotes) so values containing commas
    // — e.g. a multi-item receipt service "פנים, עיסוי" — don't shift columns.
    // A client name comes from a public form: a cell starting with = + - @ would run as a formula in Excel. Numbers are left alone.
    const esc=v=>{let t=String(v??"");if(typeof v!=="number"&&/^[=+\-@\t\r]/.test(t))t="'"+t;return `"${t.replace(/"/g,'""')}"`;};
    const csv=rows.map(r=>r.map(esc).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    // On a phone this is the share sheet (the home-screen app and Instagram/Facebook drop a blob download without a word; Safari hides it in Files).
    deliverFile(blob,`kalmea_payments_${today}.csv`).then(o=>{const t=deliveryToast(o);if(t)toast(t.text,t.kind);});
  };

  // === WHATSAPP CENTER HANDLERS ===
  // Returns true only when a WhatsApp window really opened: a blocked popup is not a message she sent.
  const waSendOne = (clientId, phone, message) => {
    if(!phone){toast(tr("אין מספר טלפון ללקוחה"),"error");return false;}
    const link=waMsg(phone,message);
    const opened=!!(link&&window.open(link,"_blank"));
    if(opened&&clientId)setWaSentToday(prev=>({...prev,[clientId]:true}));
    return opened;
  };

  const waSendGroup = (items) => {
    const targets=items.filter(it=>it.phone);
    if(targets.length===0){toast(tr("אין נמענים עם טלפון"),"error");return;}
    askConfirm({
      title:tr("שליחה קבוצתית"),
      message:tr("ננסה לפתוח {0} חלונות וואטסאפ, אחד לכל לקוחה. בטלפון הדפדפן פותח בדרך כלל רק את הראשון, ואז אפשר ללחוץ \"שלחי\" ליד כל אחת. לאשר?", [targets.length]),
      confirmText:tr("שלחי"),
      onConfirm:async()=>{
        // A phone lets a page open a window only from a tap, so after the first one the rest are usually blocked. Count what
        // really opened and say how many are left, instead of a toast that claims all of them opened (2026-11-03 UX review).
        let opened=0;
        for(const t of targets){
          if(!waSendOne(t.clientId,t.phone,t.message))break;
          opened++;
          await new Promise(r=>setTimeout(r,700));
        }
        const left=targets.length-opened;
        if(left>0)toast(opened?tr("נפתח וואטסאפ ל-{0} מתוך {1}. הדפדפן חסם את השאר, אפשר ללחוץ \"שלחי\" ליד כל אחת.", [opened, targets.length]):tr("הדפדפן חסם את פתיחת וואטסאפ. אפשר ללחוץ \"שלחי\" ליד כל אחת."),"info");
        else toast(opened===1?tr("נפתח וואטסאפ עם הודעה מוכנה. נשאר ללחוץ שליחה."):tr("נפתח וואטסאפ ל-{0} לקוחות. נשאר ללחוץ שליחה בכל שיחה.", [opened]));
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
    if (!beforeFile && !afterFile) { toast(tr("בחרי לפחות תמונה אחת"), "error"); return; }
    setPhotoUploading(true);
    try {
      const tid = settings?.tenant_id;
      if (!tid) { toast(tr("לא זוהה עסק. אפשר לרענן את המסך ולנסות שוב."), "error"); return; }
      // Store tenant-scoped PATHS (private bucket); display signs them on demand.
      let beforeUrl = null, afterUrl = null;
      // An upload that failed used to be ignored, and the row was saved pointing at a photo that does not exist. Now
      // each one is checked, and nothing is saved unless every chosen photo went up.
      const putOne = async (file, side) => {
        if (file.size > MAX_SOURCE_BYTES) { toast(TOO_LARGE_SOURCE_HE, "error"); return null; }
        let blob;
        try { ({ blob } = await compressImage(file, 1280, 0.82)); } catch { blob = null; }
        if (!blob || notUploadable(blob)) { toast(COULD_NOT_SHRINK_HE, "error"); return null; }
        const fn = clientImagePath(tid, clientId, `${side}-${Date.now()}.jpg`);
        const { error: upErr } = await supabase.storage.from(PRIVATE_BUCKET).upload(fn, blob, { contentType: "image/jpeg" });
        if (upErr) { handleDbError(upErr, "upload client photo"); return null; }
        return fn;
      };
      if (beforeFile) { beforeUrl = await putOne(beforeFile, "before"); if (!beforeUrl) return; }
      if (afterFile) {
        afterUrl = await putOne(afterFile, "after");
        if (!afterUrl) { if (beforeUrl) await supabase.storage.from(PRIVATE_BUCKET).remove([beforeUrl]); return; }
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
      toast(tr("התמונות נשמרו"));
      setPhotoTreatmentPrefill("");
      loadClientPhotos(clientId);
    } catch { toast(tr("שגיאה בהעלאת התמונות"), "error"); }
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
      const data = await res.json().catch(() => ({}));
      if (!data.success) { toast(data.error || tr("לא הצלחנו לנתח את התמונה, אפשר לנסות שוב"), "error"); setScanLoading(false); return; }
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
      toast(tr("✦ הסריקה נשמרה לכרטיס"));
    } catch (err) {
      toast(tr("שגיאה בסריקה"), "error");
    } finally {
      setScanLoading(false);
      loadUpgrades(true); // the meter and the chip show the scan she just used
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
      const { data, error: fbErr } = await supabase
        .from("facebook_pages")
        .select("page_id, page_name, is_active, instagram_business_id");
      // A failed read is not "no page connected": say so instead of offering to connect a page she already connected.
      if (fbErr && !/does not exist|schema cache/i.test(fbErr.message || "")) { toast(tr("לא הצלחנו לבדוק את החיבור לפייסבוק. נסי לרענן את הדף."), "error"); return; }
      const all = Array.isArray(data) ? data : [];
      setFbPages(all);
      const firstOn = all.find((p) => p.is_active);
      setFbPage(firstOn ? { page_name: firstOn.page_name } : null);
    } catch { /* non-fatal — leave as not-connected */ }
    // Failed webhook events in the last 7 days. head:true fetches no rows, only
    // the count; RLS scopes it to the tenant. If the table is missing (migration
    // not applied yet) this errors and the badge simply stays off.
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("facebook_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("processed", false)
        .gte("created_at", since);
      setFbEventFails(error ? 0 : (count || 0));
    } catch { /* non-fatal — badge stays off */ }
  };

  // Turn lead delivery from one Page on or off (/api/facebook/pages). Nothing is deleted; the Page row stays.
  const toggleFbPage = async (pageId, active) => {
    if (fbPageBusy) return;
    setFbPageBusy(pageId);
    try {
      const res = await fetch("/api/facebook/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, active }) });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d || !d.success) { toast((d && d.error) || tr("לא הצלחנו לעדכן את הדף"), "error"); return; }
      await loadFbConnection();
      toast(active ? tr("קבלת פניות מהדף הופעלה") : tr("קבלת פניות מהדף הופסקה"));
    } catch { toast(tr("לא הצלחנו לעדכן את הדף. בדקי את החיבור."), "error"); }
    finally { setFbPageBusy(""); }
  };
  // The Facebook connection (page + failed-event count) is only shown on the content and leads tabs.
  useEffect(() => {
    if (activeTab === "campaigns" || activeTab === "leads") loadFbConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  // ...and in Settings > connections, which lists every Page.
  useEffect(() => {
    if (showSettings && settingsGroup === "connections") loadFbConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, settingsGroup]);

  // Fetch live Facebook ad campaigns for the current tenant
  const fbLoadSeq = useRef(0);
  const loadFbCampaigns = async (preset) => {
    // Only the newest request may write: switching the range quickly used to let a slow earlier answer land
    // last and show the wrong period.
    const seq = ++fbLoadSeq.current;
    setFbLoading(true); setFbError(null);
    try {
      const dp = preset || fbDatePreset;
      const res = await fetch(`/api/marketing/campaigns?datePreset=${dp}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== fbLoadSeq.current) return;
      if (data.ok) {
        setFbCampaigns(data.campaigns || []);
        setFbTotals(data.totals || null);
      } else {
        setFbCampaigns([]);
        setFbError(data.error || tr("לא הצלחנו לטעון את הקמפיינים"));
      }
    } catch (err) {
      if (seq !== fbLoadSeq.current) return;
      setFbError(tr("אין חיבור. לא הצלחנו לטעון את הקמפיינים, נסי שוב"));
      setFbCampaigns([]);
    } finally {
      if (seq === fbLoadSeq.current) setFbLoading(false);
    }
  };

  // === AI MARKETING: full flow (strategy -> posts with images, + groups) ===
  // The generated script is kept for the tab session: it is a paid AI call, and navigating away or a refresh
  // used to lose it.
  useEffect(() => {
    try {
      if (reelData) return;
      const raw = sessionStorage.getItem("kalmea:last-reel");
      const o = raw ? JSON.parse(raw) : null;
      if (o && o.reel && typeof o.reel === "object") { setReelData(o.reel); if (typeof o.topic === "string") setReelTopic(o.topic); }
    } catch { /* storage unavailable: nothing to restore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const generateReel = async () => {
    if (!reelTopic.trim()) { toast(tr("כתבי נושא לרילס"), "error"); return; }
    if (reelLoading) return;
    setReelLoading(true); setReelError(null); setReelData(null);
    try {
      const res = await fetch("/api/marketing/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: reelTopic.trim(), duration: reelDuration, vibe: reelVibe }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.reel) {
        setReelData(data.reel);
        try { sessionStorage.setItem("kalmea:last-reel", JSON.stringify({ reel: data.reel, topic: reelTopic.trim() })); } catch { /* optional */ }
        if (data.capNotice) toast(data.capNotice);
      } else {
        setReelError(data.error || tr("לא הצלחנו ליצור את הרילס, אפשר לנסות שוב"));
      }
    } catch (err) {
      setReelError(tr("אין חיבור. הרילס לא נוצר, אפשר לנסות שוב"));
    } finally {
      setReelLoading(false);
      loadUpgrades(true); // the meter and the chip show the reel she just used
    }
  };

  // channel: where she is about to paste it (lib/bookingSource.ts), so a booking from it is counted under that channel.
  // okMsg: the toast after a copy, when the caller knows better where it is going (the booking buttons card names the platform).
  const copyPublicLink = async (kind, channel = "link", okMsg = "") => {
    const t = settings.tenant_id;
    if (!t) { toast(tr("חסר מזהה עסק, אפשר לרענן את הדף"), "error"); return false; }
    // The origin the app is served on, so the copied link points at THIS
    // install (bloomos.com today) rather than a hardcoded vendor address.
    const base = (typeof window !== "undefined" && window.location.origin) || APP_URL;

    if (kind === "scan") {
      // Always the signed link, on this origin - the one the QR is drawn from.
      const url = scanLink || (await loadScanLink());
      if (!url) { toast(scanLinkError || tr("לא הצלחנו להפיק את הקישור"), "error"); return; }
      try {
        await navigator.clipboard.writeText(url);
        toast(tr("קישור הסורק הועתק"));
      } catch {
        toast(url, "info");
      }
      return;
    }

    // A booking link with no treatment on it can book nothing ("רשימת הטיפולים עדיין בהכנה"): first a treatment, then the link. The
    // day-1 nudge, the setup checklist and the tour all copy it, and copying ticked the checklist step (2026-11-02 audit).
    if (kind === "book" && activeServices.length === 0) {
      toast(tr("קודם מוסיפים לפחות טיפול אחד, ואז הקישור מוכן לשליחה"), "info");
      openSetupTab("services", "newService");
      return false;
    }

    // Her readable URL when she has claimed one; the original otherwise. Both
    // resolve to the same page - /book?t= has to keep working forever, because
    // it is in every link she has already sent.
    const url = kind === "community" ? `${base}/community?t=${t}`
      : withSource(mySlug ? `${base}/${encodeURIComponent(mySlug)}` : `${base}/book?t=${t}`, channel);
    try {
      await navigator.clipboard.writeText(url);
      toast(okMsg ? okMsg : kind === "scan" ? tr("קישור הסורק הועתק") : kind === "community" ? tr("קישור הקהילה הועתק") : tr("הקישור לקביעת תור הועתק. עכשיו הדביקי אותו בוואטסאפ ללקוחה"));
      if (kind === "book") {
        setLinkShared(true); try { localStorage.setItem(`kl_link_shared_${t}`, "1"); } catch { /* private mode: the tick lasts this visit */ }
        // Also on her account, once: the tick was per device, so copying on the phone left the step open on the computer.
        if (!settings?.automations?.link_shared_at) persistTourPatch({ link_shared_at: new Date().toISOString() });
      }
      // Her first link is the long one (an id, not her name). Say once, kindly, that a short readable address exists.
      if (kind === "book" && !mySlug) setTimeout(() => toast(tr("הקישור עוד ארוך. בהגדרות ← הדף שלי אפשר לבחור כתובת קצרה עם שם העסק."), "info"), 900);
      return true;
    } catch {
      // No clipboard here (the in-app browsers of Instagram and Facebook): hand the link to the phone's share sheet while the tap is still
      // live, and only then fall back to showing it. A bare address in a toast that vanishes in three seconds cannot be copied.
      // Shared through the share sheet counts like a copy, on this phone AND on her account (it used to tick only until the next reload).
      try { if (typeof navigator.share === "function") { await navigator.share({ url }); if (kind === "book") rememberLinkShared(); return true; } }
      catch (e) { if (e && e.name === "AbortError") return false; }
      toast(tr("אי אפשר להעתיק כאן. הקישור: {0}", [url]), "info");
      return false;   // not copied: the day-1 nudge stays so she can try again
    }
  };
  // The tick for "she sent her booking link", on this phone and once on her account. Same three marks the copy path writes above.
  const rememberLinkShared = () => {
    const t = settings.tenant_id;
    setLinkShared(true); try { localStorage.setItem(`kl_link_shared_${t}`, "1"); } catch { /* private mode: the tick lasts this visit */ }
    if (!settings?.automations?.link_shared_at) persistTourPatch({ link_shared_at: new Date().toISOString() });
  };
  // "שליחה בוואטסאפ" on the 3-step card: opens HER WhatsApp with the message and link ready, and she picks the client and presses send.
  // Nothing is sent by us. The same no-treatment guard as copyPublicLink: a link with no treatment on it can book nothing.
  const shareBookingWhatsApp = () => {
    const t = settings.tenant_id;
    if (!t) { toast(tr("חסר מזהה עסק, אפשר לרענן את הדף"), "error"); return; }
    if (activeServices.length === 0) {
      toast(tr("קודם מוסיפים לפחות טיפול אחד, ואז הקישור מוכן לשליחה"), "info");
      openSetupTab("services", "newService");
      return;
    }
    const base = (typeof window !== "undefined" && window.location.origin) || APP_URL;
    const url = withSource(mySlug ? `${base}/${encodeURIComponent(mySlug)}` : `${base}/book?t=${t}`, "whatsapp");
    const w = window.open(`https://wa.me/?text=${encodeURIComponent(firstLinkMessage(url, settings?.business_name))}`, "_blank", "noopener,noreferrer");
    // noopener makes window.open return null even when it worked, so a null is not proof of a block: the tick is kept either way,
    // because the button only ever opens her own WhatsApp and she decides whether to send.
    void w;
    rememberLinkShared();
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
      // Refusals (not signed in, plan, a spend limit) come back as ordinary JSON,
      // before anything is streamed. A real answer arrives as newline-delimited
      // JSON: { t: "d", x: text } deltas, then { t: "done" } (or { t: "error" }).
      if (!(res.headers.get("content-type") || "").includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || tr("היועץ לא הצליח לענות"), "error");
        return;
      }
      const aid = "a-" + Date.now();
      let shown = "";
      const show = (text, streaming) => setAdvisorMessages(prev => {
        const list = prev || [];
        return list.some(m => m.id === aid)
          ? list.map(m => (m.id === aid ? { ...m, content: text, streaming } : m))
          : [...list, { id: aid, role: "assistant", content: text, streaming }];
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let failed = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          let ev;
          try { ev = JSON.parse(raw); } catch { continue; }
          if (ev.t === "d") { shown += ev.x; show(shown.trimStart(), true); }
          else if (ev.t === "done") { show(shown.trim(), false); if (ev.capNotice) toast(ev.capNotice); }
          else if (ev.t === "error") failed = ev.error || "היועץ לא הצליח לענות";
        }
      }
      if (failed) {
        // Keep what was written (it was shown), but it was not saved: say so.
        if (shown) show(shown.trim(), false);
        toast(failed, "error");
      }
    } catch (err) {
      toast(tr("אין חיבור. היועץ לא קיבל את השאלה, נסי שוב"), "error");
    } finally {
      setAdvisorSending(false);
      loadUpgrades(true); // the meter and the chip show the question she just asked
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
      const { error: ue } = await supabase.storage.from(PUBLIC_BUCKET).upload(fileName, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (!ue) {
        const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(fileName);
        setNewPost(p => ({ ...p, image_url: urlData.publicUrl }));
        toast(tr("התמונה הועלתה"));
      } else { toast(tr("שגיאה בהעלאת תמונה"), "error"); }
    } catch { toast(COULD_NOT_SHRINK_HE, "error"); } // compressImage rejects only when the phone cannot read the photo
    finally { setPostImageUploading(false); }
  };

  // Save a new community post
  const saveCommunityPost = async () => {
    if (guardWrite()) return;
    if (savingPost) return;
    if (!newPost.body && !newPost.title) { toast(tr("כתבי תוכן לפוסט"), "error"); return; }
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
      // Zero rows back is a refusal, not a success. Saying "published" here and
      // leaving the composer empty would lose what she wrote.
      if (!data || !data[0]) { toast(tr("הפוסט לא פורסם. נסי שוב"), "error"); return; }
      setCommunityPosts(prev => [data[0], ...prev]);
      setNewPost({ title:"", body:"", post_type:"update", cta_label:"", image_url:"" });
      setShowPostModal(false);
      toast(tr("הפוסט פורסם למרחב הלקוחות"));
    } finally { setSavingPost(false); }
  };

  // Delete a community post
  // Permanent, and it was one tap.
  //
  // Every other destructive path in this app asks first or is reversible: a
  // service checks four tables for references before it will delete, an expense
  // goes through askConfirm, an appointment soft-cancels with a 6.5s undo. This
  // one deleted a post outright on a single tap of a 10.5px "מחיקה" link sitting
  // next to the post's own text, with no undo and no way to get the wording back.
  //
  // Takes the post rather than an id so the dialog can quote what is about to
  // go, the same way the expense dialog names the expense. "Are you sure?" with
  // nothing in it is a question she cannot actually answer.
  const deleteCommunityPost = async (post) => {
    if (guardWrite()) return;
    const id = post?.id ?? post;   // tolerate a bare id from any older caller
    const body = String(post?.body || "").trim();
    const excerpt = body.length > 60 ? `${body.slice(0, 60)}…` : body;
    askConfirm({
      title: tr("מחיקת פוסט"),
      message: excerpt
        ? tr("למחוק את הפוסט \"{0}\"? לא ניתן לשחזר אותו.", [excerpt])
        : tr("למחוק את הפוסט? לא ניתן לשחזר אותו."),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        // Supabase returns { error } rather than throwing, so a try/catch never
        // fired on a real DB/RLS failure — the post vanished from the UI but not
        // the database.
        const { error } = await supabase.from("community_posts").delete().eq("id", id);
        if (error) { handleDbError(error, "delete community post"); return; }
        setCommunityPosts(prev => prev.filter(p => p.id !== id));
        toast(tr("הפוסט נמחק"));
      },
    });
  };

  const loadWaMessages = async () => {
    setWaLogLoading(true); setWaLogError("");
    try {
      const res = await fetch("/api/messages");
      const data = await res.json().catch(() => ({}));
      if (data.success) setWaMessages(data.messages || []);
      else setWaLogError(data.error || tr("לא הצלחנו לטעון את ההודעות, אפשר לרענן"));
    } catch (err) {
      setWaLogError(tr("אין חיבור. לא הצלחנו לטעון את ההודעות, אפשר לרענן"));
    }
    setWaLogLoading(false);
  };
  // The dashboard reads the same log to surface automated sends that failed in
  // the last day (see the "failed-auto" queue item). Loaded once, when the
  // dashboard is first shown, and shared with the WhatsApp tab's log view so
  // opening that view later costs nothing.
  useEffect(()=>{
    if(activeTab!=="dashboard"||waMessages!==null||waLogLoading) return;
    loadWaMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeTab]);
  // Hebrew labels for the message_type column. slot_offer and lead_bulk are
  // written by the gap-fill and lead-template send paths.
  // Hebrew labels for message_type, and the status column: lib/waStatusLabel.js.
  const WA_TYPE_LABELS = { ...WA_TYPE_LABELS_BASE, receipt:PAYMENT_NOTICE_HE };


  // What "status" has always meant versus what actually happened: "sent"
  // (lib/whatsapp.js) only ever meant GreenAPI's API accepted the call - its
  // server returns 200 even when the WhatsApp session behind it is logged
  // out, so this is NOT proof of arrival. delivery_status is the honest
  // answer, written only when GreenAPI's own outgoingMessageStatus webhook
  // confirms it (app/api/whatsapp-webhook/route.js) - null means exactly
  // "handed off, nothing has confirmed it arrived yet", not "delivered".
  // See supabase/migrations/pending/whatsapp-delivery-status.sql.
  const waDeliveryLabel = waStatusLabel;



  // ── A link of its own for every screen (lib/screenLink.ts). The address follows the screen, Back and forward follow the
  // address. It is read only once the data has loaded: until then settings has no flags, so a tab a tenant opted into
  // looks hidden, and the screens' loaders need the tenant. Layout effects, so a refresh never paints היום first. The
  // write hook stays above the read hook: in the commit that reads the address it must still be switched off.
  const screenLinkReady = useRef(false);
  useLayoutEffect(() => {
    if (!screenLinkReady.current) return;
    const at = { tab: activeTab, section: showSettings ? settingsGroup : null, view: viewOf(activeTab, { waView, marketingView, aiPostsView }) };
    const { pathname, search, hash } = window.location;
    if (!sameScreen(screenFromSearch(search), at)) window.history.pushState(null, "", pathname + searchForScreen(search, at) + hash);
  }, [activeTab, showSettings, settingsGroup, waView, marketingView, aiPostsView]);
  const openScreenRef = useRef(null);
  openScreenRef.current = () => {
    const { pathname, search, hash } = window.location;
    const wanted = screenFromSearch(search);
    if (wanted.tab && (!isTabVisible(settings, wanted.tab) || !viewAllowsTab(settings, wanted.tab))) wanted.tab = "dashboard";
    if (showSettings && !wanted.section && panelDirty) {
      // Back while she has unsaved changes: the panel stays until she answers, and the address with it.
      window.history.pushState(null, "", pathname + searchForScreen(search, { tab: null, section: settingsGroup, view: null }) + hash);
      closeSettings();
      return;
    }
    const clean = searchForScreen(search, wanted);
    if (clean !== search) window.history.replaceState(null, "", pathname + clean + hash);
    if (wanted.section) { setSettingsGroup(wanted.section); if (!showSettings) openSettings(); return; }
    if (showSettings) closeSettings();
    setActiveTab(wanted.tab);
    if (wanted.tab === "whatsapp") {
      setWaView(wanted.view || "send");
      if (wanted.view === "log" && waMessages === null) loadWaMessages();
    }
    if (wanted.tab === "campaigns") {
      setMarketingView(wanted.view === "campaigns" ? "campaigns" : "posts");
      setAiPostsView(wanted.view === "reels" ? "reels" : "studio");
    }
  };
  useLayoutEffect(() => {
    if (loading || screenLinkReady.current) return;
    screenLinkReady.current = true;
    openScreenRef.current();
  }, [loading]);
  useEffect(() => {
    const onPop = () => { if (screenLinkReady.current) openScreenRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if(loading) return (
    <div style={{minHeight:"100dvh",background:"linear-gradient(180deg,var(--surface-2) 0%,#FFFFFF 340px)",padding:"22px 18px",fontFamily:"var(--font-heebo),'Heebo',sans-serif"}}>
      <style>{`@keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}.skel{background:linear-gradient(90deg,var(--pc-tint) 25%,#F8F1F4 50%,var(--pc-tint) 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}`}</style>
      <div style={{maxWidth:1180,margin:"0 auto"}}>
        <div className="skel" style={{width:180,height:26,marginBottom:22}}/>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:22}}>
          {[0,1,2,3].map(i=><div key={i} className="skel" style={{flex:"1 1 160px",height:90,borderRadius:"var(--r-lg)"}}/>)}
        </div>
        <div className="skel" style={{width:140,height:20,marginBottom:14}}/>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[0,1,2,3,4].map(i=><div key={i} className="skel" style={{width:"100%",height:54,borderRadius:"var(--r-md)"}}/>)}
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
    <div style={{minHeight:"100dvh",background:"linear-gradient(180deg,var(--surface-2) 0%,#FFFFFF 340px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"22px 18px",fontFamily:"var(--font-heebo),'Heebo','Assistant',sans-serif",direction:uiDir()}}>
      <div style={{width:"100%",maxWidth:440,background:"var(--surface,#FFFFFF)",border:"1px solid var(--line,#ECE4F0)",borderRadius:"var(--r-lg)",boxShadow:"var(--shadow-lg)",padding:"32px 26px",textAlign:"center"}}>
        <div aria-hidden style={{width:60,height:60,margin:"0 auto 18px",borderRadius:"50%",background:"var(--pc-tint,#E9EBEA)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-3xl)"}}>{loadError.offline ? "📶" : "⚠️"}</div>
        <h1 style={{fontSize:"var(--t-2xl)",fontWeight:600,margin:"0 0 10px",color:"var(--ink,#2A2233)"}}>
          {loadError.offline ? tr("אין חיבור לאינטרנט") : tr("לא הצלחנו לטעון את הנתונים")}
        </h1>
        <p style={{fontSize:"var(--t-md)",lineHeight:1.7,color:"var(--ink-2,#6B6275)",margin:"0 0 22px"}}>
          <strong>{tr("הנתונים שלך במקום.")}</strong> {tr("לא נמחק כלום.")}
          {loadError.offline
            ? tr(" הטלפון לא מחובר לרשת כרגע, אז לא הצלחנו להביא את היומן שלך. ברגע שיהיה חיבור, הכל יחזור כרגיל.")
            : tr(" פשוט לא הצלחנו להביא אותם כרגע, ולכן אנחנו לא מציגים לך מסך ריק שנראה כאילו אין לך לקוחות.")}
          <br/>
          {loadError.offline
            ? tr("בדקי את החיבור ונסי שוב.")
            : tr("אפשר לנסות שוב. אם זה חוזר, שלחי לנו את השורה הקטנה שלמטה.")}
        </p>
        <button
          type="button"
          onClick={()=>{ setLoadError(null); setLoading(true); loadAll(); }}
          style={{width:"100%",padding:"14px 20px",borderRadius:"var(--r-full)",border:"none",background:"linear-gradient(135deg,#50655E 0%,#1A3128 100%)",color:"#FFFFFF",fontSize:"var(--t-lg)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}
        >
          {tr("נסי שוב")}
        </button>
        {/* Sign-out is hidden while offline ON PURPOSE. Signing out clears the
            local session, and with no network she cannot sign back in - the
            "fix it" button would lock her out of her own app until the
            connection returns. It is only useful for a genuine auth problem. */}
        {!loadError.offline && (
          <button
            type="button"
            onClick={()=>{ supabase.auth.signOut().finally(()=>router.replace("/login")); }}
            style={{width:"100%",padding:"12px 20px",borderRadius:"var(--r-full)",border:"1px solid var(--line,#E2D6EA)",background:"transparent",color:"var(--ink-2,#6B6275)",fontSize:"var(--t-md)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
          >
            {tr("יציאה והתחברות מחדש")}
          </button>
        )}
        <p style={{fontSize:"var(--t-xs)",color:"var(--ink-3,#9A93A3)",margin:"18px 0 0",direction:"ltr",fontFamily:"ui-monospace,Menlo,Consolas,monospace",wordBreak:"break-word"}}>
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
  // The day's five. Leads and messages live inside לקוחות (a segment bar on
  // those three screens), so the bar holds what she opens every day and
  // תוכן, the one door to posts, reels and campaigns.
  // "קופה, ניקובים ודוחות בלבד" (lib/viewMode.ts): היום, לקוחות, קופה and הכנסות instead. A view preference only.
  const tillOnly = isTillOnly(settings);
  const BOTTOM_NAV = [
    {id:"dashboard", label:tr("היום")},
    {id:"calendar",  label:tr("יומן")},
    {id:"clients",   label:tr("לקוחות")},
    {id:"cashier",   label:tr("קופה")},
    {id:"campaigns", label:tr("תוכן")},
    {id:"tax",       label:tr("הכנסות")},
  ].filter(item => isTabVisible(settings, item.id) && bottomNavIds(settings).includes(item.id));
  // Screens that highlight לקוחות in the bar: people, however they arrived.
  const PEOPLE_TABS = ["clients","leads","whatsapp"];
  // The two stubs (community, protocols; lib/featureFlags.ts STUB_TABS) are
  // filtered out of BOTH nav lists unless this tenant has opted back in, and
  // packages, advisor and leads only when she switched them off herself
  // (packages stopped being a stub on 2026-09-22). Hidden, not deleted: every
  // loader, render block and table below is untouched, so the flag brings a
  // tab back with its data intact. campaigns and insights are never filtered -
  // see lib/featureFlags.ts for why that is a deliberate exception and not an
  // oversight.
  const MORE_NAV = moreNavIds(settings, visibleTabIds(settings, ["insights","tax","packages","protocols","advisor","community","help"]));

  const NAV_ITEMS = [
    {id:"dashboard",label:tr("היום")},
    {id:"insights", label:tr("תובנות")},
    {id:"calendar", label:tr("יומן")},
    {id:"clients",  label:tr("לקוחות")},
    {id:"leads",    label:tr("פניות")},
    {id:"cashier",  label:tr("קופה")},
    {id:"tax",      label:tr("סיכום הכנסות")},
    {id:"whatsapp", label:tr("הודעות")},
    {id:"campaigns",label:tr("תוכן")},
    {id:"community",label:tr("קהילה")},
    {id:"packages", label:tr("חבילות")},
    {id:"protocols",label:tr("פרוטוקולים")},
    {id:"advisor",  label:tr("יועץ AI")},
    {id:"help",     label:tr("עזרה")},
  ].filter(item => isTabVisible(settings, item.id) && viewAllowsTab(settings, item.id));
  // לקוחות · פניות · הודעות: one row of chips on each of the three people
  // screens, so they read as one place. Leads keeps its badge here.
  const peopleSegments = () => {
    const segs = [["clients","לקוחות"],["leads","פניות"],["whatsapp","הודעות"]].filter(([id]) => isTabVisible(settings, id) && viewAllowsTab(settings, id));
    if (segs.length < 2) return null;
    return (
 <div style={{display:"inline-flex",gap:3,marginBottom:14,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:4,boxShadow:"var(--shadow-xs)"}}>
        {segs.map(([id,label])=>(
 <button key={id} onClick={()=>setActiveTab(id)} className="primary-btn" style={{padding:"8px 16px",minHeight:44,fontSize:"var(--t-sm)",borderRadius:"var(--r-sm)",background:activeTab===id?pcGrad:"transparent",color:activeTab===id?"var(--pc-contrast)":"var(--ink-2)",fontWeight:600,display:"flex",gap:6,alignItems:"center"}}>
            {trv(label)}{id==="leads"&&newLeadsCount>0&&<span style={{background:activeTab===id?"rgba(255,255,255,0.35)":pcGrad,color:activeTab===id?"inherit":"var(--pc-contrast)",fontSize:"var(--t-xs)",fontWeight:700,padding:"1px 7px",borderRadius:"var(--r-full)"}}>{newLeadsCount}</span>}
 </button>
        ))}
 </div>
    );
  };
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
      case "help":      return svg(<><circle cx="12" cy="12" r="9" {...p}/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 4" {...p}/><path d="M12 17.3h.01" {...p} strokeWidth={2.4}/></>);
      default: return svg(<circle cx="12" cy="12" r="8" {...p}/>);
    }
  };

  // ── CLOSED: the trial ended without payment, or the account is paused ──
  // The whole system closes (no read-only mode). loadAll stopped before loading
  // any data for this case; this replaces the entire shell, so no tab, menu or
  // calendar is reachable. A demo session is never closed.
  if(planInfo.isBlocked && !isDemoTenantId(planRow?.id)) return (
    <PlanBlockedScreen
      plan={planInfo}
      businessName={planRow?.name || ""}
      isDemo={false}
      toast={toast}
      onSignOut={()=>{ supabase.auth.signOut().finally(()=>router.replace("/login")); }}
      // After she pays (card page, or by arrangement), the dashboard reopens by itself: the plan is read again and, once it is
      // active, loadAll runs from the start (the same path as the retry button). Answers whether it reopened.
      recheck={async()=>{
        const { data, error } = await supabase.from("tenants").select("*").eq("id", planRow?.id).maybeSingle();
        if (error || !data || planState(data).isBlocked) return false;
        setPlanRow(data); setLoadError(null); setLoading(true); loadAll();
        return true;
      }}
    />
  );

  // backgroundAttachment:"fixed" was removed from the shell below, not
  // restyled. iOS has never implemented it properly, and in a standalone
  // install it paints the wash into a wrong-sized box, letting the white body
  // show through at the screen edges - which reads as side gutters even though
  // the content is full width. The gradient itself is unchanged; only the
  // attachment mode is gone, so this is a paint fix, not a visual change.
  return (
 <div dir={uiDir()} style={{position:"relative",zIndex:0,fontFamily:"var(--sans)",background:BRAND_WASH,minHeight:"100dvh",display:"flex",flexDirection:"column",color:"var(--ink)"}}>
                {/* skipTop: no background blossom lands behind the header, so
                    the flowers in the Kalmea logo are the only ones there and
                    nothing competes with them. */}
                {/* The same two-hue palette /login uses - peach blush plus
                    lilac - rather than one tint of the tenant accent. Two
                    distinct hues are what make the login florals read as
                    colourful watercolor instead of a single-colour wash. */}
 <FloralCorners idPrefix="app" fixed zIndex={1} blush={FLORAL_BLUSH} gold={FLORAL_LILAC} skipTop opacity={floralOpacity} />
 <style>{`
        .serif{font-family:var(--display)}

        /* ── Safe area, for everything anchored to the TOP of the viewport ──
           layout.tsx sets viewportFit:"cover", which is what lets the app run
           edge to edge in a home-screen install - and what puts anything at
           top:0 underneath the clock and the battery.

           .app-header was given padding-top:env(safe-area-inset-top) when that
           was found; nothing else was. These are the four surfaces that were
           missed. The drawers and the toast stack are handled here rather than
           inside the mobile media query because both are pinned to the viewport
           top on every screen size, and the inset is 0px on a desktop anyway -
           so one rule is correct everywhere instead of two that can drift.

           The ✕ is positioned against the header, which starts at the very top
           of the drawer, so it needs the same offset the header does. */
        .drawer-head{padding-top:calc(22px + env(safe-area-inset-top, 0px))!important}
        .drawer-close{top:calc(14px + env(safe-area-inset-top, 0px))!important}
        /* A confirmation under the status bar is not a confirmation. This one
           carries the toast for every write in the app, including the lead
           status and reminder toasts added alongside it. */
        .toast-stack{top:calc(14px + env(safe-area-inset-top, 0px))}

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
        /* 2026-10-20 design pass: WhatsApp buttons in the brand's calm language (white, WhatsApp-green text and hairline,
           AA on white) instead of a saturated green pill repeated down every list. */
        .wa-btn{background:var(--surface);color:#0F7A3E;border:1px solid rgba(18,140,74,0.45);border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none;transition:transform 0.12s,box-shadow 0.2s}
        .wa-btn:hover{background:#EEF8F1;transform:translateY(-1px);box-shadow:0 4px 12px rgba(18,140,74,0.15)}
        .call-btn{background:var(--pc);color:var(--surface);border:none;border-radius:var(--r-full);padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
        .icon-btn{background:var(--pc-tint);border:none;border-radius:50%;width:32px;height:32px;color:var(--pc);font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.2s,transform 0.12s;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
        /* The compact variant, for buttons that sit inside a dense row. Below
           the phone breakpoint it is overridden to 40px like every other
           icon-btn, because a tap target wins over density. Anything laying out
           a row must budget 40, not 26. */
        .icon-btn.sm{width:26px;height:26px;font-size:11px}
        .icon-btn:hover{background:var(--pc-tint-2);transform:translateY(-1px)}
        .icon-btn:disabled{opacity:0.5;cursor:default}
        .primary-btn{border:none;border-radius:var(--r-full);font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-0.01em;transition:transform 0.12s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,filter 0.2s}
        .primary-btn:hover:not(:disabled){transform:translateY(-1.5px);filter:saturate(1.06)}
        .primary-btn:active:not(:disabled){transform:scale(0.97)}
        .primary-btn:disabled{opacity:0.5;cursor:default}
        /* Entry animations that used to need framer-motion (the whole library was in the first-load bundle for
           seven fades): plain keyframes, same easing, and off for people who asked for less motion. */
        @keyframes fmIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes fmGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes fmPulse{0%,100%{transform:scale(1);opacity:.82}50%{transform:scale(1.12);opacity:1}}
        .fm-in{animation:fmIn .42s cubic-bezier(.2,.7,.3,1) both}
        .fm-grow{transform-origin:bottom;animation:fmGrow .6s cubic-bezier(.2,.7,.3,1) both}
        .fm-pulse{animation:fmPulse 1.6s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.fm-in,.fm-grow,.fm-pulse{animation:none!important}}
        /* width:100%: the cards centre themselves with margin-inline:auto, which in a flex column stops them stretching. */
        .today-stack>*{order:8;width:100%;box-sizing:border-box}
        /* Reusable premium primitives for the redesign */
        .glass-card{background:var(--surface);border:1px solid var(--line);border-radius:19px;box-shadow:0 1px 2px rgba(31,58,48,.05), 0 8px 20px rgba(31,58,48,.06);position:relative;overflow:hidden}
        /* .card-boxed, translucent variant: the petal-pink page under היום's
           cards (app-main's background) should read through them, not sit
           behind an opaque block. This is the DESKTOP/default rule - the
           mobile media query has its own copy further down, because that's
           where the full-bleed/glass override (also !important) would
           otherwise win back the solid version. Two classes beats the base
           .glass-card rule's one, so this needs no !important here. */
        .glass-card.card-boxed{background:rgba(255,255,255,0.62);
          -webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);
          border:1px solid rgba(255,255,255,0.7);
          box-shadow:0 1px 2px rgba(31,58,48,.03),0 8px 24px rgba(31,58,48,.05)}
        .pill{display:inline-flex;align-items:center;gap:6px;border-radius:var(--r-full);font-weight:600;font-size:11px;letter-spacing:-0.01em}
        .quick-action{transition:transform 0.16s cubic-bezier(.2,.7,.3,1),box-shadow 0.2s,border-color 0.2s}
        .quick-action:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--pc)!important}
        .quick-action:active{transform:translateY(-1px) scale(0.99)}
        @keyframes toast-in{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
        .toast{animation:toast-in 0.24s cubic-bezier(.2,.7,.3,1)}
        @keyframes shimmer{0%{background-position:-360px 0}100%{background-position:360px 0}}
        .skel{background:linear-gradient(90deg,#EFE7F3 25%,#F8F2FB 50%,#EFE7F3 75%);background-size:720px 100%;animation:shimmer 1.3s infinite linear;border-radius:10px}
        @keyframes fade-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        /* backwards, not both: a kept transform:translateY(0) made every tab a containing block for position:fixed, and a sheet opened
           from inside a tab (תבניות רילס, רילס מהצילומים שלי) rendered far below the screen behind a dim backdrop (2026-11-08 QA). */
        .fade-in{animation:fade-in-up 0.4s cubic-bezier(.2,.7,.3,1) backwards}
        @keyframes pop-in{0%{opacity:0;transform:scale(0.96)}100%{opacity:1;transform:none}}
        .pop-in{animation:pop-in 0.24s cubic-bezier(.2,.7,.3,1) both}
        @keyframes voice-pulse{0%{box-shadow:0 0 0 0 var(--pc-shadow)}70%{box-shadow:0 0 0 16px rgba(122,90,136,0)}100%{box-shadow:0 0 0 0 rgba(122,90,136,0)}}
        .voice-pulse{animation:voice-pulse 1.4s infinite}
        @keyframes sheen{0%{transform:translateX(-120%)}60%,100%{transform:translateX(220%)}}
        .empty-cta{transition:transform 0.14s,box-shadow 0.2s,filter 0.2s}.empty-cta:hover{transform:translateY(-2px);box-shadow:var(--shadow-glow);filter:saturate(1.06)}
        .mobile-only{display:none}
        /* Desktop: the sidebar keeps a sticky "book" pill in the same bottom-left corner as the mic, which hid it
           (found in the new-tenant walkthrough). Lift the mic above the pill. */
        @media (min-width:681px){
          .fab-voice{bottom:84px!important}
        }
        @media (max-width:680px){
          /* Toasts on a phone: at the bottom, clear of the nav bar, where her thumb and eyes already are (same place as
             app/MiniToast.tsx), and one step larger. At the top they sat under the header and were missed (2026-11-03 UX review). */
          .toast-stack{top:auto!important;bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .toast-stack .toast{font-size:var(--t-md)!important}
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .sidebar-aside{position:fixed!important;top:0;bottom:0;right:0;width:80%!important;max-width:280px;z-index:1500;transform:translateX(100%);transition:transform 0.25s}
          .sidebar-aside.open{transform:translateX(0)}
          /* The closed drawer sits at right:0 translated fully off to the right,
             so its box reaches viewport width + 270px - 710px on a 440pt screen,
             which is what the layout probe was reporting as an overflow.
             position:fixed means it never scrolled the page, but while it was
             merely translated it stayed VISIBLE to hit-testing and to the
             accessibility tree: a screen reader could walk into an off-screen
             menu, and a stray tap at the right edge could land on it.
             visibility:hidden takes it out of both. It is animated rather than
             switched so the slide still works - visibility is not interpolable,
             but it does honour a transition delay, so it flips at the end of the
             close and at the start of the open. */
          /* padding-top carries the safe-area inset for the same reason
             .app-header does: this is pinned to top:0 under viewport-fit:cover,
             so at its inline 16px the first nav item sat under the clock in a
             home-screen install. !important because it overrides the inline
             padding shorthand on the element. */
          .nav-aside{position:fixed!important;top:0;bottom:0;right:0;width:78%!important;max-width:270px;z-index:1500;transform:translateX(100%);visibility:hidden;transition:transform 0.25s,visibility 0s linear 0.25s;padding-top:calc(16px + env(safe-area-inset-top, 0px))!important}
          .nav-aside.open{transform:translateX(0);visibility:visible;transition:transform 0.25s,visibility 0s linear 0s}
          .sidebar-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1499}
          .header-search{max-width:none!important}
          .client-drawer,.lead-drawer{width:100%!important}
          /* Phase 2 — mobile readability: 16px form fields stop iOS zoom-on-focus;
             modest floor on the drawer nav so labels stay legible on a phone. */
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
          /* 2026-10-20 design pass: a 12px side gutter after all. Edge to edge left buttons, selects and the
             agenda's actions touching (and, with wrapping rows, crossing) the screen edge on a 375px phone,
             and the rounded היום cards met the edge with their corners. */
          .app-main{padding:12px 12px calc(74px + 62px + env(safe-area-inset-bottom, 0px))!important}
          /* Phase 4 — tap targets: round icon buttons up to a touch-friendly ~40px. */
          .icon-btn{width:44px!important;height:44px!important;font-size:15px!important}
          /* Floating buttons must clear the bottom bar, which only exists below
             this breakpoint. Both are position:fixed with a small bottom offset
             and a z-index far above the nav's 900, so at bottom:14 and bottom:22
             they sat ON TOP of it and clipped the nav items underneath.
             74px is the same bar height .app-main reserves above, plus the same
             home-indicator inset the bar itself pads with, plus a gap. */
          .fab-help{bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .fab-voice{bottom:calc(74px + env(safe-area-inset-bottom, 0px) + 14px)!important}
          .fab-help{font-size:0!important;gap:0!important;padding:6px!important;width:44px;height:44px;justify-content:center}
          .fab-voice{width:44px!important;height:44px!important}
          /* The two floating buttons sit over the content's lower edge; .app-main reserves 62px more at the bottom
             (above) so the last card, row or button can always be scrolled clear of them. */
          .wa-btn,.call-btn{padding:9px 14px!important;min-height:44px!important}
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

          /* ── 16px fields: the actual fix for Safari's zoom ─────────────────
             iOS zooms the page in when a focused input is under 16px, and does
             not zoom back out on blur. Every one of the 115 fields in this app
             was between 9px and 13px, so tapping any of them left the layout
             zoomed and overflowing - which is what "the app is too wide in
             Safari" was, all along.

             The alternative was maximum-scale=1 in the viewport, which
             suppresses the symptom by disabling pinch-zoom for everyone, all
             day, in a business app read at arm's length. Fixing the cause costs
             a few pixels of density on a phone; fixing the symptom costs the
             accessibility escape hatch permanently.

             !important because the sizes are inline styles, and one rule rather
             than 115 edits because a rule cannot miss a field.

             Mobile only: the zoom is an iOS behaviour, and 11-12px on desktop
             is a deliberate density choice with no problem to solve. */
          /* iOS ONLY. Chrome on Android does not zoom on focus at any font
             size, so on Android this rule was enlarging every field to solve a
             problem that platform does not have - a density change for half the
             users for nothing.

             @supports (-webkit-touch-callout: none) is the standard gate for
             this: the property is implemented in WebKit and not in Blink, so it
             is true on iOS Safari (and every iOS browser, which are all WebKit)
             and false in Chrome on Android. If Blink ever ships it, Android
             quietly gets larger fields back - untidy, not harmful. */
          @supports (-webkit-touch-callout: none) {
            input,textarea,select{font-size:16px!important}
            /* Inside the same gate: this width exists purely to give the 16px
               text room. On Android the fields stay at 11-12px, so widening
               them would be the same unnecessary density change. */
            input[type="number"]{min-width:62px!important}
          }

          /* Narrow numeric fields need the BOX widened too, not just the text.
             Service duration is 44px wide with 6px of side padding - about 32px
             of room, which at 16px is three digits. "120" only just fits and
             anything longer clips. A silently clipped duration or price is the
             worst kind of wrong: it looks like a number, so she would never
             think to check it.
             These sit in flex rows next to a name field that already carries
             minWidth:0, so the row absorbs the extra width by truncating the
             name, which truncates visibly. */
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
          .hdr-logo{width:132px!important;margin-inline-end:0!important}
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

          /* .card-boxed: opt-out of the full-bleed/glass treatment just below,
             for target-today.html's cards specifically (היום tab only - hero,
             question, setup-checklist, today, needs-attention, next-client,
             closing-list). That mockup is itself a 430px mobile view calling
             for a 19px-radius card with its own shadow, which is the opposite
             of full-bleed - so these two rules can't both win on the same
             element. Two classes beats one rule's specificity regardless of
             source order, so this sits anywhere relative to the rules below
             and still wins; .glass-card elsewhere (cashier, leads, settings,
             ...) is untouched.
             Translucent, not solid #fff: the petal-pink page background
             should read through the cards, so this is the SAME rule as the
             non-media .glass-card.card-boxed above - repeated here, with
             !important, only because it still has to beat the full-bleed
             rule's own !important a few lines down at this width. */
          .glass-card.card-boxed{border-radius:19px!important;border:1px solid rgba(255,255,255,0.7)!important;
            background:rgba(255,255,255,0.62)!important;-webkit-backdrop-filter:blur(14px) saturate(1.1)!important;
            backdrop-filter:blur(14px) saturate(1.1)!important;
            box-shadow:0 1px 2px rgba(31,58,48,.03),0 8px 24px rgba(31,58,48,.05)!important}
          /* The question card's own rose hairline (its only card with a border)
             needs one more class: inline style's border is itself overridden by
             the full-bleed rule's border-left/border-right:0 above, and
             .card-boxed just set border:none outright - three classes beats
             both at equal !important. */
          .glass-card.card-boxed.card-boxed-rose{border:1px solid rgba(233,169,161,.65)!important}
          /* Same problem, for the two cards with a one-side accent border
             instead of a hairline: the base rule's border-right:0 (this is
             RTL, so border-inline-start physically IS border-right) already
             wins over .card-boxed's border:none at equal specificity, so this
             needs the one-louder third class too. */
          .glass-card.card-boxed.card-boxed-accent{border-inline-start:3px solid ${pc}!important}

          /* Full bleed. Once the gutters are gone a card that keeps its rounded
             corners and side borders still reads as a framed panel floating on a
             page - the exact "website in a frame" look this is meant to remove.
             Squaring the corners and dropping the left/right borders turns each
             card into a full-width section, which is the native pattern. The top
             and bottom borders stay, because they are what still separates one
             section from the next.
             .sheet is a different class and keeps its radius: a
             centred sheet should still look like a sheet. */
          /* With the gutter back, a card is a card again: rounded, framed (was: squared and borderless for full bleed). */
          .glass-card,.hero-card{border-radius:16px!important}

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
          .hdr-logo{width:118px!important}
        }
        @media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:fixed;top:0;left:0;width:100%;padding:40px}
          /* Tax report: print only the report card, clean A4, centered. */
          #tax-report,#tax-report *{visibility:visible}
          #tax-report{position:fixed;top:0;left:0;right:0;margin:0 auto;width:100%;max-width:720px;box-shadow:none!important;border:none!important;padding:32px 28px}}
      `}</style>

      {photoPost&&<PhotoToPost open onClose={()=>setPhotoPost(null)} settings={settings} toast={toast} readOnly={readOnly} clientName={photoPost.clientName||""} onReel={()=>{setOwnReel({clientName:photoPost.clientName||""});setPhotoPost(null);}}/>}
      {ownReel&&<OwnReel open onClose={()=>setOwnReel(null)} settings={settings} toast={toast} readOnly={readOnly} clientName={ownReel.clientName||""}/>}

      {/* "שדרוגים ✨" (app/UpgradesStore.jsx): renders nothing unless one of its switches is on. */}
      <UpgradesStore toast={toast} isDemo={isDemoTenantId(settings?.tenant_id)}
        onOpenCard={()=>{setSelectedClient(null);openAddonsRef.current?.("billing-card");}}
        onOpenReferral={()=>{setSelectedClient(null);openAddonsRef.current?.("business-referral");}}/>

      {/* -- Onboarding walkthrough -- six steps, once per tenant, resumable -- */}
      {tourStep !== null && tourStep !== undefined && (
      <OnboardingTour
        steps={tourSteps}
        stepIndex={tourStep}
        onNext={handleTourNext}
        onSkip={handleTourSkip}
        onFinish={handleTourFinish}
        pc={pc}
        pcDeep={pcDeep}
        pcGrad={pcGrad}
      />
      )}

      {/* -- "תקועה?" -- on every screen, above everything ------------------ */}
      {!showHelp && (
        <button
          type="button"
          onClick={() => { setShowHelp(true); setHelpState("idle"); }}
          aria-label={tr("תקועה? כתבי לנו")}
          className="fab-help"
          style={{position:"fixed",insetInlineStart:14,bottom:14,zIndex:4500,display:"flex",alignItems:"center",gap:7,padding:"7px 16px 7px 8px",borderRadius:"var(--r-full)",border:"1px solid var(--line-2)",background:"var(--surface)",color:pcDeep,fontSize:"var(--t-sm)",fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"var(--shadow-md)"}}
        >
          <BrandImage width={28} height={28} aria-hidden alt="" src={ICON_QUESTION} style={{width:28,height:28,objectFit:"contain",flexShrink:0}}/>
          {tr("תקועה?")}
        </button>
      )}

      {showMonthlyReport && (
        <Sheet open onClose={() => setShowMonthlyReport(false)} width={460} zIndex={1000} ariaLabel={tr("הדוח החודשי שלי")}>
          <MonthlyReportCard variant="sheet" needsStatus={!settings?.business_tax_status} onChooseStatus={()=>{setShowMonthlyReport(false);openSettings("general");}} report={monthlyReportData} accent={herAccent} businessName={settings?.business_name} toast={toast} fullHref={monthlyPageOn(settings)?"/dashboard/monthly":null}/>
          {teamCal&&historyReady&&<TeamReport staff={team.staff} appointments={appointments} receipts={liveRcpts} netOfVat={(settings?.business_tax_status||"exempt")!=="exempt"} net={teamNet}/>}
        </Sheet>
      )}

      {showHelp && (
          <HelpModal ctx={{activeTab,askHumanFromChat,helpChat,helpState,helpText,helpTextRef,pcDeep,pcGrad,sendHelp,setHelpChat,setHelpState,setHelpText,setShowHelp}}/>
      )}


      {showLapsed && (
      <LapsedClientsModal
        open={showLapsed}
        onClose={()=>setShowLapsed(false)}
        pc={pc}
        pcGrad={pcGrad}
        pcShadow={pcShadow}
        initialDays={winbackDays}
      />
      )}

      {showLeadImport && (
      <LeadImportModal
        open={showLeadImport}
        onClose={()=>setShowLeadImport(false)}
        onImported={()=>{ loadAll(); }}
        pc={pc}
        pcGrad={pcGrad}
        pcShadow={pcShadow}
      />
      )}

      {/* TOASTS */}
      {toasts.length>0&&(
 <div aria-live="polite" aria-atomic="true" className="toast-stack" style={{position:"fixed",left:"50%",transform:"translateX(-50%)",zIndex:5000,display:"flex",flexDirection:"column",gap:7,alignItems:"center",pointerEvents:"none"}}>
          {toasts.map(t=>{
            const colors={success:{bg:"var(--ink)",fg:"var(--surface)",icon:"✓"},error:{bg:"var(--danger)",fg:"var(--surface)",icon:"!"},info:{bg:pcDeep,fg:"var(--surface)",icon:"i"}};
            const c=colors[t.type]||colors.success;
            return(
 <div key={t.id} className="toast" role={t.type==="error"?"alert":"status"} onClick={()=>{if(t.type==="error")setToasts(prev=>prev.filter(x=>x.id!==t.id));}} style={{background:c.bg,color:c.fg,padding:"10px 18px",borderRadius:"var(--r-xl)",fontSize:"var(--t-sm)",fontWeight:600,boxShadow:"var(--shadow-lg)",maxWidth:"90vw",direction:uiDir(),pointerEvents:"auto",display:"flex",alignItems:"center",gap:8,cursor:t.type==="error"?"pointer":"default",userSelect:t.type==="error"?"text":undefined}}>
                {/* The flower as the success mark - a receipt issued, an
                    appointment saved, a post created all land here, since
                    every one of those already calls the one shared toast
                    helper with type:"success". Error/info keep the plain
                    badge: this is a success-only reward, not a mark that
                    means "done" generically. */}
                {t.type==="success"?(
 <BrandImage width={16} height={16} aria-hidden alt="" src={FLOWER_64} style={{width:16,height:16,objectFit:"contain",flexShrink:0}}/>
                ):(
 <span style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,0.22)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-xs)",flexShrink:0}}>{c.icon}</span>
                )}
                {/* unicodeBidi plaintext: error toasts mix Hebrew with English/
                    JSON reasons, and under forced RTL the bidi algorithm
                    scrambles the ordering ("למה העברית הפוך"). Each line
                    resolves its own direction instead. */}
                <span style={{unicodeBidi:"plaintext",wordBreak:"break-word"}}>{trv(t.msg)}</span>
                {t.action&&<button onClick={()=>{t.action.onClick();setToasts(prev=>prev.filter(x=>x.id!==t.id));}} style={{background:"rgba(255,255,255,0.2)",border:"none",color:c.fg,fontSize:"var(--t-xs)",fontWeight:700,padding:"4px 11px",borderRadius:"var(--r-md)",cursor:"pointer",fontFamily:"inherit",marginRight:2,whiteSpace:"nowrap"}}>{trv(t.action.label)}</button>}
 </div>
            );
          })}
 </div>
      )}

      {/* COMPOSE-AND-SEND: what a yes on the one-question card opens. The
          message is editable; each client gets a wa.me tap that opens HER
          WhatsApp with the text plus that client's personal link. */}
      {composeSend&&<ComposeSendModal ctx={{composeDone,composeSend,fmtPhone,pcGrad,setComposeDone,setComposeSend}}/>}

      {/* MANUAL WHATSAPP QUEUE — every utility send that's manual-mode or fell
          back, plus every outreach send (slot_offer, comeback, lead_bulk,
          auto_winback/review/birthday/package_done), all landing in the same
          whatsapp_messages row shape (status:'pending_manual') via the one
          sendWhatsApp() chokepoint. "סימון כנשלח" is optimistic and persisted
          (unlike composeDone above, which never writes anything) - there is
          no delivery receipt for a tap WhatsApp doesn't report back on, so
          trusting her tap is the whole mechanism, same as every prepare flow. */}
      {showWaQueue&&(
 <WaQueueModal ctx={{pcGrad,setShowWaQueue,setWaQueueDone,setWhatsappPending,toast,waMsg,waQueueDone,whatsappPending}}/>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog&&(
 <Sheet open onClose={()=>setConfirmDialog(null)} width={340} zIndex={4000} className="pop-in" title={trv(confirmDialog.title)}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.5,marginBottom:18}}>{trv(confirmDialog.message)}</p>
 <div style={{display:"flex",gap:7}}>
 <button onClick={()=>setConfirmDialog(null)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1.5px solid var(--line-2)",borderRadius:"var(--r-xl)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{trv(confirmDialog.cancelText)}</button>
 <button onClick={()=>{const fn=confirmDialog.onConfirm;setConfirmDialog(null);if(fn)fn();}} className="primary-btn" style={{flex:2,padding:"11px 0",background:confirmDialog.danger?"var(--danger)":pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",boxShadow:confirmDialog.danger?"var(--shadow-md)":"var(--shadow-accent)"}}>{trv(confirmDialog.confirmText)}</button>
 </div>
 </Sheet>
      )}

      {/* BEAUTY VOICE: floating mic button. Hidden unless automations.feature_flags.voice_booking is true
          (UX pass 2026-11-08): it cannot book yet, so it only confused her. Hidden, not deleted. */}
 {voiceBookingVisible(settings)&&<button onClick={()=>{ showVoice ? closeVoice() : startVoice(); }} aria-label={tr("שליטה קולית")} title={tr("שליטה קולית")} className="fab-voice"
        style={{position:"fixed",bottom:22,left:22,zIndex:3500,width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",background:pcGrad,color:"var(--pc-contrast)",boxShadow:"var(--shadow-accent)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
 <svg viewBox="0 0 24 24" width="24" height="24" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
 </button>}

      {/* BEAUTY VOICE — modal */}
      {showVoice&&(
 <VoiceModal ctx={{activeServices,clients,closeVoice,fmtPhone,handleVoiceBook,handleVoiceCancel,handleVoiceReceipt,isBusy,NO_SERVICES_HINT,pc,pcGrad,pcTint,setupHint,setVoiceBooking,setVoiceCall,setVoiceCancel,setVoiceReceipt,startVoice,voiceBooking,voiceCall,voiceCancel,VoiceCommandList,voiceErr,voiceInfo,voiceIntent,voiceReceipt,voiceStatus,voiceTranscript}}/>
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
 {/* UX pass 2026-11-08: the phone header keeps the logo, the gear and one badge. The menu button is hidden there (kept,
     not deleted); the same drawer, with search, opens from "עוד" › "חיפוש". Logout moved to Settings › מתקדם. */}
 <button className="icon-btn" onClick={()=>setShowMobileSidebar(true)} style={{display:"none"}} aria-label={tr("תפריט ניווט")}><Icon name="menu" size={20}/></button>
                {/* Compact Kalmea lockup: florals + wordmark, no tagline.
                    Brand tier, so it never takes the tenant accent. Intrinsic
                    520x177 with the height capped, so the ratio holds. */}
                {/* Matches the /login treatment exactly: width-driven sizing so
                    the artwork sets its own ratio, the same drop-shadow that
                    makes it float there, and its own breathing room rather than
                    sitting flush against the menu button. No wrapper box, no
                    background, no overflow - the petals reach the edge of the
                    artwork and must never be cropped.
                    Desktop only: the full lockup doesn't fit below 680px next
                    to the menu button, search box and badges. A SMALLER
                    lockup replaces it there (flower + "kalmea" in its own
                    lettering, cropped from this same artwork - see LOGO_TEXT)
                    rather than the flower alone: a screen should always say
                    what she's using, not just show a mark. */}
 <BrandImage className="hdr-logo desktop-only" src={LOGO_COMPACT} alt="Kalmea" width={196} height={57}
      style={{width:196,height:"auto",display:"block",overflow:"visible",flexShrink:0,
              marginInlineEnd:14,filter:"drop-shadow(0 10px 22px rgba(48,24,72,0.16))"}}/>
 <div className="mobile-only" style={{alignItems:"center",flexShrink:0,marginInlineEnd:10,filter:"drop-shadow(0 4px 10px rgba(48,24,72,0.16))"}}>
 {/* Was the flower crop (FLOWER_64) and the text crop (LOGO_TEXT) side by
     side as two separate images - visually disconnected, since the stem
     that flows into the "k" in the real lockup doesn't survive being cut
     into two pieces with a gap between them. One connected image now,
     same as the desktop lockup just above, scaled for the header's height
     instead of its width. */}
 <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={116} height={34} style={{width:"auto",height:34,display:"block"}}/>
 </div>
          {/* UX pass 2026-11-18: was a bare number nobody could read ("4" what?). Now a real button that says what it is. */}
          {newLeadsCount>0&&viewAllowsTab(settings,"leads")&&<button type="button" data-testid="header-leads-badge" onClick={()=>setActiveTab("leads")} aria-label={newLeadsCount===1?tr("פנייה חדשה אחת"):tr("{0} פניות חדשות",[newLeadsCount])} style={{background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,padding:"3px 10px",border:"none",borderRadius:"var(--r-lg)",cursor:"pointer",boxShadow:"var(--shadow-accent)",fontFamily:"inherit",whiteSpace:"nowrap"}}>{newLeadsCount===1?tr("פנייה חדשה"):tr("{0} פניות",[newLeadsCount])}</button>}
          {tomorrowCancelled>0&&!tillOnly&&<span className="desktop-only" style={{background:"var(--danger)",color:"var(--surface)",fontSize:"var(--t-sm)",fontWeight:700,padding:"3px 8px",borderRadius:"var(--r-lg)"}}>{tomorrowCancelled}</span>}
 </div>
 <div className="header-search" style={{position:"relative",flex:1,maxWidth:280,minWidth:80}}>
 <span style={{position:"absolute",top:"50%",right:13,transform:"translateY(-50%)",fontSize:"var(--t-sm)",color:"var(--ink-3)",pointerEvents:"none",zIndex:1}}>⌕</span>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder={tr("חיפוש...")}
            style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"8px 34px 8px 14px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",color:"var(--ink)",boxShadow:"var(--shadow-xs)"}}/>
          {globalResults.length>0&&(
 <div style={{position:"absolute",top:"100%",right:0,left:0,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",boxShadow:"var(--shadow-lg)",zIndex:999,overflow:"hidden",marginTop:6,maxHeight:400,overflowY:"auto"}}>
              {renderSearchGroups()}
 </div>
          )}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {upcomingBirthdays[0]&&<span className="desktop-only" style={{fontSize:"var(--t-sm)",color:pc}}>{upcomingBirthdays[0].name}</span>}
 <span className="desktop-only" style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("שלום")}{displayName(settings.therapist_name)?`, ${displayName(settings.therapist_name)}`:""} </span>
          {/* ☑ and ↓ leave the header below 680px: four 40px buttons plus the
              logo, hamburger and search cannot fit on any phone (see the
              breakpoint block). Both keep a mobile home in the nav drawer, so
              nothing becomes unreachable - only ⚙ and ⏻ stay in the bar. */}
 <button onClick={()=>setShowSetup(true)} className="icon-btn desktop-only" title={tr("הגדרת המערכת")} aria-label={tr("הגדרת המערכת")}><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4"/><path d="M8 12.3l2.8 2.8L16.4 9"/></svg></button>
                {/* An inline SVG, not the ⚙ character. U+2699 has an EMOJI
                    presentation by default on iOS, so it rendered as a full
                    colour glyph sitting among flat, tinted chrome. The variation
                    selector (⚙︎) would only ask the font nicely; an SVG settles
                    it. Same stroke idiom as the Beauty Voice mic below -
                    currentColor, 1.7 stroke - so it inherits .icon-btn's tint. */}
 <button onClick={()=>openSettings()} className="icon-btn" title={tr("הגדרות")} aria-label={tr("הגדרות")}>
 <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}>
 <circle cx="12" cy="12" r="3.1"/>
 <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
 </svg>
 </button>
 <button onClick={handleExportCSV} className="icon-btn desktop-only" title={tr("ייצוא תשלומים ל-CSV")} aria-label={tr("ייצוא תשלומים לקובץ CSV")}>↓</button>
                {/* Same reason as the gear above: U+23FB renders as a colour
                    emoji on iOS. Fixing one and leaving its neighbour is worse
                    than leaving both. */}
 <button onClick={handleLogout} disabled={isBusy("logout")} className="icon-btn desktop-only" title={authEmail ? tr("התנתקות (מחוברת כ-{0})", [authEmail]) : tr("התנתקות")} aria-label={tr("התנתקות מהמערכת")}>
 <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}>
 <path d="M12 3.2v8.4"/>
 <path d="M17.4 6.1a7.5 7.5 0 1 1-10.8 0"/>
 </svg>
 </button>
 </div>
 </header>

 <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {showMobileSidebar&&<div className="sidebar-backdrop mobile-only" onClick={()=>setShowMobileSidebar(false)}/>}

        {/* NAVIGATION SIDEBAR (right, RTL) */}
 <aside className={`nav-aside${showMobileSidebar?" open":""}`} style={{order:0,width:212,background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.7)",borderLeft:"1px solid var(--line)",padding:"16px 12px",display:"flex",flexDirection:"column",gap:3,flexShrink:0,overflowY:"auto"}}>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",alignSelf:"flex-start",background:"none",border:"none",fontSize:"var(--t-lg)",cursor:"pointer",color:"var(--ink-3)",marginBottom:4}}>✕</button>
          {/* Search lives here on phones. It used to take a whole second row in
              the header, which pushed the header to ~90px; the header cannot
              afford the width inline next to the logo either. In the drawer it
              gets full width, and results list in flow rather than as a floating
              dropdown. Desktop keeps the header field and never renders this. */}
 <div className="mobile-only" style={{display:"none",flexDirection:"column",marginBottom:10}}>
 <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder={tr("חיפוש לקוחה, תור, פנייה...")}
              style={{width:"100%",boxSizing:"border-box",border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"10px 14px",fontSize:"var(--t-lg)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface)",color:"var(--ink)"}}/>
            {globalResults.length>0&&(
 <div style={{marginTop:8,border:"1px solid var(--line)",borderRadius:"var(--r-md)",overflow:"hidden",maxHeight:300,overflowY:"auto"}}>
                {renderSearchGroups(()=>setShowMobileSidebar(false))}
 </div>
            )}
 </div>
          {NAV_ITEMS.map(item=>(
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMobileSidebar(false);}} className={`nav-item${activeTab===item.id?" active":""}`}>
 <span className="nav-ico">{navIcon(item.id)}</span>
 <span style={{flex:1}}>{trv(item.label)}</span>
              {item.id==="leads"&&newLeadsCount>0&&<span style={{background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,padding:"2px 7px",borderRadius:"var(--r-lg)"}}>{newLeadsCount}</span>}
 </button>
          ))}
 <button onClick={()=>{openSettings();setShowMobileSidebar(false);}} className="nav-item" style={{marginTop:8}}>
 <span className="nav-ico"><svg viewBox="0 0 24 24" width="19" height="19"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>
 <span style={{flex:1}}>{tr("הגדרות")}</span>
 </button>
 {ACADEMY_ON&&!tillOnly&&<AcademyNavEntry variant="nav" onOpen={()=>{setShowMobileSidebar(false);router.push("/dashboard/academy");}}/>}
 {!tillOnly&&<ProtocolBookNavEntry variant="nav" onOpen={()=>{setShowMobileSidebar(false);router.push("/dashboard/protocol-book");}}/>}
          {/* The two header icons that do not fit on a phone. Inline display
              none + .mobile-only{display:flex!important} is this file's
              established pattern - the inline value has to be the DESKTOP one,
              because only the breakpoint rule carries !important. */}
 <button className="nav-item mobile-only" style={{display:"none"}} onClick={()=>{setShowSetup(true);setShowMobileSidebar(false);}}>
 <span className="nav-ico"><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4"/><path d="M8 12.3l2.8 2.8L16.4 9"/></svg></span>
 <span style={{flex:1}}>{tr("הגדרת המערכת")}</span>
 </button>
 <button className="nav-item mobile-only" style={{display:"none"}} onClick={()=>{handleExportCSV();setShowMobileSidebar(false);}}>
 <span className="nav-ico">↓</span>
 <span style={{flex:1}}>{tr("ייצוא תשלומים (CSV)")}</span>
 </button>
 </aside>

        {/* TODAY / REMINDERS PANEL (left, RTL) */}
        {/* The day's diary panel: not in "קופה, ניקובים ודוחות בלבד" (lib/viewMode.ts). Hidden, not removed. */}
        {!tillOnly&&(
 <aside className="sidebar-aside desktop-only" style={{order:2,width:195,background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), rgba(252,250,254,0.6)",borderRight:"1px solid var(--line)",padding:"14px 11px",display:"flex",flexDirection:"column",gap:11,flexShrink:0,overflowY:"auto"}}>
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{tr("היום (")}{todayAppts.length})</p>
 <button className="mobile-only" onClick={()=>setShowMobileSidebar(false)} style={{display:"none",background:"none",border:"none",fontSize:"var(--t-md)",cursor:"pointer",color:"var(--ink-3)"}}>✕</button>
 </div>
            {todayEntries.length===0?<p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{tr("אין תורים")}</p>
              :todayEntries.slice().sort((a,b)=>(startMinute(a)??0)-(startMinute(b)??0)).map(a=>(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--lavender-50),var(--surface))",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:"var(--r-sm)",padding:"7px 9px",marginBottom:5}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
                  {/* fmtApptTime, not hand-built from `hour`. This indexed
                      workingHours by (hour - working_hours_start) and fell back
                      to `hour + ":00"` — so a 14:30 appointment read "14:00" in
                      the Today panel, and any appointment outside her configured
                      opening hours fell through to that same wrong string. The
                      one display site the minutes migration missed; found while
                      auditing type sizes here. */}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{fmtApptTime(a)} · {a.service}</p>
                  <HoldBadge appointmentId={a.id}/>
                  <IntakeBadge appointmentId={a.id}/>
                  {!isPersonal(a)&&(()=>{const s0=apptStatus(a);return s0.key==="pending"?null:<span style={{fontSize:"var(--t-sm)",color:s0.key==="cancelled"?"var(--danger)":APPT_STATUS_TONE_COLOR[s0.tone],fontWeight:700}}>{trv(s0.label)}</span>;})()}
 <button onClick={()=>handleOpenCashier(a)} style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-md)",padding:"3px 9px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",marginTop:3,display:"block"}}>{tr("גבי")}</button>
 </div>
              ))}
 </div>

          {tomorrowEntries.length>0&&(
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)"}}>{tr("מחר (")}{tomorrowAppts.length})</p>
 <button onClick={handleSendAllConfirmations} style={{background:"rgba(212,175,55,0.12)",color:pc,border:"none",borderRadius:"var(--r-md)",padding:"3px 8px",fontSize:"var(--t-xs)",cursor:"pointer",fontFamily:"inherit"}}>{tr("שליחה מרוכזת")}</button>
 </div>
 <div style={{background:pcTint,borderRadius:"var(--r-sm)",padding:"6px 9px",marginBottom:6,fontSize:"var(--t-sm)"}}>
 <span style={{color:"var(--success)"}}>{tomorrowConfirmed} </span>
 <span style={{color:"var(--danger)"}}>{tomorrowCancelled} </span>
 <span style={{color:"var(--ink-2)"}}>⏳ {tomorrowPending}</span>
 </div>
              {tomorrowEntries.map(a=>{
                const client=clients.find(c=>String(c.id)===String(a.client_id));
                const confColor=a.confirmation_status==="confirmed"?"var(--success)":(a.confirmation_status==="cancelled"||a.confirmation_status===NO_SHOW)?"var(--danger)":"var(--ink-2)";
                return(
 <div key={a.id} style={{background:"linear-gradient(90deg,var(--surface-2),#FFFFFF)",borderRight:`3px solid ${getApptColor(a)}`,borderRadius:"var(--r-sm)",padding:"6px 8px",marginBottom:5}}>
 <p style={{fontSize:"var(--t-xs)",fontWeight:600,color:"var(--ink)"}}>{a.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{entrySubtitle(a)}</p>
                    {!isPersonal(a)&&client?.phone&&!a.confirmation_sent&&a.confirmation_status!=="cancelled"&&a.confirmation_status!==NO_SHOW&&(
 <button onClick={()=>handleSendConfirmation(a)} style={{background:"#25D366",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:"3px 8px",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",marginTop:3}}>{tr("שלחי תזכורת")}</button>
                    )}
                    {a.confirmation_sent&&<span style={{fontSize:"var(--t-sm)",color:confColor,fontWeight:700}}>{a.confirmation_status==="confirmed"?tr("אישרה"):a.confirmation_status==="cancelled"?tr("ביטלה"):a.confirmation_status===NO_SHOW?tr("לא הגיעה"):tr("נפתחה")}</span>}
 </div>
                );
              })}
 </div>
          )}

          {leadsWithReminders.length>0&&(
 <div>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:pc,marginBottom:5}}>{tr("תזכורות פניות")}</p>
              {leadsWithReminders.map(l=>(
 <div key={l.id} onClick={()=>{setSelectedLead(l);setActiveTab("leads");setShowMobileSidebar(false);}} style={{background:"#FFF3E0",borderRadius:"var(--r-sm)",padding:"5px 9px",marginBottom:3,cursor:"pointer"}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink)"}}>{l.name}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{l.reminder_date}</p>
 </div>
              ))}
 </div>
          )}

          {coldClients.slice(0,3).length>0&&(
 <div>
 <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:6,marginBottom:4}}>
 <p className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink-2)"}}>{tr("להתחדשות")}</p>
                {coldClients.length>3&&<button onClick={()=>{setShowLapsed(true);setShowMobileSidebar(false);}} style={{background:"none",border:"none",padding:0,fontSize:"var(--t-sm)",fontWeight:700,color:pc,cursor:"pointer",fontFamily:"inherit"}}>{tr("כל ה-")}{coldClients.length}</button>}
 </div>
              {[...coldClients].sort((a,b)=>getDaysSince(b.id)-getDaysSince(a.id)).slice(0,3).map(c=>(
 <div key={c.id} onClick={()=>{setSelectedClient(c);setClientTab("info");setShowMobileSidebar(false);}} style={{fontSize:"var(--t-sm)",color:pc,marginBottom:3,cursor:"pointer"}}>{c.name} ({getDaysSince(c.id)}{tr("י)")}</div>
              ))}
 </div>
          )}

 <button onClick={openNewAppt}
            style={{background:pcGrad,color:"var(--pc-contrast)",border:"none",borderRadius:"var(--r-xl)",padding:"11px 10px",minHeight:44,fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",boxShadow:"var(--shadow-accent)"}}>
            {tr("✦ קביעת תור")}
 </button>
 </aside>
        )}

 <div className="app-main" style={{order:1,flex:1,overflow:"auto",padding:"28px 30px",background:activeTab==="dashboard"?"#FBF8F1":undefined}}>
          <ChromeFlowerBg/>
          {/* Trial notice. Sits OUTSIDE the keyed tab wrapper on purpose: it is a
              property of the account, not of a screen, so it stays put and does
              not replay its entrance animation on every tab change. Renders
              nothing at all for an active tenant. */}
 <BillingNotices plan={planInfo} toast={toast} pc={pc} pcDeep={pcDeep} pcTint={pcTint} pcGrad={pcGrad} pcShadow={pcShadow} isDemo={isDemoTenantId(settings?.tenant_id)} onOpenBilling={()=>{setSettingsGroup("business");openSettings();}}/>
 {((deferred.history==="loading"&&histSlow)||deferred.history==="error"||deferred.leads==="error")&&(
 <div role="status" data-testid="history-strip" style={{maxWidth:1180,margin:"0 auto 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r-md)",padding:"8px 14px",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>
 {(deferred.history==="error"||deferred.leads==="error")
   ?<><span>{tr("לא הצלחנו לטעון את כל ההיסטוריה והפניות, ומה שמוצג חלקי.")}</span><button type="button" onClick={loadHistory} style={{background:"none",border:"none",color:"var(--brand-accent)",fontWeight:700,textDecoration:"underline",cursor:"pointer",minHeight:44,padding:"0 6px"}}>{tr("נסי שוב")}</button></>
   :<><Spinner inline label={tr("טוענת את ההיסטוריה המלאה")}/><span>{tr("חלק מהמספרים (ביקורים וסכומים של לקוחות) יתעדכנו בעוד רגע.")}</span></>}
 </div>
 )}
 <TrialNudge plan={planInfo} tenantId={settings.tenant_id} counts={{appointments:clientAppts.filter(a=>a.confirmation_status!=="cancelled").length,clients:clients.length}} suppress={tourStep!==null&&tourStep!==undefined} quietKeys={fbShowing||tillOnly?["day1","day10"]:null} onCopyLink={()=>copyPublicLink("book")} onOpenCashier={()=>setActiveTab("cashier")} onContact={()=>setShowHelp(true)} pc={pc} pcDeep={pcDeep} pcTint={pcTint} pcGrad={pcGrad}/>
 <FeedbackBanner plan={planInfo} tenantId={settings.tenant_id} isDemo={isDemoTenantId(settings?.tenant_id)} counts={{appointments:clientAppts.filter(a=>a.confirmation_status!=="cancelled").length,clients:clients.length}} suppress={(tourStep!==null&&tourStep!==undefined)||activeTab!=="dashboard"||showSettings||showModal||showMoreSheet}/>
          {/* Persistent, not per-screen, same placement logic as TrialBanner
              above it: a demo session (lib/demoTenants.ts) is never her own
              account, and every screen should keep saying so. */}
          {isDemoTenantId(settings?.tenant_id) && (
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"10px 16px",marginBottom:14,borderRadius:"var(--r-md)",background:"var(--pc-tint)",border:`1px solid ${pc}`}}>
 <p style={{fontSize:"var(--t-sm)",fontWeight:600,color:pcDeep,margin:0}}>{tr("✦ זו תצוגת דמו - נתונים לדוגמה, לא עסק אמיתי")}</p>
 <a href="/signup" style={{flexShrink:0,padding:"8px 16px",borderRadius:"var(--r-full)",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,textDecoration:"none"}}>{tr("התחילי בחינם")}</a>
 </div>
          )}
 <div key={activeTab} className="fade-in">
          {/* DASHBOARD */}
          {/* TILL-ONLY HOME ("קופה, ניקובים ודוחות בלבד", lib/viewMode.ts): today's sales and the month, a new sale (with or
              without an appointment), and the monthly report. The full home below is untouched and returns with "הכל". */}
          {activeTab==="dashboard"&&tillOnly&&(<div data-testid="till-only-home" style={{display:"flex",flexDirection:"column",gap:12,maxWidth:1180,marginInline:"auto",width:"100%"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingInline:17}}>
 <b style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontWeight:700,fontSize:"var(--t-xl)",color:"var(--ink)"}}>{now.getHours()<12?tr("בוקר טוב"):now.getHours()<17?tr("צהריים טובים"):now.getHours()<21?tr("ערב טוב"):tr("לילה טוב")}</b>
 <BrandImage width={30} height={30} aria-hidden alt="" src={FLOWER_256} style={{width:30,height:30,objectFit:"contain",display:"block"}}/>
 </div>
 <div className="glass-card card-boxed" data-testid="till-only-today" style={{padding:"16px 17px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted)"}}>{tr("הכנסות היום")}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontWeight:900,fontSize:"var(--t-hero)",letterSpacing:"-0.02em",color:"var(--ink)",lineHeight:1.05,marginTop:1}}>₪{todayTotals.total.toLocaleString()}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted)",marginTop:3}}>
              {todayTotals.count===0?tr("עוד לא נרשמו תשלומים היום")
                :<>{todayTotals.byMethod.map(m=>`${m.method} ${m.total.toLocaleString()}`).join(" · ")}{todayTotals.tips>0&&tr(" · טיפים {0}", [todayTotals.tips.toLocaleString()])}</>}
 </p>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
 <button type="button" data-testid="till-only-new-sale" className="primary-btn" onClick={()=>handleOpenCashier(null)} style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 18px",minHeight:44,fontSize:"var(--t-sm)",boxShadow:"var(--shadow-accent)"}}>{tr("✦ תשלום חדש")}</button>
 <button type="button" onClick={()=>setActiveTab("cashier")} style={{background:"var(--surface)",color:pcDeep,border:"1px solid var(--line-2)",borderRadius:"var(--r-xl)",padding:"9px 16px",minHeight:44,fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{tr("לקופה")}</button>
 </div>
 </div>
 <div className="glass-card card-boxed" data-testid="till-only-month" style={{padding:"16px 17px"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted)"}}>{tr("הכנסות החודש")}</p>
 <p style={{fontFamily:"var(--font-frank),'Frank Ruhl Libre',serif",fontWeight:900,fontSize:"var(--t-3xl)",letterSpacing:"-0.02em",color:"var(--ink)",lineHeight:1.1,marginTop:1}}>₪{monthTotals.total.toLocaleString()}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--brand-muted)",marginTop:3}}>
              {monthTotals.count===0?tr("עוד אין תשלומים החודש")
                :`${monthTotals.count===1?"תשלום אחד":`${monthTotals.count} תשלומים`}${monthTotals.byMethod.length?` · ${monthTotals.byMethod.map(m=>`${m.method} ${m.total.toLocaleString()}`).join(" · ")}`:""}`}
 </p>
 <button type="button" onClick={()=>setActiveTab("tax")} style={{background:"none",border:"none",padding:"10px 0 0",minHeight:44,color:"var(--pc-deep)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{tr("סיכום הכנסות ודוחות ←")}</button>
 </div>
 <FeeQuestions variant="home" pc={pc} pcTint={pcTint} toast={toast} onCharged={feeCharged}/>
 <MonthlyReportCard report={monthlyReportData} needsStatus={!settings?.business_tax_status} onChooseStatus={()=>openSettings("general")} accent={herAccent} businessName={settings?.business_name} toast={toast} onOpenIncome={()=>setActiveTab("tax")} fullHref={monthlyPageOn(settings)?"/dashboard/monthly":null}/>
 </div>)}
          {!tillOnly&&activeTab==="dashboard"&&(<DashboardScreen ctx={{activeServices,answerQuestion,appointments,approveSkinFollowup,attentionOnToday,AutomationSuggestCard,businessQuiet,clientAppts,clients,coldClients,copyPublicLink,deferred,emptyClient,entrySubtitle,entryTime,fbShowing,fbSteps,fbView,feeCharged,formatDate,getDaysSince,guardWrite,handleApptClick,handleOpenCashier,handleSendConfirmation,herAccent,historyReady,isBusy,leads,leadsWithReminders,liveRcpts,MarketingToday,MonthlyReportCard,monthlyReportData,monthTotals,MonthValueCard,myDayModel,myDayOn,mySlug,newLeadsCount,now,onKbdActivate,openImportFor,openNewAppt,openSettings,ownerNotifs,pc,pcDeep,pcGrad,pcTint,pendingQuestion,productsApi,questionStats,queueApproved,queueDismissed,refreshWaQueue,renderSetupBody,router,saveAutomationsKey,services,setActiveTab,setAiPostsView,setApptNote,setCalDay,setCalView,setEditingAppointmentId,setEditingClient,setFbCelebrate,setNewAppt,setNewClient,setOwnerNotifs,setPhotoPost,setQueueDismissed,setSelectedLead,setSettingsGroup,setShowClientModal,setShowLapsed,setShowModal,setShowSetup,setShowWaQueue,setSkinEdits,setSkinOpen,setTillTab,settings,setupDone,setupOnToday,setupTotal,setWaView,shareBookingWhatsApp,skinEdits,skinOpen,skinQueue,skinQueueError,skinQueueLoading,thisMonthAppts,toast,today,todayAppts,todayEntries,todayTotals,tomorrowAppts,upcomingBirthdays,waMessages,whatsappPending,winbackDays}}/>)}

          {/* INSIGHTS / תובנות — overview & analytics (moved off the calm "היום" home) */}
          {activeTab==="insights"&&!historyReady&&<div className="glass-card" style={{padding:18}}><DeferredGate status={deferred.history} what={tr("את ההיסטוריה")} onRetry={loadHistory}/></div>}
          {activeTab==="insights"&&historyReady&&(<InsightsScreen ctx={{activeClients,coldClients,lastMonthRevenue,monthlyData,now,onKbdActivate,pc,pc2,pcDeep,pcGrad,setShowLapsed,settings,thisMonthLeads,thisMonthRevenue,todayAppts,upcomingBirthdays,waBirthday,weekAppts}}/>)}

          {/* CALENDAR */}
          {activeTab==="calendar"&&(<CalendarScreen ctx={{activeServices,appointments,apptMenuId,calDay,calStaffFilter,calView,clients,copyPublicLink,dayLanes,DAYS_HE,deferred,entrySubtitle,formatDate,formatDateHe,getApptColor,handleApptClick,handleDelete,handleDeletePersonal,handleFinishTreatment,handleNewApptOnDate,handleOpenCashier,handleSlotAtMinute,handleStartTreatment,historyCutoffRef,historyReady,isBusy,markNoShow,openNewAppt,openPersonalEditor,openWaitlist,pc,pcDeep,pcGrad,pcTint,receiptForAppt,sendReminderToClient,setApptMenuId,setApptNote,setCalDay,setCalView,setClientTab,setEditingAppointmentId,setNewAppt,setRebookNext,setSelectedClient,setShowModal,setShowReceipt,setStaffFilter,settings,setWeekStart,STAFF_FILTER_ALL,staffColorOf,staffNameOf,team,teamCal,today,waitlistChipLabel,weekAxis,weekDates,weekScrollRef,weekStart,weekSundayOf,WK_ROW_H}}/>)}

          {/* CLIENTS */}
          {activeTab==="clients"&&(<ClientsScreen ctx={{clientsShown,emptyClient,filteredClients,filterSkin,filterStatus,fmtPhone,getClientAppts,getClientTotal,getDaysSince,historyReady,ListMore,onKbdActivate,openImportFor,pc,pcDeep,pcGrad,peopleSegments,searchQuery,setClientTab,setEditingClient,setFilterSkin,setFilterStatus,setNewClient,setSearchQuery,setSelectedClient,setShowClientModal,setShowLapsed,showMoreClients,showSkinType,SignedImage,SKIN_TYPES,STATUS_COLORS,STATUS_LABELS,waLink}}/>)}

          {/* LEADS */}
          {activeTab==="leads"&&deferred.leads!=="ok"&&<div className="glass-card" style={{padding:18}}><DeferredGate status={deferred.leads} what={tr("את הפניות")} onRetry={loadHistory}/></div>}
          {activeTab==="leads"&&deferred.leads==="ok"&&(<LeadsScreen ctx={{emptyLead,fbEventFails,filteredLeads,fmtPhone,handleConvertLead,LEAD_STATUSES,leadFilter,leadGroup,leads,leadSearch,leadsShown,leadStatusMeta,ListMore,onKbdActivate,openBulk,pc,pcDeep,pcGrad,peopleSegments,setEditingLead,setLeadFilter,setLeadSearch,setNewLead,setSelectedLead,setShowLeadImport,setShowLeadModal,showMoreLeads,SOURCE_ICONS,tomorrow,waLink}}/>)}

          {/* CASHIER */}
          {activeTab==="cashier"&&(<CashierScreen ctx={{afterPaymentRecorded,clients,filteredReceipts,fmtDateHe,GiftVouchersPanel,GrowPaymentRequests,growRefundLine,handleExportCSV,handleOpenCashier,liveRcpts,membershipsAvail,MembershipsPanel,monthTotals,onKbdActivate,PAYMENT_METHODS,pc,pcDeep,pcGrad,pcTint,productsApi,ProductsPanel,receiptFilter,receipts,receiptVoids,services,setActiveTab,setMembershipsAvail,setReceiptFilter,setReceipts,setShowReceipt,setTillTab,settings,setVouchersAvail,tillTab,toast,todayAppts,todayTotals,voidedReceiptIdSet,vouchersAvail,voucherSellReq,waPayment}}/>)}

          {/* WHATSAPP CENTER */}
          {activeTab==="whatsapp"&&<WhatsappScreen ctx={{appointments,clients,coldClients,fmtPhone,formatDate,getDaysSince,getLastApptDate,handleSendConfirmation,historyReady,loadWaMessages,now,pc,pcGrad,peopleSegments,refreshWaQueue,sendNextReminder,setShowWaQueue,settings,setWaBroadcastAudience,setWaBroadcastMsg,setWaFreeClient,setWaFreeMsg,setWaFreeSearch,setWaView,toast,today,tomorrowAppts,upcomingBirthdays,WA_TYPE_LABELS,waBroadcastAudience,waBroadcastMsg,waDeliveryLabel,waFreeClient,waFreeMsg,waFreeSearch,waLogError,waLogLoading,waMessages,waSendGroup,waSendOne,waSentToday,waView,whatsappPending,winbackDays}}/>}

          {/* CAMPAIGNS */}
          {activeTab==="campaigns"&&(<CampaignsScreen ctx={{activeServices,aiPostsView,allSourcesReport,appointments,BookingSourceReport,CesdkReelPoc,clients,clientSourceStats,conversionRate,convertedLeads,deferred,DesignStudio,emptyClient,fbCampaigns,fbDatePreset,fbError,fbLoading,fbPage,fbTotals,generateReel,GiftVoucherMarketingCard,GoogleKitCard,herAccent,historyReady,leads,leadSourceList,liveRcpts,loadFbCampaigns,loadHistory,marketingView,mySlug,openImportFor,origin,pc,pcDeep,pcGrad,pcTint,readOnly,reelData,reelDuration,reelError,reelLoading,reelTopic,reelVibe,saveAutomationsKey,services,setActiveTab,setAiPostsView,setEditingClient,setFbDatePreset,setMarketingView,setNewClient,setReelDuration,setReelTopic,setReelVibe,setSettings,setShowClientModal,setTillTab,settings,SourceReport,toast}}/>)}

          {/* TAX REPORTS */}
          {activeTab==="tax"&&<TaxScreen ctx={{deferred,EXPENSE_CATEGORIES,expenses,handleAddExpense,handleDeleteExpense,historyReady,isBusy,liveRcpts,loadDeferred,loadHistory,MONTHS_HE,newExpense,openSettings,pc,pcDeep,pcGrad,pcTint,setNewExpense,setShowMonthlyReport,setTaxPeriodIdx,setTaxPeriodMode,setTaxYear,settings,TAX_DISCLAIMER,taxPeriodIdx,taxPeriodMode,taxYear,toast,vatRateForYear}}/>}

          {/* AI BUSINESS ADVISOR */}
          {activeTab==="advisor"&&(
 <AdvisorScreen ctx={{advisorAction,advisorInput,advisorMessages,advisorSending,advisorWaitSec,pcDeep,pcGrad,readOnly,sendAdvisor,setAdvisorInput,settings}}/>
          )}

          {/* COMMUNITY */}
          {activeTab==="community"&&(<CommunityScreen ctx={{communityLoading,communityPosts,copyPublicLink,deleteCommunityPost,pc,pcDeep,pcGrad,setNewPost,setShowPostModal}}/>)}

          {/* PROTOCOLS */}
          {activeTab==="protocols"&&(<ProtocolsScreen ctx={{emptyProtocol,pcDeep,pcGrad,protocols,protocolsLoading,setNewProtocol,setShowProtocolModal}}/>)}

          {/* PACKAGES */}
          {activeTab==="packages"&&(<PackagesScreen ctx={{activeServices,deferred,handleSaveOffering,handleUndoPackageSession,handleUsePackageSession,isBusy,loadDeferred,newOffering,NO_SERVICES_HINT,offerings,offeringsError,openSettings,packages,pc,pcDeep,pcGrad,pcTint,setNewOffering,setShowOfferingForm,setShowPackageModal,setShowWaitlistModal,settings,setupHint,showOfferingForm,toggleOffering,waitlist,WaitlistActivity,waLink}}/>)}
          {activeTab==="help"&&<HelpScreen ctx={{deployFlags,expandedHelpKey,helpInline,pc,pcDeep,pcTint,setExpandedHelpKey,settings}}/>}
 </div>
 </div>
 </div>

      {/* APPT MODAL */}
      {rebookNext&&(<RebookNextSheet
        client={rebookNext.client} anchorAppt={rebookNext.appt} appointments={appointments} services={activeServices} settings={settings}
        initialService={rebookNext.service||""}
        today={today} historyReady={historyReady}
        onManual={rebookNext.receiptId ? (args)=>{ setShowReceipt(null); openRebookForm(args); } : openRebookForm}
        createAppointment={rebookNext.receiptId ? async (args)=>{ const row = await insertRebookAppointment(args); if (row) setRebookDone({ receiptId: rebookNext.receiptId, appt: row }); return row; } : insertRebookAppointment}
        onQueued={refreshWaQueue} onOpened={markRebookMessageOpened} onClose={()=>setRebookNext(null)} toast={toast} bufferOf={apptBufferOf}
        pc={pc} pcGrad={pcGrad} pcTint={pcTint} pcDeep={pcDeep}/>)}
      {formAnswersFor&&(<FormAnswersSheet form={formAnswersFor} tenantId={settings?.tenant_id} label={FORM_TYPES_ALL.find(ft=>ft.key===formAnswersFor.form_type)?.label} onClose={()=>setFormAnswersFor(null)} pcTint={pcTint}/>)}
      {clientPageFor&&(<ClientPageSheet client={clientPageFor} onClose={()=>setClientPageFor(null)} toast={toast} pc={pc} pcDeep={pcDeep} pcTint={pcTint}/>)}
      {depositLink&&(<DepositLinkSheet info={depositLink} onClose={()=>setDepositLink(null)} toast={toast} pc={pc} pcTint={pcTint}/>)}
      {showModal&&(
 <ApptModal ctx={{activeServices,appointments,apptAllServices,apptClientMatches,apptClientQuery,apptDayHours,apptDeposit,apptEffectiveStart,apptEndMin,apptGapWarning,apptKeepOwnTime,apptMoreOpen,apptNote,apptOutsideHours,ApptProtocolCard,apptRepeat,apptSelectedOutside,apptSelectedTaken,apptSlotOptions,apptStaff,apptStartMin,apptTimeTouched,clients,closeApptModal,editingAppointmentId,feeCharged,fmtHM,fmtPhone,handleClientSelect,handleDelete,handleFinishTreatment,handleOpenCashier,handleSave,handleServiceSelect,handleStartTreatment,isBusy,markNoShow,newAppt,NO_SERVICES_HINT,pc,pcDeep,pcGrad,pcTint,receiptForAppt,sendReminderToClient,services,servicesByUse,setApptAllServices,setApptClientQuery,setApptDeposit,setApptMoreOpen,setApptNote,setApptRepeat,setApptStaff,setClientTab,setNewAppt,setSelectedClient,setShowReceipt,settings,setupHint,slotIsTaken,team,teamCal,teamOwnerId,toast,today}}/>
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
 <Sheet open onClose={()=>setShowImportHub(false)} width={440} zIndex={1050} className="pop-in" title={tr("ייבוא נתונים")}>
 <ImportFromSystem pc={pc} pcTint={pcTint} pcGrad={pcGrad} zIndex={1070} onImported={()=>{ loadAll(); }}/>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.7,marginBottom:16}}>{tr("יש לך רשימה באקסל, בטלפון או בתוכנה אחרת? אפשר להעביר אותה לכאן בכמה דקות, בלי להקליד הכל מחדש. בחרי מה להעביר:")}</p>
                {renderImportChooser()}
 <button onClick={()=>setShowImportHub(false)} style={{width:"100%",marginTop:14,padding:"11px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit"}}>{tr("אולי מאוחר יותר")}</button>
 </Sheet>
      )}

      {/* 1060 - one step above the hub, so picking a kind visibly replaces it
          rather than appearing behind it, and above Settings for the same
          reason as the hub. */}
      {showImportModal&&(
 <ImportModal ctx={{clients,goToImportMapping,importAppointments,importBuilder,importCols,importContacts,importFields,importGuesser,importHasHeader,importing,importResult,importServices,importSpec,importStage,importTarget,importText,importVcardFile,pc,pcDeep,pcGrad,pickFromContacts,resetImport,services,setImportCols,setImportHasHeader,setImportStage,setImportText,setShowImportModal}}/>
      )}

      {/* CLIENT MODAL */}
      {showClientModal&&(
 <Sheet open onClose={()=>setShowClientModal(false)} width={380} zIndex={1000} title={editingClient?tr("עריכת לקוחה"):tr("לקוחה חדשה")}>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 {/* UX pass 2026-11-08: name and phone first; everything else one tap away behind "פרטים נוספים" (open when editing). */}
 <label style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("שם מלא")}
 <input value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder={tr("שם מלא *")} style={{width:"100%",marginTop:3,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/></label>
 <label style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("טלפון (לתזכורות בוואטסאפ)")}
 <input type="tel" inputMode="tel" dir="ltr" value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})} placeholder="05X-XXXXXXX" style={{width:"100%",marginTop:3,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:"var(--surface-2)"}}/></label>
 <button type="button" data-testid="client-more" aria-expanded={clientMoreOpen||!!editingClient} onClick={()=>setClientMoreOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",minHeight:44,background:"none",border:"none",borderTop:"1px solid var(--line)",padding:"4px 2px",cursor:"pointer",fontFamily:"inherit"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:700,color:pcDeep}}>{tr("פרטים נוספים")}</span>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)"}}>{(clientMoreOpen||editingClient)?tr("סגירה"):tr("יום הולדת, אלרגיות, הערות")}</span>
 </button>
 {(clientMoreOpen||!!editingClient)&&(<>
 <label style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",fontWeight:600}}>{tr("יום הולדת (לברכה אוטומטית)")}
 <input type="date" value={newClient.birthday} onChange={e=>setNewClient({...newClient,birthday:e.target.value})} style={{width:"100%",marginTop:3,border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/></label>
 {showSkinType&&(<select value={newClient.skinType} onChange={e=>setNewClient({...newClient,skinType:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("סוג עור")}</option>{SKIN_TYPES.map(t=><option key={t}>{t}</option>)}</select>)}
 <textarea value={newClient.allergies} onChange={e=>setNewClient({...newClient,allergies:e.target.value})} placeholder={tr("אלרגיות")} rows={2} style={{width:"100%",border:"1px solid rgba(242,184,75,0.16)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)",resize:"none"}}/>
 <textarea value={newClient.medical} onChange={e=>setNewClient({...newClient,medical:e.target.value})} placeholder={tr("מצבים רפואיים")} rows={2} style={{width:"100%",border:"1px solid #A7C4F4",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)",resize:"none"}}/>
 <textarea value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})} placeholder={tr("משהו שכדאי לזכור עליה. למשל: מתחתנת בנובמבר, לא אוהבת ריח חזק")} rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"none"}}/>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:4}}>{tr("סטטוס")}</p><div style={{display:"flex",gap:4}}>{Object.entries(STATUS_LABELS).map(([key,label])=><button key={key} onClick={()=>setNewClient({...newClient,status:key})} style={{flex:1,padding:"7px 2px",border:"1px solid",borderColor:newClient.status===key?pc:"var(--line)",borderRadius:"var(--r-sm)",background:newClient.status===key?STATUS_COLORS[key]:pcTint,color:newClient.status===key?"var(--surface)":"var(--ink-2)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{trv(label)}</button>)}</div></div>
 </>)}
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowClientModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={handleSaveClient} disabled={isBusy("saveClient")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("saveClient")?<Spinner inline label={tr("שומרת")}/>:tr("שמירה ✓")}</button>
 </div>
 </Sheet>
      )}

      {/* LEAD MODAL */}
      {showLeadModal&&(
 <Sheet open onClose={()=>setShowLeadModal(false)} width={370} zIndex={1000} title={editingLead?tr("עריכת פנייה"):tr("פנייה חדשה")}>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 <input value={newLead.name} onChange={e=>setNewLead({...newLead,name:e.target.value})} placeholder={tr("שם *")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
 <input type="tel" inputMode="tel" dir="ltr" aria-label={tr("טלפון")} value={newLead.phone} onChange={e=>setNewLead({...newLead,phone:e.target.value})} placeholder={tr("טלפון")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:"var(--surface-2)"}}/>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מקור")}</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{leadSourceList.map(s=><button key={s} onClick={()=>setNewLead({...newLead,source:s})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.source===s?pc:"var(--line)",borderRadius:"var(--r-lg)",background:newLead.source===s?pcGrad:pcTint,color:newLead.source===s?"var(--pc-contrast)":"var(--ink-2)",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit"}}>{SOURCE_ICONS[s]} {s}</button>)}</div></div>
 <select value={newLead.service_interest} onChange={e=>setNewLead({...newLead,service_interest:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("תחום עניין")}</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("סטטוס")}</p><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(LEAD_STATUSES).map(([key,s])=><button key={key} onClick={()=>setNewLead({...newLead,status:key})} style={{padding:"6px 9px",border:"1px solid",borderColor:newLead.status===key?s.color:"var(--line)",borderRadius:"var(--r-lg)",background:newLead.status===key?s.bg:pcTint,color:newLead.status===key?s.color:"var(--ink-2)",fontSize:"var(--t-sm)",cursor:"pointer",fontFamily:"inherit",fontWeight:newLead.status===key?700:400}}>{trv(s.label)}</button>)}</div></div>
 <div><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("תזכורת מעקב")}</p><input type="date" value={newLead.reminder_date} onChange={e=>setNewLead({...newLead,reminder_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/></div>
 <textarea value={newLead.notes} onChange={e=>setNewLead({...newLead,notes:e.target.value})} placeholder={tr("הערות")} rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowLeadModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={handleSaveLead} disabled={isBusy("saveLead")} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{isBusy("saveLead")?<Spinner inline label={tr("שומרת")}/>:tr("שמירה ✓")}</button>
 </div>
 </Sheet>
      )}

      {/* BULK WHATSAPP MODAL — compose -> confirm -> sending -> result.
          Nothing is sent until the explicit "confirm" step, which shows the
          real recipient count. Reuses app/api/leads/send-bulk/route.js. */}
      {bulkStatus&&<BulkStatusModal ctx={{bulkConfirmConsent,bulkError,bulkLeadIds,bulkMessage,bulkResult,bulkStatus,bulkStep,closeBulk,confirmBulkSend,leads,leadStatusMeta,markLeadContacted,pcDeep,pcGrad,pcTint,setBulkConfirmConsent,setBulkError,setBulkMessage,setBulkStep,settings}}/>}

      {/* CASHIER MODAL */}
      {showCashier&&(
 <CashierModal ctx={{activeServices,applyCashierAdjustments,applyLoyaltyReward,cashierAllServices,cashierAppt,cashierClient,cashierDiscount,cashierDiscountIls,cashierDiscountMode,cashierExtrasOpen,cashierItems,cashierLoyalty,cashierNote,cashierPackage,cashierSearch,cashierTip,cashierTotal,clients,drawFromPackage,GrowCashierCredit,GrowChargePanel,growCreditUsed,growDepositUsed,handleSaveReceipt,isBusy,legalAccount,loyaltyApplied,loyaltyCfg,loyaltyRewardLive,membershipAdj,MembershipTill,NO_SERVICES_HINT,openSetupTab,openVoucherSale,paymentMethod,pc,pcDeep,pcGrad,pcTint,productsApi,SELECTABLE_PAYMENT_METHODS,servicesByUse,setCashierAllServices,setCashierClient,setCashierDiscount,setCashierDiscountMode,setCashierExtrasOpen,setCashierItems,setCashierNote,setCashierSearch,setCashierTip,setDrawFromPackage,setGrowAdj,setMembershipAdj,setPaymentMethod,setReceipts,setShowCashier,setSplitLines,setSplitOn,settings,setupHint,setVoucherAdj,splitLines,splitOn,splitResolved,TAX_STATUS_HE,taxStatusUnconfirmed,toast,voucherAdj,voucherDue,VoucherRedeemTill,vouchersAvail,waPayment}}/>
      )}

      {/* RECEIPT MODAL */}
      {showReceipt&&(
 <ReceiptModal ctx={{activeServices,appointments,clients,confirmRebook,consentAskFor,DAYS_HE,editRebook,fmtDateHe,formatDateHe,growRefundLine,handleVoidReceipt,isBusy,isVoidComplete,legalAccount,loyaltyAfterFor,loyaltyFor,pc,pcDeep,pcGrad,pcTint,printReceipt,REBOOK_INTERVALS,rebookDone,rebookMinute,rebookPickOpen,rebookPlan,rebookSlots,rebookWeeks,receiptShareText,receiptVoids,retryCredit,retryLegal,saveClientMarketing,sendReceiptToClient,setBusyKey,setConsentAskFor,setRebookNext,setRebookPick,setRebookPickOpen,setRebookWeeks,setShowReceipt,settings,setVoidGrowRefund,setVoidOpen,setVoidReason,showReceipt,today,voidGrowRefund,voidOpen,voidReason,waMsg}}/>
      )}

      {/* PERSONAL EVENT MODAL — her own time, not a client's.
          Deliberately NOT the appointment modal with fields hidden: that modal
          is a client search and a list of treatments, and every one of its
          controls is about someone else. This one asks for a title, a when, and
          nothing else. */}
      {showPersonalModal&&personalDraft&&(
 <PersonalEventModal ctx={{appointments,closePersonalEditor,datesInRange,handleDeletePersonal,handleSavePersonal,isBusy,pc,pcDeep,pcGrad,personalDraft,setPersonalDraft}}/>
      )}

      {/* PACKAGE MODAL */}
      {showPackageModal&&(
 <PackageModal ctx={{activeServices,clients,handleSavePackage,newPackage,NO_CLIENTS_HINT,NO_SERVICES_HINT,offerings,PAYMENT_METHODS,pcGrad,pcTint,setNewPackage,setShowPackageModal,setupHint}}/>
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
 <nav className="mobile-only app-bottombar" aria-label={tr("ניווט תחתון")} style={{position:"fixed",insetInline:0,bottom:0,zIndex:900,
        /* Fully opaque: at 94% the cards scrolling underneath showed through behind the labels. */
        background:"linear-gradient(0deg, var(--pc-chrome), var(--pc-chrome)), #FCFAFE",
        borderTop:"1px solid var(--line)",boxShadow:"var(--shadow-md)",
        /* NO inline display here. An inline style outranks a class selector,
           so display:flex would beat .mobile-only{display:none} and the bar
           would render on desktop alongside the sidebar. Visibility is left
           entirely to .mobile-only, which supplies flex below the breakpoint
           and none above it. */
        alignItems:"stretch",
        paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
        {BOTTOM_NAV.map(item=>{
          const on = activeTab===item.id || (item.id==="clients" && PEOPLE_TABS.includes(activeTab));
          return (
 <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMoreSheet(false);}}
        aria-current={on?"page":undefined} aria-label={trv(item.label)}
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:on?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",position:"relative",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:"var(--r-sm)",background:on?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
              {navIcon(item.id)}
              {item.id==="clients"&&newLeadsCount>0&&(
 <span style={{position:"absolute",top:4,insetInlineEnd:"50%",transform:"translateX(50%) translateX(14px)",
               background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)",fontWeight:700,lineHeight:1,
               padding:"2px 6px",borderRadius:"var(--r-lg)",boxShadow:"var(--shadow-accent)"}}>{newLeadsCount}</span>
              )}
 </span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:on?700:500,letterSpacing:"-0.01em"}}>{trv(item.label)}</span>
 </button>
          );
        })}
        {/* עוד — opens the sheet with everything that does not fit above. */}
 <button onClick={()=>setShowMoreSheet(v=>!v)} aria-expanded={showMoreSheet} aria-label={tr("עוד")}
        style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,padding:"9px 2px 7px",color:showMoreSheet?"var(--pc)":"var(--ink-3)",
                transition:"color 0.18s",minHeight:58}}>
 <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:26,
               borderRadius:"var(--r-sm)",background:showMoreSheet?"var(--pc-tint)":"transparent",transition:"background 0.18s"}}>
 <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>
 </svg>
 </span>
 <span style={{fontSize:"var(--t-sm)",fontWeight:showMoreSheet?700:500,letterSpacing:"-0.01em"}}>{tr("עוד")}</span>
 </button>
 </nav>

      {/* "עוד" SHEET — the remaining tabs. */}
      {showMoreSheet&&(
 <MoreSheetModal ctx={{ACADEMY_ON,AcademyNavEntry,activeTab,MORE_NAV,NAV_ITEMS,navIcon,ownerEntry,ProtocolBookNavEntry,router,setActiveTab,setShowMobileSidebar,setShowMoreSheet,tillOnly}}/>
      )}

      {/* PROTOCOL MODAL */}
      {showProtocolModal&&(
          <Sheet open onClose={()=>setShowProtocolModal(false)} width={440} zIndex={1000} title={tr("פרוטוקול חדש")}>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input value={newProtocol.brand} onChange={e=>setNewProtocol({...newProtocol,brand:e.target.value})} placeholder={tr("מותג *")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
              <input value={newProtocol.name} onChange={e=>setNewProtocol({...newProtocol,name:e.target.value})} placeholder={tr("שם הפרוטוקול *")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
              <input value={newProtocol.concern} onChange={e=>setNewProtocol({...newProtocol,concern:e.target.value})} placeholder={tr("בעיה שהפרוטוקול פותר (אקנה, אנטי-אייג׳ינג...)")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
              <input value={newProtocol.frequency} onChange={e=>setNewProtocol({...newProtocol,frequency:e.target.value})} placeholder={tr("תדירות (למשל: אחת לשבועיים)")} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}/>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מספר מפגשים")}</p><input type="number" value={newProtocol.sessions_count} onChange={e=>setNewProtocol({...newProtocol,sessions_count:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("זמן (דקות)")}</p><input type="number" value={newProtocol.duration_minutes} onChange={e=>setNewProtocol({...newProtocol,duration_minutes:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
                <div style={{flex:1}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>{tr("מחיר ₪")}</p><input type="number" value={newProtocol.price} onChange={e=>setNewProtocol({...newProtocol,price:Number(e.target.value)})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",textAlign:"center",background:pcTint}}/></div>
              </div>
              <textarea value={newProtocol.notes} onChange={e=>setNewProtocol({...newProtocol,notes:e.target.value})} placeholder={tr("הערות / התוויות נגד")} rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"none"}}/>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setShowProtocolModal(false)} style={{flex:1,padding:"11px 0",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{tr("ביטול")}</button>
                <button onClick={handleSaveProtocol} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("שמירה ✓")}</button>
              </div>
            </div>
          </Sheet>
      )}

      {/* WAITLIST MODAL */}
      {showWaitlistModal&&(
 <Sheet open onClose={()=>setShowWaitlistModal(false)} width={340} zIndex={1000} title={tr("הוספה לרשימת המתנה")}>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {clients.length===0&&setupHint(NO_CLIENTS_HINT)}
                  {activeServices.length===0&&setupHint(NO_SERVICES_HINT)}
 <select value={newWaitlist.client_id} onChange={e=>{const c=clients.find(cl=>String(cl.id)===e.target.value);setNewWaitlist({...newWaitlist,client_id:e.target.value,client_name:c?.name||"",phone:c?.phone||""});}} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("בחרי לקוחה")}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <select value={newWaitlist.service} onChange={e=>setNewWaitlist({...newWaitlist,service:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:"var(--surface-2)"}}><option value="">{tr("בחרי שירות")}</option>{activeServices.map(s=><option key={s.name}>{s.name}</option>)}</select>
 <input type="date" value={newWaitlist.preferred_date} onChange={e=>setNewWaitlist({...newWaitlist,preferred_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line-2)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:"var(--surface-2)"}}/>
 <textarea value={newWaitlist.notes} onChange={e=>setNewWaitlist({...newWaitlist,notes:e.target.value})} placeholder={tr("הערות")} rows={2} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"9px 12px",fontSize:"var(--t-xs)",fontFamily:"inherit",outline:"none",direction:uiDir(),background:pcTint,resize:"none"}}/>
 </div>
 <div style={{display:"flex",gap:6,marginTop:16}}>
 <button onClick={()=>setShowWaitlistModal(false)} className="primary-btn" style={{flex:1,padding:"11px 0",border:"1px solid var(--line)",background:"var(--surface)",fontSize:"var(--t-sm)",color:"var(--ink-2)"}}>{tr("ביטול")}</button>
 <button onClick={handleSaveWaitlist} className="primary-btn" style={{flex:2,padding:"11px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>{tr("שמירה ✓")}</button>
 </div>
 </Sheet>
      )}

      {/* COMMUNITY POST MODAL */}
      {showPostModal&&(
 <Sheet open onClose={()=>setShowPostModal(false)} width={460} zIndex={1300} title={tr("פוסט חדש למרחב הלקוחות")}>

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("סוג הפוסט")}</p>
 <div style={{display:"flex",gap:6,marginBottom:13}}>
 {[{k:"update",l:tr("עדכון")},{k:"offer",l:tr("מבצע")},{k:"tip",l:tr("טיפ")}].map(t=>(
 <button key={t.k} onClick={()=>setNewPost({...newPost,post_type:t.k})} style={{flex:1,padding:"8px 0",borderRadius:"var(--r-sm)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:newPost.post_type===t.k?`2px solid ${pc}`:"1px solid var(--line)",background:newPost.post_type===t.k?pcTint:"var(--surface)",color:pc}}>{trv(t.l)}</button>
 ))}
 </div>

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("כותרת (לא חובה)")}</p>
 <input value={newPost.title} onChange={e=>setNewPost({...newPost,title:e.target.value})} placeholder={tr("לדוגמה: מבצע אביב")} style={{width:"100%",padding:"10px 12px",borderRadius:"var(--r-sm)",border:"1px solid var(--pc-tint)",fontSize:"var(--t-sm)",fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("תוכן")}</p>
 <textarea value={newPost.body} onChange={e=>setNewPost({...newPost,body:e.target.value})} rows={4} placeholder={tr("כתבי כאן את העדכון, המבצע או הטיפ...")} style={{width:"100%",padding:"10px 12px",borderRadius:"var(--r-sm)",border:"1px solid var(--pc-tint)",fontSize:"var(--t-sm)",fontFamily:"inherit",marginBottom:12,boxSizing:"border-box",resize:"vertical"}}/>

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("טקסט לכפתור (לא חובה)")}</p>
 <input value={newPost.cta_label} onChange={e=>setNewPost({...newPost,cta_label:e.target.value})} placeholder={tr("לדוגמה: לפרטים בוואטסאפ")} style={{width:"100%",padding:"10px 12px",borderRadius:"var(--r-sm)",border:"1px solid var(--pc-tint)",fontSize:"var(--t-sm)",fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:5}}>{tr("תמונה (לא חובה)")}</p>
 {newPost.image_url&&<img alt="" src={newPost.image_url} style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:"var(--r-sm)",marginBottom:8}}/>}
 <label style={{display:"block",padding:"9px 0",textAlign:"center",borderRadius:"var(--r-sm)",border:"1px dashed var(--line)",fontSize:"var(--t-sm)",color:pc,cursor:"pointer",marginBottom:16,fontWeight:600}}>
 {postImageUploading?<Spinner inline label={tr("מעלה")}/>:newPost.image_url?tr("החלפת תמונה"):tr("+ הוספת תמונה")}
 <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadPostImage(f);}}/>
 </label>

 <div style={{display:"flex",gap:8}}>
 <button onClick={saveCommunityPost} disabled={savingPost} className="primary-btn" style={{flex:1,padding:"12px 0",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-md)",opacity:savingPost?0.6:1}}>{savingPost?<Spinner inline label={tr("מפרסם")}/>:tr("פרסום")}</button>
 <button onClick={()=>setShowPostModal(false)} style={{padding:"12px 18px",background:"var(--surface)",color:"var(--ink-2)",border:"1px solid var(--pc-tint)",borderRadius:"var(--r-sm)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit"}}>{tr("ביטול")}</button>
 </div>
 </Sheet>
      )}

      {/* SETTINGS MODAL */}
      {showSetup && (
          <Sheet open onClose={()=>setShowSetup(false)} width={460} zIndex={1100} ariaLabel={tr("הגדרת המערכת")}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)"}}>{tr("הגדרת המערכת")}</h3>
              <button onClick={()=>setShowSetup(false)} className="icon-btn" aria-label={tr("סגירה")}>✕</button>
            </div>
            {renderSetupBody(true)}
          </Sheet>
      )}

      {showSettings&&editSettings&&(
 <SettingsScreen ctx={{activeServices,askConfirm,authEmail,AutoToggleRow,BillingCard,BookingButtonsCard,brandUploading,BusinessReferralCard,CalendarFeedCard,clientReviews,clientReviewsError,CLOSE_HOURS,closeSettings,copyPublicLink,DAYS_HE,downloadScanQr,editServices,editSettings,fbPageBusy,fbPages,FieldPicker,GiftVoucherSettings,GoalsEditor,GreetingsPanel,GrowCard,handleAddService,handleAddTemplateServices,handleChangePassword,handleDeleteService,handleLogout,HOURS_ALL,hourSelectStyle,ImportFromSystem,inG,isBusy,LEAD_STATUS_COLORS,leadKeyBusy,leadKeyConfigured,leadKeyJustGenerated,LeadSourcesEditor,legalAccount,legalKeyId,legalMsg,legalSecret,loadAll,loadScanLink,mySlug,newService,openImportHub,origin,panelDirty,patchDraftService,PaymentsSettings,pc,pcDeep,pcGrad,pcTint,productsApi,ProductSettings,PushSubscribeButton,pwConfirm,pwCurrent,pwNew,RebookSetting,renderImportChooser,ResultsManager,saveAutomationsKey,saveSettingsPanel,saveSlug,scanLink,scanLinkError,scanQr,scanQuota,services,ServiceTemplatePicker,setBusyKey,setEditSettings,setLeadKeyBusy,setLeadKeyConfigured,setLeadKeyJustGenerated,setLegalAccount,setLegalKeyId,setLegalMsg,setLegalSecret,setNewService,setPwConfirm,setPwCurrent,setPwNew,setSettingsGroup,setShowNewService,setShowSetup,setShowTemplatePicker,setSlugDraft,setSlugNote,setTemplatePicks,settings,settingsGroup,setupDone,setupTotal,showNewService,showTemplatePicker,slugBusy,slugDraft,slugNote,taxStatusUnconfirmed,team,TeamSettings,templatePicks,tillOnly,toast,Toggle,toggleDraftServiceActive,toggleFbPage,toggleReviewHidden,undeleteDraftService,uploadBrandAsset,uploadClinicPhoto,uploadGalleryImage,uploadServicePhoto,VisitFeedbackPanel,WaAutoMessagesSetting,waCentralConnected,WaitlistOfferSetting}}/>
      )}

      {/* CLIENT PROFILE DRAWER */}
      {selectedClient&&(
 <ClientCardModal ctx={{activeServices,askConfirm,clientPhotos,ClientPrivacyPanel,ClientProtocolCourses,ClientReferral,clients,clientScans,clientTab,deferred,feeCharged,fmtDateHe,FORM_TYPES_ALL,formatDate,getClientAppts,getClientForms,getClientLead,getClientPackages,getClientReceipts,getClientTotal,getDaysSince,guardWrite,handleClientErased,handleDeleteImage,handleOpenCashier,handleSendForm,handleUploadImage,handleUsePackageSession,historyReady,isBusy,loadDeferred,loadHistory,loyaltyDb,loyaltyFor,MembershipClientCard,mySlug,onKbdActivate,openEditClient,PAYMENT_METHODS,pc,pc2,pcDeep,pcGrad,pcTint,photoTreatmentPrefill,photoUploading,saveClientMarketing,scanClientSkin,scanLoading,scansLoading,selectedClient,sendReminderToClient,setApptNote,setCashierClient,setCashierSearch,setClientPageFor,setClientTab,setEditingAppointmentId,setFormAnswersFor,setNewAppt,setPhotoPost,setPhotoTreatmentPrefill,setRebookNext,setSelectedClient,setShowModal,setShowReceipt,settings,setViewScan,SignedImage,STATUS_COLORS,STATUS_LABELS,toast,today,uploadClientPhoto,uploading,waLink,writeLoyaltyAdjustment}}/>
      )}

      {/* SKIN SCAN RESULT MODAL */}
      {/* SKIN-SCAN LOADING OVERLAY — calm, on-brand, cycles reassuring steps */}
      {scanLoading&&(
 <Sheet open onClose={()=>{}} busy width={320} zIndex={1400} className="pop-in" ariaLabel={tr("סורקת את העור")}>
 <div style={{textAlign:"center",padding:"8px 6px"}}>
 <div className="fm-pulse" style={{width:78,height:78,borderRadius:"50%",margin:"0 auto 18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"var(--t-hero)",background:pcGrad,boxShadow:"var(--shadow-accent)"}}>🔍</div>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",marginBottom:8}}><Spinner inline label={tr("מנתחת את העור")}/></p>
 <p style={{fontSize:"var(--t-sm)",color:pcDeep,fontWeight:600,minHeight:18}}>{trv(SCAN_STEPS[scanStep%SCAN_STEPS.length])}</p>
 <div style={{display:"flex",gap:5,justifyContent:"center",marginTop:16}}>
                {SCAN_STEPS.map((_,i)=><span key={i} style={{width:6,height:6,borderRadius:"50%",background:i===scanStep%SCAN_STEPS.length?pc:"var(--line-2)",transition:"background 0.3s"}}/>)}
 </div>
 </div>
 </Sheet>
      )}

      {(scanReport||viewScan)&&<ScanReportModal ctx={{activeServices,formatDate,pc,pcGrad,pcTint,scanReport,selectedClient,setApptNote,setEditingAppointmentId,setNewAppt,setScanReport,setSelectedClient,setShowModal,settings,setViewScan,SignedImage,viewScan}}/>}

      {/* LEAD PROFILE DRAWER */}
      {selectedLead&&(
 <LeadCardModal ctx={{fmtDateHe,handleConvertLead,handleSetReminder,handleUpdateLeadStatus,isBusy,LEAD_STATUSES,leadStatusMeta,openBulk,openEditLead,pc,pc2,selectedLead,setSelectedLead,SOURCE_ICONS,waLink}}/>
      )}

 </div>
  );
}

// ── "showing N of M" + הצג עוד ──────────────────────────────────────────────
//
// Shared by the leads and clients lists. Renders NOTHING when everything is
// already on screen, so a short list looks exactly as it did before.
//
// The count line is always shown once the list is windowed, not just the
// button: a list that silently stops at 50 with no explanation reads as "that
// is all there is", which is precisely the wrong impression when she has 250.
function ListMore({ shown, total, onMore, pc, noun }) {
  if (total <= shown) return null;
  const remaining = total - shown;
  const next = Math.min(50, remaining);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 0 4px" }}>
      <p style={{ fontSize:"var(--t-sm)", color: "var(--ink-3)" }}>
        {tr("מציג")} {shown} {tr("מתוך")} {total} {noun}
      </p>
      <button
        type="button"
        onClick={onMore}
        style={{
          border: `1px solid ${pc}`, background: "var(--surface)", color: pc,
          borderRadius:"var(--r-xl)", padding: "9px 22px", fontSize:"var(--t-sm)", fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {tr("הצגת עוד")} {next}
      </button>
    </div>
  );
}

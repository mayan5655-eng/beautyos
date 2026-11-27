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
import { useDataLoadingSection } from "./sections/useDataLoadingSection";
import { useDerivedDataSection } from "./sections/useDerivedDataSection";
import { useCalendarViewSection } from "./sections/useCalendarViewSection";
import { usePersonalEventsSection } from "./sections/usePersonalEventsSection";
import { useAppointmentFormSection } from "./sections/useAppointmentFormSection";
import { usePendingQuestionsSection } from "./sections/usePendingQuestionsSection";
import { useAppointmentActionsSection } from "./sections/useAppointmentActionsSection";
import { useClientSaveSection } from "./sections/useClientSaveSection";
import { useImportingSection } from "./sections/useImportingSection";
import { useLeadsSection } from "./sections/useLeadsSection";
import { useUploadsSection } from "./sections/useUploadsSection";
import { useServicesSettingsSection } from "./sections/useServicesSettingsSection";
import { useLegalDocsSection } from "./sections/useLegalDocsSection";
import { useCashierSaveSection } from "./sections/useCashierSaveSection";
import { useRebookSection } from "./sections/useRebookSection";
import { useExpensesSection } from "./sections/useExpensesSection";
import { useVoiceSection } from "./sections/useVoiceSection";
import { usePackagesSection } from "./sections/usePackagesSection";
import { useClientPhotosSection } from "./sections/useClientPhotosSection";
import { useMarketingSection } from "./sections/useMarketingSection";
import { useAdvisorCommunitySection } from "./sections/useAdvisorCommunitySection";

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
  const {historyCutoffRef,loadAll,loadDeferred,loadHistory} = useDataLoadingSection({FORM_LIST_COLUMNS,isAuthTransportFailure,leavingForOnboardingRef,router,setAppointments,setAuthEmail,setClients,setCurrentPlan,setDeferred,setExpenses,setForms,setLeads,setLoadError,setLoading,setOwnerNotifs,setPackages,setPlanRow,setReceipts,setReceiptVoids,setServices,setSettings,setWaitlist,setWhatsappPending,toast});

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
  const {activeClients,allSourcesReport,clientAppts,clientSourceStats,clientsShown,coldClients,conversionRate,convertedLeads,favoritePaymentMethod,filteredClients,filteredLeads,filteredReceipts,getClientAppts,getClientForms,getClientLead,getClientPackages,getClientReceipts,getClientTotal,getDaysSince,getLastApptDate,globalResults,lastMonthRevenue,leadGroup,leadSourceList,leadsShown,leadsWithReminders,monthlyData,monthlyReportData,monthTotals,myDayModel,myDayOn,newLeadsCount,openSearchResult,showMoreClients,showMoreLeads,teamNet,thisMonthAppts,thisMonthLeads,thisMonthRevenue,todayAppts,todayEntries,todayTotals,tomorrowAppts,tomorrowCancelled,tomorrowConfirmed,tomorrowEntries,tomorrowPending,upcomingBirthdays,weekAppts,winbackDays} = useDerivedDataSection({activeServices,appointments,clients,clientWindow,deferred,filterSkin,filterStatus,fmtDateHe,formatDate,forms,globalSearch,historyReady,lastMonth,lastMonthYear,LEAD_SOURCES,LEAD_STATUSES,leadFilter,leads,leadSearch,leadWindow,LIST_PAGE,liveRcpts,MONTHS_HE,now,openSettings,packages,receiptFilter,receipts,searchQuery,SELECTABLE_PAYMENT_METHODS,services,setActiveTab,setClientTab,setClientWindow,setGlobalSearch,setLeadWindow,setSelectedClient,setSelectedLead,setShowReceipt,settings,setWeekStart,SOURCE_ICONS,thisMonth,thisYear,today,tomorrow,vatRateForYear,weekStart,weekSundayOf,late:{get entrySubtitle(){return entrySubtitle;}}});

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
  const {dayLanes,entrySubtitle,entryTime,getApptColor,handleApptClick,handleNewApptOnDate,handleSlotAtMinute,openWaitlist,PERSONAL_MAX_DAYS,waitlistChipLabel,weekAxis} = useCalendarViewSection({activeServices,appointments,calView,deferred,editOrigRef,formatDate,setActiveTab,setApptNote,setEditingAppointmentId,setNewAppt,setShowModal,setShowWaitlistModal,settings,staffShown,team,teamCal,waitlist,weekDates,weekScrollRef,weekStart,WK_ROW_H,late:{get openPersonalEditor(){return openPersonalEditor;}}});

  // series_id is a uuid column, so a fallback that is not uuid-shaped would be
  // rejected by the database rather than degrading.
  const {closePersonalEditor,datesInRange,handleDeletePersonal,handleSavePersonal,openPersonalEditor} = usePersonalEventsSection({appointments,askConfirm,calDay,formatDate,guardWrite,handleDbError,isBusy,PERSONAL_MAX_DAYS,personalDraft,setAppointments,setBusyKey,setPersonalDraft,setShowPersonalModal,settings,toast});

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

  const {closeApptModal,handleClientSelect,handleSave,handleServiceSelect} = useAppointmentFormSection({activeServices,appointments,apptBufferOf,apptBuffersApply,apptDeposit,apptEffectiveStart,apptNote,apptRepeat,apptStaff,apptStaffWrite,askConfirm,clients,editingAppointmentId,editOrigRef,guardWrite,handleDbError,isBusy,newAppt,newApptBuffer,setAppointments,setApptAllServices,setApptClientQuery,setApptMoreOpen,setApptNote,setApptRepeat,setBusyKey,setClients,setDepositLink,setEditingAppointmentId,setNewAppt,setShowModal,settings,team,teamCal,toast});

  // "The one question" - load the newest pending question and the running
  // yes/no counts. Expires questions whose slot is too close for a 4h claim
  // link to matter (under 2 hours away), so a stale question never shows.
  const {answerQuestion,businessQuiet,loadPendingQuestion,triggerGapFill} = usePendingQuestionsSection({activeTab,appointments,isBusy,setBusyKey,setComposeDone,setComposeSend,setPendingQuestion,setQuestionStats,settings,toast,late:{get refreshWaQueue(){return refreshWaQueue;}}});

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
  const {feeCharged,handleDelete,handleFinishTreatment,handleSendAllConfirmations,handleSendConfirmation,handleStartTreatment,markNoShow,sendNextReminder,softCancelAppointment} = useAppointmentActionsSection({askConfirm,clients,fetchConfirmLinks,fmtDateHe,guardWrite,handleDbError,loadPendingQuestion,runOnce,setAppointments,setReceipts,settings,setWhatsappPending,toast,tomorrowAppts,triggerGapFill,waConfirmLink,late:{get refreshWaQueue(){return refreshWaQueue;}}});

  // After her data was erased on the server: the same change here, so the screen does not show a client who no longer exists.
  const {handleClientErased,handleSaveClient,saveClientMarketing} = useClientSaveSection({askConfirm,clients,editingClient,emptyClient,guardWrite,handleDbError,isBusy,newClient,setAppointments,setBusyKey,setClientMoreOpen,setClients,setEditingClient,setForms,setLeads,setNewAppt,setNewClient,setPackages,setReceipts,setSelectedClient,setShowClientModal,setWaitlist,showClientModal,toast,late:{get openNewAppt(){return openNewAppt;}}});

  // Parse pasted text into {name, phone} rows. Accepts "name, phone" or
  // "name <tab/space> phone", one per line.
  const {goToImportMapping,importAppointments,importBuilder,importContacts,importFields,importGuesser,importServices,importSpec,importVcardFile,openImportFor,openImportHub,pickFromContacts,renderImportChooser,resetImport} = useImportingSection({appointments,clients,emptyClient,guardWrite,historyReady,ImportChooser,importCols,importHasHeader,importing,importTarget,importText,now,pc,pcTint,services,setAppointments,setClients,setImportCols,setImportHasHeader,setImporting,setImportResult,setImportStage,setImportTarget,setImportText,setServices,setShowImportHub,setShowImportModal,setShowSettings,settings,toast,today});

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

  const {closeBulk,confirmBulkSend,handleConvertLead,handleSaveLead,handleSetReminder,handleUpdateLeadStatus,markLeadContacted,openBulk} = useLeadsSection({activeServices,askConfirm,bulkConfirmConsent,bulkLeadIds,bulkMessage,bulkResult,bulkStatus,editingLead,emptyLead,formatDate,guardWrite,handleDbError,isBusy,LEAD_STATUSES,newLead,setApptNote,setBulkConfirmConsent,setBulkError,setBulkLeadIds,setBulkMessage,setBulkResult,setBulkStatus,setBulkStep,setBusyKey,setClients,setEditingAppointmentId,setEditingLead,setLeads,setNewAppt,setNewLead,setSelectedLead,setShowLeadModal,setShowModal,settings,toast});

  const {handleDeleteImage,handleUploadImage,uploadBrandAsset,uploadClinicPhoto,uploadGalleryImage,uploadServicePhoto} = useUploadsSection({askConfirm,guardWrite,handleDbError,setBrandUploading,setClients,setEditSettings,setSelectedClient,settings,setUploading,toast});

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
  const {handleAddService,handleAddTemplateServices,handleDeleteService,patchDraftService,saveSettingsPanel,toggleDraftServiceActive,undeleteDraftService} = useServicesSettingsSection({editServices,editSettings,guardWrite,handleDbError,isBusy,isConnectionError,newService,pendingCardSaves,readOnly,services,setBusyKey,setEditServices,setEditSettings,setNewService,setServices,setSettings,setShowNewService,setShowTemplatePicker,setTemplatePicks,settings,settingsDirty,templatePicks,toast});

  // A void counts as complete (leaves the totals) only once its credit document exists.
  const {afterPaymentRecorded,growRefundLine,handleVoidReceipt,isVoidComplete,retryCredit,retryLegal} = useLegalDocsSection({askConfirm,growRefundStates,guardWrite,handleDbError,isBusy,legalAccount,loyaltyCfg,loyaltyDb,productsApi,receipts,receiptVoids,runOnce,setBusyKey,setGrowRefundStates,setReceipts,setReceiptVoids,setShowReceipt,settings,setVoidOpen,setVoidReason,toast,voidGrowRefund,voidReason,late:{get sendReceiptToClient(){return sendReceiptToClient;}}});

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
  const {applyCashierAdjustments,applyLoyaltyReward,handleSaveReceipt,writeLoyaltyAdjustment} = useCashierSaveSection({afterPaymentRecorded,appointments,askConfirm,cashierAppt,cashierClient,cashierDiscount,cashierDiscountIls,cashierDiscountMode,cashierItems,cashierLoyalty,cashierNote,cashierPackage,cashierTip,cashierTotal,drawFromPackage,dupPayOk,growCreditUsed,growDepositUsed,guardWrite,handleDbError,isBusy,legalAccount,liveRcpts,loadLoyaltyRows,loyaltyApplied,loyaltyCfg,loyaltyDb,loyaltyRewardLive,membershipAdj,PACKAGE_PAYMENT,paymentMethod,productsApi,receipts,setBusyKey,setCashierAppt,setCashierClient,setCashierDiscount,setCashierDiscountMode,setCashierItems,setCashierNote,setCashierSearch,setCashierTip,setConsentAskFor,setGrowAdj,setLoyaltyAfterFor,setLoyaltyApplied,setLoyaltyDb,setMembershipAdj,setRebookDone,setRebookPick,setRebookPickOpen,setRebookWeeks,setReceipts,setShowCashier,setShowReceipt,setSplitOn,settings,setVoucherAdj,splitOn,splitResolved,taxStatusUnconfirmed,toast,today,voucherAdj,voucherDue,voucherUsed,late:{get writePackageEntry(){return writePackageEntry;}}});

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
  const {confirmRebook,editRebook,insertRebookAppointment,markRebookMessageOpened,openRebookForm,rebookMinute,rebookPlan,rebookSlots,refreshWaQueue} = useRebookSection({activeServices,appointments,apptBufferOf,clients,formatDate,formatDateHe,guardWrite,handleDbError,isBusy,newApptBufferFor,rebookPick,rebookWeeks,setAppointments,setApptNote,setBusyKey,setEditingAppointmentId,setNewAppt,setRebookDone,setRebookNext,setRebookPick,setRebookPickOpen,setSelectedClient,setShowModal,setShowReceipt,settings,setWhatsappPending,showReceipt,toast,today});

  // Add a business expense (tenant_id is filled by the DB column default).
  const {handleAddExpense,handleDeleteExpense} = useExpensesSection({askConfirm,guardWrite,handleDbError,isBusy,newExpense,setBusyKey,setExpenses,setNewExpense,toast});

  // ─── Beauty Voice: listen (Web Speech API) → understand (/api/voice-intent) ───
  const {closeVoice,handleVoiceBook,handleVoiceCancel,handleVoiceReceipt,printReceipt,receiptShareText,sendReceiptToClient,sendReminderToClient,startVoice} = useVoiceSection({activeServices,afterPaymentRecorded,appointments,apptBufferOf,clients,dayWordFor,fetchConfirmLinks,fmtDateHe,guardWrite,handleDbError,herAccent,isBusy,liveRcpts,newApptBufferFor,receiptVoids,recognitionRef,setAppointments,setBusyKey,setClients,setConsentAskFor,setReceipts,setShowReceipt,setShowVoice,settings,setVoiceBooking,setVoiceCall,setVoiceCancel,setVoiceErr,setVoiceInfo,setVoiceIntent,setVoiceReceipt,setVoiceStatus,setVoiceTranscript,setWhatsappPending,softCancelAppointment,thisMonth,thisYear,toast,today,voiceBooking,voiceCancel,voiceReceipt,waMsg});

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
  const {downloadScanQr,handleSaveOffering,handleSavePackage,handleSaveProtocol,handleSaveWaitlist,handleUndoPackageSession,handleUsePackageSession,loadScanLink,toggleOffering,toggleReviewHidden,waCentralConnected,writePackageEntry} = usePackagesSection({activeTab,afterPaymentRecorded,askConfirm,emptyProtocol,formatDate,guardWrite,handleDbError,isBusy,newOffering,newPackage,newProtocol,newWaitlist,offerings,runOnce,scanLink,scanQr,setBusyKey,setClientReviews,setClientReviewsError,setNewOffering,setNewProtocol,setOfferings,setOfferingsError,setPackages,setProtocols,setReceipts,setScanLink,setScanLinkError,setScanQr,setScanQuota,setShowOfferingForm,setShowPackageModal,setShowProtocolModal,setShowWaitlistModal,settings,setWaitlist,showSettings,toast});

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
  const {compressImage,loadClientPhotos,loadClientScans,scanClientSkin,uploadClientPhoto} = useClientPhotosSection({handleDbError,scanLoading,setClientPhotos,setClientScans,setPhotoTreatmentPrefill,setPhotoUploading,setScanLoading,setScanReport,setScansLoading,setScanStep,settings,toast});

  // Is a Facebook page connected for THIS tenant? Mirrors the campaigns route's
  // check (facebook_pages, is_active). RLS scopes the query to the tenant, so we
  // never see another business's page.
  const {copyPublicLink,generateReel,loadFbCampaigns,loadFbConnection,shareBookingWhatsApp,toggleFbPage} = useMarketingSection({activeServices,activeTab,fbDatePreset,fbPageBusy,loadScanLink,mySlug,openSetupTab,persistTourPatch,reelData,reelDuration,reelLoading,reelTopic,reelVibe,scanLink,scanLinkError,setFbCampaigns,setFbError,setFbEventFails,setFbLoading,setFbPage,setFbPageBusy,setFbPages,setFbTotals,setLinkShared,setReelData,setReelError,setReelLoading,setReelTopic,settings,settingsGroup,showSettings,toast});

  // Load the community feed posts for this tenant (newest first)
  const {deleteCommunityPost,loadAdvisor,loadCommunityPosts,loadProtocols,loadWaMessages,saveCommunityPost,sendAdvisor,uploadPostImage} = useAdvisorCommunitySection({advisorInput,advisorSending,askConfirm,compressImage,guardWrite,handleDbError,newPost,savingPost,setAdvisorInput,setAdvisorMessages,setAdvisorSending,setCommunityLoading,setCommunityPosts,setNewPost,setPostImageUploading,setProtocols,setProtocolsLoading,setSavingPost,setShowPostModal,settings,setWaLogError,setWaLogLoading,setWaMessages,toast});
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

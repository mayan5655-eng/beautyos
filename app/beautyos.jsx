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

import {dayWordFor} from "./shared/dayWord"; // @shared-module
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

import {AutoToggleRow,SignedImage,Toggle} from "./shared/smallParts"; // @shared-module

import {SEARCH_GROUPS,VOICE_COMMANDS,VoiceCommandList} from "./shared/voiceCommands"; // @shared-module

import {CLOSE_HOURS,DAYS_HE,HOURS_ALL,hourSelectStyle,SCAN_STEPS,WK_ROW_H} from "./shared/calendarConstants"; // @shared-module
import { HELP_TITLE, HELP_INTRO, helpSectionsFor, TUTORIAL_TITLES, tutorialHref } from "@/lib/helpSections";
// What is switched on for her (2026-11-09: nothing inactive is shown, help included): her settings plus the server-only switches.
import { helpGatesFor } from "@/lib/helpVisibility";
import { useDeployFlags } from "./useDeployFlags";

import {_PLAN_BASIC,_PLAN_PREMIUM,_PLAN_PRO,EXPENSE_CATEGORIES,fmtPhone,FORM_LIST_COLUMNS,FORM_TYPES,FORM_TYPES_ALL,helpInline,LEAD_SOURCES,LEAD_STATUS_COLORS,LEAD_STATUSES,leadStatusMeta,LEGACY_LEAD_STATUS_COLORS,LEGACY_LEAD_STATUSES,MONTHS_HE,PACKAGE_PAYMENT,PAYMENT_METHODS,PLAN_FEATURES,planAllows,SELECTABLE_PAYMENT_METHODS,SKIN_TYPES,SOURCE_ICONS,STATUS_COLORS,STATUS_LABELS,TAX_DISCLAIMER,TAX_STATUS_HE,taxStatusUnconfirmed,TOUR_STEPS,VAT_RATE,vatRateForYear} from "./shared/businessConstants"; // @shared-module

import {fetchConfirmLinks,fmtDateHe,formatDate,formatDateHe,getWeekDates,waLink,waMsg,weekSundayOf} from "./shared/datesAndLinks"; // @shared-module

import {PushSubscribeButton} from "./shared/pushSubscribe"; // @shared-module

import {waBirthday,waConfirmLink,waPayment,waReview} from "./shared/whatsappMessages"; // @shared-module

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
import BottomNavPart from "./screens/BottomNavPart";
import SidebarPart from "./screens/SidebarPart";
import AppHeaderPart from "./screens/AppHeaderPart";
import AppStylesPart from "./screens/AppStylesPart";
import { useApptSlotsSection } from "./sections/useApptSlotsSection";
import { useCashierTotalsSection } from "./sections/useCashierTotalsSection";
import { useFirstStepsSection } from "./sections/useFirstStepsSection";
import { useSettingsPanelSection } from "./sections/useSettingsPanelSection";
import { useThemeAndPlanSection } from "./sections/useThemeAndPlanSection";
import { useFeedbackSection } from "./sections/useFeedbackSection";
import { useScreenLinkSection } from "./sections/useScreenLinkSection";
import { useQuickActionsSection } from "./sections/useQuickActionsSection";
import { useCashierOpenSection } from "./sections/useCashierOpenSection";
import { usePasswordSection } from "./sections/usePasswordSection";
import { useSlugSection } from "./sections/useSlugSection";
import { useModalEffectsSection } from "./sections/useModalEffectsSection";
import { useAdvisorActionsSection } from "./sections/useAdvisorActionsSection";
import { useApptEffectsSection } from "./sections/useApptEffectsSection";
import { useSetupStepsSection } from "./sections/useSetupStepsSection";

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
  const {askConfirm,handleDbError,handleLogout,isBusy,isConnectionError,onKbdActivate,runOnce,setBusyKey,toast} = useFeedbackSection({authEmail,busy,router,setBusy,setCalView,setConfirmDialog,setLeadFilter,setShowLapsed,setShowWaQueue,setToasts});

  // === COMPUTED ===
  const {guardWrite,herAccent,lastMonth,lastMonthYear,now,pc,pc2,pcDeep,pcGrad,pcShadow,pcTint,planInfo,readOnly,thisMonth,thisYear,today,tomorrow,weekDates} = useThemeAndPlanSection({planRow,settings,toast,weekStart});

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
  const {closeSettings,openAddonsRef,openSettings,openSetupTab,panelDirty,pendingCardSaves,persistTourPatch,saveAutomationsKey,settingsDirty,setTourStep,tourStep,tourTriggeredRef} = useSettingsPanelSection({askConfirm,editServices,editSettings,services,setEditServices,setEditSettings,setSettings,setSettingsGroup,setSettingsTab,setShowNewService,setShowSettings,setShowSetup,setShowTemplatePicker,setTemplatePicks,settings,SETTINGS_TAB_GROUP,toast});

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
  const {coreSetupSteps,expandedHelpKey,expandedSetupKey,extraSetupSteps,nextSetupKey,setExpandedHelpKey,setExpandedSetupKey,setupDone,setupPct,setupTotal} = useSetupStepsSection({appointments,linkShared,openSetupTab,services,settings,late:{get copyPublicLink(){return copyPublicLink;}}});
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
  const {activeServices,apptBufferOf,apptClientMatches,attentionOnToday,fbShowing,fbSteps,fbView,newApptBufferFor,NO_CLIENTS_HINT,NO_SERVICES_HINT,origin,servicesByUse,setupHint,setupOnToday,tourSteps} = useFirstStepsSection({appointments,apptClientQuery,clients,fbCelebrate,firstLocal,historyReady,linkShared,pc,persistTourPatch,services,setFbCelebrate,setFirstLocal,settings,setTourStep,setupDone,setupTotal,showImportHub,showImportModal,tourTriggeredRef});
  // The package this visit could be drawn from: an active one, belonging to
  // this client, with sessions left, whose service is actually on the receipt.
  // Matching on the service is the point - a facial package does not pay for a
  // peel, and offering it would be worse than offering nothing.
  const {cashierDiscountIls,cashierLoyalty,cashierPackage,cashierTotal,growCreditUsed,growDepositUsed,loadLoyaltyRows,loyaltyAfterFor,loyaltyApplied,loyaltyCfg,loyaltyDb,loyaltyFor,loyaltyRewardLive,setLoyaltyAfterFor,setLoyaltyApplied,setLoyaltyDb,splitResolved,voucherDue,voucherUsed} = useCashierTotalsSection({cashierClient,cashierDiscount,cashierDiscountMode,cashierItems,drawFromPackage,growAdj,historyReady,membershipAdj,packages,receipts,receiptVoids,services,setMembershipAdj,settings,setVoucherAdj,showCashier,splitLines,toast,voucherAdj});

  // --- New-appointment modal timing (STAGE A: live end time, STAGE B: per-day hours) ---
  // Day-of-week of the picked date, parsed as LOCAL (not UTC) so it never shifts
  // across the date line. Falls back to today's day if the string is malformed.
  const {apptBuffersApply,apptBusy,apptDayHours,apptEffectiveStart,apptEndMin,apptGapWarning,apptKeepOwnTime,apptOutsideHours,apptRequestedStart,apptSelectedOutside,apptSelectedTaken,apptSlotOptions,apptStartMin,fmtHM,newApptBuffer,slotIsTaken} = useApptSlotsSection({appointments,apptBufferOf,apptStaff,editingAppointmentId,newAppt,newApptBufferFor,settings,team,teamCal});
  // When the picked day changes and the current hour falls outside that day's
  // range, snap to the first open hour so a stale start can't be saved.
  // Duration is a dependency for the same reason: lengthening the treatment
  // shortens the option list from the end, so a start that no longer fits
  // before closing has to move rather than sit there out of range.
  // Guarded on length, because a day too short to fit the treatment at all
  // offers no slots, and snapping to apptSlotOptions[0] there wrote NaN.
  const {apptTimeTouched,editOrigRef} = useApptEffectsSection({activeTab,appointments,apptBusy,apptDayHours,apptOutsideHours,apptRequestedStart,apptSlotOptions,editingAppointmentId,newAppt,setLeadKeyConfigured,setNewAppt,setScanQuota,setSkinQueue,setSkinQueueError,setSkinQueueLoading,showModal,late:{get loadAll(){return loadAll;}}});

  // Approve a Skin Follow-up suggestion: open her WhatsApp with the prepared
  // message so she sends it from her own phone. This is a marketing message,
  // and marketing goes out through wa.me like the comeback and gap-fill
  // windows (lib/whatsapp.js). It used to be a "test mode" button that added a
  // key to a Set and toasted "no real message was sent" - an approve step with
  // nothing behind it, on a card that promised a follow-up. Now the tap is the
  // send. Validates the client still exists and has a phone, and guards
  // against a second tap on the same card.
  const {advisorAction,approveSkinFollowup} = useAdvisorActionsSection({clients,openSettings,queueApproved,setActiveTab,setMarketingView,setQueueApproved,toast});

  // Facebook connect: load the current connection state on mount, and handle the
  // return from the OAuth callback. The callback redirects back here with
  // ?fb_success=true (page connected) or ?fb_error=... — show a toast, then strip
  // those params so a refresh doesn't re-fire the message.
  useModalEffectsSection({activeTab,advisorMessages,advisorSending,closeSettings,confirmDialog,selectedClient,setActiveTab,setAdvisorWaitSec,setClientPhotos,setClientScans,setConfirmDialog,setEditingClient,setEditingLead,setEditSettings,setPhotoTreatmentPrefill,setSelectedClient,setSelectedLead,setSettingsGroup,setShowCashier,setShowClientModal,setShowImportModal,setShowLeadModal,setShowMobileSidebar,setShowModal,setShowNewService,setShowPackageModal,setShowPostModal,setShowProtocolModal,setShowReceipt,setShowSettings,setShowWaitlistModal,settings,settingsGroup,showCashier,showClientModal,showImportModal,showLeadModal,showModal,showPackageModal,showPostModal,showProtocolModal,showReceipt,showSettings,showWaitlistModal,toast,late:{get loadAdvisor(){return loadAdvisor;},get loadClientPhotos(){return loadClientPhotos;},get loadClientScans(){return loadClientScans;},get loadCommunityPosts(){return loadCommunityPosts;},get loadFbConnection(){return loadFbConnection;},get loadPendingQuestion(){return loadPendingQuestion;},get loadProtocols(){return loadProtocols;}}});

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
  const {mySlug,saveSlug} = useSlugSection({guardWrite,handleDbError,planRow,setPlanRow,setSlugBusy,setSlugDraft,setSlugNote,settings,slugDraft,toast});

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
  const {handleChangePassword} = usePasswordSection({isBusy,pwConfirm,pwCurrent,pwNew,setBusyKey,setPwConfirm,setPwCurrent,setPwNew,toast});

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

  const {dupPayOk,handleOpenCashier,handleTourFinish,handleTourNext,handleTourSkip,openNewAppt} = useCashierOpenSection({activeServices,clients,closeSettings,favoritePaymentMethod,loadLoyaltyRows,loyaltyCfg,loyaltyDb,openSettings,persistTourPatch,setApptNote,setCashierAllServices,setCashierAppt,setCashierClient,setCashierDiscount,setCashierDiscountMode,setCashierExtrasOpen,setCashierItems,setCashierNote,setCashierSearch,setCashierTip,setDrawFromPackage,setEditingAppointmentId,setGrowAdj,setLoyaltyApplied,setMembershipAdj,setNewAppt,setPaymentMethod,setShowCashier,setShowMobileSidebar,setShowModal,setSplitLines,setSplitOn,settings,setTourStep,showSettings,tourStep,tourSteps});

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

  const {handleExportCSV,openEditClient,openEditLead,waSendGroup,waSendOne} = useQuickActionsSection({askConfirm,clients,deferred,historyReady,receipts,receiptVoids,setEditingClient,setEditingLead,setNewClient,setNewLead,setShowClientModal,setShowLeadModal,setWaSentToday,toast,today});

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
  const {WA_TYPE_LABELS,waDeliveryLabel} = useScreenLinkSection({activeTab,aiPostsView,closeSettings,loading,loadWaMessages,marketingView,openSettings,panelDirty,setActiveTab,setAiPostsView,setMarketingView,setSettingsGroup,settings,settingsGroup,setWaView,showSettings,waLogLoading,waMessages,waView});

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
 <AppStylesPart ctx={{pc}}/>

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
 <AppHeaderPart ctx={{authEmail,globalResults,globalSearch,handleExportCSV,handleLogout,isBusy,newLeadsCount,openSettings,pc,pcGrad,renderSearchGroups,setActiveTab,setGlobalSearch,setShowMobileSidebar,setShowSetup,settings,tillOnly,tomorrowCancelled,upcomingBirthdays}}/>

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
 <SidebarPart ctx={{clients,coldClients,entrySubtitle,getApptColor,getDaysSince,handleOpenCashier,handleSendAllConfirmations,handleSendConfirmation,leadsWithReminders,openNewAppt,pc,pcGrad,pcTint,setActiveTab,setClientTab,setSelectedClient,setSelectedLead,setShowLapsed,setShowMobileSidebar,todayAppts,todayEntries,tomorrowAppts,tomorrowCancelled,tomorrowConfirmed,tomorrowEntries,tomorrowPending}}/>
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
 <BottomNavPart ctx={{activeTab,BOTTOM_NAV,navIcon,newLeadsCount,pcGrad,PEOPLE_TABS,setActiveTab,setShowMoreSheet,showMoreSheet}}/>

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

import {ListMore} from "./shared/listMore"; // @shared-module

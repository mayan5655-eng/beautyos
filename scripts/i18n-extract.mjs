// scripts/i18n-extract.mjs
//
// Collects every Hebrew string a surface may look up with tr() (lib/i18n/tr.ts), so the Arabic and English tables can
// be checked for completeness (test-i18n.ts) and the missing ones translated.
//
//   node scripts/i18n-extract.mjs public            -> lib/i18n/strings/public.keys.json
//   node scripts/i18n-extract.mjs owner             -> lib/i18n/strings/owner.keys.json
//   node scripts/i18n-extract.mjs public --missing  -> prints the keys the ar/en tables still lack, as JSON
//
// A key is: the first argument of tr("...") when it is a plain string, and, in the files listed under `lookups`, every
// Hebrew string literal (labels in constant lists that a screen shows through tr(x) / trv(x)).
import fs from 'node:fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const HEB = /[֐-׿]/;

// The owner's app: the main screen and every component it shows (wrapped by scripts/i18n-wrap.mjs --mode=global).
const OWNER_FILES = [
      'app/beautyos.jsx',
      'app/LeadImportModal.jsx',
      'app/ImportFromSystem.jsx',
      'app/GiftVouchersPanel.jsx',
      'app/GrowCard.jsx',
      'app/BillingCard.jsx',
      'app/LapsedClientsModal.jsx',
      'app/UpgradesStore.jsx',
      'app/ProductsPanel.jsx',
      'app/SourceReport.jsx',
      'app/ResultsManager.jsx',
      'app/GreetingsPanel.jsx',
      'app/RebookNextSheet.jsx',
      'app/GiftVoucherSettings.jsx',
      'app/ClientPageSheet.jsx',
      'app/dashboard/monthly/MonthlyScreen.tsx',
      'app/GrowPaymentRequests.jsx',
      'app/GrowRegistration.jsx',
      'app/CancelPolicyCard.jsx',
      'app/ClientPrivacyPanel.jsx',
      'app/MarketingToday.jsx',
      'app/LoyaltySettings.jsx',
      'app/VisitFeedbackPanel.jsx',
      'app/MonthlyReportCard.jsx',
      'app/VoucherRedeemTill.jsx',
      'app/FormAnswersSheet.jsx',
      'app/FirstBookingCard.jsx',
      'app/dashboard/digest/DigestScreen.tsx',
      'app/GiftVoucherMarketingCard.jsx',
      'app/HelpChat.jsx',
      'app/ServiceTemplatePicker.tsx',
      'app/GrowChargePanel.jsx',
      'app/FeedbackBanner.jsx',
      'app/BusinessReferralCard.jsx',
      'app/RebookSetting.jsx',
      'app/PaymentsSettings.jsx',
      'app/MyDayCard.jsx',
      'app/CalendarFeedCard.jsx',
      'app/LoyaltyClientCard.jsx',
      'app/FeeQuestions.jsx',
      'app/BookingButtonsCard.jsx',
      'app/GoalsEditor.jsx',
      'app/BookingSourceReport.jsx',
      'app/LeadSourcesEditor.jsx',
      'app/ServiceIntakeToggle.jsx',
      'app/GoalsCard.jsx',
      'app/WaitlistActivity.jsx',
      'app/ProductSettings.jsx',
      'app/DepositLinkSheet.jsx',
      'app/WaitlistOfferSetting.jsx',
      'app/MiniToast.tsx',
      'app/InstallBannerCard.tsx',
      'app/ImportChooser.tsx',
      'app/FieldPicker.tsx',
      'app/ClientReferral.jsx',
      'app/WaAutoMessagesSetting.jsx',
      'app/GrowCashierCredit.jsx',
      'app/GiftVoucherLink.tsx',
      'app/EmptyState.jsx',
      'app/AutomationSuggestCard.jsx',
      'app/dashboard/feedback/FeedbackScreen.tsx',
      'app/ServiceDepositToggle.jsx',
      'app/ProductsTill.jsx',
      'app/PlanBlockedScreen.jsx',
      'app/BillingNotices.jsx',
      'app/TrialBanner.jsx',
      'app/OnboardingTour.jsx',
      'app/MonthValueCard.jsx',
      'app/HoldBadge.jsx',
      'app/GrowCostNote.jsx',
      'app/ApptDepositToggle.jsx',
      'app/TrialNudge.jsx',
      'app/Sheet.tsx',
      // lib modules that only build words for her screens (wrapped with --mode=lib)
      'app/GoogleKitCard.jsx',
      'app/AcademyNavEntry.jsx',
      'lib/myDay.js',
      'lib/closingList.js',
    ];

export const SURFACES = {
  public: {
    files: [
      'app/PublicLandingPage.tsx', 'app/BookingPage.jsx', 'app/confirm/page.jsx', 'app/confirm/RescheduleFlow.jsx',
      'app/review/page.jsx', 'app/pay/[token]/PayClient.jsx', 'app/v/[token]/VoucherView.tsx', 'app/WaitlistJoin.jsx',
      'app/[slug]/gift/GiftPurchase.tsx', 'app/[slug]/gift/page.tsx', 'app/c/[token]/ClientPageView.tsx', 'app/PublicChrome.tsx',
      'app/BookingClosed.tsx', 'app/PublicFooterLinks.tsx', 'app/[slug]/page.tsx', 'app/book/page.jsx',
      'app/api/confirm/route.ts', 'app/api/confirm/reschedule/route.ts',
    ],
    // Hebrew literals here are shown through tr(value): constant lists, defaults, refusal texts.
    lookups: [
      'app/PublicLandingPage.tsx', 'app/BookingPage.jsx', 'app/confirm/RescheduleFlow.jsx', 'app/pay/[token]/PayClient.jsx',
      'lib/branding.js', 'lib/planCopy.ts', 'lib/publicLanding.ts', 'lib/bookingPolicy.ts', 'app/WaitlistJoin.jsx',
    ],
  },
  owner: {
    files: OWNER_FILES,
    // ...and the lib modules whose label maps a screen shows as {trv(MAP[k])}.
    lookups: [...OWNER_FILES, 'lib/featureFlags.ts', 'lib/giftVoucherDesign.ts', 'lib/giftVouchers.ts', 'lib/goals.ts',
      'lib/grow/refundFollowups.ts', 'lib/helpSections.ts', 'lib/leads/buildRows.ts', 'lib/leads/statuses.ts', 'lib/products.ts',
      'lib/viewMode.ts', 'lib/publicLanding.ts'],
    // In the owner's app a lookup is a label from a constant list (shown through trv/tr(x)): short. Longer literals
    // there are WhatsApp texts to clients, which stay Hebrew for now.
    lookupMaxLen: 40,
  },
};

function keysOf(file, { lookup, maxLen = Infinity }) {
  if (!fs.existsSync(file)) return [];
  // raw: the real source, not the Hebrew view the test runner gives tests (scripts/test-source-view.mjs).
  const src = fs.readFileSync(file, { encoding: 'utf8', raw: true }).replace(/\r\n/g, '\n');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const out = new Set();
  traverse(ast, {
    CallExpression(path) {
      const c = path.node.callee;
      const name = c.type === 'Identifier' ? c.name : c.type === 'CallExpression' && c.callee.type === 'Identifier' ? c.callee.name : '';
      // tr("..."), and trFor(lang)("...")
      if (!['tr', 'T', 'trFor'].includes(name)) return;
      const a = path.node.arguments[0];
      if (a && a.type === 'StringLiteral' && HEB.test(a.value)) out.add(a.value);
    },
    StringLiteral(path) {
      if (!lookup || !HEB.test(path.node.value) || path.node.value.length > maxLen) return;
      out.add(path.node.value);
    },
    TemplateLiteral(path) {
      if (!lookup) return;
      const n = path.node;
      if (n.expressions.length === 0 && HEB.test(n.quasis[0].value.cooked || '') && n.quasis[0].value.cooked.length <= maxLen) out.add(n.quasis[0].value.cooked);
    },
  });
  return [...out];
}

export function collect(surface) {
  const cfg = SURFACES[surface];
  const all = new Set();
  for (const f of cfg.files) for (const k of keysOf(f, { lookup: false })) all.add(k);
  for (const f of cfg.lookups) for (const k of keysOf(f, { lookup: true, maxLen: cfg.lookupMaxLen })) all.add(k);
  return [...all].sort();
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('i18n-extract.mjs')) {
  const surface = process.argv[2];
  if (!SURFACES[surface]) { console.error('usage: node scripts/i18n-extract.mjs public|owner [--missing]'); process.exit(2); }
  const keys = collect(surface);
  if (process.argv.includes('--missing')) {
    const tables = ['ar', 'en'].map((l) => {
      const p = `lib/i18n/strings/${surface}.${l}.json`;
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    });
    const missing = keys.filter((k) => !tables[0][k] || !tables[1][k]);
    process.stdout.write(JSON.stringify(missing, null, 1));
  } else {
    fs.writeFileSync(`lib/i18n/strings/${surface}.keys.json`, JSON.stringify(keys, null, 1) + '\n');
    console.log(`${surface}: ${keys.length} keys`);
  }
}

"use client";
// app/screens/lazy.jsx — the screens of the owner's app that are loaded on demand.
//
// The first thing she sees is "היום". Everything else here (Settings, every sheet and modal, the other tabs) used to be in
// the same download as that first screen: about 507 KB of source she had to wait for before she could see today's
// appointments, most of which she would not open in that visit. Each is now its own chunk.
//
// Two things keep that from costing her a wait later:
//   - <PreloadScreens/> fetches all of them in the background as soon as the app is on screen and the browser is idle, so
//     by the time she taps a tab its code is already there. On a connection that asked to save data it does not: there a
//     screen is fetched when she opens it.
//   - a tab that is opened before its code arrived shows the app's spinner in its place; a sheet simply opens a moment
//     later. Nothing about a screen changes once it is there: same component, same ctx.
//
// Measured on a production build, phone width, 2026-11-27: the JavaScript fetched before "היום" is on screen went from
// 629 KB to 466 KB gzipped (2,241 KB to 1,570 KB raw). With the background fetch the total is 41 KB gzipped more than before
// (each chunk carries a little of its own), none of it in front of the first screen.
//
// What stays in the first download, imported directly by app/beautyos.jsx: the frame (styles, header, sidebar, bottom bar),
// "היום", and the two screens the app's own effects reach into through a ref as soon as they open (the calendar's scroll
// position, the help sheet's text box). scripts/check-screens.mjs holds this file and beautyos.jsx together: a screen is
// imported one way or the other, never both, and every lazy screen is in the preload list.
import { useEffect } from "react";
import dynamic from "next/dynamic";
import Spinner from "../Spinner";
import { tr } from "@/lib/i18n/tr";

function TabLoading() {
  return <div style={{display:"flex",justifyContent:"center",padding:"72px 0"}}><Spinner label={tr("טוענת")} /></div>;
}
// (next/dynamic takes its options as an object literal at each call: the compiler reads them, so they cannot be shared.)
const nothing = () => null;

// ── The other tabs ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const AdvisorScreen = dynamic(() => import("./AdvisorScreen"), { ssr: false, loading: TabLoading });
export const CampaignsScreen = dynamic(() => import("./CampaignsScreen"), { ssr: false, loading: TabLoading });
export const CashierScreen = dynamic(() => import("./CashierScreen"), { ssr: false, loading: TabLoading });
export const ClientsScreen = dynamic(() => import("./ClientsScreen"), { ssr: false, loading: TabLoading });
export const CommunityScreen = dynamic(() => import("./CommunityScreen"), { ssr: false, loading: TabLoading });
export const HelpScreen = dynamic(() => import("./HelpScreen"), { ssr: false, loading: TabLoading });
export const InsightsScreen = dynamic(() => import("./InsightsScreen"), { ssr: false, loading: TabLoading });
export const LeadsScreen = dynamic(() => import("./LeadsScreen"), { ssr: false, loading: TabLoading });
export const PackagesScreen = dynamic(() => import("./PackagesScreen"), { ssr: false, loading: TabLoading });
export const ProtocolsScreen = dynamic(() => import("./ProtocolsScreen"), { ssr: false, loading: TabLoading });
export const TaxScreen = dynamic(() => import("./TaxScreen"), { ssr: false, loading: TabLoading });
export const WhatsappScreen = dynamic(() => import("./WhatsappScreen"), { ssr: false, loading: TabLoading });

// ── Settings, and what opens over the app ───────────────────────────────────────────────────────────────────────────────
export const ApptModal = dynamic(() => import("./ApptModal"), { ssr: false, loading: nothing });
export const BulkStatusModal = dynamic(() => import("./BulkStatusModal"), { ssr: false, loading: nothing });
export const CashierModal = dynamic(() => import("./CashierModal"), { ssr: false, loading: nothing });
export const ClientCardModal = dynamic(() => import("./ClientCardModal"), { ssr: false, loading: nothing });
export const ComposeSendModal = dynamic(() => import("./ComposeSendModal"), { ssr: false, loading: nothing });
export const ImportModal = dynamic(() => import("./ImportModal"), { ssr: false, loading: nothing });
export const LeadCardModal = dynamic(() => import("./LeadCardModal"), { ssr: false, loading: nothing });
export const MoreSheetModal = dynamic(() => import("./MoreSheetModal"), { ssr: false, loading: nothing });
export const PackageModal = dynamic(() => import("./PackageModal"), { ssr: false, loading: nothing });
export const PersonalEventModal = dynamic(() => import("./PersonalEventModal"), { ssr: false, loading: nothing });
export const ReceiptModal = dynamic(() => import("./ReceiptModal"), { ssr: false, loading: nothing });
export const ScanReportModal = dynamic(() => import("./ScanReportModal"), { ssr: false, loading: nothing });
export const SettingsScreen = dynamic(() => import("./SettingsScreen"), { ssr: false, loading: nothing });
export const VoiceModal = dynamic(() => import("./VoiceModal"), { ssr: false, loading: nothing });
export const WaQueueModal = dynamic(() => import("./WaQueueModal"), { ssr: false, loading: nothing });

const LOADERS = [
  () => import("./AdvisorScreen"),
  () => import("./ApptModal"),
  () => import("./BulkStatusModal"),
  () => import("./CampaignsScreen"),
  () => import("./CashierModal"),
  () => import("./CashierScreen"),
  () => import("./ClientCardModal"),
  () => import("./ClientsScreen"),
  () => import("./CommunityScreen"),
  () => import("./ComposeSendModal"),
  () => import("./HelpScreen"),
  () => import("./ImportModal"),
  () => import("./InsightsScreen"),
  () => import("./LeadCardModal"),
  () => import("./LeadsScreen"),
  () => import("./MoreSheetModal"),
  () => import("./PackageModal"),
  () => import("./PackagesScreen"),
  () => import("./PersonalEventModal"),
  () => import("./ProtocolsScreen"),
  () => import("./ReceiptModal"),
  () => import("./ScanReportModal"),
  () => import("./SettingsScreen"),
  () => import("./TaxScreen"),
  () => import("./VoiceModal"),
  () => import("./WaQueueModal"),
  () => import("./WhatsappScreen"),
];

// A link straight to another tab (?tab=clients): that tab's code starts downloading now, alongside her data, instead of after
// the data has arrived and the tab is first drawn.
const BY_TAB = {
  insights: () => import("./InsightsScreen"), clients: () => import("./ClientsScreen"), leads: () => import("./LeadsScreen"),
  cashier: () => import("./CashierScreen"), tax: () => import("./TaxScreen"), whatsapp: () => import("./WhatsappScreen"),
  campaigns: () => import("./CampaignsScreen"), community: () => import("./CommunityScreen"), packages: () => import("./PackagesScreen"),
  protocols: () => import("./ProtocolsScreen"), advisor: () => import("./AdvisorScreen"), help: () => import("./HelpScreen"),
  settings: () => import("./SettingsScreen"),
};
if (typeof window !== "undefined") {
  try { const first = BY_TAB[new URLSearchParams(window.location.search).get("tab") || ""]; if (first) first().catch(() => {}); } catch { /* no address to read */ }
}

/** Fetch every lazy screen once the app is idle. A failed fetch is not an error here: the screen fetches itself when opened. */
export function preloadScreens() {
  for (const load of LOADERS) load().catch(() => {});
}

/** Renders nothing. Mounted by the app once it is on screen. */
export function PreloadScreens() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (navigator.connection && navigator.connection.saveData) return undefined;
    if (window.requestIdleCallback) { const id = window.requestIdleCallback(preloadScreens, { timeout: 4000 }); return () => window.cancelIdleCallback(id); }
    const id = setTimeout(preloadScreens, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}

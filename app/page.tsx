// app/page.tsx
//
// The root route branches on the session, server-side, before anything
// paints: logged in -> the real dashboard (BeautyOS, unchanged); logged
// out -> the public landing page. This used to be a single client
// component (BeautyOS) that discovered mid-render it had no session and
// client-navigated to /login - a loading spinner, then a redirect, and
// nothing for an ad click to actually read. A Server Component checking
// the session before the first paint is both faster and the only way to
// serve a logged-out visitor real, crawlable HTML here at all.
//
// BeautyOS keeps its own client-side session check too (app/beautyos.jsx,
// deep in loadAll) - that one is NOT redundant, it's what catches a
// session that expires mid-use after this server check already passed.

import { createClient } from "@/lib/supabase/server";
import LandingPage from "./LandingPage";
import BeautyOSLoader from "./BeautyOSLoader";

// Only meaningfully seen by a crawler or a social-share unfurl, both of
// which hit this route with no session - so this describes the landing
// page, not the dashboard a real signed-in visit never exposes metadata
// for anyway (client components don't export it).
export const metadata = {
  title: "קלמיה — עסק פורח, חיים עם יותר שקט",
  description:
    "יומן, לקוחות, תשלומים ותוכן שיווקי במקום אחד — במקום הקמפיינרית, המזכירה ומנהלת הסושיאל. חודש ראשון חינם.",
  openGraph: {
    title: "קלמיה — עסק פורח, חיים עם יותר שקט",
    description: "יומן, לקוחות, תשלומים ותוכן שיווקי במקום אחד. חודש ראשון חינם.",
    images: [{ url: "/og-1200x630.jpg", width: 1200, height: 630, alt: "קלמיה" }],
  },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return <BeautyOSLoader />;
  return <LandingPage />;
}

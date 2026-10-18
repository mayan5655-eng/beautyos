// app/api/version/route.ts
//
// GET -> { build }: which deployment is live. app/UpdateBanner.tsx compares it with the build its own code came from,
// so a phone that kept the app open in the background (an installed app resumes from memory, it does not reload) is
// told a newer version exists. Found 2026-10-18: a fix was live for an hour while her phone kept running the morning's
// code. Nothing secret: a commit id, the same one in every page's script URLs.
import { BUILD_ID } from '@/lib/buildId';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ build: BUILD_ID }, { headers: { 'Cache-Control': 'no-store' } });
}

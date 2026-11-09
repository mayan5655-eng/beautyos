// app/api/wa-auto/status/route.ts
//
// Tells her settings screen whether the automatic WhatsApp reminders can be offered at all. { available: false } -
// and nothing about the feature renders (lib/waCloud/autoVisible.js) - unless WA_AUTO_ENABLED=true, live mode and every
// Meta credential are set. No database, no Meta call, and nothing here is secret: only a yes or no and two numbers.

import { publicAutoStatus } from '@/lib/waCloud/autoConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(publicAutoStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

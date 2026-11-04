// app/api/help-chat/route.ts
//
// POST { message, history?, tab? } -> { answer, videos, capNotice? }
// The "שאלי את העוזרת" chat in the "תקועה?" sheet. All the logic, and why, is in lib/ai/helpChat.ts; this file only
// wires the real session client, the Anthropic client and the metered call.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { trackedCreate } from '@/lib/ai/usage';
import { handleHelpChat } from '@/lib/ai/helpChat';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Haiku 5.5 thinks before it answers: a few seconds usually, more under load. The platform default (10-15 s) would
// kill a slow answer mid-thought, so the ceiling is explicit.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleHelpChat(request, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: createClient as any,
    anthropic,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    track: trackedCreate as any,
  });
}
